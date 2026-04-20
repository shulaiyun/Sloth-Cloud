import type { Locale } from './content';

type LocalizedPair<T> = {
  zh: T;
  en: T;
};

type StatusKey = 'active' | 'pending' | 'suspended' | 'cancelled' | 'failed' | 'overdue' | 'paid' | 'unknown';
type RuntimeStatusKey = 'pending' | 'queued' | 'building' | 'pushing' | 'deploying' | 'ready' | 'running' | 'retrying' | 'deleting' | 'failed' | 'unavailable' | 'unknown';

export type ProductLineKey = 'vps' | 'managed-app' | 'other';

const common = {
  zh: {
    allStatuses: '全部状态',
    amountHighToLow: '金额从高到低',
    amountLowToHigh: '金额从低到高',
    apply: '应用',
    back: '返回',
    billing: '账单',
    cancelled: '已取消',
    category: '分类',
    completed: '已完成',
    contactSupport: '联系支持',
    copied: '已复制',
    due: '到期',
    endpoint: '访问地址',
    expires: '到期时间',
    highPriority: '优先处理',
    interfaceLanguage: '界面语言',
    lastAttempt: '最近尝试',
    newestFirst: '最新优先',
    nearestDueFirst: '最早到期优先',
    noAttempts: '暂无记录',
    operationId: '操作 ID',
    pending: '处理中',
    productLine: '产品线',
    refresh: '刷新',
    refreshing: '刷新中...',
    retrying: '重试中...',
    search: '搜索',
    selectLanguage: '选择前台显示语言',
    sort: '排序',
    sortByStatus: '按状态',
    unavailable: '暂不可用',
    unnamedCategory: '未命名分类',
    unnamedItem: '未命名项目',
    unnamedPlan: '未命名套餐',
    unnamedProduct: '未命名商品',
    unnamedService: '未命名服务',
    unknown: '未知',
  },
  en: {
    allStatuses: 'All statuses',
    amountHighToLow: 'Amount high to low',
    amountLowToHigh: 'Amount low to high',
    apply: 'Apply',
    back: 'Back',
    billing: 'Billing',
    cancelled: 'Cancelled',
    category: 'Category',
    completed: 'Completed',
    contactSupport: 'Contact support',
    copied: 'Copied',
    due: 'Due',
    endpoint: 'Endpoint',
    expires: 'Expires',
    highPriority: 'Priority',
    interfaceLanguage: 'Interface language',
    lastAttempt: 'Last attempt',
    newestFirst: 'Newest first',
    nearestDueFirst: 'Nearest due date first',
    noAttempts: 'No attempts yet',
    operationId: 'Operation ID',
    pending: 'Pending',
    productLine: 'Product line',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    retrying: 'Retrying...',
    search: 'Search',
    selectLanguage: 'Select storefront language',
    sort: 'Sort',
    sortByStatus: 'Sort by status',
    unavailable: 'Unavailable',
    unnamedCategory: 'Unnamed category',
    unnamedItem: 'Unnamed item',
    unnamedPlan: 'Unnamed plan',
    unnamedProduct: 'Unnamed product',
    unnamedService: 'Unnamed service',
    unknown: 'Unknown',
  },
} satisfies LocalizedPair<Record<string, string>>;

const home = {
  zh: {
    heroEyebrow: 'VPS 与托管应用云',
    heroTitle: '把云服务器和应用托管放进同一个客户前台',
    heroSubtitle: '客户可以购买 VPS、部署应用、查看账单、管理实例、处理续费与取消，所有关键操作都在树懒云完成。',
    heroPrimary: '查看可售产品',
    heroSecondary: '进入我的服务',
    productLines: '两条产品线',
    productLinesSubtitle: '按业务类型快速进入对应服务，避免 VPS 与托管应用控制项混在一起。',
    vpsTitle: 'VPS服务器',
    vpsBody: '适合需要完整系统权限、固定资源规格、重装系统和服务器级控制的用户。',
    managedTitle: 'AI 托管上线',
    managedBody: '适合先用 AI 生成可体验第一版，再沿用同一个预览与源码包继续上线和运维。',
    featuredTitle: '热销服务',
    featuredSubtitle: '从实时商品目录中挑选可直接下单的套餐。',
    assuranceTitle: '运营保障',
    assuranceSubtitle: '订单、账单、开通、运行状态和操作日志在一个前台闭环展示。',
    assuranceItems: ['支付后自动刷新账单状态', '开通进度和失败原因可追踪', '服务控制动作返回操作结果', '多语言前台和专业空状态'],
    emptyProductsTitle: '暂无可售商品',
    emptyProductsBody: '请在计费后台完成商品、价格和分类配置后刷新页面。',
    emptyCategoriesTitle: '暂无可见分类',
    emptyCategoriesBody: '请确认分类已绑定可见商品。',
  },
  en: {
    heroEyebrow: 'VPS and Managed App Cloud',
    heroTitle: 'Cloud servers and app hosting in one client portal',
    heroSubtitle: 'Customers can buy VPS, deploy apps, review invoices, manage instances, renew, and cancel without leaving Sloth Cloud.',
    heroPrimary: 'Browse services',
    heroSecondary: 'Open my services',
    productLines: 'Two product lines',
    productLinesSubtitle: 'Guide customers by service type, so VPS controls and managed app controls stay clearly separated.',
    vpsTitle: 'VPS Servers',
    vpsBody: 'For users who need full system access, fixed resource plans, OS reinstall, and server-level controls.',
    managedTitle: 'AI Managed Launch',
    managedBody: 'Start with an AI-generated first version, then keep using the same preview and source bundle for launch and operations.',
    featuredTitle: 'Popular services',
    featuredSubtitle: 'Ready-to-order plans from the live catalog.',
    assuranceTitle: 'Operations built in',
    assuranceSubtitle: 'Orders, invoices, provisioning, runtime state, and operation logs stay visible in one portal.',
    assuranceItems: ['Invoice status refreshes after payment', 'Provisioning progress and failures are traceable', 'Service controls return operation results', 'Professional empty states and multilingual UI'],
    emptyProductsTitle: 'No services available yet',
    emptyProductsBody: 'Publish products, pricing, and categories in billing admin, then refresh this page.',
    emptyCategoriesTitle: 'No visible categories',
    emptyCategoriesBody: 'Confirm that categories are linked to visible products.',
  },
} satisfies LocalizedPair<Record<string, string | string[]>>;

