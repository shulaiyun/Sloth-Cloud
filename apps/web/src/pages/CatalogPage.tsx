import { Link, useParams } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { CatalogCategoriesResponse, CatalogProductsResponse } from '../lib/types';

function billingLabel(period: number | null, unit: string | null, fallback: string) {
  if (!period || !unit) {
    return fallback;
  }

  return `${period} ${unit}`;
}

export function CatalogPage() {
  const { categorySlug } = useParams();
  const { text, formatMoney, locale } = useSite();
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
      <section className="section-frame section-shell">
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
              {localizeText(category.name, locale, category.name)}
            </Link>
          ))}
        </div>
      </section>

      {productsState.data.data.length === 0 ? (
        <div className="callout">{text.catalog.noProducts}</div>
      ) : (
        <section className="section-frame section-shell section-products">
          <div className="section-heading">
            <div>
              <p className="section-kicker">{text.catalog.allProducts}</p>
              <h2>{text.catalog.subtitle}</h2>
            </div>
            <span className="chip">{productsState.data.pagination?.total ?? productsState.data.data.length} {text.common.products}</span>
          </div>
          <div className="card-grid product-grid">
          {productsState.data.data.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="chip-row">
                {product.category ? <span className="chip">{localizeText(product.category.name, locale, product.category.name)}</span> : null}
                <span className="chip">{text.common.stock}: {product.stock ?? '-'}</span>
              </div>
              <h3>{localizeText(product.name, locale, product.name)}</h3>
              <p>{localizeText(product.description, locale, product.description)}</p>
              <div className="card-footer">
                <div>
                  <strong>{formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}</strong>
                  <p className="muted">
                    {billingLabel(product.pricing?.billingPeriod ?? null, product.pricing?.billingUnit ?? null, text.common.customBilling)}
                  </p>
                </div>
                <Link className="button ghost" to={`/product/${product.slug}`}>{text.common.inspect}</Link>
              </div>
            </article>
          ))}
          </div>
        </section>
      )}
    </div>
  );
}
