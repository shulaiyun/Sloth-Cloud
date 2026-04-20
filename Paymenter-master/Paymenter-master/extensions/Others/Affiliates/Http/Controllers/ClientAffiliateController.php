<?php

namespace Paymenter\Extensions\Others\Affiliates\Http\Controllers;

use App\Helpers\ExtensionHelper;
use App\Http\Controllers\Controller;
use App\Models\Credit;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Paymenter\Extensions\Others\Affiliates\Models\Affiliate;
use Paymenter\Extensions\Others\Affiliates\Models\AffiliateOrder;

class ClientAffiliateController extends Controller
{
    public function track(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'alpha_num:ascii', 'min:5', 'max:25'],
        ]);

        /** @var ?Affiliate $affiliate */
        $affiliate = Affiliate::query()
            ->where('code', trim((string) $validated['code']))
            ->where('enabled', true)
            ->first();

        if (!$affiliate) {
            return response()->json([
                'data' => [
                    'valid' => false,
                    'affiliate' => null,
                ],
            ]);
        }

        $affiliate->increment('visitors');
        $affiliate->refresh();

        return response()->json([
            'data' => [
                'valid' => true,
                'affiliate' => [
                    'id' => $affiliate->id,
                    'code' => $affiliate->code,
                    'reward' => $affiliate->reward,
                ],
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->loadMissing(['affiliate.orders.order.services.invoices.currency', 'affiliate.orders.order.services.product', 'credits.currency']);

        return response()->json([
            'data' => [
                'program' => $this->programSettings(),
                'affiliate' => $user->affiliate ? $this->serializeAffiliate($user->affiliate, $user) : null,
            ],
        ]);
    }

    public function enroll(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->loadMissing('affiliate');

        if ($user->affiliate) {
            $user->loadMissing(['affiliate.orders.order.services.invoices.currency', 'affiliate.orders.order.services.product', 'credits.currency']);

            return response()->json([
                'message' => 'Affiliate already enabled.',
                'data' => [
                    'program' => $this->programSettings(),
                    'affiliate' => $this->serializeAffiliate($user->affiliate, $user),
                ],
            ]);
        }

        $signupType = (string) (ExtensionHelper::getExtension('other', 'Affiliates')->config('type') ?: 'random');
        $validated = $request->validate([
            'code' => [
                Rule::requiredIf($signupType === 'custom'),
                'nullable',
                'string',
                'alpha_num:ascii',
                'min:5',
                'max:25',
                'unique:ext_affiliates,code',
            ],
        ]);

        $affiliate = $user->affiliate()->create([
            'code' => $signupType === 'custom'
                ? trim((string) ($validated['code'] ?? ''))
                : $this->generateAffiliateCode(),
            'visitors' => 0,
            'reward' => null,
            'discount' => null,
        ])->refresh();

        $user->loadMissing(['credits.currency']);

        return response()->json([
            'message' => 'Affiliate enrollment successful.',
            'data' => [
                'program' => $this->programSettings(),
                'affiliate' => $this->serializeAffiliate($affiliate, $user),
            ],
        ], 201);
    }

    public function orders(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->loadMissing('affiliate');

        if (!$user->affiliate) {
            return response()->json([
                'data' => [
                    'items' => [],
                ],
            ]);
        }

        $orders = $user->affiliate->orders()
            ->with(['order.services.invoices.currency', 'order.services.product'])
            ->orderByDesc('id')
            ->limit((int) ($validated['limit'] ?? 20))
            ->get();

        return response()->json([
            'data' => [
                'items' => $orders->map(fn (AffiliateOrder $affiliateOrder) => $this->serializeAffiliateOrder($affiliateOrder))->values(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeAffiliate(Affiliate $affiliate, User $user): array
    {
        $affiliate->loadMissing(['orders.order.services.invoices.currency', 'orders.order.services.product']);
        $user->loadMissing('credits.currency');

        $validOrdersCount = $affiliate->orders()
            ->whereHas('order.services.invoices', function ($query) {
                $query->where('status', Invoice::STATUS_PAID);
            })
            ->count();

        return [
            'id' => $affiliate->id,
            'code' => $affiliate->code,
            'enabled' => (bool) $affiliate->enabled,
            'visitors' => (int) $affiliate->visitors,
            'signups' => (int) $affiliate->signups,
            'valid_orders' => (int) $validOrdersCount,
            'reward' => $affiliate->reward !== null
                ? (float) $affiliate->reward
                : (float) $this->programSettings()['default_reward'],
            'custom_reward' => $affiliate->reward !== null ? (float) $affiliate->reward : null,
            'discount' => $affiliate->discount !== null ? (float) $affiliate->discount : null,
            'earnings' => $this->normalizeMoneyMap((array) $affiliate->earnings),
            'credits' => $user->credits
                ->map(fn (Credit $credit) => [
                    'currency_code' => $credit->currency_code,
                    'currency_name' => $credit->currency?->name,
                    'amount' => round((float) $credit->amount, 2),
                ])
                ->values(),
            'created_at' => $affiliate->created_at?->toIso8601String(),
            'updated_at' => $affiliate->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeAffiliateOrder(AffiliateOrder $affiliateOrder): array
    {
        $affiliateOrder->loadMissing(['order.services.invoices.currency', 'order.services.product']);

        $order = $affiliateOrder->order;
        $firstService = $order?->services->first();
        $paidInvoices = $order
            ? $order->services
                ->flatMap(fn ($service) => $service->invoices)
                ->unique('id')
                ->filter(fn ($invoice) => $invoice->status === Invoice::STATUS_PAID)
                ->values()
            : collect();
        $lastPaidInvoice = $paidInvoices
            ->sortByDesc(fn ($invoice) => $invoice->updated_at?->timestamp ?? 0)
            ->first();

        return [
            'id' => $affiliateOrder->id,
            'order_id' => $order?->id,
            'service_id' => $firstService?->id,
            'service_label' => $firstService?->label,
            'product_name' => $firstService?->product?->name,
            'earnings' => $this->normalizeMoneyMap((array) $affiliateOrder->earnings),
            'paid_invoices_count' => $paidInvoices->count(),
            'last_paid_at' => $lastPaidInvoice?->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function programSettings(): array
    {
        $extension = ExtensionHelper::getExtension('other', 'Affiliates');

        return [
            'default_reward' => (float) ($extension->config('default_reward') ?: 0),
            'code_type' => (string) ($extension->config('type') ?: 'random'),
        ];
    }

    protected function generateAffiliateCode(): string
    {
        do {
            $code = Str::upper(Str::random(10));
        } while (Affiliate::where('code', $code)->exists());

        return $code;
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, float>
     */
    protected function normalizeMoneyMap(array $values): array
    {
        return collect($values)
            ->mapWithKeys(fn ($amount, $currency) => [$currency => round((float) $amount, 2)])
            ->all();
    }
}
