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
     * @param  array|string  $key
     * @param  mixed  $default
     * @return mixed|Repository
     */
    function theme($key, $default = null)
    {
        $current_theme = active_theme();

        return config("settings.theme_{$current_theme}_{$key}", $default) ?? $default;
    }
}

if (!function_exists('hook')) {
    /**
     * Dispatch an event and return the items.
     *
     * @param  string  $event
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
     * Resolve a simple ascii flag marker for a locale code.
     */
    function locale_flag(string $locale): string
    {
        return [
            'ar' => '[SA]',
            'bn' => '[BD]',
            'de' => '[DE]',
            'en' => '[US]',
            'es' => '[ES]',
            'fi' => '[FI]',
            'fr' => '[FR]',
            'he' => '[IL]',
            'hi' => '[IN]',
            'hu' => '[HU]',
            'id' => '[ID]',
            'it' => '[IT]',
            'ko' => '[KR]',
            'lv' => '[LV]',
            'nl' => '[NL]',
            'no' => '[NO]',
            'pl' => '[PL]',
            'pt' => '[PT]',
            'sr' => '[RS]',
            'sv' => '[SE]',
            'tr' => '[TR]',
            'uk' => '[UA]',
            'zh' => '[CN]',
            'zh_TW' => '[TW]',
            'zh-TW' => '[TW]',
        ][$locale] ?? '[--]';
    }
}

if (!function_exists('locale_label')) {
    /**
     * Resolve a readable locale label from config.
     */
    function locale_label(string $locale): string
    {
        $labels = [
            'ar' => 'Arabic',
            'bn' => 'Bengali',
            'de' => 'Deutsch',
            'en' => 'English',
            'es' => 'Espanol',
            'fi' => 'Suomi',
            'fr' => 'Francais',
            'he' => 'Hebrew',
            'hi' => 'Hindi',
            'hu' => 'Magyar',
            'id' => 'Bahasa Indonesia',
            'it' => 'Italiano',
            'ko' => 'Korean',
            'lv' => 'Latvian',
            'nl' => 'Nederlands',
            'no' => 'Norsk',
            'pl' => 'Polski',
            'pt' => 'Portugues',
            'sr' => 'Serbian',
            'sv' => 'Svenska',
            'tr' => 'Turkce',
            'uk' => 'Ukrainian',
            'zh' => 'Chinese (Simplified)',
            'zh_TW' => 'Chinese (Traditional)',
            'zh-TW' => 'Chinese (Traditional)',
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

if (!function_exists('localized_text_payload')) {
    /**
     * Build a JSON string that front-end locale helpers can read.
     *
     * The base text is used as a fallback for missing translations so existing
     * single-language content continues to work without additional editing.
     */
    function localized_text_payload(?string $baseText, ?array $translations = null): string
    {
        $baseText = trim((string) $baseText);
        $translations = is_array($translations) ? $translations : [];

        $normalized = [];
        foreach ($translations as $locale => $value) {
            if (!is_string($locale)) {
                continue;
            }

            if (!is_string($value)) {
                continue;
            }

            $value = trim($value);
            if ($value === '') {
                continue;
            }

            $normalized[$locale] = $value;
        }

        if ($baseText === '' && $normalized === []) {
            return '';
        }

        $payload = [];
        foreach (['zh-CN', 'zh-TW', 'en-US'] as $locale) {
            $payload[$locale] = $normalized[$locale] ?? $baseText;
        }

        foreach ($normalized as $locale => $value) {
            $payload[$locale] = $value;
        }

        $payload['default'] = $baseText !== '' ? $baseText : (reset($normalized) ?: '');

        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return is_string($encoded) ? $encoded : $baseText;
    }
}
