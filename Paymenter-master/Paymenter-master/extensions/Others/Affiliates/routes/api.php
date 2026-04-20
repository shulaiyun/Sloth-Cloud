<?php

use Illuminate\Support\Facades\Route;
use Paymenter\Extensions\Others\Affiliates\Http\Controllers\ClientAffiliateController;

Route::prefix('/api/v1/affiliate')->group(function () {
    Route::post('/track', [ClientAffiliateController::class, 'track']);

    Route::middleware('auth:api')->group(function () {
        Route::get('/me', [ClientAffiliateController::class, 'me']);
        Route::post('/enroll', [ClientAffiliateController::class, 'enroll']);
        Route::get('/orders', [ClientAffiliateController::class, 'orders']);
    });
});
