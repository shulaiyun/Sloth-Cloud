import { config as loadEnv } from 'dotenv';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createConvoyClient } from './lib/convoy.js';
import { createGateway, GatewayError, type CreateServiceOperationLogInput } from './lib/paymenter.js';
import { createManagedAppRuntimeManager, ManagedAppRuntimeError, type ServiceInput } from './lib/runtime/managed-app.js';
import { SessionStore } from './lib/session-store.js';
import type { ServiceDetail } from './lib/types.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: resolve(currentDir, '../.env'),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  PAYMENTER_MODE: z.enum(['mock', 'live']).default('live'),
  PAYMENTER_API_URL: z.string().url().optional(),
  PAYMENTER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  SESSION_COOKIE_NAME: z.string().min(1).default('sloth_sid'),
  SESSION_COOKIE_SECURE: z.string().optional().default('false'),
  CONVOY_ENABLED: z.string().optional().default('false'),
  CONVOY_MODE: z.enum(['mock', 'live']).default('live'),
  CONVOY_BASE_URL: z.string().url().optional(),
  CONVOY_APPLICATION_KEY: z.string().optional(),
  CONVOY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CONVOY_APPLICATION_PREFIX: z.string().min(1).default('/api/application'),
  CONVOY_SERVER_REF_KEYS: z.string().optional().default('convoy_server_uuid,convoy_server_id,convoy_server_short_id,server_uuid'),
  MANAGED_APP_ENABLED: z.string().optional().default('false'),
  MANAGED_APP_DRIVER: z.enum(['contract', 'kubeconfig', 'in-cluster']).default('contract'),
  MANAGED_APP_KUBECONFIG_PATH: z.string().optional(),
  MANAGED_APP_DEFAULT_CLUSTER_REF: z.string().min(1).default('default'),
  MANAGED_APP_NAMESPACE_PREFIX: z.string().min(1).default('app'),
  MANAGED_APP_INTERNAL_API_TOKEN: z.string().optional(),
  MANAGED_APP_BUILD_NAMESPACE: z.string().optional(),
  MANAGED_APP_BUILDKIT_IMAGE: z.string().optional().default('moby/buildkit:rootless'),
  MANAGED_APP_GIT_CLONE_IMAGE: z.string().optional().default('alpine/git:2.45.2'),
  MANAGED_APP_IMAGE_REGISTRY: z.string().optional(),
  MANAGED_APP_IMAGE_REPOSITORY_PREFIX: z.string().min(1).default('sloth-managed-apps'),
  MANAGED_APP_REGISTRY_AUTH_JSON: z.string().optional(),
  MANAGED_APP_INGRESS_CLASS: z.string().optional(),
  MANAGED_APP_DEFAULT_DOMAIN_SUFFIX: z.string().optional(),
  MANAGED_APP_CERT_ISSUER: z.string().optional(),
  MANAGED_APP_STORAGE_CLASS: z.string().optional(),
});

const env = envSchema.parse(process.env);
const effectivePaymenterMode = process.env.NODE_ENV === 'production' && env.PAYMENTER_MODE === 'mock'
  ? 'live'
  : env.PAYMENTER_MODE;
const isSecureCookie = env.SESSION_COOKIE_SECURE.toLowerCase() === 'true';
const convoyEnabled = env.CONVOY_ENABLED.toLowerCase() === 'true';
const convoyRefKeys = env.CONVOY_SERVER_REF_KEYS.split(',')
  .map((key) => key.trim())
  .filter((key) => key.length > 0);
const convoyRefKeysLower = convoyRefKeys.map((key) => key.toLowerCase());
const managedAppEnabled = env.MANAGED_APP_ENABLED.toLowerCase() === 'true';
const runtimeContractVersion = '2026-04-pr4';

const app = Fastify({
  logger: true,
});

const managedAppRuntime = createManagedAppRuntimeManager({
  enabled: managedAppEnabled,
  driver: env.MANAGED_APP_DRIVER,
  kubeconfigPath: env.MANAGED_APP_KUBECONFIG_PATH,
  defaultClusterRef: env.MANAGED_APP_DEFAULT_CLUSTER_REF,
  namespacePrefix: env.MANAGED_APP_NAMESPACE_PREFIX,
  buildNamespace: env.MANAGED_APP_BUILD_NAMESPACE,
  buildkitImage: env.MANAGED_APP_BUILDKIT_IMAGE,
  gitCloneImage: env.MANAGED_APP_GIT_CLONE_IMAGE,
  imageRegistry: env.MANAGED_APP_IMAGE_REGISTRY,
  imageRepositoryPrefix: env.MANAGED_APP_IMAGE_REPOSITORY_PREFIX,
  registryAuthJson: env.MANAGED_APP_REGISTRY_AUTH_JSON,
  ingressClass: env.MANAGED_APP_INGRESS_CLASS,
  defaultDomainSuffix: env.MANAGED_APP_DEFAULT_DOMAIN_SUFFIX,
  certIssuer: env.MANAGED_APP_CERT_ISSUER,
  storageClass: env.MANAGED_APP_STORAGE_CLASS,
  logger: app.log,
});

app.log.info({
  paymenterMode: effectivePaymenterMode,
  configuredPaymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
  convoyEnabled,
  convoyBaseUrl: env.CONVOY_BASE_URL ?? null,
  managedAppEnabled,
  managedAppDriver: env.MANAGED_APP_DRIVER,
}, 'Sloth Cloud API environment loaded');

await app.register(cors, {
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

await app.register(fastifyCookie, {
  hook: 'onRequest',
});

const gateway = createGateway({
  apiUrl: env.PAYMENTER_API_URL,
  mode: effectivePaymenterMode,
  timeoutMs: env.PAYMENTER_TIMEOUT_MS,
});
const convoy = createConvoyClient({
  enabled: convoyEnabled,
  mode: env.CONVOY_MODE,
  baseUrl: env.CONVOY_BASE_URL,
  applicationKey: env.CONVOY_APPLICATION_KEY,
  timeoutMs: env.CONVOY_TIMEOUT_MS,
  applicationPrefix: env.CONVOY_APPLICATION_PREFIX,
});

const sessionStore = new SessionStore(env.SESSION_TTL_SECONDS * 1000);
const cleanupTimer = setInterval(() => sessionStore.cleanup(), 5 * 60 * 1000);
cleanupTimer.unref();

function resolveToken(request: FastifyRequest) {
  const sessionId = request.cookies[env.SESSION_COOKIE_NAME];
  return sessionStore.get(sessionId)?.accessToken;
}

function writeSession(reply: FastifyReply, accessToken: string) {
  const sessionId = sessionStore.create(accessToken);
  reply.setCookie(env.SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie,
    maxAge: env.SESSION_TTL_SECONDS,
  });
}

function clearSession(request: FastifyRequest, reply: FastifyReply) {
  sessionStore.destroy(request.cookies[env.SESSION_COOKIE_NAME]);
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: 'lax',
    secure: isSecureCookie,
  });
}

