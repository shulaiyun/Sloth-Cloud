<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Cart\CartController;
use App\Http\Controllers\Api\V1\Catalog\CatalogController;
use App\Http\Controllers\Api\V1\Checkout\CheckoutController;
use App\Http\Controllers\Api\V1\Invoices\InvoiceController as HeadlessInvoiceController;
use App\Http\Controllers\Api\V1\Services\ServiceController as HeadlessServiceController;
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

    Route::middleware('auth:api')->group(function () {
        Route::get('/cart', [CartController::class, 'show']);
        Route::post('/cart/items', [CartController::class, 'storeItem']);
        Route::patch('/cart/items/{item}', [CartController::class, 'updateItem']);
        Route::delete('/cart/items/{item}', [CartController::class, 'destroyItem']);
        Route::post('/cart/coupon', [CartController::class, 'applyCoupon']);
        Route::delete('/cart/coupon', [CartController::class, 'removeCoupon']);

        Route::post('/checkout', [CheckoutController::class, 'store']);

        Route::get('/services', [HeadlessServiceController::class, 'index']);
        Route::get('/services/{service}', [HeadlessServiceController::class, 'show']);
        Route::patch('/services/{service}/label', [HeadlessServiceController::class, 'updateLabel']);
        Route::post('/services/{service}/cancel', [HeadlessServiceController::class, 'cancel']);
        Route::post('/services/{service}/actions/{action}', [HeadlessServiceController::class, 'action']);

        Route::get('/invoices', [HeadlessInvoiceController::class, 'index']);
        Route::get('/invoices/{invoice}', [HeadlessInvoiceController::class, 'show']);
        Route::post('/invoices/{invoice}/pay', [HeadlessInvoiceController::class, 'pay']);
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
