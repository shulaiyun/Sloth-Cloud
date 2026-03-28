<?php

namespace App\Models;

use App\Classes\Price;
use App\Observers\CartItemObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(CartItemObserver::class)]
class CartItem extends Model
{
    protected $fillable = [
        'cart_id',
        'product_id',
        'plan_id',
        'config_options',
        'checkout_config',
        'quantity',
    ];

    protected $casts = [
        'config_options' => 'array',
        'checkout_config' => 'array',
    ];

    // Set default loads

    public function cart()
    {
        return $this->belongsTo(Cart::class);
    }

    public function plan()
    {
        return $this->belongsTo(Plan::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function price(): Attribute
    {
        return Attribute::make(
            get: function () {
                $currencyCode = (string) ($this->cart?->currency_code ?? session('currency', config('settings.default_currency')));
                $total = 0;
                $setup_fee = 0;
                $planPrice = $this->plan->price($currencyCode);
                $total += $planPrice->price;
                $setup_fee += $planPrice->setup_fee;

                $this->product->configOptions->each(function ($option) use (&$total, &$setup_fee, $currencyCode) {
                    $selected = (object) collect($this->config_options)->firstWhere('option_id', $option->id);

                    // If checkbox and selected, add price of first child (only one)
                    if ($option->type === 'checkbox' && $selected?->value) {
                        $childPrice = $option->children->first()?->price(
                            billing_period: $this->plan->billing_period,
                            billing_unit: $this->plan->billing_unit,
                            currency: $currencyCode
                        );
                        $total += $childPrice?->price ?? 0;
                        $setup_fee += $childPrice?->setup_fee ?? 0;

                        return;
                    }

                    // Skip text, number and checkbox types as they have no price
                    if (in_array($option->type, ['text', 'number', 'checkbox'])) {
                        $total += 0;
                        $setup_fee += 0;

                        return;
                    }
                    if (!$selected || !isset($selected->value)) {
                        return;
                    }

                    $selectedPrice = $option->children->where('id', $selected?->value)->first()?->price(
                        billing_period: $this->plan->billing_period,
                        billing_unit: $this->plan->billing_unit,
                        currency: $currencyCode
                    );
                    $total += $selectedPrice?->price ?? 0;
                    $setup_fee += $selectedPrice?->setup_fee ?? 0;
                });

                $price = new Price([
                    'price' => $total,
                    'currency' => $planPrice->currency,
                    'setup_fee' => $setup_fee,
                ], apply_exclusive_tax: true);

                if (!$this->cart->coupon_id || !$this->cart->coupon) {
                    return $price;
                }

                if ($this->cart->coupon->products->isNotEmpty() && !$this->cart->coupon->products->contains($this->product_id)) {
                    return $price;
                }

                $coupon = $this->cart->coupon;
                $pdiscount = $coupon->calculateDiscount($price->price);
                $sdiscount = $coupon->calculateDiscount($price->setup_fee, 'setup_fee');

                $price->price -= $pdiscount;
                $price->setup_fee -= $sdiscount;

                $price->setDiscount($pdiscount + $sdiscount);

                return $price;
            }
        );
    }
}
