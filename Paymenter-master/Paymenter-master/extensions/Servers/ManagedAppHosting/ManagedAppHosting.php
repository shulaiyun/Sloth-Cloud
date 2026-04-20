<?php

namespace Paymenter\Extensions\Servers\ManagedAppHosting;

use App\Classes\Extension\Server;
use App\Models\Product;
use App\Models\ProvisioningMapping;
use App\Models\Service;
use App\Services\Provisioning\ProvisioningOrchestrator;

class ManagedAppHosting extends Server
{
    public function getConfig($values = []): array
    {
        return [];
    }

    public function getProductConfig($values = []): array
    {
        return [
            [
                'name' => 'runtime_port',
                'type' => 'number',
                'label' => 'Runtime Port',
                'required' => true,
            ],
            [
                'name' => 'persistent_storage_size',
                'type' => 'text',
                'label' => 'Persistent Storage Size',
                'required' => true,
            ],
            [
                'name' => 'replica_limit',
                'type' => 'number',
                'label' => 'Replica Limit',
                'required' => true,
            ],
            [
                'name' => 'domain_limit',
                'type' => 'number',
                'label' => 'Domain Limit',
                'required' => true,
            ],
            [
                'name' => 'env_var_limit',
                'type' => 'number',
                'label' => 'Environment Variable Limit',
                'required' => true,
            ],
            [
                'name' => 'log_retention_days',
                'type' => 'number',
                'label' => 'Log Retention Days',
                'required' => true,
            ],
            [
                'name' => 'allow_scale',
                'type' => 'checkbox',
                'label' => 'Allow scaling',
                'required' => false,
            ],
            [
                'name' => 'workload_mode',
                'type' => 'select',
                'label' => 'Workload Mode',
                'required' => true,
                'options' => [
                    'deployment' => 'Deployment',
                    'statefulset' => 'StatefulSet',
                ],
            ],
            [
                'name' => 'ingress_enabled',
                'type' => 'checkbox',
                'label' => 'Expose via ingress',
                'required' => false,
            ],
            [
                'name' => 'tls_enabled',
                'type' => 'checkbox',
                'label' => 'Enable managed HTTPS',
                'required' => false,
            ],
            [
                'name' => 'build_cpu_limit',
                'type' => 'text',
                'label' => 'Build CPU Limit',
                'required' => false,
            ],
            [
                'name' => 'build_memory_limit',
                'type' => 'text',
                'label' => 'Build Memory Limit',
                'required' => false,
            ],
            [
                'name' => 'runtime_cpu_limit',
                'type' => 'text',
                'label' => 'Runtime CPU Limit',
                'required' => false,
            ],
            [
                'name' => 'runtime_memory_limit',
                'type' => 'text',
                'label' => 'Runtime Memory Limit',
                'required' => false,
            ],
            [
                'name' => 'bandwidth_label',
                'type' => 'text',
                'label' => 'Bandwidth Label',
                'required' => false,
            ],
        ];
    }

