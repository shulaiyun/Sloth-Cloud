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
  PAYMENTER_TOKEN: z.string().optional(),
  PAYMENTER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

const env = envSchema.parse(process.env);

const app = Fastify({
  logger: true,
});

app.log.info({
  paymenterMode: env.PAYMENTER_MODE,
  paymenterApiUrl: env.PAYMENTER_API_URL ?? null,
  paymenterTokenDefined: Boolean(env.PAYMENTER_TOKEN),
}, 'Sloth Cloud API environment loaded');

await app.register(cors, {
  origin: true,
});

const gateway = createGateway({
  apiUrl: env.PAYMENTER_API_URL,
  mode: env.PAYMENTER_MODE,
  timeoutMs: env.PAYMENTER_TIMEOUT_MS,
  token: env.PAYMENTER_TOKEN,
});

app.get('/api/v1/health', async () => gateway.health());

app.get('/api/v1/catalog/home', async () => gateway.home());

app.get('/api/v1/catalog/categories', async () => gateway.catalog());

app.get('/api/v1/catalog/categories/:categorySlug', async (request) => {
  const params = z.object({
    categorySlug: z.string().min(1),
  }).parse(request.params);

  return gateway.category(params.categorySlug);
});

app.get('/api/v1/catalog/products/:productSlug', async (request) => {
  const params = z.object({
    productSlug: z.string().min(1),
  }).parse(request.params);

  return gateway.product(params.productSlug);
});

app.get('/api/v1/client/services/:serviceId', async (request) => {
  const params = z.object({
    serviceId: z.string().min(1),
  }).parse(request.params);

  return gateway.service(params.serviceId);
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode ?? 500)
    : 500;
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
