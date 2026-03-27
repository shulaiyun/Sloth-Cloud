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
  allowQuantity: boolean;
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

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  stock: number | null;
  perUserLimit: number | null;
  allowQuantity: boolean;
  category: CategorySummary | null;
  plans: ProductPlan[];
  configOptions: ConfigOption[];
  operatingSystemOptions: ConfigOption[];
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
    brand: {
      name: string;
      subtitle: string;
      statement: string;
    };
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
    accessToken: string;
    tokenType: string;
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
