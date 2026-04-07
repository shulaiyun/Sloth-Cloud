<?php

namespace Paymenter\Extensions\Servers\ManagedAppHosting;

use App\Classes\Extension\Server;
use App\Models\Product;

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
                'validation' => ['required', 'url', 'max:2048', 'starts_with:https://', 'not_regex:/@/'],
                'description' => 'Only public repositories are supported in v1. Build and deploy happen inside Sloth Cloud.',
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
                'name' => 'initial_domain',
                'type' => 'text',
                'label' => 'Initial Domain',
                'required' => false,
                'placeholder' => 'app.example.com',
                'validation' => ['nullable', 'string', 'max:255'],
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
}
