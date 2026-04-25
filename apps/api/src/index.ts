// @ts-nocheck
import { config as loadEnv } from 'dotenv';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
  AssistantOrchestrator,
  type AssistantActionProposal,
  type AssistantActionRequest,
  type AssistantContext,
  type AssistantInputAttachment,
} from './lib/assistant.js';
import {
  AssistantQuotaService,
  resolveAssistantModelCost,
} from './lib/assistant-quota.js';
import {
  extractAssistantRepoUrl,
  splitAssistantRepoInput,
} from './lib/assistant-repo-url.js';
import {
  classifyAssistantMessageRoute,
  type AssistantMessageRouteDecision,
} from './lib/assistant-message-routing.js';
import { probeAssistantProviderStatus } from './lib/assistant-provider-status.js';
import { resolveAssistantRunAvailability } from './lib/assistant-run-availability.js';
import { resolveAssistantDevelopmentMockAllowance } from './lib/assistant-runtime-mode.js';
import { CloudflareApiError, createCloudflareClient } from './lib/cloudflare.js';
import { createConvoyClient } from './lib/convoy.js';
import { createOperatorEngine, type OperatorEnvelope, type OperatorGenerationTask } from './lib/operator.js';
import {
  getWorkspaceArtifactLedgerLatestArtifactDetail,
  normalizeWorkspaceArtifactLedger,
  selectWorkspaceArtifactLedgerBlockingGaps,
} from './lib/operator-artifact-ledger.js';
import { createGateway, GatewayError, type CreateServiceOperationLogInput } from './lib/paymenter.js';
import {
  RemoteExecError,
  getRemotePlaybook,
  matchRemotePlaybook,
  runRemotePlaybook,
  type RemoteExecConnector,
  type RemotePlaybook,
} from './lib/remote-exec.js';
import { createManagedAppRuntimeManager, ManagedAppRuntimeError, type ServiceInput } from './lib/runtime/managed-app.js';
import { SessionStore } from './lib/session-store.js';
import type {
  CartSummary,
  ProductDetail,
  ProductPlan,
  ProductSummary,
  ServiceAppInstall,
  ServiceAppsResponse,
  ServiceDetail,
} from './lib/types.js';

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
  SESSION_TOKEN_COOKIE_NAME: z.string().min(1).default('sloth_at'),
  SESSION_COOKIE_SECURE: z.string().optional().default('false'),
  RUNTIME_READ_CACHE_TTL_MS: z.coerce.number().int().min(0).max(15_000).default(1_000),
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
  MANAGED_APP_BUILDKIT_SNAPSHOTTER: z.string().optional().default('native'),
  MANAGED_APP_BUILDKIT_ROOT_PATH: z.string().optional().default('/var/lib/buildkit'),
  MANAGED_APP_GIT_CLONE_IMAGE: z.string().optional().default('alpine/git:2.45.2'),
  MANAGED_APP_IMAGE_REGISTRY: z.string().optional(),
  MANAGED_APP_IMAGE_REPOSITORY_PREFIX: z.string().min(1).default('sloth-managed-apps'),
  MANAGED_APP_REGISTRY_AUTH_JSON: z.string().optional(),
  MANAGED_APP_INGRESS_CLASS: z.string().optional(),
  MANAGED_APP_DEFAULT_DOMAIN_SUFFIX: z.string().optional(),
  MANAGED_APP_CERT_ISSUER: z.string().optional(),
  MANAGED_APP_STORAGE_CLASS: z.string().optional(),
  ASSISTANT_ENABLED: z.string().optional().default('false'),
  ASSISTANT_PRIMARY_PROVIDER: z.enum(['openai', 'gemini', 'claude']).default('openai'),
  ASSISTANT_PROVIDER_CHAIN: z.string().optional().default('openai,gemini,claude'),
  ASSISTANT_OPENAI_API_KEY: z.string().optional(),
  ASSISTANT_OPENAI_MODEL: z.string().optional().default('gpt-5.4'),
  ASSISTANT_OPENAI_BASE_URL: z.string().optional(),
  ASSISTANT_GEMINI_API_KEY: z.string().optional(),
  ASSISTANT_GEMINI_MODEL: z.string().optional().default('gemini-2.5-pro-preview-05-06'),
  ASSISTANT_GEMINI_BASE_URL: z.string().optional(),
  ASSISTANT_CLAUDE_API_KEY: z.string().optional(),
  ASSISTANT_CLAUDE_MODEL: z.string().optional().default('claude-sonnet-4-0'),
  ASSISTANT_CLAUDE_BASE_URL: z.string().optional(),
  ASSISTANT_CONFIRM_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  ASSISTANT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  ASSISTANT_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(8).max(100).default(30),
  ASSISTANT_SUPPORT_WEB_URL: z.string().optional().default('/tickets'),
  ASSISTANT_TICKET_API_URL: z.string().optional(),
  ASSISTANT_TICKET_API_TOKEN: z.string().optional(),
  ASSISTANT_QUOTA_REDIS_URL: z.string().optional(),
  ASSISTANT_GUEST_DAILY_POINTS: z.coerce.number().int().positive().default(200_000),
  ASSISTANT_FREE_DAILY_POINTS: z.coerce.number().int().positive().default(2_000_000),
  ASSISTANT_PAID_DAILY_POINTS: z.coerce.number().int().positive().default(20_000_000),
  ASSISTANT_GUEST_BURST_PER_MINUTE: z.coerce.number().int().positive().default(5),
  ASSISTANT_USER_BURST_PER_MINUTE: z.coerce.number().int().positive().default(20),
  ASSISTANT_UNLIMITED_PRODUCT_SLUG: z.string().min(1).default('assistant-unlimited-monthly'),
  ASSISTANT_ALLOW_DEVELOPMENT_MOCK: z.string().optional().default('false'),
  ASSISTANT_QUOTA_COOKIE_SECRET: z.string().optional(),
  ASSISTANT_QUOTA_TIMEZONE: z.string().optional(),
  ASSISTANT_REMOTE_EXEC_SSH_KEY: z.string().optional(),
  ASSISTANT_REMOTE_EXEC_SSH_KEY_PATH: z.string().optional(),
  ASSISTANT_REMOTE_EXEC_SSH_KEY_PASSPHRASE: z.string().optional(),
  ASSISTANT_REMOTE_EXEC_AGENT_SOCKET: z.string().optional(),
  ASSISTANT_REMOTE_EXEC_DEFAULT_USERNAME: z.string().optional().default('root'),
  ASSISTANT_REMOTE_EXEC_DEFAULT_PORT: z.coerce.number().int().min(1).max(65535).optional().default(22),
  OPERATOR_STATE_FILE: z.string().optional(),
  OPERATOR_PREVIEW_BASE_URL: z.string().url().optional(),
  OPERATOR_ARTIFACT_BASE_URL: z.string().url().optional(),
  OPERATOR_WEB_BASE_URL: z.string().url().optional(),
  OPERATOR_CLOUDFLARE_API_TOKEN: z.string().optional(),
  OPERATOR_CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  OPERATOR_CLOUDFLARE_ZONE_ID: z.string().optional(),
  OPERATOR_CLOUDFLARE_ZONE_NAME: z.string().optional(),
  OPERATOR_CLOUDFLARE_DEFAULT_TUNNEL_ID: z.string().optional(),
  OPERATOR_CLOUDFLARE_TUNNEL_SERVICE: z.string().optional(),
  OPERATOR_MONITORING_WEBHOOK_BASE_URL: z.string().url().optional(),
  OPERATOR_MONITORING_WEBHOOK_SECRET: z.string().optional(),
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
const assistantEnabled = env.ASSISTANT_ENABLED.toLowerCase() === 'true';
const assistantAllowDevelopmentMock = resolveAssistantDevelopmentMockAllowance({
  nodeEnv: process.env.NODE_ENV,
  explicitFlag: env.ASSISTANT_ALLOW_DEVELOPMENT_MOCK.toLowerCase() === 'true',
});
const assistantRemoteExecDefaultUsername = (env.ASSISTANT_REMOTE_EXEC_DEFAULT_USERNAME || 'root').trim() || 'root';
const assistantRemoteExecDefaultPort = Number.isFinite(env.ASSISTANT_REMOTE_EXEC_DEFAULT_PORT)
  ? Number(env.ASSISTANT_REMOTE_EXEC_DEFAULT_PORT)
  : 22;
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
  buildkitSnapshotter: env.MANAGED_APP_BUILDKIT_SNAPSHOTTER,
  buildkitRootPath: env.MANAGED_APP_BUILDKIT_ROOT_PATH,
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

const assistantProviderChain = env.ASSISTANT_PROVIDER_CHAIN.split(',')
  .map((value) => value.trim().toLowerCase())
  .filter((value): value is 'openai' | 'gemini' | 'claude' => value === 'openai' || value === 'gemini' || value === 'claude');

const assistantProviders = [
  {
    name: 'openai' as const,
    apiKey: env.ASSISTANT_OPENAI_API_KEY ?? null,
    baseUrl: env.ASSISTANT_OPENAI_BASE_URL ?? null,
    model: env.ASSISTANT_OPENAI_MODEL ?? null,
  },
  {
    name: 'gemini' as const,
    apiKey: env.ASSISTANT_GEMINI_API_KEY ?? null,
    baseUrl: env.ASSISTANT_GEMINI_BASE_URL ?? null,
    model: env.ASSISTANT_GEMINI_MODEL ?? null,
  },
  {
    name: 'claude' as const,
    apiKey: env.ASSISTANT_CLAUDE_API_KEY ?? null,
    baseUrl: env.ASSISTANT_CLAUDE_BASE_URL ?? null,
    model: env.ASSISTANT_CLAUDE_MODEL ?? null,
  },
];

const orderedAssistantProviders = assistantProviderChain.length > 0
  ? assistantProviderChain
    .map((name) => assistantProviders.find((provider) => provider.name === name))
    .filter((provider): provider is (typeof assistantProviders)[number] => Boolean(provider))
  : assistantProviders;

const assistantOrchestrator = new AssistantOrchestrator({
  enabled: assistantEnabled,
  primaryProvider: env.ASSISTANT_PRIMARY_PROVIDER,
  providers: orderedAssistantProviders,
  confirmTtlMs: env.ASSISTANT_CONFIRM_TTL_SECONDS * 1000,
  sessionTtlMs: env.ASSISTANT_SESSION_TTL_SECONDS * 1000,
  maxContextMessages: env.ASSISTANT_MAX_CONTEXT_MESSAGES,
  logger: app.log,
});
const assistantQuota = new AssistantQuotaService({
  redisUrl: env.ASSISTANT_QUOTA_REDIS_URL ?? null,
  guestDailyPoints: env.ASSISTANT_GUEST_DAILY_POINTS,
  freeDailyPoints: env.ASSISTANT_FREE_DAILY_POINTS,
  paidDailyPoints: env.ASSISTANT_PAID_DAILY_POINTS,
  guestBurstPerMinute: env.ASSISTANT_GUEST_BURST_PER_MINUTE,
  userBurstPerMinute: env.ASSISTANT_USER_BURST_PER_MINUTE,
  unlimitedProductSlug: env.ASSISTANT_UNLIMITED_PRODUCT_SLUG,
  guestCookieSecret: env.ASSISTANT_QUOTA_COOKIE_SECRET ?? null,
  siteTimeZone: env.ASSISTANT_QUOTA_TIMEZONE ?? null,
  logger: app.log,
});
const assistantProviderStatusCacheTtlMs = 15_000;
let assistantProviderStatusCache:
  | {
    expiresAt: number;
    value: Awaited<ReturnType<typeof probeAssistantProviderStatus>>;
  }
  | null = null;
let assistantProviderStatusInflight: Promise<Awaited<ReturnType<typeof probeAssistantProviderStatus>>> | null = null;

app.log.info({
  paymenterMode: effectivePaymenterMode,
  configuredPaymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
  convoyEnabled,
  convoyBaseUrl: env.CONVOY_BASE_URL ?? null,
  managedAppEnabled,
  managedAppDriver: env.MANAGED_APP_DRIVER,
  assistantEnabled,
  assistantPrimaryProvider: env.ASSISTANT_PRIMARY_PROVIDER,
  assistantQuotaRedisUrl: env.ASSISTANT_QUOTA_REDIS_URL ?? null,
  assistantRemoteExecSshKeyConfigured: Boolean(getStringValue(env.ASSISTANT_REMOTE_EXEC_SSH_KEY)),
  assistantRemoteExecSshKeyPathConfigured: Boolean(getStringValue(env.ASSISTANT_REMOTE_EXEC_SSH_KEY_PATH)),
  assistantRemoteExecAgentSocketConfigured: Boolean(getStringValue(env.ASSISTANT_REMOTE_EXEC_AGENT_SOCKET)),
}, 'Sloth Cloud API environment loaded');

await app.register(cors, {
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sloth-Origin', 'X-Frontend-Origin'],
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
const referralCookieName = 'sloth_referral';
const referralCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
const runtimeReadCacheTtlMs = env.RUNTIME_READ_CACHE_TTL_MS;
const runtimeReadCache = new Map<string, { expiresAt: number; value: unknown }>();
const operatorStateFilePath = env.OPERATOR_STATE_FILE
  ? resolve(env.OPERATOR_STATE_FILE)
  : resolve(currentDir, '../../../runtime/data/operator/capsules.json');
const operatorPreviewNodeModulesPath = [
  resolve(currentDir, '../node_modules'),
  resolve(currentDir, '../../web/node_modules'),
  resolve(currentDir, '../../../node_modules'),
].find((candidate) => existsSync(resolve(candidate, 'vite', 'bin', 'vite.js'))) ?? null;
const operatorEngine = createOperatorEngine({
  previewDomainSuffix: env.MANAGED_APP_DEFAULT_DOMAIN_SUFFIX
    ? `preview.${env.MANAGED_APP_DEFAULT_DOMAIN_SUFFIX.replace(/^\.+/, '')}`
    : undefined,
  previewBaseUrl: env.OPERATOR_PREVIEW_BASE_URL ?? `http://localhost:${env.PORT}`,
  artifactBaseUrl: env.OPERATOR_ARTIFACT_BASE_URL ?? env.OPERATOR_PREVIEW_BASE_URL ?? `http://localhost:${env.PORT}`,
  productionDomainSuffix: env.MANAGED_APP_DEFAULT_DOMAIN_SUFFIX ?? undefined,
  stateFilePath: operatorStateFilePath,
  previewBuildNodeModulesPath: operatorPreviewNodeModulesPath,
  executionProviders: orderedAssistantProviders,
});
const operatorWebBaseUrl = env.OPERATOR_WEB_BASE_URL ?? null;
const operatorMonitoringWebhookBaseUrl = env.OPERATOR_MONITORING_WEBHOOK_BASE_URL
  ?? operatorWebBaseUrl
  ?? env.OPERATOR_PREVIEW_BASE_URL
  ?? null;
const cloudflare = createCloudflareClient({
  apiToken: env.OPERATOR_CLOUDFLARE_API_TOKEN ?? '',
  accountId: env.OPERATOR_CLOUDFLARE_ACCOUNT_ID ?? null,
});
const operatorMonitoringRelays = new Map<string, {
  capsuleId: string;
  monitorUrl: string;
  channels: {
    feishuWebhookUrl: string | null;
    telegramBotToken: string | null;
    telegramChatId: string | null;
  };
  updatedAt: string;
}>();
type OperatorLocalMonitorStatus = 'unknown' | 'healthy' | 'unhealthy';
type OperatorLocalMonitorRecord = {
  capsuleId: string;
  monitorUrl: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  channels: {
    feishuWebhookUrl: string | null;
    telegramBotToken: string | null;
    telegramChatId: string | null;
  };
  enabledAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  lastStatus: OperatorLocalMonitorStatus;
  lastStatusCode: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
};
const operatorLocalMonitorRecordSchema = z.object({
  capsuleId: z.string().min(1),
  monitorUrl: z.string().url(),
  intervalSeconds: z.number().int().min(30).max(1800),
  timeoutSeconds: z.number().int().min(2).max(30),
  channels: z.object({
    feishuWebhookUrl: z.string().url().nullable(),
    telegramBotToken: z.string().nullable(),
    telegramChatId: z.string().nullable(),
  }),
  enabledAt: z.string(),
  updatedAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  lastStatus: z.enum(['unknown', 'healthy', 'unhealthy']),
  lastStatusCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().min(0),
  consecutiveSuccesses: z.number().int().min(0),
});
const operatorLocalMonitorStateFilePath = resolve(dirname(operatorStateFilePath), 'local-monitors.json');
const operatorLocalMonitors = new Map<string, OperatorLocalMonitorRecord>();
const operatorLocalMonitorTimers = new Map<string, ReturnType<typeof setInterval>>();
app.addHook('onClose', async () => {
  for (const timer of operatorLocalMonitorTimers.values()) {
    clearInterval(timer);
  }
  operatorLocalMonitorTimers.clear();
  await assistantQuota.close();
});

function resolveToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string') {
    const matched = authorization.match(/^Bearer\s+(.+)$/i);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }

  const tokenCookie = getStringValue(request.cookies[env.SESSION_TOKEN_COOKIE_NAME]);
  if (tokenCookie) {
    return tokenCookie;
  }

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
  reply.setCookie(env.SESSION_TOKEN_COOKIE_NAME, accessToken, {
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
  reply.clearCookie(env.SESSION_TOKEN_COOKIE_NAME, {
    path: '/',
    sameSite: 'lax',
    secure: isSecureCookie,
  });
}

function readReferralCode(request: FastifyRequest) {
  const value = getStringValue(request.cookies[referralCookieName]);
  return value !== '' ? value : null;
}

function writeReferralCookie(reply: FastifyReply, code: string) {
  reply.setCookie(referralCookieName, code, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie,
    maxAge: referralCookieMaxAgeSeconds,
  });
}

function clearReferralCookie(reply: FastifyReply) {
  reply.clearCookie(referralCookieName, {
    path: '/',
    sameSite: 'lax',
    secure: isSecureCookie,
  });
}

function operatorMeta() {
  return {
    generatedAt: new Date().toISOString(),
    sourceMode: effectivePaymenterMode,
  };
}

type OperatorCommerceIntent = 'ai-managed-launch' | 'vps-self-hosted' | 'server-migration';

interface OperatorCommerceSelection {
  product: ProductDetail;
  plan: ProductPlan;
  intent: OperatorCommerceIntent;
  reason: string;
}

function productCategoryFullSlug(category: ProductSummary['category'] | ProductDetail['category']) {
  if (!category || !('fullSlug' in category)) {
    return null;
  }

  return category.fullSlug;
}

function defaultOperatorCommerceIntent(envelope: OperatorEnvelope): OperatorCommerceIntent {
  return envelope.capsule.entryKind === 'scan-server' ? 'server-migration' : 'ai-managed-launch';
}

function operatorCommerceIntent(
  envelope: OperatorEnvelope,
  offerKind?: OperatorCommerceIntent | null,
): OperatorCommerceIntent {
  return offerKind ?? defaultOperatorCommerceIntent(envelope);
}

function operatorProductText(product: ProductSummary | ProductDetail) {
  const category = product.category;
  return [
    product.slug,
    product.name,
    product.description,
    product.runtimeKind,
    category?.slug,
    productCategoryFullSlug(category),
    category?.name,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function containsAny(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function scoreOperatorProduct(product: ProductSummary, intent: OperatorCommerceIntent) {
  const text = operatorProductText(product);
  let score = 0;

  if (product.stock === 0) {
    score -= 1000;
  }

  if (intent === 'ai-managed-launch') {
    if (product.runtimeKind === 'managed-app') score += 120;
    if (containsAny(text, ['app-hosting', 'managed-app', 'managed app', 'app-starter', 'app-standard'])) score += 80;
    if (containsAny(text, ['vps', 'server'])) score -= 40;
  } else {
    if (product.runtimeKind === 'vps') score += 120;
    if (containsAny(text, ['vps', 'server', 'cloud vps', 'compute'])) score += 70;
    if (containsAny(text, ['app-hosting', 'managed-app'])) score -= 35;
  }

  if (product.pricing?.planId) {
    score += 10;
  }

  if (product.slug.includes('starter') || product.slug.includes('1c1g')) {
    score += 8;
  }

  return score;
}

function selectOperatorPlan(product: ProductDetail, preferredPlanId?: string | null) {
  const cleanPreferredPlanId = preferredPlanId?.trim();
  if (cleanPreferredPlanId) {
    const matchedPlan = product.plans.find((plan) => plan.id === cleanPreferredPlanId);
    if (matchedPlan) {
      return matchedPlan;
    }

    throw new GatewayError('Selected product plan is not available for this capsule.', 409, {
      code: 'operator_plan_unavailable',
      productSlug: product.slug,
      planId: cleanPreferredPlanId,
    });
  }

  const plans = product.plans
    .filter((plan) => plan.id.length > 0)
    .sort((left, right) => {
      const sortDelta = (left.sort ?? 9999) - (right.sort ?? 9999);
      if (sortDelta !== 0) {
        return sortDelta;
      }

      return left.id.localeCompare(right.id);
    });

  return plans.find((plan) => plan.billingUnit === 'month' && plan.billingPeriod === 1)
    ?? plans.find((plan) => plan.type === 'recurring')
    ?? plans[0]
    ?? null;
}

function summarizeOperatorProduct(product: ProductDetail) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    runtimeKind: product.runtimeKind ?? null,
    category: product.category ? {
      id: product.category.id,
      slug: product.category.slug,
      fullSlug: product.category.fullSlug,
      name: product.category.name,
    } : null,
  };
}

function summarizeOperatorPlan(plan: ProductPlan) {
  return {
    id: plan.id,
    name: plan.name,
    type: plan.type,
    billingPeriod: plan.billingPeriod,
    billingUnit: plan.billingUnit,
  };
}

function sourceLabelForOperatorCapsule(envelope: OperatorEnvelope) {
  return envelope.capsule.source.repoUrl
    ?? envelope.capsule.source.serverHost
    ?? envelope.capsule.source.idea
    ?? 'AI generated project';
}

function syntheticRepoUrlForOperatorCapsule(envelope: OperatorEnvelope) {
  return `https://github.com/sloth-cloud/ai-generated-${envelope.capsule.slug}`;
}

function operatorSourcePackageUrl(envelope: OperatorEnvelope) {
  const sourceRepoUrl = envelope.capsule.source.repoUrl?.trim() ?? '';
  if (sourceRepoUrl) {
    return sourceRepoUrl;
  }

  const generatedArchiveUrl = envelope.generatedProject?.archiveUrl?.trim() ?? '';
  if (generatedArchiveUrl) {
    return generatedArchiveUrl;
  }

  return syntheticRepoUrlForOperatorCapsule(envelope);
}

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function inferOperatorRuntimePort(envelope: OperatorEnvelope) {
  const text = `${envelope.capsule.stackLabel} ${envelope.infraSummary.runtime}`.toLowerCase();
  if (text.includes('laravel') || text.includes('php') || text.includes('container')) {
    return 8080;
  }
  if (text.includes('python') || text.includes('django') || text.includes('flask') || text.includes('fastapi')) {
    return 8000;
  }
  if (text.includes('static')) {
    return 80;
  }
  return 3000;
}

function defaultOperatorCheckoutFieldValue(
  field: ProductDetail['checkoutFields'][number],
  envelope: OperatorEnvelope,
): unknown {
  const token = normalizeConfigToken(field.name);
  const repoUrl = operatorSourcePackageUrl(envelope);
  const endpoint = envelope.capsule.productionUrl ?? envelope.capsule.previewUrl;
  const endpointHost = hostFromUrl(endpoint);

  if (token === 'git_repo_url' || (token.includes('git') && token.includes('repo'))) {
    return repoUrl;
  }

  if (token === 'git_branch' || token.includes('branch')) {
    return 'main';
  }

  if (token === 'git_context_dir') {
    return '/';
  }

  if (token === 'dockerfile_path') {
    return 'Dockerfile';
  }

  if (token === 'compose_file_path' || token === 'compose_service_name') {
    return '';
  }

  if (token.includes('runtime') && token.includes('port')) {
    return inferOperatorRuntimePort(envelope);
  }

  if (token === 'domain_limit') {
    return 1;
  }

  if (token === 'env_var_limit') {
    return 20;
  }

  if (token === 'log_retention_days') {
    return 7;
  }

  if (token === 'persistent_storage_size') {
    return '5Gi';
  }

  if (token === 'replica_limit') {
    return 1;
  }

  if (token === 'workload_mode') {
    return 'deployment';
  }

  if (token === 'allow_scale') {
    return false;
  }

  if (token === 'env_vars') {
    return '';
  }

  if (token.includes('hostname')) {
    return `${envelope.capsule.slug}.sloth.local`;
  }

  if (token === 'domain' || token.endsWith('_domain') || token.includes('hostname')) {
    return endpointHost ?? `${envelope.capsule.slug}.sloth.run`;
  }

  if (token.includes('domain')) {
    return endpointHost ?? `${envelope.capsule.slug}.sloth.run`;
  }

  if (token.includes('project') || token.includes('app_name') || token.includes('service_name') || token === 'name') {
    return envelope.capsule.name;
  }

  if (token.includes('source')) {
    return sourceLabelForOperatorCapsule(envelope);
  }

  if (field.default !== null && field.default !== undefined) {
    return field.default;
  }

  if (field.options[0]?.value) {
    return field.options[0].value;
  }

  if (field.type === 'checkbox') {
    return false;
  }

  if (field.type === 'multiselect' || field.type === 'json-array') {
    return [];
  }

  return '';
}

function buildOperatorCheckoutConfig(
  envelope: OperatorEnvelope,
  product: ProductDetail,
  intent: OperatorCommerceIntent,
  overrides: Record<string, unknown>,
) {
  const baseConfig: Record<string, unknown> = {
    operator_capsule_id: envelope.capsule.id,
    operator_capsule_name: envelope.capsule.name,
    operator_entry_kind: envelope.capsule.entryKind,
    operator_stack: envelope.capsule.stackLabel,
    operator_business_path: intent,
    operator_business_label: intent === 'server-migration'
      ? 'server migration'
      : intent === 'vps-self-hosted'
        ? 'vps self hosted'
        : 'ai managed launch',
    operator_source: sourceLabelForOperatorCapsule(envelope),
    operator_preview_url: envelope.capsule.previewUrl,
    operator_production_url: envelope.capsule.productionUrl,
    operator_plan_summary: envelope.plan.summary,
    operator_project_bundle_url: envelope.generatedProject?.archiveUrl ?? null,
    operator_project_manifest_url: envelope.generatedProject?.manifestUrl ?? null,
    operator_project_archive_name: envelope.generatedProject?.archiveName ?? null,
    operator_project_entry_file: envelope.generatedProject?.entryFile ?? null,
    operator_project_file_count: envelope.generatedProject?.files.length ?? null,
  };

  for (const field of product.checkoutFields) {
    if (Object.prototype.hasOwnProperty.call(baseConfig, field.name)) {
      continue;
    }

    baseConfig[field.name] = defaultOperatorCheckoutFieldValue(field, envelope);
  }

  return Object.fromEntries(
    Object.entries({ ...baseConfig, ...overrides }).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }

      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return true;
    }),
  );
}

function buildOperatorConfigOptions(product: ProductDetail, overrides: Record<string, unknown>) {
  const defaults: Record<string, unknown> = {};

  for (const option of product.configOptions) {
    if (Object.prototype.hasOwnProperty.call(overrides, option.id)) {
      continue;
    }

    if (['select', 'radio'].includes(option.type)) {
      const defaultChoice = option.children[0];
      if (defaultChoice) {
        defaults[option.id] = defaultChoice.id;
      }
    }
  }

  return {
    ...defaults,
    ...overrides,
  };
}

async function resolveOperatorCommerceSelection(
  envelope: OperatorEnvelope,
  offerKind?: OperatorCommerceIntent | null,
  preferredProductSlug?: string | null,
  preferredPlanId?: string | null,
): Promise<OperatorCommerceSelection> {
  const intent = operatorCommerceIntent(envelope, offerKind);
  const productSlug = preferredProductSlug?.trim();

  if (productSlug) {
    const product = (await gateway.product(productSlug, { visibility: 'all' })).data;
    const plan = selectOperatorPlan(product, preferredPlanId);

    if (!plan) {
      throw new GatewayError('Selected product has no available billing plan.', 409, {
        code: 'operator_product_has_no_plan',
        productSlug: product.slug,
      });
    }

    return {
      product,
      plan,
      intent,
      reason: 'customer_selected_product',
    };
  }

  const productsResponse = await gateway.products(undefined, 100, { visibility: 'all' });
  const candidates = productsResponse.data
    .map((product, index) => ({
      product,
      index,
      score: scoreOperatorProduct(product, intent),
    }))
    .filter((entry) => entry.score > -500)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const orderedProducts = candidates.length > 0
    ? candidates.map((entry) => entry.product)
    : productsResponse.data;
  const failures: Array<{ productSlug: string; message: string }> = [];

  for (const productSummary of orderedProducts.slice(0, 12)) {
    try {
      const product = (await gateway.product(productSummary.slug, { visibility: 'all' })).data;
      const plan = selectOperatorPlan(product, preferredPlanId ?? productSummary.pricing?.planId ?? null);
      if (plan) {
        return {
          product,
          plan,
          intent,
          reason: intent === 'ai-managed-launch'
            ? 'recommended_ai_managed_launch_product'
            : intent === 'server-migration'
              ? 'recommended_server_migration_product'
              : 'recommended_vps_self_hosted_product',
        };
      }
    } catch (error) {
      failures.push({
        productSlug: productSummary.slug,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  throw new GatewayError('No suitable Sloth Cloud product is available for this capsule yet.', 409, {
    code: 'operator_product_unavailable',
    intent,
    failures,
  });
}

function cartContainsOperatorCapsule(cart: CartSummary, capsuleId: string) {
  return cart.items.some((item) => item.checkoutConfig.operator_capsule_id === capsuleId);
}

function isDuplicateCartError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('already in your cart')
    || message.includes('already in cart')
    || message.includes('cannot be added again');
}

async function withRuntimeReadCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = runtimeReadCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  runtimeReadCache.set(key, {
    expiresAt: now + runtimeReadCacheTtlMs,
    value,
  });

  if (runtimeReadCache.size > 500) {
    for (const [entryKey, entry] of runtimeReadCache.entries()) {
      if (entry.expiresAt <= now) {
        runtimeReadCache.delete(entryKey);
      }
    }
  }

  return value;
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

function normalizeConfigToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveZoneNameFromHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) {
    return null;
  }

  const segments = normalized.split('.').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  return segments.slice(-2).join('.');
}

async function resolveOperatorZoneId(hostname: string, input: {
  zoneId?: string | null;
  zoneName?: string | null;
}) {
  if (!cloudflare) {
    throw new GatewayError('Cloudflare integration is not configured.', 503, {
      code: 'operator_cloudflare_not_configured',
      detail: 'Set OPERATOR_CLOUDFLARE_API_TOKEN before binding domains or monitoring.',
    });
  }

  const resolved = await cloudflare.resolveZone({
    zoneId: input.zoneId ?? env.OPERATOR_CLOUDFLARE_ZONE_ID ?? null,
    zoneName: input.zoneName ?? env.OPERATOR_CLOUDFLARE_ZONE_NAME ?? deriveZoneNameFromHostname(hostname),
  });
  if (!resolved) {
    throw new GatewayError('Cloudflare zone could not be resolved for this hostname.', 404, {
      code: 'operator_cloudflare_zone_not_found',
      hostname,
    });
  }

  return resolved;
}

function buildAbsoluteCapsuleUrl(request: FastifyRequest, capsulePath: string) {
  if (operatorWebBaseUrl) {
    return `${operatorWebBaseUrl.replace(/\/+$/, '')}${capsulePath}`;
  }

  const originHeader = getStringValue(request.headers.origin);
  if (originHeader) {
    return `${originHeader.replace(/\/+$/, '')}${capsulePath}`;
  }

  return capsulePath;
}

function buildOperatorWorkbenchPath(capsuleId: string | null | undefined) {
  const normalizedCapsuleId = getStringValue(capsuleId);
  return normalizedCapsuleId
    ? `/operator-lab/${normalizedCapsuleId}`
    : '/operator-lab';
}

async function sendFeishuNotification(webhookUrl: string, text: string) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook returned HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const code = Number((payload as { code?: unknown }).code ?? (payload as { StatusCode?: unknown }).StatusCode ?? 0);
  if (Number.isFinite(code) && code !== 0) {
    throw new Error(`Feishu webhook rejected the message (code ${code}).`);
  }
}

async function sendTelegramNotification(botToken: string, chatId: string, text: string) {
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API returned HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  if ((payload as { ok?: boolean }).ok !== true) {
    throw new Error('Telegram API rejected the message.');
  }
}