const catalog = {
  zh: {
    title: '云服务商店',
    subtitle: '按产品线选择 VPS 或托管应用，进入详情后完成配置与下单。',
    managedEyebrow: 'AI 托管上线',
    managedTitle: '先做交互第一版，再决定是否正式托管上线',
    managedBody: '客户先得到共享预览、源码包和执行计划，确认后再进入 AI 托管上线或迁移到自己的服务器。',
    vpsEyebrow: 'VPS服务器产品线',
    vpsTitle: '按地区、规格和系统模板购买云服务器',
    vpsBody: '保留服务器级控制体验：开关机、重启、重装、密码重置、续费和取消。',
    noProducts: '当前筛选下暂无可购买服务。',
    stock: '库存',
  },
  en: {
    title: 'Cloud services store',
    subtitle: 'Choose VPS or Managed App Hosting, then configure and order from the product detail page.',
    managedEyebrow: 'AI Managed Launch',
    managedTitle: 'Create a real first version before choosing the final runtime',
    managedBody: 'Start with a shared preview, source bundle, and execution plan, then continue into AI managed launch or your own server.',
    vpsEyebrow: 'VPS servers',
    vpsTitle: 'Buy cloud servers by region, size, and OS template',
    vpsBody: 'Server-level controls remain available: power, restart, reinstall, password reset, renewal, and cancellation.',
    noProducts: 'No services match this filter yet.',
    stock: 'Stock',
  },
} satisfies LocalizedPair<Record<string, string>>;

const product = {
  zh: {
    configTitle: '购买配置',
    detailsHelp: '确认计费周期、系统或应用参数后即可加入购物车。',
    noExtraConfig: '该商品当前没有额外配置项。',
    operatingSystem: '操作系统',
  },
  en: {
    configTitle: 'Order configuration',
    detailsHelp: 'Confirm billing cycle, OS, or app parameters before adding the service to your cart.',
    noExtraConfig: 'This product has no extra configuration fields.',
    operatingSystem: 'Operating system',
  },
} satisfies LocalizedPair<Record<string, string>>;

const services = {
  zh: {
    title: '我的服务',
    subtitle: '优先查看服务状态、产品线、账单和可执行操作。',
    searchPlaceholder: '搜索服务名、产品名或 ID',
    noServices: '暂无服务。购买后会在这里显示开通状态和运行控制台。',
    priceHighToLow: '金额从高到低',
    priceLowToHigh: '金额从低到高',
    nearestExpiry: '即将到期优先',
    viewRuntime: '管理服务',
    lifecycle: '账单与生命周期',
    runtimeConsole: '运行时控制台',
    provisioning: '开通状态',
    updateLabelSuccess: '服务标签已更新。',
    cancellationRequested: '已提交取消请求。',
    cancellationRevoked: '已撤销取消请求。',
    renewalRequested: '续费请求已提交。',
    cancelType: '取消方式',
    cancelEndPeriod: '到期取消（推荐）',
    cancelImmediate: '立即取消（停止实例）',
    cancelReason: '填写取消原因（可选）',
    cancelEndHint: '到期取消会保持服务运行至当前计费周期结束。',
    cancelImmediateHint: '立即取消会先终止运行实例，再将服务标记为已取消。',
    cancelUnavailableProvisioning: '服务正在开通中，暂时不能取消。',
    cancelUnavailableState: '当前服务状态不支持取消操作。',
    revokeCancellation: '撤销取消',
    renewing: '续费处理中...',
    renewService: '续费服务',
    renewAfterProvisioning: '服务开通完成后可续费。',
    pendingInvoiceHint: '已存在待支付账单，请先完成支付。',
  },
  en: {
    title: 'My services',
    subtitle: 'Review service state, product line, billing, and primary actions first.',
    searchPlaceholder: 'Search by service, product, or ID',
    noServices: 'No services yet. Purchased services will show provisioning state and runtime controls here.',
    priceHighToLow: 'Price high to low',
    priceLowToHigh: 'Price low to high',
    nearestExpiry: 'Nearest expiry first',
    viewRuntime: 'Manage service',
    lifecycle: 'Billing and lifecycle',
    runtimeConsole: 'Runtime console',
    provisioning: 'Provisioning status',
    updateLabelSuccess: 'Service label updated.',
    cancellationRequested: 'Cancellation requested.',
    cancellationRevoked: 'Cancellation request removed.',
    renewalRequested: 'Renewal request submitted.',
    cancelType: 'Cancellation type',
    cancelEndPeriod: 'Cancel at period end (recommended)',
    cancelImmediate: 'Cancel immediately and stop instance',
    cancelReason: 'Optional cancellation reason',
    cancelEndHint: 'End-of-period cancellation keeps the service running until the current billing period ends.',
    cancelImmediateHint: 'Immediate cancellation terminates the runtime first, then marks the service as cancelled.',
    cancelUnavailableProvisioning: 'Cancellation is disabled while provisioning is in progress.',
    cancelUnavailableState: 'Cancellation is unavailable for the current service state.',
    revokeCancellation: 'Revoke cancellation',
    renewing: 'Renewing...',
    renewService: 'Renew service',
    renewAfterProvisioning: 'Renewal will be available after provisioning completes.',
    pendingInvoiceHint: 'A pending invoice already exists. Complete payment first.',
  },
} satisfies LocalizedPair<Record<string, string>>;