    public function getCheckoutConfig(Product $product, $values = [], $settings = []): array
    {
        $runtimePort = (string) ($settings['runtime_port'] ?? '3000');
        $storageSize = (string) ($settings['persistent_storage_size'] ?? '5Gi');
        $replicaLimit = (string) ($settings['replica_limit'] ?? '1');
        $workloadMode = (string) ($settings['workload_mode'] ?? 'deployment');

        return [
            [
                'name' => 'git_repo_url',
                'type' => 'text',
                'label' => 'Public Git Repository URL',
                'required' => true,
                'placeholder' => 'https://github.com/example/app',
                'validation' => ['required', 'url', 'max:2048', 'starts_with:https://,http://', 'not_regex:/@/'],
                'description' => 'Public Git repositories and HTTP/HTTPS source archives are supported in v1. Build and deploy happen inside Sloth Cloud.',
            ],
            [
                'name' => 'git_branch',
                'type' => 'text',
                'label' => 'Git Branch',
                'required' => true,
                'default' => 'main',
                'validation' => ['required', 'string', 'max:255'],
            ],
            [
                'name' => 'git_context_dir',
                'type' => 'text',
                'label' => 'Context Directory',
                'required' => false,
                'placeholder' => '/',
                'validation' => ['nullable', 'string', 'max:255'],
            ],
            [
                'name' => 'dockerfile_path',
                'type' => 'text',
                'label' => 'Dockerfile Path',
                'required' => true,
                'default' => 'Dockerfile',
                'validation' => ['required', 'string', 'max:255'],
            ],
            [
                'name' => 'compose_file_path',
                'type' => 'text',
                'label' => 'Compose File Path (Optional)',
                'required' => false,
                'placeholder' => 'docker-compose.yml',
                'validation' => ['nullable', 'string', 'max:255'],
                'description' => 'When provided, Sloth Cloud parses the compose file and maps the selected service to a managed app runtime.',
            ],
            [
                'name' => 'compose_service_name',
                'type' => 'text',
                'label' => 'Compose Service Name (Optional)',
                'required' => false,
                'placeholder' => 'web',
                'validation' => ['nullable', 'string', 'max:120'],
                'description' => 'Optional service name in the compose file. Leave empty to auto-select the first buildable service.',
            ],
            [
                'name' => 'runtime_port',
                'type' => 'number',
                'label' => 'Runtime Port',
                'required' => true,
                'default' => $runtimePort,
                'validation' => ['required', 'integer', 'min:1', 'max:65535'],
            ],
            [
                'name' => 'domain_limit',
                'type' => 'number',
                'label' => 'Domain Limit',
                'required' => false,
                'default' => (string) ($settings['domain_limit'] ?? '1'),
                'validation' => ['nullable', 'integer', 'min:1', 'max:20'],
            ],
            [
                'name' => 'env_var_limit',
                'type' => 'number',
                'label' => 'Environment Variable Limit',
                'required' => false,
                'default' => (string) ($settings['env_var_limit'] ?? '20'),
                'validation' => ['nullable', 'integer', 'min:1', 'max:200'],
            ],
            [
                'name' => 'log_retention_days',
                'type' => 'number',
                'label' => 'Log Retention Days',
                'required' => false,
                'default' => (string) ($settings['log_retention_days'] ?? '7'),
                'validation' => ['nullable', 'integer', 'min:1', 'max:365'],
            ],
            [
                'name' => 'allow_scale',
                'type' => 'checkbox',
                'label' => 'Allow scaling',
                'required' => false,
                'default' => (bool) ($settings['allow_scale'] ?? false),
            ],
            [
                'name' => 'env_vars',
                'type' => 'text',
                'label' => 'Environment Variables (JSON)',
                'required' => false,
                'placeholder' => '{"APP_ENV":"production"}',
                'validation' => ['nullable', 'string', 'max:4000'],
            ],
            [
                'name' => 'persistent_storage_size',
                'type' => 'text',
                'label' => 'Persistent Storage Size',
                'required' => false,
                'default' => $storageSize,
                'validation' => ['nullable', 'string', 'max:32', 'regex:/^[0-9]+(Mi|Gi)$/i'],
            ],
            [
                'name' => 'replica_limit',
                'type' => 'number',
                'label' => 'Replica Limit',
                'required' => false,
                'default' => $replicaLimit,
                'validation' => ['nullable', 'integer', 'min:1', 'max:10'],
            ],
            [
                'name' => 'workload_mode',
                'type' => 'select',
                'label' => 'Workload Mode',
                'required' => true,
                'default' => $workloadMode,
                'options' => [
                    'deployment' => 'Deployment',
                    'statefulset' => 'StatefulSet',
                ],
                'validation' => ['required', 'in:deployment,statefulset'],
            ],
        ];
    }

    public function testConfig(): bool|string
    {
        return true;
    }

    public function terminateServer(Service $service, $settings, $properties): array
    {
        $orchestrator = app(ProvisioningOrchestrator::class);
        $provider = $orchestrator->providerForService($service);

        if ($provider !== ProvisioningMapping::PROVIDER_MANAGED_APP) {
            return [
                'success' => false,
                'message' => 'Service is not mapped to the managed-app runtime provider.',
            ];
        }

        $result = $orchestrator->deprovisionManagedApp($service, [
            'trigger' => 'server-extension.terminate',
            'source' => 'paymenter.extension',
            'max_attempts' => max((int) config('provisioning.max_attempts', 3), 1),
        ]);

        return [
            'success' => true,
            'status' => data_get($result, 'runtime.status', 'deleting'),
            'message' => (string) (data_get($result, 'message') ?: 'Managed App deletion submitted.'),
            'runtime' => data_get($result, 'runtime'),
            'properties' => data_get($result, 'properties'),
        ];
    }
}
