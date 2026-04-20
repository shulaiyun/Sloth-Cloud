import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { useAuth } from '../lib/auth-context';
import type { Locale } from '../lib/content';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import { billingCycleLabel, getUiText, productLineFor, productLineLabel } from '../lib/ui-text';
import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import {
  getAppVisual,
  getOsVisual,
  isBandwidthField,
  isHostnameField,
  isIpCountField,
  isLocationField,
  isPasswordConfirmationField,
  isPasswordField,
  isTrafficField,
  maskSensitiveValue,
  optionValueToText,
  parseNodeOption,
} from '../lib/visual-metadata';
import type {
  CheckoutField,
  ConfigOption,
  ProductDetailResponse,
  VpsAppMarketplaceResponse,
  VpsMarketplaceApp,
  VpsMarketplaceOsOption,
} from '../lib/types';

type LocaleLanguage = 'zh' | 'en' | 'ja' | 'ko';
type LocalizedMessage = {
  zh: string;
  en: string;
  ja: string;
  ko: string;
};

const managedCheckoutFieldLabels: Record<string, LocalizedMessage> = {
  git_repo_url: {
    zh: '公开 Git 仓库地址',
    en: 'Public Git repository URL',
    ja: '公開 Git リポジトリ URL',
    ko: '공개 Git 저장소 URL',
  },
  git_branch: {
    zh: 'Git 分支',
    en: 'Git branch',
    ja: 'Git ブランチ',
    ko: 'Git 브랜치',
  },
  git_context_dir: {
    zh: '构建上下文目录',
    en: 'Build context directory',
    ja: 'ビルドコンテキストディレクトリ',
    ko: '빌드 컨텍스트 디렉터리',
  },
  dockerfile_path: {
    zh: 'Dockerfile 路径',
    en: 'Dockerfile path',
    ja: 'Dockerfile パス',
    ko: 'Dockerfile 경로',
  },
  compose_file_path: {
    zh: 'Compose 文件路径（可选）',
    en: 'Compose file path (optional)',
    ja: 'Compose ファイルパス（任意）',
    ko: 'Compose 파일 경로(선택)',
  },
  compose_service_name: {
    zh: 'Compose 服务名（可选）',
    en: 'Compose service name (optional)',
    ja: 'Compose サービス名（任意）',
    ko: 'Compose 서비스 이름(선택)',
  },
  runtime_port: {
    zh: '运行端口',
    en: 'Runtime port',
    ja: 'ランタイムポート',
    ko: '런타임 포트',
  },
  domain_limit: {
    zh: '域名数量上限',
    en: 'Domain limit',
    ja: 'ドメイン上限',
    ko: '도메인 개수 한도',
  },
  env_var_limit: {
    zh: '环境变量数量上限',
    en: 'Environment variable limit',
    ja: '環境変数上限',
    ko: '환경 변수 개수 한도',
  },
  log_retention_days: {
    zh: '日志保留天数',
    en: 'Log retention days',
    ja: 'ログ保持日数',
    ko: '로그 보관 일수',
  },
  allow_scaling: {
    zh: '允许扩容',
    en: 'Allow scaling',
    ja: 'スケーリング許可',
    ko: '스케일링 허용',
  },
  env_vars: {
    zh: '环境变量（JSON）',
    en: 'Environment variables (JSON)',
    ja: '環境変数（JSON）',
    ko: '환경 변수(JSON)',
  },
  persistent_storage_size: {
    zh: '持久化存储大小',
    en: 'Persistent storage size',
    ja: '永続ストレージ容量',
    ko: '영구 스토리지 용량',
  },
  replica_limit: {
    zh: '副本数量上限',
    en: 'Replica limit',
    ja: 'レプリカ上限',
    ko: '복제본 한도',
  },
  workload_mode: {
    zh: '运行模式',
    en: 'Workload mode',
    ja: 'ワークロードモード',
    ko: '워크로드 모드',
  },
  initial_domain: {
    zh: '初始域名',
    en: 'Initial domain',
    ja: '初期ドメイン',
    ko: '초기 도메인',
  },
  hostname: {
    zh: '主机名',
    en: 'Hostname',
    ja: 'ホスト名',
    ko: '호스트명',
  },
};

const managedCheckoutFieldPlaceholders: Record<string, LocalizedMessage> = {
  git_repo_url: {
    zh: 'https://github.com/your-org/your-repo.git',
    en: 'https://github.com/your-org/your-repo.git',
    ja: 'https://github.com/your-org/your-repo.git',
    ko: 'https://github.com/your-org/your-repo.git',
  },
  git_branch: {
    zh: 'main',
    en: 'main',
    ja: 'main',
    ko: 'main',
  },
  git_context_dir: {
    zh: '/',
    en: '/',
    ja: '/',
    ko: '/',
  },
  dockerfile_path: {
    zh: 'Dockerfile',
    en: 'Dockerfile',
    ja: 'Dockerfile',
    ko: 'Dockerfile',
  },
  compose_file_path: {
    zh: 'docker-compose.yml',
    en: 'docker-compose.yml',
    ja: 'docker-compose.yml',
    ko: 'docker-compose.yml',
  },
  compose_service_name: {
    zh: 'web',
    en: 'web',
    ja: 'web',
    ko: 'web',
  },
  env_vars: {
    zh: '{"PORT":"3000"}',
    en: '{"PORT":"3000"}',
    ja: '{"PORT":"3000"}',
    ko: '{"PORT":"3000"}',
  },
};

function localeLanguage(locale: Locale): LocaleLanguage {
  const language = locale.toLowerCase().split('-')[0];
  if (language === 'zh' || language === 'ja' || language === 'ko') {
    return language;
  }

  return 'en';
}

function localizeMessage(locale: Locale, message: LocalizedMessage) {
  const language = localeLanguage(locale);
  if (language === 'zh') return message.zh;
  if (language === 'ja') return message.ja;
  if (language === 'ko') return message.ko;
  return message.en;
}

const strongServerPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,50}$/;

function validateStrongServerPassword(password: string, locale: Locale) {
  const trimmed = password.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length < 8 || trimmed.length > 50) {
    return localizeMessage(locale, {
      zh: '自定义密码必须为 8-50 位。',
      en: 'Custom password must be 8-50 characters long.',
      ja: 'カスタムパスワードは 8〜50 文字で入力してください。',
      ko: '사용자 지정 비밀번호는 8~50자여야 합니다.',
    });
  }

  if (!strongServerPasswordPattern.test(trimmed)) {
    return localizeMessage(locale, {
      zh: '自定义密码必须至少包含 1 个大写字母、1 个小写字母、1 个数字和 1 个特殊字符。',
      en: 'Custom password must include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.',
      ja: 'カスタムパスワードには大文字・小文字・数字・記号をそれぞれ 1 文字以上含めてください。',
      ko: '사용자 지정 비밀번호에는 대문자, 소문자, 숫자, 특수문자가 각각 1개 이상 포함되어야 합니다.',
    });
  }

  return null;
}