const runtime = {
  zh: {
    applicationInfo: '应用实例信息',
    applicationControls: '应用控制台',
    applicationLogs: '应用日志',
    applicationLogsEmpty: '当前暂无可用应用日志。',
    restartApp: '重启应用',
    deleteInstance: '删除实例',
    envJson: '环境变量（JSON）',
    updateEnv: '更新环境变量',
    bindDomain: '绑定域名',
    saveDomain: '保存域名',
    enableHttps: '开启 HTTPS',
    scaleReplicas: '扩容副本',
    applyScale: '执行扩容',
    replicaLimit: '套餐副本上限',
    instanceRef: '实例引用',
    runtimeStatus: '运行状态',
    domain: '域名',
    replicas: '副本数',
    lastDeploy: '最后部署',
    serverInfo: '服务器信息',
    serverOperations: '服务器操作',
    serverRef: '服务器映射',
    serverState: '运行状态',
    ipAddress: 'IP 地址',
    locked: '锁定状态',
    memory: '内存',
    disk: '磁盘',
    inboundBandwidth: '入站带宽',
    outboundTraffic: '出站流量',
    reinstallTemplate: '重装模板',
    defaultTemplate: '使用默认模板',
    reinstallPassword: '重装密码（留空自动生成）',
    startOnCompletion: '重装完成后自动开机',
    start: '开机',
    stop: '关机',
    restart: '重启',
    reinstall: '重装系统',
    resetPassword: '重置密码',
    suspend: '暂停',
    unsuspend: '解除暂停',
    recentLogs: '最近操作日志',
    noOperationLogs: '暂无操作记录。',
    errorCode: '错误编号',
    attempts: '尝试次数',
    retryProvisioning: '重试开通',
  },
  en: {
    applicationInfo: 'Application instance',
    applicationControls: 'Application console',
    applicationLogs: 'Application logs',
    applicationLogsEmpty: 'No application logs are available yet.',
    restartApp: 'Restart app',
    deleteInstance: 'Delete instance',
    envJson: 'Environment variables (JSON)',
    updateEnv: 'Update env',
    bindDomain: 'Domain binding',
    saveDomain: 'Save domain',
    enableHttps: 'Enable HTTPS',
    scaleReplicas: 'Scale replicas',
    applyScale: 'Apply scale',
    replicaLimit: 'Plan replica limit',
    instanceRef: 'Instance ref',
    runtimeStatus: 'Status',
    domain: 'Domain',
    replicas: 'Replicas',
    lastDeploy: 'Last deploy',
    serverInfo: 'Server information',
    serverOperations: 'Server operations',
    serverRef: 'Server ref',
    serverState: 'State',
    ipAddress: 'IP address',
    locked: 'Locked',
    memory: 'Memory',
    disk: 'Disk',
    inboundBandwidth: 'Inbound bandwidth',
    outboundTraffic: 'Outbound traffic',
    reinstallTemplate: 'Reinstall template',
    defaultTemplate: 'Use default template',
    reinstallPassword: 'Reinstall password (leave blank to auto-generate)',
    startOnCompletion: 'Start on completion',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    reinstall: 'Reinstall',
    resetPassword: 'Reset password',
    suspend: 'Suspend',
    unsuspend: 'Unsuspend',
    recentLogs: 'Recent operation logs',
    noOperationLogs: 'No operation logs yet.',
    errorCode: 'Error code',
    attempts: 'Attempts',
    retryProvisioning: 'Retry provisioning',
  },
} satisfies LocalizedPair<Record<string, string>>;

const invoices = {
  zh: {
    title: '我的账单',
    subtitle: '查看待支付、已支付和逾期账单，支付后状态会自动刷新。',
    searchPlaceholder: '搜索账单编号、用户或金额',
    relatedServices: '关联产品或服务',
    settledTitle: '支付成功，账单已结清。',
    settledBody: '你可以前往服务页面查看这笔账单对应的开通和运行状态。',
    paymentMethod: '支付方式',
    noGateway: '当前账单没有可用支付方式，请稍后再试或联系支持。',
    continuePayment: '继续支付',
    openPaymentNewTab: '打开支付页面（新标签）',
    paidRefresh: '我已支付，立即刷新状态',
    openPaymentAgain: '再次打开支付页面',
    confirmingPayment: '正在确认支付结果，请稍候...',
    paymentOpened: '支付页面已在新标签打开，完成支付后返回本页即可。',
    paymentPopupBlocked: '浏览器阻止了支付窗口，请允许弹窗后重试。',
    gatewayMissingPage: '网关未返回可用支付页面，请稍后重试或联系支持。',
    waitingPayment: '正在等待支付回调确认，账单状态会自动刷新。',
    invoiceStillPending: '账单仍为待支付，系统会自动刷新状态。',
    paymentConfirmed: '支付已确认，账单状态已更新。',
    paymentNotConfirmed: '暂未确认到支付结果，请稍后手动刷新账单页或联系支持。',
    refreshLater: '账单仍未支付，若已完成支付请稍等 10-30 秒再刷新。',
  },
  en: {
    title: 'My invoices',
    subtitle: 'Review pending, paid, and overdue invoices. Payment status refreshes automatically.',
    searchPlaceholder: 'Search by invoice number, user, or amount',
    relatedServices: 'Related product or service',
    settledTitle: 'Payment successful. Invoice settled.',
    settledBody: 'Open the services page to review provisioning and runtime status.',
    paymentMethod: 'Payment method',
    noGateway: 'No payment method is available for this invoice. Please retry or contact support.',
    continuePayment: 'Continue payment',
    openPaymentNewTab: 'Open payment page (new tab)',
    paidRefresh: 'I already paid, refresh status now',
    openPaymentAgain: 'Open payment page again',
    confirmingPayment: 'Confirming payment status, please wait...',
    paymentOpened: 'The payment page has been opened in a new tab. Return here after payment.',
    paymentPopupBlocked: 'The browser blocked the payment window. Allow pop-ups and try again.',
    gatewayMissingPage: 'Gateway did not return a usable checkout page. Please retry or contact support.',
    waitingPayment: 'Waiting for payment confirmation. Invoice status will refresh automatically.',
    invoiceStillPending: 'Invoice is still pending. Status will refresh automatically.',
    paymentConfirmed: 'Payment confirmed. Invoice status updated.',
    paymentNotConfirmed: 'Payment has not been confirmed yet. Refresh this invoice shortly or contact support.',
    refreshLater: 'Invoice is still pending. If payment is complete, refresh again in 10-30 seconds.',
  },
} satisfies LocalizedPair<Record<string, string>>;

const checkout = {
  zh: {
    reviewTitle: '订单确认',
    reviewSubtitle: '确认商品、数量、优惠码和应付金额后提交订单。',
  },
  en: {
    reviewTitle: 'Order review',
    reviewSubtitle: 'Confirm services, quantity, coupon, and total before placing the order.',
  },
} satisfies LocalizedPair<Record<string, string>>;

const auth = {
  zh: {
    loginHint: '登录后即可继续下单、查看服务和处理账单。',
    registerHint: '创建账号后会自动登录，并继续使用树懒云前台。',
  },
  en: {
    loginHint: 'Sign in to continue checkout, service management, and billing.',
    registerHint: 'Create an account and continue in the Sloth Cloud portal.',
  },
} satisfies LocalizedPair<Record<string, string>>;

const statusLabels = {
  zh: {
    active: '服务有效',
    pending: '处理中',
    suspended: '已暂停',
    cancelled: '已取消',
    failed: '失败',
    overdue: '已逾期',
    paid: '已支付',
    unknown: '未知',
  },
  en: {
    active: 'Service active',
    pending: 'Pending',
    suspended: 'Suspended',
    cancelled: 'Cancelled',
    failed: 'Failed',
    overdue: 'Overdue',
    paid: 'Paid',
    unknown: 'Unknown',
  },
} satisfies LocalizedPair<Record<StatusKey, string>>;

