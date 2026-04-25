import type { ApiMeta, CartSummary } from './types';

export type OperatorEntryKind = 'upload-project' | 'generate-from-idea' | 'scan-server';
export type OperatorCommerceOfferKind = 'ai-managed-launch' | 'vps-self-hosted' | 'server-migration';
export type OperatorJobKind =
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
export type OperatorJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
export type OperatorTruthState =
  | 'planning'
  | 'waiting_for_inputs'
  | 'verifying_repo'
  | 'job_running'
  | 'env_blocked'
  | 'preview_ready'
  | 'preview_failed'
  | 'ready_for_production_approval'
  | 'audit_ready'
  | 'audit_failed'
  | 'rollback_ready'
  | 'needs_attention'
  | 'production_live';
export type OperatorCapsuleStatus =
  | 'planning'
  | 'preview_live'
  | 'production_live'
  | 'needs_attention'
  | 'takeover_ready'
  | 'migration_ready';
export type OperatorRisk = 'low' | 'medium' | 'high';
export type OperatorActionIntent =
  | 'deploy_preview'
  | 'publish_release'
  | 'diagnose_service'
  | 'repair_service'
  | 'rollback_release'
  | 'takeover_server'
  | 'migrate_server'
  | 'open_capsule';

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
  status: 'completed' | 'planned' | 'attention' | 'in_progress';
  detail: string;
}

export type OperatorGenerationTaskStatus =
  | 'queued'
  | 'planning'
  | 'coding'
  | 'building_preview'
  | 'completed'
  | 'failed';

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

export interface OperatorJobStep {
  id: string;
  title: string;
  status: 'completed' | 'planned' | 'attention' | 'in_progress';
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
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  createdAt: string;
}

export interface OperatorLogsSummary {
  headline: string;
  entries: OperatorLogEntry[];
}

export interface OperatorInfraSummary {
  runtime: string;
  region: string;
  estimatedMonthlyCost: string;
  endpoint: string | null;
  productionEndpoint: string | null;
  items: Array<{
    label: string;
    value: string;
  }>;
}

export interface OperatorServerConnector {
  mode: 'password' | 'ssh-key' | 'agent';
  host: string;
  port: number;
  username: string;
  trust: 'pending' | 'verified';
}

export interface OperatorCapsule {
  id: string;
  name: string;
  slug: string;
  entryKind: OperatorEntryKind;
  generationSource?: 'model' | 'template' | null;
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
  archivedAt?: string | null;
  lastActiveAt?: string | null;
  recentEvents: OperatorLogEntry[];
  truthState?: OperatorTruthState;
  latestJob?: OperatorJobSummary | null;
  workflowStage?: OperatorWorkflowStage | null;
}

export interface OperatorConfirmation {
  token: string;
  action: OperatorActionIntent;
  label: string;
  expiresAt: string;
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
  status: 'unavailable' | 'building' | 'verified' | 'failed';
  verified: boolean;
  previewUrl: string | null;
  entryFile: string | null;
  assetCount: number;
  verifiedAt: string | null;
  lastError: string | null;
  evidence: {
    runtimeLiveAt: string | null;
    healthPassedAt: string | null;
    smokePassedAt: string | null;
    screenshotPath: string | null;
  };
}

