import type {
  OperatorArtifactSummary,
  OperatorCredentialReadiness,
  OperatorEnvChecklistSummary,
  OperatorGeneratedProject,
  OperatorPreviewSummary,
  OperatorTechStackSummary,
  OperatorWorkspaceArtifactLedger,
  OperatorWorkspaceArtifactLedgerChosenStack,
  OperatorWorkspaceArtifactLedgerDeployReadiness,
  OperatorWorkspaceArtifactLedgerGapId,
  OperatorWorkspaceArtifactLedgerLatestArtifact,
  OperatorWorkspaceArtifactLedgerPreviewTarget,
  OperatorWorkspaceArtifactLedgerRunnableEntry,
} from './operator.js';

const validGapIds = new Set<OperatorWorkspaceArtifactLedgerGapId>([
  'missing_latest_artifact',
  'missing_chosen_stack',
  'missing_runnable_entry',
  'missing_preview_target',
  'readiness_blocked',
]);

function nowIso() {
  return new Date().toISOString();
}

function trimText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function nonEmpty(value: string | null | undefined) {
  const text = trimText(value);
  return text ? text : null;
}

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = nonEmpty(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function pickNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function pickCommands(...values: Array<string[] | null | undefined>) {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }
    const commands = value.map((entry) => trimText(entry)).filter(Boolean);
    if (commands.length > 0) {
      return commands;
    }
  }
  return [];
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
  const ledger: OperatorWorkspaceArtifactLedger = {
    lastUpdatedAt: null,
    latestUserIntent: null,
    latestArtifact: defaultWorkspaceArtifactLedgerLatestArtifact(),
    chosenStack: defaultWorkspaceArtifactLedgerChosenStack(),
    runnableEntry: defaultWorkspaceArtifactLedgerRunnableEntry(),
    previewTarget: defaultWorkspaceArtifactLedgerPreviewTarget(),
    deployReadiness: defaultWorkspaceArtifactLedgerDeployReadiness(),
    gaps: [],
  };
  ledger.gaps = computeWorkspaceArtifactLedgerGaps(ledger, { includeReadiness: true });
  return ledger;
}

function normalizeLatestArtifact(value: unknown): OperatorWorkspaceArtifactLedgerLatestArtifact {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedgerLatestArtifact();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedgerLatestArtifact>;
  return {
    sourceType: record.sourceType === 'generated' || record.sourceType === 'repository' || record.sourceType === 'server'
      ? record.sourceType
      : 'none',
    sourceRef: nonEmpty(record.sourceRef),
    archiveUrl: nonEmpty(record.archiveUrl),
    manifestUrl: nonEmpty(record.manifestUrl),
    archiveName: nonEmpty(record.archiveName),
    fileCount: typeof record.fileCount === 'number' && Number.isFinite(record.fileCount) ? Math.max(0, record.fileCount) : 0,
  };
}

function normalizeChosenStack(value: unknown): OperatorWorkspaceArtifactLedgerChosenStack {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedgerChosenStack();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedgerChosenStack>;
  return {
    kind: record.kind === 'docker-compose'
      || record.kind === 'dockerfile'
      || record.kind === 'nextjs'
      || record.kind === 'vite'
      || record.kind === 'node'
      || record.kind === 'python'
      || record.kind === 'static'
      ? record.kind
      : 'unknown',
    label: pickString(record.label, 'Unknown stack') ?? 'Unknown stack',
    detectionSource: nonEmpty(record.detectionSource),
    installCommand: nonEmpty(record.installCommand),
    buildCommand: nonEmpty(record.buildCommand),
    startCommand: nonEmpty(record.startCommand),
    runtimePort: pickNumber(record.runtimePort),
    healthcheckPath: nonEmpty(record.healthcheckPath),
    dockerfilePath: nonEmpty(record.dockerfilePath),
    composeFilePath: nonEmpty(record.composeFilePath),
    composeServiceName: nonEmpty(record.composeServiceName),
  };
}

function normalizeRunnableEntry(value: unknown): OperatorWorkspaceArtifactLedgerRunnableEntry {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedgerRunnableEntry();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedgerRunnableEntry>;
  return {
    entryFile: nonEmpty(record.entryFile),
    installCommand: nonEmpty(record.installCommand),
    buildCommand: nonEmpty(record.buildCommand),
    runCommands: pickCommands(record.runCommands),
  };
}