function requireToken(request: FastifyRequest) {
  const token = resolveToken(request);
  if (!token) {
    throw new GatewayError('Authentication is required.', 401, {
      message: 'Authentication is required.',
    });
  }

  return token;
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableStringValue(value: unknown) {
  const normalized = getStringValue(value);
  return normalized !== '' ? normalized : null;
}

function asRecordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

type ActionResultPayload = {
  success: boolean;
  code: string | null;
  detail: string | null;
  operationId: string | null;
};

function readActionName(action: Record<string, unknown>) {
  const candidates = [
    getStringValue(action.function),
    getStringValue(action.action),
    getStringValue(action.name),
    getStringValue(action.label),
  ];

  return candidates.find((entry) => entry !== '') ?? '';
}

function normalizeActionValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function findActionName(
  buttons: Array<Record<string, unknown>>,
  aliases: readonly string[],
) {
  const normalizedAliases = aliases.map((alias) => normalizeActionValue(alias));

  for (const button of buttons) {
    const actionName = readActionName(button);
    if (!actionName) {
      continue;
    }

    const normalizedAction = normalizeActionValue(actionName);
    if (normalizedAliases.some((alias) => normalizedAction.includes(alias))) {
      return actionName;
    }
  }

  return null;
}

function sanitizeExposedButtons(buttons: Array<Record<string, unknown>>) {
  return buttons.filter((button) => {
    const actionName = readActionName(button);
    if (!actionName) {
      return false;
    }

    const normalized = normalizeActionValue(actionName);

    // Never expose direct panel/SOO links to frontend clients.
    if (
      normalized.includes('sso')
      || normalized.includes('go-to-server')
      || normalized.includes('panel')
      || normalized.includes('open-url')
      || normalized.includes('console-url')
      || normalized.includes('login-url')
    ) {
      return false;
    }

    return true;
  });
}

function resolveConvoyServerRef(service: ServiceDetail) {
  const propertyMap = new Map<string, string>();
  for (const property of service.properties ?? []) {
    if (!property?.key) {
      continue;
    }
    const value = getStringValue(property.value);
    if (value !== '') {
      propertyMap.set(property.key.toLowerCase(), value);
    }
  }

  for (const key of convoyRefKeys) {
    const hit = propertyMap.get(key.toLowerCase());
    if (hit) {
      return hit;
    }
  }

  for (const configEntry of service.configs ?? []) {
    const optionKey = getStringValue(configEntry.option?.envVariable).toLowerCase();
    if (!optionKey) {
      continue;
    }
    if (!convoyRefKeysLower.includes(optionKey)) {
      continue;
    }

    const value = getStringValue(configEntry.value?.envVariable) || getStringValue(configEntry.value?.name);
    if (value !== '') {
      return value;
    }
  }

  return null;
}

function findServicePropertyValue(service: ServiceDetail, keys: readonly string[]) {
  const normalized = new Set(keys.map((key) => key.toLowerCase()));

  for (const property of service.properties ?? []) {
    const key = getStringValue(property?.key).toLowerCase();
    if (!key || !normalized.has(key)) {
      continue;
    }

    const value = getStringValue(property?.value);
    if (value) {
      return value;
    }
  }

  for (const configEntry of service.configs ?? []) {
    const optionKey = getStringValue(configEntry.option?.envVariable).toLowerCase();
    if (!optionKey || !normalized.has(optionKey)) {
      continue;
    }

    const value = getStringValue(configEntry.value?.envVariable) || getStringValue(configEntry.value?.name);
    if (value) {
      return value;
    }
  }

  return null;
}

function generateStrongPassword() {
  const symbolPool = '!@#$%^&*';
  const lowerPool = 'abcdefghijklmnopqrstuvwxyz';
  const upperPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digitPool = '0123456789';
  const randomTail = randomBytes(18).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const lower = lowerPool[randomBytes(1)[0] % lowerPool.length];
  const upper = upperPool[randomBytes(1)[0] % upperPool.length];
  const digit = digitPool[randomBytes(1)[0] % digitPool.length];
  const symbol = symbolPool[randomBytes(1)[0] % symbolPool.length];

  return `${upper}${lower}${digit}${symbol}${randomTail}`;
}

function buildCapabilities(buttons: Array<Record<string, unknown>>, hasServerRef: boolean) {
  const lookup = (aliases: string[]) => findActionName(buttons, aliases) !== null;
  const convoyDirect = hasServerRef && convoyEnabled;

  return {
    application: {
      read: convoyDirect,
      patch: convoyDirect,
      build: convoyDirect,
      suspend: convoyDirect,
      unsuspend: convoyDirect,
      destroy: convoyDirect,
    },
    actionBridge: {
      power: convoyDirect || lookup(['start', 'stop', 'restart', 'reboot', 'power']),
      reinstall: convoyDirect || lookup(['reinstall', 'rebuild', 'reset-os']),
      revealPassword: lookup(['password', 'reveal', 'show-password']),
    },
  };
}

type RuntimeKind = 'vps' | 'managed-app' | 'unknown';

type RuntimeActionCapabilities = {
  start: boolean;
  stop: boolean;
  restart: boolean;
  suspend: boolean;
  unsuspend: boolean;
  reinstall: boolean;
  revealPassword: boolean;
  delete: boolean;
};

type RuntimeCapabilities = {
  status: boolean;
  logs: boolean;
  actions: RuntimeActionCapabilities;
  env: boolean;
  domain: boolean;
  tls: boolean;
  scale: boolean;
};

const managedAppRuntimeKindValues = new Set([
  'managed-app',
  'managed_app',
  'managedapp',
  'app-hosting',
  'app_hosting',
]);

const managedAppPropertyKeyMap = {
  runtimeRef: ['runtime_ref'],
  clusterRef: ['k8s_cluster_ref'],
  namespace: ['k8s_namespace', 'namespace'],
  workload: ['k8s_workload', 'workload'],
  service: ['k8s_service', 'service'],
  ingressUrl: ['k8s_ingress_url', 'app_endpoint', 'endpoint', 'ingress_url'],
  appStatus: ['app_status'],
  appEndpoint: ['app_endpoint', 'k8s_ingress_url', 'endpoint'],
  lastDeployAt: ['app_last_deploy_at'],
} as const;

function buildServicePropertyMap(service: ServiceDetail) {
  const map = new Map<string, string>();

  for (const property of service.properties ?? []) {
    const key = getStringValue(property?.key).toLowerCase();
    const value = getStringValue(property?.value);
    if (!key || !value) {
      continue;
    }
    map.set(key, value);
  }

  for (const configEntry of service.configs ?? []) {
    const optionKey = getStringValue(configEntry.option?.envVariable).toLowerCase();
    const value = getStringValue(configEntry.value?.envVariable) || getStringValue(configEntry.value?.name);
    if (!optionKey || !value) {
      continue;
    }
    if (!map.has(optionKey)) {
      map.set(optionKey, value);
    }
  }

  return map;
}

function readRuntimeProperty(
  propertyMap: Map<string, string>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = propertyMap.get(key.toLowerCase());
    if (value) {
      return value;
    }
  }

  return null;
}

function resolveRuntimeKind(service: ServiceDetail, serverRef: string | null) {
  const propertyMap = buildServicePropertyMap(service);
  const declaredKind = readRuntimeProperty(propertyMap, ['runtime_kind', 'runtimeKind']);
  if (declaredKind && managedAppRuntimeKindValues.has(normalizeActionValue(declaredKind))) {
    return {
      kind: 'managed-app' as RuntimeKind,
      propertyMap,
    };
  }

  if (declaredKind && normalizeActionValue(declaredKind) === 'vps') {
    return {
      kind: 'vps' as RuntimeKind,
      propertyMap,
    };
  }

  const productSlug = normalizeActionValue(getStringValue(service.product?.slug));
  if (productSlug === 'app-hosting' || productSlug.includes('app-hosting')) {
    return {
      kind: 'managed-app' as RuntimeKind,
      propertyMap,
    };
  }

  if (serverRef) {
    return {
      kind: 'vps' as RuntimeKind,
      propertyMap,
    };
  }

  return {
    kind: 'unknown' as RuntimeKind,
    propertyMap,
  };
}

function buildRuntimeCapabilities(
  runtimeKind: RuntimeKind,
  serverCapabilities: ReturnType<typeof buildCapabilities>,
  propertyMap?: Map<string, string>,
): RuntimeCapabilities {
  if (runtimeKind === 'managed-app') {
    const replicaLimitValue = Number(propertyMap?.get('replica_limit') ?? '1');
    const canScale = Number.isFinite(replicaLimitValue)
      ? replicaLimitValue > 1
      : true;

    return {
      status: true,
      logs: true,
      actions: {
        start: false,
        stop: false,
        restart: true,
        suspend: false,
        unsuspend: false,
        reinstall: false,
        revealPassword: false,
        delete: true,
      },
      env: true,
      domain: true,
      tls: true,
      scale: canScale,
    };
  }

  if (runtimeKind === 'vps') {
    return {
      status: true,
      logs: true,
      actions: {
        start: serverCapabilities.actionBridge.power,
        stop: serverCapabilities.actionBridge.power,
        restart: serverCapabilities.actionBridge.power,
        suspend: serverCapabilities.application.suspend,
        unsuspend: serverCapabilities.application.unsuspend,
        reinstall: serverCapabilities.actionBridge.reinstall,
        revealPassword: serverCapabilities.actionBridge.revealPassword,
        delete: serverCapabilities.application.destroy,
      },
      env: false,
      domain: false,
      tls: false,
      scale: false,
    };
  }

  return {
    status: true,
    logs: true,
    actions: {
      start: false,
      stop: false,
      restart: false,
      suspend: false,
      unsuspend: false,
      reinstall: false,
      revealPassword: false,
      delete: false,
    },
    env: false,
    domain: false,
    tls: false,
    scale: false,
  };
}

