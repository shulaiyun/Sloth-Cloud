import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { HomeResponse } from '../lib/types';

export function HomePage() {
  const { text, formatMoney } = useSite();
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
            <Link className="button secondary" to="/services/10001">{text.home.secondaryCta}</Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="glass-panel">
            <span className="panel-kicker">{data.brand.subtitle}</span>
            <strong>{data.brand.name}</strong>
            <p>{data.brand.statement}</p>
            <div className="chip-row">
              {data.categories.slice(0, 3).map((item) => (
                <span className="chip" key={item.id}>{item.name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {data.stats.map((item) => (
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
          {data.featuredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="chip-row">
                {product.regionTags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}
              </div>
              <h3>{product.name}</h3>
              <p className="muted">{product.tagline}</p>
              <p>{product.description}</p>
              <div className="highlight-list">
                {product.highlights.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="card-footer">
                <strong>{formatMoney(product.startingPrice, product.currency)} {text.common.startingFrom}</strong>
                <Link className="button ghost" to={`/product/${product.slug}`}>View</Link>
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
          {data.categories.map((category) => (
            <article className="category-card" key={category.id}>
              <span className={`accent-dot accent-${category.accent}`} />
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              <strong>{category.heroMetric}</strong>
              <div className="chip-row">
                {category.regionTags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}
              </div>
              <Link className="button ghost" to={`/catalog/${category.slug}`}>Open</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

