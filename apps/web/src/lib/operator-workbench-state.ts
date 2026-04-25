import type { AssistantActionProposal, AssistantMessage } from './types';
import type {
  OperatorEnvelope,
  OperatorWorkflowCard,
  OperatorWorkflowCardKind,
  OperatorWorkflowTask,
} from './operator-types';

export const lobbyThreadKey = '__lobby__';

export interface WorkbenchActionCard {
  id: string;
  source: 'llm' | 'system' | 'preflight' | 'mock';
}

export interface ActiveTaskTruth {
  currentStage: string;
  runState: string;
  activeTaskId: string;
  latestArtifact: string;
  failureCode: string;
  summary: string;
  actions: string[];
  humanSummary: string;
  probableRootCause: string;
  recommendedActions: string[];
}

function decodePercentEncodedText(raw: string) {
  const decodeLoose = (value: string) => {
    const source = value.replace(/\+/g, '%20');
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const bytes: number[] = [];
    let result = '';

    const flushBytes = () => {
      if (!bytes.length) {
        return;
      }
      result += decoder.decode(new Uint8Array(bytes));
      bytes.length = 0;
    };

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === '%' && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
        bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
        index += 2;
        continue;
      }
      flushBytes();
      result += char;
    }

    flushBytes();
    return result;
  };

  let current = raw;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decoded = decodeLoose(current);
    if (!decoded || decoded === current) {
      break;
    }
    current = decoded;
  }
  return current;
}

export function decodeWorkspaceTitle(raw: string | null | undefined) {
  const fallback = (raw ?? '').trim();
  if (!fallback) {
    return '-';
  }

  const decoded = decodePercentEncodedText(fallback).trim();
  return decoded || fallback;
}

export function resolveSelectedWorkspaceId(routeCapsuleId: string | null | undefined, queryCapsuleId: string | null | undefined) {
  return routeCapsuleId ?? queryCapsuleId ?? null;
}

export function resolveLegacyCapsuleRedirect(routeCapsuleId: string | null | undefined, queryCapsuleId: string | null | undefined) {
  if (!routeCapsuleId && queryCapsuleId) {
    return `/operator-lab/${queryCapsuleId}`;
  }
  return null;
}

export function resolveThreadKey(selectedWorkspaceId: string | null | undefined) {
  return selectedWorkspaceId ?? lobbyThreadKey;
}

export function shouldShowLobbyPanels(selectedWorkspaceId: string | null | undefined) {
  return !selectedWorkspaceId;
}

export function dedupeMessagesById(messages: AssistantMessage[]) {
  const result: AssistantMessage[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    result.push(message);
  }

  return result;
}

export function dedupeProposalsById(proposals: AssistantActionProposal[]) {
  const result: AssistantActionProposal[] = [];
  const seen = new Set<string>();

  for (const proposal of proposals) {
    if (seen.has(proposal.id)) {
      continue;
    }
    seen.add(proposal.id);
    result.push(proposal);
  }

  return result;
}

export function mergeActionCards(existing: WorkbenchActionCard[], incoming: WorkbenchActionCard[]) {
  const result: WorkbenchActionCard[] = [];
  const seen = new Set<string>();

  for (const card of [...existing, ...incoming]) {
    if (seen.has(card.id)) {
      continue;
    }
    seen.add(card.id);
    result.push(card);
  }

  return result;
}

export function selectActiveWorkflowTask(envelope: OperatorEnvelope | null | undefined): OperatorWorkflowTask | null {
  if (!envelope) {
    return null;
  }

  return envelope.workflow.activeTaskId
    ? envelope.workflow.tasks.find((task) => task.id === envelope.workflow.activeTaskId) ?? null
    : envelope.workflow.tasks.at(-1) ?? null;
}

export function resolveWorkflowCardKindLabel(kind: OperatorWorkflowCardKind) {
  const labels: Record<OperatorWorkflowCardKind, string> = {
    user_message: 'user message',
    understanding: 'understanding',
    preflight: 'preflight',
    plan: 'plan',
    confirmation: 'confirmation',
    execution: 'executor',
    verification: 'verifying',
    failure_diagnosis: 'diagnosis',
    next_step: 'next step',
  };

  return labels[kind];
}

export function getWorkflowCardStableId(card: Pick<OperatorWorkflowCard, 'id'>) {
  const stableId = card.id.trim();
  return stableId || '-';
}

export function resolveActiveTaskTruth(
  envelope: OperatorEnvelope | null | undefined,
  fallbackRunState?: string | null,
): ActiveTaskTruth {
  const activeTask = selectActiveWorkflowTask(envelope);
  const failure = activeTask?.failure ?? null;

  return {
    currentStage: activeTask?.currentStage ?? '-',
    runState: envelope?.latestJob?.status ?? activeTask?.currentStage ?? fallbackRunState ?? '-',
    activeTaskId: activeTask?.id ?? '-',
    latestArtifact: activeTask?.artifacts.at(-1)?.detail
      ?? envelope?.artifactSummary.archiveUrl
      ?? envelope?.artifactSummary.manifestUrl
      ?? envelope?.artifactSummary.entryFile
      ?? '-',
    failureCode: failure?.failureCode ?? '-',
    summary: failure?.humanSummary ?? '-',
    actions: failure?.recommendedActions.length ? failure.recommendedActions : ['-'],
    humanSummary: failure?.humanSummary ?? '-',
    probableRootCause: failure?.probableRootCause ?? '-',
    recommendedActions: failure?.recommendedActions.length ? failure.recommendedActions : ['-'],
  };
}
