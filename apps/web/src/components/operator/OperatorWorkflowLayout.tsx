import type { ChangeEvent, RefObject } from 'react';

import type {
  OperatorCapsule,
  OperatorWorkflowCard,
} from '../../lib/operator-types';
import {
  decodeWorkspaceTitle,
  getWorkflowCardStableId,
  resolveWorkflowCardKindLabel,
  type ActiveTaskTruth,
} from '../../lib/operator-workbench-state';

type ComposerAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string;
};

function formatTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function statusClassName(status: string | null | undefined) {
  if (
    status === 'preview_live'
    || status === 'production_live'
    || status === 'preview_ready'
    || status === 'audit_ready'
    || status === 'ready'
    || status === 'ready_for_production_approval'
    || status === 'success'
    || status === 'partial_success'
    || status === 'rolled_back'
  ) {
    return 'status-active';
  }
  if (
    status === 'needs_attention'
    || status === 'preview_failed'
    || status === 'audit_failed'
    || status === 'blocked'
    || status === 'env_blocked'
    || status === 'failed'
  ) {
    return 'status-overdue';
  }
  if (
    status === 'job_running'
    || status === 'running'
    || status === 'queued'
    || status === 'verifying_repo'
    || status === 'parsing'
    || status === 'preflight'
    || status === 'llm_planning'
    || status === 'verifying'
  ) {
    return 'status-running';
  }
  return 'status-pending';
}

function entryKindLabel(entryKind: OperatorCapsule['entryKind']) {
  if (entryKind === 'upload-project') return 'repo';
  if (entryKind === 'generate-from-idea') return 'idea';
  return 'server';
}

function workspaceStageValue(workspace: OperatorCapsule) {
  return workspace.workflowStage ?? workspace.truthState ?? workspace.status;
}

function sourceLabel(source: OperatorWorkflowCard['source']) {
  return source;
}

interface WorkspaceRailProps {
  locale: string;
  selectedWorkspaceId: string | null;
  workspaces: OperatorCapsule[];
  onSelectWorkspace: (workspaceId: string) => void;
}

