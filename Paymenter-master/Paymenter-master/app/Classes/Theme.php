<?php

namespace App\Classes;

use Exception;
use Throwable;

class Theme
{
    public static function getSettings()
    {
        $themeName = active_theme();
        $themePath = base_path('themes/' . $themeName . '/theme.php');

        if (!file_exists($themePath)) {
            $themeName = 'default';
            $themePath = base_path('themes/default/theme.php');
        }

        try {
            $theme = require $themePath;
        } catch (Throwable $th) {
            // If not ran from the command line, throw an exception
            if (php_sapi_name() !== 'cli') {
                throw new Exception('Theme file could not be read. ' . $th);
            } else {
                return [];
            }
        }

        // Add theme settings prefix to name <theme_name>_<setting_name>
        $settings = [];
        foreach ($theme['settings'] as $setting) {
            $setting['name'] = 'theme_' . $themeName . '_' . $setting['name'];
            $settings[] = $setting;
        }

        return $settings;
    }
}
