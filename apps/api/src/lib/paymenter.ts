import type {
  ApiMeta,
  AuthResponse,
  AuthUser,
  CatalogCategoriesResponse,
  CatalogCategoryResponse,
  CatalogProductsResponse,
  CategorySummary,
  ConfigOption,
  ConfigOptionChoice,
  ConfigOptionPrice,
  CurrencyInfo,
  HomeResponse,
  LoginInput,
  LogoutResponse,
  MeResponse,
  PaginationMeta,
  ProductDetail,
  ProductDetailResponse,
  ProductPlan,
  ProductPlanPrice,
  ProductPricing,
  ProductSummary,
  RegisterInput,
  SourceMode,
} from './types.js';

export interface GatewayConfig {
  apiUrl?: string;
  mode: SourceMode;
  timeoutMs: number;
  token?: string;
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
  return new GatewayError('Missing bearer token.', 401, {
    message: 'Authentication is required.',
  });
}

function baseMeta(mode: SourceMode): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    sourceMode: mode,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
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

async function requestPaymenter<T>(
  config: GatewayConfig,
  path: string,
  options: {
    method?: 'GET' | 'POST';
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
    id: String(value.id ?? ''),
    slug: readString(value.slug),
    name: readString(value.name, 'Untitled product'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    stock: readNumber(value.stock),
    perUserLimit: readNumber(value.per_user_limit ?? value.perUserLimit),
    allowQuantity: readBoolean(value.allow_quantity ?? value.allowQuantity),
    category: hasCategory ? {
      id: String(categoryValue.id ?? ''),
      slug: readString(categoryValue.slug),
      name: readString(categoryValue.name, 'Catalog'),
    } : null,
    pricing: normalizeProductPricing(value.pricing),
  };
}

function normalizeProductPlanPrice(raw: unknown): ProductPlanPrice {
  const value = asRecord(raw);

  return {
    id: String(value.id ?? ''),
    price: readNumber(value.price),
    setupFee: readNumber(value.setup_fee ?? value.setupFee),
    currencyCode: readString(value.currency_code ?? value.currencyCode, 'USD'),
    currency: normalizeCurrency(value.currency),
  };
}

function normalizeProductPlan(raw: unknown): ProductPlan {
  const value = asRecord(raw);

  return {
    id: String(value.id ?? ''),
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
    id: String(value.id ?? ''),
    planId: String(value.plan_id ?? value.planId ?? ''),
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
    id: String(value.id ?? ''),
    name: readString(value.name, 'Option'),
    description: stripHtml(readString(value.description)),
    envVariable: readNullableString(value.env_variable ?? value.envVariable),
    pricing: flattenOptionPricing(value.prices),
  };
}

function normalizeConfigOption(raw: unknown): ConfigOption {
  const value = asRecord(raw);

  return {
    id: String(value.id ?? ''),
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

  return {
    id: String(value.id ?? ''),
    slug: readString(value.slug),
    name: readString(value.name, 'Untitled product'),
    description: stripHtml(readString(value.description)),
    image: readNullableString(value.image),
    stock: readNumber(value.stock),
    perUserLimit: readNumber(value.per_user_limit ?? value.perUserLimit),
    allowQuantity: readBoolean(value.allow_quantity ?? value.allowQuantity),
    category: categoryValue,
    plans: readArray<unknown>(value.plans).map(normalizeProductPlan),
    configOptions,
    operatingSystemOptions,
  };
}

function normalizeAuthUser(raw: unknown): AuthUser {
  const value = asRecord(raw);

  return {
    id: String(value.id ?? ''),
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

function ensureToken(token?: string) {
  if (!token) {
    throw unauthorized();
  }

  return token;
}

export function createGateway(config: GatewayConfig) {
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
      const response = await requestPaymenter<{ data: unknown[] }>(config, '/catalog/categories');

      return {
        data: readArray<unknown>(response.data).map(normalizeCategory),
        meta: baseMeta(config.mode),
      };
    },

    async products(categorySlug?: string, perPage = 24): Promise<CatalogProductsResponse> {
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
          brand: {
            name: 'Sloth Cloud',
            subtitle: '树懒云',
            statement: '独立品牌前台，Headless 计费核心，面向长期扩展的 VPS 服务商体验。',
          },
          stats: [
            {
              label: '分类',
              value: String(categoriesResponse.data.length),
              hint: '来自 Headless Paymenter catalog 接口。',
            },
            {
              label: '商品',
              value: String(productsResponse.pagination?.total ?? productsResponse.data.length),
              hint: '前台展示使用真实分类和真实商品数据。',
            },
            {
              label: '模式',
              value: config.mode.toUpperCase(),
              hint: 'BFF 已切换到新的 auth/catalog API 契约。',
            },
          ],
          featuredProducts: productsResponse.data.slice(0, 3),
          categories: categoriesResponse.data,
        },
        meta: baseMeta(config.mode),
      };
    },

    async login(input: LoginInput): Promise<AuthResponse> {
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

    async register(input: RegisterInput): Promise<AuthResponse> {
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
      const response = await requestPaymenter<{ message?: unknown }>(config, '/auth/logout', {
        method: 'POST',
        token: ensureToken(token),
      });

      return {
        message: readString(response.message, 'Logged out successfully.'),
      };
    },
  };
}

export { GatewayError };
