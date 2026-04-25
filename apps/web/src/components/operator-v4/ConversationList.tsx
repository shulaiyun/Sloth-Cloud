import React, {
  Fragment,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export interface OperatorV4ConversationEntry {
  id: string;
  kind?: 'user' | 'assistant' | 'task' | 'choice';
  role: 'user' | 'assistant' | 'task' | 'system';
  content: string;
  createdAt: string;
  status?: 'sending' | 'failed' | 'done';
  retryable?: boolean;
  origin?: 'workflow' | 'session' | 'optimistic' | 'run' | 'local';
  choiceCard?: {
    type: 'pending_confirmation' | 'proposal_list';
    title: string;
    description: string | null;
    proposal?: {
      id: string;
      title: string;
      description: string;
      risk: 'low' | 'high';
      requiresConfirmation: boolean;
      action: unknown;
    };
    proposals?: Array<{
      id: string;
      title: string;
      description: string;
      risk: 'low' | 'high';
      requiresConfirmation: boolean;
      action: unknown;
    }>;
  };
  taskUpdate?: {
    step: string;
    summary: string;
    nextAction: string | null;
    running: boolean;
    stuck: boolean;
    heartbeatAt: string | null;
    noPreviewReason?: string | null;
    preview?: {
      url: string;
      statusLabel: string;
      healthLabel: string;
      verified: boolean;
    } | null;
    repair?: {
      category: 'unsupported_stack' | 'missing_entry' | 'missing_port' | 'uncertain_recipe';
      reason: string;
      missing: string[];
      recommended: {
        summary: string;
        startCommand: string | null;
        port: number | null;
        healthcheckPath: string | null;
        dockerServiceName: string | null;
        dockerRunMode: string | null;
      };
    } | null;
  };
}

interface ConversationListProps {
  locale: string;
  entries: OperatorV4ConversationEntry[];
  emptyLabel: string;
  onRetry?: () => void;
  dock?: ReactNode;
  historySummary?: {
    id: string;
    collapsedCount: number;
    technicalCount: number;
    entries: OperatorV4ConversationEntry[];
  } | null;
  dockExpanded?: boolean;
  onConversationScroll?: (scrollTop: number) => void;
  onRepairUseRecommended?: (entry: OperatorV4ConversationEntry) => void;
  onRepairRedetect?: (entry: OperatorV4ConversationEntry) => void;
  onRepairSubmitManual?: (
    entry: OperatorV4ConversationEntry,
    payload: {
      startCommand: string;
      port: number | null;
      healthcheckPath: string;
      dockerServiceName: string;
    },
  ) => void;
  onProposalSelect?: (entry: OperatorV4ConversationEntry, proposalId: string) => void;
  onPendingConfirmationConfirm?: (entry: OperatorV4ConversationEntry) => void;
  onPendingConfirmationDismiss?: (entry: OperatorV4ConversationEntry) => void;
}

function renderTextWithLinks(value: string, prefix: string): ReactNode[] {
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  let match = pattern.exec(value);

  while (match) {
    if (match.index > cursor) {
      nodes.push(value.slice(cursor, match.index));
    }

    let href = match[0];
    let suffix = '';
    while (/[),.!?;:]+$/.test(href)) {
      suffix = href.slice(-1) + suffix;
      href = href.slice(0, -1);
    }

    nodes.push(
      <a className="assistant-message__link" href={href} key={`${prefix}-link-${index}`} rel="noreferrer" target="_blank">
        {href}
      </a>,
    );

    if (suffix) {
      nodes.push(suffix);
    }

    cursor = match.index + match[0].length;
    index += 1;
    match = pattern.exec(value);
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [value];
}

function renderInlineContent(text: string, keyPrefix: string) {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  const segments: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      segments.push(...renderTextWithLinks(text.slice(cursor, match.index), `${keyPrefix}-plain-${index}`));
    }

    const [raw, , boldText, codeText] = match;
    if (boldText) {
      segments.push(<strong key={`${keyPrefix}-strong-${index}`}>{boldText}</strong>);
    } else if (codeText) {
      segments.push(<code key={`${keyPrefix}-code-${index}`}>{codeText}</code>);
    } else {
      segments.push(raw);
    }

    cursor = match.index + raw.length;
    index += 1;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    segments.push(...renderTextWithLinks(text.slice(cursor), `${keyPrefix}-tail`));
  }

  return segments.length > 0 ? segments : [text];
}

