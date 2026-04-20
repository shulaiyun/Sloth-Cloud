<?php

namespace App\Services\VpsApps;

use App\Helpers\ExtensionHelper;
use App\Models\Product;
use App\Models\Service;
use App\Models\VpsApp;
use App\Models\VpsAppCategory;
use App\Models\VpsAppRecipe;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VpsAppCatalogService
{
    /**
     * @return array<int, string>
     */
    public function supportedOs(): array
    {
        return array_values(array_filter(array_map(
            static fn (mixed $entry): string => trim((string) $entry),
            (array) config('vps_apps.supported_os', [])
        )));
    }

    public function isVpsProduct(Product $product): bool
    {
        $product->loadMissing(['server', 'settings']);

        return (string) $product->server?->extension === 'Convoy';
    }

    /**
     * @return array<int, array{uuid: string, name: string}>
     */
    public function rawTemplateOptions(Product $product): array
    {
        if (!$this->isVpsProduct($product) || !$product->server) {
            return [];
        }

        $extension = ExtensionHelper::getExtension('server', $product->server->extension, $product->server->settings);
        if (!method_exists($extension, 'getTemplateOptions')) {
            return [];
        }

        try {
            $templates = $extension->getTemplateOptions($product);

            return is_array($templates) ? $templates : [];
        } catch (\Throwable $exception) {
            report($exception);

            return [];
        }
    }

    /**
     * @param  array<int, array{uuid: string, name: string}>  $templates
     * @return array<int, array{value: string, label: string, template_ref: string, template_uuid: string}>
     */
    public function supportedOsOptionsFromTemplates(array $templates): array
    {
        $options = [];
        $seen = [];

        foreach ($this->discoveredBaseOs($templates) as $os) {
            $match = $this->bestTemplateForOs($os, $templates);
            $option = [
                'value' => $os,
                'label' => $os,
                'template_ref' => $match['name'] ?? null,
                'template_uuid' => $match['uuid'] ?? null,
            ];

            $token = $this->normalizeToken($os);
            if ($token === '' || isset($seen[$token])) {
                continue;
            }

            $seen[$token] = true;
            $options[] = $option;
        }

        return $options;
    }

    public function marketForProduct(Product $product, ?string $selectedOs = null, ?Service $service = null): array
    {
        if (!$this->isVpsProduct($product)) {
            return [
                'enabled' => false,
                'selected_os' => null,
                'supported_os' => [],
                'categories' => [],
                'primary_apps' => [],
                'addon_apps' => [],
                'rules' => [
                    'primary_required' => false,
                    'max_primary' => 0,
                    'allow_addons' => false,
                ],
                'current_selection' => [
                    'primary_app_slug' => null,
                    'addon_app_slugs' => [],
                ],
            ];
        }

        $product->loadMissing(['server', 'settings']);
        $service?->loadMissing(['vpsAppInstalls.app', 'properties']);

        $templates = $this->rawTemplateOptions($product);
        $supportedOs = $this->supportedOsOptionsFromTemplates($templates);
        $selectedOs = $this->normalizeOs($selectedOs ?: $this->selectedOsForService($service));
        if (!$selectedOs && isset($supportedOs[0]['value'])) {
            $selectedOs = $supportedOs[0]['value'];
        }

        $descriptorMap = $selectedOs ? $this->descriptorMap($selectedOs, $templates) : [];
        $categories = VpsAppCategory::query()
            ->where('enabled', true)
            ->orderBy('sort')
            ->orderBy('id')
            ->get()
            ->map(fn (VpsAppCategory $category) => [
                'id' => $category->id,
                'slug' => $category->slug,
                'name' => $category->name,
                'description' => $category->description,
                'icon' => $category->icon,
                'sort' => $category->sort,
                'search_keywords' => $category->search_keywords ?? [],
            ])
            ->values()
            ->all();

        $currentPrimarySlug = $this->currentPrimarySlug($service);
        $currentAddonSlugs = $this->currentAddonSlugs($service);

        $serializeDescriptor = function (array $descriptor) {
            /** @var VpsApp $app */
            $app = $descriptor['app'];
            /** @var VpsAppRecipe $recipe */
            $recipe = $descriptor['recipe'];

            return [
                'id' => $app->id,
                'slug' => $app->slug,
                'name' => $app->name,
                'description' => $app->description,
                'icon' => $app->icon,
                'type' => $app->app_type,
                'tagline' => $app->tagline,
                'featured' => (bool) $app->featured,
                'allow_on_existing_service' => (bool) $app->allow_on_existing_service && (bool) $recipe->allow_on_existing_service,
                'category' => $app->category ? [
                    'id' => $app->category->id,
                    'slug' => $app->category->slug,
                    'name' => $app->category->name,
                    'icon' => $app->category->icon,
                ] : null,
                'recipe' => [
                    'id' => $recipe->id,
                    'os_version' => $recipe->os_version,
                    'install_strategy' => $recipe->install_strategy,
                    'effective_install_strategy' => $descriptor['effective_install_strategy'],
                    'template_ref' => $recipe->template_ref,
                    'template_available' => (bool) $descriptor['template_available'],
                    'dependencies' => array_values(array_filter(array_map('strval', (array) $recipe->dependencies))),
                    'conflicts' => array_values(array_filter(array_map('strval', (array) $recipe->conflicts))),
                    'default_login_username' => $recipe->default_login_username,
                    'panel_port' => $recipe->panel_port,
                    'panel_path' => $recipe->panel_path,
                    'panel_scheme' => $recipe->panel_scheme,
                    'panel_label' => $recipe->panel_label,
                    'allow_on_existing_service' => (bool) $recipe->allow_on_existing_service,
                ],
                'available' => (bool) $descriptor['available'],
                'unavailable_reason' => $descriptor['unavailable_reason'],
            ];
        };

        $primaryApps = [];
        $addonApps = [];
        foreach ($descriptorMap as $descriptor) {
            $serialized = $serializeDescriptor($descriptor);
            if (($serialized['type'] ?? VpsApp::TYPE_ADDON) === VpsApp::TYPE_MAIN) {
                $primaryApps[] = $serialized;
                continue;
            }

            $addonApps[] = $serialized;
        }

        return [
            'enabled' => true,
            'selected_os' => $selectedOs,
            'supported_os' => $supportedOs,
            'categories' => $categories,
            'primary_apps' => array_values($primaryApps),
            'addon_apps' => array_values($addonApps),
            'rules' => [
                'primary_required' => false,
                'max_primary' => 1,
                'allow_addons' => true,
            ],
            'current_selection' => [
                'primary_app_slug' => $currentPrimarySlug,
                'addon_app_slugs' => $currentAddonSlugs,
            ],
        ];
    }

    /**
     * @return array{
     *   os: string,
     *   primary: array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}|null,
     *   addons: array<int, array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}>,
     *   addon_slugs: array<int, string>
     * }
     */
    public function resolveSelection(
        Product $product,
        string $selectedOs,
        ?string $primaryAppSlug,
        array $addonAppSlugs,
        ?string $currentPrimarySlug = null,
        array $currentAddonSlugs = [],
        bool $allowNewPrimary = true,
    ): array {
        if (!$this->isVpsProduct($product)) {
            throw ValidationException::withMessages([
                'product' => ['The selected product does not support the VPS app marketplace.'],
            ]);
        }

        $selectedOs = $this->normalizeOs($selectedOs);
        if (!$selectedOs) {
            throw ValidationException::withMessages([
                'os' => ['Select an operating system before choosing marketplace applications.'],
            ]);
        }

        $templates = $this->rawTemplateOptions($product);
        $descriptorMap = $this->descriptorMap($selectedOs, $templates);

        $currentAddonSlugs = array_values(array_unique(array_filter(array_map('strval', $currentAddonSlugs))));
        $requestedAddonSlugs = array_values(array_unique(array_filter(array_map('strval', $addonAppSlugs))));
        $primarySlug = $primaryAppSlug ? trim((string) $primaryAppSlug) : null;

        if ($primarySlug) {
            $primaryDescriptor = $descriptorMap[$primarySlug] ?? null;
            if (!$primaryDescriptor || $primaryDescriptor['app']->app_type !== VpsApp::TYPE_MAIN) {
                throw ValidationException::withMessages([
                    'primary_app_slug' => ['The selected primary app is not available for this operating system.'],
                ]);
            }

            if (!$primaryDescriptor['available']) {
                throw ValidationException::withMessages([
                    'primary_app_slug' => [$primaryDescriptor['unavailable_reason'] ?? 'The selected primary app is currently unavailable.'],
                ]);
            }
        } else {
            $primaryDescriptor = null;
        }

        $queue = $requestedAddonSlugs;
        $resolvedAddons = [];
        while ($queue !== []) {
            $slug = array_shift($queue);
            if (!$slug || in_array($slug, $resolvedAddons, true)) {
                continue;
            }

            $descriptor = $descriptorMap[$slug] ?? null;
            if (!$descriptor || $descriptor['app']->app_type !== VpsApp::TYPE_ADDON) {
                throw ValidationException::withMessages([
                    'addon_app_slugs' => ["The selected addon [{$slug}] is not available for this operating system."],
                ]);
            }

            if (!$descriptor['available']) {
                throw ValidationException::withMessages([
                    'addon_app_slugs' => [$descriptor['unavailable_reason'] ?? "The selected addon [{$slug}] is currently unavailable."],
                ]);
            }

            $resolvedAddons[] = $slug;

            foreach ((array) $descriptor['recipe']->dependencies as $dependencySlug) {
                $dependencySlug = trim((string) $dependencySlug);
                if ($dependencySlug === '') {
                    continue;
                }

                $dependency = $descriptorMap[$dependencySlug] ?? null;
                if (!$dependency) {
                    throw ValidationException::withMessages([
                        'addon_app_slugs' => ["The addon [{$slug}] depends on an unavailable app [{$dependencySlug}]."],
                    ]);
                }

                if ($dependency['app']->app_type === VpsApp::TYPE_MAIN) {
                    if ($primarySlug) {
                        if ($primarySlug !== $dependencySlug) {
                            throw ValidationException::withMessages([
                                'addon_app_slugs' => ["The addon [{$slug}] requires primary app [{$dependencySlug}]."],
                            ]);
                        }

                        continue;
                    }

                    if (!$allowNewPrimary) {
                        if ($currentPrimarySlug !== $dependencySlug) {
                            throw ValidationException::withMessages([
                                'addon_app_slugs' => ["The addon [{$slug}] requires primary app [{$dependencySlug}] on this service."],
                            ]);
                        }

                        continue;
                    }

                    $primarySlug = $dependencySlug;
                    $primaryDescriptor = $dependency;
                    continue;
                }

                if (!in_array($dependencySlug, $resolvedAddons, true) && !in_array($dependencySlug, $queue, true)) {
                    $queue[] = $dependencySlug;
                }
            }
        }

        $conflictUniverse = array_values(array_unique(array_filter([
            $primarySlug,
            $currentPrimarySlug,
            ...$resolvedAddons,
            ...$currentAddonSlugs,
        ])));

        foreach (array_filter([$primaryDescriptor]) as $descriptor) {
            foreach ((array) $descriptor['recipe']->conflicts as $conflictSlug) {
                $conflictSlug = trim((string) $conflictSlug);
                if ($conflictSlug !== '' && in_array($conflictSlug, $conflictUniverse, true)) {
                    throw ValidationException::withMessages([
                        'primary_app_slug' => ["The primary app [{$descriptor['app']->slug}] conflicts with [{$conflictSlug}]."],
                    ]);
                }
            }
        }

        $addonDescriptors = [];
        foreach ($resolvedAddons as $slug) {
            $descriptor = $descriptorMap[$slug];
            foreach ((array) $descriptor['recipe']->conflicts as $conflictSlug) {
                $conflictSlug = trim((string) $conflictSlug);
                if ($conflictSlug !== '' && in_array($conflictSlug, $conflictUniverse, true)) {
                    throw ValidationException::withMessages([
                        'addon_app_slugs' => ["The addon [{$slug}] conflicts with [{$conflictSlug}]."],
                    ]);
                }
            }

            $addonDescriptors[] = $descriptor;
        }

        return [
            'os' => $selectedOs,
            'primary' => $primaryDescriptor,
            'addons' => $addonDescriptors,
            'addon_slugs' => array_values($resolvedAddons),
        ];
    }

    public function selectedOsForService(?Service $service): ?string
    {
        if (!$service) {
            return null;
        }

        $properties = ExtensionHelper::getServiceProperties($service);

        return $this->normalizeOs(
            $properties['selected_os']
            ?? $properties['requested_os']
            ?? $properties['os']
            ?? null
        );
    }

    public function currentPrimarySlug(?Service $service): ?string
    {
        if (!$service) {
            return null;
        }

        $service->loadMissing(['vpsAppInstalls.app', 'properties']);
        $readyInstall = $service->vpsAppInstalls
            ->first(fn ($install) => (bool) $install->is_primary && $install->app?->slug);
        if ($readyInstall?->app?->slug) {
            return $readyInstall->app->slug;
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $slug = trim((string) ($properties['primary_app_slug'] ?? ''));

        return $slug !== '' ? $slug : null;
    }

    /**
     * @return array<int, string>
     */
    public function currentAddonSlugs(?Service $service): array
    {
        if (!$service) {
            return [];
        }

        $service->loadMissing(['vpsAppInstalls.app', 'properties']);
        $slugs = $service->vpsAppInstalls
            ->filter(fn ($install) => !(bool) $install->is_primary && $install->app?->slug)
            ->map(fn ($install) => (string) $install->app?->slug)
            ->filter()
            ->values()
            ->all();

        if ($slugs !== []) {
            return array_values(array_unique($slugs));
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $raw = $properties['addon_app_slugs'] ?? null;
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map('strval', $decoded))));
    }

    /**
     * @param  array<int, array{uuid: string, name: string}>  $templates
     * @return array<string, array{app: VpsApp, recipe: VpsAppRecipe, template_available: bool, effective_install_strategy: string, available: bool, unavailable_reason: ?string}>
     */
    protected function descriptorMap(string $selectedOs, array $templates): array
    {
        $map = [];
        $categories = VpsAppCategory::query()
            ->where('enabled', true)
            ->with([
                'apps' => fn ($query) => $query
                    ->where('enabled', true)
                    ->orderBy('sort')
                    ->orderBy('id')
                    ->with(['category', 'recipes' => fn ($recipeQuery) => $recipeQuery
                        ->where('enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')]),
            ])
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        foreach ($categories as $category) {
            foreach ($category->apps as $app) {
                $recipe = $this->pickRecipeForOs($app->recipes, $selectedOs);
                if (!$recipe) {
                    continue;
                }

                $templateAvailable = $recipe->template_ref
                    ? $this->templateRefAvailable((string) $recipe->template_ref, $templates)
                    : false;
                $effectiveStrategy = $this->effectiveInstallStrategy($recipe, $templateAvailable);
                $available = $effectiveStrategy !== null;

                $map[$app->slug] = [
                    'app' => $app,
                    'recipe' => $recipe,
                    'template_available' => $templateAvailable,
                    'effective_install_strategy' => $effectiveStrategy ?? VpsAppRecipe::STRATEGY_SCRIPT,
                    'available' => $available,
                    'unavailable_reason' => $available
                        ? null
                        : 'This app requires a regional template that is not currently available for the selected VPS product.',
                ];
            }
        }

        return $map;
    }

    protected function pickRecipeForOs(Collection $recipes, string $selectedOs): ?VpsAppRecipe
    {
        return $recipes->first(function (VpsAppRecipe $recipe) use ($selectedOs) {
            return $this->normalizeOs($recipe->os_version) === $this->normalizeOs($selectedOs);
        });
    }

    protected function effectiveInstallStrategy(VpsAppRecipe $recipe, bool $templateAvailable): ?string
    {
        return match ((string) $recipe->install_strategy) {
            VpsAppRecipe::STRATEGY_SCRIPT => VpsAppRecipe::STRATEGY_SCRIPT,
            VpsAppRecipe::STRATEGY_TEMPLATE => $templateAvailable ? VpsAppRecipe::STRATEGY_TEMPLATE : null,
            VpsAppRecipe::STRATEGY_HYBRID => $templateAvailable ? VpsAppRecipe::STRATEGY_TEMPLATE : VpsAppRecipe::STRATEGY_SCRIPT,
            default => VpsAppRecipe::STRATEGY_SCRIPT,
        };
    }

    /**
     * @param  array<int, array{uuid: string, name: string}>  $templates
     */
    protected function templateRefAvailable(string $templateRef, array $templates): bool
    {
        $normalized = $this->normalizeToken($templateRef);
        if ($normalized === '') {
            return false;
        }

        foreach ($templates as $template) {
            $uuid = trim((string) ($template['uuid'] ?? ''));
            $name = trim((string) ($template['name'] ?? ''));
            if ($uuid !== '' && $uuid === $templateRef) {
                return true;
            }

            $templateToken = $this->normalizeToken($name);
            if ($templateToken === $normalized || str_contains($templateToken, $normalized) || str_contains($normalized, $templateToken)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array{uuid: string, name: string}>  $templates
     * @return array{uuid: string, name: string}|null
     */
    protected function bestTemplateForOs(string $os, array $templates): ?array
    {
        $candidateToken = $this->normalizeToken($os);
        if ($candidateToken === '') {
            return null;
        }

        $ranked = [];
        foreach ($templates as $template) {
            $name = trim((string) ($template['name'] ?? ''));
            $nameToken = $this->normalizeToken($name);
            if ($nameToken === '') {
                continue;
            }

            $score = null;
            if (mb_strtolower($name) === mb_strtolower($os) || Str::slug($name) === Str::slug($os) || $nameToken === $candidateToken) {
                $score = 0;
            } elseif (str_starts_with($nameToken, $candidateToken)) {
                $score = 1;
            } elseif (str_contains($nameToken, $candidateToken)) {
                $score = 2;
            }

            if ($score === null) {
                continue;
            }

            if ($this->looksLikeAppTemplate($name)) {
                $score += 10;
            }

            $ranked[] = [
                'score' => $score,
                'length' => strlen($name),
                'template' => $template,
            ];
        }

        if ($ranked === []) {
            return null;
        }

        usort($ranked, function (array $left, array $right) {
            if ($left['score'] === $right['score']) {
                return $left['length'] <=> $right['length'];
            }

            return $left['score'] <=> $right['score'];
        });

        return $ranked[0]['template'];
    }

    protected function looksLikeAppTemplate(string $templateName): bool
    {
        $normalized = $this->normalizeToken($templateName);

        foreach ([
            '1panel',
            'aapanel',
            'btpanel',
            'portainer',
            'coolify',
            'casaos',
            'docker',
            'nginx',
            'openresty',
            'mysql',
            'mariadb',
            'postgres',
            'redis',
            'mongo',
            'rabbitmq',
            'minio',
            'uptimekuma',
            'openjdk',
            'python',
            'nodejs',
        ] as $keyword) {
            if (str_contains($normalized, $keyword)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array{uuid: string, name: string}>  $templates
     * @return array<int, string>
     */
    protected function discoveredBaseOs(array $templates): array
    {
        $configured = $this->supportedOs();
        $discovered = [];

        foreach ($templates as $template) {
            $name = trim((string) ($template['name'] ?? ''));
            if ($name === '' || $this->looksLikeAppTemplate($name)) {
                continue;
            }

            $canonical = $this->canonicalizeBaseOs($name) ?? $name;
            $discovered[] = $canonical;
        }

        $ordered = array_merge($configured, $discovered);
        $knownOrder = array_flip($configured);
        $unique = [];

        foreach ($ordered as $os) {
            $token = $this->normalizeToken($os);
            if ($token === '' || isset($unique[$token])) {
                continue;
            }

            $unique[$token] = $os;
        }

        $values = array_values($unique);
        usort($values, function (string $left, string $right) use ($knownOrder): int {
            $leftToken = $this->normalizeToken($left);
            $rightToken = $this->normalizeToken($right);
            $leftKnown = array_key_exists($left, $knownOrder);
            $rightKnown = array_key_exists($right, $knownOrder);

            if ($leftKnown && $rightKnown) {
                return $knownOrder[$left] <=> $knownOrder[$right];
            }

            if ($leftKnown !== $rightKnown) {
                return $leftKnown ? -1 : 1;
            }

            return strnatcasecmp($left, $right);
        });

        return $values;
    }

    protected function canonicalizeBaseOs(string $templateName): ?string
    {
        $normalized = $this->normalizeToken($templateName);
        if ($normalized === '') {
            return null;
        }

        foreach ([
            'Ubuntu 20.04',
            'Ubuntu 22.04',
            'Ubuntu 24.04',
            'Debian 11',
            'Debian 12',
            'CentOS 7.9',
            'AlmaLinux 8',
            'AlmaLinux 9',
            'RockyLinux 8',
            'RockyLinux 9',
        ] as $candidate) {
            if ($this->normalizeToken($candidate) === $normalized) {
                return $candidate;
            }
        }

        return match (true) {
            str_contains($normalized, 'ubuntu2004') => 'Ubuntu 20.04',
            str_contains($normalized, 'ubuntu2204') => 'Ubuntu 22.04',
            str_contains($normalized, 'ubuntu2404') => 'Ubuntu 24.04',
            str_contains($normalized, 'debian11') => 'Debian 11',
            str_contains($normalized, 'debian12') => 'Debian 12',
            str_contains($normalized, 'centos79') => 'CentOS 7.9',
            str_contains($normalized, 'almalinux8') => 'AlmaLinux 8',
            str_contains($normalized, 'almalinux9') => 'AlmaLinux 9',
            str_contains($normalized, 'rockylinux8') => 'RockyLinux 8',
            str_contains($normalized, 'rockylinux9') => 'RockyLinux 9',
            default => null,
        };
    }

    protected function normalizeOs(?string $value): ?string
    {
        $candidate = trim((string) $value);
        if ($candidate === '') {
            return null;
        }

        foreach ($this->supportedOs() as $os) {
            if ($this->normalizeToken($os) === $this->normalizeToken($candidate)) {
                return $os;
            }
        }

        return $candidate;
    }

    protected function normalizeToken(?string $value): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', mb_strtolower(trim((string) $value)));
    }
}
