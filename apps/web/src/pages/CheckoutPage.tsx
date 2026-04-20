import { useState } from 'react';
import { Link } from 'react-router-dom';

import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import { getUiText } from '../lib/ui-text';
import { getAppVisual, getCountryMeta, getOsVisual, inferCountryCode, maskSensitiveValue } from '../lib/visual-metadata';
import type { CartItemSummary, CartResponse, CheckoutResponse } from '../lib/types';

function checkoutConfigLabel(key: string, locale: string) {
  const normalized = key.trim().toLowerCase();
  if (normalized === 'operator_capsule_name') return locale.startsWith('zh') ? 'AI 项目' : 'AI project';
  if (normalized === 'operator_entry_kind') return locale.startsWith('zh') ? '上线来源' : 'Launch source';
  if (normalized === 'operator_stack') return locale.startsWith('zh') ? '技术栈' : 'Stack';
  if (normalized === 'operator_business_path') return locale.startsWith('zh') ? '开通路径' : 'Business path';
  if (normalized === 'operator_business_label') return locale.startsWith('zh') ? '交付方式' : 'Delivery path';
  if (normalized === 'operator_source') return locale.startsWith('zh') ? '项目来源' : 'Source';
  if (normalized === 'operator_preview_url') return locale.startsWith('zh') ? '预览地址' : 'Preview URL';
  if (normalized === 'operator_production_url') return locale.startsWith('zh') ? '正式地址' : 'Production URL';
  if (normalized === 'operator_plan_summary') return locale.startsWith('zh') ? 'AI 计划摘要' : 'AI plan';
  if (normalized === 'operator_project_bundle_url') return locale.startsWith('zh') ? 'AI 源码包' : 'AI source bundle';
  if (normalized === 'operator_project_manifest_url') return locale.startsWith('zh') ? '源码清单' : 'Package manifest';
  if (normalized === 'operator_project_archive_name') return locale.startsWith('zh') ? '归档文件' : 'Archive name';
  if (normalized === 'operator_project_entry_file') return locale.startsWith('zh') ? '入口文件' : 'Entry file';
  if (normalized === 'operator_project_file_count') return locale.startsWith('zh') ? '文件数量' : 'File count';
  if (normalized === 'git_repo_url') return locale.startsWith('zh') ? '代码仓库' : 'Git repo';
  if (normalized === 'git_branch') return locale.startsWith('zh') ? '代码分支' : 'Git branch';
  if (normalized === 'runtime_port') return locale.startsWith('zh') ? '运行端口' : 'Runtime port';
  if (normalized === 'workload_mode') return locale.startsWith('zh') ? '工作负载' : 'Workload';
  if (normalized === 'os') return locale.startsWith('zh') ? '操作系统' : 'Operating system';
  if (normalized === 'hostname') return locale.startsWith('zh') ? '主机名' : 'Hostname';
  if (normalized === 'primary_app_slug') return locale.startsWith('zh') ? '主应用' : 'Primary app';
  if (normalized === 'addon_app_slugs') return locale.startsWith('zh') ? '附加组件' : 'Addons';
  return key;
}

function checkoutConfigValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function normalizeCheckoutToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function operatorCheckoutConfigValue(token: string, value: unknown, locale: string) {
  const text = checkoutConfigValue(value);
  const zh = locale.startsWith('zh');

  if (token === 'operator_entry_kind') {
    if (text === 'upload-project') return zh ? '项目文件 / 仓库上线' : 'Project upload';
    if (text === 'generate-from-idea') return zh ? '想法生成项目' : 'Idea to project';
    if (text === 'scan-server') return zh ? '旧服务器迁移' : 'Server migration';
  }

  if (token === 'operator_business_path') {
    if (text === 'ai-managed-launch' || text === 'ai managed launch' || text === 'managed app hosting') {
      return zh ? 'AI 托管上线' : 'AI managed launch';
    }
    if (text === 'vps-self-hosted' || text === 'vps self hosted') {
      return zh ? '购买 VPS 并迁移' : 'Buy VPS and migrate';
    }
    if (text === 'server-migration' || text === 'server migration') {
      return zh ? '接管旧服务器' : 'Existing server takeover';
    }
  }

  if (token === 'operator_business_label') {
    if (text === 'ai managed launch') return zh ? 'AI 托管上线' : 'AI managed launch';
    if (text === 'vps self hosted') return zh ? '购买 VPS 并迁移' : 'Buy VPS and migrate';
    if (text === 'server migration') return zh ? '接管旧服务器' : 'Existing server takeover';
  }

  return text;
}

