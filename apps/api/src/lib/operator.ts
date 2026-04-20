import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';

import {
  buildFallbackGeneratedProjectRecipe,
  generateProjectBundleFromModel,
  planGeneratedProjectRecipe,
  type GeneratedProjectBundle,
  type GeneratedProjectKind,
  type GeneratedProjectRecipe,
  type GeneratedProjectStage,
  type OperatorLlmProviderConfig,
} from './operator-executor.js';
import {
  RemoteExecError,
  getRemotePlaybook,
  runRemoteSteps,
  type RemoteExecConnector,
  type RemoteExecStepResult,
} from './remote-exec.js';

type OperatorEntryKind = 'upload-project' | 'generate-from-idea' | 'scan-server';
type OperatorCapsuleStatus =
  | 'planning'
  | 'preview_live'
  | 'production_live'
  | 'needs_attention'
  | 'takeover_ready'
  | 'migration_ready';
type OperatorRisk = 'low' | 'medium' | 'high';
type OperatorActionIntent =
  | 'deploy_preview'
  | 'publish_release'
  | 'diagnose_service'
  | 'repair_service'
  | 'rollback_release'
  | 'takeover_server'
  | 'migrate_server'
  | 'open_capsule';
type OperatorConnectorMode = 'password' | 'ssh-key' | 'agent';
type OperatorConnectorTrust = 'pending' | 'verified';
type OperatorStepStatus = 'completed' | 'planned' | 'attention' | 'in_progress';
type OperatorLogLevel = 'info' | 'success' | 'warning' | 'error';
type OperatorGenerationTaskStatus =
  | 'queued'
  | 'planning'
  | 'coding'
  | 'building_preview'
  | 'completed'
  | 'failed';
type OperatorGenerationSource = 'model' | 'template';
type OperatorJobKind =
  | 'plan_repo'
  | 'build_repo_preview'
  | 'plan_idea'
  | 'build_idea_preview'
  | 'scan_server'
  | 'deploy_preview'
  | 'publish_release'
  | 'diagnose_service'
  | 'repair_service'
  | 'takeover_server'
  | 'migrate_server';
type OperatorJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
type OperatorTruthState =
  | 'planning'
  | 'job_running'
  | 'preview_ready'
  | 'preview_failed'
  | 'audit_ready'
  | 'audit_failed'
  | 'needs_attention'
  | 'production_live';
type OperatorPreviewStatus = 'unavailable' | 'building' | 'verified' | 'failed';
type OperatorAuditStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface OperatorActionSummary {
  id: string;
  intent: OperatorActionIntent;
  label: string;
  description: string;
  risk: OperatorRisk;
  requiresConfirmation: boolean;
}

export interface OperatorPlanStep {
  id: string;
  title: string;
  status: OperatorStepStatus;
  detail: string;
}

export interface OperatorExecutionPlan {
  id: string;
  title: string;
  summary: string;
  risk: OperatorRisk;
  estimatedMinutes: number;
  estimatedMonthlyCost: string;
  assumptions: string[];
  confirmations: string[];
  steps: OperatorPlanStep[];
}

export interface OperatorGenerationTask {
  id: string;
  title: string;
  status: OperatorGenerationTaskStatus;
  progress: number;
  summary: string;
  detail: string;
  capsuleId: string | null;
  capsulePath: string | null;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  steps: OperatorPlanStep[];
}

export interface OperatorJobStep {
  id: string;
  title: string;
  status: OperatorStepStatus;
  detail: string;
  startedAt: string | null;
  completedAt: string | null;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
}

export interface OperatorJobSummary {
  id: string;
  kind: OperatorJobKind;
  title: string;
  status: OperatorJobStatus;
  progress: number;
  summary: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface OperatorJob extends OperatorJobSummary {
  capsuleId: string;
  detail: string;
  createdAt: string;
  steps: OperatorJobStep[];
}

export interface OperatorLogEntry {
  id: string;
  level: OperatorLogLevel;
  message: string;
  createdAt: string;
}

export interface OperatorLogsSummary {
  headline: string;
  entries: OperatorLogEntry[];
}

export interface OperatorInfraItem {
  label: string;
  value: string;
}

export interface OperatorInfraSummary {
  runtime: string;
  region: string;
  estimatedMonthlyCost: string;
  endpoint: string | null;
  productionEndpoint: string | null;
  items: OperatorInfraItem[];
}

export interface OperatorServerConnector {
  mode: OperatorConnectorMode;
  host: string;
  port: number;
  username: string;
  trust: OperatorConnectorTrust;
}

export interface OperatorCapsule {
  id: string;
  name: string;
  slug: string;
  entryKind: OperatorEntryKind;
  generationSource?: OperatorGenerationSource | null;
  status: OperatorCapsuleStatus;
  headline: string;
  summary: string;
  stackLabel: string;
  healthScore: number;
  previewUrl: string | null;
  productionUrl: string | null;
  source: {
    repoUrl: string | null;
    idea: string | null;
    serverHost: string | null;
  };
  connector: OperatorServerConnector | null;
  createdAt: string;
  updatedAt: string;
  recentEvents: OperatorLogEntry[];
  truthState?: OperatorTruthState;
  latestJob?: OperatorJobSummary | null;
}

export interface OperatorConfirmation {
  token: string;
  action: OperatorActionIntent;
  label: string;
  expiresAt: string;
}

export interface OperatorEnvelope {
  capsule: OperatorCapsule;
  plan: OperatorExecutionPlan;
  risk: OperatorRisk;
  requiredConfirmation: OperatorConfirmation | null;
  previewUrl: string | null;
  productionUrl: string | null;
  healthScore: number;
  infraSummary: OperatorInfraSummary;
  logsSummary: OperatorLogsSummary;
  generatedProject: OperatorGeneratedProject | null;
  truthState: OperatorTruthState;
  latestJob: OperatorJobSummary | null;
  jobs: OperatorJob[];
  artifactSummary: OperatorArtifactSummary;
  previewSummary: OperatorPreviewSummary;
  auditSummary: OperatorAuditSummary;
  diagnosticsSummary: OperatorDiagnosticsSummary;
  nextActions: OperatorActionSummary[];
}

export interface OperatorGeneratedProjectFile {
  path: string;
  purpose: string;
  bytes: number;
}

export interface OperatorGeneratedProject {
  capsuleId: string;
  archiveName: string;
  archiveUrl: string | null;
  manifestUrl: string | null;
  generatedAt: string;
  runtime: string;
  entryFile: string;
  runCommands: string[];
  files: OperatorGeneratedProjectFile[];
}

export interface OperatorArtifactSummary {
  sourceType: 'none' | 'generated' | 'repository' | 'server';
  sourceRef: string | null;
  archiveUrl: string | null;
  manifestUrl: string | null;
  entryFile: string | null;
  runCommands: string[];
  fileCount: number;
  installCommand: string | null;
  buildCommand: string | null;
}

export interface OperatorPreviewSummary {
  status: OperatorPreviewStatus;
  verified: boolean;
  previewUrl: string | null;
  entryFile: string | null;
  assetCount: number;
  verifiedAt: string | null;
  lastError: string | null;
}

export interface OperatorAuditSummary {
  status: OperatorAuditStatus;
  host: string | null;
  port: number | null;
  username: string | null;
  collectedAt: string | null;
  os: string | null;
  kernel: string | null;
  cpu: string | null;
  memory: string | null;
  disk: string | null;
  docker: string | null;
  compose: string | null;
  webServers: string[];
  openPorts: string[];
  domains: string[];
  processes: string[];
  risks: string[];
  lastError: string | null;
}

export interface OperatorDiagnosticsSummary {
  stage: string | null;
  headline: string;
  detail: string;
  command: string | null;
  lastError: string | null;
}

export interface AnalyzeProjectInput {
  projectName?: string | null;
  repoUrl?: string | null;
  sourceRef?: string | null;
  notes?: string | null;
}

export interface GenerateProjectInput {
  projectName?: string | null;
  idea: string;
  audience?: string | null;
  businessGoal?: string | null;
  strictModelGeneration?: boolean | null;
}

export interface BindDomainInput {
  capsuleId: string;
  hostname: string;
  provider?: string | null;
  zone?: string | null;
  recordType?: string | null;
  recordValue?: string | null;
  tlsStatus?: string | null;
  notes?: string | null;
}

export interface EnableMonitoringInput {
  capsuleId: string;
  monitorUrl?: string | null;
  provider?: string | null;
  healthcheckId?: string | null;
  channels?: string[];
  notes?: string | null;
}

export interface RecordMonitoringTransitionInput {
  capsuleId: string;
  status: 'healthy' | 'unhealthy';
  monitorUrl?: string | null;
  detail?: string | null;
  checkedAt?: string | null;
}

export interface ScanServerInput {
  label?: string | null;
  host: string;
  username: string;
  port?: number | null;
  authMode: OperatorConnectorMode;
  password?: string | null;
  sshKey?: string | null;
}

export interface CreatePlanInput {
  entryKind: OperatorEntryKind;
  title?: string | null;
  brief: string;
}

export interface OperatorEngine {
  createPlan(input: CreatePlanInput): OperatorEnvelope;
  analyzeProject(input: AnalyzeProjectInput): OperatorEnvelope;
  generateProject(input: GenerateProjectInput): Promise<OperatorEnvelope>;
  startGenerateProjectTask(input: GenerateProjectInput): OperatorGenerationTask;
  getGenerationTask(taskId: string): OperatorGenerationTask | null;
  scanServer(input: ScanServerInput): OperatorEnvelope;
  listCapsules(): OperatorCapsule[];
  listWorkspaces(): OperatorCapsule[];
  getCapsule(capsuleId: string): OperatorEnvelope | null;
  getJob(jobId: string): OperatorJob | null;
  createWorkspaceJob(input: { capsuleId: string; kind: OperatorJobKind }): OperatorJob | null;
  deleteCapsule(capsuleId: string): boolean;
  deleteLegacyTemplateCapsules(): number;
  getPreviewHtml(capsuleRef: string): string | null;
  getPreviewProxyTarget(capsuleRef: string): string | null;
  getPreviewAsset(capsuleRef: string, assetPath: string): { absolutePath: string; contentType: string } | null;
  getGeneratedProject(capsuleRef: string): OperatorGeneratedProject | null;
  getGeneratedProjectArchive(capsuleRef: string): { absolutePath: string; downloadName: string } | null;
  getWorkspaceArchive(capsuleRef: string): { absolutePath: string; downloadName: string } | null;
  clearHistory(): { deletedCapsules: number; deletedJobs: number; deletedTasks: number };
  deployPreview(capsuleId: string): OperatorEnvelope | null;
  publishRelease(capsuleId: string, confirmationToken?: string | null): OperatorEnvelope | null;
  bindDomain(input: BindDomainInput): OperatorEnvelope | null;
  enableMonitoring(input: EnableMonitoringInput): OperatorEnvelope | null;
  recordMonitoringTransition(input: RecordMonitoringTransitionInput): OperatorEnvelope | null;
  diagnoseService(capsuleId: string): OperatorEnvelope | null;
  repairService(capsuleId: string): OperatorEnvelope | null;
  rollbackRelease(capsuleId: string, confirmationToken?: string | null): OperatorEnvelope | null;
  takeoverServer(capsuleId: string, confirmationToken?: string | null): OperatorEnvelope | null;
  migrateServer(capsuleId: string, confirmationToken?: string | null): OperatorEnvelope | null;
}

interface CapsuleRecord {
  capsule: OperatorCapsule;
  plan: OperatorExecutionPlan;
  infraSummary: OperatorInfraSummary;
  logsSummary: OperatorLogsSummary;
  generatedProject?: OperatorGeneratedProject | null;
  generatedRecipe?: GeneratedProjectRecipe | null;
  artifactSummary: OperatorArtifactSummary;
  previewSummary: OperatorPreviewSummary;
  auditSummary: OperatorAuditSummary;
  diagnosticsSummary: OperatorDiagnosticsSummary;
}

interface PendingConfirmationRecord {
  token: string;
  capsuleId: string;
  action: OperatorActionIntent;
  expiresAt: number;
  label: string;
}

interface StackDescriptor {
  slug: string;
  label: string;
  runtime: string;
  runtimePort: number;
  build: string;
  install: string;
  defaultRegion: string;
  monthlyCost: string;
}

interface OperatorEngineOptions {
  previewDomainSuffix?: string;
  previewBaseUrl?: string | null;
  artifactBaseUrl?: string | null;
  productionDomainSuffix?: string;
  confirmationTtlMs?: number;
  stateFilePath?: string | null;
  generatedProjectsRoot?: string | null;
  previewBuildNodeModulesPath?: string | null;
  executionProviders?: OperatorLlmProviderConfig[] | null;
}

interface GeneratedProjectPreviewBuild {
  directory: {
    root: string;
    sourceRoot: string;
    archivePath: string;
  };
  buildRoot: string;
  indexPath: string;
  errorPath: string;
}

interface RepoBuildPlan {
  runtimeLabel: string;
  installCommand: string | null;
  buildCommand: string | null;
  runCommands: string[];
  entryFile: string;
  previewKind: 'static' | 'proxy';
  build(buildRoot: string): Promise<{
    install: { stdout: string; stderr: string; exitCode: number | null } | null;
    build: { stdout: string; stderr: string; exitCode: number | null } | null;
  }>;
  startPreviewRuntime?(record: CapsuleRecord): Promise<string>;
}

interface WorkspacePreviewRuntime {
  capsuleId: string;
  port: number;
  baseUrl: string;
  kind: 'next-standalone';
  child: ReturnType<typeof spawn>;
}

interface GeneratedProjectTemplateFile {
  path: string;
  purpose: string;
  content: string;
}

interface GeneratedProjectTemplate {
  entryFile: string;
  runCommands: string[];
  files: GeneratedProjectTemplateFile[];
}

interface OperatorStateFile {
  version: 3;
  records: CapsuleRecord[];
  generationTasks?: OperatorGenerationTask[];
  jobs?: OperatorJob[];
}

const defaultPreviewDomain = 'preview.sloth.run';
const defaultProductionDomain = 'sloth.run';

function nowIso() {
  return new Date().toISOString();
}

async function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackFactory: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackFactory()), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function trimText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function slugify(input: string, fallback: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);

  return normalized || fallback;
}

function inferStack(values: string[]): StackDescriptor {
  const text = values.join(' ').toLowerCase();

  if (text.includes('laravel') || text.includes('php')) {
    return {
      slug: 'laravel',
      label: 'Laravel',
      runtime: 'Managed PHP Runtime',
      runtimePort: 8080,
      build: 'composer install && php artisan optimize',
      install: 'container + php-fpm + nginx',
      defaultRegion: 'Tokyo',
      monthlyCost: '$18/mo',
    };
  }

  if (text.includes('next') || text.includes('react')) {
    return {
      slug: 'nextjs',
      label: 'Next.js',
      runtime: 'Managed Node Runtime',
      runtimePort: 3000,
      build: 'npm install && npm run build',
      install: 'container + managed edge ingress',
      defaultRegion: 'Singapore',
      monthlyCost: '$16/mo',
    };
  }

  if (text.includes('vue') || text.includes('nuxt')) {
    return {
      slug: 'nuxt',
      label: 'Nuxt / Vue',
      runtime: 'Managed Node Runtime',
      runtimePort: 3000,
      build: 'pnpm install && pnpm build',
      install: 'container + managed edge ingress',
      defaultRegion: 'Singapore',
      monthlyCost: '$15/mo',
    };
  }

  if (text.includes('python') || text.includes('django') || text.includes('flask') || text.includes('fastapi')) {
    return {
      slug: 'python',
      label: 'Python Web App',
      runtime: 'Managed Python Runtime',
      runtimePort: 8000,
      build: 'pip install -r requirements.txt',
      install: 'container + gunicorn/uvicorn',
      defaultRegion: 'Los Angeles',
      monthlyCost: '$14/mo',
    };
  }

  if (text.includes('wordpress')) {
    return {
      slug: 'wordpress',
      label: 'WordPress',
      runtime: 'Managed PHP Runtime',
      runtimePort: 8080,
      build: 'docker pull wordpress + warmup',
      install: 'container + persistent storage',
      defaultRegion: 'Tokyo',
      monthlyCost: '$19/mo',
    };
  }

  if (text.includes('docker') || text.includes('compose')) {
    return {
      slug: 'docker',
      label: 'Docker App',
      runtime: 'Managed Container Runtime',
      runtimePort: 8080,
      build: 'docker build / compose render',
      install: 'container + managed ingress',
      defaultRegion: 'Singapore',
      monthlyCost: '$20/mo',
    };
  }

  if (text.includes('static') || text.includes('html') || text.includes('landing')) {
    return {
      slug: 'static',
      label: 'Static Site',
      runtime: 'Managed Static Runtime',
      runtimePort: 80,
      build: 'static artifact publish',
      install: 'edge hosting + managed TLS',
      defaultRegion: 'Global Edge',
      monthlyCost: '$6/mo',
    };
  }

  return {
    slug: 'webapp',
    label: 'Universal Web App',
    runtime: 'Managed App Runtime',
    runtimePort: 3000,
    build: 'auto-detect + buildpack fallback',
    install: 'container + managed ingress',
    defaultRegion: 'Singapore',
    monthlyCost: '$15/mo',
  };
}

function localizeStackLabel(stack: StackDescriptor, locale: 'zh-CN' | 'en') {
  if (locale !== 'zh-CN') {
    return stack.label;
  }

  switch (stack.slug) {
    case 'laravel':
      return 'Laravel 应用';
    case 'nextjs':
      return 'Next.js 应用';
    case 'nuxt':
      return 'Vue / Nuxt 应用';
    case 'python':
      return 'Python 网页应用';
    case 'wordpress':
      return 'WordPress 站点';
    case 'docker':
      return 'Docker 应用';
    case 'static':
      return '静态站点';
    default:
      return '通用网页应用';
  }
}

function localizeRuntimeLabel(runtime: string, locale: 'zh-CN' | 'en') {
  if (locale !== 'zh-CN') {
    return runtime;
  }

  switch (runtime) {
    case 'Managed PHP Runtime':
      return '托管 PHP 运行时';
    case 'Managed Node Runtime':
      return '托管 Node 运行时';
    case 'Managed Python Runtime':
      return '托管 Python 运行时';
    case 'Managed Container Runtime':
      return '托管容器运行时';
    case 'Managed Static Runtime':
      return '托管静态运行时';
    case 'Managed App Runtime':
      return '托管应用运行时';
    default:
      return runtime;
  }
}

function previewUrlFor(slug: string, suffix: string) {
  return `https://${slug}.${suffix}`;
}

function productionUrlFor(slug: string, suffix: string) {
  return `https://${slug}.${suffix}`;
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonPretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function packageNameFromSlug(slug: string) {
  return slug.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'sloth-app';
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function compactLaunchDisplayTitle(name: string, idea: string) {
  const raw = trimText(name) || trimText(idea) || 'AI Workspace Project';
  const singleLine = raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const firstSentence = singleLine.split(/[。！？!?;；]/)[0]?.trim() || singleLine;

  if (firstSentence.length <= 32) {
    return firstSentence;
  }

  if (/[\u3400-\u9fff]/.test(firstSentence)) {
    const keywordMatch = firstSentence.match(/[^，。！？!?]{2,24}(?:应用|网站|平台|系统|工具|游戏|小程序)/);
    let cleaned = (keywordMatch?.[0] ?? firstSentence)
      .replace(/^(帮我|请|麻烦你|我想|我要|希望|帮忙)/, '')
      .trim();
    for (let index = 0; index < 2; index += 1) {
      cleaned = cleaned
        .replace(/^(做|开发|生成|设计|搭建|构建|制作|创建|打造|生产)(一个|个)?/, '')
        .replace(/^(一个|个)/, '')
        .trim();
    }
    if (cleaned) {
      return cleaned.slice(0, 24);
    }
  }

  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, 6).join(' ').trim();
  return (words || firstSentence).slice(0, 32).trim();
}

function detectGenerateProjectLocale(input: GenerateProjectInput): 'zh-CN' | 'en' {
  const text = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.audience),
    trimText(input.businessGoal),
  ].join(' ');

  return /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en';
}

function materializedIdeaCopy(input: GenerateProjectInput, name: string, recipe?: GeneratedProjectRecipe | null) {
  const locale = recipe?.locale ?? (/[\u3400-\u9fff]/.test([name, input.idea, input.audience, input.businessGoal].join(' ')) ? 'zh-CN' : 'en');
  const zh = locale === 'zh-CN';
  const audience = trimText(recipe?.audience ?? input.audience) || (zh ? '普通用户' : 'general users');
  const goal = trimText(recipe?.goal ?? input.businessGoal) || (zh ? '低门槛快速上线并可持续运营' : 'turn the idea into a real launchable service');
  const idea = trimText(input.idea) || (zh ? '把一个想法先做成可用的在线体验。' : 'Launch a polished online experience.');
  const title = trimText(recipe?.title) || compactLaunchDisplayTitle(name, idea);
  const subtitle = trimText(recipe?.subtitle)
    || (zh ? `${idea} 为${audience}设计。` : `${idea} Designed for ${audience}.`);

  return {
    locale,
    kind: recipe?.kind ?? ('workflow-app' as GeneratedProjectKind),
    title,
    idea,
    audience,
    goal,
    subtitle,
    primaryActionLabel: trimText(recipe?.primaryActionLabel) || (zh ? '新增一条可体验流程' : 'Add one testable flow'),
    itemLabel: trimText(recipe?.itemLabel) || (zh ? '流程' : 'flow'),
    seedItems: recipe?.seedItems ?? [],
    journeyMoments: recipe?.journeyMoments ?? [],
    operatorChecklist: recipe?.operatorChecklist ?? [],
    helpfulPoints: recipe?.helpfulPoints ?? [],
    battle: recipe?.battle ?? null,
  };
}

function buildOperatorReadme(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  name: string,
  entryFile: string,
  runCommands: string[],
  recipe?: GeneratedProjectRecipe | null,
) {
  const copy = materializedIdeaCopy(input, name, recipe);
  const zh = copy.locale === 'zh-CN';
  return zh
    ? `# ${copy.title}

这个项目由树懒云 AI Operator 生成。

## 项目摘要

- 想法：${copy.idea}
- 面向用户：${copy.audience}
- 商业目标：${copy.goal}
- 建议技术栈：${stack.label}
- 运行时：${stack.runtime}
- 主入口：${entryFile}

## 本地运行

\`\`\`bash
${runCommands.join('\n')}
\`\`\`

## 说明

- 这一版优先保证“先可操作，再继续上线”。
- 你可以继续修改这个源码包，再决定是否托管上线。
- 同一个压缩包后续可以直接接入树懒云托管和迁移流程。
`
    : `# ${copy.title}

This project was materialized by Sloth Cloud AI Operator.

## Brief

- Idea: ${copy.idea}
- Audience: ${copy.audience}
- Business goal: ${copy.goal}
- Suggested stack: ${stack.label}
- Runtime: ${stack.runtime}
- Main entry: ${entryFile}

## Local run

\`\`\`bash
${runCommands.join('\n')}
\`\`\`

## Notes

- This first version is an interactive prototype optimized for preview-first launch.
- You can keep editing this scaffold before publishing production.
- The archive can be passed into Sloth Cloud managed hosting for deployment.
`;
}

function buildStaticProjectTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  slug: string,
  name: string,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name, recipe);
  const zh = copy.locale === 'zh-CN';
  const displayStackLabel = localizeStackLabel(stack, copy.locale);
  const displayRuntime = localizeRuntimeLabel(stack.runtime, copy.locale);
  const css = `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5fbf8;
  color: #11201b;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 45%, #f8f5ff 100%); }
main { width: min(100% - 32px, 1080px); margin: 0 auto; padding: 56px 0 72px; display: grid; gap: 24px; }
section { background: rgba(255, 255, 255, 0.86); border: 1px solid rgba(15, 78, 67, 0.12); border-radius: 20px; padding: 28px; box-shadow: 0 18px 48px rgba(16, 46, 38, 0.08); }
.hero { min-height: 380px; display: grid; align-content: center; gap: 18px; }
.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: 0.16em; font-size: 12px; font-weight: 800; color: #0b7d66; }
h1, h2, p { margin: 0; }
h1 { font-size: clamp(42px, 8vw, 82px); line-height: 0.95; }
h2 { font-size: clamp(24px, 4vw, 36px); }
p { color: #4b655d; line-height: 1.75; }
.chips, .grid { display: grid; gap: 12px; }
.chips { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.chip, .tile { border-radius: 16px; background: #f4faf7; padding: 16px; border: 1px solid rgba(15, 78, 67, 0.1); }
.chip strong, .tile strong { display: block; font-size: 18px; color: #12362d; }
.tile span { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #6d847d; margin-bottom: 8px; }
.grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
ul { margin: 0; padding-left: 18px; color: #4b655d; line-height: 1.75; }
@media (max-width: 720px) { main { width: min(100% - 18px, 1080px); padding: 24px 0 40px; } section { padding: 20px; } }`;
  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">${zh ? '树懒云 AI 启动' : 'Sloth Cloud Launch'}</p>
        <h1>${escapeHtml(copy.title)}</h1>
        <p>${escapeHtml(copy.subtitle)}</p>
        <div class="chips">
          <div class="chip"><strong>${escapeHtml(copy.audience)}</strong><span>${zh ? '面向用户' : 'Audience'}</span></div>
          <div class="chip"><strong>${escapeHtml(displayStackLabel)}</strong><span>${zh ? '运行方式' : 'Runtime'}</span></div>
          <div class="chip"><strong>${escapeHtml(copy.goal)}</strong><span>${zh ? '目标' : 'Goal'}</span></div>
        </div>
      </section>
      <section>
        <p class="eyebrow">${zh ? '这版会做什么' : 'What this launch does'}</p>
        <h2>${zh ? '把一个清晰想法先做成真实可打开的体验' : 'Turn one clear idea into a real public experience'}</h2>
        <p>${escapeHtml(copy.idea)}</p>
      </section>
      <section class="grid">
        <div class="tile"><span>${zh ? '执行路径' : 'Operator flow'}</span><strong>${zh ? '计划 -> 预览 -> 上线' : 'Plan -> Preview -> Publish'}</strong></div>
        <div class="tile"><span>${zh ? '业务闭环' : 'Business loop'}</span><strong>${zh ? '获客 -> 服务 -> 升级' : 'Acquisition -> Service -> Upgrade'}</strong></div>
        <div class="tile"><span>${zh ? '执行主体' : 'Managed by'}</span><strong>${zh ? '树懒云 AI Operator' : 'Sloth Cloud AI Operator'}</strong></div>
      </section>
      <section>
        <p class="eyebrow">${zh ? '为什么有用' : 'Why it is useful'}</p>
        <ul>
          ${(copy.helpfulPoints.length > 0 ? copy.helpfulPoints : (zh
            ? ['用户一眼能看懂价值。', '结构足够简单，方便继续迭代。', '后续可以直接接入预览、结算和运维。']
            : ['Customers can understand the value in one glance.', 'The scaffold is simple enough to iterate but structured enough to deploy.', 'It is ready to plug into preview, billing, and operator loops.']))
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('')}
        </ul>
      </section>
    </main>
  </body>
</html>`;

  return {
    entryFile: 'index.html',
    runCommands: [
      'python3 -m http.server 8080',
    ],
    files: [
      { path: 'index.html', purpose: 'Main marketing page', content: html },
      { path: 'styles.css', purpose: 'Page styling', content: css },
      {
        path: 'Dockerfile',
        purpose: 'Static container runtime',
        content: `FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'index.html', ['docker build -t ' + shellQuote(slug) + ' .', 'docker run -p 8080:80 ' + shellQuote(slug)], recipe),
      },
    ],
  };
}

function isSnakeGameIdea(input: GenerateProjectInput) {
  const signal = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.businessGoal),
  ].join(' ').toLowerCase();

  return signal.includes('贪吃蛇') || signal.includes('snake');
}

function isBattleGameIdea(input: GenerateProjectInput) {
  const signal = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.businessGoal),
  ].join(' ').toLowerCase();

  return [
    '打怪',
    '怪兽',
    'boss',
    'monster',
    'battle',
    'fighter',
    'combat',
    'rpg',
    'hero',
    'superhero',
    '射击',
    '闯关',
    '对战',
  ].some((keyword) => signal.includes(keyword));
}

function buildSnakeGameTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  slug: string,
  name: string,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name, recipe);
  const zh = copy.locale === 'zh-CN';
  const displayStackLabel = localizeStackLabel(stack, copy.locale);
  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="snake-shell">
      <section class="hero-card">
        <div class="hero-copy">
          <p class="eyebrow">${zh ? '可试玩 AI 预览' : 'Playable AI preview'}</p>
          <h1>${escapeHtml(copy.title)}</h1>
          <p>${escapeHtml(copy.idea)}</p>
        </div>
        <div class="status-row">
          <article>
            <span>${zh ? '面向用户' : 'Audience'}</span>
            <strong>${escapeHtml(copy.audience)}</strong>
          </article>
          <article>
            <span>${zh ? '目标' : 'Goal'}</span>
            <strong>${escapeHtml(copy.goal)}</strong>
          </article>
          <article>
            <span>${zh ? '预览能力' : 'Preview'}</span>
            <strong>${zh ? `${displayStackLabel} / ${'开始、暂停、重来'}` : 'Play, pause, restart'}</strong>
          </article>
        </div>
      </section>

      <section class="playground-card">
        <div class="scoreboard">
          <div class="score-tile">
            <span>${zh ? '得分' : 'Score'}</span>
            <strong id="score">0</strong>
          </div>
          <div class="score-tile">
            <span>${zh ? '最佳' : 'Best'}</span>
            <strong id="best">0</strong>
          </div>
          <div class="score-tile">
            <span>${zh ? '状态' : 'Status'}</span>
            <strong id="status">${zh ? '待开始' : 'Ready'}</strong>
          </div>
        </div>

        <div class="game-layout">
          <div class="canvas-card">
            <canvas id="board" width="420" height="420" aria-label="${zh ? '贪吃蛇游戏画布' : 'Snake game board'}"></canvas>
            <div class="overlay" id="overlay">
              <strong id="overlay-title">${zh ? '点击开始' : 'Press Start'}</strong>
              <p id="overlay-copy">${zh ? '使用方向键或屏幕按钮开始游戏。' : 'Use arrow keys or the on-screen controls to play.'}</p>
            </div>
          </div>

          <aside class="control-card">
            <div class="button-row">
              <button id="start-button" type="button">${zh ? '开始' : 'Start'}</button>
              <button id="pause-button" type="button">${zh ? '暂停' : 'Pause'}</button>
              <button id="restart-button" type="button">${zh ? '重开' : 'Restart'}</button>
            </div>

            <div class="pad">
              <button class="pad-button" data-direction="up" type="button">${zh ? '上' : 'Up'}</button>
              <div class="pad-row">
                <button class="pad-button" data-direction="left" type="button">${zh ? '左' : 'Left'}</button>
                <button class="pad-button" data-direction="down" type="button">${zh ? '下' : 'Down'}</button>
                <button class="pad-button" data-direction="right" type="button">${zh ? '右' : 'Right'}</button>
              </div>
            </div>

            <div class="rules-card">
              <p class="eyebrow">${zh ? '玩法说明' : 'How to play'}</p>
              <ul>
                <li>${zh ? '吃到发光食物就会变长。' : 'Collect the glowing food to grow your snake.'}</li>
                <li>${zh ? '不要撞墙，也不要咬到自己。' : 'Avoid walls and your own tail.'}</li>
                <li>${zh ? '随时暂停，再从当前这局继续。' : 'Pause anytime, then resume from the same run.'}</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <script>
      const board = document.getElementById('board');
      const context = board.getContext('2d');
      const scoreEl = document.getElementById('score');
      const bestEl = document.getElementById('best');
      const statusEl = document.getElementById('status');
      const overlay = document.getElementById('overlay');
      const overlayTitle = document.getElementById('overlay-title');
      const overlayCopy = document.getElementById('overlay-copy');
      const startButton = document.getElementById('start-button');
      const pauseButton = document.getElementById('pause-button');
      const restartButton = document.getElementById('restart-button');
      const controlButtons = Array.from(document.querySelectorAll('[data-direction]'));

      const storageKey = ${jsonPretty(`sloth-snake-best-${slug}`)};
      const gridSize = 21;
      const cellSize = board.width / gridSize;
      const tickMs = 120;
      const directionVectors = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const oppositeDirection = {
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left',
      };

      let snake = [];
      let food = { x: 0, y: 0 };
      let direction = 'right';
      let queuedDirection = 'right';
      let score = 0;
      let bestScore = Number.parseInt(window.localStorage.getItem(storageKey) || '0', 10) || 0;
      let running = false;
      let paused = false;
      let gameLoop = null;

      function randomCell() {
        return Math.floor(Math.random() * gridSize);
      }

      function placeFood() {
        do {
          food = { x: randomCell(), y: randomCell() };
        } while (snake.some((segment) => segment.x === food.x && segment.y === food.y));
      }

      function updateHud(statusText) {
        scoreEl.textContent = String(score);
        bestEl.textContent = String(bestScore);
        statusEl.textContent = statusText;
      }

      function showOverlay(title, copyText) {
        overlay.hidden = false;
        overlayTitle.textContent = title;
        overlayCopy.textContent = copyText;
      }

      function hideOverlay() {
        overlay.hidden = true;
      }

      function drawBoard() {
        context.clearRect(0, 0, board.width, board.height);
        context.fillStyle = '#091411';
        context.fillRect(0, 0, board.width, board.height);

        for (let index = 0; index < gridSize; index += 1) {
          context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          context.beginPath();
          context.moveTo(index * cellSize, 0);
          context.lineTo(index * cellSize, board.height);
          context.stroke();
          context.beginPath();
          context.moveTo(0, index * cellSize);
          context.lineTo(board.width, index * cellSize);
          context.stroke();
        }

        context.fillStyle = '#ffb347';
        context.beginPath();
        context.arc((food.x + 0.5) * cellSize, (food.y + 0.5) * cellSize, cellSize * 0.32, 0, Math.PI * 2);
        context.fill();

        snake.forEach((segment, index) => {
          const gradient = context.createLinearGradient(
            segment.x * cellSize,
            segment.y * cellSize,
            (segment.x + 1) * cellSize,
            (segment.y + 1) * cellSize
          );
          gradient.addColorStop(0, index === 0 ? '#7af6dd' : '#4adbb1');
          gradient.addColorStop(1, '#0d7c67');
          context.fillStyle = gradient;
          context.fillRect(segment.x * cellSize + 2, segment.y * cellSize + 2, cellSize - 4, cellSize - 4);
        });
      }

      function resetGameState() {
        snake = [
          { x: 4, y: 10 },
          { x: 3, y: 10 },
          { x: 2, y: 10 },
        ];
        direction = 'right';
        queuedDirection = 'right';
        score = 0;
        paused = false;
        placeFood();
        drawBoard();
        updateHud(${jsonPretty(zh ? '待开始' : 'Ready')});
        showOverlay(${jsonPretty(zh ? '点击开始' : 'Press Start')}, ${jsonPretty(zh ? '使用方向键或屏幕按钮开始游戏。' : 'Use arrow keys or the on-screen controls to play.')});
      }

      function endRun() {
        running = false;
        paused = false;
        if (gameLoop) {
          window.clearInterval(gameLoop);
          gameLoop = null;
        }
        if (score > bestScore) {
          bestScore = score;
          window.localStorage.setItem(storageKey, String(bestScore));
        }
        updateHud('Game over');
        showOverlay('Game Over', 'Press Restart to try another run.');
      }

      function step() {
        direction = queuedDirection;
        const vector = directionVectors[direction];
        const nextHead = {
          x: snake[0].x + vector.x,
          y: snake[0].y + vector.y,
        };

        const hitWall = nextHead.x < 0 || nextHead.x >= gridSize || nextHead.y < 0 || nextHead.y >= gridSize;
        const hitSelf = snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
        if (hitWall || hitSelf) {
          endRun();
          return;
        }

        snake.unshift(nextHead);
        const ateFood = nextHead.x === food.x && nextHead.y === food.y;
        if (ateFood) {
          score += 10;
          if (score > bestScore) {
            bestScore = score;
            window.localStorage.setItem(storageKey, String(bestScore));
          }
          placeFood();
        } else {
          snake.pop();
        }

        drawBoard();
        updateHud(paused ? 'Paused' : 'Running');
      }

      function setDirection(nextDirection) {
        if (!running || paused) {
          queuedDirection = nextDirection;
          return;
        }
        if (oppositeDirection[direction] === nextDirection) {
          return;
        }
        queuedDirection = nextDirection;
      }

      function startGame() {
        if (running && paused) {
          paused = false;
          hideOverlay();
          updateHud('Running');
          return;
        }
        if (running) {
          return;
        }
        running = true;
        paused = false;
        hideOverlay();
        updateHud('Running');
        if (gameLoop) {
          window.clearInterval(gameLoop);
        }
        gameLoop = window.setInterval(() => {
          if (!paused) {
            step();
          }
        }, tickMs);
      }

      function pauseGame() {
        if (!running) {
          return;
        }
        paused = !paused;
        if (paused) {
          updateHud('Paused');
          showOverlay('Paused', 'Press Start to resume the same run.');
        } else {
          hideOverlay();
          updateHud('Running');
        }
      }

      function restartGame() {
        if (gameLoop) {
          window.clearInterval(gameLoop);
          gameLoop = null;
        }
        running = false;
        paused = false;
        resetGameState();
      }

      startButton.addEventListener('click', startGame);
      pauseButton.addEventListener('click', pauseGame);
      restartButton.addEventListener('click', restartGame);
      controlButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setDirection(button.dataset.direction);
        });
      });

      window.addEventListener('keydown', (event) => {
        const mapping = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
          w: 'up',
          s: 'down',
          a: 'left',
          d: 'right',
        };
        const nextDirection = mapping[event.key];
        if (nextDirection) {
          event.preventDefault();
          setDirection(nextDirection);
          if (!running) {
            startGame();
          }
          return;
        }

        if (event.key === ' ') {
          event.preventDefault();
          if (!running) {
            startGame();
          } else {
            pauseGame();
          }
        }
      });

      resetGameState();
      drawBoard();
      updateHud('Ready');
    </script>
  </body>