function buildRuntimeSnapshot(
  service: ServiceDetail,
  runtimeKind: RuntimeKind,
  propertyMap: Map<string, string>,
  serverRef: string | null,
  convoyStatus: string | null,
) {
  const normalizeLifecycleStatus = (value: string | null | undefined): string | null => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (['pending'].includes(normalized)) {
      return 'pending';
    }

    if (['queued', 'queue', 'provisioning', 'created', 'initializing'].includes(normalized)) {
      return 'queued';
    }

    if (['building', 'build'].includes(normalized)) {
      return 'building';
    }

    if (['pushing', 'push'].includes(normalized)) {
      return 'pushing';
    }

    if (['deploying', 'rollingout', 'starting', 'provisioning-runtime'].includes(normalized)) {
      return 'deploying';
    }

    if (['running', 'ready', 'active', 'success', 'completed'].includes(normalized)) {
      return 'ready';
    }

    if (['retrying', 'retry'].includes(normalized)) {
      return 'retrying';
    }

    if (['deleting', 'deleted', 'terminating'].includes(normalized)) {
      return 'deleting';
    }

    if (
      normalized.includes('fail')
      || normalized.includes('error')
      || normalized.includes('crash')
      || normalized.includes('imagepull')
      || normalized.includes('backoff')
    ) {
      return 'failed';
    }

    return normalized;
  };

  const deriveLifecycleStatus = (
    runtimeStatus: string | null,
  ) => {
    const rawRuntimeStatus = runtimeStatus ?? (getStringValue(service.status) || null);
    const normalizedRuntimeStatus = normalizeLifecycleStatus(rawRuntimeStatus);
    const provisioningStatus = normalizeLifecycleStatus(service.provisioning?.status ?? null);

    if (provisioningStatus === 'failed') {
      return {
        status: 'failed',
        upstream: rawRuntimeStatus,
      };
    }

    if (provisioningStatus === 'retrying') {
      return {
        status: 'retrying',
        upstream: rawRuntimeStatus,
      };
    }

    if (provisioningStatus === 'pending') {
      return {
        status: 'pending',
        upstream: rawRuntimeStatus,
      };
    }

    if (provisioningStatus === 'queued' && (!normalizedRuntimeStatus || normalizedRuntimeStatus === 'queued')) {
      return {
        status: 'queued',
        upstream: rawRuntimeStatus,
      };
    }

    if (normalizedRuntimeStatus) {
      return {
        status: normalizedRuntimeStatus,
        upstream: rawRuntimeStatus,
      };
    }

    return {
      status: provisioningStatus ?? 'pending',
      upstream: rawRuntimeStatus,
    };
  };

  const managedAppRuntimeRef = readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.runtimeRef);
  const managedAppStatus = readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.appStatus);
  const managedAppEndpoint = readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.appEndpoint);
  const managedAppLastDeployAt = readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.lastDeployAt);

  const runtimeRef = runtimeKind === 'managed-app'
    ? managedAppRuntimeRef
    : serverRef;

  const rawStatus = runtimeKind === 'managed-app'
    ? (managedAppStatus ?? (getStringValue(service.status) || null))
    : (convoyStatus ?? (getStringValue(service.status) || null));
  const statusResolution = deriveLifecycleStatus(rawStatus);

  const endpoint = runtimeKind === 'managed-app'
    ? managedAppEndpoint
    : null;

  return {
    kind: runtimeKind,
    contractVersion: runtimeContractVersion,
    runtimeRef,
    status: statusResolution.status,
    endpoint,
    lastDeployAt: managedAppLastDeployAt,
    upstreamStatus: statusResolution.upstream,
    managedApp: runtimeKind === 'managed-app'
      ? {
        clusterRef: readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.clusterRef) ?? env.MANAGED_APP_DEFAULT_CLUSTER_REF,
        namespace: readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.namespace),
        workload: readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.workload),
        service: readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.service),
        ingressUrl: readRuntimeProperty(propertyMap, managedAppPropertyKeyMap.ingressUrl),
      }
      : null,
    vps: runtimeKind === 'vps'
      ? {
        serverRef,
        convoyStatus,
      }
      : null,
  };
}

function buildRuntimeActionAliases(action: string) {
  const normalized = normalizeActionValue(action);
  const lookup: Record<string, string[]> = {
    start: ['start', 'boot', 'power-on'],
    stop: ['stop', 'shutdown', 'power-off'],
    restart: ['restart', 'reboot'],
    suspend: ['suspend'],
    unsuspend: ['unsuspend', 'resume'],
    reinstall: ['reinstall', 'rebuild', 'reset-os'],
    'reveal-password': ['reveal-password', 'show-password', 'password'],
    delete: ['delete', 'destroy', 'terminate'],
  };

  return lookup[normalized] ?? [normalized, action];
}

function shouldFallbackToActionBridge(error: unknown) {
  if (!(error instanceof GatewayError)) {
    return false;
  }

  return [404, 405, 501].includes(error.statusCode);
}

function readGatewayErrorText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload
      .map((entry) => readGatewayErrorText(entry))
      .filter((entry) => entry !== '')
      .join(' ');
  }

  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.detail,
    record.title,
    record.hint,
    record.reason,
    record.msg,
    record.data,
    record.errors,
  ];

  return candidates
    .map((entry) => readGatewayErrorText(entry))
    .filter((entry) => entry !== '')
    .join(' ');
}

function sanitizeExternalRedirects(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeExternalRedirects(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    const normalized = key.toLowerCase();
    if ([
      'redirect_url',
      'redirecturl',
      'redirect',
      'panel_url',
      'panelurl',
      'console_url',
      'consoleurl',
      'login_url',
      'loginurl',
      'sso_url',
      'ssourl',
    ].includes(normalized)) {
      continue;
    }

    output[key] = sanitizeExternalRedirects(entry);
  }

  return output;
}

function isMissingBackingVmError(error: GatewayError) {
  const text = `${error.message} ${readGatewayErrorText(error.payload)}`.toLowerCase();
  return text.includes('unable to find configuration file for vm')
    || text.includes('configuration file for vm')
    || text.includes('vmid')
    || text.includes('does not exist on node')
    || text.includes('server does not exist');
}

function buildMissingBackingVmPayload(service: ServiceDetail, actionType: string) {
  return {
    code: 'SERVICE_BACKING_VM_MISSING',
    message: 'Service mapping points to a missing backend VM. Retry provisioning to recreate the server mapping.',
    actionType,
    provisioning: buildProvisioningPayload(service),
    expectedKeys: convoyRefKeys,
  };
}

function buildConvoyUpstreamFailurePayload(
  service: ServiceDetail,
  actionType: string,
  error: GatewayError,
) {
  return {
    code: 'CONVOY_ACTION_UPSTREAM_FAILURE',
    message: 'Convoy action is temporarily unavailable.',
    actionType,
    upstreamStatus: error.statusCode,
    upstream: error.payload ?? { message: error.message },
    provisioning: buildProvisioningPayload(service),
    expectedKeys: convoyRefKeys,
  };
}

function buildServerNotReadyPayload(
  service: ServiceDetail,
  actionType: string,
  status: string | null,
  upstream?: unknown,
) {
  return {
    code: 'SERVICE_SERVER_NOT_READY',
    message: 'Server is still initializing and cannot perform this action yet.',
    actionType,
    status: status ?? 'unknown',
    upstream: upstream ?? null,
    provisioning: buildProvisioningPayload(service),
    expectedKeys: convoyRefKeys,
  };
}

function isServerActionBlockedStatus(status: string | null) {
  if (!status) {
    return false;
  }

  return ['installing', 'building', 'deleting', 'deletion_failed'].includes(status.toLowerCase());
}

function extractPasswordFromConvoyPayload(payload: unknown) {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};

  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : {};

  const attributes = typeof data.attributes === 'object' && data.attributes !== null
    ? data.attributes as Record<string, unknown>
    : {};

  const candidates = [
    record.password,
    record.root_password,
    record.account_password,
    data.password,
    data.root_password,
    data.account_password,
    attributes.password,
    attributes.root_password,
    attributes.account_password,
    attributes.default_password,
  ];

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim() !== '') {
      return item.trim();
    }
  }

  return null;
}

function readConvoyServerStatus(payload: unknown) {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : record;
  const attributes = typeof data.attributes === 'object' && data.attributes !== null
    ? data.attributes as Record<string, unknown>
    : data;

  const status = getStringValue(attributes.status) || getStringValue(data.status) || getStringValue(record.status);
  return status || null;
}

function resolveConvoyNodeRef(payload: unknown): string | null {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : record;
  const attributes = typeof data.attributes === 'object' && data.attributes !== null
    ? data.attributes as Record<string, unknown>
    : data;

  const nodeData = typeof attributes.node === 'object' && attributes.node !== null
    ? attributes.node as Record<string, unknown>
    : typeof data.node === 'object' && data.node !== null
      ? data.node as Record<string, unknown>
      : {};

  const candidates: unknown[] = [
    attributes.node_id,
    data.node_id,
    attributes.nodeId,
    data.nodeId,
    attributes.node_uuid,
    data.node_uuid,
    attributes.nodeUuid,
    data.nodeUuid,
    nodeData.id,
    nodeData.uuid,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }

    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return null;
}

type ReinstallTemplateOption = {
  value: string;
  label: string;
  group: string | null;
};

