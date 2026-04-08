import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type {
  ActionResponse,
  ProductDetailResponse,
  ServiceDetail,
  ServiceOperationLogSummary,
  ServiceOperationLogsResponse,
  ServiceProvisioningResponse,
  ServiceProvisioningRetryResponse,
  ServiceRuntimeResponse,
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

type ServiceReinstallOptionsResponse = {
  data: {
    mapped: boolean;
    serverRef: string | null;
    source: 'convoy' | 'product' | 'none';
    defaultTemplateUuid: string | null;
    options: Array<{
      value: string;
      label: string;
      group?: string | null;
    }>;
  };
};

type ManagedRuntimeLogsResponse = {
  data: {
    serviceId: string;
    runtimeKind: string;
    podName: string | null;
    logs: Array<{ line: string }>;
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
  if (value === null) return '-';
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

function serviceStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'active') return zh ? '\u8fd0\u884c\u4e2d' : 'Active';
  if (normalized === 'pending' || normalized === 'provisioning') return zh ? '\u5f00\u901a\u4e2d' : 'Provisioning';
  if (normalized === 'suspended') return zh ? '\u5df2\u6682\u505c' : 'Suspended';
  if (normalized === 'cancelled' || normalized === 'canceled') return zh ? '\u5df2\u53d6\u6d88' : 'Cancelled';
  if (normalized === 'failed') return zh ? '\u5931\u8d25' : 'Failed';
  return zh ? '\u672a\u77e5' : 'Unknown';
}

function serverRuntimeStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'running' || normalized === 'started') return zh ? '\u8fd0\u884c\u4e2d' : 'Running';
  if (normalized === 'stopped' || normalized === 'shutdown' || normalized === 'offline') return zh ? '\u5df2\u5173\u673a' : 'Stopped';
  if (normalized === 'installing' || normalized === 'building') return zh ? '\u5b89\u88c5\u4e2d' : 'Installing';
  if (normalized === 'suspended') return zh ? '\u5df2\u6682\u505c' : 'Suspended';
  if (!normalized || normalized === '-') return '-';
  return status;
}

function managedRuntimeStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'running') return zh ? '\u8fd0\u884c\u4e2d' : 'Running';
  if (normalized === 'queued') return zh ? '\u6392\u961f\u4e2d' : 'Queued';
  if (normalized === 'building') return zh ? '\u6784\u5efa\u4e2d' : 'Building';
  if (normalized === 'pushing') return zh ? '\u63a8\u9001\u955c\u50cf\u4e2d' : 'Pushing image';
  if (normalized === 'deploying') return zh ? '\u90e8\u7f72\u4e2d' : 'Deploying';
  if (normalized === 'retrying') return zh ? '\u91cd\u8bd5\u4e2d' : 'Retrying';
  if (normalized === 'ready') return zh ? '\u53ef\u7528' : 'Ready';
  if (normalized === 'provisioning') return zh ? '\u521b\u5efa\u4e2d' : 'Provisioning';
  if (normalized === 'build_failed' || normalized === 'failed' || normalized.includes('error')) return zh ? '\u5931\u8d25' : 'Failed';
  if (normalized === 'deleting' || normalized === 'deleted') return zh ? '\u5220\u9664\u4e2d' : 'Deleting';
  if (normalized === 'pending') return zh ? '\u7b49\u5f85\u4e2d' : 'Pending';
  if (!normalized || normalized === '-') return '-';
  return status;
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

function findServiceValueFromProperties(service: ServiceDetail | null, keys: string[]) {
  if (!service) return null;

  const normalized = new Set(keys.map((key) => key.toLowerCase()));

  for (const property of service.properties ?? []) {
    const key = property.key?.trim().toLowerCase();
    if (!key || !normalized.has(key)) continue;
    const value = property.value?.trim();
    if (value) return value;
  }

  for (const configEntry of service.configs ?? []) {
    const optionKey = configEntry.option?.envVariable?.trim().toLowerCase();
    if (!optionKey || !normalized.has(optionKey)) continue;

    const value = configEntry.value?.envVariable?.trim() || configEntry.value?.name?.trim();
    if (value) return value;
  }

  return null;
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
  if (normalized === 'success' || normalized === 'completed' || normalized === 'ready') return 'success';
  if (normalized === 'failed' || normalized === 'build_failed') return 'failed';
  return 'pending';
}

function managedProvisioningStageLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'queued') return zh ? '\u5df2\u6392\u961f' : 'Queued';
  if (normalized === 'building') return zh ? '\u6784\u5efa\u4e2d' : 'Building';
  if (normalized === 'pushing') return zh ? '\u955c\u50cf\u63a8\u9001\u4e2d' : 'Pushing image';
  if (normalized === 'deploying') return zh ? '\u90e8\u7f72\u4e2d' : 'Deploying';
  if (normalized === 'ready') return zh ? '\u5df2\u53ef\u7528' : 'Ready';
  if (normalized === 'retrying') return zh ? '\u91cd\u8bd5\u4e2d' : 'Retrying';
  if (normalized === 'deleting') return zh ? '\u5220\u9664\u4e2d' : 'Deleting';
  if (normalized === 'failed') return zh ? '\u5931\u8d25' : 'Failed';
  if (normalized === 'pending' || normalized === 'provisioning') return zh ? '\u5f00\u901a\u4e2d' : 'Provisioning';
  if (!normalized) return zh ? '\u5f85\u5f00\u901a' : 'Pending';
  return managedRuntimeStatusLabel(status, locale);
}

