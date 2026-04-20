import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import { useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { billingCycleLabel, getUiText, productLineFor, productLineLabel } from '../lib/ui-text';
import { useSite } from '../lib/site-context';
import { getCountryMeta, getOsVisual, inferCountryCode } from '../lib/visual-metadata';
import type { CatalogCategoriesResponse, CatalogProductsResponse } from '../lib/types';

function productCountryCode(
  product: CatalogProductsResponse['data'][number],
  locale: ReturnType<typeof useSite>['locale'],
) {
  return product.countryCode
    ?? product.category?.countryCode
    ?? inferCountryCode(
      product.slug,
      product.category?.slug,
      localizeText(product.name, locale, ''),
      localizeText(product.description, locale, ''),
    );
}

function productMatchesCategorySlug(
  product: CatalogProductsResponse['data'][number],
  categorySlug: string | undefined,
) {
  if (!categorySlug) {
    return true;
  }
  return product.category?.slug === categorySlug;
}

export function CatalogPage() {
  const { categorySlug } = useParams();
  if (categorySlug === 'app-hosting') {
    return <Navigate replace to="/operator" />;
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const { text, formatMoney, locale } = useSite();
  const ui = getUiText(locale);
  const queryNode = (searchParams.get('node') ?? '').trim().toUpperCase();
  const [nodeFilter, setNodeFilter] = useState<string>(queryNode || 'all');
  const categoriesState = useApiData<CatalogCategoriesResponse>('/api/v1/catalog/categories');
  const productsState = useApiData<CatalogProductsResponse>('/api/v1/catalog/products');
  const categories = Array.isArray(categoriesState.data?.data) ? categoriesState.data.data : [];
  const products = Array.isArray(productsState.data?.data) ? productsState.data.data : [];
  const selectedCategory = categories.find((category) => category.slug === categorySlug) ?? null;
  const vpsProducts = useMemo(
    () => products.filter((product) => productLineFor(product.category?.slug, product.slug) === 'vps'),
    [products],
  );

  const nodeMarkets = useMemo(() => {
    const map = new Map<string, {
      code: string;
      countryName: string;
      count: number;
      productSlug: string | null;
      sampleTitle: string;
    }>();

    for (const product of vpsProducts) {
      const code = productCountryCode(product, locale);
      if (!code) {
        continue;
      }

      const country = getCountryMeta(code);
      if (!country) {
        continue;
      }

      const existing = map.get(code) ?? {
        code,
        countryName: country.name,
        count: 0,
        productSlug: null,
        sampleTitle: localizeText(product.name, locale, ui.common.unnamedProduct),
      };

      existing.count += 1;
      existing.productSlug ??= product.slug;
      map.set(code, existing);
    }

    return [...map.values()].sort((left, right) => right.count - left.count || left.countryName.localeCompare(right.countryName));
  }, [locale, ui.common.unnamedProduct, vpsProducts]);

  useEffect(() => {
    if (queryNode && queryNode !== nodeFilter) {
      setNodeFilter(queryNode);
    }
  }, [nodeFilter, queryNode]);

  useEffect(() => {
    const routeCountry = selectedCategory?.countryCode?.toUpperCase() ?? null;
    if (!queryNode && routeCountry && nodeFilter === 'all') {
      setNodeFilter(routeCountry);
    }
  }, [nodeFilter, queryNode, selectedCategory?.countryCode]);

  useEffect(() => {
    if (nodeFilter !== 'all' && !nodeMarkets.some((node) => node.code === nodeFilter)) {
      setNodeFilter('all');
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('node');
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [nodeFilter, nodeMarkets, searchParams, setSearchParams]);

  const filteredVpsProducts = useMemo(() => {
    const byCategory = vpsProducts.filter((product) => productMatchesCategorySlug(product, categorySlug));
    if (nodeFilter === 'all') {
      return byCategory;
    }
    return byCategory.filter((product) => productCountryCode(product, locale) === nodeFilter);
  }, [categorySlug, locale, nodeFilter, vpsProducts]);

  function applyNodeFilter(nextCode: string) {
    setNodeFilter(nextCode);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextCode === 'all') {
      nextSearchParams.delete('node');
    } else {
      nextSearchParams.set('node', nextCode);
    }
    setSearchParams(nextSearchParams, { replace: true });
  }

  function renderProductList(items: CatalogProductsResponse['data']) {
    if (items.length === 0) {
      return (
        <article className="empty-state">
          <h3>{ui.catalog.noProducts}</h3>
          <p>{text.catalog.noProducts}</p>
        </article>
      );
    }

    return (
      <section className="product-list">
        {items.map((product) => {
          const line = productLineFor(product.category?.slug, product.slug);
          const countryCode = productCountryCode(product, locale);
          const country = getCountryMeta(countryCode);
          const osVisual = line === 'vps'
            ? getOsVisual(product.selectedOs ?? `${localizeText(product.name, locale, '')} ${localizeText(product.description, locale, '')}`)
            : null;
          return (
            <article className="product-row-card" key={product.id}>
              <div>
                <div className="chip-row">
                  <span className="chip">{productLineLabel(line, locale)}</span>
                  {product.category ? (
                    <span className="chip">{localizeText(product.category.name, locale, ui.common.unnamedCategory)}</span>
                  ) : null}
                  <span className="chip">{ui.catalog.stock}: {product.stock ?? '-'}</span>
                  {countryCode && country ? (
                    <span className="chip chip--visual">
                      <CountryFlagIcon countryCode={countryCode} />
                      <span>{country.name}</span>
                    </span>
                  ) : null}
                  {osVisual?.family ? (
                    <span className="chip chip--visual">
                      <VisualIcon glyph={osVisual.glyph} label={osVisual.family} size="sm" src={osVisual.src} tone={osVisual.tone} />
                      <span>{osVisual.family}</span>
                    </span>
                  ) : null}
                </div>
                <h3>{localizeText(product.name, locale, ui.common.unnamedProduct)}</h3>
                <p>{localizeText(product.description, locale, '')}</p>
              </div>
              <div className="product-row-card__aside">
                <strong>{formatMoney(product.pricing?.price ?? null, product.pricing?.currencyCode ?? 'USD')}</strong>
                <span className="muted">
                  {billingCycleLabel(
                    product.pricing?.billingPeriod ?? null,
                    product.pricing?.billingUnit ?? null,
                    text.common.customBilling,
                    locale,
                  )}
                </span>
                <Link className="button primary" to={`/product/${product.slug}`}>
                  {text.common.inspect}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    );
  }

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
    <div className="stack-32 catalog-page">
      <section className="page-section page-section--intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? 'VPS 商品目录' : 'VPS catalog'}</p>
            <h1>{locale.startsWith('zh') ? '先按节点和规格选 VPS，应用生成入口统一走 AI 工作台' : 'Browse VPS by location and size, then use the AI workspace for app generation'}</h1>
          </div>
        </div>
        <article className="summary-card stack-12">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? 'AI 工作台' : 'AI Workspace'}</p>
            <h2>{locale.startsWith('zh') ? '想先让 AI 帮你生成一个应用？' : 'Want AI to generate an app first?'}</h2>
            <p className="muted">
              {locale.startsWith('zh')
                ? '应用、小游戏、活动页和旧服务接管都统一从 AI 工作台进入。那里会先给计划，再确认启动真实生成任务与共享预览。'
                : 'Apps, mini games, launch pages, and server takeovers all start in the AI workspace. You get a plan first, then confirm the real build task and shared preview.'}
            </p>
          </div>
          <div className="action-row">
            <Link className="button primary" to="/operator">
              {locale.startsWith('zh') ? '进入 AI 工作台' : 'Open AI workspace'}
            </Link>
            <Link className="button secondary" to="/">
              {locale.startsWith('zh') ? '返回首页' : 'Back home'}
            </Link>
          </div>
        </article>

        {nodeMarkets.length > 0 ? (
          <div className="filter-row filter-row--nodes">
            <button
              className={`filter-pill ${nodeFilter === 'all' ? 'active' : ''}`}
              type="button"
              onClick={() => applyNodeFilter('all')}
            >
              {locale.startsWith('zh') ? '全部节点' : 'All locations'}
            </button>
            {nodeMarkets.map((node) => (
              <button
                className={`filter-pill filter-pill--visual ${nodeFilter === node.code ? 'active' : ''}`}
                key={node.code}
                type="button"
                onClick={() => applyNodeFilter(node.code)}
              >
                <CountryFlagIcon countryCode={node.code} />
                <span>{node.countryName}</span>
                <small>{node.count}</small>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="page-section">
        {renderProductList(filteredVpsProducts)}
      </section>
    </div>
  );
}
