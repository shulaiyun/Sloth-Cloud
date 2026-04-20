<?php

namespace App\Console\Commands;

use App\Models\NotificationTemplate;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;

class BootstrapNotificationTemplates extends Command
{
    protected $signature = 'app:notifications:bootstrap-defaults
        {--sync-existing : Overwrite built-in template subject/body fields for existing templates}
        {--dry-run : Preview changes without writing data}';

    protected $description = 'Create missing notification templates and optionally sync built-in defaults';

    /**
     * @var array<int, string>
     */
    protected array $criticalTemplateKeys = [
        'new_server_created',
        'vps_app_install_ready',
        'invoice_paid',
        'invoice_payment_failed',
        'new_invoice_created',
    ];

    public function handle(): int
    {
        Config::set('audit.console', true);

        $syncExisting = (bool) $this->option('sync-existing');
        $dryRun = (bool) $this->option('dry-run');

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach (EmailTemplateSeeder::mapping as $key => $data) {
            $attributes = array_merge($data, [
                'key' => $key,
                'enabled' => true,
            ]);

            /** @var NotificationTemplate|null $existing */
            $existing = NotificationTemplate::query()->where('key', $key)->first();

            if ($dryRun) {
                $action = $existing ? ($syncExisting ? 'sync' : 'skip/update-missing') : 'create';
                $this->line(sprintf('[dry-run] %s -> %s', $key, $action));
                continue;
            }

            if (!$existing) {
                NotificationTemplate::query()->create($attributes);
                $created++;
                continue;
            }

            $updates = [];
            foreach ([
                'subject',
                'body',
                'enabled',
                'cc',
                'bcc',
                'mail_enabled',
                'in_app_enabled',
                'in_app_title',
                'in_app_body',
                'edit_preference_message',
                'in_app_url',
            ] as $field) {
                $defaultValue = $attributes[$field] ?? null;
                $currentValue = $existing->{$field} ?? null;

                if ($syncExisting) {
                    $updates[$field] = $defaultValue;
                    continue;
                }

                if ($currentValue === null || $currentValue === '') {
                    $updates[$field] = $defaultValue;
                }
            }

            if (!$syncExisting && in_array($key, $this->criticalTemplateKeys, true) && !$existing->enabled) {
                $updates['enabled'] = true;
            }

            if ($updates === []) {
                $skipped++;
                continue;
            }

            $existing->fill($updates);
            $existing->save();
            $updated++;
        }

        $this->info(sprintf(
            'Notification template bootstrap completed. created=%d updated=%d skipped=%d sync_existing=%s',
            $created,
            $updated,
            $skipped,
            $syncExisting ? 'yes' : 'no'
        ));

        return self::SUCCESS;
    }
}
