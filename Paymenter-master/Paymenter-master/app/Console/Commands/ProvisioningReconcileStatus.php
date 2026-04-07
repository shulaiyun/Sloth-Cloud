<?php

namespace App\Console\Commands;

use App\Models\ProvisioningJob;
use App\Models\Service;
use Illuminate\Console\Command;

class ProvisioningReconcileStatus extends Command
{
    protected $signature = 'app:provisioning:reconcile-status
        {--limit=200 : Max services to reconcile in one run}
        {--dry-run : Show services without writing}';

    protected $description = 'Promote pending services to active when provisioning reached a ready state';

    public function handle(): int
    {
        $limit = max((int) $this->option('limit'), 1);
        $dryRun = (bool) $this->option('dry-run');

        $services = Service::query()
            ->where('status', Service::STATUS_PENDING)
            ->whereHas('latestProvisioningJob', fn ($query) => $query->whereIn('status', ProvisioningJob::successStatuses()))
            ->with(['plan', 'latestProvisioningJob'])
            ->orderBy('id')
            ->limit($limit)
            ->get();

        if ($services->isEmpty()) {
            $this->info('No pending services require reconciliation.');

            return self::SUCCESS;
        }

        $updated = 0;
        foreach ($services as $service) {
            $expiresAt = $service->expires_at ?: $service->calculateNextDueDate();

            if ($dryRun) {
                $this->line(sprintf(
                    '[dry-run] service=%d latest_job=%d status=%s stage=%s expires_at=%s',
                    $service->id,
                    (int) ($service->latestProvisioningJob?->id ?? 0),
                    $service->status,
                    (string) data_get($service->latestProvisioningJob?->response_payload, 'provisioning.current_stage', $service->latestProvisioningJob?->status ?? 'unknown'),
                    optional($expiresAt)?->toISOString() ?? 'null'
                ));
                continue;
            }

            $service->status = Service::STATUS_ACTIVE;
            $service->expires_at = $expiresAt;
            $service->save();
            $updated++;
        }

        $this->info(sprintf(
            'Provisioning status reconciliation done. scanned=%d updated=%d dry_run=%s',
            $services->count(),
            $updated,
            $dryRun ? 'yes' : 'no'
        ));

        return self::SUCCESS;
    }
}
