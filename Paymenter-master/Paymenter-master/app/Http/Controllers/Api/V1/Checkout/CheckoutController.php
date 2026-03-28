<?php

namespace App\Http\Controllers\Api\V1\Checkout;

use App\Exceptions\DisplayException;
use App\Http\Controllers\Api\V1\Concerns\InteractsWithHeadlessCart;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Jobs\Server\CreateJob;
use App\Models\CartItem;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Product;
use App\Models\Service;
use App\Models\User;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CheckoutController extends Controller
{
    use InteractsWithHeadlessCart;
    use SerializesHeadlessResources;

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tos' => ['sometimes', 'boolean'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $cart = $this->resolveHeadlessCart($user);

        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages([
                'cart' => ['Your cart is empty.'],
            ]);
        }

        if (config('settings.mail_must_verify') && method_exists($user, 'hasVerifiedEmail') && !$user->hasVerifiedEmail()) {
            throw ValidationException::withMessages([
                'email' => ['Please verify your email before checking out.'],
            ]);
        }

        if (config('settings.tos') && !($validated['tos'] ?? false)) {
            throw ValidationException::withMessages([
                'tos' => ['You must accept the terms of service.'],
            ]);
        }

        if ($cart->coupon) {
            $this->validateCouponForCart($cart, $user, $cart->coupon->code);
        }

        try {
            [$order, $invoice, $redirect] = DB::transaction(function () use ($cart, $user) {
                $cart = $this->loadHeadlessCart($cart->fresh());
                $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

                foreach ($cart->items as $item) {
                    if (!$item->price->available) {
                        throw new DisplayException("The selected plan for {$item->product->name} is not available in currency {$cart->currency_code}.");
                    }

                    $lockedProduct = Product::query()->whereKey($item->product_id)->lockForUpdate()->firstOrFail();

                    $cartQuantity = $cart->items
                        ->where('product_id', $item->product_id)
                        ->sum('quantity');

                    if (
                        $lockedProduct->per_user_limit > 0
                        && ($lockedUser->services()->where('product_id', $item->product_id)->count() + $cartQuantity) > $lockedProduct->per_user_limit
                    ) {
                        throw new DisplayException(__('product.user_limit', ['product' => $lockedProduct->name]));
                    }

                    if ($lockedProduct->stock !== null) {
                        if ($lockedProduct->stock < $item->quantity) {
                            throw new DisplayException(__('product.out_of_stock', ['product' => $lockedProduct->name]));
                        }

                        $lockedProduct->stock -= $item->quantity;
                        $lockedProduct->save();
                    }
                }

                $order = Order::create([
                    'user_id' => $lockedUser->id,
                    'currency_code' => $cart->currency_code,
                ]);

                $invoice = null;
                $cartTotal = $cart->items->sum(fn (CartItem $item) => $item->price->total * $item->quantity);

                if ($cartTotal > 0) {
                    $invoice = Invoice::create([
                        'user_id' => $lockedUser->id,
                        'due_at' => now()->addDays(7),
                        'currency_code' => $cart->currency_code,
                    ]);
                }

                foreach ($cart->items as $item) {
                    $servicePrice = $item->price->price;

                    if ($cart->coupon && ($cart->coupon->recurring === null || (int) $cart->coupon->recurring === 1)) {
                        $servicePrice = $item->price->original_price;
                    }

                    $service = $order->services()->create([
                        'user_id' => $lockedUser->id,
                        'currency_code' => $cart->currency_code,
                        'product_id' => $item->product->id,
                        'plan_id' => $item->plan->id,
                        'price' => $servicePrice,
                        'quantity' => $item->quantity,
                        'coupon_id' => $cart->coupon_id,
                    ]);

                    foreach (($item->checkout_config ?? []) as $key => $value) {
                        $service->properties()->updateOrCreate(
                            ['key' => $key],
                            ['value' => $value],
                        );
                    }

                    foreach (($item->config_options ?? []) as $configOption) {
                        $configOption = (object) $configOption;

                        if (in_array($configOption->option_type, ['text', 'number'], true)) {
                            if (!isset($configOption->value)) {
                                continue;
                            }

                            $service->properties()->updateOrCreate(
                                ['key' => $configOption->option_env_variable ?: $configOption->option_name],
                                [
                                    'name' => $configOption->option_name,
                                    'value' => $configOption->value,
                                ],
                            );

                            continue;
                        }

                        if (!isset($configOption->value) || $configOption->value === null) {
                            continue;
                        }

                        $service->configs()->create([
                            'config_option_id' => $configOption->option_id,
                            'config_value_id' => $configOption->value,
                        ]);
                    }

                    if ($invoice && $item->price->total > 0) {
                        $invoice->items()->create([
                            'reference_id' => $service->id,
                            'reference_type' => Service::class,
                            'price' => $item->price->total,
                            'quantity' => $item->quantity,
                            'description' => $service->description,
                        ]);
                    } else {
                        if ($service->product->server) {
                            CreateJob::dispatch($service);
                        }

                        $service->status = Service::STATUS_ACTIVE;
                        $service->expires_at = $service->calculateNextDueDate();
                        $service->save();
                    }
                }

                $cart->items()->delete();
                $cart->coupon_id = null;
                $cart->save();

                $redirect = [
                    'type' => 'services',
                    'path' => '/services',
                ];

                $order->load('services.product.category', 'services.plan', 'services.currency');

                if (!$invoice && $order->services->count() === 1) {
                    $redirect = [
                        'type' => 'service',
                        'path' => '/services/' . $order->services->first()->id,
                    ];
                }

                if ($invoice) {
                    $invoice->load(['currency', 'items', 'transactions.gateway']);
                    $redirect = [
                        'type' => 'invoice',
                        'path' => '/invoices/' . ($invoice->number ?: $invoice->id),
                    ];
                }

                return [$order, $invoice, $redirect];
            });
        } catch (DisplayException $exception) {
            throw ValidationException::withMessages([
                'checkout' => [$exception->getMessage()],
            ]);
        } catch (Exception $exception) {
            report($exception);

            throw ValidationException::withMessages([
                'checkout' => ['An error occurred while processing your order. Please try again later.'],
            ]);
        }

        return response()->json([
            'message' => 'Order created successfully.',
            'data' => [
                'order' => [
                    'id' => $order->id,
                    'currency_code' => $order->currency_code,
                    'total' => (float) $order->total,
                    'formatted_total' => (string) $order->formatted_total,
                    'services' => $order->services->map(fn (Service $service) => $this->serializeService($service))->values(),
                ],
                'invoice' => $invoice ? $this->serializeInvoice($invoice, true) : null,
                'redirect' => $redirect,
            ],
        ], 201);
    }
}
