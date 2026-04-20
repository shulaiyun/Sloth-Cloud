export const localeMeta = {
  'zh-CN': { code: 'CN', label: '\u7b80\u4f53\u4e2d\u6587' },
  'zh-TW': { code: 'TW', label: '\u7e41\u9ad4\u4e2d\u6587' },
  'en-US': { code: 'US', label: 'English' },
  'ja-JP': { code: 'JP', label: '\u65e5\u672c\u8a9e' },
  'ko-KR': { code: 'KR', label: '\ud55c\uad6d\uc5b4' },
  'de-DE': { code: 'DE', label: 'Deutsch' },
  'fr-FR': { code: 'FR', label: 'Français' },
  'es-ES': { code: 'ES', label: 'Español' },
  'ru-RU': { code: 'RU', label: 'Русский' },
  'pt-BR': { code: 'BR', label: 'Português (BR)' },
} as const;

export type Locale = keyof typeof localeMeta;
export const supportedFrontendLocales: Locale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];

export type TextContent = {
  nav: {
    home: string;
    catalog: string;
    cart: string;
    checkout: string;
    services: string;
    affiliate: string;
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
    affiliate: 'Affiliate',
    invoices: 'Invoices',
    login: 'Login',
    register: 'Register',
    logout: 'Logout',
  },
  common: {
    loading: 'Loading Sloth Cloud content...',
    error: 'Request failed',
    backToCatalog: 'Back to store',
    sourceMode: 'Data source',
    mock: 'Preview',
    live: 'Live data',
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
    title: 'Cloud infrastructure that is ready to sell',
    subtitle: 'Browse products, place orders, manage services, and complete billing in one branded experience.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Featured products',
    featuredSubtitle: 'Popular services from the live catalog.',
    categoryTitle: 'Categories',
    categorySubtitle: 'Find resources by category and capacity.',
  },
  catalog: {
    title: 'Store',
    subtitle: 'Browse services by category and capacity.',
    allProducts: 'All products',
    noProducts: 'No services are available in this category yet.',
  },
  product: {
    summary: 'Purchase summary',
    plans: 'Billing plans',
    config: 'Configuration',
    os: 'Service options',
    details: 'Product details',
    loginHint: 'Sign in to continue checkout and service management.',
    configEmpty: 'This product currently has no extra configuration options.',
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart successfully.',
    goCheckout: 'Go to checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Review your order and complete payment securely.',
    empty: 'Your cart is empty.',
    coupon: 'Coupon',
    couponHint: 'Enter a coupon code to apply it to this order.',
    placeOrder: 'Place order',
    placingOrder: 'Placing order...',
    orderCreated: 'Order created successfully.',
    redirectTo: 'Open payment page',
  },
  services: {
    title: 'My services',
    subtitle: 'Manage active services and runtime details.',
    noServices: 'You do not have any services yet.',
    updateLabel: 'Update label',
    cancel: 'Cancel service',
  },
  invoices: {
    title: 'My invoices',
    subtitle: 'Review invoice status and complete payment.',
    noInvoices: 'You do not have any invoices yet.',
    payWithCredit: 'Pay with balance',
    payWithGateway: 'Pay with payment method',
  },
  auth: {
    loginTitle: 'Sign in to Sloth Cloud',
    loginSubtitle: 'Sign in to access your billing and services workspace.',
    registerTitle: 'Create your Sloth Cloud account',
    registerSubtitle: 'Registration will sign you in automatically.',
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
    statement: 'Sloth Cloud client portal for billing, services, and account management.',
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
    affiliate: '\u9080\u8bf7\u8fd4\u5229',
    invoices: '\u8d26\u5355',
    login: '\u767b\u5f55',
    register: '\u6ce8\u518c',
    logout: '\u9000\u51fa',
  },
  common: {
    ...enUs.common,
    loading: '\u6b63\u5728\u52a0\u8f7d\u6811\u61d2\u4e91\u5185\u5bb9...',
    error: '\u8bf7\u6c42\u5931\u8d25',
    backToCatalog: '\u8fd4\u56de\u5546\u5e97',
    sourceMode: '\u6570\u636e\u6765\u6e90',
    mock: '\u9884\u89c8',
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
    title: '\u4e13\u4e1a\u7684\u4e91\u670d\u52a1\u524d\u53f0',
    subtitle: '\u5728\u6811\u61d2\u4e91\u5185\u5b8c\u6210\u9009\u8d2d\u3001\u4e0b\u5355\u3001\u652f\u4ed8\u3001\u5f00\u901a\u548c\u670d\u52a1\u7ba1\u7406\u3002',
    primaryCta: '\u8fdb\u5165\u5546\u5e97',
    secondaryCta: '\u7acb\u5373\u767b\u5f55',
    featuredTitle: '\u7cbe\u9009\u5546\u54c1',
    featuredSubtitle: '\u4ee5\u4e0b\u670d\u52a1\u6765\u81ea\u5b9e\u65f6\u5546\u5e97\u6570\u636e\u3002',
    categoryTitle: '\u5546\u54c1\u5206\u7c7b',
    categorySubtitle: '\u6309\u5206\u7c7b\u5feb\u901f\u5b9a\u4f4d\u53ef\u552e\u8d44\u6e90\u3002',
  },
  catalog: {
    title: '\u5546\u5e97',
    subtitle: '\u6309\u5206\u7c7b\u6d4f\u89c8\u53ef\u4e0b\u5355\u670d\u52a1\u3002',
    allProducts: '\u5168\u90e8\u5546\u54c1',
    noProducts: '\u5f53\u524d\u5206\u7c7b\u4e0b\u6682\u65e0\u53ef\u4e0b\u5355\u670d\u52a1\u3002',
  },
  product: {
    ...enUs.product,
    summary: '\u8d2d\u4e70\u6982\u89c8',
    plans: '\u8ba1\u8d39\u5468\u671f',
    config: '\u8d2d\u4e70\u914d\u7f6e',
    os: '\u670d\u52a1\u9009\u9879',
    details: '\u4ea7\u54c1\u8be6\u60c5',
    loginHint: '\u767b\u5f55\u540e\u5373\u53ef\u7ee7\u7eed\u5b8c\u6210\u4e0b\u5355\u3002',
    configEmpty: '\u8be5\u4ea7\u54c1\u5f53\u524d\u6ca1\u6709\u989d\u5916\u914d\u7f6e\u9879\u3002',
    addToCart: '\u52a0\u5165\u8d2d\u7269\u8f66',
    addSuccess: '\u5df2\u52a0\u5165\u8d2d\u7269\u8f66\u3002',
    goCheckout: '\u524d\u5f80\u7ed3\u7b97',
  },
  checkout: {
    title: '\u7ed3\u7b97',
    subtitle: '\u786e\u8ba4\u8ba2\u5355\u5e76\u5b89\u5168\u652f\u4ed8\u3002',
    empty: '\u60a8\u7684\u8d2d\u7269\u8f66\u5f53\u524d\u4e3a\u7a7a\u3002',
    coupon: '\u4f18\u60e0\u7801',
    couponHint: '\u8f93\u5165\u4f18\u60e0\u7801\u540e\u70b9\u51fb\u5e94\u7528\u3002',
    placeOrder: '\u4e0b\u5355',
    placingOrder: '\u6b63\u5728\u4e0b\u5355...',
    orderCreated: '\u8ba2\u5355\u521b\u5efa\u6210\u529f\u3002',
    redirectTo: '\u6253\u5f00\u652f\u4ed8\u9875\u9762',
  },
  services: {
    title: '\u6211\u7684\u670d\u52a1',
    subtitle: '\u7ba1\u7406\u5df2\u8d2d\u4e70\u670d\u52a1\u53ca\u8fd0\u884c\u4fe1\u606f\u3002',
    noServices: '\u60a8\u8fd8\u6ca1\u6709\u4efb\u4f55\u670d\u52a1\u3002',
    updateLabel: '\u66f4\u65b0\u6807\u7b7e',
    cancel: '\u53d6\u6d88\u670d\u52a1',
  },
  invoices: {
    title: '\u6211\u7684\u8d26\u5355',
    subtitle: '\u67e5\u770b\u8d26\u5355\u72b6\u6001\u5e76\u5b8c\u6210\u652f\u4ed8\u3002',
    noInvoices: '\u60a8\u8fd8\u6ca1\u6709\u4efb\u4f55\u8d26\u5355\u3002',
    payWithCredit: '\u4f59\u989d\u652f\u4ed8',
    payWithGateway: '\u4f7f\u7528\u652f\u4ed8\u65b9\u5f0f',
  },
  auth: {
    loginTitle: '\u767b\u5f55\u6811\u61d2\u4e91',
    loginSubtitle: '\u767b\u5f55\u540e\u5373\u53ef\u8bbf\u95ee\u8d26\u5355\u548c\u670d\u52a1\u5de5\u4f5c\u533a\u3002',
    registerTitle: '\u521b\u5efa\u60a8\u7684\u6811\u61d2\u4e91\u8d26\u6237',
    registerSubtitle: '\u6ce8\u518c\u540e\u5c06\u81ea\u52a8\u767b\u5f55\u3002',
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
    statement: '\u6811\u61d2\u4e91\u5ba2\u6237\u7aef\u3002\u8d26\u5355\u3001\u670d\u52a1\u548c\u8d26\u53f7\u7ba1\u7406\u90fd\u53ef\u5728\u6b64\u5b8c\u6210\u3002',
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
    affiliate: '\u9080\u8acb\u8fd4\u5229',
    invoices: '\u5e33\u55ae',
    login: '\u767b\u5165',
    register: '\u8a3b\u518a',
    logout: '\u9000\u51fa',
  },
  common: {
    ...zhCn.common,
    loading: '\u6b63\u5728\u8f09\u5165\u6a39\u61f6\u96f2\u8cc7\u6599...',
    mock: '\u9884\u89c8',
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
    statement: '\u6a39\u61f6\u96f2\u5ba2\u6237\u7aef\u3002\u8a02\u55ae\u3001\u670d\u52d9\u548c\u5e33\u6236\u7ba1\u7406\u90fd\u53ef\u5728\u6b64\u5b8c\u6210\u3002',
  },
};

