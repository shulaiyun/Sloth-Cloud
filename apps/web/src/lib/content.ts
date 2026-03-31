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
  language: {
    menuTitle: string;
    menuHint: string;
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
    search: string;
    sort: string;
    due: string;
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
    dataOverviewTitle: string;
    dataOverviewSubtitle: string;
    emptyProductsTitle: string;
    emptyProductsBody: string;
    emptyCategoriesTitle: string;
    emptyCategoriesBody: string;
    signalProvisioning: string;
    signalBilling: string;
    signalGlobal: string;
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
    searchPlaceholder: string;
    statusAll: string;
    sortByStatus: string;
    sortPriceDesc: string;
    sortPriceAsc: string;
    sortExpiresAsc: string;
    statusActive: string;
    statusPending: string;
    statusSuspended: string;
    statusCancelled: string;
    statusUnknown: string;
  };
  invoices: {
    title: string;
    subtitle: string;
    noInvoices: string;
    payWithCredit: string;
    payWithGateway: string;
    searchPlaceholder: string;
    statusAll: string;
    statusPaid: string;
    statusPending: string;
    statusCancelled: string;
    statusOverdue: string;
    statusUnknown: string;
    sortNewest: string;
    sortDue: string;
    sortAmountDesc: string;
    sortAmountAsc: string;
    sortByStatus: string;
    relatedServiceLabel: string;
    paidBannerTitle: string;
    paidBannerBody: string;
    paymentGatewayLabel: string;
    noGateway: string;
    continuePayment: string;
    openPaymentPage: string;
    paymentConfirmed: string;
  };
  serviceDetail: {
    infoTitle: string;
    operationsTitle: string;
    linkedInvoices: string;
    start: string;
    stop: string;
    restart: string;
    reinstall: string;
    revealPassword: string;
    suspend: string;
    unsuspend: string;
    tempPassword: string;
    mapMissing: string;
    convoyDisabled: string;
    serverRef: string;
    state: string;
    ipAddress: string;
    locked: string;
    cpu: string;
    memory: string;
    disk: string;
    inbound: string;
    outbound: string;
    actionSuccess: string;
    unavailable: string;
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
  language: {
    menuTitle: 'Language',
    menuHint: 'Switch interface language',
  },
  common: {
    loading: 'Loading...',
    error: 'Request failed',
    backToCatalog: 'Back to store',
    sourceMode: 'Data source',
    mock: 'Demo mode',
    live: 'Live',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'No data',
    loginRequired: 'Please login first',
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
    quantity: 'Qty',
    status: 'Status',
    total: 'Total',
    search: 'Search',
    sort: 'Sort',
    due: 'Due',
  },
  home: {
    kicker: 'Shulai Cloud',
    title: 'Professional VPS storefront, not a default panel skin',
    subtitle: 'Built for real commerce workflows: catalog, billing, service delivery, and lifecycle operations.',
    primaryCta: 'Browse store',
    secondaryCta: 'Login now',
    featuredTitle: 'Featured products',
    featuredSubtitle: 'Ready-to-sell plans powered by real data',
    categoryTitle: 'Categories',
    categorySubtitle: 'Structured catalog for clear product discovery',
    dataOverviewTitle: 'Platform overview',
    dataOverviewSubtitle: 'Current storefront and service data snapshot',
    emptyProductsTitle: 'No products published',
    emptyProductsBody: 'Publish at least one product in Paymenter to start selling from the storefront.',
    emptyCategoriesTitle: 'No categories configured',
    emptyCategoriesBody: 'Create categories in Paymenter to improve navigation and conversion.',
    signalProvisioning: 'Auto provisioning',
    signalBilling: 'Accurate billing',
    signalGlobal: 'Global operations',
  },
  catalog: {
    title: 'Catalog',
    subtitle: 'Choose a product and complete purchase flow',
    allProducts: 'All products',
    noProducts: 'No products are available in this category.',
  },
  product: {
    summary: 'Purchase summary',
    plans: 'Billing plans',
    config: 'Configuration options',
    details: 'Product details',
    loginHint: 'Login is required to continue checkout.',
    configEmpty: 'No configurable options for this product.',
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart',
    goCheckout: 'Go to checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Confirm cart, apply coupon, and place order',
    empty: 'Your cart is empty.',
    coupon: 'Coupon',
    couponHint: 'Enter coupon code and apply.',
    placeOrder: 'Place order',
    placingOrder: 'Submitting...',
    orderCreated: 'Order created successfully',
    redirectTo: 'Redirecting to',
  },
  services: {
    title: 'My services',
    subtitle: 'Manage purchased services and runtime status',
    noServices: 'No services found yet.',
    updateLabel: 'Update label',
    cancel: 'Cancel service',
    searchPlaceholder: 'Search by service name, product, or ID',
    statusAll: 'All statuses',
    sortByStatus: 'Sort by status',
    sortPriceDesc: 'Amount high to low',
    sortPriceAsc: 'Amount low to high',
    sortExpiresAsc: 'Earliest due date',
    statusActive: 'Active',
    statusPending: 'Pending',
    statusSuspended: 'Suspended',
    statusCancelled: 'Cancelled',
    statusUnknown: 'Unknown',
  },
  invoices: {
    title: 'My invoices',
    subtitle: 'Track billing state and payment records',
    noInvoices: 'No invoices found.',
    payWithCredit: 'Pay with credit',
    payWithGateway: 'Pay via gateway',
    searchPlaceholder: 'Search by invoice number, user, or amount',
    statusAll: 'All statuses',
    statusPaid: 'Paid',
    statusPending: 'Pending',
    statusCancelled: 'Cancelled',
    statusOverdue: 'Overdue',
    statusUnknown: 'Unknown',
    sortNewest: 'Newest first',
    sortDue: 'Due date',
    sortAmountDesc: 'Amount high to low',
    sortAmountAsc: 'Amount low to high',
    sortByStatus: 'Sort by status',
    relatedServiceLabel: 'Related service',
    paidBannerTitle: 'Payment completed',
    paidBannerBody: 'This invoice is already paid. No further action required.',
    paymentGatewayLabel: 'Payment gateway',
    noGateway: 'No payment gateway is available for this invoice.',
    continuePayment: 'Continue payment',
    openPaymentPage: 'Open gateway page',
    paymentConfirmed: 'Payment confirmed.',
  },
  serviceDetail: {
    infoTitle: 'Service info',
    operationsTitle: 'Service actions',
    linkedInvoices: 'Linked invoices',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    reinstall: 'Reinstall',
    revealPassword: 'Reveal password',
    suspend: 'Suspend',
    unsuspend: 'Unsuspend',
    tempPassword: 'Temporary password',
    mapMissing: 'Server mapping is not ready yet. Provisioning may still be in progress.',
    convoyDisabled: 'Server control is disabled by platform configuration.',
    serverRef: 'Server reference',
    state: 'State',
    ipAddress: 'IP address',
    locked: 'Locked',
    cpu: 'CPU',
    memory: 'Memory',
    disk: 'Disk',
    inbound: 'Inbound',
    outbound: 'Outbound',
    actionSuccess: 'Action submitted successfully.',
    unavailable: 'Unavailable',
  },
  auth: {
    loginTitle: 'Login to Shulai Cloud',
    loginSubtitle: 'Authenticate through BFF session backed by Paymenter.',
    registerTitle: 'Create account',
    registerSubtitle: 'Register once to manage orders, invoices, and services.',
    email: 'Email',
    password: 'Password',
    code: 'Code',
    firstName: 'First name',
    lastName: 'Last name',
    passwordConfirmation: 'Confirm password',
    submitLogin: 'Login',
    submitRegister: 'Register',
    tfaHint: 'Two-factor code is required.',
    alreadyHaveAccount: 'Already have an account? Login',
    needAccount: "Don't have an account? Register",
  },
  footer: {
    statement: 'Tree-lazy cloud storefront. Authentication, ordering, billing, and service control are unified through BFF.',
  },
};

