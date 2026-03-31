import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { InvoicesResponse } from '../lib/types';

type InvoiceStatusFilter = 'all' | 'paid' | 'pending' | 'cancelled' | 'overdue' | 'unknown';
type InvoiceSort = 'created-desc' | 'due-asc' | 'amount-desc' | 'amount-asc' | 'status';

function normalizeInvoiceStatus(status: string): Exclude<InvoiceStatusFilter, 'all'> {
  const value = status.trim().toLowerCase();

  if (value === 'paid' || value === 'completed') return 'paid';
  if (value === 'pending' || value === 'unpaid') return 'pending';
  if (value === 'cancelled' || value === 'canceled' || value === 'void') return 'cancelled';
  if (value === 'overdue') return 'overdue';
  return 'unknown';
}

export function InvoicesPage() {
  const { text, formatDate } = useSite();
  const { data, error, loading } = useApiData<InvoicesResponse>('/api/v1/invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');
  const [sortBy, setSortBy] = useState<InvoiceSort>('created-desc');
  const invoices = data?.data ?? [];

  const statusLabels: Record<Exclude<InvoiceStatusFilter, 'all'>, string> = {
    paid: text.invoices.statusPaid,
    pending: text.invoices.statusPending,
    cancelled: text.invoices.statusCancelled,
    overdue: text.invoices.statusOverdue,
    unknown: text.invoices.statusUnknown,
  };

  const statusOptions: Array<{ value: InvoiceStatusFilter; label: string }> = [
    { value: 'all', label: text.invoices.statusAll },
    { value: 'paid', label: statusLabels.paid },
    { value: 'pending', label: statusLabels.pending },
    { value: 'cancelled', label: statusLabels.cancelled },
    { value: 'overdue', label: statusLabels.overdue },
    { value: 'unknown', label: statusLabels.unknown },
  ];

  const sortOptions: Array<{ value: InvoiceSort; label: string }> = [
    { value: 'created-desc', label: text.invoices.sortNewest },
    { value: 'due-asc', label: text.invoices.sortDue },
    { value: 'amount-desc', label: text.invoices.sortAmountDesc },
    { value: 'amount-asc', label: text.invoices.sortAmountAsc },
    { value: 'status', label: text.invoices.sortByStatus },
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
      if (sortBy === 'amount-desc') {
        return right.total - left.total;
      }
      if (sortBy === 'amount-asc') {
        return left.total - right.total;
      }
      if (sortBy === 'due-asc') {
        const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      }
      if (sortBy === 'status') {
        const leftStatus = statusWeight[normalizeInvoiceStatus(left.status)];
        const rightStatus = statusWeight[normalizeInvoiceStatus(right.status)];
        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }
      }

      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightCreated - leftCreated;
    });
  }, [invoices, search, statusFilter, sortBy]);

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
          <p className="eyebrow">{text.nav.invoices}</p>
          <h1>{text.invoices.title}</h1>
          <p className="muted">{text.invoices.subtitle}</p>
        </div>
      </section>

      <section className="panel stack-12">
        <div className="filter-toolbar">
          <label className="filter-control">
            <span>{text.common.search}</span>
            <input
              className="text-input"
              value={search}
              placeholder={text.invoices.searchPlaceholder}
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
            <span>{text.common.sort}</span>
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
        <div className="callout">{text.invoices.noInvoices}</div>
      ) : (
        <section className="card-grid section-products">
          {visibleInvoices.map((invoice) => {
            const normalized = normalizeInvoiceStatus(invoice.status);
            const statusClassName = `status-${normalized}`;

            return (
              <article className="panel stack-12" key={invoice.id}>
                <h3>#{invoice.number ?? invoice.id}</h3>
                <p>
                  <span className={`status-pill ${statusClassName}`}>
                    {statusLabels[normalized]}
                  </span>
                </p>
                <p className="muted">
                  {text.common.due}: {formatDate(invoice.dueAt)}
                </p>
                <strong>{invoice.formattedTotal}</strong>
                <Link className="button ghost" to={`/invoices/${invoice.id}`}>{text.common.inspect}</Link>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
