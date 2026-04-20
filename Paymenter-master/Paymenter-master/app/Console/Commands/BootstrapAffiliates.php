<?php

namespace App\Console\Commands;

use App\Helpers\ExtensionHelper;
use App\Models\Extension;
use Illuminate\Console\Command;

class BootstrapAffiliates extends Command
{
    protected $signature = 'app:affiliates:bootstrap
        {--reward=10 : Default reward percentage for referred paid invoices}
        {--cookie-days=30 : Referral cookie max age in days}
        {--code-type=random : Invite code type, random or custom}
        {--force : Overwrite existing affiliate settings}';

    protected $description = 'Install and enable the Affiliates extension for the headless Sloth Cloud frontend.';

    public function handle(): int
    {
        $reward = min(100, max(0, (int) $this->option('reward')));
        $cookieDays = max(0, (int) $this->option('cookie-days'));
        $codeType = (string) $this->option('code-type');
        $force = (bool) $this->option('force');

        if (!in_array($codeType, ['random', 'custom'], true)) {
            $this->error('The --code-type option must be either "random" or "custom".');

            return self::FAILURE;
        }

        /** @var Extension $extension */
        $extension = Extension::withTrashed()->firstOrNew([
            'type' => 'other',
            'extension' => 'Affiliates',
        ]);

        if ($extension->trashed()) {
            $extension->restore();
        }

        $extension->name = 'Affiliates';
        $extension->enabled = true;
        $extension->save();

        ExtensionHelper::call($extension, 'installed', mayFail: true);

        foreach ([
            'default_reward' => (string) $reward,
            'cookie_max_age' => (string) $cookieDays,
            'type' => $codeType,
        ] as $key => $value) {
            $exists = $extension->settings()->where('key', $key)->exists();
            if ($exists && !$force) {
                continue;
            }

            $extension->settings()->updateOrCreate([
                'key' => $key,
                'settingable_id' => $extension->id,
                'settingable_type' => $extension->getMorphClass(),
            ], [
                'type' => is_numeric($value) ? 'number' : 'string',
                'value' => $value,
                'encrypted' => false,
            ]);
        }

        $this->info(sprintf(
            'Affiliates extension is enabled. reward=%d%% cookie_days=%d code_type=%s',
            $reward,
            $cookieDays,
            $codeType,
        ));

        return self::SUCCESS;
    }
}
