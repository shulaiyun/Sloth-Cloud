import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import { requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import {
  getUiText,
  normalizeServiceStatus,
  productLineFor,
  productLineLabel,
  runtimeStatusLabel,
  serviceStatusLabel,
  statusClassName,
} from '../lib/ui-text';
import { useSite } from '../lib/site-context';
import { getOsVisual, inferCountryCode } from '../lib/visual-metadata';
import type { RuntimeOverviewResponse, ServiceSummary, ServicesResponse } from '../lib/types';

type ServiceStatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'cancelled' | 'failed' | 'unknown';
type ServiceSort = 'status' | 'price-desc' | 'price-asc' | 'expires-asc';
type ServiceRuntimeContractState = RuntimeOverviewResponse['data']['status'];
type ServiceRowRuntimeSummary = {
  status: ServiceRuntimeContractState;
  powerState: string | null;
  provisioningStatus: string | null;
};

const serviceListRuntimeRefreshMs = 5_000;

function isPurchasedService(service: ServiceSummary) {
  const normalizedId = service.id.trim();
  const hasLabel = (service.label || service.baseLabel || '').trim().length > 0;
  const hasProduct = Boolean(service.product?.id || service.product?.slug || service.product?.name);
  const hasPlan = Boolean(service.plan?.id || service.plan?.name);
  const hasLifecycleMeta = Boolean(service.expiresAt || service.cancellable || service.upgradable);

  return normalizedId !== '' && (hasLabel || hasProduct || hasPlan || hasLifecycleMeta);
}

function normalizeProvisioningStage(service: ServiceSummary) {
  return (service.provisioning?.status ?? '').trim().toLowerCase();
}

function isProvisioningFailureStage(stage: string) {
  return stage !== '' && (
    stage === 'failed'
    || stage === 'build_failed'
    || stage.includes('fail')
    || stage.includes('error')
  );
}

function isProvisioningInFlightStage(stage: string) {
  return ['pending', 'provisioning', 'queued', 'building', 'pushing', 'deploying', 'retrying', 'deleting'].includes(stage);
}

function effectiveLifecycleStatus(service: ServiceSummary) {
  if (service.cancellation) {
    return 'cancelled';
  }

  const provisioningStage = normalizeProvisioningStage(service);
  if (isProvisioningFailureStage(provisioningStage)) {
    return 'failed';
  }
  if (isProvisioningInFlightStage(provisioningStage)) {
    return 'pending';
  }

  return normalizeServiceStatus(service.status);
}

function effectiveLifecycleLabel(service: ServiceSummary, locale: string) {
  if (service.cancellation) {
    return locale.startsWith('zh') ? '已申请取消' : 'Cancellation scheduled';
  }

  const provisioningStage = normalizeProvisioningStage(service);
  if (isProvisioningFailureStage(provisioningStage) || isProvisioningInFlightStage(provisioningStage)) {
    return runtimeStatusLabel(provisioningStage || 'pending', locale);
  }

  return serviceStatusLabel(service.status, locale);
}

function isVpsService(service: ServiceSummary) {
  return (service.runtimeKind ?? 'unknown') === 'vps';
}

function runtimeStateClassName(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();

  if (normalized === 'running' || normalized === 'started' || normalized === 'ready' || normalized === 'active') {
    return 'status-active';
  }

  if (
    normalized === 'installing'
    || normalized === 'building'
    || normalized === 'provisioning'
    || normalized === 'pending'
    || normalized === 'queued'
    || normalized === 'deploying'
    || normalized === 'retrying'
  ) {
    return 'status-pending';
  }

  if (normalized === 'failed') {
    return 'status-overdue';
  }

  if (normalized === 'suspended') {
    return 'status-suspended';
  }

  if (normalized === 'deleting' || normalized === 'deleted') {
    return 'status-cancelled';
  }

  return 'status-unknown';
}

function serverRuntimeStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'running' || normalized === 'started') return runtimeStatusLabel('running', locale);
  if (normalized === 'stopped' || normalized === 'shutdown' || normalized === 'offline') {
    return locale.startsWith('zh') ? '已关机' : 'Stopped';
  }
  if (normalized === 'installing' || normalized === 'building') return runtimeStatusLabel('building', locale);
  if (normalized === 'provisioning' || normalized === 'pending') return runtimeStatusLabel('pending', locale);
  if (normalized === 'failed') return runtimeStatusLabel('failed', locale);
  if (normalized === 'suspended') {
    return locale.startsWith('zh') ? '已暂停' : 'Suspended';
  }
  if (normalized === 'unavailable' || normalized === 'upstream_unavailable') {
    return locale.startsWith('zh') ? '状态失联' : 'Unavailable';
  }
  if (normalized === 'unmapped') {
    return locale.startsWith('zh') ? '未映射' : 'Unmapped';
  }
  if (normalized === 'archived') {
    return locale.startsWith('zh') ? '已归档' : 'Archived';
  }
  if (!normalized || normalized === '-') return '-';
  return status;
}

