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

class BootstrapManagedAppCatalog extends Command
{
    protected $signature = 'app:catalog:bootstrap-managed-app
        {--currency= : Currency code for managed app prices}
        {--dry-run : Preview only without writing data}';

    protected $description = 'Create or update the Managed App Hosting catalog, plans, and provisioning mappings';

    /**
     * @var array<int, array<string, mixed>>
     */
    protected array $definitions = [
        [
            'slug' => 'app-starter',
            'name' => 'App Starter',
            'name_translations' => [
                'zh-CN' => '\u5e94\u7528\u5165\u95e8\u7248',
                'en-US' => 'App Starter',
                'default' => 'App Starter',
            ],
            'description_translations' => [
                'zh-CN' => '\u9002\u5408\u5c0f\u578b\u516c\u5f00\u4ed3\u5e93\u5e94\u7528\uff0c\u9ed8\u8ba4\u5355\u526f\u672c\uff0c\u5feb\u901f\u5f00\u901a\u3002',
                'en-US' => 'Entry package for small public repository applications with single-replica deployment.',
                'default' => 'Entry package for small public repository applications with single-replica deployment.',
            ],
            'price' => '29.00',
            'settings' => [
                'runtime_port' => 3000,
                'persistent_storage_size' => '5Gi',
                'replica_limit' => 1,
                'domain_limit' => 1,
                'env_var_limit' => 20,
                'log_retention_days' => 7,
                'allow_scale' => false,
                'workload_mode' => 'deployment',
                'ingress_enabled' => true,
                'tls_enabled' => true,
                'build_cpu_limit' => '500m',
                'build_memory_limit' => '512Mi',
                'runtime_cpu_limit' => '500m',
                'runtime_memory_limit' => '512Mi',
                'bandwidth_label' => 'Shared',
            ],
        ],
        [
            'slug' => 'app-standard',
            'name' => 'App Standard',
            'name_translations' => [
                'zh-CN' => '\u5e94\u7528\u6807\u51c6\u7248',
                'en-US' => 'App Standard',
                'default' => 'App Standard',
            ],
            'description_translations' => [
                'zh-CN' => '\u9002\u5408\u5e38\u89c4\u751f\u4ea7\u5e94\u7528\uff0c\u63d0\u4f9b\u66f4\u9ad8\u8fd0\u884c\u914d\u989d\u4e0e\u81ea\u5b9a\u4e49\u57df\u540d\u652f\u6301\u3002',
                'en-US' => 'Balanced package for standard production apps with more runtime capacity.',
                'default' => 'Balanced package for standard production apps with more runtime capacity.',
            ],
            'price' => '59.00',
            'settings' => [
                'runtime_port' => 3000,
                'persistent_storage_size' => '10Gi',
                'replica_limit' => 1,
                'domain_limit' => 2,
                'env_var_limit' => 30,
                'log_retention_days' => 14,
                'allow_scale' => false,
                'workload_mode' => 'deployment',
                'ingress_enabled' => true,
                'tls_enabled' => true,
                'build_cpu_limit' => '500m',
                'build_memory_limit' => '512Mi',
                'runtime_cpu_limit' => '1000m',
                'runtime_memory_limit' => '1Gi',
                'bandwidth_label' => '2TB Included',
            ],
        ],
        [
            'slug' => 'app-pro',
            'name' => 'App Pro',
            'name_translations' => [
                'zh-CN' => '\u5e94\u7528\u4e13\u4e1a\u7248',
                'en-US' => 'App Pro',
                'default' => 'App Pro',
            ],
            'description_translations' => [
                'zh-CN' => '\u9002\u5408\u9ad8\u6d41\u91cf\u4e1a\u52a1\uff0c\u53ef\u6269\u5bb9\u526f\u672c\u5e76\u652f\u6301\u66f4\u5927\u7684\u6301\u4e45\u5316\u5b58\u50a8\u3002',
                'en-US' => 'High-capacity package with horizontal scaling and larger persistent storage.',
                'default' => 'High-capacity package with horizontal scaling and larger persistent storage.',
            ],
            'price' => '129.00',
            'settings' => [
                'runtime_port' => 3000,
                'persistent_storage_size' => '20Gi',
                'replica_limit' => 2,
                'domain_limit' => 5,
                'env_var_limit' => 50,
                'log_retention_days' => 30,
                'allow_scale' => true,
                'workload_mode' => 'deployment',
                'ingress_enabled' => true,
                'tls_enabled' => true,
                'build_cpu_limit' => '500m',
                'build_memory_limit' => '512Mi',
                'runtime_cpu_limit' => '1500m',
                'runtime_memory_limit' => '2Gi',
                'bandwidth_label' => '5TB Included',
            ],
        ],
        [
            'slug' => 'app-team',
            'name' => 'App Team',
            'name_translations' => [
                'zh-CN' => '\u5e94\u7528\u56e2\u961f\u7248',
                'en-US' => 'App Team',
                'default' => 'App Team',
            ],
            'description_translations' => [
                'zh-CN' => '\u9762\u5411\u56e2\u961f\u7ea7\u5de5\u4f5c\u8d1f\u8f7d\uff0c\u652f\u6301 StatefulSet\u3001\u66f4\u9ad8\u526f\u672c\u4e0a\u9650\u4e0e\u66f4\u5927\u5b58\u50a8\u3002',
                'en-US' => 'Team-grade package for stateful or multi-instance workloads.',
                'default' => 'Team-grade package for stateful or multi-instance workloads.',
            ],
            'price' => '249.00',
            'settings' => [
                'runtime_port' => 3000,
                'persistent_storage_size' => '40Gi',
                'replica_limit' => 4,
                'domain_limit' => 10,
                'env_var_limit' => 100,
                'log_retention_days' => 90,
                'allow_scale' => true,
                'workload_mode' => 'statefulset',
                'ingress_enabled' => true,
                'tls_enabled' => true,
                'build_cpu_limit' => '1000m',
                'build_memory_limit' => '1Gi',
                'runtime_cpu_limit' => '2000m',
                'runtime_memory_limit' => '4Gi',
                'bandwidth_label' => '10TB Included',
            ],
        ],
    ];

