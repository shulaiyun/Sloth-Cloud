<?php

namespace App\Http\Controllers\Api\V1\Services;

use App\Helpers\ExtensionHelper;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceCancellation;
use App\Services\Provisioning\ProvisioningOrchestrator;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $result = ExtensionHelper::callService($service, $action);

        return response()->json([
            'message' => 'Service action executed.',
            'data' => [
                'redirect_url' => is_string($result) ? $result : null,
            ],
        ]);
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
                'latest' => $service->latestProvisioningJob ? [
                    'id' => $service->latestProvisioningJob->id,
                    'status' => $service->latestProvisioningJob->status,
                    'provider' => $service->latestProvisioningJob->provider,
                    'attempt_count' => (int) $service->latestProvisioningJob->attempt_count,
                    'error_message' => $service->latestProvisioningJob->error_message,
                    'last_attempt_at' => optional($service->latestProvisioningJob->last_attempt_at)?->toISOString(),
                    'completed_at' => optional($service->latestProvisioningJob->completed_at)?->toISOString(),
                ] : null,
                'history' => $service->provisioningJobs->map(fn ($job) => [
                    'id' => $job->id,
                    'status' => $job->status,
                    'provider' => $job->provider,
                    'attempt_count' => (int) $job->attempt_count,
                    'error_message' => $job->error_message,
                    'last_attempt_at' => optional($job->last_attempt_at)?->toISOString(),
                    'completed_at' => optional($job->completed_at)?->toISOString(),
                    'created_at' => optional($job->created_at)?->toISOString(),
                ])->values(),
            ],
        ]);
    }

    public function retryProvisioning(Request $request, Service $service, ProvisioningOrchestrator $orchestrator): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        if (!$orchestrator->supports($service, 'convoy')) {
            return response()->json([
                'message' => 'Provisioning is not enabled for this service.',
            ], 422);
        }

        $job = $orchestrator->enqueueForService($service, 'convoy', [
            'trigger' => 'user.retry',
        ]);

        return response()->json([
            'message' => 'Provisioning retry has been scheduled.',
            'data' => [
                'job_id' => $job->id,
                'status' => $job->status,
                'attempt_count' => (int) $job->attempt_count,
            ],
        ], 202);
    }
}
