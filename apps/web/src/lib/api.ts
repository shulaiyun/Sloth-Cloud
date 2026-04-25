import { useEffect, useState } from 'react';

export function resolveApiBaseUrl(rawBaseUrl?: string | null) {
  return String(rawBaseUrl ?? '').trim().replace(/\/+$/, '');
}

export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function buildApiUrl(path: string, baseUrl = apiBaseUrl) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = resolveApiBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

export class ApiError extends Error {
  statusCode: number;
  payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export interface ApiRequestOptions {
  body?: unknown;
  headers?: HeadersInit;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  preserveData?: boolean;
  preserveDataOnError?: boolean;
  timeoutMs?: number;
}

export interface RemoteState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

function sanitizeBackendMessage(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (compact === '') {
    return '';
  }

  const lower = compact.toLowerCase();
  if (
    lower.includes('/var/www/html/storage/logs')
    || lower.includes('failed to open stream')
    || lower.includes('permission denied')
    || lower.includes('laravel-20')
    || (lower.includes('context:') && lower.includes('exception'))
  ) {
    return 'Service temporarily unavailable. Please try again later.';
  }

  if (
    lower.includes('curl error')
    || lower.includes('failed to connect')
    || lower.includes('connection refused')
    || lower.includes('could not resolve host')
  ) {
    return 'Upstream infrastructure service is temporarily unavailable.';
  }

  return compact.length > 280 ? `${compact.slice(0, 280)}...` : compact;
}

function errorMessageFromPayload(payload: unknown, statusCode: number) {
  if (typeof payload === 'string' && payload.length > 0) {
    return sanitizeBackendMessage(payload);
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;

    if (typeof record.message === 'string' && record.message.length > 0) {
      return sanitizeBackendMessage(record.message);
    }

    if (typeof record.error === 'string' && record.error.length > 0) {
      return sanitizeBackendMessage(record.error);
    }

    if (typeof record.errors === 'object' && record.errors !== null) {
      const firstEntry = Object.values(record.errors as Record<string, unknown>)[0];
      if (Array.isArray(firstEntry) && typeof firstEntry[0] === 'string') {
        return firstEntry[0];
      }
    }
  }

  return `HTTP ${statusCode}`;
}

export async function requestJson<T>(path: string, options: ApiRequestOptions = {}) {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (typeof window !== 'undefined' && window.location?.origin) {
    headers.set('X-Sloth-Origin', window.location.origin);
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
    ? Math.round(Number(options.timeoutMs))
    : null;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutHandle = timeoutMs
    ? globalThis.setTimeout(() => controller?.abort(), timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError' && timeoutMs) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutHandle !== null) {
      globalThis.clearTimeout(timeoutHandle);
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(errorMessageFromPayload(payload, response.status), response.status, payload);
  }

  return payload as T;
}

export function useApiData<T>(path: string | null, options: ApiRequestOptions = {}): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let isCurrent = true;

    if (!path) {
      setState({
        data: null,
        error: null,
        loading: false,
      });
      return;
    }

    setState((current) => ({
      data: options.preserveData ? current.data : null,
      error: null,
      loading: options.preserveData ? current.data === null : true,
    }));

    requestJson<T>(path, options)
      .then((data) => {
        if (!isCurrent) {
          return;
        }

        setState({
          data,
          error: null,
          loading: false,
        });
      })
      .catch((error: Error) => {
        if (!isCurrent) {
          return;
        }

        setState((current) => ({
          data: options.preserveData && options.preserveDataOnError !== false ? current.data : null,
          error: error.message,
          loading: false,
        }));
      });

    return () => {
      isCurrent = false;
    };
  }, [path, options.method, options.preserveData, options.preserveDataOnError]);

  return state;
}
