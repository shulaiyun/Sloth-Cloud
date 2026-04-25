import type { Locale } from './content';

type UiText = {
  home: {
    heroEyebrow: string;
    vpsTitle: string;
    vpsBody: string;
    assuranceTitle: string;
    assuranceSubtitle: string;
    assuranceItems: string[];
    emptyCategoriesTitle: string;
    emptyCategoriesBody: string;
  };
  auth: {
    loginHint: string;
  };
  catalog: {
    noProducts: string;
    stock: string;
  };
  invoices: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
  };
  services: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    noServices: string;
    viewRuntime: string;
    runtimeConsole: string;
    cancellationRequested: string;
    cancellationRevoked: string;
    pendingInvoiceHint: string;
    updateLabelSuccess: string;
    renewService: string;
    renewRequested: string;
    renewAfterProvisioning: string;
    renewing: string;
    revokeCancellation: string;
    cancelUnavailableState: string;
    cancelImmediate: string;
    cancelEndPeriod: string;
    cancelType: string;
    cancelReason: string;
    provisioning: string;
    nearestExpiry: string;
    priceHighToLow: string;
    priceLowToHigh: string;
  };
  product: {
    configTitle: string;
    detailsHelp: string;
    noExtraConfig: string;
  };
  runtime: {
    runtimeStatus: string;
    applicationInfo: string;
    applicationControls: string;
    serverOperations: string;
    serverRef: string;
    instanceRef: string;
    domain: string;
    ipAddress: string;
    envJson: string;
    replicas: string;
    replicaLimit: string;
    scaleReplicas: string;
    applyScale: string;
    bindDomain: string;
    enableHttps: string;
    saveDomain: string;
    updateEnv: string;
    restart: string;
    restartApp: string;
    start: string;
    stop: string;
    reinstall: string;
    reinstallPassword: string;
    resetPassword: string;
    deleteInstance: string;
    startOnCompletion: string;
    retryProvisioning: string;
    noOperationLogs: string;
    recentLogs: string;
    operationId: string;
    errorCode: string;
    lastDeploy: string;
    lastAttempt: string;
    attempts: string;
    endpoint: string;
    applicationLogs: string;
    applicationLogsEmpty: string;
  };
  common: {
    search: string;
    sort: string;
    allStatuses: string;
    newestFirst: string;
    nearestDueFirst: string;
    amountHighToLow: string;
    amountLowToHigh: string;
    sortByStatus: string;
    pending: string;
    completed: string;
    retrying: string;
    unknown: string;
    unnamedItem: string;
    unnamedProduct: string;
    unnamedPlan: string;
    unnamedService: string;
    unnamedCategory: string;
    operationId: string;
    endpoint: string;
    due: string;
    expires: string;
    noAttempts: string;
    lastAttempt: string;
  };
};

