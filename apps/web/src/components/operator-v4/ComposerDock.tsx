import React, { type ChangeEvent, type RefObject } from 'react';

import type { OperatorV4NewProjectDraft } from './NewProjectDialog';

export interface OperatorV4ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string;
}

export interface OperatorV4ComposerModelOption {
  id: string;
  label: string;
  provider: string;
}

interface ComposerDockProps {
  locale: string;
  surface: 'lobby' | 'workspace';
  busy: boolean;
  expanded: boolean;
  mode: 'auto' | 'ask' | 'run';
  modelOptions: OperatorV4ComposerModelOption[];
  selectedModelId: string | null;
  activeModelLabel: string | null;
  composer: string;
  attachments: OperatorV4ComposerAttachment[];
  assistantError: string | null;
  attachmentError: string | null;
  canContinueCurrentTask: boolean;
  continueDisabledReason: string | null;
  sendDisabledReason: string | null;
  runModeHint: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  advancedOptionsOpen: boolean;
  projectDraft: OperatorV4NewProjectDraft;
  onExpand: () => void;
  onCollapse: () => void;
  onModeChange: (mode: 'auto' | 'ask' | 'run') => void;
  onModelChange: (modelId: string | null) => void;
  onComposerChange: (value: string) => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: (attachmentId: string) => void;
  onContinueCurrentTask: () => void;
  onNewConversation: () => void;
  onAdvancedOptionsToggle: () => void;
  onProjectDraftChange: (patch: Partial<OperatorV4NewProjectDraft>) => void;
  onSubmit: () => void;
}

function attachmentSizeLabel(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '-';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  return `${Math.round(sizeBytes / 1024)} KB`;
}