const runtimeStatusLabels = {
  zh: {
    pending: '等待中',
    queued: '排队中',
    building: '构建中',
    pushing: '推送镜像中',
    deploying: '部署中',
    ready: '可用',
    running: '运行中',
    retrying: '重试中',
    deleting: '删除中',
    failed: '失败',
    unavailable: '不可用',
    unknown: '未知',
  },
  en: {
    pending: 'Pending',
    queued: 'Queued',
    building: 'Building',
    pushing: 'Pushing image',
    deploying: 'Deploying',
    ready: 'Ready',
    running: 'Running',
    retrying: 'Retrying',
    deleting: 'Deleting',
    failed: 'Failed',
    unavailable: 'Unavailable',
    unknown: 'Unknown',
  },
} satisfies LocalizedPair<Record<RuntimeStatusKey, string>>;

const operationLabels: LocalizedPair<Record<string, string>> = {
  zh: {
    cancel: '取消服务',
    suspend: '暂停',
    unsuspend: '解除暂停',
    reinstall: '重装系统',
    'reveal-password': '重置密码',
    destroy: '删除实例',
    delete: '删除实例',
    start: '开机',
    stop: '关机',
    shutdown: '关机',
    restart: '重启',
    renew: '续费',
    env: '更新环境变量',
    domain: '绑定域名',
    tls: '开启 HTTPS',
    scale: '扩容',
  },
  en: {
    cancel: 'Cancel service',
    suspend: 'Suspend',
    unsuspend: 'Unsuspend',
    reinstall: 'Reinstall',
    'reveal-password': 'Reset password',
    destroy: 'Delete instance',
    delete: 'Delete instance',
    start: 'Start',
    stop: 'Stop',
    shutdown: 'Stop',
    restart: 'Restart',
    renew: 'Renew',
    env: 'Update env',
    domain: 'Bind domain',
    tls: 'Enable HTTPS',
    scale: 'Scale',
  },
};

type UiTextMap = {
  auth: Record<string, string>;
  catalog: Record<string, string>;
  checkout: Record<string, string>;
  common: Record<string, string>;
  home: Record<string, string | string[]>;
  invoices: Record<string, string>;
  product: Record<string, string>;
  runtime: Record<string, string>;
  services: Record<string, string>;
};

type UiTextOverride = Partial<{
  [Section in keyof UiTextMap]: Partial<UiTextMap[Section]>;
}>;

