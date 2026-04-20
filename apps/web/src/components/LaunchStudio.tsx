import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { requestJson } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import type {
  OperatorGenerationTask,
  OperatorGenerationTaskResponse,
  OperatorResponse,
} from '../lib/operator-types';
import { useSite } from '../lib/site-context';
import type {
  AssistantConfirmResponse,
  AssistantMessagesResponse,
  AssistantPendingConfirmation,
  AssistantSessionResponse,
} from '../lib/types';

type LaunchMode = 'project' | 'idea' | 'server';

type AssistantActionResult = NonNullable<AssistantMessagesResponse['data']['actionResult']>;

type IdeaPlannerState = {
  sessionId: string | null;
  planText: string | null;
  pendingConfirmation: AssistantPendingConfirmation | null;
  actionResult: AssistantActionResult | null;
  buildTask: OperatorGenerationTask | null;
};

const emptyIdeaPlannerState: IdeaPlannerState = {
  sessionId: null,
  planText: null,
  pendingConfirmation: null,
  actionResult: null,
  buildTask: null,
};

function buildIdeaPlannerMessage(
  input: {
    projectName: string;
    idea: string;
    audience: string;
    businessGoal: string;
  },
  locale: string,
) {
  const zh = locale.startsWith('zh');
  const segments = [
    input.projectName.trim(),
    input.idea.trim(),
    input.audience.trim(),
    input.businessGoal.trim(),
  ];
  const [projectName, idea, audience, businessGoal] = segments;

  if (zh) {
    return [
      `帮我做一个${idea || '应用'}。`,
      projectName ? `项目名：${projectName}。` : '',
      audience ? `目标用户：${audience}。` : '目标用户：普通用户。',
      businessGoal ? `商业目标：${businessGoal}。` : '商业目标：低门槛快速上线并可持续运营。',
    ].filter(Boolean).join(' ');
  }

  return [
    `Help me create a ${idea || 'web app'}.`,
    projectName ? `Project name: ${projectName}.` : '',
    audience ? `Audience: ${audience}.` : 'Audience: general users.',
    businessGoal ? `Business goal: ${businessGoal}.` : 'Business goal: launch quickly with low-friction operations.',
  ].filter(Boolean).join(' ');
}

function actionResultLinks(actionResult: AssistantActionResult | null) {
  const data = actionResult?.data;
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;

  return {
    capsulePath: typeof record?.capsulePath === 'string' ? record.capsulePath : null,
    capsuleUrl: typeof record?.capsuleUrl === 'string' ? record.capsuleUrl : null,
    previewUrl: typeof record?.previewUrl === 'string' ? record.previewUrl : null,
  };
}

function parseGenerationTask(actionResult: AssistantActionResult | null) {
  const data = actionResult?.data;
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const rawTask = record?.generationTask;

  if (!rawTask || typeof rawTask !== 'object') {
    return null;
  }

  return rawTask as OperatorGenerationTask;
}

function generationTaskStatusLabel(status: OperatorGenerationTask['status'], locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<OperatorGenerationTask['status'], string> = {
    queued: zh ? '排队中' : 'Queued',
    planning: zh ? '规划中' : 'Planning',
    coding: zh ? '编码中' : 'Coding',
    building_preview: zh ? '构建预览中' : 'Building preview',
    completed: zh ? '已完成' : 'Completed',
    failed: zh ? '失败' : 'Failed',
  };

  return labels[status];
}

function generationStepClassName(status: OperatorGenerationTask['steps'][number]['status']) {
  if (status === 'completed') {
    return 'status-active';
  }
  if (status === 'in_progress') {
    return 'status-running';
  }
  if (status === 'attention') {
    return 'status-overdue';
  }
  return 'status-pending';
}

