import { Link, useParams } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { CatalogCategoriesResponse, CatalogProductsResponse } from '../lib/types';

function billingLabel(period: number | null, unit: string | null) {
  if (!period || !unit) {
    return 'Custom billing';
  }

  return `${period} ${unit}`;
}

export function CatalogPage() {
  const { categorySlug } = useParams();
  const { text, formatMoney } = useSite();
  const categoriesState = useApiData<CatalogCategoriesResponse>('/api/v1/catalog/categories');
  const productsState = useApiData<CatalogProductsResponse>(
    categorySlug
      ? `/api/v1/catalog/products?category=${encodeURIComponent(categorySlug)}`
      : '/api/v1/catalog/products',
  );

  if (categoriesState.loading || productsState.loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (categoriesState.error || productsState.error) {
    return <div className="error-card">{text.common.error}: {categoriesState.error ?? productsState.error}</div>;
  }

  if (!categoriesState.data || !productsState.data) {
    return <div className="error-card">{text.common.error}</div>;
  }

  return (
    <div className="stack-24">
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.catalog.title}</p>
            <h1>{text.catalog.subtitle}</h1>
          </div>
        </div>

        <div className="filter-row">
          <Link className={`filter-pill ${!categorySlug ? 'active' : ''}`} to="/catalog">
            {text.catalog.allProducts}
          </Link>
          {categoriesState.data.data.map((category) => (
            <Link
              className={`filter-pill ${categorySlug === category.slug ? 'active' : ''}`}
              key={category.id}
              to={`/catalog/${category.slug}`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>

      {productsState.data.data.length === 0 ? (
        <div className="callout">{text.catalog.noProducts}</div>
      ) : (
        <section className="card-grid product-grid">
          {productsState.data.data.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="chip-row">
                {product.category ? <span className="chip">{product.category.name}</span> : null}
                <span className="chip">{text.catalog.stock}: {product.stock ?? '-'}</span>
              </div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="card-footer">
                <div>
                  <strong>{formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}</strong>
                  <p className="muted">{billingLabel(product.pricing?.billingPeriod ?? null, product.pricing?.billingUnit ?? null)}</p>
                </div>
                <Link className="button ghost" to={`/product/${product.slug}`}>Inspect</Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