export interface OperatorAuditSummary {
  status: 'pending' | 'running' | 'completed' | 'failed';
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

export interface OperatorTechStackSummary {
  kind: 'docker-compose' | 'dockerfile' | 'nextjs' | 'vite' | 'node' | 'python' | 'static' | 'unknown';
  label: string;
  detectionSource: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  runtimePort: number | null;
  healthcheckPath: string | null;
  dockerfilePath: string | null;
  composeFilePath: string | null;
  composeServiceName: string | null;
  goldenPath: 'single-file-html-canvas' | 'vite-react' | 'nextjs' | 'docker-compose' | null;
  recipeReliable: boolean;
  blockReason: 'unsupported_stack' | 'compose_recipe_missing' | null;
  notes: string[];
}

export interface OperatorEnvChecklistItem {
  id: string;
  kind: 'env' | 'storage' | 'network' | 'healthcheck' | 'runtime';
  label: string;
  required: boolean;
  status: 'needs_value' | 'inferred' | 'optional';
  valueHint: string | null;
  source: string;
  purpose: string;
}

export interface OperatorEnvChecklistSummary {
  status: 'pending' | 'ready' | 'blocked';
  headline: string;
  detail: string;
  missingRequiredCount: number;
  items: OperatorEnvChecklistItem[];
}

export interface OperatorCredentialReadiness {
  status: 'missing_credentials' | 'auth_failed' | 'host_unreachable' | 'host_key_untrusted' | 'ready';
  headline: string;
  detail: string;
  nextAction: string;
  checkedAt: string | null;
  source: 'preflight' | 'system' | 'mock';
}

export interface OperatorDeploymentSummary {
  targetLabel: string;
  targetRef: string | null;
  previewOnly: boolean;
  supported: boolean;
  successCriteria: string[];
  rollbackPlan: string[];
  pipeline: OperatorPlanStep[];
}

export type OperatorWorkspaceArtifactLedgerGapId =
  | 'missing_latest_artifact'
  | 'missing_chosen_stack'
  | 'missing_runnable_entry'
  | 'missing_preview_target'
  | 'readiness_blocked';

export interface OperatorWorkspaceArtifactLedgerLatestArtifact {
  sourceType: OperatorArtifactSummary['sourceType'];
  sourceRef: string | null;
  archiveUrl: string | null;
  manifestUrl: string | null;
  archiveName: string | null;
  fileCount: number;
}

export interface OperatorWorkspaceArtifactLedgerChosenStack {
  kind: OperatorTechStackSummary['kind'];
  label: string;
  detectionSource: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  runtimePort: number | null;
  healthcheckPath: string | null;
  dockerfilePath: string | null;
  composeFilePath: string | null;
  composeServiceName: string | null;
}

export interface OperatorWorkspaceArtifactLedgerRunnableEntry {
  entryFile: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  runCommands: string[];
}

export interface OperatorWorkspaceArtifactLedgerPreviewTarget {
  kind: 'none' | 'preview' | 'release';
  url: string | null;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
}

export interface OperatorWorkspaceArtifactLedgerDeployReadiness {
  sshStatus: OperatorCredentialReadiness['status'] | null;
  envStatus: OperatorEnvChecklistSummary['status'] | null;
  ready: boolean;
  summary: string;
}

export interface OperatorWorkspaceArtifactLedger {
  lastUpdatedAt: string | null;
  latestUserIntent: string | null;
  latestArtifact: OperatorWorkspaceArtifactLedgerLatestArtifact;
  chosenStack: OperatorWorkspaceArtifactLedgerChosenStack;
  runnableEntry: OperatorWorkspaceArtifactLedgerRunnableEntry;
  previewTarget: OperatorWorkspaceArtifactLedgerPreviewTarget;
  deployReadiness: OperatorWorkspaceArtifactLedgerDeployReadiness;
  gaps: OperatorWorkspaceArtifactLedgerGapId[];
}

export type OperatorWorkflowStage =
  | 'draft'
  | 'parsing'
  | 'preflight'
  | 'llm_planning'
  | 'awaiting_confirmation'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'partial_success'
  | 'success'
  | 'failed'
  | 'blocked'
  | 'rolled_back';

export type OperatorWorkflowSource = 'llm' | 'executor' | 'preflight' | 'system' | 'mock';

export type OperatorWorkflowCardKind =
  | 'user_message'
  | 'understanding'
  | 'preflight'
  | 'plan'
  | 'confirmation'
  | 'execution'
  | 'verification'
  | 'failure_diagnosis'
  | 'next_step';

export type OperatorWorkflowFailureCode =
  | 'repo_url_invalid'
  | 'repo_unreachable'
  | 'repo_auth_failed'
  | 'github_proxy_aborted'
  | 'package_manager_unknown'
  | 'workspace_detection_failed'
  | 'build_command_uncertain'
  | 'build_script_missing'
  | 'unsupported_stack'
  | 'compose_recipe_missing'
  | 'env_missing'
  | 'preview_failed'
  | 'ssh_missing_credentials'
  | 'ssh_auth_failed'
  | 'deploy_blocked';

export interface OperatorWorkflowEvidenceItem {
  id: string;
  label: string;
  detail: string;
  source: OperatorWorkflowSource;
}

export interface OperatorWorkflowFailure {
  failureCode: OperatorWorkflowFailureCode;
  humanSummary: string;
  probableRootCause: string;
  recommendedActions: string[];
  evidence: OperatorWorkflowEvidenceItem[];
  detectedAt: string;
  stage: OperatorWorkflowStage;
}

export interface OperatorWorkflowCard {
  id: string;
  kind: OperatorWorkflowCardKind;
  stage: OperatorWorkflowStage;
  title: string;
  summary: string;
  evidence: OperatorWorkflowEvidenceItem[];
  nextStep: string | null;
  source: OperatorWorkflowSource;
  createdAt: string;
  failureCode: OperatorWorkflowFailureCode | null;
}

export interface OperatorWorkflowMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface OperatorWorkflowThread {
  sessionId: string | null;
  messages: OperatorWorkflowMessage[];
  lastUpdatedAt: string | null;
}

export interface OperatorWorkflowParsedInput {
  kind: 'repo' | 'idea' | 'server' | 'unknown';
  rawInput: string;
  repoUrl: string | null;
  notes: string | null;
  idea: string | null;
  serverHost: string | null;
  planningMode: 'on' | 'off';
  confidence: number | null;
}

export interface OperatorWorkflowArtifact {
  id: string;
  label: string;
  detail: string;
  url: string | null;
}

export interface OperatorWorkflowPublishEntry {
  id: string;
  status: 'queued' | 'success' | 'failed' | 'rolled_back';
  summary: string;
  createdAt: string;
}

export interface OperatorWorkflowPendingConfirmation {
  token: string | null;
  label: string;
  summary: string | null;
  expiresAt: string | null;
}

export interface OperatorWorkflowTask {
  id: string;
  title: string;
  planningMode: 'on' | 'off';
  thread: OperatorWorkflowThread;
  draft: string;
  userIntent: string;
  parsedInput: OperatorWorkflowParsedInput;
  currentStage: OperatorWorkflowStage;
  timeline: OperatorWorkflowCard[];
  evidence: OperatorWorkflowEvidenceItem[];
  diagnostics: string[];
  artifacts: OperatorWorkflowArtifact[];
  deployReadiness: {
    sshStatus: string | null;
    envStatus: string | null;
    ready: boolean;
    summary: string;
  };
  publishHistory: OperatorWorkflowPublishEntry[];
  failure: OperatorWorkflowFailure | null;
  pendingConfirmation: OperatorWorkflowPendingConfirmation | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorWorkflowState {
  planningMode: 'on' | 'off';
  activeTaskId: string | null;
  tasks: OperatorWorkflowTask[];
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
  workspaceArtifactLedger: OperatorWorkspaceArtifactLedger;
  artifactSummary: OperatorArtifactSummary;
  previewSummary: OperatorPreviewSummary;
  auditSummary: OperatorAuditSummary;
  diagnosticsSummary: OperatorDiagnosticsSummary;
  techStackSummary: OperatorTechStackSummary;
  envChecklistSummary: OperatorEnvChecklistSummary;
  credentialReadiness: OperatorCredentialReadiness;
  deploymentSummary: OperatorDeploymentSummary;
  nextActions: OperatorActionSummary[];
  workflow: OperatorWorkflowState;
}

export interface OperatorResponse {
  message: string;
  data: OperatorEnvelope;
  meta: ApiMeta;
}

export interface OperatorCapsuleListResponse {
  message: string;
  data: OperatorCapsule[];
  meta: ApiMeta;
}

export interface OperatorCommerceResponse {
  message: string;
  data: {
    capsule: OperatorEnvelope;
    cart: CartSummary;
    product: {
      id: string;
      slug: string;
      name: string;
      description: string;
      runtimeKind: string | null;
      category: {
        id: string;
        slug: string;
        fullSlug: string | null;
        name: string;
      } | null;
    } | null;
    plan: {
      id: string;
      name: string;
      type: string | null;
      billingPeriod: number | null;
      billingUnit: string | null;
    } | null;
    selection: {
      intent: OperatorCommerceOfferKind;
      reason: string;
    };
    redirect: {
      type: string;
      path: string;
    };
    checkoutConfig: Record<string, unknown>;
    configOptions: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export function defaultOperatorTechStackSummary(): OperatorTechStackSummary {
  return {
    kind: 'unknown',
    label: 'Unknown stack',
    detectionSource: null,
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    runtimePort: null,
    healthcheckPath: null,
    dockerfilePath: null,
    composeFilePath: null,
    composeServiceName: null,
    goldenPath: null,
    recipeReliable: false,
    blockReason: null,
    notes: [],
  };
}

export function defaultOperatorPreviewSummary(): OperatorPreviewSummary {
  return {
    status: 'unavailable',
    verified: false,
    previewUrl: null,
    entryFile: null,
    assetCount: 0,
    verifiedAt: null,
    lastError: null,
    evidence: {
      runtimeLiveAt: null,
      healthPassedAt: null,
      smokePassedAt: null,
      screenshotPath: null,
    },
  };
}

export function defaultOperatorEnvChecklistSummary(): OperatorEnvChecklistSummary {
  return {
    status: 'pending',
    headline: 'Environment checklist pending.',
    detail: 'The repository or runtime has not been scanned for deployment requirements yet.',
    missingRequiredCount: 0,
    items: [],
  };
}

export function defaultOperatorDeploymentSummary(): OperatorDeploymentSummary {
  return {
    targetLabel: 'Server #19',
    targetRef: '#19',
    previewOnly: true,
    supported: false,
    successCriteria: [
      'Preview must be reachable.',
      'Health check must pass.',
      'Smoke test must pass on the live runtime.',
      'Screenshot evidence must come from the live runtime.',
      'Logs must not show fatal errors.',
    ],
    rollbackPlan: [
      'Keep the last verified preview build available.',
      'Do not cut production traffic until approval is recorded.',
    ],
    pipeline: [
      {
        id: 'pipeline_fetch',
        title: 'Source fetch',
        status: 'planned',
        detail: 'Fetch the repository or uploaded source into an isolated workspace.',
      },
      {
        id: 'pipeline_detect',
        title: 'Stack detect',
        status: 'planned',
        detail: 'Identify Docker, Compose, runtime, port, and build/start commands.',
      },
      {
        id: 'pipeline_env',
        title: 'Env checklist render',
        status: 'planned',
        detail: 'List required secrets, callback URLs, storage, and health check inputs.',
      },
      {
        id: 'pipeline_preflight',
        title: 'SSH preflight (#19)',
        status: 'attention',
        detail: 'Run SSH credential and connectivity preflight before production deployment.',
      },
      {
        id: 'pipeline_preview',
        title: 'Preview deploy',
        status: 'planned',
        detail: 'Build, test, and verify a preview before production is allowed.',
      },
      {
        id: 'pipeline_production',
        title: 'Production deploy to server #19',
        status: 'attention',
        detail: 'Production stays blocked until preview, checklist, and approval are all complete.',
      },
    ],
  };
}

export function defaultOperatorCredentialReadiness(): OperatorCredentialReadiness {
  return {
    status: 'missing_credentials',
    headline: 'SSH credentials are missing',
    detail: 'No usable SSH credentials are available in the current runtime, so production deployment is blocked.',
    nextAction: 'Provide credentials from server audit first (password, SSH key, or agent), then retry preflight.',
    checkedAt: null,
    source: 'preflight',
  };
}

export function defaultWorkspaceArtifactLedgerLatestArtifact(): OperatorWorkspaceArtifactLedgerLatestArtifact {
  return {
    sourceType: 'none',
    sourceRef: null,
    archiveUrl: null,
    manifestUrl: null,
    archiveName: null,
    fileCount: 0,
  };
}

export function defaultWorkspaceArtifactLedgerChosenStack(): OperatorWorkspaceArtifactLedgerChosenStack {
  return {
    kind: 'unknown',
    label: 'Unknown stack',
    detectionSource: null,
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    runtimePort: null,
    healthcheckPath: null,
    dockerfilePath: null,
    composeFilePath: null,
    composeServiceName: null,
  };
}

export function defaultWorkspaceArtifactLedgerRunnableEntry(): OperatorWorkspaceArtifactLedgerRunnableEntry {
  return {
    entryFile: null,
    installCommand: null,
    buildCommand: null,
    runCommands: [],
  };
}

export function defaultWorkspaceArtifactLedgerPreviewTarget(): OperatorWorkspaceArtifactLedgerPreviewTarget {
  return {
    kind: 'none',
    url: null,
    verified: false,
    verifiedAt: null,
    lastError: null,
  };
}

export function defaultWorkspaceArtifactLedgerDeployReadiness(): OperatorWorkspaceArtifactLedgerDeployReadiness {
  return {
    sshStatus: null,
    envStatus: null,
    ready: false,
    summary: 'Readiness has not been evaluated yet.',
  };
}

export function defaultWorkspaceArtifactLedger(): OperatorWorkspaceArtifactLedger {
  return {
    lastUpdatedAt: null,
    latestUserIntent: null,
    latestArtifact: defaultWorkspaceArtifactLedgerLatestArtifact(),
    chosenStack: defaultWorkspaceArtifactLedgerChosenStack(),
    runnableEntry: defaultWorkspaceArtifactLedgerRunnableEntry(),
    previewTarget: defaultWorkspaceArtifactLedgerPreviewTarget(),
    deployReadiness: defaultWorkspaceArtifactLedgerDeployReadiness(),
    gaps: [
      'missing_latest_artifact',
      'missing_chosen_stack',
      'missing_runnable_entry',
      'missing_preview_target',
      'readiness_blocked',
    ],
  };
}

export function defaultOperatorWorkflowState(): OperatorWorkflowState {
  return {
    planningMode: 'off',
    activeTaskId: null,
    tasks: [],
  };
}

export function normalizeOperatorWorkflowState(
  value: OperatorWorkflowState | Partial<OperatorWorkflowState> | null | undefined,
): OperatorWorkflowState {
  if (!value || typeof value !== 'object') {
    return defaultOperatorWorkflowState();
  }

  const tasks = Array.isArray(value.tasks)
    ? value.tasks
      .map((task, index) => {
        if (!task || typeof task !== 'object') {
          return null;
        }

        const timeline = Array.isArray(task.timeline)
          ? task.timeline
            .map((card, cardIndex) => {
              if (!card || typeof card !== 'object') {
                return null;
              }
              return {
                id: typeof card.id === 'string' && card.id.trim() ? card.id : `workflow-card-${index}-${cardIndex}`,
                kind: card.kind === 'user_message'
                  || card.kind === 'understanding'
                  || card.kind === 'preflight'
                  || card.kind === 'plan'
                  || card.kind === 'confirmation'
                  || card.kind === 'execution'
                  || card.kind === 'verification'
                  || card.kind === 'failure_diagnosis'
                  ? card.kind
                  : 'next_step',
                stage: card.stage === 'draft'
                  || card.stage === 'parsing'
                  || card.stage === 'preflight'
                  || card.stage === 'llm_planning'
                  || card.stage === 'awaiting_confirmation'
                  || card.stage === 'queued'
                  || card.stage === 'running'
                  || card.stage === 'verifying'
                  || card.stage === 'partial_success'
                  || card.stage === 'success'
                  || card.stage === 'failed'
                  || card.stage === 'blocked'
                  ? card.stage
                  : 'rolled_back',
                title: typeof card.title === 'string' && card.title.trim() ? card.title : 'Workflow card',
                summary: typeof card.summary === 'string' ? card.summary : '',
                evidence: Array.isArray(card.evidence)
                  ? card.evidence
                    .map((entry, evidenceIndex) => {
                      if (!entry || typeof entry !== 'object') {
                        return null;
                      }
                      return {
                        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : `workflow-evidence-${index}-${cardIndex}-${evidenceIndex}`,
                        label: typeof entry.label === 'string' ? entry.label : 'Evidence',
                        detail: typeof entry.detail === 'string' ? entry.detail : '',
                        source: entry.source === 'llm'
                          || entry.source === 'executor'
                          || entry.source === 'preflight'
                          || entry.source === 'mock'
                          ? entry.source
                          : 'system',
                      } satisfies OperatorWorkflowEvidenceItem;
                    })
                    .filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
                  : [],
                nextStep: typeof card.nextStep === 'string' ? card.nextStep : null,
                source: card.source === 'llm'
                  || card.source === 'executor'
                  || card.source === 'preflight'
                  || card.source === 'mock'
                  ? card.source
                  : 'system',
                createdAt: typeof card.createdAt === 'string' ? card.createdAt : '',
                failureCode: typeof card.failureCode === 'string' ? card.failureCode as OperatorWorkflowFailureCode : null,
              } satisfies OperatorWorkflowCard;
            })
            .filter((entry): entry is OperatorWorkflowCard => Boolean(entry))
          : [];

        const failure = task.failure && typeof task.failure === 'object'
          ? {
            failureCode: typeof task.failure.failureCode === 'string' ? task.failure.failureCode as OperatorWorkflowFailureCode : 'deploy_blocked',
            humanSummary: typeof task.failure.humanSummary === 'string' ? task.failure.humanSummary : '',
            probableRootCause: typeof task.failure.probableRootCause === 'string' ? task.failure.probableRootCause : '',
            recommendedActions: Array.isArray(task.failure.recommendedActions)
              ? task.failure.recommendedActions.filter((entry): entry is string => typeof entry === 'string')
              : [],
            evidence: Array.isArray(task.failure.evidence)
              ? task.failure.evidence
                .map((entry, evidenceIndex) => {
                  if (!entry || typeof entry !== 'object') {
                    return null;
                  }
                  return {
                    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : `workflow-failure-evidence-${index}-${evidenceIndex}`,
                    label: typeof entry.label === 'string' ? entry.label : 'Evidence',
                    detail: typeof entry.detail === 'string' ? entry.detail : '',
                    source: entry.source === 'llm'
                      || entry.source === 'executor'
                      || entry.source === 'preflight'
                      || entry.source === 'mock'
                      ? entry.source
                      : 'system',
                  } satisfies OperatorWorkflowEvidenceItem;
                })
                .filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
              : [],
            detectedAt: typeof task.failure.detectedAt === 'string' ? task.failure.detectedAt : '',
            stage: task.failure.stage === 'draft'
              || task.failure.stage === 'parsing'
              || task.failure.stage === 'preflight'
              || task.failure.stage === 'llm_planning'
              || task.failure.stage === 'awaiting_confirmation'
              || task.failure.stage === 'queued'
              || task.failure.stage === 'running'
              || task.failure.stage === 'verifying'
              || task.failure.stage === 'partial_success'
              || task.failure.stage === 'success'
              || task.failure.stage === 'failed'
              ? task.failure.stage
              : task.failure.stage === 'blocked'
                ? 'blocked'
                : 'rolled_back',
          } satisfies OperatorWorkflowFailure
          : null;

        return {
          id: typeof task.id === 'string' && task.id.trim() ? task.id : `workflow-task-${index}`,
          title: typeof task.title === 'string' && task.title.trim() ? task.title : 'Visible agent task',
          planningMode: task.planningMode === 'on' ? 'on' : 'off',
          thread: {
            sessionId: typeof task.thread?.sessionId === 'string' ? task.thread.sessionId : null,
            messages: Array.isArray(task.thread?.messages)
              ? task.thread.messages
                .map((message, messageIndex) => {
                  if (!message || typeof message !== 'object') {
                    return null;
                  }
                  return {
                    id: typeof message.id === 'string' && message.id.trim() ? message.id : `workflow-message-${index}-${messageIndex}`,
                    role: message.role === 'system' || message.role === 'assistant' ? message.role : 'user',
                    content: typeof message.content === 'string' ? message.content : '',
                    createdAt: typeof message.createdAt === 'string' ? message.createdAt : '',
                  } satisfies OperatorWorkflowMessage;
                })
                .filter((entry): entry is OperatorWorkflowMessage => Boolean(entry))
              : [],
            lastUpdatedAt: typeof task.thread?.lastUpdatedAt === 'string' ? task.thread.lastUpdatedAt : null,
          },
          draft: typeof task.draft === 'string' ? task.draft : '',
          userIntent: typeof task.userIntent === 'string' ? task.userIntent : '',
          parsedInput: {
            kind: task.parsedInput?.kind === 'repo'
              || task.parsedInput?.kind === 'idea'
              || task.parsedInput?.kind === 'server'
              ? task.parsedInput.kind
              : 'unknown',
            rawInput: typeof task.parsedInput?.rawInput === 'string' ? task.parsedInput.rawInput : '',
            repoUrl: typeof task.parsedInput?.repoUrl === 'string' ? task.parsedInput.repoUrl : null,
            notes: typeof task.parsedInput?.notes === 'string' ? task.parsedInput.notes : null,
            idea: typeof task.parsedInput?.idea === 'string' ? task.parsedInput.idea : null,
            serverHost: typeof task.parsedInput?.serverHost === 'string' ? task.parsedInput.serverHost : null,
            planningMode: task.parsedInput?.planningMode === 'on' ? 'on' : 'off',
            confidence: typeof task.parsedInput?.confidence === 'number' ? task.parsedInput.confidence : null,
          },
          currentStage: task.currentStage === 'draft'
            || task.currentStage === 'parsing'
            || task.currentStage === 'preflight'
            || task.currentStage === 'llm_planning'
            || task.currentStage === 'awaiting_confirmation'
            || task.currentStage === 'queued'
            || task.currentStage === 'running'
            || task.currentStage === 'verifying'
            || task.currentStage === 'partial_success'
            || task.currentStage === 'success'
            || task.currentStage === 'failed'
            ? task.currentStage
            : task.currentStage === 'blocked'
              ? 'blocked'
              : 'rolled_back',
          timeline,
          evidence: Array.isArray(task.evidence)
            ? task.evidence
              .map((entry, evidenceIndex) => {
                if (!entry || typeof entry !== 'object') {
                  return null;
                }
                return {
                  id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : `workflow-evidence-${index}-${evidenceIndex}`,
                  label: typeof entry.label === 'string' ? entry.label : 'Evidence',
                  detail: typeof entry.detail === 'string' ? entry.detail : '',
                  source: entry.source === 'llm'
                    || entry.source === 'executor'
                    || entry.source === 'preflight'
                    || entry.source === 'mock'
                    ? entry.source
                    : 'system',
                } satisfies OperatorWorkflowEvidenceItem;
              })
              .filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
            : [],
          diagnostics: Array.isArray(task.diagnostics)
            ? task.diagnostics.filter((entry): entry is string => typeof entry === 'string')
            : [],
          artifacts: Array.isArray(task.artifacts)
            ? task.artifacts
              .map((artifact, artifactIndex) => {
                if (!artifact || typeof artifact !== 'object') {
                  return null;
                }
                return {
                  id: typeof artifact.id === 'string' && artifact.id.trim() ? artifact.id : `workflow-artifact-${index}-${artifactIndex}`,
                  label: typeof artifact.label === 'string' ? artifact.label : 'Artifact',
                  detail: typeof artifact.detail === 'string' ? artifact.detail : '',
                  url: typeof artifact.url === 'string' ? artifact.url : null,
                } satisfies OperatorWorkflowArtifact;
              })
              .filter((entry): entry is OperatorWorkflowArtifact => Boolean(entry))
            : [],
          deployReadiness: {
            sshStatus: typeof task.deployReadiness?.sshStatus === 'string' ? task.deployReadiness.sshStatus : null,
            envStatus: typeof task.deployReadiness?.envStatus === 'string' ? task.deployReadiness.envStatus : null,
            ready: task.deployReadiness?.ready === true,
            summary: typeof task.deployReadiness?.summary === 'string' ? task.deployReadiness.summary : 'Readiness has not been evaluated yet.',
          },
          publishHistory: Array.isArray(task.publishHistory)
            ? task.publishHistory
              .map((entry, publishIndex) => {
                if (!entry || typeof entry !== 'object') {
                  return null;
                }
                return {
                  id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : `workflow-publish-${index}-${publishIndex}`,
                  status: entry.status === 'queued'
                    || entry.status === 'success'
                    || entry.status === 'failed'
                    ? entry.status
                    : 'rolled_back',
                  summary: typeof entry.summary === 'string' ? entry.summary : '',
                  createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
                } satisfies OperatorWorkflowPublishEntry;
              })
              .filter((entry): entry is OperatorWorkflowPublishEntry => Boolean(entry))
            : [],
          failure,
          pendingConfirmation: task.pendingConfirmation && typeof task.pendingConfirmation === 'object'
            ? {
              token: typeof task.pendingConfirmation.token === 'string' ? task.pendingConfirmation.token : null,
              label: typeof task.pendingConfirmation.label === 'string' ? task.pendingConfirmation.label : 'Awaiting confirmation',
              summary: typeof task.pendingConfirmation.summary === 'string' ? task.pendingConfirmation.summary : null,
              expiresAt: typeof task.pendingConfirmation.expiresAt === 'string' ? task.pendingConfirmation.expiresAt : null,
            }
            : null,
          createdAt: typeof task.createdAt === 'string' ? task.createdAt : '',
          updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : '',
        } satisfies OperatorWorkflowTask;
      })
      .filter((entry): entry is OperatorWorkflowTask => Boolean(entry))
    : [];

  return {
    planningMode: value.planningMode === 'on' ? 'on' : 'off',
    activeTaskId: typeof value.activeTaskId === 'string' && tasks.some((task) => task.id === value.activeTaskId)
      ? value.activeTaskId
      : tasks.at(-1)?.id ?? null,
    tasks,
  };
}

export function normalizeOperatorTechStackSummary(
  value: OperatorTechStackSummary | Partial<OperatorTechStackSummary> | null | undefined,
): OperatorTechStackSummary {
  if (!value || typeof value !== 'object') {
    return defaultOperatorTechStackSummary();
  }

  return {
    kind: value.kind === 'docker-compose'
      || value.kind === 'dockerfile'
      || value.kind === 'nextjs'
      || value.kind === 'vite'
      || value.kind === 'node'
      || value.kind === 'python'
      || value.kind === 'static'
      ? value.kind
      : 'unknown',
    label: typeof value.label === 'string' && value.label.trim() ? value.label : 'Unknown stack',
    detectionSource: typeof value.detectionSource === 'string' ? value.detectionSource : null,
    installCommand: typeof value.installCommand === 'string' ? value.installCommand : null,
    buildCommand: typeof value.buildCommand === 'string' ? value.buildCommand : null,
    startCommand: typeof value.startCommand === 'string' ? value.startCommand : null,
    runtimePort: typeof value.runtimePort === 'number' && Number.isFinite(value.runtimePort) ? value.runtimePort : null,
    healthcheckPath: typeof value.healthcheckPath === 'string' ? value.healthcheckPath : null,
    dockerfilePath: typeof value.dockerfilePath === 'string' ? value.dockerfilePath : null,
    composeFilePath: typeof value.composeFilePath === 'string' ? value.composeFilePath : null,
    composeServiceName: typeof value.composeServiceName === 'string' ? value.composeServiceName : null,
    goldenPath: value.goldenPath === 'single-file-html-canvas'
      || value.goldenPath === 'vite-react'
      || value.goldenPath === 'nextjs'
      || value.goldenPath === 'docker-compose'
      ? value.goldenPath
      : null,
    recipeReliable: value.recipeReliable === true,
    blockReason: value.blockReason === 'unsupported_stack' || value.blockReason === 'compose_recipe_missing'
      ? value.blockReason
      : null,
    notes: Array.isArray(value.notes) ? value.notes.filter((entry): entry is string => typeof entry === 'string') : [],
  };
}

export function normalizeOperatorPreviewSummary(
  value: OperatorPreviewSummary | Partial<OperatorPreviewSummary> | null | undefined,
): OperatorPreviewSummary {
  if (!value || typeof value !== 'object') {
    return defaultOperatorPreviewSummary();
  }

  const evidence = value.evidence && typeof value.evidence === 'object'
    ? {
      runtimeLiveAt: typeof value.evidence.runtimeLiveAt === 'string' ? value.evidence.runtimeLiveAt : null,
      healthPassedAt: typeof value.evidence.healthPassedAt === 'string' ? value.evidence.healthPassedAt : null,
      smokePassedAt: typeof value.evidence.smokePassedAt === 'string' ? value.evidence.smokePassedAt : null,
      screenshotPath: typeof value.evidence.screenshotPath === 'string' ? value.evidence.screenshotPath : null,
    }
    : defaultOperatorPreviewSummary().evidence;
  const verified = Boolean(
    evidence.runtimeLiveAt
    && evidence.healthPassedAt
    && evidence.smokePassedAt
    && evidence.screenshotPath,
  );

  return {
    status: verified
      ? 'verified'
      : value.status === 'failed' || (typeof value.lastError === 'string' && value.lastError.trim())
        ? 'failed'
        : value.status === 'building' || (typeof value.previewUrl === 'string' && value.previewUrl)
          ? 'building'
          : 'unavailable',
    verified,
    previewUrl: typeof value.previewUrl === 'string' ? value.previewUrl : null,
    entryFile: typeof value.entryFile === 'string' ? value.entryFile : null,
    assetCount: typeof value.assetCount === 'number' && Number.isFinite(value.assetCount) ? value.assetCount : 0,
    verifiedAt: verified && typeof value.verifiedAt === 'string' ? value.verifiedAt : null,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    evidence,
  };
}

export function normalizeOperatorEnvChecklistSummary(
  value: OperatorEnvChecklistSummary | Partial<OperatorEnvChecklistSummary> | null | undefined,
): OperatorEnvChecklistSummary {
  if (!value || typeof value !== 'object') {
    return defaultOperatorEnvChecklistSummary();
  }

  const items = Array.isArray(value.items)
    ? value.items
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const status = entry.status === 'needs_value' || entry.status === 'inferred' ? entry.status : 'optional';
        return {
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : `requirement-${index}`,
          kind: entry.kind === 'env'
            || entry.kind === 'storage'
            || entry.kind === 'network'
            || entry.kind === 'healthcheck'
            ? entry.kind
            : 'runtime',
          label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : 'Requirement',
          required: entry.required !== false,
          status,
          valueHint: typeof entry.valueHint === 'string' ? entry.valueHint : null,
          source: typeof entry.source === 'string' && entry.source.trim() ? entry.source : 'inference',
          purpose: typeof entry.purpose === 'string' && entry.purpose.trim() ? entry.purpose : 'Deployment requirement',
        } satisfies OperatorEnvChecklistItem;
      })
      .filter((entry): entry is OperatorEnvChecklistItem => Boolean(entry))
    : [];

