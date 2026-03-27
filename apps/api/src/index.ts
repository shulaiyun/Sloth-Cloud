import { config as loadEnv } from 'dotenv';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createGateway } from './lib/paymenter.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: resolve(currentDir, '../.env'),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  PAYMENTER_MODE: z.enum(['mock', 'live']).default('mock'),
  PAYMENTER_API_URL: z.string().url().optional(),
  PAYMENTER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

const env = envSchema.parse(process.env);

const app = Fastify({
  logger: true,
});

app.log.info({
  paymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
}, 'Sloth Cloud API environment loaded');

await app.register(cors, {
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'OPTIONS'],
});

const gateway = createGateway({
  apiUrl: env.PAYMENTER_API_URL,
  mode: env.PAYMENTER_MODE,
  timeoutMs: env.PAYMENTER_TIMEOUT_MS,
});

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

app.post('/api/v1/auth/login', async (request) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    code: z.string().trim().min(6).max(8).optional(),
    deviceName: z.string().trim().min(1).max(255).optional(),
  }).parse(request.body);

  return gateway.login(body);
});

app.post('/api/v1/auth/register', async (request) => {
  const body = z.object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    email: z.string().email(),
    password: z.string().min(8),
    passwordConfirmation: z.string().min(8),
    deviceName: z.string().trim().min(1).max(255).optional(),
  }).parse(request.body);

  return gateway.register(body);
});

app.get('/api/v1/auth/me', async (request) => {
  const headers = z.object({
    authorization: z.string().optional(),
  }).parse(request.headers);
  const token = headers.authorization?.replace(/^Bearer\s+/i, '');

  return gateway.me(token);
});

app.post('/api/v1/auth/logout', async (request) => {
  const headers = z.object({
    authorization: z.string().optional(),
  }).parse(request.headers);
  const token = headers.authorization?.replace(/^Bearer\s+/i, '');

  return gateway.logout(token);
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
