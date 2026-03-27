import { useEffect, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export interface RemoteState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function useApiData<T>(path: string | null): RemoteState<T> {
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

    fetchJson<T>(path)
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
  }, [path]);

  return state;
}

