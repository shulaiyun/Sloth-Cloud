import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { requestJson, useApiData } from '../lib/api';
import { localizeApiError } from '../lib/error-messages';
import { useAuth } from '../lib/auth-context';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { CheckoutField, ConfigOption, ProductDetailResponse } from '../lib/types';

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

function isOptionSelectable(option: ConfigOption) {
  return ['select', 'radio'].includes(option.type);
}

function normalizeCheckoutValue(field: CheckoutField, value: string) {
  if (field.type === 'number') {
    return value.length > 0 ? Number(value) : null;
  }

  if (field.type === 'checkbox') {
    return value === '1';
  }

  return value;
}

export function ProductPage() {
  const { productSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { text, formatMoney, locale } = useSite();
  const { isAuthenticated } = useAuth();
  const { data, error, loading } = useApiData<ProductDetailResponse>(
    productSlug ? `/api/v1/catalog/products/${productSlug}` : null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [formState, setFormState] = useState<Record<string, string | null>>({});
  const [checkoutForm, setCheckoutForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

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
    setFormState(Object.fromEntries(
      product.configOptions
        .filter(isOptionSelectable)
        .map((option) => [option.id, option.children[0]?.id ?? null]),
    ));
    setCheckoutForm(Object.fromEntries(
      product.checkoutFields.map((field) => [field.name, field.default === null ? '' : String(field.default)]),
    ));
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

  function buildCartPayload() {
    if (!product || !selectedPlan) {
      return null;
    }

    const configOptions = Object.fromEntries(
      Object.entries(formState).filter(([, value]) => value !== null && value !== ''),
    );
    const checkoutConfig = Object.fromEntries(
      Object.entries(checkoutForm).map(([key, value]) => {
        const field = product.checkoutFields.find((entry) => entry.name === key);
        if (!field) {
          return [key, value];
        }

        return [key, normalizeCheckoutValue(field, value)];
      }),
    );

    return {
      productSlug: product.slug,
      planId: selectedPlan.id,
      quantity: 1,
      configOptions,
      checkoutConfig,
    };
  }

  async function addToCart() {
    if (!product || !selectedPlan) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const payload = buildCartPayload();
      if (!payload) {
        return;
      }

      await requestJson('/api/v1/cart/items', {
        method: 'POST',
        body: payload,
      });

      setSubmitSuccess(text.product.addSuccess);
    } catch (caughtError) {
      setSubmitError(localizeApiError(caughtError, text, locale));
    } finally {
      setSubmitting(false);
    }
  }

  async function goCheckoutWithCurrentConfig() {
    if (!product || !selectedPlan) {
      navigate('/checkout');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const payload = buildCartPayload();
      if (!payload) {
        navigate('/checkout');
        return;
      }

      await requestJson('/api/v1/cart/items', {
        method: 'POST',
        body: payload,
      });

      navigate('/checkout');
    } catch (caughtError) {
      const message = localizeApiError(caughtError, text, locale);
      const normalized = message.toLowerCase();

      if (
        normalized.includes('already in your cart')
        || normalized.includes('cannot be added again')
        || normalized.includes('already in cart')
      ) {
        navigate('/checkout');
        return;
      }

      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !product) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  return (
    <div className="stack-24">
      <section className="detail-hero">
        <div className="stack-16 detail-copy">
          <Link className="text-link" to="/catalog">{text.common.backToCatalog}</Link>
          <div className="chip-row">
            {product.category ? <span className="chip">{localizeText(product.category.name, locale, product.category.name)}</span> : null}
            <span className="chip">{text.common.stock}: {product.stock ?? '-'}</span>
          </div>
          <h1>{localizeText(product.name, locale, product.name)}</h1>
          <p className="lead">{localizeText(product.description, locale, product.description)}</p>
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
            <div className="stack-12">
              <button className="button primary" disabled={submitting} type="button" onClick={() => void addToCart()}>
                {submitting ? `${text.product.addToCart}...` : text.product.addToCart}
              </button>
              <button
                className="button secondary"
                disabled={submitting}
                type="button"
                onClick={() => void goCheckoutWithCurrentConfig()}
              >
                {text.product.goCheckout}
              </button>
            </div>
          )}
          {submitSuccess ? <div className="callout compact">{submitSuccess}</div> : null}
          {submitError ? <div className="error-card compact">{submitError}</div> : null}
        </aside>
      </section>

      <section className="two-column">
        <div className="section-frame stack-20">
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
                <strong>{localizeText(plan.name, locale, plan.name)}</strong>
                <span>{cycleLabel(plan.billingPeriod, plan.billingUnit, text.common.customBilling)}</span>
                <small>{formatMoney(plan.prices[0]?.price ?? null, plan.prices[0]?.currencyCode ?? 'USD')}</small>
              </button>
            ))}
          </div>

          {[...product.operatingSystemOptions, ...extraOptions].map((option) => (
            <div className="option-card" key={option.id}>
              <div className="stack-8">
                <strong>{localizeText(option.name, locale, option.name)}</strong>
                <p className="muted">{localizeText(option.description, locale, option.description)}</p>
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
                      <strong>{localizeText(choice.name, locale, choice.name)}</strong>
                      {choice.description ? <span>{localizeText(choice.description, locale, choice.description)}</span> : null}
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

          {product.checkoutFields.length > 0 ? (
            <div className="stack-16">
              <p className="eyebrow">{text.product.config}</p>
              {product.checkoutFields.map((field) => (
                <label className="field" key={field.name}>
                  <span>{localizeText(field.label, locale, field.label)}</span>
                  {field.type === 'select' ? (
                    <select
                      className="text-input select-input"
                      value={checkoutForm[field.name] ?? ''}
                      onChange={(event) => setCheckoutForm((state) => ({ ...state, [field.name]: event.target.value }))}
                    >
                      <option value="">-</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>{localizeText(option.label, locale, option.label)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="text-input"
                      type={field.type === 'number' ? 'number' : 'text'}
                      required={field.required}
                      placeholder={localizeText(field.placeholder, locale, field.placeholder ?? '')}
                      value={checkoutForm[field.name] ?? ''}
                      onChange={(event) => setCheckoutForm((state) => ({ ...state, [field.name]: event.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="stack-20">
          <section className="panel stack-12">
            <p className="eyebrow">{text.product.details}</p>
            <div className="bullet-list">
              <span>{text.common.slug}: {product.slug}</span>
              <span>{text.common.allowQuantity}: {(product.allowQuantityMode ?? 'disabled') !== 'disabled' ? text.common.yes : text.common.no}</span>
              <span>{text.common.perUserLimit}: {product.perUserLimit ?? '-'}</span>
              <span>{text.product.loginHint}</span>
            </div>
          </section>

          <section className="panel stack-12">
            <p className="eyebrow">{text.product.summary}</p>
            <div className="chip-row">
              {product.operatingSystemOptions.slice(0, 3).map((option) => (
                <span className="chip" key={option.id}>{localizeText(option.name, locale, option.name)}</span>
              ))}
            </div>
            <p className="muted">{text.footer.statement}</p>
          </section>
        </div>
      </section>
    </div>
  );
}
