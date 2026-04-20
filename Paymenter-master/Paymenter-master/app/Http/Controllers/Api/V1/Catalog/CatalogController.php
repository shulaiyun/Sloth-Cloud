<?php

namespace App\Http\Controllers\Api\V1\Catalog;

use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Services\VpsApps\VpsAppCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    use SerializesHeadlessResources;

    private const INTERNAL_CATEGORY_SLUG = 'app-hosting';

    private function catalogVisibility(Request $request): string
    {
        return $request->query('visibility') === 'all' ? 'all' : 'public';
    }

    private function applyVisibilityToProductQuery($query, string $visibility)
    {
        if ($visibility === 'all') {
            return $query;
        }

        return $query->where(function ($builder) {
            $builder
                ->whereNull('category_id')
                ->orWhereHas('category', fn ($categoryQuery) => $categoryQuery->where('slug', '!=', self::INTERNAL_CATEGORY_SLUG));
        });
    }

    public function categories(): JsonResponse
    {
        $visibility = $this->catalogVisibility(request());
        $onlyWithProducts = request()->boolean('only_with_products', false);

        $categories = Category::query()
            ->when(
                $visibility !== 'all',
                fn ($query) => $query->where('slug', '!=', self::INTERNAL_CATEGORY_SLUG)
            )
            ->withCount([
                'products as visible_products_count' => fn ($query) => $this->applyVisibilityToProductQuery(
                    $query->where('hidden', false),
                    $visibility
                ),
            ])
            ->when(
                $onlyWithProducts,
                fn ($query) => $query->whereHas('products', fn ($productQuery) => $this->applyVisibilityToProductQuery(
                    $productQuery->where('hidden', false),
                    $visibility
                ))
            )
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $categories->map(fn (Category $category) => $this->serializeCategory($category)),
        ]);
    }

    public function products(Request $request): JsonResponse
    {
        $visibility = $this->catalogVisibility($request);
        $validated = $request->validate([
            'category' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $products = Product::query()
            ->with(['category', 'plans.prices.currency'])
            ->where('hidden', false)
            ->when(
                true,
                fn ($query) => $this->applyVisibilityToProductQuery($query, $visibility)
            )
            ->when(
                $validated['category'] ?? null,
                function ($query, $categorySlug) use ($visibility) {
                    if ($visibility !== 'all' && $categorySlug === self::INTERNAL_CATEGORY_SLUG) {
                        return $query->whereRaw('1 = 0');
                    }

                    return $query->whereHas('category', fn ($categoryQuery) => $categoryQuery->where('slug', $categorySlug));
                }
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

    public function product(Request $request, Product $product): JsonResponse
    {
        abort_if((bool) $product->hidden, 404);
        abort_if(
            $this->catalogVisibility($request) !== 'all' && optional($product->category)->slug === self::INTERNAL_CATEGORY_SLUG,
            404
        );

        $product->load([
            'category',
            'plans.prices.currency',
            'configOptions.children.plans.prices.currency',
            'server',
            'settings',
        ]);

        return response()->json([
            'data' => [
                'product' => $this->serializeProductDetail($product),
            ],
        ]);
    }

    public function vpsAppMarket(Request $request, Product $product, VpsAppCatalogService $catalogService): JsonResponse
    {
        abort_if((bool) $product->hidden, 404);
        abort_if(
            $this->catalogVisibility($request) !== 'all' && optional($product->category)->slug === self::INTERNAL_CATEGORY_SLUG,
            404
        );

        $validated = $request->validate([
            'os' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $product->loadMissing([
            'category',
            'plans.prices.currency',
            'configOptions.children.plans.prices.currency',
            'server',
            'settings',
        ]);

        return response()->json([
            'data' => $catalogService->marketForProduct(
                $product,
                $validated['os'] ?? null,
            ),
        ]);
    }
}