const zhCn: TextContent = {
  ...enUs,
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
  language: {
    menuTitle: '语言',
    menuHint: '切换界面语言',
  },
  common: {
    ...enUs.common,
    loading: '加载中...',
    error: '请求失败',
    backToCatalog: '返回商店',
    sourceMode: '数据来源',
    mock: '演示模式',
    live: '实时',
    themeDark: '黑暗',
    themeLight: '明亮',
    empty: '暂无数据',
    loginRequired: '请先登录',
    hello: '你好',
    view: '查看',
    open: '打开',
    inspect: '查看',
    stock: '库存',
    products: '个产品',
    defaultPlan: '默认套餐',
    customBilling: '自定义计费',
    yes: '是',
    no: '否',
    pending: '处理中',
    slug: '标识',
    allowQuantity: '数量模式',
    perUserLimit: '单用户限制',
    submit: '提交',
    remove: '移除',
    quantity: '数量',
    status: '状态',
    total: '总计',
    search: '搜索',
    sort: '排序',
    due: '到期',
  },
  home: {
    kicker: '树懒云',
    title: '更像专业 VPS 服务商，而不是默认面板皮肤',
    subtitle: '围绕真实商用流程打造：商品展示、计费下单、自动交付与生命周期控制。',
    primaryCta: '进入商店',
    secondaryCta: '立即登录',
    featuredTitle: '热门产品',
    featuredSubtitle: '基于真实数据展示的可售套餐',
    categoryTitle: '分类',
    categorySubtitle: '结构化目录，提升选购效率',
    dataOverviewTitle: '平台概览',
    dataOverviewSubtitle: '当前前台与服务数据快照',
    emptyProductsTitle: '暂无已发布产品',
    emptyProductsBody: '请先在 Paymenter 发布商品后再进行前台售卖。',
    emptyCategoriesTitle: '暂无分类',
    emptyCategoriesBody: '请先在 Paymenter 创建分类以提升导航体验。',
    signalProvisioning: '自动开通',
    signalBilling: '准确计费',
    signalGlobal: '全球可运营',
  },
  catalog: {
    title: '商品目录',
    subtitle: '选择产品并完成购买流程',
    allProducts: '全部商品',
    noProducts: '当前分类下暂无商品。',
  },
  product: {
    summary: '购买概览',
    plans: '计费周期',
    config: '配置项',
    details: '产品详情',
    loginHint: '请先登录再继续下单。',
    configEmpty: '该商品暂无可选配置。',
    addToCart: '加入购物车',
    addSuccess: '已加入购物车',
    goCheckout: '前往结算',
  },
  checkout: {
    title: '结算',
    subtitle: '确认购物车、优惠码并提交订单',
    empty: '你的购物车为空。',
    coupon: '优惠码',
    couponHint: '输入优惠码后点击应用。',
    placeOrder: '提交订单',
    placingOrder: '正在提交...',
    orderCreated: '订单创建成功',
    redirectTo: '即将跳转到',
  },
  services: {
    title: '我的服务',
    subtitle: '管理已购买服务与运行状态',
    noServices: '还没有可用服务。',
    updateLabel: '更新标签',
    cancel: '取消服务',
    searchPlaceholder: '输入服务名、产品名或 ID',
    statusAll: '全部状态',
    sortByStatus: '按状态排序',
    sortPriceDesc: '按金额从高到低',
    sortPriceAsc: '按金额从低到高',
    sortExpiresAsc: '按到期时间',
    statusActive: '运行中',
    statusPending: '待开通',
    statusSuspended: '已暂停',
    statusCancelled: '已取消',
    statusUnknown: '未知',
  },
  invoices: {
    title: '我的账单',
    subtitle: '跟踪账单状态和支付记录',
    noInvoices: '暂无账单记录。',
    payWithCredit: '余额支付',
    payWithGateway: '网关支付',
    searchPlaceholder: '输入账单编号、用户或金额',
    statusAll: '全部状态',
    statusPaid: '已支付',
    statusPending: '待支付',
    statusCancelled: '已取消',
    statusOverdue: '已逾期',
    statusUnknown: '未知',
    sortNewest: '最新优先',
    sortDue: '按到期时间',
    sortAmountDesc: '按金额从高到低',
    sortAmountAsc: '按金额从低到高',
    sortByStatus: '按状态排序',
    relatedServiceLabel: '关联服务',
    paidBannerTitle: '支付成功',
    paidBannerBody: '当前账单已完成支付，无需再次操作。',
    paymentGatewayLabel: '支付网关',
    noGateway: '当前账单暂无可用支付网关。',
    continuePayment: '继续支付',
    openPaymentPage: '打开支付页',
    paymentConfirmed: '支付已确认。',
  },
  serviceDetail: {
    infoTitle: '服务信息',
    operationsTitle: '服务操作',
    linkedInvoices: '关联账单',
    start: '开机',
    stop: '关机',
    restart: '重启',
    reinstall: '重装系统',
    revealPassword: '显示密码',
    suspend: '暂停',
    unsuspend: '解除暂停',
    tempPassword: '临时密码',
    mapMissing: '服务映射尚未完成，系统可能仍在开通中。',
    convoyDisabled: '平台未启用服务器控制能力。',
    serverRef: '服务器标识',
    state: '状态',
    ipAddress: 'IP 地址',
    locked: '锁定',
    cpu: 'CPU',
    memory: '内存',
    disk: '磁盘',
    inbound: '入站流量',
    outbound: '出站流量',
    actionSuccess: '操作已提交，请稍后刷新状态。',
    unavailable: '不可用',
  },
  auth: {
    loginTitle: '登录树懒云',
    loginSubtitle: '通过 BFF 会话接入 Paymenter 认证。',
    registerTitle: '注册树懒云账户',
    registerSubtitle: '注册后可统一管理订单、账单和服务。',
    email: '邮箱',
    password: '密码',
    code: '验证码',
    firstName: '名',
    lastName: '姓',
    passwordConfirmation: '确认密码',
    submitLogin: '登录',
    submitRegister: '注册',
    tfaHint: '请输入双重验证代码。',
    alreadyHaveAccount: '已有账户？去登录',
    needAccount: '还没有账户？去注册',
  },
  footer: {
    statement: '树懒云前台。认证、下单、账单和服务控制统一通过 BFF 对接真实数据。',
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
    loading: '載入中...',
    error: '請求失敗',
    pending: '處理中',
    products: '個產品',
    themeLight: '明亮',
  },
  home: {
    ...zhCn.home,
    subtitle: '面向真實商用流程：商品展示、計費下單、自動交付與生命週期控制。',
    emptyProductsBody: '請先在 Paymenter 發佈商品後再進行前台銷售。',
    emptyCategoriesBody: '請先在 Paymenter 建立分類以提升導覽體驗。',
  },
  checkout: {
    ...zhCn.checkout,
    couponHint: '輸入優惠碼後點擊套用。',
  },
  services: {
    ...zhCn.services,
    statusActive: '運行中',
  },
  invoices: {
    ...zhCn.invoices,
    title: '我的帳單',
    subtitle: '追蹤帳單狀態與付款紀錄',
  },
  auth: {
    ...zhCn.auth,
    loginTitle: '登入樹懶雲',
    registerTitle: '註冊樹懶雲帳戶',
  },
  footer: {
    statement: '樹懶雲前台。認證、下單、帳單與服務控制皆由 BFF 對接真實資料。',
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
    invoices: '請求書',
    login: 'ログイン',
    register: '登録',
    logout: 'ログアウト',
  },
  language: {
    menuTitle: '言語',
    menuHint: '表示言語を切り替える',
  },
  common: {
    ...enUs.common,
    loading: '読み込み中...',
    error: 'リクエストに失敗しました',
    live: '稼働中',
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
  language: {
    menuTitle: '언어',
    menuHint: '인터페이스 언어 전환',
  },
  common: {
    ...enUs.common,
    loading: '불러오는 중...',
    error: '요청 실패',
    live: '실시간',
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
  language: {
    menuTitle: 'Sprache',
    menuHint: 'Oberflächensprache wechseln',
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
  language: {
    menuTitle: 'Langue',
    menuHint: "Changer la langue de l'interface",
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
    login: 'Iniciar sesión',
    register: 'Registrarse',
    logout: 'Salir',
  },
  language: {
    menuTitle: 'Idioma',
    menuHint: 'Cambiar idioma de la interfaz',
  },
};

const ruRu: TextContent = {
  ...enUs,
  nav: {
    home: 'Главная',
    catalog: 'Магазин',
    cart: 'Корзина',
    checkout: 'Оплата',
    services: 'Услуги',
    invoices: 'Счета',
    login: 'Вход',
    register: 'Регистрация',
    logout: 'Выход',
  },
  language: {
    menuTitle: 'Язык',
    menuHint: 'Сменить язык интерфейса',
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
  language: {
    menuTitle: 'Idioma',
    menuHint: 'Trocar idioma da interface',
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
