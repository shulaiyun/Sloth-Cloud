import type { OperatorV3ProgressState } from '../../lib/operator-v3-view-model';

interface TaskProgressBarProps {
  progress: OperatorV3ProgressState;
}

export function TaskProgressBar({ progress }: TaskProgressBarProps) {
  return (
    <section className="operator-v4-panel operator-v4-progress" data-testid="operator-v4-progress">
      <div className="operator-v4-progress__track" role="list">
        {progress.steps.map((step, index) => (
          <div
            className={`operator-v4-progress__step is-${step.status}`}
            key={step.id}
            role="listitem"
          >
            <span className="operator-v4-progress__index">{index + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