const zhText: UiText = {
  home: {
    heroEyebrow: 'VPS 与托管应用云',
    vpsTitle: '云服务器',
    vpsBody: '按节点快速筛选、可视化选择系统与应用、分钟级上线。',
    assuranceTitle: '上线保障',
    assuranceSubtitle: '从计划到发布都保留可追踪证据，避免“看起来成功”。',
    assuranceItems: ['真实路由', '真实运行', '真实健康检查', '真实截图证据'],
    emptyCategoriesTitle: '暂无分类',
    emptyCategoriesBody: '分类数据准备后会自动出现在这里。',
  },
  auth: {
    loginHint: '登录后可继续下单、查看服务和处理账单。',
  },
  catalog: {
    noProducts: '当前没有可展示的产品。',
    stock: '库存',
  },
  invoices: {
    title: '账单中心',
    subtitle: '查看付款状态、到期时间和支付入口。',
    searchPlaceholder: '搜索账单号 / 用户 / 金额',
  },
  services: {
    title: '服务中心',
    subtitle: '查看服务生命周期、运行态和续费状态。',
    searchPlaceholder: '搜索服务名 / 产品名',
    noServices: '当前没有可展示的服务。',
    viewRuntime: '查看运行态',
    runtimeConsole: '运行控制台',
    cancellationRequested: '已提交取消申请',
    cancellationRevoked: '已撤销取消申请',
    pendingInvoiceHint: '存在待支付账单，续费会在支付后完成。',
    updateLabelSuccess: '服务名称已更新',
    renewService: '续费服务',
    renewRequested: '续费请求已提交',
    renewAfterProvisioning: '当前正在开通，稍后可续费',
    renewing: '续费中',
    revokeCancellation: '撤销取消',
    cancelUnavailableState: '当前状态暂不支持取消',
    cancelImmediate: '立即取消',
    cancelEndPeriod: '周期结束后取消',
    cancelType: '取消方式',
    cancelReason: '取消原因',
    provisioning: '开通中',
    nearestExpiry: '最近到期',
    priceHighToLow: '价格从高到低',
    priceLowToHigh: '价格从低到高',
  },
  product: {
    configTitle: '配置向导',
    detailsHelp: '按顺序完成节点、系统、应用和初始化设置。',
    noExtraConfig: '暂无可选项',
  },
  runtime: {
    runtimeStatus: '运行状态',
    applicationInfo: '应用信息',
    applicationControls: '应用控制',
    serverOperations: '服务器操作',
    serverRef: '服务器引用',
    instanceRef: '实例引用',
    domain: '域名',
    ipAddress: 'IP 地址',
    envJson: '环境变量 JSON',
    replicas: '副本数',
    replicaLimit: '副本上限',
    scaleReplicas: '调整副本',
    applyScale: '应用副本设置',
    bindDomain: '绑定域名',
    enableHttps: '开启 HTTPS',
    saveDomain: '保存域名',
    updateEnv: '更新环境变量',
    restart: '重启',
    restartApp: '重启应用',
    start: '启动',
    stop: '停止',
    reinstall: '重装',
    reinstallPassword: '重装并重置密码',
    resetPassword: '重置密码',
    deleteInstance: '删除实例',
    startOnCompletion: '完成后自动启动',
    retryProvisioning: '重试开通',
    noOperationLogs: '暂无操作日志',
    recentLogs: '最近日志',
    operationId: '操作 ID',
    errorCode: '错误码',
    lastDeploy: '最近部署',
    lastAttempt: '最近尝试',
    attempts: '尝试次数',
    endpoint: '访问地址',
    applicationLogs: '应用日志',
    applicationLogsEmpty: '暂无应用日志',
  },
  common: {
    search: '搜索',
    sort: '排序',
    allStatuses: '全部状态',
    newestFirst: '最新优先',
    nearestDueFirst: '最近到期优先',
    amountHighToLow: '金额从高到低',
    amountLowToHigh: '金额从低到高',
    sortByStatus: '按状态排序',
    pending: '待处理',
    completed: '已完成',
    retrying: '重试中',
    unknown: '未知',
    unnamedItem: '未命名项',
    unnamedProduct: '未命名产品',
    unnamedPlan: '未命名方案',
    unnamedService: '未命名服务',
    unnamedCategory: '未命名分类',
    operationId: '操作 ID',
    endpoint: '访问地址',
    due: '到期',
    expires: '过期',
    noAttempts: '暂无尝试记录',
    lastAttempt: '最后一次尝试',
  },
};

