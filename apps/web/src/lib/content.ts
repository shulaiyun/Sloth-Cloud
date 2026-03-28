export const localeMeta = {
  'zh-CN': { code: 'CN', label: '简体中文' },
  'zh-TW': { code: 'TW', label: '繁體中文' },
  'en-US': { code: 'US', label: 'English' },
  'ja-JP': { code: 'JP', label: '日本語' },
  'ko-KR': { code: 'KR', label: '한국어' },
  'de-DE': { code: 'DE', label: 'Deutsch' },
  'fr-FR': { code: 'FR', label: 'Français' },
  'es-ES': { code: 'ES', label: 'Español' },
  'ru-RU': { code: 'RU', label: 'Русский' },
  'pt-BR': { code: 'BR', label: 'Português (BR)' },
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
    mock: 'Mock mode',
    live: 'Live',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'No data yet',
    loginRequired: 'Sign in to continue',
    hello: 'Hello',
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
    submit: 'Submit',
    remove: 'Remove',
    quantity: 'Quantity',
    status: 'Status',
    total: 'Total',
  },
  home: {
    kicker: 'Sloth Cloud Headless Client',
    title: 'Built like a premium VPS storefront, not a default panel skin',
    subtitle: 'Modern UX powered by a headless billing core and edge BFF.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Live products',
    featuredSubtitle: 'These cards are rendered from headless catalog APIs.',
    categoryTitle: 'Live categories',
    categorySubtitle: 'Categories and prices are no longer bound to old Livewire pages.',
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
    redirectTo: 'Open target',
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
    loginSubtitle: 'Use Paymenter headless auth through the BFF session.',
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
    statement: '树懒云前台。认证、商品、结算、服务、账单均由边缘 BFF 对接真实数据。',
  },
};

const zhCn: TextContent = {
  nav: {
    home: '首页',
    catalog: '商店',
    cart: '购物车',
    checkout: '结算',
    services: '服务',
    invoices: '账单',
    login: '登录',
    register: '注册',
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
    empty: '暂无数据',
    loginRequired: '请先登录',
    hello: '你好',
    view: '查看',
    open: '打开',
    inspect: '详情',
    stock: '库存',
    products: '个产品',
    defaultPlan: '默认套餐',
    customBilling: '自定义周期',
    yes: '是',
    no: '否',
    pending: '待处理',
    slug: '标识',
    allowQuantity: '数量模式',
    perUserLimit: '单用户限制',
    submit: '提交',
    remove: '移除',
    quantity: '数量',
    status: '状态',
    total: '总计',
  },
  home: {
    kicker: '树懒云 HEADLESS 客户端',
    title: '更像专业 VPS 服务商，而不是默认面板皮肤',
    subtitle: '现代品牌体验，Headless 计费核心，长期可扩展架构。',
    primaryCta: '进入商店',
    secondaryCta: '立即登录',
    featuredTitle: '真实商品',
    featuredSubtitle: '这些卡片来自新的 Headless 商品接口。',
    categoryTitle: '真实分类',
    categorySubtitle: '分类、商品和价格不再绑定旧的 Livewire 页面。',
  },
  catalog: {
    title: '商店 / 分类',
    subtitle: '按分类浏览真实商品。',
    allProducts: '全部商品',
    noProducts: '当前分类下暂无商品。',
  },
  product: {
    summary: '购买概览',
    plans: '计费周期',
    config: '购买配置',
    os: '操作系统',
    details: '产品详情',
    loginHint: '登录后即可继续完整下单流程。',
    configEmpty: '该商品当前没有额外配置项。',
    addToCart: '加入购物车',
    addSuccess: '已加入购物车。',
    goCheckout: '前往结算',
  },
  checkout: {
    title: '结算',
    subtitle: '确认购物车、优惠码并提交订单。',
    empty: '你的购物车当前为空。',
    coupon: '优惠码',
    couponHint: '输入优惠码后点击应用。',
    placeOrder: '提交订单',
    placingOrder: '提交中...',
    orderCreated: '订单创建成功。',
    redirectTo: '打开目标页',
  },
  services: {
    title: '我的服务',
    subtitle: '管理已购买服务与运行信息。',
    noServices: '暂无服务。',
    updateLabel: '更新标签',
    cancel: '取消服务',
  },
  invoices: {
    title: '我的账单',
    subtitle: '查看账单状态并完成支付。',
    noInvoices: '暂无账单。',
    payWithCredit: '余额支付',
    payWithGateway: '网关支付',
  },
  auth: {
    loginTitle: '登录树懒云',
    loginSubtitle: '通过 BFF 会话接入 Paymenter Headless 认证。',
    registerTitle: '创建你的树懒云账号',
    registerSubtitle: '注册成功后将自动登录。',
    email: '邮箱',
    password: '密码',
    code: '二次验证码',
    firstName: '名',
    lastName: '姓',
    passwordConfirmation: '确认密码',
    submitLogin: '登录',
    submitRegister: '注册',
    tfaHint: '该账号已开启双重验证，请输入验证码后重试。',
    alreadyHaveAccount: '已有账号？去登录',
    needAccount: '还没有账号？去注册',
  },
  footer: {
    statement: '树懒云前台。认证、商品、结算、服务、账单均由边缘 BFF 对接真实数据。',
  },
};

