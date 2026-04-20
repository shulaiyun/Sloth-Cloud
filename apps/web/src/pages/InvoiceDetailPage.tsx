import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import { getUiText, invoiceStatusLabel } from '../lib/ui-text';
import type { InvoicePayResponse, InvoiceResponse } from '../lib/types';

type LocaleLanguage = 'zh' | 'en' | 'ja' | 'ko';
type LocalizedMessage = {
  zh: string;
  en: string;
  ja: string;
  ko: string;
};

function isInvoicePaid(status: string, remaining: number) {
  const normalized = status.trim().toLowerCase();
  return normalized === 'paid' || normalized === 'success' || normalized === 'completed' || remaining <= 0;
}

function normalizeItemName(description: string) {
  const compact = description.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.replace(/\s*\([^)]*\)\s*$/, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasPaymentReturnHint(search: string) {
  const query = new URLSearchParams(search);
  const keys = ['trade_no', 'out_trade_no', 'payid', 'payment', 'status', 'money'];

  return keys.some((key) => {
    const value = query.get(key);
    return typeof value === 'string' && value.trim() !== '';
  });
}

function openPaymentDocument(paymentHtml: string) {
  const popup = window.open('', '_blank');
  if (!popup) {
    return false;
  }

  try {
    popup.opener = null;
  } catch {
    // Ignore browser restrictions; writing the payment form is the priority.
  }

  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><base target="_self"></head><body>${paymentHtml}</body></html>`);
  popup.document.close();
  return true;
}

function localeLanguage(locale: string): LocaleLanguage {
  const language = locale.toLowerCase().split('-')[0];
  if (language === 'zh' || language === 'ja' || language === 'ko') {
    return language;
  }

  return 'en';
}

function localizeMessage(locale: string, message: LocalizedMessage) {
  const language = localeLanguage(locale);
  if (language === 'zh') return message.zh;
  if (language === 'ja') return message.ja;
  if (language === 'ko') return message.ko;
  return message.en;
}

function localizeInvoiceBackendMessage(rawMessage: string | null | undefined, locale: string, ui: ReturnType<typeof getUiText>) {
  if (!rawMessage || rawMessage.trim() === '') {
    return null;
  }

  const normalized = rawMessage.toLowerCase().trim();

  if (/(payment|gateway).*(initialized|created|started)/.test(normalized)) {
    return ui.invoices.waitingPayment;
  }

  if (/waiting.*callback|awaiting.*callback|payment pending/.test(normalized)) {
    return ui.invoices.waitingPayment;
  }

  if (/(invoice|payment).*(already paid|already settled)/.test(normalized)) {
    return localizeMessage(locale, {
      zh: '账单已支付，无需重复付款。',
      en: 'This invoice is already paid.',
      ja: 'この請求書は既に支払い済みです。',
      ko: '이 청구서는 이미 결제가 완료되었습니다.',
    });
  }

  if (/(payment|invoice).*(success|confirmed|completed|paid)/.test(normalized)) {
    return ui.invoices.paymentConfirmed;
  }

  return rawMessage;
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const location = useLocation();
  const { text, locale } = useSite();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const ui = getUiText(locale);
  const { data, error, loading } = useApiData<InvoiceResponse>(
    invoiceId ? `/api/v1/invoices/${invoiceId}` : null,
  );

  const [pending, setPending] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<InvoicePayResponse | null>(null);
  const [invoiceState, setInvoiceState] = useState<InvoiceResponse['data']['invoice'] | null>(null);
  const [pollingForPayment, setPollingForPayment] = useState(false);
  const [refreshingInvoiceStatus, setRefreshingInvoiceStatus] = useState(false);

  const invoice = invoiceState ?? data?.data.invoice ?? null;
  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  const gateways = useMemo(() => {
    if (!Array.isArray(data?.data.gateways)) {
      return [];
    }

    return data.data.gateways.filter((gateway) => isPlainObject(gateway));
  }, [data]);

  const recurringServices = useMemo(() => {
    if (!Array.isArray(data?.data.recurringServices)) {
      return [];
    }

    return data.data.recurringServices.filter((service) => isPlainObject(service));
  }, [data]);

  const invoiceItems = useMemo(() => {
    if (!Array.isArray(invoice?.items)) {
      return [];
    }

    return invoice.items.filter((item) => isPlainObject(item));
  }, [invoice]);

  useEffect(() => {
    if (data?.data.invoice) {
      setInvoiceState(data.data.invoice);
    }
  }, [data]);

  useEffect(() => {
    if (selectedGatewayId !== '' || gateways.length === 0) {
      return;
    }

    const firstGatewayId = gateways[0]?.id;
    if (typeof firstGatewayId === 'string' || typeof firstGatewayId === 'number') {
      setSelectedGatewayId(String(firstGatewayId));
    }
  }, [gateways, selectedGatewayId]);

  useEffect(() => {
    if (!invoiceId || !invoiceState) {
      return;
    }

    const invoicePending = !isInvoicePaid(invoiceState.status, invoiceState.remaining);
    const shouldStartPolling = invoicePending;
    if (!shouldStartPolling) {
      setPollingForPayment(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;
    setPollingForPayment(true);
    setMessage((current) => {
      if (current) {
        return current;
      }

      if (Boolean(payResult) || hasPaymentReturnHint(location.search)) {
        return ui.invoices.waitingPayment;
      }

      return ui.invoices.invoiceStillPending;
    });

    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const refreshed = await requestJson<InvoiceResponse>(`/api/v1/invoices/${invoiceId}`);
        if (cancelled) {
          return;
        }

        setInvoiceState(refreshed.data.invoice);
        if (isInvoicePaid(refreshed.data.invoice.status, refreshed.data.invoice.remaining)) {
          setMessage(ui.invoices.paymentConfirmed);
          setPollingForPayment(false);
          window.clearInterval(timer);
          return;
        }
      } catch {
        // Ignore transient polling errors.
      }

      if (attempts >= maxAttempts) {
        setPollingForPayment(false);
        setMessage(ui.invoices.paymentNotConfirmed);
        window.clearInterval(timer);
      }
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId, invoiceState, location.search, payResult, ui.invoices.invoiceStillPending, ui.invoices.paymentConfirmed, ui.invoices.paymentNotConfirmed, ui.invoices.waitingPayment]);

  async function refreshInvoiceStatus() {
    if (!invoiceId || refreshingInvoiceStatus) {
      return;
    }

    setRefreshingInvoiceStatus(true);
    setActionError(null);

    try {
      const refreshed = await requestJson<InvoiceResponse>(`/api/v1/invoices/${invoiceId}`);
      setInvoiceState(refreshed.data.invoice);

      if (isInvoicePaid(refreshed.data.invoice.status, refreshed.data.invoice.remaining)) {
        setMessage(ui.invoices.paymentConfirmed);
      } else {
        setMessage(ui.invoices.refreshLater);
      }
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setRefreshingInvoiceStatus(false);
    }
  }

  async function payWithCredit() {
    if (!invoiceId || pending) return;

    setPending(true);
    setActionError(null);

    try {
      const response = await requestJson<InvoicePayResponse>(`/api/v1/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { method: 'credit' },
      });

      setMessage(localizeInvoiceBackendMessage(response.message, locale, ui) ?? response.message);
      setPayResult(response);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setPending(false);
    }
  }

  async function payWithGateway() {
    if (!invoiceId || pending) return;

    if (payResult?.data.redirectUrl) {
      window.location.assign(payResult.data.redirectUrl);
      return;
    }

    if (payResult?.data.paymentHtml) {
      setMessage(
        ui.invoices.paymentOpened,
      );
      return;
    }

    if (gateways.length === 0) {
      setActionError(
        ui.invoices.noGateway,
      );
      return;
    }

    const gatewayId = selectedGatewayId || String(gateways[0]?.id ?? '');
    if (!gatewayId) {
      return;
    }

    setPending(true);
    setActionError(null);
    let redirected = false;

    try {
      const response = await requestJson<InvoicePayResponse>(`/api/v1/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { method: 'gateway', gatewayId: Number(gatewayId) },
      });

      setMessage(localizeInvoiceBackendMessage(response.message, locale, ui) ?? response.message);
      setPayResult(response);

      if (response.data.redirectUrl) {
        redirected = true;
        window.location.assign(response.data.redirectUrl);
      } else if (response.data.paymentHtml) {
        const opened = openPaymentDocument(response.data.paymentHtml);
        setMessage(
          opened
            ? ui.invoices.paymentOpened
            : ui.invoices.paymentPopupBlocked,
        );
      } else {
        setActionError(
          ui.invoices.gatewayMissingPage,
        );
      }
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      if (!redirected) {
        setPending(false);
      }
    }
  }

  const relatedServices = useMemo(() => {
    if (!data || !invoice) {
      return [];
    }

    const candidates = new Map<string, { id: string | null; name: string }>();

    recurringServices.forEach((service) => {
      const raw = typeof service.label === 'string' && service.label.trim() !== ''
        ? service.label
        : typeof service.baseLabel === 'string'
          ? service.baseLabel
          : '';
      const name = localizeText(raw, locale, raw).trim();
      if (name) {
        const id = typeof service.id === 'string' && service.id.trim() !== '' ? service.id.trim() : null;
        candidates.set(id ? `service:${id}` : `name:${name}`, { id, name });
      }
    });

    invoiceItems.forEach((item) => {
      const description = typeof item.description === 'string' ? item.description : '';
      const normalized = normalizeItemName(localizeText(description, locale, description));
      if (normalized) {
        const id = typeof item.referenceId === 'string' && item.referenceId.trim() !== '' ? item.referenceId.trim() : null;
        const key = id ? `service:${id}` : `name:${normalized}`;
        if (!candidates.has(key)) {
          candidates.set(key, { id, name: normalized });
        }
      }
    });

    return Array.from(candidates.values());
  }, [data, invoice, recurringServices, invoiceItems, locale]);
  const primaryRelatedServiceHref = relatedServices.length === 1 && relatedServices[0]?.id
    ? `/services/${encodeURIComponent(relatedServices[0].id)}`
    : '/services';

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data || !invoice) {
    if (!authLoading && !isAuthenticated) {
      const returnedFromGateway = hasPaymentReturnHint(location.search);
      const authMessage = returnedFromGateway
        ? localizeMessage(locale, {
            zh: '支付结果已经返回，但当前这个访问入口没有登录会话。请先登录，再继续查看这张账单和支付状态。',
            en: 'The payment gateway has already returned, but this browser entry does not have an active session. Sign in first to continue viewing the invoice and payment status.',
            ja: '決済結果の戻りは完了していますが、このアクセス入口には有効なログインセッションがありません。先にログインしてから請求書と支払い状態を確認してください。',
            ko: '결제 결과는 이미 돌아왔지만 현재 접속한 이 주소에는 로그인 세션이 없습니다. 먼저 로그인한 뒤 청구서와 결제 상태를 확인해 주세요.',
          })
        : localizeMessage(locale, {
            zh: '这张账单需要登录后才能查看。',
            en: 'You need to sign in to view this invoice.',
            ja: 'この請求書を表示するにはログインが必要です。',
            ko: '이 청구서를 보려면 로그인해야 합니다.',
          });

      return (
        <div className="stack-24">
          <section className="section-heading">
            <div>
              <p className="eyebrow">{text.nav.invoices}</p>
              <h1>#{invoiceId ?? '-'}</h1>
              <p className="muted">{ui.invoices.invoiceStillPending}</p>
            </div>
          </section>

          <div className="panel stack-16">
            <div className="callout compact">
              <strong>{authMessage}</strong>
              {returnedFromGateway ? (
                <p>{localizeMessage(locale, {
                  zh: '如果你是从一个地址发起支付、又从另一个地址返回，浏览器会把它当成不同入口，所以可能需要重新登录一次。',
                  en: 'If payment started from one address and returned to another, the browser may treat that as a different site entry and ask you to sign in again.',
                  ja: '支払いを開始したアドレスと戻ってきたアドレスが異なる場合、ブラウザは別入口として扱うことがあり、再ログインが必要になることがあります。',
                  ko: '결제를 시작한 주소와 돌아온 주소가 다르면 브라우저가 다른 접속入口로 취급해 다시 로그인해야 할 수 있습니다.',
                })}</p>
              ) : null}
            </div>

            <div className="button-row">
              <Link className="button primary" to={loginHref}>
                {text.nav.login}
              </Link>
              <Link className="button ghost" to="/invoices">
                {text.nav.invoices}
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="error-card">
        {text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}
      </div>
    );
  }

  const paid = isInvoicePaid(invoice.status, invoice.remaining);

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.invoices}</p>
          <h1>#{invoice.number ?? invoice.id}</h1>
          <p className="muted">{invoiceStatusLabel(invoice.status, locale)}</p>
        </div>
        <Link className="button ghost" to="/invoices">
          {text.nav.invoices}
        </Link>
      </section>

      <section className="two-column">
        <article className="panel stack-16">
          {relatedServices.length > 0 ? (
            <div className="callout compact">
              <strong>{ui.invoices.relatedServices}</strong>
              <ul className="invoice-related-list">
                {relatedServices.map((service) => (
                  <li key={`${service.id ?? 'name'}:${service.name}`}>
                    {service.id ? (
                      <Link className="text-link" to={`/services/${encodeURIComponent(service.id)}`}>
                        {service.name}
                      </Link>
                    ) : (
                      service.name
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {invoiceItems.map((item, index) => (
            <div className="callout compact" key={String(item.id ?? item.description ?? index)}>
              <strong>{localizeText(String(item.description ?? ''), locale, String(item.description ?? ''))}</strong>
              <p>{String(item.formattedTotal ?? '-')}</p>
            </div>
          ))}
          <strong>{invoice.formattedRemaining}</strong>
        </article>

        <article className="summary-card">
          {paid ? (
            <div className="callout callout-success">
              <strong>{ui.invoices.settledTitle}</strong>
              <p>
                {ui.invoices.settledBody}
              </p>
              <Link className="button ghost" to={primaryRelatedServiceHref}>
                {relatedServices.length === 1
                  ? (locale.startsWith('zh') ? '打开对应服务' : 'Open related service')
                  : text.nav.services}
              </Link>
            </div>
          ) : (
            <>
              {gateways.length > 0 ? (
                <label className="field">
                  <span>{ui.invoices.paymentMethod}</span>
                  <select
                    className="text-input select-input"
                    value={selectedGatewayId}
                    onChange={(event) => setSelectedGatewayId(event.target.value)}
                  >
                    {gateways.map((gateway) => (
                      <option key={String(gateway.id)} value={String(gateway.id)}>
                        {String(gateway.name ?? gateway.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="callout compact">
                  {ui.invoices.noGateway}
                </div>
              )}

              <button className="button primary" disabled={pending} type="button" onClick={() => void payWithCredit()}>
                {text.invoices.payWithCredit}
              </button>

              <button
                className="button secondary"
                disabled={pending || gateways.length === 0}
                type="button"
                onClick={() => void payWithGateway()}
              >
                {payResult?.data.redirectUrl ? ui.invoices.continuePayment : text.invoices.payWithGateway}
              </button>

              {payResult?.data.redirectUrl ? (
                <a className="button ghost" href={payResult.data.redirectUrl} rel="noreferrer" target="_blank">
                  {ui.invoices.openPaymentNewTab}
                </a>
              ) : null}

              <button
                className="button ghost"
                disabled={refreshingInvoiceStatus}
                type="button"
                onClick={() => void refreshInvoiceStatus()}
              >
                {refreshingInvoiceStatus
                  ? ui.common.refreshing
                  : ui.invoices.paidRefresh}
              </button>

              {payResult?.data.paymentHtml && !payResult?.data.redirectUrl ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    const opened = openPaymentDocument(payResult.data.paymentHtml ?? '');
                    if (!opened) {
                      setActionError(ui.invoices.paymentPopupBlocked);
                    }
                  }}
                >
                  {ui.invoices.openPaymentAgain}
                </button>
              ) : null}
            </>
          )}
        </article>
      </section>

      {pollingForPayment && !paid ? (
        <div className="callout">
          {ui.invoices.confirmingPayment}
        </div>
      ) : null}
      {message ? <div className="callout">{message}</div> : null}
      {actionError ? <div className="error-card">{actionError}</div> : null}
    </div>
  );
}