async function dispatchOperatorAlertChannels(input: {
  feishuWebhookUrl?: string | null;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  text: string;
}) {
  const sent: string[] = [];
  const failed: string[] = [];
  const cleanFeishu = getStringValue(input.feishuWebhookUrl);
  const cleanTelegramToken = getStringValue(input.telegramBotToken);
  const cleanTelegramChatId = getStringValue(input.telegramChatId);

  if (cleanFeishu) {
    try {
      await sendFeishuNotification(cleanFeishu, input.text);
      sent.push('Feishu');
    } catch (error) {
      failed.push(`Feishu: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (cleanTelegramToken && cleanTelegramChatId) {
    try {
      await sendTelegramNotification(cleanTelegramToken, cleanTelegramChatId, input.text);
      sent.push('Telegram');
    } catch (error) {
      failed.push(`Telegram: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return {
    sent,
    failed,
  };
}

function persistOperatorLocalMonitors() {
  try {
    mkdirSync(dirname(operatorLocalMonitorStateFilePath), { recursive: true });
    writeFileSync(operatorLocalMonitorStateFilePath, JSON.stringify({
      version: 1,
      monitors: [...operatorLocalMonitors.values()],
    }, null, 2));
  } catch {
    // Best-effort persistence for local development.
  }
}

function hydrateOperatorLocalMonitors() {
  if (!existsSync(operatorLocalMonitorStateFilePath)) {
    return;
  }

  try {
    const payload = JSON.parse(readFileSync(operatorLocalMonitorStateFilePath, 'utf8')) as {
      monitors?: unknown[];
    };
    const monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
    for (const candidate of monitors) {
      const parsed = operatorLocalMonitorRecordSchema.safeParse(candidate);
      if (!parsed.success) {
        continue;
      }
      operatorLocalMonitors.set(parsed.data.capsuleId, parsed.data);
    }
  } catch {
    // Ignore invalid local monitor state and continue with an empty map.
  }
}

function clearOperatorLocalMonitorTimer(capsuleId: string) {
  const timer = operatorLocalMonitorTimers.get(capsuleId);
  if (timer) {
    clearInterval(timer);
    operatorLocalMonitorTimers.delete(capsuleId);
  }
}

function shouldFallbackToLocalMonitoring(error: unknown) {
  if (error instanceof GatewayError) {
    const payload = asRecordValue(error.payload ?? {});
    const code = getStringValue(payload.code);
    const detail = `${error.message} ${getStringValue(payload.detail)}`.toLowerCase();
    const cloudflareCode = Number(payload.cloudflareCode ?? Number.NaN);
    return code === 'operator_cloudflare_not_configured'
      || cloudflareCode === 1002
      || detail.includes('health checks disabled')
      || detail.includes('health check')
      || detail.includes('smart shield');
  }

  if (error instanceof CloudflareApiError) {
    const detail = `${error.message}`.toLowerCase();
    const cloudflareCode = extractCloudflareErrorCode(error.details);
    return cloudflareCode === 1002
      || detail.includes('health checks disabled')
      || detail.includes('smart shield');
  }

  return false;
}

function buildLocalMonitorAlertText(input: {
  record: OperatorLocalMonitorRecord;
  status: OperatorLocalMonitorStatus;
  checkedAt: string;
  statusCode: number | null;
  error: string | null;
  previousStatus: OperatorLocalMonitorStatus;
}) {
  const statusLabel = input.status === 'healthy' ? 'healthy' : 'unhealthy';
  const details = input.status === 'healthy'
    ? (input.statusCode ? `HTTP ${input.statusCode}` : 'Probe succeeded')
    : (input.error || (input.statusCode ? `HTTP ${input.statusCode}` : 'Probe failed'));
  const previousLabel = input.previousStatus === 'unknown' ? 'unknown' : input.previousStatus;

  return [
    `Sloth Cloud local monitor`,
    `Capsule: ${input.record.capsuleId}`,
    `Monitor: ${input.record.monitorUrl}`,
    `Status: ${statusLabel}`,
    `Previous: ${previousLabel}`,
    `Detail: ${details}`,
    `Checked at: ${input.checkedAt}`,
  ].join('\n');
}

async function runOperatorLocalMonitorProbe(capsuleId: string) {
  const record = operatorLocalMonitors.get(capsuleId);
  if (!record) {
    return null;
  }

  const previousStatus = record.lastStatus;
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), record.timeoutSeconds * 1000);

  let nextStatus: OperatorLocalMonitorStatus = 'unhealthy';
  let nextStatusCode: number | null = null;
  let nextError: string | null = null;

  try {
    const response = await fetch(record.monitorUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'SlothCloudLocalMonitor/1.0',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    nextStatusCode = response.status;
    nextStatus = response.status >= 200 && response.status < 400 ? 'healthy' : 'unhealthy';
    nextError = nextStatus === 'healthy' ? null : `HTTP ${response.status}`;
    try {
      await response.body?.cancel();
    } catch {
      // Ignore body cancellation failures; the probe only cares about headers/status.
    }
  } catch (error) {
    nextStatus = 'unhealthy';
    nextError = error instanceof Error
      ? (error.name === 'AbortError' ? `Timeout after ${record.timeoutSeconds}s` : error.message)
      : 'Unknown probe failure';
  } finally {
    clearTimeout(timeout);
  }

  record.updatedAt = checkedAt;
  record.lastCheckedAt = checkedAt;
  record.lastStatus = nextStatus;
  record.lastStatusCode = nextStatusCode;
  record.lastError = nextError;
  if (nextStatus === 'healthy') {
    record.consecutiveSuccesses += 1;
    record.consecutiveFailures = 0;
  } else {
    record.consecutiveFailures += 1;
    record.consecutiveSuccesses = 0;
  }
  operatorLocalMonitors.set(capsuleId, record);
  persistOperatorLocalMonitors();

  const shouldRecordTransition = previousStatus !== nextStatus && !(previousStatus === 'unknown' && nextStatus === 'healthy');
  if (shouldRecordTransition) {
    operatorEngine.recordMonitoringTransition({
      capsuleId,
      status: nextStatus,
      monitorUrl: record.monitorUrl,
      checkedAt,
      detail: nextStatus === 'healthy'
        ? `Local monitor recovered${nextStatusCode ? ` with HTTP ${nextStatusCode}` : ''} at ${record.monitorUrl}.`
        : `Local monitor detected an unhealthy service at ${record.monitorUrl}${nextError ? `: ${nextError}` : '.'}`,
    });
  }

  const shouldNotify = (previousStatus !== nextStatus && previousStatus !== 'unknown')
    || (previousStatus === 'unknown' && nextStatus === 'unhealthy');
  const dispatched = shouldNotify
    ? await dispatchOperatorAlertChannels({
        feishuWebhookUrl: record.channels.feishuWebhookUrl,
        telegramBotToken: record.channels.telegramBotToken,
        telegramChatId: record.channels.telegramChatId,
        text: buildLocalMonitorAlertText({
          record,
          status: nextStatus,
          checkedAt,
          statusCode: nextStatusCode,
          error: nextError,
          previousStatus,
        }),
      })
    : { sent: [], failed: [] };

  return {
    checkedAt,
    status: nextStatus,
    statusCode: nextStatusCode,
    error: nextError,
    stateChanged: previousStatus !== nextStatus,
    dispatched,
  };
}

function scheduleOperatorLocalMonitor(capsuleId: string) {
  clearOperatorLocalMonitorTimer(capsuleId);
  const record = operatorLocalMonitors.get(capsuleId);
  if (!record) {
    return;
  }

  const timer = setInterval(() => {
    void runOperatorLocalMonitorProbe(capsuleId);
  }, record.intervalSeconds * 1000);
  timer.unref();
  operatorLocalMonitorTimers.set(capsuleId, timer);
}

async function enableOperatorLocalMonitoring(input: {
  capsuleId: string;
  monitorUrl: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  emailRecipients?: string[];
  feishuWebhookUrl?: string | null;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  fallbackReason?: string | null;
}) {
  const existing = operatorLocalMonitors.get(input.capsuleId);
  const enabledAt = existing?.enabledAt ?? new Date().toISOString();
  const intervalSeconds = input.intervalSeconds ?? 60;
  const timeoutSeconds = input.timeoutSeconds ?? 5;
  const emailRecipients = (input.emailRecipients ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  const record: OperatorLocalMonitorRecord = {
    capsuleId: input.capsuleId,
    monitorUrl: input.monitorUrl,
    intervalSeconds,
    timeoutSeconds,
    channels: {
      feishuWebhookUrl: getStringValue(input.feishuWebhookUrl) || null,
      telegramBotToken: getStringValue(input.telegramBotToken) || null,
      telegramChatId: getStringValue(input.telegramChatId) || null,
    },
    enabledAt,
    updatedAt: new Date().toISOString(),
    lastCheckedAt: existing?.lastCheckedAt ?? null,
    lastStatus: existing?.lastStatus ?? 'unknown',
    lastStatusCode: existing?.lastStatusCode ?? null,
    lastError: existing?.lastError ?? null,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    consecutiveSuccesses: existing?.consecutiveSuccesses ?? 0,
  };

  operatorLocalMonitors.set(input.capsuleId, record);
  persistOperatorLocalMonitors();
  scheduleOperatorLocalMonitor(input.capsuleId);

  const probeResult = await runOperatorLocalMonitorProbe(input.capsuleId);
  const testResult = await dispatchOperatorAlertChannels({
    feishuWebhookUrl: record.channels.feishuWebhookUrl,
    telegramBotToken: record.channels.telegramBotToken,
    telegramChatId: record.channels.telegramChatId,
    text: `Sloth Cloud local monitor enabled for ${record.monitorUrl} (capsule ${record.capsuleId}).`,
  });
  const channels: string[] = [
    ...(emailRecipients.length > 0 ? [`Email requested (${emailRecipients.length}, unavailable in local mode)`] : []),
    ...(record.channels.feishuWebhookUrl ? ['Feishu'] : []),
    ...(record.channels.telegramBotToken && record.channels.telegramChatId ? ['Telegram'] : []),
  ];
  const notes = [
    input.fallbackReason ? `Fell back to local monitoring: ${input.fallbackReason}` : 'Local HTTP probe is active.',
    `Probe interval ${record.intervalSeconds}s, timeout ${record.timeoutSeconds}s.`,
    probeResult
      ? `Initial probe: ${probeResult.status}${probeResult.statusCode ? ` (HTTP ${probeResult.statusCode})` : probeResult.error ? ` (${probeResult.error})` : ''}.`
      : '',
    emailRecipients.length > 0 ? 'Email delivery still requires Cloudflare Notifications or another mail provider.' : '',
    testResult.sent.length > 0 ? `Channel test sent: ${testResult.sent.join(', ')}.` : '',
    testResult.failed.length > 0 ? `Channel test failures: ${testResult.failed.join('; ')}` : '',
  ].filter(Boolean).join(' ');

  const payload = operatorEngine.enableMonitoring({
    capsuleId: input.capsuleId,
    monitorUrl: record.monitorUrl,
    provider: 'Local HTTP monitor',
    channels,
    notes,
  });

  return {
    payload,
    meta: {
      provider: 'local',
      intervalSeconds: record.intervalSeconds,
      timeoutSeconds: record.timeoutSeconds,
      lastStatus: probeResult?.status ?? record.lastStatus,
      lastStatusCode: probeResult?.statusCode ?? record.lastStatusCode,
      lastError: probeResult?.error ?? record.lastError,
      lastCheckedAt: probeResult?.checkedAt ?? record.lastCheckedAt,
      channelTest: testResult,
    },
  };
}

hydrateOperatorLocalMonitors();
for (const capsuleId of operatorLocalMonitors.keys()) {
  scheduleOperatorLocalMonitor(capsuleId);
}

function toCloudflareGatewayError(error: unknown) {
  if (error instanceof CloudflareApiError) {
    const cloudflareErrorCode = extractCloudflareErrorCode(error.details);
    const authHint = cloudflareErrorCode === 10000
      ? 'Cloudflare API authentication failed. Verify token value and required scopes.'
      : null;
    const message = authHint ? `${error.message} ${authHint}` : error.message;

    return new GatewayError(message, error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502, {
      code: 'operator_cloudflare_error',
      cloudflareCode: cloudflareErrorCode,
      detail: authHint,
      details: error.details,
    });
  }

  return error;
}

function extractCloudflareErrorCode(details: unknown) {
  if (typeof details !== 'object' || details === null) {
    return null;
  }

  const payload = details as { errors?: Array<{ code?: unknown }>; code?: unknown };
  const firstCode = payload.errors?.find((entry) => Number.isFinite(Number(entry?.code)))?.code;
  if (Number.isFinite(Number(firstCode))) {
    return Number(firstCode);
  }
  if (Number.isFinite(Number(payload.code))) {
    return Number(payload.code);
  }
  return null;
}

function operatorIntegrationStatus() {
  return {
    cloudflare: {
      configured: Boolean(cloudflare),
      apiTokenConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_API_TOKEN) !== '',
      accountIdConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_ACCOUNT_ID) !== '',
      zoneIdConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_ZONE_ID) !== '',
      zoneNameConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_ZONE_NAME) !== '',
      defaultTunnelIdConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_DEFAULT_TUNNEL_ID) !== '',
      tunnelServiceConfigured: getStringValue(env.OPERATOR_CLOUDFLARE_TUNNEL_SERVICE) !== '',
    },
    operator: {
      previewBaseUrl: env.OPERATOR_PREVIEW_BASE_URL ?? `http://localhost:${env.PORT}`,
      artifactBaseUrl: env.OPERATOR_ARTIFACT_BASE_URL ?? env.OPERATOR_PREVIEW_BASE_URL ?? `http://localhost:${env.PORT}`,
      webBaseUrl: operatorWebBaseUrl,
      monitoringWebhookBaseUrl: operatorMonitoringWebhookBaseUrl,
      monitoringRelaySecretConfigured: getStringValue(env.OPERATOR_MONITORING_WEBHOOK_SECRET) !== '',
      previewBuildViteReady: existsSync(resolve(currentDir, '../node_modules/vite/bin/vite.js')),
    },
    commandRuntime: {
      gitReady: commandReady('git'),
      curlReady: commandReady('curl'),
      unzipReady: commandReady('unzip'),
      tarReady: commandReady('tar'),
      nodeReady: commandReady('node'),
      npmReady: commandReady('npm'),
    },
  };
}

function commandReady(command: 'git' | 'curl' | 'unzip' | 'tar' | 'node' | 'npm') {
  return spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  }).status === 0;
}

function clearOperatorLocalMonitoringState() {
  for (const capsuleId of [...operatorLocalMonitorTimers.keys()]) {
    clearOperatorLocalMonitorTimer(capsuleId);
  }
  operatorLocalMonitors.clear();
  operatorMonitoringRelays.clear();
  persistOperatorLocalMonitors();

  try {
    rmSync(operatorLocalMonitorStateFilePath, { force: true });
  } catch {
    // Best-effort cleanup for local development.
  }
}

function operatorRuntimePublicBase(mode: 'preview' | 'release', capsuleRef: string) {
  const encodedRef = encodeURIComponent(capsuleRef);
  return mode === 'preview'
    ? `/api/v1/operator/previews/${encodedRef}`
    : `/api/v1/operator/releases/${encodedRef}`;
}

function rewriteOperatorProxyLocation(
  location: string,
  upstreamBaseUrl: string,
  publicBasePath: string,
) {
  try {
    const upstreamBase = new URL(`${upstreamBaseUrl.replace(/\/+$/, '')}/`);
    const resolved = new URL(location, upstreamBase);
    if (resolved.origin !== upstreamBase.origin) {
      return location;
    }

    return `${publicBasePath}${resolved.pathname === '/' ? '' : resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return location;
  }
}

function rewriteOperatorProxyHtml(html: string, publicBasePath: string) {
  return html
    .replaceAll('"/_next/', `"${publicBasePath}/_next/`)
    .replaceAll("'/_next/", `'${publicBasePath}/_next/`)
    .replaceAll('="/_next/', `="${publicBasePath}/_next/`)
    .replaceAll("='/_next/", `='${publicBasePath}/_next/`)
    .replaceAll('url(/_next/', `url(${publicBasePath}/_next/`);
}

async function proxyOperatorRuntimeResponse(input: {
  mode: 'preview' | 'release';
  capsuleRef: string;
  pathSuffix?: string;
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  const proxyTarget = operatorEngine.getPreviewProxyTarget(input.capsuleRef);
  if (!proxyTarget) {
    return false;
  }

  try {
    const requestUrl = new URL(input.request.raw.url ?? '/', 'http://operator.local');
    const normalizedSuffix = getStringValue(input.pathSuffix).replace(/^\/+/, '');
    const upstreamUrl = new URL(`${proxyTarget.replace(/\/+$/, '')}/${normalizedSuffix}`);
    upstreamUrl.search = requestUrl.search;

    const response = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: getStringValue(input.request.headers.accept) || '*/*',
        'accept-language': getStringValue(input.request.headers['accept-language']) || 'en',
        'user-agent': getStringValue(input.request.headers['user-agent']) || 'SlothCloudOperatorProxy/1.0',
      },
    });

    input.reply.code(response.status);
    const contentType = response.headers.get('content-type');
    const cacheControl = response.headers.get('cache-control');
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');
    const location = response.headers.get('location');
    if (contentType) {
      input.reply.header('Content-Type', contentType);
    }
    if (cacheControl) {
      input.reply.header('Cache-Control', cacheControl);
    }
    if (etag) {
      input.reply.header('ETag', etag);
    }
    if (lastModified) {
      input.reply.header('Last-Modified', lastModified);
    }
    if (location) {
      input.reply.header('Location', rewriteOperatorProxyLocation(
        location,
        proxyTarget,
        operatorRuntimePublicBase(input.mode, input.capsuleRef),
      ));
    }
    const publicBasePath = operatorRuntimePublicBase(input.mode, input.capsuleRef);
    if (contentType?.includes('text/html')) {
      input.reply.send(rewriteOperatorProxyHtml(await response.text(), publicBasePath));
      return true;
    }

    input.reply.send(Buffer.from(await response.arrayBuffer()));
    return true;
  } catch (error) {
    input.reply.code(502);
    input.reply.send({
      message: 'Preview runtime proxy failed.',
      error: 'operator_preview_proxy_failed',
      detail: error instanceof Error ? error.message : 'unknown_proxy_error',
    });
    return true;
  }
}

function readCheckoutConfigString(
  checkoutConfig: Record<string, unknown>,
  aliases: string[],
  matcher?: (normalizedToken: string) => boolean,
) {
  const aliasSet = new Set(aliases.map((alias) => normalizeConfigToken(alias)));

  for (const [key, rawValue] of Object.entries(checkoutConfig)) {
    const token = normalizeConfigToken(key);
    if (!aliasSet.has(token) && !(matcher?.(token) ?? false)) {
      continue;
    }

    const value = getStringValue(rawValue);
    if (value !== '') {
      return value;
    }
  }

  return '';
}

function readNullableStringValue(value: unknown) {
  const normalized = getStringValue(value);
  return normalized !== '' ? normalized : null;
}

function readNullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNullableBooleanValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  return null;
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

const assistantSshUsernameKeys = [
  'password_login_username',
  'server_username',
  'username',
  'ssh_username',
  'login_username',
] as const;

const assistantSshPortKeys = [
  'ssh_port',
  'port',
  'server_ssh_port',
] as const;

const assistantSshPrivateKeyKeys = [
  'ssh_private_key',
  'private_key',
  'server_ssh_private_key',
  'root_private_key',
  'ssh_key_private',
  'private_ssh_key',
  'id_rsa',
  'id_ed25519',
] as const;

const assistantSshPrivateKeyPathKeys = [
  'ssh_private_key_path',
  'private_key_path',
  'server_ssh_private_key_path',
  'ssh_key_path',
] as const;

const assistantSshPassphraseKeys = [
  'ssh_key_passphrase',
  'private_key_passphrase',
  'ssh_passphrase',
  'key_passphrase',
] as const;

const assistantSshAgentSocketKeys = [
  'ssh_agent_socket',
  'agent_socket',
  'ssh_auth_sock',
] as const;

function parseSshPortValue(value: string | null | undefined) {
  const parsed = Number((value ?? '').trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 65535) {
    return null;
  }

  return rounded;
}

function looksLikeSshPrivateKey(value: string) {
  return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value);
}

