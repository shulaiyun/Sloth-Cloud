import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { useSite } from '../lib/site-context';
import type { AffiliateOrdersResponse, AffiliateProfileResponse } from '../lib/types';

export function AffiliatePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { text, locale, formatMoney, formatDate } = useSite();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [customCode, setCustomCode] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: profileData, error: profileError, loading: profileLoading } = useApiData<AffiliateProfileResponse>(
    isAuthenticated ? `/api/v1/affiliate/me?refresh=${refreshNonce}` : null,
  );
  const { data: ordersData } = useApiData<AffiliateOrdersResponse>(
    isAuthenticated ? `/api/v1/affiliate/orders?refresh=${refreshNonce}` : null,
  );

  const profile = profileData?.data.affiliate ?? null;
  const program = profileData?.data.program ?? {
    defaultReward: 0,
    codeType: 'random',
  };
  const inviteLink = useMemo(() => {
    if (!profile?.code) {
      return '';
    }

    return `${window.location.origin}/?ref=${encodeURIComponent(profile.code)}`;
  }, [profile?.code]);

  async function enroll() {
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await requestJson<AffiliateProfileResponse & { message?: string }>('/api/v1/affiliate/enroll', {
        method: 'POST',
        body: program.codeType === 'custom' && customCode.trim() !== ''
          ? { code: customCode.trim() }
          : {},
      });
      setMessage(response.message ?? (locale.startsWith('zh') ? '邀请返利已开通。' : 'Affiliate center enabled.'));
      setRefreshNonce((current) => current + 1);
    } catch (caughtError) {
      setError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setPending(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(locale.startsWith('zh') ? '复制失败，请手动复制邀请链接。' : 'Copy failed. Please copy the invite link manually.');
    }
  }

  if (authLoading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="stack-32">
        <section className="page-section page-section--intro">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{locale.startsWith('zh') ? '邀请返利' : 'Affiliate Center'}</p>
              <h1>{locale.startsWith('zh') ? '邀请返利中心' : 'Affiliate Center'}</h1>
              <p className="muted">
                {locale.startsWith('zh')
                  ? '登录后即可生成专属邀请链接，查看访客、注册、有效订单和返利余额。'
                  : 'Sign in to generate your invite link and view visitors, signups, valid orders, and reward balances.'}
              </p>
            </div>
          </div>
        </section>
        <article className="empty-state">
          <h3>{locale.startsWith('zh') ? '请先登录' : 'Please sign in first'}</h3>
          <Link className="button primary" to="/login">
            {text.nav.login}
          </Link>
        </article>
      </div>
    );
  }

  if (profileLoading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (profileError || !profileData) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(profileError ?? ''), locale)}</div>;
  }

  const orderItems = ordersData?.data.items ?? [];
  const totalCredits = profile?.credits ?? [];
  const totalEarnings = profile?.earnings ?? {};

  return (
    <div className="stack-32">
      <section className="page-section page-section--intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{locale.startsWith('zh') ? '邀请返利' : 'Affiliate Center'}</p>
            <h1>{locale.startsWith('zh') ? '邀请返利中心' : 'Affiliate Center'}</h1>
            <p className="muted">
              {locale.startsWith('zh')
                ? '开通后即可生成专属邀请码。客户首个有效付费订单和后续续费都会按规则返到站内余额。'
                : 'Enable your invite code to earn credits from a customer’s first valid paid order and later renewals.'}
            </p>
          </div>
        </div>
      </section>

      {!profile ? (
        <article className="panel stack-16">
          <p className="eyebrow">{locale.startsWith('zh') ? '开通加盟' : 'Enable affiliate program'}</p>
          <p className="muted">
            {locale.startsWith('zh')
              ? `当前默认返利比例为 ${program.defaultReward}% 。`
              : `The current default reward rate is ${program.defaultReward}%.`}
          </p>
          {program.codeType === 'custom' ? (
            <label className="field">
              <span>{locale.startsWith('zh') ? '自定义邀请码' : 'Custom invite code'}</span>
              <input
                className="text-input"
                placeholder={locale.startsWith('zh') ? '5-25 位字母或数字' : '5-25 letters or numbers'}
                value={customCode}
                onChange={(event) => setCustomCode(event.target.value)}
              />
            </label>
          ) : null}
          <button className="button primary" disabled={pending} type="button" onClick={() => void enroll()}>
            {pending
              ? `${text.common.loading}...`
              : (locale.startsWith('zh') ? '开通并生成邀请码' : 'Enable and generate invite code')}
          </button>
          {message ? <div className="callout compact">{message}</div> : null}
          {error ? <div className="error-card compact">{error}</div> : null}
        </article>
      ) : (
        <>
          <section className="two-column">
            <article className="panel stack-16">
              <p className="eyebrow">{locale.startsWith('zh') ? '邀请码与链接' : 'Invite code and link'}</p>
              <div className="detail-grid">
                <div>
                  <span>{locale.startsWith('zh') ? '邀请码' : 'Invite code'}</span>
                  <strong>{profile.code}</strong>
                </div>
                <div>
                  <span>{locale.startsWith('zh') ? '返利比例' : 'Reward rate'}</span>
                  <strong>{profile.reward}%</strong>
                </div>
                <div>
                  <span>{locale.startsWith('zh') ? '开通时间' : 'Enabled at'}</span>
                  <strong>{formatDate(profile.createdAt)}</strong>
                </div>
              </div>
              <label className="field">
                <span>{locale.startsWith('zh') ? '邀请链接' : 'Invite link'}</span>
                <input className="text-input" readOnly value={inviteLink} />
              </label>
              <button className="button secondary" type="button" onClick={() => void copyInviteLink()}>
                {copied
                  ? (locale.startsWith('zh') ? '已复制' : 'Copied')
                  : (locale.startsWith('zh') ? '复制邀请链接' : 'Copy invite link')}
              </button>
            </article>

            <article className="panel stack-16">
              <p className="eyebrow">{locale.startsWith('zh') ? '余额与累计收益' : 'Credits and earnings'}</p>
              <div className="detail-grid">
                <div>
                  <span>{locale.startsWith('zh') ? '访客数' : 'Visitors'}</span>
                  <strong>{profile.visitors}</strong>
                </div>
                <div>
                  <span>{locale.startsWith('zh') ? '注册数' : 'Signups'}</span>
                  <strong>{profile.signups}</strong>
                </div>
                <div>
                  <span>{locale.startsWith('zh') ? '有效订单' : 'Valid orders'}</span>
                  <strong>{profile.validOrders}</strong>
                </div>
                <div>
                  <span>{locale.startsWith('zh') ? '累计返利币种数' : 'Earning currencies'}</span>
                  <strong>{Object.keys(totalEarnings).length}</strong>
                </div>
              </div>
              <div className="stack-8">
                <strong>{locale.startsWith('zh') ? '累计返利' : 'Total earnings'}</strong>
                {Object.keys(totalEarnings).length > 0 ? (
                  <div className="chip-row">
                    {Object.entries(totalEarnings).map(([currency, amount]) => (
                      <span className="chip" key={currency}>{`${currency}: ${amount.toFixed(2)}`}</span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">{locale.startsWith('zh') ? '暂时还没有返利记录。' : 'No rewards have been recorded yet.'}</p>
                )}
              </div>
              <div className="stack-8">
                <strong>{locale.startsWith('zh') ? '当前站内余额' : 'Current credits'}</strong>
                {totalCredits.length > 0 ? (
                  <div className="chip-row">
                    {totalCredits.map((credit) => (
                      <span className="chip" key={credit.currencyCode}>
                        {formatMoney(credit.amount, credit.currencyCode)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">{locale.startsWith('zh') ? '当前没有站内余额。' : 'No credits are currently available.'}</p>
                )}
              </div>
            </article>
          </section>

          <article className="panel stack-16">
            <p className="eyebrow">{locale.startsWith('zh') ? '最近返利订单' : 'Recent referred orders'}</p>
            {orderItems.length === 0 ? (
              <div className="callout compact">
                {locale.startsWith('zh')
                  ? '还没有产生有效返利订单。客户完成首个有效付费订单后，这里会出现记录。'
                  : 'There are no valid referred orders yet. Orders will appear here after a customer completes their first valid paid purchase.'}
              </div>
            ) : (
              <div className="stack-12">
                {orderItems.map((order) => (
                  <div className="detail-grid" key={order.id}>
                    <div>
                      <span>{locale.startsWith('zh') ? '服务' : 'Service'}</span>
                      <strong>{order.serviceLabel ?? order.productName ?? order.orderId ?? '-'}</strong>
                    </div>
                    <div>
                      <span>{locale.startsWith('zh') ? '订单号' : 'Order'}</span>
                      <strong>{order.orderId ?? '-'}</strong>
                    </div>
                    <div>
                      <span>{locale.startsWith('zh') ? '已支付发票' : 'Paid invoices'}</span>
                      <strong>{order.paidInvoicesCount}</strong>
                    </div>
                    <div>
                      <span>{locale.startsWith('zh') ? '最近入账' : 'Last paid at'}</span>
                      <strong>{formatDate(order.lastPaidAt)}</strong>
                    </div>
                    <div>
                      <span>{locale.startsWith('zh') ? '返利金额' : 'Rewards'}</span>
                      <strong>
                        {Object.keys(order.earnings).length > 0
                          ? Object.entries(order.earnings).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(' / ')
                          : '-'}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel stack-12">
            <p className="eyebrow">{locale.startsWith('zh') ? '规则说明' : 'Program rules'}</p>
            <div className="callout compact">
              <p className="muted">
                {locale.startsWith('zh')
                  ? '返利默认在客户发票支付成功后入账到站内余额；未支付、已取消、无效订单不会返利；同一已归因服务的后续续费会继续返利。'
                  : 'Rewards are credited after the customer invoice is paid. Unpaid, cancelled, or invalid orders do not earn rewards, and renewals for an attributed service continue to earn credits.'}
              </p>
            </div>
          </article>
        </>
      )}
    </div>
  );
}