export function WorkspaceRail({
  locale,
  selectedWorkspaceId,
  workspaces,
  onSelectWorkspace,
}: WorkspaceRailProps) {
  const zh = locale.startsWith('zh');

  return (
    <aside className="operator-console-rail">
      <div className="operator-console-rail__header">
        <span className="eyebrow">{zh ? '导航' : 'Navigation'}</span>
        <h1>{zh ? '工作区' : 'Workspaces'}</h1>
      </div>

      <div className="operator-console-workspace-list">
        {workspaces.length === 0 ? (
          <article className="operator-console-empty">
            <strong>{zh ? '还没有工作区' : 'No workspaces yet'}</strong>
          </article>
        ) : workspaces.map((workspace) => {
          const selected = workspace.id === selectedWorkspaceId;
          const stageValue = workspaceStageValue(workspace);
          return (
            <button
              className={`operator-console-workspace operator-console-workspace--compact ${selected ? 'active' : ''}`}
              key={workspace.id}
              onClick={() => onSelectWorkspace(workspace.id)}
              type="button"
            >
              <div className="operator-console-workspace__top">
                <strong>{decodeWorkspaceTitle(workspace.name)}</strong>
                <span className={`chip ${statusClassName(stageValue)}`}>{stageValue}</span>
              </div>
              <span>{entryKindLabel(workspace.entryKind)}</span>
              <div className="operator-console-workspace__meta">
                <span>{formatTime(workspace.updatedAt, locale)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

interface TimelinePanelProps {
  locale: string;
  selectedWorkspaceId: string | null;
  workspaceTitle: string;
  cards: OperatorWorkflowCard[];
  endRef?: RefObject<HTMLDivElement | null>;
}

export function TimelinePanel({
  locale,
  selectedWorkspaceId,
  workspaceTitle,
  cards,
  endRef,
}: TimelinePanelProps) {
  const zh = locale.startsWith('zh');

  return (
    <>
      <div className="operator-console-panel__head">
        <div>
          <span className="eyebrow">{zh ? '时间线' : 'Timeline'}</span>
          <h2>{selectedWorkspaceId ? workspaceTitle : (zh ? '代理时间线' : 'Agent timeline')}</h2>
        </div>
      </div>

      <div className="operator-console-thread" data-testid="timeline-panel">
        {cards.length === 0 ? (
          <p className="operator-console-timeline-empty" data-testid="timeline-empty">
            {selectedWorkspaceId ? '-' : (zh ? '选择工作区或发送请求后，这里只显示真实时间线。' : 'Select a workspace or send a request to see the real timeline here.')}
          </p>
        ) : cards.map((card) => {
          const stableId = getWorkflowCardStableId(card);
          return (
            <article
              className="operator-console-timeline-card"
              data-testid={`timeline-card-${stableId}`}
              key={stableId}
            >
              <div className="operator-console-stage-card__head">
                <div>
                  <span className="eyebrow">card_type</span>
                  <strong>{resolveWorkflowCardKindLabel(card.kind)}</strong>
                </div>
                <span className={`chip ${statusClassName(card.stage)}`}>{card.stage}</span>
              </div>
              <p>{card.summary}</p>
              <div className="operator-console-timeline-meta">
                <div>
                  <span>stage</span>
                  <strong>{card.stage}</strong>
                </div>
                <div>
                  <span>source</span>
                  <strong>{sourceLabel(card.source)}</strong>
                </div>
                <div>
                  <span>stable_id</span>
                  <code>{stableId}</code>
                </div>
              </div>
              <div className="operator-console-timeline-section">
                <span className="operator-console-timeline-section__label">evidence</span>
                <div className="operator-console-requirements">
                  {card.evidence.length === 0 ? (
                    <div className="operator-console-requirement">
                      <p>-</p>
                    </div>
                  ) : card.evidence.map((entry) => (
                    <div className="operator-console-requirement" key={entry.id}>
                      <div className="operator-console-workspace__top">
                        <strong>{entry.label}</strong>
                        <span className="chip">{entry.source}</span>
                      </div>
                      <p>{entry.detail || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="operator-console-timeline-section">
                <span className="operator-console-timeline-section__label">next_step</span>
                <strong>{card.nextStep ?? '-'}</strong>
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
    </>
  );
}

interface TruthPanelProps {
  locale: string;
  workspaceTitle: string;
  truth: ActiveTaskTruth;
}

export function TruthPanel({ locale, workspaceTitle, truth }: TruthPanelProps) {
  const zh = locale.startsWith('zh');

  return (
    <aside className="operator-console-stage">
      <div className="operator-console-panel operator-console-panel--sticky">
        <div className="operator-console-panel__head">
          <div>
            <span className="eyebrow">{zh ? '真相面板' : 'Truth panel'}</span>
            <h2>{workspaceTitle}</h2>
          </div>
        </div>

        <div className="operator-console-stage__stack">
          <div className="operator-console-stage-card">
            <div className="operator-console-truth-grid">
              <div data-testid="truth-current_stage">
                <span>current_stage</span>
                <strong>{truth.currentStage}</strong>
              </div>
              <div data-testid="truth-run_state">
                <span>run_state</span>
                <strong>{truth.runState}</strong>
              </div>
              <div data-testid="truth-active_task_id">
                <span>active_task_id</span>
                <strong>{truth.activeTaskId}</strong>
              </div>
              <div data-testid="truth-latest_artifact">
                <span>latest_artifact</span>
                <strong>{truth.latestArtifact}</strong>
              </div>
              <div data-testid="truth-failure_code">
                <span>failure_code</span>
                <strong>{truth.failureCode}</strong>
              </div>
              <div data-testid="truth-human_summary">
                <span>human_summary</span>
                <strong>{truth.humanSummary}</strong>
              </div>
              <div data-testid="truth-probable_root_cause">
                <span>probable_root_cause</span>
                <strong>{truth.probableRootCause}</strong>
              </div>
            </div>
          </div>

          <div className="operator-console-stage-card" data-testid="truth-actions">
            <span className="operator-console-timeline-section__label">recommended_actions</span>
            <div className="operator-console-requirements">
              {truth.recommendedActions.map((action, index) => (
                <div className="operator-console-requirement" key={`${action}-${index}`}>
                  {action}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface ComposerFooterProps {
  locale: string;
  busy: boolean;
  composer: string;
  attachments: ComposerAttachment[];
  planningMode: 'on' | 'off';
  taskMode: 'continue' | 'new_turn';
  canContinueCurrentTask: boolean;
  assistantError: string | null;
  attachmentError: string | null;
  feedback: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onComposerChange: (value: string) => void;
  onPlanningModeChange: (checked: boolean) => void;
  onContinueCurrentTask: () => void;
  onTaskModeChange: (mode: 'continue' | 'new_turn') => void;
  onAttachmentRemove: (attachmentId: string) => void;
  onSubmit: () => void;
}

export function ComposerFooter({
  locale,
  busy,
  composer,
  attachments,
  planningMode,
  taskMode,
  canContinueCurrentTask,
  assistantError,
  attachmentError,
  feedback,
  fileInputRef,
  onAttachmentChange,
  onComposerChange,
  onPlanningModeChange,
  onContinueCurrentTask,
  onTaskModeChange,
  onAttachmentRemove,
  onSubmit,
}: ComposerFooterProps) {
  const zh = locale.startsWith('zh');

  return (
    <div className="operator-console-thread-footer">
      <div className="operator-console-footer-messages">
        {assistantError ? <div className="error-card compact">{assistantError}</div> : null}
        {attachmentError ? <div className="error-card compact">{attachmentError}</div> : null}
        {feedback ? <div className="success-card compact">{feedback}</div> : null}
      </div>

      {attachments.length > 0 ? (
        <div className="operator-console-attachments">
          {attachments.map((attachment) => (
            <div className="operator-console-attachment" key={attachment.id}>
              <strong>{attachment.name}</strong>
              <span>{Math.max(1, Math.round(attachment.sizeBytes / 1024))}KB</span>
              <button
                className="button ghost"
                onClick={() => onAttachmentRemove(attachment.id)}
                type="button"
              >
                {zh ? '移除' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="operator-console-composer">
        <div className="operator-console-link-row">
          <label className="operator-console-hint">
            <input
              checked={planningMode === 'on'}
              onChange={(event) => onPlanningModeChange(event.target.checked)}
              type="checkbox"
            />
            {' '}
            {zh ? '规划模式' : 'Planning mode'}
          </label>
          <button
            className="button ghost"
            disabled={busy || !canContinueCurrentTask}
            onClick={onContinueCurrentTask}
            type="button"
          >
            {zh ? '继续当前任务' : 'Continue current task'}
          </button>
          <button
            className={`button ghost ${taskMode === 'new_turn' ? 'active' : ''}`}
            onClick={() => onTaskModeChange('new_turn')}
            type="button"
          >
            {zh ? '新建回合' : 'New turn'}
          </button>
        </div>

        <textarea
          onChange={(event) => onComposerChange(event.target.value)}
          placeholder={zh
            ? '直接输入仓库链接、压缩包 URL、项目文件说明、想法或旧服务器信息。AI 会先规划，再进入真实执行。'
            : 'Describe the repository link, archive URL, project files, idea, or existing server. AI will plan first, then move into real execution.'}
          rows={5}
          value={composer}
        />

        <div className="operator-console-composer__row">
          <div className="operator-console-link-row">
            <input
              accept=".txt,.md,.json,.yaml,.yml,.toml,.ini,.conf,.env,.log,.sh,.js,.ts,.tsx,.jsx,.py,.php,.java,.go,.rs,.sql,.xml,.html,.css,Dockerfile"
              hidden
              multiple
              onChange={onAttachmentChange}
              ref={fileInputRef}
              type="file"
            />
            <button className="button ghost" onClick={() => fileInputRef.current?.click()} type="button">
              {zh ? '上传项目文件' : 'Upload project files'}
            </button>
          </div>
          <button
            className="button primary"
            disabled={busy || (!composer.trim() && attachments.length === 0)}
            onClick={onSubmit}
            type="button"
          >
            {busy ? (zh ? '发送中...' : 'Sending...') : (zh ? '发送给 AI' : 'Send to AI')}
          </button>
        </div>
      </div>
    </div>
  );
}
