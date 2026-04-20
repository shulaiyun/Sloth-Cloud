<?php

namespace App\Console\Commands;

use App\Models\Extension;
use App\Models\Gateway;
use App\Models\Setting;
use Illuminate\Console\Command;

class ConfigureEpayGateway extends Command
{
    protected $signature = 'app:gateway:configure-epay
        {--callback-base-url= : Public billing URL for notify callback base}
        {--frontend-return-url= : Public frontend invoice URL template, e.g. https://app.example.com/invoices/{number}}
        {--allow-private : Allow localhost/private hosts (not recommended)}
        {--dry-run : Preview changes without writing data}';

    protected $description = 'Configure Epay callback/return URLs with safe public defaults';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $allowPrivate = (bool) $this->option('allow-private');

        $gateway = Gateway::query()
            ->whereRaw('LOWER(extension) = ?', ['epay'])
            ->first();

        if (!$gateway) {
            $this->error('Epay gateway extension is not installed.');

            return self::FAILURE;
        }

        $callbackBaseUrl = $this->resolveCallbackBaseUrl();
        $frontendReturnUrl = $this->resolveFrontendReturnUrl();

        if ($callbackBaseUrl === null) {
            $this->error('Cannot resolve callback_base_url. Provide --callback-base-url or set APP_URL.');

            return self::FAILURE;
        }

        if ($frontendReturnUrl === null) {
            $this->error('Cannot resolve frontend_return_url. Provide --frontend-return-url or set SLOTH_FRONTEND_URL.');

            return self::FAILURE;
        }

        if (!$allowPrivate) {
            if (!$this->isPublicUrl($callbackBaseUrl)) {
                $this->error("callback_base_url is not a public URL: {$callbackBaseUrl}");

                return self::FAILURE;
            }

            if (!$this->isPublicUrl($frontendReturnUrl)) {
                $this->error("frontend_return_url is not a public URL: {$frontendReturnUrl}");

                return self::FAILURE;
            }
        }

        if ($dryRun) {
            $this->line(sprintf('[dry-run] callback_base_url=%s', $callbackBaseUrl));
            $this->line(sprintf('[dry-run] frontend_return_url=%s', $frontendReturnUrl));

            return self::SUCCESS;
        }

        $this->syncSetting($gateway, 'callback_base_url', $callbackBaseUrl, 'string');
        $this->syncSetting($gateway, 'frontend_return_url', $frontendReturnUrl, 'string');
        $this->syncSetting($gateway, 'allow_private_return_urls', $allowPrivate ? '1' : '0', 'boolean');

        $this->info('Epay gateway URLs updated.');
        $this->line(sprintf('callback_base_url: %s', $callbackBaseUrl));
        $this->line(sprintf('frontend_return_url: %s', $frontendReturnUrl));
        $this->line(sprintf('allow_private_return_urls: %s', $allowPrivate ? 'true' : 'false'));

        return self::SUCCESS;
    }

    protected function resolveCallbackBaseUrl(): ?string
    {
        $input = trim((string) $this->option('callback-base-url'));
        if ($input === '') {
            $input = trim((string) env('SLOTH_PAYMENTER_PUBLIC_URL', env('APP_URL', '')));
        }

        if ($input === '') {
            return null;
        }

        $parts = parse_url($input);
        if (!is_array($parts)) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        return $scheme . '://' . $host . $port;
    }

    protected function resolveFrontendReturnUrl(): ?string
    {
        $input = trim((string) $this->option('frontend-return-url'));
        if ($input === '') {
            $frontendBase = trim((string) env('SLOTH_FRONTEND_URL', ''));
            if ($frontendBase === '') {
                $frontendBase = trim((string) env('SLOTH_WEB_PUBLIC_URL', ''));
            }
            if ($frontendBase === '') {
                $frontendBase = trim((string) env('APP_URL', ''));
            }

            if ($frontendBase === '') {
                return null;
            }

            $input = rtrim($frontendBase, '/') . '/invoices/{number}';
        }

        return $input === '' ? null : $input;
    }

    protected function isPublicUrl(string $url): bool
    {
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
            return false;
        }

        if (
            $host === 'localhost'
            || $host === '127.0.0.1'
            || $host === '::1'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.local')
        ) {
            return false;
        }

        if (!str_contains($host, '.') && filter_var($host, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            $isPublicIp = filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false;

            if (!$isPublicIp) {
                return false;
            }
        }

        return true;
    }

    protected function syncSetting(Gateway $gateway, string $key, string $value, string $type): void
    {
        foreach ([$gateway->getMorphClass(), Extension::class] as $morphType) {
            Setting::query()->updateOrCreate(
                [
                    'settingable_type' => $morphType,
                    'settingable_id' => $gateway->getKey(),
                    'key' => $key,
                ],
                [
                    'value' => $value,
                    'type' => $type,
                    'encrypted' => false,
                ]
            );
        }
    }
}
