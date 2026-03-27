import {
  getMockCatalog,
  getMockCategories,
  getMockCategory,
  getMockHome,
  getMockProduct,
  getMockService,
} from './mock-data.js';
import {
  normalizePaymenterCategories,
  normalizePaymenterProductDetail,
  normalizePaymenterProducts,
  normalizePaymenterService,
} from './normalizers.js';
import type {
  CatalogResponse,
  CategoryDetail,
  HomeResponse,
  JsonApiDocument,
  ProductDetail,
  ServiceDetail,
  SourceMode,
} from './types.js';

export interface GatewayConfig {
  apiUrl?: string;
  mode: SourceMode;
  timeoutMs: number;
  token?: string;
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function invalidLiveConfig() {
  return Object.assign(new Error('PAYMENTER_API_URL or PAYMENTER_TOKEN is missing for live mode.'), { statusCode: 500 });
}

async function fetchPaymenter(config: GatewayConfig, path: string) {
  if (!config.apiUrl || !config.token) {
    throw invalidLiveConfig();
  }

  const url = `${config.apiUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${config.token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw Object.assign(new Error(`Paymenter request failed: ${response.status} ${message}`), {
        statusCode: response.status,
      });
    }

    return (await response.json()) as JsonApiDocument;
  } finally {
    clearTimeout(timer);
  }
}

async function liveCatalog(config: GatewayConfig): Promise<CatalogResponse> {
  const categoryDocument = await fetchPaymenter(config, '/v1/admin/categories?per_page=100');
  const productDocument = await fetchPaymenter(config, '/v1/admin/products?per_page=100&include=category,plans.prices');
  const categories = normalizePaymenterCategories(categoryDocument);
  const products = normalizePaymenterProducts(productDocument, categories);
  const normalizedCategories = normalizePaymenterCategories(categoryDocument, products);

  return {
    categories: normalizedCategories,
    products,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: 'live',
    },
  };
}

export function createGateway(config: GatewayConfig) {
  return {
    async health() {
      return {
        ok: true,
        sourceMode: config.mode,
        generatedAt: new Date().toISOString(),
      };
    },

    async home(): Promise<HomeResponse> {
      if (config.mode === 'mock') {
        return getMockHome();
      }

      const catalog = await liveCatalog(config);
      return {
        brand: {
          name: 'Sloth Cloud',
          subtitle: '树懒云',
          statement: '以独立品牌前端承接 Paymenter 能力，并为后续面板聚合做好接口隔离。',
        },
        stats: [
          { label: '分类', value: String(catalog.categories.length), hint: '来自 Paymenter 类目实时数据。' },
          { label: '商品', value: String(catalog.products.length), hint: '商品价格已通过 BFF 规范化。' },
          { label: '模式', value: 'LIVE', hint: '当前已连接 Paymenter 管理 API。' },
        ],
        featuredProducts: catalog.products.slice(0, 3),
        categories: catalog.categories,
        meta: catalog.meta,
      };
    },

    async catalog(): Promise<CatalogResponse> {
      if (config.mode === 'mock') {
        return {
          categories: getMockCategories(),
          products: getMockCatalog(),
          meta: {
            generatedAt: new Date().toISOString(),
            sourceMode: 'mock',
          },
        };
      }

      return liveCatalog(config);
    },

    async category(categorySlug: string): Promise<CategoryDetail> {
      if (config.mode === 'mock') {
        const category = getMockCategory(categorySlug);
        if (!category) {
          throw notFound(`Category ${categorySlug} was not found.`);
        }

        return category;
      }

      const catalog = await liveCatalog(config);
      const category = catalog.categories.find((item) => item.slug === categorySlug);
      if (!category) {
        throw notFound(`Category ${categorySlug} was not found.`);
      }

      return {
        ...category,
        products: catalog.products.filter((item) => item.categorySlug === categorySlug),
      };
    },

    async product(productSlug: string): Promise<ProductDetail> {
      if (config.mode === 'mock') {
        const product = getMockProduct(productSlug);
        if (!product) {
          throw notFound(`Product ${productSlug} was not found.`);
        }

        return product;
      }

      const catalog = await liveCatalog(config);
      const productSummary = catalog.products.find((item) => item.slug === productSlug);
      if (!productSummary) {
        throw notFound(`Product ${productSlug} was not found.`);
      }

      const document = await fetchPaymenter(config, `/v1/admin/products/${productSummary.id}?include=category,plans.prices`);
      return normalizePaymenterProductDetail(document, catalog.categories);
    },

    async service(serviceId: string): Promise<ServiceDetail> {
      if (config.mode === 'mock') {
        const service = getMockService(serviceId);
        if (!service) {
          throw notFound(`Service ${serviceId} was not found.`);
        }

        return service;
      }

      const catalog = await liveCatalog(config);
      const document = await fetchPaymenter(config, `/v1/admin/services/${serviceId}?include=product,properties,invoices`);
      return normalizePaymenterService(document, catalog.products);
    },
  };
}

