<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;

class SetLocale
{
    public function handle(Request $request, Closure $next)
    {
        $availableLocales = array_keys(config('app.available_locales', []));
        $locale = session('locale', config('settings.app_language', config('app.locale')));

        if (!is_string($locale) || !in_array($locale, $availableLocales, true)) {
            $locale = config('app.locale');
        }

        App::setLocale($locale);
        session(['locale' => $locale]);

        return $next($request);
    }
}
