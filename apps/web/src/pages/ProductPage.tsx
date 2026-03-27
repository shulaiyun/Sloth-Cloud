import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { ConfigOption, ProductDetail } from '../lib/types';

function priceDelta(option: ConfigOption, currentValue: string | boolean | null | undefined) {
  if (!option.choices?.length) {
    return 0;
  }

  const selected = option.choices.find((item) => item.id === currentValue);
  return selected?.priceDelta ?? 0;
}

export function ProductPage() {
  const { productSlug } = useParams();
  const { text, formatMoney } = useSite();
  const { data, error, loading } = useApiData<ProductDetail>(
    productSlug ? `/api/v1/catalog/products/${productSlug}` : null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [formState, setFormState] = useState<Record<string, string | boolean | null>>({});

  useEffect(() => {
    if (!data) {
      return;
    }

    setSelectedPlanId(data.plans[0]?.id ?? '');
    setFormState(Object.fromEntries(data.configurableOptions.map((option) => [option.id, option.defaultValue ?? null])));
  }, [data]);

  const selectedPlan = useMemo(
    () => data?.plans.find((plan) => plan.id === selectedPlanId) ?? data?.plans[0],
    [data, selectedPlanId],
  );

  const total = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }

    const configTotal = data?.configurableOptions.reduce((sum, option) => sum + priceDelta(option, formState[option.id]), 0) ?? 0;
    return (selectedPlan.price ?? 0) + configTotal;
  }, [data, formState, selectedPlan]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  return (
    <div className="stack-24">
      <section className="detail-hero">
        <div className="stack-16">
          <Link className="text-link" to="/catalog">{text.common.backToCatalog}</Link>
          <div className="chip-row">
            <span className="chip">{data.billingLabel}</span>
            <span className="chip">{data.stockLabel}</span>
            <span className="chip">{text.common.sourceMode}: {data.sourceMode === 'live' ? text.common.live : text.common.mock}</span>
          </div>
          <h1>{data.name}</h1>
          <p className="lead">{data.description}</p>
          <div className="highlight-list">
            {data.highlights.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <aside className="summary-card">
          <span className="eyebrow">{text.product.summary}</span>
          <strong className="price-large">{formatMoney(total, data.currency)}</strong>
          <p>{selectedPlan?.cycleLabel ?? data.billingLabel}</p>
          <button className="button primary" type="button" disabled>{text.product.provisionalAction}</button>
        </aside>
      </section>

      <section className="two-column">
        <div className="panel stack-20">
          <div>
            <p className="eyebrow">{text.product.plans}</p>
            <h2>{text.product.choosePlan}</h2>
          </div>
          <div className="choice-grid">
            {data.plans.map((plan) => (
              <button
                className={`choice-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
              >
                <strong>{plan.name}</strong>
                <span>{plan.cycleLabel}</span>
                <small>{formatMoney(plan.price, plan.currency)}</small>
              </button>
            ))}
          </div>

          <div>
            <p className="eyebrow">{text.product.config}</p>
            <h2>{text.product.title}</h2>
          </div>

          {data.configurableOptions.length === 0 ? (
            <div className="callout">{text.product.noConfig}</div>
          ) : (
            <div className="stack-16">
              {data.configurableOptions.map((option) => (
                <div className="option-card" key={option.id}>
                  <div className="stack-8">
                    <strong>{option.name}</strong>
                    <p className="muted">{option.description}</p>
                  </div>
                  {option.type === 'checkbox' ? (
                    <label className="checkbox-row">
                      <input
                        checked={Boolean(formState[option.id])}
                        onChange={(event) => setFormState((state) => ({ ...state, [option.id]: event.target.checked }))}
                        type="checkbox"
                      />
                      <span>Enable</span>
                    </label>
                  ) : option.type === 'text' ? (
                    <input
                      className="text-input"
                      onChange={(event) => setFormState((state) => ({ ...state, [option.id]: event.target.value }))}
                      value={String(formState[option.id] ?? '')}
                    />
                  ) : (
                    <div className="choice-grid">
                      {option.choices?.map((choice) => (
                        <button
                          className={`choice-card compact ${formState[option.id] === choice.id ? 'selected' : ''}`}
                          key={choice.id}
                          type="button"
                          onClick={() => setFormState((state) => ({ ...state, [option.id]: choice.id }))}
                        >
                          <strong>{choice.label}</strong>
                          {choice.description ? <span>{choice.description}</span> : null}
                          {choice.priceDelta ? <small>+ {formatMoney(choice.priceDelta, data.currency)}</small> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack-20">
          <section className="panel">
            <p className="eyebrow">{text.product.features}</p>
            <div className="bullet-list">
              {data.features.map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>
          <section className="panel">
            <p className="eyebrow">{text.product.notes}</p>
            <div className="bullet-list">
              {data.purchaseNotes.map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

