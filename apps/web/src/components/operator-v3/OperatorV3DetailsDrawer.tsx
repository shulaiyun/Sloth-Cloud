import type { OperatorV3DrawerState } from '../../lib/operator-v3-view-model';

interface OperatorV3DetailsDrawerProps {
  drawer: OperatorV3DrawerState;
  locale: string;
  open: boolean;
  onToggle: () => void;
}

export function OperatorV3DetailsDrawer({
  drawer,
  locale,
  open,
  onToggle,
}: OperatorV3DetailsDrawerProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <div className={`operator-v3-panel operator-v3-drawer ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="operator-v3-panel__head">
        <div>
          <span className="operator-v3-eyebrow">{zh ? '技术细节' : 'Technical details'}</span>
          <h2>{zh ? '详情抽屉' : 'Details drawer'}</h2>
        </div>
        <button
          aria-expanded={open}
          className="button ghost"
          data-testid="operator-v3-details-toggle"
          onClick={onToggle}
          type="button"
        >
          {open ? (zh ? '收起细节' : 'Hide details') : (zh ? '查看细节' : 'View details')}
        </button>
      </div>

      {open ? (
        <div className="operator-v3-drawer__body" data-testid="operator-v3-details-drawer">
          <section className="operator-v3-drawer__section">
            <div className="operator-v3-drawer__grid">
              <div data-testid="details-run_state">
                <span>run_state</span>
                <strong>{drawer.runState}</strong>
              </div>
              <div data-testid="details-task_id">
                <span>task_id</span>
                <strong>{drawer.taskId ?? '-'}</strong>
              </div>
              <div data-testid="details-failure_code">
                <span>failure_code</span>
                <strong>{drawer.failureCode ?? '-'}</strong>
              </div>
              <div>
                <span>{zh ? '部署前置条件' : 'Deploy readiness'}</span>
                <strong>{drawer.deployReadiness}</strong>
              </div>
            </div>
          </section>

          <section className="operator-v3-drawer__section">
            <h3>{zh ? '详细步骤' : 'Detailed steps'}</h3>
            <div className="operator-v3-drawer__timeline">
              {drawer.timeline.length === 0 ? (
                <p>{zh ? '当前没有详细步骤。' : 'No detailed steps yet.'}</p>
              ) : drawer.timeline.map((item) => (
                <article className="operator-v3-drawer__card" key={item.id}>
                  <div className="operator-v3-drawer__card-head">
                    <strong>{item.title}</strong>
                    <span>{item.stage}</span>
                  </div>
                  <p>{item.summary}</p>
                  <div className="operator-v3-drawer__meta">
                    <span>source: {item.source}</span>
                    <span>stable_id: {item.id}</span>
                  </div>
                  {item.evidence.length > 0 ? (
                    <div className="operator-v3-drawer__stack">
                      {item.evidence.map((entry) => (
                        <div className="operator-v3-drawer__evidence" key={entry.id}>
                          <strong>{entry.label}</strong>
                          <span>{entry.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.nextStep ? <p>{zh ? '下一步：' : 'Next:'} {item.nextStep}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="operator-v3-drawer__section">
            <h3>{zh ? '证据' : 'Evidence'}</h3>
            <div className="operator-v3-drawer__stack">
              {drawer.evidence.length === 0 ? (
                <p>{zh ? '当前没有证据条目。' : 'No evidence entries yet.'}</p>
              ) : drawer.evidence.map((entry) => (
                <div className="operator-v3-drawer__evidence" key={entry.id}>
                  <strong>{entry.label}</strong>
                  <span>{entry.detail}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="operator-v3-drawer__section">
            <h3>{zh ? '日志' : 'Logs'}</h3>
            <pre className="operator-v3-drawer__logs">{drawer.logs || '-'}</pre>
          </section>
        </div>
      ) : (
        <div className="operator-v3-drawer__peek">
          <span>{zh ? '默认隐藏技术字段，按需展开。' : 'Technical fields stay hidden by default.'}</span>
        </div>
      )}
    </div>
  );
}
