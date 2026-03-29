import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { CartResponse, CheckoutResponse } from '../lib/types';

export function CheckoutPage() {
  const { text, formatMoney, locale } = useSite();
  const { data, error, loading } = useApiData<CartResponse>('/api/v1/cart');
  const [coupon, setCoupon] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<CheckoutResponse | null>(null);

  async function mutateCart(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setPending(true);
    setActionError(null);
    try {
      await requestJson(path, { method, body });
      window.location.reload();
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function placeOrder() {
    setPending(true);
    setActionError(null);
    setOrderResult(null);
    try {
      const response = await requestJson<CheckoutResponse>('/api/v1/checkout', {
        method: 'POST',
        body: { tos: true },
      });
      if (response.data.redirect.path) {
        window.location.assign(response.data.redirect.path);
        return;
      }
      setOrderResult(response);
    } catch (caughtError) {
      setActionError((caughtError as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  const cart = data.data;

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.checkout}</p>
          <h1>{text.checkout.title}</h1>
          <p className="muted">{text.checkout.subtitle}</p>
        </div>
      </section>

      {cart.items.length === 0 ? (
        <div className="callout">
          {text.checkout.empty} <Link className="text-link" to="/catalog">{text.nav.catalog}</Link>
        </div>
      ) : (
        <>
          <section className="section-frame section-shell section-products">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{text.nav.checkout}</p>
                <h2>{text.checkout.subtitle}</h2>
              </div>
              <span className="chip">{cart.items.length} {text.common.products}</span>
            </div>
            {cart.items.map((item) => (
              <article className="product-card" key={item.id}>
                <h3>{localizeText(item.product.name, locale, item.product.name)}</h3>
                <p>{localizeText(item.plan.name, locale, item.plan.name)}</p>
                <div className="card-footer">
                  <strong>{item.price?.formatted.total ?? formatMoney(item.price?.total ?? null, cart.currencyCode)}</strong>
                  <div className="action-row">
                    <button
                      className="button ghost"
                      disabled={pending || item.quantity <= 1}
                      type="button"
                      onClick={() => void mutateCart(`/api/v1/cart/items/${item.id}`, 'PATCH', { quantity: item.quantity - 1 })}
                    >
                      -
                    </button>
                    <span>{text.common.quantity}: {item.quantity}</span>
                    <button
                      className="button ghost"
                      disabled={pending}
                      type="button"
                      onClick={() => void mutateCart(`/api/v1/cart/items/${item.id}`, 'PATCH', { quantity: item.quantity + 1 })}
                    >
                      +
                    </button>
                    <button
                      className="button danger"
                      disabled={pending}
                      type="button"
                      onClick={() => void mutateCart(`/api/v1/cart/items/${item.id}`, 'DELETE')}
                    >
                      {text.common.remove}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="two-column">
            <div className="section-frame stack-12">
              <p className="eyebrow">{text.checkout.coupon}</p>
              <p className="muted">{text.checkout.couponHint}</p>
              <div className="action-row">
                <input className="text-input" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
                <button
                  className="button secondary"
                  disabled={pending || coupon.trim().length === 0}
                  type="button"
                  onClick={() => void mutateCart('/api/v1/cart/coupon', 'POST', { code: coupon.trim() })}
                >
                  {text.common.submit}
                </button>
                {cart.coupon ? (
                  <button
                    className="button danger"
                    disabled={pending}
                    type="button"
                    onClick={() => void mutateCart('/api/v1/cart/coupon', 'DELETE')}
                  >
                    {text.common.remove}
                  </button>
                ) : null}
              </div>
              {cart.coupon ? <div className="callout compact">#{cart.coupon.code}</div> : null}
            </div>

            <div className="summary-card">
              <span className="eyebrow">{text.common.total}</span>
              <strong className="price-large">{cart.totals?.formatted.total ?? formatMoney(cart.totals?.total ?? null, cart.currencyCode)}</strong>
              <button className="button primary" disabled={pending} type="button" onClick={() => void placeOrder()}>
                {pending ? text.checkout.placingOrder : text.checkout.placeOrder}
              </button>
            </div>
          </section>
        </>
      )}

      {actionError ? <div className="error-card">{actionError}</div> : null}

      {orderResult ? (
        <section className="callout">
          <p>{text.checkout.orderCreated}</p>
          <p>{text.checkout.redirectTo}: {orderResult.data.redirect.path}</p>
          <Link className="button primary" to={orderResult.data.redirect.path}>{text.checkout.redirectTo}</Link>
        </section>
      ) : null}
    </div>
  );
}
