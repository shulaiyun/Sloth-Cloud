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

        $products = Product::query()
            ->when(
                Schema::hasColumn('products', 'enabled'),
                fn ($query) => $query->where('enabled', true),
                fn ($query) => Schema::hasColumn('products', 'hidden')
                    ? $query->where('hidden', false)
                    : $query
            )
            ->with(['plans' => fn ($query) => $query->orderBy('sort')->orderBy('id')])
            ->orderBy('id')
            ->get();

        if ($products->isEmpty()) {
            $this->warn('No visible products found.');

            return self::SUCCESS;
        }

        $defaultNode = $this->normalizeOption($this->option('node'));
        $defaultTemplate = $this->normalizeOption($this->option('template'));
        $defaults = [
            'cpu' => (int) $this->option('cpu'),
            'ram' => (int) $this->option('ram'),
            'disk' => (int) $this->option('disk'),
            'bandwidth' => (int) $this->option('bandwidth'),
            'ipv4' => max((int) $this->option('ipv4'), 0),
            'ipv6' => max((int) $this->option('ipv6'), 0),
            'snapshot' => 1,
            'backups' => 1,
            'start_on_create' => filter_var((string) $this->option('start-on-create'), FILTER_VALIDATE_BOOL),
        ];

        $sourceRows = [];
        $upserted = 0;
        $priority = 10;

        foreach ($products as $product) {
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
                    'template_ref' => $defaultTemplate,
                    'node_ref' => $defaultNode,
                    'config' => $defaults,
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
}
