export function normalizeOperatorApiUrl(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^(about:blank|javascript:|data:|#)/i.test(trimmed)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    if (typeof window !== 'undefined' && window.location?.protocol) {
      return `${window.location.protocol}${trimmed}`;
    }
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${trimmed}`;
    }
    return trimmed;
  }

  if (/^[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}
