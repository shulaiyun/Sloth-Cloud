<?php

use App\Helpers\EventHelper;
use Illuminate\Config\Repository;

if (!function_exists('active_theme')) {
    /**
     * Resolve the active theme and always fall back to the bundled default theme.
     */
    function active_theme(): string
    {
        $theme = config('settings.theme');

        if (!is_string($theme)) {
            return 'default';
        }

        $theme = trim($theme);

        return $theme !== '' ? $theme : 'default';
    }
}

if (!function_exists('theme_build_directory')) {
    /**
     * Resolve the Vite build directory that actually exists on disk.
     */
    function theme_build_directory(): string
    {
        $activeTheme = active_theme();
        $candidates = array_unique([
            $activeTheme,
            'default',
            'build',
        ]);

        foreach ($candidates as $candidate) {
            if (file_exists(public_path($candidate . '/manifest.json'))) {
                return $candidate;
            }
        }

        return 'build';
    }
}

if (!function_exists('theme')) {
    /**
     * Get the specified configuration value.
     *
     * If an array is passed as the key, we will assume you want to set an array of values.
     *
     * @param  array|string  $key
     * @param  mixed  $default
     * @return mixed|Repository
     */
    function theme($key, $default = null)
    {
        $current_theme = active_theme();

        return config("settings.theme_$current_theme" . "_$key", $default) ?? $default;
    }
}

if (!function_exists('hook')) {
    /**
     * Dispatch an event and return the items
     *
     * @param  string  $event
     * @param  array  $items
     * @return array
     */
    function hook($event)
    {
        return EventHelper::renderEvent($event);
    }
}

if (!function_exists('admin_t')) {
    /**
     * Translate an admin label and gracefully fall back to the provided string.
     */
    function admin_t(string $key, ?string $fallback = null): string
    {
        $translated = __($key);

        if ($translated === $key) {
            return $fallback ?? $key;
        }

        return $translated;
    }
}

if (!function_exists('locale_flag')) {
    /**
     * Resolve a flag icon for a locale code.
     */
    function locale_flag(string $locale): string
    {
        return [
            'ar' => '🇸🇦',
            'bn' => '🇧🇩',
            'de' => '🇩🇪',
            'en' => '🇺🇸',
            'es' => '🇪🇸',
            'fi' => '🇫🇮',
            'fr' => '🇫🇷',
            'he' => '🇮🇱',
            'hi' => '🇮🇳',
            'hu' => '🇭🇺',
            'id' => '🇮🇩',
            'it' => '🇮🇹',
            'ko' => '🇰🇷',
            'lv' => '🇱🇻',
            'nl' => '🇳🇱',
            'no' => '🇳🇴',
            'pl' => '🇵🇱',
            'pt' => '🇵🇹',
            'sr' => '🇷🇸',
            'sv' => '🇸🇪',
            'tr' => '🇹🇷',
            'uk' => '🇺🇦',
            'zh' => '🇨🇳',
            'zh_TW' => '🇹🇼',
            'zh-TW' => '🇹🇼',
        ][$locale] ?? '🌐';
    }
}

if (!function_exists('locale_label')) {
    /**
     * Resolve a readable locale label from config.
     */
    function locale_label(string $locale): string
    {
        $labels = [
            'ar' => 'العربية',
            'bn' => 'বাংলা',
            'de' => 'Deutsch',
            'en' => 'English',
            'es' => 'Español',
            'fi' => 'Suomi',
            'fr' => 'Français',
            'he' => 'עברית',
            'hi' => 'हिन्दी',
            'hu' => 'Magyar',
            'id' => 'Bahasa Indonesia',
            'it' => 'Italiano',
            'ko' => '한국어',
            'lv' => 'Latviešu',
            'nl' => 'Nederlands',
            'no' => 'Norsk',
            'pl' => 'Polski',
            'pt' => 'Português',
            'sr' => 'Српски',
            'sv' => 'Svenska',
            'tr' => 'Türkçe',
            'uk' => 'Українська',
            'zh' => '中文',
            'zh_TW' => '繁體中文',
            'zh-TW' => '繁體中文',
        ];

        return $labels[$locale] ?? config("app.available_locales.$locale", strtoupper($locale));
    }
}

if (!function_exists('locale_option_label')) {
    /**
     * Build a combined flag + language label for selectors.
     */
    function locale_option_label(string $locale): string
    {
        return trim(locale_flag($locale) . ' ' . locale_label($locale));
    }
}