function decodeBase64ToUtf8(value: string) {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function normalizeSshPrivateKeyContent(rawValue: string | null | undefined) {
  const value = getStringValue(rawValue);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const source = trimmed.startsWith('base64:') ? trimmed.slice('base64:'.length).trim() : trimmed;
  const unescaped = source.includes('\\n') && !source.includes('\n')
    ? source.replace(/\\n/g, '\n')
    : source;

  if (looksLikeSshPrivateKey(unescaped)) {
    return unescaped.trim();
  }

  const maybeDecoded = decodeBase64ToUtf8(unescaped.replace(/\s+/g, ''));
  if (maybeDecoded && looksLikeSshPrivateKey(maybeDecoded)) {
    return maybeDecoded.trim();
  }

  return null;
}

function normalizeFilePath(input: string | null | undefined) {
  const value = getStringValue(input);
  if (!value) {
    return null;
  }

  const stripped = value.startsWith('file://') ? value.slice('file://'.length) : value;
  if (!stripped) {
    return null;
  }

  if (stripped.startsWith('~/')) {
    const home = process.env.HOME || '';
    if (!home) {
      return resolve(stripped.slice(2));
    }
    return resolve(home, stripped.slice(2));
  }

  return resolve(stripped);
}

function readSshPrivateKeyFromPath(pathValue: string | null | undefined) {
  const path = normalizeFilePath(pathValue);
  if (!path || !existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf8');
    return normalizeSshPrivateKeyContent(content);
  } catch {
    return null;
  }
}

const assistantDefaultRuntimeSshKeyPaths = [
  '/root/.ssh/id_ed25519',
  '/root/.ssh/id_rsa',
  '/home/node/.ssh/id_ed25519',
  '/home/node/.ssh/id_rsa',
] as const;

function readAssistantRuntimeDefaultSshKey() {
  for (const candidate of assistantDefaultRuntimeSshKeyPaths) {
    const key = readSshPrivateKeyFromPath(candidate);
    if (key) {
      return key;
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

const strongServicePasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,50}$/;

function validateCustomServicePassword(password: string | null | undefined) {
  const normalized = (password ?? '').trim();
  if (normalized === '') {
    return null;
  }

  if (normalized.length < 8 || normalized.length > 50) {
    return 'Account password must contain 8-50 characters.';
  }

  if (!strongServicePasswordPattern.test(normalized)) {
    return 'Account password must contain 8-50 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.';
  }

  return null;
}

function buildCapabilities(buttons: Array<Record<string, unknown>>, hasServerRef: boolean) {
  const lookup = (aliases: string[]) => findActionName(buttons, aliases) !== null;
  const convoyDirect = hasServerRef && convoyEnabled;

  return {
    application: {
      read: convoyDirect,
      console: convoyDirect,
      patch: convoyDirect,
      build: convoyDirect,
      firewall: convoyDirect,
      suspend: convoyDirect,
      unsuspend: convoyDirect,
      destroy: convoyDirect,
    },
    actionBridge: {
      power: convoyDirect || lookup(['start', 'stop', 'restart', 'reboot', 'power']),
      reinstall: convoyDirect || lookup(['reinstall', 'rebuild', 'reset-os']),
      revealPassword: convoyDirect || lookup(['password', 'reveal', 'show-password']),
    },
  };
}

type ConsoleSessionType = 'novnc' | 'xtermjs';

function resolveConsoleSessionType(value: string | null | undefined): ConsoleSessionType {
  return value === 'xtermjs' ? 'xtermjs' : 'novnc';
}

function buildConsoleLaunchUrl(
  payload: Record<string, unknown>,
  requestedType: ConsoleSessionType,
) {
  const consoleType = resolveConsoleSessionType(
    readNullableStringValue(payload.type) ?? requestedType,
  );
  const fqdn = getStringValue(payload.fqdn);
  const rawPort = Number(payload.port);

  if (!fqdn || !Number.isInteger(rawPort) || rawPort <= 0) {
    throw new GatewayError('Console session is missing connection details.', 502, {
      code: 'CONVOY_CONSOLE_SESSION_INVALID',
    });
  }

  const token = getStringValue(payload.token);
  if (token) {
    const isTlsEnabled = payload.is_tls_enabled === true || payload.isTlsEnabled === true;
    const protocol = isTlsEnabled ? 'https' : 'http';

    return `${protocol}://${fqdn}:${rawPort}/?type=${encodeURIComponent(consoleType)}&token=${encodeURIComponent(token)}`;
  }

  const ticket = getStringValue(payload.ticket);
  const node = getStringValue(payload.node);
  const vmid = Number(payload.vmid);
  if (!ticket || !node || !Number.isInteger(vmid) || vmid <= 0) {
    throw new GatewayError('Console session is missing ticket data.', 502, {
      code: 'CONVOY_CONSOLE_SESSION_INVALID',
    });
  }

  const search = new URLSearchParams({
    console: 'qemu',
    virtualization: 'qemu',
    node,
    vmid: String(vmid),
    token: ticket,
  });

  if (consoleType === 'xtermjs') {
    search.set('xtermjs', '1');
  }

  return `https://${fqdn}:${rawPort}/novnc/novnc.html?${search.toString()}`;
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

const managedAppProductSlugValues = new Set([
  'app-starter',
  'app-standard',
  'app-pro',
  'app-team',
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
  const productCategorySlug = normalizeActionValue(getStringValue(service.product?.category?.slug));
  if (
    productCategorySlug === 'app-hosting'
    || productSlug === 'app-hosting'
    || productSlug.includes('app-hosting')
    || managedAppProductSlugValues.has(productSlug)
  ) {
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

function isInternalRedirectHost(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (host === '') {
    return false;
  }

  if (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === 'host.docker.internal'
    || host.endsWith('.localhost')
  ) {
    return true;
  }

  if (host.startsWith('sloth-')) {
    return true;
  }

  if (isPrivateIpAddress(host)) {
    return true;
  }

  if (!host.includes('.')) {
    return true;
  }

  return false;
}

function isPrivateIpAddress(host: string) {
  const normalized = host.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }

  // IPv6 local/private ranges.
  if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // IPv4 private/reserved ranges.
  const parts = normalized.split('.');
  if (parts.length !== 4 || parts.some((entry) => !/^\d+$/.test(entry))) {
    return false;
  }

  const octets = parts.map((entry) => Number(entry));
  if (octets.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function resolveRequestOrigin(request: FastifyRequest) {
  const hintedOrigin = getStringValue(request.headers['x-sloth-origin'])
    || getStringValue(request.headers['x-frontend-origin']);
  if (hintedOrigin) {
    try {
      const parsed = new URL(hintedOrigin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore malformed custom origin header and continue with standard fallbacks.
    }
  }

  const directOrigin = getStringValue(request.headers.origin);
  if (directOrigin) {
    try {
      const parsed = new URL(directOrigin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore malformed origin and continue with forwarded headers.
    }
  }

  const referer = getStringValue(request.headers.referer);
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore malformed referer and continue with forwarded headers.
    }
  }

  const forwardedHost = getStringValue(request.headers['x-forwarded-host']);
  const forwardedProto = getStringValue(request.headers['x-forwarded-proto']) || 'http';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = getStringValue(request.headers.host);
  if (host) {
    const protocol = request.protocol || 'http';
    return `${protocol}://${host}`;
  }

  return null;
}

function normalizeInvoicePaymentRedirect(
  redirectUrl: string | null | undefined,
  request: FastifyRequest,
  invoiceRef: string,
) {
  const normalized = typeof redirectUrl === 'string' ? redirectUrl.trim() : '';
  if (normalized === '') {
    return null;
  }

  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(normalized);
  } catch {
    return normalized;
  }

  const frontendOrigin = resolveRequestOrigin(request);
  if (!frontendOrigin) {
    return parsedRedirect.toString();
  }

  const frontendInvoiceUrl = new URL(`/invoices/${encodeURIComponent(invoiceRef)}`, frontendOrigin);

  if (
    isInternalRedirectHost(parsedRedirect.hostname)
    && parsedRedirect.pathname.toLowerCase().startsWith('/invoices/')
  ) {
    parsedRedirect.searchParams.forEach((value, key) => {
      frontendInvoiceUrl.searchParams.set(key, value);
    });
    return frontendInvoiceUrl.toString();
  }

  const upstreamReturnUrl = parsedRedirect.searchParams.get('return_url');
  if (!upstreamReturnUrl) {
    return parsedRedirect.toString();
  }

  try {
    const parsedReturn = new URL(upstreamReturnUrl);
    if (isInternalRedirectHost(parsedReturn.hostname)) {
      parsedRedirect.searchParams.set('return_url', frontendInvoiceUrl.toString());
    }
  } catch {
    parsedRedirect.searchParams.set('return_url', frontendInvoiceUrl.toString());
  }

  return parsedRedirect.toString();
}

function resolveFrontendInvoiceReturnTemplate(request: FastifyRequest) {
  const origin = resolveRequestOrigin(request);
  if (!origin) {
    return null;
  }

  return `${origin.replace(/\/+$/, '')}/invoices/{number}`;
}

function isMissingBackingVmError(error: GatewayError) {
  const text = `${error.message} ${readGatewayErrorText(error.payload)}`.toLowerCase();
  return text.includes('unable to find configuration file for vm')
    || text.includes('configuration file for vm')
    || text.includes('vmid')
    || text.includes('does not exist on node')
    || text.includes('server does not exist');
}

function isConvoyUpstreamFailure(error: GatewayError) {
  return error.statusCode >= 500;
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
    record.server_password,
    record.root_password,
    record.account_password,
    data.password,
    data.server_password,
    data.root_password,
    data.account_password,
    attributes.password,
    attributes.server_password,
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

function extractPasswordResetFlag(payload: unknown, keys: string[]) {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : {};
  const attributes = typeof data.attributes === 'object' && data.attributes !== null
    ? data.attributes as Record<string, unknown>
    : {};

  for (const key of keys) {
    const candidates = [
      record[key],
      data[key],
      attributes[key],
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'boolean') {
        return candidate;
      }
      if (typeof candidate === 'number') {
        return candidate > 0;
      }
      if (typeof candidate === 'string') {
        const normalized = candidate.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) {
          return true;
        }
        if (['false', '0', 'no'].includes(normalized)) {
          return false;
        }
      }
    }
  }

  return null;
}

function extractPasswordResetText(payload: unknown, keys: string[]) {
  const record = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const data = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : {};
  const attributes = typeof data.attributes === 'object' && data.attributes !== null
    ? data.attributes as Record<string, unknown>
    : {};

  for (const key of keys) {
    const candidates = [
      record[key],
      data[key],
      attributes[key],
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate.trim();
      }
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

function isArchivedService(service: ServiceDetail) {
  const normalized = getStringValue(service.status).toLowerCase();
  return ['cancelled', 'terminated', 'deleted', 'inactive', 'expired'].includes(normalized);
}

function readProvisioningRuntimeState(service: ServiceDetail) {
  const provisioning = buildProvisioningPayload(service);
  const normalized = getStringValue(provisioning?.status).toLowerCase();

  if (normalized === 'failed') {
    return {
      status: 'failed' as const,
      reason: provisioning?.errorMessage ?? 'Service provisioning failed and requires retry.',
    };
  }

  if (['pending', 'provisioning', 'queued', 'building', 'retrying'].includes(normalized)) {
    return {
      status: 'provisioning' as const,
      reason: provisioning?.errorMessage ?? 'Service provisioning is still in progress.',
    };
  }

  return {
    status: 'unmapped' as const,
    reason: 'Service is not mapped to a backend runtime yet.',
  };
}

function readVpsMetadata(service: ServiceDetail, serverPayload?: unknown) {
  return {
    node: resolveConvoyNodeRef(serverPayload) ?? findServicePropertyValue(service, [
      'node',
      'node_ref',
      'convoy_node',
      'convoy_node_ref',
      'cluster',
      'cluster_ref',
    ]),
    hostname: findServicePropertyValue(service, ['hostname']),
    primaryIp: findServicePropertyValue(service, [
      'primary_ip',
      'ip_address',
      'main_ip',
      'ipv4',
      'ip',
    ]),
    operatingSystem: findServicePropertyValue(service, [
      'selected_os',
      'requested_os',
      'os',
      'image',
      'template_uuid',
      'convoy_template_uuid',
    ]),
  };
}

function readConvoyDataRecord(payload: unknown) {
  const record = asRecordValue(payload);
  const data = asRecordValue(record.data);
  return Object.keys(data).length > 0 ? data : record;
}

function buildRuntimeOverviewPayload(
  status: 'ready' | 'unmapped' | 'provisioning' | 'upstream_unavailable' | 'archived' | 'failed',
  reason: string | null,
  service: ServiceDetail,
  runtimeKind: RuntimeKind,
  capabilities: RuntimeCapabilities,
  overview: Record<string, unknown> | null,
) {
  return {
    data: {
      status,
      reason,
      mapped: resolveConvoyServerRef(service) !== null,
      runtimeKind,
      overview,
      provisioning: buildProvisioningPayload(service),
      capabilities,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
}

function buildRuntimeMetricsPayload(
  status: 'ready' | 'unmapped' | 'provisioning' | 'upstream_unavailable' | 'archived' | 'failed',
  reason: string | null,
  service: ServiceDetail,
  runtimeKind: RuntimeKind,
  metrics: Record<string, unknown> | null,
) {
  return {
    data: {
      status,
      reason,
      mapped: resolveConvoyServerRef(service) !== null,
      runtimeKind,
      metrics,
      provisioning: buildProvisioningPayload(service),
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
}

function normalizeFirewallOptionsPayload(payload: unknown) {
  const record = asRecordValue(payload);

  return {
    enabled: readNullableBooleanValue(record.enabled ?? record.enable) ?? false,
    ipfilter: readNullableBooleanValue(record.ipfilter) ?? false,
    policyIn: readNullableStringValue(record.policy_in ?? record.policyIn) ?? null,
    policyOut: readNullableStringValue(record.policy_out ?? record.policyOut) ?? null,
    logLevelIn: readNullableStringValue(record.log_level_in ?? record.logLevelIn) ?? null,
    logLevelOut: readNullableStringValue(record.log_level_out ?? record.logLevelOut) ?? null,
  };
}

function normalizeFirewallRulePayload(payload: unknown) {
  const record = asRecordValue(payload);

  return {
    position: readNullableNumberValue(record.position ?? record.pos),
    enabled: readNullableBooleanValue(record.enabled ?? record.enable) ?? true,
    type: readNullableStringValue(record.type) ?? null,
    action: readNullableStringValue(record.action) ?? null,
    protocol: readNullableStringValue(record.proto ?? record.protocol) ?? null,
    source: readNullableStringValue(record.source) ?? null,
    destination: readNullableStringValue(record.dest ?? record.destination) ?? null,
    destinationPort: readNullableStringValue(record.dport ?? record.destination_port ?? record.destinationPort) ?? null,
    sourcePort: readNullableStringValue(record.sport ?? record.source_port ?? record.sourcePort) ?? null,
    interface: readNullableStringValue(record.iface ?? record.interface) ?? null,
    comment: readNullableStringValue(record.comment) ?? null,
    logLevel: readNullableStringValue(record.log ?? record.log_level ?? record.logLevel) ?? null,
  };
}

function buildFirewallPayload(
  service: ServiceDetail,
  serverRef: string | null,
  capabilities: ReturnType<typeof buildCapabilities>,
  payload: unknown,
) {
  const data = readConvoyDataRecord(payload);
  const rulesRaw = Array.isArray(data.rules) ? data.rules : [];

  return {
    data: {
      mapped: resolveConvoyServerRef(service) !== null,
      serverRef,
      capabilities: {
        read: capabilities.application.firewall,
        update: capabilities.application.firewall,
      },
      options: normalizeFirewallOptionsPayload(data.options),
      rules: rulesRaw
        .map((rule) => normalizeFirewallRulePayload(rule))
        .sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)),
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: effectivePaymenterMode,
    },
  };
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

async function clearConvoyRuntimeMappingBestEffort(
  request: FastifyRequest,
  token: string,
  serviceId: string,
  serverRef: string,
  reason: string,
) {
  try {
    const response = await gateway.clearServiceRuntimeMapping(token, serviceId, {
      provider: 'convoy',
      reason,
      currentRefs: [serverRef],
      force: false,
    });
    const data = asRecordValue(response.data);
    const mapping = asRecordValue(data.mapping);

    return {
      cleared: mapping.cleared === true,
      matched: mapping.matched === true,
      deletedCount: Number(mapping.deleted_count ?? 0) || 0,
      payload: mapping,
    };
  } catch (error) {
    request.log.warn({
      serviceId,
      serverRef,
      reason,
      error,
    }, 'Failed to clear stale Convoy runtime mapping.');

    return null;
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

function ensureAssistantEnabled() {
  if (!assistantOrchestrator.isEnabled()) {
    throw new GatewayError('Assistant is disabled.', 503, {
      code: 'ASSISTANT_DISABLED',
      detail: 'Set ASSISTANT_ENABLED=true to enable assistant endpoints.',
    });
  }
}

async function resolveAssistantIdentity(request: FastifyRequest) {
  const token = resolveToken(request);
  if (!token) {
    return {
      token: null,
      authenticated: false,
      user: null,
      userKey: assistantOrchestrator.resolveUserKey(null),
    };
  }

  try {
    const me = await gateway.me(token);
    const user = me.data.user;
    const userId = getStringValue(user.id);

    return {
      token,
      authenticated: true,
      user: {
        id: userId,
        name: user.firstName || user.name || user.email || userId,
        email: user.email,
      },
      userKey: assistantOrchestrator.resolveUserKey(userId || null),
    };
  } catch {
    return {
      token: null,
      authenticated: false,
      user: null,
      userKey: assistantOrchestrator.resolveUserKey(null),
    };
  }
}

async function resolveAssistantQuotaContext(
  request: FastifyRequest,
  reply: FastifyReply,
  locale: string,
  identity: Awaited<ReturnType<typeof resolveAssistantIdentity>>,
) {
  return await assistantQuota.getQuotaContext({
    request,
    reply,
    locale,
    authenticated: identity.authenticated,
    userId: identity.user?.id ?? null,
    token: identity.token,
    listServices: (token, status, perPage) => gateway.services(token, status, perPage),
  });
}

async function buildAssistantCapabilitiesPayload(
  locale: string,
  quotaContext: Awaited<ReturnType<typeof resolveAssistantQuotaContext>>,
) {
  const providerStatus = await readAssistantProviderStatus();
  return {
    ...(await assistantOrchestrator.capabilities(locale)),
    responseMode: providerStatus.responseMode,
    quota: quotaContext.snapshot,
    upgradeCta: quotaContext.upgradeCta,
  };
}

async function readAssistantProviderStatus(options: { forceRefresh?: boolean } = {}) {
  const now = Date.now();
  if (!options.forceRefresh && assistantProviderStatusCache && assistantProviderStatusCache.expiresAt > now) {
    return assistantProviderStatusCache.value;
  }

  if (!options.forceRefresh && assistantProviderStatusInflight) {
    return await assistantProviderStatusInflight;
  }

  assistantProviderStatusInflight = probeAssistantProviderStatus({
    enabled: assistantEnabled,
    primaryProvider: env.ASSISTANT_PRIMARY_PROVIDER,
    providers: orderedAssistantProviders,
    timeoutMs: 2500,
  }).finally(() => {
    assistantProviderStatusInflight = null;
  });

  const value = await assistantProviderStatusInflight;
  assistantProviderStatusCache = {
    expiresAt: Date.now() + assistantProviderStatusCacheTtlMs,
    value,
  };
  return value;
}

function buildAssistantProviderStatusReason(locale: string, status: Awaited<ReturnType<typeof readAssistantProviderStatus>>) {
  const zh = locale.toLowerCase().startsWith('zh');
  if (!status.enabled) {
    return zh ? 'AI 助手当前未启用。' : 'The AI assistant is currently disabled.';
  }
  if (status.canRun && status.activeProvider && status.activeModel) {
    return zh
      ? `当前可用：${status.activeProvider} / ${status.activeModel} 已通过真实探针。`
      : `Ready: ${status.activeProvider} / ${status.activeModel} passed the live readiness probe.`;
  }
  if (!status.credentialsPresent) {
    return zh ? '当前没有可用的 AI 凭据。' : 'No usable AI credentials are present.';
  }
  if (!status.providerConfigured) {
    return zh ? '当前 AI 提供方配置不完整。' : 'The AI provider configuration is incomplete.';
  }
  if (!status.networkReachable) {
    return zh ? '当前 AI 网络不可达，无法连接模型端点。' : 'The AI endpoint is not reachable over the network.';
  }
  if (!status.modelReachable) {
    return zh ? '当前模型不可达，Run 不能放开。' : 'The configured model is not reachable, so Run cannot be enabled.';
  }
  return zh ? '当前 AI 未连接，Run 已受限。' : 'AI is currently unavailable, so Run is limited.';
}

function buildAssistantRoutingPayload(decision: AssistantMessageRouteDecision | null) {
  if (!decision || decision.route === 'none') {
    return null;
  }

  return {
    route: decision.route,
    lane: decision.lane,
    source: decision.source,
    reason: decision.reason,
  };
}

function buildAssistantRoutingFromProposal(proposal: AssistantActionProposal | null) {
  if (!proposal) {
    return null;
  }

  if (proposal.action.kind === 'create-repo-workspace') {
    return {
      route: 'repo_import_deploy',
      lane: 'repository',
      source: 'repository',
      reason: 'The confirmed action executes the repository import and deployment lane.',
    } as const;
  }

  if (proposal.action.kind === 'create-launch-capsule') {
    return {
      route: 'idea_generate',
      lane: 'generated-project',
      source: 'idea',
      reason: 'The confirmed action executes the idea generation lane.',
    } as const;
  }

  return null;
}

type AssistantCapabilityModel = Awaited<ReturnType<typeof buildAssistantCapabilitiesPayload>>['models'][number];

function containsAssistantKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function assistantMessageExplicitlyRequestsLaunchCapsule(message: string) {
  const normalized = normalizeAssistantSearchText(message);
  return containsAny(normalized, [
    '上线胶囊',
    '生成胶囊',
    '工作区胶囊',
    'launch capsule',
    'workspace capsule',
    'preview capsule',
  ]);
}

function detectAssistantIdeaLaunchIntent(message: string) {
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 6) {
    return null;
  }

  if (containsAssistantKeyword(normalized, [
    'restart',
    'reboot',
    'shutdown',
    'power off',
    'sync',
    'cancel',
    'renew',
    'invoice',
    '账单',
    '续费',
    '重启',
    '关机',
    '停机',
    '同步',
    '取消',
  ])) {
    return null;
  }

  if (!containsAssistantKeyword(normalized, [
    'build',
    'create',
    'generate',
    'make',
    'build me',
    'make me',
    'website',
    'web app',
    'app',
    'game',
    'mini game',
    'moba',
    'landing page',
    '项目',
    '应用',
    '网站',
    '游戏',
    '小游戏',
    '训练营',
    '做一个',
    '做个',
    '制作',
    '小程序',
    '帮我做',
    '给我做',
    '搭建',
    '生成',
    '开发',
  ])) {
    return null;
  }

  return message.trim();
}

function buildAssistantRepoProjectName(repoUrl: string, locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');

  const decodeRepoLabel = (value: string) => {
    const decodeLoose = (input: string) => {
      const source = input.replace(/\+/g, '%20');
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const bytes: number[] = [];
      let result = '';

      const flushBytes = () => {
        if (!bytes.length) {
          return;
        }
        result += decoder.decode(new Uint8Array(bytes));
        bytes.length = 0;
      };

      for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '%' && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
          bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
          index += 2;
          continue;
        }
        flushBytes();
        result += char;
      }

      flushBytes();
      return result;
    };

    let current = value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decoded = decodeLoose(current);
      if (!decoded || decoded === current) {
        break;
      }
      current = decoded;
    }
    return current.trim() || value;
  };

  try {
    const parsed = new URL(repoUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const tail = segments.at(-1) ?? '';
    const repoName = tail
      .replace(/\.git$/i, '')
      .replace(/\.zip$/i, '')
      .replace(/\.tar(?:\.gz)?$/i, '')
      .replace(/\.tgz$/i, '')
      .replace(/^archive$/i, segments.at(-2) ?? tail)
      .trim();
    const decoded = decodeRepoLabel(repoName);
    if (decoded) {
      return decoded.length > 42 ? decoded.slice(0, 42).trim() : decoded;
    }
  } catch {
    // Ignore URL parsing failures and fall back to generic labels below.
  }

  return zh ? '仓库部署项目' : 'Repository deployment project';
}

function detectAssistantRepoWorkspaceIntent(message: string, locale: string) {
  const normalized = message.trim();
  if (normalized.length < 8) {
    return null;
  }

  const repoUrl = extractAssistantRepoUrl(normalized);
  if (!repoUrl) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const mentionsRepoWork = containsAssistantKeyword(lower, [
    'deploy',
    'deployment',
    'publish',
    'preview',
    'import',
    'repo',
    'repository',
    'git',
    'github',
    'server #19',
    '服务器 #19',
    '部署',
    '上线',
    '发布',
    '仓库',
    '导入',
    '#19',
  ]);
  if (!mentionsRepoWork && !/github\.com|gitlab\.com|bitbucket\.org/i.test(repoUrl)) {
    return null;
  }

  const splitInput = splitAssistantRepoInput(normalized);
  return {
    projectName: buildAssistantRepoProjectName(repoUrl, locale),
    repoUrl,
    notes: splitInput.notes,
  };
}

type AssistantWorkspaceContinuationIntent = {
  operation: 'continue' | 'deploy_playable';
};

function detectAssistantWorkspaceContinuationIntent(message: string): AssistantWorkspaceContinuationIntent | null {
  const normalized = normalizeAssistantSearchText(message);
  if (!normalized) {
    return null;
  }

  const referencesServerExecution = containsAny(normalized, [
    '服务器',
    'server',
    'vps',
    '#19',
    'ssh',
  ]);
  if (referencesServerExecution) {
    return null;
  }

  const asksDeployPlayable = containsAny(normalized, [
    '帮我部署出来可以玩的',
    '部署出来可以玩',
    '部署成可玩的',
    '可玩的',
    '发布上线',
    '上线它',
    '帮我部署',
    '部署',
    '上线',
    'publish it',
    'deploy it',
    'deploy playable',
    'make it playable',
    'ship it',
  ]);
  if (asksDeployPlayable) {
    return { operation: 'deploy_playable' };
  }

  const asksContinue = containsAny(normalized, [
    '继续当前任务',
    '继续任务',
    '继续',
    '接着来',
    '继续执行',
    'continue current task',
    'continue task',
    'continue this',
    'keep going',
    'go on',
  ]);
  if (asksContinue) {
    return { operation: 'continue' };
  }

  return null;
}

function buildAssistantIdeaProjectName(idea: string, locale: string) {
  const compact = idea
    .replace(/[\r\n]+/g, ' ')
    .replace(/[，。！？,.!?;:：]/g, ' ')
    .trim();
  const zh = locale.toLowerCase().startsWith('zh');
  if (!compact) {
    return zh ? 'AI 工作区项目' : 'AI Workspace Project';
  }

  if (zh) {
    const keywordMatch = compact.match(/[^，。！？,.!?]{2,24}(?:应用|网站|平台|系统|工具|游戏|小程序)/);
    let cleaned = (keywordMatch?.[0] ?? compact)
      .replace(/^(帮我|请|麻烦你|我想|我要|希望|帮忙)/, '')
      .trim();
    for (let index = 0; index < 2; index += 1) {
      cleaned = cleaned
        .replace(/^(做|开发|生成|设计|搭建|构建|制作|创建|打造|生产)(一个|个)?/, '')
        .replace(/^(一个|个)/, '')
        .trim();
    }
    if (cleaned) {
      return cleaned.length > 24 ? cleaned.slice(0, 24).trim() : cleaned;
    }
  }

  const words = compact.split(/\s+/).filter(Boolean).slice(0, 4);
  const joined = words.join(' ').trim();
  if (!joined) {
    return zh ? 'AI 工作区项目' : 'AI Workspace Project';
  }

  return joined.length > 42 ? joined.slice(0, 42).trim() : joined;
}

function buildAssistantIdeaLaunchDefaults(idea: string, locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');
  return {
    projectName: buildAssistantIdeaProjectName(idea, locale),
    idea,
    audience: zh ? '普通用户' : 'general users',
    businessGoal: zh
      ? '低门槛快速上线并可持续运营'
      : 'launch quickly with low-friction operations',
  };
}

function looksLikeGameIdea(idea: string) {
  const normalized = idea.trim().toLowerCase();
  return containsAssistantKeyword(normalized, [
    'game',
    'mini game',
    'moba',
    'tower defense',
    'roguelike',
    'shooter',
    'survivor',
    'idle game',
    '游戏',
    '小游戏',
    '塔防',
    '射击',
    '闯关',
    '肉鸽',
    '对战',
  ]);
}

function buildAssistantIdeaLaunchPlanReply(idea: string, locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');
  const defaults = buildAssistantIdeaLaunchDefaults(idea, locale);
  const gameIdea = looksLikeGameIdea(idea);

  if (gameIdea) {
    return zh
      ? [
        '我先把这次游戏想法收束成一个可执行 GDD 草案：',
        `项目名：${defaults.projectName}`,
        `核心循环：围绕“${idea}”先打磨一条 30 秒内能学会、3 到 5 分钟能完成一局的主循环。`,
        '用户目标：让玩家在第一局就能理解目标、进入反馈、感受到一次明确胜负。',
        '一局时长：3 到 5 分钟，避免第一版过长或过复杂。',
        '胜负条件：必须有清晰的通关或失败判定，不做模糊试玩页。',
        '输入方式：优先单手/键鼠最少输入，先保证操作直接、反馈明确。',
        '第一版不做什么：不开社交、不做排行、不做复杂养成、不堆第二套玩法。',
        '执行规则：你确认这个 GDD 后，我再开始生成一个只做核心循环的可玩 MVP；如果模型没产出真实源码，就直接失败，不回退低质量模板。',
      ].join('\n')
      : [
        'I translated this game request into an executable GDD draft:',
        `Project: ${defaults.projectName}`,
        `Core loop: refine one clear loop around "${idea}" that is learnable in under 30 seconds and playable in 3 to 5 minutes per run.`,
        'Player goal: let the first session teach the objective, create feedback, and deliver a clear win or lose outcome.',
        'Session length: 3 to 5 minutes so the first version stays focused.',
        'Win or lose condition: the MVP must ship with a real success or failure state, not just a themed prototype screen.',
        'Input mode: keep controls minimal and direct first.',
        'Version one will not include: social features, ranking, deep progression, or a second gameplay loop.',
        'Execution rule: once you confirm this GDD, I will build a playable MVP focused on the core loop only. If the model does not produce real source code, the run fails instead of falling back to a low-quality template.',
      ].join('\n');
  }

  return zh
    ? [
      '我先帮你整理了一个真实生成执行计划：',
      `目标摘要：${idea}`,
      `建议技术路线：先让模型产出一个面向 ${defaults.audience} 的可运行第一版，保留源码包，后续再补后台、持久化和运维能力。`,
      '交付方式：先生成真实源码、共享预览和可继续推进的任务工作区。',
      '风险与限制：如果模型没有产出真实代码，这次会直接失败，不再返回占位模板或伪结果。',
      '下一步确认：点击“确认执行”后，我就开始真实生成源码、预览和后续工作区。',
    ].join('\n')
    : [
      'I mapped your request into a real build plan:',
      `Goal summary: ${idea}`,
      `Recommended path: have the model produce a runnable first version for ${defaults.audience}, keep the source bundle, then add backend, persistence, and ops in later iterations.`,
      'Delivery path: generate real source files, a shared preview, and a task workspace that can keep moving forward.',
      'Risks and limits: if the model does not produce real code, this run fails instead of returning a placeholder template.',
      'Next confirmation: click confirm and I will start the real code, preview, and workspace generation flow.',
    ].join('\n');
}

function buildAssistantRepoWorkspacePlanReply(
  intent: {
    projectName: string;
    repoUrl: string;
    notes: string | null;
  },
  locale: string,
) {
  const zh = locale.toLowerCase().startsWith('zh');

  return zh
    ? [
      '我先把这次仓库部署整理成真实执行计划：',
      `项目：${intent.projectName}`,
      `源码来源：${intent.repoUrl}`,
      'A. 技术栈判断：先自动识别 Dockerfile / docker-compose / Next / Vite / Node / Python / 静态站点，并推断构建方式、启动方式、运行端口与健康检查路径。',
      'B. 构建/运行命令：先在隔离环境执行 source fetch -> stack detect -> env checklist -> install -> build -> test -> smoke test。',
      'C. 所需环境变量：只推断变量名和用途，不伪造 secrets；缺失项会整理成 checklist 并阻塞正式发布。',
      'D. 部署方式：先生成真实工作区和预览验证结果，通过后再进入服务器 #19 的生产发布确认。',
      'E. 风险点：如果仓库本身不完整、技术栈暂未支持真实预览、或健康检查失败，这次会直接停止并报告根因，不会伪造成功。',
      `F. 下一步：点击确认后，我就开始真实仓库校验。${intent.notes ? `附加要求：${intent.notes}` : ''}`,
    ].filter(Boolean).join('\n')
    : [
      'I mapped this repository deployment into a real execution plan:',
      `Project: ${intent.projectName}`,
      `Source: ${intent.repoUrl}`,
      'A. Stack detection: infer Dockerfile, docker-compose, Next, Vite, Node, Python, or static-site paths together with build/start commands, runtime port, and health checks.',
      'B. Build/run flow: run source fetch -> stack detect -> env checklist -> install -> build -> test -> smoke test inside an isolated environment first.',
      'C. Environment variables: infer names and purposes only, never fake secrets. Missing required inputs will block production.',
      'D. Deployment path: create a real workspace and verified preview first, then gate production deployment to server #19 behind confirmation.',
      'E. Risks: if the repository is incomplete, the stack cannot be previewed yet, or health checks fail, the run stops with the root cause instead of reporting fake success.',
      `F. Next step: confirm and I will start the real repository verification flow.${intent.notes ? ` Extra requirement: ${intent.notes}` : ''}`,
    ].filter(Boolean).join('\n');
}

function buildAssistantWorkspaceContinuationReply(
  locale: string,
  envelope: OperatorEnvelope,
  intent: AssistantWorkspaceContinuationIntent,
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const activeTask = envelope.workflow.activeTaskId
    ? envelope.workflow.tasks.find((task) => task.id === envelope.workflow.activeTaskId) ?? null
    : envelope.workflow.tasks.at(-1) ?? null;
  const stage = activeTask?.currentStage ?? envelope.capsule.workflowStage ?? 'draft';
  const pendingConfirmationId = activeTask?.pendingConfirmation?.token ?? null;
  const ledger = normalizeWorkspaceArtifactLedger(envelope.workspaceArtifactLedger);
  const latestArtifact = getWorkspaceArtifactLedgerLatestArtifactDetail(ledger);
  const blockingLedgerGaps = selectWorkspaceArtifactLedgerBlockingGaps(ledger);
  const failure = activeTask?.failure ?? null;

  if (failure) {
    return zh
      ? [
        '我已经沿用当前工作区继续执行，但现在被结构化阻断：',
        `failure_code: ${failure.failureCode}`,
        `human_summary: ${failure.humanSummary}`,
        ...(blockingLedgerGaps.length > 0 ? [`ledger_gaps: ${blockingLedgerGaps.join(', ')}`] : []),
        `recommended_action: ${failure.recommendedActions[0] ?? '请先补齐缺失项再继续。'}`,
      ].join('\n')
      : [
        'I continued from the current workspace, but it is now structurally blocked:',
        `failure_code: ${failure.failureCode}`,
        `human_summary: ${failure.humanSummary}`,
        ...(blockingLedgerGaps.length > 0 ? [`ledger_gaps: ${blockingLedgerGaps.join(', ')}`] : []),
        `recommended_action: ${failure.recommendedActions[0] ?? 'Fill the missing requirement and continue.'}`,
      ].join('\n');
  }

  if (stage === 'awaiting_confirmation') {
    return zh
      ? [
        '当前任务仍在等待确认，尚未进入执行器。',
        `pending_confirmation_id: ${pendingConfirmationId ?? 'missing'}`,
        '请点击“继续当前任务”消费这个确认编号后再推进。',
      ].join('\n')
      : [
        'The task is still waiting for confirmation and has not entered executor dispatch yet.',
        `pending_confirmation_id: ${pendingConfirmationId ?? 'missing'}`,
        'Use "Continue current task" to consume this confirmation id and resume execution.',
      ].join('\n');
  }

  return zh
    ? [
      intent.operation === 'deploy_playable'
        ? '已沿用当前工作区工件继续推进可玩部署链路。'
        : '已沿用当前工作区继续推进当前任务。',
      `current_stage: ${stage}`,
      `active_task_id: ${activeTask?.id ?? 'unknown'}`,
      `latest_artifact: ${latestArtifact ?? 'pending'}`,
      `chosen_stack: ${ledger.chosenStack.label}`,
      `preview_target: ${ledger.previewTarget.url ?? 'pending'}`,
      `deploy_readiness: ${ledger.deployReadiness.ready ? 'ready' : `not_ready (${ledger.deployReadiness.sshStatus ?? 'unknown'} / ${ledger.deployReadiness.envStatus ?? 'unknown'})`}`,
      `latest_job: ${envelope.latestJob?.kind ?? 'none'} (${envelope.latestJob?.status ?? 'none'})`,
    ].join('\n')
    : [
      intent.operation === 'deploy_playable'
        ? 'Reused the current workspace artifacts and resumed the playable deployment flow.'
        : 'Resumed the current task in the same workspace.',
      `current_stage: ${stage}`,
      `active_task_id: ${activeTask?.id ?? 'unknown'}`,
      `latest_artifact: ${latestArtifact ?? 'pending'}`,
      `chosen_stack: ${ledger.chosenStack.label}`,
      `preview_target: ${ledger.previewTarget.url ?? 'pending'}`,
      `deploy_readiness: ${ledger.deployReadiness.ready ? 'ready' : `not_ready (${ledger.deployReadiness.sshStatus ?? 'unknown'} / ${ledger.deployReadiness.envStatus ?? 'unknown'})`}`,
      `latest_job: ${envelope.latestJob?.kind ?? 'none'} (${envelope.latestJob?.status ?? 'none'})`,
    ].join('\n');
}

function buildAssistantIdeaLaunchProposal(
  locale: string,
  input: {
    idea: string;
    capsuleId?: string | null;
    planningMode?: 'on' | 'off';
    taskMode?: 'continue' | 'new_turn';
  },
): AssistantActionProposal {
  const zh = locale.toLowerCase().startsWith('zh');
  const defaults = buildAssistantIdeaLaunchDefaults(input.idea, locale);
  const gameIdea = looksLikeGameIdea(input.idea);

  return {
    id: `launch-${Date.now()}`,
    title: gameIdea
      ? (zh ? '确认 GDD 并开始 MVP' : 'Confirm GDD and start MVP')
      : (zh ? '启动真实生成任务' : 'Start real build task'),
    description: zh
      ? (gameIdea
          ? '先按 GDD 聚焦一个可玩的核心循环，再开始真实生成源码和预览；如果没产出真实代码，这次会直接失败，不回退模板。'
          : '让模型真实生成源码、预览和任务工作区；如果没成功产出真实代码，这次会直接报错，不再回退模板。')
      : (gameIdea
          ? 'Lock the GDD around one playable core loop first, then start the real source and preview generation flow. If real code is not produced, the run fails instead of falling back to a template.'
          : 'Ask the model to generate real source files, a preview, and a task workspace. If real code is not produced, this run fails instead of falling back to a template.'),
    risk: 'low',
    requiresConfirmation: true,
    action: {
      kind: 'create-launch-capsule',
      serviceId: null,
      invoiceId: null,
      capsuleId: input.capsuleId ?? null,
      projectName: defaults.projectName,
      idea: defaults.idea,
      audience: defaults.audience,
      businessGoal: defaults.businessGoal,
      planningMode: input.planningMode === 'on' ? 'on' : 'off',
      taskMode: input.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    },
  };
}

function buildAssistantRepoWorkspaceProposal(
  locale: string,
  intent: {
    projectName: string;
    repoUrl: string;
    notes: string | null;
    capsuleId?: string | null;
    planningMode?: 'on' | 'off';
    taskMode?: 'continue' | 'new_turn';
  },
): AssistantActionProposal {
  const zh = locale.toLowerCase().startsWith('zh');
  return {
    id: `repo-${Date.now()}`,
    title: zh ? '启动真实仓库部署工作区' : 'Start real repository deployment workspace',
    description: zh
      ? '创建真实仓库工作区，自动识别技术栈、环境清单和预览链路；任何失败都会停在根因，不会伪造成功。'
      : 'Create a real repository workspace, infer the stack, render the environment checklist, and run the verified preview flow. Any failure stops at the root cause instead of reporting fake success.',
    risk: 'low',
    requiresConfirmation: true,
    action: {
      kind: 'create-repo-workspace',
      serviceId: null,
      invoiceId: null,
      capsuleId: intent.capsuleId ?? null,
      projectName: intent.projectName,
      repoUrl: intent.repoUrl,
      notes: intent.notes,
      planningMode: intent.planningMode === 'on' ? 'on' : 'off',
      taskMode: intent.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    },
  };
}

function extractAssistantGenerationTaskId(text: string) {
  const match = text.match(/\btask_[a-z0-9]+\b/i);
  return match ? match[0] : null;
}

function findLatestAssistantGenerationTaskId(messages: Array<{ content: string }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content ?? '';
    const taskId = extractAssistantGenerationTaskId(content);
    if (taskId) {
      return taskId;
    }
  }
  return null;
}

function assistantMessageSuggestsGenerationTaskCheck(message: string) {
  const normalized = normalizeAssistantSearchText(message);
  return containsAny(normalized, [
    '好了吗',
    '完成了吗',
    '完成没',
    '进度',
    '进展',
    '任务进度',
    '任务状态',
    '生成进度',
    '生成状态',
    '构建进度',
    'build status',
    'task status',
    'task progress',
    'progress',
    'is it done',
    'done yet',
    'finished yet',
  ]);
}

function assistantTaskStageLabel(status: OperatorGenerationTask['status'], locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');
  switch (status) {
    case 'queued':
      return zh ? '排队中' : 'Queued';
    case 'planning':
      return zh ? '规划中' : 'Planning';
    case 'coding':
      return zh ? '编码中' : 'Coding';
    case 'building_preview':
      return zh ? '构建预览中' : 'Building preview';
    case 'completed':
      return zh ? '已完成' : 'Completed';
    case 'failed':
      return zh ? '失败' : 'Failed';
    default:
      return status;
  }
}

function assistantTaskStepStatusLabel(status: OperatorGenerationTask['steps'][number]['status'], locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');
  switch (status) {
    case 'completed':
      return zh ? '已完成' : 'Completed';
    case 'in_progress':
      return zh ? '进行中' : 'In progress';
    case 'attention':
      return zh ? '需处理' : 'Needs attention';
    case 'planned':
    default:
      return zh ? '待执行' : 'Planned';
  }
}

function buildAssistantGenerationTaskSnapshot(input: {
  request: FastifyRequest;
  taskId: string;
  task: OperatorGenerationTask;
}) {
  const capsulePath = readNullableStringValue(input.task.capsulePath);
  const capsuleUrl = capsulePath ? buildAbsoluteCapsuleUrl(input.request, capsulePath) : null;

  return {
    kind: 'operator-generation-task',
    taskId: input.taskId,
    title: input.task.title,
    status: input.task.status,
    progress: Math.max(0, Math.min(100, Math.round(input.task.progress))),
    summary: input.task.summary,
    detail: input.task.detail,
    error: input.task.error,
    previewUrl: readNullableStringValue(input.task.previewUrl),
    capsulePath,
    capsuleUrl,
    createdAt: input.task.createdAt,
    updatedAt: input.task.updatedAt,
    completedAt: input.task.completedAt,
    steps: input.task.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
      detail: step.detail,
    })),
  };
}

function buildAssistantGenerationTaskStatusReply(input: {
  request: FastifyRequest;
  locale: string;
  taskId: string;
  task: OperatorGenerationTask;
}) {
  const zh = input.locale.toLowerCase().startsWith('zh');
  const stageLabel = assistantTaskStageLabel(input.task.status, input.locale);
  const stepLines = input.task.steps.slice(0, 4).map((step) => (
    zh
      ? `- ${step.title}：${assistantTaskStepStatusLabel(step.status, input.locale)}`
      : `- ${step.title}: ${assistantTaskStepStatusLabel(step.status, input.locale)}`
  ));
  const previewUrl = readNullableStringValue(input.task.previewUrl);
  const capsulePath = readNullableStringValue(input.task.capsulePath);
  const capsuleUrl = capsulePath ? buildAbsoluteCapsuleUrl(input.request, capsulePath) : null;
  const taskError = readNullableStringValue(input.task.error);
  const taskDetail = readNullableStringValue(input.task.detail);
  const progressText = `${Math.max(0, Math.min(100, Math.round(input.task.progress)))}%`;
  const taskSnapshot = buildAssistantGenerationTaskSnapshot(input);

  if (input.task.status === 'completed') {
    const replyText = [
      zh ? `任务已完成：${input.taskId}` : `Task completed: ${input.taskId}`,
      zh ? `当前阶段：${stageLabel}` : `Stage: ${stageLabel}`,
      zh ? `进度：${progressText}` : `Progress: ${progressText}`,
      taskDetail ? (zh ? `说明：${taskDetail}` : `Detail: ${taskDetail}`) : null,
      previewUrl ? (zh ? `预览地址：${previewUrl}` : `Preview URL: ${previewUrl}`) : null,
      capsuleUrl ? (zh ? `任务工作区：${capsuleUrl}` : `Workspace: ${capsuleUrl}`) : null,
      zh ? '你现在可以继续说“发布上线”或“部署到我的服务器”。' : 'You can now continue with "publish to production" or "deploy to my server".',
    ].filter((entry): entry is string => Boolean(entry)).join('\n');

    return {
      replyText,
      actionResult: mapAssistantActionResponse(
        zh ? '生成任务已完成。' : 'Generation task completed.',
        'ASSISTANT_OPERATOR_TASK_COMPLETED',
        {
          operationId: input.taskId,
          taskId: input.taskId,
          status: input.task.status,
          progress: input.task.progress,
          detail: taskDetail,
          previewUrl,
          capsulePath,
          capsuleUrl,
          task: taskSnapshot,
        },
      ),
    };
  }

  if (input.task.status === 'failed') {
    const replyText = [
      zh ? `任务执行失败：${input.taskId}` : `Task failed: ${input.taskId}`,
      zh ? `当前阶段：${stageLabel}` : `Stage: ${stageLabel}`,
      zh ? `进度：${progressText}` : `Progress: ${progressText}`,
      taskDetail ? (zh ? `说明：${taskDetail}` : `Detail: ${taskDetail}`) : null,
      taskError ? (zh ? `错误：${taskError}` : `Error: ${taskError}`) : null,
      capsuleUrl ? (zh ? `可先打开任务工作区查看诊断：${capsuleUrl}` : `You can inspect diagnostics in the workspace first: ${capsuleUrl}`) : null,
      zh ? '你可以直接回复“重新生成一次”，我会重新发起任务。' : 'Reply with "retry generation" and I will start a new task.',
    ].filter((entry): entry is string => Boolean(entry)).join('\n');

    return {
      replyText,
      actionResult: mapAssistantActionResponse(
        zh ? '生成任务失败。' : 'Generation task failed.',
        'ASSISTANT_OPERATOR_TASK_FAILED',
        {
          operationId: input.taskId,
          taskId: input.taskId,
          status: input.task.status,
          progress: input.task.progress,
          detail: taskDetail || taskError,
          previewUrl,
          capsulePath,
          capsuleUrl,
          task: taskSnapshot,
        },
      ),
    };
  }

  const replyText = [
    zh ? `任务进行中：${input.taskId}` : `Task in progress: ${input.taskId}`,
    zh ? `当前阶段：${stageLabel}` : `Stage: ${stageLabel}`,
    zh ? `进度：${progressText}` : `Progress: ${progressText}`,
    taskDetail ? (zh ? `说明：${taskDetail}` : `Detail: ${taskDetail}`) : null,
    stepLines.length > 0
      ? [zh ? '阶段进度：' : 'Stage progress:', ...stepLines].join('\n')
      : null,
    previewUrl ? (zh ? `预览地址：${previewUrl}` : `Preview URL: ${previewUrl}`) : null,
    zh ? '你可以稍后继续问“好了吗”，我会追踪同一个任务。' : 'Ask "is it done?" again any time and I will keep tracking this task.',
  ].filter((entry): entry is string => Boolean(entry)).join('\n');

  return {
    replyText,
    actionResult: mapAssistantActionResponse(
      zh ? '任务仍在进行中。' : 'Task is still running.',
      'ASSISTANT_OPERATOR_TASK_RUNNING',
      {
        operationId: input.taskId,
        taskId: input.taskId,
        status: input.task.status,
        progress: input.task.progress,
        detail: taskDetail,
        previewUrl,
        capsulePath,
        capsuleUrl,
        task: taskSnapshot,
      },
    ),
  };
}

function pickAssistantAutoModel(input: {
  models: AssistantCapabilityModel[];
  authenticated: boolean;
  message: string;
}) {
  const normalizedMessage = input.message.trim().toLowerCase();
  const wantsImage = containsAssistantKeyword(normalizedMessage, [
    'image',
    '图片',
    '截图',
    '看图',
    '识图',
    '海报',
    'logo',
  ]);
  const wantsHeavyOps = containsAssistantKeyword(normalizedMessage, [
    'deploy',
    '部署',
    '安装',
    'install',
    'docker',
    'compose',
    'k8s',
    'kubernetes',
    '容器',
    'nginx',
    'ssl',
    '日志',
    'log',
    '报错',
    '错误',
    'debug',
    '脚本',
    '脚本',
    '命令',
    'shell',
    '代码',
    'code',
    'api',
  ]);
  const wantsBilling = containsAssistantKeyword(normalizedMessage, [
    'invoice',
    '账单',
    '支付',
    '付款',
    '价格',
    '套餐',
    '购买',
    '退款',
    'refund',
    'price',
    'billing',
  ]);

  const scored = input.models.map((model) => {
    const id = model.resolvedModelId.toLowerCase();
    let score = 0;

    if (wantsImage) {
      score += id.includes('image') ? 260 : -120;
    }

    if (wantsHeavyOps) {
      if (/(gpt-5\.4|gpt-5\.3-codex|claude-sonnet-4-6|claude-opus-4-6|gemini-3\.1-pro-high|gemini-2\.5-pro)/.test(id)) {
        score += 150;
      }
      if (/(flash|lite|mini|low|medium)/.test(id)) {
        score -= 12;
      }
    }

    if (wantsBilling) {
      if (/(flash|lite|mini|medium|gpt-oss)/.test(id)) {
        score += 80;
      }
      if (/(gpt-5\.4|claude-sonnet-4-6|gemini-3\.1-pro-high)/.test(id)) {
        score += 18;
      }
    }

    if (!wantsHeavyOps && !wantsBilling && !wantsImage) {
      if (/(gpt-oss|flash|lite|mini|low)/.test(id)) {
        score += input.authenticated ? 32 : 82;
      }
      if (/(gpt-5\.4|claude-sonnet-4-6|gemini-3\.1-pro-high)/.test(id)) {
        score += input.authenticated ? 74 : 16;
      }
    }

    if (id.includes('preview')) {
      score -= 4;
    }

    if (id.includes('image') && !wantsImage) {
      score -= 30;
    }

    score -= input.authenticated ? model.routingWeight * 2 : model.routingWeight * 6;
    score += Math.max(0, 24 - (model.routingWeight * 2));

    return {
      model,
      score,
    };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.model.routingWeight !== right.model.routingWeight) {
      return left.model.routingWeight - right.model.routingWeight;
    }
    return left.model.label.localeCompare(right.model.label);
  });

  return scored[0]?.model ?? null;
}

function resolveAssistantChargeModel(
  capabilities: Awaited<ReturnType<typeof buildAssistantCapabilitiesPayload>>,
  selectedModelId: string | null | undefined,
  options?: {
    autoRoute?: boolean;
    authenticated?: boolean;
    message?: string;
    snapshot?: {
      unlimited?: boolean | null;
      remainingPoints?: number | null;
      remainingTokens?: number | null;
    } | null;
  },
) {
  const models = capabilities.models ?? capabilities.selectableModels ?? [];
  const normalizedSelection = getStringValue(selectedModelId)?.trim().toLowerCase() ?? '';
  const explicitlySelected = normalizedSelection
    ? models.find((model) => model.id.toLowerCase() === normalizedSelection
      || model.model.toLowerCase() === normalizedSelection
      || model.resolvedModelId.toLowerCase() === normalizedSelection)
    : null;
  const affordableModels = options?.snapshot?.unlimited
    ? models
    : models.filter((model) => model.costPoints <= (options?.snapshot?.remainingTokens ?? options?.snapshot?.remainingPoints ?? 0));
  const defaultModel = models.find((model) => model.id === capabilities.defaultModelId) ?? null;
  const defaultModelIsAffordable = defaultModel
    ? (options?.snapshot?.unlimited || affordableModels.some((model) => model.id === defaultModel.id))
    : false;
  const autoSelected = options?.autoRoute
    ? (
      defaultModel && defaultModelIsAffordable
        ? defaultModel
        : pickAssistantAutoModel({
          models: affordableModels.length > 0 ? affordableModels : models,
          authenticated: options?.authenticated ?? false,
          message: options?.message ?? '',
        })
    )
    : null;
  const selected = explicitlySelected
    ?? autoSelected
    ?? defaultModel
    ?? models[0];

  if (!selected) {
    return resolveAssistantModelCost({
      id: 'fallback',
      label: 'fallback-lite',
      overrideCostTier: 'lite',
      overrideCostPoints: 1,
    });
  }

  return resolveAssistantModelCost({
    id: selected.resolvedModelId,
    label: selected.label,
    overrideCostTier: selected.costTier,
    overrideCostPoints: selected.costPoints,
  });
}

function buildAssistantUpstreamUnavailableDetail(locale: string) {
  if (locale.toLowerCase().startsWith('zh')) {
    return '当前模型暂时没有返回可用结果，本次不会扣除 tokens，请稍后重试或切换其他模型。';
  }

  return 'The selected model did not return a usable result. No tokens were charged for this attempt. Please retry or switch models.';
}

function assistantContextFromPayload(context: {
  serviceId?: string | number | null;
  invoiceId?: string | number | null;
  capsuleId?: string | null;
  path?: string | null;
  locale?: string | null;
} | null | undefined): Partial<AssistantContext> {
  if (!context) {
    return {};
  }

  return {
    serviceId: context.serviceId === undefined ? undefined : String(context.serviceId ?? ''),
    invoiceId: context.invoiceId === undefined ? undefined : String(context.invoiceId ?? ''),
    capsuleId: context.capsuleId === undefined ? undefined : context.capsuleId,
    path: context.path === undefined ? undefined : context.path,
    locale: context.locale === undefined ? undefined : context.locale,
  };
}

const assistantContextSchema = z.object({
  serviceId: z.union([z.string(), z.number(), z.null()]).optional(),
  invoiceId: z.union([z.string(), z.number(), z.null()]).optional(),
  capsuleId: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
}).partial().optional();

const assistantInputAttachmentSchema = z.object({
  id: z.string().max(80).optional(),
  name: z.string().min(1).max(180),
  mimeType: z.string().max(180).optional(),
  sizeBytes: z.number().int().min(0).max(3 * 1024 * 1024).optional(),
  textContent: z.string().max(120_000).nullable().optional(),
  dataUrl: z.string().max(500_000).nullable().optional(),
}).passthrough();

function normalizeAssistantInputAttachments(value: unknown) {
  const parsed = z.array(assistantInputAttachmentSchema).max(4).safeParse(value ?? []);
  if (!parsed.success) {
    return [] as AssistantInputAttachment[];
  }

  return parsed.data
    .map((attachment, index) => {
      const id = readNullableStringValue(attachment.id) || `att-${index + 1}`;
      const name = readNullableStringValue(attachment.name);
      if (!name) {
        return null;
      }

      const mimeType = readNullableStringValue(attachment.mimeType) || 'application/octet-stream';
      const sizeBytes = Number.isFinite(attachment.sizeBytes) ? Math.max(0, Math.round(Number(attachment.sizeBytes))) : 0;
      const textContentRaw = readNullableStringValue(attachment.textContent);
      const textContent = textContentRaw ? textContentRaw.slice(0, 80_000) : null;
      const dataUrlRaw = readNullableStringValue(attachment.dataUrl);
      const dataUrl = dataUrlRaw && dataUrlRaw.startsWith('data:image/') ? dataUrlRaw.slice(0, 450_000) : null;

      return {
        id,
        name,
        mimeType,
        sizeBytes,
        textContent,
        dataUrl,
      } satisfies AssistantInputAttachment;
    })
    .filter((attachment): attachment is AssistantInputAttachment => Boolean(attachment));
}

function buildAssistantAttachmentDisplayNote(locale: string, attachments: AssistantInputAttachment[]) {
  if (attachments.length === 0) {
    return null;
  }

  const names = attachments.map((attachment) => attachment.name).join(', ');
  return locale.toLowerCase().startsWith('zh')
    ? `附件：${names}`
    : `Attachments: ${names}`;
}

function buildAssistantAttachmentPromptSupplement(locale: string, attachments: AssistantInputAttachment[]) {
  if (attachments.length === 0) {
    return null;
  }

  const lines: string[] = [];
  for (const attachment of attachments) {
    lines.push(`attachment name=${attachment.name} mime=${attachment.mimeType} sizeBytes=${attachment.sizeBytes}`);
    if (attachment.textContent) {
      lines.push(`attachment ${attachment.name} text:\n${attachment.textContent.slice(0, 12_000)}`);
    } else if (attachment.dataUrl) {
      lines.push(locale.toLowerCase().startsWith('zh')
        ? `attachment ${attachment.name} 为图片，已上传。`
        : `attachment ${attachment.name} is an uploaded image.`);
    }
  }

  return lines.join('\n\n');
}

function normalizeAssistantCustomScript(script: string | null | undefined) {
  const normalized = (script ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const stripped = normalized
    .split('\n')
    .map((line) => line.replace(/^\s*\$\s?/, ''))
    .join('\n')
    .trim();

  if (!stripped) {
    return null;
  }

  const withSafety = stripped.startsWith('#!') || /\bset\s+-e/.test(stripped)
    ? stripped
    : `set -euo pipefail\n${stripped}`;

  return withSafety.slice(0, 180_000).trim();
}

function isLikelyComposeAttachment(attachment: AssistantInputAttachment) {
  if (!attachment.textContent) {
    return false;
  }

  const normalizedName = attachment.name.toLowerCase();
  if (
    normalizedName.endsWith('.yml')
    || normalizedName.endsWith('.yaml')
    || normalizedName.includes('compose')
  ) {
    return true;
  }

  const normalizedText = attachment.textContent.toLowerCase();
  return normalizedText.includes('services:')
    && (normalizedText.includes('image:') || normalizedText.includes('build:'));
}

function pickAssistantComposeAttachment(attachments: AssistantInputAttachment[]) {
  return attachments.find(isLikelyComposeAttachment) ?? null;
}

function isLikelyShellScriptAttachment(attachment: AssistantInputAttachment) {
  if (!attachment.textContent) {
    return false;
  }

  if (isLikelyComposeAttachment(attachment)) {
    return false;
  }

  const normalizedName = attachment.name.toLowerCase();
  if (
    normalizedName.endsWith('.sh')
    || normalizedName.endsWith('.bash')
    || normalizedName.endsWith('.zsh')
    || normalizedName.endsWith('.command')
    || normalizedName.endsWith('.ps1')
  ) {
    return true;
  }

  const content = attachment.textContent.toLowerCase();
  const commandHints = [
    'apt-get ',
    'apt ',
    'yum ',
    'dnf ',
    'apk ',
    'docker ',
    'docker compose',
    'docker-compose',
    'kubectl ',
    'systemctl ',
    'service ',
    'curl ',
    'wget ',
    'git clone',
    'npm ',
    'pnpm ',
    'yarn ',
    'chmod ',
    'chown ',
    'cat >',
    'tee ',
  ];
  let hitCount = 0;
  for (const hint of commandHints) {
    if (content.includes(hint)) {
      hitCount += 1;
    }
  }

  return hitCount >= 2 && content.split('\n').length >= 2;
}

function pickAssistantShellScriptAttachment(attachments: AssistantInputAttachment[]) {
  return attachments.find(isLikelyShellScriptAttachment) ?? null;
}

function extractAssistantShellCodeBlock(message: string) {
  const match = message.match(/```(?:bash|shell|sh|zsh)?\s*\n?([\s\S]*?)```/i);
  if (!match?.[1]) {
    return null;
  }

  return normalizeAssistantCustomScript(match[1]);
}

function buildAssistantComposeDeployScript(composeContent: string, hash: string) {
  const normalizedContent = composeContent.replace(/\r\n/g, '\n').trim();
  const composeDir = `/opt/sloth-assistant/compose-${hash}`;
  const delimiter = `SLOTH_COMPOSE_${hash.toUpperCase()}`;
  return [
    'set -euo pipefail',
    `mkdir -p ${composeDir}`,
    `cat > ${composeDir}/docker-compose.yml <<'${delimiter}'`,
    normalizedContent,
    delimiter,
    `docker compose -f ${composeDir}/docker-compose.yml up -d`,
    `docker compose -f ${composeDir}/docker-compose.yml ps`,
  ].join('\n');
}

function buildAssistantCustomScriptDeployProposal(input: {
  locale: string;
  serviceId: string | null;
  sourceLabel: string;
  script: string;
}) {
  if (!input.serviceId) {
    return null;
  }

  const normalizedScript = normalizeAssistantCustomScript(input.script);
  if (!normalizedScript) {
    return null;
  }

  const hash = createHash('sha1')
    .update(normalizedScript)
    .digest('hex')
    .slice(0, 10);
  const zh = input.locale.toLowerCase().startsWith('zh');
  const playbookName = zh
    ? `自定义脚本代执行（${input.sourceLabel}）`
    : `Custom script execution (${input.sourceLabel})`;

  return {
    id: `proposal_${randomBytes(8).toString('hex')}`,
    title: zh ? `${playbookName}（需确认）` : `${playbookName} (requires confirmation)`,
    description: zh
      ? [
        `将通过 SSH 连接服务 #${input.serviceId}。`,
        '执行你提供的自定义脚本并回写执行结果。',
        '这是高风险动作，确认后才会改动服务器。',
      ].join(' ')
      : [
        `The assistant will connect to service #${input.serviceId} over SSH.`,
        'It will execute your custom script and report the result back in chat.',
        'This is high risk and will run only after confirmation.',
      ].join(' '),
    risk: 'high' as const,
    requiresConfirmation: true,
    action: {
      kind: 'execute-service-playbook',
      serviceId: input.serviceId,
      invoiceId: null,
      playbookId: `custom-script-${hash}`,
      playbookName,
      playbookScript: normalizedScript,
    },
  } satisfies AssistantActionProposal;
}

function buildAssistantAttachmentDeployProposal(input: {
  locale: string;
  serviceId: string | null;
  attachments: AssistantInputAttachment[];
}) {
  if (!input.serviceId) {
    return null;
  }

  const composeAttachment = pickAssistantComposeAttachment(input.attachments);
  if (composeAttachment?.textContent) {
    const hash = createHash('sha1')
      .update(composeAttachment.textContent)
      .digest('hex')
      .slice(0, 10);
    const zh = input.locale.toLowerCase().startsWith('zh');
    const playbookName = zh ? `自定义 Compose 部署（${composeAttachment.name}）` : `Custom Compose deploy (${composeAttachment.name})`;
    const playbookScript = buildAssistantComposeDeployScript(composeAttachment.textContent, hash);

    return {
      id: `proposal_${randomBytes(8).toString('hex')}`,
      title: zh ? `${playbookName}（需确认）` : `${playbookName} (requires confirmation)`,
      description: zh
        ? [
          `将通过 SSH 连接服务 #${input.serviceId}。`,
          `使用你上传的文件 ${composeAttachment.name} 执行 docker compose up -d。`,
          '这是高风险动作，确认后才会改动服务器。',
        ].join(' ')
        : [
          `The assistant will connect to service #${input.serviceId} over SSH.`,
          `It will use your uploaded ${composeAttachment.name} and run docker compose up -d.`,
          'This is high risk and will run only after confirmation.',
        ].join(' '),
      risk: 'high' as const,
      requiresConfirmation: true,
      action: {
        kind: 'execute-service-playbook',
        serviceId: input.serviceId,
        invoiceId: null,
        playbookId: `custom-compose-${hash}`,
        playbookName,
        playbookScript,
      },
    } satisfies AssistantActionProposal;
  }

  const scriptAttachment = pickAssistantShellScriptAttachment(input.attachments);
  if (!scriptAttachment?.textContent) {
    return null;
  }

  return buildAssistantCustomScriptDeployProposal({
    locale: input.locale,
    serviceId: input.serviceId,
    sourceLabel: scriptAttachment.name,
    script: scriptAttachment.textContent,
  });
}

function buildAssistantInlineScriptDeployProposal(input: {
  locale: string;
  serviceId: string | null;
  message: string;
}) {
  if (!input.serviceId) {
    return null;
  }

  const script = extractAssistantShellCodeBlock(input.message);
  if (!script) {
    return null;
  }

  return buildAssistantCustomScriptDeployProposal({
    locale: input.locale,
    serviceId: input.serviceId,
    sourceLabel: input.locale.toLowerCase().startsWith('zh') ? '聊天命令' : 'chat command',
    script,
  });
}

function parseRequestedAssistantAction(value: unknown): (AssistantActionRequest & { execute?: boolean }) | null {
  const result = z.object({
    kind: z.enum([
      'create-repo-workspace',
      'create-launch-capsule',
      'retry-provisioning',
      'restart-runtime',
      'stop-runtime',
      'sync-runtime',
      'check-service-app-status',
      'execute-service-playbook',
      'install-service-app',
      'reveal-server-access',
      'cancel-service',
      'renew-service',
      'delete-runtime',
      'handoff-support',
    ]),
    serviceId: z.string().optional().nullable(),
    invoiceId: z.string().optional().nullable(),
    capsuleId: z.string().optional().nullable(),
    projectName: z.string().max(120).optional().nullable(),
    repoUrl: z.string().max(4000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    idea: z.string().max(4000).optional().nullable(),
    audience: z.string().max(120).optional().nullable(),
    businessGoal: z.string().max(500).optional().nullable(),
    planningMode: z.enum(['on', 'off']).optional(),
    taskMode: z.enum(['continue', 'new_turn']).optional(),
    playbookId: z.string().max(255).optional().nullable(),
    playbookName: z.string().max(255).optional().nullable(),
    playbookScript: z.string().max(200_000).optional().nullable(),
    appSlug: z.string().max(255).optional().nullable(),
    appName: z.string().max(255).optional().nullable(),
    cancellationType: z.enum(['end_of_period', 'immediate']).optional(),
    reason: z.string().max(500).optional().nullable(),
    execute: z.boolean().optional(),
  }).safeParse(value);

  if (!result.success) {
    return null;
  }

  return {
    kind: result.data.kind,
    serviceId: readNullableStringValue(result.data.serviceId),
    invoiceId: readNullableStringValue(result.data.invoiceId),
    capsuleId: readNullableStringValue(result.data.capsuleId),
    projectName: readNullableStringValue(result.data.projectName),
    repoUrl: readNullableStringValue(result.data.repoUrl),
    notes: readNullableStringValue(result.data.notes),
    idea: readNullableStringValue(result.data.idea),
    audience: readNullableStringValue(result.data.audience),
    businessGoal: readNullableStringValue(result.data.businessGoal),
    planningMode: result.data.planningMode === 'on' ? 'on' : 'off',
    taskMode: result.data.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    playbookId: readNullableStringValue(result.data.playbookId),
    playbookName: readNullableStringValue(result.data.playbookName),
    playbookScript: readNullableStringValue(result.data.playbookScript),
    appSlug: readNullableStringValue(result.data.appSlug),
    appName: readNullableStringValue(result.data.appName),
    cancellationType: result.data.cancellationType,
    reason: readNullableStringValue(result.data.reason),
    execute: result.data.execute ?? true,
  };
}

function assistantProposalFromRequestedAction(
  locale: string,
  action: AssistantActionRequest,
): AssistantActionProposal {
  if (action.kind === 'create-repo-workspace') {
    const repoUrl = extractAssistantRepoUrl(action.repoUrl?.trim() || '') || '';
    const projectName = action.projectName?.trim() || buildAssistantRepoProjectName(repoUrl, locale);
    return buildAssistantRepoWorkspaceProposal(locale, {
      projectName,
      repoUrl,
      notes: action.notes?.trim() || null,
      capsuleId: action.capsuleId ?? null,
      planningMode: action.planningMode === 'on' ? 'on' : 'off',
      taskMode: action.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    });
  }

  if (action.kind === 'create-launch-capsule') {
    const zh = locale.toLowerCase().startsWith('zh');
    const fallbackIdea = action.idea?.trim() || (zh ? 'AI 工作区项目' : 'AI workspace project');
    const defaults = buildAssistantIdeaLaunchDefaults(fallbackIdea, locale);

    return {
      id: `manual-${Date.now()}`,
      title: zh ? '启动真实生成任务' : 'Start real build task',
      description: zh
        ? '让模型真实生成源码、预览和任务工作区；如果没成功产出真实代码，这次会直接失败，不再回退模板。'
        : 'Have the model generate real source files, a preview, and a task workspace. If real code is not produced, the run fails instead of falling back to a template.',
      risk: 'low',
      requiresConfirmation: true,
      action: {
        ...action,
        serviceId: null,
        invoiceId: null,
        capsuleId: action.capsuleId ?? null,
        planningMode: action.planningMode === 'on' ? 'on' : 'off',
        taskMode: action.taskMode === 'new_turn' ? 'new_turn' : 'continue',
        projectName: action.projectName ?? defaults.projectName,
        idea: action.idea ?? defaults.idea,
        audience: action.audience ?? defaults.audience,
        businessGoal: action.businessGoal ?? defaults.businessGoal,
      },
    };
  }

  const appLabel = action.appName?.trim() || action.appSlug?.trim() || (locale.toLowerCase().startsWith('zh') ? '应用组件' : 'app component');
  const playbookLabel = action.playbookName?.trim() || action.playbookId?.trim() || (locale.toLowerCase().startsWith('zh') ? '服务器部署脚本' : 'server deployment playbook');
  const isHighRisk = action.kind === 'cancel-service'
    || action.kind === 'execute-service-playbook'
    || action.kind === 'install-service-app'
    || action.kind === 'stop-runtime'
    || action.kind === 'renew-service'
    || action.kind === 'delete-runtime';
  const localizedTitle = (() => {
    const zh = locale.toLowerCase().startsWith('zh');
    switch (action.kind) {
      case 'retry-provisioning':
        return zh ? '重试开通' : 'Retry provisioning';
      case 'restart-runtime':
        return zh ? '重启实例' : 'Restart instance';
      case 'stop-runtime':
        return zh ? '关机停机（高风险）' : 'Power off runtime (high risk)';
      case 'sync-runtime':
        return zh ? '同步运行状态' : 'Sync runtime state';
      case 'check-service-app-status':
        return zh ? '查看应用安装状态' : 'Check app install status';
      case 'execute-service-playbook':
        return zh ? `直接执行 ${playbookLabel}（需确认）` : `Execute ${playbookLabel} directly (requires confirmation)`;
      case 'install-service-app':
        return zh ? `安装 ${appLabel}（需确认）` : `Install ${appLabel} (requires confirmation)`;
      case 'reveal-server-access':
        return zh ? '获取服务器登录信息' : 'Get server login access';
      case 'cancel-service':
        return zh ? '取消服务（高风险）' : 'Cancel service (high risk)';
      case 'renew-service':
        return zh ? '续费服务（高风险）' : 'Renew service (high risk)';
      case 'delete-runtime':
        return zh ? '删除实例（高风险）' : 'Delete instance (high risk)';
      case 'handoff-support':
        return zh ? '转人工支持' : 'Handoff to support';
      default:
        return zh ? '执行动作' : 'Execute action';
    }
  })();

  return {
    id: `manual-${Date.now()}`,
    title: localizedTitle,
    description: action.kind === 'install-service-app'
      ? (locale.toLowerCase().startsWith('zh')
          ? `准备在当前服务上安装 ${appLabel}，安装会修改服务器环境并写入访问资料。`
          : `Prepare to install ${appLabel} on the current service. This changes the server environment and writes back access details.`)
      : action.kind === 'execute-service-playbook'
        ? (locale.toLowerCase().startsWith('zh')
            ? `准备通过 SSH 直接连接当前服务并执行 ${playbookLabel}，执行过程会写入审计日志。`
            : `Prepare to connect to the current service over SSH and execute ${playbookLabel}. The execution will be written into the audit log.`)
      : action.kind === 'check-service-app-status'
        ? (locale.toLowerCase().startsWith('zh')
            ? '准备读取当前服务最近的应用安装记录、日志和面板地址。'
            : 'Prepare to read the latest app install records, logs, and panel details for the current service.')
      : isHighRisk
        ? (locale.toLowerCase().startsWith('zh') ? '该动作会影响服务生命周期或账单，请确认后执行。' : 'This action affects service lifecycle or billing and requires confirmation.')
        : (locale.toLowerCase().startsWith('zh') ? '该动作可自动执行。' : 'This action can be executed automatically.'),
    risk: isHighRisk ? 'high' : 'low',
    requiresConfirmation: isHighRisk,
    action,
  };
}

type AssistantActionExecutionResult = ReturnType<typeof mapAssistantActionResponse>;
type AssistantRunState =
  | 'draft'
  | 'parsing'
  | 'preflight'
  | 'llm_planning'
  | 'awaiting_confirmation'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'partial_success'
  | 'success'
  | 'blocked'
  | 'failed'
  | 'rolled_back';

type AssistantResponseSource = 'llm' | 'system' | 'preflight' | 'mock';

function mapAssistantActionResponse(message: string, code: string, data?: Record<string, unknown> | null) {
  return {
    message,
    code,
    detail: getStringValue(data?.detail) || null,
    operationId: getStringValue(data?.operationId) || null,
    data: data ?? null,
  };
}

function resolveAssistantRunState(input: {
  pendingConfirmation: ReturnType<typeof assistantOrchestrator.issueConfirmation> | null;
  actionResult: AssistantActionExecutionResult | null;
  proposalsCount: number;
  workflowStage?: string | null;
}): AssistantRunState {
  if (input.workflowStage === 'preflight') {
    return 'preflight';
  }
  if (input.workflowStage === 'verifying') {
    return 'verifying';
  }
  if (input.workflowStage === 'partial_success') {
    return 'partial_success';
  }
  if (input.workflowStage === 'success') {
    return 'success';
  }
  if (input.workflowStage === 'failed') {
    return 'failed';
  }
  if (input.workflowStage === 'blocked') {
    return 'blocked';
  }
  if (input.workflowStage === 'queued') {
    return 'queued';
  }
  if (input.workflowStage === 'running') {
    return 'running';
  }
  if (input.workflowStage === 'llm_planning') {
    return 'llm_planning';
  }
  if (input.workflowStage === 'parsing') {
    return 'parsing';
  }
  if (input.pendingConfirmation) {
    return 'awaiting_confirmation';
  }

  const code = input.actionResult?.code?.toUpperCase() ?? '';
  if (code) {
    if (
      code.includes('FAILED')
      || code.includes('INVALID')
      || code.includes('UNAVAILABLE')
      || code.includes('MISSING')
      || code.includes('ERROR')
    ) {
      return 'failed';
    }
    if (code.includes('BLOCKED')) {
      return 'blocked';
    }
    if (code.includes('ROLLBACK')) {
      return 'rolled_back';
    }
    if (
      code.includes('QUEUED')
      || code.includes('STARTED')
      || code.includes('TASK_STARTED')
      || code.includes('WORKSPACE_STARTED')
    ) {
      return 'queued';
    }
    if (code.includes('PREVIEW') || code.includes('STATUS_READY')) {
      return 'partial_success';
    }
    if (code.includes('_OK') || code.includes('READY')) {
      return 'success';
    }
    return 'running';
  }

  if (input.proposalsCount > 0) {
    return 'llm_planning';
  }
  return 'running';
}

function resolveAssistantResponseSource(input: {
  pendingConfirmation: ReturnType<typeof assistantOrchestrator.issueConfirmation> | null;
  actionResult: AssistantActionExecutionResult | null;
  builtReplyMode: 'llm' | 'fallback' | null;
  usedDeterministicFallback: boolean;
}): AssistantResponseSource {
  const code = input.actionResult?.code?.toUpperCase() ?? '';
  if (code.includes('BLOCKED') || code.includes('MISSING_CREDENTIALS') || code.includes('AUTH_FAILED') || code.includes('UNREACHABLE')) {
    return 'preflight';
  }
  if (input.actionResult) {
    return 'system';
  }
  if (input.usedDeterministicFallback) {
    return 'system';
  }
  if (input.builtReplyMode === 'fallback') {
    return 'mock';
  }
  if (input.pendingConfirmation) {
    return input.builtReplyMode === 'llm' ? 'llm' : 'system';
  }
  return 'llm';
}

async function revealServiceServerPassword(
  request: FastifyRequest,
  input: {
    token: string;
    serviceId: string;
    reset?: boolean;
    password?: string;
    autoRestart?: boolean;
    payload?: Record<string, unknown>;
  },
) {
  const { service, buttons, serverRef } = await getServiceWithActions(input.token, input.serviceId);
  const storedPassword = findServicePropertyValue(service, ['password', 'account_password', 'server_password', 'root_password']);
  const shouldResetPassword = Boolean(input.reset || input.password);

  if (!shouldResetPassword && storedPassword) {
    const storedLoginUsername = findServicePropertyValue(service, ['password_login_username', 'server_username', 'username']);
    const storedApplyMode = findServicePropertyValue(service, ['password_apply_mode']);
    const storedRestartRequired = findServicePropertyValue(service, ['password_restart_required']);
    const storedAppliedLive = findServicePropertyValue(service, ['password_applied_live']);
    const storedNote = findServicePropertyValue(service, ['password_note']);

    return {
      service,
      message: 'Stored service password retrieved.',
      data: {
        provider: 'paymenter-property',
        passwordSource: 'stored',
        passwordReset: false,
        password: storedPassword,
        loginUsername: storedLoginUsername,
        passwordApplyMode: storedApplyMode,
        restartRequired: storedRestartRequired ? ['1', 'true', 'yes'].includes(storedRestartRequired.toLowerCase()) : null,
        appliedLive: storedAppliedLive ? ['1', 'true', 'yes'].includes(storedAppliedLive.toLowerCase()) : null,
        note: storedNote,
      },
    };
  }

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
      const requestedPassword = input.password ?? generateStrongPassword();
      const response = await convoy.rotatePassword(resolvedServerRef, {
        account_password: requestedPassword,
        password: requestedPassword,
        ...(input.payload ?? {}),
      });
      const password = extractPasswordFromConvoyPayload(response) ?? requestedPassword;
      const appliedLive = extractPasswordResetFlag(response, ['applied_live', 'appliedLive']) ?? false;
      const restartRequired = extractPasswordResetFlag(response, ['restart_required', 'restartRequired']) ?? !appliedLive;
      const loginUsername = extractPasswordResetText(response, ['login_username', 'loginUsername']);
      const passwordApplyMode = extractPasswordResetText(response, ['password_apply_mode', 'passwordApplyMode']);
      const passwordNote = extractPasswordResetText(response, ['note']);

      if (password) {
        await gateway.storeServicePassword(input.token, input.serviceId, {
          password,
          source: 'runtime-reset',
          username: loginUsername,
          applyMode: passwordApplyMode,
          restartRequired,
          appliedLive,
          note: passwordNote,
        }).catch((error) => {
          request.log.warn({
            serviceId: input.serviceId,
            action: 'store-password',
            error,
          }, 'Password rotation succeeded but storing the password in Paymenter failed.');
        });

        let restartRequested = false;
        let restartAccepted = false;
        let restartMessage: string | null = null;

        if (restartRequired && input.autoRestart) {
          restartRequested = true;

          try {
            await convoy.power(resolvedServerRef, 'restart');
            restartAccepted = true;
            restartMessage = 'Automatic restart command submitted.';
          } catch (restartError) {
            request.log.warn({
              serviceId: input.serviceId,
              action: 'reveal-password:auto-restart',
              restartError,
            }, 'Automatic restart after password reset failed.');

            if (shouldFallbackToActionBridge(restartError)) {
              const restartActionName = findActionName(buttons, ['restart', 'reboot', 'power-restart']);

              if (restartActionName) {
                try {
                  await gateway.serviceAction(input.token, input.serviceId, restartActionName, { state: 'restart' });
                  restartAccepted = true;
                  restartMessage = 'Automatic restart command submitted via action bridge.';
                } catch (bridgeError) {
                  request.log.warn({
                    serviceId: input.serviceId,
                    action: 'reveal-password:auto-restart-bridge',
                    bridgeError,
                  }, 'Action bridge restart fallback failed after password reset.');
                }
              }
            }

            if (!restartAccepted) {
              restartMessage = 'Password was reset, but automatic restart was not accepted by upstream.';
            }
          }
        }

        return {
          service,
          message: 'Server password has been reset and stored.',
          data: {
            provider: 'convoy',
            passwordSource: extractPasswordFromConvoyPayload(response) ? 'upstream' : 'requested',
            passwordReset: true,
            password,
            appliedLive,
            restartRequired,
            loginUsername,
            passwordApplyMode,
            note: passwordNote,
            restartRequested,
            restartAccepted,
            restartMessage,
          },
        };
      }
    } catch (error) {
      if (error instanceof GatewayError && isMissingBackingVmError(error)) {
        throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'reveal-password'));
      }

      if (error instanceof GatewayError && isConvoyUpstreamFailure(error)) {
        throw new GatewayError('Convoy password action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'reveal-password', error));
      }

      throw error;
    }
  }

  throw new GatewayError('Current server password is not readable from the upstream runtime. Reset it to generate and store a new password.', 409, {
    code: 'SERVICE_PASSWORD_NOT_READABLE',
    actionType: 'reveal-password',
  });
}

function buildAssistantServerAccessReply(
  locale: string,
  service: ServiceDetail,
  payload: Record<string, unknown> | null | undefined,
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const metadata = readVpsMetadata(service);
  const host = metadata.primaryIp ?? metadata.hostname ?? null;
  const username = getStringValue(payload?.loginUsername)
    || findServicePropertyValue(service, ['password_login_username', 'server_username', 'username'])
    || 'root';
  const password = getStringValue(payload?.password);
  const note = getStringValue(payload?.note);
  const restartRequired = readNullableBooleanValue(payload?.restartRequired);
  const appliedLive = readNullableBooleanValue(payload?.appliedLive);
  const restartMessage = getStringValue(payload?.restartMessage);
  const command = host ? `ssh ${username}@${host}` : null;

  const lines = zh
    ? [
      `已获取服务 #${service.id} 的服务器登录信息。`,
      host ? `主机：${host}` : null,
      metadata.hostname && metadata.hostname !== host ? `主机名：${metadata.hostname}` : null,
      `用户名：${username}`,
      password ? `密码：${password}` : '当前未读取到密码，请稍后重试。',
      note ? `说明：${note}` : null,
      restartRequired && !appliedLive ? '注意：如果这是刚重置出来的新密码，可能需要重启后才会完全生效。' : null,
      restartMessage ? `自动处理：${restartMessage}` : null,
      command ? ['可直接复制的 SSH 命令：', '```bash', command, '```'].join('\n') : null,
    ]
    : [
      `Server login details for service #${service.id} are ready.`,
      host ? `Host: ${host}` : null,
      metadata.hostname && metadata.hostname !== host ? `Hostname: ${metadata.hostname}` : null,
      `Username: ${username}`,
      password ? `Password: ${password}` : 'Password is not available yet. Please try again later.',
      note ? `Note: ${note}` : null,
      restartRequired && !appliedLive ? 'Note: if this password was just rotated, a restart may still be required before it fully takes effect.' : null,
      restartMessage ? `Automation: ${restartMessage}` : null,
      command ? ['Copy-ready SSH command:', '```bash', command, '```'].join('\n') : null,
    ];

  return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
}

async function resolveAssistantRemoteExecConnector(
  request: FastifyRequest,
  input: {
    token: string;
    serviceId: string;
  },
) {
  const { service } = await getServiceWithActions(input.token, input.serviceId);
  const metadata = readVpsMetadata(service);
  const host = metadata.primaryIp ?? metadata.hostname ?? null;
  let username = findServicePropertyValue(service, assistantSshUsernameKeys)
    || assistantRemoteExecDefaultUsername
    || 'root';
  const sshPort = parseSshPortValue(findServicePropertyValue(service, assistantSshPortKeys))
    || assistantRemoteExecDefaultPort
    || 22;

  const servicePrivateKeyRaw = findServicePropertyValue(service, assistantSshPrivateKeyKeys);
  const servicePrivateKey = normalizeSshPrivateKeyContent(servicePrivateKeyRaw);
  const servicePrivateKeyPathGuess = readSshPrivateKeyFromPath(servicePrivateKeyRaw);
  const servicePrivateKeyFromPath = readSshPrivateKeyFromPath(findServicePropertyValue(service, assistantSshPrivateKeyPathKeys));
  const globalPrivateKey = normalizeSshPrivateKeyContent(env.ASSISTANT_REMOTE_EXEC_SSH_KEY ?? null);
  const globalPrivateKeyFromPath = readSshPrivateKeyFromPath(env.ASSISTANT_REMOTE_EXEC_SSH_KEY_PATH ?? null);
  const runtimeDefaultPrivateKey = readAssistantRuntimeDefaultSshKey();
  const sshKey = servicePrivateKey
    || servicePrivateKeyPathGuess
    || servicePrivateKeyFromPath
    || globalPrivateKey
    || globalPrivateKeyFromPath
    || runtimeDefaultPrivateKey
    || null;

  const sshPassphrase = findServicePropertyValue(service, assistantSshPassphraseKeys)
    || getStringValue(env.ASSISTANT_REMOTE_EXEC_SSH_KEY_PASSPHRASE)
    || null;
  const agentSocket = findServicePropertyValue(service, assistantSshAgentSocketKeys)
    || getStringValue(env.ASSISTANT_REMOTE_EXEC_AGENT_SOCKET)
    || null;
  let password = findServicePropertyValue(service, ['password', 'account_password', 'server_password', 'root_password']) || null;

  let revealError: unknown = null;
  if (!password && !sshKey && !agentSocket) {
    try {
      const revealed = await revealServiceServerPassword(request, {
        token: input.token,
        serviceId: input.serviceId,
      });
      const revealedUsername = getStringValue(revealed.data?.loginUsername);
      if (revealedUsername) {
        username = revealedUsername;
      }
      const revealedPassword = getStringValue(revealed.data?.password);
      if (revealedPassword) {
        password = revealedPassword;
      }
    } catch (error) {
      revealError = error;
    }
  }

  if (!host) {
    throw new GatewayError('SSH host is not available for this service yet.', 409, {
      code: 'ASSISTANT_REMOTE_EXEC_HOST_UNAVAILABLE',
    });
  }

  if (sshKey) {
    return {
      service,
      connector: {
        host,
        port: sshPort,
        username,
        sshKey,
        sshPassphrase: sshPassphrase || undefined,
        password: password || undefined,
        agentSocket: agentSocket || undefined,
      } satisfies RemoteExecConnector,
    };
  }

  if (agentSocket) {
    return {
      service,
      connector: {
        host,
        port: sshPort,
        username,
        agentSocket,
        password: password || undefined,
      } satisfies RemoteExecConnector,
    };
  }

  if (password) {
    return {
      service,
      connector: {
        host,
        port: sshPort,
        username,
        password,
      } satisfies RemoteExecConnector,
    };
  }

  if (revealError instanceof GatewayError) {
    throw revealError;
  }

  throw new GatewayError('SSH key, agent socket, and password are all unavailable for this service.', 409, {
    code: 'ASSISTANT_REMOTE_EXEC_AUTH_UNAVAILABLE',
  });
}

type AssistantServiceCatalog = NonNullable<ServiceAppsResponse['data']['catalog']>;
type AssistantInstallableApp = AssistantServiceCatalog['addonApps'][number];

function normalizeAssistantSearchText(input: string) {
  return input
    .toLowerCase()
    .replace(/[~`!@#$%^&*()+=[\]{}\\|;:'",.<>/?]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assistantMessageSuggestsAppInstall(message: string) {
  const normalized = normalizeAssistantSearchText(message);
  return containsAny(normalized, [
    'install',
    'deploy',
    'setup',
    'add app',
    'add addon',
    '安装',
    '部署',
    '搭建',
    '加装',
    '装上',
  ]);
}

function assistantMessageSuggestsDirectServerExecution(message: string) {
  const normalized = normalizeAssistantSearchText(message);
  const asksCommandBundle = containsAny(normalized, [
    '复制命令',
    '一键命令',
    '完整命令',
    'copy command',
    'one line command',
  ]);
  const commandContext = containsAny(normalized, [
    '部署',
    '安装',
    '服务器',
    'server',
    'vps',
    'docker',
    'nginx',
  ]);

  if (asksCommandBundle && commandContext) {
    return true;
  }

  const deployIntent = containsAny(normalized, [
    '部署',
    '安装',
    '上线',
    '搭建',
    'deploy',
    'install',
    'setup',
    'launch',
  ]);
  const serverTarget = containsAny(normalized, [
    '服务器',
    'server',
    'vps',
    '#',
  ]);

  if (deployIntent && serverTarget) {
    return true;
  }

  return containsAny(normalized, [
    '直接部署',
    '直接安装',
    '直接执行',
    '直接在服务器',
    '在服务器上部署',
    '在服务器上安装',
    '部署到服务器',
    '安装到服务器',
    '替我部署',
    '替我在服务器',
    '替我操作',
    '帮我部署',
    '帮我在服务器',
    '代执行',
    '机器人部署',
    'remote execute',
    'run on server',
    'direct deploy',
  ]);
}

function scoreAssistantInstallableApp(message: string, app: AssistantInstallableApp) {
  const normalizedMessage = normalizeAssistantSearchText(message);
  if (!normalizedMessage) {
    return 0;
  }

  const slug = normalizeAssistantSearchText(app.slug);
  const slugWithSpaces = normalizeAssistantSearchText(app.slug.replace(/[-_]+/g, ' '));
  const name = normalizeAssistantSearchText(app.name);
  const tagline = normalizeAssistantSearchText(app.tagline ?? '');
  const description = normalizeAssistantSearchText(app.description ?? '');
  const categoryName = normalizeAssistantSearchText(app.category?.name ?? '');

  let score = 0;

  if (slug && normalizedMessage.includes(slug)) {
    score = Math.max(score, 120);
  }
  if (slugWithSpaces && normalizedMessage.includes(slugWithSpaces)) {
    score = Math.max(score, 118);
  }
  if (name && normalizedMessage.includes(name)) {
    score = Math.max(score, 116);
  }

  const nameWords = name.split(' ').filter((word) => word.length >= 2);
  if (nameWords.length > 1 && nameWords.every((word) => normalizedMessage.includes(word))) {
    score = Math.max(score, 108);
  }

  const slugWords = slugWithSpaces.split(' ').filter((word) => word.length >= 3);
  if (slugWords.length > 1 && slugWords.every((word) => normalizedMessage.includes(word))) {
    score = Math.max(score, 106);
  }

  if (slugWords.length === 1 && normalizedMessage.includes(slugWords[0]!)) {
    score = Math.max(score, 96);
  }

  if (tagline && normalizedMessage.includes(tagline)) {
    score = Math.max(score, 92);
  }

  if (description && normalizedMessage.includes(description)) {
    score = Math.max(score, 88);
  }

  if (categoryName && normalizedMessage.includes(categoryName)) {
    score = Math.max(score, 72);
  }

  return score;
}

function pickAssistantInstallCredential(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getStringValue(payload?.[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function buildAssistantInstallServiceAppReply(
  locale: string,
  input: {
    serviceId: string;
    app: AssistantInstallableApp;
    install: ServiceAppInstall | null;
    alreadyPresent: boolean;
  },
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const installStatus = String(input.install?.status ?? '').trim() || (input.alreadyPresent ? 'ready' : 'queued');
  const responsePayload = input.install?.responsePayload ?? null;
  const panelUrl = getStringValue(responsePayload?.panel_url)
    || getStringValue(responsePayload?.panelUrl)
    || null;
  const panelLabel = getStringValue(responsePayload?.panel_label)
    || getStringValue(responsePayload?.panelLabel)
    || input.install?.recipe?.panelLabel
    || input.app.recipe?.panelLabel
    || input.app.name;
  const panelUsername = pickAssistantInstallCredential(responsePayload, [
    'panel_username',
    'panelUsername',
    'username',
    'login_username',
    'loginUsername',
  ]);
  const panelPassword = pickAssistantInstallCredential(responsePayload, [
    'panel_password',
    'panelPassword',
    'password',
    'login_password',
    'loginPassword',
  ]);
  const dependencies = input.app.recipe?.dependencies ?? [];

  const lines = zh
    ? [
      input.alreadyPresent
        ? `服务 #${input.serviceId} 已经存在 ${input.app.name} 的安装记录，无需重复提交。`
        : `已为服务 #${input.serviceId} 提交 ${input.app.name} 的安装任务。`,
      `状态：${installStatus}`,
      input.install?.id ? `安装记录：#${input.install.id}` : null,
      dependencies.length > 0 ? `依赖：${dependencies.join(', ')}` : null,
      panelUrl ? `${panelLabel} 地址：${panelUrl}` : null,
      panelUsername ? `账号：${panelUsername}` : null,
      panelPassword ? `密码：${panelPassword}` : null,
      !panelUrl
        ? '这是异步安装流程，面板地址和凭据会在安装完成后自动回写到服务记录。'
        : null,
      '你可以继续在当前服务页的“应用组件 / 最近操作记录”查看进度。',
    ]
    : [
      input.alreadyPresent
        ? `${input.app.name} already has an install record on service #${input.serviceId}, so no duplicate job was queued.`
        : `${input.app.name} install has been queued for service #${input.serviceId}.`,
      `Status: ${installStatus}`,
      input.install?.id ? `Install record: #${input.install.id}` : null,
      dependencies.length > 0 ? `Dependencies: ${dependencies.join(', ')}` : null,
      panelUrl ? `${panelLabel} URL: ${panelUrl}` : null,
      panelUsername ? `Username: ${panelUsername}` : null,
      panelPassword ? `Password: ${panelPassword}` : null,
      !panelUrl
        ? 'This runs asynchronously. Panel URL and credentials will be written back after the installer finishes.'
        : null,
      'You can keep watching progress from the current service page under app installs and recent operations.',
    ];

  return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
}

function compareAssistantInstallRecency(a: ServiceAppInstall, b: ServiceAppInstall) {
  const aTime = Date.parse(a.updatedAt ?? a.completedAt ?? a.installedAt ?? a.lastAttemptAt ?? a.createdAt ?? '1970-01-01T00:00:00.000Z');
  const bTime = Date.parse(b.updatedAt ?? b.completedAt ?? b.installedAt ?? b.lastAttemptAt ?? b.createdAt ?? '1970-01-01T00:00:00.000Z');
  return bTime - aTime;
}

function buildAssistantInstallStatusReply(
  locale: string,
  input: {
    serviceId: string;
    install: ServiceAppInstall;
  },
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const responsePayload = input.install.responsePayload ?? null;
  const panelUrl = getStringValue(responsePayload?.panel_url)
    || getStringValue(responsePayload?.panelUrl)
    || null;
  const panelLabel = getStringValue(responsePayload?.panel_label)
    || getStringValue(responsePayload?.panelLabel)
    || input.install.recipe?.panelLabel
    || input.install.app?.name
    || 'Panel';
  const panelUsername = pickAssistantInstallCredential(responsePayload, [
    'panel_username',
    'panelUsername',
    'username',
    'login_username',
    'loginUsername',
  ]);
  const panelPassword = pickAssistantInstallCredential(responsePayload, [
    'panel_password',
    'panelPassword',
    'password',
    'login_password',
    'loginPassword',
  ]);
  const recentLogs = input.install.logs.slice(-6);
  const lines = zh
    ? [
      `服务 #${input.serviceId} 最近的应用安装记录如下。`,
      input.install.app?.name ? `应用：${input.install.app.name}` : null,
      `状态：${input.install.status || 'unknown'}`,
      input.install.id ? `安装记录：#${input.install.id}` : null,
      input.install.lastError ? `最近错误：${input.install.lastError}` : null,
      panelUrl ? `${panelLabel} 地址：${panelUrl}` : null,
      panelUsername ? `账号：${panelUsername}` : null,
      panelPassword ? `密码：${panelPassword}` : null,
      recentLogs.length > 0 ? `最近日志：\n${recentLogs.join('\n')}` : '暂时还没有可展示的安装日志。',
      !panelUrl ? '如果面板地址还没出现，说明安装仍在继续，完成后会自动回写。' : null,
    ]
    : [
      `Here is the latest app install record for service #${input.serviceId}.`,
      input.install.app?.name ? `App: ${input.install.app.name}` : null,
      `Status: ${input.install.status || 'unknown'}`,
      input.install.id ? `Install record: #${input.install.id}` : null,
      input.install.lastError ? `Last error: ${input.install.lastError}` : null,
      panelUrl ? `${panelLabel} URL: ${panelUrl}` : null,
      panelUsername ? `Username: ${panelUsername}` : null,
      panelPassword ? `Password: ${panelPassword}` : null,
      recentLogs.length > 0 ? `Recent logs:\n${recentLogs.join('\n')}` : 'No install logs are available yet.',
      !panelUrl ? 'If the panel URL is still missing, the installer is still running and will write it back when ready.' : null,
    ];

  return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
}

function truncateRemoteExecOutput(input: string | null | undefined, maxLength = 1400) {
  const text = String(input ?? '').trim();
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...`;
}

function formatRemoteExecDuration(locale: string, durationMs: number | null | undefined) {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return locale.toLowerCase().startsWith('zh')
    ? `${seconds} 秒`
    : `${seconds}s`;
}

function buildAssistantRemoteExecTraceSteps(
  steps: Array<{
    id: string;
    label: string;
    stdout?: string | null;
    stderr?: string | null;
    exitCode?: number | null;
    signal?: string | null;
    durationMs?: number | null;
    status?: 'completed' | 'failed';
  }>,
) {
  return steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status ?? ((step.exitCode ?? 0) === 0 ? 'completed' : 'failed'),
    exitCode: typeof step.exitCode === 'number' ? step.exitCode : null,
    signal: readNullableStringValue(step.signal),
    durationMs: typeof step.durationMs === 'number' ? step.durationMs : null,
    stdout: truncateRemoteExecOutput(step.stdout, 1200),
    stderr: truncateRemoteExecOutput(step.stderr, 1200),
  }));
}

function buildAssistantRemotePlaybookReply(
  locale: string,
  input: {
    serviceId: string;
    connector: RemoteExecConnector;
    playbook: RemotePlaybook;
    result: {
      totalDurationMs: number | null;
      steps: Array<{
        label: string;
        stdout: string;
        stderr: string;
        exitCode: number | null;
      }>;
      success: boolean;
      failureMessage?: string | null;
    };
  },
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const panelUrl = input.playbook.panelPort
    ? `${input.playbook.panelPort === 443 ? 'https' : 'http'}://${input.connector.host}:${input.playbook.panelPort}${input.playbook.panelPath ?? '/'}`
    : null;
  const lastStep = input.result.steps[input.result.steps.length - 1] ?? null;
  const stdout = truncateRemoteExecOutput(lastStep?.stdout);
  const stderr = truncateRemoteExecOutput(lastStep?.stderr);
  const duration = formatRemoteExecDuration(locale, input.result.totalDurationMs);

  const lines = zh
    ? [
      input.result.success
        ? `已通过 SSH 在服务 #${input.serviceId} 上执行 ${input.playbook.name}。`
        : `通过 SSH 执行 ${input.playbook.name} 时失败。`,
      `目标：${input.connector.username}@${input.connector.host}:${input.connector.port}`,
      duration ? `耗时：${duration}` : null,
      lastStep ? `最后步骤：${lastStep.label}` : null,
      input.result.failureMessage ? `失败原因：${input.result.failureMessage}` : null,
      input.result.success && panelUrl ? `${input.playbook.panelLabel ?? input.playbook.name} 地址：${panelUrl}` : null,
      input.result.success && input.playbook.defaultUsername ? `默认账号：${input.playbook.defaultUsername}` : null,
      input.result.success && input.playbook.defaultPassword ? `默认密码：${input.playbook.defaultPassword}` : null,
      stdout ? ['最近输出：', '```text', stdout, '```'].join('\n') : null,
      stderr ? ['错误输出：', '```text', stderr, '```'].join('\n') : null,
    ]
    : [
      input.result.success
        ? `${input.playbook.name} was executed over SSH for service #${input.serviceId}.`
        : `${input.playbook.name} failed during SSH execution.`,
      `Target: ${input.connector.username}@${input.connector.host}:${input.connector.port}`,
      duration ? `Duration: ${duration}` : null,
      lastStep ? `Last step: ${lastStep.label}` : null,
      input.result.failureMessage ? `Failure: ${input.result.failureMessage}` : null,
      input.result.success && panelUrl ? `${input.playbook.panelLabel ?? input.playbook.name} URL: ${panelUrl}` : null,
      input.result.success && input.playbook.defaultUsername ? `Default username: ${input.playbook.defaultUsername}` : null,
      input.result.success && input.playbook.defaultPassword ? `Default password: ${input.playbook.defaultPassword}` : null,
      stdout ? ['Recent output:', '```text', stdout, '```'].join('\n') : null,
      stderr ? ['Error output:', '```text', stderr, '```'].join('\n') : null,
    ];

  return {
    detail: lines.filter((entry): entry is string => Boolean(entry)).join('\n\n'),
    panelUrl,
  };
}

async function buildAssistantRemotePlaybookProposal(input: {
  token: string;
  locale: string;
  serviceId: string | null;
  message: string;
}) {
  if (!input.serviceId || !assistantMessageSuggestsDirectServerExecution(input.message)) {
    return null;
  }

  const playbook = matchRemotePlaybook(input.message);
  if (!playbook) {
    return null;
  }

  const service = (await gateway.service(input.token, input.serviceId)).data.service;
  const metadata = readVpsMetadata(service);
  const host = metadata.primaryIp ?? metadata.hostname ?? null;
  const zh = input.locale.toLowerCase().startsWith('zh');

  return {
    id: `proposal_${randomBytes(8).toString('hex')}`,
    title: zh ? `直接执行 ${playbook.name}（需确认）` : `Execute ${playbook.name} directly (requires confirmation)`,
    description: zh
      ? [
        `机器人会通过 SSH 直接连接服务 #${input.serviceId}${host ? `（${host}）` : ''}。`,
        `执行内容：${playbook.stepLabels.join('、')}`,
        '这是高风险动作，确认后才会真正改动服务器环境。',
      ].join(' ')
      : [
        `The assistant will connect to service #${input.serviceId}${host ? ` (${host})` : ''} over SSH.`,
        `Execution plan: ${playbook.stepLabels.join(', ')}.`,
        'This is a high-risk action and will only run after confirmation.',
      ].join(' '),
    risk: 'high' as const,
    requiresConfirmation: true,
    action: {
      kind: 'execute-service-playbook',
      serviceId: input.serviceId,
      invoiceId: null,
      playbookId: playbook.id,
      playbookName: playbook.name,
    },
  } satisfies AssistantActionProposal;
}

function buildAssistantRemotePlaybookManualCommand(playbook: RemotePlaybook) {
  switch (playbook.id) {
    case 'install-nginx-proxy-manager-direct':
      return [
        'mkdir -p /opt/nginx-proxy-manager/{data,letsencrypt}',
        "cat > /opt/nginx-proxy-manager/docker-compose.yml <<'EOF'",
        'services:',
        '  app:',
        '    image: jc21/nginx-proxy-manager:latest',
        '    restart: unless-stopped',
        '    ports:',
        '      - "80:80"',
        '      - "81:81"',
        '      - "443:443"',
        '    volumes:',
        '      - /opt/nginx-proxy-manager/data:/data',
        '      - /opt/nginx-proxy-manager/letsencrypt:/etc/letsencrypt',
        'EOF',
        'docker compose -f /opt/nginx-proxy-manager/docker-compose.yml up -d',
      ].join('\n');
    case 'bootstrap-docker':
      return [
        'apt-get update',
        'apt-get install -y ca-certificates curl gnupg lsb-release',
        'install -m 0755 -d /etc/apt/keyrings',
        '. /etc/os-release',
        'curl -fsSL "https://download.docker.com/linux/$ID/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
        'chmod a+r /etc/apt/keyrings/docker.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list',
        'apt-get update',
        'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
        'systemctl enable --now docker',
      ].join('\n');
    default:
      return null;
  }
}

function buildAssistantRemoteExecGuidanceReply(
  locale: string,
  input: {
    authenticated: boolean;
    serviceId: string | null;
    playbook: RemotePlaybook | null;
    playbookLabel?: string | null;
    manualCommand?: string | null;
  },
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const playbookLabel = readNullableStringValue(input.playbookLabel) || input.playbook?.name || null;
  const manualCommand = readNullableStringValue(input.manualCommand)
    || (input.playbook ? buildAssistantRemotePlaybookManualCommand(input.playbook) : null);

  if (!input.authenticated) {
    const lines = zh
      ? [
        '助手这边还没拿到你的登录态，这次不能直接代你执行。',
        input.serviceId ? `目标服务已识别：#${input.serviceId}。` : null,
        '请点右上角重新登录一次，或刷新页面后再发同一句话；恢复后我会直接给出确认按钮并开始执行。',
        playbookLabel
          ? `已识别内容：${playbookLabel}。`
          : '暂时还没识别出具体安装脚本，登录后我继续帮你识别并执行。',
        manualCommand ? ['如果你现在就要安装，也可以先直接复制这段：', '```bash', manualCommand, '```'].join('\n') : null,
      ]
      : [
        'The assistant does not currently have your signed-in session, so it cannot execute this action yet.',
        input.serviceId ? `Target service detected: #${input.serviceId}.` : null,
        'Please sign in again or refresh the page, then send the same request once more. I will show the confirmation action and continue.',
        playbookLabel
          ? `Matched content: ${playbookLabel}.`
          : 'No specific install playbook is matched yet. Sign in and I can continue the execution flow.',
        manualCommand ? ['If you want to install it right now, you can also copy and run this block:', '```bash', manualCommand, '```'].join('\n') : null,
      ];

    return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
  }

  if (!input.serviceId) {
    const lines = zh
      ? [
        '你已登录，但当前还不在具体服务页里，我不知道要操作哪台服务器。',
        '请先打开目标服务详情页（例如 `/services/19`），再发同一句话，我就会直接进入执行确认。',
        playbookLabel ? `已识别脚本：${playbookLabel}` : null,
        manualCommand ? ['如果你想先手动执行，可直接复制这段：', '```bash', manualCommand, '```'].join('\n') : null,
      ]
      : [
        'You are signed in, but there is no active service context yet, so I do not know which server to operate.',
        'Open the target service detail page (for example `/services/19`) and send the same request again. I will move straight into execution confirmation.',
        playbookLabel ? `Matched playbook: ${playbookLabel}` : null,
        manualCommand ? ['If you want to run it manually first, copy this block:', '```bash', manualCommand, '```'].join('\n') : null,
      ];

    return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
  }

  return zh
    ? '当前服务器代执行暂不可用，请稍后再试。'
    : 'Direct server execution is temporarily unavailable. Please try again shortly.';
}

function buildAssistantExecutionNeedDetailReply(
  locale: string,
  input: {
    serviceId: string;
    matchedPlaybookName?: string | null;
  },
) {
  const zh = locale.toLowerCase().startsWith('zh');
  const matchedPlaybookName = readNullableStringValue(input.matchedPlaybookName);

  if (matchedPlaybookName) {
    return zh
      ? `我已经识别到 ${matchedPlaybookName}。如果你要我直接动手，请直接发“确认执行”或点下面的确认动作。`
      : `I matched ${matchedPlaybookName}. If you want me to run it now, send "confirm execute" or use the confirmation action below.`;
  }

  return zh
    ? [
      `我可以直接给服务 #${input.serviceId} 执行，但你这句话还不够具体。`,
      '下一步只需要任选一种：发明确应用名、上传 `docker-compose.yml`、上传 `.sh` 脚本，或直接贴 `bash` 代码块。',
    ].join('\n\n')
    : [
      `I can run actions directly on service #${input.serviceId}, but this request is not specific enough yet.`,
      'Next, do one of these: send the exact app name, upload a `docker-compose.yml`, upload a `.sh` script, or paste a `bash` code block.',
    ].join('\n\n');
}

function buildAssistantPendingConfirmationReply(locale: string, proposal: AssistantActionProposal) {
  const zh = locale.toLowerCase().startsWith('zh');
  const lines = zh
    ? [
      `已准备动作：${proposal.title}`,
      proposal.description,
      '确认后我会直接执行，并把结果回写到聊天里。',
    ]
    : [
      `Prepared action: ${proposal.title}`,
      proposal.description,
      'Confirm and I will execute it directly, then write the result back into the chat.',
    ];

  return lines.filter((entry): entry is string => Boolean(entry)).join('\n\n');
}

async function buildAssistantInstallServiceAppProposal(input: {
  token: string;
  locale: string;
  serviceId: string | null;
  message: string;
}) {
  if (!input.serviceId || !assistantMessageSuggestsAppInstall(input.message)) {
    return null;
  }

  const apps = await gateway.serviceApps(input.token, input.serviceId).catch(() => null);
  const catalog = apps?.data.catalog;
  if (!catalog) {
    return null;
  }

  const installableApps = catalog.addonApps.filter((app) => app.allowOnExistingService && app.available);
  const scored = installableApps
    .map((app) => ({
      app,
      score: scoreAssistantInstallableApp(input.message, app),
    }))
    .filter((entry) => entry.score >= 92)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best) {
    return null;
  }

  const second = scored[1];
  if (second && second.score === best.score && best.score < 116) {
    return null;
  }

  return assistantProposalFromRequestedAction(input.locale, {
    kind: 'install-service-app',
    serviceId: input.serviceId,
    invoiceId: null,
    appSlug: best.app.slug,
    appName: best.app.name,
  });
}

async function createAssistantSupportRecord(
  request: FastifyRequest,
  input: {
    locale: string;
    summary: string;
    user: { id: string; name: string; email: string } | null;
    serviceId: string | null;
    invoiceId: string | null;
  },
) {
  const supportUrl = env.ASSISTANT_SUPPORT_WEB_URL;
  const ticketApiUrl = getStringValue(env.ASSISTANT_TICKET_API_URL);
  const ticketApiToken = getStringValue(env.ASSISTANT_TICKET_API_TOKEN);

  if (!ticketApiUrl || !ticketApiToken) {
    return {
      ticketCreated: false,
      supportUrl,
      message: input.locale.toLowerCase().startsWith('zh')
        ? '已整理问题摘要，请转人工继续处理。'
        : 'Context has been summarized. Please continue with human support.',
      summary: input.summary,
    };
  }

  try {
    const titlePrefix = input.locale.toLowerCase().startsWith('zh') ? '机器人转人工' : 'Assistant escalation';
    const title = `${titlePrefix} ${input.serviceId ? `#${input.serviceId}` : ''}`.trim();
    const response = await fetch(ticketApiUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ticketApiToken}`,
      },
      body: JSON.stringify({
        title,
        priority: 'medium',
        status: 'open',
        user_id: input.user?.id ?? null,
        service_id: input.serviceId,
        invoice_id: input.invoiceId,
        message: input.summary,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`ticket-api status=${response.status}`);
    }

    const payloadRecord = asRecordValue(payload);
    const payloadData = asRecordValue(payloadRecord.data);
    const ticketId = getStringValue(payloadRecord.id) || getStringValue(payloadData.id);
    return {
      ticketCreated: true,
      supportUrl,
      ticketId: ticketId || null,
      message: input.locale.toLowerCase().startsWith('zh')
        ? `已创建支持记录${ticketId ? ` #${ticketId}` : ''}。`
        : `Support record created${ticketId ? ` #${ticketId}` : ''}.`,
      summary: input.summary,
    };
  } catch (error) {
    request.log.warn({ error }, 'Assistant failed to create support record via ticket API.');
    return {
      ticketCreated: false,
      supportUrl,
      message: input.locale.toLowerCase().startsWith('zh')
        ? '自动创建支持记录失败，请转人工处理。'
        : 'Automatic support record creation failed. Please continue with human support.',
      summary: input.summary,
    };
  }
}

async function executeAssistantAction(
  request: FastifyRequest,
  input: {
    token: string | null;
    locale: string;
    user: { id: string; name: string; email: string } | null;
    proposal: AssistantActionProposal;
  },
): Promise<AssistantActionExecutionResult> {
  const action = input.proposal.action;
  const serviceId = readNullableStringValue(action.serviceId);
  const zh = input.locale.toLowerCase().startsWith('zh');

  if (action.kind !== 'handoff-support' && action.kind !== 'create-launch-capsule' && action.kind !== 'create-repo-workspace' && !serviceId) {
    throw new GatewayError('Service ID is required for this action.', 422, {
      code: 'ASSISTANT_SERVICE_ID_REQUIRED',
    });
  }

  if (action.kind !== 'create-launch-capsule' && action.kind !== 'create-repo-workspace' && !input.token) {
    throw new GatewayError('Authentication is required for this action.', 401, {
      code: 'ASSISTANT_AUTH_REQUIRED',
    });
  }

  switch (action.kind) {
    case 'create-repo-workspace': {
      const repoUrl = extractAssistantRepoUrl(action.repoUrl?.trim() || '');
      if (!repoUrl) {
        throw new GatewayError('Repository URL is invalid.', 422, {
          code: 'ASSISTANT_REPO_URL_INVALID',
          detail: zh
            ? '仓库地址不合法。请只提供纯仓库 URL（例如 https://github.com/org/repo 或 https://github.com/org/repo.git）。'
            : 'The repository URL is invalid. Provide a clean repository URL such as https://github.com/org/repo or https://github.com/org/repo.git.',
        });
      }
      const envelope = await operatorEngine.analyzeProject({
        projectName: action.projectName?.trim() || buildAssistantRepoProjectName(repoUrl, input.locale),
        repoUrl,
        notes: action.notes?.trim() || null,
        planningMode: action.planningMode === 'on' ? 'on' : 'off',
        autoStartBuild: true,
        existingCapsuleId: action.capsuleId ?? null,
        userIntent: [action.notes?.trim(), repoUrl].filter(Boolean).join('\n\n') || repoUrl,
        taskMode: action.taskMode === 'new_turn' ? 'new_turn' : 'continue',
      });
      const capsulePath = buildOperatorWorkbenchPath(envelope.capsule.id);
      const capsuleUrl = buildAbsoluteCapsuleUrl(request, capsulePath);

      return mapAssistantActionResponse(
        zh
          ? '已创建真实仓库工作区，正在执行技术栈识别和预览验证。'
          : 'Created the real repository workspace. Stack detection and preview verification are now running.',
        'ASSISTANT_OPERATOR_REPO_WORKSPACE_STARTED',
        {
          route: 'repo_import_deploy',
          lane: 'repository',
          source: 'repository',
          operationId: envelope.latestJob?.id ?? envelope.capsule.id,
          capsuleId: envelope.capsule.id,
          capsulePath,
          capsuleUrl,
          previewUrl: envelope.previewUrl ?? envelope.previewSummary.previewUrl ?? envelope.capsule.previewUrl ?? null,
          workflow: envelope.workflow,
          truthState: envelope.truthState,
          techStackSummary: envelope.techStackSummary,
          envChecklistSummary: envelope.envChecklistSummary,
          deploymentSummary: envelope.deploymentSummary,
        },
      );
    }
    case 'create-launch-capsule': {
      const generationTask = operatorEngine.startGenerateProjectTask({
        projectName: action.projectName ?? buildAssistantIdeaProjectName(action.idea ?? '', input.locale),
        idea: action.idea ?? input.proposal.description,
        audience: action.audience ?? (zh ? '普通用户' : 'general users'),
        businessGoal: action.businessGoal ?? (zh
          ? '低门槛快速上线并可持续运营'
          : 'launch quickly with low-friction operations'),
        strictModelGeneration: true,
        planningMode: action.planningMode === 'on' ? 'on' : 'off',
        existingCapsuleId: action.capsuleId ?? null,
        userIntent: action.idea ?? input.proposal.description,
        taskMode: action.taskMode === 'new_turn' ? 'new_turn' : 'continue',
      });
      const capsulePath = action.capsuleId ? buildOperatorWorkbenchPath(action.capsuleId) : null;
      const capsuleUrl = capsulePath ? buildAbsoluteCapsuleUrl(request, capsulePath) : null;

      return mapAssistantActionResponse(
        zh
          ? '已启动真实工作区生成任务，正在规划、编码并构建共享预览。'
          : 'Started the real workspace build task. Planning, coding, and preview build are now running.',
        'ASSISTANT_OPERATOR_CAPSULE_TASK_STARTED',
        {
          route: 'idea_generate',
          lane: 'generated-project',
          source: 'idea',
          operationId: generationTask.id,
          taskId: generationTask.id,
          capsuleId: action.capsuleId ?? null,
          capsulePath,
          capsuleUrl,
          generationTask,
          task: buildAssistantGenerationTaskSnapshot({
            request,
            taskId: generationTask.id,
            task: generationTask,
          }),
        },
      );
    }
    case 'retry-provisioning': {
      const response = await executeLoggedAction(request, {
        token: input.token!,
        serviceId: serviceId!,
        action: 'assistant-retry-provisioning',
        requestPayload: { force: true },
        successCode: 'ASSISTANT_RETRY_PROVISIONING_OK',
        failureCode: 'ASSISTANT_RETRY_PROVISIONING_FAILED',
        run: () => gateway.retryServiceProvisioning(input.token!, serviceId!, { force: true }),
      });

      return mapAssistantActionResponse(
        getStringValue(response.message) || (zh ? '已提交重试开通。' : 'Provisioning retry submitted.'),
        'ASSISTANT_RETRY_PROVISIONING_OK',
        asRecordValue(response.actionResult),
      );
    }
    case 'restart-runtime': {
      const context = await loadRuntimeContext(input.token!, serviceId!);

      if (context.runtimeKind === 'managed-app') {
        const response = await managedAppRuntime.restart(context.service, managedAppOptionsFromContext(context))
          .catch((error: unknown) => managedAppErrorToGateway(error, 'assistant-restart-runtime'));

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-restart-runtime',
          success: true,
          code: 'ASSISTANT_RUNTIME_RESTART_OK',
          message: getStringValue(response.message) || null,
          detail: getStringValue(response.message) || null,
          requestPayload: {},
          responsePayload: {
            runtime: asRecordValue(response.runtime),
            properties: asRecordValue(response.properties),
          },
        });

        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '应用实例重启命令已提交。' : 'Runtime restart command submitted.'),
          'ASSISTANT_RUNTIME_RESTART_OK',
          null,
        );
      }

      const restartActionName = findActionName(context.buttons, ['restart', 'reboot', 'power-restart']);
      if (restartActionName) {
        const response = await executeLoggedAction(request, {
          token: input.token!,
          serviceId: serviceId!,
          action: 'assistant-restart-runtime',
          requestPayload: { action: restartActionName },
          successCode: 'ASSISTANT_RUNTIME_RESTART_OK',
          failureCode: 'ASSISTANT_RUNTIME_RESTART_FAILED',
          run: () => gateway.serviceAction(input.token!, serviceId!, restartActionName, { state: 'restart' }),
        });

        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '服务器重启命令已提交。' : 'Server restart command submitted.'),
          'ASSISTANT_RUNTIME_RESTART_OK',
          asRecordValue(response.actionResult),
        );
      }

      if (context.serverRef && convoyEnabled) {
        await convoy.power(context.serverRef, 'restart');
        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-restart-runtime',
          success: true,
          code: 'ASSISTANT_RUNTIME_RESTART_OK',
          message: zh ? '已通过 Convoy 提交重启。' : 'Restart submitted through Convoy.',
          detail: null,
          requestPayload: {},
          responsePayload: {},
        });
        return mapAssistantActionResponse(
          zh ? '已通过 Convoy 提交重启。' : 'Restart submitted through Convoy.',
          'ASSISTANT_RUNTIME_RESTART_OK',
          null,
        );
      }

      throw new GatewayError('Restart is not available for this service.', 409, {
        code: 'ASSISTANT_RUNTIME_RESTART_UNAVAILABLE',
      });
    }
    case 'stop-runtime': {
      const context = await loadRuntimeContext(input.token!, serviceId!);

      if (context.runtimeKind === 'managed-app') {
        const response = await managedAppRuntime.scale(context.service, 0, managedAppOptionsFromContext(context))
          .catch((error: unknown) => managedAppErrorToGateway(error, 'assistant-stop-runtime'));

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-stop-runtime',
          success: true,
          code: 'ASSISTANT_RUNTIME_STOP_OK',
          message: getStringValue(response.message) || null,
          detail: getStringValue(response.message) || null,
          requestPayload: {},
          responsePayload: {
            runtime: asRecordValue(response.runtime),
            properties: asRecordValue(response.properties),
          },
        });

        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '应用实例已缩容到 0，已进入停机状态。' : 'Runtime scaled to 0 replicas and powered off.'),
          'ASSISTANT_RUNTIME_STOP_OK',
          null,
        );
      }

      const stopActionName = findActionName(context.buttons, ['shutdown', 'poweroff', 'power-off', 'stop', 'kill']);
      if (stopActionName) {
        const response = await executeLoggedAction(request, {
          token: input.token!,
          serviceId: serviceId!,
          action: 'assistant-stop-runtime',
          requestPayload: { action: stopActionName },
          successCode: 'ASSISTANT_RUNTIME_STOP_OK',
          failureCode: 'ASSISTANT_RUNTIME_STOP_FAILED',
          run: () => gateway.serviceAction(input.token!, serviceId!, stopActionName, { state: 'stop' }),
        });

        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '服务器关机命令已提交。' : 'Server power-off command submitted.'),
          'ASSISTANT_RUNTIME_STOP_OK',
          asRecordValue(response.actionResult),
        );
      }

      if (context.serverRef && convoyEnabled) {
        await convoy.power(context.serverRef, 'shutdown');
        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-stop-runtime',
          success: true,
          code: 'ASSISTANT_RUNTIME_STOP_OK',
          message: zh ? '已通过 Convoy 提交关机。' : 'Power-off submitted through Convoy.',
          detail: null,
          requestPayload: {},
          responsePayload: {},
        });
        return mapAssistantActionResponse(
          zh ? '已通过 Convoy 提交关机。' : 'Power-off submitted through Convoy.',
          'ASSISTANT_RUNTIME_STOP_OK',
          null,
        );
      }

      throw new GatewayError('Power-off is not available for this service.', 409, {
        code: 'ASSISTANT_RUNTIME_STOP_UNAVAILABLE',
      });
    }
    case 'sync-runtime': {
      const context = await loadRuntimeContext(input.token!, serviceId!);
      if (context.runtimeKind === 'managed-app') {
        const response = await managedAppRuntime.reconcile(context.service, managedAppOptionsFromContext(context))
          .catch((error: unknown) => managedAppErrorToGateway(error, 'assistant-sync-runtime'));

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-sync-runtime',
          success: true,
          code: 'ASSISTANT_RUNTIME_SYNC_OK',
          message: getStringValue(response.message) || null,
          detail: getStringValue(response.message) || null,
          requestPayload: {},
          responsePayload: {
            runtime: asRecordValue(response.runtime),
            properties: asRecordValue(response.properties),
          },
        });
        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '运行状态同步完成。' : 'Runtime reconcile completed.'),
          'ASSISTANT_RUNTIME_SYNC_OK',
          null,
        );
      }

      const refreshed = await gateway.service(input.token!, serviceId!);
      await recordServiceOperationLog(request, input.token!, serviceId!, {
        source: 'assistant-bot',
        action: 'assistant-sync-runtime',
        success: true,
        code: 'ASSISTANT_RUNTIME_SYNC_OK',
        message: zh ? '已刷新服务状态。' : 'Service state refreshed.',
        detail: null,
        requestPayload: {},
        responsePayload: asRecordValue(refreshed.data.service),
      });
      return mapAssistantActionResponse(
        zh ? '已刷新服务状态。' : 'Service state refreshed.',
        'ASSISTANT_RUNTIME_SYNC_OK',
        null,
      );
    }
    case 'check-service-app-status': {
      const serviceApps = await gateway.serviceApps(input.token!, serviceId!);
      const appSlug = readNullableStringValue(action.appSlug);
      const installs = serviceApps.data.installs
        .filter((install) => !appSlug || install.app?.slug === appSlug)
        .sort(compareAssistantInstallRecency);
      const latestInstall = installs[0] ?? null;

      if (!latestInstall) {
        const detail = zh
          ? `服务 #${serviceId!} 目前还没有应用组件安装记录。`
          : `Service #${serviceId!} does not have any app install records yet.`;

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-check-service-app-status',
          success: true,
          code: 'ASSISTANT_SERVICE_APP_STATUS_EMPTY',
          message: detail,
          detail,
          requestPayload: {
            appSlug,
          },
          responsePayload: {
            appSlug,
            servicePath: `/services/${serviceId!}`,
          },
        });

        return mapAssistantActionResponse(
          detail,
          'ASSISTANT_SERVICE_APP_STATUS_EMPTY',
          {
            appSlug,
            servicePath: `/services/${serviceId!}`,
            detail,
          },
        );
      }

      const detail = buildAssistantInstallStatusReply(input.locale, {
        serviceId: serviceId!,
        install: latestInstall,
      });
      const responsePayload = latestInstall.responsePayload ?? null;

      await recordServiceOperationLog(request, input.token!, serviceId!, {
        source: 'assistant-bot',
        action: 'assistant-check-service-app-status',
        success: true,
        code: 'ASSISTANT_SERVICE_APP_STATUS_READY',
        message: zh ? '应用安装状态已整理。' : 'App install status is ready.',
        detail,
        requestPayload: {
          appSlug,
        },
        responsePayload: {
          appSlug: latestInstall.app?.slug ?? appSlug,
          appName: latestInstall.app?.name ?? null,
          installId: latestInstall.id,
          status: latestInstall.status,
          panelUrl: getStringValue(responsePayload?.panel_url)
            || getStringValue(responsePayload?.panelUrl)
            || null,
          panelLabel: getStringValue(responsePayload?.panel_label)
            || getStringValue(responsePayload?.panelLabel)
            || latestInstall.recipe?.panelLabel
            || latestInstall.app?.name
            || null,
          panelUsername: pickAssistantInstallCredential(responsePayload, [
            'panel_username',
            'panelUsername',
            'username',
            'login_username',
            'loginUsername',
          ]),
          panelPassword: pickAssistantInstallCredential(responsePayload, [
            'panel_password',
            'panelPassword',
            'password',
            'login_password',
            'loginPassword',
          ]),
          servicePath: `/services/${serviceId!}`,
        },
      });

      return mapAssistantActionResponse(
        zh ? '已整理最近的应用安装状态。' : 'Latest app install status is ready.',
        'ASSISTANT_SERVICE_APP_STATUS_READY',
        {
          appSlug: latestInstall.app?.slug ?? appSlug,
          appName: latestInstall.app?.name ?? null,
          installId: latestInstall.id,
          status: latestInstall.status,
          panelUrl: getStringValue(responsePayload?.panel_url)
            || getStringValue(responsePayload?.panelUrl)
            || null,
          panelLabel: getStringValue(responsePayload?.panel_label)
            || getStringValue(responsePayload?.panelLabel)
            || latestInstall.recipe?.panelLabel
            || latestInstall.app?.name
            || null,
          panelUsername: pickAssistantInstallCredential(responsePayload, [
            'panel_username',
            'panelUsername',
            'username',
            'login_username',
            'loginUsername',
          ]),
          panelPassword: pickAssistantInstallCredential(responsePayload, [
            'panel_password',
            'panelPassword',
            'password',
            'login_password',
            'loginPassword',
          ]),
          servicePath: `/services/${serviceId!}`,
          detail,
        },
      );
    }
    case 'execute-service-playbook': {
      const customScript = readNullableStringValue(action.playbookScript);
      const customPlaybookName = readNullableStringValue(action.playbookName)
        || (zh ? '自定义服务器脚本' : 'Custom server script');
      const playbook = customScript
        ? {
          id: readNullableStringValue(action.playbookId) || `custom-script-${randomBytes(4).toString('hex')}`,
          name: customPlaybookName,
          description: customPlaybookName,
          keywords: [],
          stepLabels: [zh ? '执行自定义脚本' : 'Run custom script'],
          steps: [
            {
              id: 'run-custom-script',
              label: zh ? '执行自定义脚本' : 'Run custom script',
              script: customScript,
              timeoutMs: 20 * 60 * 1000,
            },
          ],
        } satisfies RemotePlaybook
        : getRemotePlaybook(readNullableStringValue(action.playbookId));
      if (!playbook) {
        return mapAssistantActionResponse(
          zh ? '当前还没有匹配到可执行的服务器部署脚本。' : 'No matching server deployment playbook is available yet.',
          'ASSISTANT_REMOTE_PLAYBOOK_NOT_FOUND',
          {
            success: false,
            servicePath: `/services/${serviceId!}`,
            detail: zh ? '当前还没有匹配到可执行的服务器部署脚本。' : 'No matching server deployment playbook is available yet.',
          },
        );
      }

      try {
        const { connector } = await resolveAssistantRemoteExecConnector(request, {
          token: input.token!,
          serviceId: serviceId!,
        });
        const execution = await runRemotePlaybook({
          connector,
          playbook,
        });
        const reply = buildAssistantRemotePlaybookReply(input.locale, {
          serviceId: serviceId!,
          connector,
          playbook,
          result: {
            totalDurationMs: execution.totalDurationMs,
            steps: execution.steps,
            success: true,
          },
        });

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-execute-service-playbook',
          success: true,
          code: 'ASSISTANT_REMOTE_EXEC_OK',
          message: zh ? `${playbook.name} 已通过 SSH 执行完成。` : `${playbook.name} finished over SSH.`,
          detail: reply.detail,
          requestPayload: {
            playbookId: playbook.id,
            playbookName: playbook.name,
            host: connector.host,
            port: connector.port,
            username: connector.username,
          },
          responsePayload: {
            playbookId: playbook.id,
            playbookName: playbook.name,
            host: connector.host,
            port: connector.port,
            username: connector.username,
            totalDurationMs: execution.totalDurationMs,
            steps: execution.steps.map((step) => ({
              id: step.id,
              label: step.label,
              exitCode: step.exitCode,
              signal: step.signal,
              durationMs: step.durationMs,
              stdout: truncateRemoteExecOutput(step.stdout, 800),
              stderr: truncateRemoteExecOutput(step.stderr, 800),
            })),
            panelUrl: reply.panelUrl,
            panelLabel: playbook.panelLabel ?? playbook.name,
            panelUsername: playbook.defaultUsername ?? null,
            panelPassword: playbook.defaultPassword ?? null,
            servicePath: `/services/${serviceId!}`,
          },
        });

        return mapAssistantActionResponse(
          zh ? `${playbook.name} 已执行完成。` : `${playbook.name} finished.`,
          'ASSISTANT_REMOTE_EXEC_OK',
          {
            success: true,
            playbookId: playbook.id,
            playbookName: playbook.name,
            host: connector.host,
            port: connector.port,
            username: connector.username,
            totalDurationMs: execution.totalDurationMs,
            steps: buildAssistantRemoteExecTraceSteps(execution.steps),
            panelUrl: reply.panelUrl,
            panelLabel: playbook.panelLabel ?? playbook.name,
            panelUsername: playbook.defaultUsername ?? null,
            panelPassword: playbook.defaultPassword ?? null,
            servicePath: `/services/${serviceId!}`,
            detail: reply.detail,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : (zh ? '远程执行失败。' : 'Remote execution failed.');
        const partialSteps = error instanceof RemoteExecError
          ? [
            ...buildAssistantRemoteExecTraceSteps(error.partialSteps),
            ...(error.stepId || error.stepLabel || error.stdout || error.stderr
              ? [{
                id: error.stepId ?? `failed-step-${Date.now()}`,
                label: error.stepLabel ?? (zh ? '失败步骤' : 'Failed step'),
                status: 'failed' as const,
                exitCode: null,
                signal: null,
                durationMs: error.totalDurationMs,
                stdout: truncateRemoteExecOutput(error.stdout, 1200),
                stderr: truncateRemoteExecOutput(error.stderr, 1200),
              }]
              : []),
          ]
          : [];
        const detail = buildAssistantRemotePlaybookReply(input.locale, {
          serviceId: serviceId!,
          connector: {
            host: zh ? '未连接' : 'not-connected',
            port: 22,
            username: 'root',
          },
          playbook,
          result: {
            totalDurationMs: null,
            steps: [],
            success: false,
            failureMessage: message,
          },
        }).detail;

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-execute-service-playbook',
          success: false,
          code: 'ASSISTANT_REMOTE_EXEC_FAILED',
          message,
          detail,
          requestPayload: {
            playbookId: playbook.id,
            playbookName: playbook.name,
          },
          responsePayload: {
            error: message,
            servicePath: `/services/${serviceId!}`,
          },
        }).catch(() => undefined);

        return mapAssistantActionResponse(
          zh ? `${playbook.name} 执行失败。` : `${playbook.name} failed.`,
          'ASSISTANT_REMOTE_EXEC_FAILED',
          {
            success: false,
            playbookId: playbook.id,
            playbookName: playbook.name,
            steps: partialSteps,
            totalDurationMs: error instanceof RemoteExecError ? error.totalDurationMs : null,
            servicePath: `/services/${serviceId!}`,
            detail,
          },
        );
      }
    }
    case 'install-service-app': {
      const appSlug = readNullableStringValue(action.appSlug);
      if (!appSlug) {
        throw new GatewayError('App slug is required for install action.', 422, {
          code: 'ASSISTANT_APP_SLUG_REQUIRED',
        });
      }

      const serviceApps = await gateway.serviceApps(input.token!, serviceId!);
      const catalog = serviceApps.data.catalog;
      if (!catalog) {
        throw new GatewayError('This service does not expose an installable app catalog yet.', 409, {
          code: 'ASSISTANT_APP_CATALOG_UNAVAILABLE',
        });
      }

      const app = catalog.addonApps.find((entry) => entry.slug === appSlug && entry.allowOnExistingService);
      if (!app) {
        throw new GatewayError('Requested app is not available for this service.', 404, {
          code: 'ASSISTANT_APP_NOT_FOUND',
        });
      }

      if (!app.available) {
        throw new GatewayError(app.unavailableReason || 'Requested app is not currently installable.', 409, {
          code: 'ASSISTANT_APP_UNAVAILABLE',
          detail: app.unavailableReason || null,
        });
      }

      const existingInstall = serviceApps.data.installs.find((install) => install.app?.slug === app.slug) ?? null;
      const alreadyPresent = serviceApps.data.addonAppSlugs.includes(app.slug) || existingInstall !== null;

      if (alreadyPresent) {
        const detail = buildAssistantInstallServiceAppReply(input.locale, {
          serviceId: serviceId!,
          app,
          install: existingInstall,
          alreadyPresent: true,
        });

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-install-service-app',
          success: true,
          code: 'ASSISTANT_SERVICE_APP_ALREADY_PRESENT',
          message: zh ? `${app.name} 已存在，无需重复安装。` : `${app.name} is already present. No duplicate install was queued.`,
          detail,
          requestPayload: {
            appSlug: app.slug,
          },
          responsePayload: {
            appSlug: app.slug,
            appName: app.name,
            installId: existingInstall?.id ?? null,
            status: existingInstall?.status ?? 'ready',
            panelUrl: getStringValue(existingInstall?.responsePayload?.panel_url)
              || getStringValue(existingInstall?.responsePayload?.panelUrl)
              || null,
            servicePath: `/services/${serviceId!}`,
          },
        });

        return mapAssistantActionResponse(
          zh ? `${app.name} 已存在。` : `${app.name} is already present.`,
          'ASSISTANT_SERVICE_APP_ALREADY_PRESENT',
          {
            appSlug: app.slug,
            appName: app.name,
            installId: existingInstall?.id ?? null,
            status: existingInstall?.status ?? 'ready',
            panelUrl: getStringValue(existingInstall?.responsePayload?.panel_url)
              || getStringValue(existingInstall?.responsePayload?.panelUrl)
              || null,
            servicePath: `/services/${serviceId!}`,
            detail,
          },
        );
      }

      const installed = await gateway.installServiceApps(input.token!, serviceId!, [app.slug]);
      const installRecord = installed.data.queued.find((entry) => entry.app?.slug === app.slug)
        ?? installed.data.apps.installs.find((entry) => entry.app?.slug === app.slug)
        ?? null;
      const detail = buildAssistantInstallServiceAppReply(input.locale, {
        serviceId: serviceId!,
        app,
        install: installRecord,
        alreadyPresent: false,
      });

      await recordServiceOperationLog(request, input.token!, serviceId!, {
        source: 'assistant-bot',
        action: 'assistant-install-service-app',
        success: true,
        code: 'ASSISTANT_SERVICE_APP_INSTALL_QUEUED',
        message: zh ? `${app.name} 安装任务已提交。` : `${app.name} install has been queued.`,
        detail,
        requestPayload: {
          appSlug: app.slug,
        },
        responsePayload: {
          appSlug: app.slug,
          appName: app.name,
          installId: installRecord?.id ?? null,
          status: installRecord?.status ?? 'queued',
          panelUrl: getStringValue(installRecord?.responsePayload?.panel_url)
            || getStringValue(installRecord?.responsePayload?.panelUrl)
            || null,
          servicePath: `/services/${serviceId!}`,
        },
      });

      return mapAssistantActionResponse(
        zh ? `${app.name} 安装任务已提交。` : `${app.name} install has been queued.`,
        'ASSISTANT_SERVICE_APP_INSTALL_QUEUED',
        {
          appSlug: app.slug,
          appName: app.name,
          installId: installRecord?.id ?? null,
          status: installRecord?.status ?? 'queued',
          panelUrl: getStringValue(installRecord?.responsePayload?.panel_url)
            || getStringValue(installRecord?.responsePayload?.panelUrl)
            || null,
          panelLabel: getStringValue(installRecord?.responsePayload?.panel_label)
            || getStringValue(installRecord?.responsePayload?.panelLabel)
            || installRecord?.recipe?.panelLabel
            || app.recipe?.panelLabel
            || app.name,
          panelUsername: pickAssistantInstallCredential(installRecord?.responsePayload ?? null, [
            'panel_username',
            'panelUsername',
            'username',
            'login_username',
            'loginUsername',
          ]),
          panelPassword: pickAssistantInstallCredential(installRecord?.responsePayload ?? null, [
            'panel_password',
            'panelPassword',
            'password',
            'login_password',
            'loginPassword',
          ]),
          servicePath: `/services/${serviceId!}`,
          detail,
        },
      );
    }
    case 'reveal-server-access': {
      const revealed = await revealServiceServerPassword(request, {
        token: input.token!,
        serviceId: serviceId!,
      });
      const revealedData = asRecordValue(revealed.data);
      const detail = buildAssistantServerAccessReply(input.locale, revealed.service, revealedData);

      await recordServiceOperationLog(request, input.token!, serviceId!, {
        source: 'assistant-bot',
        action: 'assistant-reveal-server-access',
        success: true,
        code: 'ASSISTANT_SERVER_ACCESS_READY',
        message: zh ? '服务器登录信息已准备。' : 'Server login details are ready.',
        detail,
        requestPayload: {},
        responsePayload: revealedData ?? {},
      });

      return mapAssistantActionResponse(
        zh ? '已获取服务器登录信息。' : 'Server login details retrieved.',
        'ASSISTANT_SERVER_ACCESS_READY',
        {
          ...(revealedData ?? {}),
          detail,
        },
      );
    }
    case 'cancel-service': {
      return mapAssistantActionResponse(
        zh
          ? '为了安全，取消服务现在必须输入账号当前密码。请在服务详情页完成取消操作。'
          : 'For security, cancellation now requires your current account password. Please complete it on the service page.',
        'ASSISTANT_CANCEL_REQUIRES_PASSWORD',
        null,
      );
    }
    case 'renew-service': {
      const response = await executeLoggedAction(request, {
        token: input.token!,
        serviceId: serviceId!,
        action: 'assistant-renew-service',
        requestPayload: {},
        successCode: 'ASSISTANT_RENEW_OK',
        failureCode: 'ASSISTANT_RENEW_FAILED',
        run: () => gateway.renewService(input.token!, serviceId!),
      });

      return mapAssistantActionResponse(
        getStringValue(response.message) || (zh ? '续费账单已创建。' : 'Renewal invoice has been created.'),
        'ASSISTANT_RENEW_OK',
        asRecordValue(response.actionResult),
      );
    }
    case 'delete-runtime': {
      const context = await loadRuntimeContext(input.token!, serviceId!);

      if (context.runtimeKind === 'managed-app') {
        const response = await managedAppRuntime.deleteRuntime(context.service, managedAppOptionsFromContext(context))
          .catch((error: unknown) => managedAppErrorToGateway(error, 'assistant-delete-runtime'));

        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-delete-runtime',
          success: true,
          code: 'ASSISTANT_DELETE_RUNTIME_OK',
          message: getStringValue(response.message) || null,
          detail: getStringValue(response.message) || null,
          requestPayload: {},
          responsePayload: {
            runtime: asRecordValue(response.runtime),
            properties: asRecordValue(response.properties),
          },
        });

        return mapAssistantActionResponse(
          getStringValue(response.message) || (zh ? '运行实例删除请求已提交。' : 'Runtime deletion request submitted.'),
          'ASSISTANT_DELETE_RUNTIME_OK',
          null,
        );
      }

      if (context.serverRef && convoyEnabled) {
        await convoy.destroy(context.serverRef, false);
        await recordServiceOperationLog(request, input.token!, serviceId!, {
          source: 'assistant-bot',
          action: 'assistant-delete-runtime',
          success: true,
          code: 'ASSISTANT_DELETE_RUNTIME_OK',
          message: zh ? '已提交服务器销毁。' : 'Server destroy request submitted.',
          detail: null,
          requestPayload: {},
          responsePayload: {},
        });
        return mapAssistantActionResponse(
          zh ? '已提交服务器销毁。' : 'Server destroy request submitted.',
          'ASSISTANT_DELETE_RUNTIME_OK',
          null,
        );
      }

      throw new GatewayError('Delete runtime is not available for this service.', 409, {
        code: 'ASSISTANT_DELETE_RUNTIME_UNAVAILABLE',
      });
    }
    case 'handoff-support': {
      const support = await createAssistantSupportRecord(request, {
        locale: input.locale,
        summary: [
          `user=${input.user?.name ?? 'guest'} (${input.user?.email ?? 'unknown'})`,
          `serviceId=${serviceId ?? '-'}`,
          `invoiceId=${action.invoiceId ?? '-'}`,
          `request=${input.proposal.description}`,
        ].join('\n'),
        user: input.user,
        serviceId,
        invoiceId: readNullableStringValue(action.invoiceId),
      });

      if (serviceId) {
        await recordServiceOperationLog(request, input.token!, serviceId, {
          source: 'assistant-bot',
          action: 'assistant-handoff-support',
          success: true,
          code: support.ticketCreated ? 'ASSISTANT_SUPPORT_RECORD_CREATED' : 'ASSISTANT_SUPPORT_FALLBACK',
          message: support.message,
          detail: support.summary,
          requestPayload: {
            invoiceId: action.invoiceId ?? null,
          },
          responsePayload: asRecordValue(support),
        });
      }

      return mapAssistantActionResponse(
        support.message,
        support.ticketCreated ? 'ASSISTANT_SUPPORT_RECORD_CREATED' : 'ASSISTANT_SUPPORT_FALLBACK',
        asRecordValue(support),
      );
    }
  }

  throw new Error('Unhandled assistant action.');
}

