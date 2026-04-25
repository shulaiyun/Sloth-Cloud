import type { OperatorV3ArtifactState } from '../../lib/operator-v3-view-model';

interface OperatorV3ArtifactBarProps {
  artifact: OperatorV3ArtifactState | null;
  locale: string;
  onMainAction?: () => void;
}

export function OperatorV3ArtifactBar({ artifact, locale, onMainAction }: OperatorV3ArtifactBarProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  if (!artifact) {
    return (
      <section className="operator-v3-panel operator-v3-artifact">
        <div className="operator-v3-panel__head">
          <div>
            <span className="operator-v3-eyebrow">{zh ? '当前产物' : 'Current artifact'}</span>
            <h2>{zh ? '还没有产物' : 'No artifact yet'}</h2>
          </div>
        </div>
        <p className="operator-v3-artifact__summary">
          {zh ? '从一句需求、一个仓库或一段继续指令开始，产物会在这里连续出现。' : 'Start from a request, repository, or continuation message and the artifact chain will appear here.'}
        </p>
      </section>
    );
  }

  return (
    <section className="operator-v3-panel operator-v3-artifact" data-testid="operator-v3-artifact-bar">
      <div className="operator-v3-panel__head">
        <div>
          <span className="operator-v3-eyebrow">{zh ? '当前产物' : 'Current artifact'}</span>
          <h2>{artifact.title}</h2>
        </div>
        <span className={`operator-v3-status-pill ${artifact.verified ? 'is-verified' : ''}`}>
          {artifact.statusLabel}
        </span>
      </div>

      <div className="operator-v3-artifact__meta">
        <div>
          <span>{zh ? '类型' : 'Type'}</span>
          <strong>{artifact.typeLabel}</strong>
        </div>
        <div>
          <span>{zh ? '入口文件' : 'Entry file'}</span>
          <strong>{artifact.entryFile}</strong>
        </div>
      </div>

      <p className="operator-v3-artifact__summary">{artifact.summary}</p>

      {artifact.mainAction ? (
        <div className="operator-v3-artifact__actions">
          <button className="button secondary" onClick={onMainAction} type="button">
            {artifact.mainAction.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}
