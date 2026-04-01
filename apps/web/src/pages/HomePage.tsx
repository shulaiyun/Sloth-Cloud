import { Link } from 'react-router-dom';

import { BrandLogo } from '../components/BrandLogo';
import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { brand } from '../lib/brand';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { HomeResponse } from '../lib/types';

function emptyProductsTitle(locale: string) {
  return locale.startsWith('zh')
    ? '\u6682\u65e0\u53ef\u552e\u5546\u54c1'
    : 'No products available yet';
}

function emptyProductsBody(locale: string) {
  return locale.startsWith('zh')
    ? '\u8bf7\u5728\u8ba1\u8d39\u540e\u53f0\u5b8c\u6210\u5546\u54c1\u4e0a\u67b6\u4e0e\u4ef7\u683c\u914d\u7f6e\u540e\u518d\u91cd\u8bd5\u3002'
    : 'Please publish products and pricing in billing admin, then refresh this page.';
}

function emptyCategoriesTitle(locale: string) {
  return locale.startsWith('zh')
    ? '\u6682\u65e0\u53ef\u89c1\u5206\u7c7b'
    : 'No visible categories';
}

function emptyCategoriesBody(locale: string) {
  return locale.startsWith('zh')
    ? '\u8bf7\u68c0\u67e5\u5206\u7c7b\u662f\u5426\u7ed1\u5b9a\u53ef\u89c1\u5546\u54c1\u3002'
    : 'Check whether categories are linked to visible products.';
}

export function HomePage() {
  const { text, formatMoney, locale } = useSite();
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<HomeResponse>('/api/v1/catalog/home');

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  const featuredProducts = data.data.featuredProducts;
  const categories = data.data.categories;
  const hasProducts = featuredProducts.length > 0;
  const hasCategories = categories.length > 0;

  const metricCards = [
    {
      label: text.home.categoryTitle,
      value: String(categories.length),
      hint: text.home.categorySubtitle,
      tone: 'catalog',
    },
    {
      label: text.home.featuredTitle,
      value: String(featuredProducts.length),
      hint: text.home.featuredSubtitle,
      tone: 'products',
    },
    {
      label: text.common.sourceMode,
      value: data.meta.sourceMode === 'live' ? text.common.live : text.common.mock,
      hint: text.footer.statement,
      tone: 'platform',
    },
  ] as const;

  return (
    <div className="stack-24">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">{text.home.kicker}</span>
          <h1>{text.home.title}</h1>
          <p>{text.home.subtitle}</p>
          <div className="action-row">
            <Link className="button primary" to="/catalog">
              {text.home.primaryCta}
            </Link>
            {!isAuthenticated ? (
              <Link className="button secondary" to="/login">
                {text.home.secondaryCta}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero-panel">
          <div className="glass-panel brand-panel">
            <div className="brand-feature">
              <span className="brand-mark brand-mark--hero">
                <BrandLogo variant="hero" />
              </span>
              <div className="brand-feature-copy">
                <span className="panel-kicker">{brand.nameEnCompact}</span>
                <strong className="brand-feature-name">{brand.nameCn}</strong>
                <span className="brand-feature-en">{brand.nameEn}</span>
                <p className="brand-feature-slogan">{brand.sloganCn}</p>
                <p className="brand-feature-note">{brand.sloganEn}</p>
              </div>
            </div>
            <div className="brand-signal-list" aria-label="Brand capability highlights">
              <span className="brand-signal">Headless Billing</span>
              <span className="brand-signal">Provisioning Orchestrator</span>
              <span className="brand-signal">Service Control API</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-frame section-shell">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{text.common.sourceMode}</p>
            <h2>{`${brand.nameCn} Headless`}</h2>
          </div>
        </div>
        <div className="metrics-grid">
          {metricCards.map((item) => (
            <article className={`metric-card metric-card--${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.hint}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-frame section-shell section-products">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.home.featuredTitle}</p>
            <h2>{text.home.featuredSubtitle}</h2>
          </div>
        </div>
        <div className="card-grid product-grid">
          {hasProducts ? (
            featuredProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="chip-row">
                  {product.category ? (
                    <span className="chip">
                      {localizeText(product.category.name, locale, product.category.name)}
                    </span>
                  ) : null}
                  <span className="chip">
                    {localizeText(product.pricing?.planName ?? '', locale, text.common.defaultPlan)}
                  </span>
                </div>
                <h3>{localizeText(product.name, locale, product.name)}</h3>
                <p>{localizeText(product.description, locale, product.description)}</p>
                <div className="card-footer">
                  <strong>
                    {formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}
                  </strong>
                  <Link className="button ghost" to={`/product/${product.slug}`}>
                    {text.common.view}
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <article className="product-card">
              <h3>{emptyProductsTitle(locale)}</h3>
              <p>{emptyProductsBody(locale)}</p>
              <div className="card-footer">
                <Link className="button secondary" to="/catalog">
                  {text.nav.catalog}
                </Link>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="section-frame section-shell section-categories">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.home.categoryTitle}</p>
            <h2>{text.home.categorySubtitle}</h2>
          </div>
        </div>
        <div className="card-grid category-grid">
          {hasCategories ? (
            categories.map((category) => (
              <article className="category-card" key={category.id}>
                <h3>{localizeText(category.name, locale, category.name)}</h3>
                <p>{localizeText(category.description, locale, category.description)}</p>
                <strong>
                  {category.productCount} {text.common.products}
                </strong>
                <Link className="button ghost" to={`/catalog/${category.slug}`}>
                  {text.common.open}
                </Link>
              </article>
            ))
          ) : (
            <article className="category-card">
              <h3>{emptyCategoriesTitle(locale)}</h3>
              <p>{emptyCategoriesBody(locale)}</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
