import { useSite } from '../lib/site-context';
import type { ServiceDetail } from '../lib/types';

export function StatusPill({ status }: { status: ServiceDetail['status'] }) {
  const { text } = useSite();

  return (
    <span className={`status-pill status-${status}`}>
      {text.status[status]}
    </span>
  );
}

