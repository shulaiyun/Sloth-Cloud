<?php

namespace App\Http\Controllers\Api\V1\Catalog;

use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    use SerializesHeadlessResources;

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

    public function product(Product $product): JsonResponse
    {
        abort_if((bool) $product->hidden, 404);

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
}