function operationActionLabel(action: string, locale: string) {
  const normalized = action.trim().toLowerCase();
  const zh = locale.startsWith('zh');

  if (normalized === 'cancel') return zh ? '\u53d6\u6d88\u670d\u52a1' : 'Cancel service';
  if (normalized === 'suspend') return zh ? '\u6682\u505c' : 'Suspend';
  if (normalized === 'unsuspend') return zh ? '\u89e3\u9664\u6682\u505c' : 'Unsuspend';
  if (normalized === 'reinstall') return zh ? '\u91cd\u88c5\u7cfb\u7edf' : 'Reinstall';
  if (normalized === 'reveal-password') return zh ? '\u663e\u793a\u5bc6\u7801' : 'Reveal password';
  if (normalized === 'destroy') return zh ? '\u5220\u9664\u5b9e\u4f8b' : 'Delete instance';
  if (normalized === 'start') return zh ? '\u5f00\u673a' : 'Start';
  if (normalized === 'stop' || normalized === 'shutdown') return zh ? '\u5173\u673a' : 'Stop';
  if (normalized === 'restart') return zh ? '\u91cd\u542f' : 'Restart';
  if (normalized === 'renew') return zh ? '\u7eed\u8d39' : 'Renew';

  return action;
}

function operationOutcomeLabel(log: ServiceOperationLogSummary, locale: string) {
  const zh = locale.startsWith('zh');
  if (log.success === true) return zh ? '\u6210\u529f' : 'Success';
  if (log.success === false) return zh ? '\u5931\u8d25' : 'Failed';
  return zh ? '\u5904\u7406\u4e2d' : 'Pending';
}

function managedLogLabel(line: string, locale: string) {
  const zh = locale.startsWith('zh');
  const lower = line.toLowerCase();

  if (lower.includes('build')) {
    return zh ? '\u6784\u5efa' : 'Build';
  }
  if (lower.includes('deploy')) {
    return zh ? '\u90e8\u7f72' : 'Deploy';
  }
  if (lower.includes('push')) {
    return zh ? '\u63a8\u9001' : 'Push';
  }
  if (lower.includes('restart')) {
    return zh ? '\u91cd\u542f' : 'Restart';
  }

  return line;
}

function parseManagedEnvDraft(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      valid: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      value: parsed,
    };
  } catch {
    return { valid: false, value: {} as Record<string, unknown> };
  }
}

