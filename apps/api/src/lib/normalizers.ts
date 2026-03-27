import type {
  CategorySummary,
  JsonApiDocument,
  JsonApiRelationshipPointer,
  JsonApiResource,
  ProductDetail,
  ProductPlan,
  ProductSummary,
  ServiceAction,
  ServiceDetail,
  ServiceProperty,
} from './types.js';

const CATEGORY_ACCENTS = ['teal', 'cyan', 'emerald', 'amber'];

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stripHtml(html: string | null | undefined) {
  if (!html) {
    return '';
  }

  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function paymenterCategorySlug(name: string, id: string) {
  const base = slugify(name);
  return base ? `${base}-${id}` : `category-${id}`;
}

export function formatBillingLabel(period: number | null | undefined, unit: string | null | undefined) {
  if (!period || !unit) {
    return '周期待补充';
  }

  const map: Record<string, string> = {
    day: '天',
    week: '周',
    month: '个月',
    year: '年',
  };

  return `${period} ${map[unit] ?? unit}`;
}

export function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toArray<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function indexIncluded(document: JsonApiDocument) {
  const map = new Map<string, JsonApiResource>();

  for (const resource of document.included ?? []) {
    map.set(`${resource.type}:${resource.id}`, resource);
  }

  const data = Array.isArray(document.data) ? document.data : [document.data];
  for (const resource of data) {
    map.set(`${resource.type}:${resource.id}`, resource);
  }

  return map;
}

export function resolveRelationship(
  relationship: JsonApiRelationshipPointer | JsonApiRelationshipPointer[] | null | undefined,
  includedMap: Map<string, JsonApiResource>,
) {
  return toArray(relationship)
    .map((pointer) => includedMap.get(`${pointer.type}:${pointer.id}`))
    .filter(Boolean) as JsonApiResource[];
}

function productPlans(resource: JsonApiResource, includedMap: Map<string, JsonApiResource>) {
  const pointers = resource.relationships?.plans?.data;
  const plans = resolveRelationship(pointers, includedMap);

  return plans
    .map((plan): ProductPlan => {
      const prices = resolveRelationship(plan.relationships?.prices?.data, includedMap);
      const firstPrice = prices[0];

      return {
        id: String(plan.attributes.id ?? plan.id),
        name: String(plan.attributes.name ?? '默认周期'),
        cycleLabel: formatBillingLabel(
          safeNumber(plan.attributes.billing_period),
          String(plan.attributes.billing_unit ?? ''),
        ),
        price: safeNumber(firstPrice?.attributes.price),
        setupFee: safeNumber(firstPrice?.attributes.setup_fee),
        currency: String(firstPrice?.attributes.currency_code ?? 'USD'),
      };
    })
    .sort((left, right) => {
      const leftPrice = left.price ?? Number.MAX_SAFE_INTEGER;
      const rightPrice = right.price ?? Number.MAX_SAFE_INTEGER;
      return leftPrice - rightPrice;
    });
}

export function normalizePaymenterCategories(document: JsonApiDocument, products: ProductSummary[] = []): CategorySummary[] {
  const data = Array.isArray(document.data) ? document.data : [document.data];

  return data.map((resource, index) => {
    const id = String(resource.attributes.id ?? resource.id);
    const name = String(resource.attributes.name ?? `Category ${id}`);
    const slug = paymenterCategorySlug(name, id);

    return {
      id,
      slug,
      name,
      description: `${name} 产品线已接入 Paymenter 管理 API，一期先通过 BFF 做品牌化展示与字段补齐。`,
      accent: CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length],
      heroMetric: `${products.filter((item) => item.categoryId === id).length || 0} 款可售商品`,
      regionTags: ['Paymenter', 'Live', 'Catalog'],
      productCount: products.filter((item) => item.categoryId === id).length,
    };
  });
}

export function normalizePaymenterProducts(document: JsonApiDocument, categories: CategorySummary[]): ProductSummary[] {
  const data = Array.isArray(document.data) ? document.data : [document.data];
  const includedMap = indexIncluded(document);

  return data.map((resource) => {
    const categoryPointer = resource.relationships?.category?.data;
    const categoryId = categoryPointer && !Array.isArray(categoryPointer) ? String(categoryPointer.id) : '';
    const category = categories.find((item) => item.id === categoryId);
    const plans = productPlans(resource, includedMap);
    const firstPlan = plans[0];

    return {
      id: String(resource.attributes.id ?? resource.id),
      slug: String(resource.attributes.slug ?? `product-${resource.id}`),
      categoryId,
      categorySlug: category?.slug ?? `category-${categoryId}`,
      name: String(resource.attributes.name ?? 'Untitled product'),
      tagline: `${String(resource.attributes.name ?? '产品')} · ${firstPlan?.cycleLabel ?? '周期待补充'}`,
      description: stripHtml(String(resource.attributes.description ?? '')),
      image: resource.attributes.image ? String(resource.attributes.image) : null,
      startingPrice: firstPlan?.price ?? null,
      currency: firstPlan?.currency ?? 'USD',
      billingLabel: firstPlan?.cycleLabel ?? '周期待补充',
      stockLabel: Number(resource.attributes.stock ?? 0) === 0 ? '库存待确认' : '可售',
      featured: Number(resource.attributes.hidden ?? 0) === 0,
      highlights: [
        String(resource.attributes.allow_quantity ?? 'standard'),
        'Paymenter Live',
        category?.name ?? '未分类',
      ],
      regionTags: [category?.name ?? 'Catalog'],
    };
  });
}

