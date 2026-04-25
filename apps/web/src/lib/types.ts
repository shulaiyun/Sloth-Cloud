import type { OperatorWorkflowState } from './operator-types';

export type SourceMode = 'mock' | 'live';

export interface ApiMeta {
  generatedAt: string;
  sourceMode: SourceMode;
}

export interface PaginationMeta {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  prefix: string | null;
  suffix: string | null;
  format: string | null;
}

export interface CategorySummary {
  id: string;
  slug: string;
  fullSlug: string | null;
  name: string;
  description: string;
  image: string | null;
  parentId: string | null;
  sort: number | null;
  productCount: number;
  countryCode?: string | null;
  regionCode?: string | null;
}

export interface ProductCategoryRef {
  id: string;
  slug: string;
  name: string;
  countryCode?: string | null;
  regionCode?: string | null;
}

export interface ProductPricing {
  planId: string;
  planName: string;
  billingPeriod: number | null;
  billingUnit: string | null;
  price: number | null;
  setupFee: number | null;
  currencyCode: string;
  currency: CurrencyInfo | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  stock: number | null;
  perUserLimit: number | null;
  allowQuantityMode: string | null;
  category: ProductCategoryRef | null;
  pricing: ProductPricing | null;
  countryCode?: string | null;
  regionCode?: string | null;
  selectedOs?: string | null;
  primaryAppSlug?: string | null;
  addonAppSlugs?: string[];
  runtimeKind?: RuntimeKind | null;
}

export interface ProductPlanPrice {
  id: string;
  price: number | null;
  setupFee: number | null;
  currencyCode: string;
  currency: CurrencyInfo | null;
}

export interface ProductPlan {
  id: string;
  name: string;
  type: string | null;
  billingPeriod: number | null;
  billingUnit: string | null;
  sort: number | null;
  prices: ProductPlanPrice[];
}

export interface ConfigOptionPrice {
  id: string;
  planId: string;
  planName: string;
  billingPeriod: number | null;
  billingUnit: string | null;
  price: number | null;
  setupFee: number | null;
  currencyCode: string;
}

export interface ConfigOptionChoice {
  id: string;
  name: string;
  description: string;
  envVariable: string | null;
  countryCode?: string | null;
  icon?: string | null;
  badge?: string | null;
  hint?: string | null;
  pricing: ConfigOptionPrice[];
}

export interface ConfigOption {
  id: string;
  name: string;
  description: string;
  envVariable: string | null;
  type: string;
  sort: number | null;
  required: boolean;
  children: ConfigOptionChoice[];
}

export interface CheckoutFieldOption {
  value: string;
  label: string;
  countryCode?: string | null;
  icon?: string | null;
  badge?: string | null;
  hint?: string | null;
}

export interface CheckoutField {
  name: string;
  label: string;
  description: string | null;
  type: string;
  required: boolean;
  default: string | number | boolean | null;
  placeholder: string | null;
  options: CheckoutFieldOption[];
  validation: string | string[] | null;
}

export interface VpsMarketplaceOsOption {
  value: string;
  label: string;
  icon?: string | null;
  family?: string | null;
  templateRef: string | null;
  templateUuid: string | null;
}

export interface VpsAppMarketplaceCapability {
  enabled: boolean;
  osFieldName: string;
  hostnameFieldName: string;
  primaryAppFieldName: string;
  addonAppFieldName: string;
  supportedOs: VpsMarketplaceOsOption[];
}

export interface VpsMarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort: number | null;
  searchKeywords: string[];
}

