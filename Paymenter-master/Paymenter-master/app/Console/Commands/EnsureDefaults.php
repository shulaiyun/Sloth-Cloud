<?php

namespace App\Console\Commands;

use App\Classes\Settings as SettingsCatalog;
use App\Models\Currency;
use App\Models\Role;
use App\Models\Setting;
use App\Providers\SettingsProvider;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;

class EnsureDefaults extends Command
{
    private const BASELINE_LOCALES = ['zh', 'zh_TW', 'en', 'de', 'fr', 'es', 'ko', 'ja', 'pt', 'ru'];

    protected $signature = 'app:ensure-defaults';

    protected $description = 'Ensure baseline roles, settings, and currencies exist';

    public function handle(): int
    {
        Config::set('audit.console', true);

        Role::updateOrCreate(['name' => 'admin'], ['permissions' => ['*']]);

        foreach (SettingsCatalog::settings() as $settings) {
            foreach ($settings as $setting) {
                if (!array_key_exists('default', $setting)) {
                    continue;
                }

                Setting::firstOrCreate(
                    ['key' => $setting['name']],
                    [
                        'value' => $setting['default'],
                        'type' => $setting['database_type'] ?? 'string',
                        'encrypted' => $setting['encrypted'] ?? false,
                    ]
                );
            }
        }

        Currency::ensureBaseline();

        $defaultCurrency = Currency::defaultCode() ?? 'USD';

        Setting::updateOrCreate(
            ['key' => 'default_currency'],
            ['value' => $defaultCurrency, 'type' => 'string']
        );

        $availableLocales = collect((array) config('app.available_locales'))
            ->keys()
            ->values()
            ->all();

        $baselineLocales = array_values(array_intersect(self::BASELINE_LOCALES, $availableLocales));

        if ($baselineLocales === []) {
            $baselineLocales = ['en'];
        }

        $defaultLanguage = in_array('zh', $availableLocales, true) ? 'zh' : 'en';
        Setting::firstOrCreate(
            ['key' => 'app_language'],
            ['value' => $defaultLanguage, 'type' => 'string']
        );

        $allowedLanguages = Setting::query()->where('key', 'allowed_languages')->value('value');
        $allowedLanguages = is_array($allowedLanguages) ? $allowedLanguages : [];

        Setting::updateOrCreate(
            ['key' => 'allowed_languages'],
            ['value' => array_values(array_unique(array_merge($allowedLanguages, $baselineLocales))), 'type' => 'array']
        );

        SettingsProvider::flushCache();

        $this->info('Defaults ensured successfully.');

        return self::SUCCESS;
    }
}