const jaJp: TextContent = {
  ...enUs,
  nav: {
    home: 'ホーム',
    catalog: 'ストア',
    cart: 'カート',
    checkout: 'チェックアウト',
    services: 'サービス',
    affiliate: 'アフィリエイト',
    invoices: '請求書',
    login: 'ログイン',
    register: '登録',
    logout: 'ログアウト',
  },
  common: {
    ...enUs.common,
    loading: 'Sloth Cloud を読み込み中...',
    error: 'リクエストに失敗しました',
    backToCatalog: 'ストアへ戻る',
    sourceMode: 'データソース',
    mock: 'プレビュー',
    live: 'ライブデータ',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    empty: 'データがありません',
    loginRequired: 'ログインしてください',
    hello: 'こんにちは',
    view: '表示',
    open: '開く',
    inspect: '詳細',
    stock: '在庫',
    products: '件の商品',
    defaultPlan: 'デフォルトプラン',
    customBilling: 'カスタム課金',
    yes: 'はい',
    no: 'いいえ',
    pending: '処理中',
    slug: 'スラッグ',
    allowQuantity: '数量モード',
    perUserLimit: 'ユーザー上限',
    submit: '送信',
    remove: '削除',
    quantity: '数量',
    status: 'ステータス',
    total: '合計',
  },
  home: {
    kicker: 'Sloth Cloud',
    title: '販売運用に強いクラウドサービスフロント',
    subtitle: '商品選択、注文、決済、開通、運用管理までを 1 つのポータルで完結します。',
    primaryCta: 'ストアを見る',
    secondaryCta: 'ログイン',
    featuredTitle: '注目サービス',
    featuredSubtitle: 'リアルタイム商品データから選択できます。',
    categoryTitle: 'カテゴリ',
    categorySubtitle: 'カテゴリとスペックでサービスを探せます。',
  },
  catalog: {
    title: 'ストア',
    subtitle: 'カテゴリとスペックでサービスを絞り込めます。',
    allProducts: 'すべての商品',
    noProducts: 'このカテゴリで購入可能なサービスはまだありません。',
  },
  product: {
    ...enUs.product,
    summary: '購入概要',
    plans: '課金プラン',
    config: '購入設定',
    os: 'サービスオプション',
    details: '商品詳細',
    loginHint: 'ログインすると購入手続きとサービス管理を続けられます。',
    configEmpty: 'この商品には追加設定項目がありません。',
    addToCart: 'カートに追加',
    addSuccess: 'カートに追加しました。',
    goCheckout: 'チェックアウトへ',
  },
  checkout: {
    title: 'チェックアウト',
    subtitle: '注文内容を確認して安全に支払いを完了してください。',
    empty: 'カートは空です。',
    coupon: 'クーポン',
    couponHint: 'クーポンコードを入力して適用してください。',
    placeOrder: '注文する',
    placingOrder: '注文を送信中...',
    orderCreated: '注文を作成しました。',
    redirectTo: '支払いページを開く',
  },
  services: {
    title: 'マイサービス',
    subtitle: '契約中サービスと稼働状況を管理します。',
    noServices: 'まだサービスがありません。',
    updateLabel: 'ラベル更新',
    cancel: 'サービスを解約',
  },
  invoices: {
    title: '請求書',
    subtitle: '請求状態を確認して支払いを完了できます。',
    noInvoices: '請求書はまだありません。',
    payWithCredit: '残高で支払う',
    payWithGateway: '決済方法で支払う',
  },
  auth: {
    loginTitle: 'Sloth Cloud にログイン',
    loginSubtitle: 'ログインすると請求とサービス管理にアクセスできます。',
    registerTitle: 'Sloth Cloud アカウント作成',
    registerSubtitle: '登録後は自動でログインします。',
    email: 'メールアドレス',
    password: 'パスワード',
    code: '二段階認証コード',
    firstName: '名',
    lastName: '姓',
    passwordConfirmation: 'パスワード確認',
    submitLogin: 'ログイン',
    submitRegister: '登録',
    tfaHint: '二段階認証が有効です。認証コードを入力して再送してください。',
    alreadyHaveAccount: 'アカウントをお持ちですか？ ログイン',
    needAccount: 'アカウントが必要ですか？ 登録',
  },
  footer: {
    statement: 'Sloth Cloud ポータルで請求、サービス、アカウント管理を一元化できます。',
  },
};
const koKr: TextContent = {
  ...enUs,
  nav: {
    home: '홈',
    catalog: '스토어',
    cart: '장바구니',
    checkout: '결제',
    services: '서비스',
    affiliate: '제휴 리워드',
    invoices: '청구서',
    login: '로그인',
    register: '회원가입',
    logout: '로그아웃',
  },
  common: {
    ...enUs.common,
    loading: 'Sloth Cloud 콘텐츠를 불러오는 중...',
    error: '요청에 실패했습니다',
    backToCatalog: '스토어로 돌아가기',
    sourceMode: '데이터 소스',
    mock: '미리보기',
    live: '실데이터',
    themeDark: '다크',
    themeLight: '라이트',
    empty: '데이터가 없습니다',
    loginRequired: '로그인이 필요합니다',
    hello: '안녕하세요',
    view: '보기',
    open: '열기',
    inspect: '상세',
    stock: '재고',
    products: '개 상품',
    defaultPlan: '기본 요금제',
    customBilling: '사용자 지정 과금',
    yes: '예',
    no: '아니오',
    pending: '처리 중',
    slug: '슬러그',
    allowQuantity: '수량 모드',
    perUserLimit: '사용자당 한도',
    submit: '제출',
    remove: '삭제',
    quantity: '수량',
    status: '상태',
    total: '합계',
  },
  home: {
    kicker: 'Sloth Cloud',
    title: '판매와 운영에 최적화된 클라우드 프론트',
    subtitle: '상품 탐색, 주문, 결제, 개통, 운영 관리까지 한 포털에서 처리합니다.',
    primaryCta: '스토어 보기',
    secondaryCta: '로그인',
    featuredTitle: '추천 상품',
    featuredSubtitle: '실시간 카탈로그에서 바로 주문할 수 있습니다.',
    categoryTitle: '카테고리',
    categorySubtitle: '카테고리와 스펙으로 빠르게 찾으세요.',
  },
  catalog: {
    title: '스토어',
    subtitle: '카테고리와 용량으로 상품을 필터링하세요.',
    allProducts: '전체 상품',
    noProducts: '이 카테고리에는 아직 구매 가능한 상품이 없습니다.',
  },
  product: {
    ...enUs.product,
    summary: '구매 요약',
    plans: '요금 주기',
    config: '구매 설정',
    os: '서비스 옵션',
    details: '상품 상세',
    loginHint: '로그인 후 결제와 서비스 관리를 계속할 수 있습니다.',
    configEmpty: '이 상품에는 추가 설정 항목이 없습니다.',
    addToCart: '장바구니 추가',
    addSuccess: '장바구니에 추가되었습니다.',
    goCheckout: '결제로 이동',
  },
  checkout: {
    title: '결제',
    subtitle: '주문 내용을 확인하고 안전하게 결제하세요.',
    empty: '장바구니가 비어 있습니다.',
    coupon: '쿠폰',
    couponHint: '쿠폰 코드를 입력해 적용하세요.',
    placeOrder: '주문하기',
    placingOrder: '주문 처리 중...',
    orderCreated: '주문이 생성되었습니다.',
    redirectTo: '결제 페이지 열기',
  },
  services: {
    title: '내 서비스',
    subtitle: '활성 서비스와 런타임 상태를 관리합니다.',
    noServices: '아직 서비스가 없습니다.',
    updateLabel: '라벨 업데이트',
    cancel: '서비스 취소',
  },
  invoices: {
    title: '내 청구서',
    subtitle: '청구 상태를 확인하고 결제를 완료하세요.',
    noInvoices: '청구서가 없습니다.',
    payWithCredit: '잔액 결제',
    payWithGateway: '결제 수단으로 결제',
  },
  auth: {
    loginTitle: 'Sloth Cloud 로그인',
    loginSubtitle: '로그인 후 청구와 서비스 관리에 접근할 수 있습니다.',
    registerTitle: 'Sloth Cloud 계정 만들기',
    registerSubtitle: '가입 후 자동으로 로그인됩니다.',
    email: '이메일',
    password: '비밀번호',
    code: '2단계 인증 코드',
    firstName: '이름',
    lastName: '성',
    passwordConfirmation: '비밀번호 확인',
    submitLogin: '로그인',
    submitRegister: '회원가입',
    tfaHint: '2단계 인증이 활성화되어 있습니다. 인증 코드를 입력해 다시 시도하세요.',
    alreadyHaveAccount: '이미 계정이 있나요? 로그인',
    needAccount: '계정이 필요하신가요? 가입',
  },
  footer: {
    statement: 'Sloth Cloud 포털에서 청구, 서비스, 계정 관리를 한곳에서 처리할 수 있습니다.',
  },
};
const deDe: TextContent = {
  ...enUs,
  nav: {
    ...enUs.nav,
    home: 'Startseite',
    catalog: 'Shop',
    checkout: 'Kasse',
    services: 'Dienste',
    affiliate: 'Partnerprogramm',
    invoices: 'Rechnungen',
    login: 'Anmelden',
    register: 'Registrieren',
    logout: 'Abmelden',
  },
  common: {
    ...enUs.common,
    loading: 'Sloth Cloud wird geladen...',
    error: 'Anfrage fehlgeschlagen',
    backToCatalog: 'Zurück zum Shop',
    loginRequired: 'Bitte anmelden, um fortzufahren',
    hello: 'Hallo',
    inspect: 'Details',
    products: 'Produkte',
    pending: 'In Bearbeitung',
    remove: 'Entfernen',
    quantity: 'Menge',
    status: 'Status',
    total: 'Gesamt',
  },
  home: {
    ...enUs.home,
    title: 'Cloud-Plattform für Verkauf und Betrieb',
    subtitle: 'Produktauswahl, Bestellung, Zahlung und Serviceverwaltung in einem Portal.',
    primaryCta: 'Shop ansehen',
    secondaryCta: 'Anmelden',
  },
  services: {
    ...enUs.services,
    title: 'Meine Dienste',
  },
  invoices: {
    ...enUs.invoices,
    title: 'Meine Rechnungen',
  },
  auth: {
    ...enUs.auth,
    loginTitle: 'Bei Sloth Cloud anmelden',
    registerTitle: 'Sloth Cloud-Konto erstellen',
    submitLogin: 'Anmelden',
    submitRegister: 'Konto erstellen',
  },
};