</html>`;
  const css = `:root {
  color-scheme: light;
  font-family: "Avenir Next", "Trebuchet MS", sans-serif;
  --ink: #10231f;
  --muted: #5c726c;
  --line: rgba(16, 35, 31, 0.1);
  --surface: rgba(255, 255, 255, 0.86);
  --surface-strong: rgba(255, 255, 255, 0.94);
  --teal: #0d7c67;
  --teal-soft: #dff7f0;
  --amber-soft: #fff1da;
  background: #eef7f3;
  color: var(--ink);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(79, 219, 186, 0.24), transparent 28%),
    radial-gradient(circle at top right, rgba(243, 167, 66, 0.22), transparent 24%),
    linear-gradient(180deg, #eef7f3 0%, #eef6ff 48%, #f9f4e9 100%);
}

button { font: inherit; }

.snake-shell {
  width: min(100% - 18px, 1180px);
  margin: 0 auto;
  padding: 18px 0 36px;
  display: grid;
  gap: 16px;
}

.hero-card,
.playground-card,
.control-card,
.rules-card,
.score-tile,
.canvas-card {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 24px 70px rgba(16, 35, 31, 0.1);
  backdrop-filter: blur(18px);
}

.hero-card {
  border-radius: 28px;
  padding: 28px;
  display: grid;
  gap: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.72)), linear-gradient(145deg, rgba(122, 246, 221, 0.18), rgba(83, 166, 255, 0.16), rgba(243, 167, 66, 0.16));
}

.hero-copy { display: grid; gap: 14px; }
.eyebrow {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 800;
  color: var(--teal);
}

h1, p { margin: 0; }
h1 {
  font-size: clamp(42px, 8vw, 78px);
  line-height: 0.92;
  letter-spacing: -0.05em;
}

p, li { color: var(--muted); line-height: 1.7; }

.status-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.status-row article,
.score-tile {
  border-radius: 18px;
  padding: 16px;
  background: var(--surface-strong);
}

.status-row span,
.score-tile span {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #708781;
  margin-bottom: 8px;
}

.status-row strong,
.score-tile strong { font-size: 20px; }

.playground-card {
  border-radius: 30px;
  padding: 18px;
  display: grid;
  gap: 18px;
}

.scoreboard,
.game-layout { display: grid; gap: 14px; }
.scoreboard { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.game-layout { grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr); }

.canvas-card {
  position: relative;
  border-radius: 26px;
  padding: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(226, 247, 240, 0.88));
}

canvas {
  display: block;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  border-radius: 20px;
  background: #091411;
}

.overlay {
  position: absolute;
  inset: 16px;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 20px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(9, 20, 17, 0.18), rgba(9, 20, 17, 0.55));
  color: #ffffff;
}

.overlay[hidden] { display: none; }
.overlay strong {
  font-size: 30px;
  display: block;
  margin-bottom: 8px;
}
.overlay p { color: rgba(255, 255, 255, 0.88); }

.control-card,
.rules-card {
  border-radius: 24px;
  padding: 18px;
}

.control-card {
  display: grid;
  gap: 18px;
  align-content: start;
}

.button-row,
.pad-row {
  display: grid;
  gap: 10px;
}

.button-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.pad { display: grid; gap: 10px; }
.pad > .pad-button {
  justify-self: center;
  width: 120px;
}
.pad-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.pad-button,
.button-row button {
  border: 0;
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  color: var(--ink);
  font-weight: 800;
  background: linear-gradient(135deg, var(--teal-soft), #ffffff);
  box-shadow: inset 0 0 0 1px rgba(13, 124, 103, 0.08);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.button-row button:first-child {
  background: linear-gradient(135deg, var(--teal) 0%, #11a385 100%);
  color: #ffffff;
}

.button-row button:nth-child(2) {
  background: linear-gradient(135deg, var(--amber-soft), #ffffff);
}

.pad-button:hover,
.button-row button:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(13, 124, 103, 0.14);
}

.rules-card ul {
  margin: 12px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

@media (max-width: 960px) {
  .status-row,
  .scoreboard,
  .game-layout,
  .button-row {
    grid-template-columns: 1fr;
  }
}
`;

  return {
    entryFile: 'index.html',
    runCommands: [
      'python3 -m http.server 8080',
    ],
    files: [
      { path: 'index.html', purpose: 'Playable snake game preview', content: html },
      { path: 'styles.css', purpose: 'Game styling', content: css },
      {
        path: 'Dockerfile',
        purpose: 'Static container runtime',
        content: `FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'index.html', ['python3 -m http.server 8080'], recipe),
      },
    ],
  };
}

function buildBattleGameTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  slug: string,
  name: string,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name, recipe);
  const zh = copy.locale === 'zh-CN';
  const displayStackLabel = localizeStackLabel(stack, copy.locale);
  const battle = copy.battle ?? {
    heroName: zh ? '超人' : 'Hero',
    enemyName: zh ? '怪兽' : 'Monster',
    supportName: zh ? '能量核心' : 'Power core',
    intro: zh ? '用攻击、技能和治疗先打出一版能玩通的战斗页。' : 'Use attack, skill, and healing to create a truly playable battle page.',
    attackLabel: zh ? '普通攻击' : 'Attack',
    skillLabel: zh ? '放大招' : 'Skill',
    healLabel: zh ? '恢复体力' : 'Heal',
    victoryText: zh ? '你赢了，这一版玩法已经跑通。' : 'You win. The first playable combat loop works.',
    defeatText: zh ? '这局输了，重开继续调节节奏。' : 'You lost this round. Restart and keep tuning the pace.',
  };
  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="battle-shell">
      <section class="hero-card">
        <div>
          <p class="eyebrow">${zh ? '模型执行后的可玩战斗页' : 'Model-planned playable battle page'}</p>
          <h1>${escapeHtml(copy.title)}</h1>
          <p class="hero-copy">${escapeHtml(battle.intro)}</p>
          <div class="chip-row">
            <span class="chip">${zh ? '面向用户：' : 'Audience: '}${escapeHtml(copy.audience)}</span>
            <span class="chip">${zh ? '目标：' : 'Goal: '}${escapeHtml(copy.goal)}</span>
            <span class="chip">${zh ? '运行方式：' : 'Runtime: '}${escapeHtml(displayStackLabel)}</span>
          </div>
        </div>
        <aside class="side-note">
          <strong>${zh ? '这次不是海报' : 'This is not a poster'}</strong>
          <p>${zh ? '按钮、血量、战报和胜负都会实时变化，先把核心玩法跑通。' : 'Buttons, health bars, combat logs, and win/loss states all update live so the core loop is actually testable.'}</p>
        </aside>
      </section>

      <section class="arena-grid">
        <article class="fighter-card fighter-card--hero">
          <span>${escapeHtml(battle.heroName)}</span>
          <strong id="hero-hp">100</strong>
          <small>${zh ? battle.supportName + ' 已就绪' : battle.supportName + ' ready'}</small>
        </article>
        <article class="fighter-card fighter-card--enemy">
          <span>${escapeHtml(battle.enemyName)}</span>
          <strong id="enemy-hp">100</strong>
          <small>${zh ? '等待你的第一击' : 'Waiting for your first hit'}</small>
        </article>
      </section>

      <section class="control-panel">
        <div class="button-row">
          <button id="attack-button" type="button">${escapeHtml(battle.attackLabel)}</button>
          <button id="skill-button" type="button">${escapeHtml(battle.skillLabel)}</button>
          <button id="heal-button" type="button">${escapeHtml(battle.healLabel)}</button>
          <button id="restart-button" type="button">${zh ? '重新开战' : 'Restart'}</button>
        </div>
        <div class="status-grid">
          <article>
            <span>${zh ? '当前状态' : 'Status'}</span>
            <strong id="battle-status">${zh ? '待开始' : 'Ready'}</strong>
          </article>
          <article>
            <span>${zh ? '已完成回合' : 'Rounds'}</span>
            <strong id="battle-round">0</strong>
          </article>
          <article>
            <span>${zh ? '最近结果' : 'Last result'}</span>
            <strong id="battle-result">${zh ? '尚未开战' : 'Not started'}</strong>
          </article>
        </div>
        <div class="log-card">
          <p class="eyebrow">${zh ? '战斗战报' : 'Combat log'}</p>
          <ul id="battle-log"></ul>
        </div>
      </section>
    </main>

    <script>
      const heroHpEl = document.getElementById('hero-hp');
      const enemyHpEl = document.getElementById('enemy-hp');
      const statusEl = document.getElementById('battle-status');
      const roundEl = document.getElementById('battle-round');
      const resultEl = document.getElementById('battle-result');
      const logEl = document.getElementById('battle-log');
      const attackButton = document.getElementById('attack-button');
      const skillButton = document.getElementById('skill-button');
      const healButton = document.getElementById('heal-button');
      const restartButton = document.getElementById('restart-button');

      const heroName = ${jsonPretty(battle.heroName)};
      const enemyName = ${jsonPretty(battle.enemyName)};
      const victoryText = ${jsonPretty(battle.victoryText)};
      const defeatText = ${jsonPretty(battle.defeatText)};
      const zh = ${jsonPretty(zh)};

      let heroHp = 100;
      let enemyHp = 100;
      let round = 0;
      let finished = false;

      function appendLog(message) {
        const item = document.createElement('li');
        item.textContent = message;
        logEl.prepend(item);
        while (logEl.children.length > 6) {
          logEl.removeChild(logEl.lastChild);
        }
      }

      function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      function updateHud() {
        heroHpEl.textContent = String(Math.max(heroHp, 0));
        enemyHpEl.textContent = String(Math.max(enemyHp, 0));
        roundEl.textContent = String(round);
      }

      function setResult(status, result) {
        statusEl.textContent = status;
        resultEl.textContent = result;
      }

      function enemyCounter() {
        if (finished || enemyHp <= 0) {
          return;
        }
        const damage = randomBetween(8, 16);
        heroHp -= damage;
        appendLog((zh ? enemyName + ' 反击造成 ' + damage + ' 点伤害。' : enemyName + ' countered for ' + damage + ' damage.'));
      }

      function settleBattle() {
        if (enemyHp <= 0) {
          finished = true;
          setResult(zh ? '胜利' : 'Victory', victoryText);
          appendLog(victoryText);
          return true;
        }
        if (heroHp <= 0) {
          finished = true;
          setResult(zh ? '失败' : 'Defeat', defeatText);
          appendLog(defeatText);
          return true;
        }
        return false;
      }

      function doTurn(action) {
        if (finished) {
          return;
        }
        round += 1;
        setResult(zh ? '战斗中' : 'In battle', zh ? '本回合已执行动作。' : 'Action executed for this round.');

        if (action === 'attack') {
          const damage = randomBetween(10, 18);
          enemyHp -= damage;
          appendLog((zh ? heroName + ' 使用普通攻击，造成 ' + damage + ' 点伤害。' : heroName + ' attacked for ' + damage + ' damage.'));
        } else if (action === 'skill') {
          const damage = randomBetween(18, 30);
          enemyHp -= damage;
          appendLog((zh ? heroName + ' 放出大招，造成 ' + damage + ' 点爆发伤害。' : heroName + ' used a skill for ' + damage + ' burst damage.'));
        } else if (action === 'heal') {
          const heal = randomBetween(12, 22);
          heroHp = Math.min(100, heroHp + heal);
          appendLog((zh ? heroName + ' 恢复了 ' + heal + ' 点体力。' : heroName + ' recovered ' + heal + ' HP.'));
        }

        updateHud();
        if (settleBattle()) {
          return;
        }

        enemyCounter();
        updateHud();
        settleBattle();
      }

      function resetBattle() {
        heroHp = 100;
        enemyHp = 100;
        round = 0;
        finished = false;
        logEl.innerHTML = '';
        updateHud();
        setResult(zh ? '待开始' : 'Ready', zh ? '点击任意技能开始第一回合。' : 'Click any action to begin the first round.');
        appendLog(zh ? '战斗已重置，准备开打。' : 'Battle reset and ready to begin.');
      }

      attackButton.addEventListener('click', () => doTurn('attack'));
      skillButton.addEventListener('click', () => doTurn('skill'));
      healButton.addEventListener('click', () => doTurn('heal'));
      restartButton.addEventListener('click', resetBattle);
      resetBattle();
    </script>
  </body>
</html>`;
  const css = `:root {
  color-scheme: light;
  --ink: #14241d;
  --muted: #4f665e;
  --line: rgba(20, 36, 29, 0.12);
  --surface: rgba(255, 255, 255, 0.9);
  --surface-soft: rgba(244, 250, 247, 0.96);
  --teal: #0d7c67;
  --teal-deep: #094b3d;
  --amber: #f0a33d;
  font-family: "SF Pro Rounded", "Avenir Next", "Trebuchet MS", sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(122, 246, 221, 0.26), transparent 28%),
    radial-gradient(circle at top right, rgba(240, 163, 61, 0.2), transparent 26%),
    linear-gradient(180deg, #edf8f4 0%, #eef6ff 48%, #fbf6ef 100%);
  color: var(--ink);
}

.battle-shell {
  width: min(100% - 24px, 1180px);
  margin: 0 auto;
  padding: 26px 0 40px;
  display: grid;
  gap: 18px;
}

.hero-card,
.fighter-card,
.control-panel,
.log-card,
.status-grid article,
.side-note {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 24px 70px rgba(20, 36, 29, 0.08);
}

.hero-card {
  border-radius: 28px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1.3fr 0.8fr;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 800;
  color: var(--teal);
}

h1, p { margin: 0; }
h1 { font-size: clamp(38px, 7vw, 72px); line-height: 0.92; }
.hero-copy { margin-top: 12px; line-height: 1.72; color: var(--muted); }
.chip-row {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(13, 124, 103, 0.16);
  color: var(--teal-deep);
  font-weight: 700;
}
.side-note {
  border-radius: 22px;
  padding: 18px;
  background: linear-gradient(180deg, rgba(223, 247, 240, 0.92), rgba(255, 255, 255, 0.92));
}
.side-note strong {
  display: block;
  margin-bottom: 10px;
  font-size: 20px;
}
.side-note p { color: var(--muted); line-height: 1.72; }

.arena-grid,
.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.fighter-card,
.control-panel,
.status-grid article,
.log-card {
  border-radius: 24px;
  padding: 20px;
}

.fighter-card {
  display: grid;
  gap: 10px;
  background: var(--surface-soft);
}
.fighter-card span {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #5f7a72;
}
.fighter-card strong { font-size: clamp(40px, 6vw, 62px); }
.fighter-card small { color: var(--muted); font-size: 15px; }
.fighter-card--hero strong { color: var(--teal); }
.fighter-card--enemy strong { color: #cb5f2d; }

.control-panel {
  display: grid;
  gap: 16px;
}
.button-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.button-row button {
  border: 0;
  border-radius: 16px;
  padding: 14px 16px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  color: var(--ink);
  background: linear-gradient(135deg, rgba(223, 247, 240, 0.98), #ffffff);
  box-shadow: inset 0 0 0 1px rgba(13, 124, 103, 0.08);
}
.button-row button:first-child {
  background: linear-gradient(135deg, var(--teal) 0%, #11a385 100%);
  color: #ffffff;
}
.button-row button:nth-child(2) {
  background: linear-gradient(135deg, #fff1d8 0%, #ffffff 100%);
}
.status-grid article span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #708781;
}
.status-grid article strong { font-size: 22px; }
.log-card ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
  color: var(--muted);
}

@media (max-width: 960px) {
  .hero-card,
  .arena-grid,
  .status-grid,
  .button-row {
    grid-template-columns: 1fr;
  }
}
`;

  return {
    entryFile: 'index.html',
    runCommands: ['python3 -m http.server 8080'],
    files: [
      { path: 'index.html', purpose: 'Playable battle game preview', content: html },
      { path: 'styles.css', purpose: 'Battle game styling', content: css },
      {
        path: 'Dockerfile',
        purpose: 'Static container runtime',
        content: `FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'index.html', ['python3 -m http.server 8080'], recipe),
      },
    ],
  };
}

function buildReactProjectTemplate(input: GenerateProjectInput, stack: StackDescriptor, slug: string, name: string): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name);
  const packageJson = jsonPretty({
    name: packageNameFromSlug(slug),
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 3000',
      build: 'tsc -p tsconfig.json --noEmit && vite build',
      preview: 'vite preview --host 0.0.0.0 --port 4173',
    },
    dependencies: {
      react: '^19.1.0',
      'react-dom': '^19.1.0',
    },
    devDependencies: {
      '@types/react': '^19.1.8',
      '@types/react-dom': '^19.1.6',
      '@vitejs/plugin-react-swc': '^3.10.2',
      typescript: '^5.8.3',
      vite: '^7.1.5',
    },
  });
  const appTsx = `import { useEffect, useState, type FormEvent } from 'react';

import './styles.css';

type ViewMode = 'playground' | 'journey' | 'ops';
type WorkStage = 'backlog' | 'building' | 'ready';

type WorkItem = {
  id: string;
  title: string;
  detail: string;
  stage: WorkStage;
};

const storageKey = ${jsonPretty(`sloth-launch-${slug}-workspace-v1`)};
const stageOrder: WorkStage[] = ['backlog', 'building', 'ready'];
const stageLabels: Record<WorkStage, string> = {
  backlog: 'Backlog',
  building: 'Building',
  ready: 'Ready to try',
};
const tabs: Array<{ id: ViewMode; label: string; hint: string }> = [
  { id: 'playground', label: 'Prototype board', hint: 'Edit flows and move them forward' },
  { id: 'journey', label: 'Customer journey', hint: 'Preview how the first experience feels' },
  { id: 'ops', label: 'Launch ops', hint: 'See runtime, commands, and publish path' },
];
const seedItems: WorkItem[] = [
  {
    id: 'seed-1',
    title: 'First user flow',
    detail: ${jsonPretty(`Help ${copy.audience} reach the main outcome in less than two minutes.`)},
    stage: 'ready',
  },
  {
    id: 'seed-2',
    title: 'Core conversion point',
    detail: ${jsonPretty(copy.goal)},
    stage: 'building',
  },
  {
    id: 'seed-3',
    title: 'Admin or operator control',
    detail: 'Keep one clear place for logs, rollback, and launch decisions.',
    stage: 'backlog',
  },
];
const journeyMoments = [
  'User opens the product and immediately understands what to do next.',
  'The first key action can be completed with almost no setup.',
  'Operator state stays visible so the app can move from preview to production cleanly.',
];
const opsChecklist = [
  'Preview is running from the same workspace that will be promoted later.',
  'Source bundle is editable, downloadable, and ready for managed hosting.',
  'Checkout should promote this build instead of regenerating a second app.',
];

function sanitizeItems(value: unknown): WorkItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }

      const record = entry as Partial<WorkItem>;
      if (
        typeof record.id !== 'string'
        || typeof record.title !== 'string'
        || typeof record.detail !== 'string'
        || !stageOrder.includes(record.stage as WorkStage)
      ) {
        return null;
      }

      return {
        id: record.id,
        title: record.title,
        detail: record.detail,
        stage: record.stage as WorkStage,
      };
    })
    .filter((entry): entry is WorkItem => entry !== null);

  return items.length > 0 ? items : null;
}

function readStoredItems() {
  if (typeof window === 'undefined') {
    return seedItems;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return seedItems;
    }

    return sanitizeItems(JSON.parse(raw)) ?? seedItems;
  } catch {
    return seedItems;
  }
}

function shiftStage(stage: WorkStage, direction: -1 | 1) {
  const currentIndex = stageOrder.indexOf(stage);
  const nextIndex = Math.min(stageOrder.length - 1, Math.max(0, currentIndex + direction));
  return stageOrder[nextIndex];
}

export default function App() {
  const [view, setView] = useState<ViewMode>('playground');
  const [items, setItems] = useState<WorkItem[]>(readStoredItems);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDetail, setDraftDetail] = useState(${jsonPretty(`Add one more useful flow for ${copy.audience}.`)});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    }
  }, [items]);

  const readyItems = items.filter((item) => item.stage === 'ready');
  const stageStats = stageOrder.map((stage) => ({
    stage,
    count: items.filter((item) => item.stage === stage).length,
  }));

  function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draftTitle.trim();
    const detail = draftDetail.trim();
    if (!title || !detail) {
      return;
    }

    setItems((current) => [
      {
        id: 'flow-' + Date.now() + '-' + current.length,
        title,
        detail,
        stage: 'backlog',
      },
      ...current,
    ]);
    setDraftTitle('');
    setDraftDetail(${jsonPretty(`Add one more useful flow for ${copy.audience}.`)});
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? { ...item, stage: shiftStage(item.stage, direction) }
        : item
    )));
  }

  function resetWorkspace() {
    setItems(seedItems);
    setDraftTitle('');
    setDraftDetail(${jsonPretty(`Add one more useful flow for ${copy.audience}.`)});
  }

  return (
    <main className="prototype-shell">
      <section className="prototype-hero">
        <div className="hero-copy">
          <p className="eyebrow">Sloth Cloud interactive launch</p>
          <h1>{${jsonPretty(copy.title)}}</h1>
          <p className="hero-copy__body">{${jsonPretty(copy.subtitle)}}</p>
          <div className="hero-chip-row">
            <span className="hero-chip">Audience: {${jsonPretty(copy.audience)}}</span>
            <span className="hero-chip">Goal: {${jsonPretty(copy.goal)}}</span>
            <span className="hero-chip">Runtime: {${jsonPretty(stack.label)}}</span>
          </div>
        </div>

        <aside className="hero-status">
          <span className="eyebrow">Capsule status</span>
          <strong>Interactive first version ready</strong>
          <p>
            This is not a poster. It is a small working prototype workspace that can be iterated,
            previewed, and promoted into managed hosting.
          </p>
          <div className="hero-status__grid">
            {stageStats.map((entry) => (
              <article key={entry.stage}>
                <span>{stageLabels[entry.stage]}</span>
                <strong>{entry.count}</strong>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="workspace-frame">
        <aside className="workspace-sidebar">
          <article className="sidebar-card">
            <span className="sidebar-label">Core idea</span>
            <strong>{${jsonPretty(copy.idea)}}</strong>
            <p>
              The first pass should help {${jsonPretty(copy.audience)}} reach a visible result quickly,
              then keep the launch path simple enough to promote later.
            </p>
          </article>

          <article className="sidebar-card">
            <span className="sidebar-label">What makes this useful</span>
            <ul className="bullet-list">
              <li>There is editable state, not just static copy.</li>
              <li>The same workspace can be reviewed by customers and operators.</li>
              <li>Prototype progress survives refresh through local browser storage.</li>
            </ul>
          </article>

          <article className="sidebar-card">
            <span className="sidebar-label">Quick switches</span>
            <div className="sidebar-actions">
              {tabs.map((tab) => (
                <button
                  className={view === tab.id ? 'sidebar-button active' : 'sidebar-button'}
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  type="button"
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.hint}</span>
                </button>
              ))}
            </div>
          </article>
        </aside>

        <div className="workspace-main">
          <div className="tab-row">
            {tabs.map((tab) => (
              <button
                className={view === tab.id ? 'tab-button active' : 'tab-button'}
                key={tab.id}
                onClick={() => setView(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === 'playground' ? (
            <section className="canvas-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Prototype board</p>
                  <h2>Turn the brief into working user flows</h2>
                </div>
                <button className="ghost-button" onClick={resetWorkspace} type="button">
                  Reset sample data
                </button>
              </div>

              <form className="composer" onSubmit={handleAddItem}>
                <label>
                  <span>New flow title</span>
                  <input
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Example: Quick booking form"
                    type="text"
                    value={draftTitle}
                  />
                </label>
                <label>
                  <span>What should it do?</span>
                  <textarea
                    onChange={(event) => setDraftDetail(event.target.value)}
                    placeholder="Describe the first useful interaction"
                    rows={3}
                    value={draftDetail}
                  />
                </label>
                <button className="primary-button" type="submit">Add to backlog</button>
              </form>

              <div className="board-grid">
                {stageOrder.map((stage) => {
                  const stageItems = items.filter((item) => item.stage === stage);

                  return (
                    <article className="stage-column" key={stage}>
                      <header className="stage-column__head">
                        <div>
                          <span>{stageLabels[stage]}</span>
                          <strong>{stageItems.length}</strong>
                        </div>
                        <small>{stage === 'ready' ? 'Feels usable now' : stage === 'building' ? 'Needs shaping' : 'Needs definition'}</small>
                      </header>

                      <div className="stage-column__list">
                        {stageItems.length === 0 ? (
                          <div className="empty-slot">Nothing here yet.</div>
                        ) : stageItems.map((item) => (
                          <article className="work-card" key={item.id}>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            <div className="work-card__actions">
                              <button
                                disabled={stage === 'backlog'}
                                onClick={() => moveItem(item.id, -1)}
                                type="button"
                              >
                                Back
                              </button>
                              <button
                                disabled={stage === 'ready'}
                                onClick={() => moveItem(item.id, 1)}
                                type="button"
                              >
                                Forward
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {view === 'journey' ? (
            <section className="canvas-card customer-grid">
              <article className="customer-card customer-card--highlight">
                <p className="eyebrow">Customer journey</p>
                <h2>What the first usable version should feel like</h2>
                <p>
                  The preview should help real users understand the offer, try the main action,
                  and see enough signal to decide whether this deserves a full launch.
                </p>
                <div className="journey-list">
                  {journeyMoments.map((moment) => (
                    <article className="journey-step" key={moment}>
                      <span>Moment</span>
                      <strong>{moment}</strong>
                    </article>
                  ))}
                </div>
              </article>

              <article className="customer-card">
                <p className="eyebrow">Ready flows</p>
                <h2>Tryable parts of the prototype</h2>
                <div className="ready-list">
                  {readyItems.length === 0 ? (
                    <div className="empty-slot">Move items to "Ready to try" to simulate a customer-facing first release.</div>
                  ) : readyItems.map((item) => (
                    <article className="ready-item" key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {view === 'ops' ? (
            <section className="canvas-card ops-grid">
              <article className="ops-card">
                <p className="eyebrow">Runtime</p>
                <h2>{${jsonPretty(stack.label)}}</h2>
                <p>Suggested runtime: {${jsonPretty(stack.runtime)}}.</p>
                <div className="command-list">
                  {${jsonPretty(['npm install', 'npm run dev'])}.map((command) => (
                    <code key={command}>{command}</code>
                  ))}
                </div>
              </article>

              <article className="ops-card">
                <p className="eyebrow">Launch path</p>
                <h2>Preview / Checkout / Service</h2>
                <ul className="bullet-list">
                  {opsChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}`;
  const styles = `:root {
  color-scheme: light;
  --ink: #112521;
  --muted: #4a665e;
  --surface: rgba(255, 255, 255, 0.82);
  --surface-strong: rgba(255, 255, 255, 0.92);
  --line: rgba(17, 37, 33, 0.1);
  --teal: #0d7c67;
  --teal-deep: #0b5d4f;
  --teal-soft: #dff7f0;
  --amber: #f2a43c;
  --amber-soft: #fff4de;
  --sky-soft: #e7f4ff;
  font-family: "SF Pro Rounded", "Avenir Next", "Trebuchet MS", sans-serif;
  background: #eef7f3;
  color: var(--ink);
}

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(79, 219, 186, 0.28), transparent 28%),
    radial-gradient(circle at top right, rgba(242, 164, 60, 0.22), transparent 26%),
    linear-gradient(180deg, #eef7f3 0%, #eef6ff 46%, #f9f6ef 100%);
}

button, input, textarea {
  font: inherit;
}

.prototype-shell {
  width: min(100% - 24px, 1240px);
  margin: 0 auto;
  padding: 24px 0 40px;
  display: grid;
  gap: 18px;
}

.prototype-hero,
.workspace-frame,
.canvas-card,
.sidebar-card,
.customer-card,
.ops-card {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 24px 70px rgba(17, 37, 33, 0.09);
  backdrop-filter: blur(18px);
}

.prototype-hero {
  border-radius: 28px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1.3fr 0.9fr;
  gap: 18px;
  background:
    linear-gradient(140deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.72)),
    linear-gradient(135deg, rgba(79, 219, 186, 0.16), rgba(83, 166, 255, 0.12), rgba(242, 164, 60, 0.16));
}

.hero-copy {
  display: grid;
  gap: 16px;
  align-content: center;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 12px;
  font-weight: 800;
  color: var(--teal);
}

h1, h2, p {
  margin: 0;
}

h1 {
  font-size: clamp(40px, 7vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.05em;
}

h2 {
  font-size: clamp(24px, 4vw, 36px);
  line-height: 1;
}

.hero-copy__body,
p {
  color: var(--muted);
  line-height: 1.7;
}

.hero-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip {
  border-radius: 999px;
  border: 1px solid rgba(13, 124, 103, 0.16);
  background: rgba(255, 255, 255, 0.82);
  color: var(--teal-deep);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
}

.hero-status {
  border-radius: 22px;
  padding: 22px;
  background: linear-gradient(180deg, rgba(13, 124, 103, 0.08), rgba(255, 255, 255, 0.78));
  display: grid;
  gap: 12px;
  align-content: start;
}

.hero-status strong {
  font-size: 28px;
  line-height: 1.02;
}

.hero-status__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-status__grid article {
  border-radius: 16px;
  background: var(--surface-strong);
  border: 1px solid rgba(13, 124, 103, 0.12);
  padding: 14px;
  display: grid;
  gap: 6px;
}

.hero-status__grid span,
.sidebar-label,
.stage-column__head span,
.journey-step span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #708781;
}

.hero-status__grid strong {
  font-size: 24px;
}

.workspace-frame {
  border-radius: 30px;
  padding: 18px;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
}

.workspace-sidebar {
  display: grid;
  gap: 14px;
}

.sidebar-card,
.canvas-card,
.customer-card,
.ops-card {
  border-radius: 22px;
  padding: 18px;
}

.sidebar-card strong {
  font-size: 20px;
  line-height: 1.2;
}

.sidebar-actions {
  display: grid;
  gap: 10px;
}

.sidebar-button,
.tab-button,
.ghost-button,
.primary-button,
.work-card__actions button {
  border: 0;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.sidebar-button {
  padding: 14px;
  border-radius: 18px;
  text-align: left;
  background: var(--surface-strong);
  border: 1px solid rgba(17, 37, 33, 0.08);
  display: grid;
  gap: 4px;
}

.sidebar-button strong {
  font-size: 16px;
}

.sidebar-button span {
  font-size: 13px;
  color: var(--muted);
}

.sidebar-button.active {
  background: linear-gradient(135deg, rgba(13, 124, 103, 0.12), rgba(255, 255, 255, 0.94));
  box-shadow: inset 0 0 0 1px rgba(13, 124, 103, 0.12);
}

.workspace-main {
  display: grid;
  gap: 12px;
}

.tab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tab-button {
  padding: 12px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--teal-deep);
  font-weight: 800;
}

.tab-button.active,
.primary-button {
  background: linear-gradient(135deg, var(--teal) 0%, #11a385 100%);
  color: #fff;
  box-shadow: 0 18px 38px rgba(13, 124, 103, 0.2);
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: start;
  margin-bottom: 16px;
}

.ghost-button {
  padding: 11px 14px;
  border-radius: 999px;
  background: var(--amber-soft);
  color: #86540d;
  font-weight: 800;
}

.composer {
  display: grid;
  grid-template-columns: 1fr 1.2fr auto;
  gap: 12px;
  margin-bottom: 18px;
  align-items: end;
}

.composer label {
  display: grid;
  gap: 8px;
}

.composer span {
  font-size: 13px;
  font-weight: 700;
  color: var(--teal-deep);
}

.composer input,
.composer textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(17, 37, 33, 0.12);
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  padding: 14px 15px;
  resize: vertical;
}

.primary-button {
  padding: 14px 18px;
  border-radius: 16px;
  font-weight: 800;
  min-height: 52px;
}

.board-grid,
.customer-grid,
.ops-grid {
  display: grid;
  gap: 14px;
}

.board-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stage-column {
  border-radius: 20px;
  padding: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(244, 250, 247, 0.92));
  border: 1px solid rgba(17, 37, 33, 0.08);
  display: grid;
  gap: 12px;
}

.stage-column__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: start;
}

.stage-column__head strong {
  display: block;
  margin-top: 4px;
  font-size: 24px;
}

.stage-column__head small {
  max-width: 120px;
  text-align: right;
  color: #81948f;
}

.stage-column__list {
  display: grid;
  gap: 10px;
}

.work-card,
.journey-step,
.ready-item {
  border-radius: 18px;
  padding: 14px;
  background: var(--surface-strong);
  border: 1px solid rgba(17, 37, 33, 0.08);
}

.work-card {
  display: grid;
  gap: 8px;
}

.work-card strong,
.ready-item strong,
.journey-step strong {
  font-size: 17px;
  line-height: 1.2;
}

.work-card__actions {
  display: flex;
  gap: 8px;
}

.work-card__actions button {
  padding: 9px 11px;
  border-radius: 12px;
  background: var(--sky-soft);
  color: #17435d;
  font-weight: 700;
}

.work-card__actions button:disabled {
  cursor: default;
  opacity: 0.45;
}

.empty-slot {
  border-radius: 16px;
  border: 1px dashed rgba(17, 37, 33, 0.14);
  background: rgba(255, 255, 255, 0.5);
  color: #81948f;
  padding: 16px;
}

.customer-grid {
  grid-template-columns: 1.1fr 0.9fr;
}

.customer-card--highlight {
  background:
    linear-gradient(180deg, rgba(13, 124, 103, 0.06), rgba(255, 255, 255, 0.88)),
    rgba(255, 255, 255, 0.82);
}

.journey-list,
.ready-list,
.command-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.ops-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.command-list code {
  display: block;
  border-radius: 14px;
  background: #102924;
  color: #e8fff6;
  padding: 12px 14px;
  overflow-x: auto;
}

.bullet-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
  color: var(--muted);
}

.sidebar-button:hover,
.tab-button:hover,
.ghost-button:hover,
.primary-button:hover,
.work-card__actions button:hover {
  transform: translateY(-1px);
}

@media (max-width: 1100px) {
  .prototype-hero,
  .workspace-frame,
  .customer-grid,
  .ops-grid,
  .board-grid,
  .composer {
    grid-template-columns: 1fr;
  }

  .hero-status__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .prototype-shell {
    width: min(100% - 14px, 1240px);
    padding: 14px 0 22px;
  }

  .prototype-hero,
  .workspace-frame,
  .sidebar-card,
  .canvas-card,
  .customer-card,
  .ops-card {
    border-radius: 20px;
    padding: 16px;
  }

  .hero-status__grid {
    grid-template-columns: 1fr;
  }

  .tab-row {
    display: grid;
    grid-template-columns: 1fr;
  }
}`;

  return {
    entryFile: 'src/App.tsx',
    runCommands: [
      'npm install',
      'npm run dev',
    ],
    files: [
      { path: 'package.json', purpose: 'Frontend dependencies', content: packageJson },
      {
        path: 'tsconfig.json',
        purpose: 'TypeScript config',
        content: jsonPretty({
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['DOM', 'DOM.Iterable', 'ES2020'],
            allowJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
          },
          include: ['src'],
        }),
      },
      {
        path: 'vite.config.ts',
        purpose: 'Vite config',
        content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
});`,
      },
      {
        path: 'index.html',
        purpose: 'HTML entry',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(copy.title)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: 'src/main.tsx',
        purpose: 'React bootstrap',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`,
      },
      { path: 'src/App.tsx', purpose: 'Main application view', content: appTsx },
      { path: 'src/styles.css', purpose: 'App styling', content: styles },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'src/App.tsx', ['npm install', 'npm run dev']),
      },
    ],
  };
}

