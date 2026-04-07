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

  const managedCategory = categoriesState.data.data.find((category) => category.slug === 'app-hosting') ?? null;
  const managedCategorySelected = categorySlug === 'app-hosting';

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

      <section className="section-frame section-shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? '\u6258\u7ba1\u5bb9\u5668\u4e91' : 'Managed App Hosting'}</p>
            <h2>
              {locale.startsWith('zh')
                ? '\u4e0b\u5355\u540e\u81ea\u52a8\u521b\u5efa\u9694\u79bb\u5e94\u7528\u8fd0\u884c\u73af\u5883'
                : 'Provision isolated app runtime after checkout'}
            </h2>
          </div>
          <Link className={`button ${managedCategorySelected ? 'secondary' : 'ghost'}`} to={managedCategory ? `/catalog/${managedCategory.slug}` : '/catalog'}>
            {locale.startsWith('zh') ? '\u67e5\u770b\u6258\u7ba1\u5957\u9910' : 'Browse managed plans'}
          </Link>
        </div>
        <div className="chip-row">
          <span className="chip">{locale.startsWith('zh') ? '\u5e94\u7528\u72b6\u6001' : 'App status'}</span>
          <span className="chip">{locale.startsWith('zh') ? '\u8bbf\u95ee\u5730\u5740' : 'Endpoint'}</span>
          <span className="chip">{locale.startsWith('zh') ? '\u65e5\u5fd7' : 'Logs'}</span>
          <span className="chip">{locale.startsWith('zh') ? '\u57df\u540d\u4e0e HTTPS' : 'Domain and HTTPS'}</span>
          <span className="chip">{locale.startsWith('zh') ? '\u6269\u5bb9\u80fd\u529b' : 'Scaling capability'}</span>
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
