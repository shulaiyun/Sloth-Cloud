export const localeMeta = {
  'zh-CN': { code: 'CN', label: '\u7b80\u4f53\u4e2d\u6587' },
  'zh-TW': { code: 'TW', label: '\u7e41\u9ad4\u4e2d\u6587' },
  'en-US': { code: 'US', label: 'English' },
  'ja-JP': { code: 'JP', label: 'Japanese' },
  'ko-KR': { code: 'KR', label: 'Korean' },
  'de-DE': { code: 'DE', label: 'German' },
  'fr-FR': { code: 'FR', label: 'French' },
  'es-ES': { code: 'ES', label: 'Spanish' },
  'ru-RU': { code: 'RU', label: 'Russian' },
  'pt-BR': { code: 'BR', label: 'Portuguese (BR)' },
} as const;

export type Locale = keyof typeof localeMeta;

export type TextContent = {
  nav: {
    home: string;
    catalog: string;
    cart: string;
    checkout: string;
    services: string;
    invoices: string;
    login: string;
    register: string;
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
    submit: string;
    remove: string;
    quantity: string;
    status: string;
    total: string;
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
    addToCart: string;
    addSuccess: string;
    goCheckout: string;
  };
  checkout: {
    title: string;
    subtitle: string;
    empty: string;
    coupon: string;
    couponHint: string;
    placeOrder: string;
    placingOrder: string;
    orderCreated: string;
    redirectTo: string;
  };
  services: {
    title: string;
    subtitle: string;
    noServices: string;
    updateLabel: string;
    cancel: string;
  };
  invoices: {
    title: string;
    subtitle: string;
    noInvoices: string;
    payWithCredit: string;
    payWithGateway: string;
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
    cart: 'Cart',
    checkout: 'Checkout',
    services: 'Services',
    invoices: 'Invoices',
    login: 'Login',
    register: 'Register',
    logout: 'Logout',
  },
  common: {
    loading: 'Loading Sloth Cloud data...',
    error: 'Request failed',
    backToCatalog: 'Back to store',
    sourceMode: 'Data source',
    mock: 'Mock',
    live: 'Live',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'No data yet',
    loginRequired: 'Sign in to continue',
    hello: 'Hello',
    view: 'View',
    open: 'Open',
    inspect: 'Details',
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
    submit: 'Submit',
    remove: 'Remove',
    quantity: 'Quantity',
    status: 'Status',
    total: 'Total',
  },
  home: {
    kicker: 'Sloth Cloud',
    title: 'Built for serious VPS operations',
    subtitle: 'Catalog, checkout, billing, provisioning, and control in one branded client.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Featured products',
    featuredSubtitle: 'Products are rendered from real catalog data.',
    categoryTitle: 'Categories',
    categorySubtitle: 'Find resources by category and capacity.',
  },
  catalog: {
    title: 'Store / Categories',
    subtitle: 'Browse real products by category.',
    allProducts: 'All products',
    noProducts: 'No products are available in this category yet.',
  },
  product: {
    summary: 'Purchase summary',
    plans: 'Billing plans',
    config: 'Configuration',
    os: 'Operating systems',
    details: 'Product details',
    loginHint: 'Sign in to continue the full order flow.',
    configEmpty: 'This product currently has no extra configuration options.',
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart successfully.',
    goCheckout: 'Go to checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Review cart, coupon, and submit order.',
    empty: 'Your cart is currently empty.',
    coupon: 'Coupon',
    couponHint: 'Enter a coupon and apply.',
    placeOrder: 'Submit order',
    placingOrder: 'Submitting...',
    orderCreated: 'Order created successfully.',
    redirectTo: 'Open target page',
  },
  services: {
    title: 'My services',
    subtitle: 'Manage purchased services and runtime details.',
    noServices: 'No services yet.',
    updateLabel: 'Update label',
    cancel: 'Cancel service',
  },
  invoices: {
    title: 'My invoices',
    subtitle: 'Track invoice status and complete payment.',
    noInvoices: 'No invoices yet.',
    payWithCredit: 'Pay with credit',
    payWithGateway: 'Pay with gateway',
  },
  auth: {
    loginTitle: 'Sign in to Sloth Cloud',
    loginSubtitle: 'Authenticate through BFF with Paymenter Headless session.',
    registerTitle: 'Create your Sloth Cloud account',
    registerSubtitle: 'Registration signs you in automatically.',
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
    statement: 'Sloth Cloud storefront. Auth, catalog, checkout, services, and invoices are served by edge BFF.',
  },
};

