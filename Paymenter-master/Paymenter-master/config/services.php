<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'provisioning' => [
        'enabled' => env('PROVISIONING_ENABLED', false),
        'max_attempts' => env('PROVISIONING_MAX_ATTEMPTS', 3),
        'retry_base_ms' => env('PROVISIONING_RETRY_BASE_MS', 30000),
        'retry_max_ms' => env('PROVISIONING_RETRY_MAX_MS', 300000),
        'lock_ttl_ms' => env('PROVISIONING_LOCK_TTL_MS', 120000),
    ],

];
