<?php

namespace App\Services\Provisioning;

use App\Helpers\ExtensionHelper;
use App\Helpers\NotificationHelper;
use App\Jobs\Provisioning\ProcessProvisioningJob;
use App\Models\ProvisioningJob;
use App\Models\ProvisioningMapping;
use App\Models\Service;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Throwable;

class ProvisioningOrchestrator
{
    /**
     * @var array<int, string>
     */
    protected array $convoyMappingKeys = [
        'convoy_server_uuid',
        'convoy_server_id',
        'convoy_server_short_id',
        'server_uuid',
    ];

    /**
     * @var array<int, string>
     */
    protected array $managedMappingKeys = [
        'runtime_ref',
        'k8s_namespace',
        'k8s_workload',
        'k8s_service',
        'app_endpoint',
        'app_status',
    ];

    public function __construct(
        protected ProvisioningMappingResolver $mappingResolver,
        protected ManagedAppRuntimeClient $managedAppRuntimeClient
    ) {}

    public function isEnabled(): bool
    {
        return filter_var((string) config('provisioning.enabled', env('PROVISIONING_ENABLED', false)), FILTER_VALIDATE_BOOL);
    }

    public function providerForService(Service $service): ?string
    {
        $service->loadMissing(['product.category', 'product.server', 'properties']);

        $runtimeKind = trim((string) ($service->properties->firstWhere('key', 'runtime_kind')?->value ?? ''));
        if ($runtimeKind === 'managed-app') {
            return ProvisioningMapping::PROVIDER_MANAGED_APP;
        }

        if ($service->product?->category?->slug === 'app-hosting' || $service->product?->server?->extension === 'ManagedAppHosting') {
            return ProvisioningMapping::PROVIDER_MANAGED_APP;
        }

        if ($service->product?->server?->extension === 'Convoy') {
            return ProvisioningMapping::PROVIDER_CONVOY;
        }

        if ($this->hasMapping($service, ProvisioningMapping::PROVIDER_MANAGED_APP)) {
            return ProvisioningMapping::PROVIDER_MANAGED_APP;
        }

        if ($this->hasMapping($service, ProvisioningMapping::PROVIDER_CONVOY)) {
            return ProvisioningMapping::PROVIDER_CONVOY;
        }

        return null;
    }

    public function supports(Service $service, string $provider = ProvisioningMapping::PROVIDER_CONVOY): bool
    {
        if (!$this->isEnabled() || !in_array($provider, $this->enabledProviders(), true)) {
            return false;
        }

        $service->loadMissing(['product.category', 'product.server', 'properties']);

        return match ($provider) {
            ProvisioningMapping::PROVIDER_MANAGED_APP => (
                $service->product?->category?->slug === 'app-hosting'
                || $service->product?->server?->extension === 'ManagedAppHosting'
                || $this->hasMapping($service, ProvisioningMapping::PROVIDER_MANAGED_APP)
            ),
            ProvisioningMapping::PROVIDER_CONVOY => (
                $service->product?->server?->extension === 'Convoy'
                || $this->hasMapping($service, ProvisioningMapping::PROVIDER_CONVOY)
            ),
            default => false,
        };
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function enqueueForService(Service $service, string $provider = ProvisioningMapping::PROVIDER_CONVOY, array $context = []): ProvisioningJob
    {
        $service->loadMissing(['product', 'plan', 'properties']);

        $existing = ProvisioningJob::query()
            ->where('service_id', $service->id)
            ->where('provider', $provider)
            ->whereIn('status', ProvisioningJob::activeStatuses())
            ->latest('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        $forceReprovision = filter_var((string) ($context['force_reprovision'] ?? false), FILTER_VALIDATE_BOOL);
        if (!$forceReprovision && $this->hasMapping($service, $provider)) {
            return ProvisioningJob::query()->create([
                'service_id' => $service->id,
                'provider' => $provider,
                'status' => ProvisioningJob::STATUS_READY,
                'attempt_count' => 0,
                'response_payload' => $this->buildProvisioningPayload(null, ProvisioningJob::STATUS_READY, 'Runtime mapping already exists.'),
                'completed_at' => now(),
            ]);
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
                    'product_slug' => (string) ($service->product?->slug ?? ''),
                    'plan_name' => (string) ($service->plan?->name ?? ''),
                ],
            ],
            'response_payload' => $this->buildProvisioningPayload(null, ProvisioningJob::STATUS_PENDING, 'Provisioning request queued.'),
        ]);

