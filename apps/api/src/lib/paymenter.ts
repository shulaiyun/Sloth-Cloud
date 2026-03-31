import type {
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
  ServiceProvisioningResponse,
  ServiceProvisioningRetryResponse,
  ServiceResponse,
  ServiceSummary,
  ServicesResponse,
  SourceMode,
} from './types.js';

export interface GatewayConfig {
  apiUrl?: string;
  mode: SourceMode;
  timeoutMs: number;
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
}

export interface CancelServiceInput {
  type: 'end_of_period' | 'immediate';
  reason: string;
}

export interface PayInvoiceInput {
  method: 'credit' | 'gateway' | 'saved';
  gatewayId?: number;
  billingAgreementUlid?: string;
  setAsDefault?: boolean;
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

function readArray<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
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
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

function normalizeCategory(raw: unknown): CategorySummary {
  const value = asRecord(raw);

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

  return {
    id: toStringId(value.id),
    slug: readString(value.slug),
    name: readString(value.name, 'Untitled product'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    stock: readNumber(value.stock),
    perUserLimit: readNumber(value.per_user_limit ?? value.perUserLimit),
    allowQuantityMode: readNullableString(value.allow_quantity ?? value.allowQuantityMode ?? value.allowQuantity),
    category: hasCategory ? {
      id: toStringId(categoryValue.id),
      slug: readString(categoryValue.slug),
      name: readString(categoryValue.name, 'Catalog'),
    } : null,
    pricing: normalizeProductPricing(value.pricing),
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

function normalizeConfigOptionChoice(raw: unknown): ConfigOptionChoice {
  const value = asRecord(raw);

  return {
    id: toStringId(value.id),
    name: readString(value.name, 'Option'),
    description: stripHtml(readString(value.description)),
    envVariable: readNullableString(value.env_variable ?? value.envVariable),
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
  };
}

function normalizeCheckoutField(raw: unknown): CheckoutField {
  const value = asRecord(raw);
  const options = readArray<unknown>(value.options).map((entry) => {
    const option = asRecord(entry);

    return {
      value: readString(option.value),
      label: readString(option.label),
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
    product: value.product ? normalizeProductSummary(value.product) : null,
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

    async categories(): Promise<CatalogCategoriesResponse> {
      if (isMock) {
        return {
          data: [
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
          ],
          meta: baseMeta(config.mode),
        };
      }

      // Force full category list to avoid upstream defaults that only return non-empty categories.
      const response = await requestPaymenter<{ data: unknown[] }>(config, '/catalog/categories?only_with_products=0');

      return {
        data: readArray<unknown>(response.data).map(normalizeCategory),
        meta: baseMeta(config.mode),
      };
    },

    async products(categorySlug?: string, perPage = 24): Promise<CatalogProductsResponse> {
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

        const filtered = categorySlug && categorySlug !== category.slug ? [] : [item];

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

      const query = new URLSearchParams();
      query.set('per_page', String(perPage));

      if (categorySlug) {
        query.set('category', categorySlug);
      }

      const response = await requestPaymenter<{ data: unknown[]; meta?: unknown }>(
        config,
        `/catalog/products?${query.toString()}`,
      );

      return {
        data: readArray<unknown>(response.data).map(normalizeProductSummary),
        pagination: normalizePagination(response.meta),
        meta: baseMeta(config.mode),
      };
    },

    async category(categorySlug: string): Promise<CatalogCategoryResponse> {
      const [categoriesResponse, productsResponse] = await Promise.all([
        this.categories(),
        this.products(categorySlug),
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

    async product(productSlug: string): Promise<ProductDetailResponse> {
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
          },
          meta: baseMeta(config.mode),
        };
      }

      const response = await requestPaymenter<{ data?: { product?: unknown } }>(config, `/catalog/products/${productSlug}`);
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

    async home(): Promise<HomeResponse> {
      const [categoriesResponse, productsResponse] = await Promise.all([
        this.categories(),
        this.products(undefined, 6),
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
        return {
          message: 'Login successful (mock).',
          data: {
            accessToken: 'mock-access-token',
            tokenType: 'Bearer',
            user: {
              id: '1',
              firstName: 'Sloth',
              lastName: 'Cloud',
              name: 'Sloth Cloud',
              email: 'demo@slothcloud.test',
              emailVerifiedAt: null,
              avatar: null,
              properties: [],
            },
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
        return {
          message: 'Registration successful (mock).',
          data: {
            accessToken: 'mock-access-token',
            tokenType: 'Bearer',
            user: {
              id: '1',
              firstName: input.firstName,
              lastName: input.lastName,
              name: `${input.firstName} ${input.lastName}`.trim(),
              email: input.email,
              emailVerifiedAt: null,
              avatar: null,
              properties: [],
            },
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
        return {
          data: {
            user: {
              id: '1',
              firstName: 'Sloth',
              lastName: 'Cloud',
              name: 'Sloth Cloud',
              email: 'demo@slothcloud.test',
              emailVerifiedAt: null,
              avatar: null,
              properties: [],
            },
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
        },
      });
      const data = asRecord(response.data);
      const order = asRecord(data.order);

      return {
        message: readString(response.message, 'Order created successfully.'),
        data: {
          order: {
            id: toStringId(order.id),
            currencyCode: readString(order.currency_code ?? order.currencyCode, 'USD'),
            total: readNumber(order.total) ?? 0,
            formattedTotal: readString(order.formatted_total ?? order.formattedTotal),
            services: readArray<unknown>(order.services).map(normalizeServiceSummary),
          },
          invoice: data.invoice ? normalizeInvoiceDetail(data.invoice) : null,
          redirect: {
            type: readString(asRecord(data.redirect).type, 'services'),
            path: readString(asRecord(data.redirect).path, '/services'),
          },
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

    async retryServiceProvisioning(token: string | undefined, serviceId: string): Promise<ServiceProvisioningRetryResponse> {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/provisioning/retry`, {
        method: 'POST',
        token: ensureToken(token),
      });
      const data = asRecord(response.data);

      return {
        message: readString(response.message, 'Provisioning retry has been scheduled.'),
        data: {
          jobId: toStringId(data.job_id ?? data.jobId),
          status: readString(data.status),
          attemptCount: readNumber(data.attempt_count ?? data.attemptCount) ?? 0,
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

    async cancelService(token: string | undefined, serviceId: string, input: CancelServiceInput) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/cancel`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          type: input.type,
          reason: input.reason,
        },
      });

      return {
        message: readString(response.message, 'Cancellation requested.'),
        data: response.data,
        meta: baseMeta(config.mode),
      };
    },

    async serviceAction(token: string | undefined, serviceId: string, action: string, payload: Record<string, unknown> = {}) {
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/services/${serviceId}/actions/${encodeURIComponent(action)}`, {
        method: 'POST',
        token: ensureToken(token),
        body: payload,
      });

      return {
        message: readString(response.message, 'Service action executed.'),
        data: response.data,
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
      const response = await requestPaymenter<{ data?: unknown }>(config, `/invoices/${invoiceId}`, {
        token: ensureToken(token),
      });

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
      const response = await requestPaymenter<{ message?: unknown; data?: unknown }>(config, `/invoices/${invoiceId}/pay`, {
        method: 'POST',
        token: ensureToken(token),
        body: {
          method: input.method,
          gateway_id: input.gatewayId,
          billing_agreement_ulid: input.billingAgreementUlid,
          set_as_default: input.setAsDefault,
        },
      });

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

