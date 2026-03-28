<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;

class SetLocale
{
    public function handle(Request $request, Closure $next)
    {
        $availableLocales = array_keys(config('app.available_locales', []));
        $locale = session('locale', config('settings.app_language', config('app.locale')));

        if (!is_string($locale) || !in_array($locale, $availableLocales, true)) {
            $locale = config('app.locale');
        }

        $runtimeLocale = match ($locale) {
            'zh', 'zh-CN', 'zh_CN' => 'zh_CN',
            'zh-TW', 'zh_TW' => 'zh_TW',
            default => $locale,
        };

        App::setLocale($runtimeLocale);

        $fallbackLocale = config('app.fallback_locale', 'en');

        if ($runtimeLocale === 'zh_CN') {
            $fallbackLocale = 'zh';
        } elseif ($runtimeLocale === 'zh_TW') {
            // Keep Traditional as first choice, but gracefully fall back to Simplified
            // if a key only exists in lang/zh.
            $fallbackLocale = 'zh';
        }

        App::setFallbackLocale($fallbackLocale);
        session(['locale' => $locale]);

        return $next($request);
    }
}