function buildNextProjectTemplate(input: GenerateProjectInput, stack: StackDescriptor, slug: string, name: string): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name);
  const packageJson = jsonPretty({
    name: packageNameFromSlug(slug),
    private: true,
    version: '0.1.0',
    scripts: {
      dev: 'next dev -H 0.0.0.0 -p 3000',
      build: 'next build',
      start: 'next start -H 0.0.0.0 -p 3000',
    },
    dependencies: {
      next: '^15.2.0',
      react: '^19.1.0',
      'react-dom': '^19.1.0',
    },
    devDependencies: {
      typescript: '^5.8.3',
      '@types/node': '^22.14.1',
      '@types/react': '^19.1.8',
      '@types/react-dom': '^19.1.6',
    },
  });
  return {
    entryFile: 'app/page.tsx',
    runCommands: ['npm install', 'npm run dev'],
    files: [
      { path: 'package.json', purpose: 'Next.js dependencies', content: packageJson },
      {
        path: 'tsconfig.json',
        purpose: 'TypeScript config',
        content: jsonPretty({
          compilerOptions: {
            target: 'ES2017',
            lib: ['DOM', 'DOM.Iterable', 'ES2020'],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
          exclude: ['node_modules'],
        }),
      },
      {
        path: 'next-env.d.ts',
        purpose: 'Next.js type stubs',
        content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />`,
      },
      {
        path: 'next.config.mjs',
        purpose: 'Next.js runtime config',
        content: `const nextConfig = {};

export default nextConfig;`,
      },
      {
        path: 'app/layout.tsx',
        purpose: 'App shell',
        content: `import './globals.css';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`,
      },
      {
        path: 'app/page.tsx',
        purpose: 'Primary landing route',
        content: `const metrics = [
  { label: 'Audience', value: ${jsonPretty(copy.audience)} },
  { label: 'Goal', value: ${jsonPretty(copy.goal)} },
  { label: 'Runtime', value: ${jsonPretty(stack.label)} },
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Sloth Cloud Launch</p>
        <h1>{${jsonPretty(copy.title)}}</h1>
        <p>{${jsonPretty(copy.subtitle)}}</p>
        <div className="metric-grid">
          {metrics.map((item) => (
            <article className="tile" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <p className="eyebrow">Idea</p>
        <h2>AI generated a buildable starting point</h2>
        <p>{${jsonPretty(copy.idea)}}</p>
      </section>
    </main>
  );
}`,
      },
      {
        path: 'app/globals.css',
        purpose: 'Global styling',
        content: `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 45%, #f8f5ff 100%);
  color: #11201b;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.page-shell {
  width: min(100% - 32px, 1080px);
  margin: 0 auto;
  padding: 32px 0 56px;
  display: grid;
  gap: 24px;
}
.hero, .panel {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 32, 27, 0.1);
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 18px 48px rgba(17, 32, 27, 0.08);
}
.eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 800;
  color: #0b7d66;
}
h1, h2, p { margin: 0; }
h1 { font-size: clamp(40px, 8vw, 84px); line-height: 0.95; }
h2 { font-size: clamp(24px, 4vw, 34px); margin-bottom: 12px; }
p { color: #4b655d; line-height: 1.75; }
.metric-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.tile {
  background: #f4faf7;
  border: 1px solid rgba(17, 32, 27, 0.08);
  border-radius: 16px;
  padding: 16px;
}
.tile span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #69817a;
}
.tile strong { font-size: 18px; }`,
      },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'app/page.tsx', ['npm install', 'npm run dev']),
      },
    ],
  };
}

function buildVueProjectTemplate(input: GenerateProjectInput, stack: StackDescriptor, slug: string, name: string): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name);
  return {
    entryFile: 'src/App.vue',
    runCommands: ['npm install', 'npm run dev'],
    files: [
      {
        path: 'package.json',
        purpose: 'Vue dependencies',
        content: jsonPretty({
          name: packageNameFromSlug(slug),
          private: true,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'vite --host 0.0.0.0 --port 3000',
            build: 'vite build',
            preview: 'vite preview --host 0.0.0.0 --port 4173',
          },
          dependencies: {
            vue: '^3.5.18',
          },
          devDependencies: {
            '@vitejs/plugin-vue': '^5.1.4',
            typescript: '^5.8.3',
            vite: '^7.1.5',
          },
        }),
      },
      {
        path: 'tsconfig.json',
        purpose: 'TypeScript config',
        content: jsonPretty({
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            jsx: 'preserve',
            resolveJsonModule: true,
          },
          include: ['src/**/*.ts', 'src/**/*.vue'],
        }),
      },
      {
        path: 'vite.config.ts',
        purpose: 'Vite config',
        content: `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
});`,
      },
      {
        path: 'index.html',
        purpose: 'HTML entry',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(copy.title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,
      },
      {
        path: 'src/main.ts',
        purpose: 'Vue bootstrap',
        content: `import { createApp } from 'vue';

import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');`,
      },
      {
        path: 'src/App.vue',
        purpose: 'Main application view',
        content: `<script setup lang="ts">
const metrics = [
  { label: 'Audience', value: ${jsonPretty(copy.audience)} },
  { label: 'Goal', value: ${jsonPretty(copy.goal)} },
  { label: 'Runtime', value: ${jsonPretty(stack.label)} },
];
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <p class="eyebrow">Sloth Cloud Launch</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="hero-copy">${escapeHtml(copy.subtitle)}</p>
      <div class="grid">
        <article v-for="item in metrics" :key="item.label" class="tile">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Idea</p>
      <h2>AI turned the brief into a deployable starter</h2>
      <p>${escapeHtml(copy.idea)}</p>
    </section>
  </main>
</template>`,
      },
      {
        path: 'src/styles.css',
        purpose: 'Application styling',
        content: `.page-shell {
  min-height: 100vh;
  padding: 32px 16px 56px;
  background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 45%, #f8f5ff 100%);
  color: #11201b;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; }
main { width: min(100%, 1080px); margin: 0 auto; display: grid; gap: 24px; }
.hero, .panel {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 32, 27, 0.1);
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 18px 48px rgba(17, 32, 27, 0.08);
}
.eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 800;
  color: #0b7d66;
}
h1, h2, p { margin: 0; }
h1 { font-size: clamp(40px, 8vw, 84px); line-height: 0.95; }
h2 { font-size: clamp(24px, 4vw, 34px); margin-bottom: 12px; }
.hero-copy, .panel p { color: #4b655d; line-height: 1.75; }
.grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.tile {
  background: #f4faf7;
  border: 1px solid rgba(17, 32, 27, 0.08);
  border-radius: 16px;
  padding: 16px;
}
.tile span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #69817a;
}
.tile strong { font-size: 18px; }`,
      },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'src/App.vue', ['npm install', 'npm run dev']),
      },
    ],
  };
}

