import { Link } from 'react-router-dom';

import { BrandLogo } from '../components/BrandLogo';
import { CountryFlagIcon } from '../components/FlagIcon';
import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { brand } from '../lib/brand';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { getUiText, productLineFor } from '../lib/ui-text';
import { useSite } from '../lib/site-context';
import { getCountryMeta, getCountryName, inferCountryCode } from '../lib/visual-metadata';
import type { CatalogProductsResponse, CategorySummary, HomeResponse, ProductSummary } from '../lib/types';

function productTitle(product: ProductSummary, locale: ReturnType<typeof useSite>['locale'], fallback: string) {
  return localizeText(product.name, locale, fallback);
}

function deriveNodeHighlights(
  products: ProductSummary[],
  categories: CategorySummary[],
  locale: ReturnType<typeof useSite>['locale'],
) {
  const map = new Map<string, {
    code: string;
    countryName: string;
    count: number;
    productSlug: string | null;
    sampleTitles: string[];
  }>();

  for (const product of products) {
    const localizedName = localizeText(product.name, locale, '');
    const localizedDescription = localizeText(product.description, locale, '');
    const countryCode = product.countryCode
      ?? product.category?.countryCode
      ?? inferCountryCode(product.slug, product.category?.slug, localizedName, localizedDescription);

    if (!countryCode) {
      continue;
    }

    const country = getCountryMeta(countryCode);
    if (!country) {
      continue;
    }

    const existing = map.get(countryCode) ?? {
      code: countryCode,
      countryName: getCountryName(countryCode, locale),
      count: 0,
      productSlug: null,
      sampleTitles: [] as string[],
    };

    existing.count += 1;
    existing.productSlug ??= product.slug;
    const title = productTitle(product, locale, '');
    if (title.trim() !== '' && !existing.sampleTitles.includes(title) && existing.sampleTitles.length < 2) {
      existing.sampleTitles.push(title);
    }
    map.set(countryCode, existing);
  }

  for (const category of categories) {
    const countryCode = category.countryCode?.toUpperCase() ?? inferCountryCode(category.slug, localizeText(category.name, locale, ''), localizeText(category.description, locale, ''));
    if (!countryCode) {
      continue;
    }
    const country = getCountryMeta(countryCode);
    if (!country) {
      continue;
    }

    const existing = map.get(countryCode) ?? {
      code: countryCode,
      countryName: getCountryName(countryCode, locale),
      count: 0,
      productSlug: null,
      sampleTitles: [] as string[],
    };

    if (category.productCount > existing.count) {
      existing.count = category.productCount;
    }
    if (existing.countryName.trim() === '') {
      existing.countryName = getCountryName(countryCode, locale);
    }

    map.set(countryCode, existing);
  }

  return [...map.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.countryName.localeCompare(right.countryName);
    })
    .slice(0, 12);
}