const zhTw: TextContent = {
  ...zhCn,
  nav: {
    home: '首頁',
    catalog: '商店',
    cart: '購物車',
    checkout: '結算',
    services: '服務',
    invoices: '帳單',
    login: '登入',
    register: '註冊',
    logout: '登出',
  },
  common: {
    ...zhCn.common,
    loading: '正在載入樹懶雲資料...',
    products: '個商品',
    customBilling: '自訂週期',
  },
  home: {
    ...zhCn.home,
    subtitle: '現代品牌體驗，Headless 計費核心，長期可擴展架構。',
  },
  catalog: {
    ...zhCn.catalog,
    subtitle: '依分類瀏覽真實商品。',
    noProducts: '目前分類下暫無商品。',
  },
  product: {
    ...zhCn.product,
    summary: '購買概覽',
    plans: '計費週期',
    config: '購買設定',
    details: '產品詳情',
    configEmpty: '此商品目前沒有額外設定項目。',
  },
  checkout: {
    ...zhCn.checkout,
    subtitle: '確認購物車、優惠碼並提交訂單。',
    empty: '你的購物車目前為空。',
  },
  services: {
    ...zhCn.services,
    subtitle: '管理已購買服務與執行資訊。',
    noServices: '暫無服務。',
  },
  invoices: {
    ...zhCn.invoices,
    subtitle: '查看帳單狀態並完成付款。',
    noInvoices: '暫無帳單。',
  },
  auth: {
    ...zhCn.auth,
    loginTitle: '登入樹懶雲',
    registerTitle: '建立你的樹懶雲帳號',
    submitRegister: '註冊',
    needAccount: '還沒有帳號？去註冊',
    alreadyHaveAccount: '已有帳號？去登入',
  },
};

const jaJp: TextContent = {
  ...enUs,
  nav: {
    home: 'ホーム',
    catalog: 'ストア',
    cart: 'カート',
    checkout: '決済',
    services: 'サービス',
    invoices: '請求書',
    login: 'ログイン',
    register: '登録',
    logout: 'ログアウト',
  },
  common: {
    ...enUs.common,
    loading: 'データを読み込み中...',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    hello: 'こんにちは',
    submit: '送信',
    remove: '削除',
    quantity: '数量',
    total: '合計',
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
    invoices: '청구서',
    login: '로그인',
    register: '회원가입',
    logout: '로그아웃',
  },
  common: {
    ...enUs.common,
    loading: '데이터를 불러오는 중...',
    themeDark: '다크',
    themeLight: '라이트',
    hello: '안녕하세요',
    submit: '제출',
    remove: '삭제',
    quantity: '수량',
    total: '합계',
  },
};

const deDe: TextContent = {
  ...enUs,
  nav: {
    home: 'Start',
    catalog: 'Shop',
    cart: 'Warenkorb',
    checkout: 'Kasse',
    services: 'Dienste',
    invoices: 'Rechnungen',
    login: 'Anmelden',
    register: 'Registrieren',
    logout: 'Abmelden',
  },
  common: {
    ...enUs.common,
    loading: 'Lade Daten...',
    themeDark: 'Dunkel',
    themeLight: 'Hell',
    hello: 'Hallo',
    submit: 'Senden',
    remove: 'Entfernen',
    quantity: 'Menge',
    total: 'Summe',
  },
};

const frFr: TextContent = {
  ...enUs,
  nav: {
    home: 'Accueil',
    catalog: 'Boutique',
    cart: 'Panier',
    checkout: 'Paiement',
    services: 'Services',
    invoices: 'Factures',
    login: 'Connexion',
    register: 'Inscription',
    logout: 'Déconnexion',
  },
  common: {
    ...enUs.common,
    loading: 'Chargement des données...',
    themeDark: 'Sombre',
    themeLight: 'Clair',
    hello: 'Bonjour',
    submit: 'Valider',
    remove: 'Supprimer',
    quantity: 'Quantité',
    total: 'Total',
  },
};

const esEs: TextContent = {
  ...enUs,
  nav: {
    home: 'Inicio',
    catalog: 'Tienda',
    cart: 'Carrito',
    checkout: 'Pago',
    services: 'Servicios',
    invoices: 'Facturas',
    login: 'Entrar',
    register: 'Registro',
    logout: 'Salir',
  },
  common: {
    ...enUs.common,
    loading: 'Cargando datos...',
    themeDark: 'Oscuro',
    themeLight: 'Claro',
    hello: 'Hola',
    submit: 'Enviar',
    remove: 'Quitar',
    quantity: 'Cantidad',
    total: 'Total',
  },
};

const ruRu: TextContent = {
  ...enUs,
  nav: {
    home: 'Главная',
    catalog: 'Магазин',
    cart: 'Корзина',
    checkout: 'Оплата',
    services: 'Сервисы',
    invoices: 'Счета',
    login: 'Вход',
    register: 'Регистрация',
    logout: 'Выход',
  },
  common: {
    ...enUs.common,
    loading: 'Загрузка данных...',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    hello: 'Здравствуйте',
    submit: 'Отправить',
    remove: 'Удалить',
    quantity: 'Количество',
    total: 'Итого',
  },
};

const ptBr: TextContent = {
  ...enUs,
  nav: {
    home: 'Início',
    catalog: 'Loja',
    cart: 'Carrinho',
    checkout: 'Checkout',
    services: 'Serviços',
    invoices: 'Faturas',
    login: 'Entrar',
    register: 'Registrar',
    logout: 'Sair',
  },
  common: {
    ...enUs.common,
    loading: 'Carregando dados...',
    themeDark: 'Escuro',
    themeLight: 'Claro',
    hello: 'Olá',
    submit: 'Enviar',
    remove: 'Remover',
    quantity: 'Quantidade',
    total: 'Total',
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
