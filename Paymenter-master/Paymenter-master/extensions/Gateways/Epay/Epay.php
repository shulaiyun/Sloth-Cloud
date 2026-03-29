<?php

namespace Paymenter\Extensions\Gateways\Epay;

use App\Attributes\ExtensionMeta;
use App\Classes\Extension\Gateway;
use App\Helpers\ExtensionHelper;
use App\Models\Invoice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Paymenter\Extensions\Gateways\Epay\Support\Signer;

#[ExtensionMeta(
    name: '在线支付',
    description: 'Unified online payment gateway for Epay/V免签 callbacks.',
    version: '1.0.0',
    author: 'Sloth Cloud',
    url: 'https://app.jxjvip.help',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIHJ4PSIxMjgiIGZpbGw9InVybCgjZykiLz48cGF0aCBkPSJNMTE2IDI1NkMxMTYgMTc4LjY0NCAxNzguNjQ0IDExNiAyNTYgMTE2QzMzMy4zNTYgMTE2IDM5NiAxNzguNjQ0IDM5NiAyNTZDMzk2IDMzMy4zNTYgMzMzLjM1NiAzOTYgMjU2IDM5NkMxNzguNjQ0IDM5NiAxMTYgMzMzLjM1NiAxMTYgMjU2WiIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjM2Ii8+PHBhdGggZD0iTTIxMiAyMDhIMzAwVjI0NEgyNDhWMjY4SDI4OFYzMDRIMjEyVjIwOFoiIGZpbGw9IiNGRkYiLz48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSI2NCIgeTE9IjQ4IiB4Mj0iNDU2IiB5Mj0iNDY0IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agc3RvcC1jb2xvcj0iIzQxRThENDYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM0QjY5RkYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48L3N2Zz4='
)]
class Epay extends Gateway
{
    public function boot(): void
    {
        require __DIR__ . '/routes.php';
    }

    public function getConfig($values = []): array
    {
        return [
            [
                'name' => 'api_url',
                'label' => 'API URL',
                'type' => 'text',
                'description' => 'Epay base URL, for example https://pay.example.com',
                'placeholder' => 'https://pay.example.com',
                'required' => true,
                'validation' => ['required', 'url:http,https'],
            ],
            [
                'name' => 'app_id',
                'label' => 'App ID',
                'type' => 'text',
                'description' => 'Merchant ID used as pid',
                'required' => true,
                'validation' => ['required', 'string', 'max:100'],
            ],
            [
                'name' => 'app_key',
                'label' => 'App Key',
                'type' => 'password',
                'description' => 'Merchant key used for MD5 signing',
                'required' => true,
                'encrypted' => true,
                'validation' => ['required', 'string', 'max:255'],
            ],
            [
                'name' => 'payment_type',
                'label' => 'Upstream Channel Type',
                'type' => 'select',
                'description' => 'Default channel passed upstream. For aggregated checkout, channel selection is handled by V免签/Epay side.',
                'required' => true,
                'default' => 'alipay',
                'options' => [
                    'alipay' => 'Alipay',
                    'wxpay' => 'WeChat Pay',
                    'qqpay' => 'QQ Pay',
                    'bank' => 'Bank',
                ],
            ],
            [
                'name' => 'frontend_return_url',
                'label' => 'Frontend Return URL',
                'type' => 'text',
                'description' => 'Headless frontend URL after payment, supports {invoice} and {number}',
                'placeholder' => 'https://app.jxjvip.help/invoices/{invoice}',
                'required' => false,
                'validation' => ['nullable', 'string', 'max:255', 'regex:/^https?:\\/\\/[^\\s]+$/i'],
            ],
            [
                'name' => 'allowed_currencies',
                'label' => 'Allowed Currencies',
                'type' => 'tags',
                'description' => 'Defaults to CNY only',
                'default' => ['CNY'],
                'database_type' => 'array',
                'required' => false,
            ],
        ];
    }

