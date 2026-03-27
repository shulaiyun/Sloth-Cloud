<?php

namespace App\Http\Controllers\Api\V1\Invoices;

use App\Helpers\ExtensionHelper;
use App\Http\Controllers\Api\V1\Concerns\SerializesHeadlessResources;
use App\Http\Controllers\Controller;
use App\Models\Gateway;
use App\Models\Invoice;
use App\Models\Service;
use Illuminate\Contracts\Support\Renderable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    use SerializesHeadlessResources;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $invoices = $request->user()
            ->invoices()
            ->with(['currency', 'items', 'transactions.gateway'])
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 20);

        return response()->json([
            'data' => $invoices->getCollection()->map(fn (Invoice $invoice) => $this->serializeInvoice($invoice))->values(),
            'meta' => [
                'current_page' => $invoices->currentPage(),
                'per_page' => $invoices->perPage(),
                'total' => $invoices->total(),
                'last_page' => $invoices->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        abort_unless((int) $invoice->user_id === (int) $request->user()->id, 404);

        $invoice->load(['currency', 'items', 'transactions.gateway']);

        $gateways = collect(ExtensionHelper::getCheckoutGateways(
            $invoice->remaining,
            $invoice->currency_code,
            'invoice',
            $invoice->items,
        ))->map(fn (Gateway $gateway) => $this->serializeGateway($gateway))->values();

        $billingAgreements = $request->user()
            ->billingAgreements()
            ->with('gateway')
            ->latest()
            ->get()
            ->map(fn ($agreement) => $this->serializeBillingAgreement($agreement))
            ->values();

        $recurringServices = $invoice->items()
            ->where('reference_type', Service::class)
            ->whereNotNull('reference_id')
            ->whereHasMorph('reference', [Service::class], function ($query) {
                $query->whereHas('plan', fn ($planQuery) => $planQuery->whereNotIn('type', ['one-time', 'free']));
            })
            ->with('reference')
            ->get()
            ->pluck('reference')
            ->filter()
            ->values()
            ->map(fn (Service $service) => $this->serializeService($service))
            ->values();

        $credit = $request->user()
            ->credits()
            ->where('currency_code', $invoice->currency_code)
            ->with('currency')
            ->first();

        return response()->json([
            'data' => [
                'invoice' => $this->serializeInvoice($invoice, true),
                'gateways' => $gateways,
                'payment_methods' => $billingAgreements,
                'recurring_services' => $recurringServices,
                'credits' => $this->serializeCredit($credit),
            ],
        ]);
    }

    public function pay(Request $request, Invoice $invoice): JsonResponse
    {
        abort_unless((int) $invoice->user_id === (int) $request->user()->id, 404);

        $validated = $request->validate([
            'method' => ['required', 'in:credit,gateway,saved'],
            'gateway_id' => ['nullable', 'integer'],
            'billing_agreement_ulid' => ['nullable', 'string', 'max:255'],
            'set_as_default' => ['sometimes', 'boolean'],
        ]);

        if ($invoice->status !== Invoice::STATUS_PENDING) {
            return response()->json([
                'message' => 'This invoice cannot be paid.',
            ], 422);
        }

        $invoice->load(['currency', 'items', 'transactions.gateway']);
        $payload = [
            'redirect_url' => null,
            'payment_html' => null,
            'invoice' => null,
        ];

        if ($validated['method'] === 'credit') {
            $credit = $request->user()->credits()->where('currency_code', $invoice->currency_code)->lockForUpdate()->first();

            if (!$credit || $credit->amount <= 0) {
                return response()->json([
                    'message' => 'No usable balance is available for this invoice.',
                ], 422);
            }

            if ($credit->amount >= $invoice->remaining) {
                $credit->amount -= $invoice->remaining;
                $credit->save();
                ExtensionHelper::addPayment($invoice->id, null, amount: $invoice->remaining, isCreditTransaction: true);
            } else {
                ExtensionHelper::addPayment($invoice->id, null, amount: $credit->amount, isCreditTransaction: true);
                $credit->amount = 0;
                $credit->save();
            }
        }

        if ($validated['method'] === 'gateway') {
            $gateway = collect(ExtensionHelper::getCheckoutGateways(
                $invoice->remaining,
                $invoice->currency_code,
                'invoice',
                $invoice->items,
            ))->first(fn (Gateway $entry) => (int) $entry->id === (int) ($validated['gateway_id'] ?? 0));

            if (!$gateway) {
                return response()->json([
                    'message' => 'Invalid payment gateway.',
                ], 422);
            }

            $result = ExtensionHelper::pay($gateway, $invoice);

            if (is_string($result)) {
                $payload['redirect_url'] = $result;
            } elseif ($result instanceof Renderable) {
                $payload['payment_html'] = $result->render();
            } elseif (is_object($result) && method_exists($result, 'render')) {
                $payload['payment_html'] = $result->render();
            }
        }

        if ($validated['method'] === 'saved') {
            $agreement = $request->user()->billingAgreements()->where('ulid', $validated['billing_agreement_ulid'] ?? '')->with('gateway')->first();

            if (!$agreement) {
                return response()->json([
                    'message' => 'Invalid saved payment method.',
                ], 422);
            }

            if (($validated['set_as_default'] ?? false) === true) {
                $invoiceItems = $invoice->items()
                    ->where('reference_type', Service::class)
                    ->whereNotNull('reference_id')
                    ->get();

                foreach ($invoiceItems as $invoiceItem) {
                    /** @var Service|null $service */
                    $service = $invoiceItem->reference;
                    if ($service) {
                        $service->update(['billing_agreement_id' => $agreement->id]);
                    }
                }
            }

            $success = ExtensionHelper::charge($agreement->gateway, $invoice, $agreement);

            if ($success !== true) {
                return response()->json([
                    'message' => 'Could not process payment. Please try a different method.',
                ], 422);
            }
        }

        $invoice->refresh();
        $invoice->load(['currency', 'items', 'transactions.gateway']);
        $payload['invoice'] = $this->serializeInvoice($invoice, true);

        return response()->json([
            'message' => match ($validated['method']) {
                'credit' => $invoice->status === Invoice::STATUS_PAID
                    ? 'Invoice paid with balance.'
                    : 'Part of the invoice has been paid with balance.',
                'gateway' => 'Payment initialized.',
                'saved' => 'Saved payment method charged.',
            },
            'data' => $payload,
        ]);
    }
}
