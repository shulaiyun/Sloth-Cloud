export const localeMeta = {
  'zh-CN': { code: 'CN', label: '中文' },
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
    mock: 'Demo mode',
    live: 'Live data',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'Nothing to show yet',
    loginRequired: 'Continue with login',
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
    subtitle: 'A modern customer experience powered by a headless billing core and edge BFF.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Live products',
    featuredSubtitle: 'Rendered from the new headless catalog endpoints.',
    categoryTitle: 'Live categories',
    categorySubtitle: 'Categories and prices are no longer tied to old Livewire pages.',
  },
  catalog: {
    title: 'Store / Categories',
    subtitle: 'Browse real products by category.',
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
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart successfully.',
    goCheckout: 'Go to checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Review cart items, coupon, and complete order creation.',
    empty: 'Your cart is currently empty.',
    coupon: 'Coupon',
    couponHint: 'Enter a coupon code and apply.',
    placeOrder: 'Place order',
    placingOrder: 'Placing order...',
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
    statement: 'Sloth Cloud storefront. Auth, catalog, checkout, services, and invoices are connected by the edge BFF.',
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
    empty: '暂无内容',
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
    kicker: '树懒云 Headless 客户端',
    title: '更像专业 VPS 服务商，而不是默认面板皮肤',
    subtitle: '现代品牌体验，Headless 计费核心，长期可扩展架构。',
    primaryCta: '进入商店',
    secondaryCta: '立即登录',
    featuredTitle: '真实商品',
    featuredSubtitle: '这些卡片来自新的 Headless 商品接口。',
    categoryTitle: '真实分类',
    categorySubtitle: '分类和价格不再绑定旧 Livewire 页面。',
  },
  catalog: {
    title: '商店 / 分类',
    subtitle: '按分类浏览真实商品。',
    allProducts: '全部产品',
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
    placingOrder: '正在下单...',
    orderCreated: '订单创建成功。',
    redirectTo: '打开目标页',
  },
  services: {
    title: '我的服务',
    subtitle: '管理已购服务并查看运行信息。',
    noServices: '暂无服务。',
    updateLabel: '更新名称',
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
    loginSubtitle: '通过 BFF 会话连接 Paymenter Headless 认证。',
    registerTitle: '创建树懒云账号',
    registerSubtitle: '注册成功后自动登录。',
    email: '邮箱',
    password: '密码',
    code: '双重验证码',
    firstName: '名字',
    lastName: '姓氏',
    passwordConfirmation: '确认密码',
    submitLogin: '登录',
    submitRegister: '注册',
    tfaHint: '检测到双重验证，请输入验证码后重试。',
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
    products: '個產品',
    customBilling: '自訂週期',
  },
  home: {
    ...zhCn.home,
    title: '更像專業 VPS 服務商，而不是預設面板皮膚',
    subtitle: '現代品牌體驗，Headless 計費核心，長期可擴展架構。',
  },
  catalog: {
    ...zhCn.catalog,
    subtitle: '依分類瀏覽真實商品。',
    noProducts: '目前分類下暫無商品。',
  },
  product: {
    ...zhCn.product,
    summary: '購買總覽',
    plans: '計費週期',
    config: '購買配置',
    details: '產品詳情',
    configEmpty: '此商品目前沒有額外配置項。',
  },
  checkout: {
    ...zhCn.checkout,
    subtitle: '確認購物車、優惠碼並提交訂單。',
    empty: '你的購物車目前為空。',
  },
  services: {
    ...zhCn.services,
    subtitle: '管理已購服務並查看運行資訊。',
    noServices: '暫無服務。',
  },
  invoices: {
    ...zhCn.invoices,
    subtitle: '查看帳單狀態並完成付款。',
    noInvoices: '暫無帳單。',
  },
};