export function HomePage() {
  const { text, locale } = useSite();
  const ui = getUiText(locale);
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<HomeResponse>('/api/v1/catalog/home');
  const catalogProductsState = useApiData<CatalogProductsResponse>('/api/v1/catalog/products');

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  const featuredProducts = data.data.featuredProducts;
  const allCatalogProducts = Array.isArray(catalogProductsState.data?.data) && catalogProductsState.data.data.length > 0
    ? catalogProductsState.data.data
    : featuredProducts;
  const homeProducts = allCatalogProducts.length > 0 ? allCatalogProducts : featuredProducts;
  const categories = data.data.categories;
  const vpsProducts = homeProducts.filter((product) => productLineFor(product.category?.slug, product.slug) === 'vps');
  const nodeHighlights = deriveNodeHighlights(homeProducts, categories, locale);

  const lineCards = [
    {
      key: 'launch' as const,
      badge: locale.startsWith('zh') ? '计划 -> 预览 -> 部署' : 'Plan -> Preview -> Deploy',
      title: locale.startsWith('zh') ? 'AI 工作台' : 'AI Workspace',
      body: locale.startsWith('zh')
        ? '普通用户先描述目标，AI 负责计划、生成可交互第一版、共享预览和后续上线建议。'
        : 'Describe the goal first, then let AI handle the plan, interactive first version, shared preview, and next launch steps.',
      href: '/operator-lab',
      count: null,
    },
    {
      key: 'vps' as const,
      badge: null,
      title: ui.home.vpsTitle as string,
      body: ui.home.vpsBody as string,
      href: '/catalog',
      count: vpsProducts.length,
    },
  ];

  const heroTitle = locale.startsWith('zh')
    ? '把想法、项目和旧服务器直接变成在线服务'
    : 'Turn ideas, projects, and existing servers into live services';
  const heroSubtitle = locale.startsWith('zh')
    ? '树懒云把 AI 计划、预览部署、正式发布、接管迁移和后续运维放进同一个前台。小白能看懂，专业用户也能继续深挖。'
    : 'Sloth Cloud puts AI planning, preview deploys, production cutover, server takeover, migration, and ongoing operations into one portal.';

  return (
    <div className="stack-32 home-page">
      <section className="hero-card hero-card--focus">
        <div className="hero-copy">
          <span className="eyebrow">{locale.startsWith('zh') ? 'AI 应用生成与部署平台' : 'AI app generation and deployment platform'}</span>
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
          <div className="action-row">
            <Link className="button primary" to="/operator-lab">{locale.startsWith('zh') ? '进入 AI 工作台' : 'Open AI workspace'}</Link>
            <Link className="button secondary" to={isAuthenticated ? '/services' : '/login'}>
              {isAuthenticated
                ? (locale.startsWith('zh') ? '查看运行中的服务' : 'Open my running services')
                : text.home.secondaryCta}
            </Link>
          </div>
        </div>

        <aside className="brand-panel">
          <span style={{ width: 92, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrandLogo variant="hero" />
          </span>
          <div>
            <span className="panel-kicker">{brand.nameEnCompact}</span>
            <strong className="brand-feature-name">{brand.nameCn}</strong>
            <span className="brand-feature-en">{brand.nameEn}</span>
          </div>
        </aside>
      </section>
      <section className="page-section node-market-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? '热门节点' : 'Popular locations'}</p>
            <h2>{locale.startsWith('zh') ? '先按国家节点挑，再进入具体套餐' : 'Start with the country, then drill into the matching plans'}</h2>
          </div>
          <Link className="button ghost" to="/catalog">
            {locale.startsWith('zh') ? '查看全部节点' : 'Browse all locations'}
          </Link>
        </div>
        <div className="node-market-grid">
          {nodeHighlights.length > 0 ? nodeHighlights.map((node) => (
            <article className="node-market-card" key={node.code}>
              <div className="choice-card__headline">
                <CountryFlagIcon countryCode={node.code} />
                <div className="stack-8">
                  <strong>{node.countryName}</strong>
                  <span>{locale.startsWith('zh') ? `${node.count} 个可见套餐` : `${node.count} visible plans`}</span>
                </div>
              </div>
              {node.sampleTitles.length > 0 ? (
                <div className="stack-8">
                  {node.sampleTitles.map((title) => (
                    <p className="muted node-market-card__plan" key={`${node.code}-${title}`}>{title}</p>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  {locale.startsWith('zh') ? '当前没有可售套餐。' : 'No sellable plans are currently published for this node.'}
                </p>
              )}
              <Link className="button secondary" to={`/catalog?node=${encodeURIComponent(node.code)}`}>
                {locale.startsWith('zh') ? '查看该节点套餐' : 'View plans in this location'}
              </Link>
            </article>
          )) : (
            <article className="empty-state compact">
              <h3>{locale.startsWith('zh') ? '暂时没有可展示的节点' : 'No node highlights are available yet'}</h3>
              <p>{locale.startsWith('zh') ? '等真实商品发布后，这里会自动显示。' : 'This section updates automatically once live regional products are published.'}</p>
            </article>
          )}
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? '两条主入口' : 'Two primary entry points'}</p>
            <h2>{locale.startsWith('zh') ? '普通用户走 AI 工作台，专业用户继续挑 VPS' : 'Start with the AI workspace for app ideas, or browse VPS directly'}</h2>
          </div>
        </div>
        <div className="line-grid">
          {lineCards.map((line) => (
            <article className={`line-card line-card--${line.key}`} key={line.key}>
              {line.count !== null ? (
                <span className="chip">{line.count} {text.common.products}</span>
              ) : (
                <span className="chip">{line.badge}</span>
              )}
              <h3>{line.title}</h3>
              <p>{line.body}</p>
              <Link className="button ghost" to={line.href}>
                {text.common.open}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section assurance-band">
        <div>
          <p className="eyebrow">{ui.home.assuranceTitle}</p>
          <h2>{ui.home.assuranceSubtitle}</h2>
        </div>
        <div className="assurance-list">
          {(ui.home.assuranceItems as string[]).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        {categories.length === 0 ? (
          <article className="empty-state compact">
            <h3>{ui.home.emptyCategoriesTitle}</h3>
            <p>{ui.home.emptyCategoriesBody}</p>
          </article>
        ) : null}
      </section>
    </div>
  );
}
