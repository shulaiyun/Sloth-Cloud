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

            $appUrl = self::resolvePublicAppUrl();
            config(['app.url' => $appUrl]);

            if (Str::startsWith($appUrl, 'https://')) {
                URL::forceScheme('https');
            }
            URL::forceRootUrl($appUrl);

            Config::set('filesystems.disks.public.url', $appUrl . '/storage');
        } catch (Exception $e) {
            // Do nothing
        }
    }

    private static function resolvePublicAppUrl(): string
    {
        $configured = (string) (config('settings.app_url') ?: config('app.url') ?: '');
        $configured = trim($configured);

        if ($configured === '') {
            $configured = 'http://localhost';
        }

        // If an old setup still has localhost in settings but the request comes from a real host
        // (e.g. behind Nginx Proxy Manager), use the incoming host to avoid localhost redirects.
        if (!app()->runningInConsole() && request()) {
            $request = request();
            $forwardedHost = (string) ($request->headers->get('x-forwarded-host') ?: '');
            $requestHost = trim(explode(',', $forwardedHost !== '' ? $forwardedHost : (string) $request->getHost())[0] ?? '');

            if ($requestHost !== '') {
                $forwardedProto = (string) ($request->headers->get('x-forwarded-proto') ?: '');
                $requestScheme = trim(explode(',', $forwardedProto !== '' ? $forwardedProto : $request->getScheme())[0] ?? '');
                $requestScheme = in_array($requestScheme, ['http', 'https'], true) ? $requestScheme : 'http';
                $requestRoot = $requestScheme . '://' . $requestHost;
                $configuredHost = (string) parse_url($configured, PHP_URL_HOST);
                $isConfiguredLocal = in_array($configuredHost, ['localhost', '127.0.0.1', '::1'], true);
                $isRequestLocal = in_array($requestHost, ['localhost', '127.0.0.1', '::1'], true);

                if ($isConfiguredLocal && !$isRequestLocal) {
                    return $requestRoot;
                }
            }
        }

        return $configured;
    }

    public static function flushCache()
    {
        Cache::forget('settings');
        // Restart queue worker
        Artisan::call('queue:restart');
        self::getSettings(true);
    }
}
