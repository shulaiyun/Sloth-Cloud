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

function normalizeActionName(action: string) {
  return action.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function readActionName(button: Record<string, unknown>) {
  const candidates = [
    button.function,
    button.action,
    button.name,
    button.label,
  ];

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
    if (!name) {
      continue;
    }

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
  if (!rawError) {
    return null;
  }

  const lower = rawError.toLowerCase();
  if (lower.includes('409') || lower.includes('service_convoy_mapping_missing')) {
    return locale.startsWith('zh')
      ? '该服务尚未完成 Convoy 映射，当前不能执行服务器操作。请等待开通完成，或在后台补齐 server_uuid 映射。'
      : 'This service is not mapped to a Convoy server yet. Wait for provisioning to complete or backfill server_uuid mapping.';
  }

  if (lower.includes('service_provisioning_pending')) {
    return locale.startsWith('zh')
      ? '服务正在开通中，请稍后重试。'
      : 'Service provisioning is still in progress. Please try again later.';
  }

  if (lower.includes('service_provisioning_failed')) {
    return locale.startsWith('zh')
      ? '服务开通失败，请在开通状态面板中发起重试。'
      : 'Service provisioning failed. Retry from the provisioning panel.';
  }

  if (lower.includes('convoy integration is disabled') || lower.includes('convoy_disabled')) {
    return locale.startsWith('zh')
      ? 'BFF 未启用 Convoy（CONVOY_ENABLED=false），请联系管理员。'
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
  const {
    data: serverData,
    error: serverError,
    loading: serverLoading,
  } = useApiData<ServiceServerResponse>(serviceId ? `/api/v1/services/${serviceId}/server` : null);
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
      setMessage(locale.startsWith('zh') ? '服务标签已更新。' : 'Service label updated.');
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
      setMessage(locale.startsWith('zh') ? '已提交取消请求。' : 'Cancellation requested.');
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
    if (!serviceId || !actionName) {
      return;
    }

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
          : (locale.startsWith('zh') ? '续费请求已提交。' : 'Renewal request submitted.'),
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setRenewingService(false);
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
        : (locale.startsWith('zh') ? '操作执行成功。' : 'Action completed successfully.');

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
  const zh = locale.startsWith('zh');
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
        ? '开通失败'
        : provisioningStatus === 'success' || provisioningStatus === 'completed'
          ? '开通成功'
          : provisioningStatus
            ? '开通中'
            : '待开通'
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
        <p className="eyebrow">{zh ? '开通状态' : 'Provisioning status'}</p>
        {provisioningLoading ? (
          <div className="loading-card">{text.common.loading}</div>
        ) : provisioningError ? (
          <div className="error-card">{provisioningError}</div>
        ) : (
          <>
            <div className={`callout ${provisioningTone(provisioningStatus) === 'failed' ? 'error-card compact' : 'compact'}`}>
              <strong>{provisioningLabel}</strong>
              {provisioning?.errorMessage ? (
                <p className="muted">{provisioning?.errorMessage}</p>
              ) : null}
              <p className="muted">
                {zh ? '最近尝试' : 'Last attempt'}: {formatDate(provisioning?.lastAttemptAt ?? null)}
                {' · '}
                {zh ? '尝试次数' : 'Attempts'}: {provisioning?.attemptCount ?? 0}
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
                  ? (zh ? '正在重试...' : 'Retrying...')
                  : (zh ? '重试开通' : 'Retry provisioning')}
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
              ? (zh ? '续费处理中...' : 'Renewing...')
              : (zh ? '续费服务' : 'Renew service')}
          </button>
          {!canRenewService ? (
            <p className="muted">
              {provisioningInFlight
                ? (zh ? '服务正在开通中，开通完成后可续费。' : 'Renewal will be available after provisioning completes.')
                : (zh ? '当前服务未开放续费动作。' : 'Renewal action is not available for this service.')}
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
          <p className="eyebrow">{zh ? '服务器信息' : 'Server information'}</p>

          {serverLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : serverError ? (
            <div className="callout">{friendlyServerError(serverError, locale)}</div>
          ) : (
            <div className="detail-grid">
              <div><span>{zh ? '服务器映射' : 'Server ref'}</span><strong>{convoyState.serverRef}</strong></div>
              <div><span>{zh ? '运行状态' : 'State'}</span><strong>{convoyState.state}</strong></div>
              <div><span>{zh ? 'IP 地址' : 'IP address'}</span><strong>{convoyState.ip}</strong></div>
              <div><span>{zh ? '锁定状态' : 'Locked'}</span><strong>{convoyState.locked === null ? '-' : (convoyState.locked ? (zh ? '是' : 'Yes') : (zh ? '否' : 'No'))}</strong></div>
              <div><span>CPU</span><strong>{convoyState.cpu}</strong></div>
              <div><span>{zh ? '内存' : 'Memory'}</span><strong>{convoyState.memory}</strong></div>
              <div><span>{zh ? '磁盘' : 'Disk'}</span><strong>{convoyState.disk}</strong></div>
              <div><span>{zh ? '入站带宽' : 'Inbound bandwidth'}</span><strong>{convoyState.bandwidth}</strong></div>
              <div><span>{zh ? '出站流量' : 'Outbound traffic'}</span><strong>{convoyState.traffic}</strong></div>
            </div>
          )}
        </article>

        <article className="panel stack-12">
          <p className="eyebrow">{zh ? '服务器操作' : 'Server operations'}</p>
          <div className="action-grid">
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('start')}
            >
              {serverBusy === 'start' ? `${text.common.pending}...` : (zh ? '开机' : 'Start')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('stop')}
            >
              {serverBusy === 'stop' ? `${text.common.pending}...` : (zh ? '关机' : 'Stop')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
              type="button"
              onClick={() => void runServerAction('restart')}
            >
              {serverBusy === 'restart' ? `${text.common.pending}...` : (zh ? '重启' : 'Restart')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.reinstall}
              type="button"
              onClick={() => void runServerAction('reinstall')}
            >
              {serverBusy === 'reinstall' ? `${text.common.pending}...` : (zh ? '重装系统' : 'Reinstall')}
            </button>
            <button
              className="button secondary"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.revealPassword}
              type="button"
              onClick={() => void runServerAction('reveal-password')}
            >
              {serverBusy === 'reveal-password' ? `${text.common.pending}...` : (zh ? '显示密码' : 'Reveal password')}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.suspend}
              type="button"
              onClick={() => void runServerAction('suspend')}
            >
              {serverBusy === 'suspend' ? `${text.common.pending}...` : (zh ? '暂停' : 'Suspend')}
            </button>
            <button
              className="button ghost"
              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.unsuspend}
              type="button"
              onClick={() => void runServerAction('unsuspend')}
            >
              {serverBusy === 'unsuspend' ? `${text.common.pending}...` : (zh ? '解除暂停' : 'Unsuspend')}
            </button>
          </div>
          {!canRunServerActions ? (
            <div className="callout compact">
              {provisioningInFlight
                ? (zh ? '服务正在开通中，暂不可执行服务器操作。' : 'Server actions are disabled while provisioning is in progress.')
                : provisioningCanRetry
                  ? (zh ? '服务开通失败，请先在上方重试开通。' : 'Provisioning failed. Retry provisioning before server actions.')
                  : (zh ? '服务器映射尚未完成，暂不可执行服务器操作。' : 'Server mapping is not ready yet, so actions are currently unavailable.')}
            </div>
          ) : null}
          {revealedPassword ? (
            <div className="callout compact">
              <strong>{zh ? '临时密码：' : 'Temporary password: '}</strong>
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
