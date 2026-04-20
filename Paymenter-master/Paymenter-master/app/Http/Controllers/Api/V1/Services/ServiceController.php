<?php

namespace App\Http\Controllers\Api\V1\Services;

use App\Events\Invoice\Created as InvoiceCreated;
use App\Helpers\ExtensionHelper;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Jobs\Server\TerminateJob;
use App\Models\Invoice;
use App\Models\ProvisioningMapping;
use App\Models\Product;
use App\Models\Service;
use App\Models\ServiceCancellation;
use App\Models\ServiceConfig;
use App\Models\ServiceOperationLog;
use App\Models\ServiceUpgrade;
use App\Models\VpsAppInstall;
use App\Services\Provisioning\ProvisioningOrchestrator;
use App\Services\ServiceUpgrade\ServiceUpgradeService;
use App\Services\VpsApps\VpsAppInstallService;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ServiceController extends Controller
{
    use SerializesHeadlessResources;

    /**
     * @return array<int, string>
     */
    protected function runtimeMappingKeys(string $provider): array
    {
        return $provider === ProvisioningMapping::PROVIDER_MANAGED_APP
            ? [
                'runtime_kind',
                'managed_app_cluster_ref',
                'managed_app_namespace',
                'managed_app_workload',
                'managed_app_service',
                'managed_app_domain',
            ]
            : [
                'convoy_server_uuid',
                'convoy_server_id',
                'convoy_server_short_id',
                'server_uuid',
            ];
    }

    /**
     * @return array<string, string>
     */
    protected function readRuntimeMapping(Service $service, string $provider): array
    {
        $service->loadMissing('properties');

        return $service->properties
            ->whereIn('key', $this->runtimeMappingKeys($provider))
            ->reduce(function (array $carry, $property) {
                $key = trim((string) ($property->key ?? ''));
                $value = trim((string) ($property->value ?? ''));

                if ($key !== '' && $value !== '') {
                    $carry[$key] = $value;
                }

                return $carry;
            }, []);
    }

    protected function clearRuntimeMappingKeys(Service $service, string $provider): int
    {
        $deleted = $service->properties()
            ->whereIn('key', $this->runtimeMappingKeys($provider))
            ->delete();

        $service->unsetRelation('properties');

        return $deleted;
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $services = $request->user()
            ->services()
            ->with(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation', 'latestProvisioningJob', 'properties'])
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
            } catch (\Throwable $exception) {
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

    public function apps(Request $request, Service $service, VpsAppInstallService $installService): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        return response()->json([
            'data' => $installService->appsPayload($service),
        ]);
    }

    public function prepareReinstallApps(Request $request, Service $service, VpsAppInstallService $installService): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'selected_os' => ['required', 'string', 'max:255'],
            'primary_app_slug' => ['nullable', 'string', 'max:255'],
            'addon_app_slugs' => ['nullable', 'array'],
            'addon_app_slugs.*' => ['string', 'max:255'],
            'preview_only' => ['sometimes', 'boolean'],
        ]);

        $selection = $installService->prepareReinstallSelection(
            $service,
            $validated['selected_os'],
            $validated['primary_app_slug'] ?? null,
            $validated['addon_app_slugs'] ?? [],
            $request->user(),
            (bool) ($validated['preview_only'] ?? false),
        );

        if ((bool) ($validated['preview_only'] ?? false)) {
            return response()->json([
                'message' => 'Reinstall app plan validated.',
                'data' => [
                    'selection' => $selection,
                ],
            ]);
        }

        $service->refresh();

        return response()->json([
            'message' => 'Reinstall app plan prepared.',
            'data' => [
                'apps' => $installService->appsPayload($service),
            ],
        ], 202);
    }

    public function installApps(Request $request, Service $service, VpsAppInstallService $installService): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'addon_app_slugs' => ['required', 'array', 'min:1'],
            'addon_app_slugs.*' => ['string', 'max:255'],
        ]);

        $installs = $installService->queueAddonInstalls(
            $service,
            $validated['addon_app_slugs'],
            'service-page',
            $request->user(),
        );

        $service->refresh();

        return response()->json([
            'message' => 'Addon app installation queued.',
            'data' => [
                'service_id' => $service->id,
                'queued' => array_map(
                    fn (VpsAppInstall $install) => $installService->serializeInstall($install),
                    $installs,
                ),
                'apps' => $installService->appsPayload($service),
            ],
        ], 202);
    }

    public function retryAppInstall(
        Request $request,
        Service $service,
        VpsAppInstall $install,
        VpsAppInstallService $installService
    ): JsonResponse {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $install = $installService->retryInstall($service, $install, $request->user());
        $service->refresh();

        return response()->json([
            'message' => 'App installation retry queued.',
            'data' => [
                'install' => $installService->serializeInstall($install),
                'apps' => $installService->appsPayload($service),
            ],
        ], 202);
    }

    public function appInstallLogs(
        Request $request,
        Service $service,
        VpsAppInstall $install,
        VpsAppInstallService $installService
    ): JsonResponse {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);
        abort_unless((int) $install->service_id === (int) $service->id, 404);

        return response()->json([
            'data' => [
                'service_id' => $service->id,
                'install_id' => $install->id,
                'logs' => $installService->serializeInstall($install)['logs'] ?? [],
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

    public function cancel(Request $request, Service $service, ProvisioningOrchestrator $orchestrator): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        if (!$service->cancellable) {
            return response()->json([
                'message' => 'This service cannot be cancelled.',
            ], 422);
        }

        $request->merge([
            'current_password' => $request->input('current_password', $request->input('currentPassword')),
        ]);

        $validated = $request->validate([
            'type' => ['required', 'in:end_of_period,immediate'],
            'reason' => ['nullable', 'string'],
            'current_password' => ['required', 'string', 'min:8', 'max:255'],
        ]);

        if (!Hash::check((string) $validated['current_password'], (string) ($request->user()?->password ?? ''))) {
            return response()->json([
                'message' => 'Current account password is incorrect.',
            ], 422);
        }

        $teardownFailure = null;

        if ($validated['type'] === 'immediate') {
            $provider = $orchestrator->providerForService($service);

            try {
                if ($provider === ProvisioningMapping::PROVIDER_MANAGED_APP) {
                    $orchestrator->deprovisionManagedApp($service, [
                        'trigger' => 'user.cancel.immediate',
                        'source' => 'customer.api',
                        'max_attempts' => max((int) config('provisioning.max_attempts', 3), 1),
                    ]);
                } else {
                    TerminateJob::dispatchSync($service, false);
                }
            } catch (\Throwable $exception) {
                report($exception);

                try {
                    $service->operationLogs()->create([
                        'operation_id' => (string) Str::ulid(),
                        'user_id' => $request->user()?->id,
                        'source' => 'api',
                        'action' => 'service:cancel:immediate',
                        'status' => 'failed',
                        'message' => 'Immediate cancellation failed because runtime teardown did not complete.',
                        'error_code' => 'SERVICE_IMMEDIATE_CANCEL_DEPROVISION_FAILED',
                        'error_detail' => $exception->getMessage(),
                        'request_payload' => $this->sanitizeOperationPayload($validated),
                        'response_payload' => null,
                        'actor_type' => 'user',
                        'actor_id' => $request->user()?->id,
                    ]);
                } catch (\Throwable $logException) {
                    report($logException);
                }

                $teardownFailure = $exception;
            }
        }

        $cancellation = ServiceCancellation::query()->updateOrCreate(
            ['service_id' => $service->id],
            [
                'type' => $validated['type'],
                'reason' => trim((string) ($validated['reason'] ?? 'Requested by customer.')),
            ],
        );

        $teardownFailureMessage = $teardownFailure?->getMessage() ?? '';
        $teardownFailureLooksMissing = $teardownFailure
            && (
                str_contains(strtolower($teardownFailureMessage), 'server does not exist')
                || str_contains(strtolower($teardownFailureMessage), 'not found')
            );

        if ($validated['type'] === 'immediate' && (!$teardownFailure || $teardownFailureLooksMissing)) {
            $this->clearRuntimeMappingKeys($service, $provider ?? ProvisioningMapping::PROVIDER_CONVOY);

            if ((string) $service->status !== Service::STATUS_CANCELLED) {
                $service->update(['status' => Service::STATUS_CANCELLED]);
            }

            $service->invoices()->where('status', Invoice::STATUS_PENDING)->update(['status' => Invoice::STATUS_CANCELLED]);
        }

        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => $teardownFailure
                ? 'Cancellation request recorded. Runtime cleanup did not complete and may need retry.'
                : 'Cancellation requested.',
            'data' => [
                'service' => $this->serializeService($service, true),
                'cancellation' => [
                    'id' => $cancellation->id,
                    'type' => $cancellation->type,
                    'reason' => $cancellation->reason,
                    'created_at' => optional($cancellation->created_at)?->toISOString(),
                ],
                'runtime_cleanup_pending' => $teardownFailure !== null && !$teardownFailureLooksMissing,
                'runtime_cleanup_error' => $teardownFailure ? $teardownFailureMessage : null,
            ],
        ], $teardownFailure ? 202 : 201);
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

    public function upgradeOptions(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $service->load([
            'product.category',
            'product.upgrades',
            'product.upgradableConfigOptions.children.plans.prices',
            'plan',
            'currency',
            'configs',
            'latestProvisioningJob',
            'cancellation',
        ]);

        if (!$service->upgradable) {
            return response()->json([
                'message' => 'This service is not upgradable.',
            ], 422);
        }

        $candidateProducts = collect([$service->product])
            ->merge($this->resolveUpgradeCandidateProducts($service))
            ->filter(fn ($product) => $product instanceof Product)
            ->unique('id')
            ->values();

        $products = $candidateProducts->map(function (Product $product) use ($service) {
            $product->loadMissing(['upgradableConfigOptions.children.plans.prices']);

            $plan = $product->availablePlans($service->currency_code)
                ->where('billing_period', $service->plan->billing_period)
                ->where('billing_unit', $service->plan->billing_unit)
                ->first();

            if (!$plan) {
                return null;
            }

            return [
                'id' => (string) $product->id,
                'slug' => (string) $product->slug,
                'name' => localized_text_payload($product->name, $product->name_translations),
                'description' => localized_text_payload($product->description, $product->description_translations),
                'current' => (int) $product->id === (int) $service->product_id,
                'plan' => [
                    'id' => (string) $plan->id,
                    'name' => localized_text_payload($plan->name, $plan->name_translations),
                    'billing_period' => $plan->billing_period,
                    'billing_unit' => $plan->billing_unit,
                ],
                'config_options' => $product->upgradableConfigOptions
                    ->map(fn ($option) => $this->serializeConfigOption($option))
                    ->values()
                    ->all(),
                'selected_config' => $this->currentUpgradeConfigSelection($service, $product),
            ];
        })->filter()->values();

        return response()->json([
            'data' => [
                'service_id' => (string) $service->id,
                'current_product_id' => (string) $service->product_id,
                'current_plan_id' => (string) $service->plan_id,
                'products' => $products,
            ],
        ]);
    }

    public function upgrade(Request $request, Service $service, ServiceUpgradeService $serviceUpgradeService): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $service->load([
            'product.category',
            'product.upgrades',
            'product.upgradableConfigOptions.children',
            'plan',
            'currency',
            'configs',
            'cancellation',
            'latestProvisioningJob',
            'upgrade',
        ]);

        if (!$service->upgradable) {
            return response()->json([
                'message' => 'This service is not upgradable.',
            ], 422);
        }

        $validated = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'config_options' => ['nullable', 'array'],
        ]);

        $requestedProductId = (int) ($validated['product_id'] ?? $service->product_id);
        $candidateProducts = collect([$service->product])
            ->merge($this->resolveUpgradeCandidateProducts($service))
            ->filter(fn ($product) => $product instanceof Product)
            ->unique('id')
            ->values();

        /** @var Product|null $upgradeProduct */
        $upgradeProduct = $candidateProducts->first(fn (Product $product) => (int) $product->id === $requestedProductId);
        if (!$upgradeProduct) {
            return response()->json([
                'message' => 'Invalid upgrade target.',
            ], 422);
        }

        $upgradeProduct->loadMissing(['upgradableConfigOptions.children']);

        $upgradePlan = $upgradeProduct->availablePlans($service->currency_code)
            ->where('billing_period', $service->plan->billing_period)
            ->where('billing_unit', $service->plan->billing_unit)
            ->first();

        if (!$upgradePlan) {
            return response()->json([
                'message' => 'Invalid upgrade plan.',
            ], 422);
        }

        $currentSelections = $this->currentUpgradeConfigSelection($service, $upgradeProduct);
        $submittedSelections = is_array($validated['config_options'] ?? null) ? $validated['config_options'] : [];
        $resolvedSelections = [];

        foreach ($upgradeProduct->upgradableConfigOptions as $option) {
            if (in_array($option->type, ['text', 'number', 'checkbox'], true)) {
                continue;
            }

            $requestedValueId = (int) ($submittedSelections[(string) $option->id] ?? $submittedSelections[$option->id] ?? $currentSelections[(string) $option->id] ?? 0);
            $selectedChild = $option->children->first(fn ($child) => (int) $child->id === $requestedValueId)
                ?? $option->children->first();

            if (!$selectedChild) {
                return response()->json([
                    'message' => 'One or more upgrade configuration selections are invalid.',
                ], 422);
            }

            $resolvedSelections[(int) $option->id] = (int) $selectedChild->id;
        }

        $normalizedCurrentSelections = [];
        foreach ($currentSelections as $optionId => $valueId) {
            $normalizedCurrentSelections[(int) $optionId] = (int) $valueId;
        }
        ksort($resolvedSelections);
        ksort($normalizedCurrentSelections);

        if ((int) $upgradeProduct->id === (int) $service->product_id && $resolvedSelections === $normalizedCurrentSelections) {
            return response()->json([
                'message' => 'You have not changed anything. Please select a different configuration.',
            ], 422);
        }

        $upgrade = new ServiceUpgrade([
            'service_id' => $service->id,
            'product_id' => $upgradeProduct->id,
            'plan_id' => $upgradePlan->id,
        ]);
        $upgrade->save();

        foreach ($resolvedSelections as $optionId => $valueId) {
            $upgrade->configs()->create([
                'config_option_id' => $optionId,
                'config_value_id' => $valueId,
            ]);
        }

        $upgrade->load('configs.configValue');
        $price = $upgrade->calculatePrice();

        if ($price->price <= 0) {
            $serviceUpgradeService->handle($upgrade);

            $creditAdded = 0.0;
            if (config('settings.credits_on_downgrade', true) && $price->price < 0) {
                $creditAdded = abs((float) $price->price);
                $credit = $request->user()->credits()->where('currency_code', $price->currency->code)->first();
                if ($credit) {
                    $credit->increment('amount', $creditAdded);
                } else {
                    $request->user()->credits()->create([
                        'currency_code' => $price->currency->code,
                        'amount' => $creditAdded,
                    ]);
                }
            }

            $service->refresh();
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

            return response()->json([
                'message' => $price->price < 0
                    ? 'Service downgrade completed. Remaining value has been added to your account credit.'
                    : 'Service configuration updated successfully.',
                'data' => [
                    'applied' => true,
                    'credit_added' => $creditAdded,
                    'service' => $this->serializeService($service, true),
                ],
            ]);
        }

        $invoice = new Invoice([
            'currency_code' => $service->currency_code,
            'status' => Invoice::STATUS_PENDING,
            'due_at' => Carbon::now()->addDays(7),
            'user_id' => $service->user_id,
        ]);
        $invoice->save();

        $upgrade->invoice_id = $invoice->id;
        $upgrade->save();

        $invoice->items()->create([
            'description' => 'Upgrade '.$service->product->name.' to '.$upgradeProduct->name,
            'price' => $price->price,
            'quantity' => 1,
            'reference_id' => $upgrade->id,
            'reference_type' => ServiceUpgrade::class,
        ]);

        event(new InvoiceCreated($invoice));
        $invoice->loadMissing(['currency']);

        return response()->json([
            'message' => 'Upgrade invoice created.',
            'data' => [
                'applied' => false,
                'invoice' => $this->serializeInvoice($invoice),
                'service' => $this->serializeService($service, true),
            ],
        ], 201);
    }

    public function storePassword(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:255'],
            'source' => ['sometimes', 'nullable', 'string', 'max:32'],
            'username' => ['sometimes', 'nullable', 'string', 'max:64'],
            'apply_mode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'restart_required' => ['sometimes', 'boolean'],
            'applied_live' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $password = trim((string) $validated['password']);
        $source = trim((string) ($validated['source'] ?? 'runtime'));

        foreach ([
            'password' => 'Server Password',
            'account_password' => 'Server Account Password',
        ] as $key => $name) {
            $service->properties()->updateOrCreate(
                ['key' => $key],
                ['name' => $name, 'value' => $password],
            );
        }

        $service->properties()->updateOrCreate(
            ['key' => 'password_source'],
            ['name' => 'Password Source', 'value' => $source !== '' ? $source : 'runtime'],
        );

        $service->properties()->updateOrCreate(
            ['key' => 'password_updated_at'],
            ['name' => 'Password Updated At', 'value' => now()->toISOString()],
        );

        if (array_key_exists('username', $validated)) {
            $username = trim((string) ($validated['username'] ?? ''));
            $service->properties()->updateOrCreate(
                ['key' => 'password_login_username'],
                ['name' => 'Password Login Username', 'value' => $username],
            );
        }

        if (array_key_exists('apply_mode', $validated)) {
            $applyMode = trim((string) ($validated['apply_mode'] ?? ''));
            $service->properties()->updateOrCreate(
                ['key' => 'password_apply_mode'],
                ['name' => 'Password Apply Mode', 'value' => $applyMode],
            );
        }

        if (array_key_exists('restart_required', $validated)) {
            $service->properties()->updateOrCreate(
                ['key' => 'password_restart_required'],
                ['name' => 'Password Restart Required', 'value' => ($validated['restart_required'] ?? false) ? '1' : '0'],
            );
        }

        if (array_key_exists('applied_live', $validated)) {
            $service->properties()->updateOrCreate(
                ['key' => 'password_applied_live'],
                ['name' => 'Password Applied Live', 'value' => ($validated['applied_live'] ?? false) ? '1' : '0'],
            );
        }

        if (array_key_exists('note', $validated)) {
            $note = trim((string) ($validated['note'] ?? ''));
            $service->properties()->updateOrCreate(
                ['key' => 'password_note'],
                ['name' => 'Password Note', 'value' => $note],
            );
        }

        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => 'Service password has been stored.',
            'data' => [
                'service' => $this->serializeService($service, true),
            ],
        ]);
    }

    public function clearRuntimeMapping(Request $request, Service $service): JsonResponse
    {
        abort_unless((int) $service->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'provider' => ['sometimes', 'nullable', 'in:convoy,managed-app'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:120'],
            'current_refs' => ['sometimes', 'array'],
            'current_refs.*' => ['sometimes', 'string', 'max:255'],
            'force' => ['sometimes', 'boolean'],
        ]);

        $provider = (string) ($validated['provider'] ?? ProvisioningMapping::PROVIDER_CONVOY);
        $force = (bool) ($validated['force'] ?? false);
        $currentRefs = collect($validated['current_refs'] ?? [])
            ->map(fn ($value) => trim((string) $value))
            ->filter(fn ($value) => $value !== '')
            ->values();
        $existingMapping = $this->readRuntimeMapping($service, $provider);
        $matched = $force
            || $currentRefs->isEmpty()
            || collect($existingMapping)->contains(fn (string $value) => $currentRefs->contains($value));
        $deleted = $matched ? $this->clearRuntimeMappingKeys($service, $provider) : 0;

        $service->load(['product.category', 'plan', 'currency', 'billingAgreement.gateway', 'cancellation']);
        $service->load('latestProvisioningJob');

        return response()->json([
            'message' => $deleted > 0
                ? 'Runtime mapping cleared.'
                : ($matched ? 'No runtime mapping keys were present.' : 'Runtime mapping did not match the provided refs.'),
            'data' => [
                'service' => $this->serializeService($service, true),
                'mapping' => [
                    'provider' => $provider,
                    'matched' => $matched,
                    'cleared' => $deleted > 0,
                    'deleted_count' => $deleted,
                    'reason' => trim((string) ($validated['reason'] ?? '')) ?: null,
                    'current_refs' => $currentRefs->all(),
                    'existing' => $existingMapping,
                    'keys' => $this->runtimeMappingKeys($provider),
                ],
            ],
        ]);
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
            'account_password' => [
                'sometimes',
                'string',
                'min:8',
                'max:50',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,50}$/',
            ],
        ]);

        $overridePassword = trim((string) ($validated['account_password'] ?? ''));
        if ($overridePassword !== '') {
            foreach ([
                'password' => 'Server Password',
                'server_password' => 'Server Password',
                'account_password' => 'Server Account Password',
            ] as $key => $name) {
                $service->properties()->updateOrCreate(
                    ['key' => $key],
                    ['name' => $name, 'value' => $overridePassword],
                );
            }

            $service->properties()->updateOrCreate(
                ['key' => 'password_source'],
                ['name' => 'Password Source', 'value' => 'retry'],
            );

            $service->properties()->updateOrCreate(
                ['key' => 'password_updated_at'],
                ['name' => 'Password Updated At', 'value' => now()->toISOString()],
            );
        }

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

    protected function currentUpgradeConfigSelection(Service $service, Product $product): array
    {
        $service->loadMissing(['configs', 'product.upgradableConfigOptions.children']);
        $currentConfigs = $service->configs->pluck('config_value_id', 'config_option_id');
        $selection = [];

        foreach ($product->upgradableConfigOptions as $option) {
            $selectedValueId = $currentConfigs->get($option->id);
            $selectedChild = $option->children->first(fn ($child) => (int) $child->id === (int) $selectedValueId)
                ?? $option->children->first();

            if ($selectedChild) {
                $selection[(string) $option->id] = (string) $selectedChild->id;
            }
        }

        return $selection;
    }

    /**
     * Build upgrade candidates for headless/API flows.
     * If explicit product-upgrade links are missing, fall back to products in the same category
     * so users can still do same-node resize (e.g. 1C1G <-> 2C2G <-> 4C6G).
     */
    protected function resolveUpgradeCandidateProducts(Service $service)
    {
        $explicit = $service->productUpgrades()
            ->filter(fn ($product) => $product instanceof Product)
            ->values();

        if ($explicit->isNotEmpty()) {
            return $explicit;
        }

        $categoryId = (int) ($service->product?->category_id ?? 0);
        if ($categoryId <= 0) {
            return collect();
        }

        $query = Product::query()
            ->where('category_id', $categoryId)
            ->with([
                'plans.prices',
                'upgradableConfigOptions.children.plans.prices',
            ]);

        if (Schema::hasColumn('products', 'enabled')) {
            $query->where('enabled', true);
        }

        return $query
            ->orderBy('id')
            ->get();
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