    public function canUseGateway($total, $currency, $type, $items = []): bool
    {
        $allowedCurrencies = $this->allowedCurrencies();

        if ($allowedCurrencies === []) {
            $allowedCurrencies = ['CNY'];
        }

        return in_array(strtoupper((string) $currency), $allowedCurrencies, true);
    }

    public function pay(Invoice $invoice, $total): string
    {
        $currency = strtoupper((string) $invoice->currency_code);

        if (!$this->canUseGateway($total, $currency, 'invoice', $invoice->items->all())) {
            throw new \RuntimeException(
                'Epay is only available for currencies: ' . implode(', ', $this->allowedCurrencies())
            );
        }

        $params = [
            'pid' => (string) $this->config('app_id'),
            'type' => (string) ($this->config('payment_type') ?: 'alipay'),
            'notify_url' => route('extensions.gateways.epay.notify'),
            'return_url' => route('extensions.gateways.epay.return', ['invoice' => $invoice->id]),
            'out_trade_no' => (string) $invoice->id,
            'name' => 'Invoice #' . ($invoice->number ?: $invoice->id),
            'money' => number_format((float) $total, 2, '.', ''),
            'param' => (string) ($invoice->number ?: $invoice->id),
            'sign_type' => 'MD5',
        ];

        $params['sign'] = Signer::build($params, (string) $this->config('app_key'));

        return rtrim((string) $this->config('api_url'), '/') . '/submit.php?' . http_build_query($params);
    }