const uiLocaleOverrides: Record<string, UiTextOverride> = {
  ja: {
    common: {
      allStatuses: 'すべてのステータス',
      amountHighToLow: '金額が高い順',
      amountLowToHigh: '金額が低い順',
      apply: '適用',
      back: '戻る',
      billing: '請求',
      cancelled: 'キャンセル済み',
      category: 'カテゴリ',
      completed: '完了',
      contactSupport: 'サポートへ連絡',
      copied: 'コピー済み',
      due: '支払期限',
      endpoint: 'アクセス先',
      expires: '有効期限',
      highPriority: '優先対応',
      interfaceLanguage: '表示言語',
      lastAttempt: '最終試行',
      newestFirst: '新しい順',
      nearestDueFirst: '期限が近い順',
      noAttempts: '履歴なし',
      operationId: '操作 ID',
      pending: '処理中',
      productLine: '製品ライン',
      refresh: '更新',
      refreshing: '更新中...',
      retrying: '再試行中...',
      search: '検索',
      selectLanguage: 'フロント表示言語を選択',
      sort: '並び替え',
      sortByStatus: 'ステータス順',
      unavailable: '利用不可',
      unnamedCategory: 'カテゴリ未設定',
      unnamedItem: '名称未設定',
      unnamedPlan: 'プラン未設定',
      unnamedProduct: '商品未設定',
      unnamedService: 'サービス未設定',
      unknown: '不明',
    },
    home: {
      heroEyebrow: 'VPS とマネージドアプリ',
      heroTitle: 'クラウドサーバーとアプリ運用を 1 つの顧客ポータルへ',
      heroSubtitle: 'VPS 購入、アプリ配備、請求確認、インスタンス管理、更新・解約までを Sloth Cloud で完結します。',
      heroPrimary: '販売中サービスを見る',
      heroSecondary: 'マイサービスへ',
      productLines: '2 つの製品ライン',
      productLinesSubtitle: 'VPS 操作とマネージドアプリ操作を明確に分離して案内します。',
      vpsTitle: 'VPSサーバー',
      vpsBody: '完全な OS 権限、固定スペック、再インストール、サーバー制御が必要な利用に適しています。',
      managedTitle: 'マネージドアプリホスティング',
      managedBody: '公開 Git リポジトリから自動ビルドし、ドメイン、ログ、環境変数、スケールを運用できます。',
      featuredTitle: '人気サービス',
      featuredSubtitle: 'ライブカタログからすぐ注文できます。',
      assuranceTitle: '運用可視化',
      assuranceSubtitle: '注文、請求、開通、稼働、操作ログを 1 画面で追跡できます。',
      assuranceItems: ['支払い後の請求状態を自動更新', '開通進捗と失敗理由を追跡可能', 'サービス操作は実行結果を返却', '多言語 UI と実運用向け空状態'],
      emptyProductsTitle: '現在販売中の商品がありません',
      emptyProductsBody: '課金管理画面で商品・価格・カテゴリを公開後、ページを更新してください。',
      emptyCategoriesTitle: '表示できるカテゴリがありません',
      emptyCategoriesBody: 'カテゴリと商品の関連付けを確認してください。',
    },
    catalog: {
      title: 'クラウドストア',
      subtitle: 'VPS またはマネージドアプリを選び、詳細ページで設定して注文します。',
      managedEyebrow: 'マネージドアプリ',
      managedTitle: '公開 Git から自動ビルド、ドメインと HTTPS を一元管理',
      managedBody: 'リポジトリ・ブランチ・ポートを入力するだけで、ビルド、配備、URL 発行、運用操作を提供します。',
      vpsEyebrow: 'VPSサーバー製品ライン',
      vpsTitle: '地域・スペック・OS テンプレートでクラウドサーバーを購入',
      vpsBody: '電源操作、再起動、再インストール、パスワード再設定、更新、解約をそのまま利用できます。',
      noProducts: 'この条件に一致する商品はありません。',
      stock: '在庫',
    },
    product: {
      configTitle: '購入設定',
      detailsHelp: '課金周期や OS / アプリ設定を確認してカートに追加してください。',
      noExtraConfig: 'この商品に追加設定はありません。',
      operatingSystem: 'オペレーティングシステム',
    },
    services: {
      title: 'マイサービス',
      subtitle: 'サービス状態、製品ライン、請求、主要操作を優先表示します。',
      searchPlaceholder: 'サービス名・商品名・ID で検索',
      noServices: 'まだサービスがありません。購入後ここで開通状況と運用操作を確認できます。',
      priceHighToLow: '金額が高い順',
      priceLowToHigh: '金額が低い順',
      nearestExpiry: '期限が近い順',
      viewRuntime: 'サービス管理',
      lifecycle: '請求とライフサイクル',
      runtimeConsole: 'ランタイムコンソール',
      provisioning: '開通状況',
      updateLabelSuccess: 'サービスラベルを更新しました。',
      cancellationRequested: '解約リクエストを送信しました。',
      cancellationRevoked: '解約リクエストを取り消しました。',
      renewalRequested: '更新リクエストを送信しました。',
      cancelType: '解約方式',
      cancelEndPeriod: '期限満了で解約（推奨）',
      cancelImmediate: '即時解約（インスタンス停止）',
      cancelReason: '解約理由（任意）',
      cancelEndHint: '期限満了解約では、現在の請求期間終了までサービスが稼働します。',
      cancelImmediateHint: '即時解約では、先に実行中インスタンスを停止してから解約状態にします。',
      cancelUnavailableProvisioning: '開通中は解約できません。',
      cancelUnavailableState: '現在の状態では解約できません。',
      revokeCancellation: '解約取消',
      renewing: '更新処理中...',
      renewService: '更新',
      renewAfterProvisioning: '開通完了後に更新可能です。',
      pendingInvoiceHint: '未払い請求があるため、先に支払いを完了してください。',
    },
    runtime: {
      applicationInfo: 'アプリインスタンス情報',
      applicationControls: 'アプリ操作',
      applicationLogs: 'アプリログ',
      applicationLogsEmpty: 'アプリログはまだありません。',
      restartApp: 'アプリ再起動',
      deleteInstance: 'インスタンス削除',
      envJson: '環境変数（JSON）',
      updateEnv: '環境変数を更新',
      bindDomain: 'ドメイン',
      saveDomain: 'ドメイン保存',
      enableHttps: 'HTTPS を有効化',
      scaleReplicas: 'レプリカ拡張',
      applyScale: '拡張を実行',
      replicaLimit: 'プラン上限',
      instanceRef: 'インスタンス参照',
      runtimeStatus: '稼働状態',
      domain: 'ドメイン',
      replicas: 'レプリカ数',
      lastDeploy: '最終配備',
      serverInfo: 'サーバー情報',
      serverOperations: 'サーバー操作',
      serverRef: 'サーバー参照',
      serverState: 'サーバー状態',
      ipAddress: 'IPアドレス',
      locked: 'ロック状態',
      memory: 'メモリ',
      disk: 'ディスク',
      inboundBandwidth: '受信帯域',
      outboundTraffic: '送信トラフィック',
      reinstallTemplate: '再インストールテンプレート',
      defaultTemplate: '既定テンプレートを使用',
      reinstallPassword: '再インストールパスワード（空欄で自動生成）',
      startOnCompletion: '完了後に自動起動',
      start: '起動',
      stop: '停止',
      restart: '再起動',
      reinstall: '再インストール',
      resetPassword: 'パスワード再設定',
      suspend: '一時停止',
      unsuspend: '一時停止解除',
      recentLogs: '最新操作ログ',
      noOperationLogs: '操作ログはまだありません。',
      errorCode: 'エラーコード',
      attempts: '試行回数',
      retryProvisioning: '開通を再試行',
    },
    invoices: {
      title: '請求書',
      subtitle: '未払い・支払済み・延滞の請求書を確認し、支払い後は自動更新されます。',
      searchPlaceholder: '請求番号・ユーザー・金額で検索',
      relatedServices: '関連商品・サービス',
      settledTitle: '支払いが完了し、請求書は確定しました。',
      settledBody: 'サービス画面で開通状態と稼働状態を確認できます。',
      paymentMethod: '支払い方法',
      noGateway: '利用可能な支払い方法がありません。時間をおいて再試行するかサポートへ連絡してください。',
      continuePayment: '支払いを続行',
      openPaymentNewTab: '支払いページを新しいタブで開く',
      paidRefresh: '支払い済み、状態を更新',
      openPaymentAgain: '支払いページを再度開く',
      confirmingPayment: '支払い結果を確認中です。しばらくお待ちください...',
      paymentOpened: '支払いページを新しいタブで開きました。支払い後にこのページへ戻ってください。',
      paymentPopupBlocked: 'ブラウザでポップアップがブロックされました。許可して再試行してください。',
      gatewayMissingPage: '決済ページ URL を取得できませんでした。再試行またはサポートへ連絡してください。',
      waitingPayment: '支払い確認を待機中です。請求状態は自動更新されます。',
      invoiceStillPending: '請求書は未払いのままです。状態は自動更新されます。',
      paymentConfirmed: '支払いを確認しました。請求状態を更新しました。',
      paymentNotConfirmed: '支払い結果をまだ確認できません。少し待ってから再読込してください。',
      refreshLater: '未払い状態です。支払い済みの場合は 10～30 秒後に更新してください。',
    },
    checkout: {
      reviewTitle: '注文確認',
      reviewSubtitle: '商品、数量、クーポン、合計金額を確認して注文を確定してください。',
    },
    auth: {
      loginHint: 'ログインすると注文、サービス管理、請求確認を続けられます。',
      registerHint: 'アカウント作成後、このポータルでそのまま操作できます。',
    },
  },
  ko: {
    common: {
      allStatuses: '전체 상태',
      amountHighToLow: '금액 높은 순',
      amountLowToHigh: '금액 낮은 순',
      apply: '적용',
      back: '뒤로',
      billing: '청구',
      cancelled: '취소됨',
      category: '카테고리',
      completed: '완료',
      contactSupport: '고객지원 문의',
      copied: '복사됨',
      due: '납기일',
      endpoint: '접속 주소',
      expires: '만료일',
      highPriority: '우선 처리',
      interfaceLanguage: '표시 언어',
      lastAttempt: '최근 시도',
      newestFirst: '최신순',
      nearestDueFirst: '만기 임박순',
      noAttempts: '기록 없음',
      operationId: '작업 ID',
      pending: '처리 중',
      productLine: '제품 라인',
      refresh: '새로고침',
      refreshing: '새로고침 중...',
      retrying: '재시도 중...',
      search: '검색',
      selectLanguage: '프론트 표시 언어 선택',
      sort: '정렬',
      sortByStatus: '상태순',
      unavailable: '사용 불가',
      unnamedCategory: '카테고리 미지정',
      unnamedItem: '이름 미지정',
      unnamedPlan: '요금제 미지정',
      unnamedProduct: '상품 미지정',
      unnamedService: '서비스 미지정',
      unknown: '알 수 없음',
    },
    home: {
      heroEyebrow: 'VPS 및 매니지드 앱 클라우드',
      heroTitle: '클라우드 서버와 앱 호스팅을 하나의 고객 포털로',
      heroSubtitle: 'VPS 구매, 앱 배포, 청구 확인, 인스턴스 관리, 갱신·해지를 Sloth Cloud에서 한 번에 처리합니다.',
      heroPrimary: '판매 상품 보기',
      heroSecondary: '내 서비스로 이동',
      productLines: '두 개의 제품 라인',
      productLinesSubtitle: 'VPS 제어와 매니지드 앱 제어를 분리해 더 명확한 사용자 경험을 제공합니다.',
      vpsTitle: 'VPS서버',
      vpsBody: '완전한 OS 권한, 고정 스펙, 재설치, 서버 제어가 필요한 워크로드에 적합합니다.',
      managedTitle: '매니지드 앱 호스팅',
      managedBody: '공개 Git 저장소에서 자동 빌드하고 도메인, 로그, 환경 변수, 확장을 운영할 수 있습니다.',
      featuredTitle: '인기 서비스',
      featuredSubtitle: '실시간 카탈로그에서 바로 주문할 수 있습니다.',
      assuranceTitle: '운영 가시성',
      assuranceSubtitle: '주문, 청구, 개통, 런타임 상태, 작업 로그를 한 화면에서 추적합니다.',
      assuranceItems: ['결제 후 청구 상태 자동 갱신', '개통 진행과 실패 사유 추적', '서비스 제어 작업 결과 반환', '다국어 UI 및 운영형 빈 상태'],
      emptyProductsTitle: '판매 중인 상품이 없습니다',
      emptyProductsBody: '과금 관리자에서 상품/가격/카테고리를 공개한 뒤 새로고침하세요.',
      emptyCategoriesTitle: '표시 가능한 카테고리가 없습니다',
      emptyCategoriesBody: '카테고리와 상품 연결 상태를 확인하세요.',
    },
    catalog: {
      title: '클라우드 스토어',
      subtitle: 'VPS 또는 매니지드 앱을 선택하고 상세 페이지에서 설정 후 주문하세요.',
      managedEyebrow: '매니지드 앱',
      managedTitle: '공개 Git 자동 빌드, 도메인/HTTPS 통합 관리',
      managedBody: '저장소, 브랜치, 포트만 입력하면 빌드, 배포, URL 발급, 운영 제어를 자동 제공합니다.',
      vpsEyebrow: 'VPS 서버 제품 라인',
      vpsTitle: '지역·사양·OS 템플릿 기준으로 VPS 구매',
      vpsBody: '전원 제어, 재부팅, 재설치, 비밀번호 재설정, 갱신, 해지 기능을 그대로 제공합니다.',
      noProducts: '현재 조건에 맞는 상품이 없습니다.',
      stock: '재고',
    },
    product: {
      configTitle: '구매 설정',
      detailsHelp: '과금 주기와 OS/앱 설정을 확인한 뒤 장바구니에 추가하세요.',
      noExtraConfig: '이 상품에는 추가 설정 항목이 없습니다.',
      operatingSystem: '운영체제',
    },
    services: {
      title: '내 서비스',
      subtitle: '서비스 상태, 제품 라인, 청구, 핵심 작업을 우선 표시합니다.',
      searchPlaceholder: '서비스명, 상품명, ID로 검색',
      noServices: '아직 서비스가 없습니다. 구매 후 이곳에서 개통 상태와 런타임 제어를 확인하세요.',
      priceHighToLow: '금액 높은 순',
      priceLowToHigh: '금액 낮은 순',
      nearestExpiry: '만기 임박순',
      viewRuntime: '서비스 관리',
      lifecycle: '청구 및 수명주기',
      runtimeConsole: '런타임 콘솔',
      provisioning: '개통 상태',
      updateLabelSuccess: '서비스 라벨이 업데이트되었습니다.',
      cancellationRequested: '해지 요청이 접수되었습니다.',
      cancellationRevoked: '해지 요청이 취소되었습니다.',
      renewalRequested: '갱신 요청이 접수되었습니다.',
      cancelType: '해지 방식',
      cancelEndPeriod: '기간 만료 시 해지(권장)',
      cancelImmediate: '즉시 해지(인스턴스 중지)',
      cancelReason: '해지 사유(선택)',
      cancelEndHint: '기간 만료 해지는 현재 과금 주기 종료까지 서비스를 유지합니다.',
      cancelImmediateHint: '즉시 해지는 실행 인스턴스를 먼저 종료한 뒤 해지 상태로 전환합니다.',
      cancelUnavailableProvisioning: '개통 진행 중에는 해지할 수 없습니다.',
      cancelUnavailableState: '현재 상태에서는 해지할 수 없습니다.',
      revokeCancellation: '해지 취소',
      renewing: '갱신 처리 중...',
      renewService: '서비스 갱신',
      renewAfterProvisioning: '개통 완료 후 갱신 가능합니다.',
      pendingInvoiceHint: '미결제 청구서가 있어 먼저 결제를 완료해야 합니다.',
    },
    runtime: {
      applicationInfo: '앱 인스턴스 정보',
      applicationControls: '앱 제어 콘솔',
      applicationLogs: '앱 로그',
      applicationLogsEmpty: '표시할 앱 로그가 없습니다.',
      restartApp: '앱 재시작',
      deleteInstance: '인스턴스 삭제',
      envJson: '환경 변수(JSON)',
      updateEnv: '환경 변수 업데이트',
      bindDomain: '도메인 연결',
      saveDomain: '도메인 저장',
      enableHttps: 'HTTPS 활성화',
      scaleReplicas: '복제본 확장',
      applyScale: '확장 실행',
      replicaLimit: '요금제 복제본 한도',
      instanceRef: '인스턴스 참조',
      runtimeStatus: '실행 상태',
      domain: '도메인',
      replicas: '복제본',
      lastDeploy: '마지막 배포',
      serverInfo: '서버 정보',
      serverOperations: '서버 작업',
      serverRef: '서버 참조',
      serverState: '서버 상태',
      ipAddress: 'IP 주소',
      locked: '잠금 상태',
      memory: '메모리',
      disk: '디스크',
      inboundBandwidth: '인바운드 대역폭',
      outboundTraffic: '아웃바운드 트래픽',
      reinstallTemplate: '재설치 템플릿',
      defaultTemplate: '기본 템플릿 사용',
      reinstallPassword: '재설치 비밀번호(비우면 자동 생성)',
      startOnCompletion: '완료 후 자동 시작',
      start: '시작',
      stop: '중지',
      restart: '재시작',
      reinstall: '재설치',
      resetPassword: '비밀번호 재설정',
      suspend: '일시중지',
      unsuspend: '일시중지 해제',
      recentLogs: '최근 작업 로그',
      noOperationLogs: '작업 로그가 아직 없습니다.',
      errorCode: '오류 코드',
      attempts: '시도 횟수',
      retryProvisioning: '개통 재시도',
    },
    invoices: {
      title: '청구서',
      subtitle: '미결제/결제완료/연체 청구서를 확인하고 결제 후 상태를 자동 갱신합니다.',
      searchPlaceholder: '청구번호, 사용자, 금액 검색',
      relatedServices: '연결 상품/서비스',
      settledTitle: '결제가 완료되어 청구서가 정산되었습니다.',
      settledBody: '서비스 페이지에서 개통과 런타임 상태를 확인할 수 있습니다.',
      paymentMethod: '결제 수단',
      noGateway: '사용 가능한 결제 수단이 없습니다. 잠시 후 다시 시도하거나 지원팀에 문의하세요.',
      continuePayment: '결제 계속',
      openPaymentNewTab: '결제 페이지 새 탭 열기',
      paidRefresh: '결제 완료, 상태 갱신',
      openPaymentAgain: '결제 페이지 다시 열기',
      confirmingPayment: '결제 결과를 확인 중입니다. 잠시만 기다려주세요...',
      paymentOpened: '결제 페이지를 새 탭으로 열었습니다. 결제 후 이 페이지로 돌아오세요.',
      paymentPopupBlocked: '브라우저가 팝업을 차단했습니다. 허용 후 다시 시도하세요.',
      gatewayMissingPage: '결제 페이지 URL을 가져오지 못했습니다. 다시 시도하거나 지원팀에 문의하세요.',
      waitingPayment: '결제 확인 대기 중이며 청구 상태는 자동으로 갱신됩니다.',
      invoiceStillPending: '청구서가 아직 미결제 상태입니다. 상태는 자동으로 갱신됩니다.',
      paymentConfirmed: '결제가 확인되어 청구 상태를 갱신했습니다.',
      paymentNotConfirmed: '결제 확인이 아직 완료되지 않았습니다. 잠시 후 다시 확인하세요.',
      refreshLater: '청구서가 아직 미결제입니다. 이미 결제했다면 10~30초 후 새로고침하세요.',
    },
    checkout: {
      reviewTitle: '주문 확인',
      reviewSubtitle: '상품, 수량, 쿠폰, 총액을 확인한 후 주문을 제출하세요.',
    },
    auth: {
      loginHint: '로그인하면 주문, 서비스 관리, 청구 확인을 계속할 수 있습니다.',
      registerHint: '계정 생성 후 Sloth Cloud 포털에서 바로 작업을 이어갈 수 있습니다.',
    },
  },
};

