import type { OperatorV4ArtifactStage } from '../../lib/operator-v4-view-model';

interface ArtifactBarProps {
  locale: string;
  artifact: OperatorV4ArtifactStage;
  onMainAction: () => void;
}

export function ArtifactBar({ locale, artifact, onMainAction }: ArtifactBarProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <section className="operator-v4-panel operator-v4-artifact-bar" data-testid="operator-v4-artifact-bar">
      <div className="operator-v4-panel__head">
        <div>
          <span className="operator-v4-eyebrow">{zh ? '当前产物' : 'Current artifact'}</span>
          <h2>{artifact.title}</h2>
          <p className="operator-v4-panel__subtle">{artifact.summary}</p>
        </div>
        <div className="operator-v4-artifact-bar__actions">
          <span
            className={`operator-v4-status-pill operator-v4-status-pill--preview is-${artifact.preview.level}`}
            data-testid="operator-v4-preview-level"
          >
            {artifact.preview.label}
          </span>
          {artifact.mainAction ? (
            <button className="button primary" onClick={onMainAction} type="button">
              {artifact.mainAction.label}
            </button>
          ) : null}
        </div>
      </div>

      <div className="operator-v4-callout operator-v4-callout--preview">
        <strong>{zh ? '预览分级' : 'Preview tier'}</strong>
        <span>{artifact.preview.summary}</span>
      </div>
    </section>
  );
}