const zhCn: TextContent = {
  ...enUs,
  nav: {
    home: '\u9996\u9875',
    catalog: '\u5546\u5e97',
    cart: '\u8d2d\u7269\u8f66',
    checkout: '\u7ed3\u7b97',
    services: '\u670d\u52a1',
    invoices: '\u8d26\u5355',
    login: '\u767b\u5f55',
    register: '\u6ce8\u518c',
    logout: '\u9000\u51fa',
  },
  common: {
    ...enUs.common,
    loading: '\u6b63\u5728\u52a0\u8f7d\u6811\u61d2\u4e91\u6570\u636e...',
    error: '\u8bf7\u6c42\u5931\u8d25',
    backToCatalog: '\u8fd4\u56de\u5546\u5e97',
    sourceMode: '\u6570\u636e\u6765\u6e90',
    mock: '\u6f14\u793a\u6a21\u5f0f',
    live: '\u771f\u5b9e\u6570\u636e',
    themeDark: '\u9ed1\u6697',
    themeLight: '\u660e\u4eae',
    empty: '\u6682\u65e0\u6570\u636e',
    loginRequired: '\u8bf7\u5148\u767b\u5f55',
    hello: '\u4f60\u597d',
    view: '\u67e5\u770b',
    open: '\u6253\u5f00',
    inspect: '\u8be6\u60c5',
    stock: '\u5e93\u5b58',
    products: '\u4e2a\u5546\u54c1',
    defaultPlan: '\u9ed8\u8ba4\u5957\u9910',
    customBilling: '\u81ea\u5b9a\u4e49\u5468\u671f',
    yes: '\u662f',
    no: '\u5426',
    pending: '\u5904\u7406\u4e2d',
    slug: '\u6807\u8bc6',
    allowQuantity: '\u6570\u91cf\u6a21\u5f0f',
    perUserLimit: '\u5355\u7528\u6237\u9650\u5236',
    submit: '\u63d0\u4ea4',
    remove: '\u79fb\u9664',
    quantity: '\u6570\u91cf',
    status: '\u72b6\u6001',
    total: '\u603b\u8ba1',
  },
  home: {
    kicker: '\u6811\u61d2\u4e91',
    title: '\u66f4\u50cf\u4e13\u4e1a VPS \u670d\u52a1\u5546\uff0c\u800c\u4e0d\u662f\u9ed8\u8ba4\u9762\u677f\u76ae\u80a4',
    subtitle: '\u76ee\u5f55\u3001\u4e0b\u5355\u3001\u652f\u4ed8\u3001\u5f00\u901a\u4e0e\u670d\u52a1\u63a7\u5236\u5168\u90e8\u5728\u6811\u61d2\u4e91\u524d\u53f0\u5b8c\u6210\u3002',
    primaryCta: '\u8fdb\u5165\u5546\u5e97',
    secondaryCta: '\u7acb\u5373\u767b\u5f55',
    featuredTitle: '\u7cbe\u9009\u5546\u54c1',
    featuredSubtitle: '\u4ee5\u4e0b\u5546\u54c1\u6765\u81ea\u771f\u5b9e\u76ee\u5f55\u6570\u636e\u3002',
    categoryTitle: '\u5546\u54c1\u5206\u7c7b',
    categorySubtitle: '\u6309\u5206\u7c7b\u5feb\u901f\u5b9a\u4f4d\u53ef\u552e\u8d44\u6e90\u3002',
  },
  catalog: {
    title: '\u5546\u5e97 / \u5206\u7c7b',
    subtitle: '\u6309\u5206\u7c7b\u6d4f\u89c8\u771f\u5b9e\u5546\u54c1\u3002',
    allProducts: '\u5168\u90e8\u5546\u54c1',
    noProducts: '\u5f53\u524d\u5206\u7c7b\u4e0b\u6682\u65e0\u53ef\u552e\u5546\u54c1\u3002',
  },
  product: {
    ...enUs.product,
    summary: '\u8d2d\u4e70\u6982\u89c8',
    plans: '\u8ba1\u8d39\u5468\u671f',
    config: '\u8d2d\u4e70\u914d\u7f6e',
    os: '\u64cd\u4f5c\u7cfb\u7edf',
    details: '\u4ea7\u54c1\u8be6\u60c5',
    loginHint: '\u767b\u5f55\u540e\u5373\u53ef\u7ee7\u7eed\u5b8c\u6574\u4e0b\u5355\u6d41\u7a0b\u3002',
    configEmpty: '\u8be5\u5546\u54c1\u5f53\u524d\u6ca1\u6709\u989d\u5916\u914d\u7f6e\u9879\u3002',
    addToCart: '\u52a0\u5165\u8d2d\u7269\u8f66',
    addSuccess: '\u5df2\u52a0\u5165\u8d2d\u7269\u8f66\u3002',
    goCheckout: '\u524d\u5f80\u7ed3\u7b97',
  },
  checkout: {
    title: '\u7ed3\u7b97',
    subtitle: '\u786e\u8ba4\u8d2d\u7269\u8f66\u3001\u4f18\u60e0\u7801\u5e76\u63d0\u4ea4\u8ba2\u5355\u3002',
    empty: '\u4f60\u7684\u8d2d\u7269\u8f66\u5f53\u524d\u4e3a\u7a7a\u3002',
    coupon: '\u4f18\u60e0\u7801',
    couponHint: '\u8f93\u5165\u4f18\u60e0\u7801\u540e\u70b9\u51fb\u5e94\u7528\u3002',
    placeOrder: '\u63d0\u4ea4\u8ba2\u5355',
    placingOrder: '\u63d0\u4ea4\u4e2d...',
    orderCreated: '\u8ba2\u5355\u521b\u5efa\u6210\u529f\u3002',
    redirectTo: '\u6253\u5f00\u76ee\u6807\u9875\u9762',
  },
  services: {
    title: '\u6211\u7684\u670d\u52a1',
    subtitle: '\u7ba1\u7406\u5df2\u8d2d\u4e70\u670d\u52a1\u4e0e\u8fd0\u884c\u4fe1\u606f\u3002',
    noServices: '\u6682\u65e0\u670d\u52a1\u3002',
    updateLabel: '\u66f4\u65b0\u6807\u7b7e',
    cancel: '\u53d6\u6d88\u670d\u52a1',
  },
  invoices: {
    title: '\u6211\u7684\u8d26\u5355',
    subtitle: '\u67e5\u770b\u8d26\u5355\u72b6\u6001\u5e76\u5b8c\u6210\u652f\u4ed8\u3002',
    noInvoices: '\u6682\u65e0\u8d26\u5355\u3002',
    payWithCredit: '\u4f59\u989d\u652f\u4ed8',
    payWithGateway: '\u7f51\u5173\u652f\u4ed8',
  },
  auth: {
    loginTitle: '\u767b\u5f55\u6811\u61d2\u4e91',
    loginSubtitle: '\u901a\u8fc7 BFF \u4f1a\u8bdd\u63a5\u5165 Paymenter Headless \u8ba4\u8bc1\u3002',
    registerTitle: '\u521b\u5efa\u4f60\u7684\u6811\u61d2\u4e91\u8d26\u6237',
    registerSubtitle: '\u6ce8\u518c\u6210\u529f\u540e\u5c06\u81ea\u52a8\u767b\u5f55\u3002',
    email: '\u90ae\u7bb1',
    password: '\u5bc6\u7801',
    code: '\u4e8c\u6b21\u9a8c\u8bc1\u7801',
    firstName: '\u540d',
    lastName: '\u59d3',
    passwordConfirmation: '\u786e\u8ba4\u5bc6\u7801',
    submitLogin: '\u767b\u5f55',
    submitRegister: '\u6ce8\u518c',
    tfaHint: '\u8be5\u8d26\u6237\u5df2\u5f00\u542f\u53cc\u91cd\u9a8c\u8bc1\uff0c\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801\u540e\u91cd\u8bd5\u3002',
    alreadyHaveAccount: '\u5df2\u6709\u8d26\u53f7\uff1f\u53bb\u767b\u5f55',
    needAccount: '\u8fd8\u6ca1\u6709\u8d26\u53f7\uff1f\u53bb\u6ce8\u518c',
  },
  footer: {
    statement: '\u6811\u61d2\u4e91\u524d\u53f0\u3002\u8ba4\u8bc1\u3001\u5546\u54c1\u3001\u7ed3\u7b97\u3001\u670d\u52a1\u3001\u8d26\u5355\u5747\u7531\u8fb9\u7f18 BFF \u5bf9\u63a5\u771f\u5b9e\u6570\u636e\u3002',
  },
};

