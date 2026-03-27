import { config as loadEnv } from 'dotenv';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createGateway, GatewayError } from './lib/paymenter.js';
import { SessionStore } from './lib/session-store.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: resolve(currentDir, '../.env'),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  PAYMENTER_MODE: z.enum(['mock', 'live']).default('mock'),
  PAYMENTER_API_URL: z.string().url().optional(),
  PAYMENTER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  SESSION_COOKIE_NAME: z.string().min(1).default('sloth_sid'),
  SESSION_COOKIE_SECURE: z.string().optional().default('false'),
});

const env = envSchema.parse(process.env);
const isSecureCookie = env.SESSION_COOKIE_SECURE.toLowerCase() === 'true';

const app = Fastify({
  logger: true,
});

app.log.info({
  paymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
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
  mode: env.PAYMENTER_MODE,
  timeoutMs: env.PAYMENTER_TIMEOUT_MS,
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
