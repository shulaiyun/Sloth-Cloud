import React, { useState } from 'react';

interface ProjectActionsMenuProps {
  locale: string;
  archived: boolean;
  disabled?: boolean;
  variant?: 'workspace' | 'chat';
  onRename: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ProjectActionsMenu({
  locale,
  archived,
  disabled,
  variant = 'workspace',
  onRename,
  onArchiveToggle,
  onDelete,
}: ProjectActionsMenuProps) {
  const zh = locale.toLowerCase().startsWith('zh');
  const isChat = variant === 'chat';
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function closeMenu() {
    setOpen(false);
    setConfirmDelete(false);
  }

  return (
    <div className={`operator-v4-project-actions ${open ? 'is-open' : ''}`}>
        <button
          aria-expanded={open}
          aria-label={isChat ? (zh ? '对话操作' : 'Chat actions') : (zh ? '项目操作' : 'Project actions')}
        className="button ghost operator-v4-project-actions__trigger"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
          setConfirmDelete(false);
        }}
        type="button"
      >
        •••
      </button>

      {open ? (
        <div className="operator-v4-project-actions__menu" role="menu">
          {confirmDelete ? (
            <>
              <p className="operator-v4-project-actions__confirm">
                {isChat
                  ? (zh ? '确认删除这个对话？' : 'Delete this chat?')
                  : (zh ? '确认删除这个项目？' : 'Delete this project?')}
              </p>
              <button
                className="button danger"
                disabled={disabled}
                onClick={() => {
                  closeMenu();
                  onDelete();
                }}
                type="button"
              >
                {zh ? '确认删除' : 'Confirm delete'}
              </button>
              <button className="button ghost" onClick={() => setConfirmDelete(false)} type="button">
                {zh ? '取消' : 'Cancel'}
              </button>
            </>
          ) : (
            <>
              {!isChat ? (
                <>
                  <button
                    className="button ghost"
                    disabled={disabled}
                    onClick={() => {
                      closeMenu();
                      onRename();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {zh ? '重命名' : 'Rename'}
                  </button>
                  <button
                    className="button ghost"
                    disabled={disabled}
                    onClick={() => {
                      closeMenu();
                      onArchiveToggle();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {archived ? (zh ? '恢复' : 'Restore') : (zh ? '归档' : 'Archive')}
                  </button>
                </>
              ) : null}
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => setConfirmDelete(true)}
                role="menuitem"
                type="button"
              >
                {zh ? '删除' : 'Delete'}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
