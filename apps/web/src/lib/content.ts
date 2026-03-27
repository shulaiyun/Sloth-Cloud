export const localeMeta = {
  'zh-CN': { flag: '🇨🇳', label: '中文' },
  'en-US': { flag: '🇺🇸', label: 'English' },
  'de-DE': { flag: '🇩🇪', label: 'Deutsch' },
  'fr-FR': { flag: '🇫🇷', label: 'Français' },
  'es-ES': { flag: '🇪🇸', label: 'Español' },
  'ko-KR': { flag: '🇰🇷', label: '한국어' },
} as const;

export type Locale = keyof typeof localeMeta;

type TextContent = {
  nav: {
    home: string;
    catalog: string;
    login: string;
    register: string;
    account: string;
    logout: string;
  };
  common: {
    loading: string;
    error: string;
    backToCatalog: string;
    sourceMode: string;
    mock: string;
    live: string;
    themeDark: string;
    themeLight: string;
    empty: string;
    loginRequired: string;
    hello: string;
    accountReady: string;
    view: string;
    open: string;
    inspect: string;
    stock: string;
    products: string;
    defaultPlan: string;
    customBilling: string;
    yes: string;
    no: string;
    pending: string;
    slug: string;
    allowQuantity: string;
    perUserLimit: string;
  };
  home: {
    kicker: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    featuredTitle: string;
    featuredSubtitle: string;
    categoryTitle: string;
    categorySubtitle: string;
  };
  catalog: {
    title: string;
    subtitle: string;
    allProducts: string;
    noProducts: string;
  };
  product: {
    summary: string;
    plans: string;
    config: string;
    os: string;
    details: string;
    loginHint: string;
    configEmpty: string;
    checkoutPending: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    email: string;
    password: string;
    code: string;
    firstName: string;
    lastName: string;
    passwordConfirmation: string;
    submitLogin: string;
    submitRegister: string;
    tfaHint: string;
    alreadyHaveAccount: string;
    needAccount: string;
  };
  footer: {
    statement: string;
  };
};

const enUs: TextContent = {
  nav: {
    home: 'Home',
    catalog: 'Store',
    login: 'Login',
    register: 'Register',
    account: 'Console',
    logout: 'Logout',
  },
  common: {
    loading: 'Loading Sloth Cloud data...',
    error: 'Request failed',
    backToCatalog: 'Back to store',
    sourceMode: 'Data source',
    mock: 'Demo mode',
    live: 'Live data',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'Nothing to show yet',
    loginRequired: 'Continue with login',
    hello: 'Hello',
    accountReady: 'Authenticated',
    view: 'View',
    open: 'Open',
    inspect: 'Inspect',
    stock: 'Stock',
    products: 'products',
    defaultPlan: 'Default plan',
    customBilling: 'Custom billing',
    yes: 'Yes',
    no: 'No',
    pending: 'Pending',
    slug: 'Slug',
    allowQuantity: 'Allow quantity',
    perUserLimit: 'Per-user limit',
  },
  home: {
    kicker: 'Sloth Cloud headless client',
    title: 'Built like a premium VPS storefront, not a default panel skin',
    subtitle: 'The branded web app and BFF now own catalog delivery and user auth while Paymenter stays behind the edge.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Live products',
    featuredSubtitle: 'These cards are rendered from the new headless catalog endpoints.',
    categoryTitle: 'Live categories',
    categorySubtitle: 'Categories, products, and prices are no longer tied to the old Livewire frontend.',
  },
  catalog: {
    title: 'Store / Categories',
    subtitle: 'Browse real products by category, backed by the new Paymenter headless API.',
    allProducts: 'All products',
    noProducts: 'No products are available in this category yet.',
  },
  product: {
    summary: 'Configuration summary',
    plans: 'Billing plans',
    config: 'Configuration',
    os: 'Operating systems',
    details: 'Product detail',
    loginHint: 'Sign in first to continue into the order flow.',
    configEmpty: 'This product currently has no extra config options.',
    checkoutPending: 'Checkout is the next API slice. This release focuses on live auth and live catalog data.',
  },
  auth: {
    loginTitle: 'Sign in to Sloth Cloud',
    loginSubtitle: 'Use the Paymenter headless auth API to get a real access token.',
    registerTitle: 'Create your Sloth Cloud account',
    registerSubtitle: 'Successful registration returns a live token immediately.',
    email: 'Email',
    password: 'Password',
    code: 'Two-factor code',
    firstName: 'First name',
    lastName: 'Last name',
    passwordConfirmation: 'Confirm password',
    submitLogin: 'Sign in',
    submitRegister: 'Create account',
    tfaHint: 'Two-factor authentication is enabled. Enter your code and submit again.',
    alreadyHaveAccount: 'Already have an account? Sign in',
    needAccount: 'Need an account? Register',
  },
  footer: {
    statement: 'Sloth Cloud storefront. Real auth and live catalog data now flow through the edge BFF.',
  },
};

