<?php

namespace Paymenter\Extensions\Others\Affiliates\Support;

use Illuminate\Support\Facades\Cookie;

class ReferralCodeResolver
{
    public static function fromRequest(): ?string
    {
        $input = trim((string) request()->input('referral_code', ''));
        if ($input !== '') {
            return $input;
        }

        $cookie = trim((string) Cookie::get('referred_by', ''));

        return $cookie !== '' ? $cookie : null;
    }
}
