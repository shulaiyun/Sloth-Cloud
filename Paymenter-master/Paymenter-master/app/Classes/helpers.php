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