function normalizePreviewTarget(value: unknown): OperatorWorkspaceArtifactLedgerPreviewTarget {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedgerPreviewTarget();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedgerPreviewTarget>;
  return {
    kind: record.kind === 'preview' || record.kind === 'release' ? record.kind : 'none',
    url: nonEmpty(record.url),
    verified: record.verified === true,
    verifiedAt: nonEmpty(record.verifiedAt),
    lastError: nonEmpty(record.lastError),
  };
}

function normalizeDeployReadiness(value: unknown): OperatorWorkspaceArtifactLedgerDeployReadiness {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedgerDeployReadiness();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedgerDeployReadiness>;
  return {
    sshStatus: record.sshStatus === 'ready'
      || record.sshStatus === 'missing_credentials'
      || record.sshStatus === 'auth_failed'
      || record.sshStatus === 'host_unreachable'
      || record.sshStatus === 'host_key_untrusted'
      ? record.sshStatus
      : null,
    envStatus: record.envStatus === 'pending' || record.envStatus === 'ready' || record.envStatus === 'blocked'
      ? record.envStatus
      : null,
    ready: record.ready === true,
    summary: pickString(record.summary, 'Readiness has not been evaluated yet.') ?? 'Readiness has not been evaluated yet.',
  };
}

export function normalizeWorkspaceArtifactLedger(value: unknown): OperatorWorkspaceArtifactLedger {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkspaceArtifactLedger();
  }

  const record = value as Partial<OperatorWorkspaceArtifactLedger>;
  const ledger: OperatorWorkspaceArtifactLedger = {
    lastUpdatedAt: nonEmpty(record.lastUpdatedAt),
    latestUserIntent: nonEmpty(record.latestUserIntent),
    latestArtifact: normalizeLatestArtifact(record.latestArtifact),
    chosenStack: normalizeChosenStack(record.chosenStack),
    runnableEntry: normalizeRunnableEntry(record.runnableEntry),
    previewTarget: normalizePreviewTarget(record.previewTarget),
    deployReadiness: normalizeDeployReadiness(record.deployReadiness),
    gaps: Array.isArray(record.gaps)
      ? record.gaps.filter((entry): entry is OperatorWorkspaceArtifactLedgerGapId => validGapIds.has(entry as OperatorWorkspaceArtifactLedgerGapId))
      : [],
  };

  const computedGaps = computeWorkspaceArtifactLedgerGaps(ledger, { includeReadiness: true });
  ledger.gaps = computedGaps;
  return ledger;
}

function hasLatestArtifact(ledger: OperatorWorkspaceArtifactLedger) {
  if (ledger.latestArtifact.sourceType === 'generated') {
    return Boolean(
      trimText(ledger.latestArtifact.archiveUrl)
      || trimText(ledger.latestArtifact.manifestUrl)
      || trimText(ledger.latestArtifact.archiveName)
      || ledger.latestArtifact.fileCount > 0,
    );
  }

  return ledger.latestArtifact.sourceType !== 'none'
    && Boolean(
      trimText(ledger.latestArtifact.sourceRef)
      || trimText(ledger.latestArtifact.archiveUrl)
      || trimText(ledger.latestArtifact.manifestUrl)
      || trimText(ledger.latestArtifact.archiveName)
      || ledger.latestArtifact.fileCount > 0,
    );
}

function hasChosenStack(ledger: OperatorWorkspaceArtifactLedger) {
  return ledger.chosenStack.kind !== 'unknown'
    || Boolean(trimText(ledger.chosenStack.label) && trimText(ledger.chosenStack.label).toLowerCase() !== 'unknown stack');
}

function hasRunnableEntry(ledger: OperatorWorkspaceArtifactLedger) {
  return Boolean(trimText(ledger.runnableEntry.entryFile))
    && ledger.runnableEntry.runCommands.some((command) => trimText(command).length > 0);
}

function hasPreviewTarget(ledger: OperatorWorkspaceArtifactLedger) {
  return Boolean(trimText(ledger.previewTarget.url));
}

export function computeWorkspaceArtifactLedgerGaps(
  ledger: OperatorWorkspaceArtifactLedger,
  options?: {
    includeReadiness?: boolean;
  },
): OperatorWorkspaceArtifactLedgerGapId[] {
  const gaps: OperatorWorkspaceArtifactLedgerGapId[] = [];
  if (!hasLatestArtifact(ledger)) {
    gaps.push('missing_latest_artifact');
  }
  if (!hasChosenStack(ledger)) {
    gaps.push('missing_chosen_stack');
  }
  if (!hasRunnableEntry(ledger)) {
    gaps.push('missing_runnable_entry');
  }
  if (!hasPreviewTarget(ledger)) {
    gaps.push('missing_preview_target');
  }
  if (options?.includeReadiness && !ledger.deployReadiness.ready) {
    gaps.push('readiness_blocked');
  }
  return gaps;
}

