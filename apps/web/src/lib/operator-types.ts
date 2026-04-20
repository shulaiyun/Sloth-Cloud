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
  | 'job_running'
  | 'preview_ready'
  | 'preview_failed'
  | 'audit_ready'
  | 'audit_failed'
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