  const missingRequiredCount = items.filter((entry) => entry.required && entry.status === 'needs_value').length;
  return {
    status: value.status === 'ready' || value.status === 'blocked'
      ? value.status
      : (missingRequiredCount > 0 ? 'blocked' : items.length > 0 ? 'ready' : 'pending'),
    headline: typeof value.headline === 'string' && value.headline.trim() ? value.headline : 'Environment checklist ready.',
    detail: typeof value.detail === 'string' && value.detail.trim() ? value.detail : 'Review required inputs before production.',
    missingRequiredCount,
    items,
  };
}

export function normalizeOperatorDeploymentSummary(
  value: OperatorDeploymentSummary | Partial<OperatorDeploymentSummary> | null | undefined,
): OperatorDeploymentSummary {
  if (!value || typeof value !== 'object') {
    return defaultOperatorDeploymentSummary();
  }

  const defaultPipeline = defaultOperatorDeploymentSummary().pipeline;
  const normalizedPipeline = Array.isArray(value.pipeline)
    ? value.pipeline
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || typeof entry.detail !== 'string') {
          return null;
        }

        return {
          id: entry.id,
          title: entry.title,
          detail: entry.detail,
          status: entry.status === 'completed' || entry.status === 'in_progress' || entry.status === 'attention'
            ? entry.status
            : 'planned',
        } satisfies OperatorPlanStep;
      })
      .filter((entry): entry is OperatorPlanStep => Boolean(entry))
    : [];
  const pipelineById = new Map<string, OperatorPlanStep>();
  for (const step of normalizedPipeline) {
    pipelineById.set(step.id, step);
  }
  for (const fallbackStep of defaultPipeline) {
    if (!pipelineById.has(fallbackStep.id)) {
      pipelineById.set(fallbackStep.id, { ...fallbackStep });
    }
  }

  return {
    targetLabel: typeof value.targetLabel === 'string' && value.targetLabel.trim() ? value.targetLabel : 'Server #19',
    targetRef: typeof value.targetRef === 'string' ? value.targetRef : '#19',
    previewOnly: value.previewOnly !== false,
    supported: value.supported === true,
    successCriteria: Array.isArray(value.successCriteria)
      ? value.successCriteria.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : defaultOperatorDeploymentSummary().successCriteria,
    rollbackPlan: Array.isArray(value.rollbackPlan)
      ? value.rollbackPlan.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : defaultOperatorDeploymentSummary().rollbackPlan,
    pipeline: [...pipelineById.values()],
  };
}

