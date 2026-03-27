<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Events\Auth\Login as LoginEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\LoginRequest;
use App\Http\Requests\Api\V1\Auth\RegisterRequest;
use App\Models\CustomProperty;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use RobThree\Auth\Providers\Qr\EndroidQrCodeProvider;
use RobThree\Auth\TwoFactorAuth;

class AuthController extends Controller
{
    /**
     * Authenticate a user and return a Passport personal access token.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();
        $email = strtolower($credentials['email']);

        if (RateLimiter::tooManyAttempts('api-login:' . $email, 5)) {
            throw ValidationException::withMessages([
                'email' => ['Too many login attempts. Please try again in 60 seconds.'],
            ]);
        }

        RateLimiter::increment('api-login:' . $email, 60);

        $user = User::where('email', $email)->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if ($user->tfa_secret) {
            $code = $credentials['code'] ?? null;

            if (!$code) {
                return response()->json([
                    'message' => 'Two-factor authentication code required.',
                    'code' => 'tfa_required',
                ], 409);
            }

            $this->verifyTwoFactorCode($user, $code);
        }

        RateLimiter::clear('api-login:' . $email);

        return response()->json([
            'message' => 'Login successful.',
            'data' => $this->issueTokenResponse($user, $credentials['device_name'] ?? null),
        ]);
    }

    /**
     * Register a new user and return a Passport personal access token.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $user = User::create([
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => strtolower($validated['email']),
            'password' => $validated['password'],
        ]);

        $properties = $validated['properties'] ?? [];
        if ($properties !== []) {
            $this->persistProperties($user, $properties);
        }

        return response()->json([
            'message' => 'Registration successful.',
            'data' => $this->issueTokenResponse($user, $validated['device_name'] ?? null),
        ], 201);
    }

    /**
     * Return the authenticated user for API clients.
     */
    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'user' => $this->serializeUser($user->load('properties')),
            ],
        ]);
    }

    /**
     * Revoke the active access token.
     */
    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->token();
        if ($token) {
            $token->revoke();
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    /**
     * Verify a two-factor code for the given user.
     */
    protected function verifyTwoFactorCode(User $user, string $code): void
    {
        $tfa = new TwoFactorAuth(new EndroidQrCodeProvider, config('app.name'));

        if (!$tfa->verifyCode($user->tfa_secret, $code)) {
            throw ValidationException::withMessages([
                'code' => ['Invalid two-factor authentication code.'],
            ]);
        }

        if (Cache::has('api-tfa-used-code-' . $user->id . '-' . $code)) {
            throw ValidationException::withMessages([
                'code' => ['Invalid two-factor authentication code.'],
            ]);
        }

        Cache::put('api-tfa-used-code-' . $user->id . '-' . $code, true, 60);
    }

    /**
     * Issue a personal access token response for the given user.
     *
     * @return array<string, mixed>
     */
    protected function issueTokenResponse(User $user, ?string $deviceName = null): array
    {
        $tokenName = $deviceName ?: request()->userAgent() ?: 'Sloth Cloud API';
        $personalAccessToken = $user->createToken(substr($tokenName, 0, 255));

        event(new LoginEvent($user));

        return [
            'access_token' => $personalAccessToken->accessToken,
            'token_type' => 'Bearer',
            'user' => $this->serializeUser($user->load('properties')),
        ];
    }

    /**
     * Persist custom properties for a user.
     *
     * @param  array<string, mixed>  $properties
     */
    protected function persistProperties(User $user, array $properties): void
    {
        $customProperties = CustomProperty::where('model', User::class)->get()->keyBy('key');

        $payload = collect($properties)
            ->filter(fn ($value, $key) => $customProperties->has($key))
            ->map(function ($value, $key) use ($customProperties, $user) {
                $customProperty = $customProperties->get($key);

                return [
                    'key' => $key,
                    'value' => $value,
                    'model_id' => $user->id,
                    'model_type' => $user->getMorphClass(),
                    'name' => $customProperty->name,
                    'custom_property_id' => $customProperty->id,
                ];
            })
            ->values()
            ->all();

        if ($payload === []) {
            return;
        }

        $user->properties()->upsert(
            $payload,
            ['key', 'model_id', 'model_type'],
            ['name', 'value', 'custom_property_id']
        );
    }

    /**
     * Serialize a user for headless API clients.
     *
     * @return array<string, mixed>
     */
    protected function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'name' => trim($user->first_name . ' ' . $user->last_name),
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at,
            'avatar' => $user->avatar,
            'properties' => $user->properties
                ->map(fn ($property) => [
                    'key' => $property->key,
                    'name' => $property->name,
                    'value' => $property->value,
                ])
                ->values(),
        ];
    }
}

