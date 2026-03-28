import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { InvoicesResponse } from '../lib/types';

export function InvoicesPage() {
  const { text } = useSite();
  const { data, error, loading } = useApiData<InvoicesResponse>('/api/v1/invoices');

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

      {data.data.length === 0 ? (
        <div className="callout">{text.invoices.noInvoices}</div>
      ) : (
        <section className="card-grid section-products">
          {data.data.map((invoice) => (
            <article className="panel stack-12" key={invoice.id}>
              <h3>#{invoice.number ?? invoice.id}</h3>
              <p className="muted">{invoice.status}</p>
              <strong>{invoice.formattedTotal}</strong>
              <Link className="button ghost" to={`/invoices/${invoice.id}`}>{text.common.inspect}</Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