const jaJp: TextContent = {
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
  common: {
    loading: 'データを読み込み中...',
    error: 'リクエスト失敗',
    backToCatalog: 'ストアへ戻る',
    sourceMode: 'データソース',
    mock: 'デモ',
    live: '本番',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    empty: 'データがありません',
    loginRequired: 'ログインして続行',
    hello: 'こんにちは',
    view: '表示',
    open: '開く',
    inspect: '詳細',
    stock: '在庫',
    products: '件の商品',
    defaultPlan: '標準プラン',
    customBilling: 'カスタム請求',
    yes: 'はい',
    no: 'いいえ',
    pending: '保留',
    slug: 'スラッグ',
    allowQuantity: '数量指定',
    perUserLimit: 'ユーザー上限',
    submit: '送信',
    remove: '削除',
    quantity: '数量',
    status: '状態',
    total: '合計',
  },
  home: {
    kicker: 'Sloth Cloud Headless クライアント',
    title: '標準パネル風ではなく、プロ向け VPS ストア体験',
    subtitle: 'Headless 課金コアとエッジ BFF によるモダンな顧客体験。',
    primaryCta: 'ストアへ',
    secondaryCta: 'ログイン',
    featuredTitle: 'ライブ商品',
    featuredSubtitle: '新しい headless カタログ API から描画しています。',
    categoryTitle: 'ライブカテゴリ',
    categorySubtitle: 'カテゴリと価格は旧 Livewire に依存しません。',
  },
  catalog: {
    title: 'ストア / カテゴリ',
    subtitle: 'カテゴリ別に実商品を閲覧します。',
    allProducts: 'すべての商品',
    noProducts: 'このカテゴリには商品がありません。',
  },
  product: {
    summary: '構成サマリー',
    plans: '請求プラン',
    config: '構成',
    os: 'OS',
    details: '商品詳細',
    loginHint: '注文フローを続けるにはログインしてください。',
    configEmpty: '追加の設定項目はありません。',
    addToCart: 'カートに追加',
    addSuccess: 'カートに追加しました。',
    goCheckout: 'チェックアウトへ',
  },
  checkout: {
    title: 'チェックアウト',
    subtitle: 'カート・クーポンを確認して注文を作成します。',
    empty: 'カートは空です。',
    coupon: 'クーポン',
    couponHint: 'コードを入力して適用してください。',
    placeOrder: '注文する',
    placingOrder: '注文中...',
    orderCreated: '注文を作成しました。',
    redirectTo: '遷移先を開く',
  },
  services: {
    title: 'マイサービス',
    subtitle: '購入済みサービスと稼働情報を管理します。',
    noServices: 'サービスはありません。',
    updateLabel: '表示名を更新',
    cancel: 'サービスを解約',
  },
  invoices: {
    title: '請求書',
    subtitle: '請求書の状態を確認し、支払いを実行します。',
    noInvoices: '請求書はありません。',
    payWithCredit: '残高で支払う',
    payWithGateway: 'ゲートウェイで支払う',
  },
  auth: {
    loginTitle: 'Sloth Cloud にログイン',
    loginSubtitle: 'BFF セッション経由で Paymenter 認証を使用します。',
    registerTitle: 'アカウント作成',
    registerSubtitle: '登録後は自動ログインされます。',
    email: 'メール',
    password: 'パスワード',
    code: '2FA コード',
    firstName: '名',
    lastName: '姓',
    passwordConfirmation: 'パスワード確認',
    submitLogin: 'ログイン',
    submitRegister: '登録',
    tfaHint: '二段階認証コードを入力してください。',
    alreadyHaveAccount: 'アカウントをお持ちですか？ ログイン',
    needAccount: 'アカウントが必要ですか？ 登録',
  },
  footer: {
    statement: 'Sloth Cloud フロント。認証・商品・決済・サービス・請求を BFF で連携しています。',
  },
};

