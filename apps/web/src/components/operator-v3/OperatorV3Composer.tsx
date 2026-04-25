import type { ChangeEvent, RefObject } from 'react';

export interface OperatorV3ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string;
}

interface OperatorV3ComposerProps {
  locale: string;
  busy: boolean;
  composer: string;
  attachments: OperatorV3ComposerAttachment[];
  planningMode: 'on' | 'off';
  taskMode: 'continue' | 'new_turn';
  canContinueCurrentTask: boolean;
  assistantError: string | null;
  attachmentError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: (attachmentId: string) => void;
  onPlanningModeChange: (checked: boolean) => void;
  onTaskModeChange: (mode: 'continue' | 'new_turn') => void;
  onContinueCurrentTask: () => void;
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

export function OperatorV3Composer({
  locale,
  busy,
  composer,
  attachments,
  planningMode,
  taskMode,
  canContinueCurrentTask,
  assistantError,
  attachmentError,
  fileInputRef,
  onComposerChange,
  onSubmit,
  onAttachmentChange,
  onAttachmentRemove,
  onPlanningModeChange,
  onTaskModeChange,
  onContinueCurrentTask,
}: OperatorV3ComposerProps) {
  const zh = locale.toLowerCase().startsWith('zh');

  return (
    <section className="operator-v3-panel operator-v3-composer">
      <div className="operator-v3-composer__controls">
        <label className="operator-v3-toggle">
          <input
            checked={planningMode === 'on'}
            onChange={(event) => onPlanningModeChange(event.target.checked)}
            type="checkbox"
          />
          <span>{zh ? '规划模式' : 'Planning mode'}</span>
        </label>

        <div className="operator-v3-segmented">
          <button
            className={taskMode === 'continue' ? 'is-active' : ''}
            onClick={() => onTaskModeChange('continue')}
            type="button"
          >
            {zh ? '继续当前任务' : 'Continue'}
          </button>
          <button
            className={taskMode === 'new_turn' ? 'is-active' : ''}
            onClick={() => onTaskModeChange('new_turn')}
            type="button"
          >
            {zh ? '新建回合' : 'New turn'}
          </button>
        </div>
      </div>

      {attachments.length > 0 ? (
        <div className="operator-v3-composer__attachments">
          {attachments.map((attachment) => (
            <div className="operator-v3-attachment" key={attachment.id}>
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

      <div className="operator-v3-composer__input">
        <textarea
          data-testid="operator-v3-composer-input"
          disabled={busy}
          onChange={(event) => onComposerChange(event.target.value)}
          placeholder={zh ? '描述你现在想做什么，或直接说“继续部署出来可以玩的”。' : 'Describe what you want to do, or say “continue to playable deployment”.'}
          rows={5}
          value={composer}
        />
      </div>

      <div className="operator-v3-composer__actions">
        <div className="operator-v3-composer__left">
          <button className="button ghost" onClick={() => fileInputRef.current?.click()} type="button">
            {zh ? '上传文件' : 'Upload files'}
          </button>
          <input
            hidden
            multiple
            onChange={onAttachmentChange}
            ref={fileInputRef}
            type="file"
          />
          {canContinueCurrentTask ? (
            <button className="button ghost" onClick={onContinueCurrentTask} type="button">
              {zh ? '继续当前任务' : 'Continue current task'}
            </button>
          ) : null}
        </div>

        <button
          className="button primary"
          disabled={busy}
          onClick={onSubmit}
          type="button"
        >
          {busy ? (zh ? '处理中...' : 'Working...') : (zh ? '发送' : 'Send')}
        </button>
      </div>

      {assistantError || attachmentError ? (
        <p className="operator-v3-composer__error">{assistantError ?? attachmentError}</p>
      ) : null}
    </section>
  );
}
