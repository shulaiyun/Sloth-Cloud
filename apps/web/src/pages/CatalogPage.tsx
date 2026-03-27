import { Link, useParams } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { CatalogResponse, CategoryDetail } from '../lib/types';

export function CatalogPage() {
  const { categorySlug } = useParams();
  const { text, formatMoney } = useSite();
  const allCatalog = useApiData<CatalogResponse>('/api/v1/catalog/categories');
  const selectedCategory = useApiData<CategoryDetail>(
    categorySlug ? `/api/v1/catalog/categories/${categorySlug}` : null,
  );

  if (allCatalog.loading || selectedCategory.loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (allCatalog.error) {
    return <div className="error-card">{text.common.error}: {allCatalog.error}</div>;
  }

  if (!allCatalog.data) {
    return <div className="error-card">{text.common.error}</div>;
  }

  const products = categorySlug && selectedCategory.data
    ? selectedCategory.data.products
    : allCatalog.data.products;

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
          {allCatalog.data.categories.map((category) => (
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

      <section className="card-grid product-grid">
        {products.map((product) => (
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
              <div>
                <strong>{formatMoney(product.startingPrice, product.currency)}</strong>
                <p className="muted">{product.billingLabel}</p>
              </div>
              <Link className="button ghost" to={`/product/${product.slug}`}>Inspect</Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