const koKr: TextContent = {
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
    loading: '데이터를 불러오는 중...',
    error: '요청 실패',
    backToCatalog: '스토어로 돌아가기',
    sourceMode: '데이터 소스',
    mock: '데모 모드',
    live: '실데이터',
    themeDark: '다크',
    themeLight: '라이트',
    empty: '표시할 내용이 없습니다',
    loginRequired: '로그인 후 계속',
    hello: '안녕하세요',
    view: '보기',
    open: '열기',
    inspect: '상세',
    stock: '재고',
    products: '개 상품',
    defaultPlan: '기본 플랜',
    customBilling: '사용자 지정 주기',
    yes: '예',
    no: '아니요',
    pending: '대기 중',
    slug: '슬러그',
    allowQuantity: '수량 허용',
    perUserLimit: '사용자 제한',
    submit: '확인',
    remove: '삭제',
    quantity: '수량',
    status: '상태',
    total: '합계',
  },
  home: {
    kicker: 'Sloth Cloud Headless 클라이언트',
    title: '기본 패널이 아닌, 전문 VPS 스토어 경험',
    subtitle: 'Headless 과금 코어와 엣지 BFF 기반의 현대적인 사용자 경험.',
    primaryCta: '스토어 보기',
    secondaryCta: '로그인',
    featuredTitle: '실시간 상품',
    featuredSubtitle: '새 headless 카탈로그 API 기반 카드입니다.',
    categoryTitle: '실시간 카테고리',
    categorySubtitle: '카테고리와 가격은 더 이상 구 Livewire에 묶이지 않습니다.',
  },
  catalog: {
    title: '스토어 / 카테고리',
    subtitle: '카테고리별 실제 상품을 확인하세요.',
    allProducts: '전체 상품',
    noProducts: '이 카테고리에 상품이 없습니다.',
  },
  product: {
    summary: '구성 요약',
    plans: '청구 주기',
    config: '구매 설정',
    os: '운영체제',
    details: '상품 상세',
    loginHint: '주문을 계속하려면 먼저 로그인하세요.',
    configEmpty: '추가 설정 항목이 없습니다.',
    addToCart: '장바구니 담기',
    addSuccess: '장바구니에 추가되었습니다.',
    goCheckout: '결제로 이동',
  },
  checkout: {
    title: '결제',
    subtitle: '장바구니와 쿠폰을 확인하고 주문을 생성하세요.',
    empty: '장바구니가 비어 있습니다.',
    coupon: '쿠폰',
    couponHint: '쿠폰 코드를 입력해 적용하세요.',
    placeOrder: '주문하기',
    placingOrder: '주문 처리 중...',
    orderCreated: '주문이 생성되었습니다.',
    redirectTo: '대상 열기',
  },
  services: {
    title: '내 서비스',
    subtitle: '구매한 서비스를 관리하고 상태를 확인하세요.',
    noServices: '서비스가 없습니다.',
    updateLabel: '라벨 수정',
    cancel: '서비스 취소',
  },
  invoices: {
    title: '내 청구서',
    subtitle: '청구서 상태를 확인하고 결제하세요.',
    noInvoices: '청구서가 없습니다.',
    payWithCredit: '크레딧 결제',
    payWithGateway: '게이트웨이 결제',
  },
  auth: {
    loginTitle: 'Sloth Cloud 로그인',
    loginSubtitle: 'BFF 세션을 통해 Paymenter 인증을 사용합니다.',
    registerTitle: '계정 만들기',
    registerSubtitle: '가입 후 자동 로그인됩니다.',
    email: '이메일',
    password: '비밀번호',
    code: '2단계 인증 코드',
    firstName: '이름',
    lastName: '성',
    passwordConfirmation: '비밀번호 확인',
    submitLogin: '로그인',
    submitRegister: '회원가입',
    tfaHint: '2단계 인증 코드가 필요합니다.',
    alreadyHaveAccount: '이미 계정이 있나요? 로그인',
    needAccount: '계정이 없나요? 회원가입',
  },
  footer: {
    statement: 'Sloth Cloud 프런트. 인증, 상품, 결제, 서비스, 청구를 BFF로 연결합니다.',
  },
};

