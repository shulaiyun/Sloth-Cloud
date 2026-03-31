import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { requestJson, useApiData } from '../lib/api';
import { localizeApiError } from '../lib/error-messages';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { InvoicePayResponse, InvoiceResponse } from '../lib/types';

function isInvoicePaid(status: string, remaining: number) {
  const normalized = status.trim().toLowerCase();
  return normalized === 'paid' || normalized === 'success' || normalized === 'completed' || remaining <= 0;
}

function normalizeItemName(description: string) {
  const compact = description.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }

  return compact.replace(/\s*\([^)]*\)\s*$/, '');
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<InvoiceResponse>(
    invoiceId ? `/api/v1/invoices/${invoiceId}` : null,
  );

  const [pending, setPending] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<InvoicePayResponse | null>(null);
  const [invoiceState, setInvoiceState] = useState<InvoiceResponse['data']['invoice'] | null>(null);

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
        if (cancelled) {
          return;
        }

        setInvoiceState(refreshed.data.invoice);
        if (isInvoicePaid(refreshed.data.invoice.status, refreshed.data.invoice.remaining)) {
          setMessage(text.invoices.paymentConfirmed);
          window.clearInterval(timer);
        }
      } catch {
        // Keep polling resilient if the upstream briefly blips.
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId, invoiceState, payResult, text.invoices.paymentConfirmed]);

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
      setActionError(localizeApiError(caughtError, text, locale));
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
      setActionError(localizeApiError(caughtError, text, locale));
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

  const relatedServiceNames = (() => {
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
  })();

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
              <strong>{text.invoices.relatedServiceLabel}</strong>
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
              <strong>{text.invoices.paidBannerTitle}</strong>
              <p>{text.invoices.paidBannerBody}</p>
              <Link className="button ghost" to="/services">
                {text.nav.services}
              </Link>
            </div>
          ) : (
            <>
              {data.data.gateways.length > 0 ? (
                <label className="field">
                  <span>{text.invoices.paymentGatewayLabel}</span>
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
                <div className="callout compact">{text.invoices.noGateway}</div>
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
                {payResult?.data.redirectUrl ? text.invoices.continuePayment : text.invoices.payWithGateway}
              </button>

              {payResult?.data.redirectUrl ? (
                <a className="button ghost" href={payResult.data.redirectUrl} rel="noreferrer" target="_blank">
                  {text.invoices.openPaymentPage}
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