type CheckoutSummaryEntry = {
  key: string;
  label: string;
  value: string;
  kind: 'node' | 'os' | 'app' | 'network' | 'password' | 'generic';
  countryCode?: string | null;
};

function summarizeCheckoutConfig(checkoutConfig: Record<string, unknown>, locale: string) {
  const summary: CheckoutSummaryEntry[] = [];

  for (const [key, rawValue] of Object.entries(checkoutConfig)) {
    const token = normalizeCheckoutToken(key);
    const value = token.startsWith('operator_')
      ? operatorCheckoutConfigValue(token, rawValue, locale)
      : checkoutConfigValue(rawValue);
    if (!value) {
      continue;
    }

    if (token === 'operator_capsule_id' || token === 'operator_business_label') {
      continue;
    }

    if (/(location|region|country|node)/.test(token)) {
      summary.push({
        key,
        label: locale.startsWith('zh') ? '节点' : 'Node',
        value,
        kind: 'node',
        countryCode: inferCountryCode(value),
      });
      continue;
    }

    if (/(^os$|selected_os|operating_system)/.test(token)) {
      summary.push({ key, label: 'OS', value, kind: 'os' });
      continue;
    }

    if (/(primary_app|addon_app)/.test(token)) {
      summary.push({ key, label: locale.startsWith('zh') ? '应用' : 'Apps', value, kind: 'app' });
      continue;
    }

    if (/(bandwidth|traffic|transfer|ip_count|ipv4_count|additional_ipv4|additional_ip)/.test(token)) {
      summary.push({ key, label: checkoutConfigLabel(key, locale), value, kind: 'network' });
      continue;
    }

    if (/password/.test(token)) {
      if (/confirmation|confirm/.test(token)) {
        continue;
      }
      summary.push({
        key,
        label: locale.startsWith('zh') ? '密码' : 'Password',
        value: maskSensitiveValue(value),
        kind: 'password',
      });
      continue;
    }

    if (token.startsWith('operator_')) {
      summary.push({
        key,
        label: checkoutConfigLabel(key, locale),
        value,
        kind: 'generic',
      });
      continue;
    }

    summary.push({
      key,
      label: checkoutConfigLabel(key, locale),
      value,
      kind: 'generic',
    });
  }

  return summary;
}

function summarizeConfigOptions(configOptions: CartItemSummary['configOptions'], locale: string) {
  const summary: CheckoutSummaryEntry[] = [];

  for (const option of configOptions) {
    const token = normalizeCheckoutToken(option.optionEnvVariable ?? option.optionName);
    const value = (option.valueName ?? option.value ?? '').trim();
    if (!value) {
      continue;
    }

    if (/(location|region|country|node)/.test(token)) {
      summary.push({
        key: `config-${option.optionId}`,
        label: locale.startsWith('zh') ? '节点' : 'Node',
        value,
        kind: 'node',
        countryCode: inferCountryCode(value, option.optionName),
      });
      continue;
    }

    if (/(^os$|selected_os|operating_system)/.test(token)) {
      summary.push({ key: `config-${option.optionId}`, label: 'OS', value, kind: 'os' });
      continue;
    }

    if (/(primary_app|addon_app)/.test(token)) {
      summary.push({ key: `config-${option.optionId}`, label: locale.startsWith('zh') ? '应用' : 'Apps', value, kind: 'app' });
      continue;
    }

    if (/(bandwidth|traffic|transfer|ip_count|ipv4_count|additional_ipv4|additional_ip|ipv4)/.test(token)) {
      summary.push({
        key: `config-${option.optionId}`,
        label: checkoutConfigLabel(option.optionEnvVariable ?? option.optionName, locale),
        value,
        kind: 'network',
      });
      continue;
    }

    summary.push({
      key: `config-${option.optionId}`,
      label: option.optionName,
      value,
      kind: 'generic',
    });
  }

  return summary;
}