function serviceRuntimeSummaryBadge(
  service: ServiceSummary,
  runtimeSummary: ServiceRowRuntimeSummary | undefined,
  locale: string,
) {
  if (!isVpsService(service)) {
    return null;
  }

  if (!runtimeSummary) {
    return {
      className: 'status-pending',
      label: locale.startsWith('zh') ? '同步中' : 'Syncing',
    };
  }

  if (runtimeSummary.status === 'ready') {
    return {
      className: runtimeStateClassName(runtimeSummary.powerState),
      label: serverRuntimeStatusLabel(runtimeSummary.powerState ?? 'unknown', locale),
    };
  }

  if (runtimeSummary.status === 'provisioning') {
    const provisioningState = runtimeSummary.provisioningStatus ?? service.provisioning?.status ?? 'pending';
    return {
      className: runtimeStateClassName(provisioningState),
      label: runtimeStatusLabel(provisioningState, locale),
    };
  }

  if (runtimeSummary.status === 'failed') {
    return {
      className: 'status-overdue',
      label: runtimeStatusLabel('failed', locale),
    };
  }

  return {
    className: runtimeStateClassName(runtimeSummary.status),
    label: serverRuntimeStatusLabel(runtimeSummary.status, locale),
  };
}

function operatorEntryLabel(entryKind: string | null | undefined, locale: string) {
  const zh = locale.startsWith('zh');
  if (entryKind === 'upload-project') return zh ? '项目上线' : 'Project launch';
  if (entryKind === 'generate-from-idea') return zh ? '想法生成' : 'Idea build';
  if (entryKind === 'scan-server') return zh ? '旧服务器迁移' : 'Server migration';
  return zh ? 'AI 来源' : 'AI source';
}

function operatorBusinessLabel(businessPath: string | null | undefined, locale: string) {
  const text = (businessPath ?? '').trim().toLowerCase();
  const zh = locale.startsWith('zh');
  if (text === 'ai-managed-launch' || text === 'ai managed launch' || text === 'managed app hosting') {
    return zh ? 'AI 托管上线' : 'AI managed launch';
  }
  if (text === 'vps-self-hosted' || text === 'vps self hosted') {
    return zh ? '购买 VPS 并迁移' : 'Buy VPS and migrate';
  }
  if (text === 'server-migration' || text === 'server migration') {
    return zh ? '接管旧服务器' : 'Existing server takeover';
  }
  return zh ? 'AI 商业闭环' : 'AI loop';
}