const deDe: TextContent = {
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
    loading: 'Lade Sloth-Cloud-Daten...',
    error: 'Anfrage fehlgeschlagen',
    backToCatalog: 'Zurück zum Shop',
    sourceMode: 'Datenquelle',
    mock: 'Demo-Modus',
    live: 'Live-Daten',
    themeDark: 'Dunkel',
    themeLight: 'Hell',
    empty: 'Keine Daten verfügbar',
    loginRequired: 'Bitte zuerst anmelden',
    hello: 'Hallo',
    view: 'Ansehen',
    open: 'Öffnen',
    inspect: 'Details',
    stock: 'Bestand',
    products: 'Produkte',
    defaultPlan: 'Standardplan',
    customBilling: 'Benutzerdefinierter Zyklus',
    yes: 'Ja',
    no: 'Nein',
    pending: 'Ausstehend',
    slug: 'Slug',
    allowQuantity: 'Mengenmodus',
    perUserLimit: 'Limit pro Nutzer',
    submit: 'Senden',
    remove: 'Entfernen',
    quantity: 'Menge',
    status: 'Status',
    total: 'Gesamt',
  },
  home: {
    kicker: 'Sloth Cloud Headless Client',
    title: 'Wie ein professioneller VPS-Anbieter, nicht wie ein Standard-Panel',
    subtitle: 'Modernes Kundenerlebnis mit Headless-Abrechnungskern und Edge-BFF.',
    primaryCta: 'Shop öffnen',
    secondaryCta: 'Anmelden',
    featuredTitle: 'Live-Produkte',
    featuredSubtitle: 'Diese Karten kommen aus den neuen Headless-Katalogendpunkten.',
    categoryTitle: 'Live-Kategorien',
    categorySubtitle: 'Kategorien und Preise sind nicht mehr an alte Livewire-Seiten gebunden.',
  },
  catalog: {
    title: 'Shop / Kategorien',
    subtitle: 'Echte Produkte nach Kategorien durchsuchen.',
    allProducts: 'Alle Produkte',
    noProducts: 'In dieser Kategorie sind noch keine Produkte verfügbar.',
  },
  product: {
    summary: 'Konfigurationsübersicht',
    plans: 'Abrechnungspläne',
    config: 'Konfiguration',
    os: 'Betriebssysteme',
    details: 'Produktdetails',
    loginHint: 'Melden Sie sich an, um den Bestellprozess fortzusetzen.',
    configEmpty: 'Dieses Produkt hat derzeit keine zusätzlichen Optionen.',
    addToCart: 'In den Warenkorb',
    addSuccess: 'Zum Warenkorb hinzugefügt.',
    goCheckout: 'Zur Kasse',
  },
  checkout: {
    title: 'Kasse',
    subtitle: 'Warenkorb prüfen, Gutschein anwenden und Bestellung erstellen.',
    empty: 'Ihr Warenkorb ist derzeit leer.',
    coupon: 'Gutschein',
    couponHint: 'Gutscheincode eingeben und anwenden.',
    placeOrder: 'Bestellung aufgeben',
    placingOrder: 'Bestellung wird erstellt...',
    orderCreated: 'Bestellung erfolgreich erstellt.',
    redirectTo: 'Ziel öffnen',
  },
  services: {
    title: 'Meine Dienste',
    subtitle: 'Gebuchte Dienste und Laufzeitdetails verwalten.',
    noServices: 'Noch keine Dienste.',
    updateLabel: 'Bezeichnung aktualisieren',
    cancel: 'Dienst kündigen',
  },
  invoices: {
    title: 'Meine Rechnungen',
    subtitle: 'Rechnungsstatus verfolgen und Zahlungen ausführen.',
    noInvoices: 'Noch keine Rechnungen.',
    payWithCredit: 'Mit Guthaben zahlen',
    payWithGateway: 'Mit Gateway zahlen',
  },
  auth: {
    loginTitle: 'Bei Sloth Cloud anmelden',
    loginSubtitle: 'Headless-Authentifizierung über die BFF-Session.',
    registerTitle: 'Sloth-Cloud-Konto erstellen',
    registerSubtitle: 'Nach der Registrierung werden Sie automatisch angemeldet.',
    email: 'E-Mail',
    password: 'Passwort',
    code: '2FA-Code',
    firstName: 'Vorname',
    lastName: 'Nachname',
    passwordConfirmation: 'Passwort bestätigen',
    submitLogin: 'Anmelden',
    submitRegister: 'Konto erstellen',
    tfaHint: 'Zwei-Faktor-Authentifizierung ist aktiv. Bitte Code eingeben.',
    alreadyHaveAccount: 'Bereits ein Konto? Anmelden',
    needAccount: 'Noch kein Konto? Registrieren',
  },
  footer: {
    statement: 'Sloth Cloud Frontend. Auth, Katalog, Checkout, Dienste und Rechnungen laufen über den Edge-BFF.',
  },
};

