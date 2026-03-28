import { Link } from 'react-router-dom';

import { BrandLogo } from '../components/BrandLogo';
import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
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
    },
    {
      label: text.home.featuredTitle,
      value: String(data.data.featuredProducts.length),
      hint: text.home.featuredSubtitle,
    },
    {
      label: text.common.sourceMode,
      value: data.meta.sourceMode === 'live' ? text.common.live : text.common.mock,
      hint: text.footer.statement,
    },
  ];

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
                <BrandLogo />
              </span>
              <div className="brand-feature-copy">
                <span className="panel-kicker">树懒云 / SLOTH CLOUD</span>
                <strong className="brand-feature-name">树懒云</strong>
                <span className="brand-feature-en">Sloth Cloud</span>
                <p>{text.footer.statement}</p>
              </div>
            </div>
            <div className="chip-row">
              {data.data.categories.slice(0, 3).map((item) => (
                <span className="chip" key={item.id}>
                  {localizeText(item.name, locale, item.name)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-frame section-shell">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{text.common.sourceMode}</p>
            <h2>{text.home.kicker}</h2>
          </div>
        </div>
        <div className="metrics-grid">
          {metricCards.map((item) => (
            <article className="metric-card" key={item.label}>
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
              <h3>暂无可售商品</h3>
              <p>请在管理后台创建商品并确保未勾选“隐藏产品”，同时至少配置一个可用价格。</p>
              <div className="card-footer">
                <Link className="button secondary" to="/catalog">刷新商店视图</Link>
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
              <h3>暂无可见分类</h3>
              <p>分类已经对接真实 API。若仍为 0，请检查分类下是否绑定了可见商品。</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