const frFr: TextContent = {
  ...enUs,
  nav: {
    ...enUs.nav,
    home: 'Accueil',
    catalog: 'Boutique',
    checkout: 'Paiement',
    services: 'Services',
    affiliate: 'Affiliation',
    invoices: 'Factures',
    login: 'Connexion',
    register: 'Inscription',
    logout: 'Déconnexion',
  },
  common: {
    ...enUs.common,
    loading: 'Chargement de Sloth Cloud...',
    error: 'Échec de la requête',
    backToCatalog: 'Retour à la boutique',
    loginRequired: 'Connectez-vous pour continuer',
    hello: 'Bonjour',
    inspect: 'Détails',
    products: 'produits',
    pending: 'En cours',
    remove: 'Supprimer',
    quantity: 'Quantité',
    status: 'Statut',
    total: 'Total',
  },
  home: {
    ...enUs.home,
    title: 'Portail cloud prêt pour la vente et l’exploitation',
    subtitle: 'Achetez, payez et gérez vos services depuis une seule interface.',
    primaryCta: 'Voir la boutique',
    secondaryCta: 'Se connecter',
  },
  services: {
    ...enUs.services,
    title: 'Mes services',
  },
  invoices: {
    ...enUs.invoices,
    title: 'Mes factures',
  },
  auth: {
    ...enUs.auth,
    loginTitle: 'Connexion à Sloth Cloud',
    registerTitle: 'Créer un compte Sloth Cloud',
    submitLogin: 'Se connecter',
    submitRegister: 'Créer le compte',
  },
};

