import { config as loadEnv } from 'dotenv';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createConvoyClient } from './lib/convoy.js';
import { createGateway, GatewayError } from './lib/paymenter.js';
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

const app = Fastify({
  logger: true,
});

app.log.info({
  paymenterMode: effectivePaymenterMode,
  configuredPaymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
  convoyEnabled,
  convoyBaseUrl: env.CONVOY_BASE_URL ?? null,
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

function buildCapabilities(buttons: Array<Record<string, unknown>>, hasServerRef: boolean) {
  const lookup = (aliases: string[]) => findActionName(buttons, aliases) !== null;

  return {
    application: {
      read: hasServerRef && convoyEnabled,
      patch: hasServerRef && convoyEnabled,
      build: hasServerRef && convoyEnabled,
      suspend: hasServerRef && convoyEnabled,
      unsuspend: hasServerRef && convoyEnabled,
      destroy: hasServerRef && convoyEnabled,
    },
    actionBridge: {
      power: lookup(['start', 'stop', 'restart', 'reboot', 'power']),
      reinstall: lookup(['reinstall', 'rebuild', 'reset-os']),
      revealPassword: lookup(['password', 'reveal', 'show-password']),
    },
  };
}

function buildProvisioningPayload(service: ServiceDetail) {
  return service.provisioning
    ? {
      status: service.provisioning.status,
      provider: service.provisioning.provider,
      attemptCount: service.provisioning.attemptCount,
      errorMessage: service.provisioning.errorMessage,
      lastAttemptAt: service.provisioning.lastAttemptAt,
      completedAt: service.provisioning.completedAt,
    }
    : null;
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

app.get('/api/v1/health', async () => gateway.health());

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
  return gateway.retryServiceProvisioning(requireToken(request), params.serviceId);
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

  return gateway.cancelService(requireToken(request), params.serviceId, body);
});

app.post('/api/v1/services/:serviceId/actions/:action', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
    action: z.string().min(1),
  }).parse(request.params);
  const body = z.record(z.unknown()).parse(request.body ?? {});

  return gateway.serviceAction(requireToken(request), params.serviceId, params.action, body);
});

app.get('/api/v1/services/:serviceId/server', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, buttons, serverRef, capabilities } = await getServiceWithActions(token, params.serviceId);

  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  const convoyResponse = await convoy.getServer(resolvedServerRef);

  return {
    data: {
      service,
      mapping: {
        serverRef: resolvedServerRef,
        expectedKeys: convoyRefKeys,
      },
      capabilities,
      actions: {
        buttons,
      },
      convoy: convoyResponse.data ?? {},
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

  return {
    data: {
      mapped: serverRef !== null,
      serverRef,
      provisioning: buildProvisioningPayload(service),
      expectedKeys: convoyRefKeys,
      capabilities,
      actions: {
        buttons,
      },
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
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  await convoy.suspend(resolvedServerRef);
  return { message: 'Server suspended successfully.' };
});

app.post('/api/v1/services/:serviceId/server/unsuspend', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  await convoy.unsuspend(resolvedServerRef);
  return { message: 'Server unsuspended successfully.' };
});

app.delete('/api/v1/services/:serviceId/server', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const query = z.object({
    noPurge: z.coerce.boolean().optional().default(false),
  }).parse(request.query ?? {});
  const token = requireToken(request);
  const { service, serverRef } = await getServiceWithActions(token, params.serviceId);
  const resolvedServerRef = requireServerRefOrThrow(service, serverRef);

  await convoy.destroy(resolvedServerRef, query.noPurge);
  return { message: 'Server termination requested successfully.' };
});

app.post('/api/v1/services/:serviceId/server/power', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    state: z.enum(['start', 'stop', 'restart', 'shutdown']),
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const { buttons } = await getServiceWithActions(token, params.serviceId);
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

  return gateway.serviceAction(token, params.serviceId, actionName, {
    state: body.state,
    ...(body.payload ?? {}),
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
  const { buttons } = await getServiceWithActions(token, params.serviceId);
  const actionName = findActionName(buttons, ['reinstall', 'rebuild', 'reset-os', 'os-reinstall']);

  if (!actionName) {
    throw new GatewayError('Reinstall action is not available for this service.', 409, {
      code: 'SERVICE_ACTION_UNSUPPORTED',
      actionType: 'reinstall',
    });
  }

  return gateway.serviceAction(token, params.serviceId, actionName, {
    ...(body.payload ?? {}),
    ...(body.templateUuid ? { template_uuid: body.templateUuid } : {}),
    ...(body.accountPassword ? { account_password: body.accountPassword } : {}),
    ...(body.startOnCompletion !== undefined ? { start_on_completion: body.startOnCompletion } : {}),
  });
});

app.post('/api/v1/services/:serviceId/server/reveal-password', async (request) => {
  const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
  const body = z.object({
    payload: z.record(z.unknown()).optional(),
  }).parse(request.body ?? {});
  const token = requireToken(request);
  const { buttons } = await getServiceWithActions(token, params.serviceId);
  const actionName = findActionName(buttons, ['password', 'reveal', 'show-password']);

  if (!actionName) {
    throw new GatewayError('Reveal password action is not available for this service.', 409, {
      code: 'SERVICE_ACTION_UNSUPPORTED',
      actionType: 'reveal-password',
    });
  }

  return gateway.serviceAction(token, params.serviceId, actionName, body.payload ?? {});
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
