import type { ConfigOption, ConfigOptionChoice, CheckoutField, CheckoutFieldOption, VpsMarketplaceApp, VpsMarketplaceOsOption } from './types';

type VisualTone = 'teal' | 'blue' | 'violet' | 'amber' | 'emerald' | 'slate';

type CountryMeta = {
  code: string;
  name: string;
};

export type VisualDescriptor = {
  src: string | null;
  glyph: string;
  tone: VisualTone;
  family?: string | null;
};

const countryAliases: Array<CountryMeta & { aliases: string[] }> = [
  { code: 'US', name: '美国', aliases: ['us', 'usa', 'united states', 'america', '美国', 'los angeles', 'la', 'new york', 'nyc'] },
  { code: 'HK', name: '香港', aliases: ['hk', 'hong kong', 'hongkong', '香港'] },
  { code: 'GB', name: '英国', aliases: ['uk', 'gb', 'great britain', 'united kingdom', '英国', 'london'] },
  { code: 'DE', name: '德国', aliases: ['de', 'germany', '德国', 'frankfurt'] },
  { code: 'FR', name: '法国', aliases: ['fr', 'france', '法国', 'paris'] },
  { code: 'NL', name: '荷兰', aliases: ['nl', 'netherlands', '荷兰', 'amsterdam'] },
  { code: 'ES', name: '西班牙', aliases: ['es', 'spain', '西班牙', 'madrid'] },
  { code: 'IT', name: '意大利', aliases: ['it', 'italy', '意大利', 'milan'] },
  { code: 'PL', name: '波兰', aliases: ['pl', 'poland', '波兰', 'warsaw'] },
  { code: 'CH', name: '瑞士', aliases: ['ch', 'switzerland', '瑞士', 'zurich'] },
  { code: 'TR', name: '土耳其', aliases: ['tr', 'turkey', '土耳其', 'istanbul'] },
  { code: 'IS', name: '冰岛', aliases: ['is', 'iceland', '冰岛', 'reykjavik'] },
  { code: 'SG', name: '新加坡', aliases: ['sg', 'singapore', '新加坡'] },
  { code: 'JP', name: '日本', aliases: ['jp', 'japan', '日本', 'tokyo'] },
  { code: 'KR', name: '韩国', aliases: ['kr', 'korea', '韩国', 'seoul'] },
  { code: 'CN', name: '中国', aliases: ['cn', 'china', '中国', 'beijing', 'shanghai', 'guangzhou', 'shenzhen'] },
  { code: 'BR', name: '巴西', aliases: ['br', 'brazil', '巴西', 'sao paulo'] },
];

const osFamilyMap: Array<{ match: RegExp; family: string; glyph: string; tone: VisualTone }> = [
  { match: /ubuntu/i, family: 'Ubuntu', glyph: 'UB', tone: 'amber' },
  { match: /debian/i, family: 'Debian', glyph: 'DE', tone: 'violet' },
  { match: /alma/i, family: 'AlmaLinux', glyph: 'AL', tone: 'blue' },
  { match: /centos|rocky|rhel|red hat/i, family: 'Enterprise Linux', glyph: 'EL', tone: 'emerald' },
  { match: /windows/i, family: 'Windows', glyph: 'WN', tone: 'blue' },
  { match: /fedora/i, family: 'Fedora', glyph: 'FD', tone: 'teal' },
];

const appToneMap: Array<{ match: RegExp; glyph: string; tone: VisualTone }> = [
  { match: /wordpress/i, glyph: 'WP', tone: 'blue' },
  { match: /docker|portainer/i, glyph: 'DK', tone: 'teal' },
  { match: /nginx/i, glyph: 'NG', tone: 'emerald' },
  { match: /node/i, glyph: 'JS', tone: 'emerald' },
  { match: /django/i, glyph: 'DJ', tone: 'teal' },
  { match: /mysql|mariadb|postgres|redis|mongodb/i, glyph: 'DB', tone: 'violet' },
  { match: /panel|cpanel|aaPanel|宝塔|webmin|plesk/i, glyph: 'PN', tone: 'amber' },
  { match: /ai|machine learning|llm/i, glyph: 'AI', tone: 'violet' },
];

