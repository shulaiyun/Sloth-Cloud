<?php

namespace App\Jobs\VpsApps;

use App\Models\VpsAppInstall;
use App\Services\VpsApps\VpsAppInstallService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessVpsAppInstallJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 1800;

    public $tries = 1;

    public function __construct(public int $installId) {}

    public function handle(VpsAppInstallService $installService): void
    {
        $install = VpsAppInstall::query()->find($this->installId);
        if (!$install) {
            return;
        }

        $installService->processInstall($install);
    }
}
