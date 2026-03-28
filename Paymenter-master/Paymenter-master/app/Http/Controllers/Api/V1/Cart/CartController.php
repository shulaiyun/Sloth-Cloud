<?php

namespace App\Http\Controllers\Api\V1\Cart;

use App\Http\Controllers\Api\V1\Concerns\InteractsWithHeadlessCart;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Credit;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class CartController extends Controller
{
    use InteractsWithHeadlessCart;
    use SerializesHeadlessResources;

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $cart = $this->resolveHeadlessCart($user);
        $credit = Credit::query()
            ->where('user_id', $user->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'data' => $this->serializeCart($cart, $credit),
        ]);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_slug' => ['required', 'string', 'max:255'],
            'plan_id' => ['required'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'config_options' => ['sometimes', 'array'],
            'checkout_config' => ['sometimes', 'array'],
        ]);

        $user = $request->user();
        $cart = $this->resolveHeadlessCart($user);
        $product = Product::query()
            ->with(['category', 'plans.prices.currency', 'configOptions.children.plans.prices.currency', 'server', 'settings'])
            ->where('slug', $validated['product_slug'])
            ->where('hidden', false)
            ->firstOrFail();
        $plan = $product->plans->firstWhere('id', $validated['plan_id']);

        if (!$plan) {
            throw ValidationException::withMessages([
                'plan_id' => ['The selected billing plan is invalid for this product.'],
            ]);
        }

        if ($plan->type !== 'free' && !$plan->prices->contains('currency_code', $cart->currency_code)) {
            $fallbackCurrency = $plan->prices->first()?->currency_code;

            if (!$fallbackCurrency) {
                throw ValidationException::withMessages([
                    'plan_id' => ['The selected billing plan does not have any price configured.'],
                ]);
            }

            if ($cart->items->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'plan_id' => ["The selected billing plan is unavailable in {$cart->currency_code}. Empty your cart first or choose another plan."],
                ]);
            }

            $cart->currency_code = $fallbackCurrency;
            $cart->save();
            $cart = $this->loadHeadlessCart($cart->fresh());
        }

        $quantity = (int) ($validated['quantity'] ?? 1);
        if ($product->allow_quantity === 'disabled') {
            $quantity = 1;
        }

        if ($product->stock !== null && $product->stock < $quantity) {
            throw ValidationException::withMessages([
                'quantity' => ['This product does not have enough stock for the requested quantity.'],
            ]);
        }

        if ($product->allow_quantity === 'disabled' && $cart->items->contains('product_id', $product->id)) {
            throw ValidationException::withMessages([
                'product_slug' => ['This product is already in your cart and cannot be added again.'],
            ]);
        }

        $configPayload = $this->buildConfigOptionsPayload($product, $plan, $validated['config_options'] ?? []);
        $checkoutPayload = $this->buildCheckoutConfigPayload($product, $validated['checkout_config'] ?? []);

        $mergeableItem = null;
        if ($product->allow_quantity === 'combined') {
            $mergeableItem = $cart->items->first(function (CartItem $item) use ($product, $plan, $configPayload, $checkoutPayload) {
                return $item->product_id === $product->id
                    && $item->plan_id === $plan->id
                    && json_encode($item->config_options) === json_encode($configPayload)
                    && json_encode($item->checkout_config) === json_encode($checkoutPayload);
            });
        }

        if ($mergeableItem) {
            $mergeableItem->quantity += $quantity;
            $mergeableItem->save();
        } else {
            $cart->items()->create([
                'product_id' => $product->id,
                'plan_id' => $plan->id,
                'config_options' => $configPayload,
                'checkout_config' => $checkoutPayload,
                'quantity' => $quantity,
            ]);
        }

        $cart = $this->loadHeadlessCart($cart->fresh());
        $credit = Credit::query()
            ->where('user_id', $user->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'message' => 'Item added to cart.',
            'data' => $this->serializeCart($cart, $credit),
        ], 201);
    }

    public function updateItem(Request $request, CartItem $item): JsonResponse
    {
        $cart = $this->resolveHeadlessCart($request->user());
        abort_unless($item->cart_id === $cart->id, 404);

        $validated = Validator::make($request->all(), [
            'quantity' => ['required', 'integer', 'min:1', 'max:100'],
        ])->validate();

        if ($item->product->allow_quantity !== 'combined') {
            throw ValidationException::withMessages([
                'quantity' => ['This cart item does not support quantity changes.'],
            ]);
        }

        if ($item->product->stock !== null && $item->product->stock < $validated['quantity']) {
            throw ValidationException::withMessages([
                'quantity' => ['This product does not have enough stock for the requested quantity.'],
            ]);
        }

        $item->quantity = (int) $validated['quantity'];
        $item->save();

        $cart = $this->loadHeadlessCart($cart->fresh());
        $credit = Credit::query()
            ->where('user_id', $request->user()->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'message' => 'Cart item updated.',
            'data' => $this->serializeCart($cart, $credit),
        ]);
    }

    public function destroyItem(Request $request, CartItem $item): JsonResponse
    {
        $cart = $this->resolveHeadlessCart($request->user());
        abort_unless($item->cart_id === $cart->id, 404);

        $item->delete();
        $cart = $this->loadHeadlessCart($cart->fresh());
        $credit = Credit::query()
            ->where('user_id', $request->user()->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'message' => 'Cart item removed.',
            'data' => $this->serializeCart($cart, $credit),
        ]);
    }

    public function applyCoupon(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $cart = $this->resolveHeadlessCart($user);
        $coupon = $this->validateCouponForCart($cart, $user, $validated['code']);

        $cart->coupon_id = $coupon->id;
        $cart->save();
        $cart = $this->loadHeadlessCart($cart->fresh());

        $hasDiscountedItems = $cart->items->isEmpty()
            || $cart->items->contains(fn (CartItem $item) => $item->price->hasDiscount());

        if (!$hasDiscountedItems) {
            $cart->coupon_id = null;
            $cart->save();

            throw ValidationException::withMessages([
                'code' => ['Coupon code is not valid for any items in your cart.'],
            ]);
        }

        $credit = Credit::query()
            ->where('user_id', $user->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'message' => 'Coupon applied.',
            'data' => $this->serializeCart($cart, $credit),
        ]);
    }

    public function removeCoupon(Request $request): JsonResponse
    {
        $user = $request->user();
        $cart = $this->resolveHeadlessCart($user);
        $cart->coupon_id = null;
        $cart->save();
        $cart = $this->loadHeadlessCart($cart->fresh());
        $credit = Credit::query()
            ->where('user_id', $user->id)
            ->where('currency_code', $cart->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'message' => 'Coupon removed.',
            'data' => $this->serializeCart($cart, $credit),
        ]);
    }
}
