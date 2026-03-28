<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Providers\SettingsProvider;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class LocalizationSync extends Command
{
    protected $signature = 'app:localization:sync';

    protected $description = 'Sync zh -> zh_CN language files and enforce Chinese-first runtime defaults';

    public function handle(): int
    {
        $source = lang_path('zh');
        $target = lang_path('zh_CN');

        if (!File::exists($source)) {
            $this->error('Source locale directory lang/zh does not exist.');

            return self::FAILURE;
        }

        $this->syncDirectory($source, $target);
        $this->syncVendorLocales();

        Setting::updateOrCreate(
            ['key' => 'app_language'],
            ['value' => 'zh', 'type' => 'string']
        );

        $existingAllowed = Setting::query()->where('key', 'allowed_languages')->value('value');
        $allowedLanguages = is_array($existingAllowed) ? $existingAllowed : [];
        $allowedLanguages = array_values(array_unique(array_merge($allowedLanguages, ['zh', 'zh_TW', 'en'])));

        Setting::updateOrCreate(
            ['key' => 'allowed_languages'],
            ['value' => $allowedLanguages, 'type' => 'array']
        );

        SettingsProvider::flushCache();
        Artisan::call('optimize:clear');

        $this->info('Localization sync completed: zh_CN mirrors zh and runtime defaults are refreshed.');

        return self::SUCCESS;
    }

    private function syncDirectory(string $source, string $target): void
    {
        File::ensureDirectoryExists($target);

        foreach (File::allFiles($source) as $file) {
            $relativePath = $file->getRelativePathname();
            $targetPath = $target . DIRECTORY_SEPARATOR . $relativePath;

            File::ensureDirectoryExists(dirname($targetPath));
            File::copy($file->getPathname(), $targetPath);
        }
    }

    private function syncVendorLocales(): void
    {
        $vendorRoot = lang_path('vendor');

        if (!File::exists($vendorRoot)) {
            return;
        }

        foreach (File::directories($vendorRoot) as $packagePath) {
            $zhPath = $packagePath . DIRECTORY_SEPARATOR . 'zh';
            $zhCnPath = $packagePath . DIRECTORY_SEPARATOR . 'zh_CN';

            if (File::exists($zhPath)) {
                $this->syncDirectory($zhPath, $zhCnPath);
            }
        }
    }
}

