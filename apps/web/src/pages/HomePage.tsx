import { Link } from 'react-router-dom';

import { BrandLogo } from '../components/BrandLogo';
import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { brand } from '../lib/brand';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { HomeResponse } from '../lib/types';

const emptyProductsTitle = '\u6682\u65e0\u53ef\u552e\u5546\u54c1';
const emptyProductsBody = '\u8bf7\u5728\u7ba1\u7406\u540e\u53f0\u521b\u5efa\u5546\u54c1\u5e76\u786e\u4fdd\u672a\u52fe\u9009\u201c\u9690\u85cf\u4ea7\u54c1\u201d\uff0c\u540c\u65f6\u81f3\u5c11\u914d\u7f6e\u4e00\u4e2a\u53ef\u7528\u4ef7\u683c\u3002';
const refreshCatalogText = '\u5237\u65b0\u5546\u5e97\u89c6\u56fe';
const emptyCategoriesTitle = '\u6682\u65e0\u53ef\u89c1\u5206\u7c7b';
const emptyCategoriesBody = '\u5206\u7c7b\u5df2\u7ecf\u5bf9\u63a5\u771f\u5b9e API\u3002\u82e5\u4ecd\u4e3a 0\uff0c\u8bf7\u68c0\u67e5\u5206\u7c7b\u4e0b\u662f\u5426\u7ed1\u5b9a\u4e86\u53ef\u89c1\u5546\u54c1\u3002';
const homeHeadlessLabel = `Headless \u5ba2\u6237\u7aef`;

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
              <span className="brand-signal">Headless Billing</span>
              <span className="brand-signal">Catalog API</span>
              <span className="brand-signal">Edge Session</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-frame section-shell">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{text.common.sourceMode}</p>
            <h2>{`${brand.nameCn} ${homeHeadlessLabel}`}</h2>
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
              <h3>{emptyProductsTitle}</h3>
              <p>{emptyProductsBody}</p>
              <div className="card-footer">
                <Link className="button secondary" to="/catalog">{refreshCatalogText}</Link>
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
          {hasCategories ? data.data.categories.map((category) => (
            <article className="category-card" key={category.id}>
              <h3>{localizeText(category.name, locale, category.name)}</h3>
              <p>{localizeText(category.description, locale, category.description)}</p>
              <strong>{category.productCount} {text.common.products}</strong>
              <Link className="button ghost" to={`/catalog/${category.slug}`}>{text.common.open}</Link>
            </article>
          )) : (
            <article className="category-card">
              <h3>{emptyCategoriesTitle}</h3>
              <p>{emptyCategoriesBody}</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
