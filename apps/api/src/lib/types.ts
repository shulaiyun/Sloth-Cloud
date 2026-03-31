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
}

export interface ProductCategoryRef {
  id: string;
  slug: string;
  name: string;
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

export interface ServiceProperty {
  key: string;
  name: string;
  value: string;
}

export interface ServiceConfigEntry {
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
}

export interface BillingAgreementSummary {
  id: string;
  ulid: string;
  name: string;
  type: string | null;
  expiry: string | null;
  gateway: GatewaySummary | null;
}

export interface ServiceCancellationSummary {
  id: string;
  type: string;
  reason: string;
  createdAt: string | null;
}

export interface ProvisioningStatus {
  status: string;
  provider: string;
  attemptCount: number;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
}

export interface ProvisioningJobSummary extends ProvisioningStatus {
  id: string;
  createdAt: string | null;
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
  provisioning: ProvisioningStatus | null;
}

export interface ServiceDetail extends ServiceSummary {
  properties: ServiceProperty[];
  configs: ServiceConfigEntry[];
  billingAgreement: BillingAgreementSummary | null;
  cancellation: ServiceCancellationSummary | null;
}

export interface InvoiceItemSummary {
  id: string;
  description: string;
  price: number;
  quantity: number;
  total: number;
  formattedPrice: string;
  formattedTotal: string;
  referenceType: string | null;
  referenceId: string | null;
}

export interface InvoiceTransactionSummary {
  id: string;
  status: string;
  amount: number;
  fee: number;
  transactionId: string | null;
  gateway: GatewaySummary | null;
  isCreditTransaction: boolean;
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
  items: InvoiceItemSummary[];
  transactions: InvoiceTransactionSummary[];
}

export interface CatalogCategoriesResponse {
  data: CategorySummary[];
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

export interface CatalogProductsResponse {
  data: ProductSummary[];
  pagination: PaginationMeta | null;
  meta: ApiMeta;
}

export interface ProductDetailResponse {
  data: ProductDetail;
  meta: ApiMeta;
}

export interface HomeStat {
  label: string;
  value: string;
  hint: string;
}

export interface HomeResponse {
  data: {
    stats: HomeStat[];
    featuredProducts: ProductSummary[];
    categories: CategorySummary[];
  };
  meta: ApiMeta;
}

export interface AuthUserProperty {
  key: string;
  name: string;
  value: string;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  avatar: string | null;
  properties: AuthUserProperty[];
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
  };
  meta: ApiMeta;
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
    paymentMethods: BillingAgreementSummary[];
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
