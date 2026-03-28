import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { InvoicePayResponse, InvoiceResponse } from '../lib/types';

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<InvoiceResponse>(
    invoiceId ? `/api/v1/invoices/${invoiceId}` : null,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<InvoicePayResponse | null>(null);

  async function payWithCredit() {
    if (!invoiceId) return;
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
    if (!invoiceId || !data?.data.gateways[0]) return;
    setPending(true);
    setActionError(null);
    try {
      const response = await requestJson<InvoicePayResponse>(`/api/v1/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { method: 'gateway', gatewayId: Number(data.data.gateways[0].id) },
      });
      setMessage(response.message);
      setPayResult(response);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  const invoice = data.data.invoice;

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
          {invoice.items.map((item) => (
            <div className="callout compact" key={item.id}>
              <strong>{localizeText(item.description, locale, item.description)}</strong>
              <p>{item.formattedTotal}</p>
            </div>
          ))}
          <strong>{invoice.formattedRemaining}</strong>
        </article>

        <article className="summary-card">
          <button className="button primary" disabled={pending} type="button" onClick={() => void payWithCredit()}>
            {text.invoices.payWithCredit}
          </button>
          <button className="button secondary" disabled={pending || data.data.gateways.length === 0} type="button" onClick={() => void payWithGateway()}>
            {text.invoices.payWithGateway}
          </button>
          {payResult?.data.redirectUrl ? (
            <a className="button ghost" href={payResult.data.redirectUrl} rel="noreferrer" target="_blank">
              {text.checkout.redirectTo}
            </a>
          ) : null}
        </article>
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
