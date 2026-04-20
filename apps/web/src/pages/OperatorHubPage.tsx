import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { toFriendlyError } from '../lib/friendly-error';
import {
  type OperatorActionIntent,
  type OperatorCapsule,
  type OperatorCapsuleListResponse,
  type OperatorCommerceOfferKind,
  type OperatorGenerationTask,
  type OperatorGenerationTaskResponse,
  type OperatorResponse,
} from '../lib/operator-types';
import { normalizeOperatorApiUrl } from '../lib/operator-url';
import { useSite } from '../lib/site-context';

const actionPathMap: Record<Exclude<OperatorActionIntent, 'open_capsule'>, string> = {
  deploy_preview: '/api/v1/operator/deployments/preview',
  publish_release: '/api/v1/operator/deployments/publish',
  diagnose_service: '/api/v1/operator/services/diagnose',
  repair_service: '/api/v1/operator/services/repair',
  rollback_release: '/api/v1/operator/services/rollback',
  takeover_server: '/api/v1/operator/servers/takeover',
  migrate_server: '/api/v1/operator/servers/migrate',
};

type LaunchMode = 'repo' | 'idea' | 'server';

function formatTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function capsuleStatusLabel(status: string, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    planning: zh ? '计划中' : 'Planning',
    preview_live: zh ? '预览可用' : 'Preview live',
    production_live: zh ? '正式版在线' : 'Production live',
    needs_attention: zh ? '需要处理' : 'Needs attention',
    takeover_ready: zh ? '可接管' : 'Takeover ready',
    migration_ready: zh ? '可迁移' : 'Migration ready',
  };
  return labels[status] ?? status;
}

function truthStateLabel(state: string | null | undefined, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    planning: zh ? '等待执行' : 'Planning',
    job_running: zh ? '正在执行' : 'Job running',
    preview_ready: zh ? '预览已验证' : 'Preview verified',
    preview_failed: zh ? '预览失败' : 'Preview failed',
    audit_ready: zh ? '体检完成' : 'Audit ready',
    audit_failed: zh ? '体检失败' : 'Audit failed',
    needs_attention: zh ? '需要关注' : 'Needs attention',
    production_live: zh ? '正式版在线' : 'Production live',
  };
  return labels[state ?? 'planning'] ?? state ?? '-';
}

function statusClassName(status: string | null | undefined) {
  if (status === 'preview_live' || status === 'production_live' || status === 'preview_ready' || status === 'audit_ready') {
    return 'status-active';
  }
  if (status === 'needs_attention' || status === 'preview_failed' || status === 'audit_failed') {
    return 'status-overdue';
  }
  if (status === 'job_running' || status === 'running') {
    return 'status-running';
  }
  return 'status-pending';
}

function entryKindLabel(entryKind: OperatorCapsule['entryKind'], locale: string) {
  if (locale.startsWith('zh')) {
    if (entryKind === 'upload-project') return '仓库导入';
    if (entryKind === 'generate-from-idea') return '想法生成';
    return '旧服务器体检';
  }

  if (entryKind === 'upload-project') return 'Repo ingest';
  if (entryKind === 'generate-from-idea') return 'Idea build';
  return 'Server audit';
}

function generationTaskStatusLabel(status: string, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    queued: zh ? '排队中' : 'Queued',
    planning: zh ? '规划中' : 'Planning',
    coding: zh ? '生成源码' : 'Generating source',
    building_preview: zh ? '构建预览' : 'Building preview',
    completed: zh ? '已完成' : 'Completed',
    failed: zh ? '已失败' : 'Failed',
  };
  return labels[status] ?? status;
}

function launchModeLabel(mode: LaunchMode, locale: string) {
  const zh = locale.startsWith('zh');
  if (mode === 'repo') {
    return zh ? '仓库导入' : 'Repo import';
  }
  if (mode === 'idea') {
    return zh ? '想法生成' : 'Idea build';
  }
  return zh ? '旧服务器体检' : 'Server audit';
}