async function buildAssistantFacts(
  token: string | null,
  context: AssistantContext,
) {
  const accountSummary: string[] = [];
  if (!token) {
    return accountSummary;
  }

  if (context.serviceId) {
    try {
      const [serviceResponse, provisioningResponse] = await Promise.all([
        gateway.service(token, context.serviceId),
        gateway.serviceProvisioning(token, context.serviceId),
      ]);
      const service = serviceResponse.data.service;
      accountSummary.push(
        `service=${service.id} status=${service.status} label=${service.label || service.baseLabel}`,
      );
      if (service.product?.name) {
        accountSummary.push(`product=${service.product.name}`);
      }
      if (service.expiresAt) {
        accountSummary.push(`expiresAt=${service.expiresAt}`);
      }
      if (provisioningResponse.data.latest) {
        accountSummary.push(
          `provisioningStatus=${provisioningResponse.data.latest.status}`,
        );
        if (provisioningResponse.data.latest.errorCode) {
          accountSummary.push(`provisioningCode=${provisioningResponse.data.latest.errorCode}`);
        }
      }
    } catch (error) {
      accountSummary.push(`serviceLookupError=${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  if (context.invoiceId) {
    try {
      const invoiceResponse = await gateway.invoice(token, context.invoiceId);
      const invoice = invoiceResponse.data.invoice;
      accountSummary.push(`invoice=${invoice.number ?? invoice.id} status=${invoice.status} remaining=${invoice.formattedRemaining}`);
    } catch (error) {
      accountSummary.push(`invoiceLookupError=${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  return accountSummary;
}

app.get('/api/v1/health', async () => gateway.health());

app.get('/', async () => ({
  message: 'Sloth Cloud API is running.',
  data: {
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    healthUrl: '/api/v1/health',
    assistantCapabilitiesUrl: '/api/v1/assistant/capabilities?locale=zh-CN',
    note: 'This port serves JSON APIs. Open the frontend dev server on the configured frontend port for the client UI.',
  },
}));

app.post('/api/v1/operator/projects/analyze', async (request) => {
  const body = z.object({
    projectName: z.string().optional(),
    repoUrl: z.string().optional(),
    sourceRef: z.string().optional(),
    notes: z.string().optional(),
    planningMode: z.enum(['on', 'off']).optional(),
    autoStartBuild: z.boolean().optional(),
    existingCapsuleId: z.string().optional().nullable(),
    userIntent: z.string().optional(),
    sessionId: z.string().optional(),
    taskMode: z.enum(['continue', 'new_turn']).optional(),
  }).parse(request.body ?? {});

  return {
    message: 'Project workspace analyzed through the visible agent workflow.',
    data: await operatorEngine.analyzeProject(body),
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/plans', async (request) => {
  const body = z.object({
    entryKind: z.enum(['upload-project', 'generate-from-idea', 'scan-server']),
    title: z.string().optional(),
    brief: z.string().min(1),
    planningMode: z.enum(['on', 'off']).optional(),
    existingCapsuleId: z.string().optional().nullable(),
    userIntent: z.string().optional(),
    sessionId: z.string().optional(),
    taskMode: z.enum(['continue', 'new_turn']).optional(),
  }).parse(request.body ?? {});

  return {
    message: 'Execution plan created.',
    data: operatorEngine.createPlan(body),
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/projects/generate', async (request) => {
  const body = z.object({
    projectName: z.string().optional(),
    idea: z.string().min(1),
    audience: z.string().optional(),
    businessGoal: z.string().optional(),
  }).parse(request.body ?? {});

  return {
    message: 'Project concept generated.',
    data: await operatorEngine.generateProject(body),
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/projects/generate-task', async (request) => {
  const body = z.object({
    projectName: z.string().optional(),
    idea: z.string().min(1),
    audience: z.string().optional(),
    businessGoal: z.string().optional(),
    strictModelGeneration: z.boolean().optional(),
  }).parse(request.body ?? {});

  return {
    message: 'Project generation task started.',
    data: operatorEngine.startGenerateProjectTask(body),
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/tasks/:taskId', async (request, reply) => {
  const params = z.object({
    taskId: z.string().min(1),
  }).parse(request.params ?? {});
  const task = operatorEngine.getGenerationTask(params.taskId);

  if (!task) {
    reply.code(404);
    return {
      message: 'Operator generation task was not found.',
      error: 'generation_task_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Operator generation task loaded.',
    data: task,
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/jobs/:jobId', async (request, reply) => {
  const params = z.object({
    jobId: z.string().min(1),
  }).parse(request.params ?? {});
  const job = operatorEngine.getJob(params.jobId);

  if (!job) {
    reply.code(404);
    return {
      message: 'Operator job was not found.',
      error: 'operator_job_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Operator job loaded.',
    data: job,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/deployments/preview', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.body ?? {});
  const payload = operatorEngine.deployPreview(body.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Preview job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/deployments/publish', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    confirmationToken: z.string().optional(),
  }).parse(request.body ?? {});
  const payload = operatorEngine.publishRelease(body.capsuleId, body.confirmationToken);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: payload.requiredConfirmation
      ? 'Publish confirmation required.'
      : 'Production publish job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/domains/bind', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    hostname: z.string().min(1),
    zoneId: z.string().optional(),
    zoneName: z.string().optional(),
    tunnelId: z.string().optional(),
    originService: z.string().optional(),
    proxied: z.boolean().optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  await gateway.me(token);

  const capsule = operatorEngine.getCapsule(body.capsuleId);
  if (!capsule) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  if (!cloudflare) {
    throw new GatewayError('Cloudflare integration is not configured.', 503, {
      code: 'operator_cloudflare_not_configured',
      detail: 'Set OPERATOR_CLOUDFLARE_API_TOKEN before binding domains.',
    });
  }

  const hostname = body.hostname.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!hostname || hostname.includes(' ')) {
    throw new GatewayError('Domain hostname is invalid.', 422, {
      code: 'operator_domain_invalid',
      hostname: body.hostname,
    });
  }

  const tunnelId = getStringValue(body.tunnelId) || getStringValue(env.OPERATOR_CLOUDFLARE_DEFAULT_TUNNEL_ID) || null;
  const zone = await resolveOperatorZoneId(hostname, {
    zoneId: body.zoneId,
    zoneName: body.zoneName,
  }).catch((error) => {
    throw toCloudflareGatewayError(error);
  });
  const fallbackTarget = hostFromUrl(capsule.previewUrl)
    ?? hostFromUrl(capsule.productionUrl)
    ?? null;
  const dnsTarget = tunnelId ? `${tunnelId}.cfargotunnel.com` : fallbackTarget;
  if (!dnsTarget) {
    throw new GatewayError('A DNS target could not be resolved for this capsule.', 422, {
      code: 'operator_domain_target_missing',
      capsuleId: body.capsuleId,
    });
  }

  const dnsRecord = await cloudflare.upsertDnsRecord({
    zoneId: zone.id,
    name: hostname,
    type: 'CNAME',
    content: dnsTarget,
    proxied: body.proxied ?? true,
    ttl: 1,
  }).catch((error) => {
    throw toCloudflareGatewayError(error);
  });

  let tunnelResult: Awaited<ReturnType<NonNullable<typeof cloudflare>['ensureTunnelHostname']>> | null = null;
  if (tunnelId) {
    const originService = getStringValue(body.originService)
      || getStringValue(env.OPERATOR_CLOUDFLARE_TUNNEL_SERVICE)
      || 'http://127.0.0.1:3000';
    tunnelResult = await cloudflare.ensureTunnelHostname({
      tunnelId,
      hostname,
      service: originService,
    }).catch((error) => {
      throw toCloudflareGatewayError(error);
    });
  }

  const payload = operatorEngine.bindDomain({
    capsuleId: body.capsuleId,
    hostname,
    provider: tunnelId ? 'Cloudflare DNS + Tunnel' : 'Cloudflare DNS',
    zone: zone.name,
    recordType: dnsRecord.type,
    recordValue: dnsRecord.content,
    tlsStatus: dnsRecord.proxied ? 'active (Cloudflare edge)' : 'pending origin TLS',
    notes: tunnelResult
      ? `Tunnel route active (version ${tunnelResult.version ?? '-'}, rules ${tunnelResult.ingressRules}).`
      : 'DNS record active. Cloudflare edge certificate should issue automatically.',
  });

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Domain routing is active and TLS has been attached.',
    data: payload,
    meta: {
      ...operatorMeta(),
      cloudflare: {
        zoneId: zone.id,
        zoneName: zone.name,
        dnsRecordId: dnsRecord.id,
        tunnelId: tunnelId ?? null,
      },
    },
  };
});

app.post('/api/v1/operator/monitoring/enable', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    monitorUrl: z.string().url().optional(),
    zoneId: z.string().optional(),
    zoneName: z.string().optional(),
    intervalSeconds: z.coerce.number().int().min(30).max(1800).optional(),
    timeoutSeconds: z.coerce.number().int().min(2).max(30).optional(),
    emailRecipients: z.array(z.string().email()).optional(),
    feishuWebhookUrl: z.string().url().optional(),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  await gateway.me(token);

  const capsule = operatorEngine.getCapsule(body.capsuleId);
  if (!capsule) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  const monitorUrl = getStringValue(body.monitorUrl)
    || capsule.productionUrl
    || capsule.previewUrl
    || '';
  if (!monitorUrl) {
    throw new GatewayError('Monitoring target URL is required.', 422, {
      code: 'operator_monitor_url_required',
    });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(monitorUrl);
  } catch {
    throw new GatewayError('Monitoring target URL is invalid.', 422, {
      code: 'operator_monitor_url_invalid',
      monitorUrl,
    });
  }

  const feishuWebhookUrl = getStringValue(body.feishuWebhookUrl) || null;
  const telegramBotToken = getStringValue(body.telegramBotToken) || null;
  const telegramChatId = getStringValue(body.telegramChatId) || null;
  const emailRecipients = (body.emailRecipients ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const wantsCloudflareEmail = emailRecipients.length > 0;

  const localResult = async (fallbackReason?: string | null) => {
    const fallback = await enableOperatorLocalMonitoring({
      capsuleId: body.capsuleId,
      monitorUrl,
      intervalSeconds: body.intervalSeconds,
      timeoutSeconds: body.timeoutSeconds,
      emailRecipients,
      feishuWebhookUrl,
      telegramBotToken,
      telegramChatId,
      fallbackReason,
    });
    if (!fallback.payload) {
      reply.code(404);
      return {
        message: 'Capsule not found.',
        error: 'capsule_not_found',
      };
    }

    return {
      message: wantsCloudflareEmail
        ? 'Local monitoring is active. Email delivery still requires Cloudflare Notifications or another mail provider.'
        : 'Local monitoring and alert channels are now live.',
      data: fallback.payload,
      meta: {
        ...operatorMeta(),
        monitoring: fallback.meta,
      },
    };
  };

  if (!wantsCloudflareEmail) {
    return localResult();
  }

  try {
    if (!cloudflare) {
      throw new GatewayError('Cloudflare integration is not configured.', 503, {
        code: 'operator_cloudflare_not_configured',
        detail: 'Set OPERATOR_CLOUDFLARE_API_TOKEN before enabling monitoring.',
      });
    }

    const zone = await resolveOperatorZoneId(parsedTarget.hostname, {
      zoneId: body.zoneId,
      zoneName: body.zoneName,
    }).catch((error) => {
      throw toCloudflareGatewayError(error);
    });

    const healthCheck = await cloudflare.createHealthCheck({
      zoneId: zone.id,
      name: `capsule-${capsule.capsule.slug}`,
      targetUrl: monitorUrl,
      interval: body.intervalSeconds,
      timeout: body.timeoutSeconds,
    }).catch((error) => {
      throw toCloudflareGatewayError(error);
    });

    const relayToken = randomBytes(10).toString('hex');
    const needsRelay = Boolean(feishuWebhookUrl || (telegramBotToken && telegramChatId));
    let webhookId: string | null = null;
    if (needsRelay) {
      if (!operatorMonitoringWebhookBaseUrl) {
        throw new GatewayError('Monitoring webhook base URL is not configured.', 503, {
          code: 'operator_monitoring_webhook_base_missing',
          detail: 'Set OPERATOR_MONITORING_WEBHOOK_BASE_URL or OPERATOR_WEB_BASE_URL.',
        });
      }

      operatorMonitoringRelays.set(relayToken, {
        capsuleId: capsule.capsule.id,
        monitorUrl,
        channels: {
          feishuWebhookUrl,
          telegramBotToken,
          telegramChatId,
        },
        updatedAt: new Date().toISOString(),
      });

      const webhookDestination = await cloudflare.createAlertWebhookDestination({
        name: `capsule-${capsule.capsule.slug}-relay`,
        url: `${operatorMonitoringWebhookBaseUrl.replace(/\/+$/, '')}/api/v1/operator/alerts/relay/${relayToken}`,
        secret: getStringValue(env.OPERATOR_MONITORING_WEBHOOK_SECRET) || undefined,
      }).catch((error) => {
        operatorMonitoringRelays.delete(relayToken);
        throw toCloudflareGatewayError(error);
      });
      webhookId = webhookDestination.id;
    }

    const policy = await cloudflare.createHealthAlertPolicy({
      name: `capsule-${capsule.capsule.slug}-health`,
      healthCheckId: healthCheck.id,
      emailRecipients,
      webhookIds: webhookId ? [webhookId] : [],
    }).catch((error) => {
      if (webhookId) {
        operatorMonitoringRelays.delete(relayToken);
      }
      throw toCloudflareGatewayError(error);
    });

    const testResult = await dispatchOperatorAlertChannels({
      feishuWebhookUrl,
      telegramBotToken,
      telegramChatId,
      text: `Sloth Cloud monitor enabled for ${monitorUrl} (capsule ${capsule.capsule.id}).`,
    });
    const channels: string[] = [
      ...(emailRecipients.length > 0 ? [`Email(${emailRecipients.length})`] : []),
      ...(feishuWebhookUrl ? ['Feishu'] : []),
      ...(telegramBotToken && telegramChatId ? ['Telegram'] : []),
    ];
    const notes = [
      `Cloudflare health check ${healthCheck.id} and policy ${policy.id} are active.`,
      testResult.sent.length > 0 ? `Channel test sent: ${testResult.sent.join(', ')}.` : '',
      testResult.failed.length > 0 ? `Channel test failures: ${testResult.failed.join('; ')}` : '',
    ].filter(Boolean).join(' ');
    const payload = operatorEngine.enableMonitoring({
      capsuleId: body.capsuleId,
      monitorUrl,
      provider: 'Cloudflare Health Checks + Notification Policy',
      healthcheckId: healthCheck.id,
      channels,
      notes,
    });

    if (!payload) {
      reply.code(404);
      return {
        message: 'Capsule not found.',
        error: 'capsule_not_found',
      };
    }

    return {
      message: 'Monitoring and alert channels are now live.',
      data: payload,
      meta: {
        ...operatorMeta(),
        monitoring: {
          zoneId: zone.id,
          zoneName: zone.name,
          healthCheckId: healthCheck.id,
          policyId: policy.id,
          webhookRelayEnabled: Boolean(webhookId),
          channelTest: testResult,
        },
      },
    };
  } catch (error) {
    const gatewayError = toCloudflareGatewayError(error);
    if (shouldFallbackToLocalMonitoring(gatewayError)) {
      app.log.warn({
        capsuleId: body.capsuleId,
        monitorUrl,
        reason: gatewayError instanceof Error ? gatewayError.message : 'unknown',
      }, 'Falling back to local monitoring because Cloudflare health checks are unavailable.');
      return localResult(gatewayError instanceof Error ? gatewayError.message : 'Cloudflare monitoring unavailable');
    }
    throw gatewayError;
  }
});

app.post('/api/v1/operator/services/diagnose', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.body ?? {});
  const payload = operatorEngine.diagnoseService(body.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Diagnostic job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/services/repair', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.body ?? {});
  const payload = operatorEngine.repairService(body.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Repair job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/services/rollback', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    confirmationToken: z.string().optional(),
  }).parse(request.body ?? {});
  const payload = operatorEngine.rollbackRelease(body.capsuleId, body.confirmationToken);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: payload.requiredConfirmation ? 'Rollback confirmation required.' : 'Rollback completed.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/servers/scan', async (request) => {
  const body = z.object({
    label: z.string().optional(),
    host: z.string().min(1),
    username: z.string().min(1),
    port: z.number().int().positive().optional(),
    authMode: z.enum(['password', 'ssh-key', 'agent']),
    password: z.string().optional(),
    sshKey: z.string().optional(),
  }).parse(request.body ?? {});

  return {
    message: 'Server audit workspace created and read-only scan queued.',
    data: operatorEngine.scanServer(body),
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/servers/takeover', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    confirmationToken: z.string().optional(),
  }).parse(request.body ?? {});
  const payload = operatorEngine.takeoverServer(body.capsuleId, body.confirmationToken);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: payload.requiredConfirmation ? 'Takeover confirmation required.' : 'Takeover job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/servers/migrate', async (request, reply) => {
  const body = z.object({
    capsuleId: z.string().min(1),
    confirmationToken: z.string().optional(),
  }).parse(request.body ?? {});
  const payload = operatorEngine.migrateServer(body.capsuleId, body.confirmationToken);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: payload.requiredConfirmation ? 'Migration confirmation required.' : 'Migration job queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/capsules', async () => ({
  message: 'Capsules ready.',
  data: operatorEngine.listCapsules(),
  meta: operatorMeta(),
}));

app.get('/api/v1/operator/workspaces', async () => ({
  message: 'Workspaces ready.',
  data: operatorEngine.listWorkspaces(),
  meta: operatorMeta(),
}));

app.patch('/api/v1/operator/workspaces/:capsuleId', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  }).parse(request.body ?? {});

  const payload = operatorEngine.updateWorkspace({
    capsuleId: params.capsuleId,
    name: body.name,
    archived: body.archived,
  });

  if (!payload) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Workspace updated.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.delete('/api/v1/operator/workspaces/legacy-templates', async () => {
  const deletedCount = operatorEngine.deleteLegacyTemplateCapsules();

  return {
    message: deletedCount > 0 ? 'Legacy template workspaces deleted.' : 'No legacy template workspaces found.',
    data: {
      deleted: true,
      deletedCount,
    },
    meta: operatorMeta(),
  };
});

app.delete('/api/v1/operator/workspaces/history', async () => {
  clearOperatorLocalMonitoringState();
  const cleared = operatorEngine.clearHistory();

  return {
    message: 'Operator workspace history cleared.',
    data: {
      cleared: true,
      ...cleared,
    },
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/system/status', async () => ({
  message: 'Operator integration status ready.',
  data: operatorIntegrationStatus(),
  meta: operatorMeta(),
}));

app.get('/api/v1/operator/capsules/:capsuleId', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const payload = operatorEngine.getCapsule(params.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Capsule ready.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/workspaces/:capsuleId', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const payload = operatorEngine.getCapsule(params.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
    };
  }

  return {
    message: 'Workspace ready.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/workspaces/:capsuleId/continue', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    taskId: z.string().min(1).optional(),
    pendingConfirmationId: z.string().min(1).optional(),
    operation: z.enum(['continue', 'deploy_playable']).optional(),
    userIntent: z.string().max(4000).optional(),
    repair: z.object({
      mode: z.enum(['recommended', 're_detect', 'manual']).optional(),
      startCommand: z.string().max(4000).optional(),
      port: z.number().int().min(1).max(65535).nullable().optional(),
      healthcheckPath: z.string().max(512).optional(),
      dockerServiceName: z.string().max(256).optional(),
    }).optional(),
  }).parse(request.body ?? {});

  const payload = operatorEngine.continueActiveTask({
    capsuleId: params.capsuleId,
    taskId: body.taskId ?? null,
    pendingConfirmationId: body.pendingConfirmationId ?? null,
    operation: body.operation ?? 'continue',
    userIntent: body.userIntent ?? null,
    repair: body.repair
      ? {
        mode: body.repair.mode ?? null,
        startCommand: body.repair.startCommand ?? null,
        port: body.repair.port ?? null,
        healthcheckPath: body.repair.healthcheckPath ?? null,
        dockerServiceName: body.repair.dockerServiceName ?? null,
      }
      : null,
  });

  if (!payload) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Workspace continuation queued.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/workspaces/:capsuleId/confirm-active-plan', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    taskId: z.string().min(1).optional(),
    pendingConfirmationId: z.string().min(1).optional(),
    userIntent: z.string().max(4000).optional(),
  }).parse(request.body ?? {});

  const payload = operatorEngine.confirmActivePlan({
    capsuleId: params.capsuleId,
    taskId: body.taskId ?? null,
    pendingConfirmationId: body.pendingConfirmationId ?? null,
    userIntent: body.userIntent ?? null,
  });

  if (!payload) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Active plan confirmed.',
    data: payload,
    meta: operatorMeta(),
  };
});

app.post('/api/v1/operator/workspaces/:capsuleId/jobs', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    kind: z.enum([
      'plan_repo',
      'build_repo_preview',
      'plan_idea',
      'build_idea_preview',
      'scan_server',
      'deploy_preview',
      'publish_release',
      'diagnose_service',
      'repair_service',
      'takeover_server',
      'migrate_server',
    ]),
  }).parse(request.body ?? {});
  const job = operatorEngine.createWorkspaceJob({
    capsuleId: params.capsuleId,
    kind: body.kind,
  });

  if (!job) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
      meta: operatorMeta(),
    };
  }

  return {
    message: 'Workspace job created.',
    data: job,
    meta: operatorMeta(),
  };
});

