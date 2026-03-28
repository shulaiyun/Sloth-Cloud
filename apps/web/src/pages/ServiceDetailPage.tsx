import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { ServiceResponse } from '../lib/types';

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}` : null,
  );
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function updateLabel() {
    if (!serviceId) return;
    setPending(true);
    setMessage(null);
    setActionError(null);
    try {
      await requestJson(`/api/v1/services/${serviceId}/label`, {
        method: 'PATCH',
        body: { label: label.trim() || null },
      });
      setMessage('OK');
      window.location.reload();
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function cancelService() {
    if (!serviceId) return;
    setPending(true);
    setMessage(null);
    setActionError(null);
    try {
      await requestJson(`/api/v1/services/${serviceId}/cancel`, {
        method: 'POST',
        body: {
          type: 'end_of_period',
          reason: reason || 'Requested by customer.',
        },
      });
      setMessage('OK');
      window.location.reload();
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

  const { service, invoices } = data.data;

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.services}</p>
          <h1>{localizeText(service.label || service.baseLabel, locale, service.label || service.baseLabel)}</h1>
          <p className="muted">{service.product?.name ? localizeText(service.product.name, locale, service.product.name) : '-'}</p>
        </div>
        <Link className="button ghost" to="/services">{text.nav.services}</Link>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          <div className="detail-grid">
            <div><span>{text.common.status}</span><strong>{service.status}</strong></div>
            <div><span>{text.common.total}</span><strong>{service.formattedPrice}</strong></div>
          </div>

          <label className="field">
            <span>{text.services.updateLabel}</span>
            <input className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <button className="button secondary" disabled={pending} type="button" onClick={() => void updateLabel()}>
            {text.services.updateLabel}
          </button>

          <label className="field">
            <span>{text.services.cancel}</span>
            <input className="text-input" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="button danger" disabled={pending} type="button" onClick={() => void cancelService()}>
            {text.services.cancel}
          </button>
        </article>

        <article className="panel stack-12">
          <p className="eyebrow">{text.nav.invoices}</p>
          {invoices.map((invoice) => (
            <Link className="callout compact" key={invoice.id} to={`/invoices/${invoice.id}`}>
              #{invoice.number ?? invoice.id} - {invoice.formattedTotal}
            </Link>
          ))}
        </article>
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
