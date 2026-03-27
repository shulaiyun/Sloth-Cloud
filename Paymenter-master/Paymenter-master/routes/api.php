<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Catalog\CatalogController;
use App\Http\Controllers\Api\Admin\CategoryController;
use App\Http\Controllers\Api\Admin\CreditController;
use App\Http\Controllers\Api\Admin\InvoiceController;
use App\Http\Controllers\Api\Admin\InvoiceItemController;
use App\Http\Controllers\Api\Admin\OrderController;
use App\Http\Controllers\Api\Admin\ProductController;
use App\Http\Controllers\Api\Admin\ServiceController;
use App\Http\Controllers\Api\Admin\TicketController;
use App\Http\Controllers\Api\Admin\TicketMessageController;
use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\ProfileController;
use Illuminate\Support\Facades\Route;

Route::post('/oauth/token', [
    'uses' => 'Laravel\Passport\Http\Controllers\AccessTokenController@issueToken',
    'as' => 'token',
    'middleware' => 'throttle',
]);

Route::get('/me', [ProfileController::class, 'me'])->middleware(['auth:api', 'scope:profile']);

Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');

        Route::middleware('auth:api')->group(function () {
            Route::get('/me', [AuthController::class, 'me']);
            Route::post('/logout', [AuthController::class, 'logout']);
        });
    });

    Route::prefix('catalog')->group(function () {
        Route::get('/categories', [CatalogController::class, 'categories']);
        Route::get('/products', [CatalogController::class, 'products']);
        Route::get('/products/{product:slug}', [CatalogController::class, 'product']);
    });
});

Route::group(['middleware' => ['api.admin'], 'prefix' => 'v1/admin', 'as' => 'api.v1.admin.'], function () {
    Route::apiResources([
        'categories' => CategoryController::class,
        'credits' => CreditController::class,
        'users' => UserController::class,
        'products' => ProductController::class,
        'services' => ServiceController::class,
        'orders' => OrderController::class,
        'invoices' => InvoiceController::class,
        'invoice-items' => InvoiceItemController::class,
        'tickets' => TicketController::class,
        'ticket-messages' => TicketMessageController::class,
    ]);
});
