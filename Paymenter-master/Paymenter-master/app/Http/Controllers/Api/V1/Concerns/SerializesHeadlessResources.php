<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Classes\Price as PriceValue;
use App\Helpers\ExtensionHelper;
use App\Models\BillingAgreement;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Category;
use App\Models\ConfigOption;
use App\Models\Coupon;
use App\Models\Credit;
use App\Models\Currency;
use App\Models\Gateway;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoiceTransaction;
use App\Models\Plan;
use App\Models\Product;
use App\Models\Service;
use Illuminate\Support\Collection;

trait SerializesHeadlessResources
{
    protected function serializeCurrency(?Currency $currency): ?array
    {
        if (!$currency) {
            return null;
        }

        return [
            'code' => $currency->code,
            'name' => $currency->name,
            'prefix' => $currency->prefix,
            'suffix' => $currency->suffix,
            'format' => $currency->format,
        ];
    }

    protected function serializePriceObject(?PriceValue $price): ?array
    {
        if (!$price) {
            return null;
        }

        $formatted = is_object($price->formatted ?? null) ? $price->formatted : (object) [];

        return [
            'subtotal' => (float) $price->subtotal,
            'price' => (float) $price->price,
            'setup_fee' => (float) ($price->setup_fee ?? 0),
            'tax' => (float) ($price->tax ?? 0),
            'setup_fee_tax' => (float) ($price->setup_fee_tax ?? 0),
            'total_tax' => (float) ($price->total_tax ?? 0),
            'total' => (float) $price->total,
            'discount' => (float) ($price->discount ?? 0),
            'currency_code' => $price->currency?->code,
            'currency' => $this->serializeCurrency($price->currency),
            'formatted' => [
                'subtotal' => $price->format($price->subtotal),
                'price' => $formatted->price ?? $price->format($price->price),
                'setup_fee' => $formatted->setup_fee ?? $price->format($price->setup_fee),
                'tax' => $formatted->tax ?? $price->format($price->tax),
                'total' => $formatted->total ?? $price->format($price->total),
            ],
        ];
    }

    protected function resolveCartItemPrice(CartItem $item): ?PriceValue
    {
        try {
            $price = $item->price;

            return $price instanceof PriceValue ? $price : null;
        } catch (\Throwable $exception) {
            report($exception);

            $recovered = $this->recoverCartCurrencyAndResolvePrice($item);
            if ($recovered instanceof PriceValue) {
                return $recovered;
            }

            return null;
        }
    }

    protected function recoverCartCurrencyAndResolvePrice(CartItem $item): ?PriceValue
    {
        $cart = $item->cart;
        if (!$cart) {
            return null;
        }

        $items = $cart->relationLoaded('items')
            ? $cart->items
            : $cart->items()->with(['plan.prices.currency', 'product', 'cart'])->get();

        $fallbackCurrency = $this->resolveCartFallbackCurrency($items);
        if (!$fallbackCurrency) {
            return null;
        }

        if ((string) $cart->currency_code !== $fallbackCurrency) {
            $cart->currency_code = $fallbackCurrency;
            $cart->save();
        }

        $freshItem = $item->fresh(['plan.prices.currency', 'product', 'cart']);
        if (!$freshItem) {
            return null;
        }

        try {
            $price = $freshItem->price;

            return $price instanceof PriceValue ? $price : null;
        } catch (\Throwable $exception) {
            report($exception);

            return null;
        }
    }

    protected function resolveCartFallbackCurrency(Collection $items): ?string
    {
        if ($items->isEmpty()) {
            return null;
        }

        $intersection = null;

        /** @var CartItem $cartItem */
        foreach ($items as $cartItem) {
            $plan = $cartItem->plan;
            if (!$plan) {
                return null;
            }

            $codes = $plan->prices
                ->pluck('currency_code')
                ->filter(fn ($code) => is_string($code) && $code !== '')
                ->values();

            if ($codes->isEmpty()) {
                return null;
            }

            if ($intersection === null) {
                $intersection = $codes;
                continue;
            }

            $intersection = $intersection->intersect($codes)->values();
            if ($intersection->isEmpty()) {
                return null;
            }
        }

        return $intersection?->first();
    }

    protected function serializeCategory(Category $category): array
    {
        return [
            'id' => $category->id,
            'slug' => $category->slug,
            'full_slug' => $category->full_slug,
            'name' => localized_text_payload($category->name, $category->name_translations),
            'description' => localized_text_payload($category->description, $category->description_translations),
            'image' => $category->image,
            'parent_id' => $category->parent_id,
            'sort' => $category->sort,
            'product_count' => $category->visible_products_count ?? $category->products_count ?? 0,
        ];
    }

