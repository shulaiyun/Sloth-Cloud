import { Link } from 'react-router-dom';

import { BrandLogo } from '../components/BrandLogo';
import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { brand } from '../lib/brand';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { HomeResponse } from '../lib/types';

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

  const hasProducts = data.data.featuredProducts.length > 0;
  const hasCategories = data.data.categories.length > 0;

  const metricCards = [
    {
      label: text.home.categoryTitle,
      value: String(data.data.categories.length),
      hint: text.home.categorySubtitle,
      tone: 'catalog',
    },
    {
      label: text.home.featuredTitle,
      value: String(data.data.featuredProducts.length),
      hint: text.home.featuredSubtitle,
      tone: 'products',
    },
    {
      label: text.home.dataOverviewTitle,
      value: text.common.live,
      hint: text.home.dataOverviewSubtitle,
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
            <Link className="button primary" to="/catalog">{text.home.primaryCta}</Link>
            {!isAuthenticated ? <Link className="button secondary" to="/login">{text.home.secondaryCta}</Link> : null}
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
              <span className="brand-signal">{text.home.signalProvisioning}</span>
              <span className="brand-signal">{text.home.signalBilling}</span>
              <span className="brand-signal">{text.home.signalGlobal}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-frame section-shell">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{text.home.dataOverviewTitle}</p>
            <h2>{text.home.dataOverviewSubtitle}</h2>
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
          {hasProducts ? data.data.featuredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="chip-row">
                {product.category ? <span className="chip">{localizeText(product.category.name, locale, product.category.name)}</span> : null}
                <span className="chip">{localizeText(product.pricing?.planName ?? '', locale, text.common.defaultPlan)}</span>
              </div>
              <h3>{localizeText(product.name, locale, product.name)}</h3>
              <p>{localizeText(product.description, locale, product.description)}</p>
              <div className="card-footer">
                <strong>{formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}</strong>
                <Link className="button ghost" to={`/product/${product.slug}`}>{text.common.view}</Link>
              </div>
            </article>
          )) : (
            <article className="product-card">
              <h3>{text.home.emptyProductsTitle}</h3>
              <p>{text.home.emptyProductsBody}</p>
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
          {hasCategories ? data.data.categories.map((category) => (
            <article className="category-card" key={category.id}>
              <h3>{localizeText(category.name, locale, category.name)}</h3>
              <p>{localizeText(category.description, locale, category.description)}</p>
              <strong>{category.productCount} {text.common.products}</strong>
              <Link className="button ghost" to={`/catalog/${category.slug}`}>{text.common.open}</Link>
            </article>
          )) : (
            <article className="category-card">
              <h3>{text.home.emptyCategoriesTitle}</h3>
              <p>{text.home.emptyCategoriesBody}</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