export function ServicesPage() {
  const { text, locale, formatDate } = useSite();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const ui = getUiText(locale);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const servicesPath = !authLoading && isAuthenticated
    ? `/api/v1/services?refresh=${refreshNonce}`
    : null;
  const { data, error, loading } = useApiData<ServicesResponse>(servicesPath);
  const [runtimeSummaryMap, setRuntimeSummaryMap] = useState<Record<string, ServiceRowRuntimeSummary>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('all');
  const [sortBy, setSortBy] = useState<ServiceSort>('status');
  const services = Array.isArray(data?.data) ? data.data : [];
  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshNonce((current) => current + 1);
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const statusOptions: Array<{ value: ServiceStatusFilter; label: string }> = [
    { value: 'all', label: ui.common.allStatuses },
    { value: 'active', label: serviceStatusLabel('active', locale) },
    { value: 'pending', label: serviceStatusLabel('pending', locale) },
    { value: 'suspended', label: serviceStatusLabel('suspended', locale) },
    { value: 'cancelled', label: serviceStatusLabel('cancelled', locale) },
    { value: 'failed', label: serviceStatusLabel('failed', locale) },
    { value: 'unknown', label: serviceStatusLabel('unknown', locale) },
  ];

  const sortOptions: Array<{ value: ServiceSort; label: string }> = [
    { value: 'status', label: ui.common.sortByStatus },
    { value: 'price-desc', label: ui.services.priceHighToLow },
    { value: 'price-asc', label: ui.services.priceLowToHigh },
    { value: 'expires-asc', label: ui.services.nearestExpiry },
  ];

  const visibleServices = useMemo(() => {
    const purchasedServices = services.filter(isPurchasedService);
    const keyword = search.trim().toLowerCase();

    const filtered = purchasedServices.filter((service) => {
      const normalizedStatus = effectiveLifecycleStatus(service);
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) {
        return false;
      }

      if (keyword === '') {
        return true;
      }

      const serviceLabel = localizeText(
        service.label || service.baseLabel,
        locale,
        ui.common.unnamedService,
      ).toLowerCase();
      const productName = service.product?.name
        ? localizeText(service.product.name, locale, ui.common.unnamedProduct).toLowerCase()
        : '';

      return serviceLabel.includes(keyword) || productName.includes(keyword) || service.id.toLowerCase().includes(keyword);
    });

    const statusWeight: Record<Exclude<ServiceStatusFilter, 'all'>, number> = {
      active: 0,
      pending: 1,
      failed: 2,
      suspended: 3,
      cancelled: 4,
      unknown: 5,
    };

    return [...filtered].sort((left, right) => {
      if (sortBy === 'price-desc') return right.price - left.price;
      if (sortBy === 'price-asc') return left.price - right.price;
      if (sortBy === 'expires-asc') {
        const leftTime = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      }

      const leftStatus = statusWeight[effectiveLifecycleStatus(left)];
      const rightStatus = statusWeight[effectiveLifecycleStatus(right)];
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      return left.id.localeCompare(right.id);
    });
  }, [services, locale, search, sortBy, statusFilter, ui.common.unnamedProduct, ui.common.unnamedService]);

  const visibleRuntimeServiceIds = useMemo(() => {
    const seen = new Set<string>();

    return visibleServices.reduce<string[]>((result, service) => {
      if (!isVpsService(service)) {
        return result;
      }

      const normalizedId = service.id.trim();
      if (normalizedId === '' || seen.has(normalizedId)) {
        return result;
      }

      seen.add(normalizedId);
      result.push(normalizedId);
      return result;
    }, []);
  }, [visibleServices]);

  useEffect(() => {
    let isCurrent = true;
    let isFetching = false;

    if (visibleRuntimeServiceIds.length === 0) {
      setRuntimeSummaryMap({});
      return;
    }

    const fetchRuntimeSummaries = async () => {
      if (isFetching || document.visibilityState === 'hidden') {
        return;
      }

      isFetching = true;
      try {
        const results = await Promise.allSettled(
          visibleRuntimeServiceIds.map((serviceId) =>
            requestJson<RuntimeOverviewResponse>(`/api/v1/services/${encodeURIComponent(serviceId)}/runtime/overview`),
          ),
        );

        if (!isCurrent) {
          return;
        }

        const nextSummaryMap: Record<string, ServiceRowRuntimeSummary> = {};
        visibleRuntimeServiceIds.forEach((serviceId, index) => {
          const result = results[index];
          if (result?.status === 'fulfilled') {
            nextSummaryMap[serviceId] = {
              status: result.value.data.status,
              powerState: result.value.data.overview?.powerState ?? null,
              provisioningStatus: result.value.data.provisioning?.status ?? null,
            };
            return;
          }

          nextSummaryMap[serviceId] = {
            status: 'upstream_unavailable',
            powerState: null,
            provisioningStatus: null,
          };
        });

        setRuntimeSummaryMap(nextSummaryMap);
      } finally {
        isFetching = false;
      }
    };

    void fetchRuntimeSummaries();

    const timer = window.setInterval(() => {
      void fetchRuntimeSummaries();
    }, serviceListRuntimeRefreshMs);

    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, [visibleRuntimeServiceIds]);

  if (loading || authLoading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (!isAuthenticated) {
    return (
      <article className="empty-state">
        <h3>{locale.startsWith('zh') ? '请先登录后查看服务' : 'Sign in to view your services'}</h3>
        <p className="muted">
          {locale.startsWith('zh')
            ? '登录后即可查看实例状态、到期时间、运行状态和后续操作。'
            : 'Sign in to access service status, renewal dates, runtime state, and follow-up actions.'}
        </p>
        <Link className="button primary" to={loginHref}>
          {text.nav.login}
        </Link>
      </article>
    );
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  return (
    <div className="stack-32 services-page">
      <section className="page-section page-section--intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.nav.services}</p>
            <h1>{ui.services.title}</h1>
            <p className="muted">{ui.services.subtitle}</p>
          </div>
        </div>
        <div className="filter-toolbar filter-toolbar--flat">
          <label className="filter-control">
            <span>{ui.common.search}</span>
            <input
              className="text-input"
              value={search}
              placeholder={ui.services.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-control compact">
            <span>{text.common.status}</span>
            <select
              className="text-input select-input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ServiceStatusFilter)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control compact">
            <span>{ui.common.sort}</span>
            <select
              className="text-input select-input"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ServiceSort)}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {visibleServices.length === 0 ? (
        <article className="empty-state">
          <h3>{ui.services.noServices}</h3>
          <Link className="button primary" to="/catalog">
            {text.nav.catalog}
          </Link>
        </article>
      ) : (
        <section className="service-list">
          {visibleServices.map((service) => {
            const normalizedId = service.id.trim();
            const productLine = productLineFor(service.product?.category?.slug, service.product?.slug);
            const serviceLabel = localizeText(service.label || service.baseLabel, locale, ui.common.unnamedService);
            const productName = service.product?.name
              ? localizeText(service.product.name, locale, ui.common.unnamedProduct)
              : ui.common.unnamedProduct;
            const countryCode = service.countryCode
              ?? service.product?.countryCode
              ?? inferCountryCode(serviceLabel, productName);
            const osVisual = getOsVisual(service.selectedOs ?? `${serviceLabel} ${productName}`);
            const lifecycleStatus = effectiveLifecycleStatus(service);
            const operatorOrigin = service.operatorOrigin ?? null;
            const runtimeBadge = serviceRuntimeSummaryBadge(service, runtimeSummaryMap[normalizedId], locale);

            return (
              <article className="service-row-card" key={normalizedId}>
                <div className="service-row-card__status">
                  <div className="service-row-card__status-item">
                    <span className="service-row-card__status-name">{locale.startsWith('zh') ? '服务' : 'Service'}</span>
                    <span className={`status-dot ${statusClassName(lifecycleStatus)}`} />
                    <span className={`status-pill ${statusClassName(lifecycleStatus)}`}>
                      {effectiveLifecycleLabel(service, locale)}
                    </span>
                  </div>
                  {runtimeBadge ? (
                    <div className="service-row-card__status-item">
                      <span className="service-row-card__status-name">{locale.startsWith('zh') ? '运行态' : 'Runtime'}</span>
                      <span className={`status-dot ${runtimeBadge.className}`} />
                      <span className={`status-pill ${runtimeBadge.className}`}>
                        {runtimeBadge.label}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div>
                  <h3>{serviceLabel}</h3>
                  <p className="muted">{productName}</p>
                  <div className="chip-row">
                    <span className="chip">{productLineLabel(productLine, locale)}</span>
                    {operatorOrigin ? (
                      <span className="chip">
                        {locale.startsWith('zh') ? 'AI 来源' : 'AI linked'}
                      </span>
                    ) : null}
                    {countryCode ? (
                      <span className="chip chip--visual">
                        <CountryFlagIcon countryCode={countryCode} />
                        <span>{locale.startsWith('zh') ? '节点' : 'Node'}</span>
                      </span>
                    ) : null}
                    {osVisual.family ? (
                      <span className="chip chip--visual">
                        <VisualIcon glyph={osVisual.glyph} label={osVisual.family} size="sm" src={osVisual.src} tone={osVisual.tone} />
                        <span>{osVisual.family}</span>
                      </span>
                    ) : null}
                    {service.expiresAt ? <span className="chip">{ui.common.expires}: {formatDate(service.expiresAt)}</span> : null}
                  </div>
                  {operatorOrigin ? (
                    <p className="muted">
                      {operatorOrigin.capsuleName || (locale.startsWith('zh') ? 'AI 项目' : 'AI project')}
                      {' · '}
                      {operatorEntryLabel(operatorOrigin.entryKind, locale)}
                      {' · '}
                      {operatorBusinessLabel(operatorOrigin.businessPath, locale)}
                    </p>
                  ) : null}
                </div>
                <div className="service-row-card__aside">
                  <strong>{service.formattedPrice}</strong>
                  <div className="stack-8">
                    <Link className="button primary" to={`/services/${encodeURIComponent(normalizedId)}`}>
                      {ui.services.viewRuntime}
                    </Link>
                    {operatorOrigin?.capsuleId ? (
                      <Link className="button ghost" to={`/operator/${encodeURIComponent(operatorOrigin.capsuleId)}`}>
                        {locale.startsWith('zh') ? '打开 AI 工作区' : 'Open AI workspace'}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