export function LaunchStudio() {
  const navigate = useNavigate();
  const { locale } = useSite();
  const [submitting, setSubmitting] = useState<LaunchMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
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
  const [ideaPlanner, setIdeaPlanner] = useState<IdeaPlannerState>(emptyIdeaPlannerState);
  const [serverForm, setServerForm] = useState({
    label: '',
    host: '',
    username: 'root',
    port: '22',
    authMode: 'password',
    password: '',
    sshKey: '',
  });

  useEffect(() => {
    if (!ideaPlanner.buildTask || ideaPlanner.buildTask.status === 'completed' || ideaPlanner.buildTask.status === 'failed') {
      return;
    }

    const timer = window.setTimeout(() => {
      requestJson<OperatorGenerationTaskResponse>(`/api/v1/operator/tasks/${encodeURIComponent(ideaPlanner.buildTask!.id)}`)
        .then((response) => {
          setIdeaPlanner((current) => {
            if (!current.buildTask || current.buildTask.id !== response.data.id) {
              return current;
            }

            return {
              ...current,
              buildTask: response.data,
            };
          });
        })
        .catch((caughtError) => {
          setIdeaPlanner((current) => {
            if (!current.buildTask) {
              return current;
            }

            return {
              ...current,
              buildTask: {
                ...current.buildTask,
                status: 'failed',
                progress: 100,
                summary: locale.startsWith('zh') ? '任务状态获取失败。' : 'Failed to load task status.',
                detail: toFriendlyError(caughtError as Error, locale),
                error: toFriendlyError(caughtError as Error, locale),
              },
            };
          });
        });
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ideaPlanner.buildTask, locale]);

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('project');
    setError(null);

    try {
      const response = await requestJson<OperatorResponse>('/api/v1/operator/projects/analyze', {
        method: 'POST',
        body: projectForm,
      });
      navigate(`/workspaces/${response.data.capsule.id}`);
    } catch (caughtError) {
      setError(toFriendlyError(caughtError as Error, locale));
    } finally {
      setSubmitting(null);
    }
  }

  async function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('idea');
    setError(null);

    try {
      let activeSessionId = ideaPlanner.sessionId;

      if (!activeSessionId) {
        const sessionResponse = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
          method: 'POST',
          body: {
            locale,
            context: {
              path: '/operator',
              locale,
            },
          },
        });
        activeSessionId = sessionResponse.data.session.sessionId;
      }

      const response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
        method: 'POST',
        body: {
          sessionId: activeSessionId,
          locale,
          autoRoute: true,
          context: {
            path: '/operator',
            locale,
          },
          message: buildIdeaPlannerMessage(ideaForm, locale),
        },
      });

      setIdeaPlanner({
        sessionId: activeSessionId,
        planText: response.data.reply.content,
        pendingConfirmation: response.data.pendingConfirmation ?? null,
        actionResult: response.data.actionResult ?? null,
        buildTask: null,
      });
    } catch (caughtError) {
      setError(toFriendlyError(caughtError as Error, locale));
    } finally {
      setSubmitting(null);
    }
  }

  async function confirmIdeaPlan() {
    if (!ideaPlanner.sessionId || !ideaPlanner.pendingConfirmation) {
      return;
    }

    setSubmitting('idea');
    setError(null);

    try {
      const response = await requestJson<AssistantConfirmResponse>('/api/v1/assistant/actions/confirm', {
        method: 'POST',
        body: {
          sessionId: ideaPlanner.sessionId,
          confirmToken: ideaPlanner.pendingConfirmation.token,
          locale,
        },
      });

      setIdeaPlanner((current) => ({
        ...current,
        pendingConfirmation: null,
        actionResult: response.data.actionResult ?? null,
        buildTask: parseGenerationTask(response.data.actionResult ?? null),
      }));
    } catch (caughtError) {
      setError(toFriendlyError(caughtError as Error, locale));
    } finally {
      setSubmitting(null);
    }
  }

  async function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting('server');
    setError(null);

    try {
      const response = await requestJson<OperatorResponse>('/api/v1/operator/servers/scan', {
        method: 'POST',
        body: {
          ...serverForm,
          port: Number(serverForm.port) || 22,
          password: serverForm.authMode === 'password' ? serverForm.password : undefined,
          sshKey: serverForm.authMode === 'ssh-key' ? serverForm.sshKey : undefined,
        },
      });
      navigate(`/workspaces/${response.data.capsule.id}`);
    } catch (caughtError) {
      setError(toFriendlyError(caughtError as Error, locale));
    } finally {
      setSubmitting(null);
    }
  }

  function resetIdeaPlanner() {
    setIdeaPlanner(emptyIdeaPlannerState);
  }

  const zh = locale.startsWith('zh');
  const ideaPlanLines = useMemo(
    () => (ideaPlanner.planText ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
    [ideaPlanner.planText],
  );
  const ideaResultLinks = actionResultLinks(ideaPlanner.actionResult);
  const ideaBuildTask = ideaPlanner.buildTask;
  const ideaCapsulePath = ideaBuildTask?.capsulePath ?? ideaResultLinks.capsulePath;
  const ideaCapsuleUrl = ideaResultLinks.capsuleUrl;
  const ideaPreviewUrl = ideaBuildTask?.previewUrl ?? ideaResultLinks.previewUrl;

  return (
    <section className="page-section launch-studio" id="launch-studio">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{zh ? 'AI 一键上线台' : 'AI launch studio'}</p>
          <h2>{zh ? '三条入口，5 分钟先看到结果' : 'Three entry points, with something useful in five minutes'}</h2>
          <p className="muted">
            {zh
              ? '有项目直接上线，只有想法就先走计划模式，有旧服务器就先体检再接管或迁移。'
              : 'Bring a project, bring an idea, or bring an existing server. Sloth Operator turns each into one execution workspace.'}
          </p>
        </div>
      </div>

      {error ? <div className="error-card">{error}</div> : null}

      <div className="launch-grid">
        <article className="line-card launch-card">
          <div className="stack-8">
            <span className="chip">{zh ? '入口一' : 'Entry one'}</span>
            <h3>{zh ? '我有项目，帮我上线' : 'I have a project'}</h3>
            <p>{zh ? '仓库、压缩包路径、项目摘要都可以。系统先分析，再直接给预览。' : 'Repository, archive path, or project summary. We analyze first and prepare a preview lane.'}</p>
          </div>
          <form className="stack-16" onSubmit={submitProject}>
            <label className="field">
              <span>{zh ? '项目名' : 'Project name'}</span>
              <input
                className="text-input"
                onChange={(event) => setProjectForm((current) => ({ ...current, projectName: event.target.value }))}
                placeholder={zh ? '例如：品牌官网 / SaaS 后台' : 'For example: marketing site / SaaS dashboard'}
                type="text"
                value={projectForm.projectName}
              />
            </label>
            <label className="field">
              <span>{zh ? '仓库地址或文件来源' : 'Repository or source reference'}</span>
              <input
                className="text-input"
                onChange={(event) => setProjectForm((current) => ({ ...current, repoUrl: event.target.value }))}
                placeholder={zh ? 'https://github.com/... 或 zip 文件来源' : 'https://github.com/... or archive source'}
                type="text"
                value={projectForm.repoUrl}
              />
            </label>
            <label className="field">
              <span>{zh ? '补充说明' : 'Notes'}</span>
              <textarea
                className="text-input text-input--textarea"
                onChange={(event) => setProjectForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder={zh ? '例如：要绑定域名、需要登录、要保留数据库。' : 'For example: add domain, preserve database, login flow required.'}
                value={projectForm.notes}
              />
            </label>
            <button className="button primary" disabled={submitting === 'project'} type="submit">
              {submitting === 'project' ? (zh ? '分析中...' : 'Analyzing...') : (zh ? '生成项目工作区' : 'Create project workspace')}
            </button>
          </form>
        </article>

        <article className="line-card launch-card">
          <div className="stack-8">
            <span className="chip">{zh ? '入口二' : 'Entry two'}</span>
            <h3>{zh ? '我只有想法，帮我做出来' : 'I only have an idea'}</h3>
            <p>{zh ? '这里先走计划模式：先生成真实执行计划，确认后再启动任务，产出源码包和共享预览。' : 'This path starts in plan mode: review the real execution plan first, then confirm the task to produce source files and a shared preview.'}</p>
          </div>
          <form className="stack-16" onSubmit={submitIdea}>
            <label className="field">
              <span>{zh ? '项目名（可选）' : 'Project name (optional)'}</span>
              <input
                className="text-input"
                onChange={(event) => setIdeaForm((current) => ({ ...current, projectName: event.target.value }))}
                placeholder={zh ? '例如：预约系统 / 课程官网' : 'For example: booking app / course site'}
                type="text"
                value={ideaForm.projectName}
              />
            </label>
            <label className="field">
              <span>{zh ? '核心想法' : 'Core idea'}</span>
              <textarea
                className="text-input text-input--textarea"
                onChange={(event) => setIdeaForm((current) => ({ ...current, idea: event.target.value }))}
                placeholder={zh ? '例如：做一个给健身房用的预约和会员页。' : 'For example: build a booking and membership site for a gym.'}
                required
                value={ideaForm.idea}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>{zh ? '目标用户' : 'Audience'}</span>
                <input
                  className="text-input"
                  onChange={(event) => setIdeaForm((current) => ({ ...current, audience: event.target.value }))}
                  placeholder={zh ? '例如：线下门店老板' : 'For example: local shop owners'}
                  type="text"
                  value={ideaForm.audience}
                />
              </label>
              <label className="field">
                <span>{zh ? '商业目标' : 'Business goal'}</span>
                <input
                  className="text-input"
                  onChange={(event) => setIdeaForm((current) => ({ ...current, businessGoal: event.target.value }))}
                  placeholder={zh ? '例如：预约转化、收集线索' : 'For example: bookings, lead capture'}
                  type="text"
                  value={ideaForm.businessGoal}
                />
              </label>
            </div>
            <button className="button primary" disabled={submitting === 'idea'} type="submit">
              {submitting === 'idea'
                ? (zh ? '规划中...' : 'Planning...')
                : (ideaPlanner.planText
                    ? (zh ? '重新生成计划' : 'Regenerate launch plan')
                    : (zh ? '先生成真实执行计划' : 'Generate real execution plan first'))}
            </button>
          </form>

          {ideaBuildTask ? (
            <div className="summary-card stack-12 launch-task-card">
              <div className="stack-8">
                <span className="eyebrow">
                  {ideaBuildTask.status === 'completed'
                    ? (zh ? '工作区已就绪' : 'Workspace ready')
                    : ideaBuildTask.status === 'failed'
                      ? (zh ? '任务需要处理' : 'Task needs attention')
                      : (zh ? '真实生成任务' : 'Live generation task')}
                </span>
                <div className="task-status-row">
                  <strong>{ideaBuildTask.summary}</strong>
                  <span className={`chip ${generationStepClassName(
                    ideaBuildTask.status === 'failed'
                      ? 'attention'
                      : ideaBuildTask.status === 'completed'
                        ? 'completed'
                        : 'in_progress',
                  )}`}
                  >
                    {generationTaskStatusLabel(ideaBuildTask.status, locale)}
                  </span>
                </div>
                <p className="muted">{ideaBuildTask.detail}</p>
              </div>

              <div className="launch-task-progress">
                <div className="launch-task-progress__bar" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={ideaBuildTask.progress}>
                  <span style={{ width: `${Math.max(6, Math.min(100, ideaBuildTask.progress))}%` }} />
                </div>
                <div className="task-status-row">
                  <span className="muted">{zh ? `任务编号 ${ideaBuildTask.id}` : `Task ${ideaBuildTask.id}`}</span>
                  <strong>{ideaBuildTask.progress}%</strong>
                </div>
              </div>

              <div className="launch-task-steps">
                {ideaBuildTask.steps.map((step) => (
                  <article className="choice-card compact launch-task-step" key={step.id}>
                    <div className="task-status-row">
                      <strong>{step.title}</strong>
                      <span className={`chip ${generationStepClassName(step.status)}`}>
                        {step.status === 'completed'
                          ? (zh ? '已完成' : 'Done')
                          : step.status === 'in_progress'
                            ? (zh ? '进行中' : 'In progress')
                            : step.status === 'attention'
                              ? (zh ? '需要处理' : 'Needs attention')
                              : (zh ? '待开始' : 'Pending')}
                      </span>
                    </div>
                    <p className="muted">{step.detail}</p>
                  </article>
                ))}
              </div>

              {ideaBuildTask.error ? (
                <div className="error-card">
                  {zh ? `任务记录：${ideaBuildTask.error}` : `Task trace: ${ideaBuildTask.error}`}
                </div>
              ) : null}

              <div className="action-row">
                {ideaCapsulePath ? (
                  <button className="button primary" onClick={() => navigate(ideaCapsulePath)} type="button">
                    {zh ? '打开工作区' : 'Open workspace'}
                  </button>
                ) : ideaCapsuleUrl ? (
                  <a className="button primary" href={ideaCapsuleUrl} rel="noreferrer" target="_blank">
                    {zh ? '打开工作区' : 'Open workspace'}
                  </a>
                ) : null}
                {ideaPreviewUrl ? (
                  <a className="button secondary" href={ideaPreviewUrl} rel="noreferrer" target="_blank">
                    {ideaBuildTask.status === 'failed'
                      ? (zh ? '打开诊断页' : 'Open diagnostics')
                      : (zh ? '打开预览' : 'Open preview')}
                  </a>
                ) : null}
                <button className="button ghost" onClick={resetIdeaPlanner} type="button">
                  {zh ? '重新规划' : 'Plan another one'}
                </button>
              </div>
            </div>
          ) : ideaPlanner.actionResult ? (
            <div className="summary-card stack-12">
              <div className="stack-8">
                <span className="eyebrow">{zh ? '工作区已就绪' : 'Workspace ready'}</span>
                <strong>{ideaPlanner.actionResult.message}</strong>
                {ideaPlanner.actionResult.detail ? <p className="muted">{ideaPlanner.actionResult.detail}</p> : null}
              </div>
              <div className="action-row">
                {ideaCapsulePath ? (
                  <button className="button primary" onClick={() => navigate(ideaCapsulePath)} type="button">
                    {zh ? '打开工作区' : 'Open workspace'}
                  </button>
                ) : ideaCapsuleUrl ? (
                  <a className="button primary" href={ideaCapsuleUrl} rel="noreferrer" target="_blank">
                    {zh ? '打开工作区' : 'Open workspace'}
                  </a>
                ) : null}
                {ideaPreviewUrl ? (
                  <a className="button secondary" href={ideaPreviewUrl} rel="noreferrer" target="_blank">
                    {zh ? '打开预览' : 'Open preview'}
                  </a>
                ) : null}
                <button className="button ghost" onClick={resetIdeaPlanner} type="button">
                  {zh ? '再规划一个' : 'Plan another one'}
                </button>
              </div>
            </div>
          ) : ideaPlanner.planText ? (
            <div className="summary-card stack-12">
              <div className="stack-8">
                <span className="eyebrow">{zh ? '真实执行计划' : 'Real execution plan'}</span>
                <strong>{zh ? '先确认这份计划，再开始真正生成' : 'Review this plan before the real build starts'}</strong>
              </div>
              <div className="stack-8">
                {ideaPlanLines.map((line, index) => (
                  <p className={index === 0 ? '' : 'muted'} key={`${index}-${line}`}>{line}</p>
                ))}
              </div>
              <div className="action-row">
                {ideaPlanner.pendingConfirmation ? (
                  <button className="button primary" disabled={submitting === 'idea'} onClick={() => void confirmIdeaPlan()} type="button">
                    {submitting === 'idea' ? (zh ? '生成中...' : 'Building...') : (zh ? '确认启动任务' : 'Confirm and start task')}
                  </button>
                ) : null}
                <button className="button ghost" onClick={resetIdeaPlanner} type="button">
                  {zh ? '重新规划' : 'Reset plan'}
                </button>
              </div>
            </div>
          ) : (
            <div className="choice-card compact">
              <div className="stack-8">
                <strong>{zh ? '现在会先给你计划，再让你确认生成' : 'This now starts with a plan before any build runs'}</strong>
                <p className="muted">
                  {zh
                    ? '你会先看到目标摘要、建议技术路线、预览交付方式、风险限制和下一步确认动作。'
                    : 'You will first see the goal summary, recommended build path, preview delivery, risks, and the next confirmation step.'}
                </p>
                <p className="muted">
                  {zh
                    ? '当前默认开启严格真实生成：模型没产出源码包时会直接报错，不再回退模板。'
                    : 'Strict real generation is on by default here: if the model does not produce a source bundle, the run fails instead of falling back to a template.'}
                </p>
                <p className="muted">
                  {zh
                    ? '真实生成通常会比以前慢很多，复杂页面可能需要几分钟，不再是几十秒内返回一个模板页。'
                    : 'Real generation is intentionally much slower than before. Complex pages can take several minutes instead of returning a template in under a minute.'}
                </p>
              </div>
            </div>
          )}
        </article>

        <article className="line-card launch-card">
          <div className="stack-8">
            <span className="chip">{zh ? '入口三' : 'Entry three'}</span>
            <h3>{zh ? '我有旧服务器，帮我接管/迁移' : 'I have an existing server'}</h3>
            <p>{zh ? '先只读体检，再决定原地接管还是迁移到树懒云。密码和 SSH Key 两种方式都支持。' : 'Start with a read-only scan, then decide whether to take it over in place or migrate it into Sloth Cloud.'}</p>
          </div>
          <form className="stack-16" onSubmit={submitServer}>
            <div className="field-row">
              <label className="field">
                <span>{zh ? '服务器标签' : 'Server label'}</span>
                <input
                  className="text-input"
                  onChange={(event) => setServerForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder={zh ? '例如：官网生产机' : 'For example: main production box'}
                  type="text"
                  value={serverForm.label}
                />
              </label>
              <label className="field">
                <span>Host</span>
                <input
                  className="text-input"
                  onChange={(event) => setServerForm((current) => ({ ...current, host: event.target.value }))}
                  placeholder="203.0.113.12"
                  required
                  type="text"
                  value={serverForm.host}
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>{zh ? '用户名' : 'Username'}</span>
                <input
                  className="text-input"
                  onChange={(event) => setServerForm((current) => ({ ...current, username: event.target.value }))}
                  required
                  type="text"
                  value={serverForm.username}
                />
              </label>
              <label className="field">
                <span>Port</span>
                <input
                  className="text-input"
                  onChange={(event) => setServerForm((current) => ({ ...current, port: event.target.value }))}
                  type="number"
                  value={serverForm.port}
                />
              </label>
            </div>
            <label className="field">
              <span>{zh ? '接入方式' : 'Access mode'}</span>
              <select
                className="text-input"
                onChange={(event) => setServerForm((current) => ({ ...current, authMode: event.target.value }))}
                value={serverForm.authMode}
              >
                <option value="password">{zh ? '密码' : 'Password'}</option>
                <option value="ssh-key">SSH Key</option>
                <option value="agent">{zh ? '轻量 Agent' : 'Lightweight agent'}</option>
              </select>
            </label>
            {serverForm.authMode === 'password' ? (
              <label className="field">
                <span>{zh ? '密码' : 'Password'}</span>
                <input
                  className="text-input"
                  onChange={(event) => setServerForm((current) => ({ ...current, password: event.target.value }))}
                  type="password"
                  value={serverForm.password}
                />
              </label>
            ) : null}
            {serverForm.authMode === 'ssh-key' ? (
              <label className="field">
                <span>SSH Key</span>
                <textarea
                  className="text-input text-input--textarea"
                  onChange={(event) => setServerForm((current) => ({ ...current, sshKey: event.target.value }))}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={serverForm.sshKey}
                />
              </label>
            ) : null}
            <button className="button primary" disabled={submitting === 'server'} type="submit">
              {submitting === 'server' ? (zh ? '体检中...' : 'Scanning...') : (zh ? '生成接管工作区' : 'Create takeover workspace')}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
