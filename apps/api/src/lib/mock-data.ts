import type {
  CategoryDetail,
  CategorySummary,
  HomeResponse,
  ProductDetail,
  ProductSummary,
  ServiceDetail,
} from './types.js';

const categories: CategorySummary[] = [
  {
    id: 'cat-cn',
    slug: 'cn-premium',
    name: '中国优化线路',
    description: '面向大陆访问优化的高可用 VPS 产品线，适合建站、跨境业务与低延迟业务入口。',
    accent: 'teal',
    heroMetric: '< 35ms 华东平均延迟',
    regionTags: ['CN2', 'BGP', '低延迟'],
    productCount: 2,
  },
  {
    id: 'cat-apac',
    slug: 'asia-pacific-edge',
    name: '亚太边缘节点',
    description: '覆盖香港、日本、新加坡的边缘计算产品，强调访问速度、可扩展性与稳定带宽。',
    accent: 'cyan',
    heroMetric: '3 个核心节点',
    regionTags: ['HK', 'JP', 'SG'],
    productCount: 1,
  },
  {
    id: 'cat-global',
    slug: 'global-compute',
    name: '全球通用计算',
    description: '面向海外业务、开发环境与弹性资源池的基础算力产品，适合长期扩容。',
    accent: 'emerald',
    heroMetric: '99.95% SLA 目标',
    regionTags: ['US', 'EU', '稳定带宽'],
    productCount: 1,
  },
];

const products: ProductSummary[] = [
  {
    id: 'prod-hk-c2',
    slug: 'hk-c2-2c4g',
    categoryId: 'cat-apac',
    categorySlug: 'asia-pacific-edge',
    name: 'Hong Kong C2',
    tagline: '低延迟香港计算型实例',
    description: '适合轻量应用、跨境前置层与企业加速接入的香港实例。',
    image: null,
    startingPrice: 59,
    currency: 'CNY',
    billingLabel: '月付起',
    stockLabel: '库存充足',
    featured: true,
    highlights: ['AMD EPYC', 'NVMe RAID', '精品网络'],
    regionTags: ['Hong Kong', 'BGP', 'Premium'],
  },
  {
    id: 'prod-sg-s4',
    slug: 'sg-s4-4c8g',
    categoryId: 'cat-apac',
    categorySlug: 'asia-pacific-edge',
    name: 'Singapore S4',
    tagline: '高带宽亚太业务节点',
    description: '适合游戏周边、流媒体中转与 APAC SaaS 节点部署。',
    image: null,
    startingPrice: 89,
    currency: 'CNY',
    billingLabel: '月付起',
    stockLabel: '热销中',
    featured: false,
    highlights: ['10Gbps 上联', 'DDoS 基础防护', '快速交付'],
    regionTags: ['Singapore', 'APAC', 'Bandwidth'],
  },
  {
    id: 'prod-cn-g3',
    slug: 'cn-g3-4c8g',
    categoryId: 'cat-cn',
    categorySlug: 'cn-premium',
    name: 'China G3',
    tagline: '面向大陆优化的通用型实例',
    description: '适合企业官网、业务 API 与需要大陆稳定访问的应用。',
    image: null,
    startingPrice: 129,
    currency: 'CNY',
    billingLabel: '月付起',
    stockLabel: '稳定供应',
    featured: true,
    highlights: ['大陆优化', '高可用存储', '低抖动'],
    regionTags: ['China', 'Low Latency', 'Business'],
  },
  {
    id: 'prod-us-b1',
    slug: 'us-b1-2c4g',
    categoryId: 'cat-global',
    categorySlug: 'global-compute',
    name: 'US Base 1',
    tagline: '海外业务起步款实例',
    description: '适合开发测试、轻量爬虫与海外微服务部署。',
    image: null,
    startingPrice: 39,
    currency: 'CNY',
    billingLabel: '月付起',
    stockLabel: '即刻开通',
    featured: false,
    highlights: ['弹性扩容', '基础监控', '长期稳定'],
    regionTags: ['USA', 'General', 'Stable'],
  },
];

