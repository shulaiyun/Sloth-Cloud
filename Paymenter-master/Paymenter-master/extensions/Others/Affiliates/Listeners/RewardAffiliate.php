<?php

namespace Paymenter\Extensions\Others\Affiliates\Listeners;

use App\Helpers\ExtensionHelper;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Service;
use Illuminate\Support\Collection;
use Paymenter\Extensions\Others\Affiliates\Models\Affiliate;
use Paymenter\Extensions\Others\Affiliates\Models\AffiliateOrder;

class RewardAffiliate
{
    /**
     * Create the event listener.
     */
    public function __construct()
    {
        //
    }

    /**
     * Handle the event.
     */
    public function handle(object $event): void
    {
        /**
         * @var Invoice $invoice
         */
        $invoice = $event->invoice;

        $serviceItem = $invoice->items()
            ->where('reference_type', Service::class)
            ->first();

        if (!$serviceItem || $serviceItem->reference_type !== Service::class) {
            return;
        }

        /** @var ?Service $service */
        $service = $serviceItem->reference;
        $order = $service?->order;
        if (!$order) {
            return;
        }

        if ($invoice->properties()->where('key', 'affiliate_reward_paid_at')->exists()) {
            return;
        }

        $referral = AffiliateOrder::where('order_id', $order->id)->first();
        if (!$referral) {
            $referral = $this->claimReferralFromInvoice($invoice, $order);
        }

        if (!$referral) {
            return;
        }

        /**
         * @var Affiliate $affiliate
         */
        $affiliate = $referral->affiliate;
        $extension = ExtensionHelper::getExtension('other', 'Affiliates');
        $reward_percentage = $affiliate->reward ?: $extension->config('default_reward');
        $reward_amount = round($invoice->total * $reward_percentage / 100, 2);

        /**
         * @var Collection
         */
        $user_credits = $affiliate->user->credits;
        $affiliate_credits = $user_credits->filter(function ($credit) use ($invoice) {
            return $credit->currency_code === $invoice->currency_code;
        })->first();

        if ($affiliate_credits) {
            // Add reward to credits
            $affiliate->user->credits()->where('currency_code', $invoice->currency_code)->update([
                'amount' => $affiliate_credits->amount + $reward_amount,
            ]);
        } else {
            // Create new credits with the invoice's currency code
            $affiliate->user->credits()->create([
                'amount' => $reward_amount,
                'currency_code' => $invoice->currency_code,
            ]);
        }

        $invoice->properties()->updateOrCreate(
            ['key' => 'affiliate_reward_paid_at'],
            ['value' => now()->toIso8601String()],
        );
    }

    protected function claimReferralFromInvoice(Invoice $invoice, Order $order): ?AffiliateOrder
    {
        $referralCode = trim((string) $invoice->properties()->where('key', 'affiliate_referral_code')->value('value'));
        if ($referralCode === '') {
            return null;
        }

        /** @var ?Affiliate $affiliate */
        $affiliate = Affiliate::where('code', $referralCode)
            ->where('enabled', true)
            ->first();

        if (!$affiliate || $affiliate->user_id === $invoice->user_id) {
            return null;
        }

        $hasPriorPaidServiceInvoice = Invoice::query()
            ->where('user_id', $invoice->user_id)
            ->where('status', Invoice::STATUS_PAID)
            ->whereKeyNot($invoice->id)
            ->whereHas('items', function ($query) {
                $query->where('reference_type', Service::class);
            })
            ->exists();

        if ($hasPriorPaidServiceInvoice) {
            return null;
        }

        return AffiliateOrder::firstOrCreate(
            ['order_id' => $order->id],
            ['affiliate_id' => $affiliate->id],
        );
    }
}
