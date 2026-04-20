<?php

namespace Paymenter\Extensions\Others\Affiliates\Listeners;

use App\Events\User\Created;
use Paymenter\Extensions\Others\Affiliates\Models\Affiliate;
use Paymenter\Extensions\Others\Affiliates\Support\ReferralCodeResolver;

class IncreamentAffiliateSignups
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
        $referral_code = ReferralCodeResolver::fromRequest();
        if (!$referral_code) {
            return;
        }

        /** @var Affiliate */
        $affiliate = Affiliate::where('code', $referral_code)
            ->where('enabled', true)
            ->first();
        if (!$affiliate || $affiliate->user_id === $event->user->id) {
            return;
        }

        $affiliate->increment('signups');
    }
}