export interface VpsMarketplaceAppCategoryRef {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export interface VpsMarketplaceRecipe {
  id: string;
  osVersion: string | null;
  installStrategy: string | null;
  effectiveInstallStrategy: string | null;
  templateRef: string | null;
  templateAvailable: boolean;
  dependencies: string[];
  conflicts: string[];
  defaultLoginUsername: string | null;
  panelPort: number | null;
  panelPath: string | null;
  panelScheme: string | null;
  panelLabel: string | null;
  allowOnExistingService: boolean;
}

export interface VpsMarketplaceApp {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  type: string;
  tagline: string | null;
  featured: boolean;
  allowOnExistingService: boolean;
  category: VpsMarketplaceAppCategoryRef | null;
  recipe: VpsMarketplaceRecipe | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface VpsAppMarketplace {
  enabled: boolean;
  selectedOs: string | null;
  supportedOs: VpsMarketplaceOsOption[];
  categories: VpsMarketplaceCategory[];
  primaryApps: VpsMarketplaceApp[];
  addonApps: VpsMarketplaceApp[];
  rules: {
    primaryRequired: boolean;
    maxPrimary: number;
    allowAddons: boolean;
  };
  currentSelection: {
    primaryAppSlug: string | null;
    addonAppSlugs: string[];
  };
  compatibility?: {
    mode: 'native' | 'fallback';
    requestedOs: string | null;
    fallbackOs: string | null;
    note: string | null;
  } | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  stock: number | null;
  perUserLimit: number | null;
  allowQuantityMode: string | null;
  category: CategorySummary | null;
  plans: ProductPlan[];
  configOptions: ConfigOption[];
  operatingSystemOptions: ConfigOption[];
  checkoutFields: CheckoutField[];
  vpsAppMarketplace: VpsAppMarketplaceCapability | null;
  countryCode?: string | null;
  regionCode?: string | null;
  selectedOs?: string | null;
  primaryAppSlug?: string | null;
  addonAppSlugs?: string[];
  runtimeKind?: RuntimeKind | null;
}

export interface PriceBreakdown {
  subtotal: number;
  price: number;
  setupFee: number;
  tax: number;
  setupFeeTax: number;
  totalTax: number;
  total: number;
  discount: number;
  currencyCode: string | null;
  currency: CurrencyInfo | null;
  formatted: {
    subtotal: string;
    price: string;
    setupFee: string;
    tax: string;
    total: string;
  };
}

export interface GatewaySummary {
  id: string;
  name: string;
  extension: string;
  type: string | null;
  enabled: boolean;
  description: string | null;
}

export interface CreditBalance {
  amount: number;
  currencyCode: string;
  currency: CurrencyInfo | null;
  formattedAmount: string;
}

export interface CouponSummary {
  id: string;
  code: string;
  type: string | null;
  value: number | null;
  recurring: number | null;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface CartItemSummary {
  id: string;
  quantity: number;
  product: ProductSummary;
  plan: {
    id: string;
    name: string;
    type: string | null;
    billingPeriod: number | null;
    billingUnit: string | null;
  };
  configOptions: Array<{
    optionId: string;
    optionName: string;
    optionType: string;
    optionEnvVariable: string | null;
    value: string | null;
    valueName: string | null;
  }>;
  checkoutConfig: Record<string, unknown>;
  price: PriceBreakdown | null;
}

export interface CartSummary {
  id: string;
  currencyCode: string;
  currency: CurrencyInfo | null;
  items: CartItemSummary[];
  coupon: CouponSummary | null;
  totals: PriceBreakdown | null;
  credits: CreditBalance | null;
  gateways: GatewaySummary[];
}

export interface OperatorOriginSummary {
  capsuleId: string | null;
  capsuleName: string;
  entryKind: string | null;
  stack: string | null;
  businessPath: string | null;
  source: string | null;
  planSummary: string | null;
  previewUrl: string | null;
  productionUrl: string | null;
  repoUrl: string | null;
  bundleUrl: string | null;
  manifestUrl: string | null;
}

export interface ServiceSummary {
  id: string;
  label: string;
  baseLabel: string;
  status: string;
  price: number;
  quantity: number;
  currencyCode: string;
  currency: CurrencyInfo | null;
  formattedPrice: string;
  expiresAt: string | null;
  product: ProductSummary | null;
  plan: {
    id: string;
    name: string;
    type: string | null;
    billingPeriod: number | null;
    billingUnit: string | null;
  } | null;
  cancellable: boolean;
  upgradable: boolean;
  cancellation?: {
    id: string;
    type: string;
    reason: string;
    createdAt: string | null;
  } | null;
  countryCode?: string | null;
  regionCode?: string | null;
  selectedOs?: string | null;
  primaryAppSlug?: string | null;
  addonAppSlugs?: string[];
  runtimeKind?: RuntimeKind | null;
  operatorOrigin?: OperatorOriginSummary | null;
  provisioning?: {
    status: string;
    provider: string;
    attemptCount: number;
    errorMessage: string | null;
    errorCode?: string | null;
    lastAttemptAt: string | null;
    completedAt: string | null;
  } | null;
}

export interface ProvisioningStatus {
  status: string;
  provider: string;
  attemptCount: number;
  errorMessage: string | null;
  errorCode: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
}

export interface ActionResult {
  success: boolean;
  code: string | null;
  detail: string | null;
  operationId: string | null;
}

export type RuntimeKind = 'vps' | 'managed-app' | 'unknown';

export interface RuntimeActionCapabilities {
  start: boolean;
  stop: boolean;
  restart: boolean;
  suspend: boolean;
  unsuspend: boolean;
  reinstall: boolean;
  revealPassword: boolean;
  delete: boolean;
}

export interface RuntimeCapabilities {
  status: boolean;
  logs: boolean;
  actions: RuntimeActionCapabilities;
  env: boolean;
  domain: boolean;
  tls: boolean;
  scale: boolean;
}

export interface ServiceRuntimeSnapshot {
  kind: RuntimeKind;
  contractVersion: string;
  runtimeRef: string | null;
  status: string | null;
  endpoint: string | null;
  lastDeployAt: string | null;
  domain?: string | null;
  tlsStatus?: string | null;
  replicas?: number | null;
  envJson?: string | null;
  managedApp: {
    clusterRef: string | null;
    namespace: string | null;
    workload: string | null;
    service: string | null;
    ingressUrl: string | null;
  } | null;
  vps: {
    serverRef: string | null;
    convoyStatus: string | null;
  } | null;
}

export interface RuntimeOverviewResponse {
  data: {
    status: 'ready' | 'unmapped' | 'provisioning' | 'upstream_unavailable' | 'archived' | 'failed';
    reason: string | null;
    mapped: boolean;
    runtimeKind: RuntimeKind;
    overview: {
      powerState: string | null;
      cpuUsed: number | null;
      memoryUsed: number | null;
      memoryTotal: number | null;
      uptime: number | null;
      node: string | null;
      hostname: string | null;
      primaryIp: string | null;
      operatingSystem: string | null;
    } | null;
    provisioning: ServiceSummary['provisioning'] | null;
    capabilities: RuntimeCapabilities;
  };
  meta: ApiMeta;
}

export interface RuntimeMetricsResponse {
  data: {
    status: 'ready' | 'unmapped' | 'provisioning' | 'upstream_unavailable' | 'archived' | 'failed';
    reason: string | null;
    mapped: boolean;
    runtimeKind: RuntimeKind;
    metrics: {
      diskUsed: number | null;
      diskTotal: number | null;
      rxBytes: number | null;
      txBytes: number | null;
      bandwidthUsage: number | null;
      bandwidthLimit: number | null;
      sampledAt: string | null;
    } | null;
    provisioning: ServiceSummary['provisioning'] | null;
  };
  meta: ApiMeta;
}

export interface ServiceOperationLogSummary {
  id: string;
  operationId: string;
  action: string;
  source: string;
  success: boolean | null;
  code: string | null;
  message: string | null;
  detail: string | null;
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ServiceDetail extends ServiceSummary {
  properties: Array<{
    key: string;
    name: string;
    value: string;
  }>;
  configs: Array<{
    id: string;
    option: {
      id: string;
      name: string;
      envVariable: string | null;
    } | null;
    value: {
      id: string;
      name: string;
      envVariable: string | null;
    } | null;
  }>;
  billingAgreement: {
    id: string;
    ulid: string;
    name: string;
    type: string | null;
    expiry: string | null;
    gateway: GatewaySummary | null;
  } | null;
  cancellation: {
    id: string;
    type: string;
    reason: string;
    createdAt: string | null;
  } | null;
}

export interface ServiceAppInstall {
  id: string;
  source: string;
  status: string;
  isPrimary: boolean;
  installStrategy: string | null;
  requestedOs: string | null;
  attemptCount: number;
  lastError: string | null;
  logs: string[];
  app: {
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string | null;
    type: string;
    tagline: string | null;
    category: VpsMarketplaceAppCategoryRef | null;
  } | null;
  recipe: {
    id: string;
    osVersion: string | null;
    installStrategy: string | null;
    templateRef: string | null;
    panelPort: number | null;
    panelPath: string | null;
    panelScheme: string | null;
    panelLabel: string | null;
    dependencies: string[];
    conflicts: string[];
  } | null;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  responsePayload: Record<string, unknown> | null;
  requestPayload: Record<string, unknown> | null;
  startedAt: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  installedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: string;
  currencyCode: string;
  currency: CurrencyInfo | null;
  total: number;
  remaining: number;
  formattedTotal: string;
  formattedRemaining: string;
  dueAt: string | null;
  createdAt: string | null;
  userName: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  items: Array<{
    id: string;
    description: string;
    price: number;
    quantity: number;
    total: number;
    formattedPrice: string;
    formattedTotal: string;
    referenceType: string | null;
    referenceId: string | null;
  }>;
  transactions: Array<{
    id: string;
    status: string;
    amount: number;
    fee: number;
    transactionId: string | null;
    gateway: GatewaySummary | null;
    isCreditTransaction: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
}

export interface CatalogCategoriesResponse {
  data: CategorySummary[];
  meta: ApiMeta;
}

export interface CatalogProductsResponse {
  data: ProductSummary[];
  pagination: PaginationMeta | null;
  meta: ApiMeta;
}

export interface CatalogCategoryResponse {
  data: {
    category: CategorySummary;
    products: ProductSummary[];
  };
  pagination: PaginationMeta | null;
  meta: ApiMeta;
}

export interface ProductDetailResponse {
  data: ProductDetail;
  meta: ApiMeta;
}

export interface HomeResponse {
  data: {
    stats: Array<{
      label: string;
      value: string;
      hint: string;
    }>;
    featuredProducts: ProductSummary[];
    categories: CategorySummary[];
  };
  meta: ApiMeta;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  avatar: string | null;
  properties: Array<{
    key: string;
    name: string;
    value: string;
  }>;
}

export interface AuthResponse {
  message: string;
  data: {
    user: AuthUser;
  };
}

export interface MeResponse {
  data: {
    user: AuthUser;
  };
}

export interface LogoutResponse {
  message: string;
}

export interface LoginInput {
  email: string;
  password: string;
  code?: string;
  deviceName?: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  deviceName?: string;
}

export interface CartResponse {
  data: CartSummary;
  meta: ApiMeta;
}

export interface CheckoutResponse {
  message: string;
  data: {
    order: {
      id: string;
      currencyCode: string;
      total: number;
      formattedTotal: string;
      services: ServiceSummary[];
    };
    invoice: InvoiceDetail | null;
    redirect: {
      type: string;
      path: string;
    };
  };
  meta: ApiMeta;
}

export interface AffiliateOrderSummary {
  id: string;
  orderId: string | null;
  serviceId: string | null;
  serviceLabel: string | null;
  productName: string | null;
  earnings: Record<string, number>;
  paidInvoicesCount: number;
  lastPaidAt: string | null;
}

export interface AffiliateProfileResponse {
  data: {
    program: {
      defaultReward: number;
      codeType: string;
    };
    affiliate: {
      id: string;
      code: string;
      enabled: boolean;
      visitors: number;
      signups: number;
      validOrders: number;
      reward: number;
      customReward: number | null;
      discount: number | null;
      earnings: Record<string, number>;
      credits: Array<{
        currencyCode: string;
        currencyName: string | null;
        amount: number;
      }>;
      createdAt: string | null;
      updatedAt: string | null;
    } | null;
  };
  meta: ApiMeta;
}

export interface AffiliateOrdersResponse {
  data: {
    items: AffiliateOrderSummary[];
  };
  meta: ApiMeta;
}

export interface ServicesResponse {
  data: ServiceSummary[];
  pagination: PaginationMeta | null;
  meta: ApiMeta;
}

export interface ServiceResponse {
  data: {
    service: ServiceDetail;
    invoices: InvoiceSummary[];
    actions: {
      buttons: Array<Record<string, unknown>>;
      views: Array<Record<string, unknown>>;
      fields: Array<Record<string, unknown>>;
    };
  };
  meta: ApiMeta;
}

export interface VpsAppMarketplaceResponse {
  data: VpsAppMarketplace;
  meta: ApiMeta;
}

export interface ProvisioningJobSummary {
  id: string;
  status: string;
  provider: string;
  attemptCount: number;
  errorMessage: string | null;
  errorCode?: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface ServiceProvisioningResponse {
  data: {
    serviceId: string;
    latest: ProvisioningJobSummary | null;
    history: ProvisioningJobSummary[];
  };
  meta: ApiMeta;
}

export interface ServiceProvisioningRetryResponse {
  message: string;
  data: {
    jobId: string;
    status: string;
    attemptCount: number;
    force?: boolean;
  };
  meta: ApiMeta;
}

export interface ServiceAppsResponse {
  data: {
    serviceId: string;
    selectedOs: string | null;
    primaryAppSlug: string | null;
    addonAppSlugs: string[];
    panelUrl: string | null;
    panelLabel: string | null;
    panelHost: string | null;
    panelPort: number | null;
    panelPath: string | null;
    panelUsername: string | null;
    panelPassword: string | null;
    installs: ServiceAppInstall[];
    catalog: VpsAppMarketplace | null;
  };
  meta: ApiMeta;
}

export interface ServiceAppsInstallResponse {
  message: string;
  data: {
    serviceId: string | null;
    queued: ServiceAppInstall[];
    install: ServiceAppInstall | null;
    apps: ServiceAppsResponse['data'];
  };
  meta: ApiMeta;
}

export interface ServiceAppInstallLogsResponse {
  data: {
    serviceId: string;
    installId: string;
    logs: string[];
  };
  meta: ApiMeta;
}

export interface ServiceRuntimeResponse {
  data: {
    serviceId: string;
    runtime: ServiceRuntimeSnapshot;
    provisioning: ServiceSummary['provisioning'] | null;
    capabilities: RuntimeCapabilities;
    actions: {
      buttons: Array<Record<string, unknown>>;
    };
  };
  meta: ApiMeta;
}

export interface ServiceRuntimeCapabilitiesResponse {
  data: {
    serviceId: string;
    runtimeKind: RuntimeKind;
    runtimeRef: string | null;
    provisioning: ServiceSummary['provisioning'] | null;
    capabilities: RuntimeCapabilities;
    actions: {
      buttons: Array<Record<string, unknown>>;
    };
  };
  meta: ApiMeta;
}

export interface ServiceOperationLogsResponse {
  data: {
    serviceId: string;
    logs: ServiceOperationLogSummary[];
  };
  meta?: ApiMeta;
}

export interface ActionResponse<TData = Record<string, unknown> | null> {
  message: string;
  data: TData;
  actionResult: ActionResult | null;
  meta?: ApiMeta;
}

export interface InvoicesResponse {
  data: InvoiceSummary[];
  pagination: PaginationMeta | null;
  meta: ApiMeta;
}

export interface InvoiceResponse {
  data: {
    invoice: InvoiceDetail;
    gateways: GatewaySummary[];
    paymentMethods: Array<{
      id: string;
      ulid: string;
      name: string;
      type: string | null;
      expiry: string | null;
      gateway: GatewaySummary | null;
    }>;
    recurringServices: ServiceSummary[];
    credits: CreditBalance | null;
  };
  meta: ApiMeta;
}

export interface InvoicePayResponse {
  message: string;
  data: {
    redirectUrl: string | null;
    paymentHtml: string | null;
    invoice: InvoiceDetail | null;
  };
  meta: ApiMeta;
}

export type AssistantActionKind =
  | 'create-launch-capsule'
  | 'create-repo-workspace'
  | 'retry-provisioning'
  | 'restart-runtime'
  | 'stop-runtime'
  | 'sync-runtime'
  | 'check-service-app-status'
  | 'execute-service-playbook'
  | 'install-service-app'
  | 'reveal-server-access'
  | 'cancel-service'
  | 'renew-service'
  | 'delete-runtime'
  | 'handoff-support';

export interface AssistantContext {
  serviceId: string | null;
  invoiceId: string | null;
  capsuleId: string | null;
  path: string | null;
  locale: string | null;
}

export interface AssistantMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AssistantActionRequest {
  kind: AssistantActionKind;
  serviceId: string | null;
  invoiceId: string | null;
  capsuleId?: string | null;
  projectName?: string | null;
  repoUrl?: string | null;
  notes?: string | null;
  idea?: string | null;
  audience?: string | null;
  businessGoal?: string | null;
  planningMode?: 'on' | 'off';
  taskMode?: 'continue' | 'new_turn';
  playbookId?: string | null;
  playbookName?: string | null;
  playbookScript?: string | null;
  appSlug?: string | null;
  appName?: string | null;
  cancellationType?: 'end_of_period' | 'immediate';
  reason?: string | null;
}

export interface AssistantActionProposal {
  id: string;
  title: string;
  description: string;
  risk: 'low' | 'high';
  requiresConfirmation: boolean;
  action: AssistantActionRequest;
}

export interface AssistantPendingConfirmation {
  token: string;
  expiresAt: string;
  proposal: AssistantActionProposal;
}

export type AssistantQuotaTier = 'guest' | 'free' | 'paid' | 'unlimited';

export type AssistantModelCostTier = 'lite' | 'standard' | 'premium' | 'ultra';

export interface AssistantQuotaSnapshot {
  tier: AssistantQuotaTier;
  dailyLimit: number | null;
  dailyTokenLimit: number | null;
  usedPoints: number;
  usedTokens: number;
  remainingPoints: number | null;
  remainingTokens: number | null;
  resetAt: string;
  unlimited: boolean;
}

export interface AssistantUpgradeCta {
  kind: 'login' | 'catalog' | 'unlimited';
  href: string;
  label: string;
  description: string;
}

export interface AssistantSessionPayload {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  context: AssistantContext;
  messages: AssistantMessage[];
}

export interface AssistantCapabilitiesResponse {
  message: string;
  data: {
    enabled: boolean;
    primaryProvider: string;
    providers: string[];
    configuredProviders: string[];
    selectableModels: Array<{
      id: string;
      provider: string;
      model: string;
      resolvedModelId: string;
      label: string;
      isPrimary: boolean;
      costPoints: number;
      routingWeight: number;
      costTier: AssistantModelCostTier;
    }>;
    models: Array<{
      id: string;
      provider: string;
      model: string;
      resolvedModelId: string;
      label: string;
      isPrimary: boolean;
      costPoints: number;
      routingWeight: number;
      costTier: AssistantModelCostTier;
    }>;
    defaultModelId: string | null;
    responseMode: 'llm' | 'fallback';
    mode: string;
    quota: AssistantQuotaSnapshot;
    upgradeCta: AssistantUpgradeCta | null;
    policies: {
      lowRiskAuto: boolean;
      highRiskRequireConfirmation: boolean;
    };
    tools: {
      readOnly: string[];
      lowRisk: string[];
      highRisk: string[];
    };
  };
}

export interface AssistantSessionResponse {
  message: string;
  data: {
    session: AssistantSessionPayload;
    authenticated: boolean;
    user: {
      id: string;
      name: string;
      email: string;
    } | null;
    capabilities: AssistantCapabilitiesResponse['data'];
    quota: AssistantQuotaSnapshot;
    upgradeCta: AssistantUpgradeCta | null;
  };
}

export interface AssistantProviderStatusResponse {
  message: string;
  data: {
    enabled: boolean;
    checkedAt: string;
    primaryProvider: string;
    activeProvider: string | null;
    activeModel: string | null;
    providerConfigured: boolean;
    credentialsPresent: boolean;
    networkReachable: boolean;
    modelReachable: boolean;
    responseMode: 'llm' | 'fallback';
    canRun: boolean;
    reason: string;
    providerResults: Array<{
      provider: string;
      model: string | null;
      baseUrl: string | null;
      providerConfigured: boolean;
      credentialsPresent: boolean;
      networkReachable: boolean;
      modelReachable: boolean;
      canRun: boolean;
      httpStatus: number | null;
      reason: string;
    }>;
  };
}

export interface AssistantMessagesResponse {
  message: string;
  data: {
    session: AssistantSessionPayload;
    authenticated: boolean;
    reply: AssistantMessage;
    runState:
      | 'draft'
      | 'parsing'
      | 'preflight'
      | 'llm_planning'
      | 'awaiting_confirmation'
      | 'queued'
      | 'running'
      | 'verifying'
      | 'partial_success'
      | 'success'
      | 'blocked'
      | 'failed'
      | 'rolled_back';
    source: 'llm' | 'system' | 'preflight' | 'mock';
    proposals: AssistantActionProposal[];
    pendingConfirmation: AssistantPendingConfirmation | null;
    actionResult: {
      message: string;
      code: string;
      detail: string | null;
      operationId: string | null;
      data: Record<string, unknown> | null;
    } | null;
    workflow: OperatorWorkflowState | null;
    workspace: {
      capsuleId: string;
      capsulePath: string | null;
      capsuleUrl: string | null;
      workflowStage: string | null;
    } | null;
    quota: AssistantQuotaSnapshot;
    upgradeCta: AssistantUpgradeCta | null;
    chargedTokens: number;
    inputTokens: number;
    outputTokens: number;
    resolvedModelId: string;
    routing: {
      route: string;
      lane: string | null;
      source: string | null;
      reason: string;
    } | null;
  };
}

export interface AssistantConfirmResponse {
  message: string;
  data: {
    session: AssistantSessionPayload;
    authenticated: boolean;
    reply: AssistantMessage;
    runState:
      | 'draft'
      | 'parsing'
      | 'preflight'
      | 'llm_planning'
      | 'awaiting_confirmation'
      | 'queued'
      | 'running'
      | 'verifying'
      | 'partial_success'
      | 'success'
      | 'blocked'
      | 'failed'
      | 'rolled_back';
    source: 'llm' | 'system' | 'preflight' | 'mock';
    actionResult: {
      message: string;
      code: string;
      detail: string | null;
      operationId: string | null;
      data: Record<string, unknown> | null;
    } | null;
    workflow: OperatorWorkflowState | null;
    workspace: {
      capsuleId: string;
      capsulePath: string | null;
      capsuleUrl: string | null;
      workflowStage: string | null;
    } | null;
    quota: AssistantQuotaSnapshot;
    upgradeCta: AssistantUpgradeCta | null;
    routing: {
      route: string;
      lane: string | null;
      source: string | null;
      reason: string;
    } | null;
  };
}