const zhTw: TextContent = {
  ...zhCn,
  nav: {
    home: '\u9996\u9801',
    catalog: '\u5546\u5e97',
    cart: '\u8cfc\u7269\u8eca',
    checkout: '\u7d50\u7b97',
    services: '\u670d\u52d9',
    invoices: '\u5e33\u55ae',
    login: '\u767b\u5165',
    register: '\u8a3b\u518a',
    logout: '\u9000\u51fa',
  },
  common: {
    ...zhCn.common,
    loading: '\u6b63\u5728\u8f09\u5165\u6a39\u61f6\u96f2\u8cc7\u6599...',
    mock: '\u5c55\u793a\u6a21\u5f0f',
    live: '\u771f\u5be6\u8cc7\u6599',
    products: '\u500b\u5546\u54c1',
    customBilling: '\u81ea\u5b9a\u7fa9\u9031\u671f',
  },
  home: {
    ...zhCn.home,
    title: '\u66f4\u50cf\u5c08\u696d VPS \u670d\u52d9\u5546\uff0c\u800c\u4e0d\u662f\u9810\u8a2d\u9762\u677f\u76ae\u819a',
    subtitle: '\u76ee\u9304\u3001\u4e0b\u55ae\u3001\u652f\u4ed8\u3001\u958b\u901a\u8207\u670d\u52d9\u63a7\u5236\u5168\u90e8\u5728\u6a39\u61f6\u96f2\u524d\u53f0\u5b8c\u6210\u3002',
  },
  catalog: {
    ...zhCn.catalog,
    subtitle: '\u6309\u5206\u985e\u700f\u89bd\u771f\u5be6\u5546\u54c1\u3002',
    noProducts: '\u76ee\u524d\u5206\u985e\u4e0b\u66ab\u7121\u53ef\u552e\u5546\u54c1\u3002',
  },
  product: {
    ...zhCn.product,
    summary: '\u8cfc\u8cb7\u6982\u89bd',
    plans: '\u8a08\u8cbb\u9031\u671f',
    config: '\u8cfc\u8cb7\u914d\u7f6e',
    details: '\u7522\u54c1\u8a73\u60c5',
    addToCart: '\u52a0\u5165\u8cfc\u7269\u8eca',
  },
  checkout: {
    ...zhCn.checkout,
    subtitle: '\u78ba\u8a8d\u8cfc\u7269\u8eca\u3001\u512a\u60e0\u78bc\u4e26\u63d0\u4ea4\u8a02\u55ae\u3002',
    empty: '\u4f60\u7684\u8cfc\u7269\u8eca\u76ee\u524d\u70ba\u7a7a\u3002',
    coupon: '\u512a\u60e0\u78bc',
  },
  services: {
    ...zhCn.services,
    subtitle: '\u7ba1\u7406\u5df2\u8cfc\u8cb7\u670d\u52d9\u8207\u904b\u884c\u8cc7\u8a0a\u3002',
    noServices: '\u66ab\u7121\u670d\u52d9\u3002',
  },
  invoices: {
    ...zhCn.invoices,
    title: '\u6211\u7684\u5e33\u55ae',
    subtitle: '\u67e5\u770b\u5e33\u55ae\u72c0\u614b\u4e26\u5b8c\u6210\u652f\u4ed8\u3002',
    noInvoices: '\u66ab\u7121\u5e33\u55ae\u3002',
  },
  auth: {
    ...zhCn.auth,
    loginTitle: '\u767b\u5165\u6a39\u61f6\u96f2',
    registerTitle: '\u5efa\u7acb\u4f60\u7684\u6a39\u61f6\u96f2\u5e33\u6236',
    registerSubtitle: '\u8a3b\u518a\u6210\u529f\u5f8c\u5c07\u81ea\u52d5\u767b\u5165\u3002',
    submitLogin: '\u767b\u5165',
    submitRegister: '\u8a3b\u518a',
    alreadyHaveAccount: '\u5df2\u6709\u5e33\u865f\uff1f\u53bb\u767b\u5165',
    needAccount: '\u9084\u6c92\u6709\u5e33\u865f\uff1f\u53bb\u8a3b\u518a',
  },
  footer: {
    statement: '\u6a39\u61f6\u96f2\u524d\u53f0\u3002\u8a8d\u8b49\u3001\u5546\u54c1\u3001\u7d50\u7b97\u3001\u670d\u52d9\u3001\u5e33\u55ae\u5747\u7531\u908a\u7de3 BFF \u5c0d\u63a5\u771f\u5be6\u8cc7\u6599\u3002',
  },
};

const jaJp: TextContent = { ...enUs };
const koKr: TextContent = { ...enUs };
const deDe: TextContent = { ...enUs };
const frFr: TextContent = { ...enUs };
const esEs: TextContent = { ...enUs };
const ruRu: TextContent = { ...enUs };
const ptBr: TextContent = { ...enUs };

export const content: Record<Locale, TextContent> = {
  'zh-CN': zhCn,
  'zh-TW': zhTw,
  'en-US': enUs,
  'ja-JP': jaJp,
  'ko-KR': koKr,
  'de-DE': deDe,
  'fr-FR': frFr,
  'es-ES': esEs,
  'ru-RU': ruRu,
  'pt-BR': ptBr,
};
