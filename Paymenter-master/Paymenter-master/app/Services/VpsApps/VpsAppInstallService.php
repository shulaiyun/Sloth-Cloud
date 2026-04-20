<?php

namespace App\Services\VpsApps;

use App\Helpers\ExtensionHelper;
use App\Helpers\NotificationHelper;
use App\Jobs\VpsApps\ProcessVpsAppInstallJob;
use App\Models\Service;
use App\Models\User;
use App\Models\VpsApp;
use App\Models\VpsAppInstall;
use App\Models\VpsAppRecipe;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VpsAppInstallService
{
    public function __construct(
        protected VpsAppCatalogService $catalogService,
        protected VpsAppSshExecutor $sshExecutor,
    ) {}

    public function prepareConvoyProvisioning(Service $service): void
    {
        $service->loadMissing(['product.server.settings', 'product.settings', 'properties']);
        if (!$service->product || !$this->catalogService->isVpsProduct($service->product)) {
            return;
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $selectedOs = $this->catalogService->selectedOsForService($service);
        if (!$selectedOs) {
            return;
        }

        $primarySlug = trim((string) ($properties['primary_app_slug'] ?? '')) ?: null;
        $addonSlugs = $this->decodeJsonList($properties['addon_app_slugs'] ?? null);
        try {
            $selection = $this->catalogService->resolveSelection(
                $service->product,
                $selectedOs,
                $primarySlug,
                $addonSlugs,
            );
        } catch (ValidationException $exception) {
            $hasLegacySelection = $primarySlug !== null || $addonSlugs !== [];
            if (!$hasLegacySelection || !$this->canFallbackToPureSystemSelection($exception)) {
                throw $exception;
            }

            // Keep VPS provisioning unblocked when legacy app picks are incompatible
            // with the currently selected OS (for example Debian 11 without app recipes).
            $this->deleteProperty($service, 'primary_app_slug');
            $this->persistProperty($service, 'addon_app_slugs', json_encode([], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $this->deleteProperty($service, 'install_template_ref');
            $this->deleteProperty($service, 'primary_app_effective_strategy');

            $selection = $this->catalogService->resolveSelection(
                $service->product,
                $selectedOs,
                null,
                [],
            );
        }

        $this->persistProperty($service, 'selected_os', $selection['os']);
        $this->persistProperty($service, 'addon_app_slugs', json_encode($selection['addon_slugs'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $this->persistProperty($service, 'primary_app_slug', $selection['primary']['app']->slug ?? null);

        $primary = $selection['primary'];
        if (!$primary) {
            $this->deleteProperty($service, 'install_template_ref');
            $this->deleteProperty($service, 'primary_app_effective_strategy');

            return;
        }

        $this->persistProperty($service, 'primary_app_effective_strategy', $primary['effective_install_strategy']);
        $this->persistProperty($service, 'primary_app_recipe_id', (string) $primary['recipe']->id);

        if (
            $primary['effective_install_strategy'] === VpsAppRecipe::STRATEGY_TEMPLATE
            && trim((string) $primary['recipe']->template_ref) !== ''
        ) {
            $this->persistProperty($service, 'install_template_ref', (string) $primary['recipe']->template_ref);

            return;
        }

        $this->deleteProperty($service, 'install_template_ref');
    }

    /**
     * @return array<int, VpsAppInstall>
     */
    public function queueCheckoutInstalls(Service $service): array
    {
        $service->loadMissing(['product.server.settings', 'product.settings', 'properties', 'vpsAppInstalls']);
        if (!$service->product || !$this->catalogService->isVpsProduct($service->product)) {
            return [];
        }

        $selectedOs = $this->catalogService->selectedOsForService($service);
        if (!$selectedOs) {
            return [];
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $selection = $this->catalogService->resolveSelection(
            $service->product,
            $selectedOs,
            trim((string) ($properties['primary_app_slug'] ?? '')) ?: null,
            $this->decodeJsonList($properties['addon_app_slugs'] ?? null),
        );

        $installs = [];

        $delaySeconds = max((int) config('vps_apps.queue.checkout_initial_delay_seconds', 150), 0);

        if ($selection['primary']) {
            $installs[] = $this->upsertInstallRecord($service, $selection['primary'], true, 'checkout', null, $delaySeconds);
        }

        foreach ($selection['addons'] as $descriptor) {
            $installs[] = $this->upsertInstallRecord($service, $descriptor, false, 'checkout', null, $delaySeconds);
        }

        return array_values(array_filter($installs));
    }

    public function appsPayload(Service $service): array
    {
        $service->loadMissing(['product.server.settings', 'product.settings', 'properties', 'vpsAppInstalls.app.category', 'vpsAppInstalls.recipe', 'vpsAppInstalls.requestedBy']);
        $selectedOs = $this->catalogService->selectedOsForService($service);
        $panelAccess = $this->panelAccessPayload($service);

        return [
            'service_id' => $service->id,
            'selected_os' => $selectedOs,
            'primary_app_slug' => $this->catalogService->currentPrimarySlug($service),
            'addon_app_slugs' => $this->catalogService->currentAddonSlugs($service),
            'panel_url' => $panelAccess['panel_url'],
            'panel_label' => $panelAccess['panel_label'],
            'panel_host' => $panelAccess['panel_host'],
            'panel_port' => $panelAccess['panel_port'],
            'panel_path' => $panelAccess['panel_path'],
            'panel_username' => $panelAccess['panel_username'],
            'panel_password' => $panelAccess['panel_password'],
            'installs' => $service->vpsAppInstalls
                ->sortByDesc(fn (VpsAppInstall $install) => (bool) $install->is_primary)
                ->values()
                ->map(fn (VpsAppInstall $install) => $this->serializeInstall($install))
                ->all(),
            'catalog' => $service->product
                ? $this->catalogService->marketForProduct($service->product, $selectedOs, $service)
                : null,
        ];
    }

    /**
     * @return array<int, VpsAppInstall>
     */
    public function queueAddonInstalls(Service $service, array $addonSlugs, string $source = 'service-page', ?User $requestedBy = null): array
    {
        $service->loadMissing(['product.server.settings', 'product.settings', 'properties', 'vpsAppInstalls.app.category', 'vpsAppInstalls.recipe']);
        if (!$service->product || !$this->catalogService->isVpsProduct($service->product)) {
            throw ValidationException::withMessages([
                'service' => ['This service does not support the VPS app marketplace.'],
            ]);
        }

        if ((string) $service->status !== Service::STATUS_ACTIVE) {
            throw ValidationException::withMessages([
                'service' => ['The service must be active before installing addons.'],
            ]);
        }

        $selectedOs = $this->catalogService->selectedOsForService($service);
        if (!$selectedOs) {
            throw ValidationException::withMessages([
                'service' => ['The current service is missing its operating system selection.'],
            ]);
        }

        $currentPrimarySlug = $this->catalogService->currentPrimarySlug($service);
        $currentAddonSlugs = $this->catalogService->currentAddonSlugs($service);
        $mergedAddonSlugs = array_values(array_unique(array_merge($currentAddonSlugs, array_filter(array_map('strval', $addonSlugs)))));

        $selection = $this->catalogService->resolveSelection(
            $service->product,
            $selectedOs,
            $currentPrimarySlug,
            $mergedAddonSlugs,
            $currentPrimarySlug,
            $currentAddonSlugs,
            false,
        );

        $this->persistProperty($service, 'addon_app_slugs', json_encode($selection['addon_slugs'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $newInstalls = [];
        foreach ($selection['addons'] as $descriptor) {
            if (in_array($descriptor['app']->slug, $currentAddonSlugs, true)) {
                continue;
            }

            $newInstalls[] = $this->upsertInstallRecord($service, $descriptor, false, $source, $requestedBy);
        }

        return array_values(array_filter($newInstalls));
    }

    /**
     * @return array{
     *   os: string,
     *   primary: array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}|null,
     *   addons: array<int, array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}>,
     *   addon_slugs: array<int, string>
     * }
     */
    public function prepareReinstallSelection(
        Service $service,
        string $selectedOs,
        ?string $primaryAppSlug,
        array $addonAppSlugs,
        ?User $requestedBy = null,
        bool $previewOnly = false,
    ): array {
        $service->loadMissing(['product.server.settings', 'product.settings', 'properties', 'vpsAppInstalls']);
        if (!$service->product || !$this->catalogService->isVpsProduct($service->product)) {
            throw ValidationException::withMessages([
                'service' => ['This service does not support the VPS app marketplace.'],
            ]);
        }

        if (!in_array((string) $service->status, [Service::STATUS_ACTIVE, Service::STATUS_SUSPENDED], true)) {
            throw ValidationException::withMessages([
                'service' => ['The service must be active before reinstalling with a new application plan.'],
            ]);
        }

        $selection = $this->catalogService->resolveSelection(
            $service->product,
            $selectedOs,
            $primaryAppSlug,
            $addonAppSlugs,
        );

        if ($previewOnly) {
            return $selection;
        }

        $this->persistProperty($service, 'selected_os', $selection['os']);
        $this->persistProperty($service, 'os', $selection['os']);
        $this->persistProperty($service, 'primary_app_slug', $selection['primary']['app']->slug ?? null);
        $this->persistProperty($service, 'addon_app_slugs', json_encode($selection['addon_slugs'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $this->clearPanelAccessProperties($service);

        $this->prepareConvoyProvisioning($service);

        $service->vpsAppInstalls()->delete();
        $service->unsetRelation('vpsAppInstalls');
        $service->load('vpsAppInstalls');

        $delaySeconds = max((int) config('vps_apps.queue.reinstall_initial_delay_seconds', 120), 0);
        if ($selection['primary']) {
            $this->upsertInstallRecord($service, $selection['primary'], true, 'reinstall', $requestedBy, $delaySeconds);
        }

        foreach ($selection['addons'] as $descriptor) {
            $this->upsertInstallRecord($service, $descriptor, false, 'reinstall', $requestedBy, $delaySeconds);
        }

        return $selection;
    }

    public function retryInstall(Service $service, VpsAppInstall $install, ?User $requestedBy = null): VpsAppInstall
    {
        if ((int) $install->service_id !== (int) $service->id) {
            throw ValidationException::withMessages([
                'install' => ['The requested install record does not belong to this service.'],
            ]);
        }

        if ((string) $service->status !== Service::STATUS_ACTIVE) {
            throw ValidationException::withMessages([
                'service' => ['The service must be active before retrying an install.'],
            ]);
        }

        $install->status = VpsAppInstall::STATUS_QUEUED;
        $install->attempt_count = 0;
        $install->last_error = null;
        $install->logs = [];
        $install->started_at = null;
        $install->completed_at = null;
        $install->response_payload = [];
        $install->request_payload = array_merge((array) $install->request_payload, [
            'retried_at' => now()->toISOString(),
            'retried_by_user_id' => $requestedBy?->id,
        ]);
        $install->requested_by_user_id = $requestedBy?->id ?? $install->requested_by_user_id;
        $install->save();

        if ((bool) $install->is_primary) {
            $this->clearPanelAccessProperties($service);
        }

        $this->dispatchInstall($install);

        return $install->refresh();
    }

    public function processInstall(VpsAppInstall $install): VpsAppInstall
    {
        $install->loadMissing(['service.product.server.settings', 'service.properties', 'service.vpsAppInstalls.app', 'app.category', 'recipe']);

        if ($install->status === VpsAppInstall::STATUS_READY) {
            return $install;
        }

        $service = $install->service;
        if (!$service || (string) $service->status !== Service::STATUS_ACTIVE) {
            return $this->markFailed($install, 'The backing VPS service is not active, so the app cannot be installed yet.');
        }

        if (!$install->recipe || !$install->app) {
            return $this->markFailed($install, 'The install record is missing its app recipe.');
        }

        if (!(bool) $install->is_primary) {
            $primaryInstall = $service->vpsAppInstalls
                ->first(fn (VpsAppInstall $candidate) => (bool) $candidate->is_primary);

            if ($primaryInstall && (int) $primaryInstall->id !== (int) $install->id) {
                if ($primaryInstall->status === VpsAppInstall::STATUS_FAILED) {
                    return $this->markFailed($install, 'Primary app installation failed. Fix/retry the primary app before installing addon components.');
                }

                if ($primaryInstall->status !== VpsAppInstall::STATUS_READY) {
                    return $this->markRetrying($install, 'Waiting for the primary app to finish before running addon installation.');
                }
            }
        }

        if ((bool) $install->is_primary && $install->install_strategy === VpsAppRecipe::STRATEGY_TEMPLATE) {
            return $this->markReady($install, [
                'Provisioned by a regional application template during VPS creation.',
            ], [
                'install_strategy' => VpsAppRecipe::STRATEGY_TEMPLATE,
            ]);
        }

        foreach ((array) $install->recipe->dependencies as $dependencySlug) {
            $dependencySlug = trim((string) $dependencySlug);
            if ($dependencySlug === '') {
                continue;
            }

            $dependencyInstall = $service->vpsAppInstalls
                ->first(fn (VpsAppInstall $candidate) => (string) $candidate->app?->slug === $dependencySlug);
            if (!$dependencyInstall) {
                return $this->markFailed($install, "Dependency [{$dependencySlug}] is not installed on this service.");
            }

            if ($dependencyInstall->status === VpsAppInstall::STATUS_FAILED) {
                return $this->markFailed($install, "Dependency [{$dependencySlug}] failed to install.");
            }

            if ($dependencyInstall->status !== VpsAppInstall::STATUS_READY) {
                return $this->markRetrying($install, "Waiting for dependency [{$dependencySlug}] to finish installation.");
            }
        }

        $install->status = VpsAppInstall::STATUS_INSTALLING;
        $install->attempt_count = (int) $install->attempt_count + 1;
        $install->started_at = $install->started_at ?: now();
        $install->last_attempt_at = now();
        $install->save();

        try {
            $result = $this->sshExecutor->execute($install);
            $panelAccess = $this->parsePanelUrl((string) ($result['panel_url'] ?? ''));

            $responsePayload = array_merge((array) $install->response_payload, [
                'host' => $result['host'],
                'username' => $result['username'],
                'panel_url' => $result['panel_url'],
                'panel_host' => $panelAccess['host'],
                'panel_port' => $panelAccess['port'],
                'panel_path' => $panelAccess['path'],
                'panel_scheme' => $panelAccess['scheme'],
                'panel_label' => $install->recipe?->panel_label,
                'panel_username' => $result['panel_username'] ?? null,
                'panel_password' => $result['panel_password'] ?? null,
            ]);

            if ($this->shouldPromotePanelAccess($service, $install, $responsePayload)) {
                $this->persistPanelAccessProperties($service, $install, $responsePayload);
            }

            return $this->markReady($install, (array) $result['logs'], $responsePayload);
        } catch (\Throwable $exception) {
            report($exception);

            if ((int) $install->attempt_count < max((int) config('vps_apps.queue.max_attempts', 3), 1)) {
                return $this->markRetrying($install, $exception->getMessage());
            }

            return $this->markFailed($install, $exception->getMessage());
        }
    }

    public function serializeInstall(VpsAppInstall $install): array
    {
        $install->loadMissing(['app.category', 'recipe', 'requestedBy']);

        return [
            'id' => $install->id,
            'source' => $install->source,
            'status' => $install->status,
            'is_primary' => (bool) $install->is_primary,
            'install_strategy' => $install->install_strategy,
            'requested_os' => $install->requested_os,
            'attempt_count' => (int) $install->attempt_count,
            'last_error' => $install->last_error,
            'logs' => $this->sanitizeLogs((array) ($install->logs ?? [])),
            'app' => $install->app ? [
                'id' => $install->app->id,
                'slug' => $install->app->slug,
                'name' => $install->app->name,
                'description' => $install->app->description,
                'icon' => $install->app->icon,
                'type' => $install->app->app_type,
                'tagline' => $install->app->tagline,
                'category' => $install->app->category ? [
                    'id' => $install->app->category->id,
                    'slug' => $install->app->category->slug,
                    'name' => $install->app->category->name,
                    'icon' => $install->app->category->icon,
                ] : null,
            ] : null,
            'recipe' => $install->recipe ? [
                'id' => $install->recipe->id,
                'os_version' => $install->recipe->os_version,
                'install_strategy' => $install->recipe->install_strategy,
                'template_ref' => $install->recipe->template_ref,
                'panel_port' => $install->recipe->panel_port,
                'panel_path' => $install->recipe->panel_path,
                'panel_scheme' => $install->recipe->panel_scheme,
                'panel_label' => $install->recipe->panel_label,
                'dependencies' => array_values(array_filter(array_map('strval', (array) $install->recipe->dependencies))),
                'conflicts' => array_values(array_filter(array_map('strval', (array) $install->recipe->conflicts))),
            ] : null,
            'requested_by' => $install->requestedBy ? [
                'id' => $install->requestedBy->id,
                'name' => $install->requestedBy->name,
                'email' => $install->requestedBy->email,
            ] : null,
            'response_payload' => $this->sanitizePayload((array) ($install->response_payload ?? [])),
            'request_payload' => $this->sanitizePayload((array) ($install->request_payload ?? [])),
            'started_at' => optional($install->started_at)?->toISOString(),
            'last_attempt_at' => optional($install->last_attempt_at)?->toISOString(),
            'completed_at' => optional($install->completed_at)?->toISOString(),
            'installed_at' => optional($install->installed_at)?->toISOString(),
            'created_at' => optional($install->created_at)?->toISOString(),
            'updated_at' => optional($install->updated_at)?->toISOString(),
        ];
    }

    /**
     * @param  array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}  $descriptor
     */
    protected function upsertInstallRecord(
        Service $service,
        array $descriptor,
        bool $isPrimary,
        string $source,
        ?User $requestedBy = null,
        int $delaySeconds = 0,
    ): ?VpsAppInstall {
        /** @var VpsApp $app */
        $app = $descriptor['app'];
        /** @var VpsAppRecipe $recipe */
        $recipe = $descriptor['recipe'];

        $install = VpsAppInstall::query()->firstOrNew([
            'service_id' => $service->id,
            'vps_app_id' => $app->id,
        ]);

        if ($install->exists && $install->status === VpsAppInstall::STATUS_READY) {
            return $install;
        }

        $install->vps_app_recipe_id = $recipe->id;
        $install->requested_by_user_id = $requestedBy?->id ?? $install->requested_by_user_id;
        $install->source = $source;
        $install->is_primary = $isPrimary;
        $install->install_strategy = $descriptor['effective_install_strategy'];
        $install->requested_os = $this->catalogService->selectedOsForService($service);
        $install->request_payload = [
            'app_slug' => $app->slug,
            'recipe_id' => $recipe->id,
            'source' => $source,
            'template_available' => (bool) $descriptor['template_available'],
        ];

        if ($descriptor['effective_install_strategy'] === VpsAppRecipe::STRATEGY_TEMPLATE && $isPrimary) {
            $install->status = VpsAppInstall::STATUS_READY;
            $install->logs = ['Provisioned via VPS template.'];
            $install->last_error = null;
            $install->completed_at = now();
            $install->installed_at = now();
            $install->save();
            $install = $install->refresh();
            $this->dispatchInstallReadyNotification($install);

            return $install;
        }

        $install->status = VpsAppInstall::STATUS_QUEUED;
        $install->last_error = null;
        $install->save();
        $this->dispatchInstall($install, $delaySeconds);

        return $install;
    }

    protected function markRetrying(VpsAppInstall $install, string $message): VpsAppInstall
    {
        $install->status = VpsAppInstall::STATUS_RETRYING;
        $install->last_error = $message;
        $install->logs = $this->appendLog((array) ($install->logs ?? []), 'Retry scheduled: ' . $message);
        $install->save();

        ProcessVpsAppInstallJob::dispatch($install->id)
            ->delay(now()->addSeconds(max((int) config('vps_apps.queue.retry_delay_seconds', 30), 5)))
            ->onQueue('default');

        return $install->refresh();
    }

    protected function markFailed(VpsAppInstall $install, string $message): VpsAppInstall
    {
        $install->status = VpsAppInstall::STATUS_FAILED;
        $install->last_error = $message;
        $install->completed_at = now();
        $install->logs = $this->appendLog((array) ($install->logs ?? []), 'Failed: ' . $message);
        $install->save();

        return $install->refresh();
    }

    /**
     * @param  array<int, string>  $logs
     * @param  array<string, mixed>  $responsePayload
     */
    protected function markReady(VpsAppInstall $install, array $logs, array $responsePayload = []): VpsAppInstall
    {
        $install->status = VpsAppInstall::STATUS_READY;
        $install->last_error = null;
        $install->completed_at = now();
        $install->installed_at = now();
        $install->logs = $this->sanitizeLogs($this->appendLogs((array) ($install->logs ?? []), $logs));
        $install->response_payload = $this->sanitizePayload($responsePayload);
        $install->save();
        $install = $install->refresh();
        $this->dispatchInstallReadyNotification($install);

        return $install;
    }

    protected function dispatchInstall(VpsAppInstall $install, int $delaySeconds = 0): void
    {
        $dispatch = ProcessVpsAppInstallJob::dispatch($install->id)->onQueue('default');
        if ($delaySeconds > 0) {
            $dispatch->delay(now()->addSeconds($delaySeconds));
        }
    }

    protected function persistProperty(Service $service, string $key, ?string $value): void
    {
        if ($value === null || trim($value) === '') {
            $this->deleteProperty($service, $key);

            return;
        }

        $service->properties()->updateOrCreate(
            ['key' => $key],
            ['name' => Str::headline($key), 'value' => $value],
        );
        $service->unsetRelation('properties');
    }

    protected function deleteProperty(Service $service, string $key): void
    {
        $service->properties()->where('key', $key)->delete();
        $service->unsetRelation('properties');
    }

    protected function clearPanelAccessProperties(Service $service): void
    {
        foreach ([
            'panel_url',
            'panel_label',
            'panel_host',
            'panel_port',
            'panel_path',
            'panel_scheme',
            'panel_username',
            'panel_password',
        ] as $key) {
            $this->deleteProperty($service, $key);
        }
    }

    /**
     * @param  array<string, mixed>  $responsePayload
     */
    protected function shouldPromotePanelAccess(Service $service, VpsAppInstall $install, array $responsePayload): bool
    {
        $panelUrl = trim((string) ($responsePayload['panel_url'] ?? ''));
        $panelUsername = trim((string) ($responsePayload['panel_username'] ?? ''));
        $panelPassword = trim((string) ($responsePayload['panel_password'] ?? ''));

        if ($panelUrl === '' && $panelUsername === '' && $panelPassword === '') {
            return false;
        }

        if (trim($panelUrl) === '') {
            return (bool) $install->is_primary;
        }

        if ((bool) $install->is_primary) {
            return true;
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $currentPrimarySlug = trim((string) ($properties['primary_app_slug'] ?? ''));
        if ($currentPrimarySlug !== '') {
            return false;
        }

        return trim((string) ($properties['panel_url'] ?? '')) === '';
    }

    /**
     * @param  array<string, mixed>  $responsePayload
     */
    protected function persistPanelAccessProperties(Service $service, VpsAppInstall $install, array $responsePayload): void
    {
        $panelUrl = trim((string) ($responsePayload['panel_url'] ?? ''));
        $panelUsername = trim((string) ($responsePayload['panel_username'] ?? ''));
        $panelPassword = trim((string) ($responsePayload['panel_password'] ?? ''));

        $parsed = $this->parsePanelUrl($panelUrl);
        $this->persistProperty($service, 'panel_label', (string) ($install->recipe?->panel_label ?? $install->app?->name ?? ''));
        $this->persistProperty($service, 'panel_url', $panelUrl !== '' ? $panelUrl : null);
        $this->persistProperty($service, 'panel_host', $parsed['host']);
        $this->persistProperty($service, 'panel_port', $parsed['port'] !== null ? (string) $parsed['port'] : null);
        $this->persistProperty($service, 'panel_path', $parsed['path']);
        $this->persistProperty($service, 'panel_scheme', $parsed['scheme']);
        $this->persistProperty($service, 'panel_username', $panelUsername !== '' ? $panelUsername : null);
        $this->persistProperty($service, 'panel_password', $panelPassword !== '' ? $panelPassword : null);
    }

    /**
     * @return array{panel_url: ?string, panel_label: ?string, panel_host: ?string, panel_port: ?int, panel_path: ?string, panel_username: ?string, panel_password: ?string}
     */
    protected function panelAccessPayload(Service $service): array
    {
        $properties = ExtensionHelper::getServiceProperties($service);
        $service->loadMissing(['vpsAppInstalls.app', 'vpsAppInstalls.recipe']);
        /** @var VpsAppInstall|null $primaryInstall */
        $primaryInstall = $service->vpsAppInstalls->first(fn (VpsAppInstall $install) => (bool) $install->is_primary);

        $primaryPanelUrl = $this->panelUrlFromInstall($primaryInstall);
        $servicePanelUrl = trim((string) ($properties['panel_url'] ?? '')) ?: null;

        $panelUrl = null;
        if ($primaryInstall) {
            $panelUrl = $primaryPanelUrl;
            if ($panelUrl === null && (string) $primaryInstall->status === VpsAppInstall::STATUS_READY) {
                $panelUrl = $servicePanelUrl;
            }
        } else {
            $panelUrl = $servicePanelUrl;
        }

        $parsed = $this->parsePanelUrl((string) ($panelUrl ?? ''));

        return [
            'panel_url' => $panelUrl,
            'panel_label' => trim((string) ($properties['panel_label'] ?? $primaryInstall?->recipe?->panel_label ?? $primaryInstall?->app?->name ?? '')) ?: null,
            'panel_host' => trim((string) ($properties['panel_host'] ?? $parsed['host'] ?? '')) ?: null,
            'panel_port' => is_numeric($properties['panel_port'] ?? null)
                ? (int) $properties['panel_port']
                : $parsed['port'],
            'panel_path' => trim((string) ($properties['panel_path'] ?? $parsed['path'] ?? '')) ?: null,
            'panel_username' => trim((string) ($properties['panel_username'] ?? $this->panelUsernameFromInstall($primaryInstall) ?? '')) ?: null,
            'panel_password' => trim((string) ($properties['panel_password'] ?? $this->panelPasswordFromInstall($primaryInstall) ?? '')) ?: null,
        ];
    }

    protected function panelUrlFromInstall(?VpsAppInstall $install): ?string
    {
        if (!$install) {
            return null;
        }

        $payload = (array) ($install->response_payload ?? []);
        $panelUrl = trim((string) ($payload['panel_url'] ?? ''));

        return $panelUrl !== '' ? $panelUrl : null;
    }

    protected function panelUsernameFromInstall(?VpsAppInstall $install): ?string
    {
        if (!$install) {
            return null;
        }

        $payload = (array) ($install->response_payload ?? []);
        $panelUsername = trim((string) ($payload['panel_username'] ?? ''));

        return $panelUsername !== '' ? $panelUsername : null;
    }

    protected function panelPasswordFromInstall(?VpsAppInstall $install): ?string
    {
        if (!$install) {
            return null;
        }

        $payload = (array) ($install->response_payload ?? []);
        $panelPassword = trim((string) ($payload['panel_password'] ?? ''));

        return $panelPassword !== '' ? $panelPassword : null;
    }

    /**
     * @return array{host: ?string, port: ?int, path: ?string, scheme: ?string}
     */
    protected function parsePanelUrl(string $panelUrl): array
    {
        $panelUrl = trim($panelUrl);
        if ($panelUrl === '') {
            return [
                'host' => null,
                'port' => null,
                'path' => null,
                'scheme' => null,
            ];
        }

        $parts = parse_url($panelUrl);
        if (!is_array($parts)) {
            return [
                'host' => null,
                'port' => null,
                'path' => null,
                'scheme' => null,
            ];
        }

        $path = trim((string) ($parts['path'] ?? ''));

        return [
            'host' => trim((string) ($parts['host'] ?? '')) ?: null,
            'port' => isset($parts['port']) ? (int) $parts['port'] : null,
            'path' => $path !== '' ? $path : null,
            'scheme' => trim((string) ($parts['scheme'] ?? '')) ?: null,
        ];
    }

    protected function dispatchInstallReadyNotification(VpsAppInstall $install): void
    {
        if (!(bool) $install->is_primary) {
            return;
        }

        $install->loadMissing(['service.user', 'service.product', 'service.properties', 'app', 'recipe']);
        $service = $install->service;
        $user = $service?->user;
        if (!$service || !$user) {
            return;
        }

        $panelAccess = $this->panelAccessPayload($service);
        $properties = ExtensionHelper::getServiceProperties($service);

        NotificationHelper::vpsAppInstallReadyNotification($user, $service, [
            'app_install' => $install,
            'app' => $install->app,
            'app_name' => $install->app?->name ?? $install->app?->slug ?? 'VPS app',
            'panel_url' => $panelAccess['panel_url'],
            'panel_label' => $panelAccess['panel_label'],
            'panel_username' => $panelAccess['panel_username'],
            'panel_password' => $panelAccess['panel_password'],
            'requested_os' => $install->requested_os ?: $this->catalogService->selectedOsForService($service),
            'server_ip' => trim((string) ($properties['ip'] ?? $properties['ipv4'] ?? $properties['address'] ?? '')) ?: null,
        ]);
    }

    /**
     * @return array<int, string>
     */
    protected function decodeJsonList(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_unique(array_filter(array_map('strval', $value))));
        }

        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map('strval', $decoded))));
    }

    /**
     * @param  array<int, string>  $existing
     * @param  array<int, string>  $logs
     * @return array<int, string>
     */
    protected function appendLogs(array $existing, array $logs): array
    {
        return $this->sanitizeLogs([
            ...$existing,
            ...$logs,
        ]);
    }

    /**
     * @param  array<int, string>  $existing
     * @return array<int, string>
     */
    protected function appendLog(array $existing, string $message): array
    {
        return $this->appendLogs($existing, [$message]);
    }

    /**
     * @param  array<int, string>  $logs
     * @return array<int, string>
     */
    protected function sanitizeLogs(array $logs): array
    {
        $normalized = [];

        foreach (array_filter(array_map('strval', $logs)) as $line) {
            $segments = preg_split('/\r\n|\r|\n/', $line) ?: [$line];
            foreach ($segments as $segment) {
                $sanitized = $this->sanitizeLogLine((string) $segment);
                if ($sanitized !== '') {
                    $normalized[] = $sanitized;
                }
            }
        }

        $limit = max((int) config('vps_apps.queue.log_line_limit', 200), 20);
        if (count($normalized) > $limit) {
            $normalized = array_slice($normalized, -$limit);
        }

        return array_values($normalized);
    }

    protected function sanitizeLogLine(string $line): string
    {
        $sanitized = preg_replace('/(?i)(password|token|secret|authorization|api[_-]?key)\s*[:=]\s*\S+/', '$1=[redacted]', $line);
        $sanitized = trim((string) $sanitized);
        $sanitized = (string) preg_replace('/\s+/', ' ', $sanitized);

        $lengthLimit = max((int) config('vps_apps.queue.log_line_length_limit', 220), 80);
        if (mb_strlen($sanitized) > $lengthLimit) {
            $sanitized = rtrim(mb_substr($sanitized, 0, $lengthLimit - 1)) . '…';
        }

        return $sanitized;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function sanitizePayload(array $payload): array
    {
        $sanitized = [];

        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (in_array($normalizedKey, [
                'password',
                'account_password',
                'root_password',
                'token',
                'authorization',
                'api_key',
                'secret',
            ], true)) {
                $sanitized[$key] = '[redacted]';
                continue;
            }

            $sanitized[$key] = is_array($value) ? $this->sanitizePayload($value) : $value;
        }

        return $sanitized;
    }

    protected function canFallbackToPureSystemSelection(ValidationException $exception): bool
    {
        $messages = [];
        foreach ($exception->errors() as $fieldMessages) {
            foreach ((array) $fieldMessages as $message) {
                $messages[] = strtolower(trim((string) $message));
            }
        }

        if ($messages === []) {
            return false;
        }

        foreach ($messages as $message) {
            if (
                str_contains($message, 'not available for this operating system')
                || str_contains($message, 'currently unavailable')
                || str_contains($message, 'depends on an unavailable app')
            ) {
                return true;
            }
        }

        return false;
    }
}