function normalizeConvoyTemplateOptions(payload: unknown): ReinstallTemplateOption[] {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const toRecord = (value: unknown): Record<string, unknown> => (
    typeof value === 'object' && value !== null
      ? value as Record<string, unknown>
      : {}
  );
  const unwrapCollection = (value: unknown): unknown[] => {
    if (Array.isArray(value)) {
      return value;
    }

    const collectionRecord = toRecord(value);
    if (Array.isArray(collectionRecord.data)) {
      return collectionRecord.data;
    }

    return [];
  };

  const groups = (() => {
    const candidates = [
      record.data,
      record.template_groups,
      toRecord(record.attributes).template_groups,
      toRecord(record.attributes).data,
      toRecord(record.meta).template_groups,
    ];

    for (const candidate of candidates) {
      const collection = unwrapCollection(candidate);
      if (collection.length > 0) {
        return collection;
      }
    }

    return [];
  })();

  const options: ReinstallTemplateOption[] = [];
  const seen = new Set<string>();

  for (const groupItem of groups) {
    const groupRecord = typeof groupItem === 'object' && groupItem !== null
      ? groupItem as Record<string, unknown>
      : {};
    const groupAttributes = typeof groupRecord.attributes === 'object' && groupRecord.attributes !== null
      ? groupRecord.attributes as Record<string, unknown>
      : groupRecord;

    const groupName = getStringValue(groupAttributes.name)
      || getStringValue(groupAttributes.display_name)
      || getStringValue(groupRecord.name)
      || null;

    const templatesRaw = (() => {
      const candidates = [
        groupAttributes.templates,
        groupRecord.templates,
        groupAttributes.images,
        groupRecord.images,
        toRecord(groupAttributes.meta).templates,
        toRecord(groupRecord.meta).templates,
      ];

      for (const candidate of candidates) {
        const collection = unwrapCollection(candidate);
        if (collection.length > 0) {
          return collection;
        }
      }

      return [];
    })();

    for (const templateItem of templatesRaw) {
      const templateItemRecord = toRecord(templateItem);
      const nestedData = unwrapCollection(templateItemRecord.data);
      if (nestedData.length > 0) {
        for (const nestedTemplateItem of nestedData) {
          const nestedTemplateRecord = toRecord(nestedTemplateItem);
          const nestedAttributes = toRecord(nestedTemplateRecord.attributes);

          const nestedUuid = getStringValue(nestedAttributes.uuid)
            || getStringValue(nestedTemplateRecord.uuid)
            || getStringValue(nestedAttributes.id)
            || getStringValue(nestedTemplateRecord.id);

          if (!nestedUuid || seen.has(nestedUuid)) {
            continue;
          }

          seen.add(nestedUuid);
          const nestedLabel = getStringValue(nestedAttributes.name)
            || getStringValue(nestedTemplateRecord.name)
            || getStringValue(nestedAttributes.display_name)
            || getStringValue(nestedTemplateRecord.display_name)
            || nestedUuid;

          options.push({
            value: nestedUuid,
            label: nestedLabel,
            group: groupName,
          });
        }
        continue;
      }

      const templateRecord = typeof templateItem === 'object' && templateItem !== null
        ? templateItem as Record<string, unknown>
        : {};
      const templateAttributes = typeof templateRecord.attributes === 'object' && templateRecord.attributes !== null
        ? templateRecord.attributes as Record<string, unknown>
        : templateRecord;

      const uuid = getStringValue(templateAttributes.uuid)
        || getStringValue(templateRecord.uuid)
        || getStringValue(templateAttributes.id)
        || getStringValue(templateRecord.id);

      if (!uuid || seen.has(uuid)) {
        continue;
      }

      seen.add(uuid);
      const label = getStringValue(templateAttributes.name)
        || getStringValue(templateRecord.name)
        || getStringValue(templateAttributes.display_name)
        || getStringValue(templateRecord.display_name)
        || uuid;

      options.push({
        value: uuid,
        label,
        group: groupName,
      });
    }
  }

  return options;
}

function buildProvisioningPayload(service: ServiceDetail) {
  return service.provisioning
    ? {
      status: service.provisioning.status,
      provider: service.provisioning.provider,
      attemptCount: service.provisioning.attemptCount,
      errorMessage: service.provisioning.errorMessage,
      errorCode: service.provisioning.errorCode,
      lastAttemptAt: service.provisioning.lastAttemptAt,
      completedAt: service.provisioning.completedAt,
    }
    : null;
}

function normalizeActionResultPayload(
  value: unknown,
  fallback: Partial<ActionResultPayload> = {},
): ActionResultPayload {
  const record = asRecordValue(value);

  return {
    success: typeof record.success === 'boolean' ? record.success : (fallback.success ?? false),
    code: readNullableStringValue(record.code ?? record.error_code) ?? fallback.code ?? null,
    detail: readNullableStringValue(record.detail ?? record.message ?? record.error) ?? fallback.detail ?? null,
    operationId: readNullableStringValue(record.operation_id ?? record.operationId) ?? fallback.operationId ?? null,
  };
}

function extractGatewayErrorCode(error: GatewayError, fallbackCode: string) {
  const payload = asRecordValue(error.payload);
  return getStringValue(payload.code) || getStringValue(payload.error_code) || fallbackCode;
}

function extractGatewayErrorDetail(error: GatewayError) {
  const payload = asRecordValue(error.payload);
  return readNullableStringValue(payload.detail ?? payload.message ?? payload.error) ?? error.message;
}

async function recordServiceOperationLog(
  request: FastifyRequest,
  token: string,
  serviceId: string,
  input: CreateServiceOperationLogInput,
) {
  try {
    const response = await gateway.createServiceOperationLog(token, serviceId, input);
    if (response.actionResult) {
      return normalizeActionResultPayload(response.actionResult);
    }

    return normalizeActionResultPayload(response.data.log, {
      success: Boolean(input.success),
      code: input.code ?? null,
      detail: input.detail ?? input.message ?? null,
    });
  } catch (error) {
    request.log.warn({
      serviceId,
      action: input.action,
      source: input.source ?? 'headless-bff',
      error,
    }, 'Failed to record service operation log.');

    return null;
  }
}

async function executeLoggedAction<T extends { message?: string; data?: unknown; actionResult?: unknown }>(
  request: FastifyRequest,
  options: {
    token: string;
    serviceId: string;
    action: string;
    requestPayload?: Record<string, unknown>;
    successCode: string;
    failureCode: string;
    run: () => Promise<T>;
  },
) {
  try {
    const response = await options.run();
    const loggedResult = await recordServiceOperationLog(request, options.token, options.serviceId, {
      source: 'headless-bff',
      action: options.action,
      success: true,
      code: options.successCode,
      message: getStringValue(response.message) || null,
      detail: getStringValue(response.message) || null,
      requestPayload: options.requestPayload ?? null,
      responsePayload: asRecordValue(response.data),
    });

    return {
      ...response,
      actionResult: normalizeActionResultPayload(response.actionResult ?? loggedResult, {
        success: true,
        code: options.successCode,
        detail: getStringValue(response.message) || null,
      }),
    };
  } catch (error) {
    if (!(error instanceof GatewayError)) {
      throw error;
    }

    const code = extractGatewayErrorCode(error, options.failureCode);
    const detail = extractGatewayErrorDetail(error);
    const loggedResult = await recordServiceOperationLog(request, options.token, options.serviceId, {
      source: 'headless-bff',
      action: options.action,
      success: false,
      code,
      message: error.message,
      detail,
      requestPayload: options.requestPayload ?? null,
      responsePayload: asRecordValue(error.payload),
    });

    throw new GatewayError(error.message, error.statusCode, {
      ...asRecordValue(error.payload),
      code,
      detail,
      actionResult: normalizeActionResultPayload(loggedResult, {
        success: false,
        code,
        detail,
      }),
    });
  }
}

async function getServiceWithActions(token: string, serviceId: string) {
  const serviceResponse = await gateway.service(token, serviceId);
  const service = serviceResponse.data.service;
  const buttons = (serviceResponse.data.actions?.buttons ?? []) as Array<Record<string, unknown>>;
  const serverRef = resolveConvoyServerRef(service);

  return {
    service,
    buttons,
    serverRef,
    capabilities: buildCapabilities(buttons, serverRef !== null),
  };
}

function requireServerRefOrThrow(service: ServiceDetail, serverRef: string | null): string {
  if (serverRef) {
    return serverRef;
  }

  const provisioning = buildProvisioningPayload(service);
  if (provisioning?.status === 'pending' || provisioning?.status === 'provisioning') {
    throw new GatewayError('Service provisioning is still in progress.', 409, {
      code: 'SERVICE_PROVISIONING_PENDING',
      provisioning,
      expectedKeys: convoyRefKeys,
    });
  }

  if (provisioning?.status === 'failed') {
    throw new GatewayError('Service provisioning failed and requires retry.', 409, {
      code: 'SERVICE_PROVISIONING_FAILED',
      provisioning,
      expectedKeys: convoyRefKeys,
    });
  }

  throw new GatewayError('Service is not mapped to a Convoy server reference.', 409, {
    code: 'SERVICE_CONVOY_MAPPING_MISSING',
    provisioning,
    expectedKeys: convoyRefKeys,
  });
}

