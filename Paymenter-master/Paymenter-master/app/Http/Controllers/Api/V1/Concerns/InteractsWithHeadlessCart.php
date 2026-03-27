<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Helpers\ExtensionHelper;
use App\Models\Cart;
use App\Models\ConfigOption;
use App\Models\Coupon;
use App\Models\Currency;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

trait InteractsWithHeadlessCart
{
    protected function resolveHeadlessCart(User $user): Cart
    {
        $cart = Cart::query()
            ->where('user_id', $user->id)
            ->latest('id')
            ->first();

        if (!$cart) {
            $cart = Cart::create([
                'user_id' => $user->id,
                'currency_code' => Currency::defaultCode() ?? config('settings.default_currency', 'USD'),
            ]);
        }

        return $this->loadHeadlessCart($cart);
    }

    protected function loadHeadlessCart(Cart $cart): Cart
    {
        return $cart->load([
            'currency',
            'coupon.products',
            'coupon.services',
            'items.plan.prices.currency',
            'items.product.category',
            'items.product.configOptions.children.plans.prices.currency',
        ]);
    }

    protected function buildConfigOptionsPayload(Product $product, Plan $plan, array $configOptions): array
    {
        $product->loadMissing('configOptions.children.plans.prices.currency');

        $rules = [];
        $attributes = [];

        foreach ($product->configOptions as $option) {
            $attributes["configOptions.{$option->id}"] = $option->name;

            if (in_array($option->type, ['text', 'number'], true)) {
                $rules["configOptions.{$option->id}"] = ['required'];
                continue;
            }

            if ($option->type === 'checkbox') {
                $rules["configOptions.{$option->id}"] = ['nullable', 'boolean'];
                continue;
            }

            $rules["configOptions.{$option->id}"] = [
                'required',
                Rule::in($option->children->pluck('id')->map(fn ($id) => (string) $id)->all()),
            ];
        }

        Validator::make(
            ['configOptions' => $configOptions],
            $rules,
            [],
            $attributes,
        )->validate();

        return $product->configOptions
            ->map(function (ConfigOption $option) use ($configOptions) {
                if ($option->type === 'checkbox') {
                    $enabled = isset($configOptions[$option->id]) && filter_var($configOptions[$option->id], FILTER_VALIDATE_BOOL);

                    return [
                        'option_id' => $option->id,
                        'option_name' => $option->name,
                        'option_type' => $option->type,
                        'option_env_variable' => $option->env_variable,
                        'value' => $enabled ? $option->children->first()?->id : null,
                        'value_name' => $enabled ? 'Yes' : 'No',
                    ];
                }

                if (in_array($option->type, ['text', 'number'], true)) {
                    $value = $configOptions[$option->id] ?? null;

                    return [
                        'option_id' => $option->id,
                        'option_name' => $option->name,
                        'option_type' => $option->type,
                        'option_env_variable' => $option->env_variable,
                        'value' => $value,
                        'value_name' => $value,
                    ];
                }

                $selectedId = (string) ($configOptions[$option->id] ?? '');
                $selected = $option->children->firstWhere('id', $selectedId);

                return [
                    'option_id' => $option->id,
                    'option_name' => $option->name,
                    'option_type' => $option->type,
                    'option_env_variable' => $option->env_variable,
                    'value' => $selectedId,
                    'value_name' => $selected?->name,
                ];
            })
            ->values()
            ->all();
    }

    protected function buildCheckoutConfigPayload(Product $product, array $checkoutConfig): array
    {
        $checkoutFields = collect(ExtensionHelper::getCheckoutConfig($product, $checkoutConfig))
            ->filter(fn ($field) => is_array($field) && isset($field['name']))
            ->values();

        if ($checkoutFields->isEmpty()) {
            return [];
        }

        $rules = [];
        $attributes = [];

        foreach ($checkoutFields as $field) {
            $fieldRules = [];

            if (($field['required'] ?? false) === true) {
                $fieldRules[] = 'required';
            } else {
                $fieldRules[] = 'nullable';
            }

            switch ($field['type'] ?? 'text') {
                case 'number':
                    $fieldRules[] = 'numeric';
                    break;
                case 'checkbox':
                    $fieldRules[] = 'boolean';
                    break;
                case 'select':
                case 'radio':
                    $fieldRules[] = Rule::in(array_map('strval', array_keys($field['options'] ?? [])));
                    break;
                default:
                    $fieldRules[] = 'string';
                    break;
            }

            if (isset($field['validation'])) {
                $extraRules = is_array($field['validation'])
                    ? $field['validation']
                    : explode('|', (string) $field['validation']);

                $fieldRules = array_merge($fieldRules, $extraRules);
            }

            $rules["checkoutConfig.{$field['name']}"] = $fieldRules;
            $attributes["checkoutConfig.{$field['name']}"] = $field['label'] ?? $field['name'];
        }

        Validator::make(
            ['checkoutConfig' => $checkoutConfig],
            $rules,
            [],
            $attributes,
        )->validate();

        return collect($checkoutFields)
            ->mapWithKeys(function (array $field) use ($checkoutConfig) {
                $name = $field['name'];
                $default = $field['default'] ?? null;

                return [$name => $checkoutConfig[$name] ?? $default];
            })
            ->toArray();
    }

    protected function validateCouponForCart(Cart $cart, User $user, string $couponCode): Coupon
    {
        $coupon = Coupon::query()
            ->with(['products', 'services'])
            ->where('code', $couponCode)
            ->first();

        if (!$coupon) {
            throw ValidationException::withMessages([
                'coupon' => ['Coupon code not found.'],
            ]);
        }

        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            throw ValidationException::withMessages([
                'coupon' => ['Coupon code has expired.'],
            ]);
        }

        if ($coupon->starts_at && $coupon->starts_at->isFuture()) {
            throw ValidationException::withMessages([
                'coupon' => ['Coupon code is not active yet.'],
            ]);
        }

        if ($coupon->max_uses && $coupon->services->count() >= $coupon->max_uses) {
            throw ValidationException::withMessages([
                'coupon' => ['Coupon code has reached its maximum uses.'],
            ]);
        }

        if ($coupon->hasExceededMaxUsesPerUser($user->id)) {
            throw ValidationException::withMessages([
                'coupon' => ['You have already used this coupon the maximum number of times allowed.'],
            ]);
        }

        if ($coupon->products->isNotEmpty()) {
            $applicable = $cart->items->contains(fn ($item) => $coupon->products->contains('id', $item->product_id));

            if (!$applicable) {
                throw ValidationException::withMessages([
                    'coupon' => ['Coupon code is not valid for any items in your cart.'],
                ]);
            }
        }

        return $coupon;
    }
}