const esEs: TextContent = {
  ...enUs,
  nav: {
    ...enUs.nav,
    home: 'Inicio',
    catalog: 'Tienda',
    checkout: 'Pago',
    services: 'Servicios',
    affiliate: 'Afiliados',
    invoices: 'Facturas',
    login: 'Iniciar sesión',
    register: 'Registrarse',
    logout: 'Cerrar sesión',
  },
  common: {
    ...enUs.common,
    loading: 'Cargando Sloth Cloud...',
    error: 'La solicitud falló',
    backToCatalog: 'Volver a la tienda',
    loginRequired: 'Inicia sesión para continuar',
    hello: 'Hola',
    inspect: 'Detalles',
    products: 'productos',
    pending: 'En proceso',
    remove: 'Eliminar',
    quantity: 'Cantidad',
    status: 'Estado',
    total: 'Total',
  },
  home: {
    ...enUs.home,
    title: 'Portal cloud para venta y operación',
    subtitle: 'Compra, pago y gestión de servicios en una sola plataforma.',
    primaryCta: 'Ver tienda',
    secondaryCta: 'Iniciar sesión',
  },
  services: {
    ...enUs.services,
    title: 'Mis servicios',
  },
  invoices: {
    ...enUs.invoices,
    title: 'Mis facturas',
  },
  auth: {
    ...enUs.auth,
    loginTitle: 'Inicia sesión en Sloth Cloud',
    registerTitle: 'Crea tu cuenta de Sloth Cloud',
    submitLogin: 'Iniciar sesión',
    submitRegister: 'Crear cuenta',
  },
};