const statusLocaleOverrides: Record<string, Partial<Record<StatusKey, string>>> = {
  ja: {
    active: 'サービス有効',
    pending: '処理中',
    suspended: '停止中',
    cancelled: 'キャンセル済み',
    failed: '失敗',
    overdue: '期限超過',
    paid: '支払済み',
    unknown: '不明',
  },
  ko: {
    active: '서비스 활성',
    pending: '처리 중',
    suspended: '중지됨',
    cancelled: '취소됨',
    failed: '실패',
    overdue: '연체',
    paid: '결제완료',
    unknown: '알 수 없음',
  },
};

const runtimeStatusLocaleOverrides: Record<string, Partial<Record<RuntimeStatusKey, string>>> = {
  ja: {
    pending: '待機中',
    queued: 'キュー待ち',
    building: 'ビルド中',
    pushing: 'イメージ送信中',
    deploying: 'デプロイ中',
    ready: '利用可能',
    running: '稼働中',
    retrying: '再試行中',
    deleting: '削除中',
    failed: '失敗',
    unavailable: '利用不可',
    unknown: '不明',
  },
  ko: {
    pending: '대기 중',
    queued: '대기열',
    building: '빌드 중',
    pushing: '이미지 푸시 중',
    deploying: '배포 중',
    ready: '사용 가능',
    running: '실행 중',
    retrying: '재시도 중',
    deleting: '삭제 중',
    failed: '실패',
    unavailable: '사용 불가',
    unknown: '알 수 없음',
  },
};