function summarizeCartItem(item: CartItemSummary, locale: string) {
  const combined = [...summarizeConfigOptions(item.configOptions, locale), ...summarizeCheckoutConfig(item.checkoutConfig, locale)];
  const unique = new Map<string, CheckoutSummaryEntry>();

  for (const entry of combined) {
    const key = `${entry.kind}:${normalizeCheckoutToken(entry.label)}:${normalizeCheckoutToken(entry.value)}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }

  if (item.product.countryCode && ![...unique.values()].some((entry) => entry.kind === 'node')) {
    unique.set(`node:product:${item.product.countryCode}`, {
      key: `node-product-${item.product.countryCode}`,
      label: locale.startsWith('zh') ? '节点' : 'Node',
      value: getCountryMeta(item.product.countryCode)?.name ?? item.product.countryCode,
      kind: 'node',
      countryCode: item.product.countryCode,
    });
  }

  return [...unique.values()];
}

export function CheckoutPage() {
  const { text, formatMoney, locale } = useSite();
  const ui = getUiText(locale);
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
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setPending(false);
    }
  }

  async function placeOrder() {
    if (pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    setOrderResult(null);
    let redirected = false;
    try {
      const response = await requestJson<CheckoutResponse>('/api/v1/checkout', {
        method: 'POST',
        body: { tos: true },
      });
      if (response.data.redirect.path) {
        redirected = true;
        window.location.assign(response.data.redirect.path);
        return;
      }
      setOrderResult(response);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      if (!redirected) {
        setPending(false);
      }
    }
  }

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  const cart = data.data;
  const cartItems = Array.isArray(cart.items) ? cart.items : [];

  return (
    <div className="stack-32 checkout-page">
      <section className="page-section page-section--intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.nav.checkout}</p>
            <h1>{ui.checkout.reviewTitle}</h1>
            <p className="muted">{ui.checkout.reviewSubtitle}</p>
          </div>
        </div>
      </section>

      {cartItems.length === 0 ? (
        <article className="empty-state">
          <h3>{text.checkout.empty}</h3>
          <Link className="button primary" to="/catalog">{text.nav.catalog}</Link>
        </article>
      ) : (
        <>
          <section className="checkout-layout">
            <div className="checkout-items">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{text.nav.checkout}</p>
                  <h2>{text.checkout.subtitle}</h2>
                </div>
                <span className="chip">{cartItems.length} {text.common.products}</span>
              </div>
              {cartItems.map((item) => {
                const configSummary = summarizeCartItem(item, locale);

                return (
                <article className="cart-row-card" key={item.id}>
                  <div className="stack-12">
                    <h3>{localizeText(item.product.name, locale, ui.common.unnamedProduct)}</h3>
                    <p className="muted">{localizeText(item.plan.name, locale, ui.common.unnamedPlan)}</p>
                    {configSummary.length > 0 ? (
                      <div className="summary-list">
                        {configSummary.map((entry) => {
                          const countryCode = entry.kind === 'node' ? (entry.countryCode ?? inferCountryCode(entry.value)) : null;
                          const osVisual = entry.kind === 'os' ? getOsVisual(entry.value) : null;
                          const appVisual = entry.kind === 'app'
                            ? getAppVisual({ name: entry.value, slug: entry.value, icon: null, category: null })
                            : null;

                          return (
                            <div className="summary-line" key={entry.key}>
                              {entry.kind === 'node' ? (
                                <CountryFlagIcon countryCode={countryCode} />
                              ) : entry.kind === 'os' && osVisual ? (
                                <VisualIcon glyph={osVisual.glyph} label={entry.value} size="sm" src={osVisual.src} tone={osVisual.tone} />
                              ) : entry.kind === 'app' && appVisual ? (
                                <VisualIcon glyph={appVisual.glyph} label={entry.value} size="sm" src={appVisual.src} tone={appVisual.tone} />
                              ) : (
                                <span className={`summary-line__marker ${entry.kind === 'password' ? 'summary-line__marker--secure' : ''}`} />
                              )}
                              <div>
                                <span>{entry.label}</span>
                                <strong>{entry.value}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="cart-row-card__controls">
                    <strong>{item.price?.formatted.total ?? formatMoney(item.price?.total ?? null, cart.currencyCode)}</strong>
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
                </article>
                );
              })}
            </div>

            <aside className="summary-card checkout-summary">
              <span className="eyebrow">{text.common.total}</span>
              <strong className="price-large">{cart.totals?.formatted.total ?? formatMoney(cart.totals?.total ?? null, cart.currencyCode)}</strong>
              <label className="field">
                <span>{text.checkout.coupon}</span>
                <input className="text-input" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
              </label>
              <div className="action-row">
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
              <p className="muted">{text.checkout.couponHint}</p>
              {cart.coupon ? <div className="callout compact">#{cart.coupon.code}</div> : null}
              <button className="button primary" disabled={pending} type="button" onClick={() => void placeOrder()}>
                {pending ? text.checkout.placingOrder : text.checkout.placeOrder}
              </button>
            </aside>
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
