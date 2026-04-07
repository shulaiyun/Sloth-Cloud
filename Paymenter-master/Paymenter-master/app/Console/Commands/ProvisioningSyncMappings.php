<?php

namespace App\Console\Commands;

use App\Models\ProvisioningMapping;
use App\Services\Provisioning\ProvisioningFallbackMappingLoader;
use Illuminate\Console\Command;

class ProvisioningSyncMappings extends Command
{
    protected $signature = 'app:provisioning:mappings:sync
        {--provider=convoy : Provisioning provider}
        {--dry-run : Preview changes only}
        {--prune-missing : Disable mappings that are not present in fallback source}
        {--enqueue-services : After sync, enqueue matching services that still miss mapping}';

    protected $description = 'Sync provisioning fallback mappings into database mappings';

    public function handle(ProvisioningFallbackMappingLoader $loader): int
    {
        $provider = (string) $this->option('provider');
        $dryRun = (bool) $this->option('dry-run');
        $pruneMissing = (bool) $this->option('prune-missing');
        $enqueueServices = (bool) $this->option('enqueue-services');

        $sourceMappings = $loader->load($provider);
        if ($sourceMappings === []) {
            $this->warn("No fallback mappings found for provider [{$provider}].");

            return self::SUCCESS;
        }

        $synced = 0;
        $sourceKeys = collect();
        foreach ($sourceMappings as $row) {
            $identity = $this->identity($provider, $row);
            $sourceKeys->push($this->identityKey($identity));

            if ($dryRun) {
                $this->line('[dry-run] '.json_encode([
                    'identity' => $identity,
                    'payload' => $this->payload($provider, $row),
                ], JSON_UNESCAPED_UNICODE));
                continue;
            }

            ProvisioningMapping::query()->updateOrCreate(
                $identity,
                $this->payload($provider, $row),
            );

            $synced++;
        }

        $pruned = 0;
        if ($pruneMissing && !$dryRun) {
            $existing = ProvisioningMapping::query()
                ->where('provider', $provider)
                ->get();

            foreach ($existing as $mapping) {
                $key = $this->identityKey([
                    'provider' => $provider,
                    'product_id' => $mapping->product_id,
                    'product_slug' => $mapping->product_slug,
                    'plan_id' => $mapping->plan_id,
                    'plan_name' => $mapping->plan_name,
                ]);

                if ($sourceKeys->contains($key)) {
                    continue;
                }

                $mapping->enabled = false;
                $mapping->save();
                $pruned++;
            }
        }

        $this->info(sprintf(
            'Provisioning mappings synced. provider=%s synced=%d source=%d pruned=%d dry_run=%s',
            $provider,
            $synced,
            count($sourceMappings),
            $pruned,
            $dryRun ? 'yes' : 'no',
        ));

        if ($enqueueServices && !$dryRun) {
            $this->line('');
            $this->info('Enqueueing services after mapping sync...');
            $this->call('app:provisioning:enqueue-services', [
                '--provider' => $provider,
            ]);
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    protected function identity(string $provider, array $row): array
    {
        return [
            'provider' => $provider,
            'product_id' => $this->nullableInt($row['product_id'] ?? null),
            'product_slug' => $this->nullableString($row['product_slug'] ?? null),
            'plan_id' => $this->nullableInt($row['plan_id'] ?? null),
            'plan_name' => $this->nullableString($row['plan_name'] ?? null),
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    protected function payload(string $provider, array $row): array
    {
        $config = $row['config'] ?? [];
        if (!is_array($config)) {
            $config = [];
        }

        return [
            'provider' => $provider,
            'template_ref' => $this->nullableString($row['template_ref'] ?? null),
            'node_ref' => $this->nullableString($row['node_ref'] ?? null),
            'config' => $config,
            'priority' => max((int) ($row['priority'] ?? 100), 0),
            'enabled' => (bool) ($row['enabled'] ?? true),
        ];
    }

    /**
     * @param  array<string, mixed>  $identity
     */
    protected function identityKey(array $identity): string
    {
        return implode('|', [
            (string) ($identity['provider'] ?? ''),
            (string) ($identity['product_id'] ?? ''),
            (string) ($identity['product_slug'] ?? ''),
            (string) ($identity['plan_id'] ?? ''),
            (string) ($identity['plan_name'] ?? ''),
        ]);
    }

    protected function nullableString(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    protected function nullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        return null;
    }
}
