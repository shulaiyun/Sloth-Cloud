<?php

namespace App\Services\Provisioning;

use Illuminate\Support\Facades\Log;

class ProvisioningFallbackMappingLoader
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function load(string $provider = 'convoy'): array
    {
        $mappings = [];

        $inline = config('provisioning.fallback_mappings', []);
        if (is_array($inline)) {
            $mappings = array_merge($mappings, $inline);
        }

        $filePath = config('provisioning.fallback_file');
        if (is_string($filePath) && $filePath !== '' && is_file($filePath)) {
            $json = @file_get_contents($filePath);
            if ($json !== false && trim($json) !== '') {
                $decoded = json_decode($json, true);
                if (is_array($decoded)) {
                    $mappings = array_merge($mappings, $decoded);
                } else {
                    Log::warning('Provisioning fallback mapping file is not valid JSON array', [
                        'provider' => $provider,
                        'path' => $filePath,
                    ]);
                }
            }
        }

        $normalized = [];
        foreach ($mappings as $index => $mapping) {
            if (!is_array($mapping)) {
                continue;
            }

            $normalizedMapping = $this->normalize($mapping, $provider, (int) $index);
            if (!$normalizedMapping['enabled']) {
                continue;
            }

            if ($normalizedMapping['provider'] !== $provider) {
                continue;
            }

            $normalized[] = $normalizedMapping;
        }

        usort($normalized, function (array $left, array $right): int {
            $priorityCompare = ($left['priority'] ?? 100) <=> ($right['priority'] ?? 100);
            if ($priorityCompare !== 0) {
                return $priorityCompare;
            }

            return ($left['_source_index'] ?? 0) <=> ($right['_source_index'] ?? 0);
        });

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $mapping
     * @return array<string, mixed>
     */
    protected function normalize(array $mapping, string $provider, int $index): array
    {
        $config = $mapping['config'] ?? [];
        if (!is_array($config)) {
            $config = [];
        }

        $normalizedProvider = $mapping['provider'] ?? $provider;
        $normalizedProvider = is_string($normalizedProvider) && trim($normalizedProvider) !== ''
            ? strtolower(trim($normalizedProvider))
            : $provider;

        return [
            'provider' => $normalizedProvider,
            'product_id' => $this->toNullableInt($mapping['product_id'] ?? null),
            'product_slug' => $this->toNullableString($mapping['product_slug'] ?? null),
            'plan_id' => $this->toNullableInt($mapping['plan_id'] ?? null),
            'plan_name' => $this->toNullableString($mapping['plan_name'] ?? null),
            'template_ref' => $this->toNullableString($mapping['template_ref'] ?? null),
            'node_ref' => $this->toNullableString($mapping['node_ref'] ?? null),
            'config' => $config,
            'priority' => max((int) ($mapping['priority'] ?? 100), 0),
            'enabled' => filter_var((string) ($mapping['enabled'] ?? true), FILTER_VALIDATE_BOOL),
            '_source_index' => $index,
        ];
    }

    protected function toNullableString(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    protected function toNullableInt(mixed $value): ?int
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

