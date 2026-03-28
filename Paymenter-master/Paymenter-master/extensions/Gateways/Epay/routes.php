<?php

use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Support\Facades\Route;
use Paymenter\Extensions\Gateways\Epay\Epay;

Route::post('/extensions/gateways/epay/notify', [Epay::class, 'notify'])
    ->withoutMiddleware([VerifyCsrfToken::class])
    ->name('extensions.gateways.epay.notify');

Route::get('/extensions/gateways/epay/return/{invoice}', [Epay::class, 'return'])
    ->middleware(['web'])
    ->name('extensions.gateways.epay.return');