const enText: UiText = {
  home: {
    heroEyebrow: 'VPS and managed app cloud',
    vpsTitle: 'Cloud VPS',
    vpsBody: 'Pick a location, choose OS/apps visually, and launch fast.',
    assuranceTitle: 'Delivery assurance',
    assuranceSubtitle: 'Plan-to-release stays evidence-backed, not “looks done”.',
    assuranceItems: ['Real routing', 'Real runtime', 'Real health checks', 'Real screenshot evidence'],
    emptyCategoriesTitle: 'No categories yet',
    emptyCategoriesBody: 'Categories will appear here once data is available.',
  },
  auth: {
    loginHint: 'Sign in to continue ordering, services, and invoices.',
  },
  catalog: {
    noProducts: 'No products available.',
    stock: 'Stock',
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'Track payment state, due dates, and payment links.',
    searchPlaceholder: 'Search by invoice / user / amount',
  },
  services: {
    title: 'Services',
    subtitle: 'Track lifecycle, runtime state, and renewal posture.',
    searchPlaceholder: 'Search service or product name',
    noServices: 'No services available.',
    viewRuntime: 'View runtime',
    runtimeConsole: 'Runtime console',
    cancellationRequested: 'Cancellation requested',
    cancellationRevoked: 'Cancellation revoked',
    pendingInvoiceHint: 'An unpaid invoice is blocking renewal.',
    updateLabelSuccess: 'Service label updated',
    renewService: 'Renew service',
    renewRequested: 'Renewal requested',
    renewAfterProvisioning: 'Provisioning in progress. Renew after completion.',
    renewing: 'Renewing',
    revokeCancellation: 'Revoke cancellation',
    cancelUnavailableState: 'Current state does not support cancellation',
    cancelImmediate: 'Cancel immediately',
    cancelEndPeriod: 'Cancel at period end',
    cancelType: 'Cancellation type',
    cancelReason: 'Cancellation reason',
    provisioning: 'Provisioning',
    nearestExpiry: 'Nearest expiry',
    priceHighToLow: 'Price high to low',
    priceLowToHigh: 'Price low to high',
  },
  product: {
    configTitle: 'Configuration flow',
    detailsHelp: 'Complete node, OS, app, and bootstrap settings in order.',
    noExtraConfig: 'No extra options available',
  },
  runtime: {
    runtimeStatus: 'Runtime status',
    applicationInfo: 'Application info',
    applicationControls: 'Application controls',
    serverOperations: 'Server operations',
    serverRef: 'Server ref',
    instanceRef: 'Instance ref',
    domain: 'Domain',
    ipAddress: 'IP address',
    envJson: 'Environment JSON',
    replicas: 'Replicas',
    replicaLimit: 'Replica limit',
    scaleReplicas: 'Scale replicas',
    applyScale: 'Apply scale',
    bindDomain: 'Bind domain',
    enableHttps: 'Enable HTTPS',
    saveDomain: 'Save domain',
    updateEnv: 'Update env',
    restart: 'Restart',
    restartApp: 'Restart app',
    start: 'Start',
    stop: 'Stop',
    reinstall: 'Reinstall',
    reinstallPassword: 'Reinstall + reset password',
    resetPassword: 'Reset password',
    deleteInstance: 'Delete instance',
    startOnCompletion: 'Start on completion',
    retryProvisioning: 'Retry provisioning',
    noOperationLogs: 'No operation logs',
    recentLogs: 'Recent logs',
    operationId: 'Operation ID',
    errorCode: 'Error code',
    lastDeploy: 'Last deploy',
    lastAttempt: 'Last attempt',
    attempts: 'Attempts',
    endpoint: 'Endpoint',
    applicationLogs: 'Application logs',
    applicationLogsEmpty: 'No application logs',
  },
  common: {
    search: 'Search',
    sort: 'Sort',
    allStatuses: 'All statuses',
    newestFirst: 'Newest first',
    nearestDueFirst: 'Nearest due first',
    amountHighToLow: 'Amount high to low',
    amountLowToHigh: 'Amount low to high',
    sortByStatus: 'Sort by status',
    pending: 'Pending',
    completed: 'Completed',
    retrying: 'Retrying',
    unknown: 'Unknown',
    unnamedItem: 'Unnamed item',
    unnamedProduct: 'Unnamed product',
    unnamedPlan: 'Unnamed plan',
    unnamedService: 'Unnamed service',
    unnamedCategory: 'Unnamed category',
    operationId: 'Operation ID',
    endpoint: 'Endpoint',
    due: 'Due',
    expires: 'Expires',
    noAttempts: 'No attempts',
    lastAttempt: 'Last attempt',
  },
};

