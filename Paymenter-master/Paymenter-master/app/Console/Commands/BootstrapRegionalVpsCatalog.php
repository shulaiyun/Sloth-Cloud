<?php

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\Currency;
use App\Models\Plan;
use App\Models\Price;
use App\Models\Product;
use App\Models\ProvisioningMapping;
use App\Models\Server;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BootstrapRegionalVpsCatalog extends Command
{
    protected $signature = 'app:catalog:bootstrap-vps-regional
        {--currency= : Currency code for VPS prices}
        {--us-node=1 : Convoy node ID for United States products}
        {--hk-node=2 : Convoy node ID for Hong Kong products}
        {--template=ubuntu-22-04 : Default Convoy template UUID or slug}
        {--dry-run : Preview changes without writing data}';

    protected $description = 'Create or update regional VPS products (US/HK) with Convoy provisioning mappings';

    public function handle(): int
    {
        $currencyCode = strtoupper((string) ($this->option('currency') ?: Currency::defaultCode() ?: 'USD'));
        $templateRef = trim((string) $this->option('template'));
        $usNode = trim((string) $this->option('us-node'));
        $hkNode = trim((string) $this->option('hk-node'));
        $dryRun = (bool) $this->option('dry-run');
        $priceCurrencies = $this->resolvePriceCurrencies($currencyCode);

        if ($templateRef === '') {
            $this->error('Option --template cannot be empty.');

            return self::FAILURE;
        }

        if ($dryRun) {
            $this->line(sprintf('[dry-run] VPS regional catalog will use currency=%s template=%s us-node=%s hk-node=%s', $currencyCode, $templateRef, $usNode, $hkNode));
            foreach ($this->definitions($templateRef, $usNode, $hkNode) as $row) {
                $this->line(sprintf(
                    '[dry-run] product=%s price=%s region=%s cpu=%d ram=%dMi disk=%dMi',
                    (string) $row['slug'],
                    (string) $row['price'],
                    (string) $row['region'],
                    (int) $row['settings']['cpu'],
                    (int) $row['settings']['ram'],
                    (int) $row['settings']['disk'],
                ));
            }

            return self::SUCCESS;
        }

        DB::transaction(function () use ($currencyCode, $templateRef, $usNode, $hkNode, $priceCurrencies): void {
            $server = $this->ensureConvoyServer();
            $categories = $this->ensureCategories();

            $priority = 10;
            foreach ($this->definitions($templateRef, $usNode, $hkNode) as $definition) {
                $region = (string) $definition['region'];
                $category = $categories[$region];
                $product = $this->ensureProduct($category, $server, $definition, $priority);
                $plan = $this->ensureMonthlyPlan($product);
                foreach ($priceCurrencies as $priceCurrency) {
                    $this->ensurePlanPrice($plan, $priceCurrency, (string) $definition['price']);
                }
                $this->ensureProductSettings($product, $definition['settings']);
                $this->ensureProvisioningMapping($product, $plan, $definition['settings'], $priority);
                $priority += 10;
            }
        });

        $this->info('Regional VPS catalog bootstrap completed.');

        return self::SUCCESS;
    }

    /**
     * @return array<int, string>
     */
    protected function resolvePriceCurrencies(string $preferredCurrency): array
    {
        $available = Currency::query()->pluck('code')->filter()->map(fn ($code) => strtoupper((string) $code))->unique()->values();
        $candidateCodes = collect([$preferredCurrency, 'USD', 'CNY'])
            ->filter(fn ($code) => is_string($code) && trim($code) !== '')
            ->map(fn ($code) => strtoupper(trim((string) $code)))
            ->unique();

        return $candidateCodes
            ->filter(fn ($code) => $available->contains($code))
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function definitions(string $templateRef, string $usNode, string $hkNode): array
    {
        $profiles = [
            [
                'suffix' => '1c1g',
                'cpu' => 1,
                'ram' => 1024,
                'disk' => 20480,
                'bandwidth' => 1048576,
                'snapshot' => 1,
                'backups' => 1,
                'price_us' => '39.00',
                'price_hk' => '49.00',
            ],
            [
                'suffix' => '2c2g',
                'cpu' => 2,
                'ram' => 2048,
                'disk' => 40960,
                'bandwidth' => 2097152,
                'snapshot' => 2,
                'backups' => 1,
                'price_us' => '69.00',
                'price_hk' => '89.00',
            ],
            [
                'suffix' => '4c6g',
                'cpu' => 4,
                'ram' => 6144,
                'disk' => 81920,
                'bandwidth' => 4194304,
                'snapshot' => 2,
                'backups' => 2,
                'price_us' => '129.00',
                'price_hk' => '169.00',
            ],
        ];

        $rows = [];
        foreach ($profiles as $profile) {
            $rows[] = [
                'region' => 'us',
                'slug' => sprintf('us-vps-%s', $profile['suffix']),
                'name' => sprintf('US %s VPS', strtoupper($profile['suffix'])),
                'name_translations' => [
                    'zh-CN' => sprintf('美国 %s 云服务器', strtoupper($profile['suffix'])),
                    'en-US' => sprintf('US %s VPS', strtoupper($profile['suffix'])),
                    'default' => sprintf('US %s VPS', strtoupper($profile['suffix'])),
                ],
                'description_translations' => [
                    'zh-CN' => sprintf('美国机房，%d 核 CPU / %dMi 内存 / %dMi 存储，支持系统重装与电源控制。', $profile['cpu'], $profile['ram'], $profile['disk']),
                    'en-US' => sprintf('US region VPS with %d vCPU, %dMi memory, %dMi storage, reinstall and power controls included.', $profile['cpu'], $profile['ram'], $profile['disk']),
                    'default' => sprintf('US region VPS with %d vCPU, %dMi memory, %dMi storage, reinstall and power controls included.', $profile['cpu'], $profile['ram'], $profile['disk']),
                ],
                'price' => $profile['price_us'],
                'settings' => [
                    'cpu' => $profile['cpu'],
                    'ram' => $profile['ram'],
                    'disk' => $profile['disk'],
                    'bandwidth' => $profile['bandwidth'],
                    'snapshot' => $profile['snapshot'],
                    'backups' => $profile['backups'],
                    'ipv4' => 1,
                    'ipv6' => 0,
                    'start_on_create' => true,
                    'node' => $usNode,
                    'os' => $templateRef,
                    'region' => 'us',
                ],
            ];

            $rows[] = [
                'region' => 'hk',
                'slug' => sprintf('hk-vps-%s', $profile['suffix']),
                'name' => sprintf('HK %s VPS', strtoupper($profile['suffix'])),
                'name_translations' => [
                    'zh-CN' => sprintf('香港 %s 云服务器', strtoupper($profile['suffix'])),
                    'en-US' => sprintf('HK %s VPS', strtoupper($profile['suffix'])),
                    'default' => sprintf('HK %s VPS', strtoupper($profile['suffix'])),
                ],
                'description_translations' => [
                    'zh-CN' => sprintf('香港机房，%d 核 CPU / %dMi 内存 / %dMi 存储，支持系统重装与电源控制。', $profile['cpu'], $profile['ram'], $profile['disk']),
                    'en-US' => sprintf('Hong Kong region VPS with %d vCPU, %dMi memory, %dMi storage, reinstall and power controls included.', $profile['cpu'], $profile['ram'], $profile['disk']),
                    'default' => sprintf('Hong Kong region VPS with %d vCPU, %dMi memory, %dMi storage, reinstall and power controls included.', $profile['cpu'], $profile['ram'], $profile['disk']),
                ],
                'price' => $profile['price_hk'],
                'settings' => [
                    'cpu' => $profile['cpu'],
                    'ram' => $profile['ram'],
                    'disk' => $profile['disk'],
                    'bandwidth' => $profile['bandwidth'],
                    'snapshot' => $profile['snapshot'],
                    'backups' => $profile['backups'],
                    'ipv4' => 1,
                    'ipv6' => 0,
                    'start_on_create' => true,
                    'node' => $hkNode,
                    'os' => $templateRef,
                    'region' => 'hk',
                ],
            ];
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
     * @return array<string, Category>
     */
    protected function ensureCategories(): array
    {
        /** @var Category $us */
        $us = Category::query()->updateOrCreate(
            ['slug' => 'vps-us'],
            [
                'name' => '美国云服务器',
                'name_translations' => [
                    'zh-CN' => '美国云服务器',
                    'en-US' => 'US Cloud VPS',
                    'default' => 'US Cloud VPS',
                ],
                'description' => 'US Cloud VPS',
                'description_translations' => [
                    'zh-CN' => '面向北美用户的高性价比 VPS 方案。',
                    'en-US' => 'Cost-effective VPS plans for North America workloads.',
                    'default' => 'Cost-effective VPS plans for North America workloads.',
                ],
                'sort' => 10,
            ]
        );

        /** @var Category $hk */
        $hk = Category::query()->updateOrCreate(
            ['slug' => 'vps-hk'],
            [
                'name' => '香港云服务器',
                'name_translations' => [
                    'zh-CN' => '香港云服务器',
                    'en-US' => 'Hong Kong Cloud VPS',
                    'default' => 'Hong Kong Cloud VPS',
                ],
                'description' => 'Hong Kong Cloud VPS',
                'description_translations' => [
                    'zh-CN' => '面向亚洲低延迟访问场景的 VPS 方案。',
                    'en-US' => 'Low-latency VPS plans for Asia-Pacific traffic.',
                    'default' => 'Low-latency VPS plans for Asia-Pacific traffic.',
                ],
                'sort' => 20,
            ]
        );

        return [
            'us' => $us,
            'hk' => $hk,
        ];
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
                'name_translations' => $definition['name_translations'],
                'description' => (string) $definition['description_translations']['en-US'],
                'description_translations' => $definition['description_translations'],
                'stock' => null,
                'per_user_limit' => 20,
                'sort' => $priority,
                'allow_quantity' => 'disabled',
                'server_id' => $server->id,
                'hidden' => false,
            ]
        );

        return $product;
    }

    protected function ensureMonthlyPlan(Product $product): Plan
    {
        /** @var Plan $plan */
        $plan = $product->plans()->firstOrCreate(
            [
                'type' => 'recurring',
                'billing_period' => 1,
                'billing_unit' => 'month',
            ],
            [
                'name' => 'Monthly',
                'name_translations' => [
                    'zh-CN' => '月付',
                    'en-US' => 'Monthly',
                    'default' => 'Monthly',
                ],
                'sort' => 10,
            ]
        );

        $plan->name = 'Monthly';
        $plan->name_translations = [
            'zh-CN' => '月付',
            'en-US' => 'Monthly',
            'default' => 'Monthly',
        ];
        $plan->sort = 10;
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
                ],
            ]
        );
    }
}
