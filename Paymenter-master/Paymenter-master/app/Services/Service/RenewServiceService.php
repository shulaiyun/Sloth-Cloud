<?php

namespace App\Services\Service;

use App\Jobs\Server\CreateJob;
use App\Jobs\Server\UnsuspendJob;
use App\Models\Service;
use App\Services\Provisioning\ProvisioningOrchestrator;

class RenewServiceService
{
    /**
     * Handle the service renewal.
     *
     * @return void
     */
    public function handle(Service $service)
    {
        if ($service->product->server) {
            if ($service->status == Service::STATUS_SUSPENDED) {
                UnsuspendJob::dispatch($service);
            } elseif ($service->status == Service::STATUS_PENDING) {
                $orchestrator = app(ProvisioningOrchestrator::class);
                if ($orchestrator->supports($service, 'convoy')) {
                    $orchestrator->enqueueForService($service, 'convoy', [
                        'trigger' => 'invoice.paid',
                    ]);
                } else {
                    CreateJob::dispatch($service);
                }
            }
        }

        $service->expires_at = $service->calculateNextDueDate();
        $service->status = Service::STATUS_ACTIVE;
        $service->save();
    }
}
