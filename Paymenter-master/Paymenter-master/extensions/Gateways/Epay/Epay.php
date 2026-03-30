<?php

namespace Paymenter\Extensions\Gateways\Epay;

use App\Attributes\ExtensionMeta;
use App\Classes\Extension\Gateway;
use App\Helpers\ExtensionHelper;
use App\Models\Invoice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
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
                'name' => 'callback_base_url',
                'label' => 'Callback Base URL',
                'type' => 'text',
                'description' => 'Optional override for notify host, for example https://bill.example.com',
                'placeholder' => 'https://bill.jxjvip.help',
                'required' => false,
                'validation' => ['nullable', 'url:http,https'],
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
                'validation' => ['nullable', 'string', 'max:255'],
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

        $notifyUrl = $this->resolveNotifyUrl();
        // For headless flow, send users back to frontend invoice page directly.
        $returnUrl = $this->resolveFrontendReturnUrl($invoice);

        $params = [
            'pid' => (string) $this->config('app_id'),
            'type' => (string) ($this->config('payment_type') ?: 'alipay'),
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'out_trade_no' => (string) $invoice->id,
            'name' => 'Invoice #' . ($invoice->number ?: $invoice->id),
            'money' => number_format((float) $total, 2, '.', ''),
            'param' => (string) ($invoice->number ?: $invoice->id),
            'sign_type' => 'MD5',
        ];

        $params['sign'] = Signer::build($params, (string) $this->config('app_key'));

        $redirect = rtrim((string) $this->config('api_url'), '/') . '/submit.php?' . http_build_query($params);

        $this->logInfo('Epay pay request built', [
            'invoice_id' => $invoice->id,
            'invoice_number' => $invoice->number,
            'currency' => $currency,
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'api_url' => (string) $this->config('api_url'),
            'redirect_url' => $redirect,
        ]);

        return $redirect;
    }

    public function notify(Request $request)
    {
        $rawPayload = $request->all();

        $this->logInfo('Epay notify received', [
            'ip' => $request->ip(),
            'method' => $request->method(),
            'path' => $request->path(),
            'query' => $request->query(),
            'payload' => Arr::except($rawPayload, ['sign', 'app_key', 'key']),
        ]);

        if (!$this->hasValidSignature($rawPayload)) {
            $this->logWarning('Epay notify rejected: invalid signature', [
                'payload' => Arr::except($rawPayload, ['sign']),
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $payload = $this->normalizeNotifyPayload($rawPayload);

        if ($payload['merchant_id'] !== '' && $payload['merchant_id'] !== (string) $this->config('app_id')) {
            $this->logWarning('Epay notify rejected: merchant mismatch', [
                'expected' => (string) $this->config('app_id'),
                'received' => $payload['merchant_id'],
                'invoice_id' => $payload['invoice_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $invoice = Invoice::query()->find($payload['invoice_id']);
        if (!$invoice) {
            $this->logWarning('Epay notify rejected: invoice not found', [
                'invoice_id' => $payload['invoice_id'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 404)->header('Content-Type', 'text/plain');
        }

        if (!$this->isSuccessfulNotify($rawPayload, $payload)) {
            $this->logInfo('Epay notify ignored: payment is not in success state', [
                'invoice_id' => $invoice->id,
                'trade_status' => $payload['trade_status'],
                'paid_amount' => $payload['paid_amount'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $invoiceRemaining = (float) number_format((float) $invoice->remaining, 2, '.', '');
        if ($payload['paid_amount'] < $invoiceRemaining) {
            $this->logWarning('Epay notify rejected: amount mismatch', [
                'invoice_id' => $invoice->id,
                'invoice_remaining' => $invoiceRemaining,
                'paid_amount' => $payload['paid_amount'],
                'transaction_id' => $payload['transaction_id'],
            ]);

            return response('fail', 400)->header('Content-Type', 'text/plain');
        }

        $this->recordPaymentIfApplicable($invoice, $payload, 'notify');

        return response('success')->header('Content-Type', 'text/plain');
    }

    public function return(Request $request, ?Invoice $invoice = null): RedirectResponse
    {
        $payload = $request->all();
        $invoice = $invoice ?? $this->resolveInvoiceFromPayload($payload);

        if (!$invoice) {
            $fallback = $this->resolveFallbackFrontendUrl($payload);

            $this->logWarning('Epay return fallback redirect: invoice not resolved', [
                'target' => $fallback,
                'query' => Arr::except($payload, ['sign']),
            ]);

            return redirect()->away($fallback);
        }

        $hasValidSignature = $this->hasValidSignature($payload);
        $normalized = $this->normalizeNotifyPayload($payload);
        $tradeStatus = $normalized['trade_status'];

        $recordedFromReturn = false;
        $recordedFromQuery = false;

        if (strtolower((string) $invoice->status) !== 'paid' && $hasValidSignature) {
            $recordedFromReturn = $this->recordPaymentIfApplicable($invoice, $normalized, 'return');
        }

        if (
            strtolower((string) $invoice->status) !== 'paid'
            && !$recordedFromReturn
            && $this->firstNonEmpty($payload, ['out_trade_no', 'trade_no', 'payId', 'pay_id'], '') !== ''
        ) {
            $recordedFromQuery = $this->trySyncInvoiceByOrderQuery($invoice, $payload);
        }

        $invoice->refresh();
        $invoicePaid = strtolower((string) $invoice->status) === 'paid';
        $paymentState = $invoicePaid ? 'success' : 'pending';

        $target = $this->resolveFrontendReturnUrl($invoice, [
            'payment' => $paymentState,
            'trade_no' => (string) ($payload['trade_no'] ?? ''),
            'out_trade_no' => (string) ($payload['out_trade_no'] ?? $invoice->id),
        ]);

        $this->logInfo('Epay return redirect', [
            'invoice_id' => $invoice->id,
            'invoice_status' => $invoice->status,
            'has_valid_signature' => $hasValidSignature,
            'trade_status' => $tradeStatus,
            'recorded_from_return' => $recordedFromReturn,
            'recorded_from_query' => $recordedFromQuery,
            'target' => $target,
            'query' => Arr::except($payload, ['sign']),
        ]);

        return redirect()->away($target);
    }

    private function resolveFrontendReturnUrl(Invoice $invoice, array $query = []): string
    {
        $configured = trim((string) $this->config('frontend_return_url'));
        $frontendBase = trim((string) env('SLOTH_FRONTEND_URL', 'https://app.jxjvip.help'));
        $frontendBase = rtrim($frontendBase, '/');
        $fallback = $frontendBase . '/invoices/{number}';

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

    private function resolveNotifyUrl(): string
    {
        $base = trim((string) $this->config('callback_base_url'));
        if ($base !== '') {
            $base = rtrim($base, '/');

            $routePath = route('extensions.gateways.epay.notify', [], false);
            $routePath = '/' . ltrim((string) parse_url($routePath, PHP_URL_PATH), '/');

            return $base . $routePath;
        }

        return route('extensions.gateways.epay.notify');
    }

    private function recordPaymentIfApplicable(Invoice $invoice, array $payload, string $source): bool
    {
        $invoice->refresh();
        if (strtolower((string) $invoice->status) === 'paid') {
            $this->logInfo('Epay payment skipped: invoice already paid', [
                'invoice_id' => $invoice->id,
                'source' => $source,
                'transaction_id' => (string) ($payload['transaction_id'] ?? ''),
            ]);

            return false;
        }

        $paidAmount = (float) number_format((float) ($payload['paid_amount'] ?? 0), 2, '.', '');
        $invoiceRemaining = (float) number_format((float) $invoice->remaining, 2, '.', '');

        if ($paidAmount <= 0) {
            $this->logWarning('Epay payment rejected: amount is empty', [
                'invoice_id' => $invoice->id,
                'source' => $source,
                'invoice_remaining' => $invoiceRemaining,
                'payload' => Arr::except($payload, ['sign']),
            ]);

            return false;
        }

        if ($paidAmount < $invoiceRemaining) {
            $this->logWarning('Epay payment rejected: amount mismatch', [
                'invoice_id' => $invoice->id,
                'source' => $source,
                'invoice_remaining' => $invoiceRemaining,
                'paid_amount' => $paidAmount,
            ]);

            return false;
        }

        $transactionId = trim((string) ($payload['transaction_id'] ?? ''));
        if ($transactionId === '') {
            $transactionId = 'epay-' . $source . '-invoice-' . $invoice->id . '-' . time();
        }

        ExtensionHelper::addPayment(
            $invoice->id,
            'Epay',
            number_format($paidAmount, 2, '.', ''),
            null,
            $transactionId
        );

        $this->logInfo('Epay payment recorded', [
            'invoice_id' => $invoice->id,
            'source' => $source,
            'transaction_id' => $transactionId,
            'paid_amount' => $paidAmount,
            'trade_status' => (string) ($payload['trade_status'] ?? ''),
        ]);

        return true;
    }

    private function trySyncInvoiceByOrderQuery(Invoice $invoice, array $returnPayload): bool
    {
        $apiUrl = rtrim((string) $this->config('api_url'), '/');
        $appId = trim((string) $this->config('app_id'));
        $appKey = trim((string) $this->config('app_key'));
        $orderNo = $this->firstNonEmpty(
            $returnPayload,
            ['out_trade_no', 'order_id', 'invoice_id', 'invoice', 'payId', 'pay_id'],
            (string) $invoice->id
        );

        if ($apiUrl === '' || $appId === '' || $appKey === '' || $orderNo === '') {
            $this->logWarning('Epay order query skipped: missing required config', [
                'invoice_id' => $invoice->id,
                'api_url_present' => $apiUrl !== '',
                'app_id_present' => $appId !== '',
                'app_key_present' => $appKey !== '',
                'order_no_present' => $orderNo !== '',
            ]);

            return false;
        }

        try {
            $response = Http::timeout(12)->acceptJson()->get($apiUrl . '/api.php', [
                'act' => 'order',
                'pid' => $appId,
                'key' => $appKey,
                'out_trade_no' => $orderNo,
            ]);
        } catch (\Throwable $exception) {
            $this->logWarning('Epay order query failed: request exception', [
                'invoice_id' => $invoice->id,
                'order_no' => $orderNo,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }

        $body = $response->body();
        $json = $response->json();
        if (!is_array($json)) {
            $decoded = json_decode($body, true);
            $json = is_array($decoded) ? $decoded : [];
        }

        $this->logInfo('Epay order query response', [
            'invoice_id' => $invoice->id,
            'order_no' => $orderNo,
            'http_status' => $response->status(),
            'payload' => Arr::except($json, ['sign']),
        ]);

        if ($json === [] || !$this->isOrderQueryPaid($json)) {
            return false;
        }

        $normalized = $this->normalizeNotifyPayload(array_merge($json, [
            'out_trade_no' => $orderNo,
        ]));

        if ($normalized['paid_amount'] <= 0) {
            $normalized['paid_amount'] = (float) number_format((float) $invoice->remaining, 2, '.', '');
        }

        if ($normalized['transaction_id'] === '') {
            $normalized['transaction_id'] = $this->firstNonEmpty($json, ['trade_no', 'pay_no', 'id'], '')
                ?: ('epay-query-' . $invoice->id . '-' . time());
        }

        return $this->recordPaymentIfApplicable($invoice, $normalized, 'return-query');
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
        $signatureCandidates = array_values(array_unique(array_filter([
            trim((string) ($payload['sign'] ?? '')),
            trim((string) ($payload['signature'] ?? '')),
            trim((string) ($payload['key'] ?? '')),
        ])));

        if ($signatureCandidates === []) {
            return false;
        }

        $appKey = (string) $this->config('app_key');
        foreach ($signatureCandidates as $incomingSignature) {
            if (Signer::verify($payload, $appKey, $incomingSignature)) {
                return true;
            }
        }

        return false;
    }

    private function normalizeNotifyPayload(array $payload): array
    {
        $merchantId = $this->firstNonEmpty(
            $payload,
            ['pid', 'partner', 'merchant_id', 'app_id', 'uid', 'user_id', 'mid']
        );

        $invoiceId = (int) $this->firstNonEmpty(
            $payload,
            ['out_trade_no', 'order_id', 'invoice_id', 'invoice', 'payId', 'pay_id']
        );

        $tradeStatus = strtoupper($this->firstNonEmpty(
            $payload,
            ['trade_status', 'trade_state', 'status']
        ));

        $paidAmount = (float) number_format((float) $this->firstNonEmpty(
            $payload,
            ['money', 'total_fee', 'realprice', 'reallyPrice', 'real_price', 'amount', 'price'],
            '0'
        ), 2, '.', '');

        $transactionId = $this->firstNonEmpty(
            $payload,
            ['trade_no', 'transaction_id', 'pay_no', 'payid', 'payId', 'pay_id']
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
            'TRADE_COMPLETED',
            'SUCCESS',
            'OK',
            'PAID',
            '1',
        ], true);
    }

    private function isSuccessfulNotify(array $rawPayload, array $normalizedPayload): bool
    {
        if ($this->isSuccessfulTradeStatus((string) $normalizedPayload['trade_status'])) {
            return true;
        }

        // Compatibility mode for VMS callback variants that omit trade_status.
        $hasOrderReference = $this->firstNonEmpty(
            $rawPayload,
            ['payId', 'pay_id', 'out_trade_no', 'invoice_id', 'order_id'],
            ''
        ) !== '';

        $paidAmount = (float) ($normalizedPayload['paid_amount'] ?? 0);

        return $hasOrderReference && $paidAmount > 0;
    }

    private function isOrderQueryPaid(array $payload): bool
    {
        $status = strtoupper($this->firstNonEmpty($payload, ['status', 'trade_status', 'trade_state'], ''));
        if ($this->isSuccessfulTradeStatus($status)) {
            return true;
        }

        $code = trim((string) ($payload['code'] ?? ''));
        if ($code === '1' || strtoupper($code) === 'SUCCESS') {
            return true;
        }

        $msg = strtoupper($this->firstNonEmpty($payload, ['msg', 'message'], ''));
        if (str_contains($msg, 'SUCCESS') || str_contains($msg, 'PAID') || str_contains($msg, '支付成功')) {
            return true;
        }

        $paidAmount = (float) number_format((float) $this->firstNonEmpty(
            $payload,
            ['money', 'total_fee', 'realprice', 'reallyPrice', 'real_price', 'amount', 'price'],
            '0'
        ), 2, '.', '');

        return $paidAmount > 0 && $this->firstNonEmpty($payload, ['trade_no', 'out_trade_no', 'order_no'], '') !== '';
    }

    private function resolveInvoiceFromPayload(array $payload): ?Invoice
    {
        $invoiceId = (int) $this->firstNonEmpty(
            $payload,
            ['out_trade_no', 'invoice_id', 'invoice', 'order_id', 'payId', 'pay_id'],
            '0'
        );

        if ($invoiceId <= 0) {
            return null;
        }

        return Invoice::query()->find($invoiceId);
    }

    private function resolveFallbackFrontendUrl(array $payload): string
    {
        $configured = trim((string) $this->config('frontend_return_url'));
        if ($configured === '') {
            return config('app.url');
        }

        $baseUrl = str_replace(
            ['{invoice}', '{number}'],
            [
                $this->firstNonEmpty($payload, ['out_trade_no', 'invoice_id', 'invoice', 'order_id', 'payId', 'pay_id'], ''),
                $this->firstNonEmpty($payload, ['param', 'out_trade_no', 'invoice_id', 'invoice', 'order_id', 'payId', 'pay_id'], ''),
            ],
            $configured
        );

        $separator = str_contains($baseUrl, '?') ? '&' : '?';
        return $baseUrl . $separator . http_build_query(array_filter([
            'payment' => 'pending',
            'trade_no' => (string) ($payload['trade_no'] ?? ''),
            'out_trade_no' => (string) ($payload['out_trade_no'] ?? ($payload['payId'] ?? ($payload['pay_id'] ?? ''))),
        ]));
    }

    private function logInfo(string $message, array $context = []): void
    {
        Log::info($message, $context);
        error_log('[Epay] ' . $message . ' ' . json_encode($context, JSON_UNESCAPED_UNICODE));
        try {
            Log::channel('stderr')->info($message, $context);
        } catch (\Throwable) {
            // Ignore stderr channel failures and keep the default logger intact.
        }
    }

    private function logWarning(string $message, array $context = []): void
    {
        Log::warning($message, $context);
        error_log('[Epay] ' . $message . ' ' . json_encode($context, JSON_UNESCAPED_UNICODE));
        try {
            Log::channel('stderr')->warning($message, $context);
        } catch (\Throwable) {
            // Ignore stderr channel failures and keep the default logger intact.
        }
    }
}
