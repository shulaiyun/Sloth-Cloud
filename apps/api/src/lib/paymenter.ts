import type {
  ActionResponse,
  ActionResult,
  AffiliateOrderSummary,
  AffiliateProfile,
  ApiMeta,
  AuthUser,
  CartResponse,
  CartSummary,
  CatalogCategoriesResponse,
  CatalogCategoryResponse,
  CatalogProductsResponse,
  CategorySummary,
  CheckoutField,
  CheckoutResponse,
  ConfigOption,
  ConfigOptionChoice,
  ConfigOptionPrice,
  CurrencyInfo,
  GatewaySummary,
  HomeResponse,
  InvoiceDetail,
  InvoicePayResponse,
  InvoiceResponse,
  InvoicesResponse,
  LoginInput,
  LogoutResponse,
  MeResponse,
  PaginationMeta,
  PriceBreakdown,
  ProductDetail,
  ProductDetailResponse,
  ProductPlan,
  ProductPlanPrice,
  ProductPricing,
  ProductSummary,
  ProvisioningStatus,
  RegisterInput,
  ServiceDetail,
  ServiceAppInstall,
  ServiceAppInstallLogsResponse,
  ServiceAppsInstallResponse,
  ServiceAppsResponse,
  ServiceOperationLogSummary,
  ServiceOperationLogsResponse,
  ServiceProvisioningResponse,
  ServiceProvisioningRetryResponse,
  ServiceResponse,
  ServiceSummary,
  ServicesResponse,
  SourceMode,
  VpsAppMarketplace,
  VpsAppMarketplaceCapability,
  VpsAppMarketplaceResponse,
  VpsMarketplaceApp,
  VpsMarketplaceCategory,
  VpsMarketplaceOsOption,
  VpsMarketplaceRecipe,
} from './types.js';

export interface GatewayConfig {
  apiUrl?: string;
  mode: SourceMode;
  timeoutMs: number;
}

type CatalogVisibility = 'public' | 'all';

interface CatalogReadOptions {
  visibility?: CatalogVisibility;
}

export interface AddCartItemInput {
  productSlug: string;
  planId: string;
  quantity?: number;
  configOptions?: Record<string, unknown>;
  checkoutConfig?: Record<string, unknown>;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface CheckoutInput {
  tos?: boolean;
  referralCode?: string;
}

export interface CancelServiceInput {
  type: 'end_of_period' | 'immediate';
  reason: string;
  currentPassword: string;
}

export interface UpgradeServiceInput {
  productId?: string | number | null;
  configOptions?: Record<string, string | number | null>;
}

export interface CreateServiceOperationLogInput {
  source?: string;
  action: string;
  success?: boolean | null;
  code?: string | null;
  message?: string | null;
  detail?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
}

export interface StoreServicePasswordInput {
  password: string;
  source?: string;
  username?: string | null;
  applyMode?: string | null;
  restartRequired?: boolean;
  appliedLive?: boolean;
  note?: string | null;
}

export interface ClearRuntimeMappingInput {
  provider?: 'convoy' | 'managed-app';
  reason?: string | null;
  currentRefs?: string[];
  force?: boolean;
}

export interface PayInvoiceInput {
  method: 'credit' | 'gateway' | 'saved';
  gatewayId?: number;
  billingAgreementUlid?: string;
  setAsDefault?: boolean;
  frontendReturnUrl?: string;
}

export interface ReinstallServiceAppsInput {
  selectedOs: string;
  primaryAppSlug?: string | null;
  addonAppSlugs?: string[];
  previewOnly?: boolean;
}

export interface SessionAuthResponse {
  message: string;
  data: {
    accessToken: string;
    tokenType: string;
    user: AuthUser;
  };
}

class GatewayError extends Error {
  statusCode: number;
  payload?: unknown;

  constructor(message: string, statusCode: number, payload?: unknown) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function invalidLiveConfig() {
  return new GatewayError('PAYMENTER_API_URL is missing for live mode.', 500);
}

function notFound(message: string) {
  return new GatewayError(message, 404);
}

function unauthorized() {
  return new GatewayError('Missing server-side session token.', 401, {
    message: 'Authentication is required.',
  });
}

type AnyRecord = Record<string, unknown>;

function baseMeta(mode: SourceMode): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    sourceMode: mode,
  };
}

function asRecord(value: unknown): AnyRecord {
  return typeof value === 'object' && value !== null ? value as AnyRecord : {};
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }

  return false;
}

function createMockAuthToken(user: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const payload = Buffer.from(JSON.stringify({
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  }), 'utf8').toString('base64url');

  return `mock-access-token:${payload}`;
}

function parseMockAuthToken(token?: string) {
  if (!token || !token.startsWith('mock-access-token:')) {
    return null;
  }

  const encoded = token.slice('mock-access-token:'.length);
  if (encoded.length === 0) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      email?: unknown;
      firstName?: unknown;
      lastName?: unknown;
    };

    const email = readNullableString(payload.email);
    if (!email) {
      return null;
    }

    return {
      email,
      firstName: readNullableString(payload.firstName),
      lastName: readNullableString(payload.lastName),
    };
  } catch {
    return null;
  }
}

function inferMockNamesFromEmail(email: string) {
  const localPart = email.split('@')[0]?.trim() ?? '';
  if (!localPart) {
    return {
      firstName: 'Local',
      lastName: 'User',
    };
  }

  const compact = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const [firstName, ...rest] = compact.length > 0 ? compact.split(' ') : [];

  return {
    firstName: firstName || 'Local',
    lastName: rest.join(' ').trim() || 'User',
  };
}

function createMockAuthUser(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): AuthUser {
  const fallbackNames = inferMockNamesFromEmail(input.email);
  const firstName = input.firstName?.trim() || fallbackNames.firstName;
  const lastName = input.lastName?.trim() || fallbackNames.lastName;
  const combinedName = `${firstName} ${lastName}`.trim();

  return {
    id: '1',
    firstName,
    lastName,
    name: combinedName || input.email,
    email: input.email,
    emailVerifiedAt: null,
    avatar: null,
    properties: [],
  };
}

function readArray<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

function readStringArray(value: unknown) {
  return readArray<unknown>(value)
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function parseLocalizedRecord(value: string) {
  const trimmed = value.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }

    const record = Object.values(parsed as Record<string, unknown>)
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return record.length > 0 ? [...new Set(record)] : null;
  } catch {
    return null;
  }
}