const operationLocaleOverrides: Record<string, Record<string, string>> = {
  ja: {
    cancel: 'サービス解約',
    suspend: '停止',
    unsuspend: '停止解除',
    reinstall: '再インストール',
    'reveal-password': 'パスワード再設定',
    destroy: 'インスタンス削除',
    delete: 'インスタンス削除',
    start: '起動',
    stop: '停止',
    shutdown: '停止',
    restart: '再起動',
    renew: '更新',
    env: '環境変数更新',
    domain: 'ドメイン設定',
    tls: 'HTTPS有効化',
    scale: 'スケール',
  },
  ko: {
    cancel: '서비스 취소',
    suspend: '중지',
    unsuspend: '중지 해제',
    reinstall: '재설치',
    'reveal-password': '비밀번호 재설정',
    destroy: '인스턴스 삭제',
    delete: '인스턴스 삭제',
    start: '시작',
    stop: '중지',
    shutdown: '중지',
    restart: '재시작',
    renew: '갱신',
    env: '환경 변수 업데이트',
    domain: '도메인 연결',
    tls: 'HTTPS 활성화',
    scale: '확장',
  },
};

function localeLanguage(locale: Locale | string) {
  return locale.toLowerCase().split('-')[0];
}

function mergeSection<T extends Record<string, unknown>>(base: T, override?: Partial<T>) {
  if (!override) {
    return base;
  }

  return { ...base, ...override };
}