export function selectWorkspaceArtifactLedgerBlockingGaps(
  ledger: OperatorWorkspaceArtifactLedger,
  options?: {
    includeReadiness?: boolean;
  },
) {
  const blocking = new Set<OperatorWorkspaceArtifactLedgerGapId>([
    'missing_latest_artifact',
    'missing_chosen_stack',
    'missing_runnable_entry',
    'missing_preview_target',
  ]);
  if (options?.includeReadiness) {
    blocking.add('readiness_blocked');
  }
  return ledger.gaps.filter((gap) => blocking.has(gap));
}

export function describeWorkspaceArtifactLedgerGap(
  gap: OperatorWorkspaceArtifactLedgerGapId,
  locale: 'zh-CN' | 'en' = 'en',
) {
  const zh = locale === 'zh-CN';
  switch (gap) {
    case 'missing_latest_artifact':
      return zh ? '缺少最新 artifact' : 'latest artifact is missing';
    case 'missing_chosen_stack':
      return zh ? '缺少已选技术栈' : 'chosen stack is missing';
    case 'missing_runnable_entry':
      return zh ? '缺少可运行入口' : 'runnable entry is missing';
    case 'missing_preview_target':
      return zh ? '缺少 preview target' : 'preview target is missing';
    case 'readiness_blocked':
      return zh ? 'deploy readiness 尚未就绪' : 'deploy readiness is not ready';
    default:
      return gap;
  }
}

export function summarizeWorkspaceArtifactLedgerGaps(
  gaps: OperatorWorkspaceArtifactLedgerGapId[],
  locale: 'zh-CN' | 'en' = 'en',
) {
  return gaps.map((gap) => describeWorkspaceArtifactLedgerGap(gap, locale));
}