        ProcessProvisioningJob::dispatch($job->id)->onQueue('default');

        return $job;
    }

    public function processQueued(int $limit = 10, ?string $provider = null): int
    {
        $jobs = ProvisioningJob::query()
            ->when($provider, fn ($query) => $query->where('provider', $provider))
            ->where(function ($query) {
                $query->whereIn('status', ProvisioningJob::activeStatuses())
                    ->orWhere(function ($inner) {
                        $inner->where('status', ProvisioningJob::STATUS_FAILED)
                            ->where('attempt_count', '<', $this->maxAttempts());
                    });
            })
            ->orderBy('id')
            ->limit(max($limit, 1) * 8)
            ->get();

        $processed = 0;
        foreach ($jobs as $job) {
            if (!$this->shouldAttemptNow($job)) {
                continue;
            }

            $this->processJob($job);
            $processed++;
            if ($processed >= max($limit, 1)) {
                break;
            }
        }

        return $processed;
    }

    public function processJobById(int $jobId): ?ProvisioningJob
    {
        $job = ProvisioningJob::query()->find($jobId);

        return $job ? $this->processJob($job) : null;
    }

    public function processJob(ProvisioningJob $job): ProvisioningJob
    {
        $lock = Cache::lock(sprintf('provisioning:%s:%d', $job->provider, $job->service_id), max((int) ceil($this->lockTtlMs() / 1000), 30));
        if (!$lock->get()) {
            return $job->refresh();
        }

        try {
            return $this->processUnlocked($job);
        } finally {
            $lock->release();
        }
    }

    protected function processUnlocked(ProvisioningJob $job): ProvisioningJob
    {
        $service = Service::query()
            ->with(['product.server.settings', 'product.category', 'plan', 'user', 'properties', 'configs.configOption', 'configs.configValue'])
            ->find($job->service_id);

        if (!$service) {
            return $this->markFailure($job, 'Service not found.', 'PROVISIONING_SERVICE_NOT_FOUND', terminal: true);
        }

        if (!$this->supports($service, $job->provider)) {
            return $this->markFailure($job, 'Provisioning provider is unavailable for this service.', 'PROVISIONING_PROVIDER_UNSUPPORTED', $service, true);
        }

        $mapping = $this->mappingResolver->resolve($service, $job->provider);
        if (!$mapping) {
            return $this->markFailure($job, 'No provisioning mapping found for this service.', 'PROVISIONING_MAPPING_NOT_FOUND', $service, true);
        }

        $job->attempt_count = (int) $job->attempt_count + 1;
        $job->last_attempt_at = now();
        $job->status = ProvisioningJob::STATUS_QUEUED;
        $job->error_message = null;
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, ProvisioningJob::STATUS_QUEUED, sprintf('Provisioning attempt #%d started.', $job->attempt_count));
        $job->save();

        $context = is_array($job->request_payload['context'] ?? null) ? $job->request_payload['context'] : [];
        $forceReprovision = filter_var((string) ($context['force_reprovision'] ?? false), FILTER_VALIDATE_BOOL);
        if ($forceReprovision) {
            $this->clearMapping($service, $job->provider);
        }

        $overrides = $this->mappingResolver->buildPropertyOverrides($service, $mapping);
        $this->persistProperties($service, $overrides);

        return $job->provider === ProvisioningMapping::PROVIDER_MANAGED_APP
            ? $this->processManagedApp($job, $service, $mapping, $forceReprovision)
            : $this->processConvoy($job, $service, $forceReprovision);
    }

    protected function processConvoy(ProvisioningJob $job, Service $service, bool $forceReprovision): ProvisioningJob
    {
        if (!$forceReprovision && $this->hasMapping($service, ProvisioningMapping::PROVIDER_CONVOY)) {
            return $this->markReady($job, $service, 'VPS runtime mapping already exists.', ['runtime' => ['runtime_kind' => 'vps', 'server_mapping' => $this->readMapping($service, ProvisioningMapping::PROVIDER_CONVOY)]]);
        }

        try {
            $response = ExtensionHelper::createServer($service);
            $mapping = $this->syncConvoyMapping($service, $response);
            if ($mapping === []) {
                return $this->markFailure($job, 'Provisioned but no Convoy server mapping was returned.', 'PROVISIONING_MAPPING_WRITE_MISSING', $service, true);
            }

            return $this->markReady($job, $service, 'VPS runtime is ready.', ['runtime' => ['runtime_kind' => 'vps', 'server_mapping' => $mapping, 'provider_response' => $response]]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->markFailure($job, $exception->getMessage(), 'PROVISIONING_CONVOY_FAILED', $service);
        }
    }

    protected function processManagedApp(ProvisioningJob $job, Service $service, ProvisioningMapping $mapping, bool $forceReprovision): ProvisioningJob
    {
        $productSettings = ExtensionHelper::settingsToArray($service->product?->settings ?? []);
        $productSettings = is_array($productSettings) ? $productSettings : [];
        $serviceProperties = ExtensionHelper::getServiceProperties($service);
        $hasRuntimeRef = trim((string) ($serviceProperties['runtime_ref'] ?? '')) !== '';

        try {
            $result = ($hasRuntimeRef && !$forceReprovision)
                ? $this->managedAppRuntimeClient->reconcile($service, $mapping, $productSettings, $serviceProperties)
                : $this->managedAppRuntimeClient->provision($service, $mapping, $productSettings, $serviceProperties, $forceReprovision);
        } catch (Throwable $exception) {
            report($exception);

            return $this->markFailure($job, $exception->getMessage(), 'PROVISIONING_PROVIDER_CONNECTION_FAILED', $service);
        }

        $runtime = is_array($result['runtime'] ?? null) ? $result['runtime'] : [];
        $properties = is_array($result['properties'] ?? null) ? $result['properties'] : [];
        $stage = $this->normalizeStage((string) ($runtime['status'] ?? ($properties['app_status'] ?? ProvisioningJob::STATUS_PENDING)));
        $message = trim((string) ($result['message'] ?? 'Managed app runtime synchronized.'));
        $message = $message !== '' ? $message : 'Managed app runtime synchronized.';

        $properties['runtime_kind'] = 'managed-app';
        $properties['app_status'] = $stage;
        $this->persistProperties($service, $properties);

        if ($stage === ProvisioningJob::STATUS_READY) {
            return $this->markReady($job, $service, $message, ['runtime' => $runtime, 'properties' => $properties]);
        }

        if ($stage === ProvisioningJob::STATUS_FAILED) {
            return $this->markFailure($job, $message, (string) ($result['error_code'] ?? 'PROVISIONING_MANAGED_APP_FAILED'), $service);
        }

        $job->status = $stage;
        $job->error_message = null;
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, $stage, $message, ['runtime' => $runtime, 'properties' => $properties]);
        $job->save();
        $this->recordOperationLog($service, $job, $stage, $message, ['runtime' => $runtime]);
        $this->scheduleRetry($job, $this->activePollDelayMs());

        return $job->refresh();
    }

    protected function markReady(ProvisioningJob $job, Service $service, string $message, array $payload = []): ProvisioningJob
    {
        $job->status = ProvisioningJob::STATUS_READY;
        $job->error_message = null;
        $job->completed_at = now();
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, ProvisioningJob::STATUS_READY, $message, $payload);
        $job->save();

        if ($service->status === Service::STATUS_PENDING) {
            $service->status = Service::STATUS_ACTIVE;
            $service->expires_at = $service->expires_at ?: $service->calculateNextDueDate();
            $service->save();
        }

        $this->recordOperationLog($service, $job, 'success', $message, $payload);
        $this->notifySuccess($service, $job, $payload);

        return $job->refresh();
    }

    protected function markFailure(ProvisioningJob $job, string $message, string $errorCode, ?Service $service = null, bool $terminal = false): ProvisioningJob
    {
        $canRetry = !$terminal && ((int) $job->attempt_count < $this->maxAttempts());
        $job->status = $canRetry ? ProvisioningJob::STATUS_RETRYING : ProvisioningJob::STATUS_FAILED;
        $job->error_message = $message;
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, $job->status, $message, [
            'error_code' => $errorCode,
            'failure' => ['code' => $errorCode, 'message' => $message, 'provider' => $job->provider, 'attempt_count' => (int) $job->attempt_count, 'retry_available' => $canRetry],
        ]);
        $job->save();

        $service ??= Service::query()->with(['user', 'product'])->find($job->service_id);
        if ($service) {
            $this->recordOperationLog($service, $job, $canRetry ? 'retrying' : 'failed', $message, [], $errorCode, null);
        }

        if ($canRetry) {
            $this->scheduleRetry($job, $this->retryDelayMs((int) $job->attempt_count));
        } else {
            $this->notifyFailure($job, $message, $errorCode, $service);
        }

        return $job->refresh();
    }

    /**
     * @param  array<string, mixed>|null  $existing
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function buildProvisioningPayload(?array $existing, string $stage, string $reason, array $extra = []): array
    {
        $payload = is_array($existing) ? $existing : [];
        $provisioning = is_array($payload['provisioning'] ?? null) ? $payload['provisioning'] : [];
        $timeline = is_array($provisioning['timeline'] ?? null) ? $provisioning['timeline'] : [];
        $timeline[] = ['stage' => $stage, 'reason' => $reason, 'at' => now()->toISOString()];

        $payload['provisioning'] = [
            'contract_version' => '2026-04-pr4',
            'operation_id' => (string) ($provisioning['operation_id'] ?? Str::ulid()),
            'current_stage' => $stage,
            'last_reason' => $reason,
            'timeline' => $timeline,
            'updated_at' => now()->toISOString(),
        ];

        return array_replace_recursive($payload, $extra);
    }

    protected function hasMapping(Service $service, string $provider): bool
    {
        return $this->readMapping($service, $provider) !== [];
    }

    protected function clearMapping(Service $service, string $provider): void
    {
        $keys = $provider === ProvisioningMapping::PROVIDER_MANAGED_APP ? $this->managedMappingKeys : $this->convoyMappingKeys;
        $service->properties()->whereIn('key', $keys)->delete();
        $service->unsetRelation('properties');
    }

    /**
     * @return array<string, string>
     */
    protected function readMapping(Service $service, string $provider): array
    {
        $service->loadMissing('properties');
        $keys = $provider === ProvisioningMapping::PROVIDER_MANAGED_APP ? $this->managedMappingKeys : $this->convoyMappingKeys;
        $payload = [];

        foreach ($keys as $key) {
            $value = trim((string) ($service->properties->firstWhere('key', $key)?->value ?? ''));
            if ($value !== '') {
                $payload[$key] = $value;
            }
        }

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function persistProperties(Service $service, array $payload): void
    {
        foreach ($payload as $key => $value) {
            if (!is_string($key) || trim($key) === '' || $value === null) {
                continue;
            }

            $normalized = is_scalar($value) ? (string) $value : json_encode($value);
            if (!is_string($normalized) || trim($normalized) === '') {
                continue;
            }

            $service->properties()->updateOrCreate(['key' => $key], ['name' => $key, 'value' => $normalized]);
        }
    }

    /**
     * @param  mixed  $response
     * @return array<string, string>
     */
    protected function syncConvoyMapping(Service $service, mixed $response): array
    {
        $server = is_array($response) && is_array($response['server'] ?? null) ? $response['server'] : [];
        $mapping = [
            'runtime_kind' => 'vps',
            'convoy_server_uuid' => (string) ($server['uuid'] ?? ''),
            'convoy_server_id' => (string) ($server['id'] ?? ''),
            'convoy_server_short_id' => (string) ($server['short_id'] ?? ($server['shortId'] ?? '')),
            'server_uuid' => (string) ($server['uuid'] ?? ''),
        ];

        $this->persistProperties($service, $mapping);

        return $this->readMapping($service, ProvisioningMapping::PROVIDER_CONVOY);
    }

    protected function shouldAttemptNow(ProvisioningJob $job): bool
    {
        if ((string) $job->status === ProvisioningJob::STATUS_PENDING) {
            return true;
        }
        if (!$job->last_attempt_at) {
            return true;
        }

        $delayMs = (string) $job->status === ProvisioningJob::STATUS_FAILED
            ? $this->retryDelayMs((int) $job->attempt_count)
            : $this->activePollDelayMs();

        return now()->greaterThanOrEqualTo($job->last_attempt_at->copy()->addMilliseconds($delayMs));
    }

    protected function retryDelayMs(int $attempt): int
    {
        $base = max((int) config('provisioning.retry_base_ms', env('PROVISIONING_RETRY_BASE_MS', 30000)), 1000);
        $max = max((int) config('provisioning.retry_max_ms', env('PROVISIONING_RETRY_MAX_MS', 300000)), $base);
        return min((int) ($base * (2 ** max($attempt - 1, 0))), $max);
    }

    protected function activePollDelayMs(): int
    {
        return max(min($this->retryDelayMs(1), 15000), 2000);
    }

    protected function maxAttempts(): int
    {
        return max((int) config('provisioning.max_attempts', env('PROVISIONING_MAX_ATTEMPTS', 3)), 1);
    }

    protected function lockTtlMs(): int
    {
        return max((int) config('provisioning.lock_ttl_ms', env('PROVISIONING_LOCK_TTL_MS', 120000)), 10000);
    }

    protected function scheduleRetry(ProvisioningJob $job, int $delayMs): void
    {
        ProcessProvisioningJob::dispatch($job->id)->delay(now()->addMilliseconds(max($delayMs, 1000)))->onQueue('default');
    }

    protected function normalizeStage(string $stage): string
    {
        return match (strtolower(trim($stage))) {
            'queued', 'queue', 'waiting' => ProvisioningJob::STATUS_QUEUED,
            'building', 'build' => ProvisioningJob::STATUS_BUILDING,
            'pushing', 'push' => ProvisioningJob::STATUS_PUSHING,
            'deploying', 'deploy', 'provisioning' => ProvisioningJob::STATUS_DEPLOYING,
            'ready', 'success', 'succeeded', 'running', 'active' => ProvisioningJob::STATUS_READY,
            'retrying', 'retry' => ProvisioningJob::STATUS_RETRYING,
            'deleting', 'delete', 'destroying', 'terminating' => ProvisioningJob::STATUS_DELETING,
            'failed', 'error' => ProvisioningJob::STATUS_FAILED,
            default => ProvisioningJob::STATUS_PENDING,
        };
    }

    /**
     * @return array<int, string>
     */
    protected function enabledProviders(): array
    {
        $providers = config('provisioning.providers', [ProvisioningMapping::PROVIDER_CONVOY, ProvisioningMapping::PROVIDER_MANAGED_APP]);
        if (!is_array($providers)) {
            return [ProvisioningMapping::PROVIDER_CONVOY, ProvisioningMapping::PROVIDER_MANAGED_APP];
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($provider) => is_string($provider) ? trim($provider) : '',
            $providers
        ))));
    }

    protected function notifySuccess(Service $service, ProvisioningJob $job, array $payload): void
    {
        if (!$service->user) {
            return;
        }

        try {
            NotificationHelper::serverCreatedNotification($service->user, $service, [
                'provider' => $job->provider,
                'runtime_kind' => $job->provider === ProvisioningMapping::PROVIDER_MANAGED_APP ? 'managed-app' : 'vps',
                'endpoint' => data_get($payload, 'runtime.endpoint'),
                'operation_id' => data_get($job->response_payload, 'provisioning.operation_id'),
            ]);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    protected function notifyFailure(ProvisioningJob $job, string $message, string $errorCode, ?Service $service = null): void
    {
        $service ??= Service::query()->with(['user', 'product'])->find($job->service_id);
        if (!$service || !$service->user) {
            return;
        }

        $subject = sprintf('[Sloth Cloud] Provisioning failed - %s', (string) $service->label);
        $body = implode("\n", [
            'A provisioning task failed and requires attention.',
            '',
            'Service ID: '.$service->id,
            'Service: '.(string) $service->label,
            'Product: '.(string) ($service->product?->name ?? '-'),
            'Provider: '.$job->provider,
            'Stage: '.(string) data_get($job->response_payload, 'provisioning.current_stage', $job->status),
            'Error Code: '.$errorCode,
            'Reason: '.$message,
            'Operation ID: '.(string) data_get($job->response_payload, 'provisioning.operation_id', '-'),
        ]);

        try {
            NotificationHelper::sendSystemEmailNotification(
                subject: $subject,
                body: $body,
                attachments: [],
                user: $service->user,
                email: $service->user->email,
            );
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * @param  array<string, mixed>  $responsePayload
     */
    protected function recordOperationLog(
        Service $service,
        ProvisioningJob $job,
        string $status,
        string $message,
        array $responsePayload = [],
        ?string $errorCode = null,
        ?string $errorDetail = null
    ): void {
        try {
            $service->operationLogs()->create([
                'operation_id' => (string) Str::ulid(),
                'user_id' => $service->user_id,
                'source' => 'provisioning',
                'action' => 'provisioning:'.$job->provider,
                'status' => $status,
                'message' => $message,
                'error_code' => $errorCode,
                'error_detail' => $errorDetail,
                'request_payload' => is_array($job->request_payload) ? $job->request_payload : null,
                'response_payload' => $responsePayload,
                'actor_type' => 'system',
                'actor_id' => null,
            ]);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