const frFr: TextContent = {
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
    loading: 'Chargement des données Sloth Cloud...',
    error: 'Échec de la requête',
    backToCatalog: 'Retour à la boutique',
    sourceMode: 'Source des données',
    mock: 'Mode démo',
    live: 'Données réelles',
    themeDark: 'Sombre',
    themeLight: 'Clair',
    empty: 'Aucune donnée',
    loginRequired: 'Veuillez vous connecter',
    hello: 'Bonjour',
    view: 'Voir',
    open: 'Ouvrir',
    inspect: 'Détails',
    stock: 'Stock',
    products: 'produits',
    defaultPlan: 'Plan par défaut',
    customBilling: 'Cycle personnalisé',
    yes: 'Oui',
    no: 'Non',
    pending: 'En attente',
    slug: 'Slug',
    allowQuantity: 'Mode quantité',
    perUserLimit: 'Limite par utilisateur',
    submit: 'Valider',
    remove: 'Supprimer',
    quantity: 'Quantité',
    status: 'Statut',
    total: 'Total',
  },
  home: {
    kicker: 'Client Headless Sloth Cloud',
    title: 'Une vitrine VPS pro, pas un thème de panneau standard',
    subtitle: 'Expérience moderne avec un moteur de facturation headless et un BFF edge.',
    primaryCta: 'Voir la boutique',
    secondaryCta: 'Connexion',
    featuredTitle: 'Produits en direct',
    featuredSubtitle: 'Ces cartes sont rendues via les nouveaux endpoints headless.',
    categoryTitle: 'Catégories en direct',
    categorySubtitle: 'Catégories et prix ne dépendent plus de l’ancien Livewire.',
  },
  catalog: {
    title: 'Boutique / Catégories',
    subtitle: 'Parcourez les produits réels par catégorie.',
    allProducts: 'Tous les produits',
    noProducts: 'Aucun produit disponible dans cette catégorie.',
  },
  product: {
    summary: 'Résumé de configuration',
    plans: 'Plans de facturation',
    config: 'Configuration',
    os: 'Systèmes d’exploitation',
    details: 'Détail du produit',
    loginHint: 'Connectez-vous pour continuer la commande.',
    configEmpty: 'Ce produit n’a pas d’options supplémentaires.',
    addToCart: 'Ajouter au panier',
    addSuccess: 'Ajouté au panier.',
    goCheckout: 'Aller au paiement',
  },
  checkout: {
    title: 'Paiement',
    subtitle: 'Vérifiez le panier, le coupon et créez la commande.',
    empty: 'Votre panier est vide.',
    coupon: 'Coupon',
    couponHint: 'Entrez un code coupon puis appliquez-le.',
    placeOrder: 'Passer la commande',
    placingOrder: 'Création de la commande...',
    orderCreated: 'Commande créée avec succès.',
    redirectTo: 'Ouvrir la destination',
  },
  services: {
    title: 'Mes services',
    subtitle: 'Gérez vos services et leurs détails.',
    noServices: 'Aucun service.',
    updateLabel: 'Mettre à jour le nom',
    cancel: 'Annuler le service',
  },
  invoices: {
    title: 'Mes factures',
    subtitle: 'Suivez les factures et effectuez le paiement.',
    noInvoices: 'Aucune facture.',
    payWithCredit: 'Payer avec le crédit',
    payWithGateway: 'Payer avec la passerelle',
  },
  auth: {
    loginTitle: 'Connexion à Sloth Cloud',
    loginSubtitle: 'Authentification headless via la session BFF.',
    registerTitle: 'Créer un compte Sloth Cloud',
    registerSubtitle: 'L’inscription vous connecte automatiquement.',
    email: 'E-mail',
    password: 'Mot de passe',
    code: 'Code 2FA',
    firstName: 'Prénom',
    lastName: 'Nom',
    passwordConfirmation: 'Confirmer le mot de passe',
    submitLogin: 'Connexion',
    submitRegister: 'Créer un compte',
    tfaHint: 'La double authentification est active. Entrez votre code.',
    alreadyHaveAccount: 'Déjà un compte ? Se connecter',
    needAccount: 'Pas de compte ? S’inscrire',
  },
  footer: {
    statement: 'Frontend Sloth Cloud. Auth, catalogue, checkout, services et factures via le BFF edge.',
  },
};

