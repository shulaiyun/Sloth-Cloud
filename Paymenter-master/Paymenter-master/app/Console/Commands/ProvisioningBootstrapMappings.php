<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\ProvisioningMapping;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ProvisioningBootstrapMappings extends Command
{
    protected $signature = 'app:provisioning:mappings:bootstrap
        {--provider=convoy : Provisioning provider name}
        {--node= : Default node reference}
        {--template= : Default template reference}
        {--include-app-hosting : Include app-hosting category when provider is convoy}
        {--include-non-app-hosting : Include non app-hosting products when provider is managed-app}
        {--cpu=2 : Default cpu cores}
        {--ram=4096 : Default ram in MB}
        {--disk=40960 : Default disk in MB}
        {--bandwidth=2048 : Default bandwidth/traffic quota in MB}
        {--ipv4=1 : Default ipv4 count}
        {--ipv6=0 : Default ipv6 count}
        {--start-on-create=1 : Start server after provisioning}
        {--sync-file : Also write fallback mapping file}
        {--output= : Override fallback file output path}
        {--dry-run : Preview only}';

    protected $description = 'Bootstrap provisioning mappings for all visible products/plans';

    public function handle(): int
    {
        $provider = Str::lower((string) $this->option('provider'));
        $dryRun = (bool) $this->option('dry-run');
        $syncFile = (bool) $this->option('sync-file');
        $includeAppHosting = (bool) $this->option('include-app-hosting');
        $includeNonAppHosting = (bool) $this->option('include-non-app-hosting');

        $fallbackDefaults = $this->loadFallbackDefaults($provider);

        $products = Product::query()
            ->when(
                Schema::hasColumn('products', 'enabled'),
                fn ($query) => $query->where('enabled', true),
                fn ($query) => Schema::hasColumn('products', 'hidden')
                    ? $query->where('hidden', false)
                    : $query
            )
            ->with([
                'plans' => fn ($query) => $query->orderBy('sort')->orderBy('id'),
                'settings',
                'category',
                'server',
            ])
            ->when($provider === ProvisioningMapping::PROVIDER_CONVOY && !$includeAppHosting, function ($query) {
                $query->where(function ($inner) {
                    $inner->whereNull('category_id')
                        ->orWhereHas('category', fn ($categoryQuery) => $categoryQuery->where('slug', '!=', 'app-hosting'));
                })->where(function ($inner) {
                    $inner->whereNull('server_id')
                        ->orWhereHas('server', fn ($serverQuery) => $serverQuery->where('extension', '!=', 'ManagedAppHosting'));
                });
            })
            ->when($provider === ProvisioningMapping::PROVIDER_MANAGED_APP && !$includeNonAppHosting, function ($query) {
                $query->where(function ($inner) {
                    $inner->whereHas('category', fn ($categoryQuery) => $categoryQuery->where('slug', 'app-hosting'))
                        ->orWhereHas('server', fn ($serverQuery) => $serverQuery->where('extension', 'ManagedAppHosting'));
                });
            })
            ->orderBy('id')
            ->get();

        if ($products->isEmpty()) {
            $this->warn('No visible products found.');

            return self::SUCCESS;
        }

        $defaultNode = $this->normalizeOption($this->option('node')) ?? $this->normalizeOption($fallbackDefaults['node_ref'] ?? null);
        $defaultTemplate = $this->normalizeOption($this->option('template')) ?? $this->normalizeOption($fallbackDefaults['template_ref'] ?? null);
        $defaults = [
            'cpu' => (int) ($fallbackDefaults['config']['cpu'] ?? $this->option('cpu')),
            'ram' => (int) ($fallbackDefaults['config']['ram'] ?? $this->option('ram')),
            'disk' => (int) ($fallbackDefaults['config']['disk'] ?? $this->option('disk')),
            'bandwidth' => (int) ($fallbackDefaults['config']['bandwidth'] ?? $this->option('bandwidth')),
            'ipv4' => max((int) ($fallbackDefaults['config']['ipv4'] ?? $this->option('ipv4')), 0),
            'ipv6' => max((int) ($fallbackDefaults['config']['ipv6'] ?? $this->option('ipv6')), 0),
            'snapshot' => 1,
            'backups' => 1,
            'start_on_create' => filter_var((string) $this->option('start-on-create'), FILTER_VALIDATE_BOOL),
        ];

        $sourceRows = [];
        $upserted = 0;
        $priority = 10;

        foreach ($products as $product) {
            $productSettings = $product->settings
                ->pluck('value', 'key')
                ->mapWithKeys(fn ($value, $key) => [trim((string) $key) => $value])
                ->all();

            $productDefaults = $defaults;
            foreach (['cpu', 'ram', 'disk', 'bandwidth', 'ipv4', 'ipv6', 'snapshot', 'backups'] as $numericKey) {
                if (array_key_exists($numericKey, $productSettings) && is_numeric($productSettings[$numericKey])) {
                    $productDefaults[$numericKey] = max((int) $productSettings[$numericKey], 0);
                }
            }

            if (array_key_exists('start_on_create', $productSettings)) {
                $productDefaults['start_on_create'] = filter_var((string) $productSettings['start_on_create'], FILTER_VALIDATE_BOOL);
            }

            $resolvedNode = $this->normalizeOption($productSettings['node'] ?? null) ?? $defaultNode;
            $resolvedTemplate = $this->normalizeOption($productSettings['os'] ?? null) ?? $defaultTemplate;

            foreach ($product->plans as $plan) {
                $identity = [
                    'provider' => $provider,
                    'product_id' => $product->id,
                    'product_slug' => $this->normalizeOption($product->slug),
                    'plan_id' => $plan->id,
                    'plan_name' => $this->normalizeOption($plan->name),
                ];

                $payload = [
                    'provider' => $provider,
                    'template_ref' => $resolvedTemplate,
                    'node_ref' => $resolvedNode,
                    'config' => $productDefaults,
                    'priority' => $priority,
                    'enabled' => true,
                ];

                $sourceRows[] = array_merge($identity, $payload);

                if ($dryRun) {
                    $this->line('[dry-run] '.json_encode([
                        'identity' => $identity,
                        'payload' => $payload,
                    ], JSON_UNESCAPED_UNICODE));
                    $priority += 10;
                    continue;
                }

                ProvisioningMapping::query()->updateOrCreate($identity, $payload);
                $upserted++;
                $priority += 10;
            }
        }

        if ($syncFile) {
            $output = $this->normalizeOption($this->option('output')) ?: config('provisioning.fallback_file');
            if (!is_string($output) || trim($output) === '') {
                $this->error('Fallback mapping file path is empty. Pass --output or set provisioning.fallback_file.');

                return self::FAILURE;
            }

            if (!$dryRun) {
                $dir = dirname($output);
                if (!is_dir($dir)) {
                    File::makeDirectory($dir, 0755, true);
                }

                File::put($output, json_encode($sourceRows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES).PHP_EOL);
            }

            $this->info(sprintf('Fallback mapping file %s (%s).', $dryRun ? 'previewed' : 'written', $output));
        }

        $this->info(sprintf(
            'Provisioning mapping bootstrap done. provider=%s products=%d rows=%d upserted=%d dry_run=%s',
            $provider,
            $products->count(),
            count($sourceRows),
            $upserted,
            $dryRun ? 'yes' : 'no',
        ));

        return self::SUCCESS;
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
     * @return array<string, mixed>
     */
    protected function loadFallbackDefaults(string $provider): array
    {
        $file = config('provisioning.fallback_file');
        if (!is_string($file) || trim($file) === '' || !is_file($file)) {
            return [];
        }

        $raw = @file_get_contents($file);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        foreach ($decoded as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $entryProvider = Str::lower((string) ($entry['provider'] ?? ''));
            if ($entryProvider !== $provider) {
                continue;
            }

            $enabled = filter_var((string) ($entry['enabled'] ?? true), FILTER_VALIDATE_BOOL);
            if (!$enabled) {
                continue;
            }

            return [
                'node_ref' => $this->normalizeOption($entry['node_ref'] ?? null),
                'template_ref' => $this->normalizeOption($entry['template_ref'] ?? null),
                'config' => is_array($entry['config'] ?? null) ? $entry['config'] : [],
            ];
        }

        return [];
    }
}
