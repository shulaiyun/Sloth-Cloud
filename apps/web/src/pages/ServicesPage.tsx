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

  const statusLabels: Record<Exclude<ServiceStatusFilter, 'all'>, string> = {
    active: text.services.statusActive,
    pending: text.services.statusPending,
    suspended: text.services.statusSuspended,
    cancelled: text.services.statusCancelled,
    unknown: text.services.statusUnknown,
  };

  const statusOptions: Array<{ value: ServiceStatusFilter; label: string }> = [
    { value: 'all', label: text.services.statusAll },
    { value: 'active', label: statusLabels.active },
    { value: 'pending', label: statusLabels.pending },
    { value: 'suspended', label: statusLabels.suspended },
    { value: 'cancelled', label: statusLabels.cancelled },
    { value: 'unknown', label: statusLabels.unknown },
  ];

  const sortOptions: Array<{ value: ServiceSort; label: string }> = [
    { value: 'status', label: text.services.sortByStatus },
    { value: 'price-desc', label: text.services.sortPriceDesc },
    { value: 'price-asc', label: text.services.sortPriceAsc },
    { value: 'expires-asc', label: text.services.sortExpiresAsc },
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
            <span>{text.common.search}</span>
            <input
              className="text-input"
              value={search}
              placeholder={text.services.searchPlaceholder}
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
            <span>{text.common.sort}</span>
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
          {visibleServices.map((service) => {
            const normalized = normalizeServiceStatus(service.status);
            const statusClassName = `status-${normalized}`;

            return (
              <article className="panel stack-12" key={service.id}>
                <h3>{localizeText(service.label || service.baseLabel, locale, service.label || service.baseLabel)}</h3>
                <p className="muted">
                  {service.product?.name ? localizeText(service.product.name, locale, service.product.name) : '-'}
                </p>
                <div className="detail-grid">
                  <div>
                    <span>{text.common.status}</span>
                    <strong>
                      <span className={`status-pill ${statusClassName}`}>
                        {statusLabels[normalized]}
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
            );
          })}
        </section>
      )}
    </div>
  );
}
