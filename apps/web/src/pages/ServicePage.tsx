import { Link, useParams } from 'react-router-dom';

import { StatusPill } from '../components/StatusPill';
import { useApiData } from '../lib/api';
import { useSite } from '../lib/site-context';
import type { ServiceDetail } from '../lib/types';

export function ServicePage() {
  const { serviceId } = useParams();
  const { text, formatMoney, formatDate } = useSite();
  const { data, error, loading } = useApiData<ServiceDetail>(
    serviceId ? `/api/v1/client/services/${serviceId}` : null,
  );

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {error}</div>;
  }

  return (
    <div className="stack-24">
      <section className="detail-hero">
        <div className="stack-16">
          <Link className="text-link" to="/catalog">{text.common.backToCatalog}</Link>
          <div className="chip-row">
            <StatusPill status={data.status} />
            <span className="chip">{text.common.sourceMode}: {data.sourceMode === 'live' ? text.common.live : text.common.mock}</span>
          </div>
          <h1>{data.label}</h1>
          <p className="lead">{data.description}</p>
        </div>
        <aside className="summary-card">
          <span className="eyebrow">{text.service.details}</span>
          <strong className="price-large">{formatMoney(data.price, data.currency)}</strong>
          <p>{data.billingCycleLabel}</p>
          <small>{formatDate(data.renewalAt)}</small>
        </aside>
      </section>

      <section className="service-grid">
        <article className="panel">
          <p className="eyebrow">{text.service.details}</p>
          <div className="detail-grid">
            <div>
              <span>Product</span>
              <strong>{data.productName}</strong>
            </div>
            <div>
              <span>Location</span>
              <strong>{data.location}</strong>
            </div>
            <div>
              <span>Renewal</span>
              <strong>{formatDate(data.renewalAt)}</strong>
            </div>
            <div>
              <span>Billing</span>
              <strong>{data.billingCycleLabel}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">{text.service.network}</p>
          <div className="bullet-list">
            {data.network.ipv4.map((item) => <span key={item}>IPv4: {item}</span>)}
            {data.network.ipv6.map((item) => <span key={item}>IPv6: {item}</span>)}
            <span>rDNS: {data.network.rdns ?? text.common.notAvailable}</span>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">{text.service.properties}</p>
          <div className="property-grid">
            {data.properties.map((item) => (
              <div className="property-card" key={item.key}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">{text.service.actions}</p>
          <div className="stack-12">
            {data.actions.map((action) => (
              <button className={`button ${action.kind}`} disabled={!action.enabled} key={action.id} type="button">
                {action.label}
              </button>
            ))}
            <p className="muted">{text.common.notAvailable}</p>
          </div>
        </article>
      </section>
    </div>
  );
}