function buildPythonProjectTemplate(input: GenerateProjectInput, stack: StackDescriptor, slug: string, name: string): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name);
  return {
    entryFile: 'app.py',
    runCommands: ['python3 -m venv .venv', '. .venv/bin/activate', 'pip install -r requirements.txt', 'python app.py'],
    files: [
      { path: 'requirements.txt', purpose: 'Python dependencies', content: 'Flask==3.1.0\n' },
      {
        path: 'app.py',
        purpose: 'Flask application',
        content: `from flask import Flask, render_template

app = Flask(__name__)

PAGE = {
    "title": ${jsonPretty(copy.title)},
    "subtitle": ${jsonPretty(copy.subtitle)},
    "idea": ${jsonPretty(copy.idea)},
    "audience": ${jsonPretty(copy.audience)},
    "goal": ${jsonPretty(copy.goal)},
    "runtime": ${jsonPretty(stack.label)},
}


@app.get("/")
def home():
    return render_template("index.html", page=PAGE)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
`,
      },
      {
        path: 'templates/index.html',
        purpose: 'HTML template',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ page.title }}</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Sloth Cloud Launch</p>
        <h1>{{ page.title }}</h1>
        <p>{{ page.subtitle }}</p>
      </section>
      <section class="grid">
        <article class="tile"><span>Audience</span><strong>{{ page.audience }}</strong></article>
        <article class="tile"><span>Goal</span><strong>{{ page.goal }}</strong></article>
        <article class="tile"><span>Runtime</span><strong>{{ page.runtime }}</strong></article>
      </section>
      <section>
        <p class="eyebrow">Idea</p>
        <h2>AI scaffold ready for preview</h2>
        <p>{{ page.idea }}</p>
      </section>
    </main>
  </body>
</html>`,
      },
      {
        path: 'static/styles.css',
        purpose: 'Page styling',
        content: `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5fbf8;
  color: #11201b;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 45%, #f8f5ff 100%); }
main { width: min(100% - 32px, 1080px); margin: 0 auto; padding: 56px 0; display: grid; gap: 24px; }
section { background: rgba(255, 255, 255, 0.88); border: 1px solid rgba(17, 32, 27, 0.1); border-radius: 20px; padding: 28px; box-shadow: 0 18px 48px rgba(17, 32, 27, 0.08); }
.hero { min-height: 320px; display: grid; align-content: center; gap: 16px; }
.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: 0.14em; font-size: 12px; font-weight: 800; color: #0b7d66; }
h1, h2, p { margin: 0; }
h1 { font-size: clamp(40px, 8vw, 84px); line-height: 0.95; }
h2 { font-size: clamp(24px, 4vw, 34px); }
p { color: #4b655d; line-height: 1.75; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.tile { border-radius: 16px; background: #f4faf7; padding: 16px; border: 1px solid rgba(17, 32, 27, 0.08); }
.tile span { display: block; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #69817a; }
.tile strong { font-size: 18px; }`,
      },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'app.py', ['python3 -m venv .venv', '. .venv/bin/activate', 'pip install -r requirements.txt', 'python app.py']),
      },
    ],
  };
}

function buildPhpProjectTemplate(input: GenerateProjectInput, stack: StackDescriptor, slug: string, name: string): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name);
  return {
    entryFile: 'public/index.php',
    runCommands: ['php -S 0.0.0.0:8080 -t public'],
    files: [
      {
        path: 'public/index.php',
        purpose: 'PHP application entry',
        content: `<?php
$page = [
    'title' => ${jsonPretty(copy.title)},
    'subtitle' => ${jsonPretty(copy.subtitle)},
    'idea' => ${jsonPretty(copy.idea)},
    'audience' => ${jsonPretty(copy.audience)},
    'goal' => ${jsonPretty(copy.goal)},
    'runtime' => ${jsonPretty(stack.label)},
];
?><!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title><?= htmlspecialchars($page['title'], ENT_QUOTES, 'UTF-8') ?></title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Sloth Cloud Launch</p>
        <h1><?= htmlspecialchars($page['title'], ENT_QUOTES, 'UTF-8') ?></h1>
        <p><?= htmlspecialchars($page['subtitle'], ENT_QUOTES, 'UTF-8') ?></p>
      </section>
      <section class="grid">
        <article class="tile"><span>Audience</span><strong><?= htmlspecialchars($page['audience'], ENT_QUOTES, 'UTF-8') ?></strong></article>
        <article class="tile"><span>Goal</span><strong><?= htmlspecialchars($page['goal'], ENT_QUOTES, 'UTF-8') ?></strong></article>
        <article class="tile"><span>Runtime</span><strong><?= htmlspecialchars($page['runtime'], ENT_QUOTES, 'UTF-8') ?></strong></article>
      </section>
      <section>
        <p class="eyebrow">Idea</p>
        <h2>AI scaffold ready for launch</h2>
        <p><?= htmlspecialchars($page['idea'], ENT_QUOTES, 'UTF-8') ?></p>
      </section>
    </main>
  </body>
</html>`,
      },
      {
        path: 'public/styles.css',
        purpose: 'Page styling',
        content: `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5fbf8;
  color: #11201b;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 45%, #f8f5ff 100%); }
main { width: min(100% - 32px, 1080px); margin: 0 auto; padding: 56px 0; display: grid; gap: 24px; }
section { background: rgba(255, 255, 255, 0.88); border: 1px solid rgba(17, 32, 27, 0.1); border-radius: 20px; padding: 28px; box-shadow: 0 18px 48px rgba(17, 32, 27, 0.08); }
.hero { min-height: 320px; display: grid; align-content: center; gap: 16px; }
.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: 0.14em; font-size: 12px; font-weight: 800; color: #0b7d66; }
h1, h2, p { margin: 0; }
h1 { font-size: clamp(40px, 8vw, 84px); line-height: 0.95; }
h2 { font-size: clamp(24px, 4vw, 34px); }
p { color: #4b655d; line-height: 1.75; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.tile { border-radius: 16px; background: #f4faf7; padding: 16px; border: 1px solid rgba(17, 32, 27, 0.08); }
.tile span { display: block; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #69817a; }
.tile strong { font-size: 18px; }`,
      },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM php:8.3-cli-alpine
WORKDIR /app
COPY public ./public
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'public/index.php', ['php -S 0.0.0.0:8080 -t public']),
      },
    ],
  };
}

function buildModelDrivenReactProjectTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  slug: string,
  name: string,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  const copy = materializedIdeaCopy(input, name, recipe);
  const zh = copy.locale === 'zh-CN';
  const displayStackLabel = localizeStackLabel(stack, copy.locale);
  const displayRuntime = localizeRuntimeLabel(stack.runtime, copy.locale);
  const packageJson = jsonPretty({
    name: packageNameFromSlug(slug),
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 3000',
      build: 'tsc -p tsconfig.json --noEmit && vite build',
      preview: 'vite preview --host 0.0.0.0 --port 4173',
    },
    dependencies: {
      react: '^19.1.0',
      'react-dom': '^19.1.0',
    },
    devDependencies: {
      '@types/react': '^19.1.8',
      '@types/react-dom': '^19.1.6',
      '@vitejs/plugin-react-swc': '^3.10.2',
      typescript: '^5.8.3',
      vite: '^7.1.5',
    },
  });
  const seedItems = (copy.seedItems.length > 0 ? copy.seedItems : [
    {
      title: zh ? '第一个用户动作' : 'First user action',
      detail: zh ? `帮助${copy.audience}在两分钟内完成主要结果。` : `Help ${copy.audience} reach the main outcome in less than two minutes.`,
      stage: 'ready' as GeneratedProjectStage,
    },
    {
      title: zh ? '核心转化点' : 'Core conversion',
      detail: copy.goal,
      stage: 'building' as GeneratedProjectStage,
    },
    {
      title: zh ? '运营控制位' : 'Operator control',
      detail: zh ? '保留日志、回滚和上线决策的位置。' : 'Keep one place for logs, rollback, and launch decisions.',
      stage: 'backlog' as GeneratedProjectStage,
    },
  ]).map((item, index) => ({
    id: `seed-${index + 1}`,
    title: item.title,
    detail: item.detail,
    stage: item.stage,
  }));
  const journeyMoments = copy.journeyMoments.length > 0 ? copy.journeyMoments : (zh
    ? ['用户打开页面后立刻知道下一步做什么。', '第一个关键动作几乎不用学习成本。', '预览版已经能表达产品价值。']
    : ['Users immediately know the next step.', 'The first meaningful action requires almost no learning.', 'The preview already communicates product value.']);
  const helpfulPoints = copy.helpfulPoints.length > 0 ? copy.helpfulPoints : (zh
    ? ['这不是海报，而是能改数据的第一版应用。', '用户侧和运营侧都能在同一个页面验证。', '本地状态保存能让迭代更连贯。']
    : ['This is not a poster but a stateful first-version app.', 'Customer and operator views can be reviewed together.', 'Local state keeps iteration continuous.']);
  const operatorChecklist = copy.operatorChecklist.length > 0 ? copy.operatorChecklist : (zh
    ? ['预览与正式版使用同一个工作区。', '源码包可以编辑、下载并继续托管。', '结算应推广同一个构建，而不是重新生成第二个应用。']
    : ['Preview and production should share the same workspace.', 'The source bundle should stay editable and downloadable.', 'Checkout should promote the same build instead of regenerating another app.']);
  const appTsx = `import { useEffect, useState, type FormEvent } from 'react';

import './styles.css';

type ViewMode = 'workspace' | 'journey' | 'launch';
type WorkStage = 'backlog' | 'building' | 'ready';

type WorkItem = {
  id: string;
  title: string;
  detail: string;
  stage: WorkStage;
};

const ui = ${jsonPretty({
    heroEyebrow: zh ? '树懒云模型执行结果' : 'Sloth Cloud model execution',
    audienceLabel: zh ? '面向用户' : 'Audience',
    goalLabel: zh ? '目标' : 'Goal',
    runtimeLabel: zh ? '运行方式' : 'Runtime',
    capsuleStatusLabel: zh ? '工作区状态' : 'Workspace status',
    capsuleStatusTitle: zh ? '可交互第一版已经准备好' : 'Interactive first version is ready',
    capsuleStatusBody: zh ? '这次不是海报，而是一版可以录入、推进、保存状态的真实工作台。' : 'This is not a poster but a real first-version workspace with editable state.',
    tabs: [
      { id: 'workspace', label: zh ? '体验台' : 'Workspace', hint: zh ? '补功能并推进到可体验' : 'Shape features into something testable' },
      { id: 'journey', label: zh ? '用户流程' : 'Journey', hint: zh ? '查看首版体验是否顺手' : 'See how the first user journey feels' },
      { id: 'launch', label: zh ? '上线路径' : 'Launch path', hint: zh ? '确认运行时和交付方式' : 'Review runtime and launch steps' },
    ],
    stages: {
      backlog: zh ? '待整理' : 'Backlog',
      building: zh ? '制作中' : 'Building',
      ready: zh ? '可体验' : 'Ready',
    },
    stageHints: {
      backlog: zh ? '还需要定义' : 'Needs definition',
      building: zh ? '继续打磨' : 'Needs shaping',
      ready: zh ? '已经能试' : 'Already testable',
    },
    coreIdeaLabel: zh ? '核心想法' : 'Core idea',
    helpfulLabel: zh ? '为什么这版有用' : 'Why this is useful',
    workEyebrow: zh ? '真实交互页面' : 'Interactive page',
    workTitle: zh ? '把想法推进成能操作的第一版应用' : 'Turn the brief into a usable first-version app',
    resetLabel: zh ? '恢复默认数据' : 'Reset sample data',
    titleLabel: zh ? `新增${copy.itemLabel}标题` : `New ${copy.itemLabel} title`,
    titlePlaceholder: zh ? `例如：${copy.primaryActionLabel}` : `Example: ${copy.primaryActionLabel}`,
    detailLabel: zh ? '这一步要完成什么' : 'What should it do?',
    detailPlaceholder: zh ? `描述这条${copy.itemLabel}要给 ${copy.audience} 带来的结果` : `Describe the outcome this ${copy.itemLabel} should create for ${copy.audience}`,
    addLabel: zh ? '加入待整理' : 'Add to backlog',
    emptyLabel: zh ? '这里还没有内容。' : 'Nothing here yet.',
    backLabel: zh ? '后退' : 'Back',
    forwardLabel: zh ? '推进' : 'Forward',
    journeyEyebrow: zh ? '用户流程' : 'User journey',
    journeyTitle: zh ? '先确认第一版体验是否已经说得清、用得动' : 'Check whether the first version is understandable and usable',
    journeyBody: zh ? '让用户一打开页面就能理解价值、完成动作，再决定要不要继续正式上线。' : 'Let users understand the value and complete the first action before deciding to launch wider.',
    readyEyebrow: zh ? '可体验内容' : 'Testable pieces',
    readyTitle: zh ? '现在就能试的部分' : 'What can be tried right now',
    readyEmpty: zh ? '把卡片推进到“可体验”后，这里就会出现首版体验内容。' : 'Move items to ready to surface what is already testable.',
    launchEyebrow: zh ? '运行时' : 'Runtime',
    launchTitle: displayStackLabel,
    launchBody: zh ? `建议运行时：${displayRuntime}` : `Suggested runtime: ${displayRuntime}`,
    launchPathEyebrow: zh ? '交付路径' : 'Launch path',
    launchPathTitle: zh ? '预览 / 结算 / 服务' : 'Preview / Checkout / Service',
  })};
const storageKey = ${jsonPretty(`sloth-launch-${slug}-workspace-v2`)};
const stageOrder: WorkStage[] = ['backlog', 'building', 'ready'];
const seedItems: WorkItem[] = ${jsonPretty(seedItems)};
const journeyMoments = ${jsonPretty(journeyMoments)};
const helpfulPoints = ${jsonPretty(helpfulPoints)};
const operatorChecklist = ${jsonPretty(operatorChecklist)};
const runCommands = ${jsonPretty(['npm install', 'npm run dev'])};

function sanitizeItems(value: unknown): WorkItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return null;
    const record = entry as Partial<WorkItem>;
    if (
      typeof record.id !== 'string'
      || typeof record.title !== 'string'
      || typeof record.detail !== 'string'
      || !stageOrder.includes(record.stage as WorkStage)
    ) {
      return null;
    }
    return {
      id: record.id,
      title: record.title,
      detail: record.detail,
      stage: record.stage as WorkStage,
    };
  }).filter((entry): entry is WorkItem => entry !== null);
  return items.length > 0 ? items : null;
}

function readStoredItems() {
  if (typeof window === 'undefined') return seedItems;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return seedItems;
    return sanitizeItems(JSON.parse(raw)) ?? seedItems;
  } catch {
    return seedItems;
  }
}

function shiftStage(stage: WorkStage, direction: -1 | 1) {
  const currentIndex = stageOrder.indexOf(stage);
  const nextIndex = Math.min(stageOrder.length - 1, Math.max(0, currentIndex + direction));
  return stageOrder[nextIndex];
}

export default function App() {
  const [view, setView] = useState<ViewMode>('workspace');
  const [items, setItems] = useState<WorkItem[]>(readStoredItems);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDetail, setDraftDetail] = useState(ui.detailPlaceholder);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    }
  }, [items]);

  const readyItems = items.filter((item) => item.stage === 'ready');
  const stageStats = stageOrder.map((stage) => ({
    stage,
    count: items.filter((item) => item.stage === stage).length,
  }));

  function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    const detail = draftDetail.trim();
    if (!title || !detail) return;

    setItems((current) => [
      { id: 'flow-' + Date.now() + '-' + current.length, title, detail, stage: 'backlog' },
      ...current,
    ]);
    setDraftTitle('');
    setDraftDetail(ui.detailPlaceholder);
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    setItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, stage: shiftStage(item.stage, direction) } : item
    )));
  }

  function resetWorkspace() {
    setItems(seedItems);
    setDraftTitle('');
    setDraftDetail(ui.detailPlaceholder);
  }

  return (
    <main className="prototype-shell">
      <section className="prototype-hero">
        <div className="hero-copy">
          <p className="eyebrow">{ui.heroEyebrow}</p>
          <h1>{${jsonPretty(copy.title)}}</h1>
          <p className="hero-copy__body">{${jsonPretty(copy.subtitle)}}</p>
          <div className="hero-chip-row">
            <span className="hero-chip">{ui.audienceLabel}: {${jsonPretty(copy.audience)}}</span>
            <span className="hero-chip">{ui.goalLabel}: {${jsonPretty(copy.goal)}}</span>
            <span className="hero-chip">{ui.runtimeLabel}: {${jsonPretty(displayStackLabel)}}</span>
          </div>
        </div>

        <aside className="hero-status">
          <span className="eyebrow">{ui.capsuleStatusLabel}</span>
          <strong>{ui.capsuleStatusTitle}</strong>
          <p>{ui.capsuleStatusBody}</p>
          <div className="hero-status__grid">
            {stageStats.map((entry) => (
              <article key={entry.stage}>
                <span>{ui.stages[entry.stage]}</span>
                <strong>{entry.count}</strong>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="workspace-frame">
        <aside className="workspace-sidebar">
          <article className="sidebar-card">
            <span className="sidebar-label">{ui.coreIdeaLabel}</span>
            <strong>{${jsonPretty(copy.idea)}}</strong>
            <p>{${jsonPretty(zh
              ? `先帮助${copy.audience}快速获得可见结果，再把交付路径收口到同一个工作区里。`
              : `Help ${copy.audience} reach a visible outcome quickly, then keep delivery centered on the same workspace.`)}}</p>
          </article>

          <article className="sidebar-card">
            <span className="sidebar-label">{ui.helpfulLabel}</span>
            <ul className="bullet-list">
              {helpfulPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="sidebar-card">
            <span className="sidebar-label">{ui.workEyebrow}</span>
            <div className="sidebar-actions">
              {ui.tabs.map((tab) => (
                <button
                  className={view === tab.id ? 'sidebar-button active' : 'sidebar-button'}
                  key={tab.id}
                  onClick={() => setView(tab.id as ViewMode)}
                  type="button"
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.hint}</span>
                </button>
              ))}
            </div>
          </article>
        </aside>

        <div className="workspace-main">
          <div className="tab-row">
            {ui.tabs.map((tab) => (
              <button
                className={view === tab.id ? 'tab-button active' : 'tab-button'}
                key={tab.id}
                onClick={() => setView(tab.id as ViewMode)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === 'workspace' ? (
            <section className="canvas-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">{ui.workEyebrow}</p>
                  <h2>{ui.workTitle}</h2>
                </div>
                <button className="ghost-button" onClick={resetWorkspace} type="button">
                  {ui.resetLabel}
                </button>
              </div>

              <form className="composer" onSubmit={handleAddItem}>
                <label>
                  <span>{ui.titleLabel}</span>
                  <input onChange={(event) => setDraftTitle(event.target.value)} placeholder={ui.titlePlaceholder} type="text" value={draftTitle} />
                </label>
                <label>
                  <span>{ui.detailLabel}</span>
                  <textarea onChange={(event) => setDraftDetail(event.target.value)} placeholder={ui.detailPlaceholder} rows={3} value={draftDetail} />
                </label>
                <button className="primary-button" type="submit">{ui.addLabel}</button>
              </form>

              <div className="board-grid">
                {stageOrder.map((stage) => {
                  const stageItems = items.filter((item) => item.stage === stage);
                  return (
                    <article className="stage-column" key={stage}>
                      <header className="stage-column__head">
                        <div>
                          <span>{ui.stages[stage]}</span>
                          <strong>{stageItems.length}</strong>
                        </div>
                        <small>{ui.stageHints[stage]}</small>
                      </header>
                      <div className="stage-column__list">
                        {stageItems.length === 0 ? (
                          <div className="empty-slot">{ui.emptyLabel}</div>
                        ) : stageItems.map((item) => (
                          <article className="work-card" key={item.id}>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            <div className="work-card__actions">
                              <button disabled={stage === 'backlog'} onClick={() => moveItem(item.id, -1)} type="button">{ui.backLabel}</button>
                              <button disabled={stage === 'ready'} onClick={() => moveItem(item.id, 1)} type="button">{ui.forwardLabel}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {view === 'journey' ? (
            <section className="canvas-card customer-grid">
              <article className="customer-card customer-card--highlight">
                <p className="eyebrow">{ui.journeyEyebrow}</p>
                <h2>{ui.journeyTitle}</h2>
                <p>{ui.journeyBody}</p>
                <div className="journey-list">
                  {journeyMoments.map((moment) => (
                    <article className="journey-step" key={moment}>
                      <span>${zh ? '节点' : 'Moment'}</span>
                      <strong>{moment}</strong>
                    </article>
                  ))}
                </div>
              </article>

              <article className="customer-card">
                <p className="eyebrow">{ui.readyEyebrow}</p>
                <h2>{ui.readyTitle}</h2>
                <div className="ready-list">
                  {readyItems.length === 0 ? (
                    <div className="empty-slot">{ui.readyEmpty}</div>
                  ) : readyItems.map((item) => (
                    <article className="ready-item" key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {view === 'launch' ? (
            <section className="canvas-card ops-grid">
              <article className="ops-card">
                <p className="eyebrow">{ui.launchEyebrow}</p>
                <h2>{ui.launchTitle}</h2>
                <p>{ui.launchBody}</p>
                <div className="command-list">
                  {runCommands.map((command) => (
                    <code key={command}>{command}</code>
                  ))}
                </div>
              </article>

              <article className="ops-card">
                <p className="eyebrow">{ui.launchPathEyebrow}</p>
                <h2>{ui.launchPathTitle}</h2>
                <ul className="bullet-list">
                  {operatorChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}`;
  const styles = `:root {
  color-scheme: light;
  --ink: #122520;
  --muted: #4a665e;
  --surface: rgba(255, 255, 255, 0.84);
  --surface-strong: rgba(255, 255, 255, 0.94);
  --line: rgba(18, 37, 32, 0.1);
  --teal: #0d7c67;
  --teal-deep: #0b5d4f;
  font-family: "SF Pro Rounded", "Avenir Next", "Trebuchet MS", sans-serif;
  background: #eef7f3;
  color: var(--ink);
}

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(79, 219, 186, 0.28), transparent 28%),
    radial-gradient(circle at top right, rgba(242, 164, 60, 0.22), transparent 26%),
    linear-gradient(180deg, #eef7f3 0%, #eef6ff 46%, #f9f6ef 100%);
}

button, input, textarea { font: inherit; }
.prototype-shell { width: min(100% - 24px, 1240px); margin: 0 auto; padding: 24px 0 40px; display: grid; gap: 18px; }
.prototype-hero, .workspace-frame, .canvas-card, .sidebar-card, .customer-card, .ops-card {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 24px 70px rgba(17, 37, 33, 0.09);
  backdrop-filter: blur(18px);
}
.prototype-hero {
  border-radius: 28px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1.3fr 0.9fr;
  gap: 18px;
  background:
    linear-gradient(140deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.72)),
    radial-gradient(circle at top left, rgba(13, 124, 103, 0.14), transparent 34%),
    radial-gradient(circle at top right, rgba(242, 164, 60, 0.18), transparent 30%);
}
.hero-copy h1, .hero-status strong, .section-head h2, .customer-card h2, .ops-card h2, .sidebar-card strong { margin: 0; }
.hero-copy h1 { font-size: clamp(38px, 8vw, 80px); line-height: 0.92; }
.eyebrow, .sidebar-label, .stage-column__head span, .journey-step span, .hero-status__grid span {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 800;
  color: var(--teal);
}
.hero-copy__body, .hero-status p, .sidebar-card p, .work-card p, .customer-card p, .ops-card p, .empty-slot {
  color: var(--muted);
  line-height: 1.72;
}
.hero-chip-row, .tab-row, .command-list, .sidebar-actions, .work-card__actions { display: flex; flex-wrap: wrap; gap: 10px; }
.hero-chip, code, .ghost-button, .primary-button, .sidebar-button, .tab-button, .work-card__actions button {
  border-radius: 999px;
  border: 1px solid rgba(13, 124, 103, 0.12);
}
.hero-chip, code {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--teal-deep);
  font-weight: 700;
}
.hero-status {
  border-radius: 24px;
  padding: 22px;
  background: linear-gradient(180deg, rgba(223, 247, 240, 0.9), rgba(255, 255, 255, 0.9));
  display: grid;
  gap: 14px;
}
.hero-status__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hero-status__grid article {
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(17, 37, 33, 0.08);
}
.hero-status__grid strong { font-size: 32px; line-height: 1; }
.workspace-frame { border-radius: 30px; padding: 18px; display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 18px; }
.workspace-sidebar, .workspace-main, .stage-column__list, .customer-grid, .ops-grid { display: grid; gap: 16px; }
.sidebar-card, .canvas-card, .customer-card, .ops-card, .stage-column {
  border-radius: 24px;
  padding: 20px;
  background: var(--surface-strong);
}
.sidebar-card strong { font-size: 28px; line-height: 1.08; }
.sidebar-button, .tab-button, .primary-button, .ghost-button, .work-card__actions button {
  cursor: pointer;
  color: var(--ink);
  background: #ffffff;
  padding: 12px 14px;
  font-weight: 700;
}
.sidebar-button, .tab-button { display: grid; gap: 6px; width: 100%; text-align: left; }
.sidebar-button span, .stage-column__head small { color: #6b847c; }
.sidebar-button.active, .tab-button.active, .primary-button {
  background: linear-gradient(135deg, var(--teal) 0%, #11a385 100%);
  border-color: transparent;
  color: #ffffff;
}
.ghost-button { background: rgba(223, 247, 240, 0.58); }
.section-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
.composer { display: grid; gap: 12px; grid-template-columns: 1fr 1.2fr auto; }
.composer label { display: grid; gap: 8px; }
.composer input, .composer textarea {
  border-radius: 18px;
  border: 1px solid rgba(17, 37, 33, 0.12);
  background: #f9fffc;
  padding: 14px 16px;
  resize: vertical;
  min-height: 58px;
}
.board-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.stage-column { background: linear-gradient(180deg, rgba(244, 250, 247, 0.98), rgba(255, 255, 255, 0.98)); }
.stage-column__head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
.stage-column__head strong { display: block; font-size: 28px; line-height: 1.1; }
.empty-slot {
  border: 1px dashed rgba(17, 37, 33, 0.14);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.65);
}
.work-card {
  border-radius: 18px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid rgba(17, 37, 33, 0.08);
  display: grid;
  gap: 12px;
}
.customer-grid, .ops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.customer-card--highlight { background: linear-gradient(180deg, rgba(233, 245, 255, 0.92), rgba(255, 255, 255, 0.92)); }
.journey-list, .ready-list { display: grid; gap: 12px; }
.journey-step, .ready-item {
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(17, 37, 33, 0.08);
  background: rgba(255, 255, 255, 0.92);
}
.bullet-list { margin: 0; padding-left: 18px; color: var(--muted); display: grid; gap: 10px; }
.command-list { margin-top: 16px; }
code { display: inline-flex; align-items: center; min-height: 44px; }
@media (max-width: 1100px) {
  .workspace-frame, .prototype-hero, .customer-grid, .ops-grid, .board-grid, .composer { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .prototype-shell { width: min(100% - 16px, 1240px); padding: 14px 0 24px; }
  .hero-copy h1 { font-size: clamp(32px, 14vw, 60px); }
  .hero-status__grid { grid-template-columns: 1fr; }
}`;

  return {
    entryFile: 'src/App.tsx',
    runCommands: ['npm install', 'npm run dev'],
    files: [
      { path: 'package.json', purpose: 'React runtime dependencies', content: packageJson },
      {
        path: 'tsconfig.json',
        purpose: 'TypeScript config',
        content: jsonPretty({
          compilerOptions: {
            target: 'ES2020',
            lib: ['DOM', 'DOM.Iterable', 'ES2020'],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'react-jsx',
          },
          include: ['src'],
        }),
      },
      {
        path: 'vite.config.ts',
        purpose: 'Vite config',
        content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
});`,
      },
      {
        path: 'index.html',
        purpose: 'HTML entry',
        content: `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(copy.title)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: 'src/main.tsx',
        purpose: 'React bootstrap',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`,
      },
      { path: 'src/App.tsx', purpose: 'Interactive first-version app workspace', content: appTsx },
      { path: 'src/styles.css', purpose: 'Application styling', content: styles },
      {
        path: 'Dockerfile',
        purpose: 'Production container image',
        content: `FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json vite.config.ts index.html ./
RUN npm install
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html`,
      },
      {
        path: 'README.md',
        purpose: 'Project instructions',
        content: buildOperatorReadme(input, stack, name, 'src/App.tsx', ['npm install', 'npm run dev'], recipe),
      },
    ],
  };
}

function buildModelGeneratedStaticProjectTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  name: string,
  bundle: GeneratedProjectBundle,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  const files = [...bundle.files];
  const hasPath = (path: string) => files.some((file) => file.path === path);
  const runCommands = bundle.runCommands.length > 0 ? bundle.runCommands : ['python3 -m http.server 3000'];

  if (!hasPath('Dockerfile')) {
    files.push({
      path: 'Dockerfile',
      purpose: recipe?.locale === 'zh-CN' ? '生产容器镜像' : 'Production container image',
      content: `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html`,
    });
  }

  if (!hasPath('README.md')) {
    files.push({
      path: 'README.md',
      purpose: recipe?.locale === 'zh-CN' ? '项目说明' : 'Project instructions',
      content: buildOperatorReadme(input, stack, name, bundle.entryFile, runCommands, recipe),
    });
  }

  return {
    entryFile: bundle.entryFile,
    runCommands,
    files,
  };
}

function buildGeneratedProjectTemplate(
  input: GenerateProjectInput,
  stack: StackDescriptor,
  slug: string,
  name: string,
  recipe?: GeneratedProjectRecipe | null,
): GeneratedProjectTemplate {
  if (recipe?.kind === 'snake-game' || isSnakeGameIdea(input)) {
    return buildSnakeGameTemplate(input, stack, slug, name, recipe);
  }
  if (recipe?.kind === 'battle-game' || isBattleGameIdea(input)) {
    return buildBattleGameTemplate(input, stack, slug, name, recipe);
  }
  if (recipe?.kind === 'workflow-app') {
    return buildModelDrivenReactProjectTemplate(input, stack, slug, name, recipe);
  }
  if (recipe?.kind === 'static-launch') {
    return buildStaticProjectTemplate(input, stack, slug, name, recipe);
  }
  if (stack.slug === 'nextjs') {
    return buildNextProjectTemplate(input, stack, slug, name);
  }
  if (stack.slug === 'nuxt') {
    return buildVueProjectTemplate(input, stack, slug, name);
  }
  if (stack.slug === 'python') {
    return buildPythonProjectTemplate(input, stack, slug, name);
  }
  if (stack.slug === 'laravel' || stack.slug === 'wordpress') {
    return buildPhpProjectTemplate(input, stack, slug, name);
  }
  if (stack.slug === 'static' || stack.slug === 'docker') {
    return buildStaticProjectTemplate(input, stack, slug, name, recipe);
  }
  return buildModelDrivenReactProjectTemplate(input, stack, slug, name, recipe);
}

function baseEvents(message: string): OperatorLogEntry[] {
  return [
    {
      id: createId('event'),
      level: 'info',
      message,
      createdAt: nowIso(),
    },
  ];
}

function createAction(
  intent: OperatorActionIntent,
  label: string,
  description: string,
  risk: OperatorRisk,
  requiresConfirmation = false,
): OperatorActionSummary {
  return {
    id: createId('action'),
    intent,
    label,
    description,
    risk,
    requiresConfirmation,
  };
}

function defaultArtifactSummary(sourceType: OperatorArtifactSummary['sourceType'] = 'none'): OperatorArtifactSummary {
  return {
    sourceType,
    sourceRef: null,
    archiveUrl: null,
    manifestUrl: null,
    entryFile: null,
    runCommands: [],
    fileCount: 0,
    installCommand: null,
    buildCommand: null,
  };
}

function defaultPreviewSummary(): OperatorPreviewSummary {
  return {
    status: 'unavailable',
    verified: false,
    previewUrl: null,
    entryFile: null,
    assetCount: 0,
    verifiedAt: null,
    lastError: null,
  };
}

function defaultAuditSummary(): OperatorAuditSummary {
  return {
    status: 'pending',
    host: null,
    port: null,
    username: null,
    collectedAt: null,
    os: null,
    kernel: null,
    cpu: null,
    memory: null,
    disk: null,
    docker: null,
    compose: null,
    webServers: [],
    openPorts: [],
    domains: [],
    processes: [],
    risks: [],
    lastError: null,
  };
}

function defaultDiagnosticsSummary(): OperatorDiagnosticsSummary {
  return {
    stage: null,
    headline: 'No diagnostics yet.',
    detail: 'This workspace has not produced runtime diagnostics yet.',
    command: null,
    lastError: null,
  };
}

function normalizeArtifactSummary(value: unknown): OperatorArtifactSummary {
  if (typeof value !== 'object' || value === null) {
    return defaultArtifactSummary();
  }

  const record = value as Partial<OperatorArtifactSummary>;
  return {
    sourceType: record.sourceType === 'generated' || record.sourceType === 'repository' || record.sourceType === 'server'
      ? record.sourceType
      : 'none',
    sourceRef: typeof record.sourceRef === 'string' ? record.sourceRef : null,
    archiveUrl: typeof record.archiveUrl === 'string' ? record.archiveUrl : null,
    manifestUrl: typeof record.manifestUrl === 'string' ? record.manifestUrl : null,
    entryFile: typeof record.entryFile === 'string' ? record.entryFile : null,
    runCommands: Array.isArray(record.runCommands) ? record.runCommands.filter((entry): entry is string => typeof entry === 'string') : [],
    fileCount: typeof record.fileCount === 'number' && Number.isFinite(record.fileCount) ? record.fileCount : 0,
    installCommand: typeof record.installCommand === 'string' ? record.installCommand : null,
    buildCommand: typeof record.buildCommand === 'string' ? record.buildCommand : null,
  };
}

function normalizePreviewSummary(value: unknown): OperatorPreviewSummary {
  if (typeof value !== 'object' || value === null) {
    return defaultPreviewSummary();
  }

  const record = value as Partial<OperatorPreviewSummary>;
  return {
    status: record.status === 'building' || record.status === 'verified' || record.status === 'failed'
      ? record.status
      : 'unavailable',
    verified: record.verified === true,
    previewUrl: typeof record.previewUrl === 'string' ? record.previewUrl : null,
    entryFile: typeof record.entryFile === 'string' ? record.entryFile : null,
    assetCount: typeof record.assetCount === 'number' && Number.isFinite(record.assetCount) ? record.assetCount : 0,
    verifiedAt: typeof record.verifiedAt === 'string' ? record.verifiedAt : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
  };
}

function normalizeAuditSummary(value: unknown): OperatorAuditSummary {
  if (typeof value !== 'object' || value === null) {
    return defaultAuditSummary();
  }

  const record = value as Partial<OperatorAuditSummary>;
  return {
    status: record.status === 'running' || record.status === 'completed' || record.status === 'failed'
      ? record.status
      : 'pending',
    host: typeof record.host === 'string' ? record.host : null,
    port: typeof record.port === 'number' && Number.isFinite(record.port) ? record.port : null,
    username: typeof record.username === 'string' ? record.username : null,
    collectedAt: typeof record.collectedAt === 'string' ? record.collectedAt : null,
    os: typeof record.os === 'string' ? record.os : null,
    kernel: typeof record.kernel === 'string' ? record.kernel : null,
    cpu: typeof record.cpu === 'string' ? record.cpu : null,
    memory: typeof record.memory === 'string' ? record.memory : null,
    disk: typeof record.disk === 'string' ? record.disk : null,
    docker: typeof record.docker === 'string' ? record.docker : null,
    compose: typeof record.compose === 'string' ? record.compose : null,
    webServers: Array.isArray(record.webServers) ? record.webServers.filter((entry): entry is string => typeof entry === 'string') : [],
    openPorts: Array.isArray(record.openPorts) ? record.openPorts.filter((entry): entry is string => typeof entry === 'string') : [],
    domains: Array.isArray(record.domains) ? record.domains.filter((entry): entry is string => typeof entry === 'string') : [],
    processes: Array.isArray(record.processes) ? record.processes.filter((entry): entry is string => typeof entry === 'string') : [],
    risks: Array.isArray(record.risks) ? record.risks.filter((entry): entry is string => typeof entry === 'string') : [],
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
  };
}

function normalizeDiagnosticsSummary(value: unknown): OperatorDiagnosticsSummary {
  if (typeof value !== 'object' || value === null) {
    return defaultDiagnosticsSummary();
  }

  const record = value as Partial<OperatorDiagnosticsSummary>;
  return {
    stage: typeof record.stage === 'string' ? record.stage : null,
    headline: typeof record.headline === 'string' && record.headline.trim() ? record.headline : 'No diagnostics yet.',
    detail: typeof record.detail === 'string' && record.detail.trim() ? record.detail : 'This workspace has not produced runtime diagnostics yet.',
    command: typeof record.command === 'string' ? record.command : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
  };
}

function isOperatorJob(value: unknown): value is OperatorJob {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const job = value as Partial<OperatorJob>;
  return typeof job.id === 'string'
    && typeof job.capsuleId === 'string'
    && typeof job.kind === 'string'
    && typeof job.title === 'string'
    && typeof job.status === 'string'
    && typeof job.progress === 'number'
    && typeof job.summary === 'string'
    && typeof job.detail === 'string'
    && Array.isArray(job.steps);
}

function cloneJobStep(step: OperatorJobStep): OperatorJobStep {
  return { ...step };
}

function cloneJob(job: OperatorJob): OperatorJob {
  return {
    ...job,
    steps: job.steps.map((step) => cloneJobStep(step)),
  };
}

function summarizeJob(job: OperatorJob | null | undefined): OperatorJobSummary | null {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    kind: job.kind,
    title: job.title,
    status: job.status,
    progress: job.progress,
    summary: job.summary,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    error: job.error,
  };
}

function jobKindLabel(kind: OperatorJobKind, zh: boolean) {
  const labels: Record<OperatorJobKind, string> = {
    plan_repo: zh ? '项目导入规划' : 'Plan repo import',
    build_repo_preview: zh ? '仓库预览构建' : 'Build repo preview',
    plan_idea: zh ? '想法规划' : 'Plan idea',
    build_idea_preview: zh ? '想法真实生成' : 'Build idea preview',
    scan_server: zh ? '旧服务器体检' : 'Scan server',
    deploy_preview: zh ? '刷新预览' : 'Deploy preview',
    publish_release: zh ? '发布正式版' : 'Publish release',
    diagnose_service: zh ? '服务诊断' : 'Diagnose service',
    repair_service: zh ? '自动修复' : 'Repair service',
    takeover_server: zh ? '接管旧服务器' : 'Take over server',
    migrate_server: zh ? '迁移服务器' : 'Migrate server',
  };
  return labels[kind];
}

function refreshEnvelope(
  record: CapsuleRecord,
  jobs: OperatorJob[],
  confirmation: OperatorConfirmation | null = null,
): OperatorEnvelope {
  return {
    capsule: record.capsule,
    plan: record.plan,
    risk: record.plan.risk,
    requiredConfirmation: confirmation,
    previewUrl: record.capsule.previewUrl,
    productionUrl: record.capsule.productionUrl,
    healthScore: record.capsule.healthScore,
    infraSummary: record.infraSummary,
    logsSummary: record.logsSummary,
    generatedProject: record.generatedProject ?? null,
    truthState: record.capsule.truthState ?? 'planning',
    latestJob: record.capsule.latestJob ?? null,
    jobs,
    artifactSummary: record.artifactSummary,
    previewSummary: record.previewSummary,
    auditSummary: record.auditSummary,
    diagnosticsSummary: record.diagnosticsSummary,
    nextActions: buildNextActions(record.capsule),
  };
}

function buildNextActions(capsule: OperatorCapsule): OperatorActionSummary[] {
  if (capsule.entryKind === 'scan-server') {
    return [
      createAction('diagnose_service', '刷新体检', '重新读取体检结论与接管建议。', 'low'),
      createAction('takeover_server', '接管旧服务器', '让树懒云开始持续接管和审计这台服务器。', 'high', true),
      createAction('migrate_server', '迁移到树懒云', '将旧服务器上的服务迁移到树懒云托管环境。', 'high', true),
      createAction('open_capsule', '查看项目工作区', '进入统一工作区查看历史和建议。', 'low'),
    ];
  }

  const actions: OperatorActionSummary[] = [
    createAction('deploy_preview', capsule.previewUrl ? '刷新预览环境' : '准备预览环境', '生成可访问的预览地址，用于先看结果。', 'low'),
    createAction('diagnose_service', '诊断服务', '读取当前状态并给出修复建议。', 'low'),
    createAction('repair_service', '自动修复', '对常见启动、配置和探针问题执行低风险修复。', 'low'),
    createAction('open_capsule', '查看项目工作区', '查看完整计划、域名、日志、历史和后续动作。', 'low'),
  ];

  if (capsule.productionUrl) {
    actions.splice(1, 0, createAction('rollback_release', '回滚发布', '回到上一个稳定版本。', 'high', true));
  } else {
    actions.splice(1, 0, createAction('publish_release', '发布正式版', '把当前结果切换到正式访问地址。', 'high', true));
  }

  return actions;
}

function buildConfirmation(
  pending: PendingConfirmationRecord | null,
): OperatorConfirmation | null {
  if (!pending) {
    return null;
  }

  return {
    token: pending.token,
    action: pending.action,
    label: pending.label,
    expiresAt: new Date(pending.expiresAt).toISOString(),
  };
}

export function createOperatorEngine(options: OperatorEngineOptions = {}): OperatorEngine {
  const previewDomainSuffix = trimText(options.previewDomainSuffix) || defaultPreviewDomain;
  const previewBaseUrl = trimText(options.previewBaseUrl).replace(/\/+$/, '') || null;
  const artifactBaseUrl = trimText(options.artifactBaseUrl).replace(/\/+$/, '') || previewBaseUrl;
  const productionDomainSuffix = trimText(options.productionDomainSuffix) || defaultProductionDomain;
  const confirmationTtlMs = options.confirmationTtlMs ?? 10 * 60 * 1000;
  const stateFilePath = trimText(options.stateFilePath) || null;
  const generatedProjectsRoot = trimText(options.generatedProjectsRoot)
    || (stateFilePath ? join(dirname(stateFilePath), 'generated-projects') : null);
  const previewBuildNodeModulesPath = trimText(options.previewBuildNodeModulesPath) || null;
  const executionProviders = (options.executionProviders ?? []).filter((provider) => (
    trimText(provider.apiKey) !== ''
    && trimText(provider.model) !== ''
    && trimText(provider.baseUrl) !== ''
  ));
  const capsules = new Map<string, CapsuleRecord>();
  const confirmations = new Map<string, PendingConfirmationRecord>();
  const generationTasks = new Map<string, OperatorGenerationTask>();
  const jobs = new Map<string, OperatorJob>();
  const connectorSecrets = new Map<string, RemoteExecConnector>();
  const previewRuntimes = new Map<string, WorkspacePreviewRuntime>();

  function stopWorkspacePreviewRuntime(capsuleId: string) {
    const runtime = previewRuntimes.get(capsuleId);
    if (!runtime) {
      return false;
    }

    previewRuntimes.delete(capsuleId);
    runtime.child.kill('SIGTERM');
    return true;
  }

  function reservePreviewPort() {
    return new Promise<number>((resolvePort, reject) => {
      const server = createNetServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          if (!port) {
            reject(new Error('preview_port_unavailable'));
            return;
          }
          resolvePort(port);
        });
      });
    });
  }

  async function waitForPreviewRuntime(url: string, timeoutMs = 25_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = 'preview_runtime_not_ready';

    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
        });
        if (response.status < 500) {
          return;
        }
        lastError = `preview_runtime_http_${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }

    throw new Error(lastError);
  }

  async function startWorkspacePreviewRuntime(
    record: CapsuleRecord,
    input: {
      command: string;
      args: string[];
      cwd: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {
    stopWorkspacePreviewRuntime(record.capsule.id);

    const port = await reservePreviewPort();
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      previewRuntimes.delete(record.capsule.id);
      throw error;
    });
    child.on('close', () => {
      previewRuntimes.delete(record.capsule.id);
      if (!settled && stderr.trim()) {
        record.previewSummary.lastError = stderr.trim();
        updateDiagnostics(record, {
          stage: 'preview_runtime',
          headline: /[\u3400-\u9fff]/.test(record.capsule.name) ? '预览运行时已退出' : 'Preview runtime exited',
          detail: stderr.trim(),
          command: `${input.command} ${input.args.join(' ')}`.trim(),
          lastError: stderr.trim(),
        });
      }
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    previewRuntimes.set(record.capsule.id, {
      capsuleId: record.capsule.id,
      port,
      baseUrl,
      kind: 'next-standalone',
      child,
    });

    try {
      await waitForPreviewRuntime(baseUrl);
      settled = true;
      return baseUrl;
    } catch (error) {
      stopWorkspacePreviewRuntime(record.capsule.id);
      throw error;
    }
  }

  function rememberConnectorSecret(capsuleId: string, connector: RemoteExecConnector) {
    connectorSecrets.set(capsuleId, { ...connector });
  }

  function resolveActionConnector(record: CapsuleRecord) {
    const persisted = record.capsule.connector;
    if (!persisted) {
      return null;
    }

    const secret = connectorSecrets.get(record.capsule.id);
    if (secret) {
      return { ...secret };
    }

    if (persisted.mode === 'agent' && process.env.SSH_AUTH_SOCK) {
      return {
        host: persisted.host,
        port: persisted.port,
        username: persisted.username,
        agentSocket: process.env.SSH_AUTH_SOCK,
        readyTimeoutMs: 20_000,
      } satisfies RemoteExecConnector;
    }

    return null;
  }

  function cloneGenerationTask(task: OperatorGenerationTask): OperatorGenerationTask {
    return {
      ...task,
      steps: task.steps.map((step) => ({ ...step })),
    };
  }

  function listJobsForCapsule(capsuleId: string) {
    return [...jobs.values()]
      .filter((job) => job.capsuleId === capsuleId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((job) => cloneJob(job));
  }

  function getLatestJobForCapsule(capsuleId: string) {
    return listJobsForCapsule(capsuleId)[0] ?? null;
  }

  function syncCapsuleJobSummary(capsuleId: string) {
    const record = capsules.get(capsuleId);
    if (!record) {
      return;
    }
    record.capsule.latestJob = summarizeJob(getLatestJobForCapsule(capsuleId));
  }

  function updateWorkspaceTruth(record: CapsuleRecord) {
    const latestJob = getLatestJobForCapsule(record.capsule.id);
    record.capsule.latestJob = summarizeJob(latestJob);

    if (record.capsule.productionUrl) {
      record.capsule.truthState = 'production_live';
      return;
    }
    if (latestJob?.status === 'running' || latestJob?.status === 'queued') {
      record.capsule.truthState = 'job_running';
      return;
    }
    if (record.auditSummary.status === 'completed') {
      record.capsule.truthState = 'audit_ready';
      return;
    }
    if (record.auditSummary.status === 'failed') {
      record.capsule.truthState = 'audit_failed';
      return;
    }
    if (record.previewSummary.status === 'verified') {
      record.capsule.truthState = 'preview_ready';
      return;
    }
    if (record.previewSummary.status === 'failed') {
      record.capsule.truthState = 'preview_failed';
      return;
    }
    if (record.capsule.status === 'needs_attention') {
      record.capsule.truthState = 'needs_attention';
      return;
    }
    record.capsule.truthState = 'planning';
  }

  function createJob(input: {
    capsuleId: string;
    kind: OperatorJobKind;
    title: string;
    summary: string;
    detail: string;
    progress?: number;
    steps: Array<{
      title: string;
      detail: string;
    }>;
  }) {
    const createdAt = nowIso();
    const job: OperatorJob = {
      id: createId('job'),
      capsuleId: input.capsuleId,
      kind: input.kind,
      title: input.title,
      status: 'queued',
      progress: input.progress ?? 4,
      summary: input.summary,
      detail: input.detail,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      error: null,
      steps: input.steps.map((step) => ({
        id: createId('job-step'),
        title: step.title,
        detail: step.detail,
        status: 'planned',
        startedAt: null,
        completedAt: null,
        stdout: null,
        stderr: null,
        exitCode: null,
      })),
    };
    jobs.set(job.id, job);
    syncCapsuleJobSummary(input.capsuleId);
    const record = capsules.get(input.capsuleId);
    if (record) {
      updateWorkspaceTruth(record);
    }
    persistState();
    return cloneJob(job);
  }

  function updateJob(jobId: string, updater: (job: OperatorJob) => void) {
    const job = jobs.get(jobId);
    if (!job) {
      return null;
    }
    updater(job);
    job.updatedAt = nowIso();
    syncCapsuleJobSummary(job.capsuleId);
    const record = capsules.get(job.capsuleId);
    if (record) {
      updateWorkspaceTruth(record);
    }
    persistState();
    return job;
  }

  function markJobStage(
    jobId: string,
    input: {
      status: OperatorJobStatus;
      progress: number;
      summary: string;
      detail: string;
      error?: string | null;
      activeStepIndex?: number;
      result?: RemoteExecStepResult | null;
    },
  ) {
    updateJob(jobId, (job) => {
      job.status = input.status;
      job.progress = input.progress;
      job.summary = input.summary;
      job.detail = input.detail;
      job.error = input.error ?? null;

      if (typeof input.activeStepIndex === 'number') {
        const activeStepIndex = input.activeStepIndex;
        job.steps.forEach((step, index) => {
          if (index < activeStepIndex) {
            step.status = 'completed';
            step.completedAt ??= nowIso();
          } else if (index === activeStepIndex) {
            step.status = input.status === 'failed' ? 'attention' : input.status === 'completed' ? 'completed' : 'in_progress';
            step.startedAt ??= nowIso();
            if (input.status === 'completed' || input.status === 'failed') {
              step.completedAt = nowIso();
            }
            if (input.result) {
              step.stdout = input.result.stdout;
              step.stderr = input.result.stderr;
              step.exitCode = input.result.exitCode;
            }
          } else if (input.status === 'completed') {
            step.status = 'completed';
            step.startedAt ??= nowIso();
            step.completedAt = nowIso();
          }
        });
      }

      if (input.status === 'running' && typeof input.activeStepIndex === 'number') {
        const activeStepIndex = input.activeStepIndex;
        const step = job.steps[activeStepIndex];
        if (step) {
          step.status = 'in_progress';
          step.startedAt ??= nowIso();
        }
      }

      if (input.status === 'completed' || input.status === 'failed' || input.status === 'blocked') {
        job.completedAt = nowIso();
      }
    });
  }

  function recordJobStepResult(
    jobId: string,
    stepIndex: number,
    result: {
      stdout?: string | null;
      stderr?: string | null;
      exitCode?: number | null;
    } | null,
    next: {
      status: OperatorJobStatus;
      progress: number;
      summary: string;
      detail: string;
      error?: string | null;
    },
  ) {
    updateJob(jobId, (job) => {
      job.status = next.status;
      job.progress = next.progress;
      job.summary = next.summary;
      job.detail = next.detail;
      job.error = next.error ?? null;
      job.completedAt = next.status === 'completed' || next.status === 'failed' || next.status === 'blocked'
        ? nowIso()
        : null;

      job.steps.forEach((step, index) => {
        if (index < stepIndex) {
          step.status = 'completed';
          step.startedAt ??= nowIso();
          step.completedAt ??= nowIso();
        } else if (index === stepIndex) {
          step.status = next.status === 'failed' ? 'attention' : 'completed';
          step.startedAt ??= nowIso();
          step.completedAt = nowIso();
          if (result) {
            step.stdout = result.stdout ?? null;
            step.stderr = result.stderr ?? null;
            step.exitCode = result.exitCode ?? null;
          }
        } else if (next.status === 'completed') {
          step.status = 'completed';
          step.startedAt ??= nowIso();
          step.completedAt ??= nowIso();
        }
      });
    });
  }

  function buildGenerationTask(
    input: GenerateProjectInput,
    requestedName: string,
  ): OperatorGenerationTask {
    const locale = detectGenerateProjectLocale(input);
    const zh = locale === 'zh-CN';
    const createdAt = nowIso();

    return {
      id: createId('task'),
      title: requestedName,
      status: 'queued',
      progress: 4,
      summary: zh ? '任务已经排队，马上开始整理需求和生成方案。' : 'The task is queued and will start planning shortly.',
      detail: zh ? '准备读取目标、受众和商业目标。' : 'Preparing to read the goal, audience, and business goal.',
      capsuleId: null,
      capsulePath: null,
      previewUrl: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      error: null,
      steps: [
        {
          id: createId('task-step'),
          title: zh ? '整理目标' : 'Capture intent',
          status: 'planned',
          detail: zh ? '分析你想做的应用、受众和目标。' : 'Analyze the app idea, audience, and business goal.',
        },
        {
          id: createId('task-step'),
          title: zh ? '模型规划' : 'Plan with model',
          status: 'planned',
          detail: zh ? '让模型决定首版结构、交互和页面重点。' : 'Ask the model to shape the first-version structure and interaction.',
        },
        {
          id: createId('task-step'),
          title: zh ? '模型编码' : 'Generate source bundle',
          status: 'planned',
          detail: zh ? '生成真实源码文件，而不是只给摘要海报。' : 'Generate real source files instead of a summary poster.',
        },
        {
          id: createId('task-step'),
          title: zh ? '构建预览' : 'Build preview',
          status: 'planned',
          detail: zh ? '编译并预热共享预览地址。' : 'Compile and warm the shared preview URL.',
        },
      ],
    };
  }

  function updateGenerationTask(
    taskId: string,
    updater: (task: OperatorGenerationTask) => void,
  ) {
    const task = generationTasks.get(taskId);
    if (!task) {
      return null;
    }

    updater(task);
    task.updatedAt = nowIso();
    persistState();
    return task;
  }

  function markGenerationTaskStage(
    taskId: string,
    stage: OperatorGenerationTaskStatus,
    input: {
      progress: number;
      summary: string;
      detail: string;
      error?: string | null;
    },
  ) {
    updateGenerationTask(taskId, (task) => {
      task.status = stage;
      task.progress = input.progress;
      task.summary = input.summary;
      task.detail = input.detail;
      task.error = input.error ?? null;

      if (stage === 'planning') {
        task.steps[0]!.status = 'completed';
        task.steps[1]!.status = 'in_progress';
      } else if (stage === 'coding') {
        task.steps[0]!.status = 'completed';
        task.steps[1]!.status = 'completed';
        task.steps[2]!.status = 'in_progress';
      } else if (stage === 'building_preview') {
        task.steps[0]!.status = 'completed';
        task.steps[1]!.status = 'completed';
        task.steps[2]!.status = 'completed';
        task.steps[3]!.status = 'in_progress';
      } else if (stage === 'completed') {
        task.steps.forEach((step) => { step.status = 'completed'; });
        task.completedAt = nowIso();
      } else if (stage === 'failed') {
        const activeStep = [...task.steps].reverse().find((step) => step.status === 'in_progress')
          ?? task.steps.find((step) => step.status === 'planned')
          ?? task.steps.at(-1)
          ?? null;
        if (activeStep) {
          activeStep.status = 'attention';
        }
        task.completedAt = nowIso();
      }
    });
  }

  function buildPreviewUrl(slug: string) {
    if (previewBaseUrl) {
      return `${previewBaseUrl}/api/v1/operator/previews/${encodeURIComponent(slug)}`;
    }

    return previewUrlFor(slug, previewDomainSuffix);
  }

  function alignPreviewUrlWithSlug(record: CapsuleRecord) {
    if (record.capsule.entryKind === 'scan-server') {
      return false;
    }

    if (record.previewSummary.status === 'unavailable' && !record.capsule.productionUrl) {
      return false;
    }

    const expectedPreviewUrl = buildPreviewUrl(record.capsule.slug);
    if (record.capsule.previewUrl === expectedPreviewUrl) {
      return false;
    }

    record.capsule.previewUrl = expectedPreviewUrl;
    record.infraSummary.endpoint = expectedPreviewUrl;
    return true;
  }

  function inferGenerationSource(record: CapsuleRecord): OperatorGenerationSource | null {
    if (record.capsule.entryKind !== 'generate-from-idea' || !record.generatedProject) {
      return null;
    }

    if (record.capsule.generationSource === 'model' || record.capsule.generationSource === 'template') {
      return record.capsule.generationSource;
    }

    if (record.generatedRecipe?.kind === 'battle-game' || record.generatedRecipe?.kind === 'snake-game') {
      return 'template';
    }

    return null;
  }

  function normalizeRecord(record: CapsuleRecord) {
    let changed = false;
    const generationSource = inferGenerationSource(record);
    if (generationSource && record.capsule.generationSource !== generationSource) {
      record.capsule.generationSource = generationSource;
      changed = true;
    }

    const nextArtifactSummary = normalizeArtifactSummary(record.artifactSummary);
    if (JSON.stringify(nextArtifactSummary) !== JSON.stringify(record.artifactSummary)) {
      record.artifactSummary = nextArtifactSummary;
      changed = true;
    }

    const nextPreviewSummary = normalizePreviewSummary(record.previewSummary);
    if (JSON.stringify(nextPreviewSummary) !== JSON.stringify(record.previewSummary)) {
      record.previewSummary = nextPreviewSummary;
      changed = true;
    }

    const nextAuditSummary = normalizeAuditSummary(record.auditSummary);
    if (JSON.stringify(nextAuditSummary) !== JSON.stringify(record.auditSummary)) {
      record.auditSummary = nextAuditSummary;
      changed = true;
    }

    const nextDiagnosticsSummary = normalizeDiagnosticsSummary(record.diagnosticsSummary);
    if (JSON.stringify(nextDiagnosticsSummary) !== JSON.stringify(record.diagnosticsSummary)) {
      record.diagnosticsSummary = nextDiagnosticsSummary;
      changed = true;
    }

    updateWorkspaceTruth(record);
    return changed;
  }

  function isEphemeralProxyPreview(record: CapsuleRecord) {
    return record.artifactSummary.entryFile === '.next/BUILD_ID'
      && record.artifactSummary.runCommands.some((command) => command.includes('npm run start'));
  }

  function invalidateVolatilePreviewRuntime(record: CapsuleRecord) {
    if (!isEphemeralProxyPreview(record) || previewRuntimes.has(record.capsule.id)) {
      return false;
    }

    let changed = false;
    const restartMessage = 'preview_runtime_interrupted_by_restart';
    if (record.previewSummary.status === 'verified' || record.previewSummary.status === 'building') {
      record.previewSummary = {
        ...record.previewSummary,
        status: 'failed',
        verified: false,
        previewUrl: null,
        verifiedAt: null,
        lastError: restartMessage,
      };
      changed = true;
    }

    const releaseUrl = buildReleaseUrl(record.capsule.slug);
    if (releaseUrl && record.capsule.productionUrl === releaseUrl) {
      record.capsule.productionUrl = null;
      record.infraSummary.productionEndpoint = null;
      changed = true;
    }

    if (record.capsule.status === 'preview_live' || record.capsule.status === 'production_live') {
      record.capsule.status = 'needs_attention';
      changed = true;
    }

    if (changed) {
      updateDiagnostics(record, {
        stage: 'preview_runtime',
        headline: /[\u3400-\u9fff]/.test(`${record.capsule.name} ${record.capsule.summary}`)
          ? '预览运行时已中断'
          : 'Preview runtime was interrupted',
        detail: /[\u3400-\u9fff]/.test(`${record.capsule.name} ${record.capsule.summary}`)
          ? 'API 重启后，内存中的 Next 预览运行时已经丢失，需要重新执行预览任务。'
          : 'The in-memory Next.js preview runtime was lost after an API restart. Run the preview job again.',
        command: 'deploy_preview',
        lastError: restartMessage,
      });
      record.logsSummary.headline = /[\u3400-\u9fff]/.test(`${record.capsule.name} ${record.capsule.summary}`)
        ? '预览运行时已中断，需要重新拉起。'
        : 'Preview runtime was interrupted and must be started again.';
    }

    return changed;
  }

  function buildEnvelope(record: CapsuleRecord, confirmation: OperatorConfirmation | null = null) {
    if (alignPreviewUrlWithSlug(record)) {
      persistState();
    }

    updateWorkspaceTruth(record);
    return refreshEnvelope(record, listJobsForCapsule(record.capsule.id), confirmation);
  }

  function shouldRefreshPreviewUrl(value: string | null) {
    return !value || Boolean(previewBaseUrl && !value.startsWith(`${previewBaseUrl}/`));
  }

  function buildGeneratedProjectArchiveUrl(capsuleRef: string) {
    if (!artifactBaseUrl) {
      return null;
    }

    return `${artifactBaseUrl}/api/v1/operator/generated-projects/${encodeURIComponent(capsuleRef)}/archive`;
  }

  function buildGeneratedProjectManifestUrl(capsuleRef: string) {
    if (!artifactBaseUrl) {
      return null;
    }

    return `${artifactBaseUrl}/api/v1/operator/generated-projects/${encodeURIComponent(capsuleRef)}`;
  }

  function buildWorkspaceManifestUrl(capsuleRef: string) {
    if (!artifactBaseUrl) {
      return null;
    }

    return `${artifactBaseUrl}/api/v1/operator/workspaces/${encodeURIComponent(capsuleRef)}`;
  }

  function buildWorkspaceArchiveUrl(capsuleRef: string) {
    if (!artifactBaseUrl) {
      return null;
    }

    return `${artifactBaseUrl}/api/v1/operator/workspaces/${encodeURIComponent(capsuleRef)}/archive`;
  }

  function buildReleaseUrl(capsuleRef: string) {
    if (!artifactBaseUrl) {
      return null;
    }

    return `${artifactBaseUrl}/api/v1/operator/releases/${encodeURIComponent(capsuleRef)}`;
  }

  function isCapsuleRecord(value: unknown): value is CapsuleRecord {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Partial<CapsuleRecord>;
    return typeof record.capsule === 'object'
      && record.capsule !== null
      && typeof record.capsule.id === 'string'
      && typeof record.plan === 'object'
      && record.plan !== null
      && typeof record.infraSummary === 'object'
      && record.infraSummary !== null
      && typeof record.logsSummary === 'object'
      && record.logsSummary !== null;
  }

  function isGenerationTask(value: unknown): value is OperatorGenerationTask {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const task = value as Partial<OperatorGenerationTask>;
    return typeof task.id === 'string'
      && typeof task.title === 'string'
      && typeof task.status === 'string'
      && typeof task.progress === 'number'
      && typeof task.summary === 'string'
      && typeof task.detail === 'string'
      && Array.isArray(task.steps);
  }

  function persistState() {
    if (!stateFilePath) {
      return;
    }

    const payload: OperatorStateFile = {
      version: 3,
      records: [...capsules.values()],
      generationTasks: [...generationTasks.values()].map((task) => cloneGenerationTask(task)),
      jobs: [...jobs.values()].map((job) => cloneJob(job)),
    };

    try {
      mkdirSync(dirname(stateFilePath), { recursive: true });
      writeFileSync(stateFilePath, JSON.stringify(payload, null, 2));
    } catch {
      // Persistence is best-effort for local development; the API should still serve requests.
    }
  }

  function hydrateState() {
    if (!stateFilePath || !existsSync(stateFilePath)) {
      return;
    }

    try {
      const payload = JSON.parse(readFileSync(stateFilePath, 'utf8')) as Partial<OperatorStateFile>;
      const records = Array.isArray(payload.records) ? payload.records : [];
      const tasks = Array.isArray(payload.generationTasks) ? payload.generationTasks : [];
      const storedJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      let needsPersist = false;

      for (const record of records) {
        if (isCapsuleRecord(record)) {
          record.artifactSummary = normalizeArtifactSummary(record.artifactSummary);
          record.previewSummary = normalizePreviewSummary(record.previewSummary);
          record.auditSummary = normalizeAuditSummary(record.auditSummary);
          record.diagnosticsSummary = normalizeDiagnosticsSummary(record.diagnosticsSummary);
          record.capsule.truthState ??= 'planning';
          record.capsule.latestJob ??= null;
          if (invalidateVolatilePreviewRuntime(record)) {
            needsPersist = true;
          }
          if (alignPreviewUrlWithSlug(record)) {
            needsPersist = true;
          }
          if (normalizeRecord(record)) {
            needsPersist = true;
          }
          capsules.set(record.capsule.id, record);
        }
      }

      for (const task of tasks) {
        if (!isGenerationTask(task)) {
          continue;
        }

        const hydrated = cloneGenerationTask(task);
        if (hydrated.status !== 'completed' && hydrated.status !== 'failed') {
          hydrated.status = 'failed';
          hydrated.progress = Math.max(hydrated.progress, 92);
          hydrated.error = hydrated.error || 'operator_restart_interrupted_task';
          hydrated.summary = /[\u3400-\u9fff]/.test(hydrated.title)
            ? '服务重启前任务尚未完成，请重新发起一次生成。'
            : 'This task was interrupted by an API restart. Please start it again.';
          hydrated.detail = /[\u3400-\u9fff]/.test(hydrated.title)
            ? '运行中的生成任务暂时还不能跨重启恢复。'
            : 'In-flight generation tasks cannot be resumed across restarts yet.';
          hydrated.completedAt = nowIso();
          const activeStep = [...hydrated.steps].reverse().find((step) => step.status === 'in_progress')
            ?? hydrated.steps.find((step) => step.status === 'planned')
            ?? hydrated.steps.at(-1)
            ?? null;
          if (activeStep) {
            activeStep.status = 'attention';
          }
          needsPersist = true;
        }
        generationTasks.set(hydrated.id, hydrated);
      }

      for (const job of storedJobs) {
        if (!isOperatorJob(job)) {
          continue;
        }

        const hydratedJob = cloneJob(job);
        if (hydratedJob.status === 'queued' || hydratedJob.status === 'running') {
          hydratedJob.status = 'failed';
          hydratedJob.progress = Math.max(hydratedJob.progress, 96);
          hydratedJob.error = hydratedJob.error || 'operator_restart_interrupted_job';
          hydratedJob.summary = hydratedJob.summary || 'This job was interrupted by an API restart.';
          hydratedJob.detail = hydratedJob.detail || 'In-flight jobs cannot be resumed across restarts yet.';
          hydratedJob.completedAt = nowIso();
          const activeStep = [...hydratedJob.steps].reverse().find((step) => step.status === 'in_progress')
            ?? hydratedJob.steps.find((step) => step.status === 'planned')
            ?? hydratedJob.steps.at(-1)
            ?? null;
          if (activeStep) {
            activeStep.status = 'attention';
            activeStep.completedAt = nowIso();
          }
          needsPersist = true;
        }
        jobs.set(hydratedJob.id, hydratedJob);
      }

      for (const record of capsules.values()) {
        updateWorkspaceTruth(record);
      }

      if (needsPersist) {
        persistState();
      }
    } catch {
      capsules.clear();
    }
  }

  function addEvent(record: CapsuleRecord, level: OperatorLogLevel, message: string) {
    const event = {
      id: createId('event'),
      level,
      message,
      createdAt: nowIso(),
    };
    record.capsule.recentEvents = [event, ...record.capsule.recentEvents].slice(0, 8);
    record.logsSummary.entries = [event, ...record.logsSummary.entries].slice(0, 8);
    record.capsule.updatedAt = event.createdAt;
  }

  function createPlanRecord(input: {
    name: string;
    entryKind: OperatorEntryKind;
    stack: StackDescriptor;
    summary: string;
    source: OperatorCapsule['source'];
    connector: OperatorServerConnector | null;
    status: OperatorCapsuleStatus;
    healthScore: number;
    previewUrl: string | null;
    productionUrl: string | null;
    plan: OperatorExecutionPlan;
    logsHeadline: string;
    logs: OperatorLogEntry[];
    infraItems: OperatorInfraItem[];
    region?: string;
  }): CapsuleRecord {
    const id = createId('capsule');
    const baseSlug = slugify(input.name, id.toLowerCase());
    const slug = capsules.has(id) || [...capsules.values()].some((record) => record.capsule.slug === baseSlug)
      ? `${baseSlug}-${id.slice(-4)}`
      : baseSlug;
    const createdAt = nowIso();
    const record: CapsuleRecord = {
      capsule: {
        id,
        name: input.name,
        slug,
        entryKind: input.entryKind,
        generationSource: null,
        status: input.status,
        headline: input.plan.title,
        summary: input.summary,
        stackLabel: input.stack.label,
        healthScore: input.healthScore,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        source: input.source,
        connector: input.connector,
        createdAt,
        updatedAt: createdAt,
        recentEvents: [...input.logs],
        truthState: 'planning',
        latestJob: null,
      },
      plan: input.plan,
      infraSummary: {
        runtime: input.stack.runtime,
        region: input.region ?? input.stack.defaultRegion,
        estimatedMonthlyCost: input.stack.monthlyCost,
        endpoint: input.previewUrl,
        productionEndpoint: input.productionUrl,
        items: [...input.infraItems],
      },
      logsSummary: {
        headline: input.logsHeadline,
        entries: [...input.logs],
      },
      generatedProject: null,
      generatedRecipe: null,
      artifactSummary: defaultArtifactSummary(input.entryKind === 'upload-project' ? 'repository' : input.entryKind === 'scan-server' ? 'server' : 'generated'),
      previewSummary: {
        ...defaultPreviewSummary(),
        status: input.previewUrl ? 'verified' : 'unavailable',
        verified: Boolean(input.previewUrl),
        previewUrl: input.previewUrl,
        verifiedAt: input.previewUrl ? createdAt : null,
      },
      auditSummary: {
        ...defaultAuditSummary(),
        host: input.source.serverHost,
        port: input.connector?.port ?? null,
        username: input.connector?.username ?? null,
        status: input.entryKind === 'scan-server' ? 'pending' : 'pending',
      },
      diagnosticsSummary: defaultDiagnosticsSummary(),
    };
    alignPreviewUrlWithSlug(record);
    record.artifactSummary.sourceRef = input.source.repoUrl ?? input.source.idea ?? input.source.serverHost ?? null;
    capsules.set(id, record);
    updateWorkspaceTruth(record);
    persistState();
    return record;
  }

  function ensureGeneratedProjectDirectory(capsuleId: string) {
    if (!generatedProjectsRoot) {
      return null;
    }

    const root = join(generatedProjectsRoot, capsuleId);
    const sourceRoot = join(root, 'source');
    mkdirSync(sourceRoot, { recursive: true });
    return {
      root,
      sourceRoot,
      archivePath: join(root, 'project.tar.gz'),
    };
  }

  async function runLocalCommand(input: {
    command: string;
    args: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  }) {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out: ${input.command} ${input.args.join(' ')}`));
      }, input.timeoutMs ?? 10 * 60 * 1000);
      timeout.unref?.();

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      });
      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
        });
      });
    });
  }

  function countFilesInDirectory(root: string) {
    if (!existsSync(root)) {
      return 0;
    }

    let count = 0;
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        const absolutePath = join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(absolutePath);
        } else if (entry.isFile()) {
          count += 1;
        }
      }
    }

    return count;
  }

  function collapseSingleExtractedRoot(root: string) {
    const entries = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.name !== '.DS_Store');
    if (entries.length !== 1 || !entries[0]?.isDirectory()) {
      return root;
    }

    const nestedRoot = join(root, entries[0].name);
    for (const entry of readdirSync(nestedRoot, { withFileTypes: true })) {
      cpSync(join(nestedRoot, entry.name), join(root, entry.name), { recursive: true, force: true });
    }
    rmSync(nestedRoot, { recursive: true, force: true });
    return root;
  }

  function detectRepoBuildPlan(sourceRoot: string, slug: string): RepoBuildPlan | null {
    const packageJsonPath = join(sourceRoot, 'package.json');
    const indexHtmlPath = join(sourceRoot, 'index.html');
    const viteConfigPresent = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs']
      .some((filename) => existsSync(join(sourceRoot, filename)));
    const nextConfigPresent = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs']
      .some((filename) => existsSync(join(sourceRoot, filename)));

    if (existsSync(packageJsonPath)) {
      let packageJson: Record<string, unknown> = {};
      try {
        packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
      } catch {
        packageJson = {};
      }
      const scripts = typeof packageJson.scripts === 'object' && packageJson.scripts !== null
        ? packageJson.scripts as Record<string, unknown>
        : {};
      const dependencies = {
        ...(typeof packageJson.dependencies === 'object' && packageJson.dependencies !== null
          ? packageJson.dependencies as Record<string, unknown>
          : {}),
        ...(typeof packageJson.devDependencies === 'object' && packageJson.devDependencies !== null
          ? packageJson.devDependencies as Record<string, unknown>
          : {}),
      };

      if (
        nextConfigPresent
        || typeof dependencies.next === 'string'
        || (typeof scripts.build === 'string' && String(scripts.build).includes('next build'))
      ) {
        return {
          runtimeLabel: 'Next.js',
          installCommand: 'npm install',
          buildCommand: 'npm run build',
          runCommands: ['npm install', 'npm run build', 'PORT=3000 npm run start'],
          entryFile: '.next/BUILD_ID',
          previewKind: 'proxy',
          async build() {
            const install = await runLocalCommand({
              command: 'npm',
              args: ['install'],
              cwd: sourceRoot,
              timeoutMs: 8 * 60 * 1000,
            });
            if (install.exitCode !== 0) {
              throw new Error((install.stderr || install.stdout || 'npm install failed').trim());
            }

            const build = await runLocalCommand({
              command: 'npm',
              args: ['run', 'build'],
              cwd: sourceRoot,
              timeoutMs: 10 * 60 * 1000,
            });
            if (build.exitCode !== 0) {
              throw new Error((build.stderr || build.stdout || 'next build failed').trim());
            }

            const buildIdPath = join(sourceRoot, '.next', 'BUILD_ID');
            if (!existsSync(buildIdPath)) {
              throw new Error('next_build_output_missing');
            }

            return {
              install,
              build,
            };
          },
          async startPreviewRuntime(record) {
            const runtimeRoot = join(sourceRoot, '.next', 'standalone');
            const serverPath = join(runtimeRoot, 'server.js');
            if (existsSync(serverPath)) {
              return startWorkspacePreviewRuntime(record, {
                command: 'node',
                args: ['server.js'],
                cwd: runtimeRoot,
                env: {
                  NEXT_TELEMETRY_DISABLED: '1',
                },
              });
            }

            return startWorkspacePreviewRuntime(record, {
              command: 'npm',
              args: ['run', 'start', '--', '--hostname', '127.0.0.1'],
              cwd: sourceRoot,
              env: {
                NEXT_TELEMETRY_DISABLED: '1',
              },
            });
          },
        };
      }

      if (viteConfigPresent || typeof dependencies.vite === 'string' || typeof scripts.dev === 'string' && String(scripts.dev).includes('vite')) {
        return {
          runtimeLabel: 'Vite',
          installCommand: 'npm install',
          buildCommand: 'vite build',
          runCommands: ['npm install', 'npm run dev'],
          entryFile: 'index.html',
          previewKind: 'static',
          async build(buildRoot: string) {
            const install = await runLocalCommand({
              command: 'npm',
              args: ['install'],
              cwd: sourceRoot,
              timeoutMs: 8 * 60 * 1000,
            });
            if (install.exitCode !== 0) {
              throw new Error((install.stderr || install.stdout || 'npm install failed').trim());
            }

            const viteCliPath = join(sourceRoot, 'node_modules', 'vite', 'bin', 'vite.js');
            if (!existsSync(viteCliPath)) {
              throw new Error('vite_cli_not_found_after_install');
            }

            const build = await runLocalCommand({
              command: 'node',
              args: [
                viteCliPath,
                'build',
                '--outDir',
                buildRoot,
                '--emptyOutDir',
                '--base',
                `/api/v1/operator/previews/${slug}/`,
              ],
              cwd: sourceRoot,
              timeoutMs: 8 * 60 * 1000,
            });
            if (build.exitCode !== 0) {
              throw new Error((build.stderr || build.stdout || 'vite build failed').trim());
            }

            return {
              install,
              build,
            };
          },
        };
      }
    }

    if (existsSync(indexHtmlPath)) {
      return {
        runtimeLabel: 'Static site',
        installCommand: null,
        buildCommand: null,
        runCommands: ['serve .'],
        entryFile: 'index.html',
        previewKind: 'static',
        async build(buildRoot: string) {
          rmSync(buildRoot, { recursive: true, force: true });
          mkdirSync(buildRoot, { recursive: true });
          for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
            if (entry.name === '.git' || entry.name === 'node_modules') {
              continue;
            }
            cpSync(join(sourceRoot, entry.name), join(buildRoot, entry.name), { recursive: true, force: true });
          }
          return {
            install: null,
            build: {
              stdout: 'static_files_copied',
              stderr: '',
              exitCode: 0,
            },
          };
        },
      };
    }

    return null;
  }

  function inferAudienceForRecord(record: CapsuleRecord) {
    if (trimText(record.generatedRecipe?.audience)) {
      return trimText(record.generatedRecipe?.audience);
    }

    const audienceEntry = record.logsSummary.entries
      .find((entry) => {
        const normalized = entry.message.toLowerCase();
        return normalized.startsWith('primary audience:') || normalized.startsWith('目标受众：');
      });
    if (!audienceEntry) {
      return /[\u3400-\u9fff]/.test(record.capsule.source.idea ?? record.capsule.summary) ? '普通用户' : 'general users';
    }

    return audienceEntry.message
      .replace(/^Primary audience:\s*/i, '')
      .replace(/^目标受众：\s*/i, '')
      .replace(/\.$/, '')
      .trim()
      || 'general users';
  }

  function rebuildGeneratedProjectInput(record: CapsuleRecord): GenerateProjectInput | null {
    const idea = trimText(record.capsule.source.idea) || trimText(record.capsule.summary);
    if (!idea) {
      return null;
    }

    return {
      projectName: record.capsule.name,
      idea,
      audience: inferAudienceForRecord(record),
      businessGoal: trimText(record.generatedRecipe?.goal)
        || (/[\u3400-\u9fff]/.test(idea) ? '低门槛快速上线并可持续运营' : 'launch quickly with low-friction operations'),
    };
  }

  function ensureGeneratedProjectSource(record: CapsuleRecord) {
    if (!record.generatedProject) {
      return null;
    }

    const directory = ensureGeneratedProjectDirectory(record.capsule.id);
    if (!directory) {
      return null;
    }

    const entryPath = join(directory.sourceRoot, record.generatedProject.entryFile);
    if (existsSync(entryPath)) {
      return directory;
    }

    const input = rebuildGeneratedProjectInput(record);
    if (!input) {
      return directory;
    }

    materializeGeneratedProject(record, input);
    return ensureGeneratedProjectDirectory(record.capsule.id);
  }

  function previewBuildRootFor(record: CapsuleRecord): GeneratedProjectPreviewBuild | null {
    const directory = ensureGeneratedProjectDirectory(record.capsule.id);
    if (!directory) {
      return null;
    }

    return {
      directory,
      buildRoot: join(directory.root, 'dist'),
      indexPath: join(directory.root, 'dist', 'index.html'),
      errorPath: join(directory.root, 'preview-build-error.txt'),
    };
  }

  function hasPreviewBuildDependencies(path: string) {
    return existsSync(join(path, 'vite'))
      && existsSync(join(path, 'react'))
      && existsSync(join(path, 'react-dom'));
  }

  function readPreviewBuildError(build: GeneratedProjectPreviewBuild) {
    if (!existsSync(build.errorPath)) {
      return null;
    }

    try {
      const value = readFileSync(build.errorPath, 'utf8').trim();
      return value || null;
    } catch {
      return null;
    }
  }

  function writePreviewBuildError(build: GeneratedProjectPreviewBuild, message: string) {
    try {
      writeFileSync(build.errorPath, message.trim());
      return true;
    } catch {
      return false;
    }
  }

  function clearPreviewBuildError(build: GeneratedProjectPreviewBuild) {
    try {
      writeFileSync(build.errorPath, '');
      return true;
    } catch {
      return false;
    }
  }

  function formatPreviewBuildError(error: unknown) {
    if (!error || typeof error !== 'object') {
      return trimText(String(error)) || 'Unknown preview build error.';
    }

    const maybeError = error as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const parts = [maybeError.stderr, maybeError.stdout, maybeError.message]
      .map((value) => {
        if (typeof value === 'string') {
          return value.trim();
        }
        if (Buffer.isBuffer(value)) {
          return value.toString('utf8').trim();
        }
        return '';
      })
      .filter(Boolean);

    return parts.join('\n\n').trim() || 'Unknown preview build error.';
  }

  function ensurePreviewBuildNodeModules(directory: { sourceRoot: string }) {
    if (!previewBuildNodeModulesPath || !existsSync(previewBuildNodeModulesPath) || !hasPreviewBuildDependencies(previewBuildNodeModulesPath)) {
      return false;
    }

    const target = join(directory.sourceRoot, 'node_modules');
    if (hasPreviewBuildDependencies(target)) {
      return true;
    }

    try {
      rmSync(target, { force: true, recursive: true });
    } catch {
      return hasPreviewBuildDependencies(target);
    }

    try {
      symlinkSync(previewBuildNodeModulesPath, target, 'dir');
    } catch {
      return hasPreviewBuildDependencies(target);
    }

    return hasPreviewBuildDependencies(target);
  }

  function runGeneratedProjectBuild(record: CapsuleRecord, build: GeneratedProjectPreviewBuild) {
    if (!previewBuildNodeModulesPath) {
      writePreviewBuildError(build, 'Preview build dependencies are not configured for the operator runtime.');
      return false;
    }

    const viteCliPath = join(previewBuildNodeModulesPath, 'vite', 'bin', 'vite.js');
    if (!existsSync(viteCliPath) || !ensurePreviewBuildNodeModules(build.directory)) {
      writePreviewBuildError(build, 'Preview build dependencies could not be linked into the generated project.');
      return false;
    }

    try {
      execFileSync('node', [
        viteCliPath,
        'build',
        '--outDir',
        build.buildRoot,
        '--emptyOutDir',
        '--base',
        `/api/v1/operator/previews/${record.capsule.slug}/`,
      ], {
        cwd: build.directory.sourceRoot,
        stdio: 'pipe',
      });
      clearPreviewBuildError(build);
      return true;
    } catch (error) {
      writePreviewBuildError(build, formatPreviewBuildError(error));
      return false;
    }
  }

  function ensureGeneratedProjectPreviewBuild(record: CapsuleRecord) {
    if (!record.generatedProject) {
      return null;
    }

    const build = previewBuildRootFor(record);
    if (!build) {
      return null;
    }

    ensureGeneratedProjectSource(record);
    const generatedAt = Date.parse(record.generatedProject.generatedAt);
    if (existsSync(build.indexPath) && statSync(build.indexPath).mtimeMs >= generatedAt) {
      return build;
    }

    if (runGeneratedProjectBuild(record, build)) {
      return build;
    }

    const refreshedInput = rebuildGeneratedProjectInput(record);
    if (!refreshedInput) {
      return null;
    }

    materializeGeneratedProject(record, refreshedInput);
    const refreshedBuild = previewBuildRootFor(record);
    if (!refreshedBuild) {
      return null;
    }

    if (runGeneratedProjectBuild(record, refreshedBuild)) {
      return refreshedBuild;
    }

    return null;
  }

  function normalizeGeneratedProjectPath(path: string) {
    const trimmed = trimText(path).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!trimmed || trimmed.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      return null;
    }

    return trimmed;
  }

  function generatedProjectContentType(path: string) {
    switch (extname(path).toLowerCase()) {
      case '.js':
      case '.mjs':
        return 'text/javascript; charset=utf-8';
      case '.css':
        return 'text/css; charset=utf-8';
      case '.html':
        return 'text/html; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.woff2':
        return 'font/woff2';
      default:
        return 'application/octet-stream';
    }
  }

  function writeGeneratedProjectFiles(sourceRoot: string, template: GeneratedProjectTemplate) {
    for (const file of template.files) {
      const absolutePath = join(sourceRoot, file.path);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, file.content);
    }
  }

  function ensureGeneratedProjectArchive(capsuleId: string) {
    const directory = ensureGeneratedProjectDirectory(capsuleId);
    if (!directory) {
      return null;
    }

    try {
      execFileSync('tar', ['-czf', directory.archivePath, '-C', directory.sourceRoot, '.']);
      return directory.archivePath;
    } catch {
      return null;
    }
  }

  function materializeGeneratedProject(
    record: CapsuleRecord,
    input: GenerateProjectInput,
    templateOverride: GeneratedProjectTemplate | null = null,
  ) {
    const directory = ensureGeneratedProjectDirectory(record.capsule.id);
    if (!directory) {
      return null;
    }

    const recipe = record.generatedRecipe ?? null;
    const inferredStack = inferStack([
      trimText(recipe?.stackHint),
      record.capsule.name,
      record.capsule.stackLabel,
      input.idea,
      trimText(input.audience),
      trimText(input.businessGoal),
    ]);
    const template = templateOverride
      ? templateOverride
      : buildGeneratedProjectTemplate(
        input,
        inferredStack,
        record.capsule.slug,
        record.capsule.name,
        recipe,
      );
    writeGeneratedProjectFiles(directory.sourceRoot, template);
    ensureGeneratedProjectArchive(record.capsule.id);

    const generatedProject: OperatorGeneratedProject = {
      capsuleId: record.capsule.id,
      archiveName: `${record.capsule.slug}.tar.gz`,
      archiveUrl: buildGeneratedProjectArchiveUrl(record.capsule.id),
      manifestUrl: buildGeneratedProjectManifestUrl(record.capsule.id),
      generatedAt: nowIso(),
      runtime: localizeStackLabel(inferredStack, recipe?.locale ?? 'en'),
      entryFile: template.entryFile,
      runCommands: template.runCommands,
      files: template.files.map((file) => ({
        path: file.path,
        purpose: file.purpose,
        bytes: Buffer.byteLength(file.content, 'utf8'),
      })),
    };

    record.generatedProject = generatedProject;
    if (record.capsule.entryKind === 'generate-from-idea') {
      record.capsule.generationSource = templateOverride ? 'template' : inferGenerationSource(record);
    }
    record.artifactSummary = {
      sourceType: 'generated',
      sourceRef: record.capsule.source.idea ?? record.capsule.name,
      archiveUrl: generatedProject.archiveUrl,
      manifestUrl: generatedProject.manifestUrl,
      entryFile: generatedProject.entryFile,
      runCommands: [...generatedProject.runCommands],
      fileCount: generatedProject.files.length,
      installCommand: generatedProject.runCommands[0] ?? null,
      buildCommand: generatedProject.runCommands.at(-1) ?? null,
    };
    record.previewSummary = {
      ...record.previewSummary,
      status: 'building',
      verified: false,
      previewUrl: record.capsule.previewUrl,
      entryFile: generatedProject.entryFile,
      assetCount: generatedProject.files.length,
      verifiedAt: null,
      lastError: null,
    };
    record.infraSummary.items = [
      ...record.infraSummary.items.filter((item) => item.label !== 'Source bundle' && item.label !== '源码包'),
      { label: recipe?.locale === 'zh-CN' ? '源码包' : 'Source bundle', value: generatedProject.archiveUrl ?? generatedProject.archiveName },
    ];
    addEvent(record, 'success', recipe?.locale === 'zh-CN'
      ? 'AI 已经把计划落实成可下载、可部署的真实源码包。'
      : 'AI materialized a real project bundle for deployment and download.');
    persistState();
    return generatedProject;
  }

  function requireRecord(capsuleId: string) {
    return capsules.get(capsuleId) ?? null;
  }

  function listCapsules() {
    return [...capsules.values()]
      .map((record) => record.capsule)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  function listWorkspaces() {
    return listCapsules();
  }

  function getJob(jobId: string) {
    const job = jobs.get(jobId);
    return job ? cloneJob(job) : null;
  }

  function findActiveJob(capsuleId: string, kind: OperatorJobKind) {
    return [...jobs.values()]
      .filter((job) => job.capsuleId === capsuleId && job.kind === kind && (job.status === 'queued' || job.status === 'running'))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
  }

  function buildWorkspaceJobBlueprint(record: CapsuleRecord, kind: OperatorJobKind) {
    const zh = /[\u3400-\u9fff]/.test([
      record.capsule.name,
      record.capsule.summary,
      record.capsule.source.idea,
    ].filter(Boolean).join(' '));
    const sourceRef = trimText(record.capsule.source.repoUrl) || trimText(record.artifactSummary.sourceRef) || record.capsule.name;

    switch (kind) {
      case 'build_repo_preview':
        return {
          title: zh ? '仓库真实预览构建' : 'Build repo preview',
          summary: zh ? '仓库预览任务已排队。' : 'The repository preview job is queued.',
          detail: sourceRef,
          steps: [
            { title: zh ? '拉取源码' : 'Fetch source', detail: zh ? '克隆仓库或下载压缩包。' : 'Clone the repository or download the archive.' },
            { title: zh ? '检测结构' : 'Detect structure', detail: zh ? '识别前端入口和构建方式。' : 'Identify the frontend entry and build mode.' },
            { title: zh ? '生成构建计划' : 'Prepare build plan', detail: zh ? '确认安装命令、构建命令和预览入口。' : 'Confirm install, build, and preview entry details.' },
            { title: zh ? '执行隔离构建' : 'Run isolated build', detail: zh ? '执行真实安装和构建。' : 'Run the real install and build.' },
            { title: zh ? '准备预览运行时' : 'Prepare preview runtime', detail: zh ? '挂接统一预览地址或本地运行时。' : 'Attach the shared preview URL or local runtime.' },
            { title: zh ? '健康校验' : 'Health check', detail: zh ? '确认预览入口真实可访问。' : 'Verify the preview is really reachable.' },
          ],
        };
      case 'build_idea_preview':
      case 'deploy_preview':
        return {
          title: kind === 'build_idea_preview'
            ? (zh ? '想法真实生成' : 'Build idea preview')
            : (zh ? '刷新预览' : 'Deploy preview'),
          summary: zh ? '预览任务已排队。' : 'The preview job is queued.',
          detail: record.capsule.name,
          steps: [
            { title: zh ? '整理源码' : 'Prepare source', detail: zh ? '确认本地源码包和工作区目录。' : 'Confirm the local source bundle and workspace directory.' },
            { title: zh ? '构建预览' : 'Build preview', detail: zh ? '执行真实构建并准备运行时。' : 'Run a real build and prepare the runtime.' },
            { title: zh ? '校验结果' : 'Verify result', detail: zh ? '确认预览地址真实可用。' : 'Confirm the preview URL is actually live.' },
          ],
        };
      case 'publish_release':
        return {
          title: zh ? '发布正式版' : 'Publish release',
          summary: zh ? '正式版发布任务已排队。' : 'The production release job is queued.',
          detail: record.capsule.name,
          steps: [
            { title: zh ? '校验预览' : 'Verify preview', detail: zh ? '确认当前预览已经过真实校验。' : 'Confirm the current preview is verified.' },
            { title: zh ? '创建正式版别名' : 'Create release alias', detail: zh ? '把同一份构建挂到稳定发布入口。' : 'Attach the same build to a stable release entry.' },
            { title: zh ? '校验正式入口' : 'Verify release', detail: zh ? '确认正式版入口可访问。' : 'Confirm the release entry is reachable.' },
          ],
        };
      case 'diagnose_service':
        return {
          title: zh ? '服务诊断' : 'Diagnose service',
          summary: zh ? '诊断任务已排队。' : 'The diagnosis job is queued.',
          detail: record.capsule.name,
          steps: record.capsule.entryKind === 'scan-server'
            ? [
              { title: zh ? '读取远端状态' : 'Read remote state', detail: zh ? '真实读取远端进程、容器和端口。' : 'Read remote processes, containers, and ports.' },
              { title: zh ? '输出诊断' : 'Write diagnosis', detail: zh ? '把问题和建议写回工作区。' : 'Write the issue summary and recommendations back to the workspace.' },
            ]
            : [
              { title: zh ? '读取当前状态' : 'Inspect current state', detail: zh ? '读取最近任务、构建结果和诊断信息。' : 'Inspect the latest job, build result, and diagnostics.' },
              { title: zh ? '输出诊断' : 'Write diagnosis', detail: zh ? '把问题和建议写回工作区。' : 'Write the issue summary and recommendations back to the workspace.' },
            ],
        };
      case 'repair_service':
        return {
          title: zh ? '自动修复' : 'Repair service',
          summary: zh ? '修复任务已排队。' : 'The repair job is queued.',
          detail: record.capsule.name,
          steps: record.capsule.entryKind === 'scan-server'
            ? [
              { title: zh ? '读取连接凭据' : 'Load connector', detail: zh ? '读取当前运行时中的 SSH 凭据。' : 'Load the SSH credentials from the current runtime.' },
              { title: zh ? '执行低风险修复' : 'Apply low-risk fixes', detail: zh ? '重启常见服务并补齐缺失的 Docker 运行时。' : 'Restart common services and bootstrap Docker when missing.' },
              { title: zh ? '验证修复结果' : 'Verify repair', detail: zh ? '再次检查容器、端口和系统状态。' : 'Re-check containers, ports, and system health.' },
            ]
            : [
              { title: zh ? '重新整理源码' : 'Rebuild source', detail: zh ? '重新读取源码和构建依赖。' : 'Reload the source and build dependencies.' },
              { title: zh ? '重新构建预览' : 'Rebuild preview', detail: zh ? '重新执行真实构建和预览校验。' : 'Run the real build and preview verification again.' },
              { title: zh ? '确认恢复' : 'Confirm recovery', detail: zh ? '确认新的预览结果已经恢复。' : 'Confirm the new preview is healthy.' },
            ],
        };
      case 'takeover_server':
        return {
          title: zh ? '接管旧服务器' : 'Take over server',
          summary: zh ? '接管任务已排队。' : 'The takeover job is queued.',
          detail: record.capsule.name,
          steps: [
            { title: zh ? '读取连接凭据' : 'Load connector', detail: zh ? '读取当前运行时中的 SSH 凭据。' : 'Load the SSH credentials from the current runtime.' },
            { title: zh ? '补齐运行时依赖' : 'Bootstrap runtime', detail: zh ? '确保 Docker 等基础依赖已经可用。' : 'Ensure Docker and base runtime dependencies are available.' },
            { title: zh ? '写入接管记录' : 'Write takeover receipt', detail: zh ? '把接管目录和快照写到服务器上。' : 'Write the takeover directory and snapshot onto the server.' },
            { title: zh ? '验证接管结果' : 'Verify takeover', detail: zh ? '确认后续预览与接管状态已经附着。' : 'Confirm the preview lane and takeover state are attached.' },
          ],
        };
      case 'migrate_server':
        return {
          title: zh ? '迁移服务器' : 'Migrate server',
          summary: zh ? '迁移任务已排队。' : 'The migration job is queued.',
          detail: record.capsule.name,
          steps: [
            { title: zh ? '读取连接凭据' : 'Load connector', detail: zh ? '读取当前运行时中的 SSH 凭据。' : 'Load the SSH credentials from the current runtime.' },
            { title: zh ? '采集迁移清单' : 'Collect migration inventory', detail: zh ? '真实采集容器、端口、域名和部署痕迹。' : 'Collect containers, ports, domains, and deployment traces.' },
            { title: zh ? '生成迁移包' : 'Build migration bundle', detail: zh ? '把迁移摘要和配置线索打成可下载物料。' : 'Package the migration summary and config clues into a downloadable bundle.' },
            { title: zh ? '更新后续动作' : 'Stage next actions', detail: zh ? '把接下来的迁移动作写回工作区。' : 'Write the next migration actions back to the workspace.' },
          ],
        };
      case 'scan_server':
        return {
          title: zh ? '旧服务器真实体检' : 'Real server audit',
          summary: zh ? '旧服务器体检任务已排队。' : 'The server audit job is queued.',
          detail: `${record.capsule.connector?.username ?? 'root'}@${record.capsule.connector?.host ?? record.capsule.source.serverHost ?? 'server'}:${record.capsule.connector?.port ?? 22}`,
          steps: [
            { title: zh ? '读取系统信息' : 'Read system inventory', detail: zh ? '采集 OS、内核、CPU、内存和磁盘。' : 'Collect OS, kernel, CPU, memory, and disk details.' },
            { title: zh ? '读取运行时信息' : 'Read runtime inventory', detail: zh ? '采集 Docker、Compose、Web 服务和业务进程。' : 'Collect Docker, Compose, web server, and process details.' },
            { title: zh ? '读取网络与域名' : 'Read network inventory', detail: zh ? '采集开放端口和域名配置。' : 'Collect open ports and detected domain configuration.' },
          ],
        };
      case 'plan_repo':
      case 'plan_idea':
      default:
        return {
          title: jobKindLabel(kind, zh),
          summary: zh ? '任务已经排队。' : 'The job is queued.',
          detail: zh ? '该任务已记录到统一时间线。' : 'The job is now part of the unified timeline.',
          steps: [
            {
              title: zh ? '等待执行' : 'Queued',
              detail: zh ? '该任务已记录到统一时间线。' : 'The job is now part of the unified timeline.',
            },
          ],
        };
    }
  }

  async function startGeneratedPreviewJob(record: CapsuleRecord, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));

    try {
      markJobStage(jobId, {
        status: 'running',
        progress: 12,
        summary: zh ? '正在整理本地源码包。' : 'Preparing the local source bundle.',
        detail: record.capsule.name,
        activeStepIndex: 0,
      });
      const directory = ensureGeneratedProjectSource(record);
      if (!directory || !record.generatedProject) {
        throw new Error(zh ? '当前工作区没有可重建的源码包。' : 'No generated source bundle is available for this workspace.');
      }

      recordJobStepResult(jobId, 0, {
        stdout: directory.sourceRoot,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 44,
        summary: zh ? '源码包已经准备好。' : 'The source bundle is ready.',
        detail: zh ? '正在重新构建预览。' : 'Rebuilding the preview.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 48,
        summary: zh ? '正在重新构建预览。' : 'Rebuilding the preview.',
        detail: zh ? '执行真实构建并接回统一预览地址。' : 'Running the real build and reconnecting the shared preview URL.',
        activeStepIndex: 1,
      });
      const build = ensureGeneratedProjectPreviewBuild(record);
      const buildError = build ? readPreviewBuildError(build) : (zh ? '预览构建失败。' : 'Preview build failed.');
      if (!build || buildError) {
        throw new Error(buildError || (zh ? '预览构建失败。' : 'Preview build failed.'));
      }
      record.capsule.previewUrl = buildPreviewUrl(record.capsule.slug);
      record.infraSummary.endpoint = record.capsule.previewUrl;
      record.previewSummary = {
        ...record.previewSummary,
        status: 'verified',
        verified: true,
        previewUrl: record.capsule.previewUrl,
        entryFile: record.generatedProject.entryFile,
        assetCount: record.generatedProject.files.length,
        verifiedAt: nowIso(),
        lastError: null,
      };
      record.capsule.status = 'preview_live';
      record.capsule.healthScore = Math.max(record.capsule.healthScore, 84);
      record.logsSummary.headline = zh ? '共享预览已经恢复。' : 'The shared preview is healthy again.';
      updateDiagnostics(record, {
        stage: 'build_preview',
        headline: zh ? '共享预览已恢复' : 'Preview recovered',
        detail: zh ? '源码、构建和预览都已经重新校验通过。' : 'The source, build output, and preview have passed verification again.',
        command: record.artifactSummary.buildCommand,
        lastError: null,
      });
      addEvent(record, 'success', zh ? '已重新构建并验证预览。' : 'The preview has been rebuilt and verified.');
      recordJobStepResult(jobId, 1, {
        stdout: record.capsule.previewUrl,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 78,
        summary: zh ? '预览已经构建完成。' : 'Preview build completed.',
        detail: zh ? '正在确认最终结果。' : 'Confirming the final result.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 84,
        summary: zh ? '正在确认最终结果。' : 'Confirming the final result.',
        detail: record.capsule.previewUrl ?? '',
        activeStepIndex: 2,
      });
      recordJobStepResult(jobId, 2, {
        stdout: record.capsule.previewUrl,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'completed',
        progress: 100,
        summary: zh ? '预览已经恢复。' : 'The preview is healthy again.',
        detail: record.capsule.previewUrl ?? '',
      });
      persistState();
    } catch (error) {
      const message = trimText(error instanceof Error ? error.message : String(error)) || 'generated_preview_failed';
      record.capsule.status = 'needs_attention';
      record.previewSummary.status = 'failed';
      record.previewSummary.verified = false;
      record.previewSummary.verifiedAt = null;
      record.previewSummary.lastError = message;
      updateDiagnostics(record, {
        stage: 'build_preview',
        headline: zh ? '预览恢复失败' : 'Preview repair failed',
        detail: message,
        command: record.artifactSummary.buildCommand,
        lastError: message,
      });
      addEvent(record, 'error', message);
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '预览恢复失败。' : 'Preview repair failed.',
        detail: message,
        error: message,
        activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
      });
      persistState();
    }
  }

  async function startDiagnoseServiceJob(record: CapsuleRecord, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));

    try {
      if (record.capsule.entryKind === 'scan-server') {
        const connector = resolveActionConnector(record);
        if (!connector) {
          throw new Error(zh ? '当前运行时里没有可用的 SSH 凭据，请重新体检一次服务器。' : 'No SSH credentials are available in the current runtime. Re-run the server audit first.');
        }

        markJobStage(jobId, {
          status: 'running',
          progress: 20,
          summary: zh ? '正在读取远端运行状态。' : 'Reading the remote runtime state.',
          detail: `${connector.username}@${connector.host}:${connector.port}`,
          activeStepIndex: 0,
        });
        const results = await runRemoteSteps({
          connector,
          steps: [
            {
              id: 'diagnose-runtime',
              label: 'Diagnose runtime',
              script: [
                'set -eu',
                'echo "UPTIME=$(uptime 2>/dev/null || true)"',
                'echo "DOCKER=$(docker ps --format \\"{{.Names}} {{.Status}}\\" 2>/dev/null | head -n 12 | paste -sd";" - || true)"',
                'echo "SYSTEMD=$(systemctl --failed --no-legend 2>/dev/null | head -n 12 | paste -sd";" - || true)"',
              ].join('\n'),
            },
          ],
        });
        const diagnosisText = results.steps.map((step) => step.stdout).join('\n').trim() || (zh ? '未读取到额外状态。' : 'No extra runtime state was returned.');
        recordJobStepResult(jobId, 0, results.steps[0] ?? null, {
          status: 'running',
          progress: 72,
          summary: zh ? '远端状态读取完成。' : 'Remote runtime state collected.',
          detail: zh ? '正在整理诊断结论。' : 'Writing the diagnosis summary.',
        });

        markJobStage(jobId, {
          status: 'running',
          progress: 80,
          summary: zh ? '正在整理诊断结论。' : 'Writing the diagnosis summary.',
          detail: diagnosisText,
          activeStepIndex: 1,
        });
        updateDiagnostics(record, {
          stage: 'diagnose_service',
          headline: zh ? '远端诊断已完成' : 'Remote diagnosis completed',
          detail: diagnosisText,
          command: 'ssh diagnostic read',
          lastError: null,
        });
        record.logsSummary.headline = zh ? '远端诊断已完成。' : 'Remote diagnosis completed.';
        addEvent(record, 'info', zh ? '已刷新远端服务诊断。' : 'Remote service diagnosis refreshed.');
        recordJobStepResult(jobId, 1, {
          stdout: diagnosisText,
          stderr: '',
          exitCode: 0,
        }, {
          status: 'completed',
          progress: 100,
          summary: zh ? '远端诊断已完成。' : 'Remote diagnosis completed.',
          detail: zh ? '诊断结果已写回工作区。' : 'The diagnosis has been written back to the workspace.',
        });
        persistState();
        return;
      }

      const latest = getLatestJobForCapsule(record.capsule.id);
      const diagnosis = [
        latest?.error ? `${zh ? '最近错误' : 'Latest error'}: ${latest.error}` : null,
        record.previewSummary.lastError ? `${zh ? '预览错误' : 'Preview error'}: ${record.previewSummary.lastError}` : null,
        record.diagnosticsSummary.detail,
      ].filter(Boolean).join('\n');

      markJobStage(jobId, {
        status: 'running',
        progress: 50,
        summary: zh ? '正在读取当前工作区状态。' : 'Inspecting the current workspace state.',
        detail: record.capsule.name,
        activeStepIndex: 0,
      });
      recordJobStepResult(jobId, 0, {
        stdout: diagnosis,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 84,
        summary: zh ? '诊断信息已整理。' : 'The diagnosis context is ready.',
        detail: zh ? '正在写回诊断结果。' : 'Writing the diagnosis result.',
      });

      updateDiagnostics(record, {
        stage: 'diagnose_service',
        headline: zh ? '工作区诊断已完成' : 'Workspace diagnosis completed',
        detail: diagnosis || (zh ? '当前没有新的阻塞。' : 'No new blockers were detected.'),
        command: null,
        lastError: latest?.error ?? record.previewSummary.lastError ?? null,
      });
      record.logsSummary.headline = zh ? '工作区诊断已完成。' : 'Workspace diagnosis completed.';
      addEvent(record, latest?.error || record.previewSummary.lastError ? 'warning' : 'info', diagnosis || (zh ? '当前没有新的阻塞。' : 'No new blockers were detected.'));
      markJobStage(jobId, {
        status: 'completed',
        progress: 100,
        summary: zh ? '诊断已完成。' : 'Diagnosis completed.',
        detail: diagnosis || (zh ? '当前没有新的阻塞。' : 'No new blockers were detected.'),
        activeStepIndex: 1,
      });
      persistState();
    } catch (error) {
      const message = trimText(error instanceof Error ? error.message : String(error)) || 'diagnose_service_failed';
      updateDiagnostics(record, {
        stage: 'diagnose_service',
        headline: zh ? '服务诊断失败' : 'Service diagnosis failed',
        detail: message,
        command: record.capsule.entryKind === 'scan-server' ? 'ssh diagnostic read' : null,
        lastError: message,
      });
      addEvent(record, 'error', message);
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '服务诊断失败。' : 'Service diagnosis failed.',
        detail: message,
        error: message,
        activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
      });
      persistState();
    }
  }

  async function startTakeoverServerJob(record: CapsuleRecord, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
    const connector = resolveActionConnector(record);
    if (!connector) {
      const message = zh ? '当前运行时里没有可用的 SSH 凭据，请重新体检一次服务器。' : 'No SSH credentials are available in the current runtime. Re-run the server audit first.';
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '接管失败。' : 'Takeover failed.',
        detail: message,
        error: message,
        activeStepIndex: 0,
      });
      updateDiagnostics(record, {
        stage: 'takeover_server',
        headline: zh ? '接管失败' : 'Takeover failed',
        detail: message,
        command: 'ssh',
        lastError: message,
      });
      addEvent(record, 'error', message);
      persistState();
      return;
    }

    const bootstrapSteps = getRemotePlaybook('bootstrap-docker')?.steps ?? [];
    const takeoverSteps = [
      {
        id: 'takeover-access',
        label: 'Verify access',
        script: ['set -eu', 'whoami', 'hostname', 'id -u'].join('\n'),
      },
      ...bootstrapSteps,
      {
        id: 'takeover-receipt',
        label: 'Write takeover receipt',
        script: [
          'set -eu',
          'mkdir -p /opt/sloth-cloud/operator',
          `cat >/opt/sloth-cloud/operator/${record.capsule.id}-takeover.txt <<'EOF'`,
          `capsule=${record.capsule.id}`,
          `name=${record.capsule.name}`,
          `taken_over_at=${nowIso()}`,
          'EOF',
          `echo "RECEIPT=/opt/sloth-cloud/operator/${record.capsule.id}-takeover.txt"`,
          'docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null | head -n 12 || true',
        ].join('\n'),
      },
    ];

    try {
      const results = await runRemoteSteps({
        connector,
        steps: takeoverSteps,
      });

      results.steps.forEach((step, index) => {
        recordJobStepResult(jobId, index, step, {
          status: index === results.steps.length - 1 ? 'running' : 'running',
          progress: 38 + (index * 18),
          summary: zh ? '接管步骤执行中。' : 'Takeover steps are running.',
          detail: step.label,
        });
      });

      record.capsule.connector = {
        ...(record.capsule.connector ?? {
          mode: 'agent',
          host: connector.host,
          port: connector.port,
          username: connector.username,
          trust: 'verified',
        }),
        trust: 'verified',
      };
      record.capsule.previewUrl = shouldRefreshPreviewUrl(record.capsule.previewUrl)
        ? buildPreviewUrl(`${record.capsule.slug}-proxy`)
        : record.capsule.previewUrl;
      record.infraSummary.endpoint = record.capsule.previewUrl;
      record.capsule.status = 'preview_live';
      record.capsule.healthScore = Math.max(record.capsule.healthScore, 80);
      record.logsSummary.headline = zh ? '旧服务器接管已经激活。' : 'Server takeover is active.';
      updateDiagnostics(record, {
        stage: 'takeover_server',
        headline: zh ? '旧服务器接管已激活' : 'Server takeover is active',
        detail: zh ? 'Docker、接管目录和统一工作区已经附着。' : 'Docker, the takeover directory, and the unified workspace are attached.',
        command: 'ssh takeover',
        lastError: null,
      });
      addEvent(record, 'success', zh ? '旧服务器接管已经激活。' : 'Server takeover is active.');
      markJobStage(jobId, {
        status: 'completed',
        progress: 100,
        summary: zh ? '旧服务器接管已经激活。' : 'Server takeover is active.',
        detail: record.capsule.previewUrl ?? `${connector.username}@${connector.host}:${connector.port}`,
        activeStepIndex: results.steps.length,
      });
      persistState();
    } catch (error) {
      const message = error instanceof RemoteExecError
        ? trimText(error.stderr || error.stdout || error.message)
        : trimText(error instanceof Error ? error.message : String(error));
      const finalMessage = message || 'takeover_server_failed';

      if (error instanceof RemoteExecError) {
        for (const partial of error.partialSteps) {
          const partialIndex = takeoverSteps.findIndex((step) => step.id === partial.id);
          if (partialIndex < 0) {
            continue;
          }

          recordJobStepResult(jobId, partialIndex, partial, {
            status: 'running',
            progress: Math.min(90, 36 + (partialIndex * 16)),
            summary: zh ? '接管步骤执行中。' : 'Takeover steps are running.',
            detail: partial.label,
          });
        }

        const failedIndex = error.stepId
          ? takeoverSteps.findIndex((step) => step.id === error.stepId)
          : -1;
        if (failedIndex >= 0) {
          recordJobStepResult(jobId, failedIndex, {
            stdout: error.stdout || null,
            stderr: error.stderr || null,
            exitCode: null,
          }, {
            status: 'failed',
            progress: 100,
            summary: zh ? '旧服务器接管失败。' : 'Server takeover failed.',
            detail: finalMessage,
            error: finalMessage,
          });
        }
      }

      updateDiagnostics(record, {
        stage: 'takeover_server',
        headline: zh ? '旧服务器接管失败' : 'Server takeover failed',
        detail: finalMessage,
        command: 'ssh takeover',
        lastError: finalMessage,
      });
      addEvent(record, 'error', finalMessage);
      const hasFailedStep = jobs.get(jobId)?.steps.some((step) => step.status === 'attention');
      if (!hasFailedStep) {
        markJobStage(jobId, {
          status: 'failed',
          progress: 100,
          summary: zh ? '旧服务器接管失败。' : 'Server takeover failed.',
          detail: finalMessage,
          error: finalMessage,
          activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
        });
      }
      persistState();
    }
  }

  async function startMigrateServerJob(record: CapsuleRecord, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
    const connector = resolveActionConnector(record);
    if (!connector) {
      const message = zh ? '当前运行时里没有可用的 SSH 凭据，请重新体检一次服务器。' : 'No SSH credentials are available in the current runtime. Re-run the server audit first.';
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '迁移失败。' : 'Migration failed.',
        detail: message,
        error: message,
        activeStepIndex: 0,
      });
      updateDiagnostics(record, {
        stage: 'migrate_server',
        headline: zh ? '迁移失败' : 'Migration failed',
        detail: message,
        command: 'ssh migration',
        lastError: message,
      });
      addEvent(record, 'error', message);
      persistState();
      return;
    }

    const migrationSteps = [
      {
        id: 'migration-inventory',
        label: 'Collect migration inventory',
        script: [
          'set -eu',
          'echo "HOST=$(hostname)"',
          'echo "OS=$( (source /etc/os-release >/dev/null 2>&1 && echo "${PRETTY_NAME:-$NAME}") || uname -s )"',
          'echo "DOCKER=$(docker ps --format \\"{{.Names}} {{.Image}} {{.Status}}\\" 2>/dev/null | head -n 20 | paste -sd";" - || true)"',
          'echo "PORTS=$(ss -tulpn 2>/dev/null | awk \'NR>1 {print $1 \":\" $5}\' | head -n 20 | paste -sd";" - || true)"',
        ].join('\n'),
      },
      {
        id: 'migration-config-clues',
        label: 'Collect config clues',
        script: [
          'set -eu',
          'echo "COMPOSE_FILES=$(find /opt /srv /root -maxdepth 4 \\( -name \"docker-compose*.yml\" -o -name \"compose*.yml\" \\) 2>/dev/null | head -n 20 | paste -sd";" - || true)"',
          'echo "SYSTEMD_UNITS=$(find /etc/systemd/system -maxdepth 1 -name \"*.service\" 2>/dev/null | head -n 20 | paste -sd";" - || true)"',
          'echo "NGINX_SNIPPETS=$(find /etc/nginx -maxdepth 3 -type f 2>/dev/null | head -n 20 | paste -sd";" - || true)"',
        ].join('\n'),
      },
    ];

    try {
      const results = await runRemoteSteps({
        connector,
        steps: migrationSteps,
      });

      results.steps.forEach((step, index) => {
        recordJobStepResult(jobId, index, step, {
          status: 'running',
          progress: 36 + (index * 22),
          summary: zh ? '迁移清单采集中。' : 'Migration inventory is being collected.',
          detail: step.label,
        });
      });

      const directory = ensureGeneratedProjectDirectory(record.capsule.id);
      if (!directory) {
        throw new Error(zh ? '当前运行时没有配置迁移工作区目录。' : 'The operator runtime does not have a migration workspace directory configured.');
      }
      const reportPath = join(directory.sourceRoot, 'migration-report.txt');
      const readmePath = join(directory.sourceRoot, 'README.md');
      mkdirSync(directory.sourceRoot, { recursive: true });
      writeFileSync(readmePath, [
        zh ? `# ${record.capsule.name} 迁移包` : `# ${record.capsule.name} migration bundle`,
        '',
        zh
          ? '这个包来自真实 SSH 采集，包含迁移线索、容器状态、端口和配置路径。'
          : 'This bundle comes from a real SSH collection and contains migration clues, container status, ports, and config paths.',
        '',
      ].join('\n'));
      writeFileSync(reportPath, results.steps.map((step) => `## ${step.label}\n\n${step.stdout || '(empty)'}\n`).join('\n'));
      ensureGeneratedProjectArchive(record.capsule.id);
      record.artifactSummary = {
        sourceType: 'server',
        sourceRef: `${connector.username}@${connector.host}:${connector.port}`,
        archiveUrl: buildWorkspaceArchiveUrl(record.capsule.id),
        manifestUrl: buildWorkspaceManifestUrl(record.capsule.id),
        entryFile: 'README.md',
        runCommands: [],
        fileCount: 2,
        installCommand: null,
        buildCommand: null,
      };
      record.capsule.status = 'migration_ready';
      record.capsule.healthScore = Math.max(record.capsule.healthScore, 76);
      record.logsSummary.headline = zh ? '迁移包已经准备好。' : 'The migration bundle is ready.';
      updateDiagnostics(record, {
        stage: 'migrate_server',
        headline: zh ? '迁移包已生成' : 'Migration bundle generated',
        detail: zh ? '真实 SSH 清单和配置线索已经写进工作区，可继续做下一步切换。' : 'The real SSH inventory and config clues were written into the workspace for the next cutover step.',
        command: 'ssh migration inventory',
        lastError: null,
      });
      addEvent(record, 'success', zh ? '已生成可下载的迁移包。' : 'A downloadable migration bundle is ready.');
      markJobStage(jobId, {
        status: 'completed',
        progress: 100,
        summary: zh ? '迁移包已经准备好。' : 'The migration bundle is ready.',
        detail: record.artifactSummary.archiveUrl ?? reportPath,
        activeStepIndex: 3,
      });
      persistState();
    } catch (error) {
      const message = error instanceof RemoteExecError
        ? trimText(error.stderr || error.stdout || error.message)
        : trimText(error instanceof Error ? error.message : String(error));
      const finalMessage = message || 'migrate_server_failed';

      if (error instanceof RemoteExecError) {
        for (const partial of error.partialSteps) {
          const partialIndex = migrationSteps.findIndex((step) => step.id === partial.id);
          if (partialIndex < 0) {
            continue;
          }

          recordJobStepResult(jobId, partialIndex, partial, {
            status: 'running',
            progress: Math.min(88, 30 + (partialIndex * 24)),
            summary: zh ? '迁移清单采集中。' : 'Migration inventory is being collected.',
            detail: partial.label,
          });
        }

        const failedIndex = error.stepId
          ? migrationSteps.findIndex((step) => step.id === error.stepId)
          : -1;
        if (failedIndex >= 0) {
          recordJobStepResult(jobId, failedIndex, {
            stdout: error.stdout || null,
            stderr: error.stderr || null,
            exitCode: null,
          }, {
            status: 'failed',
            progress: 100,
            summary: zh ? '迁移失败。' : 'Migration failed.',
            detail: finalMessage,
            error: finalMessage,
          });
        }
      }

      updateDiagnostics(record, {
        stage: 'migrate_server',
        headline: zh ? '迁移失败' : 'Migration failed',
        detail: finalMessage,
        command: 'ssh migration',
        lastError: finalMessage,
      });
      addEvent(record, 'error', finalMessage);
      const hasFailedStep = jobs.get(jobId)?.steps.some((step) => step.status === 'attention');
      if (!hasFailedStep) {
        markJobStage(jobId, {
          status: 'failed',
          progress: 100,
          summary: zh ? '迁移失败。' : 'Migration failed.',
          detail: finalMessage,
          error: finalMessage,
          activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
        });
      }
      persistState();
    }
  }

  async function runQueuedWorkspaceJob(record: CapsuleRecord, kind: OperatorJobKind, jobId: string) {
    switch (kind) {
      case 'build_repo_preview': {
        const sourceRef = trimText(record.capsule.source.repoUrl) || trimText(record.artifactSummary.sourceRef);
        if (!sourceRef) {
          markJobStage(jobId, {
            status: 'failed',
            progress: 100,
            summary: 'Repository preview job failed.',
            detail: 'repository_source_missing',
            error: 'repository_source_missing',
            activeStepIndex: 0,
          });
          return;
        }
        await startRepositoryPreviewJob(record, {
          projectName: record.capsule.name,
          repoUrl: sourceRef,
          notes: record.diagnosticsSummary.detail,
        }, jobId);
        return;
      }
      case 'build_idea_preview':
      case 'deploy_preview':
        if (record.capsule.entryKind === 'upload-project') {
          await startRepositoryPreviewJob(record, {
            projectName: record.capsule.name,
            repoUrl: trimText(record.capsule.source.repoUrl) || trimText(record.artifactSummary.sourceRef),
            notes: record.diagnosticsSummary.detail,
          }, jobId);
          return;
        }
        await startGeneratedPreviewJob(record, jobId);
        return;
      case 'diagnose_service':
        await startDiagnoseServiceJob(record, jobId);
        return;
      case 'repair_service': {
        const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
        if (record.capsule.entryKind === 'scan-server') {
          const connector = resolveActionConnector(record);
          if (!connector) {
            throw new Error('connector_credentials_missing');
          }
          const bootstrapSteps = getRemotePlaybook('bootstrap-docker')?.steps ?? [];
          const results = await runRemoteSteps({
            connector,
            steps: [
              {
                id: 'repair-preflight',
                label: 'Repair preflight',
                script: ['set -eu', 'whoami', 'hostname'].join('\n'),
              },
              ...bootstrapSteps,
              {
                id: 'repair-runtime',
                label: 'Repair runtime',
                script: [
                  'set -eu',
                  'if command -v systemctl >/dev/null 2>&1; then',
                  '  for svc in docker nginx caddy apache2 httpd; do',
                  '    systemctl restart "$svc" 2>/dev/null || true',
                  '  done',
                  'fi',
                  'docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null | head -n 20 || true',
                  'ss -tulpn 2>/dev/null | head -n 20 || true',
                ].join('\n'),
              },
            ],
          });
          results.steps.forEach((step, index) => {
            recordJobStepResult(jobId, index, step, {
              status: index === results.steps.length - 1 ? 'completed' : 'running',
              progress: index === results.steps.length - 1 ? 100 : 42 + (index * 22),
              summary: zh ? '修复步骤执行中。' : 'Repair steps are running.',
              detail: step.label,
            });
          });
          record.capsule.healthScore = Math.min(96, record.capsule.healthScore + 8);
          record.capsule.status = record.capsule.status === 'preview_live' ? 'preview_live' : 'takeover_ready';
          record.logsSummary.headline = zh ? '低风险修复已经完成。' : 'Low-risk repair completed.';
          updateDiagnostics(record, {
            stage: 'repair_service',
            headline: zh ? '远端修复已完成' : 'Remote repair completed',
            detail: zh ? '常见服务已重启，并重新采集了运行状态。' : 'Common services were restarted and runtime status was collected again.',
            command: 'ssh repair',
            lastError: null,
          });
          addEvent(record, 'success', zh ? '已执行远端低风险修复。' : 'Remote low-risk repair completed.');
          persistState();
          return;
        }

        if (record.capsule.entryKind === 'upload-project') {
          await startRepositoryPreviewJob(record, {
            projectName: record.capsule.name,
            repoUrl: trimText(record.capsule.source.repoUrl) || trimText(record.artifactSummary.sourceRef),
            notes: record.diagnosticsSummary.detail,
          }, jobId);
          return;
        }

        await startGeneratedPreviewJob(record, jobId);
        return;
      }
      case 'publish_release': {
        const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
        if (record.previewSummary.status !== 'verified') {
          markJobStage(jobId, {
            status: 'blocked',
            progress: 0,
            summary: zh ? '正式版发布已阻止。' : 'Production publish was blocked.',
            detail: zh ? '必须先拿到真实预览，再允许发布正式版。' : 'A verified preview is required before publishing.',
            error: 'preview_not_verified',
            activeStepIndex: 0,
          });
          addEvent(record, 'warning', zh ? '正式版发布已阻止，原因是预览尚未通过真实校验。' : 'Production publish was blocked because preview verification has not completed.');
          persistState();
          return;
        }

        markJobStage(jobId, {
          status: 'running',
          progress: 24,
          summary: zh ? '正在校验当前预览。' : 'Verifying the current preview.',
          detail: record.capsule.previewUrl ?? '',
          activeStepIndex: 0,
        });
        if (!record.capsule.previewUrl) {
          throw new Error('preview_url_missing');
        }
        recordJobStepResult(jobId, 0, {
          stdout: record.capsule.previewUrl,
          stderr: '',
          exitCode: 0,
        }, {
          status: 'running',
          progress: 58,
          summary: zh ? '预览校验通过。' : 'Preview verification passed.',
          detail: zh ? '正在创建正式版发布别名。' : 'Creating the release alias.',
        });

        const releaseUrl = buildReleaseUrl(record.capsule.slug) ?? productionUrlFor(record.capsule.slug, productionDomainSuffix);
        record.capsule.productionUrl = releaseUrl;
        record.infraSummary.productionEndpoint = releaseUrl;
        record.capsule.status = 'production_live';
        record.capsule.healthScore = Math.max(record.capsule.healthScore, 88);
        record.infraSummary.items = [
          ...record.infraSummary.items.filter((item) => !['Primary domain', 'Release lane', 'TLS'].includes(item.label)),
          { label: 'Release lane', value: releaseUrl },
          { label: 'TLS', value: releaseUrl.startsWith('https://') ? 'active' : 'local dev route' },
        ];
        recordJobStepResult(jobId, 1, {
          stdout: releaseUrl,
          stderr: '',
          exitCode: 0,
        }, {
          status: 'running',
          progress: 82,
          summary: zh ? '正式版发布别名已创建。' : 'The release alias is ready.',
          detail: zh ? '正在确认正式版入口可用。' : 'Confirming the production release entry.',
        });

        markJobStage(jobId, {
          status: 'running',
          progress: 88,
          summary: zh ? '正在确认正式版入口可用。' : 'Confirming the production release entry.',
          detail: releaseUrl,
          activeStepIndex: 2,
        });
        addEvent(record, 'success', zh ? `正式版已经通过同一份构建发布：${releaseUrl}` : `Production now points at the same verified build: ${releaseUrl}`);
        record.logsSummary.headline = zh ? '正式版已经发布。' : 'Production release is live.';
        updateDiagnostics(record, {
          stage: 'publish_release',
          headline: zh ? '正式版已发布' : 'Production release is live',
          detail: zh ? '正式版和预览共用同一份构建结果。' : 'Production and preview now share the same verified build.',
          command: null,
          lastError: null,
        });
        recordJobStepResult(jobId, 2, {
          stdout: releaseUrl,
          stderr: '',
          exitCode: 0,
        }, {
          status: 'completed',
          progress: 100,
          summary: zh ? '正式版已经发布。' : 'Production release is live.',
          detail: releaseUrl,
        });
        persistState();
        return;
      }
      case 'takeover_server':
        await startTakeoverServerJob(record, jobId);
        return;
      case 'migrate_server':
        await startMigrateServerJob(record, jobId);
        return;
      case 'scan_server': {
        const connector = resolveActionConnector(record);
        if (!connector || !record.capsule.connector) {
          throw new Error('connector_credentials_missing');
        }
        await startServerScanJob(record, {
          label: record.capsule.name,
          host: record.capsule.connector.host,
          username: record.capsule.connector.username,
          port: record.capsule.connector.port,
          authMode: record.capsule.connector.mode,
          password: connector.password ?? null,
          sshKey: connector.sshKey ?? null,
        }, jobId);
        return;
      }
      default:
        markJobStage(jobId, {
          status: 'completed',
          progress: 100,
          summary: 'No asynchronous execution was required.',
          detail: record.capsule.name,
          activeStepIndex: 0,
        });
    }
  }

  function createWorkspaceJob(input: { capsuleId: string; kind: OperatorJobKind }) {
    const record = requireRecord(input.capsuleId);
    if (!record) {
      return null;
    }

    const existing = findActiveJob(input.capsuleId, input.kind);
    if (existing) {
      return cloneJob(existing);
    }

    const blueprint = buildWorkspaceJobBlueprint(record, input.kind);
    const job = createJob({
      capsuleId: input.capsuleId,
      kind: input.kind,
      title: blueprint.title,
      summary: blueprint.summary,
      detail: blueprint.detail,
      steps: blueprint.steps,
    });
    if (!job) {
      return null;
    }

    queueMicrotask(() => {
      void runQueuedWorkspaceJob(record, input.kind, job.id).catch((error) => {
        const message = trimText(error instanceof Error ? error.message : String(error)) || 'workspace_job_failed';
        addEvent(record, 'error', message);
        markJobStage(job.id, {
          status: 'failed',
          progress: 100,
          summary: blueprint.title,
          detail: message,
          error: message,
          activeStepIndex: jobs.get(job.id)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
        });
        persistState();
      });
    });

    return getJob(job.id);
  }

  function recordInstantWorkspaceJob(
    record: CapsuleRecord,
    kind: OperatorJobKind,
    input: {
      title: string;
      summary: string;
      detail: string;
      status?: OperatorJobStatus;
      error?: string | null;
    },
  ) {
    const job = createJob({
      capsuleId: record.capsule.id,
      kind,
      title: input.title,
      summary: input.summary,
      detail: input.detail,
      progress: input.status === 'blocked' ? 0 : 100,
      steps: [
        {
          title: input.title,
          detail: input.detail,
        },
      ],
    });
    if (!job) {
      return null;
    }

    updateJob(job.id, (current) => {
      const finalStatus = input.status ?? 'completed';
      current.status = finalStatus;
      current.progress = finalStatus === 'blocked' ? 0 : 100;
      current.summary = input.summary;
      current.detail = input.detail;
      current.error = input.error ?? null;
      current.completedAt = nowIso();
      current.steps.forEach((step) => {
        step.status = finalStatus === 'failed' || finalStatus === 'blocked' ? 'attention' : 'completed';
        step.startedAt ??= nowIso();
        step.completedAt ??= nowIso();
        step.stdout = input.error ?? null;
        step.exitCode = finalStatus === 'completed' ? 0 : null;
      });
    });

    return getJob(job.id);
  }

  function requestConfirmation(capsuleId: string, action: OperatorActionIntent, label: string) {
    const now = Date.now();
    for (const [token, pending] of confirmations.entries()) {
      if (pending.expiresAt <= now) {
        confirmations.delete(token);
        continue;
      }
      if (pending.capsuleId === capsuleId && pending.action === action) {
        return pending;
      }
    }

    const pending = {
      token: createId('confirm'),
      capsuleId,
      action,
      label,
      expiresAt: now + confirmationTtlMs,
    };
    confirmations.set(pending.token, pending);
    return pending;
  }

  function consumeConfirmation(
    capsuleId: string,
    action: OperatorActionIntent,
    confirmationToken: string | null | undefined,
  ) {
    if (!confirmationToken) {
      return {
        ok: false as const,
        pending: requestConfirmation(capsuleId, action, action),
      };
    }

    const pending = confirmations.get(confirmationToken);
    if (!pending || pending.capsuleId !== capsuleId || pending.action !== action || pending.expiresAt < Date.now()) {
      return {
        ok: false as const,
        pending: requestConfirmation(capsuleId, action, action),
      };
    }

    confirmations.delete(confirmationToken);
    return {
      ok: true as const,
      pending,
    };
  }

  function updateDiagnostics(record: CapsuleRecord, input: Partial<OperatorDiagnosticsSummary>) {
    record.diagnosticsSummary = {
      ...record.diagnosticsSummary,
      ...input,
    };
  }

  async function fetchRepositorySource(sourceRef: string, sourceRoot: string) {
    rmSync(sourceRoot, { recursive: true, force: true });
    mkdirSync(sourceRoot, { recursive: true });

    const trimmed = trimText(sourceRef);
    if (!trimmed) {
      throw new Error('repository_source_missing');
    }

    const formatCommandOutput = (result: { stdout: string; stderr: string; exitCode: number | null }) => {
      return [result.stderr, result.stdout]
        .map((item) => trimText(item))
        .filter(Boolean)
        .join('\n')
        .trim();
    };

    const transportErrorPattern = /(HTTP2|framing layer|stream .*not closed|TLS|connection reset|could not resolve host|failed to connect|operation timed out|network is unreachable)/i;
    const isTransportError = (text: string) => transportErrorPattern.test(text);

    const githubArchiveCandidates = (() => {
      try {
        const parsed = new URL(trimmed);
        if (parsed.hostname.toLowerCase() !== 'github.com') {
          return [] as string[];
        }

        const segments = parsed.pathname
          .replace(/^\/+/, '')
          .split('/')
          .filter(Boolean);

        if (segments.length < 2) {
          return [] as string[];
        }

        const owner = segments[0];
        const repo = segments[1].replace(/\.git$/i, '');
        if (!owner || !repo) {
          return [] as string[];
        }

        const explicitBranch = segments[2] === 'tree' && segments[3] ? segments[3] : null;
        const branchCandidates = explicitBranch ? [explicitBranch] : ['main', 'master'];
        const encodedPath = (branch: string) => branch.split('/').map((segment) => encodeURIComponent(segment)).join('/');

        return branchCandidates.flatMap((branch) => {
          const encoded = encodedPath(branch);
          return [
            `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encoded}`,
            `https://github.com/${owner}/${repo}/archive/refs/heads/${encoded}.zip`,
          ];
        });
      } catch {
        return [] as string[];
      }
    })();

    const tempRoot = mkdtempSync(join(tmpdir(), 'sloth-operator-source-'));
    try {
      if (/\.zip(?:\?.*)?$/i.test(trimmed)) {
        const archivePath = join(tempRoot, 'source.zip');
        const extractRoot = join(tempRoot, 'extract');
        mkdirSync(extractRoot, { recursive: true });
        const download = await runLocalCommand({
          command: 'curl',
          args: ['-L', '--fail', '--silent', '--show-error', '-o', archivePath, trimmed],
          cwd: tempRoot,
          timeoutMs: 5 * 60 * 1000,
        });
        if (download.exitCode !== 0) {
          throw new Error(download.stderr || download.stdout || 'zip_download_failed');
        }
        const unzip = await runLocalCommand({
          command: 'unzip',
          args: ['-q', archivePath, '-d', extractRoot],
          cwd: tempRoot,
          timeoutMs: 5 * 60 * 1000,
        });
        if (unzip.exitCode !== 0) {
          throw new Error(unzip.stderr || unzip.stdout || 'zip_extract_failed');
        }
        collapseSingleExtractedRoot(extractRoot);
        for (const entry of readdirSync(extractRoot, { withFileTypes: true })) {
          cpSync(join(extractRoot, entry.name), join(sourceRoot, entry.name), { recursive: true, force: true });
        }
        return {
          stdout: [download.stdout, unzip.stdout].filter(Boolean).join('\n').trim(),
          stderr: [download.stderr, unzip.stderr].filter(Boolean).join('\n').trim(),
          exitCode: 0,
        };
      }

      if (/\.tar(?:\.gz)?(?:\?.*)?$/i.test(trimmed) || /\.tgz(?:\?.*)?$/i.test(trimmed)) {
        const archivePath = join(tempRoot, 'source.tgz');
        const extractRoot = join(tempRoot, 'extract');
        mkdirSync(extractRoot, { recursive: true });
        const download = await runLocalCommand({
          command: 'curl',
          args: ['-L', '--fail', '--silent', '--show-error', '-o', archivePath, trimmed],
          cwd: tempRoot,
          timeoutMs: 5 * 60 * 1000,
        });
        if (download.exitCode !== 0) {
          throw new Error(download.stderr || download.stdout || 'archive_download_failed');
        }
        const untar = await runLocalCommand({
          command: 'tar',
          args: ['-xzf', archivePath, '-C', extractRoot],
          cwd: tempRoot,
          timeoutMs: 5 * 60 * 1000,
        });
        if (untar.exitCode !== 0) {
          throw new Error(untar.stderr || untar.stdout || 'archive_extract_failed');
        }
        collapseSingleExtractedRoot(extractRoot);
        for (const entry of readdirSync(extractRoot, { withFileTypes: true })) {
          cpSync(join(extractRoot, entry.name), join(sourceRoot, entry.name), { recursive: true, force: true });
        }
        return {
          stdout: [download.stdout, untar.stdout].filter(Boolean).join('\n').trim(),
          stderr: [download.stderr, untar.stderr].filter(Boolean).join('\n').trim(),
          exitCode: 0,
        };
      }

      const cloneAttempts: Array<{ label: string; args: string[] }> = [
        {
          label: 'git clone',
          args: ['clone', '--depth', '1', trimmed, sourceRoot],
        },
        {
          label: 'git clone (HTTP/1.1 fallback)',
          args: ['-c', 'http.version=HTTP/1.1', '-c', 'http.maxRequests=1', 'clone', '--depth', '1', trimmed, sourceRoot],
        },
      ];

      const diagnostics: string[] = [];
      let shouldTryArchiveFallback = false;

      for (const attempt of cloneAttempts) {
        rmSync(sourceRoot, { recursive: true, force: true });
        mkdirSync(sourceRoot, { recursive: true });
        const clone = await runLocalCommand({
          command: 'git',
          args: attempt.args,
          cwd: tempRoot,
          timeoutMs: 5 * 60 * 1000,
          env: {
            GIT_TERMINAL_PROMPT: '0',
          },
        });
        if (clone.exitCode === 0) {
          return clone;
        }

        const output = formatCommandOutput(clone) || 'git_clone_failed';
        diagnostics.push(`${attempt.label}: ${output}`);
        if (isTransportError(output)) {
          shouldTryArchiveFallback = true;
        }
      }

      if (githubArchiveCandidates.length > 0 && shouldTryArchiveFallback) {
        for (let index = 0; index < githubArchiveCandidates.length; index += 1) {
          const archiveUrl = githubArchiveCandidates[index];
          const archivePath = join(tempRoot, `source-fallback-${index}.zip`);
          const extractRoot = join(tempRoot, `extract-fallback-${index}`);
          mkdirSync(extractRoot, { recursive: true });

          const download = await runLocalCommand({
            command: 'curl',
            args: ['-L', '--fail', '--silent', '--show-error', '-o', archivePath, archiveUrl],
            cwd: tempRoot,
            timeoutMs: 5 * 60 * 1000,
          });
          if (download.exitCode !== 0) {
            diagnostics.push(`archive download (${archiveUrl}): ${formatCommandOutput(download) || 'archive_download_failed'}`);
            continue;
          }

          const unzip = await runLocalCommand({
            command: 'unzip',
            args: ['-q', archivePath, '-d', extractRoot],
            cwd: tempRoot,
            timeoutMs: 5 * 60 * 1000,
          });
          if (unzip.exitCode !== 0) {
            diagnostics.push(`archive extract (${archiveUrl}): ${formatCommandOutput(unzip) || 'archive_extract_failed'}`);
            continue;
          }

          collapseSingleExtractedRoot(extractRoot);
          rmSync(sourceRoot, { recursive: true, force: true });
          mkdirSync(sourceRoot, { recursive: true });
          for (const entry of readdirSync(extractRoot, { withFileTypes: true })) {
            cpSync(join(extractRoot, entry.name), join(sourceRoot, entry.name), { recursive: true, force: true });
          }

          return {
            stdout: [download.stdout, unzip.stdout].filter(Boolean).join('\n').trim() || `archive fallback: ${archiveUrl}`,
            stderr: [download.stderr, unzip.stderr].filter(Boolean).join('\n').trim(),
            exitCode: 0,
          };
        }
      }

      throw new Error(diagnostics.join('\n\n') || 'git_clone_failed');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  function parseInventoryMap(stdout: string) {
    const map = new Map<string, string>();
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const separator = line.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      map.set(line.slice(0, separator), line.slice(separator + 1).trim());
    }
    return map;
  }

  async function startRepositoryPreviewJob(record: CapsuleRecord, input: AnalyzeProjectInput, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
    const sourceRef = trimText(input.repoUrl) || trimText(input.sourceRef);
    const directory = ensureGeneratedProjectDirectory(record.capsule.id);
    if (!directory) {
      const message = zh ? '当前运行时没有配置工作区目录，无法生成真实预览。' : 'The operator runtime does not have a workspace directory configured.';
      record.previewSummary.status = 'failed';
      record.previewSummary.lastError = message;
      record.capsule.status = 'needs_attention';
      updateDiagnostics(record, {
        stage: 'workspace_bootstrap',
        headline: zh ? '工作区目录缺失' : 'Workspace directory missing',
        detail: message,
        lastError: message,
      });
      addEvent(record, 'error', message);
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '仓库预览任务失败。' : 'Repository preview job failed.',
        detail: message,
        error: message,
        activeStepIndex: 0,
      });
      persistState();
      return;
    }

    try {
      markJobStage(jobId, {
        status: 'running',
        progress: 8,
        summary: zh ? '正在读取仓库源码。' : 'Fetching repository source.',
        detail: sourceRef,
        activeStepIndex: 0,
      });
      updateDiagnostics(record, {
        stage: 'fetch',
        headline: zh ? '正在拉取源码' : 'Fetching source',
        detail: sourceRef,
        command: sourceRef,
        lastError: null,
      });
      record.artifactSummary.sourceType = 'repository';
      record.artifactSummary.sourceRef = sourceRef;
      record.previewSummary.status = 'building';
      record.previewSummary.verified = false;
      record.previewSummary.previewUrl = null;
      const fetchResult = await fetchRepositorySource(sourceRef, directory.sourceRoot);
      recordJobStepResult(jobId, 0, fetchResult, {
        status: 'running',
        progress: 22,
        summary: zh ? '源码已经拉取完成。' : 'Source fetched successfully.',
        detail: zh ? '正在检测仓库结构。' : 'Detecting repository structure.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 24,
        summary: zh ? '正在检测仓库结构。' : 'Detecting repository structure.',
        detail: zh ? '分析 package.json、Vite 配置和静态入口。' : 'Inspecting package.json, Vite config, and static entry points.',
        activeStepIndex: 1,
      });
      const plan = detectRepoBuildPlan(directory.sourceRoot, record.capsule.slug);
      if (!plan) {
        throw new Error(zh
          ? '暂时只支持真实构建 Vite 或静态站点仓库，当前仓库没有检测到可验证的前端入口。'
          : 'Only Vite and static-site repositories can be verified right now. No supported frontend entry was detected.');
      }
      recordJobStepResult(jobId, 1, {
        stdout: `${plan.runtimeLabel}\n${plan.entryFile}`,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 38,
        summary: zh ? '仓库结构检测完成。' : 'Repository structure detected.',
        detail: zh ? '正在生成构建计划。' : 'Preparing build plan.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 40,
        summary: zh ? '正在生成构建计划。' : 'Preparing build plan.',
        detail: zh
          ? `${plan.runtimeLabel}，安装命令 ${plan.installCommand ?? '无需安装'}，构建命令 ${plan.buildCommand ?? '无需构建'}。`
          : `${plan.runtimeLabel}; install ${plan.installCommand ?? 'not required'}; build ${plan.buildCommand ?? 'not required'}.`,
        activeStepIndex: 2,
      });
      record.artifactSummary.installCommand = plan.installCommand;
      record.artifactSummary.buildCommand = plan.buildCommand;
      record.artifactSummary.entryFile = plan.entryFile;
      record.artifactSummary.runCommands = plan.runCommands;
      recordJobStepResult(jobId, 2, {
        stdout: `${plan.installCommand ?? 'none'}\n${plan.buildCommand ?? 'none'}`.trim(),
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 54,
        summary: zh ? '构建计划已确认。' : 'Build plan confirmed.',
        detail: zh ? '正在执行隔离构建。' : 'Running the isolated build.',
      });

      const buildRoot = join(directory.root, 'dist');
      markJobStage(jobId, {
        status: 'running',
        progress: 56,
        summary: zh ? '正在执行隔离构建。' : 'Running the isolated build.',
        detail: zh ? '如果这里失败，会把真实错误写进诊断区。' : 'If this fails, the real error will be written to diagnostics.',
        activeStepIndex: 3,
      });
      const buildResults = await plan.build(buildRoot);
      ensureGeneratedProjectArchive(record.capsule.id);
      const buildOutput = [buildResults.install?.stdout, buildResults.build?.stdout].filter(Boolean).join('\n').trim();
      const buildErrorOutput = [buildResults.install?.stderr, buildResults.build?.stderr].filter(Boolean).join('\n').trim();
      recordJobStepResult(jobId, 3, {
        stdout: buildOutput,
        stderr: buildErrorOutput,
        exitCode: buildResults.build?.exitCode ?? buildResults.install?.exitCode ?? 0,
      }, {
        status: 'running',
        progress: 72,
        summary: zh ? '构建已经完成。' : 'Build completed.',
        detail: zh ? '正在准备预览运行时。' : 'Preparing the preview runtime.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 74,
        summary: zh ? '正在准备预览运行时。' : 'Preparing the preview runtime.',
        detail: zh ? '确认预览入口并接入统一地址。' : 'Confirming preview entry and attaching the shared URL.',
        activeStepIndex: 4,
      });
      const indexPath = join(buildRoot, 'index.html');
      let previewRuntimeTarget = '';
      if (plan.previewKind === 'static' && !existsSync(indexPath)) {
        throw new Error(zh ? '构建完成后没有找到 index.html，无法提供真实预览。' : 'No index.html was found after the build, so a verified preview cannot be served.');
      }
      if (plan.previewKind === 'proxy') {
        if (!plan.startPreviewRuntime) {
          throw new Error('preview_runtime_start_not_implemented');
        }
        previewRuntimeTarget = await plan.startPreviewRuntime(record);
      }
      record.capsule.previewUrl = buildPreviewUrl(record.capsule.slug);
      record.infraSummary.endpoint = record.capsule.previewUrl;
      record.previewSummary = {
        status: 'building',
        verified: false,
        previewUrl: record.capsule.previewUrl,
        entryFile: plan.entryFile,
        assetCount: plan.previewKind === 'static'
          ? countFilesInDirectory(buildRoot)
          : countFilesInDirectory(join(directory.sourceRoot, '.next')),
        verifiedAt: null,
        lastError: null,
      };
      recordJobStepResult(jobId, 4, {
        stdout: plan.previewKind === 'static' ? indexPath : previewRuntimeTarget,
        stderr: '',
        exitCode: 0,
      }, {
        status: 'running',
        progress: 88,
        summary: zh ? '预览运行时已经就绪。' : 'Preview runtime prepared.',
        detail: zh ? '正在做预览健康校验。' : 'Running preview health checks.',
      });

      markJobStage(jobId, {
        status: 'running',
        progress: 90,
        summary: zh ? '正在做预览健康校验。' : 'Running preview health checks.',
        detail: plan.previewKind === 'static' ? (record.capsule.previewUrl ?? '') : previewRuntimeTarget,
        activeStepIndex: 5,
      });
      if (plan.previewKind === 'proxy') {
        await waitForPreviewRuntime(previewRuntimeTarget);
      }
      record.previewSummary = {
        ...record.previewSummary,
        status: 'verified',
        verified: true,
        verifiedAt: nowIso(),
        lastError: null,
      };
      record.artifactSummary.archiveUrl = buildWorkspaceArchiveUrl(record.capsule.id);
      record.artifactSummary.manifestUrl = buildWorkspaceManifestUrl(record.capsule.id);
      record.artifactSummary.fileCount = countFilesInDirectory(directory.sourceRoot);
      record.capsule.status = 'preview_live';
      record.capsule.summary = zh
        ? '仓库已经真实拉取、构建并通过预览校验。'
        : 'The repository has been fetched, built, and verified for preview.';
      record.capsule.healthScore = Math.max(record.capsule.healthScore, 84);
      record.logsSummary.headline = zh ? '真实预览已经准备好。' : 'The verified preview is ready.';
      updateDiagnostics(record, {
        stage: 'health_check',
        headline: zh ? '真实预览校验完成' : 'Verified preview completed',
        detail: zh ? '仓库已经通过拉取、检测、构建和预览检查。' : 'The repository passed fetch, detection, build, and preview checks.',
        command: plan.buildCommand,
        lastError: null,
      });
      addEvent(record, 'success', zh ? '仓库导入已通过真实构建链路完成。' : 'Repository import completed through the real build pipeline.');
      recordJobStepResult(jobId, 5, {
        stdout: plan.previewKind === 'static' ? record.capsule.previewUrl : `${record.capsule.previewUrl}\n${previewRuntimeTarget}`.trim(),
        stderr: '',
        exitCode: 0,
      }, {
        status: 'completed',
        progress: 100,
        summary: zh ? '真实预览已经准备好。' : 'The verified preview is ready.',
        detail: record.capsule.previewUrl ?? '',
      });
      persistState();
    } catch (error) {
      const message = trimText(error instanceof Error ? error.message : String(error)) || 'repository_preview_failed';
      stopWorkspacePreviewRuntime(record.capsule.id);
      record.capsule.status = 'needs_attention';
      record.capsule.healthScore = Math.max(28, Math.min(record.capsule.healthScore, 58));
      record.previewSummary.status = 'failed';
      record.previewSummary.verified = false;
      record.previewSummary.previewUrl = null;
      record.previewSummary.verifiedAt = null;
      record.previewSummary.lastError = message;
      updateDiagnostics(record, {
        headline: zh ? '仓库导入失败' : 'Repository import failed',
        detail: message,
        lastError: message,
      });
      addEvent(record, 'error', message);
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '仓库预览任务失败。' : 'Repository preview job failed.',
        detail: message,
        error: message,
        activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
      });
      persistState();
    }
  }

  async function startServerScanJob(record: CapsuleRecord, input: ScanServerInput, jobId: string) {
    const zh = /[\u3400-\u9fff]/.test([record.capsule.name, record.capsule.summary].join(' '));
    const connector: RemoteExecConnector = {
      host: input.host.trim(),
      port: input.port && Number.isFinite(input.port) ? input.port : 22,
      username: input.username.trim(),
      password: input.authMode === 'password' ? trimText(input.password) || undefined : undefined,
      sshKey: input.authMode === 'ssh-key' ? trimText(input.sshKey) || undefined : undefined,
      agentSocket: input.authMode === 'agent' ? process.env.SSH_AUTH_SOCK || undefined : undefined,
      readyTimeoutMs: 20_000,
    };
    const steps = [
      {
        id: 'inventory-system',
        label: 'Read OS inventory',
        script: [
          'set -eu',
          'OS_VALUE=$( (source /etc/os-release >/dev/null 2>&1 && echo "${PRETTY_NAME:-$NAME}") || uname -s )',
          'echo "OS=${OS_VALUE}"',
          'echo "KERNEL=$(uname -r)"',
          'echo "CPU=$( (lscpu 2>/dev/null | awk -F: \'/Model name/ {gsub(/^ +/, \"\", $2); print $2; exit}\') || uname -m )"',
          'echo "MEMORY=$(free -h 2>/dev/null | awk \'/Mem:/ {print $2}\' || echo unknown)"',
          'echo "DISK=$(df -h / 2>/dev/null | awk \'NR==2 {print $2 \" total / \" $4 \" free\"}\' || echo unknown)"',
        ].join('\n'),
        timeoutMs: 60_000,
      },
      {
        id: 'inventory-runtime',
        label: 'Read runtime inventory',
        script: [
          'set -eu',
          'echo "DOCKER=$(docker --version 2>/dev/null || echo missing)"',
          'echo "COMPOSE=$(docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo missing)"',
          "echo \"WEBSERVERS=$(ps -eo comm= 2>/dev/null | grep -E '^(nginx|caddy|apache2|httpd)$' | sort -u | paste -sd, - || true)\"",
          "echo \"PROCESSES=$(ps -eo comm= 2>/dev/null | grep -E '^(nginx|caddy|apache2|httpd|docker|containerd|node|python|java|php-fpm|mysqld|postgres|redis-server|pm2)$' | sort -u | paste -sd, - || true)\"",
        ].join('\n'),
        timeoutMs: 60_000,
      },
      {
        id: 'inventory-network',
        label: 'Read network inventory',
        script: [
          'set -eu',
          "echo \"OPEN_PORTS=$(ss -tulpn 2>/dev/null | awk 'NR>1 {print $1 \":\" $5}' | sed 's/users:(.*//' | sort -u | head -n 40 | paste -sd, - || true)\"",
          "DOMAINS=$( (grep -RhoE 'server_name\\s+[^;]+' /etc/nginx 2>/dev/null || true; grep -RhoE '^[[:space:]]*[a-zA-Z0-9.-]+\\s*\\{' /etc/caddy 2>/dev/null || true) | sed 's/server_name//' | sed 's/[{;]//g' | tr ' ' '\\n' | sed '/^$/d' | sort -u | head -n 20 | paste -sd, - || true )",
          'echo "DOMAINS=${DOMAINS}"',
        ].join('\n'),
        timeoutMs: 60_000,
      },
    ];

    try {
      markJobStage(jobId, {
        status: 'running',
        progress: 10,
        summary: zh ? '正在建立 SSH 只读连接。' : 'Establishing a read-only SSH session.',
        detail: `${connector.username}@${connector.host}:${connector.port}`,
        activeStepIndex: 0,
      });
      updateDiagnostics(record, {
        stage: 'scan_server',
        headline: zh ? '正在执行只读体检' : 'Running read-only audit',
        detail: `${connector.username}@${connector.host}:${connector.port}`,
        command: 'ssh',
        lastError: null,
      });
      record.auditSummary.status = 'running';

      const result = await runRemoteSteps({
        connector,
        steps,
      });

      result.steps.forEach((step, index) => {
        recordJobStepResult(jobId, index, step, {
          status: index === result.steps.length - 1 ? 'completed' : 'running',
          progress: index === result.steps.length - 1 ? 100 : 35 + (index * 20),
          summary: zh ? '服务器只读体检完成。' : 'Server read-only audit completed.',
          detail: zh ? '正在写入体检摘要。' : 'Writing the audit summary.',
        });
      });

      const merged = new Map<string, string>();
      for (const step of result.steps) {
        for (const [key, value] of parseInventoryMap(step.stdout).entries()) {
          merged.set(key, value);
        }
      }

      const dockerVersion = merged.get('DOCKER') || 'missing';
      const composeVersion = merged.get('COMPOSE') || 'missing';
      const webServers = (merged.get('WEBSERVERS') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
      const openPorts = (merged.get('OPEN_PORTS') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
      const domains = (merged.get('DOMAINS') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
      const processes = (merged.get('PROCESSES') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
      const risks = [
        ...(dockerVersion === 'missing' ? [zh ? '未检测到 Docker' : 'Docker is not installed'] : []),
        ...(composeVersion === 'missing' ? [zh ? '未检测到 Docker Compose' : 'Docker Compose is not installed'] : []),
        ...(domains.length === 0 ? [zh ? '暂未检测到公开域名配置' : 'No public domain configuration was detected'] : []),
      ];

      record.auditSummary = {
        status: 'completed',
        host: connector.host,
        port: connector.port,
        username: connector.username,
        collectedAt: nowIso(),
        os: merged.get('OS') || null,
        kernel: merged.get('KERNEL') || null,
        cpu: merged.get('CPU') || null,
        memory: merged.get('MEMORY') || null,
        disk: merged.get('DISK') || null,
        docker: dockerVersion,
        compose: composeVersion,
        webServers,
        openPorts,
        domains,
        processes,
        risks,
        lastError: null,
      };
      record.capsule.status = 'takeover_ready';
      record.capsule.healthScore = Math.max(record.capsule.healthScore, 74);
      record.logsSummary.headline = zh ? '旧服务器真实体检已经完成。' : 'The real server audit is complete.';
      updateDiagnostics(record, {
        stage: 'scan_server',
        headline: zh ? '旧服务器体检完成' : 'Server audit completed',
        detail: zh ? 'SSH 只读采集已经完成，接管和迁移动作现在可以基于真实体检继续。' : 'The SSH read-only audit is complete. Takeover and migration can now continue from real inventory data.',
        command: 'ssh',
        lastError: null,
      });
      addEvent(record, 'success', zh ? '旧服务器已完成真实 SSH 只读体检。' : 'The server completed a real SSH read-only audit.');
      persistState();
    } catch (error) {
      const message = error instanceof RemoteExecError
        ? trimText(error.stderr || error.stdout || error.message)
        : trimText(error instanceof Error ? error.message : String(error));
      const finalMessage = message || 'server_scan_failed';
      record.auditSummary.status = 'failed';
      record.auditSummary.lastError = finalMessage;
      record.capsule.status = 'needs_attention';
      record.capsule.healthScore = Math.max(26, Math.min(record.capsule.healthScore, 58));
      updateDiagnostics(record, {
        stage: 'scan_server',
        headline: zh ? '旧服务器体检失败' : 'Server audit failed',
        detail: finalMessage,
        command: 'ssh',
        lastError: finalMessage,
      });
      addEvent(record, 'error', finalMessage);
      markJobStage(jobId, {
        status: 'failed',
        progress: 100,
        summary: zh ? '旧服务器体检失败。' : 'Server audit failed.',
        detail: finalMessage,
        error: finalMessage,
        activeStepIndex: jobs.get(jobId)?.steps.findIndex((step) => step.status === 'in_progress') ?? 0,
      });
      persistState();
    }
  }

  function createPlan(input: CreatePlanInput): OperatorEnvelope {
    const stack = inferStack([input.title ?? '', input.brief]);
    const brief = trimText(input.brief) || 'Prepare an operator-first launch plan.';
    const steps: OperatorPlanStep[] = [
      {
        id: createId('step'),
        title: 'Clarify deployment scope',
        status: 'completed',
        detail: 'Tree-scan the request and normalize launch intent.',
      },
      {
        id: createId('step'),
        title: 'Prepare preview environment',
        status: 'planned',
        detail: 'Reserve runtime, endpoint, and health probes.',
      },
      {
        id: createId('step'),
        title: 'Publish and attach operations',
        status: 'planned',
        detail: 'Attach logs, diagnostics, rollback, and production routing.',
      },
    ];
    const plan: OperatorExecutionPlan = {
      id: createId('plan'),
      title: input.title?.trim() || 'Operator execution plan',
      summary: brief,
      risk: input.entryKind === 'scan-server' ? 'medium' : 'low',
      estimatedMinutes: input.entryKind === 'scan-server' ? 8 : 5,
      estimatedMonthlyCost: stack.monthlyCost,
      assumptions: ['Automatic runtime detection is enabled.', 'Human confirmation is required before production cutover.'],
      confirmations: input.entryKind === 'scan-server' ? ['Confirm takeover or migration before any remote mutation.'] : ['Confirm production publish before domain cutover.'],
      steps,
    };

    const record = createPlanRecord({
      name: input.title?.trim() || 'Untitled operator plan',
      entryKind: input.entryKind,
      stack,
      summary: brief,
      source: {
        repoUrl: null,
        idea: input.entryKind === 'generate-from-idea' ? brief : null,
        serverHost: input.entryKind === 'scan-server' ? brief : null,
      },
      connector: null,
      status: 'planning',
      healthScore: 72,
      previewUrl: null,
      productionUrl: null,
      plan,
      logsHeadline: 'Operator plan is ready for execution.',
      logs: baseEvents('Operator generated a first-pass launch plan.'),
      infraItems: [
        { label: 'Build strategy', value: stack.build },
        { label: 'Runtime install', value: stack.install },
      ],
    });

    return buildEnvelope(record);
  }

  function analyzeProject(input: AnalyzeProjectInput): OperatorEnvelope {
    const name = trimText(input.projectName) || 'Imported project';
    const sourceRef = trimText(input.repoUrl) || trimText(input.sourceRef);
    const stack = inferStack([name, sourceRef, trimText(input.notes)]);
    const zh = /[\u3400-\u9fff]/.test([name, sourceRef, trimText(input.notes)].join(' '));
    const plan: OperatorExecutionPlan = {
      id: createId('plan'),
      title: zh ? '仓库导入执行计划' : 'Repository ingest plan',
      summary: zh
        ? '工作区会先完成真实拉取、结构检测、隔离构建和预览校验，再决定是否进入发布。'
        : 'The workspace will fetch the source, detect the structure, run an isolated build, and verify the preview before publish is allowed.',
      risk: 'low',
      estimatedMinutes: 8,
      estimatedMonthlyCost: stack.monthlyCost,
      assumptions: [
        zh ? '源码必须可被当前运行时访问。' : 'The source must be reachable from the current runtime.',
        zh ? '没有真实构建结果时，不会再展示预览成功。' : 'No successful preview will be shown without a real build result.',
      ],
      confirmations: [
        zh ? '发布正式版前仍需要确认域名、TLS 和流量切换。' : 'Production publish still requires domain, TLS, and traffic confirmation.',
      ],
      steps: [
        {
          id: createId('step'),
          title: zh ? '记录源码来源' : 'Capture source',
          status: 'completed',
          detail: sourceRef || (zh ? '等待补充仓库地址或压缩包链接。' : 'Waiting for a repository or archive URL.'),
        },
        {
          id: createId('step'),
          title: zh ? '真实构建与预览校验' : 'Real build and preview verification',
          status: 'in_progress',
          detail: zh ? '会依次执行 fetch -> detect -> build -> preview health check。' : 'The job will run fetch -> detect -> build -> preview health check.',
        },
        {
          id: createId('step'),
          title: zh ? '发布正式版' : 'Publish release',
          status: 'planned',
          detail: zh ? '只有真实预览通过后，才会进入发布和运维动作。' : 'Publish and operations only continue after a verified preview exists.',
        },
      ],
    };

    const record = createPlanRecord({
      name,
      entryKind: 'upload-project',
      stack,
      summary: zh
        ? '源码来源已接入工作区，正在执行真实拉取和构建。'
        : 'The source has been attached to the workspace and is now being fetched and built.',
      source: {
        repoUrl: sourceRef || null,
        idea: null,
        serverHost: null,
      },
      connector: null,
      status: 'planning',
      healthScore: 56,
      previewUrl: null,
      productionUrl: null,
      plan,
      logsHeadline: zh ? '仓库导入任务已排队。' : 'Repository ingest has been queued.',
      logs: [
        {
          id: createId('event'),
          level: 'info',
          message: zh
            ? `已创建真实仓库导入任务，等待执行 ${sourceRef || 'source ingest'}。`
            : `A real repository ingest job has been created for ${sourceRef || 'the source input'}.`,
          createdAt: nowIso(),
        },
        {
          id: createId('event'),
          level: 'info',
          message: zh ? `目标技术栈候选：${stack.label}。` : `Candidate runtime stack: ${stack.label}.`,
          createdAt: nowIso(),
        },
      ],
      infraItems: [
        { label: zh ? '源码来源' : 'Source', value: sourceRef || (zh ? '待补充' : 'Pending input') },
        { label: zh ? '候选运行时' : 'Candidate runtime', value: stack.runtime },
        { label: zh ? '构建策略' : 'Build strategy', value: stack.build },
      ],
    });
    updateDiagnostics(record, {
      stage: 'fetch',
      headline: zh ? '仓库导入已排队' : 'Repository ingest queued',
      detail: sourceRef || (zh ? '等待仓库地址。' : 'Waiting for a repository URL.'),
      command: sourceRef || null,
      lastError: null,
    });

    const job = createJob({
      capsuleId: record.capsule.id,
      kind: 'build_repo_preview',
      title: zh ? '仓库真实预览构建' : 'Repository preview build',
      summary: zh ? '仓库导入任务已排队。' : 'The repository ingest job is queued.',
      detail: sourceRef || (zh ? '等待仓库地址。' : 'Waiting for a repository URL.'),
      steps: [
        { title: zh ? '拉取源码' : 'Fetch source', detail: zh ? '克隆仓库或下载压缩包。' : 'Clone the repo or download the archive.' },
        { title: zh ? '检测结构' : 'Detect structure', detail: zh ? '识别前端入口和构建方式。' : 'Identify the frontend entry and build mode.' },
        { title: zh ? '生成构建计划' : 'Prepare build plan', detail: zh ? '确认安装命令、构建命令和预览入口。' : 'Confirm install, build, and preview entry commands.' },
        { title: zh ? '执行隔离构建' : 'Run isolated build', detail: zh ? '执行真实安装和构建。' : 'Run a real install and build.' },
        { title: zh ? '准备预览运行时' : 'Prepare preview runtime', detail: zh ? '把真实构建产物挂到统一预览地址。' : 'Attach the real build output to the shared preview URL.' },
        { title: zh ? '健康校验' : 'Health check', detail: zh ? '确认预览入口真实可访问。' : 'Confirm the preview entry is actually ready.' },
      ],
    });
    if (job) {
      void startRepositoryPreviewJob(record, input, job.id);
    }

    return buildEnvelope(record);
  }

  async function generateProjectEnvelope(
    input: GenerateProjectInput,
    hooks: {
      onStage?: (
        stage: OperatorGenerationTaskStatus,
        update: {
          progress: number;
          summary: string;
          detail: string;
        },
      ) => void;
    } = {},
  ): Promise<{ envelope: OperatorEnvelope; previewBuildError: string | null }> {
    const requestedName = trimText(input.projectName) || compactLaunchDisplayTitle('', input.idea);
    const initialLocale = detectGenerateProjectLocale(input);
    const initialZh = initialLocale === 'zh-CN';
    const strictModelGeneration = input.strictModelGeneration === true;

    hooks.onStage?.('planning', {
      progress: 14,
      summary: initialZh ? '正在整理目标并生成首版方案。' : 'Planning the first version now.',
      detail: initialZh
        ? (strictModelGeneration
            ? '当前启用严格真实生成模式，模型没有产出源码包时不会回退模板。'
            : '先确定页面结构、交互重点和预览方式。')
        : (strictModelGeneration
            ? 'Strict real-generation mode is on. If the model does not produce a source bundle, no template fallback will be used.'
            : 'Determining structure, interaction, and preview delivery first.'),
    });

    const planned = await resolveWithTimeout(
      planGeneratedProjectRecipe(input, requestedName, executionProviders),
      90_000,
      () => ({
        recipe: buildFallbackGeneratedProjectRecipe(input, requestedName),
        trace: {
          usedModel: false,
          provider: null,
          model: null,
          error: 'planner_timeout',
        },
      }),
    );
    const plannedRecipe = planned.recipe;
    const recipe = strictModelGeneration && plannedRecipe.kind !== 'workflow-app'
      ? {
        ...plannedRecipe,
        kind: 'workflow-app' as const,
        battle: null,
        stackHint: trimText(plannedRecipe.stackHint) || (plannedRecipe.locale === 'zh-CN' ? '交互式网页应用' : 'interactive web application'),
      }
      : plannedRecipe;
    const zh = recipe.locale === 'zh-CN';

    hooks.onStage?.('coding', {
      progress: recipe.kind === 'workflow-app' ? 48 : 70,
      summary: zh ? '正在生成真实源码文件。' : 'Generating real source files.',
      detail: recipe.kind === 'workflow-app'
        ? (strictModelGeneration
            ? (zh ? '当前不会回退模板，必须由模型直接产出可执行页面文件包。' : 'Template fallback is disabled for this run. The model must return an executable frontend bundle.')
            : (zh ? '模型会优先输出可执行页面文件包，再决定是否需要回退。' : 'The model will try to output executable frontend files before any fallback.'))
        : (zh ? '当前场景使用更轻量的生成链路。' : 'This scenario uses a lighter generation path.'),
    });

    const bundleResult = recipe.kind === 'workflow-app'
      ? await resolveWithTimeout(
        generateProjectBundleFromModel({
          ...input,
          projectName: requestedName,
          audience: trimText(input.audience) || recipe.audience,
          businessGoal: trimText(input.businessGoal) || recipe.goal,
        }, recipe, requestedName, executionProviders),
        10 * 60 * 1000,
        () => ({
          bundle: null,
          trace: {
            usedModel: false,
            provider: null,
            model: null,
            error: 'bundle_timeout',
          },
        }),
      )
      : {
        bundle: null,
        trace: {
          usedModel: false,
          provider: null,
          model: null,
          error: null,
        },
      };
    const name = trimText(recipe.title) || requestedName;
    const stack = inferStack([
      trimText(recipe.stackHint),
      name,
      input.idea,
      trimText(input.audience),
      trimText(input.businessGoal),
    ]);
    const displayStackLabel = localizeStackLabel(stack, recipe.locale);
    const displayRuntime = localizeRuntimeLabel(stack.runtime, recipe.locale);
    const previewUrl = buildPreviewUrl(`${slugify(name, 'idea')}-${stack.slug}`);
    const usedModelBundle = Boolean(bundleResult.bundle && bundleResult.trace.usedModel);
    const directTemplate = bundleResult.bundle
      ? buildModelGeneratedStaticProjectTemplate(
        {
          ...input,
          projectName: name,
          audience: recipe.audience,
          businessGoal: recipe.goal,
        },
        stack,
        name,
        bundleResult.bundle,
        recipe,
      )
      : null;
    if (strictModelGeneration && recipe.kind === 'workflow-app' && !bundleResult.bundle) {
      const trace = [
        planned.trace.error,
        bundleResult.trace.error,
      ].filter((entry): entry is string => Boolean(entry)).join(' | ');
      throw new Error(zh
        ? `严格真实生成未完成：模型没有返回可执行源码包。${trace ? ` 任务记录：${trace}` : ''}`
        : `Strict real generation did not finish because the model did not return an executable source bundle.${trace ? ` Trace: ${trace}` : ''}`);
    }

    hooks.onStage?.('building_preview', {
      progress: 82,
      summary: zh ? '正在构建共享预览。' : 'Building the shared preview now.',
      detail: zh ? '编译完成后会准备工作区、源码包和预览链接。' : 'The workspace, source bundle, and preview links will be prepared after the build.',
    });

    const plan: OperatorExecutionPlan = {
      id: createId('plan'),
      title: zh ? '想法到上线计划' : 'Idea-to-launch plan',
      summary: recipe.subtitle,
      risk: 'medium',
      estimatedMinutes: usedModelBundle ? 12 : planned.trace.usedModel ? 8 : 6,
      estimatedMonthlyCost: stack.monthlyCost,
      assumptions: zh
        ? [
          '第一版先保证页面真实可交互，再继续补复杂后台。',
          '正式上线前，源码包仍然可以继续修改和复查。',
        ]
        : [
          'The first version prioritizes a truly interactive page before a deeper backend.',
          'The source bundle stays editable before production publish.',
        ],
      confirmations: [
        zh ? '正式上线前仍需确认域名、TLS 和流量切换。' : 'Production publish still requires confirmation before domain and traffic cutover.',
      ],
      steps: [
        {
          id: createId('step'),
          title: zh ? '接收目标' : 'Capture intent',
          status: 'completed',
          detail: zh ? '已读取目标用户、主要目标和想法描述。' : 'Audience, business goal, and idea have been captured.',
        },
        {
          id: createId('step'),
          title: zh ? '模型规划第一版' : 'Plan the first version',
          status: 'completed',
          detail: planned.trace.usedModel
            ? (zh
                ? `已通过 ${planned.trace.provider}/${planned.trace.model} 生成交互页面方案。`
                : `Generated an interactive page recipe with ${planned.trace.provider}/${planned.trace.model}.`)
            : (zh
                ? '当前回退到本地规则规划，但仍会生成真实源码包。'
                : 'Fell back to local planning, but still materialized a real source bundle.'),
        },
        {
          id: createId('step'),
          title: zh ? '生成源码包' : 'Materialize source bundle',
          status: 'completed',
          detail: usedModelBundle
            ? (zh
                ? `已通过 ${bundleResult.trace.provider}/${bundleResult.trace.model} 直接生成可执行应用文件包。`
                : `Generated an executable application bundle directly with ${bundleResult.trace.provider}/${bundleResult.trace.model}.`)
            : (zh
                ? `已生成适合 ${displayStackLabel} 的第一版源码包。`
                : `Generated a first-version source bundle for ${displayStackLabel}.`),
        },
        {
          id: createId('step'),
          title: zh ? '准备共享预览' : 'Prepare shared preview',
          status: 'completed',
          detail: zh ? '预览地址已经准备好，可继续试玩、检查和托管。' : 'The preview address is ready for testing, review, and hosting.',
        },
      ],
    };

    const logs: OperatorLogEntry[] = [
      {
        id: createId('event'),
        level: planned.trace.usedModel ? 'success' : 'warning',
        message: planned.trace.usedModel
          ? (zh
              ? `模型规划完成：${planned.trace.provider}/${planned.trace.model} 已返回交互页面方案。`
              : `Model planning finished: ${planned.trace.provider}/${planned.trace.model} returned an interactive app recipe.`)
          : (zh
              ? '模型规划暂不可用，已切换到本地回退生成链。'
              : 'Model planning was unavailable, so the local fallback generation path was used.'),
        createdAt: nowIso(),
      },
      ...(strictModelGeneration && plannedRecipe.kind !== 'workflow-app' ? [{
        id: createId('event'),
        level: 'info' as const,
        message: zh
          ? '已禁用本地小游戏模板捷径，本次必须由模型真实产出源码包。'
          : 'Local game-template shortcuts were disabled for this run. The model must produce the source bundle directly.',
        createdAt: nowIso(),
      }] : []),
      {
        id: createId('event'),
        level: 'info',
        message: zh ? `目标受众：${recipe.audience}。` : `Primary audience: ${recipe.audience}.`,
        createdAt: nowIso(),
      },
      ...(recipe.kind === 'workflow-app' ? [{
        id: createId('event'),
        level: usedModelBundle ? 'success' as const : 'warning' as const,
        message: usedModelBundle
          ? (zh
              ? `模型编码完成：${bundleResult.trace.provider}/${bundleResult.trace.model} 已返回可执行前端文件包。`
              : `Model coding finished: ${bundleResult.trace.provider}/${bundleResult.trace.model} returned an executable frontend bundle.`)
          : (zh
              ? '模型编码暂未产出可执行文件包，已回退到本地交互模板。'
              : 'Model coding did not return an executable bundle, so the local interactive template was used.'),
        createdAt: nowIso(),
      }] : []),
      ...(planned.trace.error ? [{
        id: createId('event'),
        level: 'warning' as const,
        message: zh
          ? `模型链路记录：${planned.trace.error}`
          : `Model planner trace: ${planned.trace.error}`,
        createdAt: nowIso(),
      }] : []),
      ...(bundleResult.trace.error ? [{
        id: createId('event'),
        level: 'warning' as const,
        message: zh
          ? `模型编码链路记录：${bundleResult.trace.error}`
          : `Model coding trace: ${bundleResult.trace.error}`,
        createdAt: nowIso(),
      }] : []),
    ];

    const record = createPlanRecord({
      name,
      entryKind: 'generate-from-idea',
      stack,
      summary: usedModelBundle
        ? (zh
            ? 'AI 已直接生成一版可操作应用，并接上共享预览链路。'
            : 'AI directly generated a usable application and attached a shared preview lane.')
        : (zh
            ? 'AI 已生成一版真实可交互页面，并接上共享预览链路。'
            : 'AI generated a real interactive first version and attached a shared preview lane.'),
      source: {
        repoUrl: null,
        idea: input.idea.trim(),
        serverHost: null,
      },
      connector: null,
      status: 'preview_live',
      healthScore: usedModelBundle ? 86 : planned.trace.usedModel ? 82 : 76,
      previewUrl,
      productionUrl: null,
      plan,
      logsHeadline: zh ? '生成预览已经准备好。' : 'Generated project preview is ready.',
      logs,
      infraItems: [
        { label: zh ? '想法' : 'Idea', value: input.idea.trim().slice(0, 88) },
        { label: zh ? '运行时' : 'Runtime', value: displayRuntime },
        { label: zh ? '生成链路' : 'Generation path', value: usedModelBundle
          ? (zh ? '模型规划 + 模型编码 + 共享预览' : 'model planning + model coding + shared preview')
          : planned.trace.usedModel
            ? (zh ? '模型规划 + 本地源码模板 + 预览构建' : 'model planning + local source template + preview build')
            : (zh ? '本地回退规划 + 本地源码模板 + 预览构建' : 'local fallback planning + local source template + preview build') },
      ],
    });
    record.capsule.generationSource = usedModelBundle ? 'model' : 'template';
    record.capsule.stackLabel = displayStackLabel;
    record.infraSummary.runtime = displayRuntime;
    record.generatedRecipe = recipe;
    materializeGeneratedProject(record, {
      ...input,
      projectName: name,
      audience: recipe.audience,
      businessGoal: recipe.goal,
    }, directTemplate);

    void getPreviewHtml(record.capsule.id);
    const previewBuild = record.generatedProject ? previewBuildRootFor(record) : null;
    const previewBuildError = previewBuild ? readPreviewBuildError(previewBuild) : null;
    if (previewBuildError) {
      record.previewSummary = {
        ...record.previewSummary,
        status: 'failed',
        verified: false,
        verifiedAt: null,
        lastError: previewBuildError,
      };
      updateDiagnostics(record, {
        stage: 'build_preview',
        headline: zh ? '预览构建失败' : 'Preview build failed',
        detail: previewBuildError,
        command: 'vite build',
        lastError: previewBuildError,
      });
      record.capsule.status = 'needs_attention';
      addEvent(record, 'warning', zh
        ? '共享预览编译未完全成功，已切换到诊断页展示错误。'
        : 'Shared preview compilation did not fully succeed, so a diagnostics page is being shown.');
      record.logsSummary.headline = zh ? '预览构建需要处理。' : 'Preview build needs attention.';
      persistState();
    } else {
      record.previewSummary = {
        ...record.previewSummary,
        status: 'verified',
        verified: true,
        verifiedAt: nowIso(),
        lastError: null,
      };
      updateDiagnostics(record, {
        stage: 'build_preview',
        headline: zh ? '真实预览已就绪' : 'Verified preview is ready',
        detail: zh ? '源码、构建和共享预览都已经准备好。' : 'The source, build output, and shared preview are all ready.',
        command: 'vite build',
        lastError: null,
      });
    }

    return {
      envelope: buildEnvelope(record),
      previewBuildError,
    };
  }

  async function generateProject(input: GenerateProjectInput): Promise<OperatorEnvelope> {
    const result = await generateProjectEnvelope(input);
    return result.envelope;
  }

  function startGenerateProjectTask(input: GenerateProjectInput) {
    const requestedName = trimText(input.projectName) || compactLaunchDisplayTitle('', input.idea);
    const task = buildGenerationTask(input, requestedName);
    generationTasks.set(task.id, task);
    persistState();

    void (async () => {
      try {
        const result = await generateProjectEnvelope(input, {
          onStage: (stage, update) => {
            markGenerationTaskStage(task.id, stage, update);
          },
        });
        const capsuleId = result.envelope.capsule.id;
        const previewUrl = result.envelope.capsule.previewUrl ?? result.envelope.previewUrl;
        updateGenerationTask(task.id, (current) => {
          current.capsuleId = capsuleId;
          current.capsulePath = `/workspaces/${capsuleId}`;
          current.previewUrl = previewUrl;
        });

        const workspaceRecord = requireRecord(capsuleId);
        const zh = detectGenerateProjectLocale(input) === 'zh-CN';
        if (workspaceRecord && !listJobsForCapsule(capsuleId).some((job) => job.kind === 'build_idea_preview')) {
          const job = createJob({
            capsuleId,
            kind: 'build_idea_preview',
            title: zh ? '想法真实生成' : 'Idea build preview',
            summary: zh ? '想法生成任务已经完成。' : 'The idea build job completed.',
            detail: zh ? '源码、预览和工作区已经生成。' : 'The source bundle, preview, and workspace have been generated.',
            steps: [
              { title: zh ? '整理目标' : 'Capture intent', detail: zh ? '读取用户目标、受众和商业目标。' : 'Read the goal, audience, and business outcome.' },
              { title: zh ? '模型规划' : 'Plan with model', detail: zh ? '产出结构化方案和文件清单。' : 'Produce the structured plan and file list.' },
              { title: zh ? '生成源码' : 'Generate source', detail: zh ? '生成真实源码文件。' : 'Generate real source files.' },
              { title: zh ? '构建预览' : 'Build preview', detail: zh ? '编译预览并验证结果。' : 'Build and verify the preview.' },
            ],
          });
          if (job) {
            const finalStatus: OperatorJobStatus = result.previewBuildError ? 'failed' : 'completed';
            updateJob(job.id, (currentJob) => {
              currentJob.status = finalStatus;
              currentJob.progress = 100;
              currentJob.summary = result.previewBuildError
                ? (zh ? '源码已生成，但预览构建失败。' : 'The source bundle is ready, but preview build failed.')
                : (zh ? '真实应用和共享预览已经准备好。' : 'The real app and shared preview are ready.');
              currentJob.detail = result.previewBuildError
                ? (zh ? '工作区里保留了源码包和真实诊断。' : 'The workspace retains the source bundle and real diagnostics.')
                : (previewUrl ?? currentJob.detail);
              currentJob.error = result.previewBuildError ?? null;
              currentJob.completedAt = nowIso();
              currentJob.steps.forEach((step, index) => {
                step.status = result.previewBuildError && index === currentJob.steps.length - 1 ? 'attention' : 'completed';
                step.startedAt ??= nowIso();
                step.completedAt ??= nowIso();
              });
            });
          }
        }

        if (result.previewBuildError) {
          markGenerationTaskStage(task.id, 'failed', {
            progress: 100,
            summary: detectGenerateProjectLocale(input) === 'zh-CN'
              ? '源码已生成，但预览构建失败。'
              : 'Source bundle is ready, but preview build failed.',
            detail: detectGenerateProjectLocale(input) === 'zh-CN'
              ? '可以先打开工作区查看源码包和诊断页，再继续修复。'
              : 'Open the workspace to inspect the source bundle and diagnostics page.',
            error: result.previewBuildError,
          });
          return;
        }

        markGenerationTaskStage(task.id, 'completed', {
          progress: 100,
          summary: detectGenerateProjectLocale(input) === 'zh-CN'
            ? '真实应用和共享预览已经准备好。'
            : 'The real app and shared preview are ready.',
          detail: detectGenerateProjectLocale(input) === 'zh-CN'
            ? '现在可以打开工作区，继续体验、托管上线或迁移到 VPS。'
            : 'Open the workspace now to test it, launch it, or move it to a VPS.',
        });
      } catch (error) {
        const message = trimText(error instanceof Error ? error.message : String(error)) || 'unknown_generation_error';
        markGenerationTaskStage(task.id, 'failed', {
          progress: 100,
          summary: detectGenerateProjectLocale(input) === 'zh-CN'
            ? '生成任务失败。'
            : 'Generation task failed.',
          detail: detectGenerateProjectLocale(input) === 'zh-CN'
            ? '这次没有成功产出结果，可以重新发起一次，或稍后查看日志后继续。'
            : 'No result was produced this time. Try again or inspect the logs and continue later.',
          error: message,
        });
      }
    })();

    return cloneGenerationTask(task);
  }

  function getGenerationTask(taskId: string) {
    const task = generationTasks.get(taskId);
    return task ? cloneGenerationTask(task) : null;
  }

  function scanServer(input: ScanServerInput): OperatorEnvelope {
    const label = trimText(input.label) || input.host;
    const stack = inferStack([label, input.host]);
    const zh = /[\u3400-\u9fff]/.test([label, input.host].join(' '));
    const connector: OperatorServerConnector = {
      mode: input.authMode,
      host: input.host.trim(),
      port: input.port && Number.isFinite(input.port) ? input.port : 22,
      username: input.username.trim(),
      trust: input.authMode === 'agent' ? 'verified' : 'pending',
    };
    const plan: OperatorExecutionPlan = {
      id: createId('plan'),
      title: zh ? '旧服务器只读体检计划' : 'Bring-your-own-server audit plan',
      summary: zh
        ? '系统会先做真实 SSH 只读采集，再根据体检结果开放接管和迁移动作。'
        : 'The workspace will run a real SSH read-only audit before takeover and migration are allowed.',
      risk: 'high',
      estimatedMinutes: 8,
      estimatedMonthlyCost: zh ? '迁移前 $0 / 迁移后从 $18 起' : '$0 before migration / from $18 after migration',
      assumptions: [
        zh ? '只读扫描会立即执行。' : 'The read-only scan can start immediately.',
        zh ? '任何远程变更仍然需要显式确认。' : 'Any remote mutation still requires explicit confirmation.',
      ],
      confirmations: [
        zh ? '接管前需要确认长期凭据和持续运维权限。' : 'Takeover still requires confirmation before long-lived credentials are attached.',
        zh ? '迁移前需要确认数据复制和切换窗口。' : 'Migration still requires confirmation before data copy and cutover.',
      ],
      steps: [
        {
          id: createId('step'),
          title: zh ? '建立接入配置' : 'Create connector',
          status: 'completed',
          detail: `${connector.mode === 'password' ? (zh ? '密码' : 'Password') : connector.mode === 'ssh-key' ? 'SSH key' : 'Agent'} ${zh ? '模式已就绪。' : 'mode is ready.'}`,
        },
        {
          id: createId('step'),
          title: zh ? '执行只读体检' : 'Run read-only audit',
          status: 'in_progress',
          detail: zh ? '会真实采集 OS、资源、容器、端口和域名信息。' : 'The job will collect OS, runtime, ports, and domain inventory.',
        },
        {
          id: createId('step'),
          title: zh ? '接管或迁移' : 'Take over or migrate',
          status: 'attention',
          detail: zh ? '只有体检完成后，才允许进入接管或迁移。' : 'Takeover and migration stay blocked until the audit is complete.',
        },
      ],
    };

    const record = createPlanRecord({
      name: label,
      entryKind: 'scan-server',
      stack,
      summary: zh
        ? '旧服务器体检任务已排队，正在等待真实 SSH 只读采集。'
        : 'The server audit job has been queued and is waiting for a real SSH read-only scan.',
      source: {
        repoUrl: null,
        idea: null,
        serverHost: input.host.trim(),
      },
      connector,
      status: 'planning',
      healthScore: input.authMode === 'password' ? 58 : 64,
      previewUrl: null,
      productionUrl: null,
      plan,
      logsHeadline: zh ? '旧服务器只读体检已排队。' : 'The read-only server audit has been queued.',
      logs: [
        {
          id: createId('event'),
          level: 'info',
          message: zh
            ? '已创建真实 SSH 只读体检任务，高风险动作仍然保持确认门槛。'
            : 'A real SSH read-only audit job has been created. High-risk actions stay confirmation-gated.',
          createdAt: nowIso(),
        },
        {
          id: createId('event'),
          level: 'info',
          message: `${input.username.trim()}@${input.host.trim()}:${connector.port}`,
          createdAt: nowIso(),
        },
      ],
      infraItems: [
        { label: zh ? '服务器' : 'Server', value: `${input.username.trim()}@${input.host.trim()}:${connector.port}` },
        { label: zh ? '接入方式' : 'Auth mode', value: connector.mode },
        { label: zh ? '路径' : 'Path', value: zh ? 'audit -> confirm -> takeover / migrate' : 'audit -> confirm -> takeover / migrate' },
      ],
      region: zh ? '自带服务器' : 'Bring-your-own server',
    });
    updateDiagnostics(record, {
      stage: 'scan_server',
      headline: zh ? '旧服务器体检已排队' : 'Server audit queued',
      detail: `${input.username.trim()}@${input.host.trim()}:${connector.port}`,
      command: 'ssh',
      lastError: null,
    });
    rememberConnectorSecret(record.capsule.id, {
      host: input.host.trim(),
      port: connector.port,
      username: input.username.trim(),
      password: input.authMode === 'password' ? trimText(input.password) || undefined : undefined,
      sshKey: input.authMode === 'ssh-key' ? trimText(input.sshKey) || undefined : undefined,
      agentSocket: input.authMode === 'agent' ? process.env.SSH_AUTH_SOCK || undefined : undefined,
      readyTimeoutMs: 20_000,
    });

    const job = createJob({
      capsuleId: record.capsule.id,
      kind: 'scan_server',
      title: zh ? '旧服务器真实体检' : 'Real server audit',
      summary: zh ? '旧服务器体检任务已排队。' : 'The server audit job is queued.',
      detail: `${input.username.trim()}@${input.host.trim()}:${connector.port}`,
      steps: [
        { title: zh ? '读取系统信息' : 'Read system inventory', detail: zh ? '采集 OS、内核、CPU、内存和磁盘。' : 'Collect OS, kernel, CPU, memory, and disk details.' },
        { title: zh ? '读取运行时信息' : 'Read runtime inventory', detail: zh ? '采集 Docker、Compose、Web 服务和业务进程。' : 'Collect Docker, Compose, web server, and process details.' },
        { title: zh ? '读取网络与域名' : 'Read network inventory', detail: zh ? '采集开放端口和域名配置。' : 'Collect open ports and detected domain configuration.' },
      ],
    });
    if (job) {
      void startServerScanJob(record, input, job.id);
    }

    return buildEnvelope(record);
  }

  function getCapsule(capsuleId: string) {
    const record = requireRecord(capsuleId);
    return record ? buildEnvelope(record) : null;
  }

  function findRecordByRef(capsuleRef: string) {
    const normalizedRef = decodeURIComponent(capsuleRef).trim();
    if (!normalizedRef) {
      return null;
    }

    const directRecord = capsules.get(normalizedRef);
    if (directRecord) {
      if (alignPreviewUrlWithSlug(directRecord)) {
        persistState();
      }
      return directRecord;
    }

    const matched = [...capsules.values()]
      .filter((record) => {
        if (record.capsule.slug === normalizedRef) {
          return true;
        }

        if (!record.capsule.previewUrl) {
          return false;
        }

        try {
          const parsed = new URL(record.capsule.previewUrl);
          const segment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
          return segment === normalizedRef;
        } catch {
          return false;
        }
      })
      .sort((left, right) => Date.parse(right.capsule.updatedAt) - Date.parse(left.capsule.updatedAt))[0]
      ?? null;

    if (matched && alignPreviewUrlWithSlug(matched)) {
      persistState();
    }

    return matched;
  }

  function readGeneratedSourceFile(record: CapsuleRecord, path: string) {
    const directory = ensureGeneratedProjectSource(record) ?? ensureGeneratedProjectDirectory(record.capsule.id);
    if (!directory) {
      return null;
    }

    const absolutePath = join(directory.sourceRoot, path);
    if (!existsSync(absolutePath)) {
      return null;
    }

    try {
      return readFileSync(absolutePath, 'utf8');
    } catch {
      return null;
    }
  }

  function renderStaticGeneratedPreviewHtml(record: CapsuleRecord) {
    if (!record.generatedProject || record.generatedProject.entryFile !== 'index.html') {
      return null;
    }

    const html = readGeneratedSourceFile(record, 'index.html');
    if (!html) {
      return null;
    }

    if (/src\/main\.(t|j)sx?/i.test(html) || /<script[^>]+type=["']module["']/i.test(html)) {
      return null;
    }

    let output = html;
    const styles = readGeneratedSourceFile(record, 'styles.css');
    if (styles) {
      const styleTag = `<style>\n${styles}\n</style>`;
      if (/<link[^>]+href=["'](?:\.\/|\/)?styles\.css["'][^>]*>/i.test(output)) {
        output = output.replace(/<link[^>]+href=["'](?:\.\/|\/)?styles\.css["'][^>]*>/i, styleTag);
      } else if (output.includes('</head>')) {
        output = output.replace('</head>', `${styleTag}\n</head>`);
      } else {
        output = `${styleTag}\n${output}`;
      }
    }

    const script = readGeneratedSourceFile(record, 'app.js');
    if (script) {
      const safeScript = script.replace(/<\/script/gi, '<\\/script');
      const scriptTag = `<script>\n${safeScript}\n</script>`;
      if (/<script[^>]+src=["'](?:\.\/|\/)?app\.js["'][^>]*>\s*<\/script>/i.test(output)) {
        output = output.replace(/<script[^>]+src=["'](?:\.\/|\/)?app\.js["'][^>]*>\s*<\/script>/i, scriptTag);
      } else if (output.includes('</body>')) {
        output = output.replace('</body>', `${scriptTag}\n</body>`);
      } else {
        output = `${output}\n${scriptTag}`;
      }
    }

    const marker = `<meta name="sloth-preview-capsule" content="${escapeHtml(record.capsule.id)}" />`;
    if (output.includes('</head>')) {
      output = output.replace('</head>', `${marker}\n</head>`);
    } else {
      output = `${marker}\n${output}`;
    }

    return output;
  }

  function renderGeneratedExperiencePreviewHtml(record: CapsuleRecord) {
    const capsule = record.capsule;
    const idea = capsule.source.idea || capsule.summary;
    const zh = record.generatedRecipe?.locale === 'zh-CN' || /[\u3400-\u9fff]/.test(`${capsule.name} ${idea}`);
    const displayTitle = compactLaunchDisplayTitle(capsule.name, idea);
    const audience = trimText(record.generatedRecipe?.audience)
      || (capsule.source.idea ? (zh ? '普通用户' : 'General users') : (zh ? '现有项目用户' : 'Existing project users'));
    const firstRunCommand = record.generatedProject?.runCommands[0] ?? (zh ? '打开预览后继续推进上线' : 'Open preview and continue to publish');
    const bundleLink = record.generatedProject?.archiveUrl
      ? `<a class="button" href="${escapeHtml(record.generatedProject.archiveUrl)}">${zh ? '下载源码包' : 'Download source package'}</a>`
      : '';
    const productionLink = capsule.productionUrl
      ? `<a class="button button-primary" href="${escapeHtml(capsule.productionUrl)}" target="_blank" rel="noreferrer">${zh ? '打开正式站点' : 'Open production'}</a>`
      : '';
    const previewState = capsule.productionUrl
      ? (zh ? '正式版已在线' : 'Production is online')
      : (zh ? '预览已经准备好' : 'Preview is ready');
    const featureTiles = [
      [zh ? '面向用户' : 'Audience', audience],
      [zh ? '运行方式' : 'Runtime', capsule.stackLabel],
      [zh ? '成本计划' : 'Plan', record.plan.estimatedMonthlyCost],
      [zh ? '执行入口' : 'Execution', firstRunCommand],
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    const eventRows = record.logsSummary.entries
      .slice(0, 4)
      .map((event) => `<li><strong>${escapeHtml(event.level)}</strong><span>${escapeHtml(event.message)}</span></li>`)
      .join('');

    return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(displayTitle)} · ${zh ? '树懒云预览' : 'Sloth Cloud Preview'}</title>
    <style>
      :root { font-family: "SF Pro Display", "Segoe UI", sans-serif; color: #13231d; background: #ecf7ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 10% 10%, #c7f8ea 0%, #ecf7ff 38%, #f7f2ff 100%); }
      main { width: min(100% - 28px, 1080px); margin: 0 auto; padding: 28px 0 42px; display: grid; gap: 20px; }
      section { border-radius: 20px; border: 1px solid rgba(16, 74, 60, 0.12); background: rgba(255, 255, 255, 0.84); box-shadow: 0 22px 62px rgba(15, 43, 36, 0.12); padding: 24px; }
      .hero { min-height: 330px; display: grid; align-content: center; gap: 14px; background: linear-gradient(135deg, rgba(120, 245, 220, 0.22), rgba(128, 198, 255, 0.2)), rgba(255,255,255,0.88); }
      .eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #0a7a64; font-weight: 800; }
      h1 { margin: 0; font-size: clamp(38px, 8vw, 78px); line-height: 0.92; }
      h2 { margin: 0; font-size: clamp(24px, 4vw, 34px); }
      p { margin: 0; color: #425e55; line-height: 1.72; font-size: 17px; }
      .chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .chip { border-radius: 999px; border: 1px solid rgba(9, 122, 100, 0.16); padding: 8px 12px; background: rgba(255, 255, 255, 0.72); font-weight: 700; color: #0f4c3f; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .grid article { border-radius: 14px; border: 1px solid rgba(18, 60, 50, 0.1); background: #f3faf8; padding: 15px; display: grid; gap: 8px; }
      .grid span { color: #6d847c; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
      .grid strong { font-size: 18px; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      li { display: flex; gap: 10px; align-items: start; color: #466059; }
      li strong { min-width: 72px; color: #0a7a64; text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; border-radius: 12px; border: 1px solid rgba(9, 122, 100, 0.24); padding: 10px 14px; color: #0a7a64; font-weight: 700; background: rgba(255,255,255,0.92); }
      .button-primary { background: #0e7d66; border-color: #0e7d66; color: #ffffff; }
      @media (max-width: 760px) { main { width: min(100% - 16px, 1080px); padding: 16px 0 24px; gap: 14px; } section { padding: 18px; border-radius: 16px; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">${zh ? 'AI 生成应用预览' : 'AI generated app preview'}</p>
        <h1>${escapeHtml(displayTitle)}</h1>
        <p>${escapeHtml(idea)}</p>
        <div class="chips">
          <span class="chip">${escapeHtml(previewState)}</span>
          <span class="chip">${escapeHtml(capsule.stackLabel)}</span>
          <span class="chip">${zh ? '健康度' : 'Health'} ${escapeHtml(String(capsule.healthScore))}</span>
        </div>
      </section>
      <section>
        <p class="eyebrow">${zh ? '构建结果' : 'Build output'}</p>
        <h2>${zh ? '已经生成真实可交互的第一版页面' : 'An interactive prototype has been generated'}</h2>
        <p>${zh ? '这个预览背后对应的是真实源码包。你可以继续迭代、试玩第一条流程，再推进到托管正式版。' : 'This preview is backed by a real source package. You can iterate on it, test the first flow, and continue to managed production.'}</p>
        <div class="actions">
          ${bundleLink}
          ${productionLink}
        </div>
      </section>
      <section class="grid">${featureTiles}</section>
      <section>
        <p class="eyebrow">${zh ? '最新事件' : 'Latest events'}</p>
        <ul>${eventRows}</ul>
      </section>
    </main>
  </body>
</html>`;
  }

  function renderGeneratedProjectBuildErrorHtml(record: CapsuleRecord, error: string) {
    const capsule = record.capsule;
    const idea = capsule.source.idea || capsule.summary;
    const zh = record.generatedRecipe?.locale === 'zh-CN' || /[\u3400-\u9fff]/.test(`${capsule.name} ${idea}`);
    const displayTitle = compactLaunchDisplayTitle(capsule.name, idea);
    const bundleLink = record.generatedProject?.archiveUrl
      ? `<a class="button button-primary" href="${escapeHtml(record.generatedProject.archiveUrl)}">${zh ? '下载源码包' : 'Download source package'}</a>`
      : '';
    const previewLink = capsule.previewUrl
      ? `<a class="button" href="${escapeHtml(capsule.previewUrl)}">${zh ? '重新尝试预览' : 'Retry preview'}</a>`
      : '';

    return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(displayTitle)} · ${zh ? '预览构建诊断' : 'Preview build diagnostics'}</title>
    <style>
      :root { font-family: "SF Pro Display", "Segoe UI", sans-serif; color: #13231d; background: #eef5f3; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #eef5f3 0%, #f9f7ff 100%); }
      main { width: min(100% - 24px, 960px); margin: 0 auto; padding: 24px 0 42px; display: grid; gap: 18px; }
      section { border-radius: 20px; border: 1px solid rgba(15, 43, 36, 0.12); background: rgba(255, 255, 255, 0.92); box-shadow: 0 22px 62px rgba(15, 43, 36, 0.1); padding: 22px; }
      .hero { background: linear-gradient(135deg, rgba(255, 236, 216, 0.8), rgba(255, 255, 255, 0.92)); }
      .eyebrow { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #996029; font-weight: 800; }
      h1, h2 { margin: 0; }
      h1 { font-size: clamp(32px, 6vw, 52px); line-height: 0.96; }
      h2 { font-size: 24px; }
      p { margin: 0; color: #425e55; line-height: 1.72; font-size: 16px; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
      .button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; border-radius: 12px; border: 1px solid rgba(9, 122, 100, 0.24); padding: 10px 14px; color: #0a7a64; font-weight: 700; background: rgba(255,255,255,0.92); }
      .button-primary { background: #0e7d66; border-color: #0e7d66; color: #ffffff; }
      pre { margin: 0; padding: 16px; overflow: auto; border-radius: 16px; background: #0f1a17; color: #e5fff6; font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">${zh ? '预览构建需要处理' : 'Preview build needs attention'}</p>
        <h1>${escapeHtml(displayTitle)}</h1>
        <p>${zh ? '源码包是真实的，但这次交互预览编译没有成功。这里直接展示构建诊断，而不是继续用静态海报掩盖失败。' : 'The source bundle is real, but the interactive preview did not compile successfully. This page is showing the build diagnostics instead of hiding the failure behind a static poster.'}</p>
        <div class="actions">
          ${bundleLink}
          ${previewLink}
        </div>
      </section>
      <section>
        <p class="eyebrow">${zh ? '构建日志' : 'Build log'}</p>
        <h2>${zh ? '编译输出' : 'Compilation output'}</h2>
        <pre>${escapeHtml(error)}</pre>
      </section>
    </main>
  </body>
</html>`;
  }

  function renderOperatorPreviewHtml(record: CapsuleRecord) {
    const capsule = record.capsule;
    const zh = /[\u3400-\u9fff]/.test([
      capsule.name,
      capsule.summary,
      capsule.source.idea,
      record.plan.title,
    ].filter(Boolean).join(' '));
    const sourceLabel = capsule.source.idea
      ?? capsule.source.repoUrl
      ?? capsule.source.serverHost
      ?? (zh ? '树懒云项目工作区' : 'Sloth Cloud Operator workspace');
    const statusText = capsule.status === 'production_live'
      ? (zh ? '正式版在线' : 'Production-ready')
      : capsule.status === 'preview_live'
        ? (zh ? '预览可用' : 'Preview live')
        : (zh ? '规划中' : 'Planning');
    const eventItems = record.logsSummary.entries
      .map((event) => {
        const levelLabel = zh
          ? ({
            info: '信息',
            success: '成功',
            warning: '提醒',
            error: '错误',
          } satisfies Record<OperatorLogLevel, string>)[event.level]
          : event.level;
        return `<li><strong>${escapeHtml(levelLabel)}</strong><span>${escapeHtml(event.message)}</span></li>`;
      })
      .join('');
    const projectBundle = record.generatedProject?.archiveUrl
      ? `<section>
        <span class="eyebrow">${zh ? '源码包' : 'Project bundle'}</span>
        <h2>${zh ? '下载 AI 生成的源码包' : 'Download the AI generated source package'}</h2>
        <p>${zh
          ? '这个工作区已经带有真实源码压缩包，你可以查看、编辑，或者继续推进到托管上线。'
          : 'This workspace already has a materialized project archive that can be reviewed, edited, or sent into managed hosting.'}</p>
        <p><a href="${escapeHtml(record.generatedProject.archiveUrl)}">${zh ? '下载' : 'Download'} ${escapeHtml(record.generatedProject.archiveName)}</a></p>
      </section>`
      : '';

    return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(capsule.name)} · Sloth Preview</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #11201b; background: #f5fbf8; }
      body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #f5fbf8 0%, #e8f6ff 46%, #f8f5ff 100%); }
      main { width: min(100% - 36px, 1120px); margin: 0 auto; padding: 56px 0; display: grid; gap: 24px; }
      section { border: 1px solid rgba(18, 88, 72, 0.16); border-radius: 24px; background: rgba(255, 255, 255, 0.82); box-shadow: 0 20px 70px rgba(18, 56, 48, 0.12); padding: 28px; }
      .hero { min-height: 420px; display: grid; align-content: center; gap: 22px; background: linear-gradient(135deg, rgba(122, 246, 221, 0.24), rgba(108, 174, 252, 0.2)), rgba(255, 255, 255, 0.86); }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.16em; font-size: 12px; font-weight: 800; color: #087863; }
      h1 { margin: 0; font-size: clamp(42px, 8vw, 86px); line-height: 0.94; letter-spacing: -0.04em; }
      h2 { margin: 0; font-size: clamp(24px, 4vw, 38px); }
      p { margin: 0; color: #48615a; line-height: 1.75; font-size: 17px; }
      .chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .chip { border: 1px solid rgba(8, 120, 99, 0.18); border-radius: 999px; background: rgba(255,255,255,0.72); padding: 9px 13px; font-weight: 700; color: #0f4e43; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .tile { display: grid; gap: 8px; border-radius: 18px; background: rgba(245, 251, 248, 0.9); padding: 18px; border: 1px solid rgba(18, 88, 72, 0.12); }
      .tile span { color: #6d817b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; }
      .tile strong { font-size: 20px; }
      ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
      li { display: flex; gap: 12px; align-items: start; color: #48615a; }
      li strong { color: #087863; min-width: 78px; }
      @media (max-width: 760px) { main { width: min(100% - 20px, 1120px); padding: 24px 0; } section { padding: 20px; border-radius: 20px; } .grid { grid-template-columns: 1fr; } .hero { min-height: auto; } }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">${zh ? '树懒云 AI 预览' : 'Sloth Cloud AI Preview'}</span>
        <h1>${escapeHtml(capsule.name)}</h1>
        <p>${escapeHtml(capsule.summary)}</p>
        <div class="chips">
          <span class="chip">${escapeHtml(statusText)}</span>
          <span class="chip">${escapeHtml(capsule.stackLabel)}</span>
          <span class="chip">${zh ? '健康分' : 'Health'} ${escapeHtml(String(capsule.healthScore))}</span>
        </div>
      </section>
      <section>
        <span class="eyebrow">${zh ? '计划' : 'Plan'}</span>
        <h2>${escapeHtml(record.plan.title)}</h2>
        <p>${escapeHtml(record.plan.summary)}</p>
      </section>
      <section class="grid">
        <div class="tile"><span>${zh ? '来源' : 'Source'}</span><strong>${escapeHtml(sourceLabel.slice(0, 96))}</strong></div>
        <div class="tile"><span>${zh ? '运行时' : 'Runtime'}</span><strong>${escapeHtml(record.infraSummary.runtime)}</strong></div>
        <div class="tile"><span>${zh ? '成本' : 'Cost'}</span><strong>${escapeHtml(record.plan.estimatedMonthlyCost)}</strong></div>
      </section>
      <section>
        <span class="eyebrow">${zh ? '最近执行记录' : 'Latest operator events'}</span>
        <ul>${eventItems}</ul>
      </section>
      ${projectBundle}
    </main>
  </body>
</html>`;
  }

  function renderPreviewHtml(record: CapsuleRecord) {
    if (record.generatedProject) {
      return renderStaticGeneratedPreviewHtml(record) ?? renderGeneratedExperiencePreviewHtml(record);
    }

    return renderOperatorPreviewHtml(record);
  }

  function getPreviewHtml(capsuleRef: string) {
    const record = findRecordByRef(capsuleRef);
    if (!record) {
      return null;
    }

    const staticPreview = record.generatedProject ? renderStaticGeneratedPreviewHtml(record) : null;
    if (staticPreview) {
      return staticPreview;
    }

    const build = record.generatedProject
      ? ensureGeneratedProjectPreviewBuild(record)
      : previewBuildRootFor(record);
    if (build && existsSync(build.indexPath)) {
      try {
        let html = readFileSync(build.indexPath, 'utf8');
        if (!record.generatedProject && !/<base\s/i.test(html)) {
          const baseTag = `<base href="/api/v1/operator/previews/${encodeURIComponent(record.capsule.slug)}/" />`;
          html = html.includes('</head>')
            ? html.replace('</head>', `${baseTag}\n</head>`)
            : `${baseTag}\n${html}`;
        }
        return html;
      } catch {
        return renderPreviewHtml(record);
      }
    }

    const previewBuild = record.generatedProject ? previewBuildRootFor(record) : null;
    const buildError = previewBuild ? readPreviewBuildError(previewBuild) : null;
    if (buildError) {
      return renderGeneratedProjectBuildErrorHtml(record, buildError);
    }

    return renderPreviewHtml(record);
  }

  function getPreviewProxyTarget(capsuleRef: string) {
    const record = findRecordByRef(capsuleRef);
    if (!record) {
      return null;
    }

    return previewRuntimes.get(record.capsule.id)?.baseUrl ?? null;
  }

  function getPreviewAsset(capsuleRef: string, assetPath: string) {
    const record = findRecordByRef(capsuleRef);
    if (!record) {
      return null;
    }

    const build = record.generatedProject
      ? ensureGeneratedProjectPreviewBuild(record)
      : previewBuildRootFor(record);
    if (!build) {
      return null;
    }

    const normalizedPath = normalizeGeneratedProjectPath(assetPath);
    if (!normalizedPath) {
      return null;
    }

    const absolutePath = resolve(build.buildRoot, normalizedPath);
    const relativePath = relative(build.buildRoot, absolutePath);
    if (relativePath.startsWith('..') || !existsSync(absolutePath)) {
      return null;
    }

    return {
      absolutePath,
      contentType: generatedProjectContentType(absolutePath),
    };
  }

  function getGeneratedProject(capsuleRef: string) {
    const record = findRecordByRef(capsuleRef);
    return record?.generatedProject ?? null;
  }

  function getGeneratedProjectArchive(capsuleRef: string) {
    const record = findRecordByRef(capsuleRef);
    if (!record?.generatedProject) {
      return null;
    }

    const archivePath = ensureGeneratedProjectArchive(record.capsule.id);
    if (!archivePath || !existsSync(archivePath)) {
      return null;
    }

    return {
      absolutePath: archivePath,
      downloadName: record.generatedProject.archiveName,
    };
  }

  function getWorkspaceArchive(capsuleRef: string) {
    const record = findRecordByRef(capsuleRef);
    if (!record) {
      return null;
    }

    const archivePath = ensureGeneratedProjectArchive(record.capsule.id);
    if (!archivePath || !existsSync(archivePath)) {
      return null;
    }

    return {
      absolutePath: archivePath,
      downloadName: `${record.capsule.slug}.tar.gz`,
    };
  }

  function cleanupCapsuleResources(capsuleId: string, deleteWorkspaceFiles = true) {
    stopWorkspacePreviewRuntime(capsuleId);
    connectorSecrets.delete(capsuleId);

    for (const [token, pending] of confirmations.entries()) {
      if (pending.capsuleId === capsuleId) {
        confirmations.delete(token);
      }
    }

    for (const [jobId, job] of jobs.entries()) {
      if (job.capsuleId === capsuleId) {
        jobs.delete(jobId);
      }
    }

    for (const [taskId, task] of generationTasks.entries()) {
      if (task.capsuleId === capsuleId) {
        generationTasks.delete(taskId);
      }
    }

    if (deleteWorkspaceFiles && generatedProjectsRoot) {
      try {
        rmSync(join(generatedProjectsRoot, capsuleId), { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for local development.
      }
    }
  }

  function deleteCapsule(capsuleId: string) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return false;
    }

    cleanupCapsuleResources(record.capsule.id);
    capsules.delete(capsuleId);
    persistState();
    return true;
  }

  function deleteLegacyTemplateCapsules() {
    const legacyCapsules = [...capsules.values()].filter((record) => record.capsule.generationSource === 'template');
    if (legacyCapsules.length === 0) {
      return 0;
    }

    for (const record of legacyCapsules) {
      cleanupCapsuleResources(record.capsule.id);
      capsules.delete(record.capsule.id);
    }

    persistState();
    return legacyCapsules.length;
  }

  function clearHistory() {
    const deletedCapsules = capsules.size;
    const deletedJobs = jobs.size;
    const deletedTasks = generationTasks.size;

    for (const capsuleId of [...capsules.keys()]) {
      cleanupCapsuleResources(capsuleId, false);
    }

    capsules.clear();
    jobs.clear();
    generationTasks.clear();
    confirmations.clear();
    connectorSecrets.clear();

    if (generatedProjectsRoot) {
      try {
        rmSync(generatedProjectsRoot, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for local development.
      }
    }

    persistState();
    return {
      deletedCapsules,
      deletedJobs,
      deletedTasks,
    };
  }

  function deployPreview(capsuleId: string) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'deploy_preview',
    });
    return buildEnvelope(record);
  }

  function publishRelease(capsuleId: string, confirmationToken?: string | null) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    const confirmation = consumeConfirmation(capsuleId, 'publish_release', confirmationToken);
    if (!confirmation.ok) {
      return buildEnvelope(record, buildConfirmation(confirmation.pending));
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'publish_release',
    });
    return buildEnvelope(record);
  }

  function bindDomain(input: BindDomainInput) {
    const record = requireRecord(input.capsuleId);
    if (!record) {
      return null;
    }

    const hostname = trimText(input.hostname).toLowerCase();
    if (!hostname) {
      return null;
    }

    const productionUrl = `https://${hostname}`;
    const provider = trimText(input.provider) || 'Custom DNS provider';
    const zone = trimText(input.zone);
    const recordType = trimText(input.recordType);
    const recordValue = trimText(input.recordValue);
    const tlsStatus = trimText(input.tlsStatus) || 'active';
    const notes = trimText(input.notes);

    record.capsule.productionUrl = productionUrl;
    record.infraSummary.productionEndpoint = productionUrl;
    record.capsule.status = 'production_live';
    record.capsule.healthScore = Math.max(record.capsule.healthScore, 88);
    addEvent(record, 'success', `Primary domain routed: ${productionUrl}.`);
    addEvent(record, 'success', `TLS certificate status: ${tlsStatus}.`);
    addEvent(record, 'info', `Domain provider linked: ${provider}.`);
    if (notes) {
      addEvent(record, 'info', notes);
    }

    record.infraSummary.items = [
      ...record.infraSummary.items.filter((item) => ![
        'Primary domain',
        'DNS provider',
        'DNS zone',
        'DNS record',
        'TLS',
      ].includes(item.label)),
      { label: 'Primary domain', value: productionUrl },
      { label: 'DNS provider', value: provider },
      ...(zone ? [{ label: 'DNS zone', value: zone }] : []),
      ...(recordType && recordValue ? [{ label: 'DNS record', value: `${recordType} -> ${recordValue}` }] : []),
      { label: 'TLS', value: tlsStatus },
    ];
    record.logsSummary.headline = 'Domain and TLS are attached to production.';
    persistState();
    return buildEnvelope(record);
  }

  function enableMonitoring(input: EnableMonitoringInput) {
    const record = requireRecord(input.capsuleId);
    if (!record) {
      return null;
    }

    const monitorUrl = trimText(input.monitorUrl)
      || record.capsule.productionUrl
      || record.capsule.previewUrl;
    if (!monitorUrl) {
      return null;
    }

    const provider = trimText(input.provider) || 'External monitor';
    const healthcheckId = trimText(input.healthcheckId);
    const channelLabels = (input.channels ?? [])
      .map((entry) => trimText(entry))
      .filter((entry) => entry.length > 0);
    const notes = trimText(input.notes);

    addEvent(record, 'success', `Monitoring enabled for ${monitorUrl}.`);
    addEvent(record, 'success', `Alert provider connected: ${provider}.`);
    if (channelLabels.length > 0) {
      addEvent(record, 'success', `Alert channels active: ${channelLabels.join(', ')}.`);
    }
    if (healthcheckId) {
      addEvent(record, 'info', `Health check ID: ${healthcheckId}.`);
    }
    if (notes) {
      addEvent(record, 'info', notes);
    }

    record.infraSummary.items = [
      ...record.infraSummary.items.filter((item) => ![
        'Monitoring',
        'Alert channels',
        'Health check',
      ].includes(item.label)),
      { label: 'Monitoring', value: `${provider} on ${monitorUrl}` },
      ...(channelLabels.length > 0 ? [{ label: 'Alert channels', value: channelLabels.join(', ') }] : []),
      ...(healthcheckId ? [{ label: 'Health check', value: healthcheckId }] : []),
    ];
    record.logsSummary.headline = 'Monitoring and alerts are enabled.';
    persistState();
    return buildEnvelope(record);
  }

  function recordMonitoringTransition(input: RecordMonitoringTransitionInput) {
    const record = requireRecord(input.capsuleId);
    if (!record) {
      return null;
    }

    const status = input.status === 'healthy' ? 'healthy' : 'unhealthy';
    const checkedAt = trimText(input.checkedAt);
    const monitorUrl = trimText(input.monitorUrl)
      || record.capsule.productionUrl
      || record.capsule.previewUrl;
    const detail = trimText(input.detail)
      || (status === 'healthy'
        ? `Monitor reports healthy service${monitorUrl ? ` at ${monitorUrl}` : ''}.`
        : `Monitor detected an unhealthy service${monitorUrl ? ` at ${monitorUrl}` : ''}.`);

    if (status === 'healthy') {
      record.capsule.healthScore = Math.min(96, Math.max(record.capsule.healthScore, 82) + 1);
      addEvent(record, 'success', detail);
      record.logsSummary.headline = 'Monitoring reports healthy service.';
    } else {
      record.capsule.healthScore = Math.max(60, record.capsule.healthScore - 6);
      addEvent(record, 'warning', detail);
      record.logsSummary.headline = 'Monitoring detected service degradation.';
    }

    record.infraSummary.items = [
      ...record.infraSummary.items.filter((item) => ![
        'Monitoring state',
        'Monitoring last checked',
      ].includes(item.label)),
      { label: 'Monitoring state', value: status === 'healthy' ? 'Healthy' : 'Unhealthy' },
      ...(checkedAt ? [{ label: 'Monitoring last checked', value: checkedAt }] : []),
    ];
    persistState();
    return buildEnvelope(record);
  }

  function diagnoseService(capsuleId: string) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'diagnose_service',
    });
    return buildEnvelope(record);
  }

  function repairService(capsuleId: string) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'repair_service',
    });
    return buildEnvelope(record);
  }

  function rollbackRelease(capsuleId: string, confirmationToken?: string | null) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    const confirmation = consumeConfirmation(capsuleId, 'rollback_release', confirmationToken);
    if (!confirmation.ok) {
      return buildEnvelope(record, buildConfirmation(confirmation.pending));
    }

    record.capsule.productionUrl = null;
    record.infraSummary.productionEndpoint = null;
    record.capsule.status = 'preview_live';
    record.capsule.healthScore = Math.max(84, record.capsule.healthScore - 4);
    addEvent(record, 'warning', 'Release rolled back to the preview lane.');
    record.logsSummary.headline = 'Rollback completed.';
    recordInstantWorkspaceJob(record, 'publish_release', {
      title: 'Rollback release',
      summary: 'Rollback completed.',
      detail: 'Release rolled back to the preview lane.',
    });
    persistState();
    return buildEnvelope(record);
  }

  function takeoverServer(capsuleId: string, confirmationToken?: string | null) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    const confirmation = consumeConfirmation(capsuleId, 'takeover_server', confirmationToken);
    if (!confirmation.ok) {
      return buildEnvelope(record, buildConfirmation(confirmation.pending));
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'takeover_server',
    });
    return buildEnvelope(record);
  }

  function migrateServer(capsuleId: string, confirmationToken?: string | null) {
    const record = requireRecord(capsuleId);
    if (!record) {
      return null;
    }

    const confirmation = consumeConfirmation(capsuleId, 'migrate_server', confirmationToken);
    if (!confirmation.ok) {
      return buildEnvelope(record, buildConfirmation(confirmation.pending));
    }

    createWorkspaceJob({
      capsuleId,
      kind: 'migrate_server',
    });
    return buildEnvelope(record);
  }

  hydrateState();

  return {
    createPlan,
    analyzeProject,
    generateProject,
    startGenerateProjectTask,
    getGenerationTask,
    scanServer,
    listCapsules,
    listWorkspaces,
    getCapsule,
    getJob,
    createWorkspaceJob,
    deleteCapsule,
    deleteLegacyTemplateCapsules,
    getPreviewHtml,
    getPreviewProxyTarget,
    getPreviewAsset,
    getGeneratedProject,
    getGeneratedProjectArchive,
    getWorkspaceArchive,
    clearHistory,
    deployPreview,
    publishRelease,
    bindDomain,
    enableMonitoring,
    recordMonitoringTransition,
    diagnoseService,
    repairService,
    rollbackRelease,
    takeoverServer,
    migrateServer,
  };
}
