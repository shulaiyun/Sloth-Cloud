import type { OperatorV3ProgressState } from '../../lib/operator-v3-view-model';

interface OperatorV3ProgressProps {
  progress: OperatorV3ProgressState;
  locale: string;
  onMainAction?: () => void;
}

export function OperatorV3Progress({ progress, locale, onMainAction }: OperatorV3ProgressProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <section className="operator-v3-panel operator-v3-progress" data-testid="operator-v3-progress">
      <div className="operator-v3-panel__head">
        <div>
          <span className="operator-v3-eyebrow">{zh ? '当前步骤' : 'Current step'}</span>
          <h2>{progress.currentStepLabel}</h2>
        </div>
        {progress.mainAction ? (
          <button className="button primary" onClick={onMainAction} type="button">
            {progress.mainAction.label}
          </button>
        ) : null}
      </div>

      <div className="operator-v3-progress__track" role="list">
        {progress.steps.map((step, index) => (
          <div
            className={`operator-v3-progress__step is-${step.status}`}
            key={step.id}
            role="listitem"
          >
            <span className="operator-v3-progress__index">{index + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      <p className="operator-v3-progress__summary">{progress.summary}</p>
    </section>
  );
}