export function ComposerDock({
  locale,
  surface,
  busy,
  expanded,
  mode,
  modelOptions,
  selectedModelId,
  activeModelLabel,
  composer,
  attachments,
  assistantError,
  attachmentError,
  canContinueCurrentTask,
  continueDisabledReason,
  sendDisabledReason,
  runModeHint,
  fileInputRef,
  advancedOptionsOpen,
  projectDraft,
  onExpand,
  onCollapse,
  onModeChange,
  onModelChange,
  onComposerChange,
  onAttachmentChange,
  onAttachmentRemove,
  onContinueCurrentTask,
  onNewConversation,
  onAdvancedOptionsToggle,
  onProjectDraftChange,
  onSubmit,
}: ComposerDockProps) {
  const zh = locale.toLowerCase().startsWith('zh');
  const sendDisabled = busy || Boolean(sendDisabledReason);
  const continueDisabled = busy || !canContinueCurrentTask || surface === 'lobby';
  const hint = assistantError ?? attachmentError ?? runModeHint ?? sendDisabledReason ?? continueDisabledReason;
  const modeHint = mode === 'auto'
    ? (zh ? '自动判断聊天或执行' : 'Auto decides between chat and execution')
    : mode === 'ask'
      ? (zh ? '只聊天、解释、规划' : 'Chat, explain, and plan only')
      : (zh ? '明确发起真实执行' : 'Explicitly start execution');
  const activeModel = modelOptions.find((entry) => entry.id === selectedModelId) ?? null;
  const modelHint = activeModel
    ? (zh ? `当前固定模型：${activeModel.label}` : `Pinned model: ${activeModel.label}`)
    : (zh
        ? `自动选择真实模型${activeModelLabel ? `，当前默认 ${activeModelLabel}` : ''}`
        : `Auto-select a live model${activeModelLabel ? `, currently defaulting to ${activeModelLabel}` : ''}`);

  return (
    <section
      className={`operator-v4-panel operator-v4-composer ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      data-testid={`operator-v4-composer-${expanded ? 'expanded' : 'collapsed'}`}
    >
      <div className="operator-v4-composer__compact">
        <label className="operator-v4-composer__mode operator-v4-composer__mode-inline" data-testid="operator-v4-inline-mode">
          <select
            aria-label={zh ? '发送模式' : 'Send mode'}
            data-testid="operator-v4-mode-select"
            onChange={(event) => onModeChange(event.target.value as 'auto' | 'ask' | 'run')}
            value={mode}
          >
            <option value="auto">Auto</option>
            <option value="ask">Ask</option>
            <option value="run">Run</option>
          </select>
        </label>
        <input
          className="operator-v4-input operator-v4-composer__singleline"
          data-testid="operator-v4-composer-input"
          disabled={busy}
          onChange={(event) => onComposerChange(event.target.value)}
          onFocus={onExpand}
          placeholder={surface === 'lobby'
            ? (zh ? '例如：帮我部署一个 GitHub 仓库，或帮我做一个预约网站' : 'For example: deploy a GitHub repo, or build a booking website')
            : mode === 'auto'
              ? (zh ? '描述目标，我会先聊天再判断是否执行' : 'Describe your goal and I will chat first, then decide whether to run.')
              : mode === 'ask'
                ? (zh ? 'Ask：聊天、解释、规划' : 'Ask: chat, explain, and plan')
                : (zh ? 'Run：直接执行部署/修复/预览' : 'Run: execute deploy/fix/preview directly')}
          value={composer}
        />
        <button
          className="button ghost"
          data-testid="operator-v4-continue-task"
          disabled={continueDisabled}
          onClick={onContinueCurrentTask}
          title={continueDisabled ? (continueDisabledReason ?? undefined) : undefined}
          type="button"
        >
          {zh ? '继续' : 'Continue'}
        </button>
        <button
          className="button primary"
          disabled={sendDisabled}
          onClick={onSubmit}
          title={sendDisabledReason ?? undefined}
          type="button"
        >
          {busy ? (zh ? '处理中...' : 'Working...') : (zh ? '发送' : 'Send')}
        </button>
      </div>

      {!expanded ? (
        <p className="operator-v4-composer__hint">
          {surface === 'lobby'
            ? (zh ? '从一句话开始，我会先和你对话，再决定是否进入真实执行。' : 'Start with one prompt. I will chat first, then decide whether to enter real execution.')
            : modeHint}
        </p>
      ) : null}

      {expanded ? (
        <>
          <div className="operator-v4-composer__toolbar">
            <div className="operator-v4-composer__selectors">
              {modelOptions.length > 0 ? (
                <label className="operator-v4-composer__mode" data-testid="operator-v4-inline-model">
                  <span>{zh ? '模型' : 'Model'}</span>
                  <select
                    aria-label={zh ? '模型选择' : 'Model selection'}
                    data-testid="operator-v4-model-select"
                    disabled={busy}
                    onChange={(event) => onModelChange(event.target.value === 'auto' ? null : event.target.value)}
                    value={selectedModelId ?? 'auto'}
                  >
                    <option value="auto">{zh ? 'Auto（智能路由）' : 'Auto (smart routing)'}</option>
                    {modelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>{modelHint}</small>
                </label>
              ) : null}
            </div>

            <div className="operator-v4-composer__toolbar-actions">
              <button className="button ghost" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">
                {zh ? '上传文件' : 'Upload files'}
              </button>
              <input hidden multiple onChange={onAttachmentChange} ref={fileInputRef} type="file" />
              {surface === 'lobby' ? (
                <button
                  className="button ghost"
                  data-testid="operator-v4-advanced-toggle"
                  disabled={busy}
                  onClick={onAdvancedOptionsToggle}
                  type="button"
                >
                  {advancedOptionsOpen
                    ? (zh ? '收起高级选项' : 'Hide advanced options')
                    : (zh ? '高级选项' : 'Advanced options')}
                </button>
              ) : null}
              <button
                className="button ghost"
                disabled={continueDisabled}
                onClick={onContinueCurrentTask}
                title={continueDisabled ? (continueDisabledReason ?? undefined) : undefined}
                type="button"
              >
                {zh ? '继续当前任务' : 'Continue current task'}
              </button>
              <button className="button ghost" disabled={busy} onClick={onNewConversation} type="button">
                {surface === 'lobby'
                  ? (zh ? '新建项目对话' : 'New project chat')
                  : (zh ? '新建会话' : 'New conversation')}
              </button>
              <button className="button ghost" disabled={busy} onClick={onCollapse} type="button">
                {zh ? '收起输入区' : 'Collapse composer'}
              </button>
            </div>
          </div>

          {surface === 'lobby' && advancedOptionsOpen ? (
            <div className="operator-v4-composer__advanced" data-testid="operator-v4-advanced-options">
              <label className="operator-v4-field">
                <span>{zh ? '项目名（可选）' : 'Project name (optional)'}</span>
                <input
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ name: event.target.value })}
                  value={projectDraft.name}
                />
              </label>
              <label className="operator-v4-field">
                <span>Repo URL</span>
                <input
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ repoUrl: event.target.value })}
                  placeholder="https://github.com/org/repo"
                  value={projectDraft.repoUrl}
                />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '服务器地址' : 'Server host'}</span>
                <input
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ host: event.target.value })}
                  placeholder={zh ? '例如 1.2.3.4' : 'For example 1.2.3.4'}
                  value={projectDraft.host}
                />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '用户名' : 'Username'}</span>
                <input
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ username: event.target.value })}
                  value={projectDraft.username}
                />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '端口' : 'Port'}</span>
                <input
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ port: event.target.value })}
                  value={projectDraft.port}
                />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '认证方式' : 'Auth mode'}</span>
                <select
                  className="operator-v4-input"
                  onChange={(event) => onProjectDraftChange({ authMode: event.target.value as OperatorV4NewProjectDraft['authMode'] })}
                  value={projectDraft.authMode}
                >
                  <option value="agent">{zh ? 'Agent' : 'Agent'}</option>
                  <option value="password">{zh ? '密码' : 'Password'}</option>
                  <option value="ssh-key">SSH Key</option>
                </select>
              </label>
              {projectDraft.authMode === 'password' ? (
                <label className="operator-v4-field">
                  <span>{zh ? '密码' : 'Password'}</span>
                  <textarea
                    className="operator-v4-input"
                    onChange={(event) => onProjectDraftChange({ password: event.target.value })}
                    rows={3}
                    value={projectDraft.password}
                  />
                </label>
              ) : null}
              {projectDraft.authMode === 'ssh-key' ? (
                <label className="operator-v4-field">
                  <span>SSH Key</span>
                  <textarea
                    className="operator-v4-input"
                    onChange={(event) => onProjectDraftChange({ sshKey: event.target.value })}
                    rows={4}
                    value={projectDraft.sshKey}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="operator-v4-composer__attachments">
              {attachments.map((attachment) => (
                <div className="operator-v4-attachment" key={attachment.id}>
                  <div>
                    <strong>{attachment.name}</strong>
                    <span>{attachmentSizeLabel(attachment.sizeBytes)}</span>
                  </div>
                  <button className="button ghost" onClick={() => onAttachmentRemove(attachment.id)} type="button">
                    {zh ? '移除' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="operator-v4-composer__actions">
            <div className="operator-v4-composer__left">
              <span className="operator-v4-composer__footer-note">
                {mode === 'run'
                  ? (zh ? 'Run 会把结果持续写回同一条会话流。' : 'Run keeps streaming progress into this same conversation.')
                  : mode === 'ask'
                    ? (zh ? 'Ask 只聊天，不会默认启动执行。' : 'Ask stays conversational and will not start a run by default.')
                    : (zh ? 'Auto 会先按自然聊天理解意图，再决定是否进入真实执行。' : 'Auto keeps the interaction conversational first, then decides whether to enter real execution.')}
              </span>
            </div>
          </div>
        </>
      ) : null}

      {hint ? (
        <p className="operator-v4-composer__error">{hint}</p>
      ) : null}
    </section>
  );
}
