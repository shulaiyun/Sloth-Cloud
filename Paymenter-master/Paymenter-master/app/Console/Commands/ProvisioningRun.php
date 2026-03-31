<?php

namespace App\Console\Commands;

use App\Models\ProvisioningJob;
use App\Models\Service;
use App\Services\Provisioning\ProvisioningOrchestrator;
use Illuminate\Console\Command;

class ProvisioningRun extends Command
{
    protected $signature = 'app:provisioning:run
        {--limit=10 : Maximum jobs to process in one run}
        {--provider=convoy : Provisioning provider name}
        {--service-id= : Enqueue a specific service ID}
        {--job-id= : Process a specific provisioning job ID}';

    protected $description = 'Run provisioning orchestrator queue and retries';

    public function handle(ProvisioningOrchestrator $orchestrator): int
    {
        $provider = (string) $this->option('provider');
        $serviceId = $this->option('service-id');
        $jobId = $this->option('job-id');
        $limit = max((int) $this->option('limit'), 1);

        if ($serviceId !== null) {
            $service = Service::query()->find($serviceId);
            if (!$service) {
                $this->error("Service {$serviceId} not found.");

                return self::FAILURE;
            }

            if (!$orchestrator->supports($service, $provider)) {
                $this->warn("Service {$serviceId} does not support provider {$provider} or provisioning is disabled.");

                return self::INVALID;
            }

            $job = $orchestrator->enqueueForService($service, $provider, [
                'trigger' => 'artisan',
            ]);

            $this->info("Enqueued provisioning job #{$job->id} for service #{$service->id}.");

            return self::SUCCESS;
        }

        if ($jobId !== null) {
            $job = $orchestrator->processJobById((int) $jobId);
            if (!$job) {
                $this->error("Provisioning job {$jobId} not found.");

                return self::FAILURE;
            }

            $this->line(sprintf(
                'Processed job #%d -> status=%s attempts=%d',
                $job->id,
                $job->status,
                $job->attempt_count
            ));

            return $job->status === ProvisioningJob::STATUS_FAILED ? self::FAILURE : self::SUCCESS;
        }

        $processed = $orchestrator->processQueued($limit, $provider ?: null);
        $this->info("Processed {$processed} provisioning job(s).");

        return self::SUCCESS;
    }
}