export function OperatorHubPage() {
  const { capsuleId: routeCapsuleId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, text } = useSite();
  const { isAuthenticated } = useAuth();
  const zh = locale.startsWith('zh');
  const [mode, setMode] = useState<LaunchMode>('repo');
  const [refreshTick, setRefreshTick] = useState(0);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<OperatorGenerationTask | null>(null);
  const [pendingTokens, setPendingTokens] = useState<Record<string, string>>({});
  const [busyIntent, setBusyIntent] = useState<OperatorActionIntent | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [repoForm, setRepoForm] = useState({
    projectName: '',
    repoUrl: '',
    notes: '',
  });
  const [ideaForm, setIdeaForm] = useState({
    projectName: '',
    idea: '',
    audience: '',
    businessGoal: '',
  });
  const [serverForm, setServerForm] = useState({
    label: '',
    host: '',
    username: 'root',
    port: '22',
    authMode: 'password',
    password: '',
    sshKey: '',
  });

  const { data: workspacesResponse, error: workspacesError, loading: workspacesLoading } = useApiData<OperatorCapsuleListResponse>(
    `/api/v1/operator/workspaces?refresh=${refreshTick}`,
    { preserveData: true },
  );
  const workspaces = Array.isArray(workspacesResponse?.data) ? workspacesResponse.data : [];
  const selectedWorkspaceId = routeCapsuleId ?? searchParams.get('capsule') ?? workspaces[0]?.id ?? null;
  const { data: workspaceResponse, error: workspaceError, loading: workspaceLoading } = useApiData<OperatorResponse>(
    selectedWorkspaceId ? `/api/v1/operator/workspaces/${selectedWorkspaceId}?refresh=${refreshTick}` : null,
    { preserveData: true },
  );
  const envelope = workspaceResponse?.data ?? null;
  const capsule = envelope?.capsule ?? null;
  const previewUrl = normalizeOperatorApiUrl(envelope?.previewSummary.previewUrl ?? capsule?.previewUrl ?? null)
    ?? envelope?.previewSummary.previewUrl
    ?? capsule?.previewUrl
    ?? null;

  useEffect(() => {
    if (routeCapsuleId || !selectedWorkspaceId) {
      return;
    }
    if (searchParams.get('capsule') === selectedWorkspaceId) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('capsule', selectedWorkspaceId);
    setSearchParams(next, { replace: true });
  }, [routeCapsuleId, searchParams, selectedWorkspaceId, setSearchParams]);

  const actionButtons = useMemo(
    () => (envelope?.nextActions ?? []).filter((action) => action.intent !== 'open_capsule'),
    [envelope?.nextActions],
  );

  function selectWorkspace(id: string) {
    if (routeCapsuleId) {
      navigate(`/workspaces/${id}`);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('capsule', id);
    setSearchParams(next);
  }

  async function handleCreate() {
    setSubmitBusy(true);
    setSubmitError(null);
    setFeedback(null);
    setPendingTask(null);

    try {
      if (mode === 'repo') {
        const response = await requestJson<OperatorResponse>('/api/v1/operator/projects/analyze', {
          method: 'POST',
          body: {
            projectName: repoForm.projectName,
            repoUrl: repoForm.repoUrl,
            notes: repoForm.notes,
          },
        });
        setFeedback(response.message);
        setRefreshTick((current) => current + 1);
        navigate(`/operator?capsule=${response.data.capsule.id}`);
        return;
      }

      if (mode === 'idea') {
        const response = await requestJson<OperatorGenerationTaskResponse>('/api/v1/operator/projects/generate-task', {
          method: 'POST',
          body: {
            projectName: ideaForm.projectName,
            idea: ideaForm.idea,
            audience: ideaForm.audience,
            businessGoal: ideaForm.businessGoal,
          },
        });
        setPendingTask(response.data);
        setFeedback(response.message);
        return;
      }

      const response = await requestJson<OperatorResponse>('/api/v1/operator/servers/scan', {
        method: 'POST',
        body: {
          label: serverForm.label,
          host: serverForm.host,
          username: serverForm.username,
          port: Number(serverForm.port) || 22,
          authMode: serverForm.authMode,
          password: serverForm.authMode === 'password' ? serverForm.password : undefined,
          sshKey: serverForm.authMode === 'ssh-key' ? serverForm.sshKey : undefined,
        },
      });
      setFeedback(response.message);
      setRefreshTick((current) => current + 1);
      navigate(`/operator?capsule=${response.data.capsule.id}`);
    } catch (error) {
      setSubmitError(toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale));
    } finally {
      setSubmitBusy(false);
    }
  }

  async function handleAction(intent: OperatorActionIntent) {
    if (!capsule || intent === 'open_capsule') {
      return;
    }

    const path = actionPathMap[intent];
    if (!path) {
      return;
    }

    setBusyIntent(intent);
    setActionError(null);
    setFeedback(null);

    try {
      const response = await requestJson<OperatorResponse>(path, {
        method: 'POST',
        body: {
          capsuleId: capsule.id,
          ...(pendingTokens[intent] ? { confirmationToken: pendingTokens[intent] } : {}),
        },
      });

      if (response.data.requiredConfirmation) {
        setPendingTokens((current) => ({
          ...current,
          [intent]: response.data.requiredConfirmation?.token ?? '',
        }));
        setFeedback(zh ? `${response.message} 请再次点击确认。` : `${response.message} Click once more to confirm.`);
      } else {
        setPendingTokens((current) => {
          const next = { ...current };
          delete next[intent];
          return next;
        });
        setFeedback(response.message);
        setRefreshTick((current) => current + 1);
      }
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 401 && !isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(`/operator?capsule=${capsule.id}`)}`);
        return;
      }
      setActionError(toFriendlyError(apiError, locale));
    } finally {
      setBusyIntent(null);
    }
  }

  const loading = workspacesLoading || (workspaceLoading && Boolean(selectedWorkspaceId) && !envelope);
  if (loading && workspaces.length === 0 && !pendingTask) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (workspacesError && workspaces.length === 0) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(workspacesError), locale)}</div>;
  }

  return (
    <div className="operator-console-page">
      <section className="operator-console-shell">
        <aside className="operator-console-rail">
          <div className="operator-console-rail__header">
            <span className="eyebrow">{zh ? '统一工作区' : 'Unified workspaces'}</span>
            <h1>{zh ? 'AI 单控制台' : 'AI operator console'}</h1>
            <p>
              {zh
                ? '左侧看工作区，中央发起真实任务，右侧只展示真实状态、真实预览和真实诊断。'
                : 'Workspaces on the left, real task creation in the center, and only real state, previews, and diagnostics on the right.'}
            </p>
          </div>

          <div className="operator-console-workspace-list">
            {workspaces.length === 0 ? (
              <article className="operator-console-empty">
                <strong>{zh ? '还没有工作区' : 'No workspaces yet'}</strong>
                <p>{zh ? '从中间选择一种入口，发起第一条真实任务。' : 'Start the first real task from the center panel.'}</p>
              </article>
            ) : workspaces.map((workspace) => {
              const selected = workspace.id === selectedWorkspaceId;
              return (
                <button
                  className={`operator-console-workspace ${selected ? 'active' : ''}`}
                  key={workspace.id}
                  onClick={() => selectWorkspace(workspace.id)}
                  type="button"
                >
                  <div className="operator-console-workspace__top">
                    <strong>{workspace.name}</strong>
                    <span className={`chip ${statusClassName(workspace.truthState ?? workspace.status)}`}>
                      {truthStateLabel(workspace.truthState ?? workspace.status, locale)}
                    </span>
                  </div>
                  <span>{entryKindLabel(workspace.entryKind, locale)}</span>
                  <p>{workspace.summary}</p>
                  <div className="operator-console-workspace__meta">
                    <span>{capsuleStatusLabel(workspace.status, locale)}</span>
                    <span>{workspace.latestJob?.summary ?? formatTime(workspace.updatedAt, locale)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="operator-console-center">
          <div className="operator-console-panel">
            <div className="operator-console-panel__head">
              <div>
                <span className="eyebrow">{zh ? '任务入口' : 'Launch modes'}</span>
                <h2>{zh ? '把机器人和工作台合并成一个入口' : 'One entry for both AI agent and workspace'}</h2>
              </div>
              <div className="operator-console-tabs">
                {(['repo', 'idea', 'server'] as LaunchMode[]).map((entry) => (
                  <button
                    className={`operator-console-tab ${mode === entry ? 'active' : ''}`}
                    key={entry}
                    onClick={() => setMode(entry)}
                    type="button"
                  >
                    {launchModeLabel(entry, locale)}
                  </button>
                ))}
              </div>
            </div>

            {feedback ? <div className="success-card compact">{feedback}</div> : null}
            {submitError ? <div className="error-card compact">{submitError}</div> : null}

            {mode === 'repo' ? (
              <div className="operator-console-form">
                <label>
                  <span>{zh ? '项目名' : 'Project name'}</span>
                  <input
                    onChange={(event) => setRepoForm((current) => ({ ...current, projectName: event.target.value }))}
                    placeholder={zh ? '例如：官网 / SaaS 后台' : 'Example: marketing site / SaaS dashboard'}
                    value={repoForm.projectName}
                  />
                </label>
                <label>
                  <span>{zh ? '仓库或压缩包地址' : 'Repository or archive URL'}</span>
                  <input
                    onChange={(event) => setRepoForm((current) => ({ ...current, repoUrl: event.target.value }))}
                    placeholder="https://github.com/... or https://...zip"
                    value={repoForm.repoUrl}
                  />
                </label>
                <label>
                  <span>{zh ? '补充说明' : 'Notes'}</span>
                  <textarea
                    onChange={(event) => setRepoForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder={zh ? '例如：优先保证真实预览，不要伪成功。' : 'Example: prefer a verified preview, never fake success.'}
                    rows={5}
                    value={repoForm.notes}
                  />
                </label>
              </div>
            ) : null}

            {mode === 'idea' ? (
              <div className="operator-console-form">
                <label>
                  <span>{zh ? '项目名' : 'Project name'}</span>
                  <input
                    onChange={(event) => setIdeaForm((current) => ({ ...current, projectName: event.target.value }))}
                    placeholder={zh ? '例如：预约系统 / 会员应用' : 'Example: booking app / member portal'}
                    value={ideaForm.projectName}
                  />
                </label>
                <label>
                  <span>{zh ? '核心想法' : 'Idea'}</span>
                  <textarea
                    onChange={(event) => setIdeaForm((current) => ({ ...current, idea: event.target.value }))}
                    placeholder={zh ? '描述业务目标、目标用户和第一条要跑通的流程。' : 'Describe the business goal, audience, and first flow to make real.'}
                    rows={6}
                    value={ideaForm.idea}
                  />
                </label>
                <div className="operator-console-form__row">
                  <label>
                    <span>{zh ? '目标用户' : 'Audience'}</span>
                    <input
                      onChange={(event) => setIdeaForm((current) => ({ ...current, audience: event.target.value }))}
                      placeholder={zh ? '例如：门店老板' : 'Example: local business owner'}
                      value={ideaForm.audience}
                    />
                  </label>
                  <label>
                    <span>{zh ? '商业目标' : 'Business goal'}</span>
                    <input
                      onChange={(event) => setIdeaForm((current) => ({ ...current, businessGoal: event.target.value }))}
                      placeholder={zh ? '例如：收集线索 / 提高转化' : 'Example: collect leads / improve conversion'}
                      value={ideaForm.businessGoal}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {mode === 'server' ? (
              <div className="operator-console-form">
                <div className="operator-console-form__row">
                  <label>
                    <span>{zh ? '服务器标签' : 'Server label'}</span>
                    <input
                      onChange={(event) => setServerForm((current) => ({ ...current, label: event.target.value }))}
                      placeholder={zh ? '例如：官网生产机' : 'Example: production site host'}
                      value={serverForm.label}
                    />
                  </label>
                  <label>
                    <span>Host</span>
                    <input
                      onChange={(event) => setServerForm((current) => ({ ...current, host: event.target.value }))}
                      placeholder="203.0.113.12"
                      value={serverForm.host}
                    />
                  </label>
                </div>
                <div className="operator-console-form__row operator-console-form__row--triple">
                  <label>
                    <span>{zh ? '用户名' : 'Username'}</span>
                    <input
                      onChange={(event) => setServerForm((current) => ({ ...current, username: event.target.value }))}
                      value={serverForm.username}
                    />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      onChange={(event) => setServerForm((current) => ({ ...current, port: event.target.value }))}
                      value={serverForm.port}
                    />
                  </label>
                  <label>
                    <span>{zh ? '接入方式' : 'Auth mode'}</span>
                    <select
                      onChange={(event) => setServerForm((current) => ({ ...current, authMode: event.target.value }))}
                      value={serverForm.authMode}
                    >
                      <option value="password">{zh ? '密码' : 'Password'}</option>
                      <option value="ssh-key">SSH Key</option>
                      <option value="agent">Agent</option>
                    </select>
                  </label>
                </div>
                {serverForm.authMode === 'password' ? (
                  <label>
                    <span>{zh ? '密码' : 'Password'}</span>
                    <input
                      onChange={(event) => setServerForm((current) => ({ ...current, password: event.target.value }))}
                      type="password"
                      value={serverForm.password}
                    />
                  </label>
                ) : null}
                {serverForm.authMode === 'ssh-key' ? (
                  <label>
                    <span>SSH Key</span>
                    <textarea
                      onChange={(event) => setServerForm((current) => ({ ...current, sshKey: event.target.value }))}
                      rows={6}
                      value={serverForm.sshKey}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="operator-console-form__actions">
              <button className="button primary" disabled={submitBusy} onClick={() => void handleCreate()} type="button">
                {submitBusy
                  ? (zh ? '正在提交...' : 'Submitting...')
                  : (mode === 'repo'
                      ? (zh ? '创建真实仓库工作区' : 'Create real repo workspace')
                      : mode === 'idea'
                        ? (zh ? '开始真实生成' : 'Start real build')
                        : (zh ? '开始只读体检' : 'Start read-only audit'))}
              </button>
              <span className="operator-console-hint">
                {mode === 'repo'
                  ? (zh ? '不会再直接返回海报页，必须等真实构建完成。' : 'No poster preview will be shown before the real build succeeds.')
                  : mode === 'idea'
                    ? (zh ? '任务先进入计划和生成，再落到同一个工作区。' : 'The task will plan and build first, then land in the same workspace.')
                    : (zh ? '只会做 SSH 只读采集，不会立刻改动服务器。' : 'Only a read-only SSH audit will run. No server mutation starts yet.')}
              </span>
            </div>
          </div>

          <div className="operator-console-panel">
            <div className="operator-console-panel__head">
              <div>
                <span className="eyebrow">{zh ? '当前对话' : 'Current run'}</span>
                <h2>{zh ? '统一的 AI 任务状态' : 'Unified AI task state'}</h2>
              </div>
              {capsule ? (
                <Link className="button ghost" to={`/workspaces/${capsule.id}`}>
                  {zh ? '固定打开此工作区' : 'Open dedicated workspace route'}
                </Link>
              ) : null}
            </div>

            {pendingTask ? (
              <article className="operator-console-chat-card">
                <span className={`chip ${statusClassName(pendingTask.status)}`}>{generationTaskStatusLabel(pendingTask.status, locale)}</span>
                <strong>{pendingTask.title}</strong>
                <p>{pendingTask.summary}</p>
                <small>{pendingTask.detail}</small>
              </article>
            ) : null}

            {capsule && envelope ? (
              <div className="operator-console-chat-stack">
                <article className="operator-console-chat-card operator-console-chat-card--user">
                  <span>{zh ? '当前工作区' : 'Selected workspace'}</span>
                  <strong>{capsule.name}</strong>
                  <p>{capsule.summary}</p>
                </article>
                <article className="operator-console-chat-card">
                  <span>{zh ? '真实状态' : 'Truth state'}</span>
                  <strong>{truthStateLabel(envelope.truthState, locale)}</strong>
                  <p>{envelope.diagnosticsSummary.headline}</p>
                  <small>{envelope.diagnosticsSummary.detail}</small>
                </article>
                <article className="operator-console-chat-card">
                  <span>{zh ? '下一步' : 'Next step'}</span>
                  <strong>{envelope.latestJob?.title ?? envelope.plan.title}</strong>
                  <p>{envelope.latestJob?.summary ?? envelope.plan.summary}</p>
                  <small>{envelope.latestJob?.error ?? envelope.diagnosticsSummary.command ?? (zh ? '等待下一步操作。' : 'Waiting for the next action.')}</small>
                </article>
              </div>
            ) : (
              <article className="operator-console-empty operator-console-empty--tall">
                <strong>{zh ? '还没有选中的工作区' : 'No workspace selected yet'}</strong>
                <p>{zh ? '发起一个任务后，统一状态、预览和诊断都会落到这里。' : 'After the first run starts, state, preview, and diagnostics will appear here.'}</p>
              </article>
            )}
          </div>
        </section>

        <aside className="operator-console-stage">
          <div className="operator-console-panel operator-console-panel--sticky">
            <div className="operator-console-panel__head">
              <div>
                <span className="eyebrow">{zh ? '真实结果' : 'Real outputs'}</span>
                <h2>{capsule?.name ?? (zh ? '等待任务' : 'Waiting for a run')}</h2>
              </div>
            </div>

            {workspaceError && !capsule ? (
              <div className="error-card compact">{text.common.error}: {toFriendlyError(new Error(workspaceError), locale)}</div>
            ) : null}
            {actionError ? <div className="error-card compact">{actionError}</div> : null}

            {capsule && envelope ? (
              <div className="operator-console-stage__stack">
                <div className="operator-console-kpi-grid">
                  <article>
                    <span>{zh ? '胶囊状态' : 'Capsule'}</span>
                    <strong>{capsuleStatusLabel(capsule.status, locale)}</strong>
                  </article>
                  <article>
                    <span>{zh ? '真相状态' : 'Truth'}</span>
                    <strong>{truthStateLabel(envelope.truthState, locale)}</strong>
                  </article>
                  <article>
                    <span>{zh ? '最近任务' : 'Latest job'}</span>
                    <strong>{envelope.latestJob ? `${envelope.latestJob.progress}%` : '-'}</strong>
                  </article>
                  <article>
                    <span>{zh ? '健康分' : 'Health'}</span>
                    <strong>{capsule.healthScore}</strong>
                  </article>
                </div>

                <div className="operator-console-stage-card">
                  <div className="operator-console-stage-card__head">
                    <strong>{zh ? '预览 / 诊断' : 'Preview / diagnostics'}</strong>
                    <span className={`chip ${statusClassName(envelope.previewSummary.status)}`}>
                      {envelope.previewSummary.status}
                    </span>
                  </div>
                  {previewUrl && envelope.previewSummary.verified ? (
                    <>
                      <iframe
                        className="operator-console-preview"
                        loading="lazy"
                        src={previewUrl}
                        title={zh ? '工作区预览' : 'Workspace preview'}
                      />
                      <a className="button secondary" href={previewUrl} rel="noreferrer" target="_blank">
                        {zh ? '新窗口打开预览' : 'Open preview'}
                      </a>
                    </>
                  ) : (
                    <div className="operator-console-diagnostics">
                      <strong>{envelope.diagnosticsSummary.headline}</strong>
                      <p>{envelope.diagnosticsSummary.detail}</p>
                      <small>{envelope.previewSummary.lastError ?? envelope.auditSummary.lastError ?? envelope.latestJob?.error ?? '-'}</small>
                    </div>
                  )}
                </div>

                <div className="operator-console-stage-card">
                  <div className="operator-console-stage-card__head">
                    <strong>{zh ? '源码 / 物料' : 'Artifacts'}</strong>
                    <span className="chip">{envelope.artifactSummary.sourceType}</span>
                  </div>
                  <div className="operator-console-keyvals">
                    <div><span>{zh ? '来源' : 'Source'}</span><strong>{envelope.artifactSummary.sourceRef ?? '-'}</strong></div>
                    <div><span>{zh ? '入口文件' : 'Entry file'}</span><strong>{envelope.artifactSummary.entryFile ?? '-'}</strong></div>
                    <div><span>{zh ? '文件数' : 'Files'}</span><strong>{envelope.artifactSummary.fileCount}</strong></div>
                    <div><span>{zh ? '构建命令' : 'Build command'}</span><strong>{envelope.artifactSummary.buildCommand ?? '-'}</strong></div>
                  </div>
                  <div className="operator-console-link-row">
                    {envelope.artifactSummary.archiveUrl ? (
                      <a className="button secondary" href={envelope.artifactSummary.archiveUrl} rel="noreferrer" target="_blank">
                        {zh ? '下载源码包' : 'Download source archive'}
                      </a>
                    ) : null}
                    {envelope.artifactSummary.manifestUrl ? (
                      <a className="button ghost" href={envelope.artifactSummary.manifestUrl} rel="noreferrer" target="_blank">
                        {zh ? '打开工作区详情' : 'Open workspace detail'}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="operator-console-stage-card">
                  <div className="operator-console-stage-card__head">
                    <strong>{zh ? '任务时间线' : 'Job timeline'}</strong>
                    <span className="chip">{envelope.jobs.length}</span>
                  </div>
                  <div className="operator-console-job-list">
                    {envelope.jobs.length === 0 ? (
                      <p className="muted">{zh ? '还没有任务记录。' : 'No jobs have been recorded yet.'}</p>
                    ) : envelope.jobs.map((job) => (
                      <article className="operator-console-job" key={job.id}>
                        <div className="operator-console-job__top">
                          <strong>{job.title}</strong>
                          <span className={`chip ${statusClassName(job.status)}`}>{job.status}</span>
                        </div>
                        <p>{job.summary}</p>
                        <small>{formatTime(job.updatedAt, locale)}</small>
                      </article>
                    ))}
                  </div>
                </div>

                {capsule.entryKind === 'scan-server' ? (
                  <div className="operator-console-stage-card">
                    <div className="operator-console-stage-card__head">
                      <strong>{zh ? '服务器体检摘要' : 'Server audit summary'}</strong>
                      <span className={`chip ${statusClassName(envelope.auditSummary.status)}`}>{envelope.auditSummary.status}</span>
                    </div>
                    <div className="operator-console-keyvals">
                      <div><span>OS</span><strong>{envelope.auditSummary.os ?? '-'}</strong></div>
                      <div><span>Docker</span><strong>{envelope.auditSummary.docker ?? '-'}</strong></div>
                      <div><span>Ports</span><strong>{envelope.auditSummary.openPorts.join(', ') || '-'}</strong></div>
                      <div><span>{zh ? '风险项' : 'Risks'}</span><strong>{envelope.auditSummary.risks.join(' / ') || '-'}</strong></div>
                    </div>
                  </div>
                ) : null}

                <div className="operator-console-stage-card">
                  <div className="operator-console-stage-card__head">
                    <strong>{zh ? '执行动作' : 'Actions'}</strong>
                    <span className="chip">{actionButtons.length}</span>
                  </div>
                  <div className="operator-console-action-list">
                    {actionButtons.map((action) => {
                      const requiresSecondClick = Boolean(pendingTokens[action.intent]);
                      return (
                        <button
                          className={`button ${action.risk === 'high' ? 'danger' : 'secondary'}`}
                          disabled={busyIntent === action.intent}
                          key={action.id}
                          onClick={() => void handleAction(action.intent)}
                          type="button"
                        >
                          {busyIntent === action.intent
                            ? (zh ? '处理中...' : 'Working...')
                            : requiresSecondClick
                              ? (zh ? `确认${action.label}` : `Confirm ${action.label}`)
                              : action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="operator-console-empty operator-console-empty--tall">
                <strong>{zh ? '先发起一条任务' : 'Start a task first'}</strong>
                <p>{zh ? '右侧会只显示真实产物，不再放摘要海报。' : 'This panel will only show real outputs, not summary posters.'}</p>
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
