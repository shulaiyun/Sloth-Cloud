<?php

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\ConfigOption;
use App\Models\Currency;
use App\Models\Plan;
use App\Models\Price;
use App\Models\Product;
use App\Models\Property;
use App\Models\ProvisioningMapping;
use App\Models\Service;
use App\Models\Server;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BootstrapRegionalVpsCatalog extends Command
{
    protected $signature = 'app:catalog:bootstrap-vps-regional
        {--currency= : Currency code for VPS prices}
        {--us-node=1 : Convoy node ID for United States products}
        {--hk-node=2 : Convoy node ID for Hong Kong products}
        {--jp-node=3 : Convoy node ID for Japan products}
        {--sg-node=4 : Convoy node ID for Singapore products}
        {--de-node=5 : Convoy node ID for Germany products}
        {--gb-node=6 : Convoy node ID for United Kingdom products}
        {--nl-node=7 : Convoy node ID for Netherlands products}
        {--template= : Default Convoy template UUID or slug}
        {--annual-multiplier=12 : Multiply monthly price by this factor to derive yearly price}
        {--dry-run : Preview changes without writing data}';

    protected $description = 'Create or update regional VPS products (US/HK/JP/SG/DE/GB/NL) with Convoy mappings and priced network upgrades';

    public function handle(): int
    {
        $currencyCode = strtoupper((string) ($this->option('currency') ?: Currency::defaultCode() ?: 'USD'));
        $templateRef = $this->resolveTemplateRef($this->normalizeOption($this->option('template')));
        $annualMultiplier = $this->resolveAnnualMultiplier($this->option('annual-multiplier'));
        $dryRun = (bool) $this->option('dry-run');
        $priceCurrencies = $this->resolvePriceCurrencies($currencyCode);
        $regionNodes = [
            'us' => trim((string) $this->option('us-node')),
            'hk' => trim((string) $this->option('hk-node')),
            'jp' => trim((string) $this->option('jp-node')),
            'sg' => trim((string) $this->option('sg-node')),
            'de' => trim((string) $this->option('de-node')),
            'gb' => trim((string) $this->option('gb-node')),
            'nl' => trim((string) $this->option('nl-node')),
        ];

        if ($templateRef === null) {
            $this->error('No valid Convoy template UUID was resolved. Pass --template=<uuid> or set CONVOY_DEFAULT_TEMPLATE_UUID.');

            return self::FAILURE;
        }

        if (collect($regionNodes)->contains(fn ($node) => $node === '')) {
            $this->error('One or more region node IDs are empty. Pass explicit --*-node values before bootstrapping.');

            return self::FAILURE;
        }

        $definitions = $this->definitions($templateRef, $regionNodes, $annualMultiplier);

        if ($dryRun) {
            $this->line(sprintf(
                '[dry-run] VPS regional catalog will use currency=%s template=%s nodes=%s',
                $currencyCode,
                $templateRef,
                json_encode($regionNodes, JSON_UNESCAPED_SLASHES)
            ));

            foreach ($definitions as $row) {
                $this->line(sprintf(
                    '[dry-run] product=%s region=%s node=%s monthly=%s yearly=%s cpu=%d ram=%dMi disk=%dMi bandwidth=%dMi ipv4=%d',
                    (string) $row['slug'],
                    (string) $row['region'],
                    (string) (($row['settings'] ?? [])['node'] ?? ''),
                    (string) (($row['pricing'] ?? [])['monthly'] ?? ''),
                    (string) (($row['pricing'] ?? [])['yearly'] ?? ''),
                    (int) (($row['settings'] ?? [])['cpu'] ?? 0),
                    (int) (($row['settings'] ?? [])['ram'] ?? 0),
                    (int) (($row['settings'] ?? [])['disk'] ?? 0),
                    (int) (($row['settings'] ?? [])['bandwidth'] ?? 0),
                    (int) (($row['settings'] ?? [])['ipv4'] ?? 0),
                ));
            }

            return self::SUCCESS;
        }

        DB::transaction(function () use ($definitions, $priceCurrencies): void {
            $server = $this->ensureConvoyServer();
            $categories = $this->ensureCategories($this->regions());

            $priority = 10;
            foreach ($definitions as $definition) {
                $category = $categories[(string) $definition['region']];
                $product = $this->ensureProduct($category, $server, $definition, $priority);
                $plans = $this->ensureRecurringPlans($product);

                $this->ensureProductSettings($product, (array) $definition['settings']);
                $this->ensureConfigurableUpsells($product, $plans, (array) ($definition['upgrades'] ?? []), $priceCurrencies);

                foreach ($plans as $planKey => $plan) {
                    $price = (string) (($definition['pricing'] ?? [])[$planKey] ?? '');
                    foreach ($priceCurrencies as $priceCurrency) {
                        $this->ensurePlanPrice($plan, $priceCurrency, $price);
                    }

                    $this->ensureProvisioningMapping(
                        $product,
                        $plan,
                        (array) $definition['settings'],
                        $priority + ($planKey === 'yearly' ? 1 : 0)
                    );
                }

                $priority += 10;
            }
        });

        $this->info('Regional VPS catalog bootstrap completed.');

        return self::SUCCESS;
    }

    protected function resolveTemplateRef(?string $optionTemplate): ?string
    {
        if (is_string($optionTemplate) && trim($optionTemplate) !== '') {
            return trim($optionTemplate);
        }

        foreach ([env('CONVOY_DEFAULT_TEMPLATE_UUID'), env('PROVISIONING_DEFAULT_TEMPLATE_UUID')] as $candidate) {
            if (!is_scalar($candidate)) {
                continue;
            }

            $normalized = trim((string) $candidate);
            if ($normalized !== '') {
                return $normalized;
            }
        }

        /** @var Property|null $templateProperty */
        $templateProperty = Property::query()
            ->where('model_type', Service::class)
            ->whereIn('key', ['template_uuid', 'convoy_template_uuid', 'os'])
            ->whereNotNull('value')
            ->where('value', '!=', '')
            ->latest('id')
            ->first();

        if ($templateProperty && trim((string) $templateProperty->value) !== '') {
            return trim((string) $templateProperty->value);
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    protected function resolvePriceCurrencies(string $preferredCurrency): array
    {
        $available = Currency::query()
            ->pluck('code')
            ->filter()
            ->map(fn ($code) => strtoupper((string) $code))
            ->unique()
            ->values();

        $candidateCodes = collect([$preferredCurrency, 'CNY', 'USD', 'HKD'])
            ->filter(fn ($code) => is_string($code) && trim($code) !== '')
            ->map(fn ($code) => strtoupper(trim((string) $code)))
            ->unique();

        $selected = $candidateCodes->first(fn ($code) => $available->contains($code));
        if (is_string($selected) && $selected !== '') {
            return [$selected];
        }

        $fallback = $available->first();

        return is_string($fallback) && $fallback !== '' ? [$fallback] : [];
    }

    protected function resolveAnnualMultiplier(mixed $value): int
    {
        $parsed = (int) $value;

        return $parsed > 0 ? $parsed : 12;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    protected function regions(): array
    {
        return [
            'us' => [
                'category_slug' => 'vps-us',
                'category_sort' => 10,
                'category_name_zh' => '\u7f8e\u56fd\u670d\u52a1\u5668',
                'category_name_en' => 'US Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u5317\u7f8e\u4e0e\u5168\u7403\u4e1a\u52a1\u7684\u4f18\u5316 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Optimized VPS plans for North America and global workloads.',
                'product_name_zh_prefix' => '\u7f8e\u56fd\u6d1b\u6749\u77f6 BGP',
                'product_name_en_prefix' => 'US Los Angeles BGP',
                'product_description_zh' => '\u7f8e\u56fd\u6d1b\u6749\u77f6 BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u5317\u7f8e\u53ca\u5168\u7403\u4e1a\u52a1\u51fa\u6d77\u573a\u666f\u3002',
                'product_description_en' => 'US Los Angeles BGP route optimized for North America and global workloads.',
                'price_group' => 'standard',
                'country_code' => 'US',
            ],
            'hk' => [
                'category_slug' => 'vps-hk',
                'category_sort' => 20,
                'category_name_zh' => '\u9999\u6e2f\u670d\u52a1\u5668',
                'category_name_en' => 'Hong Kong Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u4e9a\u592a\u4e0e\u8de8\u5883\u4f4e\u5ef6\u8fdf\u4e1a\u52a1\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Low-latency VPS plans for Asia-Pacific and cross-border workloads.',
                'product_name_zh_prefix' => '\u9999\u6e2f BGP',
                'product_name_en_prefix' => 'HK Hong Kong BGP',
                'product_description_zh' => '\u9999\u6e2f BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u4e9a\u592a\u4f4e\u5ef6\u8fdf\u4e0e\u8de8\u5883\u4e1a\u52a1\u90e8\u7f72\u3002',
                'product_description_en' => 'Hong Kong BGP route optimized for low-latency APAC and cross-border workloads.',
                'price_group' => 'premium',
                'country_code' => 'HK',
            ],
            'jp' => [
                'category_slug' => 'vps-jp',
                'category_sort' => 30,
                'category_name_zh' => '\u65e5\u672c\u670d\u52a1\u5668',
                'category_name_en' => 'Japan Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u4e1c\u4e9a\u8bbf\u95ee\u4f18\u5316\u4e0e\u65e5\u672c\u672c\u5730\u4e1a\u52a1\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Japan-focused VPS plans for East Asia latency-sensitive workloads.',
                'product_name_zh_prefix' => '\u65e5\u672c\u4e1c\u4eac BGP',
                'product_name_en_prefix' => 'JP Tokyo BGP',
                'product_description_zh' => '\u65e5\u672c\u4e1c\u4eac BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u65e5\u672c\u4e0e\u4e1c\u4e9a\u573a\u666f\u90e8\u7f72\u3002',
                'product_description_en' => 'Japan Tokyo BGP route optimized for Japan and East Asia workloads.',
                'price_group' => 'premium',
                'country_code' => 'JP',
            ],
            'sg' => [
                'category_slug' => 'vps-sg',
                'category_sort' => 40,
                'category_name_zh' => '\u65b0\u52a0\u5761\u670d\u52a1\u5668',
                'category_name_en' => 'Singapore Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u4e1c\u5357\u4e9a\u4e0e\u5168\u7403\u8f6c\u8fd0\u573a\u666f\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Singapore VPS plans for Southeast Asia and global transit workloads.',
                'product_name_zh_prefix' => '\u65b0\u52a0\u5761 BGP',
                'product_name_en_prefix' => 'SG Singapore BGP',
                'product_description_zh' => '\u65b0\u52a0\u5761 BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u4e1c\u5357\u4e9a\u8fde\u63a5\u4e0e\u8f6c\u8fd0\u573a\u666f\u3002',
                'product_description_en' => 'Singapore BGP route optimized for Southeast Asia connectivity and transit workloads.',
                'price_group' => 'premium',
                'country_code' => 'SG',
            ],
            'de' => [
                'category_slug' => 'vps-de',
                'category_sort' => 50,
                'category_name_zh' => '\u5fb7\u56fd\u670d\u52a1\u5668',
                'category_name_en' => 'Germany Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u6b27\u6d32\u4e2d\u90e8\u4e0e\u8de8\u5883\u5e94\u7528\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Germany VPS plans for Central Europe and cross-region applications.',
                'product_name_zh_prefix' => '\u5fb7\u56fd\u6cd5\u5170\u514b\u798f BGP',
                'product_name_en_prefix' => 'DE Frankfurt BGP',
                'product_description_zh' => '\u5fb7\u56fd\u6cd5\u5170\u514b\u798f BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u6b27\u6d32\u4e2d\u90e8\u4e0e\u6b27\u76df\u5e02\u573a\u573a\u666f\u3002',
                'product_description_en' => 'Germany Frankfurt BGP route optimized for Central Europe and EU workloads.',
                'price_group' => 'standard',
                'country_code' => 'DE',
            ],
            'gb' => [
                'category_slug' => 'vps-gb',
                'category_sort' => 60,
                'category_name_zh' => '\u82f1\u56fd\u670d\u52a1\u5668',
                'category_name_en' => 'United Kingdom Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u82f1\u56fd\u4e0e\u897f\u6b27\u4f4e\u5ef6\u8fdf\u4e1a\u52a1\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'United Kingdom VPS plans for UK and Western Europe workloads.',
                'product_name_zh_prefix' => '\u82f1\u56fd\u4f26\u6566 BGP',
                'product_name_en_prefix' => 'GB London BGP',
                'product_description_zh' => '\u82f1\u56fd\u4f26\u6566 BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u82f1\u56fd\u4e0e\u897f\u6b27\u4f4e\u5ef6\u8fdf\u573a\u666f\u3002',
                'product_description_en' => 'United Kingdom London BGP route optimized for UK and Western Europe workloads.',
                'price_group' => 'standard',
                'country_code' => 'GB',
            ],
            'nl' => [
                'category_slug' => 'vps-nl',
                'category_sort' => 70,
                'category_name_zh' => '\u8377\u5170\u670d\u52a1\u5668',
                'category_name_en' => 'Netherlands Cloud VPS',
                'category_description_zh' => '\u9762\u5411\u6b27\u6d32\u5168\u57df\u4e0e\u8f6c\u8fd0\u573a\u666f\u7684 VPS \u4ea7\u54c1\u7ebf\u3002',
                'category_description_en' => 'Netherlands VPS plans for European distribution and transit workloads.',
                'product_name_zh_prefix' => '\u8377\u5170\u963f\u59c6\u65af\u7279\u4e39 BGP',
                'product_name_en_prefix' => 'NL Amsterdam BGP',
                'product_description_zh' => '\u8377\u5170\u963f\u59c6\u65af\u7279\u4e39 BGP \u4f18\u5316\u7ebf\u8def\uff0c\u9002\u5408\u6b27\u6d32\u8f6c\u8fd0\u4e0e CDN \u8f85\u52a9\u573a\u666f\u3002',
                'product_description_en' => 'Netherlands Amsterdam BGP route optimized for European transit and CDN-adjacent workloads.',
                'price_group' => 'standard',
                'country_code' => 'NL',
            ],
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function profiles(int $annualMultiplier): array
    {
        return [
            [
                'suffix' => '1c1g',
                'title' => '1C1G',
                'cpu' => 1,
                'ram' => 1024,
                'disk' => 20480,
                'bandwidth' => 1048576,
                'snapshot' => 1,
                'backups' => 1,
                'ipv4' => 1,
                'monthly_prices' => [
                    'standard' => '39.00',
                    'premium' => '49.00',
                ],
                'upgrades' => [
                    'bandwidth' => [
                        'sort' => 100,
                        'name_zh' => '\u6708\u6d41\u91cf\u989d\u5ea6',
                        'name_en' => 'Monthly Traffic',
                        'description_zh' => '\u9009\u62e9\u771f\u5b9e\u6708\u6d41\u91cf\u989d\u5ea6\uff0c\u5bf9\u5e94 Convoy \u7684 bandwidth_limit \u9650\u5236\u3002',
                        'description_en' => 'Choose the real monthly traffic quota mapped to Convoy bandwidth_limit.',
                        'choices' => [
                            $this->choiceDefinition(1048576, '1 TB / month', '\u9ed8\u8ba4\u5957\u9910\uff0c\u9002\u5408\u8f7b\u91cf\u7ad9\u70b9\u4e0e\u63a7\u5236\u9762\u677f\u3002', 'Included quota for lightweight sites and control panels.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(2097152, '2 TB / month', '\u63d0\u5347\u5230 2 TB \u6708\u6d41\u91cf\u989d\u5ea6\u3002', 'Upgrade to 2 TB monthly traffic quota.', '12.00', $annualMultiplier),
                            $this->choiceDefinition(4194304, '4 TB / month', '\u9002\u5408\u66f4\u9ad8\u6d41\u91cf\u6216\u5206\u53d1\u9700\u6c42\u3002', 'Fits higher traffic and distribution-heavy workloads.', '24.00', $annualMultiplier),
                        ],
                    ],
                    'ipv4' => [
                        'sort' => 110,
                        'name_zh' => '\u9644\u52a0 IPv4 \u6570\u91cf',
                        'name_en' => 'IPv4 Quantity',
                        'description_zh' => '\u8d2d\u4e70\u771f\u5b9e IPv4 \u6570\u91cf\uff0c\u4f1a\u5199\u56de Convoy \u7684\u5730\u5740\u9650\u5236\u3002',
                        'description_en' => 'Buy the real IPv4 quantity written back to Convoy address limits.',
                        'choices' => [
                            $this->choiceDefinition(1, '1 IPv4', '\u9ed8\u8ba4\u5305\u542b 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Includes 1 IPv4 address by default.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(2, '2 IPv4', '\u989d\u5916\u65b0\u589e 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Adds one extra IPv4 address.', '18.00', $annualMultiplier),
                            $this->choiceDefinition(3, '3 IPv4', '\u9002\u5408\u591a\u5b9e\u4f8b\u6216\u591a\u5165\u53e3\u573a\u666f\u3002', 'Useful for multi-entry or multi-instance deployments.', '36.00', $annualMultiplier),
                        ],
                    ],
                ],
            ],
            [
                'suffix' => '2c2g',
                'title' => '2C2G',
                'cpu' => 2,
                'ram' => 2048,
                'disk' => 40960,
                'bandwidth' => 2097152,
                'snapshot' => 2,
                'backups' => 1,
                'ipv4' => 1,
                'monthly_prices' => [
                    'standard' => '69.00',
                    'premium' => '89.00',
                ],
                'upgrades' => [
                    'bandwidth' => [
                        'sort' => 100,
                        'name_zh' => '\u6708\u6d41\u91cf\u989d\u5ea6',
                        'name_en' => 'Monthly Traffic',
                        'description_zh' => '\u9009\u62e9\u771f\u5b9e\u6708\u6d41\u91cf\u989d\u5ea6\uff0c\u5bf9\u5e94 Convoy \u7684 bandwidth_limit \u9650\u5236\u3002',
                        'description_en' => 'Choose the real monthly traffic quota mapped to Convoy bandwidth_limit.',
                        'choices' => [
                            $this->choiceDefinition(2097152, '2 TB / month', '\u9ed8\u8ba4\u5957\u9910\uff0c\u9002\u5408\u4e2d\u5c0f\u578b\u5e94\u7528\u4e0e\u7f51\u7ad9\u96c6\u7fa4\u3002', 'Included quota for small and medium production workloads.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(4194304, '4 TB / month', '\u9002\u5408\u7a33\u5b9a\u51fa\u6d77\u4e0e\u7ad9\u70b9\u589e\u957f\u573a\u666f\u3002', 'Fits growing production traffic and global distribution.', '18.00', $annualMultiplier),
                            $this->choiceDefinition(8388608, '8 TB / month', '\u9002\u5408\u66f4\u9ad8\u7684\u6708\u5ea6\u6d41\u91cf\u9700\u6c42\u3002', 'Fits sustained high monthly transfer demand.', '36.00', $annualMultiplier),
                        ],
                    ],
                    'ipv4' => [
                        'sort' => 110,
                        'name_zh' => '\u9644\u52a0 IPv4 \u6570\u91cf',
                        'name_en' => 'IPv4 Quantity',
                        'description_zh' => '\u8d2d\u4e70\u771f\u5b9e IPv4 \u6570\u91cf\uff0c\u4f1a\u5199\u56de Convoy \u7684\u5730\u5740\u9650\u5236\u3002',
                        'description_en' => 'Buy the real IPv4 quantity written back to Convoy address limits.',
                        'choices' => [
                            $this->choiceDefinition(1, '1 IPv4', '\u9ed8\u8ba4\u5305\u542b 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Includes 1 IPv4 address by default.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(2, '2 IPv4', '\u989d\u5916\u65b0\u589e 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Adds one extra IPv4 address.', '18.00', $annualMultiplier),
                            $this->choiceDefinition(3, '3 IPv4', '\u9002\u5408\u9700\u8981\u591a\u5165\u53e3\u6216\u5206\u6d41\u7684\u573a\u666f\u3002', 'Useful for multi-entry or traffic-splitting workloads.', '36.00', $annualMultiplier),
                        ],
                    ],
                ],
            ],
            [
                'suffix' => '4c6g',
                'title' => '4C6G',
                'cpu' => 4,
                'ram' => 6144,
                'disk' => 81920,
                'bandwidth' => 4194304,
                'snapshot' => 2,
                'backups' => 2,
                'ipv4' => 1,
                'monthly_prices' => [
                    'standard' => '129.00',
                    'premium' => '169.00',
                ],
                'upgrades' => [
                    'bandwidth' => [
                        'sort' => 100,
                        'name_zh' => '\u6708\u6d41\u91cf\u989d\u5ea6',
                        'name_en' => 'Monthly Traffic',
                        'description_zh' => '\u9009\u62e9\u771f\u5b9e\u6708\u6d41\u91cf\u989d\u5ea6\uff0c\u5bf9\u5e94 Convoy \u7684 bandwidth_limit \u9650\u5236\u3002',
                        'description_en' => 'Choose the real monthly traffic quota mapped to Convoy bandwidth_limit.',
                        'choices' => [
                            $this->choiceDefinition(4194304, '4 TB / month', '\u9ed8\u8ba4\u5957\u9910\uff0c\u9002\u5408\u8d1f\u8f7d\u66f4\u9ad8\u7684\u7f51\u7ad9\u3001\u4ee3\u7406\u4e0e\u9762\u677f\u573a\u666f\u3002', 'Included quota for heavier production sites, proxy nodes and control panels.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(8388608, '8 TB / month', '\u9002\u5408\u4e2d\u9ad8\u6d41\u91cf\u51fa\u6d77\u4e0e\u4e1a\u52a1\u5206\u53d1\u3002', 'Fits mid-to-high traffic international workloads and distribution.', '28.00', $annualMultiplier),
                            $this->choiceDefinition(12582912, '12 TB / month', '\u9002\u5408\u6301\u7eed\u9ad8\u5e26\u5bbd\u4f20\u8f93\u9700\u6c42\u3002', 'Fits sustained high-transfer workloads.', '56.00', $annualMultiplier),
                        ],
                    ],
                    'ipv4' => [
                        'sort' => 110,
                        'name_zh' => '\u9644\u52a0 IPv4 \u6570\u91cf',
                        'name_en' => 'IPv4 Quantity',
                        'description_zh' => '\u8d2d\u4e70\u771f\u5b9e IPv4 \u6570\u91cf\uff0c\u4f1a\u5199\u56de Convoy \u7684\u5730\u5740\u9650\u5236\u3002',
                        'description_en' => 'Buy the real IPv4 quantity written back to Convoy address limits.',
                        'choices' => [
                            $this->choiceDefinition(1, '1 IPv4', '\u9ed8\u8ba4\u5305\u542b 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Includes 1 IPv4 address by default.', '0.00', $annualMultiplier),
                            $this->choiceDefinition(2, '2 IPv4', '\u989d\u5916\u65b0\u589e 1 \u4e2a IPv4 \u5730\u5740\u3002', 'Adds one extra IPv4 address.', '18.00', $annualMultiplier),
                            $this->choiceDefinition(3, '3 IPv4', '\u9002\u5408\u4ee3\u7406\u3001\u8f6c\u53d1\u6216\u591a\u5165\u53e3\u573a\u666f\u3002', 'Useful for proxy, forwarding and multi-entry workloads.', '36.00', $annualMultiplier),
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function choiceDefinition(int|string $value, string $labelEn, string $descriptionZh, string $descriptionEn, string $monthlyPrice, int $annualMultiplier): array
    {
        return [
            'value' => (string) $value,
            'name_en' => $labelEn,
            'name_zh' => $labelEn,
            'description_zh' => $descriptionZh,
            'description_en' => $descriptionEn,
            'pricing' => [
                'monthly' => $monthlyPrice,
                'yearly' => number_format(((float) $monthlyPrice) * $annualMultiplier, 2, '.', ''),
            ],
        ];
    }

    /**
     * @param  array<string, string>  $regionNodes
     * @return array<int, array<string, mixed>>
     */
    protected function definitions(string $templateRef, array $regionNodes, int $annualMultiplier): array
    {
        $rows = [];
        $regions = $this->regions();

        foreach ($this->profiles($annualMultiplier) as $profile) {
            foreach ($regions as $regionCode => $region) {
                $slug = sprintf('%s-vps-%s', $regionCode, $profile['suffix']);
                $monthlyPrice = (string) (($profile['monthly_prices'] ?? [])[(string) $region['price_group']] ?? '0.00');
                $yearlyPrice = number_format(((float) $monthlyPrice) * $annualMultiplier, 2, '.', '');
                $ramLabel = $this->formatMib((int) $profile['ram']);
                $diskLabel = $this->formatMib((int) $profile['disk']);
                $bandwidthLabel = $this->formatMib((int) $profile['bandwidth']);
                $nameEn = sprintf('%s %s', (string) $region['product_name_en_prefix'], (string) $profile['title']);
                $nameZh = sprintf('%s %s', $this->unicode((string) $region['product_name_zh_prefix']), (string) $profile['title']);
                $descriptionZh = sprintf(
                    '%s %d vCPU / %s RAM / %s SSD / %s \u6708\u6d41\u91cf / %d IPv4 / %d \u5feb\u7167 / %d \u5907\u4efd / \u652f\u6301\u6708\u4ed8\u4e0e\u5e74\u4ed8 / \u652f\u6301\u7cfb\u7edf\u91cd\u88c5\u3001\u5f00\u5173\u673a\u3001\u5bc6\u7801\u91cd\u7f6e\u4e0e\u72b6\u6001\u56de\u5199\u3002',
                    $this->unicode((string) $region['product_description_zh']),
                    (int) $profile['cpu'],
                    $ramLabel,
                    $diskLabel,
                    $bandwidthLabel,
                    (int) $profile['ipv4'],
                    (int) $profile['snapshot'],
                    (int) $profile['backups'],
                );
                $descriptionEn = sprintf(
                    '%s %d vCPU / %s RAM / %s SSD / %s monthly traffic / %d IPv4 / %d snapshots / %d backups / monthly and yearly billing / reinstall, power control, password reset and state sync included.',
                    (string) $region['product_description_en'],
                    (int) $profile['cpu'],
                    $ramLabel,
                    $diskLabel,
                    $bandwidthLabel,
                    (int) $profile['ipv4'],
                    (int) $profile['snapshot'],
                    (int) $profile['backups'],
                );

                $rows[] = [
                    'region' => $regionCode,
                    'slug' => $slug,
                    'name' => $nameZh,
                    'name_translations' => [
                        'zh-CN' => $nameZh,
                        'en-US' => $nameEn,
                        'default' => $nameEn,
                    ],
                    'description_translations' => [
                        'zh-CN' => $descriptionZh,
                        'en-US' => $descriptionEn,
                        'default' => $descriptionEn,
                    ],
                    'pricing' => [
                        'monthly' => $monthlyPrice,
                        'yearly' => $yearlyPrice,
                    ],
                    'settings' => [
                        'cpu' => (int) $profile['cpu'],
                        'ram' => (int) $profile['ram'],
                        'disk' => (int) $profile['disk'],
                        'bandwidth' => (int) $profile['bandwidth'],
                        'snapshot' => (int) $profile['snapshot'],
                        'backups' => (int) $profile['backups'],
                        'ipv4' => (int) $profile['ipv4'],
                        'ipv6' => 0,
                        'start_on_create' => true,
                        'node' => (string) $regionNodes[$regionCode],
                        'os' => $templateRef,
                        'region' => $regionCode,
                        'country_code' => (string) $region['country_code'],
                        'runtime_kind' => 'vps',
                        'profile' => (string) $profile['title'],
                    ],
                    'upgrades' => $profile['upgrades'],
                ];
            }
        }

        return $rows;
    }

    protected function ensureConvoyServer(): Server
    {
        /** @var Server $server */
        $server = Server::withTrashed()->firstOrNew([
            'extension' => 'Convoy',
            'type' => 'server',
        ]);

        $server->name = 'Convoy VPS';
        $server->enabled = true;
        $server->deleted_at = null;
        $server->save();

        return $server;
    }

    /**
     * @param  array<string, array<string, mixed>>  $regions
     * @return array<string, Category>
     */
    protected function ensureCategories(array $regions): array
    {
        $categories = [];

        foreach ($regions as $regionCode => $region) {
            /** @var Category $category */
            $category = Category::query()->updateOrCreate(
                ['slug' => (string) $region['category_slug']],
                [
                    'name' => $this->unicode((string) $region['category_name_zh']),
                    'name_translations' => [
                        'zh-CN' => $this->unicode((string) $region['category_name_zh']),
                        'en-US' => (string) $region['category_name_en'],
                        'default' => (string) $region['category_name_en'],
                    ],
                    'description' => (string) $region['category_name_en'],
                    'description_translations' => [
                        'zh-CN' => $this->unicode((string) $region['category_description_zh']),
                        'en-US' => (string) $region['category_description_en'],
                        'default' => (string) $region['category_description_en'],
                    ],
                    'sort' => (int) $region['category_sort'],
                ]
            );

            $categories[$regionCode] = $category;
        }

        return $categories;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    protected function ensureProduct(Category $category, Server $server, array $definition, int $priority): Product
    {
        /** @var Product $product */
        $product = Product::query()->updateOrCreate(
            ['slug' => (string) $definition['slug']],
            [
                'category_id' => $category->id,
                'name' => (string) $definition['name'],
                'name_translations' => $this->decodeTranslations((array) $definition['name_translations']),
                'description' => (string) ($definition['description_translations']['en-US'] ?? ''),
                'description_translations' => $this->decodeTranslations((array) $definition['description_translations']),
                'stock' => null,
                'per_user_limit' => 20,
                'sort' => $priority,
                'allow_quantity' => 'disabled',
                'server_id' => $server->id,
                'hidden' => false,
            ]
        );

        if (!is_string($product->email_template) || trim($product->email_template) === '') {
            $product->email_template = $this->defaultEmailTemplateSnippet();
            $product->save();
        }

        return $product;
    }

    protected function defaultEmailTemplateSnippet(): string
    {
        return <<<'BLADE'
Service panel: {{ $service_panel_url ?? 'Open Sloth Cloud frontend service page' }}
@if(!empty($server_ip))
Server IP: {{ $server_ip }}
@endif
@if(!empty($server_username))
Login user: {{ $server_username }}
@endif
@if(!empty($password))
Latest password pushed by system: {{ $password }}
@endif
@if(!empty($password_note))
Password note: {{ $password_note }}
@endif
@if(empty($password))
Password was not returned by upstream. Please open Sloth Cloud service page and use password reset if needed.
@endif
BLADE;
    }

    /**
     * @return array<string, Plan>
     */
    protected function ensureRecurringPlans(Product $product): array
    {
        return [
            'monthly' => $this->ensureRecurringPlan(
                $product,
                1,
                'month',
                'Monthly',
                [
                    'zh-CN' => $this->unicode('\u6708\u4ed8'),
                    'en-US' => 'Monthly',
                    'default' => 'Monthly',
                ],
                10
            ),
            'yearly' => $this->ensureRecurringPlan(
                $product,
                1,
                'year',
                'Yearly',
                [
                    'zh-CN' => $this->unicode('\u5e74\u4ed8'),
                    'en-US' => 'Yearly',
                    'default' => 'Yearly',
                ],
                20
            ),
        ];
    }

    /**
     * @param  array<string, string>  $translations
     */
    protected function ensureRecurringPlan(
        Product|ConfigOption $priceable,
        int $billingPeriod,
        string $billingUnit,
        string $name,
        array $translations,
        int $sort
    ): Plan {
        /** @var Plan $plan */
        $plan = $priceable->plans()->firstOrCreate(
            [
                'type' => 'recurring',
                'billing_period' => $billingPeriod,
                'billing_unit' => $billingUnit,
            ],
            [
                'name' => $name,
                'name_translations' => $translations,
                'sort' => $sort,
            ]
        );

        $plan->name = $name;
        $plan->name_translations = $translations;
        $plan->sort = $sort;
        $plan->save();

        return $plan;
    }

    protected function ensurePlanPrice(Plan $plan, string $currencyCode, string $price): void
    {
        Price::query()->updateOrCreate(
            [
                'plan_id' => $plan->id,
                'currency_code' => $currencyCode,
            ],
            [
                'price' => $price,
                'setup_fee' => '0.00',
            ]
        );
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function ensureProductSettings(Product $product, array $settings): void
    {
        foreach ($settings as $key => $value) {
            $type = is_bool($value)
                ? 'boolean'
                : (is_int($value) ? 'integer' : 'string');

            $product->settings()->updateOrCreate(
                ['key' => (string) $key],
                [
                    'value' => $value,
                    'type' => $type,
                    'encrypted' => false,
                ]
            );
        }
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function ensureProvisioningMapping(Product $product, Plan $plan, array $settings, int $priority): void
    {
        ProvisioningMapping::query()->updateOrCreate(
            [
                'provider' => ProvisioningMapping::PROVIDER_CONVOY,
                'product_id' => $product->id,
                'product_slug' => $product->slug,
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
            ],
            [
                'template_ref' => (string) ($settings['os'] ?? ''),
                'node_ref' => (string) ($settings['node'] ?? ''),
                'priority' => $priority,
                'enabled' => true,
                'config' => [
                    'cpu' => (int) ($settings['cpu'] ?? 1),
                    'ram' => (int) ($settings['ram'] ?? 1024),
                    'disk' => (int) ($settings['disk'] ?? 20480),
                    'bandwidth' => (int) ($settings['bandwidth'] ?? 1048576),
                    'snapshot' => (int) ($settings['snapshot'] ?? 1),
                    'backups' => (int) ($settings['backups'] ?? 1),
                    'ipv4' => (int) ($settings['ipv4'] ?? 1),
                    'ipv6' => (int) ($settings['ipv6'] ?? 0),
                    'start_on_create' => (bool) ($settings['start_on_create'] ?? true),
                    'region' => (string) ($settings['region'] ?? ''),
                    'country_code' => (string) ($settings['country_code'] ?? ''),
                    'runtime_kind' => (string) ($settings['runtime_kind'] ?? 'vps'),
                ],
            ]
        );
    }

    /**
     * @param  array<string, Plan>  $plans
     * @param  array<string, mixed>  $upgrades
     * @param  array<int, string>  $priceCurrencies
     */
    protected function ensureConfigurableUpsells(Product $product, array $plans, array $upgrades, array $priceCurrencies): void
    {
        foreach (['bandwidth', 'ipv4'] as $key) {
            $config = $upgrades[$key] ?? null;
            if (!is_array($config)) {
                continue;
            }

            $this->ensureSelectableConfigOption($product, $plans, $key, $config, $priceCurrencies);
        }
    }

    /**
     * @param  array<string, Plan>  $plans
     * @param  array<string, mixed>  $config
     * @param  array<int, string>  $priceCurrencies
     */
    protected function ensureSelectableConfigOption(
        Product $product,
        array $plans,
        string $envVariable,
        array $config,
        array $priceCurrencies
    ): void {
        $option = ConfigOption::query()
            ->whereNull('parent_id')
            ->where('env_variable', $envVariable)
            ->whereHas('products', fn ($query) => $query->where('products.id', $product->id))
            ->first();

        if (!$option) {
            $option = new ConfigOption();
        }

        $option->name = $this->unicode((string) ($config['name_zh'] ?? $envVariable));
        $option->description = (string) ($config['description_en'] ?? '');
        $option->name_translations = [
            'zh-CN' => $this->unicode((string) ($config['name_zh'] ?? $envVariable)),
            'en-US' => (string) ($config['name_en'] ?? $envVariable),
            'default' => (string) ($config['name_en'] ?? $envVariable),
        ];
        $option->description_translations = [
            'zh-CN' => $this->unicode((string) ($config['description_zh'] ?? '')),
            'en-US' => (string) ($config['description_en'] ?? ''),
            'default' => (string) ($config['description_en'] ?? ''),
        ];
        $option->env_variable = $envVariable;
        $option->type = 'select';
        $option->sort = (int) ($config['sort'] ?? 100);
        $option->hidden = false;
        $option->upgradable = true;
        $option->save();
        $option->products()->syncWithoutDetaching([$product->id]);

        $sort = 10;
        foreach ((array) ($config['choices'] ?? []) as $choice) {
            if (!is_array($choice)) {
                continue;
            }

            $child = ConfigOption::query()->updateOrCreate(
                [
                    'parent_id' => $option->id,
                    'env_variable' => (string) ($choice['value'] ?? ''),
                ],
                [
                    'name' => (string) ($choice['name_en'] ?? $choice['value'] ?? ''),
                    'description' => (string) ($choice['description_en'] ?? ''),
                    'name_translations' => [
                        'zh-CN' => $this->unicode((string) ($choice['name_zh'] ?? $choice['name_en'] ?? $choice['value'] ?? '')),
                        'en-US' => (string) ($choice['name_en'] ?? $choice['value'] ?? ''),
                        'default' => (string) ($choice['name_en'] ?? $choice['value'] ?? ''),
                    ],
                    'description_translations' => [
                        'zh-CN' => $this->unicode((string) ($choice['description_zh'] ?? '')),
                        'en-US' => (string) ($choice['description_en'] ?? ''),
                        'default' => (string) ($choice['description_en'] ?? ''),
                    ],
                    'sort' => $sort,
                    'hidden' => false,
                ]
            );

            foreach ($plans as $planKey => $plan) {
                $choicePlan = $this->ensureRecurringPlan(
                    $child,
                    (int) $plan->billing_period,
                    (string) $plan->billing_unit,
                    (string) $plan->name,
                    (array) ($plan->name_translations ?? []),
                    (int) ($plan->sort ?? 0)
                );

                $price = (string) (($choice['pricing'] ?? [])[$planKey] ?? '0.00');
                foreach ($priceCurrencies as $priceCurrency) {
                    $this->ensurePlanPrice($choicePlan, $priceCurrency, $price);
                }
            }

            $sort += 10;
        }
    }

    protected function normalizeOption(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    /**
     * @param  array<string, string>  $translations
     * @return array<string, string>
     */
    protected function decodeTranslations(array $translations): array
    {
        $decoded = [];

        foreach ($translations as $locale => $value) {
            $decoded[$locale] = $this->unicode($value);
        }

        return $decoded;
    }

    protected function unicode(string $value): string
    {
        if (!str_contains($value, '\u')) {
            return $value;
        }

        $decoded = json_decode('"'.$value.'"', true);

        return is_string($decoded) ? $decoded : $value;
    }

    protected function formatMib(int $value): string
    {
        if ($value >= 1024 * 1024 && $value % (1024 * 1024) === 0) {
            return ((string) ((int) ($value / (1024 * 1024)))) . 'TB';
        }

        if ($value >= 1024 && $value % 1024 === 0) {
            return ((string) ((int) ($value / 1024))) . 'GB';
        }

        return $value . 'MiB';
    }
}
