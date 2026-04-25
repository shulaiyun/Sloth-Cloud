import React from 'react';

import type { OperatorV4ProjectFilter, OperatorV4ProjectRailItem } from '../../lib/operator-v4-view-model';
import { ProjectActionsMenu } from './ProjectActionsMenu';

interface ProjectRailProps {
  locale: string;
  items: OperatorV4ProjectRailItem[];
  filter: OperatorV4ProjectFilter;
  search: string;
  collapsed: boolean;
  lobby?: boolean;
  busy?: boolean;
  cleanupCount?: number;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: OperatorV4ProjectFilter) => void;
  onToggleCollapse: () => void;
  onOpenNewProject: () => void;
  onCleanupDisposableWorkspaces: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onToggleArchiveWorkspace: (workspaceId: string, archived: boolean) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

const filters: OperatorV4ProjectFilter[] = ['all', 'active', 'failed', 'archived'];

export function ProjectRail({
  locale,
  items,
  filter,
  search,
  collapsed,
  lobby = false,
  busy,
  cleanupCount = 0,
  onSearchChange,
  onFilterChange,
  onToggleCollapse,
  onOpenNewProject,
  onCleanupDisposableWorkspaces,
  onSelectWorkspace,
  onRenameWorkspace,
  onToggleArchiveWorkspace,
  onDeleteWorkspace,
}: ProjectRailProps) {
  const zh = locale.toLowerCase().startsWith('zh');
  const visibleItems = collapsed ? items.slice(0, 5) : items;
  const filterLabel = (value: OperatorV4ProjectFilter) => {
    switch (value) {
      case 'active':
        return zh ? '活跃' : 'Active';
      case 'failed':
        return zh ? '失败' : 'Failed';
      case 'archived':
        return zh ? '归档' : 'Archived';
      default:
        return zh ? '全部' : 'All';
    }
  };

  return (
    <section className={`operator-v4-panel operator-v4-rail ${collapsed ? 'is-collapsed' : ''}`} data-testid="operator-v4-project-rail-panel">
      <div className="operator-v4-panel__head operator-v4-rail__header">
        <div>
          <span className="operator-v4-eyebrow">{zh ? '项目栏' : 'Project rail'}</span>
          <h1>{collapsed ? (zh ? '最近项目' : 'Recent projects') : (zh ? '最近项目' : 'Recent projects')}</h1>
        </div>
        <div className="operator-v4-rail__head-actions">
          <button
            className="button ghost"
            data-testid="operator-v4-rail-toggle"
            disabled={busy}
            onClick={onToggleCollapse}
            type="button"
          >
            {collapsed
              ? (zh ? '展开' : 'Expand')
              : (zh ? '收起' : 'Collapse')}
          </button>
          {!collapsed && cleanupCount > 0 ? (
            <button className="button ghost" disabled={busy} onClick={onCleanupDisposableWorkspaces} type="button">
              {zh ? `清理测试项 (${cleanupCount})` : `Clean test items (${cleanupCount})`}
            </button>
          ) : null}
          <button className="button primary" onClick={onOpenNewProject} type="button">
            {lobby
              ? (zh ? '新对话' : 'New chat')
              : (zh ? '新建项目' : 'New project')}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="operator-v4-rail__controls">
          <input
            className="operator-v4-input"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={zh ? '搜索项目' : 'Search projects'}
            type="search"
            value={search}
          />
          <div className="operator-v4-segmented" role="tablist">
            {filters.map((entry) => (
              <button
                className={filter === entry ? 'is-active' : ''}
                key={entry}
                onClick={() => onFilterChange(entry)}
                type="button"
              >
                {filterLabel(entry)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="operator-v4-rail__list" data-testid="operator-v4-project-rail">
        {visibleItems.length === 0 ? (
          <div className="operator-v4-empty">
            <strong>{zh ? '还没有可显示的项目' : 'No projects to show yet'}</strong>
            <span>{zh ? '从新建项目开始，或者恢复最近的工作区。' : 'Create a new project, or restore your recent workspace.'}</span>
          </div>
        ) : visibleItems.map((item) => (
          <article
            className={`operator-v4-project-card ${item.selected ? 'is-active' : ''}`}
            data-testid={`operator-v4-project-${item.id}`}
            key={item.id}
          >
            <button
              className="operator-v4-project-card__select"
              disabled={busy}
              onClick={() => onSelectWorkspace(item.id)}
              type="button"
            >
              <div className="operator-v4-project-card__top">
                <strong>{item.title}</strong>
                <span className={`operator-v4-status-pill ${item.failed ? 'is-failed' : ''}`}>{item.statusLabel}</span>
              </div>
              <span>{item.typeLabel}</span>
              <span>{item.updatedLabel}</span>
            </button>
            <ProjectActionsMenu
              archived={item.archived}
              disabled={busy}
              locale={locale}
              onArchiveToggle={() => onToggleArchiveWorkspace(item.id, item.archived)}
              onDelete={() => onDeleteWorkspace(item.id)}
              onRename={() => onRenameWorkspace(item.id)}
              variant={item.itemKind === 'chat' ? 'chat' : 'workspace'}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
