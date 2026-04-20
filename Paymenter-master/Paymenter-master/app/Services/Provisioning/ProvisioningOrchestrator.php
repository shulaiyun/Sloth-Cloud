<?php

namespace App\Services\Provisioning;

use App\Helpers\ExtensionHelper;
use App\Helpers\NotificationHelper;
use App\Jobs\Provisioning\ProcessProvisioningJob;
use App\Models\ProvisioningJob;
use App\Models\ProvisioningMapping;
use App\Models\Service;
use App\Models\ServiceOperationLog;
use App\Services\VpsApps\VpsAppInstallService;
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
        'k8s_cluster_ref',
        'k8s_namespace',
        'k8s_workload',
        'k8s_service',
        'k8s_ingress_url',
        'app_last_deploy_at',
        'app_domain',
        'app_tls_status',
        'app_replicas',
        'app_env_vars',
        'app_image_ref',
        'app_previous_image_ref',
        'app_image_tag',
        'app_domain_limit',
        'app_env_var_limit',
        'app_log_retention_lines',
        'app_build_job_name',
        'app_endpoint',
        'app_status',
    ];

    public function __construct(
        protected ProvisioningMappingResolver $mappingResolver,
        protected ManagedAppRuntimeClient $managedAppRuntimeClient,
        protected VpsAppInstallService $vpsAppInstallService,
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

        $trigger = trim((string) ($context['trigger'] ?? ''));
        $forceReprovision = filter_var((string) ($context['force_reprovision'] ?? false), FILTER_VALIDATE_BOOL);

        $existing = ProvisioningJob::query()
            ->where('service_id', $service->id)
            ->where('provider', $provider)
            ->whereIn('status', ProvisioningJob::activeStatuses())
            ->latest('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        $latest = ProvisioningJob::query()
            ->where('service_id', $service->id)
            ->where('provider', $provider)
            ->latest('id')
            ->first();

        // Prevent automated batch/sync paths from recreating the same terminal
        // failure forever, which would otherwise spam customers with duplicates.
        if (
            $latest
            && (string) $latest->status === ProvisioningJob::STATUS_FAILED
            && !$forceReprovision
            && $trigger !== 'user.retry'
        ) {
            return $latest;
        }

        $shouldShortCircuitReady = !$forceReprovision && $this->hasMapping($service, $provider);
        if ($shouldShortCircuitReady && $provider === ProvisioningMapping::PROVIDER_MANAGED_APP) {
            $serviceProperties = ExtensionHelper::getServiceProperties($service);
            $managedStatus = strtolower(trim((string) ($serviceProperties['app_status'] ?? '')));
            $shouldShortCircuitReady = in_array($managedStatus, ['ready', 'running', 'active'], true);
        }
        if ($shouldShortCircuitReady && $provider === ProvisioningMapping::PROVIDER_CONVOY) {
            try {
                $serverRef = $this->resolveConvoyServerRef($service);
                $response = $serverRef !== '' ? $this->fetchConvoyServer($service, $serverRef) : [];
                $shouldShortCircuitReady = $this->resolveConvoyProvisioningStage($response) === ProvisioningJob::STATUS_READY;
            } catch (Throwable $exception) {
                report($exception);
                $shouldShortCircuitReady = false;
            }
        }

        if ($shouldShortCircuitReady) {
            $job = ProvisioningJob::query()->create([
                'service_id' => $service->id,
                'provider' => $provider,
                'status' => ProvisioningJob::STATUS_READY,
                'attempt_count' => 0,
                'response_payload' => $this->buildProvisioningPayload(null, ProvisioningJob::STATUS_READY, 'Runtime mapping already exists.'),
                'completed_at' => now(),
            ]);

            if ($service->status === Service::STATUS_PENDING) {
                $service->status = Service::STATUS_ACTIVE;
                $service->expires_at = $service->expires_at ?: $service->calculateNextDueDate();
                $service->save();
            }

            $this->recordOperationLog($service, $job, 'success', 'Runtime mapping already exists.', [
                'runtime' => [
                    'runtime_kind' => $provider === ProvisioningMapping::PROVIDER_MANAGED_APP ? 'managed-app' : 'vps',
                    'mapping' => $this->readMapping($service, $provider),
                ],
            ]);

            return $job;
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
            ->whereIn('status', ProvisioningJob::activeStatuses())
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

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function deprovisionManagedApp(Service $service, array $context = []): array
    {
        $service->loadMissing([
            'product.server.settings',
            'product.category',
            'plan',
            'user',
            'properties',
            'configs.configOption',
            'configs.configValue',
        ]);

        if (!$this->supports($service, ProvisioningMapping::PROVIDER_MANAGED_APP)) {
            throw new \RuntimeException('Managed App deprovision is unavailable for this service.');
        }

        $mapping = $this->mappingResolver->resolve($service, ProvisioningMapping::PROVIDER_MANAGED_APP);
        if (!$mapping) {
            $mapping = new ProvisioningMapping([
                'provider' => ProvisioningMapping::PROVIDER_MANAGED_APP,
                'product_id' => $service->product_id,
                'product_slug' => (string) ($service->product?->slug ?? ''),
                'plan_id' => $service->plan_id,
                'plan_name' => (string) ($service->plan?->name ?? ''),
                'enabled' => true,
                'config' => [],
            ]);
            $mapping->exists = false;
        }

        $productSettings = ExtensionHelper::settingsToArray($service->product?->settings ?? []);
        $productSettings = is_array($productSettings) ? $productSettings : [];
        $serviceProperties = ExtensionHelper::getServiceProperties($service);
        $maxAttempts = max((int) ($context['max_attempts'] ?? 3), 1);

        $lastError = null;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $result = $this->managedAppRuntimeClient->deprovision(
                    $service,
                    $mapping,
                    $productSettings,
                    $serviceProperties,
                );

                $runtime = is_array($result['runtime'] ?? null) ? $result['runtime'] : [];
                $properties = is_array($result['properties'] ?? null) ? $result['properties'] : [];
                $stage = $this->normalizeStage((string) ($runtime['status'] ?? ($properties['app_status'] ?? ProvisioningJob::STATUS_DELETING)));
                $message = trim((string) ($result['message'] ?? 'Managed app deprovision submitted.'));
                if ($message === '') {
                    $message = 'Managed app deprovision submitted.';
                }

                $properties['runtime_kind'] = 'managed-app';
                $properties['app_status'] = $stage;
                if ($stage !== ProvisioningJob::STATUS_FAILED) {
                    $properties['app_status_reason'] = '';
                }

                $this->persistProperties($service, $properties);
                $this->recordStandaloneOperationLog(
                    $service,
                    $stage === ProvisioningJob::STATUS_FAILED ? 'failed' : 'success',
                    $message,
                    [
                        'runtime' => $runtime,
                        'properties' => $properties,
                        'context' => $context,
                    ],
                    $stage === ProvisioningJob::STATUS_FAILED ? 'MANAGED_APP_DEPROVISION_FAILED' : null,
                    null,
                    'runtime:deprovision',
                );

                if ($stage === ProvisioningJob::STATUS_FAILED) {
                    throw new \RuntimeException($this->resolveManagedAppFailureMessage($message, $runtime, $properties));
                }

                return [
                    'message' => $message,
                    'runtime' => $runtime,
                    'properties' => $properties,
                ];
            } catch (Throwable $exception) {
                $lastError = $exception;
                report($exception);

                if ($attempt < $maxAttempts) {
                    usleep($attempt * 250000);
                    continue;
                }
            }
        }

        $errorMessage = $lastError ? $lastError->getMessage() : 'Managed app deprovision failed.';
        $this->recordStandaloneOperationLog(
            $service,
            'failed',
            'Managed app deprovision failed.',
            [
                'context' => $context,
            ],
            'MANAGED_APP_DEPROVISION_FAILED',
            $errorMessage,
            'runtime:deprovision',
        );

        throw new \RuntimeException($errorMessage);
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

        $currentStatus = (string) $job->status;
        $managedAppPollingStatus = $job->provider === ProvisioningMapping::PROVIDER_MANAGED_APP
            && in_array($currentStatus, [
                ProvisioningJob::STATUS_QUEUED,
                ProvisioningJob::STATUS_BUILDING,
                ProvisioningJob::STATUS_PUSHING,
                ProvisioningJob::STATUS_DEPLOYING,
            ], true);
        $convoyPollingStatus = $job->provider === ProvisioningMapping::PROVIDER_CONVOY
            && $this->hasMapping($service, ProvisioningMapping::PROVIDER_CONVOY)
            && in_array($currentStatus, [
                ProvisioningJob::STATUS_QUEUED,
                ProvisioningJob::STATUS_BUILDING,
                ProvisioningJob::STATUS_DEPLOYING,
            ], true);

        if (!$managedAppPollingStatus && !$convoyPollingStatus) {
            $job->attempt_count = (int) $job->attempt_count + 1;
        }

        $job->last_attempt_at = now();
        $job->status = ProvisioningJob::STATUS_QUEUED;
        $job->error_message = null;
        $attemptLabel = sprintf('Provisioning attempt #%d started.', max((int) $job->attempt_count, 1));
        if ($managedAppPollingStatus || $convoyPollingStatus) {
            $attemptLabel = sprintf('Provisioning poll resumed (attempt #%d).', max((int) $job->attempt_count, 1));
        }
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, ProvisioningJob::STATUS_QUEUED, $attemptLabel);
        $job->save();

        $context = is_array($job->request_payload['context'] ?? null) ? $job->request_payload['context'] : [];
        $forceReprovision = filter_var((string) ($context['force_reprovision'] ?? false), FILTER_VALIDATE_BOOL);
        $forceReprovisionForAttempt = $forceReprovision
            && (int) $job->attempt_count === 1
            && $currentStatus === ProvisioningJob::STATUS_PENDING;
        if ($forceReprovisionForAttempt) {
            $this->clearMapping($service, $job->provider);
        }

        $overrides = $this->mappingResolver->buildPropertyOverrides($service, $mapping);
        $this->persistProperties($service, $overrides);

        return $job->provider === ProvisioningMapping::PROVIDER_MANAGED_APP
            ? $this->processManagedApp($job, $service, $mapping, $forceReprovisionForAttempt)
            : $this->processConvoy($job, $service, $forceReprovision);
    }

    protected function processConvoy(ProvisioningJob $job, Service $service, bool $forceReprovision): ProvisioningJob
    {
        $existingServerRef = $this->resolveConvoyServerRef($service);

        if (!$forceReprovision && $existingServerRef !== '') {
            try {
                $response = $this->fetchConvoyServer($service, $existingServerRef);

                return $this->syncConvoyProvisioningState(
                    $job,
                    $service,
                    $response,
                    'Convoy runtime synchronized.'
                );
            } catch (Throwable $exception) {
                report($exception);

                return $this->markFailure($job, $exception->getMessage(), 'PROVISIONING_CONVOY_SYNC_FAILED', $service);
            }
        }

        try {
            $this->vpsAppInstallService->prepareConvoyProvisioning($service);
            $response = ExtensionHelper::createServer($service);
            $mapping = $this->syncConvoyMapping($service, $response);
            if ($mapping === []) {
                return $this->markFailure($job, 'Provisioned but no Convoy server mapping was returned.', 'PROVISIONING_MAPPING_WRITE_MISSING', $service, true);
            }

            return $this->syncConvoyProvisioningState(
                $job,
                $service,
                $response,
                'Convoy provisioning started.'
            );
        } catch (Throwable $exception) {
            report($exception);

            return $this->markFailure(
                $job,
                $exception->getMessage(),
                'PROVISIONING_CONVOY_FAILED',
                $service,
                $this->isConvoyTerminalFailure('PROVISIONING_CONVOY_FAILED', $exception->getMessage())
            );
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
        if ($stage !== ProvisioningJob::STATUS_FAILED) {
            $properties['app_status_reason'] = '';
        }
        $this->persistProperties($service, $properties);

        if ($stage === ProvisioningJob::STATUS_READY) {
            return $this->markReady($job, $service, $message, ['runtime' => $runtime, 'properties' => $properties]);
        }

        if ($stage === ProvisioningJob::STATUS_FAILED) {
            $failureMessage = $this->resolveManagedAppFailureMessage($message, $runtime, $properties);
            $failureCode = $this->resolveManagedAppFailureCode((string) ($result['error_code'] ?? ''), $properties);
            $terminal = $this->isManagedAppTerminalFailure($failureCode, $failureMessage);

            return $this->markFailure($job, $failureMessage, $failureCode, $service, $terminal);
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

        if ($job->provider === ProvisioningMapping::PROVIDER_CONVOY) {
            try {
                $this->vpsAppInstallService->queueCheckoutInstalls($service);
            } catch (Throwable $exception) {
                report($exception);
            }
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
        $persisted = false;

        foreach ($payload as $key => $value) {
            if (!is_string($key) || trim($key) === '' || $value === null) {
                continue;
            }

            $normalized = is_scalar($value) ? (string) $value : json_encode($value);
            if (!is_string($normalized)) {
                continue;
            }

            if (trim($normalized) === '') {
                $service->properties()->where('key', $key)->delete();
                $persisted = true;
                continue;
            }

            $service->properties()->updateOrCreate(['key' => $key], ['name' => $key, 'value' => $normalized]);
            $persisted = true;
        }

        if ($persisted) {
            $service->unsetRelation('properties');
        }
    }

    /**
     * @param  mixed  $response
     * @return array<string, string>
     */
    protected function syncConvoyMapping(Service $service, mixed $response): array
    {
        $existing = $this->readMapping($service, ProvisioningMapping::PROVIDER_CONVOY);
        $server = is_array($response) && is_array($response['server'] ?? null)
            ? $response['server']
            : (is_array($response['data'] ?? null) ? $response['data'] : []);
        $password = is_array($response) ? trim((string) ($response['password'] ?? '')) : '';
        $mapping = [
            'runtime_kind' => 'vps',
            'convoy_server_uuid' => (string) ($server['uuid'] ?? ($existing['convoy_server_uuid'] ?? '')),
            'convoy_server_id' => (string) ($server['id'] ?? ($existing['convoy_server_id'] ?? '')),
            'convoy_server_short_id' => (string) ($server['short_id'] ?? ($server['shortId'] ?? ($existing['convoy_server_short_id'] ?? ''))),
            'server_uuid' => (string) ($server['uuid'] ?? ($existing['server_uuid'] ?? '')),
        ];

        if ($password !== '') {
            $mapping['password'] = $password;
            $mapping['account_password'] = $password;
            $mapping['server_password'] = $password;
            $mapping['password_source'] = 'provisioning';
            $mapping['password_updated_at'] = now()->toISOString();
        }

        $this->persistProperties($service, $mapping);

        return $this->readMapping($service, ProvisioningMapping::PROVIDER_CONVOY);
    }

    protected function resolveConvoyFailureMessage(mixed $response, string $fallback): string
    {
        $server = is_array($response) && is_array($response['server'] ?? null)
            ? $response['server']
            : (is_array($response['data'] ?? null) ? $response['data'] : []);

        $candidates = [
            $server['status_message'] ?? null,
            $server['failure_reason'] ?? null,
            $server['error'] ?? null,
            $server['message'] ?? null,
            $fallback,
        ];

        foreach ($candidates as $candidate) {
            $message = trim((string) $candidate);
            if ($message !== '') {
                return $message;
            }
        }

        return 'Convoy reported a VPS build failure.';
    }

    protected function isConvoyTerminalFailure(string $failureCode, string $failureMessage): bool
    {
        $combined = strtoupper(trim($failureCode.' '.$failureMessage));
        if ($combined === '') {
            return false;
        }

        foreach ([
            'EXCEEDS THE NODE\'S LIMIT',
            'MEMORY VALUE EXCEEDS',
            'DISK VALUE EXCEEDS',
            'CPU VALUE EXCEEDS',
            'DOES NOT HAVE ENOUGH FREE',
            'NO AVAILABLE ADDRESS',
            'NO AVAILABLE IPV4',
            'TEMPLATE UUID IS INVALID',
            'SELECTED TEMPLATE UUID IS INVALID',
            'RESOURCE EXHAUSTED',
            'INSUFFICIENT',
            'QUOTA',
            'CAPACITY',
        ] as $marker) {
            if (str_contains($combined, $marker)) {
                return true;
            }
        }

        return false;
    }

    protected function resolveConvoyServerRef(Service $service): string
    {
        $mapping = $this->readMapping($service, ProvisioningMapping::PROVIDER_CONVOY);

        foreach (['convoy_server_uuid', 'server_uuid', 'convoy_server_id', 'convoy_server_short_id'] as $key) {
            $value = trim((string) ($mapping[$key] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * @return array<string, mixed>
     */
    protected function fetchConvoyServer(Service $service, string $serverRef): array
    {
        $service->loadMissing('product.server');

        $extension = ExtensionHelper::getExtension(
            'server',
            (string) ($service->product?->server?->extension ?? ''),
            $service->product?->server?->settings ?? []
        );

        $payload = $extension->getServer($serverRef);

        return is_array($payload) ? $payload : [];
    }

    protected function syncConvoyProvisioningState(ProvisioningJob $job, Service $service, mixed $response, string $fallbackMessage): ProvisioningJob
    {
        $mapping = $this->syncConvoyMapping($service, $response);
        $server = is_array($response) && is_array($response['server'] ?? null)
            ? $response['server']
            : (is_array($response['data'] ?? null) ? $response['data'] : []);

        $rawStatus = strtolower(trim((string) ($server['status'] ?? '')));
        $stage = $this->resolveConvoyProvisioningStage($response);

        $message = trim((string) ($fallbackMessage !== '' ? $fallbackMessage : 'Convoy runtime synchronized.'));
        $message = match ($stage) {
            ProvisioningJob::STATUS_READY => 'VPS runtime is ready.',
            ProvisioningJob::STATUS_BUILDING => 'VPS is still provisioning in Convoy.',
            ProvisioningJob::STATUS_DEPLOYING => 'VPS is still applying runtime changes in Convoy.',
            ProvisioningJob::STATUS_FAILED => 'Convoy reported a VPS build failure.',
            default => $message,
        };

        $payload = [
            'runtime' => [
                'runtime_kind' => 'vps',
                'server_mapping' => $mapping,
                'provider_response' => $response,
            ],
        ];

        if ($stage === ProvisioningJob::STATUS_READY) {
            return $this->markReady($job, $service, $message, $payload);
        }

        if ($stage === ProvisioningJob::STATUS_FAILED) {
            $failureMessage = $this->resolveConvoyFailureMessage($response, $message);

            return $this->markFailure(
                $job,
                $failureMessage,
                'PROVISIONING_CONVOY_BUILD_FAILED',
                $service,
                $this->isConvoyTerminalFailure('PROVISIONING_CONVOY_BUILD_FAILED', $failureMessage)
            );
        }

        $job->status = $stage;
        $job->error_message = null;
        $job->response_payload = $this->buildProvisioningPayload($job->response_payload, $stage, $message, $payload);
        $job->save();
        $this->recordOperationLog($service, $job, $stage, $message, $payload);
        $this->scheduleRetry($job, $this->activePollDelayMs());

        return $job->refresh();
    }

    protected function resolveConvoyProvisioningStage(mixed $response): string
    {
        $server = is_array($response) && is_array($response['server'] ?? null)
            ? $response['server']
            : (is_array($response['data'] ?? null) ? $response['data'] : []);

        $rawStatus = strtolower(trim((string) ($server['status'] ?? '')));

        return match ($rawStatus) {
            '', 'running', 'ready', 'active', 'suspended' => ProvisioningJob::STATUS_READY,
            'installing', 'building', 'provisioning' => ProvisioningJob::STATUS_BUILDING,
            'restoring_backup', 'restoring_snapshot' => ProvisioningJob::STATUS_DEPLOYING,
            'install_failed', 'deletion_failed', 'error', 'failed' => ProvisioningJob::STATUS_FAILED,
            default => ProvisioningJob::STATUS_BUILDING,
        };
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
     * @param  array<string, mixed>  $runtime
     * @param  array<string, mixed>  $properties
     */
    protected function resolveManagedAppFailureMessage(string $fallback, array $runtime, array $properties): string
    {
        $candidates = [
            $properties['app_status_reason'] ?? null,
            $properties['app_rollout_reason'] ?? null,
            $runtime['status_reason'] ?? null,
            $runtime['reason'] ?? null,
            $fallback,
        ];

        foreach ($candidates as $candidate) {
            $message = trim((string) $candidate);
            if ($message !== '') {
                return $message;
            }
        }

        return 'Managed app runtime failed.';
    }

    /**
     * @param  array<string, mixed>  $properties
     */
    protected function resolveManagedAppFailureCode(string $fallback, array $properties): string
    {
        $fallback = trim($fallback);
        if ($fallback !== '') {
            return $fallback;
        }

        $reason = trim((string) ($properties['app_status_reason'] ?? $properties['app_rollout_reason'] ?? ''));
        if ($reason === '') {
            return 'PROVISIONING_MANAGED_APP_FAILED';
        }

        $normalized = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '_', $reason));
        $normalized = trim($normalized, '_');
        if ($normalized === '') {
            return 'PROVISIONING_MANAGED_APP_FAILED';
        }

        return 'PROVISIONING_MANAGED_APP_' . $normalized;
    }

    protected function isManagedAppTerminalFailure(string $failureCode, string $failureMessage): bool
    {
        $combined = strtoupper(trim($failureCode.' '.$failureMessage));
        if ($combined === '') {
            return false;
        }

        $terminalMarkers = [
            'DOCKERFILE',
            'GIT_REPO_INVALID',
            'GIT_REPO',
            'DOMAIN_REQUIRED',
            'SCALE_LIMIT_EXCEEDED',
            'TLS_DOMAIN_REQUIRED',
            'KUBECONFIG_MISSING',
            'KUBECONFIG_LOOPBACK',
        ];

        foreach ($terminalMarkers as $marker) {
            if (str_contains($combined, $marker)) {
                return true;
            }
        }

        return false;
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
            $service->loadMissing(['product', 'properties', 'configs.configOption', 'configs.configValue']);
            $serviceProperties = ExtensionHelper::getServiceProperties($service);
            $operationId = (string) data_get($job->response_payload, 'provisioning.operation_id');
            $endpoint = $this->resolveNotificationValue([
                data_get($payload, 'runtime.endpoint'),
                data_get($payload, 'runtime.ingress_url'),
                data_get($payload, 'properties.app_endpoint'),
                data_get($payload, 'properties.k8s_ingress_url'),
                $serviceProperties['app_endpoint'] ?? null,
                $serviceProperties['k8s_ingress_url'] ?? null,
            ]);
            $serverIp = $this->resolveNotificationValue([
                data_get($payload, 'runtime.primary_ip'),
                data_get($payload, 'runtime.server_mapping.primary_ip'),
                data_get($payload, 'runtime.server_mapping.ip'),
                data_get($payload, 'runtime.provider_response.server.primary_ip'),
                data_get($payload, 'runtime.provider_response.server.ip'),
                $serviceProperties['server_ip'] ?? null,
                $serviceProperties['primary_ip'] ?? null,
                $serviceProperties['ip'] ?? null,
            ]);
            $password = $this->resolveNotificationValue([
                $serviceProperties['password'] ?? null,
                $serviceProperties['account_password'] ?? null,
                $serviceProperties['root_password'] ?? null,
            ]);
            $serverUsername = $this->resolveNotificationValue([
                $serviceProperties['password_login_username'] ?? null,
                $serviceProperties['server_username'] ?? null,
                $serviceProperties['username'] ?? null,
            ]);
            $passwordApplyMode = $this->resolveNotificationValue([
                $serviceProperties['password_apply_mode'] ?? null,
            ]);
            $passwordNote = $this->resolveNotificationValue([
                $serviceProperties['password_note'] ?? null,
            ]);
            $serviceRegion = $this->resolveNotificationValue([
                $serviceProperties['region'] ?? null,
                $serviceProperties['service_region'] ?? null,
            ]);
            $servicePanelUrl = $this->buildFrontendUrl('/services/'.$service->id);
            $invoiceUrl = $this->buildFrontendUrl('/services');

            NotificationHelper::serverCreatedNotification($service->user, $service, [
                'provider' => $job->provider,
                'runtime_kind' => $job->provider === ProvisioningMapping::PROVIDER_MANAGED_APP ? 'managed-app' : 'vps',
                'endpoint' => $endpoint,
                'app_endpoint' => $endpoint,
                'service_name' => (string) $service->label,
                'product_name' => (string) ($service->product?->name ?? $service->label),
                'service_id' => $service->id,
                'service_region' => $serviceRegion,
                'server_ip' => $serverIp,
                'ip' => $serverIp,
                'server_username' => $serverUsername,
                'username' => $serverUsername,
                'password' => $password,
                'password_apply_mode' => $passwordApplyMode,
                'password_restart_required' => filter_var((string) ($serviceProperties['password_restart_required'] ?? false), FILTER_VALIDATE_BOOL),
                'password_note' => $passwordNote,
                'service_panel_url' => $servicePanelUrl,
                'support_link' => $invoiceUrl,
                'operation_id' => $operationId !== '' ? $operationId : null,
            ]);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    protected function notifyFailure(ProvisioningJob $job, string $message, string $errorCode, ?Service $service = null): void
    {
        if (data_get($job->response_payload, 'provisioning.failure_notified_at')) {
            return;
        }

        if ($this->recentFailureNotificationExists($job, $errorCode)) {
            $responsePayload = is_array($job->response_payload) ? $job->response_payload : [];
            data_set($responsePayload, 'provisioning.failure_notified_at', now()->toISOString());
            data_set($responsePayload, 'provisioning.failure_notification_suppressed', true);
            $job->response_payload = $responsePayload;
            $job->save();

            return;
        }

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
            $isInternalConfigurationIssue = in_array($errorCode, [
                'PROVISIONING_MAPPING_NOT_FOUND',
                'PROVISIONING_PROVIDER_UNSUPPORTED',
                'PROVISIONING_MAPPING_WRITE_MISSING',
            ], true);

            if ($isInternalConfigurationIssue) {
                NotificationHelper::sendSystemEmailNotification(
                    subject: '[Sloth Cloud] Provisioning configuration attention required',
                    body: $body,
                    attachments: [],
                    user: null,
                    email: null,
                );
            } else {
            NotificationHelper::sendSystemEmailNotification(
                subject: $subject,
                body: $body,
                attachments: [],
                user: $service->user,
                email: $service->user->email,
            );
            }

            $responsePayload = is_array($job->response_payload) ? $job->response_payload : [];
            data_set($responsePayload, 'provisioning.failure_notified_at', now()->toISOString());
            $job->response_payload = $responsePayload;
            $job->save();
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    protected function recentFailureNotificationExists(ProvisioningJob $job, string $errorCode): bool
    {
        $cooldownMinutes = max((int) config(
            'provisioning.failure_notify_cooldown_minutes',
            env('PROVISIONING_FAILURE_NOTIFY_COOLDOWN_MINUTES', 180)
        ), 1);

        $recentFailures = ProvisioningJob::query()
            ->where('service_id', $job->service_id)
            ->where('provider', $job->provider)
            ->where('id', '!=', $job->id)
            ->where('status', ProvisioningJob::STATUS_FAILED)
            ->where('updated_at', '>=', now()->subMinutes($cooldownMinutes))
            ->latest('id')
            ->limit(10)
            ->get();

        foreach ($recentFailures as $previousFailure) {
            $payload = is_array($previousFailure->response_payload) ? $previousFailure->response_payload : [];
            $previousErrorCode = (string) ($payload['error_code'] ?? '');

            if ($previousErrorCode !== $errorCode) {
                continue;
            }

            if (data_get($payload, 'provisioning.failure_notified_at')) {
                return true;
            }
        }

        return false;
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
            $normalizedMessage = trim($message);
            $normalizedErrorDetail = $errorDetail;

            if ($normalizedMessage !== '' && Str::length($normalizedMessage) > 255) {
                $normalizedErrorDetail = trim(implode("\n\n", array_filter([
                    $normalizedErrorDetail,
                    $normalizedMessage,
                ])));
                $normalizedMessage = Str::limit($normalizedMessage, 252, '...');
            }

            $service->operationLogs()->create([
                'operation_id' => (string) Str::ulid(),
                'user_id' => $service->user_id,
                'source' => 'provisioning',
                'action' => 'provisioning:'.$job->provider,
                'status' => $status,
                'message' => $normalizedMessage,
                'error_code' => $errorCode !== null ? Str::limit(trim($errorCode), 120, '') : null,
                'error_detail' => $normalizedErrorDetail,
                'request_payload' => is_array($job->request_payload) ? $job->request_payload : null,
                'response_payload' => $responsePayload,
                'actor_type' => 'system',
                'actor_id' => null,
            ]);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * @param  array<string, mixed>  $responsePayload
     */
    protected function recordStandaloneOperationLog(
        Service $service,
        string $status,
        string $message,
        array $responsePayload = [],
        ?string $errorCode = null,
        ?string $errorDetail = null,
        string $action = 'provisioning:managed-app'
    ): void {
        try {
            $normalizedMessage = trim($message);
            $normalizedErrorDetail = $errorDetail;

            if ($normalizedMessage !== '' && Str::length($normalizedMessage) > 255) {
                $normalizedErrorDetail = trim(implode("\n\n", array_filter([
                    $normalizedErrorDetail,
                    $normalizedMessage,
                ])));
                $normalizedMessage = Str::limit($normalizedMessage, 252, '...');
            }

            ServiceOperationLog::query()->create([
                'service_id' => $service->id,
                'operation_id' => (string) Str::ulid(),
                'user_id' => $service->user_id,
                'source' => 'provisioning',
                'action' => $action,
                'status' => $status,
                'message' => $normalizedMessage,
                'error_code' => $errorCode !== null ? Str::limit(trim($errorCode), 120, '') : null,
                'error_detail' => $normalizedErrorDetail,
                'request_payload' => null,
                'response_payload' => $responsePayload,
                'actor_type' => 'system',
                'actor_id' => null,
            ]);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * @param  array<int, mixed>  $candidates
     */
    protected function resolveNotificationValue(array $candidates): ?string
    {
        foreach ($candidates as $candidate) {
            $normalized = trim((string) $candidate);
            if ($normalized !== '') {
                return $normalized;
            }
        }

        return null;
    }

    protected function buildFrontendUrl(string $path): ?string
    {
        $base = trim((string) (env('SLOTH_FRONTEND_URL') ?: env('SLOTH_WEB_PUBLIC_URL') ?: ''));
        if ($base === '') {
            return null;
        }

        return rtrim($base, '/').'/'.ltrim($path, '/');
    }
}