async function loadRuntimeContext(token: string, serviceId: string) {
  const { service, buttons, serverRef, capabilities } = await getServiceWithActions(token, serviceId);
  const exposedButtons = sanitizeExposedButtons(buttons);
  const runtimeResolution = resolveRuntimeKind(service, serverRef);

  let convoyStatus: string | null = null;
  if (runtimeResolution.kind === 'vps' && serverRef && convoyEnabled) {
    try {
      const serverSnapshot = await convoy.getServer(serverRef);
      convoyStatus = readConvoyServerStatus(serverSnapshot);
    } catch (error) {
      if (error instanceof GatewayError && isMissingBackingVmError(error)) {
        throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'runtime-read'));
      }
      throw error;
    }
  }

  return {
    service,
    buttons,
    exposedButtons,
    serverRef,
    serverCapabilities: capabilities,
    runtimeKind: runtimeResolution.kind,
    propertyMap: runtimeResolution.propertyMap,
    convoyStatus,
  };
}

function managedAppContractErrorPayload(action: string) {
  return {
    code: managedAppEnabled
      ? 'MANAGED_APP_RUNTIME_UNAVAILABLE'
      : 'MANAGED_APP_RUNTIME_DISABLED',
    detail: managedAppEnabled
      ? 'Managed App runtime request could not be completed.'
      : 'Managed App runtime is disabled. Set MANAGED_APP_ENABLED=true to enable contract endpoints.',
    action,
    driver: env.MANAGED_APP_DRIVER,
    contractVersion: runtimeContractVersion,
  };
}

function requireManagedAppInternalToken(request: FastifyRequest) {
  const configured = getStringValue(env.MANAGED_APP_INTERNAL_API_TOKEN);
  if (!configured) {
    throw new GatewayError('Managed App internal API token is not configured.', 503, {
      code: 'MANAGED_APP_INTERNAL_TOKEN_MISSING',
    });
  }

  const header = getStringValue(request.headers.authorization);
  const expected = `bearer ${configured}`.toLowerCase();
  if (header.toLowerCase() !== expected) {
    throw new GatewayError('Managed App internal API authentication failed.', 401, {
      code: 'MANAGED_APP_INTERNAL_AUTH_FAILED',
    });
  }
}

function managedAppErrorToGateway(error: unknown, action: string): never {
  if (error instanceof ManagedAppRuntimeError) {
    throw new GatewayError(error.message, error.statusCode, {
      ...managedAppContractErrorPayload(action),
      code: error.code,
      detail: error.detail ?? error.message,
    });
  }

  throw error;
}

function managedAppOptionsFromContext(context: Awaited<ReturnType<typeof loadRuntimeContext>>) {
  return {
    propertyMap: context.propertyMap,
  };
}

function parseInternalManagedAppPayload(request: FastifyRequest) {
  return z.object({
    service: z.object({
      id: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
      label: z.string().optional(),
      base_label: z.string().optional(),
      product: z.object({
        slug: z.string().optional(),
      }).partial().optional(),
    }).passthrough(),
    mapping: z.object({
      config: z.record(z.unknown()).optional(),
    }).passthrough().optional(),
    product_settings: z.record(z.unknown()).optional(),
    service_properties: z.record(z.unknown()).optional(),
    force_reprovision: z.boolean().optional(),
  }).parse(request.body ?? {});
}

function normalizeInternalServiceProperties(
  payload: ReturnType<typeof parseInternalManagedAppPayload>,
) {
  const merged: Record<string, unknown> = {
    runtime_kind: 'managed-app',
    ...(payload.mapping?.config ?? {}),
    ...(payload.service_properties ?? {}),
  };

  if (typeof merged.cluster_ref === 'string' && merged.cluster_ref.trim() !== '' && typeof merged.k8s_cluster_ref !== 'string') {
    merged.k8s_cluster_ref = merged.cluster_ref;
  }

  if (typeof merged.default_domain_suffix === 'string' && merged.default_domain_suffix.trim() !== '' && typeof merged.managed_app_domain_suffix !== 'string') {
    merged.managed_app_domain_suffix = merged.default_domain_suffix;
  }

  if (typeof merged.build_namespace === 'string' && merged.build_namespace.trim() !== '' && typeof merged.managed_app_build_namespace !== 'string') {
    merged.managed_app_build_namespace = merged.build_namespace;
  }

  return merged;
}

app.get('/api/v1/health', async () => gateway.health());

app.post('/api/internal/managed-app/provision', async (request) => {
  requireManagedAppInternalToken(request);
  const payload = parseInternalManagedAppPayload(request);
  const serviceProperties = normalizeInternalServiceProperties(payload);

  return managedAppRuntime.provision(payload.service as ServiceInput, {
    productSettings: payload.product_settings ?? {},
    serviceProperties,
    forceReprovision: payload.force_reprovision ?? false,
  }).catch((error) => managedAppErrorToGateway(error, 'internal-provision'));
});

app.post('/api/internal/managed-app/reconcile', async (request) => {
  requireManagedAppInternalToken(request);
  const payload = parseInternalManagedAppPayload(request);
  const serviceProperties = normalizeInternalServiceProperties(payload);

  return managedAppRuntime.reconcile(payload.service as ServiceInput, {
    productSettings: payload.product_settings ?? {},
    serviceProperties,
  }).catch((error) => managedAppErrorToGateway(error, 'internal-reconcile'));
});

app.post('/api/internal/managed-app/deprovision', async (request) => {
  requireManagedAppInternalToken(request);
  const payload = parseInternalManagedAppPayload(request);
  const serviceProperties = normalizeInternalServiceProperties(payload);

  return managedAppRuntime.deleteRuntime(payload.service as ServiceInput, {
    productSettings: payload.product_settings ?? {},
    serviceProperties,
  }).catch((error) => managedAppErrorToGateway(error, 'internal-deprovision'));
});

app.get('/api/v1/catalog/home', async () => gateway.home());
app.get('/api/v1/catalog/categories', async () => gateway.categories());
app.get('/api/v1/catalog/categories/:categorySlug', async (request) => {
  const params = z.object({
    categorySlug: z.string().min(1),
  }).parse(request.params);

  return gateway.category(params.categorySlug);
});

app.get('/api/v1/catalog/products', async (request) => {
  const query = z.object({
    category: z.string().min(1).optional(),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(request.query);

  return gateway.products(query.category, query.perPage ?? query.per_page ?? 24);
});

app.get('/api/v1/catalog/products/:productSlug', async (request) => {
  const params = z.object({
    productSlug: z.string().min(1),
  }).parse(request.params);

  return gateway.product(params.productSlug);
});

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    code: z.string().trim().min(6).max(8).optional(),
    deviceName: z.string().trim().min(1).max(255).optional(),
  }).parse(request.body);

  const response = await gateway.login(body);
  writeSession(reply, response.data.accessToken);

  return {
    message: response.message,
    data: {
      user: response.data.user,
    },
  };
});

app.post('/api/v1/auth/register', async (request, reply) => {
  const body = z.object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    email: z.string().email(),
    password: z.string().min(8),
    passwordConfirmation: z.string().min(8),
    deviceName: z.string().trim().min(1).max(255).optional(),
  }).parse(request.body);

  const response = await gateway.register(body);
  writeSession(reply, response.data.accessToken);

  return {
    message: response.message,
    data: {
      user: response.data.user,
    },
  };
});

app.get('/api/v1/auth/me', async (request) => {
  const token = requireToken(request);
  return gateway.me(token);
});

app.post('/api/v1/auth/logout', async (request, reply) => {
  const token = resolveToken(request);
  if (token) {
    await gateway.logout(token).catch(() => undefined);
  }

  clearSession(request, reply);
  return { message: 'Logged out successfully.' };
});

app.get('/api/v1/cart', async (request) => gateway.cart(requireToken(request)));
app.post('/api/v1/cart/items', async (request) => {
  const body = z.object({
    productSlug: z.string().min(1),
    planId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(100).optional(),
    configOptions: z.record(z.unknown()).optional(),
    checkoutConfig: z.record(z.unknown()).optional(),
  }).parse(request.body);

  return gateway.addCartItem(requireToken(request), body);
});

app.patch('/api/v1/cart/items/:itemId', async (request) => {
  const params = z.object({ itemId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    quantity: z.coerce.number().int().min(1).max(100),
  }).parse(request.body);

  return gateway.updateCartItem(requireToken(request), params.itemId, body);
});

app.delete('/api/v1/cart/items/:itemId', async (request) => {
  const params = z.object({ itemId: z.string().min(1) }).parse(request.params);
  return gateway.removeCartItem(requireToken(request), params.itemId);
});

app.post('/api/v1/cart/coupon', async (request) => {
  const body = z.object({
    code: z.string().min(1),
  }).parse(request.body);

  return gateway.applyCoupon(requireToken(request), body.code);
});

app.delete('/api/v1/cart/coupon', async (request) => gateway.removeCoupon(requireToken(request)));

app.post('/api/v1/checkout', async (request) => {
  const body = z.object({
    tos: z.boolean().optional(),
  }).parse(request.body ?? {});

  return gateway.checkout(requireToken(request), body);
});

