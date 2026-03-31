import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { requestJson, useApiData } from '../lib/api';
import { localizeApiError } from '../lib/error-messages';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { ServiceDetail, ServiceResponse } from '../lib/types';

type ConvoyCapabilities = {
  application: {
    read: boolean;
    patch: boolean;
    build: boolean;
    suspend: boolean;
    unsuspend: boolean;
    destroy: boolean;
  };
  actionBridge: {
    power: boolean;
    reinstall: boolean;
    revealPassword: boolean;
  };
};

type ServiceServerResponse = {
  data: {
    service: ServiceDetail;
    mapping: {
      serverRef: string;
      expectedKeys?: string[];
    };
    capabilities: ConvoyCapabilities;
    convoy: Record<string, unknown>;
  };
};

type ServerAction = 'start' | 'stop' | 'restart' | 'reinstall' | 'reveal-password' | 'suspend' | 'unsuspend';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readPath(value: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = value;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function pickString(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return null;
}

function pickNumber(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function pickBoolean(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === 'boolean') {
      return candidate;
    }
    if (typeof candidate === 'number') {
      return candidate > 0;
    }
    if (typeof candidate === 'string') {
      if (candidate === 'true' || candidate === '1') {
        return true;
      }
      if (candidate === 'false' || candidate === '0') {
        return false;
      }
    }
  }

  return null;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return '-';
  }

  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(1)}%`;
}

function formatBytes(value: number | null) {
  if (value === null || value <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let bytes = value;
  let unitIndex = 0;
  while (bytes >= 1024 && unitIndex < units.length - 1) {
    bytes /= 1024;
    unitIndex += 1;
  }

  return `${bytes.toFixed(bytes >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function statusClassName(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'active') return 'status-active';
  if (normalized === 'pending') return 'status-pending';
  if (normalized === 'suspended') return 'status-suspended';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'status-cancelled';
  return 'status-unknown';
}

function extractRevealedPassword(payload: unknown) {
  return pickString(payload, [
    'password',
    'root_password',
    'account_password',
    'data.password',
    'data.root_password',
    'data.account_password',
    'data.attributes.password',
  ]);
}

function friendlyServerError(rawError: string | null | undefined, mapMissing: string, convoyDisabled: string, unavailable: string) {
  if (!rawError) {
    return null;
  }

  const lower = rawError.toLowerCase();
  if (lower.includes('409') || lower.includes('service_convoy_mapping_missing')) {
    return mapMissing;
  }

  if (lower.includes('convoy integration is disabled') || lower.includes('convoy_disabled')) {
    return convoyDisabled;
  }

  return rawError || unavailable;
}

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}` : null,
  );
  const {
    data: serverData,
    error: serverError,
    loading: serverLoading,
  } = useApiData<ServiceServerResponse>(serviceId ? `/api/v1/services/${serviceId}/server` : null);
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState<ServerAction | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverActionError, setServerActionError] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

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
      setMessage(text.services.updateLabel);
      window.location.reload();
    } catch (caughtError) {
      setActionError(localizeApiError(caughtError, text, locale));
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
          reason: reason || text.services.cancel,
        },
      });
      setMessage(text.services.cancel);
      window.location.reload();
    } catch (caughtError) {
      setActionError(localizeApiError(caughtError, text, locale));
    } finally {
      setPending(false);
    }
  }

  async function runServerAction(action: ServerAction) {
    if (!serviceId) {
      return;
    }

    setServerBusy(action);
    setServerMessage(null);
    setServerActionError(null);
    if (action !== 'reveal-password') {
      setRevealedPassword(null);
    }

    try {
      let path = '';
      let method: 'POST' | 'DELETE' = 'POST';
      let body: Record<string, unknown> = {};

      if (action === 'start' || action === 'stop' || action === 'restart') {
        path = `/api/v1/services/${serviceId}/server/power`;
        body = { state: action };
      } else if (action === 'reinstall') {
        path = `/api/v1/services/${serviceId}/server/reinstall`;
      } else if (action === 'reveal-password') {
        path = `/api/v1/services/${serviceId}/server/reveal-password`;
      } else if (action === 'suspend') {
        path = `/api/v1/services/${serviceId}/server/suspend`;
      } else if (action === 'unsuspend') {
        path = `/api/v1/services/${serviceId}/server/unsuspend`;
      } else {
        path = `/api/v1/services/${serviceId}/server`;
        method = 'DELETE';
      }

      const response = await requestJson<Record<string, unknown>>(path, {
        method,
        ...(method === 'POST' ? { body } : {}),
      });
      const responseRecord = asRecord(response);
      const responseMessage = typeof responseRecord.message === 'string' && responseRecord.message.trim() !== ''
        ? responseRecord.message
        : text.serviceDetail.actionSuccess;

      if (action === 'reveal-password') {
        const password = extractRevealedPassword(responseRecord);
        setRevealedPassword(password);
      }

      setServerMessage(responseMessage);
    } catch (caughtError) {
      setServerActionError(localizeApiError(caughtError, text, locale));
    } finally {
      setServerBusy(null);
    }
  }

  const serverCapabilities: ConvoyCapabilities = useMemo(() => {
    if (!serverData?.data.capabilities) {
      return {
        application: {
          read: false,
          patch: false,
          build: false,
          suspend: false,
          unsuspend: false,
          destroy: false,
        },
        actionBridge: {
          power: false,
          reinstall: false,
          revealPassword: false,
        },
      };
    }

    return serverData.data.capabilities;
  }, [serverData]);

  const convoyState = useMemo(() => {
    const convoy = asRecord(serverData?.data.convoy);

    return {
      serverRef: serverData?.data.mapping.serverRef ?? '-',
      state: pickString(convoy, ['status', 'state', 'power_state', 'attributes.status']) ?? '-',
      ip: pickString(convoy, ['primary_ip', 'ip', 'address', 'attributes.ip', 'allocations.0.ip']) ?? '-',
      cpu: formatPercent(pickNumber(convoy, ['resource_usage.cpu', 'usage.cpu', 'stats.cpu', 'attributes.metrics.cpu'])),
      memory: formatBytes(pickNumber(convoy, ['resource_usage.memory_bytes', 'usage.memory_bytes', 'stats.memory_bytes', 'attributes.metrics.memory_bytes', 'limits.memory'])),
      disk: formatBytes(pickNumber(convoy, ['resource_usage.disk_bytes', 'usage.disk_bytes', 'stats.disk_bytes', 'attributes.metrics.disk_bytes', 'limits.disk'])),
      bandwidth: formatBytes(pickNumber(convoy, ['resource_usage.network_rx_bytes', 'usage.network_rx_bytes', 'stats.network_rx_bytes', 'attributes.metrics.network_rx_bytes'])),
      traffic: formatBytes(pickNumber(convoy, ['resource_usage.network_tx_bytes', 'usage.network_tx_bytes', 'stats.network_tx_bytes', 'attributes.metrics.network_tx_bytes'])),
      locked: pickBoolean(convoy, ['locked', 'attributes.locked']),
    };
  }, [serverData]);

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
            <div>
              <span>{text.common.status}</span>
              <strong><span className={`status-pill ${statusClassName(service.status)}`}>{service.status}</span></strong>
            </div>
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
          <p className="eyebrow">{text.serviceDetail.linkedInvoices}</p>
          {invoices.map((invoice) => (
            <Link className="callout compact" key={invoice.id} to={`/invoices/${invoice.id}`}>
              #{invoice.number ?? invoice.id} - {invoice.formattedTotal}
            </Link>
          ))}
        </article>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          <p className="eyebrow">{text.serviceDetail.infoTitle}</p>

          {serverLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : serverError ? (
            <div className="callout">
              {friendlyServerError(
                serverError,
                text.serviceDetail.mapMissing,
                text.serviceDetail.convoyDisabled,
                text.serviceDetail.unavailable,
              )}
            </div>
          ) : (
            <div className="detail-grid">
              <div><span>{text.serviceDetail.serverRef}</span><strong>{convoyState.serverRef}</strong></div>
              <div><span>{text.serviceDetail.state}</span><strong>{convoyState.state}</strong></div>
              <div><span>{text.serviceDetail.ipAddress}</span><strong>{convoyState.ip}</strong></div>
              <div><span>{text.serviceDetail.locked}</span><strong>{convoyState.locked === null ? '-' : (convoyState.locked ? text.common.yes : text.common.no)}</strong></div>
              <div><span>{text.serviceDetail.cpu}</span><strong>{convoyState.cpu}</strong></div>
              <div><span>{text.serviceDetail.memory}</span><strong>{convoyState.memory}</strong></div>
              <div><span>{text.serviceDetail.disk}</span><strong>{convoyState.disk}</strong></div>
              <div><span>{text.serviceDetail.inbound}</span><strong>{convoyState.bandwidth}</strong></div>
              <div><span>{text.serviceDetail.outbound}</span><strong>{convoyState.traffic}</strong></div>
            </div>
          )}
        </article>

        <article className="panel stack-12">
          <p className="eyebrow">{text.serviceDetail.operationsTitle}</p>
          <div className="action-grid">
            <button
              className="button secondary"
              disabled={serverBusy !== null || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('start')}
            >
              {serverBusy === 'start' ? `${text.common.pending}...` : text.serviceDetail.start}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('stop')}
            >
              {serverBusy === 'stop' ? `${text.common.pending}...` : text.serviceDetail.stop}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('restart')}
            >
              {serverBusy === 'restart' ? `${text.common.pending}...` : text.serviceDetail.restart}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !serverCapabilities.actionBridge.reinstall}
              type="button"
              onClick={() => void runServerAction('reinstall')}
            >
              {serverBusy === 'reinstall' ? `${text.common.pending}...` : text.serviceDetail.reinstall}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !serverCapabilities.actionBridge.revealPassword}
              type="button"
              onClick={() => void runServerAction('reveal-password')}
            >
              {serverBusy === 'reveal-password' ? `${text.common.pending}...` : text.serviceDetail.revealPassword}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !serverCapabilities.application.suspend}
              type="button"
              onClick={() => void runServerAction('suspend')}
            >
              {serverBusy === 'suspend' ? `${text.common.pending}...` : text.serviceDetail.suspend}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !serverCapabilities.application.unsuspend}
              type="button"
              onClick={() => void runServerAction('unsuspend')}
            >
              {serverBusy === 'unsuspend' ? `${text.common.pending}...` : text.serviceDetail.unsuspend}
            </button>
          </div>
          {revealedPassword ? (
            <div className="callout compact">
              <strong>{text.serviceDetail.tempPassword}: </strong>
              <code>{revealedPassword}</code>
            </div>
          ) : null}
          {serverMessage ? <div className="callout compact">{serverMessage}</div> : null}
          {serverActionError ? <div className="error-card">{serverActionError}</div> : null}
        </article>
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
