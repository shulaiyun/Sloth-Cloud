import type { Locale } from './content';

const localeCandidates: Record<Locale, string[]> = {
  'zh-CN': ['zh-CN', 'zh_CN', 'zh', 'cn', 'zh-Hans'],
  'zh-TW': ['zh-TW', 'zh_TW', 'zh-HK', 'zh_MO', 'zh-Hant'],
  'en-US': ['en-US', 'en_GB', 'en', 'us'],
  'ja-JP': ['ja-JP', 'ja_JP', 'ja'],
  'ko-KR': ['ko-KR', 'ko_KR', 'ko'],
  'de-DE': ['de-DE', 'de_DE', 'de'],
  'fr-FR': ['fr-FR', 'fr_FR', 'fr'],
  'es-ES': ['es-ES', 'es_ES', 'es'],
  'ru-RU': ['ru-RU', 'ru_RU', 'ru'],
  'pt-BR': ['pt-BR', 'pt_BR', 'pt'],
};

function parseLocalizedRecord(input: string): Record<string, string> | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }

    const data = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        acc[key] = value.trim();
      }
      return acc;
    }, {});

    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}

export function localizeText(raw: string | null | undefined, locale: Locale, fallback = ''): string {
  if (!raw) {
    return fallback;
  }

  const localized = parseLocalizedRecord(raw);
  if (!localized) {
    return raw;
  }

  const keys = [...localeCandidates[locale], 'zh', 'en', 'default'];
  for (const key of keys) {
    const hit = localized[key];
    if (typeof hit === 'string' && hit !== '') {
      return hit;
    }
  }

  return Object.values(localized)[0] ?? fallback;
}