const ruRu: TextContent = {
  ...enUs,
  nav: {
    ...enUs.nav,
    home: 'Главная',
    catalog: 'Магазин',
    checkout: 'Оплата',
    services: 'Сервисы',
    affiliate: 'Партнерка',
    invoices: 'Счета',
    login: 'Войти',
    register: 'Регистрация',
    logout: 'Выйти',
  },
  common: {
    ...enUs.common,
    loading: 'Загрузка Sloth Cloud...',
    error: 'Ошибка запроса',
    backToCatalog: 'Назад в магазин',
    loginRequired: 'Войдите, чтобы продолжить',
    hello: 'Здравствуйте',
    inspect: 'Детали',
    products: 'товаров',
    pending: 'В обработке',
    remove: 'Удалить',
    quantity: 'Количество',
    status: 'Статус',
    total: 'Итого',
  },
  home: {
    ...enUs.home,
    title: 'Облачный портал для продаж и эксплуатации',
    subtitle: 'Покупка, оплата и управление сервисами в одном интерфейсе.',
    primaryCta: 'Открыть магазин',
    secondaryCta: 'Войти',
  },
  services: {
    ...enUs.services,
    title: 'Мои сервисы',
  },
  invoices: {
    ...enUs.invoices,
    title: 'Мои счета',
  },
  auth: {
    ...enUs.auth,
    loginTitle: 'Вход в Sloth Cloud',
    registerTitle: 'Создать аккаунт Sloth Cloud',
    submitLogin: 'Войти',
    submitRegister: 'Создать аккаунт',
  },
};