const productDetails: Record<string, ProductDetail> = {
  'hk-c2-2c4g': {
    ...products[0],
    sourceMode: 'mock',
    plans: [
      { id: 'plan-hk-monthly', name: '标准月付', cycleLabel: '1 个月', price: 59, setupFee: 0, currency: 'CNY' },
      { id: 'plan-hk-quarterly', name: '季付 95 折', cycleLabel: '3 个月', price: 168, setupFee: 0, currency: 'CNY' },
      { id: 'plan-hk-yearly', name: '年付特惠', cycleLabel: '12 个月', price: 648, setupFee: 0, currency: 'CNY' },
    ],
    features: ['AMD EPYC 高主频核心', '4GB DDR4 ECC', '40GB NVMe RAID 存储', '1TB 月流量', '香港精品线路'],
    purchaseNotes: [
      '一期原型暂不直连真实下单流程，先完成配置体验与数据通路。',
      '实际机型库存、促销规则与开通耗时以后端实时结果为准。',
      '后续会在 BFF 层增加优惠码、实名认证、地域风控与活动价逻辑。',
    ],
    configurableOptions: [
      {
        id: 'config-os',
        name: '操作系统',
        type: 'select',
        required: true,
        description: '选择实例的默认系统模板。',
        defaultValue: 'debian-12',
        choices: [
          { id: 'debian-12', label: 'Debian 12', description: '稳定生产环境推荐' },
          { id: 'ubuntu-24', label: 'Ubuntu 24.04 LTS', description: '开发与通用业务' },
          { id: 'alma-9', label: 'AlmaLinux 9', description: 'RHEL 兼容生态' },
        ],
      },
      {
        id: 'config-backup',
        name: '自动快照',
        type: 'checkbox',
        required: false,
        description: '按周保留 2 份快照。',
        defaultValue: false,
      },
      {
        id: 'config-panel',
        name: '预装环境',
        type: 'radio',
        required: true,
        description: '选择预装组件，加速交付。',
        defaultValue: 'none',
        choices: [
          { id: 'none', label: '纯净系统' },
          { id: 'docker', label: 'Docker 环境', priceDelta: 10 },
          { id: 'lamp', label: 'LAMP 套件', priceDelta: 15 },
        ],
      },
    ],
  },
};

const serviceDetails: Record<string, ServiceDetail> = {
  '10001': {
    id: '10001',
    label: 'Hong Kong C2 #10001',
    status: 'active',
    productName: 'Hong Kong C2',
    productSlug: 'hk-c2-2c4g',
    price: 59,
    currency: 'CNY',
    billingCycleLabel: '月付',
    renewalAt: '2026-04-20T00:00:00.000Z',
    location: 'Hong Kong / Tseung Kwan O',
    description: '当前服务为演示型详情页，信息结构已对齐后续真实 VPS 面板形态。',
    network: {
      ipv4: ['203.0.113.18'],
      ipv6: ['2001:db8:100::18'],
      rdns: 'hk-c2-10001.slothcloud.com',
    },
    properties: [
      { key: 'cpu', label: 'CPU', value: '2 vCPU', emphasis: true },
      { key: 'memory', label: '内存', value: '4 GB', emphasis: true },
      { key: 'storage', label: '系统盘', value: '40 GB NVMe', emphasis: true },
      { key: 'bandwidth', label: '带宽策略', value: '峰值 500 Mbps' },
      { key: 'traffic', label: '月流量', value: '1 TB' },
      { key: 'template', label: '模板', value: 'Debian 12' },
    ],
    actions: [
      { id: 'open-panel', label: '打开管理面板', kind: 'primary', enabled: false, description: '一期只保留交互占位，不接真实面板。' },
      { id: 'renew', label: '立即续费', kind: 'secondary', enabled: false, description: '续费能力将在账单体系接入后开放。' },
      { id: 'request-cancel', label: '申请取消', kind: 'danger', enabled: false, description: '取消流程未来接入 Paymenter 用户侧能力。' },
    ],
    sourceMode: 'mock',
  },
};

export function getMockCatalog(): ProductSummary[] {
  return structuredClone(products);
}

export function getMockCategories(): CategorySummary[] {
  return structuredClone(categories);
}

export function getMockCategory(categorySlug: string): CategoryDetail | null {
  const category = categories.find((item) => item.slug === categorySlug);
  if (!category) {
    return null;
  }

  return {
    ...structuredClone(category),
    products: structuredClone(products.filter((item) => item.categorySlug === categorySlug)),
  };
}

export function getMockProduct(productSlug: string): ProductDetail | null {
  return structuredClone(productDetails[productSlug] ?? null);
}

export function getMockService(serviceId: string): ServiceDetail | null {
  return structuredClone(serviceDetails[serviceId] ?? null);
}

export function getMockHome(): HomeResponse {
  return {
    brand: {
      name: 'Sloth Cloud',
      subtitle: '树懒云',
      statement: '为增长型团队提供更整洁、更可信、更易扩展的云服务器购买与服务体验。',
    },
    stats: [
      { label: '全球可用区', value: '12+', hint: '一期以前台演示为主，后续接入真实节点库存。' },
      { label: '平均交付响应', value: '< 60s', hint: '目标体验，后续接入真实 provisioning 状态。' },
      { label: '计划产品线', value: '4', hint: '当前原型已覆盖中国优化、亚太边缘与全球计算。' },
    ],
    featuredProducts: structuredClone(products.filter((item) => item.featured)),
    categories: structuredClone(categories),
    meta: {
      generatedAt: new Date().toISOString(),
      sourceMode: 'mock',
    },
  };
}

