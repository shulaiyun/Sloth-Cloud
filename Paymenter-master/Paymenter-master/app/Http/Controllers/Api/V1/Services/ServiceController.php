<?php

namespace App\Http\Controllers\Api\V1\Services;

use App\Helpers\ExtensionHelper;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Service;
use App\Models\ServiceCancellation;
use App\Models\ServiceOperationLog;
use App\Services\Provisioning\ProvisioningOrchestrator;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ServiceController extends Controller
{
    use SerializesHeadlessResources;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $services = $request->user()
            ->services()
            ->with(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation', 'latestProvisioningJob'])
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate($validated['per_page'] ?? 20);

        return response()->json([
            'data' => $services->getCollection()->map(fn (Service $service) => $this->serializeService($service))->values(),
            'meta' => [
                'current_page' => $services->currentPage(),
                'per_page' => $services->perPage(),
                'total' => $services->total(),
                'last_page' => $services->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $service->load([
            'product.category',
            'plan',
            'currency',
            'configs.configOption',
            'configs.configValue',
            'properties',
            'invoices.currency',
            'invoices.items',
            'invoices.transactions.gateway',
            'billingAgreement.gateway',
            'cancellation',
            'latestProvisioningJob',
        ]);

        $actions = [
            'buttons' => [],
            'views' => [],
            'fields' => [],
        ];

        if ($service->status === Service::STATUS_ACTIVE) {
            try {
                foreach (ExtensionHelper::getActions($service) as $action) {
                    match ($action['type'] ?? null) {
                        'button' => $actions['buttons'][] = $action,
                        'view' => $actions['views'][] = $action,
                        'text' => $actions['fields'][] = $action,
                        default => null,
                    };
                }
            } catch (Exception $exception) {
                report($exception);
            }
        }

        return response()->json([
            'data' => [
                'service' => $this->serializeService($service, true),
                'invoices' => $service->invoices->map(fn ($invoice) => $this->serializeInvoice($invoice))->values(),
                'actions' => $actions,
            ],
        ]);
    }

    public function updateLabel(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'label' => ['nullable', 'string', 'max:255'],
        ]);

        $service->label = $validated['label'] ?? null;
        $service->save();
        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => 'Service label updated.',
            'data' => [
                'service' => $this->serializeService($service, true),
            ],
        ]);
    }

    public function cancel(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        if (!$service->cancellable) {
            return response()->json([
                'message' => 'This service cannot be cancelled.',
            ], 422);
        }

        $validated = $request->validate([
            'type' => ['required', 'in:end_of_period,immediate'],
            'reason' => ['required', 'string'],
        ]);

        $cancellation = ServiceCancellation::query()->updateOrCreate(
            ['service_id' => $service->id],
            [
                'type' => $validated['type'],
                'reason' => $validated['reason'],
            ],
        );

        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => 'Cancellation requested.',
            'data' => [
                'service' => $this->serializeService($service, true),
                'cancellation' => [
                    'id' => $cancellation->id,
                    'type' => $cancellation->type,
                    'reason' => $cancellation->reason,
                    'created_at' => optional($cancellation->created_at)?->toISOString(),
                ],
            ],
        ], 201);
    }

    public function revokeCancellation(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $cancellation = ServiceCancellation::query()
            ->where('service_id', $service->id)
            ->first();

        if (!$cancellation) {
            $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
            $service->load('latestProvisioningJob');

            return response()->json([
                'message' => 'No cancellation request found for this service.',
                'data' => [
                    'service' => $this->serializeService($service, true),
                ],
            ]);
        }

        $cancellation->delete();

        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => 'Cancellation request removed.',
            'data' => [
                'service' => $this->serializeService($service, true),
            ],
        ]);
    }

    public function renew(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $service->load([
            'product.category',
            'plan',
            'currency',
            'billingAgreement.gateway',
            'cancellation',
            'latestProvisioningJob',
        ]);

        if ((string) $service->status === Service::STATUS_CANCELLED) {
            return response()->json([
                'message' => 'Cancelled services cannot be renewed.',
            ], 422);
        }

        if (!$service->plan || in_array((string) $service->plan->type, ['free', 'one-time'], true)) {
            return response()->json([
                'message' => 'This service does not support renewal invoices.',
            ], 422);
        }

        if ($service->cancellation) {
            return response()->json([
                'message' => 'This service already has a cancellation request. Remove cancellation before renewing.',
            ], 422);
        }

        $pendingInvoice = $service->invoices()
            ->where('status', Invoice::STATUS_PENDING)
            ->latest('id')
            ->first();

        if ($pendingInvoice) {
            $pendingInvoice->loadMissing(['currency']);

            return response()->json([
                'message' => 'A pending renewal invoice already exists.',
                'data' => [
                    'invoice' => $this->serializeInvoice($pendingInvoice),
                    'service' => $this->serializeService($service, true),
                ],
            ]);
        }

        // Keep manual renew behavior aligned with cron-generated recurring invoices.
        $invoice = $service->invoices()->make([
            'user_id' => $service->user_id,
            'status' => Invoice::STATUS_PENDING,
            'due_at' => $service->expires_at ?: now(),
            'currency_code' => $service->currency_code,
        ]);
        $invoice->save();

        $invoice->items()->create([
            'reference_id' => $service->id,
            'reference_type' => Service::class,
            'price' => $service->price,
            'quantity' => $service->quantity,
            'description' => $service->description,
        ]);

        $invoice = $invoice->fresh(['currency']);

        return response()->json([
            'message' => 'Renewal invoice created.',
            'data' => [
                'invoice' => $this->serializeInvoice($invoice),
                'service' => $this->serializeService($service, true),
            ],
        ], 201);
    }

    public function action(Request $request, Service $service, string $action): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        if ($service->status !== Service::STATUS_ACTIVE) {
            return response()->json([
                'message' => 'This action is not available for the current service state.',
            ], 422);
        }

        $availableButtons = [];
        try {
            $availableButtons = collect(ExtensionHelper::getActions($service))
                ->filter(fn ($item) => ($item['type'] ?? null) === 'button')
                ->pluck('function')
                ->filter()
                ->values()
                ->all();
        } catch (Exception $exception) {
            report($exception);
        }

        abort_unless(in_array($action, $availableButtons, true), 404);

        $payload = $request->isJson() ? ($request->json()->all() ?? []) : $request->all();
        $result = ExtensionHelper::callServiceAction($service, $action, $payload);

        return response()->json([
            'message' => 'Service action executed.',
            'data' => [
                'redirect_url' => is_string($result) ? $result : null,
            ],
        ]);
    }

    public function operationLogs(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        $logs = $service->operationLogs()
            ->with('user')
            ->latest('id')
            ->limit((int) ($validated['limit'] ?? 10))
            ->get();

        return response()->json([
            'data' => [
                'service_id' => $service->id,
                'logs' => $logs->map(fn (ServiceOperationLog $log) => $this->serializeOperationLog($log))->values(),
            ],
        ]);
    }

    public function storeOperationLog(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'source' => ['sometimes', 'nullable', 'string', 'max:32'],
            'action' => ['required', 'string', 'max:120'],
            'success' => ['sometimes', 'nullable', 'boolean'],
            'code' => ['sometimes', 'nullable', 'string', 'max:120'],
            'message' => ['sometimes', 'nullable', 'string', 'max:255'],
            'detail' => ['sometimes', 'nullable', 'string'],
            'request_payload' => ['sometimes', 'nullable', 'array'],
            'response_payload' => ['sometimes', 'nullable', 'array'],
        ]);

        $log = $service->operationLogs()->create([
            'operation_id' => (string) Str::ulid(),
            'user_id' => $request->user()?->id,
            'source' => trim((string) ($validated['source'] ?? 'client')) ?: 'client',
            'action' => $validated['action'],
            'status' => match ($validated['success'] ?? null) {
                true => 'success',
                false => 'failed',
                default => 'submitted',
            },
            'message' => $validated['message'] ?? null,
            'error_code' => $validated['code'] ?? null,
            'error_detail' => $validated['detail'] ?? null,
            'request_payload' => $this->sanitizeOperationPayload($validated['request_payload'] ?? null),
            'response_payload' => $this->sanitizeOperationPayload($validated['response_payload'] ?? null),
            'actor_type' => 'user',
            'actor_id' => $request->user()?->id,
        ]);

        $log->load('user');

        return response()->json([
            'message' => 'Service operation log recorded.',
            'data' => [
                'log' => $this->serializeOperationLog($log),
            ],
            'action_result' => $this->serializeActionResult($log),
        ], 201);
    }

    public function provisioning(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $service->load([
            'latestProvisioningJob',
            'provisioningJobs' => fn ($query) => $query->latest('id')->limit(10),
        ]);

        return response()->json([
            'data' => [
                'service_id' => $service->id,
                'latest' => $service->latestProvisioningJob
                    ? $this->serializeProvisioningJob($service->latestProvisioningJob)
                    : null,
                'history' => $service->provisioningJobs
                    ->map(fn ($job) => $this->serializeProvisioningJob($job))
                    ->values(),
            ],
        ]);
    }

    public function retryProvisioning(Request $request, Service $service, ProvisioningOrchestrator $orchestrator): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'force' => ['sometimes', 'boolean'],
        ]);

        $provider = $orchestrator->providerForService($service);

        if (!$provider || !$orchestrator->supports($service, $provider)) {
            return response()->json([
                'message' => 'Provisioning is not enabled for this service.',
            ], 422);
        }

        $forceReprovision = (bool) ($validated['force'] ?? false);
        $job = $orchestrator->enqueueForService($service, $provider, [
            'trigger' => 'user.retry',
            'force_reprovision' => $forceReprovision,
        ]);

        return response()->json([
            'message' => 'Provisioning retry has been scheduled.',
            'data' => [
                'job_id' => $job->id,
                'status' => $job->status,
                'current_stage' => data_get($job->response_payload, 'provisioning.current_stage'),
                'attempt_count' => (int) $job->attempt_count,
                'force' => $forceReprovision,
            ],
        ], 202);
    }

    protected function serializeProvisioningJob(object $job): array
    {
        $responsePayload = is_array($job->response_payload ?? null) ? $job->response_payload : [];
        $provisioning = is_array($responsePayload['provisioning'] ?? null) ? $responsePayload['provisioning'] : [];
        $failure = is_array($responsePayload['failure'] ?? null) ? $responsePayload['failure'] : [];

        return [
            'id' => $job->id,
            'status' => $job->status,
            'provider' => $job->provider,
            'attempt_count' => (int) $job->attempt_count,
            'current_stage' => $provisioning['current_stage'] ?? $job->status,
            'last_reason' => $provisioning['last_reason'] ?? null,
            'stage_timeline' => is_array($provisioning['timeline'] ?? null) ? $provisioning['timeline'] : [],
            'error_message' => $job->error_message,
            'error_code' => $responsePayload['error_code'] ?? null,
            'failure' => [
                'code' => $failure['code'] ?? ($responsePayload['error_code'] ?? null),
                'message' => $failure['message'] ?? $job->error_message,
                'provider' => $failure['provider'] ?? $job->provider,
                'attempt_count' => $failure['attempt_count'] ?? (int) $job->attempt_count,
                'retry_available' => $failure['retry_available'] ?? null,
            ],
            'last_attempt_at' => optional($job->last_attempt_at)?->toISOString(),
            'completed_at' => optional($job->completed_at)?->toISOString(),
            'created_at' => optional($job->created_at)?->toISOString(),
            'updated_at' => optional($job->updated_at)?->toISOString(),
        ];
    }

    protected function serializeOperationLog(ServiceOperationLog $log): array
    {
        return [
            'id' => $log->id,
            'operation_id' => $log->operation_id,
            'action' => $log->action,
            'source' => $log->source,
            'success' => $log->success,
            'status' => $log->status,
            'code' => $log->error_code,
            'message' => $log->message,
            'detail' => $log->error_detail,
            'request_payload' => $log->request_payload,
            'response_payload' => $log->response_payload,
            'actor' => $log->user ? [
                'id' => $log->user->id,
                'name' => $log->user->name,
                'email' => $log->user->email,
            ] : null,
            'created_at' => optional($log->created_at)?->toISOString(),
            'updated_at' => optional($log->updated_at)?->toISOString(),
        ];
    }

    protected function serializeActionResult(ServiceOperationLog $log): array
    {
        return [
            'success' => (bool) ($log->success ?? false),
            'code' => $log->error_code,
            'detail' => $log->error_detail,
            'operation_id' => $log->operation_id,
        ];
    }

    protected function sanitizeOperationPayload(mixed $payload): mixed
    {
        if (!is_array($payload)) {
            return $payload;
        }

        $sanitized = [];
        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (in_array($normalizedKey, [
                'password',
                'password_confirmation',
                'account_password',
                'accountpassword',
                'root_password',
                'rootpassword',
                'authorization',
                'token',
                'api_key',
                'apikey',
                'app_key',
                'appkey',
                'secret',
            ], true)) {
                $sanitized[$key] = '[redacted]';
                continue;
            }

            $sanitized[$key] = is_array($value)
                ? $this->sanitizeOperationPayload($value)
                : $value;
        }

        return $sanitized;
    }
}
