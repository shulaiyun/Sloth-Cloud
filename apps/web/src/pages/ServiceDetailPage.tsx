import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type {
  ServiceDetail,
  ServiceProvisioningResponse,
  ServiceProvisioningRetryResponse,
  ServiceResponse,
} from '../lib/types';

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
  if (value === null) return '-';
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(1)}%`;
}

function formatBytes(value: number | null) {
  if (value === null || value <= 0) return '-';
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

function normalizeActionName(action: string) {
  return action.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function readActionName(button: Record<string, unknown>) {
  const candidates = [button.function, button.action, button.name, button.label];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  return null;
}

function findActionName(buttons: Array<Record<string, unknown>>, aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeActionName(alias));

  for (const button of buttons) {
    const name = readActionName(button);
    if (!name) continue;

    const normalized = normalizeActionName(name);
    if (normalizedAliases.some((alias) => normalized.includes(alias))) {
      return name;
    }
  }

  return null;
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

function friendlyServerError(rawError: string | null | undefined, locale: string) {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();
  const zh = locale.startsWith('zh');

  if (lower.includes('409') || lower.includes('service_convoy_mapping_missing')) {
    return zh
      ? '\u8be5\u670d\u52a1\u5c1a\u672a\u5b8c\u6210 Convoy \u6620\u5c04\uff0c\u5f53\u524d\u4e0d\u80fd\u6267\u884c\u670d\u52a1\u5668\u64cd\u4f5c\u3002\u8bf7\u7b49\u5f85\u5f00\u901a\u5b8c\u6210\uff0c\u6216\u5728\u540e\u53f0\u8865\u9f50 server_uuid \u6620\u5c04\u3002'
      : 'This service is not mapped to a Convoy server yet. Wait for provisioning to complete or backfill server_uuid mapping.';
  }

  if (lower.includes('service_provisioning_pending')) {
    return zh
      ? '\u670d\u52a1\u6b63\u5728\u5f00\u901a\u4e2d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
      : 'Service provisioning is still in progress. Please try again later.';
  }

  if (lower.includes('service_provisioning_failed')) {
    return zh
      ? '\u670d\u52a1\u5f00\u901a\u5931\u8d25\uff0c\u8bf7\u5728\u5f00\u901a\u72b6\u6001\u9762\u677f\u4e2d\u53d1\u8d77\u91cd\u8bd5\u3002'
      : 'Service provisioning failed. Retry from the provisioning panel.';
  }

  if (lower.includes('convoy integration is disabled') || lower.includes('convoy_disabled')) {
    return zh
      ? 'BFF \u672a\u542f\u7528 Convoy\uff08CONVOY_ENABLED=false\uff09\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u3002'
      : 'Convoy is disabled in BFF (CONVOY_ENABLED=false).';
  }

  return rawError;
}

function provisioningTone(status: string | null | undefined) {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'success' || normalized === 'completed') return 'success';
  if (normalized === 'failed') return 'failed';
  return 'pending';
}

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { text, locale, formatDate } = useSite();
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}` : null,
  );
  const { data: serverData, error: serverError, loading: serverLoading } = useApiData<ServiceServerResponse>(
    serviceId ? `/api/v1/services/${serviceId}/server` : null,
  );
  const {
    data: provisioningData,
    error: provisioningError,
    loading: provisioningLoading,
  } = useApiData<ServiceProvisioningResponse>(serviceId ? `/api/v1/services/${serviceId}/provisioning` : null);

  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState<ServerAction | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverActionError, setServerActionError] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [renewingService, setRenewingService] = useState(false);
  const [retryingProvisioning, setRetryingProvisioning] = useState(false);
  const [provisioningMessage, setProvisioningMessage] = useState<string | null>(null);

  const zh = locale.startsWith('zh');

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
      setMessage(zh ? '\u670d\u52a1\u6807\u7b7e\u5df2\u66f4\u65b0\u3002' : 'Service label updated.');
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
      setMessage(zh ? '\u5df2\u63d0\u4ea4\u53d6\u6d88\u8bf7\u6c42\u3002' : 'Cancellation requested.');
      window.location.reload();
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function retryProvisioning() {
    if (!serviceId) return;
    setRetryingProvisioning(true);
    setProvisioningMessage(null);
    setActionError(null);
    try {
      const response = await requestJson<ServiceProvisioningRetryResponse>(`/api/v1/services/${serviceId}/provisioning/retry`, {
        method: 'POST',
      });
      setProvisioningMessage(response.message);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setRetryingProvisioning(false);
    }
  }

  async function renewService(actionName: string | null) {
    if (!serviceId || !actionName) return;

    setRenewingService(true);
    setActionError(null);
    setMessage(null);
    try {
      const response = await requestJson<{ message?: string }>(
        `/api/v1/services/${serviceId}/actions/${encodeURIComponent(actionName)}`,
        {
          method: 'POST',
          body: {},
        },
      );
      setMessage(
        typeof response.message === 'string' && response.message.trim() !== ''
          ? response.message
          : (zh ? '\u7eed\u8d39\u8bf7\u6c42\u5df2\u63d0\u4ea4\u3002' : 'Renewal request submitted.'),
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setRenewingService(false);
    }
  }

  async function runServerAction(action: ServerAction) {
    if (!serviceId) return;

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
        : (zh ? '\u64cd\u4f5c\u6267\u884c\u6210\u529f\u3002' : 'Action completed successfully.');

      if (action === 'reveal-password') {
        const password = extractRevealedPassword(responseRecord);
        setRevealedPassword(password);
      }

      setServerMessage(responseMessage);
    } catch (caughtError) {
      setServerActionError((caughtError as ApiError).message);
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
  const serviceButtons = (data.data.actions?.buttons ?? []) as Array<Record<string, unknown>>;
  const provisioning = provisioningData?.data.latest ?? null;
  const provisioningStatus = (provisioning?.status ?? '').toLowerCase();
  const provisioningCanRetry = provisioningStatus === 'failed';
  const provisioningInFlight = provisioningStatus === 'pending' || provisioningStatus === 'provisioning';
  const renewActionName = findActionName(serviceButtons, ['renew', 'extend', 'recurring', 'cycle']);
  const canRenewService = renewActionName !== null && !provisioningInFlight;
  const canRunServerActions = !serverLoading && !serverError && !provisioningInFlight && !provisioningCanRetry;

  const provisioningLabel = zh
    ? (
      provisioningStatus === 'failed'
        ? '\u5f00\u901a\u5931\u8d25'
        : provisioningStatus === 'success' || provisioningStatus === 'completed'
          ? '\u5f00\u901a\u6210\u529f'
          : provisioningStatus
            ? '\u5f00\u901a\u4e2d'
            : '\u5f85\u5f00\u901a'
    )
    : (
      provisioningStatus === 'failed'
        ? 'Provisioning failed'
        : provisioningStatus === 'success' || provisioningStatus === 'completed'
          ? 'Provisioning completed'
          : provisioningStatus
            ? 'Provisioning in progress'
            : 'Provisioning pending'
    );

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

      <section className="panel stack-16">
        <p className="eyebrow">{zh ? '\u5f00\u901a\u72b6\u6001' : 'Provisioning status'}</p>
        {provisioningLoading ? (
          <div className="loading-card">{text.common.loading}</div>
        ) : provisioningError ? (
          <div className="error-card">{provisioningError}</div>
        ) : (
          <>
            <div className={`callout ${provisioningTone(provisioningStatus) === 'failed' ? 'error-card compact' : 'compact'}`}>
              <strong>{provisioningLabel}</strong>
              {provisioning?.errorMessage ? <p className="muted">{provisioning.errorMessage}</p> : null}
              <p className="muted">
                {zh ? '\u6700\u8fd1\u5c1d\u8bd5' : 'Last attempt'}: {formatDate(provisioning?.lastAttemptAt ?? null)}
                {' · '}
                {zh ? '\u5c1d\u8bd5\u6b21\u6570' : 'Attempts'}: {provisioning?.attemptCount ?? 0}
              </p>
            </div>
            {provisioningCanRetry ? (
              <button
                className="button primary"
                disabled={retryingProvisioning}
                type="button"
                onClick={() => void retryProvisioning()}
              >
                {retryingProvisioning
                  ? (zh ? '\u6b63\u5728\u91cd\u8bd5...' : 'Retrying...')
                  : (zh ? '\u91cd\u8bd5\u5f00\u901a' : 'Retry provisioning')}
              </button>
            ) : null}
            {provisioningMessage ? <div className="callout compact">{provisioningMessage}</div> : null}
          </>
        )}
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

          <button
            className="button primary"
            disabled={renewingService || !canRenewService}
            type="button"
            onClick={() => void renewService(renewActionName)}
          >
            {renewingService
              ? (zh ? '\u7eed\u8d39\u5904\u7406\u4e2d...' : 'Renewing...')
              : (zh ? '\u7eed\u8d39\u670d\u52a1' : 'Renew service')}
          </button>
          {!canRenewService ? (
            <p className="muted">
              {provisioningInFlight
                ? (zh ? '\u670d\u52a1\u6b63\u5728\u5f00\u901a\u4e2d\uff0c\u5f00\u901a\u5b8c\u6210\u540e\u53ef\u7eed\u8d39\u3002' : 'Renewal will be available after provisioning completes.')
                : (zh ? '\u5f53\u524d\u670d\u52a1\u672a\u5f00\u653e\u7eed\u8d39\u52a8\u4f5c\u3002' : 'Renewal action is not available for this service.')}
            </p>
          ) : null}
        </article>

        <article className="panel stack-12">
          <p className="eyebrow">{text.nav.invoices}</p>
          {invoices.length === 0 ? (
            <div className="callout compact">{text.invoices.noInvoices}</div>
          ) : invoices.map((invoice) => (
            <Link className="callout compact" key={invoice.id} to={`/invoices/${invoice.id}`}>
              #{invoice.number ?? invoice.id} - {invoice.formattedTotal}
            </Link>
          ))}
        </article>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          <p className="eyebrow">{zh ? '\u670d\u52a1\u5668\u4fe1\u606f' : 'Server information'}</p>

          {serverLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : serverError ? (
            <div className="callout">{friendlyServerError(serverError, locale)}</div>
          ) : (
            <div className="detail-grid">
              <div><span>{zh ? '\u670d\u52a1\u5668\u6620\u5c04' : 'Server ref'}</span><strong>{convoyState.serverRef}</strong></div>
              <div><span>{zh ? '\u8fd0\u884c\u72b6\u6001' : 'State'}</span><strong>{convoyState.state}</strong></div>
              <div><span>{zh ? 'IP \u5730\u5740' : 'IP address'}</span><strong>{convoyState.ip}</strong></div>
              <div><span>{zh ? '\u9501\u5b9a\u72b6\u6001' : 'Locked'}</span><strong>{convoyState.locked === null ? '-' : (convoyState.locked ? (zh ? '\u662f' : 'Yes') : (zh ? '\u5426' : 'No'))}</strong></div>
              <div><span>CPU</span><strong>{convoyState.cpu}</strong></div>
              <div><span>{zh ? '\u5185\u5b58' : 'Memory'}</span><strong>{convoyState.memory}</strong></div>
              <div><span>{zh ? '\u78c1\u76d8' : 'Disk'}</span><strong>{convoyState.disk}</strong></div>
              <div><span>{zh ? '\u5165\u7ad9\u5e26\u5bbd' : 'Inbound bandwidth'}</span><strong>{convoyState.bandwidth}</strong></div>
              <div><span>{zh ? '\u51fa\u7ad9\u6d41\u91cf' : 'Outbound traffic'}</span><strong>{convoyState.traffic}</strong></div>
            </div>
          )}
        </article>

        <article className="panel stack-12">
          <p className="eyebrow">{zh ? '\u670d\u52a1\u5668\u64cd\u4f5c' : 'Server operations'}</p>
          <div className="action-grid">
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('start')}
            >
              {serverBusy === 'start' ? `${text.common.pending}...` : (zh ? '\u5f00\u673a' : 'Start')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('stop')}
            >
              {serverBusy === 'stop' ? `${text.common.pending}...` : (zh ? '\u5173\u673a' : 'Stop')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('restart')}
            >
              {serverBusy === 'restart' ? `${text.common.pending}...` : (zh ? '\u91cd\u542f' : 'Restart')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.reinstall}
              type="button"
              onClick={() => void runServerAction('reinstall')}
            >
              {serverBusy === 'reinstall' ? `${text.common.pending}...` : (zh ? '\u91cd\u88c5\u7cfb\u7edf' : 'Reinstall')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.revealPassword}
              type="button"
              onClick={() => void runServerAction('reveal-password')}
            >
              {serverBusy === 'reveal-password' ? `${text.common.pending}...` : (zh ? '\u663e\u793a\u5bc6\u7801' : 'Reveal password')}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.suspend}
              type="button"
              onClick={() => void runServerAction('suspend')}
            >
              {serverBusy === 'suspend' ? `${text.common.pending}...` : (zh ? '\u6682\u505c' : 'Suspend')}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.unsuspend}
              type="button"
              onClick={() => void runServerAction('unsuspend')}
            >
              {serverBusy === 'unsuspend' ? `${text.common.pending}...` : (zh ? '\u89e3\u9664\u6682\u505c' : 'Unsuspend')}
            </button>
          </div>
          {!canRunServerActions ? (
            <div className="callout compact">
              {provisioningInFlight
                ? (zh ? '\u670d\u52a1\u6b63\u5728\u5f00\u901a\u4e2d\uff0c\u6682\u4e0d\u53ef\u6267\u884c\u670d\u52a1\u5668\u64cd\u4f5c\u3002' : 'Server actions are disabled while provisioning is in progress.')
                : provisioningCanRetry
                  ? (zh ? '\u670d\u52a1\u5f00\u901a\u5931\u8d25\uff0c\u8bf7\u5148\u5728\u4e0a\u65b9\u91cd\u8bd5\u5f00\u901a\u3002' : 'Provisioning failed. Retry provisioning before server actions.')
                  : (zh ? '\u670d\u52a1\u5668\u6620\u5c04\u5c1a\u672a\u5b8c\u6210\uff0c\u6682\u4e0d\u53ef\u6267\u884c\u670d\u52a1\u5668\u64cd\u4f5c\u3002' : 'Server mapping is not ready yet, so actions are currently unavailable.')}
            </div>
          ) : null}
          {revealedPassword ? (
            <div className="callout compact">
              <strong>{zh ? '\u4e34\u65f6\u5bc6\u7801\uff1a' : 'Temporary password: '}</strong>
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