function normalizeFieldToken(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function checkoutFieldKeys(field: CheckoutField) {
  const byName = normalizeFieldToken(field.name);
  const byLabel = normalizeFieldToken(field.label);
  return [...new Set([byName, byLabel].filter((item) => item.length > 0))];
}

function localizeCheckoutFieldLabel(field: CheckoutField, locale: Locale) {
  for (const key of checkoutFieldKeys(field)) {
    const mapped = managedCheckoutFieldLabels[key];
    if (mapped) {
      return localizeMessage(locale, mapped);
    }
  }

  return localizeText(field.label, locale, field.name);
}

function localizeCheckoutFieldPlaceholder(field: CheckoutField, locale: Locale) {
  for (const key of checkoutFieldKeys(field)) {
    const mapped = managedCheckoutFieldPlaceholders[key];
    if (mapped) {
      return localizeMessage(locale, mapped);
    }
  }

  return localizeText(field.placeholder, locale, field.placeholder ?? '');
}

function localizeCheckoutOptionLabel(
  field: CheckoutField,
  option: { value: string; label: string },
  locale: Locale,
  yesLabel: string,
  noLabel: string,
) {
  const fieldKey = checkoutFieldKeys(field)[0] ?? '';
  const optionValue = option.value.trim().toLowerCase();

  if (fieldKey === 'workload_mode') {
    if (optionValue === 'deployment') {
      return localizeMessage(locale, {
        zh: 'Deployment（无状态）',
        en: 'Deployment (stateless)',
        ja: 'Deployment（ステートレス）',
        ko: 'Deployment(무상태)',
      });
    }

    if (optionValue === 'statefulset') {
      return localizeMessage(locale, {
        zh: 'StatefulSet（有状态）',
        en: 'StatefulSet (stateful)',
        ja: 'StatefulSet（ステートフル）',
        ko: 'StatefulSet(상태 유지)',
      });
    }
  }

  if (fieldKey === 'allow_scaling') {
    if (['1', 'true', 'yes', 'on'].includes(optionValue)) {
      return yesLabel;
    }
    if (['0', 'false', 'no', 'off'].includes(optionValue)) {
      return noLabel;
    }
  }

  return localizeText(option.label, locale, option.value);
}

function resolveOptionPricing(
  choice: ConfigOption['children'][number] | undefined,
  plan: ProductDetailResponse['data']['plans'][number] | undefined,
) {
  if (!choice || !plan) {
    return null;
  }

  return choice.pricing.find((entry) => entry.planId === plan.id)
    ?? choice.pricing.find((entry) => (
      entry.billingPeriod === plan.billingPeriod
      && entry.billingUnit === plan.billingUnit
    ))
    ?? null;
}

function optionDelta(
  option: ConfigOption,
  currentValue: string | null | undefined,
  plan: ProductDetailResponse['data']['plans'][number] | undefined,
) {
  if (!plan || option.children.length === 0) {
    return 0;
  }

  const selected = option.children.find((item) => item.id === currentValue);
  const pricing = resolveOptionPricing(selected, plan);

  return pricing?.price ?? 0;
}

function checkoutFieldDelta(
  field: CheckoutField,
  value: CheckoutFormValue | undefined,
  currencyCode: string,
) {
  if (field.type !== 'select') {
    return null;
  }

  const normalizedValue = checkoutStringValue(value);
  const selected = field.options.find((option) => option.value === normalizedValue);
  if (!selected) {
    return null;
  }

  const hint = `${selected.badge ?? selected.hint ?? ''}`.trim();
  return {
    selected,
    currencyCode,
    hint: hint.length > 0 ? hint : null,
  };
}

function optionCardPrice(
  choice: ConfigOption['children'][number],
  plan: ProductDetailResponse['data']['plans'][number] | undefined,
  currencyCode: string,
  formatMoney: (value: number | null, currency: string) => string,
) {
  const selectedPricing = resolveOptionPricing(choice, plan);
  if (!selectedPricing) {
    return null;
  }

  return formatMoney(selectedPricing.price ?? 0, selectedPricing.currencyCode || currencyCode);
}

function isOptionSelectable(option: ConfigOption) {
  return ['select', 'radio'].includes(option.type);
}

function normalizeCheckoutValue(field: CheckoutField, value: string) {
  if (field.type === 'number') {
    return value.length > 0 ? Number(value) : null;
  }

  if (field.type === 'checkbox') {
    return value === '1';
  }

  return value;
}

type CheckoutFormValue = string | string[];

function defaultCheckoutFieldValue(field: CheckoutField): CheckoutFormValue {
  if (field.type === 'multiselect' || field.type === 'json-array') {
    return Array.isArray(field.default)
      ? field.default.map((entry) => String(entry))
      : [];
  }

  if (field.default === null || field.default === undefined) {
    return '';
  }

  return String(field.default);
}

function checkoutStringValue(value: CheckoutFormValue | undefined) {
  return typeof value === 'string' ? value : '';
}

function checkoutArrayValue(value: CheckoutFormValue | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizeCheckoutFieldValue(field: CheckoutField, value: CheckoutFormValue) {
  if (field.type === 'multiselect' || field.type === 'json-array') {
    return Array.isArray(value) ? value : [];
  }

  return normalizeCheckoutValue(field, checkoutStringValue(value));
}

function trimUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function resolveMarketplaceSelection(
  primaryApps: VpsMarketplaceApp[],
  addonApps: VpsMarketplaceApp[],
  requestedPrimarySlug: string | null,
  requestedAddonSlugs: string[],
) {
  const primaryMap = new Map(primaryApps.map((app) => [app.slug, app]));
  const addonMap = new Map(addonApps.map((app) => [app.slug, app]));
  const allMap = new Map([...primaryApps, ...addonApps].map((app) => [app.slug, app]));

  let primarySlug = requestedPrimarySlug?.trim() || null;
  const resolvedAddons: string[] = [];
  const queue = [...trimUnique(requestedAddonSlugs)];

  const primary = primarySlug ? primaryMap.get(primarySlug) ?? null : null;
  if (primarySlug && (!primary || !primary.available)) {
    return {
      primarySlug,
      addonSlugs: resolvedAddons,
      error: primary?.unavailableReason ?? 'Selected primary app is unavailable for this OS.',
    };
  }

  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug || resolvedAddons.includes(slug)) {
      continue;
    }

    const addon = addonMap.get(slug);
    if (!addon) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: `Addon ${slug} is not available for the current OS.`,
      };
    }

    if (!addon.available) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: addon.unavailableReason ?? `Addon ${slug} is currently unavailable.`,
      };
    }

    resolvedAddons.push(slug);

    for (const dependencySlug of addon.recipe?.dependencies ?? []) {
      const dependency = allMap.get(dependencySlug);
      if (!dependency) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Addon ${slug} depends on unavailable app ${dependencySlug}.`,
        };
      }

      if (dependency.type === 'main') {
        if (primarySlug && primarySlug !== dependencySlug) {
          return {
            primarySlug,
            addonSlugs: resolvedAddons,
            error: `Addon ${slug} requires primary app ${dependencySlug}.`,
          };
        }

        primarySlug = dependencySlug;
        continue;
      }

      if (!resolvedAddons.includes(dependencySlug) && !queue.includes(dependencySlug)) {
        queue.push(dependencySlug);
      }
    }
  }

  const universe = new Set<string>([
    ...(primarySlug ? [primarySlug] : []),
    ...resolvedAddons,
  ]);

  if (primarySlug) {
    const primaryApp = primaryMap.get(primarySlug);
    if (!primaryApp) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: `Primary app ${primarySlug} is not available.`,
      };
    }

    for (const conflict of primaryApp.recipe?.conflicts ?? []) {
      if (universe.has(conflict)) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Primary app ${primarySlug} conflicts with ${conflict}.`,
        };
      }
    }
  }

  for (const addonSlug of resolvedAddons) {
    const addon = addonMap.get(addonSlug);
    if (!addon) {
      continue;
    }

    for (const conflict of addon.recipe?.conflicts ?? []) {
      if (universe.has(conflict)) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Addon ${addonSlug} conflicts with ${conflict}.`,
        };
      }
    }
  }

  return {
    primarySlug,
    addonSlugs: resolvedAddons,
    error: null,
  };
}

type ResourceBudget = {
  cpuCores: number;
  memoryGb: number;
};

type ResourceUsage = {
  cpuCores: number;
  memoryGb: number;
};

const primaryAppLoadProfile: Record<string, ResourceUsage> = {
  '1panel': { cpuCores: 0.7, memoryGb: 0.9 },
  'aapanel': { cpuCores: 0.9, memoryGb: 1.2 },
  'portainer': { cpuCores: 0.6, memoryGb: 0.7 },
  'coolify': { cpuCores: 1.3, memoryGb: 1.8 },
  'casaos': { cpuCores: 0.5, memoryGb: 0.7 },
};

const addonLoadProfile: Record<string, ResourceUsage> = {
  'docker-ce': { cpuCores: 0.5, memoryGb: 0.7 },
  'docker-compose': { cpuCores: 0.2, memoryGb: 0.2 },
  'uptime-kuma': { cpuCores: 0.35, memoryGb: 0.5 },
  nginx: { cpuCores: 0.35, memoryGb: 0.4 },
  openresty: { cpuCores: 0.45, memoryGb: 0.5 },
  caddy: { cpuCores: 0.3, memoryGb: 0.35 },
  mysql: { cpuCores: 0.7, memoryGb: 1.1 },
  mariadb: { cpuCores: 0.65, memoryGb: 1.0 },
  postgresql: { cpuCores: 0.8, memoryGb: 1.2 },
  redis: { cpuCores: 0.4, memoryGb: 0.6 },
  mongodb: { cpuCores: 0.9, memoryGb: 1.4 },
  nodejs: { cpuCores: 0.4, memoryGb: 0.4 },
  python: { cpuCores: 0.4, memoryGb: 0.5 },
  java: { cpuCores: 0.9, memoryGb: 1.6 },
};

const defaultPrimaryLoad: ResourceUsage = { cpuCores: 0.7, memoryGb: 1.0 };
const defaultAddonLoad: ResourceUsage = { cpuCores: 0.3, memoryGb: 0.35 };

function parseResourceBudget(productLabel: string, productSlug: string): ResourceBudget | null {
  const normalized = `${productLabel} ${productSlug}`.toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  const compactMatch = compact.match(/(\d+(?:\.\d+)?)c(\d+(?:\.\d+)?)g/);
  if (compactMatch) {
    return {
      cpuCores: Number(compactMatch[1]),
      memoryGb: Number(compactMatch[2]),
    };
  }

  const cpuMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:c|vcpu|core|cores|核)/);
  const memoryMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:g|gb)\s*(?:ram|memory|内存)/);
  if (!cpuMatch || !memoryMatch) {
    return null;
  }

  return {
    cpuCores: Number(cpuMatch[1]),
    memoryGb: Number(memoryMatch[1]),
  };
}

function estimateSelectionLoad(primarySlug: string | null, addonSlugs: string[]) {
  const primary = primarySlug
    ? (primaryAppLoadProfile[primarySlug] ?? defaultPrimaryLoad)
    : { cpuCores: 0, memoryGb: 0 };
  const addonTotal = addonSlugs.reduce<ResourceUsage>((sum, slug) => {
    const profile = addonLoadProfile[slug] ?? defaultAddonLoad;
    return {
      cpuCores: sum.cpuCores + profile.cpuCores,
      memoryGb: sum.memoryGb + profile.memoryGb,
    };
  }, { cpuCores: 0, memoryGb: 0 });

  return {
    cpuCores: primary.cpuCores + addonTotal.cpuCores,
    memoryGb: primary.memoryGb + addonTotal.memoryGb,
  };
}

export function ProductPage() {
  const { productSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { text, formatMoney, locale } = useSite();
  const ui = getUiText(locale);
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<ProductDetailResponse>(
    productSlug ? `/api/v1/catalog/products/${productSlug}` : null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [formState, setFormState] = useState<Record<string, string | null>>({});
  const [checkoutForm, setCheckoutForm] = useState<Record<string, CheckoutFormValue>>({});
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [marketplaceCategory, setMarketplaceCategory] = useState('all');
  const [marketplaceHint, setMarketplaceHint] = useState<string | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const product = data?.data ?? null;
  const productLine = productLineFor(product?.category?.slug, product?.slug);
  const shouldRedirectManagedProduct = productLineFor(undefined, productSlug) === 'managed-app'
    || productLine === 'managed-app';
  if (shouldRedirectManagedProduct) {
    return <Navigate replace to="/operator" />;
  }
  const vpsMarketplaceCapability = product?.vpsAppMarketplace ?? null;
  const osFieldName = vpsMarketplaceCapability?.osFieldName ?? 'os';
  const hostnameFieldName = vpsMarketplaceCapability?.hostnameFieldName ?? 'hostname';
  const primaryAppFieldName = vpsMarketplaceCapability?.primaryAppFieldName ?? 'primary_app_slug';
  const addonAppFieldName = vpsMarketplaceCapability?.addonAppFieldName ?? 'addon_app_slugs';
  const selectedMarketplaceOs = checkoutStringValue(checkoutForm[osFieldName])
    || vpsMarketplaceCapability?.supportedOs[0]?.value
    || '';
  const { data: vpsMarketData, error: vpsMarketError, loading: vpsMarketLoading } = useApiData<VpsAppMarketplaceResponse>(
    productLine === 'vps' && productSlug && selectedMarketplaceOs
      ? `/api/v1/catalog/products/${productSlug}/vps-app-market?os=${encodeURIComponent(selectedMarketplaceOs)}`
      : null,
  );
  const vpsMarket = vpsMarketData?.data ?? null;
  const selectedPrimaryApp = checkoutStringValue(checkoutForm[primaryAppFieldName]) || null;
  const selectedAddonApps = checkoutArrayValue(checkoutForm[addonAppFieldName]);
  const extraOptions = useMemo(() => {
    if (!product) {
      return [];
    }

    const operatingSystemIds = new Set(product.operatingSystemOptions.map((option) => option.id));
    return product.configOptions.filter((option) => !operatingSystemIds.has(option.id));
  }, [product]);

  const passwordField = useMemo(
    () => product?.checkoutFields.find((field) => isPasswordField(field)) ?? null,
    [product],
  );
  const passwordConfirmationField = useMemo(
    () => product?.checkoutFields.find((field) => isPasswordConfirmationField(field)) ?? null,
    [product],
  );
  const hostnameField = useMemo(
    () => product?.checkoutFields.find((field) => isHostnameField(field)) ?? null,
    [product],
  );

  useEffect(() => {
    if (!product) {
      return;
    }

    setSelectedPlanId(product.plans[0]?.id ?? '');
    setFormState(Object.fromEntries(
      product.configOptions
        .filter(isOptionSelectable)
        .map((option) => [option.id, option.children[0]?.id ?? null]),
    ));
    setCheckoutForm(Object.fromEntries(
      product.checkoutFields.map((field) => [field.name, defaultCheckoutFieldValue(field)]),
    ));
    setMarketplaceCategory('all');
    setMarketplaceSearch('');
    setMarketplaceHint(null);
    setCustomPassword('');
    setPasswordConfirmation('');
  }, [product]);

  useEffect(() => {
    if (!vpsMarketplaceCapability?.enabled) {
      return;
    }

    setCheckoutForm((state) => {
      const next = { ...state };
      if (!checkoutStringValue(next[osFieldName])) {
        next[osFieldName] = vpsMarketplaceCapability.supportedOs[0]?.value ?? '';
      }
      if (!Array.isArray(next[addonAppFieldName])) {
        next[addonAppFieldName] = [];
      }
      if (typeof next[primaryAppFieldName] !== 'string') {
        next[primaryAppFieldName] = '';
      }
      if (typeof next[hostnameFieldName] !== 'string') {
        next[hostnameFieldName] = '';
      }
      return next;
    });
  }, [addonAppFieldName, hostnameFieldName, osFieldName, primaryAppFieldName, vpsMarketplaceCapability]);

  useEffect(() => {
    if (!vpsMarket) {
      return;
    }

    const resolved = resolveMarketplaceSelection(
      vpsMarket.primaryApps,
      vpsMarket.addonApps,
      selectedPrimaryApp,
      selectedAddonApps,
    );

    if (resolved.error) {
      setMarketplaceHint(resolved.error);
    } else {
      const autoAdded = resolved.addonSlugs.filter((slug) => !selectedAddonApps.includes(slug));
      const autoPrimary = resolved.primarySlug && resolved.primarySlug !== selectedPrimaryApp
        ? resolved.primarySlug
        : null;

      if (autoPrimary || autoAdded.length > 0) {
        const hints = [
          autoPrimary ? `已自动选择主应用 ${autoPrimary}` : null,
          autoAdded.length > 0 ? `已自动补齐依赖：${autoAdded.join(', ')}` : null,
        ].filter((entry): entry is string => Boolean(entry));
        setMarketplaceHint(hints.join('；'));
      } else {
        setMarketplaceHint(null);
      }
    }

    const normalizedPrimary = resolved.error ? selectedPrimaryApp ?? '' : (resolved.primarySlug ?? '');
    const normalizedAddons = resolved.error ? selectedAddonApps : resolved.addonSlugs;

    if (
      normalizedPrimary !== checkoutStringValue(checkoutForm[primaryAppFieldName])
      || normalizedAddons.join('|') !== checkoutArrayValue(checkoutForm[addonAppFieldName]).join('|')
    ) {
      setCheckoutForm((state) => ({
        ...state,
        [primaryAppFieldName]: normalizedPrimary,
        [addonAppFieldName]: normalizedAddons,
      }));
    }
  }, [
    addonAppFieldName,
    checkoutForm,
    primaryAppFieldName,
    selectedAddonApps,
    selectedPrimaryApp,
    vpsMarket,
  ]);

  const selectedPlan = useMemo(
    () => product?.plans.find((plan) => plan.id === selectedPlanId) ?? product?.plans[0],
    [product, selectedPlanId],
  );

  const total = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }

    const basePrice = selectedPlan.prices[0]?.price ?? 0;
    const configTotal = product?.configOptions.reduce((sum, option) => {
      return sum + optionDelta(option, formState[option.id], selectedPlan);
    }, 0) ?? 0;

    return basePrice + configTotal;
  }, [formState, product, selectedPlan]);

  const marketplaceTabs = useMemo(() => {
    if (!vpsMarket) {
      return [];
    }

    return [
      { slug: 'all', name: locale.startsWith('zh') ? '全部应用' : 'All apps' },
      ...vpsMarket.categories.map((category) => ({
        slug: category.slug,
        name: category.name,
      })),
    ];
  }, [locale, vpsMarket]);

  const marketplaceSearchToken = marketplaceSearch.trim().toLowerCase();

  const filteredPrimaryApps = useMemo(() => {
    if (!vpsMarket) {
      return [];
    }

    return vpsMarket.primaryApps.filter((app) => {
      const inCategory = marketplaceCategory === 'all' || app.category?.slug === marketplaceCategory;
      if (!inCategory) {
        return false;
      }

      if (marketplaceSearchToken.length === 0) {
        return true;
      }

      const haystack = [
        app.name,
        app.slug,
        app.description,
        app.tagline ?? '',
        app.category?.name ?? '',
      ].join(' ').toLowerCase();

      return haystack.includes(marketplaceSearchToken);
    });
  }, [marketplaceCategory, marketplaceSearchToken, vpsMarket]);

  const filteredAddonApps = useMemo(() => {
    if (!vpsMarket) {
      return [];
    }

    return vpsMarket.addonApps.filter((app) => {
      const inCategory = marketplaceCategory === 'all' || app.category?.slug === marketplaceCategory;
      if (!inCategory) {
        return false;
      }

      if (marketplaceSearchToken.length === 0) {
        return true;
      }

      const haystack = [
        app.name,
        app.slug,
        app.description,
        app.tagline ?? '',
        app.category?.name ?? '',
      ].join(' ').toLowerCase();

      return haystack.includes(marketplaceSearchToken);
    });
  }, [marketplaceCategory, marketplaceSearchToken, vpsMarket]);

  const selectedPrimaryDescriptor = useMemo(
    () => vpsMarket?.primaryApps.find((app) => app.slug === selectedPrimaryApp) ?? null,
    [selectedPrimaryApp, vpsMarket],
  );

  const selectedAddonDescriptors = useMemo(
    () => vpsMarket?.addonApps.filter((app) => selectedAddonApps.includes(app.slug)) ?? [],
    [selectedAddonApps, vpsMarket],
  );
  const marketplaceCompatibility = vpsMarket?.compatibility ?? null;
  const marketplaceHasVisibleApps = filteredPrimaryApps.length > 0 || filteredAddonApps.length > 0;
  const marketplaceHasAnyApps = (vpsMarket?.primaryApps.length ?? 0) > 0 || (vpsMarket?.addonApps.length ?? 0) > 0;
  const resourceBudget = useMemo(() => {
    const label = product ? `${localizeText(product.name, locale, '')} ${localizeText(product.description, locale, '')}` : '';
    return parseResourceBudget(label, product?.slug ?? '');
  }, [locale, product]);
  const selectionLoad = useMemo(
    () => estimateSelectionLoad(selectedPrimaryApp, selectedAddonApps),
    [selectedAddonApps, selectedPrimaryApp],
  );
  const capacityWarning = useMemo(() => {
    if (productLine !== 'vps' || !resourceBudget) {
      return null;
    }

    const cpuRatio = selectionLoad.cpuCores / Math.max(resourceBudget.cpuCores, 0.1);
    const memoryRatio = selectionLoad.memoryGb / Math.max(resourceBudget.memoryGb, 0.1);
    const peakRatio = Math.max(cpuRatio, memoryRatio);

    if (peakRatio < 0.76) {
      return null;
    }

    if (peakRatio >= 1) {
      return locale.startsWith('zh')
        ? `当前已选组件预计超出套餐能力（CPU ${selectionLoad.cpuCores.toFixed(1)} / ${resourceBudget.cpuCores} 核，内存 ${selectionLoad.memoryGb.toFixed(1)} / ${resourceBudget.memoryGb} GB）。建议升级套餐或减少组件。`
        : `Selected apps are likely over this plan capacity (CPU ${selectionLoad.cpuCores.toFixed(1)} / ${resourceBudget.cpuCores}, RAM ${selectionLoad.memoryGb.toFixed(1)} / ${resourceBudget.memoryGb} GB). Upgrade the plan or reduce app components.`;
    }

    return locale.startsWith('zh')
      ? `当前组件负载偏高（CPU ${selectionLoad.cpuCores.toFixed(1)} / ${resourceBudget.cpuCores} 核，内存 ${selectionLoad.memoryGb.toFixed(1)} / ${resourceBudget.memoryGb} GB）。继续下单可以，但建议减少组件或选择更高配置。`
      : `Current app load is heavy (CPU ${selectionLoad.cpuCores.toFixed(1)} / ${resourceBudget.cpuCores}, RAM ${selectionLoad.memoryGb.toFixed(1)} / ${resourceBudget.memoryGb} GB). You can continue, but a larger plan is recommended.`;
  }, [locale, productLine, resourceBudget, selectionLoad.cpuCores, selectionLoad.memoryGb]);

  const locationConfigOptions = useMemo(
    () => extraOptions.filter((option) => isLocationField(option)),
    [extraOptions],
  );
  const networkConfigOptions = useMemo(
    () => extraOptions.filter((option) => isBandwidthField(option) || isTrafficField(option) || isIpCountField(option)),
    [extraOptions],
  );
  const generalConfigOptions = useMemo(
    () => extraOptions.filter((option) => !locationConfigOptions.includes(option) && !networkConfigOptions.includes(option)),
    [extraOptions, locationConfigOptions, networkConfigOptions],
  );
  const groupedCheckoutFields = useMemo(() => {
    const source = product?.checkoutFields ?? [];
    const reservedFields = new Set([osFieldName, primaryAppFieldName, addonAppFieldName]);
    const locationFields = source.filter((field) => !reservedFields.has(field.name) && isLocationField(field));
    const networkFields = source.filter((field) => !reservedFields.has(field.name)
      && !locationFields.includes(field)
      && (isBandwidthField(field) || isTrafficField(field) || isIpCountField(field)));
    const credentialFields = source.filter((field) => !reservedFields.has(field.name)
      && !locationFields.includes(field)
      && !networkFields.includes(field)
      && (isPasswordField(field) || isPasswordConfirmationField(field) || isHostnameField(field)));
    const miscFields = source.filter((field) => !reservedFields.has(field.name)
      && !locationFields.includes(field)
      && !networkFields.includes(field)
      && !credentialFields.includes(field));

    return {
      locationFields,
      networkFields,
      credentialFields,
      miscFields,
    };
  }, [addonAppFieldName, osFieldName, primaryAppFieldName, product]);

  const passwordValidationError = useMemo(() => {
    if (productLine !== 'vps' || customPassword.length === 0) {
      return null;
    }

    const policyError = validateStrongServerPassword(customPassword, locale);
    if (policyError) {
      return policyError;
    }

    if (passwordConfirmation.length === 0) {
      return locale.startsWith('zh') ? '请再次确认自定义密码。' : 'Please confirm the custom password.';
    }

    if (passwordConfirmation !== customPassword) {
      return locale.startsWith('zh') ? '两次输入的密码不一致。' : 'Password confirmation does not match.';
    }

    return null;
  }, [customPassword, locale, passwordConfirmation, productLine]);

  const selectedLocationChoice = useMemo(() => {
    for (const option of locationConfigOptions) {
      const selected = option.children.find((choice) => choice.id === formState[option.id]);
      if (selected) {
        return {
          label: selected.name,
          meta: parseNodeOption(selected),
        };
      }
    }

    for (const field of groupedCheckoutFields.locationFields) {
      const selected = field.options.find((option) => option.value === checkoutStringValue(checkoutForm[field.name]));
      if (selected) {
        return {
          label: selected.label,
          meta: parseNodeOption(selected),
        };
      }
    }

    return null;
  }, [checkoutForm, formState, groupedCheckoutFields.locationFields, locationConfigOptions]);

  const selectedNetworkSummary = useMemo(() => {
    const items: Array<{ key: string; label: string; value: string }> = [];

    for (const option of networkConfigOptions) {
      const selected = option.children.find((choice) => choice.id === formState[option.id]);
      if (selected) {
        items.push({
          key: option.id,
          label: localizeText(option.name, locale, option.name),
          value: localizeText(selected.name, locale, selected.name),
        });
      }
    }

    for (const field of groupedCheckoutFields.networkFields) {
      const raw = checkoutForm[field.name];
      const value = optionValueToText(raw);
      if (value) {
        items.push({
          key: field.name,
          label: localizeCheckoutFieldLabel(field, locale),
          value,
        });
      }
    }

    return items;
  }, [checkoutForm, formState, groupedCheckoutFields.networkFields, locale, networkConfigOptions]);
  const groupedOsOptions = useMemo(() => {
    const groups = new Map<string, VpsMarketplaceOsOption[]>();
    for (const option of vpsMarketplaceCapability?.supportedOs ?? []) {
      const visual = getOsVisual(option);
      const key = visual.family ?? (locale.startsWith('zh') ? '系统' : 'Family');
      groups.set(key, [...(groups.get(key) ?? []), option]);
    }
    return [...groups.entries()];
  }, [locale, vpsMarketplaceCapability?.supportedOs]);
  const selectedOsOption = useMemo(
    () => vpsMarketplaceCapability?.supportedOs.find((option) => option.value === selectedMarketplaceOs) ?? null,
    [selectedMarketplaceOs, vpsMarketplaceCapability?.supportedOs],
  );
  const selectedOsVisual = getOsVisual(selectedOsOption ?? selectedMarketplaceOs);
  const selectedPrimaryVisual = getAppVisual(selectedPrimaryDescriptor);

  function buildCartPayload() {
    if (!product || !selectedPlan) {
      return null;
    }

    const configOptions = Object.fromEntries(
      Object.entries(formState).filter(([, value]) => value !== null && value !== ''),
    );
    const checkoutConfig = Object.fromEntries(
      Object.entries(checkoutForm).map(([key, value]) => {
        const field = product.checkoutFields.find((entry) => entry.name === key);
        if (!field) {
          return [key, value];
        }

        return [key, normalizeCheckoutFieldValue(field, value)];
      }).filter(([, value]) => {
        if (Array.isArray(value)) {
          return true;
        }
        return value !== null && value !== '';
      }),
    );

    if (productLine === 'vps' && customPassword.trim() !== '') {
      const passwordKey = passwordField?.name ?? 'account_password';
      const confirmationKey = passwordConfirmationField?.name ?? 'password_confirmation';
      checkoutConfig[passwordKey] = customPassword.trim();
      checkoutConfig[confirmationKey] = passwordConfirmation.trim();
    }

    return {
      productSlug: product.slug,
      planId: selectedPlan.id,
      quantity: 1,
      configOptions,
      checkoutConfig,
    };
  }

  function setCheckoutValue(name: string, value: CheckoutFormValue) {
    setCheckoutForm((state) => ({ ...state, [name]: value }));
  }

  function handlePrimarySelection(slug: string) {
    setMarketplaceHint(null);
    setCheckoutValue(primaryAppFieldName, selectedPrimaryApp === slug ? '' : slug);
  }

  function handleAddonToggle(slug: string) {
    const selected = checkoutArrayValue(checkoutForm[addonAppFieldName]);
    const next = selected.includes(slug)
      ? selected.filter((entry) => entry !== slug)
      : [...selected, slug];
    setMarketplaceHint(null);
    setCheckoutValue(addonAppFieldName, next);
  }

  function renderConfigOption(
    option: ConfigOption,
    variant: 'default' | 'node' | 'upsell' = 'default',
  ) {
    return (
      <div className={`option-card option-card--${variant}`} key={option.id}>
        <div className="stack-8">
          <strong>{localizeText(option.name, locale, ui.common.unnamedItem)}</strong>
          <p className="muted">{localizeText(option.description, locale, '')}</p>
        </div>
        {option.children.length > 0 ? (
          <div className={`choice-grid ${variant === 'node' ? 'choice-grid--nodes' : ''}`}>
            {option.children.map((choice) => {
              const nodeMeta = variant === 'node' ? parseNodeOption(choice) : null;

              return (
                <button
                  className={`choice-card ${variant === 'node' ? 'node-choice-card' : variant === 'upsell' ? 'upsell-choice-card compact' : 'compact'} ${formState[option.id] === choice.id ? 'selected' : ''}`}
                  key={`${option.id}-${choice.id}`}
                  type="button"
                  onClick={() => setFormState((state) => ({ ...state, [option.id]: choice.id }))}
                >
                  {nodeMeta ? (
                    <div className="choice-card__headline">
                      <CountryFlagIcon countryCode={nodeMeta.countryCode} />
                      <div className="stack-8">
                        <strong>{localizeText(choice.name, locale, ui.common.unnamedItem)}</strong>
                        {nodeMeta.countryName ? <span>{nodeMeta.countryName}</span> : null}
                      </div>
                    </div>
                  ) : (
                    <strong>{localizeText(choice.name, locale, ui.common.unnamedItem)}</strong>
                  )}
                  {choice.description ? <span>{localizeText(choice.description, locale, '')}</span> : null}
                  {choice.hint ? <small>{choice.hint}</small> : null}
                  {choice.badge ? <span className="choice-card__badge">{choice.badge}</span> : null}
                  {selectedPlan ? (
                    <small>
                      + {optionCardPrice(choice, selectedPlan, selectedPlan.prices[0]?.currencyCode ?? 'USD', formatMoney)}
                    </small>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : <p className="muted">{ui.product.noExtraConfig}</p>}
      </div>
    );
  }

  function renderCheckoutField(
    field: CheckoutField,
    variant: 'default' | 'node' | 'upsell' | 'credentials' = 'default',
  ) {
    if (field.type === 'select') {
      if (variant === 'node' || variant === 'upsell') {
        return (
          <div className={`option-card option-card--${variant}`} key={field.name}>
            <div className="stack-8">
              <strong>{localizeCheckoutFieldLabel(field, locale)}</strong>
              {field.description ? <p className="muted">{localizeText(field.description, locale, '')}</p> : null}
            </div>
            <div className={`choice-grid ${variant === 'node' ? 'choice-grid--nodes' : ''}`}>
              {field.options.map((option) => {
                const nodeMeta = variant === 'node' ? parseNodeOption(option) : null;
                const selected = checkoutStringValue(checkoutForm[field.name]) === option.value;

                return (
                  <button
                    className={`choice-card ${variant === 'node' ? 'node-choice-card' : 'upsell-choice-card compact'} ${selected ? 'selected' : ''}`}
                    key={`${field.name}-${option.value}`}
                    type="button"
                    onClick={() => setCheckoutValue(field.name, option.value)}
                  >
                    {nodeMeta ? (
                      <div className="choice-card__headline">
                        <CountryFlagIcon countryCode={nodeMeta.countryCode} />
                        <div className="stack-8">
                          <strong>{localizeCheckoutOptionLabel(field, option, locale, text.common.yes, text.common.no)}</strong>
                          {nodeMeta.countryName ? <span>{nodeMeta.countryName}</span> : null}
                        </div>
                      </div>
                    ) : (
                      <strong>{localizeCheckoutOptionLabel(field, option, locale, text.common.yes, text.common.no)}</strong>
                    )}
                    {option.hint ? <small>{option.hint}</small> : null}
                    {option.badge ? <span className="choice-card__badge">{option.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <label className="field" key={field.name}>
          <span>{localizeCheckoutFieldLabel(field, locale)}</span>
          <select
            className="text-input select-input"
            value={checkoutStringValue(checkoutForm[field.name])}
            onChange={(event) => setCheckoutForm((state) => ({ ...state, [field.name]: event.target.value }))}
          >
            <option value="">-</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {localizeCheckoutOptionLabel(field, option, locale, text.common.yes, text.common.no)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label className={`field ${variant === 'credentials' ? 'field--credential' : ''}`} key={field.name}>
        <span>{localizeCheckoutFieldLabel(field, locale)}</span>
        <input
          className="text-input"
          type={field.type === 'number' ? 'number' : 'text'}
          min={field.type === 'number' ? 0 : undefined}
          required={field.required}
          placeholder={localizeCheckoutFieldPlaceholder(field, locale)}
          value={checkoutStringValue(checkoutForm[field.name])}
          onChange={(event) => setCheckoutForm((state) => ({ ...state, [field.name]: event.target.value }))}
        />
      </label>
    );
  }

  async function addToCart() {
    if (!product || !selectedPlan) {
      return;
    }

    if (passwordValidationError) {
      setSubmitError(passwordValidationError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const payload = buildCartPayload();
      if (!payload) {
        return;
      }

      await requestJson('/api/v1/cart/items', {
        method: 'POST',
        body: payload,
      });

      setSubmitSuccess(text.product.addSuccess);
    } catch (caughtError) {
      setSubmitError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setSubmitting(false);
    }
  }

  async function goCheckoutWithCurrentConfig() {
    if (!product || !selectedPlan) {
      navigate('/checkout');
      return;
    }

    if (passwordValidationError) {
      setSubmitError(passwordValidationError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const payload = buildCartPayload();
      if (!payload) {
        navigate('/checkout');
        return;
      }

      await requestJson('/api/v1/cart/items', {
        method: 'POST',
        body: payload,
      });

      navigate('/checkout');
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      const normalized = apiError.message.toLowerCase();

      if (
        normalized.includes('already in your cart')
        || normalized.includes('cannot be added again')
        || normalized.includes('already in cart')
      ) {
        navigate('/checkout');
        return;
      }

      setSubmitError(toFriendlyError(apiError, locale));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !product) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  return (
    <div className="stack-32 product-page">
      <section className="detail-hero detail-hero--commerce">
        <div className="stack-16 detail-copy">
          <Link className="text-link" to="/catalog">{text.common.backToCatalog}</Link>
          <div className="chip-row">
            <span className="chip">{productLineLabel(productLine, locale)}</span>
            {product.category ? <span className="chip">{localizeText(product.category.name, locale, ui.common.unnamedCategory)}</span> : null}
            <span className="chip">{text.common.stock}: {product.stock ?? '-'}</span>
          </div>
          <h1>{localizeText(product.name, locale, ui.common.unnamedProduct)}</h1>
          <p className="lead">{localizeText(product.description, locale, '')}</p>
        </div>
      </section>

      <section className="two-column two-column--catalog">
        <div className="section-frame stack-24">
          <div>
            <p className="eyebrow">{text.product.plans}</p>
            <h2>{productLine === 'vps' ? (locale.startsWith('zh') ? '一步步搭建你的服务器' : 'Build your server step by step') : ui.product.detailsHelp}</h2>
            {productLine === 'vps' ? (
              <p className="muted">{locale.startsWith('zh') ? '先选套餐，再确认节点、系统、应用、网络和初始化信息。' : 'Choose a plan first, then confirm node, OS, apps, network, and bootstrap settings.'}</p>
            ) : null}
          </div>
          <div className="choice-grid">
            {product.plans.map((plan) => (
              <button
                className={`choice-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
                key={plan.id}
                type="button"
              onClick={() => setSelectedPlanId(plan.id)}
            >
                <strong>{localizeText(plan.name, locale, ui.common.unnamedPlan)}</strong>
                <span>{billingCycleLabel(plan.billingPeriod, plan.billingUnit, text.common.customBilling, locale)}</span>
                <small>{formatMoney(plan.prices[0]?.price ?? null, plan.prices[0]?.currencyCode ?? 'USD')}</small>
              </button>
            ))}
          </div>

          {productLine !== 'vps' ? [...product.operatingSystemOptions, ...extraOptions].map((option) => renderConfigOption(option)) : null}
          {productLine !== 'vps' && product.checkoutFields.length > 0 ? (
            <section className="config-flow-section stack-16">
              <div className="config-flow-section__head">
                <p className="eyebrow">{ui.product.configTitle}</p>
                <h3>{ui.product.detailsHelp}</h3>
              </div>
              {product.checkoutFields.map((field) => renderCheckoutField(field))}
            </section>
          ) : null}

          {productLine === 'vps' && vpsMarketplaceCapability?.enabled ? (
            <div className="stack-24 vps-marketplace">
              {(locationConfigOptions.length > 0 || groupedCheckoutFields.locationFields.length > 0) ? (
                <section className="config-flow-section stack-16">
                  <div className="config-flow-section__head">
                    <p className="eyebrow">{locale.startsWith('zh') ? '节点位置' : 'Node location'}</p>
                    <h3>{locale.startsWith('zh') ? '先选国家节点，客户一眼就能看懂买的是哪里' : 'Choose the country and node first'}</h3>
                    <p className="muted">{locale.startsWith('zh') ? '节点卡片会显示国旗、国家和可选提示，便于快速筛选。' : 'Visual node cards show flags, country hints, and node labels for fast comparison.'}</p>
                  </div>
                  {locationConfigOptions.map((option) => renderConfigOption(option, 'node'))}
                  {groupedCheckoutFields.locationFields.map((field) => renderCheckoutField(field, 'node'))}
                </section>
              ) : null}

              <section className="config-flow-section stack-16">
                <div className="config-flow-section__head">
                  <p className="eyebrow">{locale.startsWith('zh') ? '操作系统' : 'Operating system'}</p>
                  <h3>{locale.startsWith('zh') ? '操作系统图标化展示' : 'Choose the operating system visually'}</h3>
                  <p className="muted">{locale.startsWith('zh') ? '按发行版家族分组展示，模板来源也会同步提示。' : 'OS options are grouped by family with template references when available.'}</p>
                </div>
                <div className="stack-16">
                  {groupedOsOptions.map(([family, options]) => (
                    <div className="stack-12" key={family}>
                      <div className="section-heading section-heading--compact">
                        <div>
                          <p className="eyebrow">{locale.startsWith('zh') ? '系统家族' : 'OS family'}</p>
                          <h3>{family}</h3>
                        </div>
                      </div>
                      <div className="choice-grid choice-grid--os">
                        {options.map((option) => {
                          const visual = getOsVisual(option);
                          return (
                            <button
                              className={`choice-card os-choice-card ${selectedMarketplaceOs === option.value ? 'selected' : ''}`}
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setMarketplaceHint(null);
                                setCheckoutValue(osFieldName, option.value);
                                setCheckoutValue(primaryAppFieldName, '');
                                setCheckoutValue(addonAppFieldName, []);
                              }}
                            >
                              <div className="choice-card__headline">
                                <VisualIcon glyph={visual.glyph} label={option.label} src={visual.src} tone={visual.tone} />
                                <div className="stack-8">
                                  <strong>{option.label}</strong>
                                  {option.family ? <span>{option.family}</span> : null}
                                </div>
                              </div>
                              {option.templateRef ? <small>{locale.startsWith('zh') ? '模板' : 'Template'}: {option.templateRef}</small> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="stack-16">
                <div className="config-flow-section__head">
                  <p className="eyebrow">{locale.startsWith('zh') ? '应用市场' : 'App marketplace'}</p>
                  <h3>{locale.startsWith('zh') ? '应用面板分门别类，一眼知道该选什么' : 'Pick apps by category with clear visual cards'}</h3>
                  <p className="muted">{locale.startsWith('zh') ? '先选 1 个主应用，再自由叠加附加组件。系统会自动补齐依赖并拦截冲突。' : 'Choose one primary app and then add optional addons. Dependencies are auto-filled and conflicts are blocked.'}</p>
                </div>
                <label className="field">
                  <span>{ui.common.search}</span>
                  <input
                    className="text-input"
                    placeholder={locale.startsWith('zh') ? '搜索面板、数据库、运行时...' : 'Search panels, databases, runtimes...'}
                    value={marketplaceSearch}
                    onChange={(event) => setMarketplaceSearch(event.target.value)}
                  />
                </label>
                <div className="chip-row">
                  {marketplaceTabs.map((category) => (
                    <button
                      className={`chip chip-button ${marketplaceCategory === category.slug ? 'chip-button--active' : ''}`}
                      key={category.slug}
                      type="button"
                      onClick={() => setMarketplaceCategory(category.slug)}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
                {vpsMarketLoading ? (
                  <div className="loading-card">{text.common.loading}</div>
                ) : vpsMarketError ? (
                  <div className="error-card compact">{vpsMarketError}</div>
                ) : vpsMarket ? (
                  <>
                    {!marketplaceHasAnyApps ? (
                      <div className="callout compact">
                        <strong>{locale.startsWith('zh') ? '当前系统暂时没有独立应用包' : 'No dedicated app recipes for this OS yet'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '你仍然可以下单纯净系统。该系统的应用脚本仍在补齐中。'
                            : 'You can still order a clean OS while scripted recipes for this OS are being completed.'}
                        </p>
                      </div>
                    ) : null}
                    {marketplaceCompatibility?.mode === 'fallback' ? (
                      <div className="callout compact">
                        <strong>{locale.startsWith('zh') ? '已切换到兼容组件模式' : 'Compatibility app mode enabled'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? `当前系统 ${marketplaceCompatibility.requestedOs ?? selectedMarketplaceOs} 暂无独立组件脚本，已自动使用 ${marketplaceCompatibility.fallbackOs ?? '-'} 的组件目录。`
                            : `Dedicated recipes for ${marketplaceCompatibility.requestedOs ?? selectedMarketplaceOs} are not ready yet, so the catalog is temporarily served from ${marketplaceCompatibility.fallbackOs ?? '-'}.`}
                        </p>
                      </div>
                    ) : null}
                    {marketplaceHasAnyApps && !marketplaceHasVisibleApps ? (
                      <div className="callout compact">
                        {locale.startsWith('zh')
                          ? '当前筛选条件下没有匹配应用，可以切换分类或清空搜索。'
                          : 'No apps match the current filters. Try a different category or clear the search.'}
                      </div>
                    ) : null}
                    <div className="stack-12">
                      <p className="eyebrow">{locale.startsWith('zh') ? '主应用' : 'Primary app'}</p>
                      <div className="choice-grid">
                        {filteredPrimaryApps.map((app) => (
                          <button
                            className={`choice-card vps-app-card ${selectedPrimaryApp === app.slug ? 'selected' : ''}`}
                            disabled={!app.available}
                            key={app.slug}
                            type="button"
                            onClick={() => handlePrimarySelection(app.slug)}
                          >
                            <div className="choice-card__headline">
                              <VisualIcon
                                glyph={getAppVisual(app).glyph}
                                label={app.name}
                                src={getAppVisual(app).src}
                                tone={getAppVisual(app).tone}
                              />
                              <div className="stack-8">
                                <strong>{app.name}</strong>
                                {app.category?.name ? <span>{app.category.name}</span> : null}
                              </div>
                            </div>
                            {app.tagline ? <span>{app.tagline}</span> : null}
                            {app.description ? <small>{app.description}</small> : null}
                            <small>{app.recipe?.effectiveInstallStrategy ?? app.recipe?.installStrategy ?? '-'}</small>
                            {!app.available && app.unavailableReason ? <span>{app.unavailableReason}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="stack-12">
                      <p className="eyebrow">{locale.startsWith('zh') ? '附加组件' : 'Addons'}</p>
                      <div className="choice-grid">
                        {filteredAddonApps.map((app) => (
                          <button
                            className={`choice-card compact vps-app-card ${selectedAddonApps.includes(app.slug) ? 'selected' : ''}`}
                            disabled={!app.available}
                            key={app.slug}
                            type="button"
                            onClick={() => handleAddonToggle(app.slug)}
                          >
                            <div className="choice-card__headline">
                              <VisualIcon
                                glyph={getAppVisual(app).glyph}
                                label={app.name}
                                src={getAppVisual(app).src}
                                tone={getAppVisual(app).tone}
                              />
                              <div className="stack-8">
                                <strong>{app.name}</strong>
                                {app.category?.name ? <span>{app.category.name}</span> : null}
                              </div>
                            </div>
                            {app.tagline ? <span>{app.tagline}</span> : null}
                            <small>{(app.recipe?.dependencies ?? []).length > 0
                              ? `${locale.startsWith('zh') ? '依赖' : 'Depends on'}: ${app.recipe?.dependencies.join(', ')}`
                              : (locale.startsWith('zh') ? '无额外依赖' : 'No extra dependencies')}
                            </small>
                            {(app.recipe?.conflicts ?? []).length > 0 ? (
                              <small>{locale.startsWith('zh') ? '冲突' : 'Conflicts'}: {app.recipe?.conflicts.join(', ')}</small>
                            ) : null}
                            {!app.available && app.unavailableReason ? <span>{app.unavailableReason}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="callout compact">
                      <strong>{locale.startsWith('zh') ? '已选摘要' : 'Selection summary'}</strong>
                      <p className="muted">
                        {selectedLocationChoice ? `${locale.startsWith('zh') ? '节点' : 'Node'}: ${selectedLocationChoice.label} | ` : ''}
                        {locale.startsWith('zh') ? '系统' : 'OS'}: {selectedMarketplaceOs || '-'}
                        {' | '}
                        {locale.startsWith('zh') ? '主应用' : 'Primary'}: {selectedPrimaryDescriptor?.name ?? (locale.startsWith('zh') ? '未选择' : 'None')}
                        {' | '}
                        {locale.startsWith('zh') ? '附加组件' : 'Addons'}: {selectedAddonDescriptors.length > 0
                          ? selectedAddonDescriptors.map((app) => app.name).join(', ')
                          : (locale.startsWith('zh') ? '未选择' : 'None')}
                      </p>
                    </div>
                  </>
                ) : null}
                {marketplaceHint ? <div className="callout compact">{marketplaceHint}</div> : null}
                {capacityWarning ? (
                  <div className={`callout compact ${capacityWarning.includes('超出') || capacityWarning.includes('over') ? 'error-card' : ''}`}>
                    <strong>{locale.startsWith('zh') ? '资源容量提醒' : 'Capacity warning'}</strong>
                    <p className="muted">{capacityWarning}</p>
                  </div>
                ) : null}
              </div>

              {(networkConfigOptions.length > 0 || groupedCheckoutFields.networkFields.length > 0) ? (
                <section className="config-flow-section stack-16">
                  <div className="config-flow-section__head">
                    <p className="eyebrow">{locale.startsWith('zh') ? '高级网络配置' : 'Advanced network configuration'}</p>
                    <h3>{locale.startsWith('zh') ? '流量、带宽、IP 数量做成增配项' : 'Upsell traffic, bandwidth, and IP capacity clearly'}</h3>
                    <p className="muted">{locale.startsWith('zh') ? '客户可以直观看到增配项，并立即看到价格摘要变化。' : 'Customers can tune network extras with a much clearer upsell experience.'}</p>
                  </div>
                  {networkConfigOptions.map((option) => renderConfigOption(option, 'upsell'))}
                  {groupedCheckoutFields.networkFields.map((field) => renderCheckoutField(field, field.type === 'select' ? 'upsell' : 'default'))}
                </section>
              ) : null}

              <section className="config-flow-section stack-16">
                <div className="config-flow-section__head">
                  <p className="eyebrow">{locale.startsWith('zh') ? '初始化设置' : 'Bootstrap settings'}</p>
                  <h3>{locale.startsWith('zh') ? '支持下单时自定义密码' : 'Set hostname and custom password before ordering'}</h3>
                  <p className="muted">{locale.startsWith('zh') ? '密码只在这里输入一次，购物车和结算页只显示已设置状态，不回显明文。' : 'Passwords are entered here once and stay masked in cart and checkout summaries.'}</p>
                </div>
                {hostnameField ? renderCheckoutField(hostnameField, 'credentials') : null}
                {groupedCheckoutFields.credentialFields
                  .filter((field) => !isPasswordField(field) && !isPasswordConfirmationField(field) && !isHostnameField(field))
                  .map((field) => renderCheckoutField(field, 'credentials'))}
                <div className="credential-grid">
                  <label className="field field--credential">
                    <span>{locale.startsWith('zh') ? '自定义密码（可选）' : 'Custom password (optional)'}</span>
                    <input
                      className="text-input"
                      type="password"
                      minLength={8}
                      maxLength={50}
                      placeholder={locale.startsWith('zh')
                        ? '8-50 位，需含大小写、数字和特殊字符'
                        : '8-50 chars with upper/lowercase, number, and special character'}
                      value={customPassword}
                      onChange={(event) => {
                        setCustomPassword(event.target.value);
                        setSubmitError(null);
                      }}
                    />
                  </label>
                  <label className="field field--credential">
                    <span>{locale.startsWith('zh') ? '确认密码' : 'Confirm password'}</span>
                    <input
                      className="text-input"
                      type="password"
                      minLength={8}
                      maxLength={50}
                      placeholder={locale.startsWith('zh') ? '再次输入密码' : 'Repeat the password'}
                      value={passwordConfirmation}
                      onChange={(event) => {
                        setPasswordConfirmation(event.target.value);
                        setSubmitError(null);
                      }}
                    />
                  </label>
                </div>
                {passwordValidationError ? <div className="error-card compact">{passwordValidationError}</div> : null}
                <p className="muted">
                  {locale.startsWith('zh')
                    ? '为了避免开通阶段失败，密码会在这里先校验：8-50 位，至少包含 1 个大写字母、1 个小写字母、1 个数字和 1 个特殊字符。'
                    : 'To avoid provisioning failures, passwords are validated here first: 8-50 characters with at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'}
                </p>
                {passwordField?.description ? <p className="muted">{passwordField.description}</p> : null}
              </section>

              {(generalConfigOptions.length > 0 || groupedCheckoutFields.miscFields.length > 0) ? (
                <section className="config-flow-section stack-16">
                  <div className="config-flow-section__head">
                    <p className="eyebrow">{locale.startsWith('zh') ? '补充设置' : 'Additional settings'}</p>
                    <h3>{locale.startsWith('zh') ? '其他订单参数' : 'Additional order parameters'}</h3>
                  </div>
                  {generalConfigOptions.map((option) => renderConfigOption(option))}
                  {groupedCheckoutFields.miscFields.map((field) => renderCheckoutField(field))}
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="summary-card summary-card--floating stack-16">
          <span className="eyebrow">{text.product.summary}</span>
          <strong className="price-large">
            {formatMoney(total, selectedPlan?.prices[0]?.currencyCode ?? 'USD')}
          </strong>
          <p>{billingCycleLabel(selectedPlan?.billingPeriod ?? null, selectedPlan?.billingUnit ?? null, text.common.customBilling, locale)}</p>
          {selectedLocationChoice ? (
            <div className="summary-line">
              <CountryFlagIcon countryCode={selectedLocationChoice.meta.countryCode} />
              <div>
                <span>{locale.startsWith('zh') ? '节点' : 'Node'}</span>
                <strong>{selectedLocationChoice.label}</strong>
              </div>
            </div>
          ) : null}
          <div className="summary-line">
            <VisualIcon glyph={selectedOsVisual.glyph} label={selectedMarketplaceOs || 'OS'} size="sm" src={selectedOsVisual.src} tone={selectedOsVisual.tone} />
            <div>
              <span>OS</span>
              <strong>{selectedMarketplaceOs || '-'}</strong>
            </div>
          </div>
          <div className="summary-line">
            <VisualIcon glyph={selectedPrimaryVisual.glyph} label={selectedPrimaryDescriptor?.name ?? 'Primary app'} size="sm" src={selectedPrimaryVisual.src} tone={selectedPrimaryVisual.tone} />
            <div>
              <span>{locale.startsWith('zh') ? '应用面板' : 'App panel'}</span>
              <strong>{selectedPrimaryDescriptor?.name ?? (locale.startsWith('zh') ? '纯净系统' : 'Clean OS')}</strong>
            </div>
          </div>
          {selectedNetworkSummary.map((item) => (
            <div className="summary-line" key={item.key}>
              <span className="summary-line__marker" />
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </div>
          ))}
          <div className="summary-line">
            <span className={`summary-line__marker ${customPassword ? 'summary-line__marker--secure' : ''}`} />
            <div>
              <span>{locale.startsWith('zh') ? '初始密码' : 'Initial password'}</span>
              <strong>{customPassword ? maskSensitiveValue(customPassword) : (locale.startsWith('zh') ? '系统自动生成' : 'Auto-generated')}</strong>
            </div>
          </div>
          {selectedAddonDescriptors.length > 0 ? (
            <div className="chip-row">
              {selectedAddonDescriptors.map((app) => (
                <span className="chip" key={app.slug}>{app.name}</span>
              ))}
            </div>
          ) : null}
          {capacityWarning ? (
            <div className={`callout compact ${capacityWarning.includes('超出') || capacityWarning.includes('over') ? 'error-card' : ''}`}>
              <strong>{locale.startsWith('zh') ? '资源容量提醒' : 'Capacity warning'}</strong>
              <p className="muted">{capacityWarning}</p>
            </div>
          ) : null}
          {!isAuthenticated ? (
            <Link className="button primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
              {text.common.loginRequired}
            </Link>
          ) : (
            <div className="stack-12">
              <button
                className="button primary"
                disabled={submitting || Boolean(passwordValidationError)}
                type="button"
                onClick={() => void addToCart()}
              >
                {submitting ? `${text.product.addToCart}...` : text.product.addToCart}
              </button>
              <button
                className="button secondary"
                disabled={submitting || Boolean(passwordValidationError)}
                type="button"
                onClick={() => void goCheckoutWithCurrentConfig()}
              >
                {text.product.goCheckout}
              </button>
            </div>
          )}
          {submitSuccess ? <div className="callout compact">{submitSuccess}</div> : null}
          {submitError ? <div className="error-card compact">{submitError}</div> : null}
        </aside>
      </section>
    </div>
  );
}