app.delete('/api/v1/operator/capsules/:capsuleId', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const deleted = operatorEngine.deleteCapsule(params.capsuleId);

  if (!deleted) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  return {
    message: 'Capsule deleted.',
    data: {
      capsuleId: params.capsuleId,
      deleted: true,
    },
    meta: operatorMeta(),
  };
});

app.delete('/api/v1/operator/workspaces/:capsuleId', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const deleted = operatorEngine.deleteCapsule(params.capsuleId);

  if (!deleted) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
    };
  }

  return {
    message: 'Workspace deleted.',
    data: {
      capsuleId: params.capsuleId,
      deleted: true,
    },
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/workspaces/:capsuleId/archive', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const archive = operatorEngine.getWorkspaceArchive(params.capsuleId);

  if (!archive) {
    reply.code(404);
    return {
      message: 'Workspace archive not found.',
      error: 'workspace_archive_not_found',
    };
  }

  reply.header('Content-Disposition', `attachment; filename="${archive.downloadName}"`);
  return reply.type('application/gzip').send(createReadStream(archive.absolutePath));
});

app.post('/api/v1/operator/capsules/:capsuleId/cart', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    offerKind: z.enum(['ai-managed-launch', 'vps-self-hosted', 'server-migration']).optional(),
    productSlug: z.string().trim().min(1).optional(),
    planId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().min(1).max(10).optional(),
    configOptions: z.record(z.unknown()).optional(),
    checkoutConfig: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const payload = operatorEngine.getCapsule(params.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Capsule not found.',
      error: 'capsule_not_found',
    };
  }

  const currentCart = await gateway.cart(token);
  if (cartContainsOperatorCapsule(currentCart.data, payload.capsule.id)) {
    return {
      message: 'Capsule is already in cart.',
      data: {
        capsule: payload,
        cart: currentCart.data,
        product: null,
        plan: null,
        selection: {
          intent: operatorCommerceIntent(payload, body.offerKind),
          reason: 'capsule_already_in_cart',
        },
        redirect: {
          type: 'internal',
          path: '/checkout',
        },
        checkoutConfig: {},
        configOptions: {},
      },
      meta: operatorMeta(),
    };
  }

  const selection = await resolveOperatorCommerceSelection(payload, body.offerKind, body.productSlug, body.planId);
  const configOptions = buildOperatorConfigOptions(selection.product, body.configOptions ?? {});
  const checkoutConfig = buildOperatorCheckoutConfig(payload, selection.product, selection.intent, body.checkoutConfig ?? {});

  try {
    const addResponse = await gateway.addCartItem(token, {
      productSlug: selection.product.slug,
      planId: selection.plan.id,
      quantity: body.quantity ?? 1,
      configOptions,
      checkoutConfig,
    });

    return {
      message: 'Capsule added to cart.',
      data: {
        capsule: payload,
        cart: addResponse.data,
        product: summarizeOperatorProduct(selection.product),
        plan: summarizeOperatorPlan(selection.plan),
        selection: {
          intent: selection.intent,
          reason: selection.reason,
        },
        redirect: {
          type: 'internal',
          path: '/checkout',
        },
        checkoutConfig,
        configOptions,
      },
      meta: operatorMeta(),
    };
  } catch (error) {
    if (isDuplicateCartError(error)) {
      const latestCart = await gateway.cart(token);
      return {
        message: 'Capsule product is already in cart.',
        data: {
          capsule: payload,
          cart: latestCart.data,
          product: summarizeOperatorProduct(selection.product),
          plan: summarizeOperatorPlan(selection.plan),
          selection: {
            intent: selection.intent,
            reason: 'product_already_in_cart',
          },
          redirect: {
            type: 'internal',
            path: '/checkout',
          },
          checkoutConfig,
          configOptions,
        },
        meta: operatorMeta(),
      };
    }

    throw error;
  }
});

