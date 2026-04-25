import React from 'react';

import type { OperatorV3DrawerState } from '../../lib/operator-v3-view-model';
import type { OperatorEnvelope, OperatorWorkflowTask } from '../../lib/operator-types';

interface DetailsDrawerProps {
  locale: string;
  open: boolean;
  drawer: OperatorV3DrawerState;
  envelope: OperatorEnvelope | null;
  activeTask: OperatorWorkflowTask | null;
  routing?: {
    route: string;
    lane: string | null;
    source: string | null;
    reason: string;
  } | null;
  onToggle: () => void;
}

export function DetailsDrawer({
  locale,
  open,
  drawer,
  envelope,
  activeTask,
  routing,
  onToggle,
}: DetailsDrawerProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  if (!open) {
    return null;
  }

  return (
    <section
      aria-modal="true"
      className="operator-v4-panel operator-v4-drawer is-open"
      data-testid="operator-v4-details-drawer"
      role="dialog"
    >
      <div className="operator-v4-panel__head">
        <div>
          <span className="operator-v4-eyebrow">{zh ? '详情抽屉' : 'Details drawer'}</span>
          <h2>{zh ? '查看细节' : 'View details'}</h2>
        </div>
        <button aria-expanded={open} className="button ghost" onClick={onToggle} type="button">
          {zh ? '收起' : 'Hide'}
        </button>
      </div>

      <div className="operator-v4-drawer__body">
        <section className="operator-v4-drawer__section">
          <h3>{zh ? '详情' : 'Details'}</h3>
          <div className="operator-v4-metadata-grid">
            <div data-testid="details-run_state">
              <span>run_state</span>
              <strong>{drawer.runState}</strong>
            </div>
            <div data-testid="details-stable_id">
              <span>stable_id</span>
              <strong>{activeTask?.timeline.at(-1)?.id ?? '-'}</strong>
            </div>
            <div data-testid="details-active_task_id">
              <span>active_task_id</span>
              <strong>{drawer.taskId ?? '-'}</strong>
            </div>
            <div data-testid="details-failure_code">
              <span>failure_code</span>
              <strong>{drawer.failureCode ?? '-'}</strong>
            </div>
            <div data-testid="details-source">
              <span>source</span>
              <strong>{activeTask?.timeline.at(-1)?.source ?? '-'}</strong>
            </div>
            <div data-testid="details-route">
              <span>route</span>
              <strong>{routing?.route ?? '-'}</strong>
            </div>
            <div data-testid="details-lane">
              <span>lane</span>
              <strong>{routing?.lane ?? '-'}</strong>
            </div>
            <div data-testid="details-route_source">
              <span>route_source</span>
              <strong>{routing?.source ?? '-'}</strong>
            </div>
          </div>
        </section>

        <section className="operator-v4-drawer__section">
          <h3>{zh ? '部署' : 'Deployment'}</h3>
          <div className="operator-v4-metadata-grid">
            <div>
              <span>{zh ? '目标' : 'Target'}</span>
              <strong>{envelope?.deploymentSummary.targetLabel ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '预览地址' : 'Preview URL'}</span>
              <strong>{envelope?.previewSummary.previewUrl ?? envelope?.previewUrl ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '正式地址' : 'Production URL'}</span>
              <strong>{envelope?.productionUrl ?? '-'}</strong>
            </div>
          </div>
        </section>

        <section className="operator-v4-drawer__section">
          <h3>{zh ? '工件' : 'Artifacts'}</h3>
          <div className="operator-v4-metadata-grid">
            <div>
              <span>{zh ? '产物来源' : 'Artifact source'}</span>
              <strong>{envelope?.artifactSummary.sourceRef ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '入口文件' : 'Entry file'}</span>
              <strong>{envelope?.artifactSummary.entryFile ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '构建命令' : 'Build command'}</span>
              <strong>{envelope?.artifactSummary.buildCommand ?? '-'}</strong>
            </div>
          </div>
        </section>

        <section className="operator-v4-drawer__section">
          <h3>{zh ? 'readiness' : 'Readiness'}</h3>
          <div className="operator-v4-metadata-grid">
            <div>
              <span>{zh ? 'SSH' : 'SSH'}</span>
              <strong>{envelope?.credentialReadiness.status ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '环境' : 'Environment'}</span>
              <strong>{envelope?.envChecklistSummary.status ?? '-'}</strong>
            </div>
            <div>
              <span>{zh ? '部署前置' : 'Deploy readiness'}</span>
              <strong>{drawer.deployReadiness}</strong>
            </div>
          </div>
        </section>

        <section className="operator-v4-drawer__section">
          <h3>{zh ? 'task 细节' : 'Task details'}</h3>
          <div className="operator-v4-drawer__timeline">
            {(activeTask?.timeline ?? []).map((item) => (
              <article className="operator-v4-drawer__card" key={item.id}>
                <div className="operator-v4-drawer__card-head">
                  <strong>{item.title}</strong>
                  <span>{item.stage}</span>
                </div>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="operator-v4-drawer__section">
          <h3>{zh ? '日志' : 'Logs'}</h3>
          <pre className="operator-v4-drawer__logs" data-testid="details-raw_logs">{drawer.logs || '-'}</pre>
        </section>
      </div>
    </section>
  );
}
