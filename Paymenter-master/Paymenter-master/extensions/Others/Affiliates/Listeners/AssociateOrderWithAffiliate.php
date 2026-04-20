<?php

namespace Paymenter\Extensions\Others\Affiliates\Listeners;

use App\Events\Order\Created;
use Paymenter\Extensions\Others\Affiliates\Models\Affiliate;
use Paymenter\Extensions\Others\Affiliates\Models\AffiliateOrder;
use Paymenter\Extensions\Others\Affiliates\Support\ReferralCodeResolver;

class AssociateOrderWithAffiliate
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
    public function handle(Created $event): void
    {
        if (request()->is('api/*')) {
            return;
        }

        $referral_code = ReferralCodeResolver::fromRequest();
        if (!$referral_code) {
            return;
        }

        /** @var Affiliate */
        $affiliate = Affiliate::where('code', $referral_code)
            ->where('enabled', true)
            ->first();
        if (!$affiliate || $affiliate->user->id === $event->order->user_id) {
            return;
        }

        AffiliateOrder::firstOrCreate(
            ['order_id' => $event->order->id],
            ['affiliate_id' => $affiliate->id],
        );
    }
}
