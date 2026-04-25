import { Fragment, type ReactNode } from 'react';

export interface OperatorV3ConversationEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status?: 'sending' | 'failed' | 'done';
  retryable?: boolean;
}

interface OperatorV3ConversationProps {
  entries: OperatorV3ConversationEntry[];
  locale: string;
  title: string;
  subtitle: string;
  emptyLabel: string;
  onRetry?: () => void;
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
      <a
        className="assistant-message__link"
        href={href}
        key={`${prefix}-link-${index}`}
        rel="noreferrer"
        target="_blank"
      >
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

export function OperatorV3Conversation({
  entries,
  locale,
  title,
  subtitle,
  emptyLabel,
  onRetry,
}: OperatorV3ConversationProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <section className="operator-v3-panel operator-v3-conversation">
      <div className="operator-v3-panel__head">
        <div>
          <span className="operator-v3-eyebrow">{zh ? '当前会话' : 'Current conversation'}</span>
          <h2>{title}</h2>
          <p className="operator-v3-panel__subtle">{subtitle}</p>
        </div>
      </div>

      <div className="operator-v3-thread" data-testid="operator-v3-conversation">
        {entries.length === 0 ? (
          <div className="operator-v3-empty operator-v3-empty--center" data-testid="operator-v3-empty">
            <strong>{emptyLabel}</strong>
          </div>
        ) : entries.map((entry) => (
          <article
            className={`operator-v3-message is-${entry.role} ${entry.status ? `is-${entry.status}` : ''}`}
            data-testid={`operator-v3-message-${entry.id}`}
            key={entry.id}
          >
            <div className="operator-v3-message__head">
              <strong>
                {entry.role === 'user'
                  ? (zh ? '你' : 'You')
                  : entry.role === 'assistant'
                    ? 'Sloth Cloud'
                    : (zh ? '系统' : 'System')}
              </strong>
              <div className="operator-v3-message__meta">
                {entry.status === 'sending' ? <span>{zh ? '处理中' : 'Sending'}</span> : null}
                {entry.status === 'failed' ? <span>{zh ? '发送失败' : 'Failed'}</span> : null}
                <span>{formatTime(entry.createdAt, locale)}</span>
              </div>
            </div>
            <div className="operator-v3-message__body">
              {renderMessageContent(entry.content)}
            </div>
            {entry.retryable && onRetry ? (
              <div className="operator-v3-message__actions">
                <button className="button secondary" onClick={onRetry} type="button">
                  {zh ? '重试' : 'Retry'}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
