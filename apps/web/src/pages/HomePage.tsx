import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';
import type { HomeResponse } from '../lib/types';

export function HomePage() {
  const { text, formatMoney } = useSite();
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<HomeResponse>('/api/v1/catalog/home');

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

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
          <div className="glass-panel">
            <span className="panel-kicker">{data.data.brand.subtitle}</span>
            <strong>{data.data.brand.name}</strong>
            <p>{data.data.brand.statement}</p>
            <div className="chip-row">
              {data.data.categories.slice(0, 3).map((item) => (
                <span className="chip" key={item.id}>{item.name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {data.data.stats.map((item) => (
          <article className="metric-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.hint}</p>
          </article>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.home.featuredTitle}</p>
            <h2>{text.home.featuredSubtitle}</h2>
          </div>
        </div>
        <div className="card-grid product-grid">
          {data.data.featuredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="chip-row">
                {product.category ? <span className="chip">{product.category.name}</span> : null}
                <span className="chip">{product.pricing?.planName ?? text.common.defaultPlan}</span>
              </div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="card-footer">
                <strong>{formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}</strong>
                <Link className="button ghost" to={`/product/${product.slug}`}>{text.common.view}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.home.categoryTitle}</p>
            <h2>{text.home.categorySubtitle}</h2>
          </div>
        </div>
        <div className="card-grid category-grid">
          {data.data.categories.map((category) => (
            <article className="category-card" key={category.id}>
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              <strong>{category.productCount} {text.common.products}</strong>
              <Link className="button ghost" to={`/catalog/${category.slug}`}>{text.common.open}</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
