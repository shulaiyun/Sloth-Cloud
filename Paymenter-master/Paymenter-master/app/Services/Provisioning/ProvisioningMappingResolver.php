<?php

namespace App\Services\Provisioning;

use App\Models\ProvisioningMapping;
use App\Models\Service;
use Illuminate\Support\Str;

class ProvisioningMappingResolver
{
    public function resolve(Service $service, string $provider = 'convoy'): ?ProvisioningMapping
    {
        $service->loadMissing(['product', 'plan']);

        $mappings = ProvisioningMapping::query()
            ->active()
            ->where('provider', $provider)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        /** @var ProvisioningMapping|null $winner */
        $winner = null;
        $winnerScore = -1;

        foreach ($mappings as $mapping) {
            $score = $this->scoreMapping($service, $mapping);
            if ($score < 0) {
                continue;
            }

            if ($score > $winnerScore) {
                $winner = $mapping;
                $winnerScore = $score;
            }
        }

        return $winner;
    }

    /**
     * @return array<string, mixed>
     */
    public function buildPropertyOverrides(Service $service, ProvisioningMapping $mapping): array
    {
        $rawConfig = $mapping->config ?? [];
        $config = is_array($rawConfig) ? $rawConfig : [];
        $properties = is_array($config['properties'] ?? null) ? $config['properties'] : [];

        if ($mapping->node_ref) {
            $properties['node'] = $mapping->node_ref;
        }

        if ($mapping->template_ref) {
            $properties['os'] = $mapping->template_ref;
        }

        $directKeys = [
            'cpu',
            'ram',
            'disk',
            'bandwidth',
            'snapshot',
            'backups',
            'ipv4',
            'ipv6',
            'start_on_create',
            'hostname',
        ];

        foreach ($directKeys as $key) {
            if (!array_key_exists($key, $config)) {
                continue;
            }

            $properties[$key] = $config[$key];
        }

        if (!isset($properties['hostname']) || !is_string($properties['hostname']) || trim($properties['hostname']) === '') {
            $properties['hostname'] = $this->defaultHostname($service);
        }

        return $properties;
    }

    protected function scoreMapping(Service $service, ProvisioningMapping $mapping): int
    {
        $score = 0;

        if ($mapping->product_id !== null) {
            if ((int) $mapping->product_id !== (int) $service->product_id) {
                return -1;
            }
            $score += 8;
        }

        if ($mapping->product_slug) {
            $serviceSlug = mb_strtolower((string) ($service->product?->slug ?? ''));
            $mappingSlug = mb_strtolower((string) $mapping->product_slug);
            if ($serviceSlug !== $mappingSlug) {
                return -1;
            }
            $score += 4;
        }

        if ($mapping->plan_id !== null) {
            if ((int) $mapping->plan_id !== (int) $service->plan_id) {
                return -1;
            }
            $score += 8;
        }

        if ($mapping->plan_name) {
            $servicePlanName = (string) Str::of((string) ($service->plan?->name ?? ''))->lower()->slug('-');
            $mappingPlanName = (string) Str::of((string) $mapping->plan_name)->lower()->slug('-');
            if ($servicePlanName !== $mappingPlanName) {
                return -1;
            }
            $score += 3;
        }

        return $score;
    }

    protected function defaultHostname(Service $service): string
    {
        $base = Str::of((string) ($service->label ?? $service->baseLabel ?? 'service'))
            ->lower()
            ->slug('-')
            ->trim('-')
            ->substr(0, 24)
            ->value();

        if ($base === '') {
            $base = 'service';
        }

        return sprintf('%s-%d.sloth.local', $base, $service->id);
    }
}
