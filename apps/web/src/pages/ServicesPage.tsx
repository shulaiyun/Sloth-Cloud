import { Link } from 'react-router-dom';

import { useApiData } from '../lib/api';
import { localizeText } from '../lib/localized-text';
import { useSite } from '../lib/site-context';
import type { ServicesResponse } from '../lib/types';

export function ServicesPage() {
  const { text, locale } = useSite();
  const { data, error, loading } = useApiData<ServicesResponse>('/api/v1/services');

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

      {data.data.length === 0 ? (
        <div className="callout">{text.services.noServices}</div>
      ) : (
        <section className="service-grid">
          {data.data.map((service) => (
            <article className="panel stack-12" key={service.id}>
              <h3>{localizeText(service.label || service.baseLabel, locale, service.label || service.baseLabel)}</h3>
              <p className="muted">{service.product?.name ? localizeText(service.product.name, locale, service.product.name) : '-'}</p>
              <div className="detail-grid">
                <div><span>{text.common.status}</span><strong>{service.status}</strong></div>
                <div><span>{text.common.total}</span><strong>{service.formattedPrice}</strong></div>
              </div>
              <Link className="button ghost" to={`/services/${service.id}`}>{text.common.inspect}</Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
