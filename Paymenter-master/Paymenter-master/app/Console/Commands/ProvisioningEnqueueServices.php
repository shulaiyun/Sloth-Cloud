<?php

namespace App\Console\Commands;

use App\Models\ProvisioningJob;
use App\Models\Service;
use App\Services\Provisioning\ProvisioningOrchestrator;
use Illuminate\Console\Command;
use Illuminate\Support\Arr;

class ProvisioningEnqueueServices extends Command
{
    protected $signature = 'app:provisioning:enqueue-services
        {--provider=convoy : Provisioning provider name}
        {--service-id= : Enqueue one specific service ID}
        {--status=pending,active,suspended : Comma separated service statuses to scan}
        {--limit=200 : Max services to scan}
        {--dry-run : Preview only}';

    protected $description = 'Enqueue provisioning jobs for services that still miss provider runtime mapping or need retry';

    public function handle(ProvisioningOrchestrator $orchestrator): int
    {
        $provider = (string) $this->option('provider');
        $serviceId = $this->option('service-id');
        $dryRun = (bool) $this->option('dry-run');
        $limit = max((int) $this->option('limit'), 1);
        $statuses = collect(explode(',', (string) $this->option('status')))
            ->map(fn ($entry) => trim($entry))
            ->filter(fn ($entry) => $entry !== '')
            ->values()
            ->all();

        $query = Service::query()
            ->with(['product.server', 'plan', 'user', 'properties', 'configs'])
            ->whereHas('product.server')
            ->whereIn('status', $statuses)
            ->orderBy('id');

        if ($serviceId !== null) {
            $query->whereKey((int) $serviceId);
        }

        $services = $query->limit($limit)->get();
        if ($services->isEmpty()) {
            $this->warn('No candidate services found.');

            return self::SUCCESS;
        }

        $stats = [
            'scanned' => 0,
            'enqueued' => 0,
            'existing' => 0,
            'mapped' => 0,
            'unsupported' => 0,
            'failed' => 0,
        ];

        foreach ($services as $service) {
            $stats['scanned']++;

            if (!$orchestrator->supports($service, $provider)) {
                $stats['unsupported']++;
                $this->line("skip #{$service->id} unsupported");
                continue;
            }

            if ($dryRun) {
                $this->line("dry-run enqueue #{$service->id}");
                continue;
            }

            try {
                $beforePendingJob = ProvisioningJob::query()
                    ->where('service_id', $service->id)
                    ->where('provider', $provider)
                    ->whereIn('status', ProvisioningJob::activeStatuses())
                    ->exists();

                $job = $orchestrator->enqueueForService($service, $provider, [
                    'trigger' => 'artisan.enqueue-services',
                    'batch' => true,
                ]);

                if ($beforePendingJob) {
                    $stats['existing']++;
                    $this->line("existing #{$service->id} job={$job->id} status={$job->status}");
                    continue;
                }

                if (ProvisioningJob::isSuccessStatus($job->status) && (int) $job->attempt_count === 0) {
                    $stats['mapped']++;
                    $this->line("mapped #{$service->id} job={$job->id} stage=".data_get($job->response_payload, 'provisioning.current_stage', $job->status));
                    continue;
                }

                if (in_array($job->status, ProvisioningJob::activeStatuses(), true)) {
                    $stats['enqueued']++;
                    $this->line("enqueued #{$service->id} job={$job->id} stage=".data_get($job->response_payload, 'provisioning.current_stage', $job->status));
                    continue;
                }

                $stats['existing']++;
                $this->line("existing #{$service->id} job={$job->id} status={$job->status}");
            } catch (\Throwable $exception) {
                $stats['failed']++;
                $this->error("failed #{$service->id} {$exception->getMessage()}");
            }
        }

        $this->info(sprintf(
            'Provisioning enqueue done. scanned=%d enqueued=%d existing=%d mapped=%d unsupported=%d failed=%d dry_run=%s',
            $stats['scanned'],
            $stats['enqueued'],
            $stats['existing'],
            $stats['mapped'],
            $stats['unsupported'],
            $stats['failed'],
            $dryRun ? 'yes' : 'no'
        ));

        return Arr::get($stats, 'failed', 0) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
