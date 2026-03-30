<?php

declare(strict_types=1);

/**
 * Compatibility entrypoint for providers that require fixed callback paths
 * like /example/return.php.
 */
error_log('[Epay entry return] ' . json_encode([
    'method' => $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN',
    'uri' => $_SERVER['REQUEST_URI'] ?? '',
    'query' => array_diff_key($_GET ?? [], ['sign' => true]),
], JSON_UNESCAPED_UNICODE));

require __DIR__ . '/../index.php';
