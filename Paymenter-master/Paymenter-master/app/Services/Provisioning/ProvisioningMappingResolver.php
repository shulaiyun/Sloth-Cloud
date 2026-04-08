<?php

namespace App\Services\Provisioning;

use App\Models\ProvisioningMapping;
use App\Models\Service;
use Illuminate\Support\Str;

class ProvisioningMappingResolver
{
    public function __construct(
        protected ProvisioningFallbackMappingLoader $fallbackMappingLoader
    ) {}

    public function resolve(Service $service, string $provider = 'convoy'): ?ProvisioningMapping
    {
        $service->loadMissing(['product', 'plan']);

        $dbMappings = ProvisioningMapping::query()
            ->active()
            ->where('provider', $provider)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        /** @var ProvisioningMapping|null $winner */
        $winner = null;
        $winnerScore = -1;

        foreach ($dbMappings as $mapping) {
            $score = $this->scoreMapping($service, $mapping);
            if ($score < 0) {
                continue;
            }

            if ($score > $winnerScore) {
                $winner = $mapping;
                $winnerScore = $score;
            }
        }

        if ($winner) {
            $winner->setAttribute('_source', 'database');

            return $winner;
        }

        $fallbackMappings = $this->fallbackMappingLoader->load($provider);
        foreach ($fallbackMappings as $entry) {
            $mapping = new ProvisioningMapping([
                'provider' => $provider,
                'product_id' => $entry['product_id'] ?? null,
                'product_slug' => $entry['product_slug'] ?? null,
                'plan_id' => $entry['plan_id'] ?? null,
                'plan_name' => $entry['plan_name'] ?? null,
                'template_ref' => $entry['template_ref'] ?? null,
                'node_ref' => $entry['node_ref'] ?? null,
                'config' => $entry['config'] ?? [],
                'priority' => $entry['priority'] ?? 100,
                'enabled' => true,
            ]);
            $mapping->exists = false;

            $score = $this->scoreMapping($service, $mapping);
            if ($score < 0) {
                continue;
            }

            if ($score > $winnerScore) {
                $winner = $mapping;
                $winnerScore = $score;
            }
        }

        if ($winner) {
            $winner->setAttribute('_source', 'config');
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

        if ($mapping->provider === ProvisioningMapping::PROVIDER_MANAGED_APP) {
            $properties['runtime_kind'] = 'managed-app';

            if (is_string($config['cluster_ref'] ?? null) && trim((string) $config['cluster_ref']) !== '') {
                $properties['k8s_cluster_ref'] = trim((string) $config['cluster_ref']);
            }

            if (is_string($config['default_domain_suffix'] ?? null) && trim((string) $config['default_domain_suffix']) !== '') {
                $properties['managed_app_domain_suffix'] = trim((string) $config['default_domain_suffix']);
            }

            if (is_string($config['build_namespace'] ?? null) && trim((string) $config['build_namespace']) !== '') {
                $properties['managed_app_build_namespace'] = trim((string) $config['build_namespace']);
            }

            return $properties;
        }

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
                $productIdMatches = $mapping->product_id !== null
                    && (int) $mapping->product_id === (int) $service->product_id;
                if (!$productIdMatches) {
                    return -1;
                }
            } else {
                $score += 4;
            }
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
                $planIdMatches = $mapping->plan_id !== null
                    && (int) $mapping->plan_id === (int) $service->plan_id;
                if (!$planIdMatches) {
                    return -1;
                }
            } else {
                $score += 3;
            }
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

    public function mappingSource(?ProvisioningMapping $mapping): string
    {
        if (!$mapping) {
            return 'none';
        }

        $source = $mapping->getAttribute('_source');
        if (is_string($source) && $source !== '') {
            return $source;
        }

        return $mapping->exists ? 'database' : 'config';
    }
}
