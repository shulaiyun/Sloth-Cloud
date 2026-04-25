type CountryMeta = {
  countryCode: string;
  name: string;
  nameZh: string;
  nameEn: string;
};

type VisualTone = 'teal' | 'blue' | 'violet' | 'amber' | 'emerald' | 'slate';

export type VisualMeta = {
  family: string;
  glyph: string;
  src: string | null;
  tone: VisualTone;
};

const countryMap: Record<string, CountryMeta> = {
  CN: { countryCode: 'CN', name: 'China', nameZh: '中国', nameEn: 'China' },
  US: { countryCode: 'US', name: 'United States', nameZh: '美国', nameEn: 'United States' },
  JP: { countryCode: 'JP', name: 'Japan', nameZh: '日本', nameEn: 'Japan' },
  SG: { countryCode: 'SG', name: 'Singapore', nameZh: '新加坡', nameEn: 'Singapore' },
  DE: { countryCode: 'DE', name: 'Germany', nameZh: '德国', nameEn: 'Germany' },
  NL: { countryCode: 'NL', name: 'Netherlands', nameZh: '荷兰', nameEn: 'Netherlands' },
  GB: { countryCode: 'GB', name: 'United Kingdom', nameZh: '英国', nameEn: 'United Kingdom' },
  HK: { countryCode: 'HK', name: 'Hong Kong', nameZh: '香港', nameEn: 'Hong Kong' },
  FR: { countryCode: 'FR', name: 'France', nameZh: '法国', nameEn: 'France' },
  KR: { countryCode: 'KR', name: 'South Korea', nameZh: '韩国', nameEn: 'South Korea' },
  CA: { countryCode: 'CA', name: 'Canada', nameZh: '加拿大', nameEn: 'Canada' },
  AU: { countryCode: 'AU', name: 'Australia', nameZh: '澳大利亚', nameEn: 'Australia' },
};

const countryHints: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bCN\b|中国|大陆|china/i, code: 'CN' },
  { pattern: /\bUS\b|美国|usa|united states/i, code: 'US' },
  { pattern: /\bJP\b|日本|japan/i, code: 'JP' },
  { pattern: /\bSG\b|新加坡|singapore/i, code: 'SG' },
  { pattern: /\bDE\b|德国|germany|deutschland/i, code: 'DE' },
  { pattern: /\bNL\b|荷兰|netherlands/i, code: 'NL' },
  { pattern: /\bGB\b|英国|uk|united kingdom/i, code: 'GB' },
  { pattern: /\bHK\b|香港|hong kong/i, code: 'HK' },
  { pattern: /\bFR\b|法国|france/i, code: 'FR' },
  { pattern: /\bKR\b|韩国|korea/i, code: 'KR' },
  { pattern: /\bCA\b|加拿大|canada/i, code: 'CA' },
  { pattern: /\bAU\b|澳大利亚|australia/i, code: 'AU' },
];

function normalizeCountryCode(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function valueText(input: unknown) {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input);
  }
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const candidateKeys = ['label', 'name', 'value', 'slug', 'description', 'icon', 'family', 'countryCode'];
    for (const key of candidateKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim() !== '') {
        return value;
      }
    }
  }
  return '';
}

function normalizeText(input: unknown) {
  return valueText(input).trim().toLowerCase();
}

function parseVisualTone(input: string): VisualTone {
  if (input.includes('purple') || input.includes('violet')) return 'violet';
  if (input.includes('green') || input.includes('ubuntu') || input.includes('linux')) return 'emerald';
  if (input.includes('orange') || input.includes('debian') || input.includes('centos')) return 'amber';
  if (input.includes('blue') || input.includes('windows') || input.includes('azure')) return 'blue';
  return 'teal';
}

export function getCountryMeta(countryCode: string | null | undefined) {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) {
    return null;
  }
  return countryMap[normalized] ?? null;
}

export function getCountryName(countryCode: string | null | undefined, locale: string) {
  const country = getCountryMeta(countryCode);
  if (!country) {
    return '';
  }
  return locale.toLowerCase().startsWith('zh') ? country.nameZh : country.nameEn;
}

export function inferCountryCode(...parts: Array<unknown>) {
  const values = parts
    .map((part) => valueText(part))
    .filter((part) => part.trim() !== '')
    .join(' ');

  if (values.trim() === '') {
    return null;
  }

  const explicit = values.match(/\b([A-Z]{2})\b/);
  if (explicit) {
    const code = explicit[1];
    if (countryMap[code]) {
      return code;
    }
  }

  for (const hint of countryHints) {
    if (hint.pattern.test(values)) {
      return hint.code;
    }
  }

  return null;
}