const zhCn: TextContent = {
  nav: {
    home: '首页',
    catalog: '商店',
    login: '登录',
    register: '注册',
    account: '控制台',
    logout: '退出',
  },
  common: {
    loading: '正在加载树懒云数据...',
    error: '请求失败',
    backToCatalog: '返回商店',
    sourceMode: '数据来源',
    mock: '演示模式',
    live: '真实数据',
    themeDark: '黑暗',
    themeLight: '明亮',
    empty: '暂时没有可展示内容',
    loginRequired: '登录后继续',
    hello: '你好',
    accountReady: '已认证',
    view: '查看',
    open: '打开',
    inspect: '详情',
    stock: '库存',
    products: '个产品',
    defaultPlan: '默认套餐',
    customBilling: '自定义计费',
    yes: '是',
    no: '否',
    pending: '待补充',
    slug: '标识',
    allowQuantity: '数量模式',
    perUserLimit: '单用户限制',
  },
  home: {
    kicker: '树懒云 Headless 客户端',
    title: '更像专业 VPS 服务商，而不是默认面板皮肤',
    subtitle: '品牌前台、商品展示和用户认证都由我们的 Web 与 BFF 接管，Paymenter 退回后方做计费引擎。',
    primaryCta: '进入商店',
    secondaryCta: '立即登录',
    featuredTitle: '真实商品',
    featuredSubtitle: '这些卡片来自新的 Headless 商品接口。',
    categoryTitle: '真实分类',
    categorySubtitle: '分类、产品和价格不再绑定旧的 Livewire 前端。',
  },
  catalog: {
    title: '商店 / 分类',
    subtitle: '按分类浏览真实商品，价格与周期均来自新的 Paymenter Headless API。',
    allProducts: '全部产品',
    noProducts: '当前分类下还没有可售商品。',
  },
  product: {
    summary: '购买概览',
    plans: '计费周期',
    config: '购买配置',
    os: '操作系统',
    details: '产品详情',
    loginHint: '登录后即可继续接入下单链路。',
    configEmpty: '该商品当前没有额外配置项。',
    checkoutPending: '下一步将接入真实结算与下单接口，这一版先完成真实认证与真实目录数据。',
  },
  auth: {
    loginTitle: '登录树懒云',
    loginSubtitle: '通过 Paymenter Headless 认证接口获取真实访问令牌。',
    registerTitle: '创建树懒云账号',
    registerSubtitle: '注册成功后将直接返回真实可用令牌。',
    email: '邮箱',
    password: '密码',
    code: '两步验证码',
    firstName: '名字',
    lastName: '姓氏',
    passwordConfirmation: '确认密码',
    submitLogin: '登录',
    submitRegister: '创建账号',
    tfaHint: '检测到两步验证，请补充验证码后再次提交。',
    alreadyHaveAccount: '已有账号？去登录',
    needAccount: '还没有账号？去注册',
  },
  footer: {
    statement: '树懒云前台。真实认证与真实商品数据已经通过边缘 BFF 接入。',
  },
};

export const content: Record<Locale, TextContent> = {
  'zh-CN': zhCn,
  'en-US': enUs,
  'de-DE': { ...enUs },
  'fr-FR': { ...enUs },
  'es-ES': { ...enUs },
  'ko-KR': { ...enUs },
};
