<?php

namespace App\Services\Provisioning;

use App\Helpers\ExtensionHelper;
use App\Jobs\Provisioning\ProcessProvisioningJob;
use App\Models\ProvisioningJob;
use App\Models\Service;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProvisioningOrchestrator
{
    /**
     * @var array<int, string>
     */
    protected array $mappingKeys = [
        'convoy_server_uuid',
        'convoy_server_id',
        'convoy_server_short_id',
        'server_uuid',
    ];

    public function __construct(
        protected ProvisioningMappingResolver $mappingResolver
    ) {}

    public function isEnabled(): bool
    {
        return filter_var((string) config('services.provisioning.enabled', env('PROVISIONING_ENABLED', false)), FILTER_VALIDATE_BOOL);
    }

    public function supports(Service $service, string $provider = 'convoy'): bool
    {
        if (!$this->isEnabled()) {
            return false;
        }

        if ($provider !== 'convoy') {
            return false;
        }

        $service->loadMissing(['product.server']);

        return (bool) ($service->product?->server?->extension === 'Convoy');
    }

    public function enqueueForService(Service $service, string $provider = 'convoy', array $context = []): ProvisioningJob
    {
        $service->loadMissing(['product', 'plan', 'user', 'product.server', 'properties', 'configs']);

        $existing = ProvisioningJob::query()
            ->where('service_id', $service->id)
            ->where('provider', $provider)
            ->whereIn('status', [ProvisioningJob::STATUS_PENDING, ProvisioningJob::STATUS_PROVISIONING])
            ->latest('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        if ($this->hasServerMapping($service)) {
            return ProvisioningJob::query()->firstOrCreate(
                [
                    'service_id' => $service->id,
                    'provider' => $provider,
                    'status' => ProvisioningJob::STATUS_SUCCESS,
                ],
                [
                    'attempt_count' => 0,
                    'completed_at' => now(),
                    'response_payload' => [
                        'message' => 'Mapping already exists. Skipped duplicate provisioning.',
                    ],
                ]
            );
        }

        $job = ProvisioningJob::query()->create([
            'service_id' => $service->id,
            'provider' => $provider,
            'status' => ProvisioningJob::STATUS_PENDING,
            'attempt_count' => 0,
            'request_payload' => [
                'context' => $context,
                'service' => [
                    'id' => $service->id,
                    'status' => $service->status,
                    'product_id' => $service->product_id,
                    'product_slug' => $service->product?->slug,
                    'plan_id' => $service->plan_id,
                    'plan_name' => $service->plan?->name,
                ],
            ],
        ]);

        ProcessProvisioningJob::dispatch($job->id)->onQueue('default');

        Log::info('Provisioning job enqueued', [
            'provider' => $provider,
            'job_id' => $job->id,
            'service_id' => $service->id,
        ]);

        return $job;
    }

    public function processQueued(int $limit = 10, ?string $provider = null): int
    {
        $maxAttempts = $this->maxAttempts();
        $target = max($limit, 1);

        $jobs = ProvisioningJob::query()
            ->when($provider, fn ($query) => $query->where('provider', $provider))
            ->where(function ($query) use ($maxAttempts) {
                $query->where('status', ProvisioningJob::STATUS_PENDING)
                    ->orWhere(function ($inner) use ($maxAttempts) {
                        $inner->where('status', ProvisioningJob::STATUS_FAILED)
                            ->where('attempt_count', '<', $maxAttempts);
                    });
            })
            ->orderBy('id')
            ->limit($target * 5)
            ->get();

        $processed = 0;
        foreach ($jobs as $job) {
            if (!$this->shouldAttemptNow($job)) {
                continue;
            }

            $this->processJob($job);
            $processed++;
            if ($processed >= $target) {
                break;
            }
        }

        return $processed;
    }

    public function processJobById(int $jobId): ?ProvisioningJob
    {
        $job = ProvisioningJob::query()->find($jobId);
        if (!$job) {
            return null;
        }

        return $this->processJob($job);
    }

    public function processJob(ProvisioningJob $job): ProvisioningJob
    {
        $lock = Cache::lock(
            sprintf('provisioning:%s:%d', $job->provider, $job->service_id),
            max((int) ceil($this->lockTtlMs() / 1000), 30)
        );

        if (!$lock->get()) {
            Log::info('Provisioning job skipped because another worker owns the lock', [
                'job_id' => $job->id,
                'service_id' => $job->service_id,
                'provider' => $job->provider,
            ]);

            return $job->refresh();
        }

        try {
            return $this->processJobUnlocked($job);
        } finally {
            $lock->release();
        }
    }

    protected function processJobUnlocked(ProvisioningJob $job): ProvisioningJob
    {
        $service = Service::query()
            ->with(['product.server.settings', 'plan', 'user', 'properties', 'configs.configOption', 'configs.configValue'])
            ->find($job->service_id);

        if (!$service) {
            return $this->markFailed($job, 'Service not found.');
        }

        if (!$this->supports($service, $job->provider)) {
            return $this->markFailed($job, 'Provisioning provider is not enabled for this service.');
        }

        $job->status = ProvisioningJob::STATUS_PROVISIONING;
        $job->attempt_count = (int) $job->attempt_count + 1;
        $job->last_attempt_at = now();
        $job->error_message = null;
        $job->save();

        try {
            $mapping = $this->mappingResolver->resolve($service, $job->provider);
            if (!$mapping) {
                return $this->markFailed($job, 'No provisioning mapping found for this service.', [
                    'service_id' => $service->id,
                    'product_id' => $service->product_id,
                    'product_slug' => $service->product?->slug,
                    'plan_id' => $service->plan_id,
                    'plan_name' => $service->plan?->name,
                ]);
            }

            $overrides = $this->mappingResolver->buildPropertyOverrides($service, $mapping);
            $this->persistServiceProperties($service, $overrides);

            $response = ExtensionHelper::createServer($service);
            $mappingPayload = $this->syncServerRefs($service, $response);
            if ($mappingPayload === []) {
                return $this->markFailed($job, 'Provisioning completed but no server mapping keys were returned.', [
                    'mapping_id' => $mapping->id,
                    'response' => $response,
                ]);
            }

            $job->status = ProvisioningJob::STATUS_SUCCESS;
            $job->response_payload = [
                'mapping_id' => $mapping->id,
                'server' => $mappingPayload,
                'response' => $response,
            ];
            $job->completed_at = now();
            $job->error_message = null;
            $job->save();

            Log::info('Provisioning job completed', [
                'job_id' => $job->id,
                'service_id' => $service->id,
                'provider' => $job->provider,
                'server_mapping' => $mappingPayload,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->markFailed($job, $exception->getMessage(), [
                'exception' => [
                    'class' => get_class($exception),
                    'message' => $exception->getMessage(),
                ],
            ]);
        }

        return $job->refresh();
    }

    protected function shouldAttemptNow(ProvisioningJob $job): bool
    {
        if ($job->status === ProvisioningJob::STATUS_PENDING) {
            return true;
        }

        if ($job->status !== ProvisioningJob::STATUS_FAILED) {
            return false;
        }

        if ((int) $job->attempt_count >= $this->maxAttempts()) {
            return false;
        }

        if (!$job->last_attempt_at) {
            return true;
        }

        $delayMs = $this->retryDelayMs((int) $job->attempt_count);

        return now()->greaterThanOrEqualTo($job->last_attempt_at->copy()->addMilliseconds($delayMs));
    }

    protected function retryDelayMs(int $attemptCount): int
    {
        $base = max($this->retryBaseMs(), 1_000);
        $max = max($this->retryMaxMs(), $base);
        $exp = max($attemptCount - 1, 0);
        $delay = (int) ($base * (2 ** $exp));

        return min($delay, $max);
    }

    protected function maxAttempts(): int
    {
        return max((int) config('services.provisioning.max_attempts', env('PROVISIONING_MAX_ATTEMPTS', 3)), 1);
    }

    protected function retryBaseMs(): int
    {
        return (int) config('services.provisioning.retry_base_ms', env('PROVISIONING_RETRY_BASE_MS', 30_000));
    }

    protected function retryMaxMs(): int
    {
        return (int) config('services.provisioning.retry_max_ms', env('PROVISIONING_RETRY_MAX_MS', 300_000));
    }

    protected function lockTtlMs(): int
    {
        return (int) config('services.provisioning.lock_ttl_ms', env('PROVISIONING_LOCK_TTL_MS', 120_000));
    }

    protected function markFailed(ProvisioningJob $job, string $message, array $responsePayload = []): ProvisioningJob
    {
        $job->status = ProvisioningJob::STATUS_FAILED;
        $job->error_message = $message;
        $job->response_payload = $responsePayload === [] ? null : $responsePayload;
        $job->save();

        Log::warning('Provisioning job failed', [
            'job_id' => $job->id,
            'service_id' => $job->service_id,
            'provider' => $job->provider,
            'attempt_count' => $job->attempt_count,
            'error_message' => $message,
        ]);

        return $job->refresh();
    }

    protected function hasServerMapping(Service $service): bool
    {
        $service->loadMissing('properties');

        $normalized = collect($this->mappingKeys)->mapWithKeys(fn ($key) => [strtolower($key) => true]);
        foreach ($service->properties as $property) {
            if ($normalized->has(strtolower((string) $property->key)) && trim((string) $property->value) !== '') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function persistServiceProperties(Service $service, array $payload): void
    {
        foreach ($payload as $key => $value) {
            if (!is_string($key) || $key === '') {
                continue;
            }

            if ($value === null || (is_string($value) && trim($value) === '')) {
                continue;
            }

            $service->properties()->updateOrCreate(
                ['key' => $key],
                [
                    'name' => $key,
                    'value' => is_scalar($value) ? (string) $value : json_encode($value),
                ]
            );
        }
    }

    /**
     * @param  mixed  $response
     * @return array<string, string>
     */
    protected function syncServerRefs(Service $service, mixed $response): array
    {
        $server = [];
        if (is_array($response) && is_array($response['server'] ?? null)) {
            $server = $response['server'];
        }

        $uuid = (string) ($server['uuid'] ?? '');
        $id = (string) ($server['id'] ?? '');
        $shortId = (string) ($server['short_id'] ?? ($server['shortId'] ?? ''));

        $properties = [
            'convoy_server_uuid' => $uuid,
            'convoy_server_id' => $id,
            'convoy_server_short_id' => $shortId,
            'server_uuid' => $uuid,
        ];

        foreach ($properties as $key => $value) {
            if ($value === '') {
                continue;
            }

            $service->properties()->updateOrCreate(
                ['key' => $key],
                [
                    'name' => $key,
                    'value' => $value,
                ]
            );
        }

        $service->load('properties');
        $resolved = [];
        foreach ($this->mappingKeys as $mappingKey) {
            $hit = $service->properties->firstWhere('key', $mappingKey);
            $value = trim((string) ($hit?->value ?? ''));
            if ($value === '') {
                continue;
            }

            $resolved[$mappingKey] = $value;
        }

        return $resolved;
    }
}
