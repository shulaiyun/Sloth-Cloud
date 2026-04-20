import { apiBaseUrl } from './api';

const operatorApiPathPattern = /^\/api\/v1\/operator(?:\/|$)/i;

function isLocalAliasHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }

  if (
    normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === 'host.docker.internal'
  ) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (match) {
    const secondOctet = Number.parseInt(match[1] ?? '', 10);
    return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

export function normalizeOperatorApiUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!operatorApiPathPattern.test(parsed.pathname)) {
    return parsed.toString();
  }

  try {
    const targetOrigin = new URL(apiBaseUrl).origin;
    if (parsed.origin === targetOrigin || !isLocalAliasHost(parsed.hostname)) {
      return parsed.toString();
    }

    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, `${targetOrigin}/`).toString();
  } catch {
    return parsed.toString();
  }
}