    protected function serializeProductCard(Product $product): array
    {
        $lowestPlan = $product->plans
            ->flatMap(fn (Plan $plan) => $plan->prices->map(fn ($price) => [
                'plan_id' => $plan->id,
                'plan_name' => localized_text_payload($plan->name, $plan->name_translations),
                'billing_period' => $plan->billing_period,
                'billing_unit' => $plan->billing_unit,
                'price' => $price->price,
                'setup_fee' => $price->setup_fee,
                'currency_code' => $price->currency_code,
                'currency' => $price->currency ? $this->serializeCurrency($price->currency) : null,
            ]))
            ->sortBy('price')
            ->first();

        return [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => localized_text_payload($product->name, $product->name_translations),
            'description' => localized_text_payload($product->description, $product->description_translations),
            'image' => $product->image,
            'stock' => $product->stock,
            'per_user_limit' => $product->per_user_limit,
            'allow_quantity' => $product->allow_quantity,
            'category' => $product->category ? [
                'id' => $product->category->id,
                'slug' => $product->category->slug,
                'name' => localized_text_payload($product->category->name, $product->category->name_translations),
            ] : null,
            'pricing' => $lowestPlan,
        ];
    }

    protected function serializePlan(Plan $plan): array
    {
        return [
            'id' => $plan->id,
            'name' => localized_text_payload($plan->name, $plan->name_translations),
            'type' => $plan->type,
            'billing_period' => $plan->billing_period,
            'billing_unit' => $plan->billing_unit,
            'sort' => $plan->sort,
            'prices' => $plan->prices->map(fn ($price) => [
                'id' => $price->id,
                'price' => $price->price,
                'setup_fee' => $price->setup_fee,
                'currency_code' => $price->currency_code,
                'currency' => $price->currency ? $this->serializeCurrency($price->currency) : null,
            ])->values(),
        ];
    }

    protected function serializeCheckoutField(array $field): array
    {
        $options = [];
        if (isset($field['options']) && is_array($field['options'])) {
            foreach ($field['options'] as $value => $label) {
                $options[] = [
                    'value' => (string) $value,
                    'label' => is_string($label) ? $label : (string) $value,
                ];
            }
        }

        return [
            'name' => $field['name'] ?? null,
            'label' => $field['label'] ?? ($field['name'] ?? null),
            'description' => $field['description'] ?? null,
            'type' => $field['type'] ?? 'text',
            'required' => (bool) ($field['required'] ?? false),
            'default' => $field['default'] ?? null,
            'placeholder' => $field['placeholder'] ?? null,
            'options' => $options,
            'validation' => $field['validation'] ?? null,
        ];
    }