app.post('/api/v1/operator/workspaces/:capsuleId/cart', async (request, reply) => {
  const params = z.object({
    capsuleId: z.string().min(1),
  }).parse(request.params ?? {});
  const body = z.object({
    offerKind: z.enum(['ai-managed-launch', 'vps-self-hosted', 'server-migration']).optional(),
    productSlug: z.string().trim().min(1).optional(),
    planId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().min(1).max(10).optional(),
    configOptions: z.record(z.unknown()).optional(),
    checkoutConfig: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const payload = operatorEngine.getCapsule(params.capsuleId);

  if (!payload) {
    reply.code(404);
    return {
      message: 'Workspace not found.',
      error: 'workspace_not_found',
    };
  }

  const currentCart = await gateway.cart(token);
  if (cartContainsOperatorCapsule(currentCart.data, payload.capsule.id)) {
    return {
      message: 'Workspace is already in cart.',
      data: {
        capsule: payload,
        cart: currentCart.data,
        product: null,
        plan: null,
        selection: {
          intent: operatorCommerceIntent(payload, body.offerKind),
          reason: 'workspace_already_in_cart',
        },
        redirect: {
          type: 'internal',
          path: '/checkout',
        },
        checkoutConfig: {},
        configOptions: {},
      },
      meta: operatorMeta(),
    };
  }

  const selection = await resolveOperatorCommerceSelection(payload, body.offerKind, body.productSlug, body.planId);
  const configOptions = buildOperatorConfigOptions(selection.product, body.configOptions ?? {});
  const checkoutConfig = buildOperatorCheckoutConfig(payload, selection.product, selection.intent, body.checkoutConfig ?? {});

  try {
    const addResponse = await gateway.addCartItem(token, {
      productSlug: selection.product.slug,
      planId: selection.plan.id,
      quantity: body.quantity ?? 1,
      configOptions,
      checkoutConfig,
    });

    return {
      message: 'Workspace added to cart.',
      data: {
        capsule: payload,
        cart: addResponse.data,
        product: summarizeOperatorProduct(selection.product),
        plan: summarizeOperatorPlan(selection.plan),
        selection: {
          intent: selection.intent,
          reason: selection.reason,
        },
        redirect: {
          type: 'internal',
          path: '/checkout',
        },
        checkoutConfig,
        configOptions,
      },
      meta: operatorMeta(),
    };
  } catch (error) {
    if (isDuplicateCartError(error)) {
      const latestCart = await gateway.cart(token);
      return {
        message: 'Workspace product is already in cart.',
        data: {
          capsule: payload,
          cart: latestCart.data,
          product: summarizeOperatorProduct(selection.product),
          plan: summarizeOperatorPlan(selection.plan),
          selection: {
            intent: selection.intent,
            reason: 'product_already_in_cart',
          },
          redirect: {
            type: 'internal',
            path: '/checkout',
          },
          checkoutConfig,
          configOptions,
        },
        meta: operatorMeta(),
      };
    }

    throw error;
  }
});

app.get('/api/v1/operator/generated-projects/:capsuleRef', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
  }).parse(request.params ?? {});
  const generatedProject = operatorEngine.getGeneratedProject(params.capsuleRef);

  if (!generatedProject) {
    reply.code(404);
    return {
      message: 'Generated project not found.',
      error: 'generated_project_not_found',
    };
  }

  return {
    message: 'Generated project ready.',
    data: generatedProject,
    meta: operatorMeta(),
  };
});

app.get('/api/v1/operator/generated-projects/:capsuleRef/archive', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
  }).parse(request.params ?? {});
  const archive = operatorEngine.getGeneratedProjectArchive(params.capsuleRef);

  if (!archive) {
    reply.code(404);
    return {
      message: 'Generated project archive not found.',
      error: 'generated_project_archive_not_found',
    };
  }

  reply.header('Content-Disposition', `attachment; filename="${archive.downloadName}"`);
  return reply.type('application/gzip').send(createReadStream(archive.absolutePath));
});

