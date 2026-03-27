<?php

namespace App\Http\Controllers\Api\V1\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\ConfigOption;
use App\Models\Plan;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    /**
     * Return visible storefront categories.
     */
    public function categories(): JsonResponse
    {
        $categories = Category::query()
            ->withCount([
                'products as visible_products_count' => fn ($query) => $query->where('hidden', false),
            ])
            ->whereHas('products', fn ($query) => $query->where('hidden', false))
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $categories->map(fn (Category $category) => $this->serializeCategory($category)),
        ]);
    }

    /**
     * Return visible storefront products.
     */
    public function products(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $products = Product::query()
            ->with(['category', 'plans.prices.currency'])
            ->where('hidden', false)
            ->when(
                $validated['category'] ?? null,
                fn ($query, $categorySlug) => $query->whereHas('category', fn ($categoryQuery) => $categoryQuery->where('slug', $categorySlug))
            )
            ->orderBy('sort')
            ->orderBy('id')
            ->paginate($validated['per_page'] ?? 24);

        return response()->json([
            'data' => $products->getCollection()->map(fn (Product $product) => $this->serializeProductCard($product)),
            'meta' => [
                'current_page' => $products->currentPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
                'last_page' => $products->lastPage(),
            ],
        ]);
    }

    /**
     * Return a storefront product with real plans and config options.
     */
    public function product(Product $product): JsonResponse
    {
        abort_if((bool) $product->hidden, 404);

        $product->load([
            'category',
            'plans.prices.currency',
            'configOptions.children.plans.prices.currency',
        ]);

        return response()->json([
            'data' => [
                'product' => $this->serializeProductDetail($product),
            ],
        ]);
    }

    /**
     * Serialize a category for storefront clients.
     *
     * @return array<string, mixed>
     */
    protected function serializeCategory(Category $category): array
    {
        return [
            'id' => $category->id,
            'slug' => $category->slug,
            'full_slug' => $category->full_slug,
            'name' => $category->name,
            'description' => $category->description,
            'image' => $category->image,
            'parent_id' => $category->parent_id,
            'sort' => $category->sort,
            'product_count' => $category->visible_products_count ?? 0,
        ];
    }

    /**
     * Serialize a product for catalog cards.
     *
     * @return array<string, mixed>
     */
    protected function serializeProductCard(Product $product): array
    {
        $lowestPlan = $product->plans
            ->flatMap(fn (Plan $plan) => $plan->prices->map(fn ($price) => [
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
                'billing_period' => $plan->billing_period,
                'billing_unit' => $plan->billing_unit,
                'price' => $price->price,
                'setup_fee' => $price->setup_fee,
                'currency_code' => $price->currency_code,
            ]))
            ->sortBy('price')
            ->first();

        return [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'image' => $product->image,
            'stock' => $product->stock,
            'per_user_limit' => $product->per_user_limit,
            'allow_quantity' => $product->allow_quantity,
            'category' => $product->category ? [
                'id' => $product->category->id,
                'slug' => $product->category->slug,
                'name' => $product->category->name,
            ] : null,
            'pricing' => $lowestPlan,
        ];
    }

    /**
     * Serialize a product detail payload.
     *
     * @return array<string, mixed>
     */
    protected function serializeProductDetail(Product $product): array
    {
        $configOptions = $product->configOptions->map(fn (ConfigOption $option) => $this->serializeConfigOption($option))->values();

        $operatingSystemOptions = $configOptions
            ->filter(function (array $option) {
                $haystack = strtolower(($option['name'] ?? '') . ' ' . ($option['env_variable'] ?? ''));

                return str_contains($haystack, 'os')
                    || str_contains($haystack, 'system')
                    || str_contains($haystack, 'image')
                    || str_contains($haystack, '系统')
                    || str_contains($haystack, '镜像');
            })
            ->values();

        return [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'image' => $product->image,
            'stock' => $product->stock,
            'per_user_limit' => $product->per_user_limit,
            'allow_quantity' => $product->allow_quantity,
            'category' => $product->category ? $this->serializeCategory($product->category) : null,
            'plans' => $product->plans->map(fn (Plan $plan) => $this->serializePlan($plan))->values(),
            'config_options' => $configOptions,
            'operating_system_options' => $operatingSystemOptions,
        ];
    }

    /**
     * Serialize a billing plan.
     *
     * @return array<string, mixed>
     */
    protected function serializePlan(Plan $plan): array
    {
        return [
            'id' => $plan->id,
            'name' => $plan->name,
            'type' => $plan->type,
            'billing_period' => $plan->billing_period,
            'billing_unit' => $plan->billing_unit,
            'sort' => $plan->sort,
            'prices' => $plan->prices->map(fn ($price) => [
                'id' => $price->id,
                'price' => $price->price,
                'setup_fee' => $price->setup_fee,
                'currency_code' => $price->currency_code,
                'currency' => $price->currency ? [
                    'code' => $price->currency->code,
                    'prefix' => $price->currency->prefix,
                    'suffix' => $price->currency->suffix,
                    'format' => $price->currency->format,
                ] : null,
            ])->values(),
        ];
    }

    /**
     * Serialize a product config option with storefront-friendly shape.
     *
     * @return array<string, mixed>
     */
    protected function serializeConfigOption(ConfigOption $option): array
    {
        return [
            'id' => $option->id,
            'name' => $option->name,
            'description' => $option->description,
            'env_variable' => $option->env_variable,
            'type' => $option->type,
            'sort' => $option->sort,
            'required' => in_array($option->type, ['text', 'number', 'select', 'radio'], true),
            'children' => $option->children->map(function (ConfigOption $child) {
                return [
                    'id' => $child->id,
                    'name' => $child->name,
                    'description' => $child->description,
                    'env_variable' => $child->env_variable,
                    'prices' => $child->plans->map(fn (Plan $plan) => [
                        'plan_id' => $plan->id,
                        'plan_name' => $plan->name,
                        'billing_period' => $plan->billing_period,
                        'billing_unit' => $plan->billing_unit,
                        'prices' => $plan->prices->map(fn ($price) => [
                            'id' => $price->id,
                            'price' => $price->price,
                            'setup_fee' => $price->setup_fee,
                            'currency_code' => $price->currency_code,
                        ])->values(),
                    ])->values(),
                ];
            })->values(),
        ];
    }
}