app.get('/api/v1/services', async (request) => {
  const query = z.object({
    status: z.string().optional(),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(request.query);

  return gateway.services(requireToken(request), query.status, query.perPage ?? query.per_page ?? 20);
});

app.get('/api/v1/services/:serviceId', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  return gateway.service(requireToken(request), params.serviceId);
});

app.get('/api/v1/services/:serviceId/provisioning', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  return gateway.serviceProvisioning(requireToken(request), params.serviceId);
});

app.post('/api/v1/services/:serviceId/provisioning/retry', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    force: z.boolean().optional().default(true),
  }).parse(request.body ?? {});

  return gateway.retryServiceProvisioning(requireToken(request), params.serviceId, {
    force: body.force,
  });
});

app.patch('/api/v1/services/:serviceId/label', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    label: z.string().max(255).nullable(),
  }).parse(request.body);

  return gateway.updateServiceLabel(requireToken(request), params.serviceId, body.label);
});

app.post('/api/v1/services/:serviceId/cancel', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    type: z.enum(['end_of_period', 'immediate']),
    reason: z.string().min(1),
  }).parse(request.body);
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'cancel',
    requestPayload: body,
    successCode: 'SERVICE_CANCEL_REQUESTED',
    failureCode: 'SERVICE_CANCEL_FAILED',
    run: () => gateway.cancelService(token, params.serviceId, body),
  });
});

app.post('/api/v1/services/:serviceId/actions/:action', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    action: z.string().min(1),
  }).parse(request.params);
  const body = z.record(z.unknown()).parse(request.body ?? {});
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: params.action,
    requestPayload: body,
    successCode: 'SERVICE_ACTION_EXECUTED',
    failureCode: 'SERVICE_ACTION_FAILED',
    run: () => gateway.serviceAction(token, params.serviceId, params.action, body),
  });
});

app.get('/api/v1/services/:serviceId/operation-logs', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }).parse(request.query ?? {});

  return gateway.serviceOperationLogs(requireToken(request), params.serviceId, query.limit ?? 10);
});

app.get('/api/v1/services/:serviceId/runtime', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);
  const managedRuntime = context.runtimeKind === 'managed-app'
    ? await managedAppRuntime.snapshot(context.service, managedAppOptionsFromContext(context)).catch((error) => managedAppErrorToGateway(error, 'runtime'))
    : null;

  return {
    data: {
      serviceId: context.service.id,
      runtime: managedRuntime?.runtime ?? buildRuntimeSnapshot(
        context.service,
        context.runtimeKind,
        context.propertyMap,
        context.serverRef,
        context.convoyStatus,
      ),
      provisioning: buildProvisioningPayload(context.service),
      capabilities: buildRuntimeCapabilities(context.runtimeKind, context.serverCapabilities, context.propertyMap),
      actions: {
        buttons: context.exposedButtons,
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
});

app.get('/api/v1/services/:serviceId/runtime/capabilities', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);
  const managedRuntime = context.runtimeKind === 'managed-app'
    ? await managedAppRuntime.snapshot(context.service, managedAppOptionsFromContext(context)).catch((error) => managedAppErrorToGateway(error, 'runtime-capabilities'))
    : null;

  return {
    data: {
      serviceId: context.service.id,
      runtimeKind: context.runtimeKind,
      runtimeRef: managedRuntime?.runtime.runtimeRef ?? (
        context.runtimeKind === 'managed-app'
          ? readRuntimeProperty(context.propertyMap, managedAppPropertyKeyMap.runtimeRef)
          : context.serverRef
      ),
      provisioning: buildProvisioningPayload(context.service),
      capabilities: buildRuntimeCapabilities(context.runtimeKind, context.serverCapabilities, context.propertyMap),
      actions: {
        buttons: context.exposedButtons,
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
});

app.get('/api/v1/services/:serviceId/runtime/logs', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(request.query ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  if (context.runtimeKind === 'managed-app') {
    return managedAppRuntime.logs(context.service, query.limit ?? 50, managedAppOptionsFromContext(context)).catch((error) => managedAppErrorToGateway(error, 'logs'));
  }

  return gateway.serviceOperationLogs(token, params.serviceId, query.limit ?? 50);
});

app.post('/api/v1/services/:serviceId/runtime/actions/:action', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    action: z.string().min(1),
  }).parse(request.params);
  const body = z.object({
    payload: z.record(z.unknown()).optional(),
  }).passthrough().parse(request.body ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: `runtime:${params.action}`,
    requestPayload: asRecordValue(body.payload ?? body),
    successCode: 'RUNTIME_ACTION_SUBMITTED',
    failureCode: 'RUNTIME_ACTION_FAILED',
    run: async () => {
      if (context.runtimeKind === 'managed-app') {
        const normalizedAction = normalizeActionValue(params.action);
        try {
          if (normalizedAction === 'restart') {
            const result = await managedAppRuntime.restart(context.service, managedAppOptionsFromContext(context));
            return {
              message: result.message,
              data: {
                runtime: result.runtime,
                properties: result.properties,
              },
            };
          }

          if (normalizedAction === 'delete' || normalizedAction === 'destroy') {
            const result = await managedAppRuntime.deleteRuntime(context.service, managedAppOptionsFromContext(context));
            return {
              message: result.message,
              data: {
                runtime: result.runtime,
                properties: result.properties,
              },
            };
          }
        } catch (error) {
          managedAppErrorToGateway(error, params.action);
        }

        throw new GatewayError('Requested managed-app action is not available for this service.', 409, {
          code: 'MANAGED_APP_ACTION_UNSUPPORTED',
          action: normalizedAction,
        });
      }

      if (context.runtimeKind !== 'vps') {
        throw new GatewayError('Runtime type is not ready for actions.', 409, {
          code: 'RUNTIME_KIND_UNKNOWN',
          detail: 'Service runtime_kind is not mapped yet.',
        });
      }

      const actionName = findActionName(context.buttons, buildRuntimeActionAliases(params.action));
      if (!actionName) {
        throw new GatewayError('Requested runtime action is not available for this service.', 409, {
          code: 'SERVICE_ACTION_UNSUPPORTED',
          actionType: params.action,
        });
      }

      const response = await gateway.serviceAction(token, params.serviceId, actionName, asRecordValue(body.payload ?? body));
      return {
        ...response,
        data: {
          ...asRecordValue(response.data),
          runtimeKind: context.runtimeKind,
          action: actionName,
        },
      };
    },
  });
});

app.patch('/api/v1/services/:serviceId/runtime/env', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    env: z.record(z.string()).optional(),
    values: z.record(z.string()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'runtime:env',
    requestPayload: {
      env: body.env ?? body.values ?? {},
    },
    successCode: 'RUNTIME_ENV_UPDATED',
    failureCode: 'RUNTIME_ENV_UPDATE_FAILED',
    run: async () => {
      if (context.runtimeKind === 'managed-app') {
        const result = await managedAppRuntime.updateEnv(
          context.service,
          body.env ?? body.values ?? {},
          managedAppOptionsFromContext(context),
        ).catch((error) => managedAppErrorToGateway(error, 'env'));

        return {
          message: result.message,
          data: {
            runtime: result.runtime,
            properties: result.properties,
          },
        };
      }

      throw new GatewayError('Runtime env updates are only available for managed-app services.', 409, {
        code: 'RUNTIME_ENV_UNSUPPORTED_FOR_VPS',
      });
    },
  });
});

app.post('/api/v1/services/:serviceId/runtime/domain', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    domain: z.string().min(1),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'runtime:domain',
    requestPayload: body,
    successCode: 'RUNTIME_DOMAIN_SUBMITTED',
    failureCode: 'RUNTIME_DOMAIN_FAILED',
    run: async () => {
      if (context.runtimeKind === 'managed-app') {
        const result = await managedAppRuntime.updateDomain(
          context.service,
          body.domain,
          managedAppOptionsFromContext(context),
        ).catch((error) => managedAppErrorToGateway(error, 'domain'));

        return {
          message: result.message,
          data: {
            runtime: result.runtime,
            properties: result.properties,
          },
        };
      }

      throw new GatewayError('Runtime domain updates are only available for managed-app services.', 409, {
        code: 'RUNTIME_DOMAIN_UNSUPPORTED_FOR_VPS',
      });
    },
  });
});

app.post('/api/v1/services/:serviceId/runtime/tls', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    domain: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'runtime:tls',
    requestPayload: body,
    successCode: 'RUNTIME_TLS_SUBMITTED',
    failureCode: 'RUNTIME_TLS_FAILED',
    run: async () => {
      if (context.runtimeKind === 'managed-app') {
        const result = await managedAppRuntime.updateTls(
          context.service,
          body.domain ?? null,
          managedAppOptionsFromContext(context),
        ).catch((error) => managedAppErrorToGateway(error, 'tls'));

        return {
          message: result.message,
          data: {
            runtime: result.runtime,
            properties: result.properties,
          },
        };
      }

      throw new GatewayError('Runtime TLS operations are only available for managed-app services.', 409, {
        code: 'RUNTIME_TLS_UNSUPPORTED_FOR_VPS',
      });
    },
  });
});

