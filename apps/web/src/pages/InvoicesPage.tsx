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

function invoiceStatusClassName(status: string) {
  switch (normalizeInvoiceStatus(status)) {
    case 'paid':
      return 'status-active';
    case 'pending':
      return 'status-pending';
    case 'overdue':
      return 'status-overdue';
    case 'cancelled':
      return 'status-cancelled';
    default:
      return 'status-unknown';
  }
}

function invoiceStatusLabel(status: string, locale: string) {
  const key = normalizeInvoiceStatus(status);
  const zh = locale.startsWith('zh');
  if (key === 'paid') return zh ? '\u5df2\u652f\u4ed8' : 'Paid';
  if (key === 'pending') return zh ? '\u5f85\u652f\u4ed8' : 'Pending';
  if (key === 'cancelled') return zh ? '\u5df2\u53d6\u6d88' : 'Cancelled';
  if (key === 'overdue') return zh ? '\u5df2\u903e\u671f' : 'Overdue';
  return zh ? '\u672a\u77e5' : 'Unknown';
}

export function InvoicesPage() {
  const { text, locale, formatDate } = useSite();
  const { data, error, loading } = useApiData<InvoicesResponse>('/api/v1/invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');
  const [sortBy, setSortBy] = useState<InvoiceSort>('created-desc');
  const invoices = data?.data ?? [];
  const zh = locale.startsWith('zh');

  const statusOptions: Array<{ value: InvoiceStatusFilter; label: string }> = [
    { value: 'all', label: zh ? '\u5168\u90e8\u72b6\u6001' : 'All statuses' },
    { value: 'paid', label: invoiceStatusLabel('paid', locale) },
    { value: 'pending', label: invoiceStatusLabel('pending', locale) },
    { value: 'cancelled', label: invoiceStatusLabel('cancelled', locale) },
    { value: 'overdue', label: invoiceStatusLabel('overdue', locale) },
    { value: 'unknown', label: invoiceStatusLabel('unknown', locale) },
  ];

  const sortOptions: Array<{ value: InvoiceSort; label: string }> = [
    { value: 'created-desc', label: zh ? '\u6700\u65b0\u5f00\u7968\u4f18\u5148' : 'Newest invoices first' },
    { value: 'due-asc', label: zh ? '\u6700\u65e9\u5230\u671f\u4f18\u5148' : 'Nearest due date first' },
    { value: 'amount-desc', label: zh ? '\u91d1\u989d\u4ece\u9ad8\u5230\u4f4e' : 'Amount high to low' },
    { value: 'amount-asc', label: zh ? '\u91d1\u989d\u4ece\u4f4e\u5230\u9ad8' : 'Amount low to high' },
    { value: 'status', label: zh ? '\u6309\u72b6\u6001' : 'Sort by status' },
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
        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }
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
            <span>{zh ? '\u641c\u7d22' : 'Search'}</span>
            <input
              className="text-input"
              value={search}
              placeholder={zh ? '\u8f93\u5165\u8d26\u5355\u7f16\u53f7\u3001\u7528\u6237\u6216\u91d1\u989d' : 'Search by invoice number, user, or amount'}
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
            <span>{zh ? '\u6392\u5e8f' : 'Sort'}</span>
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
          {visibleInvoices.map((invoice) => (
            <article className="panel stack-12" key={invoice.id}>
              <h3>#{invoice.number ?? invoice.id}</h3>
              <p>
                <span className={`status-pill ${invoiceStatusClassName(invoice.status)}`}>
                  {invoiceStatusLabel(invoice.status, locale)}
                </span>
              </p>
              <p className="muted">
                {zh ? '\u5230\u671f' : 'Due'}: {formatDate(invoice.dueAt)}
              </p>
              <strong>{invoice.formattedTotal}</strong>
              <Link className="button ghost" to={`/invoices/${invoice.id}`}>{text.common.inspect}</Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