const esEs: TextContent = {
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
    loading: 'Cargando datos de Sloth Cloud...',
    error: 'Solicitud fallida',
    backToCatalog: 'Volver a la tienda',
    sourceMode: 'Fuente de datos',
    mock: 'Modo demo',
    live: 'Datos reales',
    themeDark: 'Oscuro',
    themeLight: 'Claro',
    empty: 'No hay datos',
    loginRequired: 'Inicia sesión para continuar',
    hello: 'Hola',
    view: 'Ver',
    open: 'Abrir',
    inspect: 'Detalle',
    stock: 'Stock',
    products: 'productos',
    defaultPlan: 'Plan por defecto',
    customBilling: 'Ciclo personalizado',
    yes: 'Sí',
    no: 'No',
    pending: 'Pendiente',
    slug: 'Slug',
    allowQuantity: 'Modo de cantidad',
    perUserLimit: 'Límite por usuario',
    submit: 'Enviar',
    remove: 'Eliminar',
    quantity: 'Cantidad',
    status: 'Estado',
    total: 'Total',
  },
  home: {
    kicker: 'Cliente Headless Sloth Cloud',
    title: 'Como un proveedor VPS profesional, no como un panel por defecto',
    subtitle: 'Experiencia moderna con núcleo headless de facturación y BFF edge.',
    primaryCta: 'Ir a la tienda',
    secondaryCta: 'Iniciar sesión',
    featuredTitle: 'Productos en vivo',
    featuredSubtitle: 'Estas tarjetas se renderizan desde los nuevos endpoints headless.',
    categoryTitle: 'Categorías en vivo',
    categorySubtitle: 'Categorías y precios ya no dependen del antiguo Livewire.',
  },
  catalog: {
    title: 'Tienda / Categorías',
    subtitle: 'Explora productos reales por categoría.',
    allProducts: 'Todos los productos',
    noProducts: 'No hay productos en esta categoría.',
  },
  product: {
    summary: 'Resumen de configuración',
    plans: 'Planes de facturación',
    config: 'Configuración',
    os: 'Sistemas operativos',
    details: 'Detalle del producto',
    loginHint: 'Inicia sesión para continuar con la compra.',
    configEmpty: 'Este producto no tiene opciones adicionales.',
    addToCart: 'Agregar al carrito',
    addSuccess: 'Producto agregado al carrito.',
    goCheckout: 'Ir al pago',
  },
  checkout: {
    title: 'Pago',
    subtitle: 'Revisa carrito, cupón y crea la orden.',
    empty: 'Tu carrito está vacío.',
    coupon: 'Cupón',
    couponHint: 'Ingresa el cupón y aplícalo.',
    placeOrder: 'Crear orden',
    placingOrder: 'Creando orden...',
    orderCreated: 'Orden creada con éxito.',
    redirectTo: 'Abrir destino',
  },
  services: {
    title: 'Mis servicios',
    subtitle: 'Gestiona tus servicios y detalles de ejecución.',
    noServices: 'No hay servicios.',
    updateLabel: 'Actualizar etiqueta',
    cancel: 'Cancelar servicio',
  },
  invoices: {
    title: 'Mis facturas',
    subtitle: 'Revisa estado y completa el pago.',
    noInvoices: 'No hay facturas.',
    payWithCredit: 'Pagar con saldo',
    payWithGateway: 'Pagar con pasarela',
  },
  auth: {
    loginTitle: 'Inicia sesión en Sloth Cloud',
    loginSubtitle: 'Usa autenticación headless mediante sesión BFF.',
    registerTitle: 'Crea tu cuenta de Sloth Cloud',
    registerSubtitle: 'El registro inicia sesión automáticamente.',
    email: 'Correo',
    password: 'Contraseña',
    code: 'Código 2FA',
    firstName: 'Nombre',
    lastName: 'Apellido',
    passwordConfirmation: 'Confirmar contraseña',
    submitLogin: 'Entrar',
    submitRegister: 'Crear cuenta',
    tfaHint: 'La verificación en dos pasos está activa. Introduce el código.',
    alreadyHaveAccount: '¿Ya tienes cuenta? Inicia sesión',
    needAccount: '¿Necesitas cuenta? Regístrate',
  },
  footer: {
    statement: 'Frontend de Sloth Cloud. Autenticación, catálogo, checkout, servicios y facturas conectados por BFF.',
  },
};

