<?php

declare(strict_types=1);

/**
 * Compatibility entrypoint for providers that require fixed callback paths
 * like /example/notify.php.
 */
error_log('[Epay entry notify] ' . json_encode([
    'method' => $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN',
    'uri' => $_SERVER['REQUEST_URI'] ?? '',
    'query' => $_GET ?? [],
    'post' => array_diff_key($_POST ?? [], ['sign' => true]),
], JSON_UNESCAPED_UNICODE));

require __DIR__ . '/../index.php';
