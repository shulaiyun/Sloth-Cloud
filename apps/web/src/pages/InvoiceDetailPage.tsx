import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { InvoicePayResponse, InvoiceResponse } from '../lib/types';

function isInvoicePaid(status: string, remaining: number) {
  const normalized = status.trim().toLowerCase();
  return normalized === 'paid' || normalized === 'success' || normalized === 'completed' || remaining <= 0;
}

function normalizeItemName(description: string) {
  const compact = description.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.replace(/\s*\([^)]*\)\s*$/, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasPaymentReturnHint(search: string) {
  const query = new URLSearchParams(search);
  const keys = ['trade_no', 'out_trade_no', 'payid', 'payment', 'status', 'money'];

  return keys.some((key) => {
    const value = query.get(key);
    return typeof value === 'string' && value.trim() !== '';
  });
}

function invoiceStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'paid' || normalized === 'success' || normalized === 'completed') {
    return zh ? '\u5df2\u652f\u4ed8' : 'Paid';
  }
  if (normalized === 'pending' || normalized === 'unpaid') {
    return zh ? '\u5f85\u652f\u4ed8' : 'Pending';
  }
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'void') {
    return zh ? '\u5df2\u53d6\u6d88' : 'Cancelled';
  }
  if (normalized === 'overdue') {
    return zh ? '\u5df2\u903e\u671f' : 'Overdue';
  }

  return zh ? '\u672a\u77e5' : 'Unknown';
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const location = useLocation();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<InvoiceResponse>(
    invoiceId ? `/api/v1/invoices/${invoiceId}` : null,
  );

  const [pending, setPending] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<InvoicePayResponse | null>(null);
  const [invoiceState, setInvoiceState] = useState<InvoiceResponse['data']['invoice'] | null>(null);
  const [pollingForPayment, setPollingForPayment] = useState(false);

  const zh = locale.startsWith('zh');
  const invoice = invoiceState ?? data?.data.invoice ?? null;

  const gateways = useMemo(() => {
    if (!Array.isArray(data?.data.gateways)) {
      return [];
    }

    return data.data.gateways.filter((gateway) => isPlainObject(gateway));
  }, [data]);

  const recurringServices = useMemo(() => {
    if (!Array.isArray(data?.data.recurringServices)) {
      return [];
    }

    return data.data.recurringServices.filter((service) => isPlainObject(service));
  }, [data]);

  const invoiceItems = useMemo(() => {
    if (!Array.isArray(invoice?.items)) {
      return [];
    }

    return invoice.items.filter((item) => isPlainObject(item));
  }, [invoice]);

  useEffect(() => {
    if (data?.data.invoice) {
      setInvoiceState(data.data.invoice);
    }
  }, [data]);

  useEffect(() => {
    if (selectedGatewayId !== '' || gateways.length === 0) {
      return;
    }

    const firstGatewayId = gateways[0]?.id;
    if (typeof firstGatewayId === 'string' || typeof firstGatewayId === 'number') {
      setSelectedGatewayId(String(firstGatewayId));
    }
  }, [gateways, selectedGatewayId]);

  useEffect(() => {
    if (!invoiceId || !invoiceState) {
      return;
    }

    const shouldStartPolling = Boolean(payResult) || hasPaymentReturnHint(location.search);
    if (!shouldStartPolling || isInvoicePaid(invoiceState.status, invoiceState.remaining)) {
      setPollingForPayment(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 18;
    setPollingForPayment(true);
    setMessage((current) => current ?? (zh
      ? '\u6b63\u5728\u7b49\u5f85\u652f\u4ed8\u56de\u8c03\u786e\u8ba4\uff0c\u8d26\u5355\u72b6\u6001\u4f1a\u81ea\u52a8\u5237\u65b0\u3002'
      : 'Waiting for payment confirmation. Invoice status will refresh automatically.'));

    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const refreshed = await requestJson<InvoiceResponse>(`/api/v1/invoices/${invoiceId}`);
        if (cancelled) {
          return;
        }

        setInvoiceState(refreshed.data.invoice);
        if (isInvoicePaid(refreshed.data.invoice.status, refreshed.data.invoice.remaining)) {
          setMessage(zh ? '\u652f\u4ed8\u5df2\u786e\u8ba4\uff0c\u8d26\u5355\u72b6\u6001\u5df2\u66f4\u65b0\u3002' : 'Payment confirmed. Invoice status updated.');
          setPollingForPayment(false);
          window.clearInterval(timer);
          return;
        }
      } catch {
        // Ignore transient polling errors.
      }

      if (attempts >= maxAttempts) {
        setPollingForPayment(false);
        setMessage(zh
          ? '\u6682\u672a\u786e\u8ba4\u5230\u652f\u4ed8\u7ed3\u679c\uff0c\u8bf7\u7a0d\u540e\u624b\u52a8\u5237\u65b0\u8d26\u5355\u9875\u6216\u8054\u7cfb\u652f\u6301\u5e76\u63d0\u4f9b\u652f\u4ed8\u5355\u53f7\u3002'
          : 'Payment has not been confirmed yet. Refresh this invoice shortly or contact support with the payment reference.');
        window.clearInterval(timer);
      }
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId, invoiceState, location.search, payResult, zh]);

  async function payWithCredit() {
    if (!invoiceId || pending) return;

    setPending(true);
    setActionError(null);

    try {
      const response = await requestJson<InvoicePayResponse>(`/api/v1/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { method: 'credit' },
      });

      setMessage(response.message);
      setPayResult(response);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setPending(false);
    }
  }

  async function payWithGateway() {
    if (!invoiceId || pending) return;

    if (payResult?.data.redirectUrl) {
      window.location.assign(payResult.data.redirectUrl);
      return;
    }

    if (payResult?.data.paymentHtml) {
      setMessage(
        zh
          ? '\u5df2\u83b7\u53d6\u7f51\u5173\u5185\u5d4c\u6536\u94f6\u53f0\uff0c\u8bf7\u5728\u4e0b\u65b9\u5b8c\u6210\u652f\u4ed8\u3002'
          : 'Embedded checkout is ready. Complete payment below.',
      );
      return;
    }

    if (gateways.length === 0) {
      setActionError(
        zh
          ? '\u5f53\u524d\u8d26\u5355\u6ca1\u6709\u53ef\u7528\u652f\u4ed8\u7f51\u5173\uff0c\u8bf7\u5728 Paymenter \u540e\u53f0\u542f\u7528\u5e76\u7ed1\u5b9a\u7f51\u5173\u3002'
          : 'No gateway is available for this invoice. Enable and bind one in Paymenter admin.',
      );
      return;
    }

    const gatewayId = selectedGatewayId || String(gateways[0]?.id ?? '');
    if (!gatewayId) {
      return;
    }

    setPending(true);
    setActionError(null);
    let redirected = false;

    try {
      const response = await requestJson<InvoicePayResponse>(`/api/v1/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { method: 'gateway', gatewayId: Number(gatewayId) },
      });

      setMessage(response.message);
      setPayResult(response);

      if (response.data.redirectUrl) {
        redirected = true;
        window.location.assign(response.data.redirectUrl);
      } else if (response.data.paymentHtml) {
        setMessage(
          zh
            ? '\u5df2\u83b7\u53d6\u7f51\u5173\u5185\u5d4c\u6536\u94f6\u53f0\uff0c\u8bf7\u5728\u4e0b\u65b9\u5b8c\u6210\u652f\u4ed8\u3002'
            : 'Embedded checkout is ready. Complete payment below.',
        );
      } else {
        setActionError(
          zh
            ? '\u7f51\u5173\u672a\u8fd4\u56de\u53ef\u7528\u652f\u4ed8\u9875\u9762\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u8054\u7cfb\u652f\u6301\u3002'
            : 'Gateway did not return a usable checkout page. Please retry or contact support.',
        );
      }
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      if (!redirected) {
        setPending(false);
      }
    }
  }

  const relatedServiceNames = useMemo(() => {
    if (!data || !invoice) {
      return [];
    }

    const candidates = new Set<string>();

    recurringServices.forEach((service) => {
      const raw = typeof service.label === 'string' && service.label.trim() !== ''
        ? service.label
        : typeof service.baseLabel === 'string'
          ? service.baseLabel
          : '';
      const name = localizeText(raw, locale, raw).trim();
      if (name) {
        candidates.add(name);
      }
    });

    invoiceItems.forEach((item) => {
      const description = typeof item.description === 'string' ? item.description : '';
      const normalized = normalizeItemName(localizeText(description, locale, description));
      if (normalized) {
        candidates.add(normalized);
      }
    });

    return Array.from(candidates);
  }, [data, invoice, recurringServices, invoiceItems, locale]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data || !invoice) {
    return (
      <div className="error-card">
        {text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}
      </div>
    );
  }

  const paid = isInvoicePaid(invoice.status, invoice.remaining);

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.invoices}</p>
          <h1>#{invoice.number ?? invoice.id}</h1>
          <p className="muted">{invoiceStatusLabel(invoice.status, locale)}</p>
        </div>
        <Link className="button ghost" to="/invoices">
          {text.nav.invoices}
        </Link>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          {relatedServiceNames.length > 0 ? (
            <div className="callout compact">
              <strong>{zh ? '\u5173\u8054\u4ea7\u54c1\u6216\u670d\u52a1' : 'Related product or service'}</strong>
              <ul className="invoice-related-list">
                {relatedServiceNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {invoiceItems.map((item, index) => (
            <div className="callout compact" key={String(item.id ?? item.description ?? index)}>
              <strong>{localizeText(String(item.description ?? ''), locale, String(item.description ?? ''))}</strong>
              <p>{String(item.formattedTotal ?? '-')}</p>
            </div>
          ))}
          <strong>{invoice.formattedRemaining}</strong>
        </article>

        <article className="summary-card">
          {paid ? (
            <div className="callout callout-success">
              <strong>{zh ? '\u652f\u4ed8\u6210\u529f\uff0c\u8d26\u5355\u5df2\u7ed3\u6e05\u3002' : 'Payment successful. Invoice settled.'}</strong>
              <p>
                {zh
                  ? '\u4f60\u53ef\u4ee5\u524d\u5f80\u670d\u52a1\u9875\u9762\u67e5\u770b\u8fd9\u7b14\u8d26\u5355\u5bf9\u5e94\u7684\u5f00\u901a\u548c\u8fd0\u884c\u72b6\u6001\u3002'
                  : 'Open the services page to review provisioning and runtime status.'}
              </p>
              <Link className="button ghost" to="/services">
                {text.nav.services}
              </Link>
            </div>
          ) : (
            <>
              {gateways.length > 0 ? (
                <label className="field">
                  <span>{zh ? '\u652f\u4ed8\u65b9\u5f0f' : 'Payment method'}</span>
                  <select
                    className="text-input select-input"
                    value={selectedGatewayId}
                    onChange={(event) => setSelectedGatewayId(event.target.value)}
                  >
                    {gateways.map((gateway) => (
                      <option key={String(gateway.id)} value={String(gateway.id)}>
                        {String(gateway.name ?? gateway.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="callout compact">
                  {zh
                    ? '\u5f53\u524d\u8d26\u5355\u6ca1\u6709\u53ef\u7528\u652f\u4ed8\u65b9\u5f0f\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u6216\u8054\u7cfb\u652f\u6301\u3002'
                    : 'No payment method is available for this invoice. Please retry or contact support.'}
                </div>
              )}

              <button className="button primary" disabled={pending} type="button" onClick={() => void payWithCredit()}>
                {text.invoices.payWithCredit}
              </button>

              <button
                className="button secondary"
                disabled={pending || gateways.length === 0}
                type="button"
                onClick={() => void payWithGateway()}
              >
                {payResult?.data.redirectUrl ? (zh ? '\u7ee7\u7eed\u652f\u4ed8' : 'Continue payment') : text.invoices.payWithGateway}
              </button>

              {payResult?.data.redirectUrl ? (
                <a className="button ghost" href={payResult.data.redirectUrl} rel="noreferrer" target="_blank">
                  {zh ? '\u6253\u5f00\u652f\u4ed8\u9875\u9762\uff08\u65b0\u6807\u7b7e\uff09' : 'Open payment page (new tab)'}
                </a>
              ) : null}

              {payResult?.data.paymentHtml && !payResult?.data.redirectUrl ? (
                <div className="payment-embed stack-12">
                  <p className="muted">
                    {zh
                      ? '\u8bf7\u5728\u4e0b\u65b9\u6536\u94f6\u53f0\u5b8c\u6210\u652f\u4ed8\uff0c\u6210\u529f\u540e\u8d26\u5355\u72b6\u6001\u4f1a\u81ea\u52a8\u5237\u65b0\u3002'
                      : 'Finish payment below. Invoice status will refresh automatically.'}
                  </p>
                  <iframe
                    className="payment-embed-frame"
                    sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation"
                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_top"></head><body>${payResult.data.paymentHtml}</body></html>`}
                    title={zh ? '\u652f\u4ed8\u9875\u9762' : 'Payment page'}
                  />
                </div>
              ) : null}
            </>
          )}
        </article>
      </section>

      {pollingForPayment && !paid ? (
        <div className="callout">
          {zh ? '\u6b63\u5728\u786e\u8ba4\u652f\u4ed8\u7ed3\u679c\uff0c\u8bf7\u7a0d\u5019...' : 'Confirming payment status, please wait...'}
        </div>
      ) : null}
      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
