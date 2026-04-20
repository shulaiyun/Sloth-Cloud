type CloudflareMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class CloudflareApiError extends Error {
  statusCode: number;

  details: unknown;

  constructor(message: string, statusCode: number, details: unknown) {
    super(message);
    this.name = 'CloudflareApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface CloudflareClientOptions {
  apiToken: string;
  accountId?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface CloudflareDnsRecordResult {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

interface CloudflareListResponse<T> {
  success: boolean;
  result: T[];
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
}

interface CloudflareSingleResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
}

function trim(value: string | null | undefined) {
  return (value ?? '').trim();
}

function cloudflareErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== 'object' || payload === null) {
    return fallback;
  }

  const firstError = Array.isArray((payload as { errors?: unknown }).errors)
    ? (payload as { errors?: Array<{ message?: unknown }> }).errors?.find((entry) => typeof entry?.message === 'string')
    : null;

  if (typeof firstError?.message === 'string' && firstError.message.trim() !== '') {
    return firstError.message.trim();
  }

  if (typeof (payload as { message?: unknown }).message === 'string') {
    return (payload as { message: string }).message.trim() || fallback;
  }

  return fallback;
}

export function createCloudflareClient(options: CloudflareClientOptions) {
  const apiToken = trim(options.apiToken);
  if (!apiToken) {
    return null;
  }

  const accountId = trim(options.accountId);
  const baseUrl = trim(options.baseUrl) || 'https://api.cloudflare.com/client/v4';
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function request<T>(method: CloudflareMethod, path: string, input: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {}): Promise<T> {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      const success = Boolean((payload as { success?: unknown }).success);
      if (!response.ok || !success) {
        throw new CloudflareApiError(
          cloudflareErrorMessage(payload, `Cloudflare API ${method} ${path} failed`),
          response.status,
          payload,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new CloudflareApiError(`Cloudflare API timeout after ${timeoutMs}ms`, 504, null);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveZone(input: { zoneId?: string | null; zoneName?: string | null }) {
    const zoneId = trim(input.zoneId);
    if (zoneId) {
      const zonePayload = await request<CloudflareSingleResponse<{ id: string; name: string }>>('GET', `/zones/${encodeURIComponent(zoneId)}`);
      return {
        id: zonePayload.result.id,
        name: zonePayload.result.name,
      };
    }

    const zoneName = trim(input.zoneName);
    if (!zoneName) {
      return null;
    }

    const payload = await request<CloudflareListResponse<{ id: string; name: string }>>('GET', '/zones', {
      query: {
        name: zoneName,
        status: 'active',
        per_page: 20,
      },
    });

    const matched = payload.result.find((entry) => trim(entry.name).toLowerCase() === zoneName.toLowerCase())
      ?? payload.result[0]
      ?? null;
    if (!matched) {
      return null;
    }

    return {
      id: matched.id,
      name: matched.name,
    };
  }

  async function upsertDnsRecord(input: {
    zoneId: string;
    name: string;
    content: string;
    type?: string | null;
    proxied?: boolean;
    ttl?: number;
  }): Promise<CloudflareDnsRecordResult> {
    const type = trim(input.type).toUpperCase() || 'CNAME';
    const name = trim(input.name).toLowerCase();
    const content = trim(input.content);
    const ttl = input.ttl && Number.isFinite(input.ttl) ? Math.max(1, Math.floor(input.ttl)) : 1;
    const proxied = input.proxied ?? true;

    const existingPayload = await request<CloudflareListResponse<CloudflareDnsRecordResult>>(
      'GET',
      `/zones/${encodeURIComponent(input.zoneId)}/dns_records`,
      {
        query: {
          type,
          name,
          per_page: 100,
        },
      },
    );
    const existing = existingPayload.result.find((record) => record.name.toLowerCase() === name)
      ?? null;

    if (existing) {
      const updated = await request<CloudflareSingleResponse<CloudflareDnsRecordResult>>(
        'PATCH',
        `/zones/${encodeURIComponent(input.zoneId)}/dns_records/${encodeURIComponent(existing.id)}`,
        {
          body: {
            type,
            name,
            content,
            ttl,
            proxied,
          },
        },
      );
      return updated.result;
    }

    const created = await request<CloudflareSingleResponse<CloudflareDnsRecordResult>>(
      'POST',
      `/zones/${encodeURIComponent(input.zoneId)}/dns_records`,
      {
        body: {
          type,
          name,
          content,
          ttl,
          proxied,
        },
      },
    );
    return created.result;
  }

  async function ensureTunnelHostname(input: {
    tunnelId: string;
    hostname: string;
    service: string;
  }) {
    if (!accountId) {
      throw new CloudflareApiError('Cloudflare accountId is required for tunnel configuration.', 400, null);
    }

    const tunnelId = trim(input.tunnelId);
    const hostname = trim(input.hostname).toLowerCase();
    const service = trim(input.service);
    if (!tunnelId || !hostname || !service) {
      throw new CloudflareApiError('Tunnel id, hostname, and service are required.', 400, null);
    }

    const getPayload = await request<CloudflareSingleResponse<{
      config?: {
        ingress?: Array<Record<string, unknown>>;
      };
    }>>(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/configurations`,
    );

    const currentConfig = getPayload.result?.config ?? {};
    const ingressRules = Array.isArray(currentConfig.ingress) ? [...currentConfig.ingress] : [];
    const filtered = ingressRules.filter((rule) => {
      const ruleHost = trim(typeof rule.hostname === 'string' ? rule.hostname : '');
      return ruleHost.toLowerCase() !== hostname;
    });
    const fallbackRule = filtered.find((rule) => trim(typeof rule.service === 'string' ? rule.service : '').startsWith('http_status:'));
    const baseRules = filtered.filter((rule) => rule !== fallbackRule);
    const wildcardIndex = baseRules.findIndex((rule) => trim(typeof rule.hostname === 'string' ? rule.hostname : '').includes('*'));
    const exactRule = { hostname, service };
    const nextIngress = wildcardIndex >= 0
      ? [
          ...baseRules.slice(0, wildcardIndex),
          exactRule,
          ...baseRules.slice(wildcardIndex),
          fallbackRule ?? { service: 'http_status:404' },
        ]
      : [
          ...baseRules,
          exactRule,
          fallbackRule ?? { service: 'http_status:404' },
        ];

    const putPayload = await request<CloudflareSingleResponse<{
      config?: {
        ingress?: Array<Record<string, unknown>>;
      };
      source?: string;
      version?: number;
      tunnel_id?: string;
    }>>(
      'PUT',
      `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/configurations`,
      {
        body: {
          config: {
            ...currentConfig,
            ingress: nextIngress,
          },
        },
      },
    );

    return {
      tunnelId,
      source: putPayload.result?.source ?? null,
      version: putPayload.result?.version ?? null,
      ingressRules: Array.isArray(putPayload.result?.config?.ingress)
        ? putPayload.result.config.ingress.length
        : nextIngress.length,
    };
  }

  async function createHealthCheck(input: {
    zoneId: string;
    name: string;
    targetUrl: string;
    interval?: number;
    timeout?: number;
  }) {
    const target = new URL(input.targetUrl);
    const protocol = target.protocol.toLowerCase() === 'https:' ? 'HTTPS' : 'HTTP';
    const path = `${target.pathname || '/'}${target.search || ''}`;

    const payload = await request<CloudflareSingleResponse<{ id: string; name: string; status?: string }>>(
      'POST',
      `/zones/${encodeURIComponent(input.zoneId)}/healthchecks`,
      {
        body: {
          name: trim(input.name).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'sloth-health-check',
          address: target.hostname,
          type: protocol,
          interval: input.interval ?? 60,
          timeout: input.timeout ?? 5,
          retries: 2,
          consecutive_fails: 2,
          consecutive_successes: 1,
          http_config: {
            method: 'GET',
            path,
            follow_redirects: true,
            expected_codes: ['2xx', '3xx'],
            header: {
              Host: [target.hostname],
            },
          },
        },
      },
    );

    return payload.result;
  }

  async function createAlertWebhookDestination(input: {
    name: string;
    url: string;
    secret?: string | null;
  }) {
    if (!accountId) {
      throw new CloudflareApiError('Cloudflare accountId is required for alert destinations.', 400, null);
    }

    const payload = await request<CloudflareSingleResponse<{ id: string; name: string; url: string }>>(
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/alerting/v3/destinations/webhooks`,
      {
        body: {
          name: trim(input.name).slice(0, 120) || 'sloth-operator-webhook',
          url: trim(input.url),
          ...(trim(input.secret) ? { secret: trim(input.secret) } : {}),
        },
      },
    );

    return payload.result;
  }

  async function createHealthAlertPolicy(input: {
    name: string;
    healthCheckId: string;
    emailRecipients?: string[];
    webhookIds?: string[];
  }) {
    if (!accountId) {
      throw new CloudflareApiError('Cloudflare accountId is required for alert policies.', 400, null);
    }

    const emailRecipients = (input.emailRecipients ?? [])
      .map((entry) => trim(entry))
      .filter((entry) => entry.length > 0);
    const webhookIds = (input.webhookIds ?? [])
      .map((entry) => trim(entry))
      .filter((entry) => entry.length > 0);

    const mechanisms = {
      ...(emailRecipients.length > 0
        ? {
            email: emailRecipients.map((address) => ({ id: address })),
          }
        : {}),
      ...(webhookIds.length > 0
        ? {
            webhooks: webhookIds.map((id) => ({ id })),
          }
        : {}),
    };

    if (Object.keys(mechanisms).length === 0) {
      throw new CloudflareApiError('At least one alert mechanism (email or webhook) is required.', 400, null);
    }

    const payload = await request<CloudflareSingleResponse<{ id: string; name: string }>>(
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/alerting/v3/policies`,
      {
        body: {
          name: trim(input.name).slice(0, 120) || 'sloth-health-policy',
          alert_type: 'health_check_status_notification',
          enabled: true,
          mechanisms,
          filters: {
            health_check_id: [trim(input.healthCheckId)],
          },
        },
      },
    );

    return payload.result;
  }

  return {
    accountId: accountId || null,
    resolveZone,
    upsertDnsRecord,
    ensureTunnelHostname,
    createHealthCheck,
    createAlertWebhookDestination,
    createHealthAlertPolicy,
  };
}