export function normalizePaymenterProductDetail(document: JsonApiDocument, categories: CategorySummary[]): ProductDetail {
  const resource = Array.isArray(document.data) ? document.data[0] : document.data;
  const listDocument: JsonApiDocument = {
    data: [resource],
    included: document.included,
  };
  const product = normalizePaymenterProducts(listDocument, categories)[0];
  const plans = productPlans(resource, indexIncluded(document));

  return {
    ...product,
    sourceMode: 'live',
    plans,
    features: [
      '商品信息来自 Paymenter 管理 API',
      '配置项接口尚未公开，当前以空配置器降级展示',
      '后续将补充真实机型模板、镜像与附加服务能力',
    ],
    purchaseNotes: [
      '当前 live 模式已接入真实商品基础信息。',
      '配置项与 Checkout Config 仍需扩展 Paymenter API 后补齐。',
      '下单动作将在二期接入真实订单与支付流程。',
    ],
    configurableOptions: [],
  };
}

function serviceActions(): ServiceAction[] {
  return [
    {
      id: 'panel',
      label: '打开面板',
      kind: 'primary',
      enabled: false,
      description: '一期只保留交互占位，不接真实控制逻辑。',
    },
    {
      id: 'renew',
      label: '续费',
      kind: 'secondary',
      enabled: false,
      description: '续费流程将在用户账单链路完成后接入。',
    },
    {
      id: 'cancel',
      label: '取消服务',
      kind: 'danger',
      enabled: false,
      description: '取消策略会与 Paymenter 用户侧接口一起落地。',
    },
  ];
}

export function normalizePaymenterService(document: JsonApiDocument, products: ProductSummary[]): ServiceDetail {
  const resource = Array.isArray(document.data) ? document.data[0] : document.data;
  const includedMap = indexIncluded(document);
  const productPointer = resource.relationships?.product?.data;
  const productId = productPointer && !Array.isArray(productPointer) ? String(productPointer.id) : '';
  const product = products.find((item) => item.id === productId);
  const propertyResources = resolveRelationship(resource.relationships?.properties?.data, includedMap);

  const properties: ServiceProperty[] = propertyResources.map((item) => ({
    key: String(item.attributes.key ?? item.id),
    label: String(item.attributes.name ?? item.attributes.key ?? item.id),
    value: String(item.attributes.value ?? ''),
  }));

  const ipv4 = properties
    .filter((item) => item.key.toLowerCase().includes('ipv4') || item.key.toLowerCase() === 'ip')
    .map((item) => item.value);
  const ipv6 = properties
    .filter((item) => item.key.toLowerCase().includes('ipv6'))
    .map((item) => item.value);
  const rdns = properties.find((item) => item.key.toLowerCase().includes('rdns'))?.value ?? null;
  const location = properties.find((item) => item.key.toLowerCase().includes('location'))?.value ?? 'Location pending';

  return {
    id: String(resource.attributes.id ?? resource.id),
    label: `${product?.name ?? 'Service'} #${String(resource.attributes.id ?? resource.id)}`,
    status: (String(resource.attributes.status ?? 'unknown') as ServiceDetail['status']) ?? 'unknown',
    productName: product?.name ?? '未知产品',
    productSlug: product?.slug,
    price: safeNumber(resource.attributes.price),
    currency: String(resource.attributes.currency_code ?? 'USD'),
    billingCycleLabel: 'Paymenter 当前未公开 plan 字段，待扩展',
    renewalAt: resource.attributes.expires_at ? String(resource.attributes.expires_at) : null,
    location,
    description: '服务基础信息来自 Paymenter 管理 API；控制逻辑与更细粒度状态会在后续面板聚合阶段接入。',
    network: {
      ipv4,
      ipv6,
      rdns,
    },
    properties,
    actions: serviceActions(),
    sourceMode: 'live',
  };
}

