import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import {
  getUiText,
  invoiceStatusLabel,
  normalizeInvoiceStatus,
  statusClassName,
} from '../lib/ui-text';
import { useSite } from '../lib/site-context';
import type { InvoicesResponse } from '../lib/types';

type InvoiceStatusFilter = 'all' | 'paid' | 'pending' | 'cancelled' | 'overdue' | 'unknown';
type InvoiceSort = 'created-desc' | 'due-asc' | 'amount-desc' | 'amount-asc' | 'status';

export function InvoicesPage() {
  const { text, locale, formatDate } = useSite();
  const ui = getUiText(locale);
  const { data, error, loading } = useApiData<InvoicesResponse>('/api/v1/invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');
  const [sortBy, setSortBy] = useState<InvoiceSort>('created-desc');
  const invoices = data?.data ?? [];

  const statusOptions: Array<{ value: InvoiceStatusFilter; label: string }> = [
    { value: 'all', label: ui.common.allStatuses },
    { value: 'paid', label: invoiceStatusLabel('paid', locale) },
    { value: 'pending', label: invoiceStatusLabel('pending', locale) },
    { value: 'cancelled', label: invoiceStatusLabel('cancelled', locale) },
    { value: 'overdue', label: invoiceStatusLabel('overdue', locale) },
    { value: 'unknown', label: invoiceStatusLabel('unknown', locale) },
  ];

  const sortOptions: Array<{ value: InvoiceSort; label: string }> = [
    { value: 'created-desc', label: ui.common.newestFirst },
    { value: 'due-asc', label: ui.common.nearestDueFirst },
    { value: 'amount-desc', label: ui.common.amountHighToLow },
    { value: 'amount-asc', label: ui.common.amountLowToHigh },
    { value: 'status', label: ui.common.sortByStatus },
  ];

  const visibleInvoices = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = invoices.filter((invoice) => {
      const normalizedStatus = normalizeInvoiceStatus(invoice.status);
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) {
        return false;
      }

      if (keyword === '') {
        return true;
      }

      const invoiceNumber = String(invoice.number ?? invoice.id).toLowerCase();
      const invoiceUser = invoice.userName.toLowerCase();
      const amountText = invoice.formattedTotal.toLowerCase();
      return invoiceNumber.includes(keyword) || invoiceUser.includes(keyword) || amountText.includes(keyword);
    });

    const statusWeight: Record<Exclude<InvoiceStatusFilter, 'all'>, number> = {
      pending: 0,
      overdue: 1,
      paid: 2,
      cancelled: 3,
      unknown: 4,
    };

    return [...filtered].sort((left, right) => {
      if (sortBy === 'amount-desc') return right.total - left.total;
      if (sortBy === 'amount-asc') return left.total - right.total;
      if (sortBy === 'due-asc') {
        const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      }
      if (sortBy === 'status') {
        const leftStatus = statusWeight[normalizeInvoiceStatus(left.status)];
        const rightStatus = statusWeight[normalizeInvoiceStatus(right.status)];
        if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      }

      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightCreated - leftCreated;
    });
  }, [invoices, search, sortBy, statusFilter]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  return (
    <div className="stack-32 invoices-page">
      <section className="page-section page-section--intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text.nav.invoices}</p>
            <h1>{ui.invoices.title}</h1>
            <p className="muted">{ui.invoices.subtitle}</p>
          </div>
        </div>

        <div className="filter-toolbar filter-toolbar--flat">
          <label className="filter-control">
            <span>{ui.common.search}</span>
            <input
              className="text-input"
              value={search}
              placeholder={ui.invoices.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-control compact">
            <span>{text.common.status}</span>
            <select
              className="text-input select-input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as InvoiceStatusFilter)}
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
              onChange={(event) => setSortBy(event.target.value as InvoiceSort)}
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

      {visibleInvoices.length === 0 ? (
        <article className="empty-state">
          <h3>{text.invoices.noInvoices}</h3>
          <Link className="button primary" to="/catalog">
            {text.nav.catalog}
          </Link>
        </article>
      ) : (
        <section className="invoice-list">
          {visibleInvoices.map((invoice) => {
            const normalizedStatus = normalizeInvoiceStatus(invoice.status);
            return (
              <article className="invoice-row-card" key={invoice.id}>
                <div>
                  <span className={`status-pill ${statusClassName(normalizedStatus)}`}>
                    {invoiceStatusLabel(invoice.status, locale)}
                  </span>
                  <h3>#{invoice.number ?? invoice.id}</h3>
                  <p className="muted">{ui.common.due}: {formatDate(invoice.dueAt)}</p>
                </div>
                <div className="invoice-row-card__aside">
                  <strong>{invoice.formattedTotal}</strong>
                  <Link className="button primary" to={`/invoices/${invoice.id}`}>{text.common.inspect}</Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
