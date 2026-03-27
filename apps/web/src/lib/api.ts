import { useEffect, useState } from 'react';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

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
}

export interface RemoteState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

function errorMessageFromPayload(payload: unknown, statusCode: number) {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;

    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message;
    }

    if (typeof record.error === 'string' && record.error.length > 0) {
      return record.error;
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

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

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

    setState({
      data: null,
      error: null,
      loading: true,
    });

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

        setState({
          data: null,
          error: error.message,
          loading: false,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [path, options.method]);

  return state;
}
