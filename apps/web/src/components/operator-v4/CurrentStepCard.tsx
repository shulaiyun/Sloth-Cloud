import type { OperatorV3MainAction } from '../../lib/operator-v3-view-model';
import type { OperatorV4CurrentStepCard } from '../../lib/operator-v4-view-model';

interface CurrentStepCardProps {
  locale: string;
  card: OperatorV4CurrentStepCard;
  onMainAction: (action: OperatorV3MainAction | null) => void;
}

export function CurrentStepCard({ locale, card, onMainAction }: CurrentStepCardProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <section className="operator-v4-panel operator-v4-current-step" data-testid="operator-v4-current-step">
      <div className="operator-v4-panel__head">
        <div>
          <span className="operator-v4-eyebrow">{zh ? '当前步骤' : 'Current step'}</span>
          <h2>{card.title}</h2>
        </div>
        {card.mainAction ? (
          <button className="button primary" onClick={() => onMainAction(card.mainAction)} type="button">
            {card.mainAction.label}
          </button>
        ) : null}
      </div>

      <div className="operator-v4-metadata-grid">
        <div>
          <span>{zh ? '当前发生了什么' : 'What is happening'}</span>
          <strong>{card.what}</strong>
        </div>
        <div>
          <span>{zh ? '为什么' : 'Why'}</span>
          <strong>{card.why}</strong>
        </div>
      </div>
    </section>
  );
}