app.post('/api/v1/services/:serviceId/runtime/scale', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    replicas: z.coerce.number().int().min(1),
    maxReplicas: z.coerce.number().int().min(1).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'runtime:scale',
    requestPayload: body,
    successCode: 'RUNTIME_SCALE_SUBMITTED',
    failureCode: 'RUNTIME_SCALE_FAILED',
    run: async () => {
      if (context.runtimeKind === 'managed-app') {
        const result = await managedAppRuntime.scale(
          context.service,
          body.replicas,
          managedAppOptionsFromContext(context),
        ).catch((error) => managedAppErrorToGateway(error, 'scale'));

        return {
          message: result.message,
          data: {
            runtime: result.runtime,
            properties: result.properties,
          },
        };
      }

      throw new GatewayError('Runtime scale operations are only available for managed-app services.', 409, {
        code: 'RUNTIME_SCALE_UNSUPPORTED_FOR_VPS',
      });
    },
  });
});

app.get('/api/v1/services/:serviceId/server', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, buttons, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
  const exposedButtons = sanitizeExposedButtons(buttons);

  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  const convoyResponse = await convoy.getServer(resolvedServerRef).catch((error) => {
    if (error instanceof GatewayError && isMissingBackingVmError(error)) {
      throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'read'));
    }

    throw error;
  });

  return {
    data: {
      service,
      mapping: {
        serverRef: resolvedServerRef,
        expectedKeys: convoyRefKeys,
      },
      capabilities,
      actions: {
        buttons: exposedButtons,
      },
      convoy: sanitizeExternalRedirects(convoyResponse.data ?? {}),
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
});

app.get('/api/v1/services/:serviceId/server/capabilities', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef, capabilities, buttons } = await getServiceWithActions(token, params.serviceId);
  const exposedButtons = sanitizeExposedButtons(buttons);

  return {
    data: {
      mapped: serverRef !== null,
      serverRef,
      provisioning: buildProvisioningPayload(service),
      expectedKeys: convoyRefKeys,
      capabilities,
      actions: {
        buttons: exposedButtons,
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
});

app.get('/api/v1/services/:serviceId/server/reinstall-options', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);

  const defaultTemplateUuid = findServicePropertyValue(service, [
    'template_uuid',
    'convoy_template_uuid',
    'os',
    'image',
  ]);

  let source: 'convoy' | 'product' | 'none' = 'none';
  let options: ReinstallTemplateOption[] = [];

  if (serverRef && convoyEnabled) {
    try {
      const serverPayload = await convoy.getServer(serverRef);
      const nodeRef = resolveConvoyNodeRef(serverPayload);
      if (nodeRef) {
        const groupsPayload = await convoy.getNodeTemplateGroups(nodeRef);
        options = normalizeConvoyTemplateOptions(groupsPayload);
        if (options.length > 0) {
          source = 'convoy';
        }
      }
    } catch (error) {
      if (error instanceof GatewayError && isMissingBackingVmError(error)) {
        throw new GatewayError(
          'Service mapping points to a missing backend VM.',
          409,
          buildMissingBackingVmPayload(service, 'reinstall-options'),
        );
      }

      request.log.warn({
        serviceId: params.serviceId,
        serverRef,
        error,
      }, 'Failed to load Convoy reinstall template options. Falling back to service defaults.');
    }
  }

  if (options.length === 0 && defaultTemplateUuid) {
    source = 'product';
    options = [{
      value: defaultTemplateUuid,
      label: 'Default template',
      group: null,
    }];
  }

  return {
    data: {
      mapped: serverRef !== null,
      serverRef,
      source,
      defaultTemplateUuid: defaultTemplateUuid ?? null,
      options,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
});

app.patch('/api/v1/services/:serviceId/server', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.record(z.unknown()).parse(request.body ?? {});
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  const response = await convoy.patchServer(resolvedServerRef, body);
  return {
    message: 'Server settings updated successfully.',
    data: response.data ?? {},
  };
});

app.patch('/api/v1/services/:serviceId/server/build', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.record(z.unknown()).parse(request.body ?? {});
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  const response = await convoy.patchBuild(resolvedServerRef, body);
  return {
    message: 'Server build updated successfully.',
    data: response.data ?? {},
  };
});

app.post('/api/v1/services/:serviceId/server/suspend', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'suspend',
    requestPayload: {},
    successCode: 'SERVICE_SUSPEND_SUBMITTED',
    failureCode: 'SERVICE_SUSPEND_FAILED',
    run: async () => {
      const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

      const serverSnapshot = await convoy.getServer(resolvedServerRef).catch(() => null);
      const convoyStatus = readConvoyServerStatus(serverSnapshot);
      if (isServerActionBlockedStatus(convoyStatus)) {
        throw new GatewayError('Server is not ready for suspend operations yet.', 409, buildServerNotReadyPayload(service, 'suspend', convoyStatus));
      }

      await convoy.suspend(resolvedServerRef).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'suspend'));
        }
        if (error instanceof GatewayError && error.statusCode === 409) {
          throw new GatewayError(
            'Server is not ready for suspend operations yet.',
            409,
            buildServerNotReadyPayload(service, 'suspend', convoyStatus, error.payload ?? { message: error.message }),
          );
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy suspend action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'suspend', error));
        }
        throw error;
      });

      return { message: 'Server suspended successfully.', data: {} };
    },
  });
});

app.post('/api/v1/services/:serviceId/server/unsuspend', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'unsuspend',
    requestPayload: {},
    successCode: 'SERVICE_UNSUSPEND_SUBMITTED',
    failureCode: 'SERVICE_UNSUSPEND_FAILED',
    run: async () => {
      const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

      const serverSnapshot = await convoy.getServer(resolvedServerRef).catch(() => null);
      const convoyStatus = readConvoyServerStatus(serverSnapshot);
      if (isServerActionBlockedStatus(convoyStatus)) {
        throw new GatewayError('Server is not ready for unsuspend operations yet.', 409, buildServerNotReadyPayload(service, 'unsuspend', convoyStatus));
      }

      await convoy.unsuspend(resolvedServerRef).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'unsuspend'));
        }
        if (error instanceof GatewayError && error.statusCode === 409) {
          throw new GatewayError(
            'Server is not ready for unsuspend operations yet.',
            409,
            buildServerNotReadyPayload(service, 'unsuspend', convoyStatus, error.payload ?? { message: error.message }),
          );
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy unsuspend action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'unsuspend', error));
        }
        throw error;
      });

      return { message: 'Server unsuspended successfully.', data: {} };
    },
  });
});

app.delete('/api/v1/services/:serviceId/server', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const query = z.object({
    noPurge: z.coerce.boolean().optional().default(false),
  }).parse(request.query ?? {});
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'destroy',
    requestPayload: {
      noPurge: query.noPurge,
    },
    successCode: 'SERVICE_DESTROY_SUBMITTED',
    failureCode: 'SERVICE_DESTROY_FAILED',
    run: async () => {
      const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

      await convoy.destroy(resolvedServerRef, query.noPurge).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'destroy'));
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy terminate action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'destroy', error));
        }
        throw error;
      });

      return { message: 'Server termination requested successfully.', data: {} };
    },
  });
});

app.post('/api/v1/services/:serviceId/server/power', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    state: z.enum(['start', 'stop', 'restart', 'shutdown']),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: body.state,
    requestPayload: {
      state: body.state,
      ...(body.payload ?? {}),
    },
    successCode: 'SERVICE_POWER_SUBMITTED',
    failureCode: 'SERVICE_POWER_FAILED',
    run: async () => {
      const { service, buttons, serverRef } = await getServiceWithActions(token, params.serviceId);

      if (serverRef && convoyEnabled) {
        try {
          const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
          const serverSnapshot = await convoy.getServer(resolvedServerRef).catch(() => null);
          const convoyStatus = readConvoyServerStatus(serverSnapshot);
          if (convoyStatus && ['installing', 'deleting', 'deletion_failed'].includes(convoyStatus)) {
            throw new GatewayError('Server is not ready for power operations yet.', 409, {
              code: 'SERVICE_SERVER_NOT_READY',
              status: convoyStatus,
            });
          }
          const convoyStateMap = {
            start: 'start',
            stop: 'shutdown',
            restart: 'restart',
            shutdown: 'shutdown',
          } as const;
          const response = await convoy.power(resolvedServerRef, convoyStateMap[body.state]);

          return {
            message: 'Server power action submitted.',
            data: {
              provider: 'convoy',
              state: body.state,
              response: sanitizeExternalRedirects(response.data ?? {}),
            },
          };
        } catch (error) {
          if (error instanceof GatewayError && isMissingBackingVmError(error)) {
            throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'power'));
          }

          if (error instanceof GatewayError && error.statusCode >= 500) {
            throw new GatewayError('Convoy power action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'power', error));
          }

          if (!shouldFallbackToActionBridge(error)) {
            throw error;
          }

          request.log.warn({
            serviceId: params.serviceId,
            action: 'power',
            requestedState: body.state,
            error,
          }, 'Convoy power action failed, falling back to Paymenter action bridge.');
        }
      }

      const actionAliases = {
        start: ['start', 'boot', 'power-on', 'power-start'],
        stop: ['stop', 'shutdown', 'power-off', 'power-stop'],
        restart: ['restart', 'reboot', 'power-restart'],
        shutdown: ['shutdown', 'stop', 'power-off'],
      } as const;
      const actionName = findActionName(buttons, actionAliases[body.state]);

      if (!actionName) {
        throw new GatewayError('Requested power action is not available for this service.', 409, {
          code: 'SERVICE_ACTION_UNSUPPORTED',
          actionType: 'power',
          requestedState: body.state,
        });
      }

      const response = await gateway.serviceAction(token, params.serviceId, actionName, {
        state: body.state,
        ...(body.payload ?? {}),
      });

      return {
        ...response,
        data: {
          ...asRecordValue(sanitizeExternalRedirects(response.data)),
          provider: 'paymenter-action',
          action: actionName,
        },
      };
    },
  });
});

