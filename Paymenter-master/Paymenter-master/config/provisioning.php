<?php

$defaultFallbackFile = dirname(base_path(), 2)
    .DIRECTORY_SEPARATOR.'runtime'
    .DIRECTORY_SEPARATOR.'data'
    .DIRECTORY_SEPARATOR.'provisioning'
    .DIRECTORY_SEPARATOR.'mappings.json';

return [
    /*
    |--------------------------------------------------------------------------
    | Provisioning Runtime Controls
    |--------------------------------------------------------------------------
    */
    'enabled' => env('PROVISIONING_ENABLED', false),
    'max_attempts' => (int) env('PROVISIONING_MAX_ATTEMPTS', 3),
    'retry_base_ms' => (int) env('PROVISIONING_RETRY_BASE_MS', 30_000),
    'retry_max_ms' => (int) env('PROVISIONING_RETRY_MAX_MS', 300_000),
    'lock_ttl_ms' => (int) env('PROVISIONING_LOCK_TTL_MS', 120_000),
    'providers' => array_values(array_filter(array_map(
        static fn (string $entry): string => trim($entry),
        explode(',', (string) env('PROVISIONING_PROVIDERS', 'convoy,managed-app'))
    ))),

    /*
    |--------------------------------------------------------------------------
    | Mapping Fallback
    |--------------------------------------------------------------------------
    | Database mappings are primary. This list/file is fallback only.
    */
    'fallback_file' => env('PROVISIONING_MAPPING_FILE', $defaultFallbackFile),
    'fallback_mappings' => [],

    /*
    |--------------------------------------------------------------------------
    | Runtime Metadata Keys
    |--------------------------------------------------------------------------
    | Keys persisted in service properties for runtime abstraction.
    */
    'runtime' => [
        'kind_key' => 'runtime_kind',
        'kinds' => [
            'vps' => 'vps',
            'managed_app' => 'managed-app',
        ],
        'managed_app_property_keys' => [
            'runtime_ref',
            'k8s_cluster_ref',
            'k8s_namespace',
            'k8s_workload',
            'k8s_service',
            'k8s_ingress_url',
            'app_status',
            'app_endpoint',
            'app_last_deploy_at',
            'app_domain',
            'app_tls_status',
            'app_replicas',
            'app_env_vars',
            'app_image_ref',
        ],
    ],

    'managed_app' => [
        'internal_api_url' => env('MANAGED_APP_INTERNAL_API_URL', 'http://sloth-cloud-api:4000'),
        'internal_api_token' => env('MANAGED_APP_INTERNAL_API_TOKEN'),
        'timeout_seconds' => (int) env('MANAGED_APP_INTERNAL_API_TIMEOUT', 30),
    ],
];