function renderMessageContent(content: string) {
  const paragraphs = content
    .trim()
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className="assistant-message__content">
      {paragraphs.map((paragraph, index) => {
        if (paragraph.startsWith('```') && paragraph.endsWith('```')) {
          const code = paragraph.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
          return (
            <div className="assistant-message__code-block" key={`code-${index}`}>
              <pre className="assistant-message__pre"><code>{code}</code></pre>
            </div>
          );
        }

        const lines = paragraph.split('\n').map((entry) => entry.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((entry) => /^[-*•]\s+/.test(entry))) {
          return (
            <ul className="assistant-message__list" key={`ul-${index}`}>
              {lines.map((entry, lineIndex) => (
                <li key={`ul-${index}-${lineIndex}`}>
                  {renderInlineContent(entry.replace(/^[-*•]\s+/, ''), `ul-${index}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p className="assistant-message__paragraph" key={`p-${index}`}>
            {lines.map((line, lineIndex) => (
              <Fragment key={`p-${index}-${lineIndex}`}>
                {renderInlineContent(line, `p-${index}-${lineIndex}`)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function formatTime(value: string, locale: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US', {
    timeStyle: 'short',
    dateStyle: 'medium',
  }).format(parsed);
}

export function ConversationList({
  locale,
  entries,
  emptyLabel,
  onRetry,
  dock,
  historySummary,
  dockExpanded = false,
  onConversationScroll,
  onRepairUseRecommended,
  onRepairRedetect,
  onRepairSubmitManual,
  onProposalSelect,
  onPendingConfirmationConfirm,
  onPendingConfirmationDismiss,
}: ConversationListProps) {
  const zh = locale.toLowerCase().startsWith('zh');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [manualRepairByEntry, setManualRepairByEntry] = useState<Record<string, {
    open: boolean;
    startCommand: string;
    port: string;
    healthcheckPath: string;
    dockerServiceName: string;
  }>>({});

  useEffect(() => {
    setHistoryExpanded(false);
  }, [historySummary?.id]);

  useEffect(() => {
    setManualRepairByEntry({});
  }, [entries.map((entry) => entry.id).join('|')]);

  const toggleManualRepair = (entry: OperatorV4ConversationEntry) => {
    const repair = entry.taskUpdate?.repair;
    if (!repair) {
      return;
    }

    setManualRepairByEntry((current) => {
      const existing = current[entry.id];
      if (existing) {
        return {
          ...current,
          [entry.id]: {
            ...existing,
            open: !existing.open,
          },
        };
      }

      return {
        ...current,
        [entry.id]: {
          open: true,
          startCommand: repair.recommended.startCommand ?? '',
          port: repair.recommended.port == null ? '' : String(repair.recommended.port),
          healthcheckPath: repair.recommended.healthcheckPath ?? '/',
          dockerServiceName: repair.recommended.dockerServiceName ?? '',
        },
      };
    });
  };

  const renderTaskUpdate = (entry: OperatorV4ConversationEntry) => {
    const task = entry.taskUpdate;
    if (!task) {
      return renderMessageContent(entry.content);
    }

    return (
      <div className="operator-v4-task-update" data-testid="operator-v4-task-update">
        <div className="operator-v4-task-update__meta">
          <span className={`operator-v4-status-pill ${task.stuck ? 'is-failed' : ''}`}>
            {task.stuck
              ? (zh ? '任务可能卡住了' : 'Task may be stuck')
              : task.running
                ? (zh ? '执行中' : 'Running')
                : (zh ? '已更新' : 'Updated')}
          </span>
          <span>{task.heartbeatAt ? (zh ? `最近心跳：${formatTime(task.heartbeatAt, locale)}` : `Last heartbeat: ${formatTime(task.heartbeatAt, locale)}`) : '-'}</span>
        </div>
        <div className="operator-v4-callout">
          <strong>{task.step}</strong>
          <span>{task.summary}</span>
          <span>
            {zh ? '下一步：' : 'Next: '}
            {task.nextAction ?? (zh ? '继续等待更新' : 'Wait for next update')}
          </span>
        </div>
        {task.preview ? (
          <div className="operator-v4-task-update__preview">
            <div className="operator-v4-callout">
              <strong>{task.preview.statusLabel}</strong>
              <span>{task.preview.healthLabel}</span>
              <span>{task.preview.verified ? (zh ? '已验证' : 'Verified') : (zh ? '等待验证' : 'Verification pending')}</span>
            </div>
            <a className="button primary" href={task.preview.url} rel="noreferrer" target="_blank">
              {zh ? '打开预览' : 'Open preview'}
            </a>
            <div className="operator-v4-preview-card__frame">
              <iframe data-testid="operator-v4-preview-iframe" src={task.preview.url} title="operator-v4-preview" />
            </div>
          </div>
        ) : null}
        {!task.preview && task.noPreviewReason ? (
          <div className="operator-v4-callout operator-v4-provider-banner is-limited" data-testid="operator-v4-preview-reason">
            <strong>{zh ? '预览还没准备好' : 'Preview is not ready yet'}</strong>
            <span>{task.noPreviewReason}</span>
          </div>
        ) : null}
        {task.repair ? (
          <div className="operator-v4-repair-card" data-testid="operator-v4-repair-card">
            <div className="operator-v4-callout operator-v4-provider-banner is-limited">
              <strong>{zh ? '发生了什么' : 'What happened'}</strong>
              <span>{task.repair.reason}</span>
              {task.repair.missing.length > 0 ? (
                <span>
                  {zh ? `当前缺少：${task.repair.missing.join('、')}` : `Missing: ${task.repair.missing.join(', ')}`}
                </span>
              ) : null}
              <strong>{zh ? '推荐方案' : 'Recommended fix'}</strong>
              <span>{task.repair.recommended.summary}</span>
              {task.repair.recommended.startCommand ? (
                <span>{zh ? `推荐启动命令：${task.repair.recommended.startCommand}` : `Recommended start command: ${task.repair.recommended.startCommand}`}</span>
              ) : null}
              <span>{zh ? `推荐端口：${task.repair.recommended.port ?? '-'}` : `Recommended port: ${task.repair.recommended.port ?? '-'}`}</span>
              <span>{zh ? `推荐健康检查：${task.repair.recommended.healthcheckPath ?? '/'}` : `Recommended health path: ${task.repair.recommended.healthcheckPath ?? '/'}`}</span>
              {task.repair.recommended.dockerRunMode ? (
                <span>{zh ? `推荐 Docker 运行方式：${task.repair.recommended.dockerRunMode}` : `Recommended Docker run mode: ${task.repair.recommended.dockerRunMode}`}</span>
              ) : null}
              {task.repair.recommended.dockerServiceName ? (
                <span>{zh ? `推荐 Compose 主服务：${task.repair.recommended.dockerServiceName}` : `Recommended compose primary service: ${task.repair.recommended.dockerServiceName}`}</span>
              ) : null}
            </div>
            <div className="operator-v4-message__actions">
              <button
                className="button primary"
                data-testid={`operator-v4-repair-apply-${entry.id}`}
                onClick={() => onRepairUseRecommended?.(entry)}
                type="button"
              >
                {zh ? '使用推荐方案' : 'Use recommended fix'}
              </button>
              <button
                className="button ghost"
                data-testid={`operator-v4-repair-redetect-${entry.id}`}
                onClick={() => onRepairRedetect?.(entry)}
                type="button"
              >
                {zh ? '重新自动检测' : 'Re-run detection'}
              </button>
              <button
                className="button ghost"
                data-testid={`operator-v4-repair-manual-${entry.id}`}
                onClick={() => toggleManualRepair(entry)}
                type="button"
              >
                {zh ? '手动填写' : 'Fill manually'}
              </button>
            </div>
            {manualRepairByEntry[entry.id]?.open ? (
              <form
                className="operator-v4-repair-card__form"
                data-testid={`operator-v4-repair-form-${entry.id}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  const current = manualRepairByEntry[entry.id];
                  if (!current) {
                    return;
                  }
                  onRepairSubmitManual?.(entry, {
                    startCommand: current.startCommand.trim(),
                    port: current.port.trim() ? Number.parseInt(current.port.trim(), 10) : null,
                    healthcheckPath: current.healthcheckPath.trim(),
                    dockerServiceName: current.dockerServiceName.trim(),
                  });
                }}
              >
                <label className="operator-v4-field">
                  <span>{zh ? '启动命令' : 'Start command'}</span>
                  <input
                    className="operator-v4-input"
                    onChange={(event) => setManualRepairByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        ...(current[entry.id] ?? {
                          open: true,
                          startCommand: '',
                          port: '',
                          healthcheckPath: '/',
                          dockerServiceName: '',
                        }),
                        startCommand: event.target.value,
                      },
                    }))}
                    value={manualRepairByEntry[entry.id]?.startCommand ?? ''}
                  />
                </label>
                <label className="operator-v4-field">
                  <span>{zh ? '端口' : 'Port'}</span>
                  <input
                    className="operator-v4-input"
                    onChange={(event) => setManualRepairByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        ...(current[entry.id] ?? {
                          open: true,
                          startCommand: '',
                          port: '',
                          healthcheckPath: '/',
                          dockerServiceName: '',
                        }),
                        port: event.target.value,
                      },
                    }))}
                    value={manualRepairByEntry[entry.id]?.port ?? ''}
                  />
                </label>
                <label className="operator-v4-field">
                  <span>{zh ? '健康检查路径' : 'Health check path'}</span>
                  <input
                    className="operator-v4-input"
                    onChange={(event) => setManualRepairByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        ...(current[entry.id] ?? {
                          open: true,
                          startCommand: '',
                          port: '',
                          healthcheckPath: '/',
                          dockerServiceName: '',
                        }),
                        healthcheckPath: event.target.value,
                      },
                    }))}
                    value={manualRepairByEntry[entry.id]?.healthcheckPath ?? '/'}
                  />
                </label>
                <label className="operator-v4-field">
                  <span>{zh ? 'Docker 服务名（可选）' : 'Docker service name (optional)'}</span>
                  <input
                    className="operator-v4-input"
                    onChange={(event) => setManualRepairByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        ...(current[entry.id] ?? {
                          open: true,
                          startCommand: '',
                          port: '',
                          healthcheckPath: '/',
                          dockerServiceName: '',
                        }),
                        dockerServiceName: event.target.value,
                      },
                    }))}
                    value={manualRepairByEntry[entry.id]?.dockerServiceName ?? ''}
                  />
                </label>
                <div className="operator-v4-message__actions">
                  <button className="button primary" type="submit">
                    {zh ? '提交并继续执行' : 'Submit and continue'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderChoiceCard = (entry: OperatorV4ConversationEntry) => {
    const choice = entry.choiceCard;
    if (!choice) {
      return renderMessageContent(entry.content);
    }

    if (choice.type === 'pending_confirmation' && choice.proposal) {
      return (
        <div className="operator-v4-callout operator-v4-choice-card" data-testid="operator-v4-pending-confirmation">
          <strong>{choice.proposal.risk === 'high' ? (zh ? '该动作需要确认' : 'This action needs confirmation') : (zh ? '继续前请确认' : 'Please confirm to continue')}</strong>
          <span>{choice.title}</span>
          <span>{choice.description}</span>
          <div className="operator-v4-message__actions">
            <button className="button primary" onClick={() => onPendingConfirmationConfirm?.(entry)} type="button">
              {zh ? '确认继续' : 'Confirm and continue'}
            </button>
            <button className="button ghost" onClick={() => onPendingConfirmationDismiss?.(entry)} type="button">
              {zh ? '稍后再说' : 'Not now'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="operator-v4-callout operator-v4-choice-card" data-testid="operator-v4-proposal-list">
        <strong>{choice.title}</strong>
        {choice.description ? <span>{choice.description}</span> : null}
        <div className="operator-v4-choice-card__options">
          {(choice.proposals ?? []).slice(0, 4).map((proposal) => (
            <button
              className="operator-v4-choice-card__option"
              data-testid={`operator-v4-proposal-${proposal.id}`}
              key={proposal.id}
              onClick={() => onProposalSelect?.(entry, proposal.id)}
              type="button"
            >
              <strong>{proposal.title}</strong>
              <span>{proposal.description}</span>
              <em>
                {proposal.requiresConfirmation
                  ? (zh ? '确认后继续' : 'Confirm before continuing')
                  : proposal.risk === 'high'
                    ? (zh ? '高风险动作' : 'High-risk action')
                    : (zh ? '立即继续' : 'Continue now')}
              </em>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMessageCard = (entry: OperatorV4ConversationEntry, variant?: 'history') => (
    <article
      className={`operator-v4-message is-${entry.kind ?? (entry.role === 'system' ? 'assistant' : entry.role)} ${entry.status ? `is-${entry.status}` : ''} ${variant ? `is-${variant}` : ''}`}
      data-role={entry.role}
      data-testid={`operator-v4-message-${entry.id}`}
      key={entry.id}
    >
      <div className="operator-v4-message__head">
        <strong>
          {entry.role === 'user'
            ? (zh ? '你' : 'You')
            : entry.role === 'assistant' || entry.role === 'system'
              ? 'Sloth Cloud'
              : (zh ? '任务更新' : 'Task update')}
        </strong>
        <div className="operator-v4-message__meta">
          {entry.status === 'sending' ? <span>{zh ? '处理中' : 'Sending'}</span> : null}
          {entry.status === 'failed' ? <span>{zh ? '失败' : 'Failed'}</span> : null}
          <span>{formatTime(entry.createdAt, locale)}</span>
        </div>
      </div>
      <div className="operator-v4-message__body">
        {entry.kind === 'choice'
          ? renderChoiceCard(entry)
          : entry.role === 'task'
            ? renderTaskUpdate(entry)
            : renderMessageContent(entry.content)}
      </div>
      {entry.retryable && onRetry ? (
        <div className="operator-v4-message__actions">
          <button className="button secondary" onClick={onRetry} type="button">
            {zh ? '重试' : 'Retry'}
          </button>
        </div>
      ) : null}
    </article>
  );

  return (
    <section className="operator-v4-panel operator-v4-conversation">
      <div className="operator-v4-conversation__surface">
        <div
          className={`operator-v4-thread ${dock ? 'has-dock' : ''} ${dockExpanded ? 'is-dock-expanded' : 'is-dock-collapsed'}`}
          data-testid="operator-v4-conversation"
          onScroll={(event) => onConversationScroll?.(event.currentTarget.scrollTop)}
        >
          {historySummary && historySummary.collapsedCount > 0 ? (
            <article className="operator-v4-message is-history-summary" data-testid="operator-v4-history-summary">
              <div className="operator-v4-message__head">
                <strong>{zh ? '历史摘要' : 'History summary'}</strong>
                <div className="operator-v4-message__meta">
                  <span>
                    {zh
                      ? `已折叠 ${historySummary.collapsedCount} 条旧历史`
                      : `${historySummary.collapsedCount} legacy items collapsed`}
                  </span>
                </div>
              </div>
              <div className="operator-v4-message__body">
                <div className="operator-v4-callout">
                  <strong>
                    {zh
                      ? '默认只保留最近用户消息、最近助手回复和最近任务结果。'
                      : 'Only the latest user message, assistant reply, and task result stay visible by default.'}
                  </strong>
                  <span>
                    {historySummary.technicalCount > 0
                      ? (zh
                          ? `另有 ${historySummary.technicalCount} 条技术历史已移到详情抽屉。`
                          : `${historySummary.technicalCount} technical items were moved to the details drawer.`)
                      : (zh
                          ? '旧系统消息和调试消息不会再在主舞台刷屏。'
                          : 'Legacy system and debug messages no longer flood the main stage.')}
                  </span>
                </div>
                {historyExpanded && historySummary.entries.length > 0 ? (
                  <div className="operator-v4-history-summary__entries" data-testid="operator-v4-history-expanded">
                    {historySummary.entries.map((entry) => renderMessageCard(entry, 'history'))}
                  </div>
                ) : null}
              </div>
              <div className="operator-v4-message__actions">
                <button
                  className="button ghost"
                  data-testid="operator-v4-history-toggle"
                  onClick={() => setHistoryExpanded((current) => !current)}
                  type="button"
                >
                  {historyExpanded
                    ? (zh ? '收起历史' : 'Collapse history')
                    : (zh ? '展开历史' : 'Expand history')}
                </button>
              </div>
            </article>
          ) : null}

          {entries.length === 0 ? (
            <div className="operator-v4-empty operator-v4-empty--center" data-testid="operator-v4-empty">
              <strong>{emptyLabel}</strong>
            </div>
          ) : entries.map((entry) => renderMessageCard(entry))}
        </div>

        {dock ? (
          <div className="operator-v4-conversation__dock" data-testid="operator-v4-conversation-dock">
            {dock}
          </div>
        ) : null}
      </div>
    </section>
  );
}