    protected function serializeConfigOption(ConfigOption $option): array
    {
        return [
            'id' => $option->id,
            'name' => localized_text_payload($option->name, $option->name_translations),
            'description' => localized_text_payload($option->description, $option->description_translations),
            'env_variable' => $option->env_variable,
            'type' => $option->type,
            'sort' => $option->sort,
            'required' => in_array($option->type, ['text', 'number', 'select', 'radio'], true),
            'children' => $option->children->map(function (ConfigOption $child) {
                return [
                    'id' => $child->id,
                    'name' => localized_text_payload($child->name, $child->name_translations),
                    'description' => localized_text_payload($child->description, $child->description_translations),
                    'env_variable' => $child->env_variable,
                    'prices' => $child->plans->map(fn (Plan $plan) => [
                        'plan_id' => $plan->id,
                        'plan_name' => localized_text_payload($plan->name, $plan->name_translations),
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

    protected function serializeProductDetail(Product $product): array
    {
        $rawConfigOptions = $product->configOptions->values();
        $configOptions = $rawConfigOptions->map(fn (ConfigOption $option) => $this->serializeConfigOption($option))->values();
        $checkoutFields = collect(ExtensionHelper::getCheckoutConfig($product, []))
            ->map(fn ($field) => is_array($field) ? $this->serializeCheckoutField($field) : null)
            ->filter()
            ->values();

        $operatingSystemOptions = $rawConfigOptions
            ->filter(function (ConfigOption $option) {
                $haystack = strtolower(($option->name ?? '') . ' ' . ($option->env_variable ?? ''));

                return str_contains($haystack, 'os')
                    || str_contains($haystack, 'system')
                    || str_contains($haystack, 'image')
                    || str_contains($haystack, 'kernel')
                    || str_contains($haystack, '系统')
                    || str_contains($haystack, '鏡像');
            })
            ->map(fn (ConfigOption $option) => $this->serializeConfigOption($option))
            ->values();

        return [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => localized_text_payload($product->name, $product->name_translations),
            'description' => localized_text_payload($product->description, $product->description_translations),
            'image' => $product->image,
            'stock' => $product->stock,
            'per_user_limit' => $product->per_user_limit,
            'allow_quantity' => $product->allow_quantity,
            'category' => $product->category ? $this->serializeCategory($product->category) : null,
            'plans' => $product->plans->map(fn (Plan $plan) => $this->serializePlan($plan))->values(),
            'config_options' => $configOptions,
            'operating_system_options' => $operatingSystemOptions,
            'checkout_fields' => $checkoutFields,
        ];
    }

    protected function serializeGateway(Gateway $gateway): array
    {
        return [
            'id' => $gateway->id,
            'name' => $gateway->name ?: ($gateway->meta?->name ?? ucfirst($gateway->extension)),
            'extension' => $gateway->extension,
            'type' => $gateway->type,
            'enabled' => (bool) $gateway->enabled,
            'description' => $gateway->meta?->description ?? null,
        ];
    }

    protected function serializeCredit(?Credit $credit): ?array
    {
        if (!$credit) {
            return null;
        }

        return [
            'amount' => (float) $credit->amount,
            'currency_code' => $credit->currency_code,
            'currency' => $this->serializeCurrency($credit->currency),
            'formatted_amount' => (string) $credit->formatted_amount,
        ];
    }

    protected function serializeCoupon(?Coupon $coupon): ?array
    {
        if (!$coupon) {
            return null;
        }

        return [
            'id' => $coupon->id,
            'code' => $coupon->code,
            'type' => $coupon->type,
            'value' => $coupon->value,
            'recurring' => $coupon->recurring,
            'starts_at' => optional($coupon->starts_at)?->toISOString(),
            'expires_at' => optional($coupon->expires_at)?->toISOString(),
        ];
    }

    protected function serializeCartItem(CartItem $item): array
    {
        $itemPrice = $this->resolveCartItemPrice($item);

        return [
            'id' => $item->id,
            'quantity' => $item->quantity,
            'product' => $this->serializeProductCard($item->product),
            'plan' => [
                'id' => $item->plan->id,
                'name' => localized_text_payload($item->plan->name, $item->plan->name_translations),
                'type' => $item->plan->type,
                'billing_period' => $item->plan->billing_period,
                'billing_unit' => $item->plan->billing_unit,
            ],
            'config_options' => $item->config_options ?? [],
            'checkout_config' => $item->checkout_config ?? [],
            'price' => $this->serializePriceObject($itemPrice),
        ];
    }

    protected function serializeCart(Cart $cart, ?Credit $credit = null): array
    {
        $currency = $cart->currency ?: Currency::query()->find($cart->currency_code);
        $cartTotal = $cart->items->sum(function (CartItem $item) {
            $itemPrice = $this->resolveCartItemPrice($item);

            return ((float) ($itemPrice?->total ?? 0)) * max((int) $item->quantity, 1);
        });

        $totalPrice = new PriceValue([
            'price' => $cartTotal,
            'currency' => $currency,
        ]);
        $gateways = ExtensionHelper::getCheckoutGateways($totalPrice->total, $currency?->code, 'cart', $cart->items);

        return [
            'id' => $cart->id,
            'currency_code' => $cart->currency_code,
            'currency' => $this->serializeCurrency($currency),
            'items' => $cart->items->map(fn (CartItem $item) => $this->serializeCartItem($item))->values(),
            'coupon' => $this->serializeCoupon($cart->coupon),
            'totals' => $this->serializePriceObject($totalPrice),
            'credits' => $this->serializeCredit($credit),
            'gateways' => collect($gateways)->map(fn (Gateway $gateway) => $this->serializeGateway($gateway))->values(),
        ];
    }

    protected function serializeBillingAgreement(BillingAgreement $agreement): array
    {
        return [
            'id' => $agreement->id,
            'ulid' => $agreement->ulid,
            'name' => $agreement->name,
            'type' => $agreement->type,
            'expiry' => $agreement->expiry,
            'gateway' => $agreement->gateway ? $this->serializeGateway($agreement->gateway) : null,
        ];
    }

    protected function serializeService(Service $service, bool $includeRelations = false): array
    {
        $payload = [
            'id' => $service->id,
            'label' => $service->label,
            'base_label' => $service->baseLabel,
            'status' => $service->status,
            'price' => (float) $service->price,
            'quantity' => $service->quantity,
            'currency_code' => $service->currency_code,
            'currency' => $this->serializeCurrency($service->currency),
            'formatted_price' => (string) $service->formatted_price,
            'expires_at' => optional($service->expires_at)?->toISOString(),
            'product' => $service->product ? $this->serializeProductCard($service->product) : null,
            'plan' => $service->plan ? [
                'id' => $service->plan->id,
                'name' => localized_text_payload($service->plan->name, $service->plan->name_translations),
                'type' => $service->plan->type,
                'billing_period' => $service->plan->billing_period,
                'billing_unit' => $service->plan->billing_unit,
            ] : null,
            'cancellable' => (bool) $service->cancellable,
            'upgradable' => (bool) $service->upgradable,
            'provisioning' => $service->latestProvisioningJob ? [
                'status' => $service->latestProvisioningJob->status,
                'provider' => $service->latestProvisioningJob->provider,
                'attempt_count' => (int) $service->latestProvisioningJob->attempt_count,
                'error_message' => $service->latestProvisioningJob->error_message,
                'last_attempt_at' => optional($service->latestProvisioningJob->last_attempt_at)?->toISOString(),
                'completed_at' => optional($service->latestProvisioningJob->completed_at)?->toISOString(),
            ] : null,
        ];

        if (!$includeRelations) {
            return $payload;
        }

        $payload['properties'] = $service->properties
            ->map(fn ($property) => [
                'key' => $property->key,
                'name' => $property->name ?: $property->key,
                'value' => $property->value,
            ])
            ->values();

        $payload['configs'] = $service->configs
            ->map(fn ($config) => [
                'id' => $config->id,
                'option' => $config->configOption ? [
                    'id' => $config->configOption->id,
                    'name' => localized_text_payload($config->configOption->name, $config->configOption->name_translations),
                    'env_variable' => $config->configOption->env_variable,
                ] : null,
                'value' => $config->configValue ? [
                    'id' => $config->configValue->id,
                    'name' => localized_text_payload($config->configValue->name, $config->configValue->name_translations),
                    'env_variable' => $config->configValue->env_variable,
                ] : null,
            ])
            ->values();

        $payload['billing_agreement'] = $service->billingAgreement ? $this->serializeBillingAgreement($service->billingAgreement) : null;
        $payload['cancellation'] = $service->cancellation ? [
            'id' => $service->cancellation->id,
            'type' => $service->cancellation->type,
            'reason' => $service->cancellation->reason,
            'created_at' => optional($service->cancellation->created_at)?->toISOString(),
        ] : null;

        return $payload;
    }

    protected function serializeInvoiceItem(InvoiceItem $item): array
    {
        return [
            'id' => $item->id,
            'description' => localized_text_payload($item->description, null),
            'price' => (float) $item->price,
            'quantity' => $item->quantity,
            'total' => (float) $item->total(),
            'formatted_price' => (string) $item->formatted_price,
            'formatted_total' => (string) $item->formatted_total,
            'reference_type' => $item->reference_type,
            'reference_id' => $item->reference_id,
        ];
    }

    protected function serializeInvoiceTransaction(InvoiceTransaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'status' => $transaction->status?->value ?? (string) $transaction->status,
            'amount' => (float) $transaction->amount,
            'fee' => (float) ($transaction->fee ?? 0),
            'transaction_id' => $transaction->transaction_id,
            'gateway' => $transaction->gateway ? $this->serializeGateway($transaction->gateway) : null,
            'is_credit_transaction' => (bool) $transaction->is_credit_transaction,
            'created_at' => optional($transaction->created_at)?->toISOString(),
            'updated_at' => optional($transaction->updated_at)?->toISOString(),
        ];
    }

    protected function serializeInvoice(Invoice $invoice, bool $includeRelations = false): array
    {
        $payload = [
            'id' => $invoice->id,
            'number' => $invoice->number,
            'status' => $invoice->status,
            'currency_code' => $invoice->currency_code,
            'currency' => $this->serializeCurrency($invoice->currency),
            'total' => (float) $invoice->total,
            'remaining' => (float) $invoice->remaining,
            'formatted_total' => (string) $invoice->formatted_total,
            'formatted_remaining' => (string) $invoice->formatted_remaining,
            'due_at' => optional($invoice->due_at)?->toISOString(),
            'created_at' => optional($invoice->created_at)?->toISOString(),
            'user_name' => $invoice->userName,
        ];

        if (!$includeRelations) {
            return $payload;
        }

        $payload['items'] = $invoice->items->map(fn (InvoiceItem $item) => $this->serializeInvoiceItem($item))->values();
        $payload['transactions'] = $invoice->transactions->map(fn (InvoiceTransaction $transaction) => $this->serializeInvoiceTransaction($transaction))->values();

        return $payload;
    }
}
