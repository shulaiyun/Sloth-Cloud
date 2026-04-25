function localeCandidates(locale: string) {
  const normalized = (locale || 'en-US').trim();
  const language = normalized.split('-')[0] || 'en';
  return [normalized, language];
}

function parseStructuredString(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function valueFromLocalizedRecord(record: Record<string, unknown>, locale: string) {
  for (const key of localeCandidates(locale)) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  const fallbacks = ['default', 'zh-CN', 'zh', 'en-US', 'en', 'name', 'label', 'value', 'text'];
  for (const key of fallbacks) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

export function localizeText(input: unknown, locale: string, fallback = ''): string {
  if (typeof input === 'string') {
    const parsed = parseStructuredString(input);
    if (parsed !== null) {
      const localized = localizeText(parsed, locale, '');
      if (localized.trim() !== '') {
        return localized;
      }
    }
    return input;
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input);
  }

  if (Array.isArray(input)) {
    const values = input
      .map((item) => localizeText(item, locale, ''))
      .filter((item) => item.trim() !== '');
    return values.length > 0 ? values.join(' / ') : fallback;
  }

  if (input && typeof input === 'object') {
    const value = valueFromLocalizedRecord(input as Record<string, unknown>, locale);
    if (value) {
      return value;
    }
  }

  return fallback;
}