export function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { text, locale, formatDate } = useSite();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}?refresh=${refreshNonce}` : null,
  );
  const serviceProductSlug = data?.data.service.product?.slug ?? null;
  const { data: productData } = useApiData<ProductDetailResponse>(
    serviceProductSlug ? `/api/v1/catalog/products/${encodeURIComponent(serviceProductSlug)}?refresh=${refreshNonce}` : null,
  );
  const { data: runtimeData, error: runtimeError, loading: runtimeLoading } = useApiData<ServiceRuntimeResponse>(
    serviceId ? `/api/v1/services/${serviceId}/runtime?refresh=${refreshNonce}` : null,
  );
  const likelyManagedByProduct = (serviceProductSlug ?? '').toLowerCase().includes('app-hosting');
  const runtimeKind = runtimeData?.data.runtime.kind ?? (likelyManagedByProduct ? 'managed-app' : 'vps');
  const isManagedRuntime = runtimeKind === 'managed-app';
  const { data: serverData, error: serverError, loading: serverLoading } = useApiData<ServiceServerResponse>(
    serviceId && !isManagedRuntime ? `/api/v1/services/${serviceId}/server?refresh=${refreshNonce}` : null,
  );
  const {
    data: provisioningData,
    error: provisioningError,
    loading: provisioningLoading,
  } = useApiData<ServiceProvisioningResponse>(serviceId ? `/api/v1/services/${serviceId}/provisioning?refresh=${refreshNonce}` : null);
  const { data: reinstallOptionsData } = useApiData<ServiceReinstallOptionsResponse>(
    serviceId && !isManagedRuntime ? `/api/v1/services/${serviceId}/server/reinstall-options?refresh=${refreshNonce}` : null,
  );
  const { data: managedRuntimeLogs, error: managedRuntimeLogsError, loading: managedRuntimeLogsLoading } = useApiData<ManagedRuntimeLogsResponse>(
    serviceId && isManagedRuntime ? `/api/v1/services/${serviceId}/runtime/logs?limit=120&refresh=${refreshNonce}` : null,
  );
  const { data: operationLogData } = useApiData<ServiceOperationLogsResponse>(
    serviceId ? `/api/v1/services/${serviceId}/operation-logs?limit=8&refresh=${refreshNonce}` : null,
  );

  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState<ServerAction | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverActionError, setServerActionError] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [showStoredPassword, setShowStoredPassword] = useState(false);
  const [renewingService, setRenewingService] = useState(false);
  const [retryingProvisioning, setRetryingProvisioning] = useState(false);
  const [provisioningMessage, setProvisioningMessage] = useState<string | null>(null);
  const [reinstallTemplateChoice, setReinstallTemplateChoice] = useState('');
  const [reinstallPassword, setReinstallPassword] = useState('');
  const [reinstallStartOnCompletion, setReinstallStartOnCompletion] = useState(true);
  const [managedBusy, setManagedBusy] = useState<string | null>(null);
  const [managedMessage, setManagedMessage] = useState<string | null>(null);
  const [managedActionError, setManagedActionError] = useState<string | null>(null);
  const [managedEnvDraft, setManagedEnvDraft] = useState('{}');
  const [managedDomainDraft, setManagedDomainDraft] = useState('');
  const [managedScaleDraft, setManagedScaleDraft] = useState('1');

  const zh = locale.startsWith('zh');

  function refreshPageState(delayMs = 0) {
    window.setTimeout(() => {
      setRefreshNonce((current) => current + 1);
    }, delayMs);
  }

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
      refreshPageState();
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
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
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(`/api/v1/services/${serviceId}/cancel`, {
        method: 'POST',
        body: {
          type: 'end_of_period',
          reason: reason || 'Requested by customer.',
        },
      });
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setMessage(`${response.message || (zh ? '\u5df2\u63d0\u4ea4\u53d6\u6d88\u8bf7\u6c42\u3002' : 'Cancellation requested.')}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
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
        body: {
          force: true,
        },
      });
      setProvisioningMessage(response.message);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
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
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/actions/${encodeURIComponent(actionName)}`,
        {
          method: 'POST',
          body: {},
        },
      );
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setMessage(
        typeof response.message === 'string' && response.message.trim() !== ''
          ? `${response.message}${operationHint}`
          : (zh ? '\u7eed\u8d39\u8bf7\u6c42\u5df2\u63d0\u4ea4\u3002' : 'Renewal request submitted.'),
      );
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
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
      let body: Record<string, unknown> = {};

      if (action === 'start' || action === 'stop' || action === 'restart') {
        path = `/api/v1/services/${serviceId}/server/power`;
        body = { state: action };
      } else if (action === 'reinstall') {
        if (!reinstallReady) {
          setServerActionError(
            zh
              ? '\u8bf7\u5148\u9009\u62e9\u53ef\u7528\u7684\u91cd\u88c5\u6a21\u677f\u540e\u518d\u63d0\u4ea4\u91cd\u88c5\u4efb\u52a1\u3002'
              : 'Please choose a reinstall template before submitting.',
          );
          return;
        }

        const selectedTemplateUuid = reinstallTemplateChoice.trim();
        path = `/api/v1/services/${serviceId}/server/reinstall`;
        body = {
          ...(selectedTemplateUuid !== '' ? { templateUuid: selectedTemplateUuid } : {}),
          ...(reinstallPassword.trim() !== '' ? { accountPassword: reinstallPassword.trim() } : {}),
          startOnCompletion: reinstallStartOnCompletion,
        };
      } else if (action === 'reveal-password') {
        path = `/api/v1/services/${serviceId}/server/reveal-password`;
      } else if (action === 'suspend') {
        path = `/api/v1/services/${serviceId}/server/suspend`;
      } else {
        path = `/api/v1/services/${serviceId}/server/unsuspend`;
      }

      const response = await requestJson<ActionResponse<Record<string, unknown>>>(path, {
        method: 'POST',
        body,
      });
      const responseRecord = asRecord(response.data);
      const upstreamMessage =
        typeof responseRecord.message === 'string' && responseRecord.message.trim() !== ''
          ? responseRecord.message.trim()
          : null;
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      const localizedMessage = {
        start: zh ? '\u5f00\u673a\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Start command submitted.',
        stop: zh ? '\u5173\u673a\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Stop command submitted.',
        restart: zh ? '\u91cd\u542f\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Restart command submitted.',
        reinstall: zh ? '\u91cd\u88c5\u4efb\u52a1\u5df2\u63d0\u4ea4\uff0c\u7cfb\u7edf\u5c06\u5728\u540e\u53f0\u6267\u884c\u3002' : 'Reinstall task submitted. The system will process reinstall in background.',
        'reveal-password': zh ? '\u5df2\u83b7\u53d6\u5bc6\u7801\u4fe1\u606f\u3002' : 'Password information retrieved.',
        suspend: zh ? '\u6682\u505c\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Suspend command submitted.',
        unsuspend: zh ? '\u89e3\u9664\u6682\u505c\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Unsuspend command submitted.',
      } as const;

      if (action === 'reveal-password') {
        const password = extractRevealedPassword(responseRecord);
        if (!password) {
          setServerActionError(
            zh
              ? '\u540e\u7aef\u672a\u8fd4\u56de\u53ef\u663e\u793a\u5bc6\u7801\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u5728\u540e\u53f0\u91cd\u7f6e\u5bc6\u7801\u3002'
              : 'Backend did not return a password. Retry later or rotate password in admin.',
          );
        } else {
          setRevealedPassword(password);
        }
      }

      const displayMessage = upstreamMessage
        ? (zh
          ? `${localizedMessage[action]}\uff08\u7f51\u5173\u8fd4\u56de\uff1a${upstreamMessage}\uff09${operationHint}`
          : `${localizedMessage[action]} (upstream: ${upstreamMessage})${operationHint}`)
        : `${localizedMessage[action]}${operationHint}`;

      setServerMessage(displayMessage);
      refreshPageState();
      if (action !== 'reveal-password') {
        refreshPageState(1200);
      }
    } catch (caughtError) {
      const normalized = toFriendlyError(caughtError as ApiError, locale);
      setServerActionError(friendlyServerError(normalized, locale));
      refreshPageState();
    } finally {
      setServerBusy(null);
    }
  }

  const runtimeSnapshot = runtimeData?.data.runtime ?? null;
  const runtimeCapabilities = runtimeData?.data.capabilities ?? null;

  const managedRuntimeDetails = useMemo(() => {
    const runtime = asRecord(runtimeSnapshot);
    const domain = typeof runtime.domain === 'string' ? runtime.domain : '';
    const tlsStatus = typeof runtime.tlsStatus === 'string' ? runtime.tlsStatus : '';
    const envJson = typeof runtime.envJson === 'string' ? runtime.envJson : '{}';
    const replicas = Number(runtime.replicas ?? 1);

    return {
      domain,
      tlsStatus,
      envJson,
      replicas: Number.isFinite(replicas) ? Math.max(1, Math.trunc(replicas)) : 1,
    };
  }, [runtimeSnapshot]);

  useEffect(() => {
    if (!isManagedRuntime) {
      return;
    }

    setManagedEnvDraft(() => {
      try {
        const parsed = JSON.parse(managedRuntimeDetails.envJson) as Record<string, unknown>;
        return JSON.stringify(parsed, null, 2);
      } catch {
        return '{}';
      }
    });
    setManagedDomainDraft(managedRuntimeDetails.domain);
    setManagedScaleDraft(String(managedRuntimeDetails.replicas));
  }, [isManagedRuntime, managedRuntimeDetails.domain, managedRuntimeDetails.envJson, managedRuntimeDetails.replicas]);

  async function runManagedAction(action: 'restart' | 'delete') {
    if (!serviceId) return;

    setManagedBusy(action);
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/actions/${encodeURIComponent(action)}`,
        {
          method: 'POST',
          body: {
            payload: {},
          },
        },
      );

      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      const fallback = action === 'restart'
        ? (zh ? '\u5e94\u7528\u91cd\u542f\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Application restart submitted.')
        : (zh ? '\u5b9e\u4f8b\u5220\u9664\u6307\u4ee4\u5df2\u63d0\u4ea4\u3002' : 'Instance deletion submitted.');

      setManagedMessage(`${response.message || fallback}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function saveManagedEnv() {
    if (!serviceId) return;

    const parsedDraft = parseManagedEnvDraft(managedEnvDraft);
    if (!parsedDraft.valid) {
      setManagedActionError(zh ? '\u73af\u5883\u53d8\u91cf JSON \u683c\u5f0f\u4e0d\u6b63\u786e\u3002' : 'Environment variables JSON is invalid.');
      return;
    }

    const parsed = Object.fromEntries(
      Object.entries(parsedDraft.value).map(([key, value]) => [key, String(value ?? '')]),
    );

    setManagedBusy('env');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/env`,
        {
          method: 'PATCH',
          body: {
            env: parsed,
          },
        },
      );
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setManagedMessage(`${response.message || (zh ? '\u73af\u5883\u53d8\u91cf\u5df2\u66f4\u65b0\u3002' : 'Environment variables updated.')}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function saveManagedDomain() {
    if (!serviceId) return;

    const domain = managedDomainDraft.trim();
    if (!domain) {
      setManagedActionError(zh ? '\u8bf7\u8f93\u5165\u57df\u540d\u3002' : 'Please enter a domain name.');
      return;
    }

    setManagedBusy('domain');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/domain`,
        {
          method: 'POST',
          body: {
            domain,
          },
        },
      );
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setManagedMessage(`${response.message || (zh ? '\u57df\u540d\u7ed1\u5b9a\u5df2\u63d0\u4ea4\u3002' : 'Domain binding submitted.')}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function enableManagedTls() {
    if (!serviceId) return;

    const domain = managedDomainDraft.trim() || managedRuntimeDetails.domain;
    if (!domain) {
      setManagedActionError(zh ? '\u8bf7\u5148\u7ed1\u5b9a\u57df\u540d\u518d\u5f00\u542f HTTPS\u3002' : 'Bind a domain before enabling HTTPS.');
      return;
    }

    setManagedBusy('tls');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/tls`,
        {
          method: 'POST',
          body: {
            domain,
          },
        },
      );
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setManagedMessage(`${response.message || (zh ? 'HTTPS \u914d\u7f6e\u5df2\u63d0\u4ea4\u3002' : 'HTTPS configuration submitted.')}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function scaleManagedRuntime() {
    if (!serviceId) return;

    const replicas = Number(managedScaleDraft);
    if (!Number.isFinite(replicas) || replicas < 1) {
      setManagedActionError(zh ? '\u6269\u5bb9\u526f\u672c\u6570\u5fc5\u987b\u662f\u5927\u4e8e 0 \u7684\u6574\u6570\u3002' : 'Replica count must be an integer greater than 0.');
      return;
    }

    setManagedBusy('scale');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/scale`,
        {
          method: 'POST',
          body: {
            replicas: Math.trunc(replicas),
          },
        },
      );
      const operationHint = response.actionResult?.operationId
        ? (zh ? ` \u64cd\u4f5c ID: ${response.actionResult.operationId}` : ` Operation ID: ${response.actionResult.operationId}`)
        : '';
      setManagedMessage(`${response.message || (zh ? '\u6269\u5bb9\u8bf7\u6c42\u5df2\u63d0\u4ea4\u3002' : 'Scaling request submitted.')}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
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
    const inboundBytes = pickNumber(convoy, [
      'resource_usage.network_rx_bytes',
      'usage.network_rx_bytes',
      'stats.network_rx_bytes',
      'attributes.metrics.network_rx_bytes',
      'usages.bandwidth.inbound_bytes',
      'usages.bandwidth.rx_bytes',
      'usages.bandwidth.in',
      'network.inbound_bytes',
      'network.rx_bytes',
    ]);
    const outboundBytes = pickNumber(convoy, [
      'resource_usage.network_tx_bytes',
      'usage.network_tx_bytes',
      'stats.network_tx_bytes',
      'attributes.metrics.network_tx_bytes',
      'usages.bandwidth.outbound_bytes',
      'usages.bandwidth.tx_bytes',
      'usages.bandwidth.out',
      'network.outbound_bytes',
      'network.tx_bytes',
    ]);
    const totalBandwidthBytes = pickNumber(convoy, [
      'usages.bandwidth.total_bytes',
      'usages.bandwidth.total',
      'limits.bandwidth',
      'bandwidth_limit',
    ]);

    return {
      serverRef: serverData?.data.mapping.serverRef ?? '-',
      state: pickString(convoy, ['status', 'state', 'power_state', 'attributes.status']) ?? '-',
      ip: pickString(convoy, [
        'primary_ip',
        'ip',
        'address',
        'attributes.ip',
        'allocations.0.ip',
        'limits.addresses.ipv4.0.address',
        'limits.addresses.ipv6.0.address',
        'limits.addresses.0.address',
      ]) ?? '-',
      cpu: formatPercent(pickNumber(convoy, [
        'resource_usage.cpu',
        'usage.cpu',
        'stats.cpu',
        'attributes.metrics.cpu',
        'limits.cpu',
      ])),
      memory: formatBytes(pickNumber(convoy, ['resource_usage.memory_bytes', 'usage.memory_bytes', 'stats.memory_bytes', 'attributes.metrics.memory_bytes', 'limits.memory'])),
      disk: formatBytes(pickNumber(convoy, ['resource_usage.disk_bytes', 'usage.disk_bytes', 'stats.disk_bytes', 'attributes.metrics.disk_bytes', 'limits.disk'])),
      bandwidth: formatBytes(inboundBytes ?? totalBandwidthBytes),
      traffic: formatBytes(outboundBytes ?? totalBandwidthBytes),
      locked: pickBoolean(convoy, ['locked', 'attributes.locked']),
    };
  }, [serverData]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  const { service, invoices } = data.data;
  const serviceButtons = (data.data.actions?.buttons ?? []) as Array<Record<string, unknown>>;
  const provisioning = provisioningData?.data.latest ?? null;
  const provisioningStatus = (provisioning?.status ?? '').toLowerCase();
  const provisioningCanRetry = provisioningStatus === 'failed';
  const provisioningCanStart = provisioningStatus === '' || provisioning === null;
  const provisioningInFlight = provisioningStatus === 'pending' || provisioningStatus === 'provisioning';
  const renewActionName = findActionName(serviceButtons, ['renew', 'extend', 'recurring', 'cycle']);
  const canRenewService = renewActionName !== null && !provisioningInFlight;
  const canCancelService = service.cancellable && !provisioningInFlight;
  const canRunServerActions = !isManagedRuntime && !serverLoading && !serverError && !provisioningInFlight && !provisioningCanRetry;

  const defaultTemplateUuid = reinstallOptionsData?.data.defaultTemplateUuid
    ?? findServiceValueFromProperties(service, ['template_uuid', 'convoy_template_uuid', 'os', 'image']);
  const effectiveTemplateUuid =
    reinstallTemplateChoice.trim() !== ''
      ? reinstallTemplateChoice.trim()
      : (defaultTemplateUuid ?? '');
  const reinstallReady = effectiveTemplateUuid !== '';

  const reinstallTemplateOptions: Array<{ value: string; label: string }> = [];
  const seenTemplateValues = new Set<string>();
  for (const option of reinstallOptionsData?.data.options ?? []) {
    const value = (option.value || '').trim();
    if (!value || seenTemplateValues.has(value)) {
      continue;
    }

    seenTemplateValues.add(value);
    const rawLabel = localizeText(option.label, locale, option.label);
    const groupLabel = option.group ? localizeText(option.group, locale, option.group) : '';
    reinstallTemplateOptions.push({
      value,
      label: groupLabel ? `${groupLabel} / ${rawLabel}` : rawLabel,
    });
  }

  for (const option of productData?.data.operatingSystemOptions ?? []) {
    for (const choice of option.children) {
      const value = (choice.envVariable || choice.id || '').trim();
      if (!value || seenTemplateValues.has(value)) {
        continue;
      }

      seenTemplateValues.add(value);
      reinstallTemplateOptions.push({
        value,
        label: localizeText(choice.name, locale, choice.name),
      });
    }
  }

  if (defaultTemplateUuid && !seenTemplateValues.has(defaultTemplateUuid)) {
    reinstallTemplateOptions.unshift({
      value: defaultTemplateUuid,
      label: zh ? '\u5f53\u524d\u670d\u52a1\u9ed8\u8ba4\u6a21\u677f' : 'Current service default template',
    });
  }

  const fallbackIp = findServiceValueFromProperties(service, ['ip', 'ipv4', 'address', 'primary_ip']);
  const fallbackCpu = findServiceValueFromProperties(service, ['cpu', 'vcpu', 'cores']);
  const fallbackMemory = findServiceValueFromProperties(service, ['memory', 'ram']);
  const fallbackDisk = findServiceValueFromProperties(service, ['disk', 'storage']);
  const fallbackBandwidth = findServiceValueFromProperties(service, ['bandwidth', 'network_in', 'inbound_bandwidth']);
  const fallbackTraffic = findServiceValueFromProperties(service, ['traffic', 'network_out', 'outbound_traffic']);
  const storedPassword = findServiceValueFromProperties(service, ['password', 'root_password', 'account_password']);
  const serverStateLabel = serverRuntimeStatusLabel(convoyState.state, locale);
  const displayIp = convoyState.ip !== '-' ? convoyState.ip : (fallbackIp ?? '-');
  const displayCpu = convoyState.cpu !== '-' ? convoyState.cpu : (fallbackCpu ?? '-');
  const displayMemory = convoyState.memory !== '-' ? convoyState.memory : (fallbackMemory ?? '-');
  const displayDisk = convoyState.disk !== '-' ? convoyState.disk : (fallbackDisk ?? '-');
  const displayBandwidth = convoyState.bandwidth !== '-' ? convoyState.bandwidth : (fallbackBandwidth ?? '-');
  const displayTraffic = convoyState.traffic !== '-' ? convoyState.traffic : (fallbackTraffic ?? '-');
  const recentOperationLogs = operationLogData?.data.logs ?? [];
  const managedRuntimeLogsLines = managedRuntimeLogs?.data.logs ?? [];
  const managedRuntimeRef = runtimeSnapshot?.runtimeRef ?? '-';
  const managedRuntimeStatus = managedRuntimeStatusLabel(runtimeSnapshot?.status ?? service.status, locale);
  const managedEndpoint = runtimeSnapshot?.endpoint ?? '-';
  const managedTlsStatus = managedRuntimeDetails.tlsStatus || '-';
  const managedReplicaLimit = Number(findServiceValueFromProperties(service, ['replica_limit']) ?? '1');
  const managedCanRestart = Boolean(runtimeCapabilities?.actions.restart);
  const managedCanDelete = Boolean(runtimeCapabilities?.actions.delete);
  const managedCanEnv = Boolean(runtimeCapabilities?.env);
  const managedCanDomain = Boolean(runtimeCapabilities?.domain);
  const managedCanTls = Boolean(runtimeCapabilities?.tls);
  const managedCanScale = Boolean(runtimeCapabilities?.scale);

  const provisioningLabel = isManagedRuntime
    ? managedProvisioningStageLabel(provisioningStatus, locale)
    : (
      zh
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
        )
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
              {provisioning?.errorCode ? <p className="muted">{zh ? '\u9519\u8bef\u7f16\u53f7' : 'Error code'}: {provisioning.errorCode}</p> : null}
              <p className="muted">
                {zh ? '\u6700\u8fd1\u5c1d\u8bd5' : 'Last attempt'}: {formatDate(provisioning?.lastAttemptAt ?? null)}
                {' | '}
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
              <strong>
                <span className={`status-pill ${statusClassName(service.status)}`}>
                  {serviceStatusLabel(service.status, locale)}
                </span>
              </strong>
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
            <input
              className="text-input"
              disabled={!canCancelService}
              placeholder={canCancelService ? (zh ? '\u586b\u5199\u53d6\u6d88\u539f\u56e0\uff08\u53ef\u9009\uff09' : 'Optional cancellation reason') : ''}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="button danger" disabled={pending || !canCancelService} type="button" onClick={() => void cancelService()}>
            {text.services.cancel}
          </button>
          {!canCancelService ? (
            <p className="muted">
              {provisioningInFlight
                ? (zh ? '\u670d\u52a1\u6b63\u5728\u5f00\u901a\u4e2d\uff0c\u6682\u65f6\u4e0d\u53ef\u53d6\u6d88\u3002' : 'Cancellation is disabled while provisioning is in progress.')
                : (zh ? '\u5f53\u524d\u670d\u52a1\u72b6\u6001\u4e0d\u652f\u6301\u53d6\u6d88\u64cd\u4f5c\u3002' : 'Cancellation is unavailable for the current service state.')}
            </p>
          ) : null}

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

      {isManagedRuntime ? (
        <section className="two-column">
          <article className="panel stack-16">
            <p className="eyebrow">{zh ? '\u5e94\u7528\u5b9e\u4f8b\u4fe1\u606f' : 'Application instance'}</p>
            {runtimeLoading ? (
              <div className="loading-card">{text.common.loading}</div>
            ) : runtimeError ? (
              <div className="error-card">{runtimeError}</div>
            ) : (
              <div className="detail-grid">
                <div><span>{zh ? '\u5b9e\u4f8b\u5f15\u7528' : 'Instance ref'}</span><strong>{managedRuntimeRef}</strong></div>
                <div><span>{zh ? '\u8fd0\u884c\u72b6\u6001' : 'Status'}</span><strong>{managedRuntimeStatus}</strong></div>
                <div><span>{zh ? '\u8bbf\u95ee\u5730\u5740' : 'Endpoint'}</span><strong>{managedEndpoint}</strong></div>
                <div><span>{zh ? '\u57df\u540d' : 'Domain'}</span><strong>{managedRuntimeDetails.domain || '-'}</strong></div>
                <div><span>HTTPS</span><strong>{managedTlsStatus}</strong></div>
                <div><span>{zh ? '\u526f\u672c\u6570' : 'Replicas'}</span><strong>{managedRuntimeDetails.replicas}</strong></div>
                <div><span>{zh ? '\u6700\u540e\u90e8\u7f72' : 'Last deploy'}</span><strong>{formatDate(runtimeSnapshot?.lastDeployAt ?? null)}</strong></div>
              </div>
            )}
          </article>

          <article className="panel stack-12">
            <p className="eyebrow">{zh ? '\u5e94\u7528\u63a7\u5236\u53f0' : 'Application controls'}</p>
            <div className="action-grid">
              <button
                className="button secondary"
                disabled={managedBusy !== null || !managedCanRestart || provisioningInFlight}
                type="button"
                onClick={() => void runManagedAction('restart')}
              >
                {managedBusy === 'restart' ? `${text.common.pending}...` : (zh ? '\u91cd\u542f\u5e94\u7528' : 'Restart app')}
              </button>
              <button
                className="button danger"
                disabled={managedBusy !== null || !managedCanDelete || provisioningInFlight}
                type="button"
                onClick={() => void runManagedAction('delete')}
              >
                {managedBusy === 'delete' ? `${text.common.pending}...` : (zh ? '\u5220\u9664\u5b9e\u4f8b' : 'Delete instance')}
              </button>
            </div>

            <label className="field">
              <span>{zh ? '\u73af\u5883\u53d8\u91cf (JSON)' : 'Environment variables (JSON)'}</span>
              <textarea
                className="text-input"
                rows={8}
                value={managedEnvDraft}
                onChange={(event) => setManagedEnvDraft(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={managedBusy !== null || !managedCanEnv || provisioningInFlight}
              type="button"
              onClick={() => void saveManagedEnv()}
            >
                {managedBusy === 'env' ? `${text.common.pending}...` : (zh ? '\u66f4\u65b0\u73af\u5883\u53d8\u91cf' : 'Update env')}
            </button>

            <label className="field">
              <span>{zh ? '\u7ed1\u5b9a\u57df\u540d' : 'Domain binding'}</span>
              <input
                className="text-input"
                value={managedDomainDraft}
                onChange={(event) => setManagedDomainDraft(event.target.value)}
              />
            </label>
            <div className="action-grid">
              <button
                className="button secondary"
                disabled={managedBusy !== null || !managedCanDomain || provisioningInFlight}
                type="button"
                onClick={() => void saveManagedDomain()}
              >
                {managedBusy === 'domain' ? `${text.common.pending}...` : (zh ? '\u4fdd\u5b58\u57df\u540d' : 'Save domain')}
              </button>
              <button
                className="button ghost"
                disabled={managedBusy !== null || !managedCanTls || provisioningInFlight}
                type="button"
                onClick={() => void enableManagedTls()}
              >
                {managedBusy === 'tls' ? `${text.common.pending}...` : (zh ? '\u5f00\u542f HTTPS' : 'Enable HTTPS')}
              </button>
            </div>

            <label className="field">
              <span>{zh ? '\u6269\u5bb9\u526f\u672c' : 'Scale replicas'}</span>
              <input
                className="text-input"
                type="number"
                min={1}
                max={Number.isFinite(managedReplicaLimit) && managedReplicaLimit > 0 ? managedReplicaLimit : undefined}
                value={managedScaleDraft}
                onChange={(event) => setManagedScaleDraft(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={managedBusy !== null || !managedCanScale || provisioningInFlight}
              type="button"
              onClick={() => void scaleManagedRuntime()}
            >
              {managedBusy === 'scale' ? `${text.common.pending}...` : (zh ? '\u6267\u884c\u6269\u5bb9' : 'Apply scale')}
            </button>
            <p className="muted">
              {zh
                ? `\u5957\u9910\u526f\u672c\u4e0a\u9650\uff1a${Number.isFinite(managedReplicaLimit) ? managedReplicaLimit : 1}`
                : `Plan replica limit: ${Number.isFinite(managedReplicaLimit) ? managedReplicaLimit : 1}`}
            </p>

            {managedMessage ? <div className="callout compact">{managedMessage}</div> : null}
            {managedActionError ? <div className="error-card">{managedActionError}</div> : null}
          </article>
        </section>
      ) : (
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
                <div><span>{zh ? '\u8fd0\u884c\u72b6\u6001' : 'State'}</span><strong>{serverStateLabel}</strong></div>
                <div><span>{zh ? 'IP \u5730\u5740' : 'IP address'}</span><strong>{displayIp}</strong></div>
                <div><span>{zh ? '\u9501\u5b9a\u72b6\u6001' : 'Locked'}</span><strong>{convoyState.locked === null ? '-' : (convoyState.locked ? (zh ? '\u662f' : 'Yes') : (zh ? '\u5426' : 'No'))}</strong></div>
                <div><span>CPU</span><strong>{displayCpu}</strong></div>
                <div><span>{zh ? '\u5185\u5b58' : 'Memory'}</span><strong>{displayMemory}</strong></div>
                <div><span>{zh ? '\u78c1\u76d8' : 'Disk'}</span><strong>{displayDisk}</strong></div>
                <div><span>{zh ? '\u5165\u7ad9\u5e26\u5bbd' : 'Inbound bandwidth'}</span><strong>{displayBandwidth}</strong></div>
                <div><span>{zh ? '\u51fa\u7ad9\u6d41\u91cf' : 'Outbound traffic'}</span><strong>{displayTraffic}</strong></div>
              </div>
            )}

            {storedPassword ? (
              <div className="callout compact">
                <div className="stack-8">
                  <strong>{zh ? '\u521d\u59cb\u5bc6\u7801' : 'Initial password'}</strong>
                  <code>{showStoredPassword ? storedPassword : '************'}</code>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setShowStoredPassword((current) => !current)}
                  >
                    {showStoredPassword
                      ? (zh ? '\u9690\u85cf\u5bc6\u7801' : 'Hide password')
                      : (zh ? '\u663e\u793a\u5bc6\u7801' : 'Show password')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="callout compact">
                {zh
                  ? '\u5f53\u524d\u672a\u4fdd\u5b58\u53ef\u663e\u793a\u7684\u521d\u59cb\u5bc6\u7801\uff0c\u53ef\u70b9\u51fb\u201c\u663e\u793a\u5bc6\u7801\u201d\u4ece\u63a7\u5236\u7aef\u5237\u65b0\u3002'
                  : 'No stored initial password. Use "Reveal password" to fetch a new one from backend.'}
              </div>
            )}
          </article>

          <article className="panel stack-12">
            <p className="eyebrow">{zh ? '\u670d\u52a1\u5668\u64cd\u4f5c' : 'Server operations'}</p>
            <label className="field">
              <span>{zh ? '\u91cd\u88c5\u6a21\u677f' : 'Reinstall template'}</span>
              <select
                className="text-input select-input"
                value={reinstallTemplateChoice}
                onChange={(event) => setReinstallTemplateChoice(event.target.value)}
              >
                <option value="">{zh ? '\u4f7f\u7528\u9ed8\u8ba4\u6a21\u677f' : 'Use default template'}</option>
                {reinstallTemplateOptions.map((template) => (
                  <option key={template.value} value={template.value}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{zh ? '\u91cd\u88c5\u5bc6\u7801\uff08\u7559\u7a7a\u81ea\u52a8\u751f\u6210\uff09' : 'Reinstall password (leave blank to auto-generate)'}</span>
              <input
                className="text-input"
                value={reinstallPassword}
                onChange={(event) => setReinstallPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{zh ? '\u91cd\u88c5\u5b8c\u6210\u540e\u81ea\u52a8\u5f00\u673a' : 'Start on completion'}</span>
              <div className="callout compact">
                <input
                  checked={reinstallStartOnCompletion}
                  onChange={(event) => setReinstallStartOnCompletion(event.target.checked)}
                  type="checkbox"
                />
              </div>
            </label>

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
                disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.reinstall || !reinstallReady}
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
            {canRunServerActions && !reinstallReady ? (
              <div className="callout compact">
                {zh
                  ? '\u5f53\u524d\u670d\u52a1\u672a\u63d0\u4f9b\u53ef\u7528\u7684\u91cd\u88c5\u6a21\u677f\uff0c\u91cd\u88c5\u529f\u80fd\u5df2\u7981\u7528\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u8865\u5145\u6a21\u677f\u6620\u5c04\u3002'
                  : 'No reinstall template is available for this service. Reinstall is disabled until an admin maps a template.'}
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
      )}

      {isManagedRuntime ? (
        <section className="panel stack-12">
          <p className="eyebrow">{zh ? '\u5e94\u7528\u65e5\u5fd7' : 'Application logs'}</p>
          {managedRuntimeLogsLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : managedRuntimeLogsError ? (
            <div className="error-card">{managedRuntimeLogsError}</div>
          ) : managedRuntimeLogsLines.length === 0 ? (
            <div className="callout compact">
              {zh ? '\u5f53\u524d\u6682\u65e0\u53ef\u7528\u5e94\u7528\u65e5\u5fd7\u3002' : 'No application logs are available yet.'}
            </div>
          ) : (
            <div className="stack-8">
              {managedRuntimeLogsLines.map((entry, index) => (
                <code key={`${index}-${entry.line}`}>{managedLogLabel(entry.line, locale)}</code>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="panel stack-12">
        <p className="eyebrow">{zh ? '\u6700\u8fd1\u64cd\u4f5c\u65e5\u5fd7' : 'Recent operation logs'}</p>
        {recentOperationLogs.length === 0 ? (
          <div className="callout compact">
            {zh ? '\u6682\u65e0\u64cd\u4f5c\u8bb0\u5f55\u3002' : 'No operation logs yet.'}
          </div>
        ) : recentOperationLogs.map((log) => (
          <div className="operation-log" key={log.operationId || log.id}>
            <div className="operation-log__header">
              <strong>{operationActionLabel(log.action, locale)}</strong>
              <span className={`status-pill ${log.success === true ? 'status-active' : log.success === false ? 'status-cancelled' : 'status-pending'}`}>
                {operationOutcomeLabel(log, locale)}
              </span>
            </div>
            <p className="muted">
              {formatDate(log.createdAt)}
              {log.operationId ? ` | ${zh ? '\u64cd\u4f5c ID' : 'Operation ID'}: ${log.operationId}` : ''}
            </p>
            {log.message ? <p>{log.message}</p> : null}
            {log.code ? <p className="muted">{zh ? '\u9519\u8bef\u7f16\u53f7' : 'Error code'}: {log.code}</p> : null}
            {log.detail && log.detail !== log.message ? <p className="muted">{log.detail}</p> : null}
          </div>
        ))}
      </section>

      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