const ruRu: TextContent = {
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
    loading: 'Загрузка данных Sloth Cloud...',
    error: 'Ошибка запроса',
    backToCatalog: 'Назад в магазин',
    sourceMode: 'Источник данных',
    mock: 'Демо',
    live: 'Реальные данные',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    empty: 'Нет данных',
    loginRequired: 'Войдите, чтобы продолжить',
    hello: 'Здравствуйте',
    view: 'Просмотр',
    open: 'Открыть',
    inspect: 'Детали',
    stock: 'Остаток',
    products: 'продуктов',
    defaultPlan: 'Базовый тариф',
    customBilling: 'Свободный период',
    yes: 'Да',
    no: 'Нет',
    pending: 'В ожидании',
    slug: 'Слаг',
    allowQuantity: 'Режим количества',
    perUserLimit: 'Лимит на пользователя',
    submit: 'Отправить',
    remove: 'Удалить',
    quantity: 'Количество',
    status: 'Статус',
    total: 'Итого',
  },
  home: {
    kicker: 'Headless клиент Sloth Cloud',
    title: 'Профессиональный VPS-витринный интерфейс, а не стандартная панель',
    subtitle: 'Современный клиентский опыт на базе headless-биллинга и edge BFF.',
    primaryCta: 'Открыть магазин',
    secondaryCta: 'Войти',
    featuredTitle: 'Живые продукты',
    featuredSubtitle: 'Карточки рендерятся из новых headless-эндпоинтов каталога.',
    categoryTitle: 'Живые категории',
    categorySubtitle: 'Категории и цены больше не завязаны на старый Livewire.',
  },
  catalog: {
    title: 'Магазин / Категории',
    subtitle: 'Просматривайте реальные продукты по категориям.',
    allProducts: 'Все продукты',
    noProducts: 'В этой категории пока нет продуктов.',
  },
  product: {
    summary: 'Сводка конфигурации',
    plans: 'Платёжные планы',
    config: 'Конфигурация',
    os: 'Операционные системы',
    details: 'Детали продукта',
    loginHint: 'Войдите, чтобы продолжить оформление заказа.',
    configEmpty: 'У этого продукта нет дополнительных опций.',
    addToCart: 'Добавить в корзину',
    addSuccess: 'Товар добавлен в корзину.',
    goCheckout: 'Перейти к оплате',
  },
  checkout: {
    title: 'Оплата',
    subtitle: 'Проверьте корзину, купон и создайте заказ.',
    empty: 'Корзина пуста.',
    coupon: 'Купон',
    couponHint: 'Введите и примените код купона.',
    placeOrder: 'Создать заказ',
    placingOrder: 'Создание заказа...',
    orderCreated: 'Заказ успешно создан.',
    redirectTo: 'Открыть цель',
  },
  services: {
    title: 'Мои сервисы',
    subtitle: 'Управляйте купленными сервисами и параметрами.',
    noServices: 'Сервисов нет.',
    updateLabel: 'Обновить название',
    cancel: 'Отменить сервис',
  },
  invoices: {
    title: 'Мои счета',
    subtitle: 'Отслеживайте счета и выполняйте оплату.',
    noInvoices: 'Счетов нет.',
    payWithCredit: 'Оплатить балансом',
    payWithGateway: 'Оплатить через шлюз',
  },
  auth: {
    loginTitle: 'Вход в Sloth Cloud',
    loginSubtitle: 'Headless-аутентификация через BFF-сессию.',
    registerTitle: 'Создать аккаунт Sloth Cloud',
    registerSubtitle: 'После регистрации вход выполняется автоматически.',
    email: 'Email',
    password: 'Пароль',
    code: 'Код 2FA',
    firstName: 'Имя',
    lastName: 'Фамилия',
    passwordConfirmation: 'Подтвердите пароль',
    submitLogin: 'Войти',
    submitRegister: 'Создать аккаунт',
    tfaHint: 'Включена двухфакторная защита. Введите код.',
    alreadyHaveAccount: 'Уже есть аккаунт? Войти',
    needAccount: 'Нужен аккаунт? Зарегистрироваться',
  },
  footer: {
    statement: 'Фронтенд Sloth Cloud. Авторизация, каталог, checkout, сервисы и счета подключены через edge BFF.',
  },
};

