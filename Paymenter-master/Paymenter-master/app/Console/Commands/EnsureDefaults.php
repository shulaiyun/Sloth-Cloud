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

        if (Currency::count() === 0) {
            Currency::create([
                'code' => 'USD',
                'name' => 'US Dollar',
                'prefix' => '$',
                'suffix' => '',
                'format' => '1,000.00',
            ]);
        }

        $defaultCurrency = Currency::defaultCode() ?? 'USD';

        Setting::updateOrCreate(
            ['key' => 'default_currency'],
            ['value' => $defaultCurrency, 'type' => 'string']
        );

        SettingsProvider::flushCache();

        $this->info('Defaults ensured successfully.');

        return self::SUCCESS;
    }
}
