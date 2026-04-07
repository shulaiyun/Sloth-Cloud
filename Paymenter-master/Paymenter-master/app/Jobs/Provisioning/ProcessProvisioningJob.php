<?php

namespace App\Jobs\Provisioning;

use App\Services\Provisioning\ProvisioningOrchestrator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessProvisioningJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(
        public int $provisioningJobId
    ) {
        $this->afterCommit = true;
    }

    public function handle(ProvisioningOrchestrator $orchestrator): void
    {
        $orchestrator->processJobById($this->provisioningJobId);
    }
}
