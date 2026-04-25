import React from 'react';

interface OperatorV4WorkspaceNotice {
  title: string;
  detail: string;
  tone: 'limited' | 'mock';
}

interface WorkspaceHeaderProps {
  locale: string;
  title: string;
  statusLabel: string;
  summary: string;
  activityText?: string | null;
  notice: OperatorV4WorkspaceNotice | null;
  onToggleDetails: () => void;
}

export function WorkspaceHeader({
  locale,
  title,
  statusLabel,
  summary,
  activityText,
  notice,
  onToggleDetails,
}: WorkspaceHeaderProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <header className="operator-v4-workspace-header" data-testid="operator-v4-workspace-header">
      <div className="operator-v4-workspace-header__line">
        <div className="operator-v4-workspace-header__identity">
          <span className="operator-v4-eyebrow">{zh ? '当前项目' : 'Current project'}</span>
          <h2>{title}</h2>
          <span className="operator-v4-panel__subtle">{summary}</span>
        </div>
        <div className="operator-v4-workspace-header__actions">
          <span className="operator-v4-status-pill">{statusLabel}</span>
          {notice ? (
            <div
              className={`operator-v4-workspace-header__notice is-${notice.tone}`}
              data-testid="operator-v4-provider-banner"
            >
              <strong>{notice.title}</strong>
              <span>{notice.detail}</span>
            </div>
          ) : null}
          <button className="button ghost" data-testid="operator-v4-details-toggle" onClick={onToggleDetails} type="button">
            {zh ? '查看细节' : 'View details'}
          </button>
        </div>
      </div>

      {activityText ? (
        <div className="operator-v4-workspace-header__activity" data-testid="operator-v4-quiet-status">
          <span>{activityText}</span>
        </div>
      ) : null}
    </header>
  );
}