export function getOsVisual(input: unknown): VisualMeta {
  const normalized = normalizeText(input);

  if (normalized.includes('windows')) {
    return { family: 'Windows', glyph: 'WIN', src: null, tone: 'blue' };
  }
  if (normalized.includes('ubuntu')) {
    return { family: 'Ubuntu', glyph: 'UB', src: null, tone: 'amber' };
  }
  if (normalized.includes('debian')) {
    return { family: 'Debian', glyph: 'DE', src: null, tone: 'violet' };
  }
  if (normalized.includes('alpine')) {
    return { family: 'Alpine', glyph: 'ALP', src: null, tone: 'teal' };
  }
  if (normalized.includes('alma')) {
    return { family: 'AlmaLinux', glyph: 'AL', src: null, tone: 'emerald' };
  }
  if (normalized.includes('rocky')) {
    return { family: 'RockyLinux', glyph: 'RL', src: null, tone: 'emerald' };
  }
  if (normalized.includes('centos')) {
    return { family: 'CentOS', glyph: 'CE', src: null, tone: 'amber' };
  }

  const tone = parseVisualTone(normalized);
  return { family: 'Linux', glyph: 'LX', src: null, tone };
}

export function getAppVisual(input: unknown): VisualMeta {
  const normalized = normalizeText(input);

  if (normalized.includes('1panel')) return { family: '1Panel', glyph: '1P', src: null, tone: 'emerald' };
  if (normalized.includes('aapanel') || normalized.includes('宝塔')) return { family: 'aaPanel', glyph: 'AA', src: null, tone: 'emerald' };
  if (normalized.includes('portainer')) return { family: 'Portainer', glyph: 'PT', src: null, tone: 'blue' };
  if (normalized.includes('coolify')) return { family: 'Coolify', glyph: 'CF', src: null, tone: 'blue' };
  if (normalized.includes('casaos')) return { family: 'CasaOS', glyph: 'CS', src: null, tone: 'teal' };
  if (normalized.includes('wordpress')) return { family: 'WordPress', glyph: 'WP', src: null, tone: 'blue' };
  if (normalized.includes('mysql')) return { family: 'MySQL', glyph: 'MY', src: null, tone: 'teal' };
  if (normalized.includes('postgres')) return { family: 'PostgreSQL', glyph: 'PG', src: null, tone: 'blue' };
  if (normalized.includes('redis')) return { family: 'Redis', glyph: 'RD', src: null, tone: 'amber' };
  if (normalized.includes('nginx')) return { family: 'Nginx', glyph: 'NX', src: null, tone: 'emerald' };
  if (normalized.includes('openresty')) return { family: 'OpenResty', glyph: 'OR', src: null, tone: 'emerald' };
  if (normalized.includes('caddy')) return { family: 'Caddy', glyph: 'CD', src: null, tone: 'teal' };
  if (normalized.includes('docker')) return { family: 'Docker', glyph: 'DK', src: null, tone: 'blue' };
  if (normalized.includes('uptime')) return { family: 'Uptime Kuma', glyph: 'UK', src: null, tone: 'emerald' };
  if (normalized.includes('gitlab')) return { family: 'GitLab', glyph: 'GL', src: null, tone: 'amber' };
  if (normalized.includes('gitea') || normalized.includes('github')) return { family: 'Git', glyph: 'GT', src: null, tone: 'slate' };

  return { family: 'Application', glyph: 'AP', src: null, tone: 'teal' };
}

function matchField(field: unknown, keywords: string[]) {
  if (!field || typeof field !== 'object') {
    return false;
  }

  const record = field as Record<string, unknown>;
  const source = [record.name, record.label, record.envVariable, record.type]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .join(' ');

  return keywords.some((keyword) => source.includes(keyword));
}

export function isLocationField(field: unknown) {
  return matchField(field, ['location', 'node', 'region', 'country', 'zone']);
}

export function isBandwidthField(field: unknown) {
  return matchField(field, ['bandwidth', 'speed', 'mbps', 'gbps']);
}

export function isTrafficField(field: unknown) {
  return matchField(field, ['traffic', 'transfer', 'flow']);
}

export function isIpCountField(field: unknown) {
  return matchField(field, ['ip', 'ipv4', 'ipv6', 'address']);
}

export function isPasswordField(field: unknown) {
  return matchField(field, ['password', 'passwd']) && !isPasswordConfirmationField(field);
}

export function isPasswordConfirmationField(field: unknown) {
  return matchField(field, ['confirm', 'confirmation', 'repeat']);
}

export function isHostnameField(field: unknown) {
  return matchField(field, ['hostname', 'host_name', 'host', 'domain']);
}

export function optionValueToText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  return '';
}

export function maskSensitiveValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 2) {
    return '******';
  }
  if (trimmed.length <= 6) {
    return `${trimmed[0]}****${trimmed[trimmed.length - 1]}`;
  }
  return `${trimmed.slice(0, 2)}******${trimmed.slice(-2)}`;
}

export function parseNodeOption(option: unknown, locale = 'en-US') {
  const record = (option ?? {}) as Record<string, unknown>;
  const label = valueText(option) || 'Node';
  const explicitCode = normalizeCountryCode(
    (typeof record.countryCode === 'string' ? record.countryCode : null)
    ?? (typeof record.code === 'string' ? record.code : null),
  );
  const countryCode = explicitCode ?? inferCountryCode(label) ?? 'US';
  const country = getCountryMeta(countryCode);

  return {
    label,
    countryCode,
    countryName: country ? getCountryName(country.countryCode, locale) : '',
    cityName: '',
  };
}