function stripHtml(input: string) {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toStringId(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function normalizeApiBaseUrl(apiUrl?: string) {
  if (!apiUrl) {
    throw invalidLiveConfig();
  }

  const trimmed = apiUrl.replace(/\/+$/, '');

  if (/\/api\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/api$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }

  if (/\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/api/v1`;
}

function buildPaymenterUrl(config: GatewayConfig, path: string) {
  const baseUrl = normalizeApiBaseUrl(config.apiUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function extractErrorMessage(payload: unknown, statusCode: number) {
  if (statusCode >= 500) {
    return 'Billing upstream is temporarily unavailable. Please try again in a moment.';
  }

  const record = asRecord(payload);
  const validationErrors = asRecord(record.errors);
  const firstValidationEntry = Object.values(validationErrors)[0];

  if (Array.isArray(firstValidationEntry) && typeof firstValidationEntry[0] === 'string') {
    return firstValidationEntry[0];
  }

  if (typeof record.message === 'string' && record.message.length > 0) {
    return record.message;
  }

  if (typeof record.error === 'string' && record.error.length > 0) {
    return record.error;
  }

  return `Paymenter request failed with status ${statusCode}.`;
}

function isMissingRouteError(payload: unknown) {
  const record = asRecord(payload);
  const message = readString(record.message).toLowerCase();

  return message.includes('route') && message.includes('could not be found');
}

function routeMissingMessage(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `Paymenter upstream route is missing (${normalizedPath}). Rebuild and redeploy the Sloth Paymenter image, then clear route cache.`;
}

async function requestPaymenter<T>(
  config: GatewayConfig,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    token?: string;
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  try {
    const response = await fetch(buildPaymenterUrl(config, path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      if (response.status === 404 && isMissingRouteError(payload)) {
        throw new GatewayError(routeMissingMessage(path), 502, payload);
      }

      throw new GatewayError(extractErrorMessage(payload, response.status), response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new GatewayError('Paymenter request timed out.', 504);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCurrency(raw: unknown): CurrencyInfo | null {
  const value = asRecord(raw);
  const code = readString(value.code);

  if (!code) {
    return null;
  }

  return {
    code,
    name: readString(value.name, code),
    prefix: readNullableString(value.prefix),
    suffix: readNullableString(value.suffix),
    format: readNullableString(value.format),
  };
}

type RegionMetadata = {
  regionCode: string | null;
  countryCode: string | null;
};

const regionAliases: Array<{ regionCode: string; countryCode: string; aliases: string[] }> = [
  { regionCode: 'us', countryCode: 'US', aliases: ['us', 'usa', 'united states', 'america', 'los angeles', 'new york'] },
  { regionCode: 'hk', countryCode: 'HK', aliases: ['hk', 'hong kong'] },
  { regionCode: 'jp', countryCode: 'JP', aliases: ['jp', 'japan', 'tokyo'] },
  { regionCode: 'sg', countryCode: 'SG', aliases: ['sg', 'singapore'] },
  { regionCode: 'de', countryCode: 'DE', aliases: ['de', 'germany', 'frankfurt'] },
  { regionCode: 'gb', countryCode: 'GB', aliases: ['gb', 'uk', 'united kingdom', 'great britain', 'london'] },
  { regionCode: 'nl', countryCode: 'NL', aliases: ['nl', 'netherlands', 'amsterdam'] },
  { regionCode: 'fr', countryCode: 'FR', aliases: ['fr', 'france', 'paris'] },
  { regionCode: 'es', countryCode: 'ES', aliases: ['es', 'spain', 'madrid'] },
  { regionCode: 'it', countryCode: 'IT', aliases: ['it', 'italy', 'milan'] },
  { regionCode: 'pl', countryCode: 'PL', aliases: ['pl', 'poland', 'warsaw'] },
  { regionCode: 'ch', countryCode: 'CH', aliases: ['ch', 'switzerland', 'zurich'] },
  { regionCode: 'tr', countryCode: 'TR', aliases: ['tr', 'turkey', 'istanbul'] },
  { regionCode: 'is', countryCode: 'IS', aliases: ['is', 'iceland', 'reykjavik'] },
  { regionCode: 'kr', countryCode: 'KR', aliases: ['kr', 'korea', 'seoul'] },
  { regionCode: 'cn', countryCode: 'CN', aliases: ['cn', 'china', 'beijing', 'shanghai', 'guangzhou', 'shenzhen'] },
  { regionCode: 'br', countryCode: 'BR', aliases: ['br', 'brazil', 'sao paulo'] },
];

function normalizeTokenList(...parts: Array<unknown>) {
  return parts
    .flatMap((part) => {
      const direct = typeof part === 'string' ? part.trim() : String(part ?? '').trim();
      const localized = typeof part === 'string' ? parseLocalizedRecord(part) : null;
      return localized ?? (direct.length > 0 ? [direct] : []);
    })
    .flatMap((part) => part.toLowerCase().split(/[^a-z0-9]+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeHaystack(...parts: Array<unknown>) {
  return parts
    .flatMap((part) => {
      const direct = typeof part === 'string' ? part.trim() : String(part ?? '').trim();
      const localized = typeof part === 'string' ? parseLocalizedRecord(part) : null;
      return localized ?? (direct.length > 0 ? [direct] : []);
    })
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 0)
    .join(' ');
}

function normalizeRegionCode(value: unknown) {
  const token = readNullableString(value)?.trim().toLowerCase() ?? null;
  if (!token) {
    return null;
  }

  const direct = regionAliases.find((entry) => entry.regionCode === token || entry.aliases.includes(token));
  if (direct) {
    return direct.regionCode;
  }

  const fromSlug = token.match(/\b(us|hk|jp|sg|de|gb|uk|nl|fr|es|it|pl|ch|tr|is|kr|cn|br)\b/);
  if (!fromSlug) {
    return null;
  }

  return fromSlug[1] === 'uk' ? 'gb' : fromSlug[1];
}

function normalizeCountryCode(value: unknown) {
  const token = readNullableString(value)?.trim().toUpperCase() ?? null;
  if (!token) {
    return null;
  }

  if (token === 'UK') {
    return 'GB';
  }

  if (regionAliases.some((entry) => entry.countryCode === token)) {
    return token;
  }

  return null;
}

function detectRegionMetadata(...parts: Array<unknown>): RegionMetadata {
  const tokens = normalizeTokenList(...parts);
  const haystack = normalizeHaystack(...parts);

  for (const entry of regionAliases) {
    const matched = entry.aliases.some((alias) => {
      const normalized = alias.toLowerCase();
      return normalized.includes(' ')
        ? haystack.includes(normalized)
        : tokens.includes(normalized);
    });

    if (matched) {
      return {
        regionCode: entry.regionCode,
        countryCode: entry.countryCode,
      };
    }
  }

  return {
    regionCode: null,
    countryCode: null,
  };
}

function resolveRegionMetadata(
  explicitRegion: unknown,
  explicitCountry: unknown,
  ...parts: Array<unknown>
): RegionMetadata {
  const detected = detectRegionMetadata(...parts);
  const regionCode = normalizeRegionCode(explicitRegion) ?? detected.regionCode;
  const regionEntry = regionAliases.find((entry) => entry.regionCode === regionCode);
  const countryCode = normalizeCountryCode(explicitCountry) ?? regionEntry?.countryCode ?? detected.countryCode;

  return {
    regionCode,
    countryCode,
  };
}

function buildPropertyMap(raw: unknown) {
  return readArray<unknown>(raw).reduce<Record<string, string>>((carry, entry) => {
    const value = asRecord(entry);
    const key = readString(value.key).trim();
    if (key.length === 0) {
      return carry;
    }

    carry[key] = readString(value.value);
    return carry;
  }, {});
}

function readPropertyString(propertyMap: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = propertyMap[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readListValue(raw: unknown) {
  if (Array.isArray(raw)) {
    return readStringArray(raw);
  }

  const direct = readNullableString(raw);
  if (!direct) {
    return [];
  }

  try {
    const parsed = JSON.parse(direct) as unknown;
    if (Array.isArray(parsed)) {
      return readStringArray(parsed);
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  return direct
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeRuntimeKind(raw: unknown, ...parts: Array<unknown>) {
  const explicit = readNullableString(raw)?.trim().toLowerCase() ?? null;
  if (explicit === 'managed-app' || explicit === 'vps' || explicit === 'unknown') {
    return explicit;
  }

  const haystack = normalizeHaystack(...parts);
  if (haystack.includes('managed-app') || haystack.includes('managed app') || haystack.includes('app-hosting')) {
    return 'managed-app' as const;
  }

  if (haystack.includes('vps') || haystack.includes('server')) {
    return 'vps' as const;
  }

  return null;
}

function normalizeCatalogVisibility(options?: CatalogReadOptions) {
  return options?.visibility === 'all' ? 'all' : 'public';
}

function isInternalCatalogCategorySlug(slug: string | null | undefined) {
  return (slug ?? '').trim().toLowerCase() === 'app-hosting';
}

function isPublicCatalogCategory(category: CategorySummary) {
  return !isInternalCatalogCategorySlug(category.slug);
}

function isPublicCatalogProduct(product: ProductSummary) {
  if (isInternalCatalogCategorySlug(product.category?.slug)) {
    return false;
  }

  const slug = product.slug.trim().toLowerCase();
  if (product.runtimeKind === 'managed-app') {
    return false;
  }

  return !(slug === 'app-hosting' || slug.startsWith('app-') || slug.includes('app-hosting'));
}

function filterCatalogCategories(categories: CategorySummary[], visibility: CatalogVisibility) {
  return visibility === 'all' ? categories : categories.filter(isPublicCatalogCategory);
}

function filterCatalogProducts(products: ProductSummary[], visibility: CatalogVisibility) {
  return visibility === 'all' ? products : products.filter(isPublicCatalogProduct);
}

function normalizeCategory(raw: unknown): CategorySummary {
  const value = asRecord(raw);
  const metadata = resolveRegionMetadata(
    value.region_code ?? value.regionCode,
    value.country_code ?? value.countryCode,
    value.slug,
    value.full_slug,
    value.name,
    value.description,
  );

  return {
    id: String(value.id ?? ''),
    slug: readString(value.slug),
    fullSlug: readNullableString(value.full_slug),
    name: readString(value.name, 'Untitled category'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    parentId: value.parent_id === null || value.parent_id === undefined ? null : String(value.parent_id),
    sort: readNumber(value.sort),
    productCount: readNumber(value.product_count) ?? 0,
    regionCode: metadata.regionCode,
    countryCode: metadata.countryCode,
  };
}

function normalizeProductPricing(raw: unknown): ProductPricing | null {
  const value = asRecord(raw);
  const planId = value.plan_id ?? value.planId;

  if (planId === undefined || planId === null) {
    return null;
  }

  return {
    planId: String(planId),
    planName: readString(value.plan_name ?? value.planName, 'Default plan'),
    billingPeriod: readNumber(value.billing_period ?? value.billingPeriod),
    billingUnit: readNullableString(value.billing_unit ?? value.billingUnit),
    price: readNumber(value.price),
    setupFee: readNumber(value.setup_fee ?? value.setupFee),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
  };
}

function normalizeProductSummary(raw: unknown): ProductSummary {
  const value = asRecord(raw);
  const categoryValue = asRecord(value.category);
  const hasCategory = Object.keys(categoryValue).length > 0;
  const category = hasCategory ? normalizeCategory(categoryValue) : null;
  const metadata = resolveRegionMetadata(
    value.region_code ?? value.regionCode,
    value.country_code ?? value.countryCode,
    value.slug,
    value.name,
    value.description,
    category?.slug,
    category?.fullSlug,
    category?.name,
  );
  const runtimeKind = normalizeRuntimeKind(
    value.runtime_kind ?? value.runtimeKind,
    value.slug,
    category?.slug,
    category?.fullSlug,
    value.name,
  );

  return {
    id: toStringId(value.id),
    slug: readString(value.slug),
    name: readString(value.name, 'Untitled product'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    stock: readNumber(value.stock),
    perUserLimit: readNumber(value.per_user_limit ?? value.perUserLimit),
    allowQuantityMode: readNullableString(value.allow_quantity ?? value.allowQuantityMode ?? value.allowQuantity),
    category: category ? {
      id: category.id,
      slug: category.slug,
      name: category.name,
      countryCode: category.countryCode ?? null,
      regionCode: category.regionCode ?? null,
    } : null,
    pricing: normalizeProductPricing(value.pricing),
    countryCode: metadata.countryCode,
    regionCode: metadata.regionCode,
    selectedOs: readNullableString(value.selected_os ?? value.selectedOs),
    primaryAppSlug: readNullableString(value.primary_app_slug ?? value.primaryAppSlug),
    addonAppSlugs: readListValue(value.addon_app_slugs ?? value.addonAppSlugs),
    runtimeKind,
  };
}

function normalizeProductPlanPrice(raw: unknown): ProductPlanPrice {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    price: readNumber(value.price),
    setupFee: readNumber(value.setup_fee ?? value.setupFee),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
  };
}

function normalizeProductPlan(raw: unknown): ProductPlan {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    name: readString(value.name, 'Default plan'),
    type: readNullableString(value.type),
    billingPeriod: readNumber(value.billing_period ?? value.billingPeriod),
    billingUnit: readNullableString(value.billing_unit ?? value.billingUnit),
    sort: readNumber(value.sort),
    prices: readArray<unknown>(value.prices).map(normalizeProductPlanPrice),
  };
}

function normalizeConfigOptionPrice(raw: unknown): ConfigOptionPrice {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    planId: toStringId(value.plan_id ?? value.planId),
    planName: readString(value.plan_name ?? value.planName, 'Default plan'),
    billingPeriod: readNumber(value.billing_period ?? value.billingPeriod),
    billingUnit: readNullableString(value.billing_unit ?? value.billingUnit),
    price: readNumber(value.price),
    setupFee: readNumber(value.setup_fee ?? value.setupFee),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
  };
}

function flattenOptionPricing(raw: unknown) {
  return readArray<unknown>(raw).flatMap((entry) => {
    const value = asRecord(entry);
    return readArray<unknown>(value.prices).map(normalizeConfigOptionPrice).map((price) => ({
      ...price,
      planId: price.planId || String(value.plan_id ?? value.planId ?? ''),
      planName: price.planName || readString(value.plan_name ?? value.planName, 'Default plan'),
      billingPeriod: price.billingPeriod ?? readNumber(value.billing_period ?? value.billingPeriod),
      billingUnit: price.billingUnit ?? readNullableString(value.billing_unit ?? value.billingUnit),
    }));
  });
}

function readDisplayString(value: Record<string, unknown>, key: string) {
  const display = asRecord(value.display);
  const meta = asRecord(value.meta);

  return readNullableString(
    value[key]
      ?? value[key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())]
      ?? display[key]
      ?? display[key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())]
      ?? meta[key]
      ?? meta[key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())],
  );
}

function normalizeConfigOptionChoice(raw: unknown): ConfigOptionChoice {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    name: readString(value.name, 'Option'),
    description: stripHtml(readString(value.description)),
    envVariable: readNullableString(value.env_variable ?? value.envVariable),
    countryCode: readDisplayString(value, 'country_code'),
    icon: readDisplayString(value, 'icon'),
    badge: readDisplayString(value, 'badge'),
    hint: readDisplayString(value, 'hint'),
    pricing: flattenOptionPricing(value.prices),
  };
}

function normalizeConfigOption(raw: unknown): ConfigOption {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    name: readString(value.name, 'Config option'),
    description: stripHtml(readString(value.description)),
    envVariable: readNullableString(value.env_variable ?? value.envVariable),
    type: readString(value.type, 'select'),
    sort: readNumber(value.sort),
    required: readBoolean(value.required),
    children: readArray<unknown>(value.children).map(normalizeConfigOptionChoice),
  };
}

function normalizeProductDetail(raw: unknown): ProductDetail {
  const value = asRecord(raw);
  const categoryValue = value.category ? normalizeCategory(value.category) : null;
  const configOptions = readArray<unknown>(value.config_options ?? value.configOptions).map(normalizeConfigOption);
  const operatingSystemOptions = readArray<unknown>(value.operating_system_options ?? value.operatingSystemOptions).map(normalizeConfigOption);
  const checkoutFields = readArray<unknown>(value.checkout_fields ?? value.checkoutFields).map(normalizeCheckoutField);
  const metadata = resolveRegionMetadata(
    value.region_code ?? value.regionCode,
    value.country_code ?? value.countryCode,
    value.slug,
    value.name,
    value.description,
    categoryValue?.slug,
    categoryValue?.fullSlug,
    categoryValue?.name,
  );
  const runtimeKind = normalizeRuntimeKind(
    value.runtime_kind ?? value.runtimeKind,
    value.slug,
    categoryValue?.slug,
    categoryValue?.fullSlug,
    value.name,
  );

  return {
    id: toStringId(value.id),
    slug: readString(value.slug),
    name: readString(value.name, 'Untitled product'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    stock: readNumber(value.stock),
    perUserLimit: readNumber(value.per_user_limit ?? value.perUserLimit),
    allowQuantityMode: readNullableString(value.allow_quantity ?? value.allowQuantityMode ?? value.allowQuantity),
    category: categoryValue,
    plans: readArray<unknown>(value.plans).map(normalizeProductPlan),
    configOptions,
    operatingSystemOptions,
    checkoutFields,
    vpsAppMarketplace: normalizeVpsAppMarketplaceCapability(value.vps_app_marketplace ?? value.vpsAppMarketplace),
    countryCode: metadata.countryCode,
    regionCode: metadata.regionCode,
    selectedOs: readNullableString(value.selected_os ?? value.selectedOs),
    primaryAppSlug: readNullableString(value.primary_app_slug ?? value.primaryAppSlug),
    addonAppSlugs: readListValue(value.addon_app_slugs ?? value.addonAppSlugs),
    runtimeKind,
  };
}

function normalizeCheckoutField(raw: unknown): CheckoutField {
  const value = asRecord(raw);
  const options = readArray<unknown>(value.options).map((entry) => {
    const option = asRecord(entry);

    return {
      value: readString(option.value),
      label: readString(option.label),
      countryCode: readDisplayString(option, 'country_code'),
      icon: readDisplayString(option, 'icon'),
      badge: readDisplayString(option, 'badge'),
      hint: readDisplayString(option, 'hint'),
    };
  });

  return {
    name: readString(value.name),
    label: readString(value.label, readString(value.name)),
    description: readNullableString(value.description),
    type: readString(value.type, 'text'),
    required: readBoolean(value.required),
    default: value.default as string | number | boolean | null,
    placeholder: readNullableString(value.placeholder),
    options,
    validation: (value.validation ?? null) as string | string[] | null,
  };
}

function normalizeVpsMarketplaceOsOption(raw: unknown): VpsMarketplaceOsOption {
  const value = asRecord(raw);

  return {
    value: readString(value.value),
    label: readString(value.label, readString(value.value)),
    icon: readDisplayString(value, 'icon'),
    family: readDisplayString(value, 'family'),
    templateRef: readNullableString(value.template_ref ?? value.templateRef),
    templateUuid: readNullableString(value.template_uuid ?? value.templateUuid),
  };
}

function normalizeVpsAppMarketplaceCapability(raw: unknown): VpsAppMarketplaceCapability | null {
  const value = asRecord(raw);
  if (Object.keys(value).length === 0 || !readBoolean(value.enabled)) {
    return null;
  }

  return {
    enabled: true,
    osFieldName: readString(value.os_field_name ?? value.osFieldName, 'os'),
    hostnameFieldName: readString(value.hostname_field_name ?? value.hostnameFieldName, 'hostname'),
    primaryAppFieldName: readString(value.primary_app_field_name ?? value.primaryAppFieldName, 'primary_app_slug'),
    addonAppFieldName: readString(value.addon_app_field_name ?? value.addonAppFieldName, 'addon_app_slugs'),
    supportedOs: readArray<unknown>(value.supported_os ?? value.supportedOs).map(normalizeVpsMarketplaceOsOption),
  };
}

function normalizeVpsMarketplaceCategory(raw: unknown): VpsMarketplaceCategory {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    slug: readString(value.slug),
    name: readString(value.name),
    description: readNullableString(value.description),
    icon: readNullableString(value.icon),
    sort: readNumber(value.sort),
    searchKeywords: readStringArray(value.search_keywords ?? value.searchKeywords),
  };
}

function normalizeVpsMarketplaceRecipe(raw: unknown): VpsMarketplaceRecipe | null {
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) {
    return null;
  }

  return {
    id: toStringId(value.id),
    osVersion: readNullableString(value.os_version ?? value.osVersion),
    installStrategy: readNullableString(value.install_strategy ?? value.installStrategy),
    effectiveInstallStrategy: readNullableString(value.effective_install_strategy ?? value.effectiveInstallStrategy),
    templateRef: readNullableString(value.template_ref ?? value.templateRef),
    templateAvailable: readBoolean(value.template_available ?? value.templateAvailable),
    dependencies: readStringArray(value.dependencies),
    conflicts: readStringArray(value.conflicts),
    defaultLoginUsername: readNullableString(value.default_login_username ?? value.defaultLoginUsername),
    panelPort: readNumber(value.panel_port ?? value.panelPort),
    panelPath: readNullableString(value.panel_path ?? value.panelPath),
    panelScheme: readNullableString(value.panel_scheme ?? value.panelScheme),
    panelLabel: readNullableString(value.panel_label ?? value.panelLabel),
    allowOnExistingService: readBoolean(value.allow_on_existing_service ?? value.allowOnExistingService),
  };
}

function normalizeVpsMarketplaceApp(raw: unknown): VpsMarketplaceApp {
  const value = asRecord(raw);
  const categoryValue = asRecord(value.category);

  return {
    id: toStringId(value.id),
    slug: readString(value.slug),
    name: readString(value.name),
    description: stripHtml(readString(value.description)),
    icon: readNullableString(value.icon),
    type: readString(value.type, 'addon'),
    tagline: readNullableString(value.tagline),
    featured: readBoolean(value.featured),
    allowOnExistingService: readBoolean(value.allow_on_existing_service ?? value.allowOnExistingService),
    category: Object.keys(categoryValue).length > 0
      ? {
        id: toStringId(categoryValue.id),
        slug: readString(categoryValue.slug),
        name: readString(categoryValue.name),
        icon: readNullableString(categoryValue.icon),
      }
      : null,
    recipe: normalizeVpsMarketplaceRecipe(value.recipe),
    available: readBoolean(value.available),
    unavailableReason: readNullableString(value.unavailable_reason ?? value.unavailableReason),
  };
}

function normalizeVpsAppMarketplace(raw: unknown): VpsAppMarketplace {
  const value = asRecord(raw);
  const rules = asRecord(value.rules);
  const currentSelection = asRecord(value.current_selection ?? value.currentSelection);
  const compatibility = asRecord(value.compatibility);

  return {
    enabled: readBoolean(value.enabled),
    selectedOs: readNullableString(value.selected_os ?? value.selectedOs),
    supportedOs: readArray<unknown>(value.supported_os ?? value.supportedOs).map(normalizeVpsMarketplaceOsOption),
    categories: readArray<unknown>(value.categories).map(normalizeVpsMarketplaceCategory),
    primaryApps: readArray<unknown>(value.primary_apps ?? value.primaryApps).map(normalizeVpsMarketplaceApp),
    addonApps: readArray<unknown>(value.addon_apps ?? value.addonApps).map(normalizeVpsMarketplaceApp),
    rules: {
      primaryRequired: readBoolean(rules.primary_required ?? rules.primaryRequired),
      maxPrimary: readNumber(rules.max_primary ?? rules.maxPrimary) ?? 1,
      allowAddons: readBoolean(rules.allow_addons ?? rules.allowAddons),
    },
    currentSelection: {
      primaryAppSlug: readNullableString(currentSelection.primary_app_slug ?? currentSelection.primaryAppSlug),
      addonAppSlugs: readStringArray(currentSelection.addon_app_slugs ?? currentSelection.addonAppSlugs),
    },
    compatibility: Object.keys(compatibility).length > 0
      ? {
        mode: readString(compatibility.mode, 'native') === 'fallback' ? 'fallback' : 'native',
        requestedOs: readNullableString(compatibility.requested_os ?? compatibility.requestedOs),
        fallbackOs: readNullableString(compatibility.fallback_os ?? compatibility.fallbackOs),
        note: readNullableString(compatibility.note),
      }
      : null,
  };
}

function normalizeAuthUser(raw: unknown): AuthUser {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    firstName: readString(value.first_name ?? value.firstName),
    lastName: readString(value.last_name ?? value.lastName),
    name: readString(value.name),
    email: readString(value.email),
    emailVerifiedAt: readNullableString(value.email_verified_at ?? value.emailVerifiedAt),
    avatar: readNullableString(value.avatar),
    properties: readArray<unknown>(value.properties).map((property) => {
      const propertyValue = asRecord(property);

      return {
        key: readString(propertyValue.key),
        name: readString(propertyValue.name, readString(propertyValue.key)),
        value: String(propertyValue.value ?? ''),
      };
    }),
  };
}

function normalizeMoneyRecord(raw: unknown): Record<string, number> {
  const value = asRecord(raw);

  return Object.entries(value).reduce<Record<string, number>>((carry, [currency, amount]) => {
    const parsed = readNumber(amount);
    if (parsed !== null) {
      carry[currency] = parsed;
    }
    return carry;
  }, {});
}

function normalizeAffiliateProfile(raw: unknown): AffiliateProfile {
  const value = asRecord(raw);
  const program = asRecord(value.program);
  const affiliateValue = asRecord(value.affiliate);

  return {
    program: {
      defaultReward: readNumber(program.default_reward ?? program.defaultReward) ?? 0,
      codeType: readString(program.code_type ?? program.codeType, 'random'),
    },
    affiliate: Object.keys(affiliateValue).length > 0
      ? {
        id: toStringId(affiliateValue.id),
        code: readString(affiliateValue.code),
        enabled: readBoolean(affiliateValue.enabled),
        visitors: readNumber(affiliateValue.visitors) ?? 0,
        signups: readNumber(affiliateValue.signups) ?? 0,
        validOrders: readNumber(affiliateValue.valid_orders ?? affiliateValue.validOrders) ?? 0,
        reward: readNumber(affiliateValue.reward) ?? 0,
        customReward: readNumber(affiliateValue.custom_reward ?? affiliateValue.customReward),
        discount: readNumber(affiliateValue.discount),
        earnings: normalizeMoneyRecord(affiliateValue.earnings),
        credits: readArray<unknown>(affiliateValue.credits).map((entry) => {
          const credit = asRecord(entry);
          return {
            currencyCode: readString(credit.currency_code ?? credit.currencyCode),
            currencyName: readNullableString(credit.currency_name ?? credit.currencyName),
            amount: readNumber(credit.amount) ?? 0,
          };
        }),
        createdAt: readNullableString(affiliateValue.created_at ?? affiliateValue.createdAt),
        updatedAt: readNullableString(affiliateValue.updated_at ?? affiliateValue.updatedAt),
      }
      : null,
  };
}

function normalizeAffiliateOrderSummary(raw: unknown): AffiliateOrderSummary {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    orderId: readNullableString(value.order_id ?? value.orderId),
    serviceId: readNullableString(value.service_id ?? value.serviceId),
    serviceLabel: readNullableString(value.service_label ?? value.serviceLabel),
    productName: readNullableString(value.product_name ?? value.productName),
    earnings: normalizeMoneyRecord(value.earnings),
    paidInvoicesCount: readNumber(value.paid_invoices_count ?? value.paidInvoicesCount) ?? 0,
    lastPaidAt: readNullableString(value.last_paid_at ?? value.lastPaidAt),
  };
}

function normalizePagination(raw: unknown): PaginationMeta | null {
  const value = asRecord(raw);
  const currentPage = readNumber(value.current_page ?? value.currentPage);
  const perPage = readNumber(value.per_page ?? value.perPage);
  const total = readNumber(value.total);
  const lastPage = readNumber(value.last_page ?? value.lastPage);

  if (currentPage === null || perPage === null || total === null || lastPage === null) {
    return null;
  }

  return {
    currentPage,
    perPage,
    total,
    lastPage,
  };
}

function normalizePriceBreakdown(raw: unknown): PriceBreakdown | null {
  const value = asRecord(raw);
  const formatted = asRecord(value.formatted);

  if (Object.keys(value).length === 0) {
    return null;
  }

  return {
    subtotal: readNumber(value.subtotal) ?? 0,
    price: readNumber(value.price) ?? 0,
    setupFee: readNumber(value.setup_fee ?? value.setupFee) ?? 0,
    tax: readNumber(value.tax) ?? 0,
    setupFeeTax: readNumber(value.setup_fee_tax ?? value.setupFeeTax) ?? 0,
    totalTax: readNumber(value.total_tax ?? value.totalTax) ?? 0,
    total: readNumber(value.total) ?? 0,
    discount: readNumber(value.discount) ?? 0,
    currencyCode: readNullableString(value.currency_code ?? value.currencyCode),
    currency: normalizeCurrency(value.currency),
    formatted: {
      subtotal: readString(formatted.subtotal),
      price: readString(formatted.price),
      setupFee: readString(formatted.setup_fee ?? formatted.setupFee),
      tax: readString(formatted.tax),
      total: readString(formatted.total),
    },
  };
}

function normalizeGateway(raw: unknown): GatewaySummary {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    name: readString(value.name, 'Gateway'),
    extension: readString(value.extension),
    type: readNullableString(value.type),
    enabled: readBoolean(value.enabled),
    description: readNullableString(value.description),
  };
}

function normalizeProvisioningStatus(raw: unknown): ProvisioningStatus | null {
  const value = asRecord(raw);

  if (Object.keys(value).length === 0) {
    return null;
  }

  return {
    status: readString(value.status, 'unknown'),
    provider: readString(value.provider, 'convoy'),
    attemptCount: readNumber(value.attempt_count ?? value.attemptCount) ?? 0,
    errorMessage: readNullableString(value.error_message ?? value.errorMessage),
    errorCode: readNullableString(value.error_code ?? value.errorCode),
    lastAttemptAt: readNullableString(value.last_attempt_at ?? value.lastAttemptAt),
    completedAt: readNullableString(value.completed_at ?? value.completedAt),
  };
}

function normalizeProvisioningJobSummary(raw: unknown) {
  const value = asRecord(raw);
  const base = normalizeProvisioningStatus(value);

  if (!base) {
    return null;
  }

  return {
    id: toStringId(value.id),
    ...base,
    createdAt: readNullableString(value.created_at ?? value.createdAt),
  };
}

function normalizeActionResult(raw: unknown): ActionResult | null {
  const value = asRecord(raw);

  if (Object.keys(value).length === 0) {
    return null;
  }

  return {
    success: readBoolean(value.success),
    code: readNullableString(value.code),
    detail: readNullableString(value.detail),
    operationId: readNullableString(value.operation_id ?? value.operationId),
  };
}

function normalizeServiceOperationLogSummary(raw: unknown): ServiceOperationLogSummary | null {
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) {
    return null;
  }

  const actor = asRecord(value.actor);

  return {
    id: toStringId(value.id),
    operationId: readString(value.operation_id ?? value.operationId),
    action: readString(value.action),
    source: readString(value.source, 'client'),
    success: value.success === null || value.success === undefined
      ? null
      : readBoolean(value.success),
    code: readNullableString(value.code),
    message: readNullableString(value.message),
    detail: readNullableString(value.detail),
    requestPayload: (() => {
      const payload = asRecord(value.request_payload ?? value.requestPayload);
      return Object.keys(payload).length > 0 ? payload : null;
    })(),
    responsePayload: (() => {
      const payload = asRecord(value.response_payload ?? value.responsePayload);
      return Object.keys(payload).length > 0 ? payload : null;
    })(),
    actor: Object.keys(actor).length > 0
      ? {
        id: toStringId(actor.id),
        name: readString(actor.name),
        email: readString(actor.email),
      }
      : null,
    createdAt: readNullableString(value.created_at ?? value.createdAt),
    updatedAt: readNullableString(value.updated_at ?? value.updatedAt),
  };
}

function normalizeCartSummary(raw: unknown): CartSummary {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
    items: readArray<unknown>(value.items).map((itemRaw) => {
      const item = asRecord(itemRaw);
      const plan = asRecord(item.plan);

      return {
        id: toStringId(item.id),
        quantity: readNumber(item.quantity) ?? 1,
        product: normalizeProductSummary(item.product),
        plan: {
          id: toStringId(plan.id),
          name: readString(plan.name, 'Default plan'),
          type: readNullableString(plan.type),
          billingPeriod: readNumber(plan.billing_period ?? plan.billingPeriod),
          billingUnit: readNullableString(plan.billing_unit ?? plan.billingUnit),
        },
        configOptions: readArray<unknown>(item.config_options ?? item.configOptions).map((entry) => {
          const config = asRecord(entry);

          return {
            optionId: toStringId(config.option_id ?? config.optionId),
            optionName: readString(config.option_name ?? config.optionName),
            optionType: readString(config.option_type ?? config.optionType),
            optionEnvVariable: readNullableString(config.option_env_variable ?? config.optionEnvVariable),
            value: readNullableString(config.value),
            valueName: readNullableString(config.value_name ?? config.valueName),
          };
        }),
        checkoutConfig: asRecord(item.checkout_config ?? item.checkoutConfig),
        price: normalizePriceBreakdown(item.price),
      };
    }),
    coupon: (() => {
      const coupon = asRecord(value.coupon);
      if (Object.keys(coupon).length === 0) {
        return null;
      }

      return {
        id: toStringId(coupon.id),
        code: readString(coupon.code),
        type: readNullableString(coupon.type),
        value: readNumber(coupon.value),
        recurring: readNumber(coupon.recurring),
        startsAt: readNullableString(coupon.starts_at ?? coupon.startsAt),
        expiresAt: readNullableString(coupon.expires_at ?? coupon.expiresAt),
      };
    })(),
    totals: normalizePriceBreakdown(value.totals),
    credits: (() => {
      const credit = asRecord(value.credits);
      if (Object.keys(credit).length === 0) {
        return null;
      }

      return {
        amount: readNumber(credit.amount) ?? 0,
        currencyCode: readString(credit.currency_code ?? credit.currencyCode, 'USD'),
        currency: normalizeCurrency(credit.currency),
        formattedAmount: readString(credit.formatted_amount ?? credit.formattedAmount),
      };
    })(),
    gateways: readArray<unknown>(value.gateways).map(normalizeGateway),
  };
}

function normalizeServiceSummary(raw: unknown): ServiceSummary {
  const value = asRecord(raw);
  const product = value.product ? normalizeProductSummary(value.product) : null;
  const propertyMap = buildPropertyMap(value.properties);
  const regionHint = readPropertyString(propertyMap, ['region', 'region_code', 'location', 'node', 'country']);
  const metadata = resolveRegionMetadata(
    value.region_code ?? value.regionCode ?? propertyMap.region ?? propertyMap.region_code,
    value.country_code ?? value.countryCode ?? propertyMap.country_code ?? propertyMap.country,
    regionHint,
    value.label,
    value.base_label ?? value.baseLabel,
    product?.slug,
    product?.category?.slug,
    product?.category?.name,
    product?.name,
  );
  const runtimeKind = normalizeRuntimeKind(
    value.runtime_kind ?? value.runtimeKind ?? propertyMap.runtime_kind,
    product?.slug,
    product?.category?.slug,
    value.label,
  );
  const rawOperatorOrigin = asRecord(value.operator_origin ?? value.operatorOrigin);
  const operatorOrigin = Object.keys(rawOperatorOrigin).length > 0
    ? {
      capsuleId: readNullableString(rawOperatorOrigin.capsule_id ?? rawOperatorOrigin.capsuleId),
      capsuleName: readString(rawOperatorOrigin.capsule_name ?? rawOperatorOrigin.capsuleName),
      entryKind: readNullableString(rawOperatorOrigin.entry_kind ?? rawOperatorOrigin.entryKind),
      stack: readNullableString(rawOperatorOrigin.stack),
      businessPath: readNullableString(rawOperatorOrigin.business_path ?? rawOperatorOrigin.businessPath),
      source: readNullableString(rawOperatorOrigin.source),
      planSummary: readNullableString(rawOperatorOrigin.plan_summary ?? rawOperatorOrigin.planSummary),
      previewUrl: readNullableString(rawOperatorOrigin.preview_url ?? rawOperatorOrigin.previewUrl),
      productionUrl: readNullableString(rawOperatorOrigin.production_url ?? rawOperatorOrigin.productionUrl),
      repoUrl: readNullableString(rawOperatorOrigin.repo_url ?? rawOperatorOrigin.repoUrl),
      bundleUrl: readNullableString(rawOperatorOrigin.bundle_url ?? rawOperatorOrigin.bundleUrl),
      manifestUrl: readNullableString(rawOperatorOrigin.manifest_url ?? rawOperatorOrigin.manifestUrl),
    }
    : null;

  return {
    id: toStringId(value.id),
    label: readString(value.label),
    baseLabel: readString(value.base_label ?? value.baseLabel),
    status: readString(value.status, 'unknown'),
    price: readNumber(value.price) ?? 0,
    quantity: readNumber(value.quantity) ?? 1,
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
    formattedPrice: readString(value.formatted_price ?? value.formattedPrice),
    expiresAt: readNullableString(value.expires_at ?? value.expiresAt),
    product,
    plan: (() => {
      const plan = asRecord(value.plan);
      if (Object.keys(plan).length === 0) {
        return null;
      }

      return {
        id: toStringId(plan.id),
        name: readString(plan.name),
        type: readNullableString(plan.type),
        billingPeriod: readNumber(plan.billing_period ?? plan.billingPeriod),
        billingUnit: readNullableString(plan.billing_unit ?? plan.billingUnit),
      };
    })(),
    cancellable: readBoolean(value.cancellable),
    upgradable: readBoolean(value.upgradable),
    cancellation: (() => {
      const cancellation = asRecord(value.cancellation);
      if (Object.keys(cancellation).length === 0) {
        return null;
      }

      return {
        id: toStringId(cancellation.id),
        type: readString(cancellation.type),
        reason: readString(cancellation.reason),
        createdAt: readNullableString(cancellation.created_at ?? cancellation.createdAt),
      };
    })(),
    countryCode: metadata.countryCode,
    regionCode: metadata.regionCode,
    selectedOs: readNullableString(value.selected_os ?? value.selectedOs) ?? readPropertyString(propertyMap, ['selected_os', 'os', 'template', 'image']),
    primaryAppSlug: readNullableString(value.primary_app_slug ?? value.primaryAppSlug) ?? readPropertyString(propertyMap, ['primary_app_slug']),
    addonAppSlugs: [
      ...new Set([
        ...readListValue(value.addon_app_slugs ?? value.addonAppSlugs),
        ...readListValue(propertyMap.addon_app_slugs),
      ]),
    ],
    runtimeKind,
    operatorOrigin,
    provisioning: normalizeProvisioningStatus(value.provisioning),
  };
}

function isServiceLikeRecord(raw: unknown) {
  const value = asRecord(raw);
  const id = toStringId(value.id);
  if (!id) {
    return false;
  }

  const hasLabel = readString(value.label).trim().length > 0
    || readString(value.base_label ?? value.baseLabel).trim().length > 0;
  const hasProduct = Object.keys(asRecord(value.product)).length > 0;
  const hasPlan = Object.keys(asRecord(value.plan)).length > 0;
  const hasLifecycleMeta = value.expires_at !== undefined
    || value.expiresAt !== undefined
    || value.cancellable !== undefined
    || value.upgradable !== undefined;

  // Drop clearly non-service payloads that can leak in from upstream edge cases.
  const looksLikeInvoice = value.number !== undefined && (value.due_at !== undefined || value.remaining !== undefined);
  if (looksLikeInvoice && !hasProduct && !hasPlan) {
    return false;
  }

  return hasLabel || hasProduct || hasPlan || hasLifecycleMeta;
}

function normalizeServiceDetail(raw: unknown): ServiceDetail {
  const value = asRecord(raw);
  const base = normalizeServiceSummary(value);
  const propertyMap = buildPropertyMap(value.properties);

  return {
    ...base,
    properties: readArray<unknown>(value.properties).map((entry) => {
      const property = asRecord(entry);

      return {
        key: readString(property.key),
        name: readString(property.name, readString(property.key)),
        value: readString(property.value),
      };
    }),
    configs: readArray<unknown>(value.configs).map((entry) => {
      const config = asRecord(entry);
      const option = asRecord(config.option);
      const configValue = asRecord(config.value);

      return {
        id: toStringId(config.id),
        option: Object.keys(option).length > 0
          ? {
            id: toStringId(option.id),
            name: readString(option.name),
            envVariable: readNullableString(option.env_variable ?? option.envVariable),
          }
          : null,
        value: Object.keys(configValue).length > 0
          ? {
            id: toStringId(configValue.id),
            name: readString(configValue.name),
            envVariable: readNullableString(configValue.env_variable ?? configValue.envVariable),
          }
          : null,
      };
    }),
    billingAgreement: (() => {
      const agreement = asRecord(value.billing_agreement ?? value.billingAgreement);
      if (Object.keys(agreement).length === 0) {
        return null;
      }

      return {
        id: toStringId(agreement.id),
        ulid: readString(agreement.ulid),
        name: readString(agreement.name),
        type: readNullableString(agreement.type),
        expiry: readNullableString(agreement.expiry),
        gateway: (() => {
          const gateway = asRecord(agreement.gateway);
          return Object.keys(gateway).length > 0 ? normalizeGateway(gateway) : null;
        })(),
      };
    })(),
    cancellation: (() => {
      const cancellation = asRecord(value.cancellation);
      if (Object.keys(cancellation).length === 0) {
        return null;
      }

      return {
        id: toStringId(cancellation.id),
        type: readString(cancellation.type),
        reason: readString(cancellation.reason),
        createdAt: readNullableString(cancellation.created_at ?? cancellation.createdAt),
      };
    })(),
    countryCode: base.countryCode ?? normalizeCountryCode(propertyMap.country_code ?? propertyMap.country),
    regionCode: base.regionCode ?? normalizeRegionCode(propertyMap.region_code ?? propertyMap.region),
    selectedOs: base.selectedOs ?? readPropertyString(propertyMap, ['selected_os', 'os', 'template', 'image']),
    primaryAppSlug: base.primaryAppSlug ?? readPropertyString(propertyMap, ['primary_app_slug']),
    addonAppSlugs: (base.addonAppSlugs ?? []).length > 0 ? (base.addonAppSlugs ?? []) : readListValue(propertyMap.addon_app_slugs),
    runtimeKind: base.runtimeKind ?? normalizeRuntimeKind(propertyMap.runtime_kind, value.label, base.product?.slug),
  };
}

function normalizeServiceAppInstall(raw: unknown): ServiceAppInstall {
  const value = asRecord(raw);
  const appValue = asRecord(value.app);
  const recipeValue = asRecord(value.recipe);
  const requestedBy = asRecord(value.requested_by ?? value.requestedBy);

  return {
    id: toStringId(value.id),
    source: readString(value.source),
    status: readString(value.status),
    isPrimary: readBoolean(value.is_primary ?? value.isPrimary),
    installStrategy: readNullableString(value.install_strategy ?? value.installStrategy),
    requestedOs: readNullableString(value.requested_os ?? value.requestedOs),
    attemptCount: readNumber(value.attempt_count ?? value.attemptCount) ?? 0,
    lastError: readNullableString(value.last_error ?? value.lastError),
    logs: readStringArray(value.logs),
    app: Object.keys(appValue).length > 0
      ? {
        id: toStringId(appValue.id),
        slug: readString(appValue.slug),
        name: readString(appValue.name),
        description: stripHtml(readString(appValue.description)),
        icon: readNullableString(appValue.icon),
        type: readString(appValue.type),
        tagline: readNullableString(appValue.tagline),
        category: (() => {
          const category = asRecord(appValue.category);
          if (Object.keys(category).length === 0) {
            return null;
          }

          return {
            id: toStringId(category.id),
            slug: readString(category.slug),
            name: readString(category.name),
            icon: readNullableString(category.icon),
          };
        })(),
      }
      : null,
    recipe: Object.keys(recipeValue).length > 0
      ? {
        id: toStringId(recipeValue.id),
        osVersion: readNullableString(recipeValue.os_version ?? recipeValue.osVersion),
        installStrategy: readNullableString(recipeValue.install_strategy ?? recipeValue.installStrategy),
        templateRef: readNullableString(recipeValue.template_ref ?? recipeValue.templateRef),
        panelPort: readNumber(recipeValue.panel_port ?? recipeValue.panelPort),
        panelPath: readNullableString(recipeValue.panel_path ?? recipeValue.panelPath),
        panelScheme: readNullableString(recipeValue.panel_scheme ?? recipeValue.panelScheme),
        panelLabel: readNullableString(recipeValue.panel_label ?? recipeValue.panelLabel),
        dependencies: readStringArray(recipeValue.dependencies),
        conflicts: readStringArray(recipeValue.conflicts),
      }
      : null,
    requestedBy: Object.keys(requestedBy).length > 0
      ? {
        id: toStringId(requestedBy.id),
        name: readString(requestedBy.name),
        email: readString(requestedBy.email),
      }
      : null,
    responsePayload: (() => {
      const payload = asRecord(value.response_payload ?? value.responsePayload);
      return Object.keys(payload).length > 0 ? payload : null;
    })(),
    requestPayload: (() => {
      const payload = asRecord(value.request_payload ?? value.requestPayload);
      return Object.keys(payload).length > 0 ? payload : null;
    })(),
    startedAt: readNullableString(value.started_at ?? value.startedAt),
    lastAttemptAt: readNullableString(value.last_attempt_at ?? value.lastAttemptAt),
    completedAt: readNullableString(value.completed_at ?? value.completedAt),
    installedAt: readNullableString(value.installed_at ?? value.installedAt),
    createdAt: readNullableString(value.created_at ?? value.createdAt),
    updatedAt: readNullableString(value.updated_at ?? value.updatedAt),
  };
}

function normalizeInvoiceSummary(raw: unknown) {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    number: readNullableString(value.number),
    status: readString(value.status, 'unknown'),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
    total: readNumber(value.total) ?? 0,
    remaining: readNumber(value.remaining) ?? 0,
    formattedTotal: readString(value.formatted_total ?? value.formattedTotal),
    formattedRemaining: readString(value.formatted_remaining ?? value.formattedRemaining),
    dueAt: readNullableString(value.due_at ?? value.dueAt),
    createdAt: readNullableString(value.created_at ?? value.createdAt),
    userName: readString(value.user_name ?? value.userName),
  };
}

function normalizeInvoiceDetail(raw: unknown): InvoiceDetail {
  const value = asRecord(raw);

  return {
    ...normalizeInvoiceSummary(value),
    items: readArray<unknown>(value.items).map((entry) => {
      const item = asRecord(entry);

      return {
        id: toStringId(item.id),
        description: readString(item.description),
        price: readNumber(item.price) ?? 0,
        quantity: readNumber(item.quantity) ?? 1,
        total: readNumber(item.total) ?? 0,
        formattedPrice: readString(item.formatted_price ?? item.formattedPrice),
        formattedTotal: readString(item.formatted_total ?? item.formattedTotal),
        referenceType: readNullableString(item.reference_type ?? item.referenceType),
        referenceId: readNullableString(item.reference_id ?? item.referenceId),
      };
    }),
    transactions: readArray<unknown>(value.transactions).map((entry) => {
      const tx = asRecord(entry);

      return {
        id: toStringId(tx.id),
        status: readString(tx.status, 'unknown'),
        amount: readNumber(tx.amount) ?? 0,
        fee: readNumber(tx.fee) ?? 0,
        transactionId: readNullableString(tx.transaction_id ?? tx.transactionId),
        gateway: (() => {
          const gateway = asRecord(tx.gateway);
          return Object.keys(gateway).length > 0 ? normalizeGateway(gateway) : null;
        })(),
        isCreditTransaction: readBoolean(tx.is_credit_transaction ?? tx.isCreditTransaction),
        createdAt: readNullableString(tx.created_at ?? tx.createdAt),
        updatedAt: readNullableString(tx.updated_at ?? tx.updatedAt),
      };
    }),
  };
}

function ensureToken(token?: string) {
  if (!token) {
    throw unauthorized();
  }

  return token;
}

function isNumericInvoiceId(value: string) {
  return /^\d+$/.test(value);
}

function extractNumericInvoiceId(value: string) {
  const match = value.match(/^inv[-_ ]?(\d+)$/i);
  return match ? match[1] : null;
}

function normalizeInvoiceReference(value: string) {
  const normalized = value.trim();
  const extracted = extractNumericInvoiceId(normalized);

  if (extracted) {
    return `INV-${extracted}`;
  }

  return normalized;
}

async function resolveInvoicePathId(config: GatewayConfig, token: string, invoiceRef: string) {
  const normalized = normalizeInvoiceReference(invoiceRef);
  if (normalized === '') {
    throw notFound('Invoice id is required.');
  }

  if (isNumericInvoiceId(normalized)) {
    return normalized;
  }

  try {
    const response = await requestPaymenter<{ data?: unknown }>(config, '/invoices?per_page=100', {
      token,
    });

    const target = normalized.toLowerCase();
    const hit = readArray<unknown>(response.data).find((entry) => {
      const record = asRecord(entry);
      const id = toStringId(record.id);
      const number = readString(record.number).toLowerCase();

      return id === normalized || number === target;
    });

    if (hit) {
      return toStringId(asRecord(hit).id);
    }
  } catch {
    // Fallback to the original reference if lookup endpoint is unavailable.
  }

  return normalized;
}

export function createGateway(config: GatewayConfig) {
  const isMock = config.mode === 'mock';

  return {
    async health() {
      return {
        ok: true,
        sourceMode: config.mode,
        generatedAt: new Date().toISOString(),
        paymenterApiUrl: config.apiUrl ? normalizeApiBaseUrl(config.apiUrl) : null,
      };
    },

    async categories(options?: CatalogReadOptions): Promise<CatalogCategoriesResponse> {
      const visibility = normalizeCatalogVisibility(options);
      if (isMock) {
        const mockCategories = filterCatalogCategories([
          {
            id: '1',
            slug: 'global-vps',
            fullSlug: 'global-vps',
            name: 'Global VPS',
            description: 'Mock category for local development mode.',
            image: null,
            parentId: null,
            sort: 1,
            productCount: 1,
          },
        ], visibility);

        return {
          data: mockCategories,
          meta: baseMeta(config.mode),
        };
      }

      const query = new URLSearchParams();
      query.set('only_with_products', '0');
      query.set('visibility', visibility);
      const response = await requestPaymenter<{ data: unknown[] }>(config, `/catalog/categories?${query.toString()}`);
      const categories = filterCatalogCategories(
        readArray<unknown>(response.data).map(normalizeCategory),
        visibility,
      );

      return {
        data: categories,
        meta: baseMeta(config.mode),
      };
    },

    async products(categorySlug?: string, perPage = 24, options?: CatalogReadOptions): Promise<CatalogProductsResponse> {
      const visibility = normalizeCatalogVisibility(options);
      if (isMock) {
        const category = {
          id: '1',
          slug: 'global-vps',
          name: 'Global VPS',
        };

        const item: ProductSummary = {
          id: '1',
          slug: 'starter-2c4g',
          name: 'Starter 2C4G',
          description: 'Mock product used when PAYMENTER_MODE=mock.',
          image: null,
          stock: 99,
          perUserLimit: 3,
          allowQuantityMode: 'combined',
          category,
          pricing: {
            planId: '1',
            planName: 'Monthly',
            billingPeriod: 1,
            billingUnit: 'month',
            price: 19,
            setupFee: 0,
            currencyCode: 'USD',
            currency: {
              code: 'USD',
              name: 'US Dollar',
              prefix: '$',
              suffix: null,
              format: '1,000.00',
            },
          },
        };

        const filtered = filterCatalogProducts(
          categorySlug && categorySlug !== category.slug ? [] : [item],
          visibility,
        );

        return {
          data: filtered,
          pagination: {
            currentPage: 1,
            perPage,
            total: filtered.length,
            lastPage: 1,
          },
          meta: baseMeta(config.mode),
        };
      }

      if (visibility === 'public' && isInternalCatalogCategorySlug(categorySlug ?? null)) {
        return {
          data: [],
          pagination: {
            currentPage: 1,
            perPage,
            total: 0,
            lastPage: 1,
          },
          meta: baseMeta(config.mode),
        };
      }

      const query = new URLSearchParams();
      query.set('per_page', String(perPage));
      query.set('visibility', visibility);

      if (categorySlug) {
        query.set('category', categorySlug);
      }

      const response = await requestPaymenter<{ data: unknown[]; meta?: unknown }>(
        config,
        `/catalog/products?${query.toString()}`,
      );
      const products = filterCatalogProducts(
        readArray<unknown>(response.data).map(normalizeProductSummary),
        visibility,
      );

      return {
        data: products,
        pagination: normalizePagination(response.meta),
        meta: baseMeta(config.mode),
      };
    },

    async category(categorySlug: string, options?: CatalogReadOptions): Promise<CatalogCategoryResponse> {
      const visibility = normalizeCatalogVisibility(options);
      if (visibility === 'public' && isInternalCatalogCategorySlug(categorySlug)) {
        throw notFound(`Category ${categorySlug} was not found.`);
      }

      const [categoriesResponse, productsResponse] = await Promise.all([
        this.categories({ visibility }),
        this.products(categorySlug, 24, { visibility }),
      ]);

      const category = categoriesResponse.data.find((entry) => entry.slug === categorySlug);

      if (!category) {
        throw notFound(`Category ${categorySlug} was not found.`);
      }

      return {
        data: {
          category,
          products: productsResponse.data,
        },
        pagination: productsResponse.pagination,
        meta: baseMeta(config.mode),
      };
    },

    async product(productSlug: string, options?: CatalogReadOptions): Promise<ProductDetailResponse> {
      const visibility = normalizeCatalogVisibility(options);
      if (isMock) {
        if (productSlug !== 'starter-2c4g') {
          throw notFound(`Product ${productSlug} was not found.`);
        }

        return {
          data: {
            id: '1',
            slug: 'starter-2c4g',
            name: 'Starter 2C4G',
            description: 'Mock product used when PAYMENTER_MODE=mock.',
            image: null,
            stock: 99,
            perUserLimit: 3,
            allowQuantityMode: 'combined',
            category: {
              id: '1',
              slug: 'global-vps',
              fullSlug: 'global-vps',
              name: 'Global VPS',
              description: 'Mock category for local development mode.',
              image: null,
              parentId: null,
              sort: 1,
              productCount: 1,
            },
            plans: [
              {
                id: '1',
                name: 'Monthly',
                type: 'recurring',
                billingPeriod: 1,
                billingUnit: 'month',
                sort: 1,
                prices: [
                  {
                    id: '1',
                    price: 19,
                    setupFee: 0,
                    currencyCode: 'USD',
                    currency: {
                      code: 'USD',
                      name: 'US Dollar',
                      prefix: '$',
                      suffix: null,
                      format: '1,000.00',
                    },
                  },
                ],
              },
            ],
            configOptions: [],
            operatingSystemOptions: [],
            checkoutFields: [],
            vpsAppMarketplace: null,
          },
          meta: baseMeta(config.mode),
        };
      }

      const query = new URLSearchParams();
      query.set('visibility', visibility);
      const suffix = query.toString();
      const response = await requestPaymenter<{ data?: { product?: unknown } }>(
        config,
        `/catalog/products/${productSlug}${suffix ? `?${suffix}` : ''}`,
      );
      const record = asRecord(response.data);
      const product = record.product;

      if (!product) {
        throw notFound(`Product ${productSlug} was not found.`);
      }

      return {
        data: normalizeProductDetail(product),
        meta: baseMeta(config.mode),
      };
    },

    async productVpsAppMarket(
      productSlug: string,
      selectedOs?: string | null,
      options?: CatalogReadOptions,
    ): Promise<VpsAppMarketplaceResponse> {
      const visibility = normalizeCatalogVisibility(options);
      if (isMock) {
        return {
          data: {
            enabled: true,
            selectedOs: selectedOs ?? 'Ubuntu 24.04',
            supportedOs: [
              {
                value: 'Ubuntu 24.04',
                label: 'Ubuntu 24.04',
                templateRef: null,
                templateUuid: null,
              },
            ],
            categories: [],
            primaryApps: [],
            addonApps: [],
            rules: {
              primaryRequired: false,
              maxPrimary: 1,
              allowAddons: true,
            },
            currentSelection: {
              primaryAppSlug: null,
              addonAppSlugs: [],
            },
          },
          meta: baseMeta(config.mode),
        };
      }

      const query = new URLSearchParams();
      query.set('visibility', visibility);
      if (selectedOs && selectedOs.trim() !== '') {
        query.set('os', selectedOs.trim());
      }

      const suffix = query.toString();
      const requestPath = `/catalog/products/${productSlug}/vps-app-market${suffix ? `?${suffix}` : ''}`;
      const response = await requestPaymenter<{ data?: unknown }>(config, requestPath);
      const requestedOs = selectedOs?.trim() || null;
      const normalized = normalizeVpsAppMarketplace(response.data);
      const hasApps = normalized.primaryApps.length > 0 || normalized.addonApps.length > 0;

      if (requestedOs && !hasApps) {
        const preferredFallback = normalized.supportedOs.find((option) => (
          /ubuntu\s*24\.04|ubuntu\s*22\.04|debian\s*12/i.test(`${option.value} ${option.label}`)
        ))?.value
          ?? normalized.supportedOs[0]?.value
          ?? null;

        if (preferredFallback && preferredFallback.toLowerCase() !== requestedOs.toLowerCase()) {
          const fallbackQuery = new URLSearchParams();
          fallbackQuery.set('visibility', visibility);
          fallbackQuery.set('os', preferredFallback);
          const fallbackPath = `/catalog/products/${productSlug}/vps-app-market?${fallbackQuery.toString()}`;

          try {
            const fallbackResponse = await requestPaymenter<{ data?: unknown }>(config, fallbackPath);
            const fallbackData = normalizeVpsAppMarketplace(fallbackResponse.data);
            const fallbackHasApps = fallbackData.primaryApps.length > 0 || fallbackData.addonApps.length > 0;

            if (fallbackHasApps) {
              return {
                data: {
                  ...fallbackData,
                  selectedOs: requestedOs,
                  compatibility: {
                    mode: 'fallback',
                    requestedOs,
                    fallbackOs: preferredFallback,
                    note: `App catalog for ${requestedOs} is not ready yet. Showing ${preferredFallback} recipes in compatibility mode.`,
                  },
                },
                meta: baseMeta(config.mode),
              };
            }
          } catch {
            // Keep the original empty result when fallback lookup is unavailable.
          }
        }
      }

      return {
        data: {
          ...normalized,
          compatibility: normalized.compatibility ?? {
            mode: 'native',
            requestedOs: requestedOs ?? normalized.selectedOs ?? null,
            fallbackOs: null,
            note: null,
          },
        },
        meta: baseMeta(config.mode),
      };
    },

    async home(options?: CatalogReadOptions): Promise<HomeResponse> {
      const visibility = normalizeCatalogVisibility(options);
      const [categoriesResponse, productsResponse] = await Promise.all([
        this.categories({ visibility }),
        this.products(undefined, 6, { visibility }),
      ]);

      return {
        data: {
          stats: [
            {
              label: 'Categories',
              value: String(categoriesResponse.data.length),
              hint: 'Served by headless catalog API.',
            },
            {
              label: 'Products',
              value: String(productsResponse.pagination?.total ?? productsResponse.data.length),
              hint: 'Live product and pricing data from Paymenter.',
            },
            {
              label: 'Mode',
              value: config.mode.toUpperCase(),
              hint: 'BFF contract is active on auth/catalog/cart/checkout.',
            },
          ],
          featuredProducts: productsResponse.data.slice(0, 3),
          categories: categoriesResponse.data,
        },
        meta: baseMeta(config.mode),
      };
    },

    async login(input: LoginInput): Promise<SessionAuthResponse> {
      if (isMock) {
        const user = createMockAuthUser({
          email: input.email,
        });
        return {
          message: 'Login successful (mock).',
          data: {
            accessToken: createMockAuthToken({
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            }),
            tokenType: 'Bearer',
            user,
          },
        };
      }

      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/auth/login', {
        method: 'POST',
        body: {
          email: input.email,
          password: input.password,
          ...(input.code ? { code: input.code } : {}),
          device_name: input.deviceName ?? 'Sloth Cloud Web',
        },
      });

      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Login successful.'),
        data: {
          accessToken: readString(data.access_token ?? data.accessToken),
          tokenType: readString(data.token_type ?? data.tokenType, 'Bearer'),
          user: normalizeAuthUser(data.user),
        },
      };
    },

    async register(input: RegisterInput): Promise<SessionAuthResponse> {
      if (isMock) {
        const user = createMockAuthUser({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
        });
        return {
          message: 'Registration successful (mock).',
          data: {
            accessToken: createMockAuthToken({
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            }),
            tokenType: 'Bearer',
            user,
          },
        };
      }

      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/auth/register', {
        method: 'POST',
        body: {
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          password: input.password,
          password_confirmation: input.passwordConfirmation,
          device_name: input.deviceName ?? 'Sloth Cloud Web',
          ...(input.referralCode ? { referral_code: input.referralCode } : {}),
        },
      });

      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Registration successful.'),
        data: {
          accessToken: readString(data.access_token ?? data.accessToken),
          tokenType: readString(data.token_type ?? data.tokenType, 'Bearer'),
          user: normalizeAuthUser(data.user),
        },
      };
    },

    async me(token?: string): Promise<MeResponse> {
      if (isMock) {
        const tokenUser = parseMockAuthToken(token);
        return {
          data: {
            user: createMockAuthUser({
              email: tokenUser?.email ?? 'demo@slothcloud.test',
              firstName: tokenUser?.firstName ?? 'Sloth',
              lastName: tokenUser?.lastName ?? 'Cloud',
            }),
          },
        };
      }

      const response = await requestPaymenter<{ data?: unknown }>(config, '/auth/me', {
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        data: {
          user: normalizeAuthUser(data.user),
        },
      };
    },

    async logout(token?: string): Promise<LogoutResponse> {
      if (isMock) {
        return {
          message: 'Logged out successfully (mock).',
        };
      }

      const response = await requestPaymenter<{ message?: unknown }>(config, '/auth/logout', {
        method: 'POST',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Logged out successfully.'),
      };
    },

    async cart(token?: string): Promise<CartResponse> {
      const response = await requestPaymenter<{ data?: unknown }>(config, '/cart', {
        token: ensureToken(token),
      });

      return {
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async addCartItem(token: string | undefined, input: AddCartItemInput) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/cart/items', {
        method: 'POST',
        token: ensureToken(token),
        body: {
          product_slug: input.productSlug,
          plan_id: input.planId,
          quantity: input.quantity,
          config_options: input.configOptions ?? {},
          checkout_config: input.checkoutConfig ?? {},
        },
      });

      return {
        message: readString(response.message, 'Item added to cart.'),
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async updateCartItem(token: string | undefined, itemId: string, input: UpdateCartItemInput) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/cart/items/${itemId}`, {
        method: 'PATCH',
        token: ensureToken(token),
        body: {
          quantity: input.quantity,
        },
      });

      return {
        message: readString(response.message, 'Cart item updated.'),
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async removeCartItem(token: string | undefined, itemId: string) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/cart/items/${itemId}`, {
        method: 'DELETE',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Cart item removed.'),
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async applyCoupon(token: string | undefined, code: string) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/cart/coupon', {
        method: 'POST',
        token: ensureToken(token),
        body: { code },
      });

      return {
        message: readString(response.message, 'Coupon applied.'),
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async removeCoupon(token: string | undefined) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/cart/coupon', {
        method: 'DELETE',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Coupon removed.'),
        data: normalizeCartSummary(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async checkout(token: string | undefined, input: CheckoutInput): Promise<CheckoutResponse> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/checkout', {
        method: 'POST',
        token: ensureToken(token),
        body: {
          tos: input.tos ?? true,
          ...(input.referralCode ? { referral_code: input.referralCode } : {}),
        },
      });
      const data = asRecord(response.data);
      const order = asRecord(data.order);
      const services = readArray<unknown>(order.services).map(normalizeServiceSummary);
      const upstreamRedirect = asRecord(data.redirect);
      const upstreamRedirectPath = readString(upstreamRedirect.path, '/services');
      const singleServiceRedirectPath = services.length === 1 && services[0]?.id
        ? `/services/${encodeURIComponent(services[0].id)}`
        : null;
      const redirectPath = singleServiceRedirectPath && (upstreamRedirectPath === '' || upstreamRedirectPath === '/services')
        ? singleServiceRedirectPath
        : upstreamRedirectPath;
      const redirectType = singleServiceRedirectPath && redirectPath === singleServiceRedirectPath
        ? 'service'
        : readString(upstreamRedirect.type, 'services');

      return {
        message: readString(response.message, 'Order created successfully.'),
        data: {
          order: {
            id: toStringId(order.id),
            currencyCode: readString(order.currency_code ?? order.currencyCode, 'USD'),
            total: readNumber(order.total) ?? 0,
            formattedTotal: readString(order.formatted_total ?? order.formattedTotal),
            services,
          },
          invoice: data.invoice ? normalizeInvoiceDetail(data.invoice) : null,
          redirect: {
            type: redirectType,
            path: redirectPath,
          },
        },
        meta: baseMeta(config.mode),
      };
    },

    async trackAffiliate(code: string) {
      if (isMock) {
        return {
          data: {
            valid: code.trim().length >= 5,
            affiliate: code.trim().length >= 5
              ? {
                id: 'mock-affiliate',
                code: code.trim(),
                reward: 10,
              }
              : null,
          },
          meta: baseMeta(config.mode),
        };
      }

      const response = await requestPaymenter<{ data?: unknown }>(config, '/affiliate/track', {
        method: 'POST',
        body: {
          code,
        },
      });
      const data = asRecord(response.data);
      const affiliate = asRecord(data.affiliate);

      return {
        data: {
          valid: readBoolean(data.valid),
          affiliate: Object.keys(affiliate).length > 0
            ? {
              id: toStringId(affiliate.id),
              code: readString(affiliate.code),
              reward: readNumber(affiliate.reward),
            }
            : null,
        },
        meta: baseMeta(config.mode),
      };
    },

    async affiliateMe(token: string | undefined): Promise<{ data: AffiliateProfile; meta: ApiMeta }> {
      if (isMock) {
        return {
          data: {
            program: {
              defaultReward: 10,
              codeType: 'random',
            },
            affiliate: null,
          },
          meta: baseMeta(config.mode),
        };
      }

      const response = await requestPaymenter<{ data?: unknown }>(config, '/affiliate/me', {
        token: ensureToken(token),
      });

      return {
        data: normalizeAffiliateProfile(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async affiliateEnroll(token: string | undefined, code?: string): Promise<{ message: string; data: AffiliateProfile; meta: ApiMeta }> {
      if (isMock) {
        return {
          message: 'Affiliate enrollment successful (mock).',
          data: {
            program: {
              defaultReward: 10,
              codeType: code ? 'custom' : 'random',
            },
            affiliate: {
              id: 'mock-affiliate',
              code: code ?? 'MOCKAFF001',
              enabled: true,
              visitors: 0,
              signups: 0,
              validOrders: 0,
              reward: 10,
              customReward: null,
              discount: null,
              earnings: {},
              credits: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
          meta: baseMeta(config.mode),
        };
      }

      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, '/affiliate/enroll', {
        method: 'POST',
        token: ensureToken(token),
        body: {
          ...(code ? { code } : {}),
        },
      });

      return {
        message: readString(response.message, 'Affiliate enrollment successful.'),
        data: normalizeAffiliateProfile(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async affiliateOrders(token: string | undefined, limit = 20): Promise<{ data: { items: AffiliateOrderSummary[] }; meta: ApiMeta }> {
      if (isMock) {
        return {
          data: {
            items: [],
          },
          meta: baseMeta(config.mode),
        };
      }

      const response = await requestPaymenter<{ data?: unknown }>(config, `/affiliate/orders?limit=${encodeURIComponent(String(limit))}`, {
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        data: {
          items: readArray<unknown>(data.items).map(normalizeAffiliateOrderSummary),
        },
        meta: baseMeta(config.mode),
      };
    },

    async services(token: string | undefined, status?: string, perPage = 20): Promise<ServicesResponse> {
      const query = new URLSearchParams();
      query.set('per_page', String(perPage));
      if (status) {
        query.set('status', status);
      }

      const response = await requestPaymenter<{ data?: unknown; meta?: unknown }>(config, `/services?${query.toString()}`, {
        token: ensureToken(token),
      });

      const services = readArray<unknown>(response.data)
        .filter(isServiceLikeRecord)
        .map(normalizeServiceSummary);

      return {
        data: services,
        pagination: normalizePagination(response.meta),
        meta: baseMeta(config.mode),
      };
    },

    async service(token: string | undefined, serviceId: string): Promise<ServiceResponse> {
      const response = await requestPaymenter<{ data?: unknown }>(config, `/services/${serviceId}`, {
        token: ensureToken(token),
      });

      const data = asRecord(response.data);

      return {
        data: {
          service: normalizeServiceDetail(data.service),
          invoices: readArray<unknown>(data.invoices).map(normalizeInvoiceSummary),
          actions: {
            buttons: readArray<AnyRecord>(asRecord(data.actions).buttons),
            views: readArray<AnyRecord>(asRecord(data.actions).views),
            fields: readArray<AnyRecord>(asRecord(data.actions).fields),
          },
        },
        meta: baseMeta(config.mode),
      };
    },

    async serviceApps(token: string | undefined, serviceId: string): Promise<ServiceAppsResponse> {
      const response = await requestPaymenter<{ data?: unknown }>(config, `/services/${serviceId}/apps`, {
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        data: {
          serviceId: toStringId(data.service_id ?? data.serviceId),
          selectedOs: readNullableString(data.selected_os ?? data.selectedOs),
          primaryAppSlug: readNullableString(data.primary_app_slug ?? data.primaryAppSlug),
          addonAppSlugs: readStringArray(data.addon_app_slugs ?? data.addonAppSlugs),
          panelUrl: readNullableString(data.panel_url ?? data.panelUrl),
          panelLabel: readNullableString(data.panel_label ?? data.panelLabel),
          panelHost: readNullableString(data.panel_host ?? data.panelHost),
          panelPort: readNumber(data.panel_port ?? data.panelPort),
          panelPath: readNullableString(data.panel_path ?? data.panelPath),
          panelUsername: readNullableString(data.panel_username ?? data.panelUsername),
          panelPassword: readNullableString(data.panel_password ?? data.panelPassword),
          installs: readArray<unknown>(data.installs).map(normalizeServiceAppInstall),
          catalog: data.catalog ? normalizeVpsAppMarketplace(data.catalog) : null,
        },
        meta: baseMeta(config.mode),
      };
    },

    async prepareReinstallServiceApps(
      token: string | undefined,
      serviceId: string,
      input: ReinstallServiceAppsInput,
    ): Promise<{ message: string; data: Record<string, unknown>; meta: ApiMeta }> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/apps/reinstall-plan`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          selected_os: input.selectedOs,
          primary_app_slug: input.primaryAppSlug ?? null,
          addon_app_slugs: input.addonAppSlugs ?? [],
          preview_only: input.previewOnly ?? false,
        },
      });

      return {
        message: readString(response.message, input.previewOnly ? 'Reinstall app plan validated.' : 'Reinstall app plan prepared.'),
        data: asRecord(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async installServiceApps(
      token: string | undefined,
      serviceId: string,
      addonAppSlugs: string[],
    ): Promise<ServiceAppsInstallResponse> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/apps/install`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          addon_app_slugs: addonAppSlugs,
        },
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Addon app installation queued.'),
        data: {
          serviceId: data.service_id === undefined && data.serviceId === undefined ? null : toStringId(data.service_id ?? data.serviceId),
          queued: readArray<unknown>(data.queued).map(normalizeServiceAppInstall),
          install: null,
          apps: (() => {
            const apps = asRecord(data.apps);
            return {
              serviceId: toStringId(apps.service_id ?? apps.serviceId),
              selectedOs: readNullableString(apps.selected_os ?? apps.selectedOs),
              primaryAppSlug: readNullableString(apps.primary_app_slug ?? apps.primaryAppSlug),
              addonAppSlugs: readStringArray(apps.addon_app_slugs ?? apps.addonAppSlugs),
              panelUrl: readNullableString(apps.panel_url ?? apps.panelUrl),
              panelLabel: readNullableString(apps.panel_label ?? apps.panelLabel),
              panelHost: readNullableString(apps.panel_host ?? apps.panelHost),
              panelPort: readNumber(apps.panel_port ?? apps.panelPort),
              panelPath: readNullableString(apps.panel_path ?? apps.panelPath),
              panelUsername: readNullableString(apps.panel_username ?? apps.panelUsername),
              panelPassword: readNullableString(apps.panel_password ?? apps.panelPassword),
              installs: readArray<unknown>(apps.installs).map(normalizeServiceAppInstall),
              catalog: apps.catalog ? normalizeVpsAppMarketplace(apps.catalog) : null,
            };
          })(),
        },
        meta: baseMeta(config.mode),
      };
    },

    async retryServiceAppInstall(
      token: string | undefined,
      serviceId: string,
      installId: string,
    ): Promise<ServiceAppsInstallResponse> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/apps/${installId}/retry`, {
        method: 'POST',
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'App installation retry queued.'),
        data: {
          serviceId: toStringId(serviceId),
          queued: [],
          install: (() => {
            const install = asRecord(data.install);
            return Object.keys(install).length > 0 ? normalizeServiceAppInstall(install) : null;
          })(),
          apps: (() => {
            const apps = asRecord(data.apps);
            return {
              serviceId: toStringId(apps.service_id ?? apps.serviceId),
              selectedOs: readNullableString(apps.selected_os ?? apps.selectedOs),
              primaryAppSlug: readNullableString(apps.primary_app_slug ?? apps.primaryAppSlug),
              addonAppSlugs: readStringArray(apps.addon_app_slugs ?? apps.addonAppSlugs),
              panelUrl: readNullableString(apps.panel_url ?? apps.panelUrl),
              panelLabel: readNullableString(apps.panel_label ?? apps.panelLabel),
              panelHost: readNullableString(apps.panel_host ?? apps.panelHost),
              panelPort: readNumber(apps.panel_port ?? apps.panelPort),
              panelPath: readNullableString(apps.panel_path ?? apps.panelPath),
              panelUsername: readNullableString(apps.panel_username ?? apps.panelUsername),
              panelPassword: readNullableString(apps.panel_password ?? apps.panelPassword),
              installs: readArray<unknown>(apps.installs).map(normalizeServiceAppInstall),
              catalog: apps.catalog ? normalizeVpsAppMarketplace(apps.catalog) : null,
            };
          })(),
        },
        meta: baseMeta(config.mode),
      };
    },

    async serviceAppInstallLogs(
      token: string | undefined,
      serviceId: string,
      installId: string,
    ): Promise<ServiceAppInstallLogsResponse> {
      const response = await requestPaymenter<{ data?: unknown }>(config, `/services/${serviceId}/apps/${installId}/logs`, {
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        data: {
          serviceId: toStringId(data.service_id ?? data.serviceId),
          installId: toStringId(data.install_id ?? data.installId),
          logs: readStringArray(data.logs),
        },
        meta: baseMeta(config.mode),
      };
    },

    async serviceProvisioning(token: string | undefined, serviceId: string): Promise<ServiceProvisioningResponse> {
      const response = await requestPaymenter<{ data?: unknown }>(config, `/services/${serviceId}/provisioning`, {
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        data: {
          serviceId: toStringId(data.service_id ?? data.serviceId),
          latest: normalizeProvisioningJobSummary(data.latest),
          history: readArray<unknown>(data.history)
            .map(normalizeProvisioningJobSummary)
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
        },
        meta: baseMeta(config.mode),
      };
    },

    async retryServiceProvisioning(
      token: string | undefined,
      serviceId: string,
      options: { force?: boolean; accountPassword?: string } = {},
    ): Promise<ServiceProvisioningRetryResponse> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/provisioning/retry`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          force: Boolean(options.force),
          ...(options.accountPassword ? { account_password: options.accountPassword } : {}),
        },
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Provisioning retry has been scheduled.'),
        data: {
          jobId: toStringId(data.job_id ?? data.jobId),
          status: readString(data.status),
          attemptCount: readNumber(data.attempt_count ?? data.attemptCount) ?? 0,
          force: readBoolean(data.force),
        },
        meta: baseMeta(config.mode),
      };
    },

    async updateServiceLabel(token: string | undefined, serviceId: string, label: string | null) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/label`, {
        method: 'PATCH',
        token: ensureToken(token),
        body: { label },
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Service label updated.'),
        data: {
          service: normalizeServiceDetail(asRecord(data.service)),
        },
        meta: baseMeta(config.mode),
      };
    },

    async cancelService(token: string | undefined, serviceId: string, input: CancelServiceInput): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(config, `/services/${serviceId}/cancel`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          type: input.type,
          reason: input.reason,
          current_password: input.currentPassword,
        },
      });

      return {
        message: readString(response.message, 'Cancellation requested.'),
        data: response.data,
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async revokeServiceCancellation(token: string | undefined, serviceId: string): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(config, `/services/${serviceId}/cancel`, {
        method: 'DELETE',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Cancellation request removed.'),
        data: response.data,
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async renewService(token: string | undefined, serviceId: string): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(config, `/services/${serviceId}/renew`, {
        method: 'POST',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Renewal invoice created.'),
        data: response.data,
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async serviceUpgradeOptions(token: string | undefined, serviceId: string): Promise<{ data: Record<string, unknown>; meta: ApiMeta }> {
      const response = await requestPaymenter<{ data?: unknown }>(config, `/services/${serviceId}/upgrade-options`, {
        token: ensureToken(token),
      });

      return {
        data: asRecord(response.data),
        meta: baseMeta(config.mode),
      };
    },

    async upgradeService(
      token: string | undefined,
      serviceId: string,
      input: UpgradeServiceInput,
    ): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(config, `/services/${serviceId}/upgrade`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          ...(input.productId !== undefined && input.productId !== null && String(input.productId).trim() !== ''
            ? { product_id: Number(input.productId) }
            : {}),
          config_options: input.configOptions ?? {},
        },
      });

      return {
        message: readString(response.message, 'Upgrade request submitted.'),
        data: response.data,
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async storeServicePassword(
      token: string | undefined,
      serviceId: string,
      input: StoreServicePasswordInput,
    ) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/credentials/password`, {
        method: 'PUT',
        token: ensureToken(token),
        body: {
          password: input.password,
          source: input.source,
          username: input.username,
          apply_mode: input.applyMode,
          restart_required: input.restartRequired,
          applied_live: input.appliedLive,
          note: input.note,
        },
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Service password has been stored.'),
        data: {
          service: normalizeServiceDetail(asRecord(data.service)),
        },
        meta: baseMeta(config.mode),
      };
    },

    async clearServiceRuntimeMapping(
      token: string | undefined,
      serviceId: string,
      input: ClearRuntimeMappingInput = {},
    ): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/runtime-mapping/clear`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          provider: input.provider ?? 'convoy',
          reason: input.reason ?? null,
          current_refs: input.currentRefs ?? [],
          force: input.force ?? false,
        },
      });

      return {
        message: readString(response.message, 'Runtime mapping cleared.'),
        data: response.data,
        actionResult: null,
        meta: baseMeta(config.mode),
      };
    },

    async serviceAction(
      token: string | undefined,
      serviceId: string,
      action: string,
      payload: Record<string, unknown> = {},
    ): Promise<ActionResponse<unknown>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(config, `/services/${serviceId}/actions/${encodeURIComponent(action)}`, {
        method: 'POST',
        token: ensureToken(token),
        body: payload,
      });

      return {
        message: readString(response.message, 'Service action executed.'),
        data: response.data,
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async serviceOperationLogs(
      token: string | undefined,
      serviceId: string,
      limit = 10,
    ): Promise<ServiceOperationLogsResponse> {
      const query = new URLSearchParams();
      query.set('limit', String(limit));

      const response = await requestPaymenter<{ data?: unknown }>(
        config,
        `/services/${serviceId}/operation-logs?${query.toString()}`,
        {
          token: ensureToken(token),
        },
      );
      const data = asRecord(response.data);

      return {
        data: {
          serviceId: toStringId(data.service_id ?? data.serviceId),
          logs: readArray<unknown>(data.logs)
            .map(normalizeServiceOperationLogSummary)
            .filter((entry): entry is ServiceOperationLogSummary => entry !== null),
        },
        meta: baseMeta(config.mode),
      };
    },

    async createServiceOperationLog(
      token: string | undefined,
      serviceId: string,
      input: CreateServiceOperationLogInput,
    ): Promise<ActionResponse<{ log: ServiceOperationLogSummary | null }>> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown; action_result?: unknown }>(
        config,
        `/services/${serviceId}/operation-logs`,
        {
          method: 'POST',
          token: ensureToken(token),
          body: {
            source: input.source,
            action: input.action,
            success: input.success,
            code: input.code,
            message: input.message,
            detail: input.detail,
            request_payload: input.requestPayload,
            response_payload: input.responsePayload,
          },
        },
      );
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Service operation log recorded.'),
        data: {
          log: normalizeServiceOperationLogSummary(data.log),
        },
        actionResult: normalizeActionResult(response.action_result),
        meta: baseMeta(config.mode),
      };
    },

    async invoices(token: string | undefined, perPage = 20): Promise<InvoicesResponse> {
      const query = new URLSearchParams();
      query.set('per_page', String(perPage));

      const response = await requestPaymenter<{ data?: unknown; meta?: unknown }>(config, `/invoices?${query.toString()}`, {
        token: ensureToken(token),
      });

      return {
        data: readArray<unknown>(response.data).map(normalizeInvoiceSummary),
        pagination: normalizePagination(response.meta),
        meta: baseMeta(config.mode),
      };
    },

    async invoice(token: string | undefined, invoiceId: string): Promise<InvoiceResponse> {
      const accessToken = ensureToken(token);
      const resolvedInvoiceId = await resolveInvoicePathId(config, accessToken, invoiceId);
      const response = await requestPaymenter<{ data?: unknown }>(
        config,
        `/invoices/${encodeURIComponent(resolvedInvoiceId)}`,
        {
          token: accessToken,
        },
      );

      const data = asRecord(response.data);

      return {
        data: {
          invoice: normalizeInvoiceDetail(data.invoice),
          gateways: readArray<unknown>(data.gateways).map(normalizeGateway),
          paymentMethods: readArray<unknown>(data.payment_methods ?? data.paymentMethods).map((entry) => {
            const agreement = asRecord(entry);
            return {
              id: toStringId(agreement.id),
              ulid: readString(agreement.ulid),
              name: readString(agreement.name),
              type: readNullableString(agreement.type),
              expiry: readNullableString(agreement.expiry),
              gateway: (() => {
                const gateway = asRecord(agreement.gateway);
                return Object.keys(gateway).length > 0 ? normalizeGateway(gateway) : null;
              })(),
            };
          }),
          recurringServices: readArray<unknown>(data.recurring_services ?? data.recurringServices).map(normalizeServiceSummary),
          credits: (() => {
            const credit = asRecord(data.credits);
            if (Object.keys(credit).length === 0) {
              return null;
            }

            return {
              amount: readNumber(credit.amount) ?? 0,
              currencyCode: readString(credit.currency_code ?? credit.currencyCode, 'USD'),
              currency: normalizeCurrency(credit.currency),
              formattedAmount: readString(credit.formatted_amount ?? credit.formattedAmount),
            };
          })(),
        },
        meta: baseMeta(config.mode),
      };
    },

    async payInvoice(token: string | undefined, invoiceId: string, input: PayInvoiceInput): Promise<InvoicePayResponse> {
      const accessToken = ensureToken(token);
      const resolvedInvoiceId = await resolveInvoicePathId(config, accessToken, invoiceId);
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(
        config,
        `/invoices/${encodeURIComponent(resolvedInvoiceId)}/pay`,
        {
          method: 'POST',
          token: accessToken,
          body: {
            method: input.method,
            gateway_id: input.gatewayId,
            billing_agreement_ulid: input.billingAgreementUlid,
            set_as_default: input.setAsDefault,
            frontend_return_url: input.frontendReturnUrl,
          },
        },
      );

      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Payment initialized.'),
        data: {
          redirectUrl: readNullableString(data.redirect_url ?? data.redirectUrl),
          paymentHtml: readNullableString(data.payment_html ?? data.paymentHtml),
          invoice: data.invoice ? normalizeInvoiceDetail(data.invoice) : null,
        },
        meta: baseMeta(config.mode),
      };
    },
  };
}

export { GatewayError };