    public function notify(Request $request)
    {
        $rawPayload = $request->all();

        Log::info('Epay notify received', [
            'ip' => $request->ip(),
            'method' => $request->method(),
            'path' => $request->path(),
            'query' => $request->query(),
            'payload' => Arr::except($rawPayload, ['sign', 'app_key', 'key']),
        ]);

        if (!$this->hasValidSignature($rawPayload)) {
            Log::warning('Epay notify rejected: invalid signature', [
                'payload' => Arr::except($rawPayload, ['sign']),
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $payload = $this->normalizeNotifyPayload($rawPayload);

        if ($payload['merchant_id'] !== (string) $this->config('app_id')) {
            Log::warning('Epay notify rejected: merchant mismatch', [
                'expected' => (string) $this->config('app_id'),
                'received' => $payload['merchant_id'],
                'invoice_id' => $payload['invoice_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $invoice = Invoice::query()->find($payload['invoice_id']);
        if (!$invoice) {
            Log::warning('Epay notify rejected: invoice not found', [
                'invoice_id' => $payload['invoice_id'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 404)->header('Content-Type', 'text/plain');
        }

        if (!$this->isSuccessfulTradeStatus($payload['trade_status'])) {
            Log::info('Epay notify ignored: payment is not in success state', [
                'invoice_id' => $invoice->id,
                'trade_status' => $payload['trade_status'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $invoiceRemaining = (float) number_format((float) $invoice->remaining, 2, '.', '');
        if ($payload['paid_amount'] < $invoiceRemaining) {
            Log::warning('Epay notify rejected: amount mismatch', [
                'invoice_id' => $invoice->id,
                'invoice_remaining' => $invoiceRemaining,
                'paid_amount' => $payload['paid_amount'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $transactionId = $payload['transaction_id'] !== ''
            ? $payload['transaction_id']
            : ('epay-invoice-' . $invoice->id);

        ExtensionHelper::addPayment(
            $invoice->id,
            'Epay',
            number_format($payload['paid_amount'], 2, '.', ''),
            null,
            $transactionId
        );

        Log::info('Epay notify accepted: payment recorded', [
            'invoice_id' => $invoice->id,
            'transaction_id' => $transactionId,
            'paid_amount' => $payload['paid_amount'],
            'trade_status' => $payload['trade_status'],
        ]);

        return response('success')->header('Content-Type', 'text/plain');
    }

    public function return(Request $request, Invoice $invoice): RedirectResponse
    {
        $payload = $request->all();
        $hasValidSignature = $this->hasValidSignature($payload);
        $tradeStatus = strtoupper((string) ($payload['trade_status'] ?? ''));
        $invoice->refresh();
        $invoicePaid = strtolower((string) $invoice->status) === 'paid';
        $paymentState = (($hasValidSignature && in_array($tradeStatus, ['TRADE_SUCCESS', 'TRADE_FINISHED'], true)) || $invoicePaid)
            ? 'success'
            : 'pending';

        $target = $this->resolveFrontendReturnUrl($invoice, [
            'payment' => $paymentState,
            'trade_no' => (string) ($payload['trade_no'] ?? ''),
            'out_trade_no' => (string) ($payload['out_trade_no'] ?? $invoice->id),
        ]);

        Log::info('Epay return redirect', [
            'invoice_id' => $invoice->id,
            'invoice_status' => $invoice->status,
            'has_valid_signature' => $hasValidSignature,
            'trade_status' => $tradeStatus,
            'target' => $target,
            'query' => Arr::except($payload, ['sign']),
        ]);

        return redirect()->away($target);
    }

    private function resolveFrontendReturnUrl(Invoice $invoice, array $query = []): string
    {
        $configured = trim((string) $this->config('frontend_return_url'));
        $fallback = route('invoices.show', $invoice);

        $baseUrl = $configured !== '' ? $configured : $fallback;
        $baseUrl = str_replace(
            ['{invoice}', '{number}'],
            [(string) $invoice->id, (string) ($invoice->number ?: $invoice->id)],
            $baseUrl
        );

        $query = array_filter($query, fn ($value) => $value !== null && $value !== '');
        if ($query === []) {
            return $baseUrl;
        }

        $separator = str_contains($baseUrl, '?') ? '&' : '?';

        return $baseUrl . $separator . http_build_query($query);
    }

    private function allowedCurrencies(): array
    {
        $raw = $this->config('allowed_currencies');

        if (is_array($raw)) {
            return $this->normalizeCurrencies($raw);
        }

        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $this->normalizeCurrencies($decoded);
            }

            return $this->normalizeCurrencies(array_map('trim', explode(',', $raw)));
        }

        return ['CNY'];
    }

    private function normalizeCurrencies(array $currencies): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn ($currency) => strtoupper(trim((string) $currency)),
            $currencies
        ))));
    }

    private function hasValidSignature(array $payload): bool
    {
        $incomingSignature = (string) ($payload['sign'] ?? '');

        if ($incomingSignature === '') {
            return false;
        }

        return Signer::verify($payload, (string) $this->config('app_key'), $incomingSignature);
    }

    private function normalizeNotifyPayload(array $payload): array
    {
        $merchantId = $this->firstNonEmpty(
            $payload,
            ['pid', 'partner', 'merchant_id', 'app_id']
        );

        $invoiceId = (int) $this->firstNonEmpty(
            $payload,
            ['out_trade_no', 'order_id', 'invoice_id', 'invoice']
        );

        $tradeStatus = strtoupper($this->firstNonEmpty(
            $payload,
            ['trade_status', 'status']
        ));

        $paidAmount = (float) number_format((float) $this->firstNonEmpty(
            $payload,
            ['money', 'total_fee', 'realprice', 'amount'],
            '0'
        ), 2, '.', '');

        $transactionId = $this->firstNonEmpty(
            $payload,
            ['trade_no', 'transaction_id', 'pay_no', 'payid']
        );

        return [
            'merchant_id' => $merchantId,
            'invoice_id' => $invoiceId,
            'trade_status' => $tradeStatus,
            'paid_amount' => $paidAmount,
            'transaction_id' => $transactionId,
        ];
    }

    /**
     * @param array<int, string> $keys
     */
    private function firstNonEmpty(array $payload, array $keys, string $fallback = ''): string
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }

            $value = trim((string) $payload[$key]);
            if ($value !== '') {
                return $value;
            }
        }

        return $fallback;
    }

    private function isSuccessfulTradeStatus(string $tradeStatus): bool
    {
        return in_array($tradeStatus, [
            'TRADE_SUCCESS',
            'TRADE_FINISHED',
            'SUCCESS',
            'PAID',
            '1',
        ], true);
    }
}
