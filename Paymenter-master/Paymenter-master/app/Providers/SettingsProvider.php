<?php

namespace App\Providers;

use App\Classes\Settings;
use App\Models\Setting;
use Exception;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Qirolab\Theme\Theme;

class SettingsProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void {}

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        $this->getSettings();
    }

    public static function getSettings($force = false): void
    {
        if (config('settings') && !empty(config('settings')) && !$force) {
            return;
        }

        try {
            // Load settings from cache
            $settings = Cache::get('settings', []);
            if (empty($settings)) {
                $settings = Setting::where('settingable_type', null)->get()->pluck('value', 'key');
                Cache::put('settings', $settings);
            }
            // Is the current command a config:cache command?
            if (isset($_SERVER['argv']) && (in_array('config:cache', $_SERVER['argv']) || in_array('optimize', $_SERVER['argv']) || in_array('app:optimize', $_SERVER['argv']))) {
                return;
            }
            config(['settings' => $settings]);
            foreach (Settings::settings() as $settings) {
                foreach ($settings as $setting) {
                    if (isset($setting['override']) && config("settings.$setting[name]") !== null) {
                        config([$setting['override'] => config("settings.$setting[name]")]);
                    }
                }
            }

            include_once app_path('Classes/helpers.php');

            date_default_timezone_set(config('settings.timezone', 'UTC'));

            Theme::set(active_theme(), 'default');
        } catch (Exception $e) {
            // Do nothing
        }

        try {
            $appUrl = self::resolvePublicAppUrl();
            $effectiveRootUrl = $appUrl;

            if (!app()->runningInConsole()) {
                $requestRootUrl = self::detectRequestRootUrl();
                if (is_string($requestRootUrl) && $requestRootUrl !== '') {
                    // During HTTP requests, always prefer the actual host the client used.
                    // This keeps localhost and LAN access working at the same time.
                    $effectiveRootUrl = $requestRootUrl;
                }
            }

            config(['app.url' => $effectiveRootUrl]);

            if (Str::startsWith($effectiveRootUrl, 'https://')) {
                URL::forceScheme('https');
            }
            URL::forceRootUrl($effectiveRootUrl);

            Config::set('filesystems.disks.public.url', rtrim($effectiveRootUrl, '/') . '/storage');
        } catch (Exception $e) {
            // Do nothing
        }
    }

    private static function resolvePublicAppUrl(): string
    {
        $explicitPublicUrl = trim((string) env('SLOTH_PAYMENTER_PUBLIC_URL', ''));
        $configured = trim((string) ($explicitPublicUrl !== '' ? $explicitPublicUrl : (config('settings.app_url') ?: config('app.url') ?: '')));

        if ($configured === '') {
            $configured = 'http://localhost';
        }

        if (!preg_match('#^https?://#i', $configured)) {
            $configured = 'http://' . ltrim($configured, '/');
        }

        $requestRootUrl = self::detectRequestRootUrl();

        if ($requestRootUrl !== null) {
            return $requestRootUrl;
        }

        return $configured;
    }

    private static function detectRequestRootUrl(): ?string
    {
        if (app()->runningInConsole() || !request()) {
            return null;
        }

        $request = request();
        $possibleHosts = collect([
            $request->headers->get('x-forwarded-host'),
            $request->headers->get('x-original-host'),
            $request->headers->get('x-host'),
            $request->server->get('HTTP_HOST'),
            $request->getHost(),
        ])
            ->map(fn ($candidate) => trim(explode(',', (string) ($candidate ?? ''))[0] ?? ''))
            ->filter(fn (string $candidate) => $candidate !== '')
            ->values();

        $host = $possibleHosts
            ->first(fn (string $candidate) => !self::isLocalHost((string) parse_url('http://' . $candidate, PHP_URL_HOST)))
            ?? $possibleHosts->first()
            ?? '';

        if ($host === '') {
            return null;
        }

        $possibleSchemes = [
            $request->headers->get('x-forwarded-proto'),
            $request->getScheme(),
        ];

        $scheme = 'http';
        foreach ($possibleSchemes as $candidate) {
            $candidate = trim(explode(',', (string) ($candidate ?? ''))[0] ?? '');
            if (in_array($candidate, ['http', 'https'], true)) {
                $scheme = $candidate;
                break;
            }
        }

        return $scheme . '://' . $host;
    }

    private static function isLocalHost(string $host): bool
    {
        return in_array(strtolower(trim($host)), ['localhost', '127.0.0.1', '::1'], true);
    }

    public static function flushCache()
    {
        Cache::forget('settings');
        // Restart queue worker
        Artisan::call('queue:restart');
        self::getSettings(true);
    }
}