function normalizeToken(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function labelGlyph(label: string, fallback = 'SV') {
  const parts = label
    .split(/[\s/_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function entryTokens(...parts: Array<string | null | undefined>) {
  return parts
    .flatMap((part) => (part ?? '').split(/[\s,/-]+/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function inferCountryCode(...parts: Array<string | null | undefined>) {
  const tokens = entryTokens(...parts);
  const haystack = parts
    .map((part) => (part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  for (const country of countryAliases) {
    if (country.aliases.some((alias) => {
      const normalized = alias.toLowerCase();
      return normalized.includes(' ')
        ? haystack.includes(normalized)
        : tokens.includes(normalized);
    })) {
      return country.code;
    }
  }

  return null;
}

export function getCountryMeta(countryCode: string | null | undefined) {
  const normalized = (countryCode ?? '').trim().toUpperCase();
  return countryAliases.find((entry) => entry.code === normalized) ?? null;
}

export function parseNodeOption(
  option: Pick<CheckoutFieldOption, 'value' | 'label' | 'countryCode' | 'hint' | 'badge'> | Pick<ConfigOptionChoice, 'name' | 'description' | 'countryCode' | 'hint' | 'badge'>,
) {
  const label = 'label' in option ? option.label : option.name;
  const description = 'description' in option ? option.description : option.hint ?? '';
  const countryCode = option.countryCode ?? inferCountryCode(label, description);
  const country = getCountryMeta(countryCode);
  const labelParts = label.split(/[-/|]/).map((part) => part.trim()).filter(Boolean);

  return {
    countryCode,
    countryName: country?.name ?? null,
    label,
    city: labelParts.length > 1 ? labelParts.at(-1) ?? null : null,
    hint: option.hint ?? description ?? null,
    badge: option.badge ?? null,
  };
}

export function optionValueToText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export function maskSensitiveValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  return '•'.repeat(Math.max(8, Math.min(16, value.length)));
}

export function matchesFieldToken(fieldName: string, patterns: string[]) {
  const token = normalizeToken(fieldName);
  return patterns.some((pattern) => token.includes(pattern));
}

export function isLocationField(field: Pick<CheckoutField, 'name' | 'label'> | Pick<ConfigOption, 'name' | 'description'>) {
  const label = 'label' in field ? field.label : field.description;
  return [field.name, label].some((part) => matchesFieldToken(part ?? '', ['location', 'region', 'country', 'node', 'datacenter']));
}

export function isPasswordField(field: Pick<CheckoutField, 'name' | 'label'>) {
  const token = `${field.name} ${field.label}`;
  return matchesFieldToken(token, ['account_password', 'server_password', 'password'])
    && !matchesFieldToken(token, ['confirmation', 'confirm']);
}

export function isPasswordConfirmationField(field: Pick<CheckoutField, 'name' | 'label'>) {
  return matchesFieldToken(`${field.name} ${field.label}`, [
    'password_confirmation',
    'confirm_password',
    'password_confirm',
    'confirmation_password',
    'confirmpassword',
    'confirmation',
  ]);
}

export function isHostnameField(field: Pick<CheckoutField, 'name' | 'label'>) {
  return matchesFieldToken(`${field.name} ${field.label}`, ['hostname', 'host_name', 'domain', 'domain_name', 'fqdn', 'server_name']);
}

export function isTrafficField(field: Pick<CheckoutField, 'name' | 'label'> | Pick<ConfigOption, 'name' | 'description'>) {
  const label = 'label' in field ? field.label : field.description;
  return [field.name, label].some((part) => matchesFieldToken(part ?? '', ['traffic', 'transfer', 'bandwidth_package', 'traffic_package']));
}

export function isBandwidthField(field: Pick<CheckoutField, 'name' | 'label'> | Pick<ConfigOption, 'name' | 'description'>) {
  const label = 'label' in field ? field.label : field.description;
  return [field.name, label].some((part) => matchesFieldToken(part ?? '', ['bandwidth', 'port_speed', 'speed']));
}

export function isIpCountField(field: Pick<CheckoutField, 'name' | 'label'> | Pick<ConfigOption, 'name' | 'description'>) {
  const label = 'label' in field ? field.label : field.description;
  return [field.name, label].some((part) => matchesFieldToken(part ?? '', ['ip_count', 'ipv4_count', 'additional_ipv4', 'additional_ip', 'ip_quantity']));
}

export function getOsVisual(option: Pick<VpsMarketplaceOsOption, 'label' | 'value' | 'icon' | 'family'> | string): VisualDescriptor {
  const label = typeof option === 'string' ? option : option.label || option.value;
  const src = typeof option === 'string' ? null : option.icon ?? null;
  const family = typeof option === 'string' ? null : option.family ?? null;
  const matched = osFamilyMap.find((entry) => entry.match.test(label));

  return {
    src,
    family: family ?? matched?.family ?? null,
    glyph: matched?.glyph ?? labelGlyph(label, 'OS'),
    tone: matched?.tone ?? 'slate',
  };
}

export function getAppVisual(app: Pick<VpsMarketplaceApp, 'name' | 'slug' | 'icon' | 'category'> | null | undefined): VisualDescriptor {
  const label = app?.name ?? app?.slug ?? 'App';
  const matched = appToneMap.find((entry) => entry.match.test(`${app?.name ?? ''} ${app?.slug ?? ''} ${app?.category?.slug ?? ''}`));

  return {
    src: app?.icon ?? app?.category?.icon ?? null,
    glyph: matched?.glyph ?? labelGlyph(label, 'AP'),
    tone: matched?.tone ?? 'violet',
  };
}

export function getSummaryTone(kind: 'node' | 'network' | 'credentials' | 'app' | 'system'): VisualTone {
  switch (kind) {
    case 'node':
      return 'blue';
    case 'network':
      return 'teal';
    case 'credentials':
      return 'amber';
    case 'app':
      return 'violet';
    default:
      return 'slate';
  }
}
