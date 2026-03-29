<?php

namespace Paymenter\Extensions\Gateways\Epay\Support;

class Signer
{
    public static function build(array $params, string $appKey): string
    {
        return md5(static::buildSigningString($params, $appKey));
    }

    public static function verify(array $params, string $appKey, string $incomingSignature): bool
    {
        return strcasecmp(static::build($params, $appKey), trim($incomingSignature)) === 0;
    }

    public static function buildSigningString(array $params, string $appKey): string
    {
        $params = static::filterSignable($params);
        ksort($params);

        $pairs = [];
        foreach ($params as $key => $value) {
            $pairs[] = $key . '=' . $value;
        }

        return implode('&', $pairs) . $appKey;
    }

    public static function filterSignable(array $params): array
    {
        $filtered = [];

        foreach ($params as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (in_array($normalizedKey, ['sign', 'sign_type', 'signature', 'key'], true)) {
                continue;
            }

            if ($value === null || $value === '') {
                continue;
            }

            if (is_bool($value)) {
                $value = $value ? '1' : '0';
            }

            if (is_array($value)) {
                continue;
            }

            $filtered[(string) $key] = trim((string) $value);
        }

        return $filtered;
    }
}
