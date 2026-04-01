import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
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

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
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
  const zh = locale.startsWith('zh');

  useEffect(() => {
    if (data?.data.invoice) {
      setInvoiceState(data.data.invoice);
    }
  }, [data]);

  useEffect(() => {
    if (!invoiceId || !payResult || !invoiceState || isInvoicePaid(invoiceState.status, invoiceState.remaining)) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await requestJson<InvoiceResponse>(`/api/v1/invoices/${invoiceId}`);
        if (cancelled) return;

        setInvoiceState(refreshed.data.invoice);
        if (isInvoicePaid(refreshed.data.invoice.status, refreshed.data.invoice.remaining)) {
          setMessage(
            zh
              ? '\u652f\u4ed8\u5df2\u786e\u8ba4\uff0c\u8d26\u5355\u72b6\u6001\u5df2\u66f4\u65b0\u3002'
              : 'Payment confirmed and invoice status updated.',
          );
          window.clearInterval(timer);
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId, invoiceState, zh, payResult]);

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
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function payWithGateway() {
    if (!invoiceId || !data?.data.gateways.length || pending) return;

    if (payResult?.data.redirectUrl) {
      window.location.assign(payResult.data.redirectUrl);
      return;
    }

    const gatewayId = selectedGatewayId || data.data.gateways[0].id;
    if (!gatewayId) return;

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
      }
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      if (!redirected) {
        setPending(false);
      }
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  const invoice = invoiceState ?? data.data.invoice;
  const paid = isInvoicePaid(invoice.status, invoice.remaining);

  const relatedServiceNames = useMemo(() => {
    const candidates = new Set<string>();

    data.data.recurringServices.forEach((service) => {
      const name = localizeText(service.label || service.baseLabel, locale, service.label || service.baseLabel).trim();
      if (name) {
        candidates.add(name);
      }
    });

    invoice.items.forEach((item) => {
      const normalized = normalizeItemName(localizeText(item.description, locale, item.description));
      if (normalized) {
        candidates.add(normalized);
      }
    });

    return Array.from(candidates);
  }, [data.data.recurringServices, invoice.items, locale]);

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.invoices}</p>
          <h1>#{invoice.number ?? invoice.id}</h1>
          <p className="muted">{invoice.status}</p>
        </div>
        <Link className="button ghost" to="/invoices">{text.nav.invoices}</Link>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          {relatedServiceNames.length > 0 ? (
            <div className="callout compact">
              <strong>{zh ? '\u5173\u8054\u4ea7\u54c1 / \u670d\u52a1' : 'Related product / service'}</strong>
              <ul className="invoice-related-list">
                {relatedServiceNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {invoice.items.map((item) => (
            <div className="callout compact" key={item.id}>
              <strong>{localizeText(item.description, locale, item.description)}</strong>
              <p>{item.formattedTotal}</p>
            </div>
          ))}
          <strong>{invoice.formattedRemaining}</strong>
        </article>

        <article className="summary-card">
          {paid ? (
            <div className="callout callout-success">
              <strong>{zh ? '\u2705 \u652f\u4ed8\u6210\u529f\uff0c\u8d26\u5355\u5df2\u7ed3\u6e05\u3002' : '\u2705 Payment successful. This invoice is settled.'}</strong>
              <p>
                {zh
                  ? '\u4f60\u53ef\u4ee5\u524d\u5f80\u670d\u52a1\u9875\u67e5\u770b\u8be5\u8d26\u5355\u5bf9\u5e94\u670d\u52a1\u7684\u5f00\u901a\u72b6\u6001\u3002'
                  : 'You can open the services page to check provisioning status.'}
              </p>
              <Link className="button ghost" to="/services">{text.nav.services}</Link>
            </div>
          ) : (
            <>
              {data.data.gateways.length > 0 ? (
                <label className="field">
                  <span>{zh ? '\u652f\u4ed8\u7f51\u5173' : 'Payment gateway'}</span>
                  <select
                    className="text-input select-input"
                    value={selectedGatewayId}
                    onChange={(event) => setSelectedGatewayId(event.target.value)}
                  >
                    {data.data.gateways.map((gateway) => (
                      <option key={gateway.id} value={gateway.id}>
                        {gateway.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="callout compact">
                  {zh
                    ? '\u5f53\u524d\u8d26\u5355\u6ca1\u6709\u53ef\u7528\u7f51\u5173\uff0c\u8bf7\u5728 Paymenter \u540e\u53f0\u542f\u7528\u5e76\u7ed1\u5b9a\u652f\u4ed8\u7f51\u5173\u3002'
                    : 'No gateway is available for this invoice yet. Enable and bind a gateway in Paymenter admin.'}
                </div>
              )}

              <button className="button primary" disabled={pending} type="button" onClick={() => void payWithCredit()}>
                {text.invoices.payWithCredit}
              </button>

              <button
                className="button secondary"
                disabled={pending || data.data.gateways.length === 0}
                type="button"
                onClick={() => void payWithGateway()}
              >
                {payResult?.data.redirectUrl
                  ? (zh ? '\u7ee7\u7eed\u652f\u4ed8' : 'Continue payment')
                  : text.invoices.payWithGateway}
              </button>

              {payResult?.data.redirectUrl ? (
                <a className="button ghost" href={payResult.data.redirectUrl} rel="noreferrer" target="_blank">
                  {zh ? '\u6253\u5f00\u652f\u4ed8\u9875\u9762\uff08\u65b0\u6807\u7b7e\uff09' : 'Open payment page in new tab'}
                </a>
              ) : null}
            </>
          )}
        </article>
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
