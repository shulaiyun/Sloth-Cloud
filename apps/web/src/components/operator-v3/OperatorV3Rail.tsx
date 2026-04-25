import type { OperatorV3RailItem } from '../../lib/operator-v3-view-model';

interface OperatorV3RailProps {
  items: OperatorV3RailItem[];
  locale: string;
  onSelectWorkspace: (workspaceId: string) => void;
}

export function OperatorV3Rail({ items, locale, onSelectWorkspace }: OperatorV3RailProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <div className="operator-v3-panel operator-v3-panel--rail">
      <div className="operator-v3-panel__head">
        <div>
          <span className="operator-v3-eyebrow">{zh ? '工作区' : 'Workspaces'}</span>
          <h1>{zh ? '当前项目' : 'Current projects'}</h1>
        </div>
      </div>

      <div className="operator-v3-rail-list">
        {items.length === 0 ? (
          <div className="operator-v3-empty">
            <strong>{zh ? '还没有工作区' : 'No workspace yet'}</strong>
          </div>
        ) : items.map((item) => (
          <button
            className={`operator-v3-rail-item ${item.selected ? 'is-active' : ''}`}
            key={item.id}
            onClick={() => onSelectWorkspace(item.id)}
            type="button"
          >
            <div className="operator-v3-rail-item__top">
              <strong>{item.title}</strong>
              <span className="operator-v3-status-pill">{item.statusLabel}</span>
            </div>
            <span>{item.typeLabel}</span>
            <span>{item.updatedLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