const ptBr: TextContent = {
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
    loading: 'Carregando dados da Sloth Cloud...',
    error: 'Falha na requisição',
    backToCatalog: 'Voltar para loja',
    sourceMode: 'Fonte de dados',
    mock: 'Modo demo',
    live: 'Dados reais',
    themeDark: 'Escuro',
    themeLight: 'Claro',
    empty: 'Nada para mostrar',
    loginRequired: 'Faça login para continuar',
    hello: 'Olá',
    view: 'Ver',
    open: 'Abrir',
    inspect: 'Detalhes',
    stock: 'Estoque',
    products: 'produtos',
    defaultPlan: 'Plano padrão',
    customBilling: 'Ciclo personalizado',
    yes: 'Sim',
    no: 'Não',
    pending: 'Pendente',
    slug: 'Slug',
    allowQuantity: 'Modo de quantidade',
    perUserLimit: 'Limite por usuário',
    submit: 'Enviar',
    remove: 'Remover',
    quantity: 'Quantidade',
    status: 'Status',
    total: 'Total',
  },
  home: {
    kicker: 'Cliente Headless Sloth Cloud',
    title: 'Como uma vitrine VPS profissional, não um painel padrão',
    subtitle: 'Experiência moderna com núcleo headless de billing e BFF de borda.',
    primaryCta: 'Ir para loja',
    secondaryCta: 'Entrar',
    featuredTitle: 'Produtos ao vivo',
    featuredSubtitle: 'Estes cards vêm dos novos endpoints headless de catálogo.',
    categoryTitle: 'Categorias ao vivo',
    categorySubtitle: 'Categorias e preços não dependem mais do antigo Livewire.',
  },
  catalog: {
    title: 'Loja / Categorias',
    subtitle: 'Navegue por produtos reais por categoria.',
    allProducts: 'Todos os produtos',
    noProducts: 'Nenhum produto disponível nesta categoria.',
  },
  product: {
    summary: 'Resumo de configuração',
    plans: 'Planos de cobrança',
    config: 'Configuração',
    os: 'Sistemas operacionais',
    details: 'Detalhes do produto',
    loginHint: 'Faça login para continuar o fluxo de compra.',
    configEmpty: 'Este produto não possui opções extras.',
    addToCart: 'Adicionar ao carrinho',
    addSuccess: 'Adicionado ao carrinho.',
    goCheckout: 'Ir para checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Revise carrinho, cupom e conclua o pedido.',
    empty: 'Seu carrinho está vazio.',
    coupon: 'Cupom',
    couponHint: 'Digite um cupom e aplique.',
    placeOrder: 'Finalizar pedido',
    placingOrder: 'Finalizando pedido...',
    orderCreated: 'Pedido criado com sucesso.',
    redirectTo: 'Abrir destino',
  },
  services: {
    title: 'Meus serviços',
    subtitle: 'Gerencie serviços contratados e detalhes de execução.',
    noServices: 'Nenhum serviço ainda.',
    updateLabel: 'Atualizar nome',
    cancel: 'Cancelar serviço',
  },
  invoices: {
    title: 'Minhas faturas',
    subtitle: 'Acompanhe o status e conclua pagamentos.',
    noInvoices: 'Nenhuma fatura ainda.',
    payWithCredit: 'Pagar com crédito',
    payWithGateway: 'Pagar com gateway',
  },
  auth: {
    loginTitle: 'Entrar na Sloth Cloud',
    loginSubtitle: 'Use autenticação headless via sessão BFF.',
    registerTitle: 'Criar conta Sloth Cloud',
    registerSubtitle: 'O cadastro faz login automaticamente.',
    email: 'E-mail',
    password: 'Senha',
    code: 'Código 2FA',
    firstName: 'Nome',
    lastName: 'Sobrenome',
    passwordConfirmation: 'Confirmar senha',
    submitLogin: 'Entrar',
    submitRegister: 'Criar conta',
    tfaHint: 'A autenticação em dois fatores está ativa. Digite o código.',
    alreadyHaveAccount: 'Já tem conta? Entrar',
    needAccount: 'Precisa de conta? Registrar',
  },
  footer: {
    statement: 'Frontend Sloth Cloud. Auth, catálogo, checkout, serviços e faturas conectados pelo BFF de borda.',
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