export function localeBucket(locale: Locale | string): 'zh' | 'en' {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getUiText(locale: Locale | string) {
  const bucket = localeBucket(locale);
  const baseText: UiTextMap = {
    auth: auth[bucket],
    catalog: catalog[bucket],
    checkout: checkout[bucket],
    common: common[bucket],
    home: home[bucket],
    invoices: invoices[bucket],
    product: product[bucket],
    runtime: runtime[bucket],
    services: services[bucket],
  };

  const override = uiLocaleOverrides[localeLanguage(locale)];
  if (!override) {
    return baseText;
  }

  return {
    auth: mergeSection(baseText.auth, override.auth),
    catalog: mergeSection(baseText.catalog, override.catalog),
    checkout: mergeSection(baseText.checkout, override.checkout),
    common: mergeSection(baseText.common, override.common),
    home: mergeSection(baseText.home, override.home),
    invoices: mergeSection(baseText.invoices, override.invoices),
    product: mergeSection(baseText.product, override.product),
    runtime: mergeSection(baseText.runtime, override.runtime),
    services: mergeSection(baseText.services, override.services),
  };
}

export function normalizeServiceStatus(status: string): Exclude<StatusKey, 'paid' | 'overdue'> {
  const value = status.trim().toLowerCase();
  if (value === 'active' || value === 'running') return 'active';
  if (value === 'pending' || value === 'provisioning' || value === 'queued') return 'pending';
  if (value === 'suspended') return 'suspended';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  if (value === 'failed' || value === 'error') return 'failed';
  return 'unknown';
}

export function normalizeInvoiceStatus(status: string): Extract<StatusKey, 'paid' | 'pending' | 'cancelled' | 'overdue' | 'unknown'> {
  const value = status.trim().toLowerCase();
  if (value === 'paid' || value === 'success' || value === 'completed') return 'paid';
  if (value === 'pending' || value === 'unpaid') return 'pending';
  if (value === 'cancelled' || value === 'canceled' || value === 'void') return 'cancelled';
  if (value === 'overdue') return 'overdue';
  return 'unknown';
}

export function statusLabel(status: StatusKey, locale: Locale | string) {
  const language = localeLanguage(locale);
  const custom = statusLocaleOverrides[language]?.[status];
  if (custom) {
    return custom;
  }

  return statusLabels[localeBucket(locale)][status] ?? statusLabels[localeBucket(locale)].unknown;
}

export function serviceStatusLabel(status: string, locale: Locale | string) {
  return statusLabel(normalizeServiceStatus(status), locale);
}

export function invoiceStatusLabel(status: string, locale: Locale | string) {
  return statusLabel(normalizeInvoiceStatus(status), locale);
}

export function statusClassName(status: StatusKey | string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'paid' || normalized === 'ready' || normalized === 'running') return 'status-active';
  if (normalized === 'pending' || normalized === 'queued' || normalized === 'building' || normalized === 'deploying' || normalized === 'retrying') return 'status-pending';
  if (normalized === 'overdue' || normalized === 'failed' || normalized.includes('error')) return 'status-overdue';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'deleting' || normalized === 'deleted') return 'status-cancelled';
  if (normalized === 'suspended') return 'status-suspended';
  return 'status-unknown';
}

export function normalizeRuntimeStatus(status: string): RuntimeStatusKey {
  const value = status.trim().toLowerCase();
  if (value === 'running' || value === 'started') return 'running';
  if (value === 'queued') return 'queued';
  if (value === 'building') return 'building';
  if (value === 'pushing' || value === 'push') return 'pushing';
  if (value === 'deploying') return 'deploying';
  if (value === 'ready' || value === 'success' || value === 'completed') return 'ready';
  if (value === 'retrying') return 'retrying';
  if (value === 'deleting' || value === 'deleted') return 'deleting';
  if (value === 'failed' || value === 'build_failed' || value.includes('error')) return 'failed';
  if (value === 'unavailable' || value === 'offline' || value === 'stopped' || value === 'shutdown') return 'unavailable';
  if (value === 'pending' || value === 'provisioning' || value === '') return 'pending';
  return 'unknown';
}

export function runtimeStatusLabel(status: string, locale: Locale | string) {
  const normalized = normalizeRuntimeStatus(status);
  const language = localeLanguage(locale);
  const custom = runtimeStatusLocaleOverrides[language]?.[normalized];
  if (custom) {
    return custom;
  }

  return runtimeStatusLabels[localeBucket(locale)][normalized];
}

export function operationActionLabel(action: string, locale: Locale | string) {
  const normalized = action.trim().toLowerCase();
  const language = localeLanguage(locale);
  const custom = operationLocaleOverrides[language]?.[normalized];
  if (custom) {
    return custom;
  }

  return operationLabels[localeBucket(locale)][normalized] ?? action;
}

export function operationOutcomeLabel(success: boolean | null, locale: Locale | string) {
  const language = localeLanguage(locale);
  if (success === true) {
    if (language === 'zh') return '成功';
    if (language === 'ja') return '成功';
    if (language === 'ko') return '성공';
    return 'Succeeded';
  }
  if (success === false) {
    if (language === 'zh') return '失败';
    if (language === 'ja') return '失敗';
    if (language === 'ko') return '실패';
    return 'Failed';
  }
  if (language === 'zh') return '处理中';
  if (language === 'ja') return '進行中';
  if (language === 'ko') return '처리 중';
  return 'In progress';
}

export function billingCycleLabel(period: number | null, unit: string | null, fallback: string, locale: Locale | string) {
  if (!period || !unit) return fallback;
  const bucket = localeBucket(locale);
  const language = localeLanguage(locale);
  const normalizedUnit = unit.toLowerCase();
  if (language === 'ja') {
    const unitLabel = normalizedUnit.startsWith('year') ? '年' : normalizedUnit.startsWith('month') ? 'か月' : unit;
    return `${period}${unitLabel}`;
  }
  if (language === 'ko') {
    const unitLabel = normalizedUnit.startsWith('year') ? '년' : normalizedUnit.startsWith('month') ? '개월' : unit;
    return `${period}${unitLabel}`;
  }

  const unitLabel = bucket === 'zh'
    ? normalizedUnit.startsWith('year') ? '年' : normalizedUnit.startsWith('month') ? '个月' : unit
    : normalizedUnit.startsWith('year') ? (period > 1 ? 'years' : 'year') : normalizedUnit.startsWith('month') ? (period > 1 ? 'months' : 'month') : unit;
  return bucket === 'zh' ? `${period}${unitLabel}` : `${period} ${unitLabel}`;
}

export function productLineFor(categorySlug?: string | null, productSlug?: string | null): ProductLineKey {
  const category = (categorySlug ?? '').toLowerCase();
  const product = (productSlug ?? '').toLowerCase();
  if (category === 'app-hosting' || product.startsWith('app-') || product.includes('app-hosting')) return 'managed-app';
  if (category.includes('vps') || category.includes('server') || product.includes('vps') || product.includes('bgp')) return 'vps';
  return 'other';
}

export function productLineLabel(line: ProductLineKey, locale: Locale | string) {
  const ui = getUiText(locale);
  if (line === 'managed-app') return ui.home.managedTitle as string;
  if (line === 'vps') return ui.home.vpsTitle as string;
  return ui.common.productLine;
}
