import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { ServiceResponse } from '../lib/types';

type ServiceActionButton = {
  key: string;
  action: string;
  label: string;
};

function normalizeServiceActionButton(button: Record<string, unknown>, index: number): ServiceActionButton | null {
  const action =
    (typeof button.function === 'string' && button.function.trim() !== '' ? button.function : null)
    ?? (typeof button.action === 'string' && button.action.trim() !== '' ? button.action : null)
    ?? (typeof button.name === 'string' && button.name.trim() !== '' ? button.name : null);

  if (!action) {
    return null;
  }

  const label =
    (typeof button.label === 'string' && button.label.trim() !== '' ? button.label : null)
    ?? (typeof button.name === 'string' && button.name.trim() !== '' ? button.name : null)
    ?? action;

  return {
    key: `${action}-${index}`,
    action,
    label,
  };
}

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}` : null,
  );
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
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
  const actionButtons = (data.data.actions?.buttons ?? [])
    .map((button, index) => normalizeServiceActionButton(button as Record<string, unknown>, index))
    .filter((button): button is ServiceActionButton => button !== null);

  async function executeRemoteAction(action: string) {
    if (!serviceId) return;
    setActionError(null);
    setMessage(null);
    setRunningAction(action);

    try {
      const response = await requestJson<{
        message?: string;
        data?: { redirect_url?: string | null; redirectUrl?: string | null };
      }>(`/api/v1/services/${serviceId}/actions/${encodeURIComponent(action)}`, {
        method: 'POST',
        body: {},
      });

      const redirectUrl = response.data?.redirect_url ?? response.data?.redirectUrl ?? null;
      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'noopener,noreferrer');
      }

      setMessage(response.message ?? `${text.common.submit}: OK`);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setRunningAction(null);
    }
  }

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

          {actionButtons.length > 0 ? (
            <div className="stack-12">
              <p className="eyebrow">{text.nav.services}</p>
              {actionButtons.map((button) => (
                <button
                  className="button secondary"
                  disabled={runningAction !== null}
                  key={button.key}
                  type="button"
                  onClick={() => void executeRemoteAction(button.action)}
                >
                  {runningAction === button.action ? `${text.common.pending}...` : button.label}
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
