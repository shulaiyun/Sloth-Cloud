import { GatewayError } from './paymenter.js';

export interface ConvoyConfig {
  enabled: boolean;
  mode: 'mock' | 'live';
  baseUrl?: string;
  applicationKey?: string;
  timeoutMs: number;
  applicationPrefix: string;
}

type PowerState = 'start' | 'kill' | 'restart' | 'shutdown';
type ConsoleType = 'novnc' | 'xtermjs';

function normalizeBaseUrl(baseUrl: string, applicationPrefix: string) {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPrefix = applicationPrefix.startsWith('/')
    ? applicationPrefix
    : `/${applicationPrefix}`;

  if (trimmedBase.endsWith(normalizedPrefix)) {
    return trimmedBase;
  }

  return `${trimmedBase}${normalizedPrefix}`;
}

async function requestConvoy<T>(
  config: ConvoyConfig,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {},
) {
  if (!config.enabled) {
    throw new GatewayError('Convoy integration is disabled.', 503, {
      code: 'CONVOY_DISABLED',
    });
  }

  if (!config.baseUrl) {
    throw new GatewayError('CONVOY_BASE_URL is missing.', 500, {
      code: 'CONVOY_BASE_URL_MISSING',
    });
  }

  if (!config.applicationKey) {
    throw new GatewayError('CONVOY_APPLICATION_KEY is missing.', 500, {
      code: 'CONVOY_APPLICATION_KEY_MISSING',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const baseUrl = normalizeBaseUrl(config.baseUrl, config.applicationPrefix);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.applicationKey}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const payloadRecord = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
      const code = typeof payloadRecord.code === 'string'
        ? payloadRecord.code
        : (typeof payloadRecord.error_code === 'string' ? payloadRecord.error_code : 'CONVOY_UPSTREAM_ERROR');
      const detail = typeof payloadRecord.detail === 'string'
        ? payloadRecord.detail
        : (typeof payloadRecord.message === 'string' ? payloadRecord.message : null);
      const message = typeof payloadRecord.message === 'string' && payloadRecord.message.trim() !== ''
        ? payloadRecord.message.trim()
        : `Convoy request failed with status ${response.status}.`;

      throw new GatewayError(message, response.status, {
        code,
        detail,
        status: response.status,
        upstream: payload,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new GatewayError('Convoy request timed out.', 504, {
        code: 'CONVOY_TIMEOUT',
      });
    }

    throw new GatewayError('Convoy upstream is temporarily unavailable.', 502, {
      code: 'CONVOY_UPSTREAM_ERROR',
    });
  } finally {
    clearTimeout(timer);
  }
}

export function createConvoyClient(config: ConvoyConfig) {
  return {
    getServer(serverRef: string) {
      return requestConvoy<{ data: Record<string, unknown> }>(config, `/servers/${encodeURIComponent(serverRef)}`);
    },
    getServerState(serverRef: string) {
      return requestConvoy<{ data: Record<string, unknown> }>(config, `/servers/${encodeURIComponent(serverRef)}/state`);
    },
    getServerMetrics(serverRef: string) {
      return requestConvoy<{ data: Record<string, unknown> }>(config, `/servers/${encodeURIComponent(serverRef)}/metrics`);
    },
    getNodeTemplateGroups(nodeRef: string | number) {
      return requestConvoy<{ data: Array<Record<string, unknown>> }>(
        config,
        `/nodes/${encodeURIComponent(String(nodeRef))}/template-groups`,
      );
    },
    patchServer(serverRef: string, body: Record<string, unknown>) {
      return requestConvoy<{ data: Record<string, unknown> }>(config, `/servers/${encodeURIComponent(serverRef)}`, {
        method: 'PATCH',
        body,
      });
    },
    patchBuild(serverRef: string, body: Record<string, unknown>) {
      return requestConvoy<{ data: Record<string, unknown> }>(
        config,
        `/servers/${encodeURIComponent(serverRef)}/settings/build`,
        {
          method: 'PATCH',
          body,
        },
      );
    },
    suspend(serverRef: string) {
      return requestConvoy<unknown>(config, `/servers/${encodeURIComponent(serverRef)}/settings/suspend`, {
        method: 'POST',
        body: {},
      });
    },
    unsuspend(serverRef: string) {
      return requestConvoy<unknown>(config, `/servers/${encodeURIComponent(serverRef)}/settings/unsuspend`, {
        method: 'POST',
        body: {},
      });
    },
    destroy(serverRef: string, noPurge = false) {
      return requestConvoy<unknown>(
        config,
        `/servers/${encodeURIComponent(serverRef)}?no_purge=${noPurge ? '1' : '0'}`,
        {
          method: 'DELETE',
        },
      );
    },
    power(serverRef: string, state: PowerState) {
      return requestConvoy<{ data?: Record<string, unknown> }>(
        config,
        `/servers/${encodeURIComponent(serverRef)}/power`,
        {
          method: 'POST',
          body: {
            state,
          },
        },
      );
    },
    createConsoleSession(serverRef: string, type: ConsoleType = 'novnc') {
      return requestConvoy<{ data?: Record<string, unknown> }>(
        config,
        `/servers/${encodeURIComponent(serverRef)}/console`,
        {
          method: 'POST',
          body: {
            type,
          },
        },
      );
    },
    reinstall(serverRef: string, body: Record<string, unknown>) {
      return requestConvoy<{ data?: Record<string, unknown> }>(
        config,
        `/servers/${encodeURIComponent(serverRef)}/settings/reinstall`,
        {
          method: 'POST',
          body,
        },
      );
    },
    rotatePassword(serverRef: string, body: Record<string, unknown> = {}) {
      return requestConvoy<{ data?: Record<string, unknown> }>(
        config,
        `/servers/${encodeURIComponent(serverRef)}/settings/password`,
        {
          method: 'POST',
          body,
        },
      );
    },
  };
}