app.get('/api/v1/operator/previews/:capsuleRef', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
  }).parse(request.params ?? {});
  const proxied = await proxyOperatorRuntimeResponse({
    mode: 'preview',
    capsuleRef: params.capsuleRef,
    request,
    reply,
  });
  if (proxied) {
    return proxied;
  }
  const html = operatorEngine.getPreviewHtml(params.capsuleRef);

  if (!html) {
    reply.code(404);
    return {
      message: 'Preview not found.',
      error: 'preview_not_found',
    };
  }

  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/api/v1/operator/previews/:capsuleRef/assets/*', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
    '*': z.string().min(1),
  }).parse(request.params ?? {});
  const proxied = await proxyOperatorRuntimeResponse({
    mode: 'preview',
    capsuleRef: params.capsuleRef,
    pathSuffix: `assets/${params['*']}`,
    request,
    reply,
  });
  if (proxied) {
    return proxied;
  }
  const asset = operatorEngine.getPreviewAsset(params.capsuleRef, params['*']);

  if (!asset) {
    reply.code(404);
    return {
      message: 'Preview asset not found.',
      error: 'preview_asset_not_found',
    };
  }

  return reply.type(asset.contentType).send(createReadStream(asset.absolutePath));
});

app.get('/api/v1/operator/previews/:capsuleRef/*', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
    '*': z.string().min(1),
  }).parse(request.params ?? {});
  const proxied = await proxyOperatorRuntimeResponse({
    mode: 'preview',
    capsuleRef: params.capsuleRef,
    pathSuffix: params['*'],
    request,
    reply,
  });
  if (proxied) {
    return proxied;
  }
  const asset = operatorEngine.getPreviewAsset(params.capsuleRef, params['*']);

  if (!asset) {
    reply.code(404);
    return {
      message: 'Preview file not found.',
      error: 'preview_file_not_found',
    };
  }

  return reply.type(asset.contentType).send(createReadStream(asset.absolutePath));
});

app.get('/api/v1/operator/releases/:capsuleRef', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
  }).parse(request.params ?? {});
  const proxied = await proxyOperatorRuntimeResponse({
    mode: 'release',
    capsuleRef: params.capsuleRef,
    request,
    reply,
  });
  if (proxied) {
    return proxied;
  }

  const html = operatorEngine.getPreviewHtml(params.capsuleRef);
  if (!html) {
    reply.code(404);
    return {
      message: 'Release not found.',
      error: 'release_not_found',
    };
  }

  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/api/v1/operator/releases/:capsuleRef/*', async (request, reply) => {
  const params = z.object({
    capsuleRef: z.string().min(1),
    '*': z.string().min(1),
  }).parse(request.params ?? {});
  const proxied = await proxyOperatorRuntimeResponse({
    mode: 'release',
    capsuleRef: params.capsuleRef,
    pathSuffix: params['*'],
    request,
    reply,
  });
  if (proxied) {
    return proxied;
  }

  const asset = operatorEngine.getPreviewAsset(params.capsuleRef, params['*']);
  if (!asset) {
    reply.code(404);
    return {
      message: 'Release asset not found.',
      error: 'release_asset_not_found',
    };
  }

  return reply.type(asset.contentType).send(createReadStream(asset.absolutePath));
});

app.post('/api/v1/operator/alerts/relay/:relayToken', async (request, reply) => {
  const params = z.object({
    relayToken: z.string().min(1),
  }).parse(request.params ?? {});
  const relay = operatorMonitoringRelays.get(params.relayToken);
  if (!relay) {
    reply.code(404);
    return {
      message: 'Monitoring relay not found.',
      error: 'operator_monitor_relay_not_found',
    };
  }

  const expectedSecret = getStringValue(env.OPERATOR_MONITORING_WEBHOOK_SECRET);
  const providedSecret = getStringValue(request.headers['cf-webhook-auth']);
  if (expectedSecret && providedSecret !== expectedSecret) {
    reply.code(401);
    return {
      message: 'Invalid relay signature.',
      error: 'operator_monitor_relay_signature_invalid',
    };
  }

  const payload = asRecordValue(request.body ?? {});
  const alertType = getStringValue(payload.alert_type) || 'health_check_status_notification';
  const status = getStringValue(payload.new_health) || getStringValue(payload.status) || 'state_change';
  const eventName = getStringValue(payload.name) || getStringValue(payload.policy_name) || relay.capsuleId;
  const createdAt = new Date().toISOString();
  const text = [
    `Sloth Cloud alert`,
    `Capsule: ${relay.capsuleId}`,
    `Monitor: ${relay.monitorUrl}`,
    `Type: ${alertType}`,
    `Status: ${status}`,
    `Event: ${eventName}`,
    `Time: ${createdAt}`,
  ].join('\n');

  const dispatched = await dispatchOperatorAlertChannels({
    feishuWebhookUrl: relay.channels.feishuWebhookUrl,
    telegramBotToken: relay.channels.telegramBotToken,
    telegramChatId: relay.channels.telegramChatId,
    text,
  });
  relay.updatedAt = createdAt;
  operatorMonitoringRelays.set(params.relayToken, relay);

  return {
    message: 'Alert relay delivered.',
    data: {
      capsuleId: relay.capsuleId,
      monitorUrl: relay.monitorUrl,
      sent: dispatched.sent,
      failed: dispatched.failed,
    },
    meta: operatorMeta(),
  };
});

app.get('/api/v1/assistant/capabilities', async (request, reply) => {
  const query = z.object({
    locale: z.string().optional(),
  }).parse(request.query ?? {});
  const locale = getStringValue(query.locale) || 'zh-CN';
  const identity = await resolveAssistantIdentity(request);
  const quotaContext = await resolveAssistantQuotaContext(request, reply, locale, identity);

  return {
    message: assistantOrchestrator.isEnabled()
      ? 'Assistant capabilities ready.'
      : 'Assistant is disabled.',
    data: await buildAssistantCapabilitiesPayload(locale, quotaContext),
  };
});

app.get('/api/v1/assistant/provider-status', async (request, reply) => {
  const query = z.object({
    locale: z.string().optional(),
    refresh: z.coerce.boolean().optional(),
  }).parse(request.query ?? {});
  const locale = getStringValue(query.locale) || 'zh-CN';
  const status = await readAssistantProviderStatus({
    forceRefresh: query.refresh === true,
  });

  return {
    message: status.canRun
      ? 'Assistant provider is ready.'
      : 'Assistant provider is limited.',
    data: {
      ...status,
      reason: buildAssistantProviderStatusReason(locale, status),
    },
  };
});

app.post('/api/v1/assistant/session', async (request, reply) => {
  ensureAssistantEnabled();
  const body = z.object({
    sessionId: z.string().optional(),
    locale: z.string().optional(),
    context: assistantContextSchema,
  }).parse(request.body ?? {});

  const identity = await resolveAssistantIdentity(request);
  const locale = body.locale ?? 'zh-CN';
  const quotaContext = await resolveAssistantQuotaContext(request, reply, locale, identity);
  const session = assistantOrchestrator.openSession({
    userKey: identity.userKey,
    sessionId: body.sessionId ?? null,
    context: assistantContextFromPayload({
      ...body.context,
      locale: locale ?? body.context?.locale,
    }),
  });
  const capabilities = await buildAssistantCapabilitiesPayload(locale, quotaContext);

  return {
    message: 'Assistant session ready.',
    data: {
      session,
      authenticated: identity.authenticated,
      user: identity.user,
      capabilities,
      quota: quotaContext.snapshot,
      upgradeCta: quotaContext.upgradeCta,
    },
  };
});

app.post('/api/v1/assistant/messages', async (request, reply) => {
  ensureAssistantEnabled();
  const body = z.object({
    sessionId: z.string().min(1),
    message: z.string().max(4000),
    selectedModelId: z.string().optional(),
    autoRoute: z.boolean().optional(),
    locale: z.string().optional(),
    mode: z.enum(['ask', 'run']).optional(),
    planningMode: z.enum(['on', 'off']).optional(),
    taskMode: z.enum(['continue', 'new_turn']).optional(),
    context: assistantContextSchema,
    attachments: z.unknown().optional(),
    requestedAction: z.unknown().optional(),
  }).parse(request.body ?? {});

  const locale = getStringValue(body.locale) || 'zh-CN';
  const mode = body.mode === 'ask' ? 'ask' : 'run';
  const askMode = mode === 'ask';
  const planningMode = body.planningMode === 'on' ? 'on' : 'off';
  const taskMode = body.taskMode === 'new_turn' ? 'new_turn' : 'continue';
  const identity = await resolveAssistantIdentity(request);
  const requestedAction = parseRequestedAssistantAction(body.requestedAction);
  const attachments = normalizeAssistantInputAttachments(body.attachments);
  const normalizedMessage = body.message.trim();
  if (!normalizedMessage && !requestedAction && attachments.length === 0) {
    throw new GatewayError('Assistant message is required.', 422, {
      code: 'ASSISTANT_MESSAGE_REQUIRED',
      detail: locale.toLowerCase().startsWith('zh')
        ? '请输入问题，或上传文件后再发送。'
        : 'Please enter a message, or upload files before sending.',
    });
  }

  const attachmentDisplayNote = buildAssistantAttachmentDisplayNote(locale, attachments);
  const attachmentPromptSupplement = buildAssistantAttachmentPromptSupplement(locale, attachments);
  const messageForStorage = [normalizedMessage, attachmentDisplayNote].filter((entry): entry is string => Boolean(entry)).join('\n\n');
  const messageForAssistant = [normalizedMessage, attachmentPromptSupplement].filter((entry): entry is string => Boolean(entry)).join('\n\n');
  let session: ReturnType<typeof assistantOrchestrator.openSession>;
  try {
    session = assistantOrchestrator.updateContext(
      body.sessionId,
      identity.userKey,
      assistantContextFromPayload({
        ...body.context,
        locale,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSISTANT_SESSION_NOT_FOUND') {
      throw new GatewayError('Assistant session was not found.', 404, {
        code: 'ASSISTANT_SESSION_NOT_FOUND',
      });
    }
    if (error instanceof Error && error.message === 'ASSISTANT_SESSION_FORBIDDEN') {
      throw new GatewayError('Assistant session does not belong to current user.', 403, {
        code: 'ASSISTANT_SESSION_FORBIDDEN',
      });
    }
    throw error;
  }

  const quotaContext = await resolveAssistantQuotaContext(request, reply, locale, identity);
  const capabilities = await buildAssistantCapabilitiesPayload(locale, quotaContext);
  const providerStatus = await readAssistantProviderStatus();
  const requestedModel = resolveAssistantChargeModel(capabilities, body.selectedModelId ?? null, {
    autoRoute: body.autoRoute ?? false,
    authenticated: identity.authenticated,
    message: body.message,
    snapshot: quotaContext.snapshot,
  });
  await assistantQuota.assertCanUse({
    actorKey: quotaContext.actorKey,
    locale,
    authenticated: identity.authenticated,
    snapshot: quotaContext.snapshot,
    model: requestedModel,
    upgradeCta: quotaContext.upgradeCta,
  });

  const userMessage = assistantOrchestrator.recordUserMessage(session.sessionId, identity.userKey, messageForStorage || '.');
  const sessionMessages = assistantOrchestrator.listMessages(session.sessionId, identity.userKey);
  const runAvailability = mode === 'run'
    ? resolveAssistantRunAvailability({
      locale,
      canRun: providerStatus.canRun,
      reason: buildAssistantProviderStatusReason(locale, providerStatus),
      allowDevelopmentMock: assistantAllowDevelopmentMock,
    })
    : null;
  if (runAvailability && !runAvailability.runAllowed) {
    if (runAvailability.source === 'system') {
      throw new GatewayError('Assistant live provider is required for Run mode.', 503, {
        code: runAvailability.code,
        detail: runAvailability.detail,
        quota: quotaContext.snapshot,
        upgradeCta: quotaContext.upgradeCta,
      });
    }

    const assistantReply = assistantOrchestrator.recordAssistantMessage(
      session.sessionId,
      identity.userKey,
      runAvailability.replyText,
    );
    return {
      message: 'Assistant Run mode is limited while provider fallback is active.',
      data: {
        session: assistantOrchestrator.openSession({
          userKey: identity.userKey,
          sessionId: session.sessionId,
        }),
        authenticated: identity.authenticated,
        reply: assistantReply,
        runState: runAvailability.runState,
        source: runAvailability.source,
        proposals: [],
        pendingConfirmation: null,
        actionResult: {
          message: runAvailability.replyText,
          code: runAvailability.code,
          detail: runAvailability.detail,
          operationId: null,
          data: null,
        },
        workflow: null,
        workspace: session.context.capsuleId
          ? {
            capsuleId: session.context.capsuleId,
            capsulePath: buildOperatorWorkbenchPath(session.context.capsuleId),
            capsuleUrl: buildAbsoluteCapsuleUrl(request, buildOperatorWorkbenchPath(session.context.capsuleId)),
            workflowStage: null,
          }
          : null,
        quota: quotaContext.snapshot,
        upgradeCta: quotaContext.upgradeCta,
        chargedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        resolvedModelId: 'deterministic-fallback',
        routing: null,
      },
    };
  }
  const routingDecision = classifyAssistantMessageRoute({
    message: normalizedMessage,
    locale,
    askMode,
    hasActiveWorkspace: Boolean(session.context.capsuleId),
    allowIdeaGeneration: !requestedAction,
  });
  const responseRouting = buildAssistantRoutingPayload(routingDecision);
  app.log.info({
    sessionId: session.sessionId,
    userKey: identity.userKey,
    mode,
    selectedModelId: requestedModel.id,
    route: routingDecision.route,
    lane: routingDecision.lane,
    source: routingDecision.source,
    reason: routingDecision.reason,
  }, 'assistant.route-decision');
  const explicitGenerationTaskId = extractAssistantGenerationTaskId(normalizedMessage);
  const workspaceContinuationIntent = routingDecision.route === 'workspace_continue'
    ? {
      operation: routingDecision.operation,
    }
    : null;
  const repoWorkspaceIntent = routingDecision.route === 'repo_import_deploy'
    ? {
      projectName: buildAssistantRepoProjectName(routingDecision.repoUrl, locale),
      repoUrl: routingDecision.repoUrl,
      notes: routingDecision.notes,
      operation: routingDecision.operation,
    }
    : null;
  const generationTaskCheckIntent = !requestedAction
    && !workspaceContinuationIntent
    && !repoWorkspaceIntent
    && (Boolean(explicitGenerationTaskId) || assistantMessageSuggestsGenerationTaskCheck(normalizedMessage));
  const attachmentDeployProposal = !requestedAction && identity.authenticated && identity.token
    ? buildAssistantAttachmentDeployProposal({
      locale,
      serviceId: session.context.serviceId,
      attachments,
    })
    : null;
  const inlineScriptDeployProposal = !requestedAction && identity.authenticated && identity.token
    ? buildAssistantInlineScriptDeployProposal({
      locale,
      serviceId: session.context.serviceId,
      message: normalizedMessage,
    })
    : null;
  const remotePlaybookProposal = !requestedAction && identity.authenticated && identity.token
    ? await buildAssistantRemotePlaybookProposal({
      token: identity.token,
      locale,
      serviceId: session.context.serviceId,
      message: normalizedMessage,
    })
    : null;
  const installServiceAppProposal = !requestedAction && identity.authenticated && identity.token
    ? await buildAssistantInstallServiceAppProposal({
      token: identity.token,
      locale,
      serviceId: session.context.serviceId,
      message: normalizedMessage,
    })
    : null;
  const plannedProposals = workspaceContinuationIntent
    ? []
    : requestedAction
      ? [assistantProposalFromRequestedAction(locale, requestedAction)]
      : [
        ...(attachmentDeployProposal ? [attachmentDeployProposal] : []),
        ...(inlineScriptDeployProposal ? [inlineScriptDeployProposal] : []),
        ...(remotePlaybookProposal ? [remotePlaybookProposal] : []),
        ...(installServiceAppProposal ? [installServiceAppProposal] : []),
        ...assistantOrchestrator.planProposals({
          message: normalizedMessage,
          locale,
          context: session.context,
          authenticated: identity.authenticated,
        }),
      ];
  const effectiveProposals = [...plannedProposals];

  const actionSummary: string[] = [];
  let actionResult: AssistantActionExecutionResult | null = null;
  let pendingConfirmation: ReturnType<typeof assistantOrchestrator.issueConfirmation> | null = null;
  let fallbackAssistantReplyText: string | null = null;
  let forceDeterministicReply = false;
  const composeAttachment = pickAssistantComposeAttachment(attachments);
  const shellScriptAttachment = pickAssistantShellScriptAttachment(attachments);
  const inlineShellScript = extractAssistantShellCodeBlock(normalizedMessage);
  const hasComposeAttachment = Boolean(composeAttachment);
  const hasShellScriptAttachment = Boolean(shellScriptAttachment?.textContent);
  const hasInlineShellScript = Boolean(inlineShellScript);
  const composeAttachmentHash = composeAttachment?.textContent
    ? createHash('sha1').update(composeAttachment.textContent).digest('hex').slice(0, 10)
    : null;
  const composeAttachmentManualCommand = composeAttachment?.textContent && composeAttachmentHash
    ? buildAssistantComposeDeployScript(composeAttachment.textContent, composeAttachmentHash)
    : null;
  const shellScriptAttachmentManualCommand = normalizeAssistantCustomScript(shellScriptAttachment?.textContent);
  const inlineShellScriptManualCommand = normalizeAssistantCustomScript(inlineShellScript);
  const customScriptManualCommand = composeAttachmentManualCommand
    || shellScriptAttachmentManualCommand
    || inlineShellScriptManualCommand
    || null;
  const customScriptLabel = composeAttachment
    ? (locale.toLowerCase().startsWith('zh')
        ? `自定义 Compose 部署（${composeAttachment.name}）`
        : `Custom Compose deploy (${composeAttachment.name})`)
    : shellScriptAttachment
      ? (locale.toLowerCase().startsWith('zh')
          ? `自定义脚本代执行（${shellScriptAttachment.name}）`
          : `Custom script execution (${shellScriptAttachment.name})`)
      : inlineShellScript
        ? (locale.toLowerCase().startsWith('zh')
            ? '自定义脚本代执行（聊天命令）'
            : 'Custom script execution (chat command)')
        : null;
  const directServerExecutionIntent = requestedAction
    ? false
    : (
      !repoWorkspaceIntent
      && !workspaceContinuationIntent
      && (
      assistantMessageSuggestsDirectServerExecution(normalizedMessage)
      || Boolean(attachmentDeployProposal)
      || Boolean(inlineScriptDeployProposal)
      || hasComposeAttachment
      || hasShellScriptAttachment
      || hasInlineShellScript
      )
    );
  const matchedRemotePlaybook = directServerExecutionIntent ? matchRemotePlaybook(normalizedMessage) : null;

  if (
    !requestedAction
    && directServerExecutionIntent
    && (
      !identity.authenticated
      || !identity.token
      || !session.context.serviceId
    )
  ) {
    fallbackAssistantReplyText = buildAssistantRemoteExecGuidanceReply(locale, {
      authenticated: identity.authenticated && Boolean(identity.token),
      serviceId: session.context.serviceId,
      playbook: customScriptLabel ? null : matchedRemotePlaybook,
      playbookLabel: customScriptLabel || matchedRemotePlaybook?.name || null,
      manualCommand: customScriptLabel ? customScriptManualCommand : null,
    });
    actionSummary.push(locale.toLowerCase().startsWith('zh')
      ? '需要补充登录状态或服务上下文后才能执行服务器动作。'
      : 'Execution needs authenticated context and an active service target.');
  }

  if (!requestedAction && !fallbackAssistantReplyText && generationTaskCheckIntent) {
    const taskId = explicitGenerationTaskId ?? findLatestAssistantGenerationTaskId(sessionMessages);
    if (taskId) {
      const task = operatorEngine.getGenerationTask(taskId);
      if (task) {
        const taskStatusPayload = buildAssistantGenerationTaskStatusReply({
          request,
          locale,
          taskId,
          task,
        });
        fallbackAssistantReplyText = taskStatusPayload.replyText;
        actionResult = taskStatusPayload.actionResult;
        actionSummary.push(`generation_task=${taskId} status=${task.status} progress=${task.progress}`);
      } else {
        fallbackAssistantReplyText = locale.toLowerCase().startsWith('zh')
          ? `我没有找到任务 ${taskId}。你可以把最新任务编号再发一次，或直接说“重新生成一次”。`
          : `I could not find task ${taskId}. Send the latest task ID again, or say "retry generation".`;
        actionSummary.push(`generation_task_missing=${taskId}`);
      }
    } else {
      fallbackAssistantReplyText = locale.toLowerCase().startsWith('zh')
        ? '我还没在当前会话里找到任务编号。请先启动真实生成任务，或把任务编号（task_...）发给我。'
        : 'I could not find a task ID in this session yet. Start a real build task first, or send me a task ID (task_...).';
      actionSummary.push('generation_task_missing=none');
    }
  }

  let preparedWorkflowEnvelope: OperatorEnvelope | null = null;
  let preparedWorkflowCapsulePath: string | null = null;
  let preparedWorkflowCapsuleUrl: string | null = null;
  let preparedWorkflowCapsuleId: string | null = null;
  if (workspaceContinuationIntent && session.context.capsuleId) {
    preparedWorkflowEnvelope = operatorEngine.continueActiveTask({
      capsuleId: session.context.capsuleId,
      operation: workspaceContinuationIntent.operation,
      userIntent: normalizedMessage,
    });
    preparedWorkflowCapsuleId = preparedWorkflowEnvelope?.capsule.id ?? session.context.capsuleId;
    if (preparedWorkflowEnvelope) {
      fallbackAssistantReplyText = buildAssistantWorkspaceContinuationReply(
        locale,
        preparedWorkflowEnvelope,
        workspaceContinuationIntent,
      );
      actionSummary.push(`workspace_continue=${workspaceContinuationIntent.operation}`);
      actionSummary.push(`route=${routingDecision.route}`);
      forceDeterministicReply = true;
    } else {
      fallbackAssistantReplyText = locale.toLowerCase().startsWith('zh')
        ? '当前会话对应的工作区不存在，请先回到工作区列表重新选择。'
        : 'The workspace linked to this session was not found. Select the workspace again and retry.';
      actionSummary.push('workspace_continue=workspace_not_found');
      forceDeterministicReply = true;
    }
  } else if (repoWorkspaceIntent) {
    preparedWorkflowEnvelope = await operatorEngine.analyzeProject({
      projectName: repoWorkspaceIntent.projectName,
      repoUrl: repoWorkspaceIntent.repoUrl,
      notes: repoWorkspaceIntent.notes,
      planningMode,
      autoStartBuild: false,
      existingCapsuleId: session.context.capsuleId,
      userIntent: normalizedMessage,
      sessionId: session.sessionId,
      taskMode,
    });
    preparedWorkflowCapsuleId = preparedWorkflowEnvelope.capsule.id;
    actionSummary.push(`route=${routingDecision.route}`);
  }

  const repoWorkspaceProposal = repoWorkspaceIntent
    ? buildAssistantRepoWorkspaceProposal(locale, {
      ...repoWorkspaceIntent,
      capsuleId: preparedWorkflowCapsuleId,
      planningMode,
      taskMode,
    })
    : null;

  const ideaLaunchIntent = requestedAction
    || askMode
    || directServerExecutionIntent
    || routingDecision.route !== 'idea_generate'
    ? null
    : routingDecision.idea;
  if (!preparedWorkflowEnvelope && ideaLaunchIntent) {
    preparedWorkflowEnvelope = operatorEngine.createPlan({
      entryKind: 'generate-from-idea',
      title: buildAssistantIdeaProjectName(ideaLaunchIntent, locale),
      brief: ideaLaunchIntent,
      planningMode,
      existingCapsuleId: session.context.capsuleId,
      userIntent: normalizedMessage,
      sessionId: session.sessionId,
      taskMode,
      parsedInput: {
        kind: 'idea',
        rawInput: normalizedMessage,
        idea: ideaLaunchIntent,
      },
    });
    preparedWorkflowCapsuleId = preparedWorkflowEnvelope.capsule.id;
  }
  const ideaLaunchProposal = ideaLaunchIntent
    ? buildAssistantIdeaLaunchProposal(locale, {
      idea: ideaLaunchIntent,
      capsuleId: preparedWorkflowCapsuleId,
      planningMode,
      taskMode,
    })
    : null;

  if (preparedWorkflowEnvelope) {
    preparedWorkflowCapsulePath = buildOperatorWorkbenchPath(preparedWorkflowEnvelope.capsule.id);
    preparedWorkflowCapsuleUrl = buildAbsoluteCapsuleUrl(request, preparedWorkflowCapsulePath);
  }
  const preparedWorkflowPayload = preparedWorkflowEnvelope?.workflow ?? null;
  const preparedWorkspacePayload = preparedWorkflowEnvelope
    ? {
      capsuleId: preparedWorkflowEnvelope.capsule.id,
      capsulePath: preparedWorkflowCapsulePath,
      capsuleUrl: preparedWorkflowCapsuleUrl,
      workflowStage: preparedWorkflowEnvelope.workflow.activeTaskId
        ? preparedWorkflowEnvelope.workflow.tasks.find((task) => task.id === preparedWorkflowEnvelope.workflow.activeTaskId)?.currentStage ?? null
        : null,
    }
    : null;

  if (repoWorkspaceIntent && repoWorkspaceProposal) {
    const repoExecutionProposal = mode === 'run'
      ? {
        ...repoWorkspaceProposal,
        requiresConfirmation: false,
      }
      : repoWorkspaceProposal;
    effectiveProposals.unshift(repoExecutionProposal);
    if (mode === 'run') {
      actionSummary.push(locale.toLowerCase().startsWith('zh')
        ? '仓库部署请求已锁定到 repo_import_deploy lane，并会直接进入真实工作区执行。'
        : 'The repository deployment request is locked to the repo_import_deploy lane and will enter the real workspace flow directly.');
    } else {
      pendingConfirmation = assistantOrchestrator.issueConfirmation(session.sessionId, identity.userKey, repoExecutionProposal);
      actionSummary.push(locale.toLowerCase().startsWith('zh')
        ? '已生成仓库部署计划，等待确认后执行。'
        : 'Repository deployment plan prepared and waiting for confirmation.');
      fallbackAssistantReplyText = buildAssistantRepoWorkspacePlanReply(repoWorkspaceIntent, locale);
      forceDeterministicReply = true;
    }
  } else if (ideaLaunchIntent && ideaLaunchProposal) {
    pendingConfirmation = assistantOrchestrator.issueConfirmation(session.sessionId, identity.userKey, ideaLaunchProposal);
    effectiveProposals.unshift(ideaLaunchProposal);
    actionSummary.push(locale.toLowerCase().startsWith('zh')
      ? '已生成想法执行计划，等待确认后执行。'
      : 'Idea-to-build plan prepared and waiting for confirmation.');
    fallbackAssistantReplyText = buildAssistantIdeaLaunchPlanReply(ideaLaunchIntent, locale);
    forceDeterministicReply = true;
  }

  const executionCandidate = requestedAction
    ? effectiveProposals[0] ?? null
    : effectiveProposals[0] ?? null;
  const executionRequiresAuth = executionCandidate?.action.kind !== 'create-launch-capsule'
    && executionCandidate?.action.kind !== 'create-repo-workspace';
  const forcedRouteExecution = !askMode && routingDecision.route === 'repo_import_deploy';
  const explicitExecutionIntent = assistantOrchestrator.isExecutionIntent(normalizedMessage)
    || containsAny(normalizeAssistantSearchText(normalizedMessage), [
      '直接执行',
      '直接安装',
      '现在执行',
      '马上执行',
      '立刻执行',
      '直接给我装',
      '直接给我执行',
      'run it now',
      'execute now',
      'install now',
      'just do it',
    ]);

  if (!pendingConfirmation && !identity.authenticated && executionCandidate && executionRequiresAuth) {
    actionSummary.push(locale.toLowerCase().startsWith('zh')
      ? '当前未登录，执行动作前请先登录。'
      : 'Please log in before executing account actions.');
  } else if (
    !pendingConfirmation
    && executionCandidate
    && (identity.token || executionCandidate.action.kind === 'create-launch-capsule' || executionCandidate.action.kind === 'create-repo-workspace')
  ) {
    const shouldAutoRun = askMode
      ? false
      : (
        requestedAction?.execute
        ?? (
          forcedRouteExecution
          || (
          assistantOrchestrator.shouldAutoExecute(executionCandidate, normalizedMessage)
          || (executionCandidate.requiresConfirmation && explicitExecutionIntent)
          )
        )
      );
    if (executionCandidate.requiresConfirmation && shouldAutoRun) {
      pendingConfirmation = assistantOrchestrator.issueConfirmation(session.sessionId, identity.userKey, executionCandidate);
      actionSummary.push(locale.toLowerCase().startsWith('zh')
        ? '该动作需要确认，请点击确认后继续。'
        : 'This action requires confirmation. Please confirm to continue.');
      fallbackAssistantReplyText = buildAssistantPendingConfirmationReply(locale, executionCandidate);
    } else if (shouldAutoRun) {
      const executed = await executeAssistantAction(request, {
        token: identity.token,
        locale,
        user: identity.user,
        proposal: executionCandidate,
      });
      actionResult = executed;
      actionSummary.push(`action=${executionCandidate.action.kind} code=${executed.code}`);
      if (executed.detail) {
        actionSummary.push(`detail=${executed.detail}`);
      }
      if (
        (
          executionCandidate.action.kind === 'reveal-server-access'
          || executionCandidate.action.kind === 'execute-service-playbook'
          || executionCandidate.action.kind === 'install-service-app'
          || executionCandidate.action.kind === 'check-service-app-status'
        )
        && executed.detail
      ) {
        fallbackAssistantReplyText = executed.detail;
      }
    } else {
      actionSummary.push(locale.toLowerCase().startsWith('zh')
        ? '已生成可执行动作，选择后继续。'
        : 'Executable action is ready. Select it to continue.');
    }
  } else if (
    !requestedAction
    && directServerExecutionIntent
    && identity.authenticated
    && Boolean(identity.token)
    && Boolean(session.context.serviceId)
  ) {
      fallbackAssistantReplyText = buildAssistantExecutionNeedDetailReply(locale, {
      serviceId: session.context.serviceId!,
      matchedPlaybookName: matchedRemotePlaybook?.name ?? null,
    });
  }

  const accountSummary = await buildAssistantFacts(identity.token, session.context);
  const builtReply = forceDeterministicReply
    ? null
    : await assistantOrchestrator.buildAssistantReply({
      sessionId: session.sessionId,
      userKey: identity.userKey,
      userId: identity.user?.id ?? null,
      selectedModelId: requestedModel.id,
      locale,
      userMessage: messageForAssistant || userMessage.content,
      attachments,
      context: session.context,
      authenticated: identity.authenticated,
      userLabel: identity.user?.email ?? identity.user?.name ?? null,
      accountSummary,
      actionSummary,
      proposals: effectiveProposals,
    });
  if (!builtReply) {
    if (fallbackAssistantReplyText) {
      const assistantReply = assistantOrchestrator.recordAssistantMessage(
        session.sessionId,
        identity.userKey,
        fallbackAssistantReplyText,
      );
      return {
        message: 'Assistant reply generated from deterministic fallback.',
        data: {
          session: assistantOrchestrator.openSession({
            userKey: identity.userKey,
            sessionId: session.sessionId,
          }),
          authenticated: identity.authenticated,
          reply: assistantReply,
          runState: resolveAssistantRunState({
            pendingConfirmation,
            actionResult,
            proposalsCount: effectiveProposals.length,
            workflowStage: preparedWorkspacePayload?.workflowStage ?? null,
          }),
          source: resolveAssistantResponseSource({
            pendingConfirmation,
            actionResult,
            builtReplyMode: null,
            usedDeterministicFallback: true,
          }),
          proposals: effectiveProposals,
          pendingConfirmation,
          actionResult,
          workflow: preparedWorkflowPayload,
          workspace: preparedWorkspacePayload,
          quota: quotaContext.snapshot,
          upgradeCta: quotaContext.upgradeCta,
          chargedTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          resolvedModelId: 'deterministic-fallback',
          routing: responseRouting,
        },
      };
    }

    throw new GatewayError('Assistant upstream model is temporarily unavailable.', 502, {
      code: 'ASSISTANT_UPSTREAM_UNAVAILABLE',
      detail: buildAssistantUpstreamUnavailableDetail(locale),
      quota: quotaContext.snapshot,
      upgradeCta: quotaContext.upgradeCta,
    });
  }

  if (builtReply.responseMode === 'fallback' && !assistantAllowDevelopmentMock) {
    throw new GatewayError('Assistant fallback replies are disabled in runtime mode.', 503, {
      code: mode === 'run' ? 'ASSISTANT_LIVE_PROVIDER_REQUIRED' : 'ASSISTANT_UPSTREAM_UNAVAILABLE',
      detail: buildAssistantProviderStatusReason(locale, providerStatus),
      quota: quotaContext.snapshot,
      upgradeCta: quotaContext.upgradeCta,
    });
  }

  if (mode === 'run' && builtReply.responseMode === 'fallback') {
    throw new GatewayError('Assistant live provider became unavailable during Run mode.', 503, {
      code: 'ASSISTANT_LIVE_PROVIDER_REQUIRED',
      detail: buildAssistantProviderStatusReason(locale, providerStatus),
      quota: quotaContext.snapshot,
      upgradeCta: quotaContext.upgradeCta,
    });
  }

  const assistantReply = assistantOrchestrator.recordAssistantMessage(session.sessionId, identity.userKey, builtReply.text);
  const quotaAfterCharge = await assistantQuota.recordUsage({
    actorKey: quotaContext.actorKey,
    snapshot: quotaContext.snapshot,
    chargedTokens: builtReply.chargedTokens,
  });

  return {
    message: 'Assistant reply generated.',
    data: {
      session: assistantOrchestrator.openSession({
        userKey: identity.userKey,
        sessionId: session.sessionId,
      }),
      authenticated: identity.authenticated,
      reply: assistantReply,
      runState: resolveAssistantRunState({
        pendingConfirmation,
        actionResult,
        proposalsCount: effectiveProposals.length,
        workflowStage: preparedWorkspacePayload?.workflowStage ?? null,
      }),
      source: resolveAssistantResponseSource({
        pendingConfirmation,
        actionResult,
        builtReplyMode: builtReply.responseMode,
        usedDeterministicFallback: false,
      }),
      proposals: effectiveProposals,
      pendingConfirmation,
      actionResult,
      workflow: preparedWorkflowPayload,
      workspace: preparedWorkspacePayload,
      quota: quotaAfterCharge,
      upgradeCta: quotaContext.upgradeCta,
      chargedTokens: builtReply.chargedTokens,
      inputTokens: builtReply.inputTokens,
      outputTokens: builtReply.outputTokens,
      resolvedModelId: builtReply.resolvedModelId,
      routing: responseRouting,
    },
  };
});

app.post('/api/v1/assistant/actions/confirm', async (request, reply) => {
  ensureAssistantEnabled();
  const body = z.object({
    sessionId: z.string().min(1),
    confirmToken: z.string().min(1),
    locale: z.string().optional(),
  }).parse(request.body ?? {});

  const locale = getStringValue(body.locale) || 'zh-CN';
  const identity = await resolveAssistantIdentity(request);
  const proposal = assistantOrchestrator.consumeConfirmation(body.confirmToken, body.sessionId, identity.userKey);
  if (!proposal) {
    throw new GatewayError('Confirmation token is invalid or expired.', 409, {
      code: 'ASSISTANT_CONFIRMATION_INVALID',
    });
  }

  if (
    proposal.action.kind !== 'create-launch-capsule'
    && proposal.action.kind !== 'create-repo-workspace'
    && (!identity.authenticated || !identity.token)
  ) {
    throw new GatewayError('Authentication is required.', 401, {
      code: 'ASSISTANT_AUTH_REQUIRED',
    });
  }

  const executed = await executeAssistantAction(request, {
    token: identity.token,
    locale,
    user: identity.user,
    proposal,
  });

  const executedData = asRecordValue(executed.data);
  const taskId = getStringValue(executedData.taskId);
  const executedCapsuleId = getStringValue(executedData.capsuleId) ?? proposal.action.capsuleId ?? null;
  const generationTaskRecord = asRecordValue(executedData.task);
  const generationTaskStatus = readNullableStringValue(generationTaskRecord?.status);
  const generationTaskProgress = typeof generationTaskRecord?.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(generationTaskRecord.progress)))
    : null;
  let previewUrl = getStringValue(executedData.previewUrl);
  const capsulePath = getStringValue(executedData.capsulePath) ?? (executedCapsuleId ? buildOperatorWorkbenchPath(executedCapsuleId) : null);
  const capsuleUrl = getStringValue(executedData.capsuleUrl) ?? (capsulePath ? buildAbsoluteCapsuleUrl(request, capsulePath) : null);
  let workflowEnvelope = executedCapsuleId ? operatorEngine.getCapsule(executedCapsuleId) : null;
  if (
    executedCapsuleId
    && (proposal.action.kind === 'create-launch-capsule' || proposal.action.kind === 'create-repo-workspace')
  ) {
    workflowEnvelope = operatorEngine.confirmActivePlan({
      capsuleId: executedCapsuleId,
      userIntent: proposal.action.kind === 'create-repo-workspace'
        ? [proposal.action.notes?.trim(), proposal.action.repoUrl?.trim()].filter(Boolean).join('\n\n') || proposal.title
        : proposal.action.idea ?? proposal.description ?? proposal.title,
    }) ?? workflowEnvelope;
    if (workflowEnvelope) {
      previewUrl = workflowEnvelope.previewUrl
        ?? workflowEnvelope.previewSummary.previewUrl
        ?? workflowEnvelope.capsule.previewUrl
        ?? previewUrl;
      executed.data = {
        ...(executedData ?? {}),
        capsuleId: workflowEnvelope.capsule.id,
        capsulePath,
        capsuleUrl,
        previewUrl,
        workflow: workflowEnvelope.workflow,
        truthState: workflowEnvelope.truthState,
        techStackSummary: workflowEnvelope.techStackSummary,
        envChecklistSummary: workflowEnvelope.envChecklistSummary,
        deploymentSummary: workflowEnvelope.deploymentSummary,
      };
    }
  }
  const summaryText = proposal.action.kind === 'create-launch-capsule'
    ? (locale.toLowerCase().startsWith('zh')
        ? [
          `已确认启动：${proposal.title}`,
          taskId ? `任务编号：${taskId}` : null,
          generationTaskStatus ? `当前阶段：${assistantTaskStageLabel(generationTaskStatus as OperatorGenerationTask['status'], locale)}` : null,
          generationTaskProgress !== null ? `当前进度：${generationTaskProgress}%` : null,
          previewUrl ? `预览地址：${previewUrl}` : null,
          capsuleUrl ? `任务工作区：${capsuleUrl}` : null,
          taskId ? '这是真实任务，不等于已经部署完成；聊天窗口会继续显示它的真实进度。' : '接下来你可以打开任务工作区，继续查看源码、预览和部署入口。',
        ].filter(Boolean).join('\n')
        : [
          `Confirmed: ${proposal.title}`,
          taskId ? `Task: ${taskId}` : null,
          generationTaskStatus ? `Stage: ${assistantTaskStageLabel(generationTaskStatus as OperatorGenerationTask['status'], locale)}` : null,
          generationTaskProgress !== null ? `Progress: ${generationTaskProgress}%` : null,
          previewUrl ? `Preview: ${previewUrl}` : null,
          capsuleUrl ? `Workspace: ${capsuleUrl}` : null,
          taskId ? 'This is a real task, not a completed deployment yet. The chat will keep showing the verified task status.' : 'Open the workspace to inspect the source, preview, and deployment entry points.',
        ].filter(Boolean).join('\n'))
    : proposal.action.kind === 'create-repo-workspace'
      ? (locale.toLowerCase().startsWith('zh')
          ? [
            `已确认启动：${proposal.title}`,
            capsuleUrl ? `任务工作区：${capsuleUrl}` : null,
            previewUrl ? `预览地址：${previewUrl}` : null,
            '接下来会先执行仓库识别、环境清单和真实预览验证；如果任何一步失败，会明确停在根因。',
          ].filter(Boolean).join('\n')
          : [
            `Confirmed: ${proposal.title}`,
            capsuleUrl ? `Workspace: ${capsuleUrl}` : null,
            previewUrl ? `Preview: ${previewUrl}` : null,
            'The flow now moves through stack detection, environment checklisting, and verified preview execution. Any failure will stop at the root cause.',
          ].filter(Boolean).join('\n'))
      : (locale.toLowerCase().startsWith('zh')
          ? `已执行：${proposal.title}\n结果：${executed.message}`
          : `Executed: ${proposal.title}\nResult: ${executed.message}`);
  const summaryWithDetail = executed.detail ? `${summaryText}\n\n${executed.detail}` : summaryText;
  let assistantReply: ReturnType<typeof assistantOrchestrator.recordAssistantMessage>;
  try {
    assistantReply = assistantOrchestrator.recordAssistantMessage(body.sessionId, identity.userKey, summaryWithDetail);
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSISTANT_SESSION_NOT_FOUND') {
      throw new GatewayError('Assistant session was not found.', 404, {
        code: 'ASSISTANT_SESSION_NOT_FOUND',
      });
    }
    if (error instanceof Error && error.message === 'ASSISTANT_SESSION_FORBIDDEN') {
      throw new GatewayError('Assistant session does not belong to current user.', 403, {
        code: 'ASSISTANT_SESSION_FORBIDDEN',
      });
    }
    throw error;
  }

  const quotaContext = await resolveAssistantQuotaContext(request, reply, locale, identity);
  const responseRouting = buildAssistantRoutingFromProposal(proposal);

  return {
    message: 'Assistant action confirmed and executed.',
    data: {
      session: assistantOrchestrator.openSession({
        userKey: identity.userKey,
        sessionId: body.sessionId,
      }),
      authenticated: identity.authenticated,
      reply: assistantReply,
      runState: resolveAssistantRunState({
        pendingConfirmation: null,
        actionResult: executed,
        proposalsCount: 0,
        workflowStage: workflowEnvelope?.workflow.activeTaskId
          ? workflowEnvelope.workflow.tasks.find((task) => task.id === workflowEnvelope.workflow.activeTaskId)?.currentStage ?? null
          : null,
      }),
      source: resolveAssistantResponseSource({
        pendingConfirmation: null,
        actionResult: executed,
        builtReplyMode: null,
        usedDeterministicFallback: true,
      }),
      actionResult: executed,
      workflow: workflowEnvelope?.workflow ?? null,
      workspace: executedCapsuleId
        ? {
          capsuleId: executedCapsuleId,
          capsulePath,
          capsuleUrl,
          workflowStage: workflowEnvelope?.workflow.activeTaskId
            ? workflowEnvelope.workflow.tasks.find((task) => task.id === workflowEnvelope.workflow.activeTaskId)?.currentStage ?? null
            : null,
        }
        : null,
      quota: quotaContext.snapshot,
      upgradeCta: quotaContext.upgradeCta,
      routing: responseRouting,
    },
  };
});

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

app.get('/api/v1/catalog/products/:productSlug/vps-app-market', async (request) => {
  const params = z.object({
    productSlug: z.string().min(1),
  }).parse(request.params);
  const query = z.object({
    os: z.string().min(1).optional(),
  }).parse(request.query ?? {});

  return gateway.productVpsAppMarket(params.productSlug, query.os);
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

  const response = await gateway.register({
    ...body,
    referralCode: readReferralCode(request) ?? undefined,
  });
  writeSession(reply, response.data.accessToken);

  return {
    message: response.message,
    data: {
      user: response.data.user,
    },
  };
});

app.get('/api/v1/auth/me', async (request, reply) => {
  const token = requireToken(request);
  reply.setCookie(env.SESSION_TOKEN_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie,
    maxAge: env.SESSION_TTL_SECONDS,
  });
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

app.post('/api/v1/affiliate/track', async (request, reply) => {
  const body = z.object({
    code: z.string().trim().min(5).max(25),
  }).parse(request.body ?? {});

  const normalizedCode = body.code.trim();
  const existingCode = readReferralCode(request);

  if (existingCode && existingCode === normalizedCode) {
    return {
      message: 'Referral already tracked.',
      data: {
        tracked: true,
        code: normalizedCode,
        valid: true,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        sourceMode: effectivePaymenterMode,
      },
    };
  }

  const response = await gateway.trackAffiliate(normalizedCode);
  if (!response.data.valid) {
    clearReferralCookie(reply);
    return reply.status(404).send({
      message: 'Referral code is invalid.',
      data: {
        tracked: false,
        code: normalizedCode,
        valid: false,
      },
      meta: response.meta,
    });
  }

  writeReferralCookie(reply, normalizedCode);

  return {
    message: 'Referral tracked successfully.',
    data: {
      tracked: true,
      code: normalizedCode,
      valid: true,
      affiliate: response.data.affiliate,
    },
    meta: response.meta,
  };
});

app.get('/api/v1/affiliate/me', async (request) => {
  return gateway.affiliateMe(requireToken(request));
});

app.post('/api/v1/affiliate/enroll', async (request) => {
  const body = z.object({
    code: z.string().trim().min(5).max(25).optional(),
  }).parse(request.body ?? {});

  return gateway.affiliateEnroll(requireToken(request), body.code);
});

app.get('/api/v1/affiliate/orders', async (request) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }).parse(request.query ?? {});

  return gateway.affiliateOrders(requireToken(request), query.limit ?? 20);
});

app.get('/api/v1/cart', async (request) => gateway.cart(requireToken(request)));
app.post('/api/v1/cart/items', async (request, reply) => {
  const body = z.object({
    productSlug: z.string().min(1),
    planId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(100).optional(),
    configOptions: z.record(z.unknown()).optional(),
    checkoutConfig: z.record(z.unknown()).optional(),
  }).parse(request.body);

  const checkoutConfig = body.checkoutConfig ?? {};
  const requestedPassword = readCheckoutConfigString(
    checkoutConfig,
    [
      'account_password',
      'server_password',
      'password',
      'root_password',
      'accountPassword',
      'serverPassword',
      'rootPassword',
    ],
    (token) => token.endsWith('password') && !token.includes('confirm'),
  );
  const passwordConfirmation = readCheckoutConfigString(
    checkoutConfig,
    [
      'password_confirmation',
      'confirm_password',
      'password_confirm',
      'passwordConfirmation',
      'confirmPassword',
      'server_password_confirmation',
      'serverPasswordConfirmation',
    ],
    (token) => token.includes('confirm') && token.includes('password'),
  );
  const passwordError = validateCustomServicePassword(requestedPassword);
  if (passwordError) {
    return reply.status(422).send({ message: passwordError });
  }

  if (requestedPassword && !passwordConfirmation) {
    return reply.status(422).send({
      message: 'Please confirm the custom server password before adding this item to cart.',
    });
  }

  if (requestedPassword && passwordConfirmation && requestedPassword !== passwordConfirmation) {
    return reply.status(422).send({
      message: 'Password confirmation does not match the custom password.',
    });
  }

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

  return gateway.checkout(requireToken(request), {
    ...body,
    referralCode: readReferralCode(request) ?? undefined,
  });
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

app.get('/api/v1/services/:serviceId/apps', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  return gateway.serviceApps(requireToken(request), params.serviceId);
});

app.post('/api/v1/services/:serviceId/apps/install', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    addonAppSlugs: z.array(z.string().min(1)).optional(),
    addon_app_slugs: z.array(z.string().min(1)).optional(),
  }).parse(request.body ?? {});

  return gateway.installServiceApps(
    requireToken(request),
    params.serviceId,
    body.addonAppSlugs ?? body.addon_app_slugs ?? [],
  );
});

app.post('/api/v1/services/:serviceId/apps/:installId/retry', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    installId: z.string().min(1),
  }).parse(request.params);

  return gateway.retryServiceAppInstall(requireToken(request), params.serviceId, params.installId);
});

app.get('/api/v1/services/:serviceId/apps/:installId/logs', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    installId: z.string().min(1),
  }).parse(request.params);

  return gateway.serviceAppInstallLogs(requireToken(request), params.serviceId, params.installId);
});

app.get('/api/v1/services/:serviceId/provisioning', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  return gateway.serviceProvisioning(requireToken(request), params.serviceId);
});

app.post('/api/v1/services/:serviceId/provisioning/retry', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    force: z.boolean().optional().default(false),
    accountPassword: z.string().optional(),
    account_password: z.string().optional(),
  }).parse(request.body ?? {});
  const accountPassword = body.accountPassword ?? body.account_password ?? '';
  const passwordError = validateCustomServicePassword(accountPassword);
  if (passwordError) {
    throw new GatewayError(passwordError, 422);
  }

  return gateway.retryServiceProvisioning(requireToken(request), params.serviceId, {
    force: body.force,
    ...(accountPassword !== '' ? { accountPassword } : {}),
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
    currentPassword: z.string().min(1).optional(),
    current_password: z.string().min(1).optional(),
  }).parse(request.body);
  const currentPassword = body.currentPassword ?? body.current_password ?? '';
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'cancel',
    requestPayload: {
      type: body.type,
      reason: body.reason,
      current_password: currentPassword !== '' ? '[REDACTED]' : null,
    },
    successCode: 'SERVICE_CANCEL_REQUESTED',
    failureCode: 'SERVICE_CANCEL_FAILED',
    run: () => gateway.cancelService(token, params.serviceId, {
      type: body.type,
      reason: body.reason,
      currentPassword,
    }),
  });
});

app.delete('/api/v1/services/:serviceId/cancel', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'cancel-revoke',
    requestPayload: {},
    successCode: 'SERVICE_CANCEL_REVOKED',
    failureCode: 'SERVICE_CANCEL_REVOKE_FAILED',
    run: () => gateway.revokeServiceCancellation(token, params.serviceId),
  });
});

app.post('/api/v1/services/:serviceId/renew', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'renew',
    requestPayload: {},
    successCode: 'SERVICE_RENEW_INVOICE_CREATED',
    failureCode: 'SERVICE_RENEW_FAILED',
    run: () => gateway.renewService(token, params.serviceId),
  });
});

app.get('/api/v1/services/:serviceId/upgrade-options', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  return gateway.serviceUpgradeOptions(requireToken(request), params.serviceId);
});

app.post('/api/v1/services/:serviceId/upgrade', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    productId: z.union([z.string().min(1), z.number().int().positive()]).optional(),
    product_id: z.union([z.string().min(1), z.number().int().positive()]).optional(),
    configOptions: z.record(z.union([z.string().min(1), z.number().int().positive(), z.null()])).optional(),
    config_options: z.record(z.union([z.string().min(1), z.number().int().positive(), z.null()])).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'upgrade',
    requestPayload: {
      product_id: body.productId ?? body.product_id ?? null,
      config_options: body.configOptions ?? body.config_options ?? {},
    },
    successCode: 'SERVICE_UPGRADE_SUBMITTED',
    failureCode: 'SERVICE_UPGRADE_FAILED',
    run: () => gateway.upgradeService(token, params.serviceId, {
      productId: body.productId ?? body.product_id,
      configOptions: body.configOptions ?? body.config_options ?? {},
    }),
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

app.get('/api/v1/services/:serviceId/runtime/overview', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
  const runtimeResolution = resolveRuntimeKind(service, serverRef);
  const runtimeCapabilities = buildRuntimeCapabilities(
    runtimeResolution.kind,
    capabilities,
    runtimeResolution.propertyMap,
  );

  if (isArchivedService(service)) {
    return buildRuntimeOverviewPayload(
      'archived',
      'This service is cancelled or archived. Real-time server controls are disabled.',
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      null,
    );
  }

  if (runtimeResolution.kind !== 'vps') {
    return buildRuntimeOverviewPayload(
      'failed',
      'Runtime overview is only available for VPS services.',
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      null,
    );
  }

  if (!serverRef) {
    const unresolved = readProvisioningRuntimeState(service);
    return buildRuntimeOverviewPayload(
      unresolved.status,
      unresolved.reason,
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      null,
    );
  }

  if (!convoyEnabled) {
    return buildRuntimeOverviewPayload(
      'upstream_unavailable',
      'Convoy integration is disabled.',
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      null,
    );
  }

  try {
    const cached = await withRuntimeReadCache(`runtime-overview:${serverRef}`, async () => {
      const [stateResponse, serverResponse] = await Promise.all([
        convoy.getServerState(serverRef),
        convoy.getServer(serverRef).catch(() => null),
      ]);

      return {
        stateResponse,
        serverResponse,
      };
    });

    const cacheRecord = asRecordValue(cached);
    const stateData = readConvoyDataRecord(cacheRecord.stateResponse);
    const metadata = readVpsMetadata(service, cacheRecord.serverResponse);

    return buildRuntimeOverviewPayload(
      'ready',
      null,
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      {
        powerState: readNullableStringValue(stateData.power_state ?? stateData.state),
        cpuUsed: readNullableNumberValue(stateData.cpu_used ?? stateData.cpu),
        memoryUsed: readNullableNumberValue(stateData.memory_used ?? stateData.mem),
        memoryTotal: readNullableNumberValue(stateData.memory_total ?? stateData.maxmem),
        uptime: readNullableNumberValue(stateData.uptime),
        node: metadata.node ?? null,
        hostname: metadata.hostname ?? null,
        primaryIp: metadata.primaryIp ?? null,
        operatingSystem: metadata.operatingSystem ?? null,
      },
    );
  } catch (error) {
    if (error instanceof GatewayError && isMissingBackingVmError(error)) {
      return buildRuntimeOverviewPayload(
        'failed',
        'Service mapping points to a missing backend VM.',
        service,
        runtimeResolution.kind,
        runtimeCapabilities,
        null,
      );
    }

    return buildRuntimeOverviewPayload(
      'upstream_unavailable',
      error instanceof Error ? error.message : 'Runtime overview is temporarily unavailable.',
      service,
      runtimeResolution.kind,
      runtimeCapabilities,
      null,
    );
  }
});

app.get('/api/v1/services/:serviceId/runtime/metrics', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const runtimeResolution = resolveRuntimeKind(service, serverRef);

  if (isArchivedService(service)) {
    return buildRuntimeMetricsPayload(
      'archived',
      'This service is cancelled or archived. Real-time metrics are disabled.',
      service,
      runtimeResolution.kind,
      null,
    );
  }

  if (runtimeResolution.kind !== 'vps') {
    return buildRuntimeMetricsPayload(
      'failed',
      'Runtime metrics are only available for VPS services.',
      service,
      runtimeResolution.kind,
      null,
    );
  }

  if (!serverRef) {
    const unresolved = readProvisioningRuntimeState(service);
    return buildRuntimeMetricsPayload(
      unresolved.status,
      unresolved.reason,
      service,
      runtimeResolution.kind,
      null,
    );
  }

  if (!convoyEnabled) {
    return buildRuntimeMetricsPayload(
      'upstream_unavailable',
      'Convoy integration is disabled.',
      service,
      runtimeResolution.kind,
      null,
    );
  }

  try {
    const cached = await withRuntimeReadCache(`runtime-metrics:${serverRef}`, async () => convoy.getServerMetrics(serverRef));
    const metricsData = readConvoyDataRecord(cached);

    return buildRuntimeMetricsPayload(
      'ready',
      null,
      service,
      runtimeResolution.kind,
      {
        diskUsed: readNullableNumberValue(metricsData.disk_used ?? metricsData.disk),
        diskTotal: readNullableNumberValue(metricsData.disk_total ?? metricsData.maxdisk),
        rxBytes: readNullableNumberValue(metricsData.rx_bytes ?? metricsData.netin),
        txBytes: readNullableNumberValue(metricsData.tx_bytes ?? metricsData.netout),
        bandwidthUsage: readNullableNumberValue(metricsData.bandwidth_usage),
        bandwidthLimit: readNullableNumberValue(metricsData.bandwidth_limit),
        sampledAt: readNullableStringValue(metricsData.sampled_at),
      },
    );
  } catch (error) {
    if (error instanceof GatewayError && isMissingBackingVmError(error)) {
      return buildRuntimeMetricsPayload(
        'failed',
        'Service mapping points to a missing backend VM.',
        service,
        runtimeResolution.kind,
        null,
      );
    }

    return buildRuntimeMetricsPayload(
      'upstream_unavailable',
      error instanceof Error ? error.message : 'Runtime metrics are temporarily unavailable.',
      service,
      runtimeResolution.kind,
      null,
    );
  }
});

app.get('/api/v1/services/:serviceId/runtime/logs', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const query = z.object({
    limit: z.coerce.number().int().min(1).optional(),
  }).parse(request.query ?? {});
  const normalizedLimit = Math.min(query.limit ?? 50, 100);
  const token = requireToken(request);
  const context = await loadRuntimeContext(token, params.serviceId);

  if (context.runtimeKind === 'managed-app') {
    return managedAppRuntime.logs(context.service, normalizedLimit, managedAppOptionsFromContext(context)).catch((error) => managedAppErrorToGateway(error, 'logs'));
  }

  return gateway.serviceOperationLogs(token, params.serviceId, normalizedLimit);
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

app.get('/api/v1/services/:serviceId/server/firewall', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  const convoyResponse = await convoy.getServerFirewall(resolvedServerRef).catch((error) => {
    if (error instanceof GatewayError && isMissingBackingVmError(error)) {
      throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'firewall'));
    }
    if (error instanceof GatewayError && error.statusCode >= 500) {
      throw new GatewayError('Convoy firewall data is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'firewall', error));
    }

    throw error;
  });

  return buildFirewallPayload(service, resolvedServerRef, capabilities, convoyResponse);
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

app.post('/api/v1/services/:serviceId/server/console', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    type: z.enum(['novnc', 'xtermjs']).optional().default('novnc'),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);

  if (!capabilities.application.console) {
    throw new GatewayError('Console access is not available for this service.', 409, {
      code: 'SERVICE_CONSOLE_UNSUPPORTED',
    });
  }

  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
  const sessionResponse = await convoy.createConsoleSession(resolvedServerRef, body.type).catch((error) => {
    if (error instanceof GatewayError && isMissingBackingVmError(error)) {
      throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'console'));
    }
    if (error instanceof GatewayError && error.statusCode >= 500) {
      throw new GatewayError('Convoy console session is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'console', error));
    }
    throw error;
  });

  const sessionPayload = asRecordValue(sessionResponse.data);
  const launchUrl = buildConsoleLaunchUrl(sessionPayload, body.type);

  return {
    message: 'Console session created successfully.',
    data: {
      type: resolveConsoleSessionType(readNullableStringValue(sessionPayload.type) ?? body.type),
      launchUrl,
      host: readNullableStringValue(sessionPayload.fqdn),
      port: Number.isInteger(Number(sessionPayload.port)) ? Number(sessionPayload.port) : null,
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

app.patch('/api/v1/services/:serviceId/server/firewall/options', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    enabled: z.boolean().optional(),
    ipfilter: z.boolean().optional(),
    policyIn: z.enum(['ACCEPT', 'DROP', 'REJECT']).optional().nullable(),
    policyOut: z.enum(['ACCEPT', 'DROP', 'REJECT']).optional().nullable(),
  }).parse(request.body ?? {});
  const token = requireToken(request);

  const requestPayload: Record<string, unknown> = {};
  if (body.enabled !== undefined) requestPayload.enabled = body.enabled;
  if (body.ipfilter !== undefined) requestPayload.ipfilter = body.ipfilter;
  if (body.policyIn) requestPayload.policyIn = body.policyIn;
  if (body.policyOut) requestPayload.policyOut = body.policyOut;

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'firewall-options',
    requestPayload,
    successCode: 'SERVICE_FIREWALL_OPTIONS_UPDATED',
    failureCode: 'SERVICE_FIREWALL_OPTIONS_UPDATE_FAILED',
    run: async () => {
      const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
      const convoyPayload: Record<string, unknown> = {};

      if (body.enabled !== undefined) convoyPayload.enable = body.enabled;
      if (body.ipfilter !== undefined) convoyPayload.ipfilter = body.ipfilter;
      if (body.policyIn) convoyPayload.policy_in = body.policyIn;
      if (body.policyOut) convoyPayload.policy_out = body.policyOut;

      const convoyResponse = await convoy.patchFirewallOptions(resolvedServerRef, convoyPayload).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'firewall-options'));
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy firewall options are temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'firewall-options', error));
        }

        throw error;
      });

      return {
        message: 'Firewall settings updated successfully.',
        data: buildFirewallPayload(service, resolvedServerRef, capabilities, convoyResponse).data,
      };
    },
  });
});

app.post('/api/v1/services/:serviceId/server/firewall/rules', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    direction: z.enum(['in', 'out']),
    action: z.enum(['ACCEPT', 'DROP', 'REJECT']),
    protocol: z.enum(['tcp', 'udp', 'icmp', 'icmpv6']).optional().default('tcp'),
    enabled: z.boolean().optional().default(true),
    source: z.string().trim().max(255).optional().nullable(),
    destination: z.string().trim().max(255).optional().nullable(),
    destinationPort: z.string().trim().max(64).optional().nullable(),
    sourcePort: z.string().trim().max(64).optional().nullable(),
    comment: z.string().trim().max(255).optional().nullable(),
  }).parse(request.body ?? {});
  const token = requireToken(request);

  if ((body.protocol === 'tcp' || body.protocol === 'udp') && !(body.destinationPort?.trim())) {
    throw new GatewayError('Destination port is required for TCP and UDP firewall rules.', 409, {
      code: 'SERVICE_FIREWALL_PORT_REQUIRED',
    });
  }

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'firewall-rule-create',
    requestPayload: {
      direction: body.direction,
      action: body.action,
      protocol: body.protocol,
      enabled: body.enabled,
      source: body.source ?? null,
      destination: body.destination ?? null,
      destinationPort: body.destinationPort ?? null,
      sourcePort: body.sourcePort ?? null,
      comment: body.comment ?? null,
    },
    successCode: 'SERVICE_FIREWALL_RULE_CREATED',
    failureCode: 'SERVICE_FIREWALL_RULE_CREATE_FAILED',
    run: async () => {
      const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
      const convoyPayload: Record<string, unknown> = {
        type: body.direction,
        action: body.action,
        proto: body.protocol,
        enable: body.enabled,
      };

      if (body.source?.trim()) convoyPayload.source = body.source.trim();
      if (body.destination?.trim()) convoyPayload.dest = body.destination.trim();
      if (body.destinationPort?.trim()) convoyPayload.dport = body.destinationPort.trim();
      if (body.sourcePort?.trim()) convoyPayload.sport = body.sourcePort.trim();
      if (body.comment?.trim()) convoyPayload.comment = body.comment.trim();

      const convoyResponse = await convoy.createFirewallRule(resolvedServerRef, convoyPayload).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'firewall-rule-create'));
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy firewall rules are temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'firewall-rule-create', error));
        }

        throw error;
      });

      return {
        message: 'Firewall rule created successfully.',
        data: buildFirewallPayload(service, resolvedServerRef, capabilities, convoyResponse).data,
      };
    },
  });
});

app.delete('/api/v1/services/:serviceId/server/firewall/rules/:position', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    position: z.coerce.number().int().min(0),
  }).parse(request.params);
  const token = requireToken(request);

  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'firewall-rule-delete',
    requestPayload: {
      position: params.position,
    },
    successCode: 'SERVICE_FIREWALL_RULE_DELETED',
    failureCode: 'SERVICE_FIREWALL_RULE_DELETE_FAILED',
    run: async () => {
      const { service, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);
      const resolvedServerRef = requireServerRefOrThrow(service, serverRef);
      const convoyResponse = await convoy.deleteFirewallRule(resolvedServerRef, params.position).catch((error) => {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'firewall-rule-delete'));
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy firewall rules are temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'firewall-rule-delete', error));
        }

        throw error;
      });

      return {
        message: 'Firewall rule deleted successfully.',
        data: buildFirewallPayload(service, resolvedServerRef, capabilities, convoyResponse).data,
      };
    },
  });
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
      try {
        await convoy.destroy(resolvedServerRef, query.noPurge);
      } catch (error) {
        if (error instanceof GatewayError && isMissingBackingVmError(error)) {
          const mappingRepair = await clearConvoyRuntimeMappingBestEffort(
            request,
            token,
            params.serviceId,
            resolvedServerRef,
            'destroy-missing-backend-vm',
          );

          if (mappingRepair?.cleared || mappingRepair?.matched) {
            return {
              message: mappingRepair.cleared
                ? 'Backend VM was already absent, so the stale server mapping was cleared.'
                : 'Backend VM was already absent upstream.',
              data: {
                mapping: mappingRepair.payload,
              },
            };
          }

          throw new GatewayError('Service mapping points to a missing backend VM.', 409, buildMissingBackingVmPayload(service, 'destroy'));
        }
        if (error instanceof GatewayError && error.statusCode >= 500) {
          throw new GatewayError('Convoy terminate action is temporarily unavailable.', 503, buildConvoyUpstreamFailurePayload(service, 'destroy', error));
        }
        throw error;
      }

      const mappingRepair = await clearConvoyRuntimeMappingBestEffort(
        request,
        token,
        params.serviceId,
        resolvedServerRef,
        'destroy-submitted',
      );

      return {
        message: mappingRepair?.cleared
          ? 'Server termination requested and stale mapping cleared.'
          : 'Server termination requested successfully.',
        data: {
          mapping: mappingRepair?.payload ?? null,
        },
      };
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

app.post('/api/v1/services/:serviceId/server/reinstall', async (request, reply) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    templateUuid: z.string().min(1).optional(),
    selectedOs: z.string().min(1).optional(),
    selected_os: z.string().min(1).optional(),
    primaryAppSlug: z.string().min(1).nullable().optional(),
    primary_app_slug: z.string().min(1).nullable().optional(),
    addonAppSlugs: z.array(z.string().min(1)).optional(),
    addon_app_slugs: z.array(z.string().min(1)).optional(),
    accountPassword: z.string().min(8).optional(),
    startOnCompletion: z.boolean().optional(),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const passwordError = validateCustomServicePassword(body.accountPassword);
  if (passwordError) {
    return reply.status(422).send({
      message: passwordError,
    });
  }
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
        const selectedOs = (body.selectedOs ?? body.selected_os ?? '').trim();
        const primaryAppSlug = body.primaryAppSlug ?? body.primary_app_slug ?? null;
        const addonAppSlugs = body.addonAppSlugs ?? body.addon_app_slugs ?? [];

        if (selectedOs) {
          await gateway.prepareReinstallServiceApps(token, params.serviceId, {
            selectedOs,
            primaryAppSlug,
            addonAppSlugs,
            previewOnly: true,
          });
        }

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
          let templateUuid = body.templateUuid ?? fallbackTemplateUuid;
          if (selectedOs) {
            const productSlug = service.product?.slug?.trim() ?? '';
            if (!productSlug) {
              throw new GatewayError('Service product is missing, so the selected operating system cannot be resolved.', 409, {
                code: 'SERVICE_PRODUCT_MISSING',
              });
            }

            const product = await gateway.product(productSlug);
            const supportedOs = product.data.vpsAppMarketplace?.supportedOs ?? [];
            const selectedOsOption = supportedOs.find((option) => option.value.trim().toLowerCase() === selectedOs.toLowerCase());

            if (!selectedOsOption?.templateUuid && !selectedOsOption?.templateRef) {
              throw new GatewayError('The selected operating system is not available for reinstall on this product.', 409, {
                code: 'SERVICE_REINSTALL_OS_UNAVAILABLE',
                selectedOs,
              });
            }

            templateUuid = selectedOsOption.templateUuid ?? selectedOsOption.templateRef ?? templateUuid;
          }
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
          if (selectedOs) {
            await gateway.prepareReinstallServiceApps(token, params.serviceId, {
              selectedOs,
              primaryAppSlug,
              addonAppSlugs,
              previewOnly: false,
            });
          }

            return {
              message: 'Server reinstall queued.',
              data: {
                provider: 'convoy',
                selectedOs: selectedOs || null,
                primaryAppSlug,
                addonAppSlugs,
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

app.post('/api/v1/services/:serviceId/server/reveal-password', async (request, reply) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    reset: z.boolean().optional(),
    password: z.string().min(8).optional(),
    autoRestart: z.boolean().optional(),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const passwordError = validateCustomServicePassword(body.password);
  if (passwordError) {
    return reply.status(422).send({
      message: passwordError,
    });
  }
  const token = requireToken(request);
  return executeLoggedAction(request, {
    token,
    serviceId: params.serviceId,
    action: 'reveal-password',
    requestPayload: {
      ...(body.password ? { password: body.password } : {}),
      ...(body.reset !== undefined ? { reset: body.reset } : {}),
      ...(body.autoRestart !== undefined ? { auto_restart: body.autoRestart, autoRestart: body.autoRestart } : {}),
      ...(body.payload ?? {}),
    },
    successCode: 'SERVICE_PASSWORD_RETRIEVED',
    failureCode: 'SERVICE_PASSWORD_RETRIEVE_FAILED',
    run: async () => {
      const { service, buttons, serverRef } = await getServiceWithActions(token, params.serviceId);
      const storedPassword = findServicePropertyValue(service, ['password', 'account_password', 'server_password', 'root_password']);
      const shouldResetPassword = Boolean(body.reset || body.password);

      if (!shouldResetPassword && storedPassword) {
        const storedLoginUsername = findServicePropertyValue(service, ['password_login_username', 'server_username', 'username']);
        const storedApplyMode = findServicePropertyValue(service, ['password_apply_mode']);
        const storedRestartRequired = findServicePropertyValue(service, ['password_restart_required']);
        const storedAppliedLive = findServicePropertyValue(service, ['password_applied_live']);
        const storedNote = findServicePropertyValue(service, ['password_note']);

        return {
          message: 'Stored service password retrieved.',
          data: {
            provider: 'paymenter-property',
            passwordSource: 'stored',
            passwordReset: false,
            password: storedPassword,
            loginUsername: storedLoginUsername,
            passwordApplyMode: storedApplyMode,
            restartRequired: storedRestartRequired ? ['1', 'true', 'yes'].includes(storedRestartRequired.toLowerCase()) : null,
            appliedLive: storedAppliedLive ? ['1', 'true', 'yes'].includes(storedAppliedLive.toLowerCase()) : null,
            note: storedNote,
          },
        };
      }

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
            account_password: requestedPassword,
            password: requestedPassword,
          });
          const password = extractPasswordFromConvoyPayload(response) ?? requestedPassword;
          const appliedLive = extractPasswordResetFlag(response, ['applied_live', 'appliedLive']) ?? false;
          const restartRequired = extractPasswordResetFlag(response, ['restart_required', 'restartRequired']) ?? !appliedLive;
          const loginUsername = extractPasswordResetText(response, ['login_username', 'loginUsername']);
          const passwordApplyMode = extractPasswordResetText(response, ['password_apply_mode', 'passwordApplyMode']);
          const passwordNote = extractPasswordResetText(response, ['note']);

          if (password) {
            await gateway.storeServicePassword(token, params.serviceId, {
              password,
              source: 'runtime-reset',
              username: loginUsername,
              applyMode: passwordApplyMode,
              restartRequired,
              appliedLive,
              note: passwordNote,
            }).catch((error) => {
              request.log.warn({
                serviceId: params.serviceId,
                action: 'store-password',
                error,
              }, 'Password rotation succeeded but storing the password in Paymenter failed.');
            });

            let restartRequested = false;
            let restartAccepted = false;
            let restartMessage: string | null = null;

            if (restartRequired && body.autoRestart) {
              restartRequested = true;

              try {
                await convoy.power(resolvedServerRef, 'restart');
                restartAccepted = true;
                restartMessage = 'Automatic restart command submitted.';
              } catch (restartError) {
                request.log.warn({
                  serviceId: params.serviceId,
                  action: 'reveal-password:auto-restart',
                  restartError,
                }, 'Automatic restart after password reset failed.');

                if (shouldFallbackToActionBridge(restartError)) {
                  const restartActionName = findActionName(buttons, ['restart', 'reboot', 'power-restart']);

                  if (restartActionName) {
                    try {
                      await gateway.serviceAction(token, params.serviceId, restartActionName, { state: 'restart' });
                      restartAccepted = true;
                      restartMessage = 'Automatic restart command submitted via action bridge.';
                    } catch (bridgeError) {
                      request.log.warn({
                        serviceId: params.serviceId,
                        action: 'reveal-password:auto-restart-bridge',
                        bridgeError,
                      }, 'Action bridge restart fallback failed after password reset.');
                    }
                  }
                }

                if (!restartAccepted) {
                  restartMessage = 'Password was reset, but automatic restart was not accepted by upstream.';
                }
              }
            }

            return {
              message: 'Server password has been reset and stored.',
              data: {
                provider: 'convoy',
                passwordSource: extractPasswordFromConvoyPayload(response) ? 'upstream' : 'requested',
                passwordReset: true,
                password,
                appliedLive,
                restartRequired,
                loginUsername,
                passwordApplyMode,
                note: passwordNote,
                restartRequested,
                restartAccepted,
                restartMessage,
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

      if (!shouldResetPassword) {
        throw new GatewayError('Current server password is not readable from the upstream runtime. Reset it to generate and store a new password.', 409, {
          code: 'SERVICE_PASSWORD_UNAVAILABLE',
          actionType: 'reveal-password',
          canReset: true,
        });
      }

      const actionName = findActionName(buttons, ['password', 'reveal', 'show-password']);

      if (!actionName) {
        throw new GatewayError('Reveal password action is not available for this service.', 409, {
          code: 'SERVICE_ACTION_UNSUPPORTED',
          actionType: 'reveal-password',
        });
      }

      const actionPayload = {
        ...(body.payload ?? {}),
        ...(body.password ? { password: body.password, account_password: body.password } : {}),
        ...(body.reset !== undefined ? { reset: body.reset } : {}),
        ...(body.autoRestart !== undefined ? { auto_restart: body.autoRestart, autoRestart: body.autoRestart } : {}),
      };

      const response = await gateway.serviceAction(token, params.serviceId, actionName, actionPayload);
      let restartRequested = false;
      let restartAccepted = false;
      let restartMessage: string | null = null;

      if (body.autoRestart) {
        restartRequested = true;
        const restartActionName = findActionName(buttons, ['restart', 'reboot', 'power-restart']);

        if (restartActionName) {
          try {
            await gateway.serviceAction(token, params.serviceId, restartActionName, { state: 'restart' });
            restartAccepted = true;
            restartMessage = 'Automatic restart command submitted via action bridge.';
          } catch (restartError) {
            request.log.warn({
              serviceId: params.serviceId,
              action: 'reveal-password:auto-restart-fallback',
              restartError,
            }, 'Automatic restart after action-bridge password reset failed.');
          }
        }

        if (!restartAccepted) {
          restartMessage = 'Password reset completed, but automatic restart could not be submitted from action bridge.';
        }
      }

      return {
        ...response,
        data: {
          ...asRecordValue(sanitizeExternalRedirects(response.data)),
          provider: 'paymenter-action',
          action: actionName,
          passwordReset: true,
          restartRequested,
          restartAccepted,
          restartMessage,
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

  const response = await gateway.payInvoice(requireToken(request), params.invoiceId, {
    ...body,
    frontendReturnUrl: resolveFrontendInvoiceReturnTemplate(request) ?? undefined,
  });
  const invoiceRef = response.data.invoice?.number || response.data.invoice?.id || params.invoiceId;

  return {
    ...response,
    data: {
      ...response.data,
      redirectUrl: normalizeInvoicePaymentRedirect(response.data.redirectUrl, request, invoiceRef),
    },
  };
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
