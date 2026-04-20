<?php

namespace App\Services\Provisioning;

use App\Models\ProvisioningMapping;
use App\Models\Service;
use Exception;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class ManagedAppRuntimeClient
{
    /**
     * @param  array<string, mixed>  $productSettings
     * @param  array<string, mixed>  $serviceProperties
     * @return array<string, mixed>
     */
    public function provision(
        Service $service,
        ProvisioningMapping $mapping,
        array $productSettings,
        array $serviceProperties,
        bool $forceReprovision = false,
    ): array {
        return $this->request('/api/internal/managed-app/provision', [
            'service' => $this->serializeService($service),
            'mapping' => $this->serializeMapping($mapping),
            'product_settings' => $productSettings,
            'service_properties' => $serviceProperties,
            'force_reprovision' => $forceReprovision,
        ]);
    }

    /**
     * @param  array<string, mixed>  $productSettings
     * @param  array<string, mixed>  $serviceProperties
     * @return array<string, mixed>
     */
    public function reconcile(
        Service $service,
        ProvisioningMapping $mapping,
        array $productSettings,
        array $serviceProperties,
    ): array {
        return $this->request('/api/internal/managed-app/reconcile', [
            'service' => $this->serializeService($service),
            'mapping' => $this->serializeMapping($mapping),
            'product_settings' => $productSettings,
            'service_properties' => $serviceProperties,
        ]);
    }

    /**
     * @param  array<string, mixed>  $productSettings
     * @param  array<string, mixed>  $serviceProperties
     * @return array<string, mixed>
     */
    public function deprovision(
        Service $service,
        ProvisioningMapping $mapping,
        array $productSettings,
        array $serviceProperties,
    ): array {
        return $this->request('/api/internal/managed-app/deprovision', [
            'service' => $this->serializeService($service),
            'mapping' => $this->serializeMapping($mapping),
            'product_settings' => $productSettings,
            'service_properties' => $serviceProperties,
        ]);
    }

    protected function client(): PendingRequest
    {
        $baseUrl = rtrim((string) config('provisioning.managed_app.internal_api_url', ''), '/');
        $token = trim((string) config('provisioning.managed_app.internal_api_token', ''));

        if ($baseUrl === '') {
            throw new Exception('Managed App internal API URL is missing.');
        }

        if ($token === '') {
            throw new Exception('Managed App internal API token is missing.');
        }

        $request = Http::acceptJson()
            ->contentType('application/json')
            ->baseUrl($baseUrl)
            ->withToken($token)
            ->timeout((int) config('provisioning.managed_app.timeout_seconds', 30));

        $host = strtolower((string) parse_url($baseUrl, PHP_URL_HOST));
        if ($this->shouldBypassProxy($host)) {
            $request = $request->withOptions([
                'proxy' => [
                    'no' => [$host],
                ],
                'curl' => [
                    CURLOPT_NOPROXY => $host,
                ],
            ]);
        }

        return $request;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function request(string $path, array $payload): array
    {
        $response = $this->client()->post($path, $payload);

        if (!$response->successful()) {
            $body = $response->json();
            $message = is_array($body) && isset($body['message']) && is_string($body['message'])
                ? $body['message']
                : ('Managed App internal API failed with status '.$response->status().'.');

            throw new Exception($message);
        }

        $json = $response->json();

        return is_array($json) ? $json : [];
    }

    protected function shouldBypassProxy(string $host): bool
    {
        if ($host === '') {
            return false;
        }

        if (str_starts_with($host, 'sloth-') || !str_contains($host, '.')) {
            return true;
        }

        $noProxy = array_merge(
            explode(',', (string) env('NO_PROXY', '')),
            explode(',', (string) env('no_proxy', ''))
        );

        foreach ($noProxy as $candidate) {
            $candidate = strtolower(trim($candidate));
            if ($candidate === '') {
                continue;
            }

            if ($host === $candidate) {
                return true;
            }

            if (str_starts_with($candidate, '.') && str_ends_with($host, $candidate)) {
                return true;
            }
        }

        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeService(Service $service): array
    {
        $service->loadMissing(['product.category', 'plan', 'user']);

        return [
            'id' => (string) $service->id,
            'label' => (string) $service->label,
            'base_label' => (string) $service->baseLabel,
            'status' => (string) $service->status,
            'product' => [
                'id' => (string) $service->product_id,
                'slug' => (string) ($service->product?->slug ?? ''),
                'name' => (string) ($service->product?->name ?? ''),
                'category_slug' => (string) ($service->product?->category?->slug ?? ''),
            ],
            'plan' => [
                'id' => (string) $service->plan_id,
                'name' => (string) ($service->plan?->name ?? ''),
                'billing_period' => $service->plan?->billing_period,
                'billing_unit' => (string) ($service->plan?->billing_unit ?? ''),
            ],
            'user' => [
                'id' => (string) $service->user_id,
                'name' => (string) ($service->user?->name ?? ''),
                'email' => (string) ($service->user?->email ?? ''),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeMapping(ProvisioningMapping $mapping): array
    {
        return [
            'id' => $mapping->id ? (string) $mapping->id : null,
            'provider' => (string) $mapping->provider,
            'product_id' => $mapping->product_id ? (string) $mapping->product_id : null,
            'product_slug' => $mapping->product_slug,
            'plan_id' => $mapping->plan_id ? (string) $mapping->plan_id : null,
            'plan_name' => $mapping->plan_name,
            'config' => is_array($mapping->config) ? $mapping->config : [],
        ];
    }
}
