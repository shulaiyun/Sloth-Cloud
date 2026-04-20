<?php

return [
    'supported_os' => [
        'Ubuntu 20.04',
        'Ubuntu 22.04',
        'Ubuntu 24.04',
        'Debian 11',
        'Debian 12',
        'CentOS 7.9',
        'AlmaLinux 8',
        'AlmaLinux 9',
        'RockyLinux 8',
        'RockyLinux 9',
    ],
    'recipe_seed_os' => [
        'Ubuntu 22.04',
        'Ubuntu 24.04',
        'Debian 12',
    ],
    'queue' => [
        'retry_delay_seconds' => (int) env('VPS_APP_INSTALL_RETRY_DELAY_SECONDS', 60),
        'max_attempts' => (int) env('VPS_APP_INSTALL_MAX_ATTEMPTS', 8),
        'log_line_limit' => (int) env('VPS_APP_INSTALL_LOG_LINE_LIMIT', 200),
        'checkout_initial_delay_seconds' => (int) env('VPS_APP_INSTALL_CHECKOUT_INITIAL_DELAY_SECONDS', 150),
        'reinstall_initial_delay_seconds' => (int) env('VPS_APP_INSTALL_REINSTALL_INITIAL_DELAY_SECONDS', 120),
    ],
    'ssh' => [
        'port' => (int) env('VPS_APP_INSTALL_SSH_PORT', 22),
        'timeout_seconds' => (int) env('VPS_APP_INSTALL_SSH_TIMEOUT_SECONDS', 45),
    ],
];