export function normalizeOperatorCredentialReadiness(
  value: OperatorCredentialReadiness | Partial<OperatorCredentialReadiness> | null | undefined,
): OperatorCredentialReadiness {
  if (!value || typeof value !== 'object') {
    return defaultOperatorCredentialReadiness();
  }

  return {
    status: value.status === 'missing_credentials'
      || value.status === 'auth_failed'
      || value.status === 'host_unreachable'
      || value.status === 'host_key_untrusted'
      || value.status === 'ready'
      ? value.status
      : 'missing_credentials',
    headline: typeof value.headline === 'string' && value.headline.trim() ? value.headline : defaultOperatorCredentialReadiness().headline,
    detail: typeof value.detail === 'string' && value.detail.trim() ? value.detail : defaultOperatorCredentialReadiness().detail,
    nextAction: typeof value.nextAction === 'string' && value.nextAction.trim() ? value.nextAction : defaultOperatorCredentialReadiness().nextAction,
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : null,
    source: value.source === 'system' || value.source === 'mock' ? value.source : 'preflight',
  };
}

function normalizeWorkspaceArtifactLedgerText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeWorkspaceArtifactLedgerCommands(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function normalizeWorkspaceArtifactLedger(
  value: OperatorWorkspaceArtifactLedger | Partial<OperatorWorkspaceArtifactLedger> | null | undefined,
): OperatorWorkspaceArtifactLedger {
  if (!value || typeof value !== 'object') {
    return defaultWorkspaceArtifactLedger();
  }

  const gaps = Array.isArray(value.gaps)
    ? value.gaps.filter((entry): entry is OperatorWorkspaceArtifactLedgerGapId => (
      entry === 'missing_latest_artifact'
      || entry === 'missing_chosen_stack'
      || entry === 'missing_runnable_entry'
      || entry === 'missing_preview_target'
      || entry === 'readiness_blocked'
    ))
    : [];

  return {
    lastUpdatedAt: normalizeWorkspaceArtifactLedgerText(value.lastUpdatedAt),
    latestUserIntent: normalizeWorkspaceArtifactLedgerText(value.latestUserIntent),
    latestArtifact: {
      sourceType: value.latestArtifact?.sourceType === 'generated'
        || value.latestArtifact?.sourceType === 'repository'
        || value.latestArtifact?.sourceType === 'server'
        ? value.latestArtifact.sourceType
        : 'none',
      sourceRef: normalizeWorkspaceArtifactLedgerText(value.latestArtifact?.sourceRef),
      archiveUrl: normalizeWorkspaceArtifactLedgerText(value.latestArtifact?.archiveUrl),
      manifestUrl: normalizeWorkspaceArtifactLedgerText(value.latestArtifact?.manifestUrl),
      archiveName: normalizeWorkspaceArtifactLedgerText(value.latestArtifact?.archiveName),
      fileCount: typeof value.latestArtifact?.fileCount === 'number' && Number.isFinite(value.latestArtifact.fileCount)
        ? Math.max(0, value.latestArtifact.fileCount)
        : 0,
    },
    chosenStack: {
      kind: value.chosenStack?.kind === 'docker-compose'
        || value.chosenStack?.kind === 'dockerfile'
        || value.chosenStack?.kind === 'nextjs'
        || value.chosenStack?.kind === 'vite'
        || value.chosenStack?.kind === 'node'
        || value.chosenStack?.kind === 'python'
        || value.chosenStack?.kind === 'static'
        ? value.chosenStack.kind
        : 'unknown',
      label: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.label) ?? 'Unknown stack',
      detectionSource: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.detectionSource),
      installCommand: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.installCommand),
      buildCommand: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.buildCommand),
      startCommand: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.startCommand),
      runtimePort: typeof value.chosenStack?.runtimePort === 'number' && Number.isFinite(value.chosenStack.runtimePort)
        ? value.chosenStack.runtimePort
        : null,
      healthcheckPath: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.healthcheckPath),
      dockerfilePath: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.dockerfilePath),
      composeFilePath: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.composeFilePath),
      composeServiceName: normalizeWorkspaceArtifactLedgerText(value.chosenStack?.composeServiceName),
    },
    runnableEntry: {
      entryFile: normalizeWorkspaceArtifactLedgerText(value.runnableEntry?.entryFile),
      installCommand: normalizeWorkspaceArtifactLedgerText(value.runnableEntry?.installCommand),
      buildCommand: normalizeWorkspaceArtifactLedgerText(value.runnableEntry?.buildCommand),
      runCommands: normalizeWorkspaceArtifactLedgerCommands(value.runnableEntry?.runCommands),
    },
    previewTarget: {
      kind: value.previewTarget?.kind === 'preview' || value.previewTarget?.kind === 'release'
        ? value.previewTarget.kind
        : 'none',
      url: normalizeWorkspaceArtifactLedgerText(value.previewTarget?.url),
      verified: value.previewTarget?.verified === true,
      verifiedAt: normalizeWorkspaceArtifactLedgerText(value.previewTarget?.verifiedAt),
      lastError: normalizeWorkspaceArtifactLedgerText(value.previewTarget?.lastError),
    },
    deployReadiness: {
      sshStatus: value.deployReadiness?.sshStatus === 'missing_credentials'
        || value.deployReadiness?.sshStatus === 'auth_failed'
        || value.deployReadiness?.sshStatus === 'host_unreachable'
        || value.deployReadiness?.sshStatus === 'host_key_untrusted'
        || value.deployReadiness?.sshStatus === 'ready'
        ? value.deployReadiness.sshStatus
        : null,
      envStatus: value.deployReadiness?.envStatus === 'pending'
        || value.deployReadiness?.envStatus === 'ready'
        || value.deployReadiness?.envStatus === 'blocked'
        ? value.deployReadiness.envStatus
        : null,
      ready: value.deployReadiness?.ready === true,
      summary: normalizeWorkspaceArtifactLedgerText(value.deployReadiness?.summary) ?? 'Readiness has not been evaluated yet.',
    },
    gaps,
  };
}

export function normalizeOperatorEnvelope(envelope: OperatorEnvelope | null | undefined): OperatorEnvelope | null {
  if (!envelope) {
    return null;
  }

  return {
    ...envelope,
    previewSummary: normalizeOperatorPreviewSummary(envelope.previewSummary),
    techStackSummary: normalizeOperatorTechStackSummary(envelope.techStackSummary),
    envChecklistSummary: normalizeOperatorEnvChecklistSummary(envelope.envChecklistSummary),
    credentialReadiness: normalizeOperatorCredentialReadiness(envelope.credentialReadiness),
    deploymentSummary: normalizeOperatorDeploymentSummary(envelope.deploymentSummary),
    workspaceArtifactLedger: normalizeWorkspaceArtifactLedger(envelope.workspaceArtifactLedger),
    workflow: normalizeOperatorWorkflowState(envelope.workflow),
  };
}

export interface OperatorGenerationTaskResponse {
  message: string;
  data: OperatorGenerationTask;
  meta: ApiMeta;
}

export interface OperatorJobResponse {
  message: string;
  data: OperatorJob;
  meta: ApiMeta;
}
