export type SourceMode = 'mock' | 'live';

export interface ApiMeta {
  generatedAt: string;
  sourceMode: SourceMode;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  heroMetric: string;
  regionTags: string[];
  productCount: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  name: string;
  tagline: string;
  description: string;
  image: string | null;
  startingPrice: number | null;
  currency: string;
  billingLabel: string;
  stockLabel: string;
  featured: boolean;
  highlights: string[];
  regionTags: string[];
}

export interface ProductPlan {
  id: string;
  name: string;
  cycleLabel: string;
  price: number | null;
  setupFee: number | null;
  currency: string;
}

export interface ConfigChoice {
  id: string;
  label: string;
  description?: string;
  priceDelta?: number;
}

export interface ConfigOption {
  id: string;
  name: string;
  type: 'select' | 'radio' | 'checkbox' | 'text';
  required: boolean;
  description: string;
  defaultValue?: string | boolean | null;
  choices?: ConfigChoice[];
}

export interface ProductDetail extends ProductSummary {
  sourceMode: SourceMode;
  plans: ProductPlan[];
  features: string[];
  purchaseNotes: string[];
  configurableOptions: ConfigOption[];
}

export interface CategoryDetail extends CategorySummary {
  products: ProductSummary[];
}

export interface HomeStat {
  label: string;
  value: string;
  hint: string;
}

export interface HomeResponse {
  brand: {
    name: string;
    subtitle: string;
    statement: string;
  };
  stats: HomeStat[];
  featuredProducts: ProductSummary[];
  categories: CategorySummary[];
  meta: ApiMeta;
}

export interface CatalogResponse {
  categories: CategorySummary[];
  products: ProductSummary[];
  meta: ApiMeta;
}

export interface ServiceProperty {
  key: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface ServiceAction {
  id: string;
  label: string;
  kind: 'primary' | 'secondary' | 'danger';
  enabled: boolean;
  description: string;
}

export interface ServiceDetail {
  id: string;
  label: string;
  status: 'active' | 'pending' | 'suspended' | 'cancelled' | 'unknown';
  productName: string;
  productSlug?: string;
  price: number | null;
  currency: string;
  billingCycleLabel: string;
  renewalAt: string | null;
  location: string;
  description: string;
  network: {
    ipv4: string[];
    ipv6: string[];
    rdns: string | null;
  };
  properties: ServiceProperty[];
  actions: ServiceAction[];
  sourceMode: SourceMode;
}

export interface JsonApiRelationshipPointer {
  id: string;
  type: string;
}

export interface JsonApiResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: JsonApiRelationshipPointer | JsonApiRelationshipPointer[] | null }>;
}

export interface JsonApiDocument {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
}