    public function handle(): int
    {
        $currencyCode = strtoupper((string) ($this->option('currency') ?: Currency::defaultCode() ?: 'USD'));
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->line(sprintf('[dry-run] Managed App catalog will be written in currency %s.', $currencyCode));
            foreach ($this->definitions as $definition) {
                $this->line(sprintf('[dry-run] product=%s price=%s', $definition['slug'], $definition['price']));
            }

            return self::SUCCESS;
        }

        DB::transaction(function () use ($currencyCode): void {
            $server = $this->ensureManagedAppServer();
            $category = $this->ensureCategory();

            foreach ($this->definitions as $index => $definition) {
                $product = $this->ensureProduct($category, $server, $definition, $index);
                $plan = $this->ensureMonthlyPlan($product);
                $this->ensurePlanPrice($plan, $currencyCode, (string) $definition['price']);
                $this->ensureProductSettings($product, $definition['settings']);
                $this->ensureProvisioningMapping($product, $plan, $definition['settings'], $index);
            }
        });

        $this->info('Managed App Hosting catalog bootstrap completed.');

        return self::SUCCESS;
    }

    protected function ensureManagedAppServer(): Server
    {
        /** @var Server $server */
        $server = Server::withTrashed()->firstOrNew([
            'extension' => 'ManagedAppHosting',
            'type' => 'server',
        ]);

        $server->name = 'Managed App Hosting';
        $server->enabled = true;
        $server->deleted_at = null;
        $server->save();

        return $server;
    }

    protected function ensureCategory(): Category
    {
        /** @var Category $category */
        $category = Category::query()->updateOrCreate(
            ['slug' => 'app-hosting'],
            [
                'name' => $this->unicode('\u6258\u7ba1\u5bb9\u5668\u4e91'),
                'name_translations' => [
                    'zh-CN' => $this->unicode('\u6258\u7ba1\u5bb9\u5668\u4e91'),
                    'en-US' => 'Managed App Hosting',
                    'default' => 'Managed App Hosting',
                ],
                'description' => 'Managed App Hosting',
                'description_translations' => [
                    'zh-CN' => $this->unicode('\u5728\u6811\u61d2\u4e91\u524d\u53f0\u8d2d\u4e70\u3001\u90e8\u7f72\u5e76\u7ba1\u7406\u57fa\u4e8e Kubernetes \u7684\u6258\u7ba1\u5e94\u7528\u73af\u5883\u3002'),
                    'en-US' => 'Deploy and manage Kubernetes-backed managed application environments from Sloth Cloud.',
                    'default' => 'Deploy and manage Kubernetes-backed managed application environments from Sloth Cloud.',
                ],
                'sort' => 30,
            ]
        );

        return $category;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    protected function ensureProduct(Category $category, Server $server, array $definition, int $index): Product
    {
        /** @var Product $product */
        $product = Product::query()->updateOrCreate(
            ['slug' => $definition['slug']],
            [
                'category_id' => $category->id,
                'name' => $definition['name'],
                'name_translations' => $this->decodeTranslations($definition['name_translations']),
                'description' => $definition['description_translations']['en-US'] ?? $definition['name'],
                'description_translations' => $this->decodeTranslations($definition['description_translations']),
                'stock' => null,
                'per_user_limit' => 10,
                'sort' => 10 + ($index * 10),
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
        return implode(PHP_EOL, [
            "Service panel: {{ \$service_panel_url ?? 'Open Sloth Cloud frontend service page' }}",
            "Runtime: {{ \$runtime_kind ?? 'managed-app' }}",
            '@if(!empty($endpoint))',
            'Endpoint: {{ $endpoint }}',
            '@endif',
            '@if(!empty($operation_id))',
            'Operation ID: {{ $operation_id }}',
            '@endif',
            'Open Sloth Cloud service page to review build logs, environment variables, domain binding, and HTTPS status.',
        ]);
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
                    'zh-CN' => $this->unicode('\u6708\u4ed8'),
                    'en-US' => 'Monthly',
                    'default' => 'Monthly',
                ],
                'sort' => 10,
            ]
        );

        $plan->name = 'Monthly';
        $plan->name_translations = [
            'zh-CN' => $this->unicode('\u6708\u4ed8'),
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
                ['key' => $key],
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
    protected function ensureProvisioningMapping(Product $product, Plan $plan, array $settings, int $index): void
    {
        ProvisioningMapping::query()->updateOrCreate(
            [
                'provider' => ProvisioningMapping::PROVIDER_MANAGED_APP,
                'product_id' => $product->id,
                'product_slug' => $product->slug,
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
            ],
            [
                'template_ref' => null,
                'node_ref' => null,
                'priority' => 10 + $index,
                'enabled' => true,
                'config' => [
                'properties' => [
                    'runtime_kind' => 'managed-app',
                ],
                'checkout_defaults' => [
                    'compose_file_path' => '',
                    'compose_service_name' => '',
                    'runtime_port' => $settings['runtime_port'] ?? 3000,
                    'persistent_storage_size' => $settings['persistent_storage_size'] ?? '5Gi',
                    'replica_limit' => $settings['replica_limit'] ?? 1,
                    'domain_limit' => $settings['domain_limit'] ?? 1,
                    'env_var_limit' => $settings['env_var_limit'] ?? 20,
                    'log_retention_days' => $settings['log_retention_days'] ?? 7,
                    'allow_scale' => $settings['allow_scale'] ?? false,
                    'workload_mode' => $settings['workload_mode'] ?? 'deployment',
                ],
                'service_limits' => [
                    'runtime_cpu_limit' => $settings['runtime_cpu_limit'] ?? null,
                    'runtime_memory_limit' => $settings['runtime_memory_limit'] ?? null,
                    'build_cpu_limit' => $settings['build_cpu_limit'] ?? null,
                    'build_memory_limit' => $settings['build_memory_limit'] ?? null,
                    'replica_limit' => $settings['replica_limit'] ?? 1,
                    'domain_limit' => $settings['domain_limit'] ?? 1,
                    'env_var_limit' => $settings['env_var_limit'] ?? 20,
                    'log_retention_days' => $settings['log_retention_days'] ?? 7,
                    'allow_scale' => $settings['allow_scale'] ?? false,
                ],
            ],
        ]
    );
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
}