function isZh(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

export function getUiText(locale: Locale | string): UiText {
  return isZh(locale) ? zhText : enText;
}

export type ProductLine = 'vps' | 'managed-app' | 'unknown';

function normalizeSlug(input: string | null | undefined) {
  return (input ?? '').trim().toLowerCase();
}

export function productLineFor(categorySlug: string | null | undefined, productSlug: string | null | undefined): ProductLine {
  const category = normalizeSlug(categorySlug);
  const slug = normalizeSlug(productSlug);
  const merged = `${category} ${slug}`;

  if (
    merged.includes('managed')
    || merged.includes('app')
    || merged.includes('deploy')
    || merged.includes('container')
    || merged.includes('k8s')
  ) {
    return 'managed-app';
  }

  if (
    merged.includes('vps')
    || merged.includes('server')
    || merged.includes('vm')
    || merged.includes('cloud')
  ) {
    return 'vps';
  }

  return 'unknown';
}

export function productLineLabel(productLine: ProductLine, locale: string) {
  if (productLine === 'managed-app') {
    return isZh(locale) ? '托管应用' : 'Managed app';
  }
  if (productLine === 'vps') {
    return isZh(locale) ? '云服务器' : 'VPS';
  }
  return isZh(locale) ? '通用产品' : 'General product';
}

function unitLabel(period: number, unit: string, locale: string) {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (isZh(locale)) {
    if (normalized.startsWith('month')) return `${period}个月`;
    if (normalized.startsWith('year')) return `${period}年`;
    if (normalized.startsWith('day')) return `${period}天`;
    if (normalized.startsWith('hour')) return `${period}小时`;
    if (normalized.startsWith('week')) return `${period}周`;
    return `${period}${unit}`;
  }

  const plural = period > 1 ? 's' : '';
  if (normalized.startsWith('month')) return `${period} month${plural}`;
  if (normalized.startsWith('year')) return `${period} year${plural}`;
  if (normalized.startsWith('day')) return `${period} day${plural}`;
  if (normalized.startsWith('hour')) return `${period} hour${plural}`;
  if (normalized.startsWith('week')) return `${period} week${plural}`;
  return `${period} ${unit}`;
}

export function billingCycleLabel(
  billingPeriod: number | null | undefined,
  billingUnit: string | null | undefined,
  customBillingLabel: string,
  locale: string,
) {
  if (!billingPeriod || !billingUnit) {
    return customBillingLabel || (isZh(locale) ? '自定义计费' : 'Custom billing');
  }
  return unitLabel(billingPeriod, billingUnit, locale);
}

export type NormalizedServiceStatus = 'active' | 'pending' | 'suspended' | 'cancelled' | 'failed' | 'unknown';
export type NormalizedInvoiceStatus = 'paid' | 'pending' | 'cancelled' | 'overdue' | 'unknown';

export function normalizeServiceStatus(status: string | null | undefined): NormalizedServiceStatus {
  const normalized = (status ?? '').trim().toLowerCase();
  if (['active', 'running', 'started', 'ready'].includes(normalized)) return 'active';
  if (['pending', 'queued', 'provisioning', 'building', 'retrying', 'deploying'].includes(normalized)) return 'pending';
  if (['suspended', 'paused', 'stopped'].includes(normalized)) return 'suspended';
  if (['cancelled', 'canceled', 'terminated'].includes(normalized)) return 'cancelled';
  if (['failed', 'error', 'build_failed'].includes(normalized)) return 'failed';
  return 'unknown';
}

export function serviceStatusLabel(status: string | null | undefined, locale: string) {
  const normalized = normalizeServiceStatus(status);
  const zhLabels: Record<NormalizedServiceStatus, string> = {
    active: '运行中',
    pending: '处理中',
    suspended: '已暂停',
    cancelled: '已取消',
    failed: '失败',
    unknown: '未知',
  };
  const enLabels: Record<NormalizedServiceStatus, string> = {
    active: 'Active',
    pending: 'Pending',
    suspended: 'Suspended',
    cancelled: 'Cancelled',
    failed: 'Failed',
    unknown: 'Unknown',
  };
  return isZh(locale) ? zhLabels[normalized] : enLabels[normalized];
}

export function runtimeStatusLabel(status: string | null | undefined, locale: string) {
  const normalized = (status ?? '').trim().toLowerCase();
  const zhMap: Record<string, string> = {
    running: '运行中',
    started: '运行中',
    ready: '就绪',
    active: '活动',
    pending: '等待中',
    provisioning: '开通中',
    building: '构建中',
    installing: '安装中',
    deploying: '部署中',
    retrying: '重试中',
    stopped: '已停止',
    suspended: '已暂停',
    failed: '失败',
    blocked: '受阻',
    unknown: '未知',
  };
  const enMap: Record<string, string> = {
    running: 'Running',
    started: 'Running',
    ready: 'Ready',
    active: 'Active',
    pending: 'Pending',
    provisioning: 'Provisioning',
    building: 'Building',
    installing: 'Installing',
    deploying: 'Deploying',
    retrying: 'Retrying',
    stopped: 'Stopped',
    suspended: 'Suspended',
    failed: 'Failed',
    blocked: 'Blocked',
    unknown: 'Unknown',
  };

  const dictionary = isZh(locale) ? zhMap : enMap;
  return dictionary[normalized] ?? dictionary.unknown;
}

export function normalizeInvoiceStatus(status: string | null | undefined): NormalizedInvoiceStatus {
  const normalized = (status ?? '').trim().toLowerCase();
  if (['paid', 'success'].includes(normalized)) return 'paid';
  if (['pending', 'unpaid', 'draft'].includes(normalized)) return 'pending';
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'cancelled';
  if (['overdue', 'late'].includes(normalized)) return 'overdue';
  return 'unknown';
}

export function invoiceStatusLabel(status: string | null | undefined, locale: string) {
  const normalized = normalizeInvoiceStatus(status);
  const zhLabels: Record<NormalizedInvoiceStatus, string> = {
    paid: '已支付',
    pending: '待支付',
    cancelled: '已取消',
    overdue: '已逾期',
    unknown: '未知',
  };
  const enLabels: Record<NormalizedInvoiceStatus, string> = {
    paid: 'Paid',
    pending: 'Pending',
    cancelled: 'Cancelled',
    overdue: 'Overdue',
    unknown: 'Unknown',
  };
  return isZh(locale) ? zhLabels[normalized] : enLabels[normalized];
}

export function statusClassName(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();
  if (['active', 'running', 'ready', 'paid', 'success'].includes(normalized)) return 'status-active';
  if (['pending', 'queued', 'provisioning', 'building', 'retrying', 'draft', 'unpaid'].includes(normalized)) return 'status-pending';
  if (['failed', 'error', 'overdue'].includes(normalized)) return 'status-overdue';
  if (['suspended', 'paused', 'stopped'].includes(normalized)) return 'status-suspended';
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'status-cancelled';
  return 'status-unknown';
}

export function operationActionLabel(action: string | null | undefined, locale: string) {
  const normalized = (action ?? '').trim().toLowerCase();
  const isChinese = isZh(locale);

  if (normalized.includes('start')) return isChinese ? '启动' : 'Start';
  if (normalized.includes('stop')) return isChinese ? '停止' : 'Stop';
  if (normalized.includes('restart')) return isChinese ? '重启' : 'Restart';
  if (normalized.includes('reinstall')) return isChinese ? '重装' : 'Reinstall';
  if (normalized.includes('password')) return isChinese ? '密码操作' : 'Password action';
  if (normalized.includes('domain')) return isChinese ? '域名配置' : 'Domain update';
  if (normalized.includes('env')) return isChinese ? '环境变量更新' : 'Environment update';
  if (normalized.includes('scale')) return isChinese ? '副本调整' : 'Replica scale';
  if (normalized.includes('provision')) return isChinese ? '开通流程' : 'Provisioning';
  if (normalized.includes('deploy')) return isChinese ? '部署' : 'Deploy';

  if (normalized === '') {
    return isChinese ? '操作' : 'Operation';
  }
  return action ?? (isChinese ? '操作' : 'Operation');
}

export function operationOutcomeLabel(success: boolean | null | undefined, locale: string) {
  if (success === true) {
    return isZh(locale) ? '成功' : 'Succeeded';
  }
  if (success === false) {
    return isZh(locale) ? '失败' : 'Failed';
  }
  return isZh(locale) ? '进行中' : 'In progress';
}
