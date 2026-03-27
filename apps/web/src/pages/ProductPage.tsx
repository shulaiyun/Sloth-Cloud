import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';
import type { ConfigOption, ProductDetailResponse } from '../lib/types';

function optionDelta(option: ConfigOption, currentValue: string | null | undefined, planId: string | undefined) {
  if (!planId || option.children.length === 0) {
    return 0;
  }

  const selected = option.children.find((item) => item.id === currentValue);
  const pricing = selected?.pricing.find((entry) => entry.planId === planId);

  return pricing?.price ?? 0;
}

function cycleLabel(period: number | null, unit: string | null, fallback: string) {
  if (!period || !unit) {
    return fallback;
  }

  return `${period} ${unit}`;
}

export function ProductPage() {
  const { productSlug } = useParams();
  const location = useLocation();
  const { text, formatMoney } = useSite();
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<ProductDetailResponse>(
    productSlug ? `/api/v1/catalog/products/${productSlug}` : null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [formState, setFormState] = useState<Record<string, string | null>>({});

  const product = data?.data ?? null;
  const extraOptions = useMemo(() => {
    if (!product) {
      return [];
    }

    const operatingSystemIds = new Set(product.operatingSystemOptions.map((option) => option.id));
    return product.configOptions.filter((option) => !operatingSystemIds.has(option.id));
  }, [product]);

  useEffect(() => {
    if (!product) {
      return;
    }

    setSelectedPlanId(product.plans[0]?.id ?? '');
    setFormState(Object.fromEntries(product.configOptions.map((option) => [option.id, option.children[0]?.id ?? null])));
  }, [product]);

  const selectedPlan = useMemo(
    () => product?.plans.find((plan) => plan.id === selectedPlanId) ?? product?.plans[0],
    [product, selectedPlanId],
  );

  const total = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }

    const basePrice = selectedPlan.prices[0]?.price ?? 0;
    const configTotal = product?.configOptions.reduce((sum, option) => {
      return sum + optionDelta(option, formState[option.id], selectedPlan.id);
    }, 0) ?? 0;

    return basePrice + configTotal;
  }, [formState, product, selectedPlan]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !product) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  const sourceMode = data?.meta.sourceMode ?? 'live';

  return (
    <div className="stack-24">
      <section className="detail-hero">
        <div className="stack-16">
          <Link className="text-link" to="/catalog">{text.common.backToCatalog}</Link>
          <div className="chip-row">
            {product.category ? <span className="chip">{product.category.name}</span> : null}
            <span className="chip">{text.common.sourceMode}: {sourceMode === 'live' ? text.common.live : text.common.mock}</span>
            <span className="chip">{text.common.stock}: {product.stock ?? '-'}</span>
          </div>
          <h1>{product.name}</h1>
          <p className="lead">{product.description}</p>
        </div>
        <aside className="summary-card">
          <span className="eyebrow">{text.product.summary}</span>
          <strong className="price-large">
            {formatMoney(total, selectedPlan?.prices[0]?.currencyCode ?? 'USD')}
          </strong>
          <p>{cycleLabel(selectedPlan?.billingPeriod ?? null, selectedPlan?.billingUnit ?? null, text.common.customBilling)}</p>
          {!isAuthenticated ? (
            <Link className="button primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
              {text.common.loginRequired}
            </Link>
          ) : (
            <div className="callout compact">{text.product.checkoutPending}</div>
          )}
        </aside>
      </section>

      <section className="two-column">
        <div className="panel stack-20">
          <div>
            <p className="eyebrow">{text.product.plans}</p>
            <h2>{text.product.details}</h2>
          </div>
          <div className="choice-grid">
            {product.plans.map((plan) => (
              <button
                className={`choice-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
              >
                <strong>{plan.name}</strong>
                <span>{cycleLabel(plan.billingPeriod, plan.billingUnit, text.common.customBilling)}</span>
                <small>{formatMoney(plan.prices[0]?.price ?? null, plan.prices[0]?.currencyCode ?? 'USD')}</small>
              </button>
            ))}
          </div>

          {product.operatingSystemOptions.length > 0 ? (
            <div className="stack-16">
              <div>
                <p className="eyebrow">{text.product.os}</p>
                <h2>{text.product.config}</h2>
              </div>
              {product.operatingSystemOptions.map((option) => (
                <div className="option-card" key={option.id}>
                  <div className="stack-8">
                    <strong>{option.name}</strong>
                    <p className="muted">{option.description}</p>
                  </div>
                  <div className="choice-grid">
                    {option.children.map((choice) => (
                      <button
                        className={`choice-card compact ${formState[option.id] === choice.id ? 'selected' : ''}`}
                        key={choice.id}
                        type="button"
                        onClick={() => setFormState((state) => ({ ...state, [option.id]: choice.id }))}
                      >
                        <strong>{choice.name}</strong>
                        {choice.description ? <span>{choice.description}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {extraOptions.length === 0 ? (
            <div className="callout">{text.product.configEmpty}</div>
          ) : (
            <div className="stack-16">
              {extraOptions.map((option) => (
                <div className="option-card" key={option.id}>
                  <div className="stack-8">
                    <strong>{option.name}</strong>
                    <p className="muted">{option.description}</p>
                  </div>
                  {option.children.length > 0 ? (
                    <div className="choice-grid">
                      {option.children.map((choice) => (
                        <button
                          className={`choice-card compact ${formState[option.id] === choice.id ? 'selected' : ''}`}
                          key={`${option.id}-${choice.id}`}
                          type="button"
                          onClick={() => setFormState((state) => ({ ...state, [option.id]: choice.id }))}
                        >
                          <strong>{choice.name}</strong>
                          {choice.description ? <span>{choice.description}</span> : null}
                          {selectedPlan ? (
                            <small>
                              + {formatMoney(
                                choice.pricing.find((entry) => entry.planId === selectedPlan.id)?.price ?? 0,
                                selectedPlan.prices[0]?.currencyCode ?? 'USD',
                              )}
                            </small>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : <p className="muted">{text.product.configEmpty}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack-20">
          <section className="panel">
            <p className="eyebrow">{text.product.details}</p>
            <div className="bullet-list">
              <span>{text.common.slug}: {product.slug}</span>
              <span>{text.common.allowQuantity}: {product.allowQuantity ? text.common.yes : text.common.no}</span>
              <span>{text.common.perUserLimit}: {product.perUserLimit ?? '-'}</span>
              <span>{text.product.loginHint}</span>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