export function buildWorkspaceArtifactLedger(input: {
  current?: unknown;
  latestUserIntent?: string | null;
  artifactSummary: OperatorArtifactSummary;
  generatedProject?: OperatorGeneratedProject | null;
  techStackSummary: OperatorTechStackSummary;
  previewSummary: OperatorPreviewSummary;
  credentialReadiness: OperatorCredentialReadiness;
  envChecklistSummary: OperatorEnvChecklistSummary;
  previewTargetUrl?: string | null;
  previewTargetKind?: 'preview' | 'release' | 'none';
}): OperatorWorkspaceArtifactLedger {
  const current = normalizeWorkspaceArtifactLedger(input.current);
  const preferGeneratedProject = input.artifactSummary.sourceType === 'generated' && Boolean(input.generatedProject);

  const latestArtifact: OperatorWorkspaceArtifactLedgerLatestArtifact = {
    sourceType: input.artifactSummary.sourceType,
    sourceRef: pickString(input.artifactSummary.sourceRef, current.latestArtifact.sourceRef),
    archiveUrl: preferGeneratedProject
      ? pickString(input.generatedProject?.archiveUrl, input.artifactSummary.archiveUrl, current.latestArtifact.archiveUrl)
      : pickString(input.artifactSummary.archiveUrl, input.generatedProject?.archiveUrl, current.latestArtifact.archiveUrl),
    manifestUrl: preferGeneratedProject
      ? pickString(input.generatedProject?.manifestUrl, input.artifactSummary.manifestUrl, current.latestArtifact.manifestUrl)
      : pickString(input.artifactSummary.manifestUrl, input.generatedProject?.manifestUrl, current.latestArtifact.manifestUrl),
    archiveName: pickString(input.generatedProject?.archiveName, current.latestArtifact.archiveName),
    fileCount: pickNumber(
      preferGeneratedProject ? (input.generatedProject?.files.length ?? null) : null,
      input.artifactSummary.fileCount > 0 ? input.artifactSummary.fileCount : null,
      !preferGeneratedProject ? (input.generatedProject?.files.length ?? null) : null,
      current.latestArtifact.fileCount,
    ) ?? 0,
  };

  const chosenStack: OperatorWorkspaceArtifactLedgerChosenStack = {
    kind: input.techStackSummary.kind,
    label: pickString(
      input.techStackSummary.kind !== 'unknown' ? input.techStackSummary.label : null,
      current.chosenStack.kind !== 'unknown' ? current.chosenStack.label : null,
      input.techStackSummary.label,
      current.chosenStack.label,
      'Unknown stack',
    ) ?? 'Unknown stack',
    detectionSource: pickString(input.techStackSummary.detectionSource, current.chosenStack.detectionSource),
    installCommand: pickString(input.techStackSummary.installCommand, current.chosenStack.installCommand),
    buildCommand: pickString(input.techStackSummary.buildCommand, current.chosenStack.buildCommand),
    startCommand: pickString(input.techStackSummary.startCommand, current.chosenStack.startCommand),
    runtimePort: pickNumber(input.techStackSummary.runtimePort, current.chosenStack.runtimePort),
    healthcheckPath: pickString(input.techStackSummary.healthcheckPath, current.chosenStack.healthcheckPath),
    dockerfilePath: pickString(input.techStackSummary.dockerfilePath, current.chosenStack.dockerfilePath),
    composeFilePath: pickString(input.techStackSummary.composeFilePath, current.chosenStack.composeFilePath),
    composeServiceName: pickString(input.techStackSummary.composeServiceName, current.chosenStack.composeServiceName),
  };

  const runnableEntry: OperatorWorkspaceArtifactLedgerRunnableEntry = {
    entryFile: preferGeneratedProject
      ? pickString(
        input.generatedProject?.entryFile,
        input.artifactSummary.entryFile,
        input.previewSummary.entryFile,
        current.runnableEntry.entryFile,
      )
      : pickString(
        input.artifactSummary.entryFile,
        input.generatedProject?.entryFile,
        input.previewSummary.entryFile,
        current.runnableEntry.entryFile,
      ),
    installCommand: pickString(
      input.artifactSummary.installCommand,
      input.techStackSummary.installCommand,
      current.runnableEntry.installCommand,
    ),
    buildCommand: pickString(
      input.artifactSummary.buildCommand,
      input.techStackSummary.buildCommand,
      current.runnableEntry.buildCommand,
    ),
    runCommands: preferGeneratedProject
      ? pickCommands(
        input.generatedProject?.runCommands,
        input.artifactSummary.runCommands,
        current.runnableEntry.runCommands,
      )
      : pickCommands(
        input.artifactSummary.runCommands,
        input.generatedProject?.runCommands,
        current.runnableEntry.runCommands,
      ),
  };

  const previewUrl = pickString(input.previewSummary.previewUrl, input.previewTargetUrl, current.previewTarget.url);
  const previewTarget: OperatorWorkspaceArtifactLedgerPreviewTarget = {
    kind: previewUrl ? (input.previewTargetKind ?? (current.previewTarget.kind === 'release' ? 'release' : 'preview')) : 'none',
    url: previewUrl,
    verified: input.previewSummary.verified === true,
    verifiedAt: pickString(input.previewSummary.verifiedAt, current.previewTarget.verifiedAt),
    lastError: pickString(input.previewSummary.lastError, current.previewTarget.lastError),
  };

  const deployReadiness: OperatorWorkspaceArtifactLedgerDeployReadiness = {
    sshStatus: input.credentialReadiness.status,
    envStatus: input.envChecklistSummary.status,
    ready: input.credentialReadiness.status === 'ready' && input.envChecklistSummary.status !== 'blocked',
    summary: `${input.credentialReadiness.headline} / ${input.envChecklistSummary.headline}`,
  };

  const nextLedger: OperatorWorkspaceArtifactLedger = {
    lastUpdatedAt: current.lastUpdatedAt,
    latestUserIntent: pickString(input.latestUserIntent, current.latestUserIntent),
    latestArtifact,
    chosenStack,
    runnableEntry,
    previewTarget,
    deployReadiness,
    gaps: [],
  };
  nextLedger.gaps = computeWorkspaceArtifactLedgerGaps(nextLedger, { includeReadiness: true });

  const currentComparable = JSON.stringify({
    ...current,
    lastUpdatedAt: null,
  });
  const nextComparable = JSON.stringify({
    ...nextLedger,
    lastUpdatedAt: null,
  });

  nextLedger.lastUpdatedAt = currentComparable === nextComparable
    ? current.lastUpdatedAt
    : nowIso();

  return nextLedger;
}

export function getWorkspaceArtifactLedgerLatestArtifactDetail(ledger: OperatorWorkspaceArtifactLedger) {
  return pickString(
    ledger.latestArtifact.archiveUrl,
    ledger.latestArtifact.manifestUrl,
    ledger.runnableEntry.entryFile,
    ledger.previewTarget.url,
    ledger.latestArtifact.sourceRef,
  );
}
