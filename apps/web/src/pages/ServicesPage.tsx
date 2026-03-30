import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { ServiceSummary, ServicesResponse } from '../lib/types';

type ServiceStatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'cancelled' | 'unknown';
type ServiceSort = 'status' | 'price-desc' | 'price-asc' | 'expires-asc';

function normalizeServiceStatus(status: string): Exclude<ServiceStatusFilter, 'all'> {
  const value = status.trim().toLowerCase();
  if (value === 'active') return 'active';
  if (value === 'pending') return 'pending';
  if (value === 'suspended') return 'suspended';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  return 'unknown';
}

function serviceStatusClassName(status: string) {
  switch (normalizeServiceStatus(status)) {
    case 'active':
      return 'status-active';
    case 'pending':
      return 'status-pending';
    case 'suspended':
      return 'status-suspended';
    case 'cancelled':
      return 'status-cancelled';
    default:
      return 'status-unknown';
  }
}

function serviceStatusLabel(status: string, locale: string) {
  const key = normalizeServiceStatus(status);
  const zh = locale.startsWith('zh');

  if (key === 'active') return zh ? '运行中' : 'Active';
  if (key === 'pending') return zh ? '待开通' : 'Pending';
  if (key === 'suspended') return zh ? '已暂停' : 'Suspended';
  if (key === 'cancelled') return zh ? '已取消' : 'Cancelled';
  return zh ? '未知状态' : 'Unknown';
}

function isPurchasedService(service: ServiceSummary) {
  const hasLabel = (service.label || service.baseLabel || '').trim().length > 0;
  const hasProduct = Boolean(service.product?.id || service.product?.slug || service.product?.name);
  const hasPlan = Boolean(service.plan?.id || service.plan?.name);
  const hasLifecycleMeta = Boolean(service.expiresAt || service.cancellable || service.upgradable);

  return Boolean(service.id) && (hasLabel || hasProduct || hasPlan || hasLifecycleMeta);
}

export function ServicesPage() {
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<ServicesResponse>('/api/v1/services');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('all');
  const [sortBy, setSortBy] = useState<ServiceSort>('status');
  const services = data?.data ?? [];

  const statusOptions: Array<{ value: ServiceStatusFilter; label: string }> = [
    { value: 'all', label: locale.startsWith('zh') ? '全部状态' : 'All statuses' },
    { value: 'active', label: serviceStatusLabel('active', locale) },
    { value: 'pending', label: serviceStatusLabel('pending', locale) },
    { value: 'suspended', label: serviceStatusLabel('suspended', locale) },
    { value: 'cancelled', label: serviceStatusLabel('cancelled', locale) },
    { value: 'unknown', label: serviceStatusLabel('unknown', locale) },
  ];

  const sortOptions: Array<{ value: ServiceSort; label: string }> = [
    { value: 'status', label: locale.startsWith('zh') ? '按状态' : 'Sort by status' },
    { value: 'price-desc', label: locale.startsWith('zh') ? '价格从高到低' : 'Price high to low' },
    { value: 'price-asc', label: locale.startsWith('zh') ? '价格从低到高' : 'Price low to high' },
    { value: 'expires-asc', label: locale.startsWith('zh') ? '即将到期优先' : 'Nearest expiry first' },
  ];

  const visibleServices = useMemo(() => {
    const purchasedServices = services.filter(isPurchasedService);
    const keyword = search.trim().toLowerCase();

    const filtered = purchasedServices.filter((service) => {
      const normalizedStatus = normalizeServiceStatus(service.status);
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) {
        return false;
      }

      if (keyword === '') {
        return true;
      }

      const serviceLabel = localizeText(
        service.label || service.baseLabel,
        locale,
        service.label || service.baseLabel,
      ).toLowerCase();
      const productName = service.product?.name
        ? localizeText(service.product.name, locale, service.product.name).toLowerCase()
        : '';

      return serviceLabel.includes(keyword) || productName.includes(keyword) || service.id.toLowerCase().includes(keyword);
    });

    const statusWeight: Record<Exclude<ServiceStatusFilter, 'all'>, number> = {
      active: 0,
      pending: 1,
      suspended: 2,
      cancelled: 3,
      unknown: 4,
    };

    return [...filtered].sort((left, right) => {
      if (sortBy === 'price-desc') {
        return right.price - left.price;
      }
      if (sortBy === 'price-asc') {
        return left.price - right.price;
      }
      if (sortBy === 'expires-asc') {
        const leftTime = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      }

      const leftStatus = statusWeight[normalizeServiceStatus(left.status)];
      const rightStatus = statusWeight[normalizeServiceStatus(right.status)];
      if (leftStatus !== rightStatus) {
        return leftStatus - rightStatus;
      }

      return left.id.localeCompare(right.id);
    });
  }, [services, locale, search, sortBy, statusFilter]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.services}</p>
          <h1>{text.services.title}</h1>
          <p className="muted">{text.services.subtitle}</p>
        </div>
      </section>

      <section className="panel stack-12">
        <div className="filter-toolbar">
          <label className="filter-control">
            <span>{locale.startsWith('zh') ? '搜索' : 'Search'}</span>
            <input
              className="text-input"
              value={search}
              placeholder={locale.startsWith('zh') ? '输入服务名、产品名或 ID' : 'Search by service, product, or ID'}
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
            <span>{locale.startsWith('zh') ? '排序' : 'Sort'}</span>
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
        <div className="callout">{text.services.noServices}</div>
      ) : (
        <section className="service-grid">
          {visibleServices.map((service) => (
            <article className="panel stack-12" key={service.id}>
              <h3>{localizeText(service.label || service.baseLabel, locale, service.label || service.baseLabel)}</h3>
              <p className="muted">
                {service.product?.name ? localizeText(service.product.name, locale, service.product.name) : '-'}
              </p>
              <div className="detail-grid">
                <div>
                  <span>{text.common.status}</span>
                  <strong>
                    <span className={`status-pill ${serviceStatusClassName(service.status)}`}>
                      {serviceStatusLabel(service.status, locale)}
                    </span>
                  </strong>
                </div>
                <div>
                  <span>{text.common.total}</span>
                  <strong>{service.formattedPrice}</strong>
                </div>
              </div>
              <Link className="button ghost" to={`/services/${service.id}`}>
                {text.common.inspect}
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