const ptBr: TextContent = {
  ...enUs,
  nav: {
    ...enUs.nav,
    home: 'Início',
    catalog: 'Loja',
    checkout: 'Checkout',
    services: 'Serviços',
    affiliate: 'Afiliados',
    invoices: 'Faturas',
    login: 'Entrar',
    register: 'Cadastrar',
    logout: 'Sair',
  },
  common: {
    ...enUs.common,
    loading: 'Carregando Sloth Cloud...',
    error: 'Falha na requisição',
    backToCatalog: 'Voltar para a loja',
    loginRequired: 'Faça login para continuar',
    hello: 'Olá',
    inspect: 'Detalhes',
    products: 'produtos',
    pending: 'Em processamento',
    remove: 'Remover',
    quantity: 'Quantidade',
    status: 'Status',
    total: 'Total',
  },
  home: {
    ...enUs.home,
    title: 'Portal cloud para venda e operação',
    subtitle: 'Compra, pagamento e gestão de serviços em uma única plataforma.',
    primaryCta: 'Ver loja',
    secondaryCta: 'Entrar',
  },
  services: {
    ...enUs.services,
    title: 'Meus serviços',
  },
  invoices: {
    ...enUs.invoices,
    title: 'Minhas faturas',
  },
  auth: {
    ...enUs.auth,
    loginTitle: 'Entrar no Sloth Cloud',
    registerTitle: 'Criar conta no Sloth Cloud',
    submitLogin: 'Entrar',
    submitRegister: 'Criar conta',
  },
};

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