app.post('/api/v1/services/:serviceId/server/reinstall', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    templateUuid: z.string().min(1).optional(),
    accountPassword: z.string().min(8).optional(),
    startOnCompletion: z.boolean().optional(),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'reinstall',
    requestPayload: {
      ...(body.payload ?? {}),
      ...(body.templateUuid ? { template_uuid: body.templateUuid } : {}),
      ...(body.accountPassword ? { account_password: body.accountPassword } : {}),
      ...(body.startOnCompletion !== undefined ? { start_on_completion: body.startOnCompletion } : {}),
    },
    successCode: 'SERVICE_REINSTALL_SUBMITTED',
    failureCode: 'SERVICE_REINSTALL_FAILED',
    run: async () => {
      const { service, buttons, serverRef } = await getServiceWithActions(token, params.serviceId);

      if (serverRef && convoyEnabled) {
        try {
          const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
          const serverSnapshot = await convoy.getServer(resolvedServerRef).catch(() => null);
          const serverData = (serverSnapshot?.data ?? {}) as Record<string, unknown>;
          const fallbackTemplateUuid = findServicePropertyValue(service, [
            'template_uuid',
            'convoy_template_uuid',
            'os',
            'image',
          ])
            || getStringValue(serverData.template_uuid)
            || getStringValue(serverData.os)
            || null;
          const templateUuid = body.templateUuid ?? fallbackTemplateUuid;
          const accountPassword = body.accountPassword ?? generateStrongPassword();
          const startOnCompletion = body.startOnCompletion ?? true;

          if (!templateUuid) {
            throw new GatewayError('Template mapping is missing for reinstall.', 409, {
              code: 'SERVICE_TEMPLATE_MAPPING_MISSING',
              expectedKeys: ['template_uuid', 'convoy_template_uuid', 'os'],
            });
          }

          const convoyPayload = {
            template_uuid: templateUuid,
            account_password: accountPassword,
            start_on_completion: startOnCompletion,
            ...(body.payload ?? {}),
          };

          const response = await convoy.reinstall(resolvedServerRef, convoyPayload);

            return {
              message: 'Server reinstall queued.',
              data: {
                provider: 'convoy',
                response: sanitizeExternalRedirects(response.data ?? {}),
              },
            };
        } catch (error) {
          if (error instanceof GatewayError && isMissingBackingVmError(error)) {
            throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'reinstall'));
          }

          if (error instanceof GatewayError && error.statusCode >= 500) {
            throw new GatewayError('Convoy reinstall action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'reinstall', error));
          }

          if (!shouldFallbackToActionBridge(error)) {
            throw error;
          }

          request.log.warn({
            serviceId: params.serviceId,
            action: 'reinstall',
            error,
          }, 'Convoy reinstall action failed, falling back to Paymenter action bridge.');
        }
      }

      const actionName = findActionName(buttons, ['reinstall', 'rebuild', 'reset-os', 'os-reinstall']);

      if (!actionName) {
        throw new GatewayError('Reinstall action is not available for this service.', 409, {
          code: 'SERVICE_ACTION_UNSUPPORTED',
          actionType: 'reinstall',
        });
      }

      const response = await gateway.serviceAction(token, params.serviceId, actionName, {
        ...(body.payload ?? {}),
        ...(body.templateUuid ? { template_uuid: body.templateUuid } : {}),
        ...(body.accountPassword ? { account_password: body.accountPassword } : {}),
        ...(body.startOnCompletion !== undefined ? { start_on_completion: body.startOnCompletion } : {}),
      });

      return {
        ...response,
        data: {
          ...asRecordValue(sanitizeExternalRedirects(response.data)),
          provider: 'paymenter-action',
          action: actionName,
        },
      };
    },
  });
});

app.post('/api/v1/services/:serviceId/server/reveal-password', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    password: z.string().min(8).optional(),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'reveal-password',
    requestPayload: {
      ...(body.password ? { password: body.password } : {}),
      ...(body.payload ?? {}),
    },
    successCode: 'SERVICE_PASSWORD_RETRIEVED',
    failureCode: 'SERVICE_PASSWORD_RETRIEVE_FAILED',
    run: async () => {
      const { service, buttons, serverRef } = await getServiceWithActions(token, params.serviceId);

      if (serverRef && convoyEnabled) {
        try {
          const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
          const serverSnapshot = await convoy.getServer(resolvedServerRef).catch(() => null);
          const convoyStatus = readConvoyServerStatus(serverSnapshot);
          if (convoyStatus && ['installing', 'deleting', 'deletion_failed'].includes(convoyStatus)) {
            throw new GatewayError('Server is not ready to rotate password yet.', 409, {
              code: 'SERVICE_SERVER_NOT_READY',
              status: convoyStatus,
              actionType: 'reveal-password',
            });
          }
          const requestedPassword = body.password ?? generateStrongPassword();
          const response = await convoy.rotatePassword(resolvedServerRef, {
            password: requestedPassword,
          });
          const password = extractPasswordFromConvoyPayload(response) ?? requestedPassword;

          if (password) {
            return {
              message: 'Server password has been rotated.',
              data: {
                provider: 'convoy',
                password,
              },
            };
          }
        } catch (error) {
          if (error instanceof GatewayError && isMissingBackingVmError(error)) {
            throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'reveal-password'));
          }

          if (error instanceof GatewayError && error.statusCode >= 500) {
            throw new GatewayError('Convoy password action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'reveal-password', error));
          }

          if (!shouldFallbackToActionBridge(error)) {
            throw error;
          }

          request.log.warn({
            serviceId: params.serviceId,
            action: 'reveal-password',
            error,
          }, 'Convoy credential lookup failed, falling back to Paymenter action bridge.');
        }
      }

      const actionName = findActionName(buttons, ['password', 'reveal', 'show-password']);

      if (!actionName) {
        throw new GatewayError('Reveal password action is not available for this service.', 409, {
          code: 'SERVICE_ACTION_UNSUPPORTED',
          actionType: 'reveal-password',
        });
      }

      const response = await gateway.serviceAction(token, params.serviceId, actionName, body.payload ?? {});

      return {
        ...response,
        data: {
          ...asRecordValue(sanitizeExternalRedirects(response.data)),
          provider: 'paymenter-action',
          action: actionName,
        },
      };
    },
  });
});

app.get('/api/v1/invoices', async (request) => {
  const query = z.object({
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(request.query);

  return gateway.invoices(requireToken(request), query.perPage ?? query.per_page ?? 20);
});

app.get('/api/v1/invoices/:invoiceId', async (request) => {
  const params = z.object({ invoiceId: z.string().min(1) }).parse(request.params);
  return gateway.invoice(requireToken(request), params.invoiceId);
});

app.post('/api/v1/invoices/:invoiceId/pay', async (request) => {
  const params = z.object({ invoiceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    method: z.enum(['credit', 'gateway', 'saved']),
    gatewayId: z.coerce.number().int().positive().optional(),
    billingAgreementUlid: z.string().optional(),
    setAsDefault: z.boolean().optional(),
  }).parse(request.body);

  return gateway.payInvoice(requireToken(request), params.invoiceId, body);
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode ?? 500)
    : 500;
  const payload = typeof error === 'object' && error && 'payload' in error
    ? (error as { payload?: unknown }).payload
    : undefined;

  if (payload !== undefined) {
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.message !== 'string' && typeof record.error !== 'string') {
        reply.status(statusCode).send({
          ...record,
          message: error instanceof Error ? error.message : 'Request failed.',
        });
        return;
      }
    }

    if (typeof payload !== 'object' || payload === null) {
      reply.status(statusCode).send({
        message: error instanceof Error ? error.message : 'Request failed.',
        payload,
      });
      return;
    }

    reply.status(statusCode).send(payload);
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';

  reply.status(statusCode).send({
    error: message,
    statusCode,
  });
});

await app.listen({
  port: env.PORT,
  host: '0.0.0.0',
});
