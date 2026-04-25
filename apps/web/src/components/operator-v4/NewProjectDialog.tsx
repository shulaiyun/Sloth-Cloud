export interface OperatorV4NewProjectDraft {
  kind: 'idea' | 'repo' | 'deploy';
  name: string;
  brief: string;
  repoUrl: string;
  host: string;
  username: string;
  port: string;
  authMode: 'agent' | 'password' | 'ssh-key';
  password: string;
  sshKey: string;
}

interface NewProjectDialogProps {
  locale: string;
  open: boolean;
  busy: boolean;
  runDisabledReason: string | null;
  draft: OperatorV4NewProjectDraft;
  onChange: (patch: Partial<OperatorV4NewProjectDraft>) => void;
  onClose: () => void;
  onAsk: () => void;
  onRun: () => void;
}

export function NewProjectDialog({
  locale,
  open,
  busy,
  runDisabledReason,
  draft,
  onChange,
  onClose,
  onAsk,
  onRun,
}: NewProjectDialogProps) {
  const zh = locale.toLowerCase().startsWith('zh');
  if (!open) {
    return null;
  }

  return (
    <div className="operator-v4-modal-backdrop" role="presentation">
      <section className="operator-v4-modal" role="dialog" aria-modal="true">
        <div className="operator-v4-panel__head">
          <div>
            <span className="operator-v4-eyebrow">{zh ? '新建项目' : 'New project'}</span>
            <h2>{zh ? '选择启动方式' : 'Choose a starter'}</h2>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            {zh ? '关闭' : 'Close'}
          </button>
        </div>

        <div className="operator-v4-segmented">
          <button className={draft.kind === 'idea' ? 'is-active' : ''} onClick={() => onChange({ kind: 'idea' })} type="button">
            {zh ? '想法' : 'Idea'}
          </button>
          <button className={draft.kind === 'repo' ? 'is-active' : ''} onClick={() => onChange({ kind: 'repo' })} type="button">
            {zh ? '仓库' : 'Repository'}
          </button>
          <button className={draft.kind === 'deploy' ? 'is-active' : ''} onClick={() => onChange({ kind: 'deploy' })} type="button">
            {zh ? '部署' : 'Deployment'}
          </button>
        </div>

        <div className="operator-v4-modal__fields">
          <label className="operator-v4-field">
            <span>{zh ? '项目名' : 'Project name'}</span>
            <input className="operator-v4-input" onChange={(event) => onChange({ name: event.target.value })} value={draft.name} />
          </label>

          {draft.kind === 'repo' ? (
            <label className="operator-v4-field">
              <span>Repo URL</span>
              <input className="operator-v4-input" onChange={(event) => onChange({ repoUrl: event.target.value })} value={draft.repoUrl} />
            </label>
          ) : null}

          {draft.kind === 'deploy' ? (
            <>
              <label className="operator-v4-field">
                <span>{zh ? '主机' : 'Host'}</span>
                <input className="operator-v4-input" onChange={(event) => onChange({ host: event.target.value })} value={draft.host} />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '用户名' : 'Username'}</span>
                <input className="operator-v4-input" onChange={(event) => onChange({ username: event.target.value })} value={draft.username} />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '端口' : 'Port'}</span>
                <input className="operator-v4-input" onChange={(event) => onChange({ port: event.target.value })} value={draft.port} />
              </label>
              <label className="operator-v4-field">
                <span>{zh ? '认证方式' : 'Auth mode'}</span>
                <select className="operator-v4-input" onChange={(event) => onChange({ authMode: event.target.value as OperatorV4NewProjectDraft['authMode'] })} value={draft.authMode}>
                  <option value="agent">{zh ? 'Agent' : 'Agent'}</option>
                  <option value="password">{zh ? '密码' : 'Password'}</option>
                  <option value="ssh-key">SSH Key</option>
                </select>
              </label>
              {draft.authMode === 'password' ? (
                <label className="operator-v4-field">
                  <span>{zh ? '密码' : 'Password'}</span>
                  <textarea className="operator-v4-input" onChange={(event) => onChange({ password: event.target.value })} rows={3} value={draft.password} />
                </label>
              ) : null}
              {draft.authMode === 'ssh-key' ? (
                <label className="operator-v4-field">
                  <span>SSH Key</span>
                  <textarea className="operator-v4-input" onChange={(event) => onChange({ sshKey: event.target.value })} rows={4} value={draft.sshKey} />
                </label>
              ) : null}
            </>
          ) : null}

          <label className="operator-v4-field">
            <span>{draft.kind === 'deploy' ? (zh ? '部署说明' : 'Deployment brief') : (zh ? '项目说明' : 'Project brief')}</span>
            <textarea className="operator-v4-input" onChange={(event) => onChange({ brief: event.target.value })} rows={5} value={draft.brief} />
          </label>
        </div>

        <div className="operator-v4-modal__actions">
          <button className="button ghost" disabled={busy} onClick={onAsk} type="button">
            {busy ? (zh ? '处理中...' : 'Working...') : 'Ask'}
          </button>
          <button
            className="button primary"
            disabled={busy || Boolean(runDisabledReason)}
            onClick={onRun}
            title={runDisabledReason ?? undefined}
            type="button"
          >
            {busy ? (zh ? '处理中...' : 'Working...') : 'Run'}
          </button>
        </div>

        {runDisabledReason ? (
          <p className="operator-v4-composer__error">{runDisabledReason}</p>
        ) : null}
      </section>
    </div>
  );
}
