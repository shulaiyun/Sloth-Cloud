import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { toFriendlyError } from '../lib/friendly-error';
import { preflightRepoInput } from '../lib/operator-input';
import {
  buildOperatorV3OptimisticAck,
} from '../lib/operator-v3-view-model';
import {
  buildOperatorV4ViewModel,
  isDisposableWorkspaceCandidate,
  resolveProjectStatusLabel,
  resolveWorkspaceDisplayName,
  type OperatorV4ProjectFilter,
  type OperatorV4ProjectRailItem,
  type OperatorV4PreviewLevel,
} from '../lib/operator-v4-view-model';
import {
  isOperatorRunningStage,
  resolveNoPreviewReason,
  resolveOperatorTerminalState,
  resolveRunStepLabel,
} from '../lib/operator-v4-runtime';
import {
  normalizeOperatorEnvelope,
  type OperatorCapsule,
  type OperatorCapsuleListResponse,
  type OperatorEnvelope,
  type OperatorResponse,
  type OperatorWorkflowFailureCode,
  type OperatorWorkflowTask,
} from '../lib/operator-types';
import {
  decodeWorkspaceTitle,
  dedupeMessagesById,
  dedupeProposalsById,
  lobbyThreadKey,
  resolveLegacyCapsuleRedirect,
  resolveSelectedWorkspaceId,
  selectActiveWorkflowTask,
} from '../lib/operator-workbench-state';
import { useSite } from '../lib/site-context';
import type {
  AssistantActionProposal,
  AssistantCapabilitiesResponse,
  AssistantConfirmResponse,
  AssistantMessage,
  AssistantMessagesResponse,
  AssistantPendingConfirmation,
  AssistantProviderStatusResponse,
  AssistantSessionResponse,
} from '../lib/types';
import {
  ComposerDock,
  type OperatorV4ComposerAttachment,
} from '../components/operator-v4/ComposerDock';
import {
  ConversationList,
  type OperatorV4ConversationEntry,
} from '../components/operator-v4/ConversationList';
import { DetailsDrawer } from '../components/operator-v4/DetailsDrawer';
import {
  type OperatorV4NewProjectDraft,
} from '../components/operator-v4/NewProjectDialog';
import { OperatorV4Shell } from '../components/operator-v4/OperatorV4Shell';
import { ProjectRail } from '../components/operator-v4/ProjectRail';
import { WorkspaceHeader } from '../components/operator-v4/WorkspaceHeader';

type AssistantActionResultPayload = AssistantMessagesResponse['data']['actionResult'];
type AssistantRunState = AssistantMessagesResponse['data']['runState'];
type AssistantResponseSource = AssistantMessagesResponse['data']['source'];
type AssistantRoutingPayload = AssistantMessagesResponse['data']['routing'];

type RetrySnapshot = {
  message: string;
  attachments: OperatorV4ComposerAttachment[];
  requestedAction?: AssistantActionProposal['action'];
  mode?: 'ask' | 'run';
};

type RunLiveState = {
  entries: OperatorV4ConversationEntry[];
  lastProgressKey: string | null;
  lastSignalAt: string | null;
  lastHeartbeatAt: string | null;
  lastPreviewUrl: string | null;
  lastTerminalState: string | null;
  currentStep: string | null;
  running: boolean;
  stuck: boolean;
  trackingCancelled: boolean;
};

type ConversationSurface = 'lobby' | 'workspace';

type OperatorRepairSuggestion = {
  category: 'unsupported_stack' | 'missing_entry' | 'missing_port' | 'uncertain_recipe';
  reason: string;
  missing: string[];
  recommended: {
    summary: string;
    startCommand: string | null;
    port: number | null;
    healthcheckPath: string | null;
    dockerServiceName: string | null;
    dockerRunMode: string | null;
  };
};

type ConversationState = {
  id: string;
  surface: ConversationSurface;
  sessionId: string | null;
  messages: AssistantMessage[];
  proposals: AssistantActionProposal[];
  pendingConfirmation: AssistantPendingConfirmation | null;
  actionResult: AssistantActionResultPayload | null;
  runState: AssistantRunState;
  lastSource: AssistantResponseSource;
  lastRouting: AssistantRoutingPayload | null;
  composer: string;
  mode: 'auto' | 'ask' | 'run';
  attachments: OperatorV4ComposerAttachment[];
  attachmentError: string | null;
  assistantError: string | null;
  busy: boolean;
  optimisticEntries: OperatorV4ConversationEntry[];
  retrySnapshot: RetrySnapshot | null;
  forceNewTurn: boolean;
  advancedOptionsOpen: boolean;
  projectDraft: OperatorV4NewProjectDraft;
};

type WorkspaceChatState = {
  activeConversationId: string;
  conversationOrder: string[];
  conversations: Record<string, ConversationState>;
};

type StoredLobbyConversation = {
  version: 1;
  id: string;
  sessionId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
  lastSource: AssistantResponseSource;
};

const recentWorkspaceStorageKey = 'operator-v4:recent-workspace';
const selectedModelStorageKey = 'operator-v4:selected-model';
const lobbyConversationStorageKey = 'operator-v4:lobby-conversations';
const maxTextAttachmentBytes = 260 * 1024;
const maxAttachmentCount = 4;
const runStuckThresholdMs = 20_000;
const runProgressPollIntervalMs = 900;

function createRunLiveState(input?: Partial<RunLiveState>): RunLiveState {
  return {
    entries: input?.entries ?? [],
    lastProgressKey: input?.lastProgressKey ?? null,
    lastSignalAt: input?.lastSignalAt ?? null,
    lastHeartbeatAt: input?.lastHeartbeatAt ?? null,
    lastPreviewUrl: input?.lastPreviewUrl ?? null,
    lastTerminalState: input?.lastTerminalState ?? null,
    currentStep: input?.currentStep ?? null,
    running: input?.running ?? false,
    stuck: input?.stuck ?? false,
    trackingCancelled: input?.trackingCancelled ?? false,
  };
}

function createConversationId() {
  return `conversation_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function createConversationState(input?: Partial<ConversationState>): ConversationState {
  const id = input?.id ?? createConversationId();
  return {
    id,
    surface: input?.surface ?? 'lobby',
    sessionId: input?.sessionId ?? null,
    messages: input?.messages ?? [],
    proposals: input?.proposals ?? [],
    pendingConfirmation: input?.pendingConfirmation ?? null,
    actionResult: input?.actionResult ?? null,
    runState: input?.runState ?? 'draft',
    lastSource: input?.lastSource ?? 'system',
    lastRouting: input?.lastRouting ?? null,
    composer: input?.composer ?? '',
    mode: input?.mode ?? 'auto',
    attachments: input?.attachments ?? [],
    attachmentError: input?.attachmentError ?? null,
    assistantError: input?.assistantError ?? null,
    busy: input?.busy ?? false,
    optimisticEntries: input?.optimisticEntries ?? [],
    retrySnapshot: input?.retrySnapshot ?? null,
    forceNewTurn: input?.forceNewTurn ?? false,
    advancedOptionsOpen: input?.advancedOptionsOpen ?? false,
    projectDraft: input?.projectDraft ?? createDefaultNewProjectDraft(),
  };
}

function createWorkspaceChatState(
  initialConversation?: ConversationState,
  surface: ConversationSurface = 'lobby',
): WorkspaceChatState {
  const conversation = initialConversation ?? createConversationState({
    id: 'conversation_default',
    surface,
  });
  return {
    activeConversationId: conversation.id,
    conversationOrder: [conversation.id],
    conversations: {
      [conversation.id]: conversation,
    },
  };
}

function getWorkspaceChatState(state: Record<string, WorkspaceChatState>, key: string) {
  return state[key] ?? createWorkspaceChatState(undefined, key === lobbyThreadKey ? 'lobby' : 'workspace');
}

function getActiveConversation(chatState: WorkspaceChatState) {
  return chatState.conversations[chatState.activeConversationId]
    ?? chatState.conversations[chatState.conversationOrder[0]!]
    ?? createConversationState();
}

function isAssistantMessageLike(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && (record.role === 'user' || record.role === 'assistant' || record.role === 'system')
    && typeof record.content === 'string'
    && typeof record.createdAt === 'string';
}

function readStoredLobbyConversations(): StoredLobbyConversation[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(lobbyConversationStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry): StoredLobbyConversation | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id : null;
        const title = typeof record.title === 'string' ? record.title : null;
        const createdAt = typeof record.createdAt === 'string' ? record.createdAt : null;
        const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;
        const messages = Array.isArray(record.messages) ? record.messages.filter(isAssistantMessageLike) : [];
        if (!id || !title || !createdAt || !updatedAt || messages.length === 0) {
          return null;
        }

        const lastSource = record.lastSource === 'llm'
          || record.lastSource === 'preflight'
          || record.lastSource === 'mock'
          || record.lastSource === 'system'
          ? record.lastSource
          : 'system';

        return {
          version: 1,
          id,
          sessionId: typeof record.sessionId === 'string' ? record.sessionId : null,
          title,
          createdAt,
          updatedAt,
          messages,
          lastSource,
        };
      })
      .filter((entry): entry is StoredLobbyConversation => Boolean(entry));
  } catch {
    return [];
  }
}

function createStoredLobbyChatState(): WorkspaceChatState | null {
  const stored = readStoredLobbyConversations();
  if (stored.length === 0) {
    return null;
  }

  const conversations: Record<string, ConversationState> = {};
  const conversationOrder: string[] = [];
  for (const entry of stored) {
    conversations[entry.id] = createConversationState({
      id: entry.id,
      surface: 'lobby',
      sessionId: entry.sessionId,
      messages: entry.messages,
      lastSource: entry.lastSource,
      mode: 'auto',
      forceNewTurn: false,
    });
    conversationOrder.push(entry.id);
  }

  return {
    activeConversationId: conversationOrder[0]!,
    conversationOrder,
    conversations,
  };
}

function createInitialWorkspaceChats(): Record<string, WorkspaceChatState> {
  const storedLobbyState = createStoredLobbyChatState();
  return storedLobbyState ? { [lobbyThreadKey]: storedLobbyState } : {};
}

function deriveLobbyConversationTitle(conversation: ConversationState, locale: string) {
  const zh = locale.toLowerCase().startsWith('zh');
  const firstUserMessage = conversation.messages.find((message) => message.role === 'user')?.content
    ?? conversation.optimisticEntries.find((entry) => entry.role === 'user')?.content
    ?? conversation.composer
    ?? '';
  const compact = firstUserMessage
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = zh ? '新的对话' : 'New chat';
  const title = compact || fallback;
  return title.length > 26 ? `${title.slice(0, 26)}...` : title;
}

function mapOptimisticEntriesToMessages(entries: OperatorV4ConversationEntry[]): AssistantMessage[] {
  return entries
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system')
    .map((entry, index) => ({
      id: `optimistic-${entry.id}-${index}`,
      role: entry.role === 'user'
        ? 'user'
        : (entry.role === 'assistant' || entry.role === 'system' ? entry.role : 'assistant'),
      content: entry.content,
      createdAt: entry.createdAt,
    }));
}

function collectPersistableConversationMessages(conversation: ConversationState) {
  const optimisticMessages = mapOptimisticEntriesToMessages(conversation.optimisticEntries);
  if (conversation.messages.length === 0) {
    return optimisticMessages;
  }
  if (optimisticMessages.length === 0) {
    return conversation.messages;
  }
  return dedupeMessagesById([...conversation.messages, ...optimisticMessages]);
}

function normalizeMessageContent(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function dedupeMessagesBySignature(messages: AssistantMessage[]) {
  const result: AssistantMessage[] = [];
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();

  for (const message of messages) {
    const signature = `${message.role}:${normalizeMessageContent(message.content)}`;
    if (seenIds.has(message.id) || seenSignatures.has(signature)) {
      continue;
    }
    seenIds.add(message.id);
    seenSignatures.add(signature);
    result.push(message);
  }

  return result;
}

function resolveMessagesAfterAssistantResponse(
  current: ConversationState,
  response: AssistantMessagesResponse,
  submittedMessage: string,
) {
  const sessionMessages = dedupeMessagesBySignature(response.data.session.messages ?? []);
  const sessionMessagesWithReply = dedupeMessagesBySignature([
    ...sessionMessages,
    response.data.reply,
  ]);
  const submitted = normalizeMessageContent(submittedMessage);
  const sessionHasSubmittedUser = sessionMessagesWithReply.some((message) => (
    message.role === 'user' && normalizeMessageContent(message.content) === submitted
  ));

  if (sessionHasSubmittedUser) {
    return sessionMessagesWithReply;
  }

  return dedupeMessagesBySignature([
    ...current.messages,
    ...mapOptimisticEntriesToMessages(current.optimisticEntries),
    ...sessionMessagesWithReply,
  ]);
}

function serializeLobbyConversations(chatState: WorkspaceChatState, locale: string): StoredLobbyConversation[] {
  return chatState.conversationOrder
    .map((conversationId) => chatState.conversations[conversationId])
    .filter((conversation): conversation is ConversationState => Boolean(conversation) && conversation.surface === 'lobby')
    .map((conversation) => {
      const persistedMessages = collectPersistableConversationMessages(conversation);
      if (persistedMessages.length === 0) {
        return null;
      }

      const firstCreatedAt = persistedMessages[0]?.createdAt ?? new Date().toISOString();
      const lastUpdatedAt = persistedMessages.at(-1)?.createdAt ?? firstCreatedAt;
      return {
        version: 1,
        id: conversation.id,
        sessionId: conversation.sessionId,
        title: deriveLobbyConversationTitle(conversation, locale),
        createdAt: firstCreatedAt,
        updatedAt: lastUpdatedAt,
        messages: persistedMessages,
        lastSource: conversation.lastSource,
      };
    })
    .filter((entry): entry is StoredLobbyConversation => Boolean(entry))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 30);
}

function writeStoredLobbyConversations(records: StoredLobbyConversation[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (records.length === 0) {
      window.localStorage.removeItem(lobbyConversationStorageKey);
      return;
    }
    window.localStorage.setItem(lobbyConversationStorageKey, JSON.stringify(records));
  } catch {
    // Local conversation history is a convenience layer; storage failures should not block chat.
  }
}

function formatLobbyChatUpdatedLabel(value: string, locale: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function buildLobbyChatRailItems(input: {
  chatState: WorkspaceChatState;
  activeConversationId: string;
  selectedWorkspaceId: string | null;
  locale: string;
  filter: OperatorV4ProjectFilter;
  search: string;
}): OperatorV4ProjectRailItem[] {
  if (input.selectedWorkspaceId && (input.filter === 'failed' || input.filter === 'archived')) {
    return [];
  }

  const serialized = serializeLobbyConversations(input.chatState, input.locale);
  const activeConversation = input.chatState.conversations[input.activeConversationId];
  if (
    !input.selectedWorkspaceId
    && activeConversation
    && activeConversation.surface === 'lobby'
    && !serialized.some((entry) => entry.id === activeConversation.id)
  ) {
    const fallbackMessages = collectPersistableConversationMessages(activeConversation);
    if (fallbackMessages.length > 0) {
      serialized.unshift({
        version: 1,
        id: activeConversation.id,
        sessionId: activeConversation.sessionId,
        title: deriveLobbyConversationTitle(activeConversation, input.locale),
        createdAt: fallbackMessages[0]?.createdAt ?? new Date().toISOString(),
        updatedAt: fallbackMessages.at(-1)?.createdAt ?? new Date().toISOString(),
        messages: fallbackMessages,
        lastSource: activeConversation.lastSource,
      });
    }
  }

  const search = input.search.trim().toLowerCase();
  return serialized
    .filter((conversation) => {
      if (!search) {
        return true;
      }
      return [
        conversation.title,
        ...conversation.messages.map((message) => message.content),
      ].some((value) => value.toLowerCase().includes(search));
    })
    .map((conversation): OperatorV4ProjectRailItem => ({
      id: `chat:${conversation.id}`,
      itemKind: 'chat',
      title: conversation.title,
      typeLabel: input.locale.toLowerCase().startsWith('zh') ? '对话' : 'Chat',
      statusLabel: input.locale.toLowerCase().startsWith('zh') ? '已保存' : 'Saved',
      updatedLabel: formatLobbyChatUpdatedLabel(conversation.updatedAt, input.locale),
      archived: false,
      failed: false,
      selected: !input.selectedWorkspaceId && input.activeConversationId === conversation.id,
    }));
}

function isLobbyChatRailId(value: string) {
  return value.startsWith('chat:');
}

function lobbyConversationIdFromRailId(value: string) {
  return isLobbyChatRailId(value) ? value.slice('chat:'.length) : value;
}

function sortWorkspacesByRecent(workspaces: OperatorCapsule[]) {
  return [...workspaces].sort((left, right) => {
    const leftTime = Date.parse(left.lastActiveAt ?? left.updatedAt ?? '');
    const rightTime = Date.parse(right.lastActiveAt ?? right.updatedAt ?? '');
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function actionResultLinks(actionResult: AssistantActionResultPayload | null) {
  const record = actionResult?.data && typeof actionResult.data === 'object'
    ? actionResult.data as Record<string, unknown>
    : null;

  return {
    capsulePath: typeof record?.capsulePath === 'string' ? record.capsulePath : null,
  };
}

function extractCapsuleIdFromPath(path: string | null | undefined) {
  const match = path?.match(/\/(?:workspaces|operator(?:-lab)?)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function isLikelyTextAttachment(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
    return true;
  }

  return [
    '.txt',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.conf',
    '.env',
    '.log',
    '.sh',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.py',
    '.php',
    '.java',
    '.go',
    '.rs',
    '.sql',
    '.xml',
    '.html',
    '.css',
  ].some((ext) => name.endsWith(ext))
    || name === 'dockerfile'
    || name.includes('docker-compose')
    || name.includes('compose.');
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  });
}

function mergeConversationEntries(
  selectedWorkspaceId: string | null,
  activeTask: OperatorWorkflowTask | null,
  conversation: ConversationState,
  runEntries: OperatorV4ConversationEntry[],
  locale: string,
  repairSuggestion: OperatorRepairSuggestion | null,
): OperatorV4ConversationEntry[] {
  const zh = locale.toLowerCase().startsWith('zh');
  const activeTaskSessionId = activeTask?.thread.sessionId ?? null;
  const includeWorkflowMessages = Boolean(
    selectedWorkspaceId
      && activeTask
      && (
        !activeTaskSessionId
        || !conversation.sessionId
        || activeTaskSessionId === conversation.sessionId
      ),
  );
  const workflowMessages = includeWorkflowMessages
    ? (activeTask?.thread.messages ?? [])
    : [];
  const merged = new Map<string, OperatorV4ConversationEntry>();
  const bySignature = new Map<string, string>();

  const upsertEntry = (entry: OperatorV4ConversationEntry) => {
    const signature = `${entry.role}:${entry.content.trim().replace(/\s+/g, ' ').toLowerCase()}`;
    const existingId = bySignature.get(signature);
    if (existingId) {
      const existing = merged.get(existingId);
      if (existing) {
        const existingAt = Date.parse(existing.createdAt);
        const incomingAt = Date.parse(entry.createdAt);
        const nearDuplicate = Number.isFinite(existingAt)
          && Number.isFinite(incomingAt)
          && Math.abs(existingAt - incomingAt) <= 4_000;
        if (nearDuplicate) {
          if (existing.origin === 'workflow' && entry.origin === 'session') {
            merged.delete(existingId);
          } else {
            return;
          }
        }
      }
    }

    merged.set(entry.id, entry);
    bySignature.set(signature, entry.id);
  };

  for (const message of [...workflowMessages, ...conversation.messages]) {
    upsertEntry({
      id: message.id,
      kind: message.role === 'user' ? 'user' : 'assistant',
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
      createdAt: message.createdAt,
      status: 'done',
      origin: workflowMessages.some((entry) => entry.id === message.id) ? 'workflow' : 'session',
    });
  }

  for (const entry of runEntries) {
    upsertEntry({
      ...entry,
      origin: entry.origin ?? 'local',
    });
  }

  if (includeWorkflowMessages && activeTask) {
    for (const card of activeTask.timeline) {
      upsertEntry({
        id: `task-card-${activeTask.id}-${card.id}`,
        kind: 'task',
        role: 'task',
        content: card.summary || card.title,
        createdAt: card.createdAt,
        status: 'done',
        origin: 'workflow',
        taskUpdate: {
          step: card.title || (zh ? '任务更新' : 'Task update'),
          summary: card.summary || card.title,
          nextAction: card.nextStep,
          running: isOperatorRunningStage(card.stage),
          stuck: card.stage === 'blocked' || card.stage === 'failed' || Boolean(card.failureCode),
          heartbeatAt: card.createdAt,
          noPreviewReason: null,
          preview: null,
          repair: null,
        },
      });
    }
  }

  if (includeWorkflowMessages && activeTask?.currentStage === 'blocked' && repairSuggestion) {
    upsertEntry({
      id: `task-repair-${activeTask.id}-${activeTask.updatedAt}`,
      kind: 'task',
      role: 'task',
      content: repairSuggestion.reason,
      createdAt: activeTask.updatedAt,
      status: 'done',
      origin: 'workflow',
      taskUpdate: {
        step: zh ? '修复并继续执行' : 'Repair and continue',
        summary: zh
          ? '运行信息不完整，我先给你推荐一个修复方案。'
          : 'Runtime metadata is incomplete. I prepared a repair recommendation.',
        nextAction: zh ? '使用推荐方案并继续' : 'Use the recommended fix and continue',
        running: false,
        stuck: true,
        heartbeatAt: activeTask.updatedAt,
        noPreviewReason: null,
        preview: null,
        repair: repairSuggestion,
      },
    });
  }

  for (const entry of conversation.optimisticEntries) {
    upsertEntry(entry);
  }

  if (conversation.pendingConfirmation) {
    const pending = conversation.pendingConfirmation;
    upsertEntry({
      id: `pending-confirmation-${pending.token}`,
      kind: 'choice',
      role: 'assistant',
      content: pending.proposal.description,
      createdAt: pending.expiresAt,
      status: 'done',
      origin: 'session',
      choiceCard: {
        type: 'pending_confirmation',
        title: pending.proposal.title,
        description: pending.proposal.description,
        proposal: pending.proposal,
      },
    });
  } else if (conversation.proposals.length > 0) {
    const proposalIds = conversation.proposals.map((proposal) => proposal.id).join('|');
    upsertEntry({
      id: `proposal-list-${proposalIds}`,
      kind: 'choice',
      role: 'assistant',
      content: conversation.proposals[0]?.description ?? '',
      createdAt: conversation.messages.at(-1)?.createdAt ?? new Date().toISOString(),
      status: 'done',
      origin: 'session',
      choiceCard: {
        type: 'proposal_list',
        title: conversation.surface === 'lobby'
          ? 'Suggested next steps'
          : 'Suggested actions',
        description: null,
        proposals: conversation.proposals,
      },
    });
  }

  return [...merged.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function looksTechnicalConversationEntry(entry: OperatorV4ConversationEntry) {
  if (entry.role === 'task') {
    return false;
  }

  return /(failure_code|current_stage|run_state|active_task_id|latest_job|source\s*=|source:|stable_id|deploy_readiness|raw[_\s-]?logs)/i.test(entry.content);
}

function buildChatFirstConversationView(
  entries: OperatorV4ConversationEntry[],
  selectedWorkspaceId: string | null,
) {
  const technicalEntries = entries.filter((entry) => looksTechnicalConversationEntry(entry));
  const conversationalEntries = entries.filter((entry) => !looksTechnicalConversationEntry(entry));
  const workflowEntries = conversationalEntries.filter((entry) => entry.origin === 'workflow');
  const currentEntries = conversationalEntries.filter((entry) => entry.origin !== 'workflow');
  const shouldCollapseLegacyHistory = Boolean(selectedWorkspaceId) && workflowEntries.length > 2;

  if (!shouldCollapseLegacyHistory) {
    return {
      visibleEntries: conversationalEntries,
      historySummary: technicalEntries.length > 0
        ? {
          id: `${selectedWorkspaceId ?? 'lobby'}:history`,
          collapsedCount: technicalEntries.length,
          technicalCount: technicalEntries.length,
          entries: [] as OperatorV4ConversationEntry[],
        }
        : null,
    };
  }

  const visibleIds = new Set<string>();
  const lastUser = [...workflowEntries].reverse().find((entry) => entry.role === 'user');
  const lastAssistant = [...workflowEntries].reverse().find((entry) => entry.role === 'assistant' || entry.role === 'system');
  const lastTask = [...workflowEntries].reverse().find((entry) => entry.role === 'task');

  for (const entry of currentEntries) {
    visibleIds.add(entry.id);
  }

  if (lastUser) {
    visibleIds.add(lastUser.id);
  }
  if (lastAssistant) {
    visibleIds.add(lastAssistant.id);
  }
  if (lastTask) {
    visibleIds.add(lastTask.id);
  }

  const visibleEntries = conversationalEntries.filter((entry) => visibleIds.has(entry.id));
  const collapsedEntries = workflowEntries.filter((entry) => !visibleIds.has(entry.id));

  return {
    visibleEntries,
    historySummary: collapsedEntries.length > 0 || technicalEntries.length > 0
      ? {
        id: `${selectedWorkspaceId ?? 'lobby'}:${collapsedEntries.at(0)?.id ?? 'history'}`,
        collapsedCount: collapsedEntries.length + technicalEntries.length,
        technicalCount: technicalEntries.length,
        entries: collapsedEntries,
      }
      : null,
  };
}

function resolveEffectiveComposerMode(
  mode: 'auto' | 'ask' | 'run',
  message: string,
  hasActiveWorkspace: boolean,
): 'ask' | 'run' {
  if (mode === 'ask' || mode === 'run') {
    return mode;
  }

  const normalized = message.toLowerCase();
  const hasRepoUrl = /https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[^\s/]+\/[^\s/]+/i.test(normalized);
  const asksForAnalysisOnly = /(为什么|怎么|如何|解释|分析|诊断|排查|what|why|how|explain|analyze|diagnose)/i.test(normalized);
  const repoExecutionIntent = hasRepoUrl
    && /(部署|上线|修复|继续部署|预览|发布|deploy|release|publish|preview|run|fix|build|start)/i.test(normalized);
  const workspaceExecutionIntent = hasActiveWorkspace
    && /(帮我部署|继续当前任务|继续任务|继续部署|开始执行|立即执行|执行它|预览它|修复它|发布它|deploy it|continue task|continue deploy|run it|fix it|preview it|publish it)/i.test(normalized);
  if (asksForAnalysisOnly && !repoExecutionIntent && !workspaceExecutionIntent) {
    return 'ask';
  }
  if (repoExecutionIntent || workspaceExecutionIntent) {
    return 'run';
  }
  return 'ask';
}

function buildImmediateAck(input: {
  locale: string;
  mode: 'ask' | 'run';
  message: string;
  hasArtifact: boolean;
}) {
  const zh = input.locale.toLowerCase().startsWith('zh');
  if (input.mode === 'ask') {
    return buildOperatorV3OptimisticAck({
      message: input.message,
      locale: input.locale,
      hasArtifact: input.hasArtifact,
    });
  }

  if (/https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\//i.test(input.message)) {
    return zh ? '已接收任务，正在检查仓库。' : 'Task received. Checking repository now.';
  }
  if (/(部署|发布|上线|deploy|publish|release)/i.test(input.message)) {
    return zh ? '收到，我先规划部署步骤。' : 'Received. I will plan the deployment steps first.';
  }
  if (/(预览|preview)/i.test(input.message)) {
    return zh ? '收到，我先启动预览流程。' : 'Received. I will start the preview flow first.';
  }
  return zh ? '收到，我先分析当前产物。' : 'Received. I will analyze the current artifact first.';
}

function isRepairableFailureCode(code: OperatorWorkflowFailureCode | null | undefined) {
  return code === 'build_script_missing'
    || code === 'build_command_uncertain'
    || code === 'package_manager_unknown'
    || code === 'workspace_detection_failed'
    || code === 'unsupported_stack'
    || code === 'compose_recipe_missing'
    || code === 'env_missing'
    || code === 'deploy_blocked';
}

function resolveRepairCategory(input: {
  failureCode: OperatorWorkflowFailureCode | null;
  entryFile: string | null;
  runtimePort: number | null;
}): OperatorRepairSuggestion['category'] {
  if (input.failureCode === 'unsupported_stack') {
    return 'unsupported_stack';
  }
  if (
    input.failureCode === 'build_script_missing'
    || input.failureCode === 'workspace_detection_failed'
    || !input.entryFile
  ) {
    return 'missing_entry';
  }
  if (input.failureCode === 'env_missing' || input.runtimePort == null) {
    return 'missing_port';
  }
  return 'uncertain_recipe';
}

function resolveRepairSuggestion(input: {
  envelope: OperatorEnvelope | null;
  task: OperatorWorkflowTask | null;
  locale: string;
}): OperatorRepairSuggestion | null {
  const task = input.task;
  if (!task || task.currentStage !== 'blocked') {
    return null;
  }

  const failureCode = task.failure?.failureCode ?? null;
  if (!isRepairableFailureCode(failureCode)) {
    return null;
  }

  const zh = input.locale.toLowerCase().startsWith('zh');
  const ledger = input.envelope?.workspaceArtifactLedger;
  const stack = input.envelope?.techStackSummary;
  const recommendedStartCommandBase = ledger?.chosenStack.startCommand
    ?? stack?.startCommand
    ?? ledger?.runnableEntry.runCommands.at(0)
    ?? (zh ? 'npm run start' : 'npm run start');
  const recommendedPort = ledger?.chosenStack.runtimePort
    ?? stack?.runtimePort
    ?? 3000;
  const recommendedHealthcheck = ledger?.chosenStack.healthcheckPath
    ?? stack?.healthcheckPath
    ?? '/';
  const recommendedServiceName = ledger?.chosenStack.composeServiceName
    ?? stack?.composeServiceName
    ?? null;
  const dockerfilePath = ledger?.chosenStack.dockerfilePath
    ?? stack?.dockerfilePath
    ?? null;
  const composeFilePath = ledger?.chosenStack.composeFilePath
    ?? stack?.composeFilePath
    ?? null;
  const imageTag = `${(input.envelope?.capsule.slug ?? 'workspace').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'workspace'}-repair-preview`;
  const recommendedDockerRunMode = (() => {
    if (stack?.kind === 'docker-compose' && composeFilePath && recommendedServiceName) {
      return `docker compose -f ${composeFilePath} up -d --build ${recommendedServiceName}`;
    }
    if (stack?.kind === 'dockerfile') {
      const containerPort = recommendedPort ?? 3000;
      const dockerfile = dockerfilePath ?? 'Dockerfile';
      return `docker build -f ${dockerfile} -t ${imageTag} . && docker run --rm -p $PORT:${containerPort} ${imageTag}`;
    }
    if (recommendedStartCommandBase && /^docker\s+(run|compose)\b/i.test(recommendedStartCommandBase)) {
      return recommendedStartCommandBase;
    }
    return null;
  })();
  const recommendedStartCommand = (() => {
    if (recommendedDockerRunMode && stack?.kind === 'dockerfile') {
      return recommendedDockerRunMode;
    }
    return recommendedStartCommandBase;
  })();

  const category = resolveRepairCategory({
    failureCode,
    entryFile: ledger?.runnableEntry.entryFile ?? null,
    runtimePort: recommendedPort,
  });
  const missing: string[] = [];
  if (category === 'missing_entry' || !ledger?.runnableEntry.entryFile || failureCode === 'build_script_missing' || failureCode === 'workspace_detection_failed') {
    missing.push(zh ? '运行入口' : 'entry file');
  }
  if (!recommendedStartCommand || category === 'uncertain_recipe' || failureCode === 'build_command_uncertain') {
    missing.push(zh ? '启动命令' : 'start command');
  }
  if (category === 'missing_port' || recommendedPort == null || failureCode === 'env_missing') {
    missing.push(zh ? '端口' : 'port');
  }
  if (failureCode === 'compose_recipe_missing' || stack?.blockReason === 'compose_recipe_missing') {
    missing.push(zh ? 'Docker 服务信息' : 'Docker service recipe');
  }
  if (missing.length === 0) {
    missing.push(zh ? '运行信息' : 'runtime metadata');
  }

  const reason = task.failure?.humanSummary
    || (zh ? '当前执行被阻塞，运行入口信息还不完整。' : 'Execution is blocked because runtime metadata is incomplete.');
  const summary = zh
    ? `建议先使用命令 ${recommendedStartCommand ?? '-'}，端口 ${recommendedPort ?? '-'}，health ${recommendedHealthcheck ?? '/'}。`
    : `Use start command ${recommendedStartCommand ?? '-'}, port ${recommendedPort ?? '-'}, and health path ${recommendedHealthcheck ?? '/'}.`;

  return {
    category,
    reason,
    missing,
    recommended: {
      summary,
      startCommand: recommendedStartCommand,
      port: recommendedPort,
      healthcheckPath: recommendedHealthcheck,
      dockerServiceName: recommendedServiceName,
      dockerRunMode: recommendedDockerRunMode,
    },
  };
}

function buildRepairUserIntent(input: {
  locale: string;
  mode: 'recommended' | 're_detect' | 'manual';
  startCommand: string | null;
  port: number | null;
  healthcheckPath: string | null;
  dockerServiceName: string | null;
}) {
  const zh = input.locale.toLowerCase().startsWith('zh');
  if (input.mode === 're_detect') {
    return zh
      ? '请重新自动检测 Dockerfile/compose recipe，并继续部署。'
      : 'Please re-run Dockerfile/compose recipe detection and continue deployment.';
  }

  const command = input.startCommand?.trim() || (zh ? '未提供' : 'not provided');
  const port = input.port == null ? (zh ? '未提供' : 'not provided') : String(input.port);
  const health = input.healthcheckPath?.trim() || '/';
  const service = input.dockerServiceName?.trim();
  if (zh) {
    return `继续部署。启动命令=${command}；端口=${port}；健康检查=${health}${service ? `；Docker 服务=${service}` : ''}。`;
  }
  return `Continue deployment with startCommand=${command}, port=${port}, healthcheck=${health}${service ? `, dockerService=${service}` : ''}.`;
}

function createTaskUpdateEntry(input: {
  step: string;
  summary: string;
  nextAction: string | null;
  createdAt: string;
  running: boolean;
  stuck: boolean;
  heartbeatAt: string | null;
  noPreviewReason?: string | null;
  preview?: {
    url: string;
    statusLabel: string;
    healthLabel: string;
    verified: boolean;
  } | null;
  repair?: OperatorRepairSuggestion | null;
  status?: 'sending' | 'failed' | 'done';
}): OperatorV4ConversationEntry {
  return {
    id: `task-update-${input.createdAt}-${Math.random().toString(16).slice(2, 8)}`,
    kind: 'task',
    role: 'task',
    content: input.summary,
    createdAt: input.createdAt,
    status: input.status ?? 'done',
    origin: 'run',
    taskUpdate: {
      step: input.step,
      summary: input.summary,
      nextAction: input.nextAction,
      running: input.running,
      stuck: input.stuck,
      heartbeatAt: input.heartbeatAt,
      noPreviewReason: input.noPreviewReason ?? null,
      preview: input.preview ?? null,
      repair: input.repair ?? null,
    },
  };
}

function createDefaultNewProjectDraft(): OperatorV4NewProjectDraft {
  return {
    kind: 'idea',
    name: '',
    brief: '',
    repoUrl: '',
    host: '',
    username: 'root',
    port: '22',
    authMode: 'agent',
    password: '',
    sshKey: '',
  };
}

function hasProjectDraftInput(draft: OperatorV4NewProjectDraft | null | undefined) {
  if (!draft) {
    return false;
  }

  const username = draft.username.trim();
  const port = draft.port.trim();
  const hasNonDefaultUsername = username.length > 0 && username !== 'root';
  const hasNonDefaultPort = port.length > 0 && port !== '22';

  return Boolean(
    draft.name.trim()
    || draft.brief.trim()
    || draft.repoUrl.trim()
    || draft.host.trim()
    || hasNonDefaultUsername
    || hasNonDefaultPort
    || draft.authMode !== 'agent'
    || (draft.password || '').trim()
    || (draft.sshKey || '').trim(),
  );
}

function buildLobbyProjectMessage(input: {
  locale: string;
  composer: string;
  draft: OperatorV4NewProjectDraft;
}) {
  const zh = input.locale.toLowerCase().startsWith('zh');
  const repoUrl = input.draft.repoUrl.trim();
  const host = input.draft.host.trim();
  const username = input.draft.username.trim();
  const port = input.draft.port.trim();
  const includeUsername = Boolean(username) && (Boolean(host) || username !== 'root');
  const includePort = Boolean(port) && (Boolean(host) || port !== '22');
  const sections: string[] = [];
  const composer = input.composer.trim();
  if (composer) {
    sections.push(composer);
  } else if (repoUrl) {
    sections.push(zh ? '请帮我部署这个仓库项目。' : 'Please deploy this repository project.');
  } else if (host) {
    sections.push(zh ? '请连接这个服务器并继续部署。' : 'Please connect to this server and continue the deployment.');
  } else if (input.draft.name.trim() || input.draft.brief.trim()) {
    sections.push(input.draft.brief.trim() || input.draft.name.trim());
  }

  const structuredLines = [
    input.draft.name.trim() ? `${zh ? '项目名' : 'Project name'}: ${input.draft.name.trim()}` : null,
    repoUrl ? `Repo URL: ${repoUrl}` : null,
    host ? `${zh ? '服务器地址' : 'Server host'}: ${host}` : null,
    includeUsername ? `${zh ? '用户名' : 'Username'}: ${username}` : null,
    includePort ? `${zh ? '端口' : 'Port'}: ${port}` : null,
    input.draft.authMode !== 'agent' ? `${zh ? '认证方式' : 'Auth mode'}: ${input.draft.authMode}` : null,
    input.draft.brief.trim() && input.draft.brief.trim() !== composer ? `${zh ? '补充说明' : 'Notes'}: ${input.draft.brief.trim()}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  if (structuredLines.length > 0) {
    sections.push(structuredLines.join('\n'));
  }

  return sections.join('\n\n').trim();
}

function readStoredOperatorModelSelection() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(selectedModelStorageKey);
  } catch {
    return null;
  }
}

function writeStoredOperatorModelSelection(value: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(selectedModelStorageKey, value);
    } else {
      window.localStorage.removeItem(selectedModelStorageKey);
    }
  } catch {
    // Ignore storage failures in degraded environments.
  }
}

function buildFallbackProviderStatus(
  locale: string,
  reason?: string,
): AssistantProviderStatusResponse['data'] {
  const zh = locale.toLowerCase().startsWith('zh');
  return {
    enabled: true,
    checkedAt: new Date().toISOString(),
    primaryProvider: 'unknown',
    activeProvider: null,
    activeModel: null,
    providerConfigured: false,
    credentialsPresent: false,
    networkReachable: false,
    modelReachable: false,
    responseMode: 'fallback',
    canRun: false,
    reason: reason?.trim() || (zh
      ? '暂时无法读取 AI 就绪状态，请检查 API 与网络连通性。'
      : 'Unable to read AI readiness right now. Check API and network connectivity.'),
    providerResults: [],
  };
}

function isHonestPreviewUrl(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return false;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return false;
  }

  return !/\/api\/v1\/operator\/generated-projects\//i.test(normalized);
}

function resolveHonestPreviewUrl(
  envelope: OperatorEnvelope | null,
  previewLevel: 'no_preview' | OperatorV4PreviewLevel,
) {
  if (previewLevel === 'no_preview' || previewLevel === 'draft_preview') {
    return null;
  }

  const candidate = envelope?.previewSummary.previewUrl
    ?? envelope?.workspaceArtifactLedger.previewTarget.url
    ?? envelope?.previewUrl
    ?? null;

  return isHonestPreviewUrl(candidate) ? candidate : null;
}

export function OperatorV4Page() {
  const { capsuleId: routeCapsuleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, text } = useSite();
  const { isAuthenticated } = useAuth();
  const zh = locale.toLowerCase().startsWith('zh');
  const queryCapsuleId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('capsule');
    const normalized = raw?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }, [location.search]);
  const queryChatId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('chat');
    const normalized = raw?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }, [location.search]);
  const selectedWorkspaceId = resolveSelectedWorkspaceId(routeCapsuleId, queryCapsuleId);
  const workspaceKey = selectedWorkspaceId ?? lobbyThreadKey;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(true);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [workspaceChats, setWorkspaceChats] = useState<Record<string, WorkspaceChatState>>(() => createInitialWorkspaceChats());
  const [runLiveByConversation, setRunLiveByConversation] = useState<Record<string, RunLiveState>>({});
  const [projectFilter, setProjectFilter] = useState<OperatorV4ProjectFilter>('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [workspaceMutationBusy, setWorkspaceMutationBusy] = useState(false);
  const [assistantCapabilities, setAssistantCapabilities] = useState<AssistantCapabilitiesResponse['data'] | null>(null);
  const [assistantProviderStatus, setAssistantProviderStatus] = useState<AssistantProviderStatusResponse['data'] | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const { data: workspacesResponse, error: workspacesError, loading: workspacesLoading } = useApiData<OperatorCapsuleListResponse>(
    `/api/v1/operator/workspaces?refresh=${refreshTick}`,
    { preserveData: true },
  );
  const workspaces = useMemo(
    () => sortWorkspacesByRecent(Array.isArray(workspacesResponse?.data) ? workspacesResponse.data : []),
    [workspacesResponse?.data],
  );
  const { data: workspaceResponse, error: workspaceError, loading: workspaceLoading } = useApiData<OperatorResponse>(
    selectedWorkspaceId ? `/api/v1/operator/workspaces/${selectedWorkspaceId}?refresh=${refreshTick}` : null,
    { preserveData: true },
  );
  const envelope = useMemo(() => normalizeOperatorEnvelope(workspaceResponse?.data ?? null), [workspaceResponse?.data]);
  const workspaceChatState = getWorkspaceChatState(workspaceChats, workspaceKey);
  const activeConversation = getActiveConversation(workspaceChatState);
  const runLiveKey = `${workspaceKey}:${activeConversation.id}`;
  const activeRunLive = useMemo(
    () => runLiveByConversation[runLiveKey] ?? createRunLiveState(),
    [runLiveByConversation, runLiveKey],
  );
  const conversationTask = useMemo(() => {
    if (!envelope || !activeConversation.sessionId) {
      return null;
    }

    return envelope.workflow.tasks.find((task) => task.thread.sessionId === activeConversation.sessionId) ?? null;
  }, [activeConversation.sessionId, envelope]);
  const fallbackWorkflowTask = useMemo(
    () => selectActiveWorkflowTask(envelope),
    [envelope],
  );
  const activeWorkflowTask = useMemo(() => {
    if (conversationTask) {
      return conversationTask;
    }
    if (!activeConversation.sessionId) {
      return fallbackWorkflowTask;
    }
    return null;
  }, [activeConversation.sessionId, conversationTask, fallbackWorkflowTask]);
  const conversationEnvelope = useMemo(() => {
    if (!envelope || !activeWorkflowTask) {
      return envelope;
    }

    return {
      ...envelope,
      workflow: {
        ...envelope.workflow,
        activeTaskId: activeWorkflowTask.id,
      },
    } satisfies OperatorEnvelope;
  }, [activeWorkflowTask, envelope]);
  const repairSuggestion = useMemo(
    () => resolveRepairSuggestion({
      envelope: conversationEnvelope,
      task: activeWorkflowTask,
      locale,
    }),
    [activeWorkflowTask, conversationEnvelope, locale],
  );
  const conversationEntries = useMemo(
    () => mergeConversationEntries(
      selectedWorkspaceId,
      activeWorkflowTask,
      activeConversation,
      activeRunLive.entries,
      locale,
      repairSuggestion,
    ),
    [activeConversation, activeRunLive.entries, activeWorkflowTask, locale, repairSuggestion, selectedWorkspaceId],
  );
  const viewModel = useMemo(
    () => buildOperatorV4ViewModel({
      envelope: conversationEnvelope,
      workspaces,
      selectedWorkspaceId,
      locale,
      filter: projectFilter,
      search: projectSearch,
    }),
    [conversationEnvelope, locale, projectFilter, projectSearch, selectedWorkspaceId, workspaces],
  );
  const lobbyChatRailItems = useMemo(
    () => buildLobbyChatRailItems({
      chatState: getWorkspaceChatState(workspaceChats, lobbyThreadKey),
      activeConversationId: activeConversation.id,
      selectedWorkspaceId,
      locale,
      filter: projectFilter,
      search: projectSearch,
    }),
    [activeConversation.id, locale, projectFilter, projectSearch, selectedWorkspaceId, workspaceChats],
  );
  const railItems = useMemo(
    () => [...lobbyChatRailItems, ...viewModel.railItems],
    [lobbyChatRailItems, viewModel.railItems],
  );

  const workspaceTitle = decodeWorkspaceTitle(
    envelope?.capsule.name
      ? resolveWorkspaceDisplayName(envelope.capsule, locale)
      : selectedWorkspaceId
        ?? (zh ? '新的工作台' : 'New workspace'),
  );
  const workspaceStatusLabel = envelope
    ? resolveProjectStatusLabel(envelope.capsule, locale)
    : (zh ? '等待开始' : 'Ready to start');
  const assistantError = activeConversation.assistantError
    ?? (workspaceError && selectedWorkspaceId && !envelope
      ? `${text.common.error}: ${toFriendlyError(new Error(workspaceError), locale)}`
      : null);
  const canContinueCurrentTask = Boolean(selectedWorkspaceId && activeWorkflowTask);
  const localDevelopmentHost = typeof window !== 'undefined'
    && ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  const liveProviderAvailable = assistantProviderStatus?.canRun === true;
  const providerReason = assistantProviderStatus?.reason?.trim() || null;
  const runLimitedReason = assistantProviderStatus == null
    ? (zh ? '正在检查 AI 连接，新的 Run 暂时不可用。' : 'Checking the AI connection. New Run requests are temporarily unavailable.')
    : liveProviderAvailable
      ? null
      : (zh
          ? `AI 当前未连接，新的 Run 已受限。你仍然可以 Ask、查看历史，或继续当前任务。${providerReason ? `\n${providerReason}` : ''}`
          : `AI is currently offline, so new Run requests are limited. You can still Ask, inspect history, or continue the current task.${providerReason ? `\n${providerReason}` : ''}`);
  const cleanupWorkspaceCandidates = useMemo(
    () => workspaces.filter((workspace) => isDisposableWorkspaceCandidate(workspace)),
    [workspaces],
  );
  const selectableModels = useMemo(
    () => assistantCapabilities?.models?.length
      ? assistantCapabilities.models
      : (assistantCapabilities?.selectableModels ?? []),
    [assistantCapabilities],
  );
  const selectedModelOption = useMemo(
    () => selectableModels.find((entry) => entry.id === selectedModelId) ?? null,
    [selectableModels, selectedModelId],
  );
  const activeModelLabel = selectedModelOption?.label
    ?? assistantProviderStatus?.activeModel
    ?? assistantCapabilities?.defaultModelId
    ?? null;
  const sendDisabledReason = activeConversation.busy
    ? null
    : activeConversation.mode === 'run' && runLimitedReason
      ? runLimitedReason
      : (!activeConversation.composer.trim()
        && activeConversation.attachments.length === 0
        && !hasProjectDraftInput(activeConversation.projectDraft))
        ? (zh ? '请输入消息或上传文件后再发送。' : 'Enter a message or upload files before sending.')
        : null;
  const continueDisabledReason = canContinueCurrentTask
    ? null
    : (zh ? '当前没有可继续的任务。' : 'There is no current task to continue.');
  const mockModeHint = localDevelopmentHost && activeConversation.lastSource === 'mock'
    ? (zh
      ? '开发模式提示：当前回复来自显式 source=mock，仅用于本地验收。'
      : 'Development mode: current reply came from explicit source=mock for local verification only.')
    : null;
  const runModeHint = activeConversation.mode === 'run'
    ? (runLimitedReason ?? mockModeHint)
    : activeConversation.mode === 'auto' && runLimitedReason
      ? (zh ? 'Auto 模式会在识别为 Run 时受此限制。' : 'In Auto mode this limit applies when the request is routed as Run.')
      : mockModeHint;
  const previewUrl = resolveHonestPreviewUrl(
    conversationEnvelope,
    viewModel.artifactStage.preview.level,
  );
  const runFeedbackStep = resolveRunStepLabel({
    envelope: conversationEnvelope,
    activeTask: activeWorkflowTask,
    locale,
  });
  const hasUserMessage = conversationEntries.some((entry) => entry.role === 'user');
  const chatFirstConversation = useMemo(
    () => buildChatFirstConversationView(conversationEntries, selectedWorkspaceId),
    [conversationEntries, selectedWorkspaceId],
  );
  const hasRepairCard = conversationEntries.some((entry) => Boolean(entry.taskUpdate?.repair));
  const shouldShowQuietStart = !hasUserMessage && !hasRepairCard;
  const renderedConversationEntries = shouldShowQuietStart ? [] : chatFirstConversation.visibleEntries;
  const quietStartStatusText = shouldShowQuietStart && activeWorkflowTask
    ? (zh
        ? `正在继续上次任务：${activeWorkflowTask.title || '继续任务'} / 当前步骤：${runFeedbackStep}`
        : `Continuing previous task: ${activeWorkflowTask.title || 'Continue task'} / Current step: ${runFeedbackStep}`)
    : null;

  function setWorkspaceChatState(
    key: string,
    updater: (current: WorkspaceChatState) => WorkspaceChatState,
  ) {
    setWorkspaceChats((current) => {
      const existing = getWorkspaceChatState(current, key);
      const next = updater(existing);
      if (next === existing) {
        return current;
      }
      return {
        ...current,
        [key]: next,
      };
    });
  }

  function setActiveConversationState(updater: (current: ConversationState) => ConversationState) {
    setWorkspaceChatState(workspaceKey, (current) => {
      const activeId = current.activeConversationId;
      const active = current.conversations[activeId] ?? createConversationState({
        id: activeId,
        surface: workspaceKey === lobbyThreadKey ? 'lobby' : 'workspace',
      });
      const nextConversation = updater(active);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          [nextConversation.id]: nextConversation,
        },
        activeConversationId: nextConversation.id,
        conversationOrder: current.conversationOrder.includes(nextConversation.id)
          ? current.conversationOrder
          : [...current.conversationOrder, nextConversation.id],
      };
    });
  }

  function setRunLiveState(
    key: string,
    updater: (current: RunLiveState) => RunLiveState,
  ) {
    setRunLiveByConversation((current) => {
      const existing = current[key] ?? createRunLiveState();
      const next = updater(existing);
      if (next === existing) {
        return current;
      }
      return {
        ...current,
        [key]: next,
      };
    });
  }

  function appendRunLiveEntry(
    key: string,
    content: string,
    createdAt = new Date().toISOString(),
  ) {
    setRunLiveState(key, (current) => ({
      ...current,
      entries: [
        ...current.entries,
        createTaskUpdateEntry({
          step: zh ? '执行更新' : 'Execution update',
          summary: content,
          nextAction: zh ? '查看细节并重试' : 'View details and retry',
          createdAt,
          running: false,
          stuck: true,
          heartbeatAt: createdAt,
          status: 'failed',
        }),
      ],
    }));
  }

  function moveActiveConversationToWorkspace(targetWorkspaceId: string) {
    const targetKey = targetWorkspaceId;
    if (targetKey === workspaceKey) {
      return;
    }

    setWorkspaceChats((current) => {
      const sourceState = getWorkspaceChatState(current, workspaceKey);
      const sourceConversation = getActiveConversation(sourceState);
      const targetState = getWorkspaceChatState(current, targetKey);
      const nextTarget = {
        ...targetState,
        activeConversationId: sourceConversation.id,
        conversationOrder: targetState.conversationOrder.includes(sourceConversation.id)
          ? targetState.conversationOrder
          : [...targetState.conversationOrder, sourceConversation.id],
        conversations: {
          ...targetState.conversations,
          [sourceConversation.id]: sourceConversation,
        },
      };

      return {
        ...current,
        [targetKey]: nextTarget,
      };
    });
  }

  function selectWorkspace(id: string) {
    try {
      window.localStorage.setItem(recentWorkspaceStorageKey, id);
    } catch {
      // Ignore storage failures.
    }
    navigate(`/operator-lab/${id}`);
  }

  function selectLobbyConversation(conversationId: string) {
    setWorkspaceChatState(lobbyThreadKey, (current) => {
      if (!current.conversations[conversationId]) {
        return current;
      }
      return {
        ...current,
        activeConversationId: conversationId,
      };
    });
    navigate(`/operator-lab?chat=${encodeURIComponent(conversationId)}`);
  }

  function handleRailItemSelect(id: string) {
    if (isLobbyChatRailId(id)) {
      selectLobbyConversation(lobbyConversationIdFromRailId(id));
      return;
    }
    selectWorkspace(id);
  }

  function syncWorkspaceFromActionResult(actionResult: AssistantActionResultPayload | null) {
    const capsuleId = extractCapsuleIdFromPath(actionResultLinks(actionResult).capsulePath);
    if (capsuleId) {
      moveActiveConversationToWorkspace(capsuleId);
      selectWorkspace(capsuleId);
    }
  }

  useEffect(() => {
    const target = resolveLegacyCapsuleRedirect(routeCapsuleId, queryCapsuleId);
    if (target) {
      navigate(target, { replace: true });
    }
  }, [navigate, queryCapsuleId, routeCapsuleId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    try {
      window.localStorage.setItem(recentWorkspaceStorageKey, selectedWorkspaceId);
    } catch {
      // Ignore storage failures.
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspaceId || !queryChatId) {
      return;
    }

    setWorkspaceChatState(lobbyThreadKey, (current) => {
      if (!current.conversations[queryChatId] || current.activeConversationId === queryChatId) {
        return current;
      }
      return {
        ...current,
        activeConversationId: queryChatId,
      };
    });
  }, [queryChatId, selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      return;
    }
    setProjectFilter((current) => (current === 'all' ? current : 'all'));
    setProjectSearch((current) => (current.length === 0 ? current : ''));
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const lobbyState = workspaceChats[lobbyThreadKey];
    if (!lobbyState) {
      return;
    }

    writeStoredLobbyConversations(serializeLobbyConversations(lobbyState, locale));
  }, [locale, workspaceChats]);

  useEffect(() => {
    setComposerExpanded(false);
  }, [workspaceKey, activeConversation.id]);

  useEffect(() => {
    if (!selectedWorkspaceId || !envelope) {
      return;
    }

    const taskSessionIds = envelope.workflow.tasks
      .map((task) => task.thread.sessionId)
      .filter((value): value is string => Boolean(value));
    // Keep the user on the current conversation timeline.
    // We still index workflow task sessions for history lookup, but avoid
    // auto-switching the active conversation during live execution updates.
    const preferredConversationId = activeConversation.id;

    setWorkspaceChatState(workspaceKey, (current) => {
      let changed = false;
      const conversations = { ...current.conversations };
      const conversationOrder = [...current.conversationOrder];

      for (const sessionId of taskSessionIds) {
        if (!conversations[sessionId]) {
          conversations[sessionId] = createConversationState({
            id: sessionId,
            surface: 'workspace',
            sessionId,
            forceNewTurn: false,
          });
          conversationOrder.push(sessionId);
          changed = true;
        } else if (!conversations[sessionId].sessionId) {
          conversations[sessionId] = {
            ...conversations[sessionId],
            sessionId,
            forceNewTurn: false,
          };
          changed = true;
        }
      }

      const nextActiveConversationId = conversations[preferredConversationId]
        ? preferredConversationId
        : current.activeConversationId;
      if (nextActiveConversationId !== current.activeConversationId) {
        changed = true;
      }

      if (!changed) {
        return current;
      }

      return {
        ...current,
        conversations,
        conversationOrder,
        activeConversationId: nextActiveConversationId,
      };
    });
  }, [
    activeConversation.forceNewTurn,
    activeConversation.id,
    activeWorkflowTask?.id,
    conversationTask,
    envelope,
    selectedWorkspaceId,
    workspaceKey,
  ]);

  useEffect(() => {
    const shouldPoll = Boolean(
      envelope
      && (
        envelope.latestJob?.status === 'running'
        || envelope.latestJob?.status === 'queued'
        || ['parsing', 'preflight', 'llm_planning', 'queued', 'running', 'verifying'].includes(activeWorkflowTask?.currentStage ?? '')
      ),
    );
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, runProgressPollIntervalMs);

    return () => window.clearInterval(timer);
  }, [activeWorkflowTask?.currentStage, envelope, envelope?.latestJob?.status]);

  useEffect(() => {
    const task = activeWorkflowTask;
    const nowIso = new Date().toISOString();
    if (!task) {
      setRunLiveState(runLiveKey, (current) => {
        if (!current.running && !current.stuck && !current.currentStep && !current.lastHeartbeatAt) {
          return current;
        }
        return {
          ...current,
          running: false,
          stuck: false,
          currentStep: null,
          lastHeartbeatAt: null,
          lastProgressKey: null,
          lastSignalAt: null,
          lastPreviewUrl: null,
          lastTerminalState: null,
          trackingCancelled: false,
        };
      });
      return;
    }

    const running = isOperatorRunningStage(task.currentStage);
    const stepLabel = resolveRunStepLabel({
      envelope: conversationEnvelope,
      activeTask: task,
      locale,
    });
    const lastCard = task.timeline.at(-1);
    const progressKey = [
      task.currentStage,
      lastCard?.id ?? '-',
      lastCard?.createdAt ?? '-',
      conversationEnvelope?.previewSummary.evidence.runtimeLiveAt ?? '-',
      conversationEnvelope?.previewSummary.evidence.healthPassedAt ?? '-',
      conversationEnvelope?.previewSummary.evidence.smokePassedAt ?? '-',
      conversationEnvelope?.previewSummary.previewUrl ?? '-',
    ].join('|');
    const terminalState = resolveOperatorTerminalState({
      envelope: conversationEnvelope,
      activeTask: task,
      previewLevel: viewModel.artifactStage.preview.level,
    });
    const previewCard = previewUrl
      ? {
        url: previewUrl,
        statusLabel: viewModel.artifactStage.preview.label,
        healthLabel: conversationEnvelope?.previewSummary.evidence.healthPassedAt
          ? (zh ? 'health 已通过。' : 'Health check passed.')
          : (zh ? 'health 还未通过。' : 'Health check not passed yet.'),
        verified: viewModel.artifactStage.preview.level === 'verified_preview',
      }
      : null;
    const progressSummary = lastCard?.summary
      ?? (zh ? `正在执行：${stepLabel}` : `In progress: ${stepLabel}`);
    const nextActionLabel = viewModel.currentStepCard.mainAction?.label
      ?? (zh ? '继续当前任务' : 'Continue current task');
    const previewBlockedReason = previewCard ? null : resolveNoPreviewReason({
      envelope: conversationEnvelope,
      activeTask: task,
      locale,
    });
    const repairSuggestion = resolveRepairSuggestion({
      envelope: conversationEnvelope,
      task,
      locale,
    });

    setRunLiveState(runLiveKey, (current) => {
      if (current.trackingCancelled) {
        return {
          ...current,
          running: false,
          currentStep: stepLabel,
          lastHeartbeatAt: nowIso,
        };
      }

      const changed = current.lastProgressKey !== progressKey;
      let entries = current.entries;
      if (changed) {
        entries = [
          ...entries,
          createTaskUpdateEntry({
            step: stepLabel,
            summary: progressSummary,
            nextAction: nextActionLabel,
            createdAt: nowIso,
            running,
            stuck: false,
            heartbeatAt: nowIso,
            noPreviewReason: previewBlockedReason,
          }),
        ];
      }

      const lastSignalAt = changed ? nowIso : (current.lastSignalAt ?? nowIso);
      const stuck = running && (Date.now() - Date.parse(lastSignalAt) > runStuckThresholdMs);
      if (previewCard && current.lastPreviewUrl !== previewCard.url) {
        entries = [
          ...entries,
          createTaskUpdateEntry({
            step: zh ? '启动预览' : 'Starting preview',
            summary: zh ? '预览已可用，主舞台已接入真实预览证据。' : 'Preview is available and real preview evidence is now attached to the timeline.',
            nextAction: previewCard.verified
              ? (zh ? '继续发布或交付' : 'Continue to publish or handoff')
              : (zh ? '继续验证预览' : 'Continue preview verification'),
            createdAt: nowIso,
            running,
            stuck: false,
            heartbeatAt: nowIso,
            preview: previewCard,
          }),
        ];
      }
      if (stuck && !current.stuck) {
        entries = [
          ...entries,
          createTaskUpdateEntry({
            step: stepLabel,
            summary: zh
              ? '任务可能卡住了。你可以查看细节、重试，或取消本地跟踪。'
              : 'The task may be stuck. You can view details, retry, or cancel local tracking.',
            nextAction: zh ? '查看细节 / 重试 / 取消' : 'View details / Retry / Cancel',
            createdAt: nowIso,
            running,
            stuck: true,
            heartbeatAt: nowIso,
            noPreviewReason: previewBlockedReason,
            status: 'failed',
          }),
        ];
      }

      if (!running && !current.running && terminalState === 'blocked' && repairSuggestion) {
        const hasRepairEntry = entries.some((entry) => Boolean(entry.taskUpdate?.repair));
        if (!hasRepairEntry) {
          entries = [
            ...entries,
            createTaskUpdateEntry({
              step: zh ? '修复并继续执行' : 'Repair and continue',
              summary: zh ? '运行信息不完整，我先给你推荐一个修复方案。' : 'Runtime metadata is incomplete. I have prepared a repair suggestion.',
              nextAction: zh ? '使用推荐方案并继续' : 'Apply the recommendation and continue',
              createdAt: nowIso,
              running: false,
              stuck: false,
              heartbeatAt: nowIso,
              noPreviewReason: previewBlockedReason,
              repair: repairSuggestion,
              status: 'done',
            }),
          ];
        }
      }

      if (!running && current.running && terminalState && current.lastTerminalState !== terminalState) {
        if (terminalState === 'blocked' && repairSuggestion) {
          entries = [
            ...entries,
            createTaskUpdateEntry({
              step: zh ? '修复并继续执行' : 'Repair and continue',
              summary: zh ? '运行信息不完整，我先给你推荐一个修复方案。' : 'Runtime metadata is incomplete. I have prepared a repair suggestion.',
              nextAction: zh ? '使用推荐方案并继续' : 'Apply the recommendation and continue',
              createdAt: nowIso,
              running: false,
              stuck: false,
              heartbeatAt: nowIso,
              noPreviewReason: previewBlockedReason,
              repair: repairSuggestion,
              status: 'done',
            }),
          ];
          return {
            ...current,
            entries,
            lastProgressKey: progressKey,
            lastSignalAt,
            lastHeartbeatAt: nowIso,
            lastPreviewUrl: previewCard?.url ?? current.lastPreviewUrl,
            lastTerminalState: terminalState,
            currentStep: zh ? '修复并继续执行' : 'Repair and continue',
            running: false,
            stuck: false,
          };
        }

        const terminalText = locale.toLowerCase().startsWith('zh')
          ? terminalState === 'published'
            ? '已发布：正式环境已经上线。'
            : terminalState === 'verified_preview'
              ? '已验证预览：真实运行与证据校验都已通过。'
              : terminalState === 'preview_ready'
                ? '预览已就绪：可直接打开预览。'
                : terminalState === 'blocked'
                  ? '执行已阻塞：请按主按钮补充信息后重试。'
                  : '执行失败：请查看失败原因并重试。'
          : terminalState === 'published'
            ? 'Published: production is live.'
            : terminalState === 'verified_preview'
              ? 'Verified preview: runtime and evidence checks have passed.'
              : terminalState === 'preview_ready'
                ? 'Preview ready: you can open it now.'
            : terminalState === 'blocked'
              ? 'Execution blocked: follow the primary action and retry.'
              : 'Execution failed: inspect the reason and retry.';
        entries = [
          ...entries,
          createTaskUpdateEntry({
            step: stepLabel,
            summary: terminalText,
            nextAction: viewModel.currentStepCard.mainAction?.label
              ?? (previewCard
                ? (zh ? '打开预览' : 'Open preview')
                : (zh ? '继续当前任务' : 'Continue current task')),
            createdAt: nowIso,
            running: false,
            stuck: terminalState === 'blocked' || terminalState === 'failed',
            heartbeatAt: nowIso,
            noPreviewReason: previewBlockedReason,
            preview: previewCard,
            status: terminalState === 'failed' || terminalState === 'blocked' ? 'failed' : 'done',
          }),
        ];
      }

      return {
        ...current,
        entries,
        lastProgressKey: progressKey,
        lastSignalAt,
        lastHeartbeatAt: nowIso,
        lastPreviewUrl: previewCard?.url ?? current.lastPreviewUrl,
        lastTerminalState: terminalState ?? current.lastTerminalState,
        currentStep: stepLabel,
        running,
        stuck,
      };
    });
  }, [
    activeWorkflowTask,
    conversationEnvelope,
    locale,
    previewUrl,
    runLiveKey,
    viewModel.artifactStage.preview.level,
    viewModel.artifactStage.preview.label,
    viewModel.currentStepCard.mainAction?.label,
  ]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function loadAssistantProviderStatus() {
      try {
        const response = await requestJson<AssistantProviderStatusResponse>(`/api/v1/assistant/provider-status?locale=${encodeURIComponent(locale)}`, {
          timeoutMs: 3500,
        });
        if (cancelled) {
          return;
        }
        setAssistantProviderStatus(response.data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const fallbackReason = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
        setAssistantProviderStatus(buildFallbackProviderStatus(locale, fallbackReason));
      }
    }

    void loadAssistantProviderStatus();
    timer = window.setInterval(() => {
      void loadAssistantProviderStatus();
    }, 12000);
    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssistantCapabilities() {
      try {
        const response = await requestJson<AssistantCapabilitiesResponse>(`/api/v1/assistant/capabilities?locale=${encodeURIComponent(locale)}`, {
          timeoutMs: 3500,
        });
        if (cancelled) {
          return;
        }
        setAssistantCapabilities(response.data);
      } catch {
        if (cancelled) {
          return;
        }
      }
    }

    void loadAssistantCapabilities();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (activeConversation.sessionId) {
      return;
    }

    let cancelled = false;
    async function openSession() {
      try {
        const response = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
          method: 'POST',
          body: {
            locale,
            context: {
              path: selectedWorkspaceId ? `/operator-lab/${selectedWorkspaceId}` : '/operator-lab',
              locale,
              capsuleId: selectedWorkspaceId,
            },
          },
        });
        if (cancelled) {
          return;
        }
        setAssistantCapabilities(response.data.capabilities);
        setActiveConversationState((current) => {
          if (current.sessionId && current.sessionId !== response.data.session.sessionId) {
            return {
              ...current,
              assistantError: null,
            };
          }

          const hasLocalConversation = current.messages.length > 0 || current.optimisticEntries.length > 0;
          return {
            ...current,
            sessionId: current.sessionId ?? response.data.session.sessionId,
            messages: hasLocalConversation
              ? current.messages
              : dedupeMessagesBySignature(response.data.session.messages ?? []),
            assistantError: null,
          };
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setActiveConversationState((current) => ({
          ...current,
          assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
        }));
      }
    }

    void openSession();
    return () => {
      cancelled = true;
    };
  }, [activeConversation.id, activeConversation.sessionId, locale, selectedWorkspaceId, workspaceKey]);

  useEffect(() => {
    if (selectableModels.length === 0) {
      setSelectedModelId(null);
      writeStoredOperatorModelSelection(null);
      return;
    }

    setSelectedModelId((current) => {
      if (current && selectableModels.some((entry) => entry.id === current)) {
        return current;
      }

      const stored = readStoredOperatorModelSelection();
      if (stored && selectableModels.some((entry) => entry.id === stored)) {
        return stored;
      }

      return null;
    });
  }, [selectableModels]);

  useEffect(() => {
    writeStoredOperatorModelSelection(selectedModelId);
  }, [selectedModelId]);

  async function ensureSession() {
    if (activeConversation.sessionId) {
      return activeConversation.sessionId;
    }

    const response = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
      method: 'POST',
      body: {
        locale,
        context: {
          path: selectedWorkspaceId ? `/operator-lab/${selectedWorkspaceId}` : '/operator-lab',
          locale,
          capsuleId: selectedWorkspaceId,
        },
      },
    });

    const sessionId = response.data.session.sessionId;
    setAssistantCapabilities(response.data.capabilities);
    setActiveConversationState((current) => {
      const hasLocalConversation = current.messages.length > 0 || current.optimisticEntries.length > 0;
      return {
        ...current,
        sessionId,
        messages: hasLocalConversation
          ? current.messages
          : dedupeMessagesBySignature(response.data.session.messages ?? []),
        assistantError: null,
      };
    });
    return sessionId;
  }

  async function sendAssistantMessage(
    message: string,
    options?: {
      requestedAction?: AssistantActionProposal['action'];
      retrySnapshot?: RetrySnapshot;
      forceMode?: 'ask' | 'run';
    },
  ) {
    const resolvedMode = options?.forceMode
      ?? options?.retrySnapshot?.mode
      ?? resolveEffectiveComposerMode(activeConversation.mode, message, Boolean(selectedWorkspaceId));
    if (resolvedMode === 'run' && runLimitedReason) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: runLimitedReason,
      }));
      return;
    }

    const sessionId = await ensureSession();
    const outgoingAttachments = options?.retrySnapshot?.attachments ?? activeConversation.attachments;
    const retrySnapshot = options?.retrySnapshot ?? {
      message,
      attachments: outgoingAttachments,
      requestedAction: options?.requestedAction,
      mode: resolvedMode,
    };
    const optimisticAck = buildImmediateAck({
      mode: resolvedMode,
      message,
      locale,
      hasArtifact: Boolean(viewModel.v3ViewModel.artifact),
    });
    const createdAt = new Date().toISOString();
    const optimisticEntries: OperatorV4ConversationEntry[] = [
      {
        id: `optimistic-user-${createdAt}`,
        role: 'user',
        content: message,
        createdAt,
        status: 'sending',
      },
      {
        id: `optimistic-system-${createdAt}`,
        role: 'assistant',
        content: optimisticAck,
        createdAt,
        status: 'sending',
      },
    ];
    if (resolvedMode === 'run') {
      setRunLiveState(runLiveKey, (current) => ({
        ...current,
        entries: [
          ...current.entries,
          createTaskUpdateEntry({
            step: zh ? '检查仓库' : 'Checking repository',
            summary: zh ? '已接收任务，正在检查仓库。' : 'Task received. Checking repository now.',
            nextAction: zh ? '等待下一步进度' : 'Wait for next progress update',
            createdAt,
            running: true,
            stuck: false,
            heartbeatAt: createdAt,
            noPreviewReason: zh ? '预览还没准备好，正在构建。' : 'Preview is not ready yet. Building in progress.',
          }),
        ],
        currentStep: zh ? '检查仓库' : 'Checking repository',
        lastHeartbeatAt: createdAt,
        lastSignalAt: createdAt,
        lastProgressKey: 'run-ack',
        running: true,
        stuck: false,
        trackingCancelled: false,
        lastPreviewUrl: null,
        lastTerminalState: null,
      }));
    }

    setActiveConversationState((current) => ({
      ...current,
      busy: true,
      runState: resolvedMode === 'run' ? 'parsing' : 'draft',
      lastSource: 'system',
      assistantError: null,
      attachmentError: null,
      composer: '',
      attachments: [],
      retrySnapshot,
      optimisticEntries,
    }));

    try {
      const response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
        method: 'POST',
        body: {
          sessionId,
          message,
          selectedModelId: selectedModelId ?? undefined,
          locale,
          mode: resolvedMode,
          planningMode: resolvedMode === 'ask' ? 'on' : 'off',
          taskMode: activeConversation.forceNewTurn ? 'new_turn' : 'continue',
          autoRoute: selectedModelId == null,
          context: {
            path: selectedWorkspaceId ? `/operator-lab/${selectedWorkspaceId}` : '/operator-lab',
            locale,
            capsuleId: selectedWorkspaceId,
          },
          attachments: outgoingAttachments,
          requestedAction: options?.requestedAction,
        },
      });

      setActiveConversationState((current) => {
        return {
          ...current,
          messages: resolveMessagesAfterAssistantResponse(current, response, message),
          sessionId: response.data.session.sessionId,
          proposals: dedupeProposalsById(response.data.proposals ?? []),
          pendingConfirmation: response.data.pendingConfirmation ?? null,
          actionResult: response.data.actionResult ?? null,
          runState: response.data.runState ?? (resolvedMode === 'run' ? 'running' : 'draft'),
          lastSource: response.data.source ?? 'system',
          lastRouting: response.data.routing ?? null,
          assistantError: null,
          busy: false,
          optimisticEntries: [],
          retrySnapshot: null,
          forceNewTurn: false,
          advancedOptionsOpen: current.surface === 'lobby' ? false : current.advancedOptionsOpen,
          projectDraft: current.surface === 'lobby' ? createDefaultNewProjectDraft() : current.projectDraft,
        };
      });

      if (response.data.workspace?.capsuleId) {
        moveActiveConversationToWorkspace(response.data.workspace.capsuleId);
        selectWorkspace(response.data.workspace.capsuleId);
      } else {
        syncWorkspaceFromActionResult(response.data.actionResult ?? null);
        if (!selectedWorkspaceId) {
          navigate(`/operator-lab?chat=${encodeURIComponent(activeConversation.id)}`, { replace: true });
        }
      }
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const friendly = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        lastSource: 'system',
        assistantError: friendly,
        composer: retrySnapshot.message,
        attachments: retrySnapshot.attachments,
        optimisticEntries: [
          {
            ...optimisticEntries[0],
            status: 'done',
          },
          {
            ...optimisticEntries[1],
            content: `${optimisticAck}\n\n${friendly}`,
            status: 'failed',
            retryable: true,
          },
        ],
        retrySnapshot: {
          ...retrySnapshot,
          mode: resolvedMode,
        },
      }));
      if (resolvedMode === 'run') {
        appendRunLiveEntry(runLiveKey, friendly);
      }
    }
  }

  async function queueWorkspaceAction(
    path: string,
    body: Record<string, unknown>,
    fallbackBusyState: AssistantRunState,
  ) {
    if (!envelope?.capsule.id) {
      return;
    }

    const ack = buildOperatorV3OptimisticAck({
      message: body.operation === 'deploy_playable' ? 'deploy playable' : 'continue current task',
      locale,
      hasArtifact: true,
    });
    setActiveConversationState((current) => ({
      ...current,
      busy: true,
      runState: fallbackBusyState,
      assistantError: null,
      optimisticEntries: [
        {
          id: `workspace-action-${Date.now()}`,
          role: 'assistant',
          content: ack,
          createdAt: new Date().toISOString(),
          status: 'sending',
        },
      ],
    }));

    try {
      await requestJson<OperatorResponse>(path, {
        method: 'POST',
        body,
      });
      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        optimisticEntries: [],
      }));
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 401 && !isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        assistantError: toFriendlyError(apiError, locale),
        optimisticEntries: current.optimisticEntries.map((entry) => ({
          ...entry,
          status: 'failed',
        })),
      }));
    }
  }

  async function handleContinueCurrentTask(operation: 'continue' | 'deploy_playable' = 'continue') {
    if (!envelope?.capsule.id || !activeWorkflowTask) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: zh ? '当前没有可继续的活跃任务。' : 'There is no active task to continue right now.',
      }));
      return;
    }

    await queueWorkspaceAction(
      `/api/v1/operator/workspaces/${envelope.capsule.id}/continue`,
      {
        taskId: activeWorkflowTask.id,
        pendingConfirmationId: activeWorkflowTask.pendingConfirmation?.token ?? undefined,
        operation,
      },
      operation === 'deploy_playable' ? 'queued' : activeWorkflowTask.currentStage === 'awaiting_confirmation' ? 'queued' : activeConversation.runState,
    );
  }

  async function continueFromRepairFlow(input: {
    entry: OperatorV4ConversationEntry;
    mode: 'recommended' | 're_detect' | 'manual';
    manual?: {
      startCommand: string;
      port: number | null;
      healthcheckPath: string;
      dockerServiceName: string;
    };
  }) {
    if (!envelope?.capsule.id || !activeWorkflowTask) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: zh ? '当前没有可继续的活跃任务。' : 'There is no active task to continue right now.',
      }));
      return;
    }

    const recommended = input.entry.taskUpdate?.repair?.recommended ?? null;
    setComposerExpanded(false);
    const startCommand = input.mode === 'manual'
      ? input.manual?.startCommand?.trim() || null
      : recommended?.startCommand ?? null;
    const port = input.mode === 'manual'
      ? (typeof input.manual?.port === 'number' && Number.isFinite(input.manual.port) ? input.manual.port : null)
      : recommended?.port ?? null;
    const healthcheckPath = input.mode === 'manual'
      ? input.manual?.healthcheckPath?.trim() || null
      : recommended?.healthcheckPath ?? null;
    const dockerServiceName = input.mode === 'manual'
      ? input.manual?.dockerServiceName?.trim() || null
      : recommended?.dockerServiceName ?? null;
    const createdAt = new Date().toISOString();
    const summary = input.mode === 're_detect'
      ? (zh ? '已开始重新自动检测运行 recipe，正在继续执行。' : 'Re-detecting runtime recipe now and continuing execution.')
      : (zh ? '已接收修复信息，正在继续执行。' : 'Repair metadata received. Continuing execution now.');

    setRunLiveState(runLiveKey, (current) => ({
      ...current,
      entries: [
        ...current.entries,
        createTaskUpdateEntry({
          step: zh ? '修复并继续执行' : 'Repair and continue',
          summary,
          nextAction: zh ? '等待下一步进度更新' : 'Wait for the next progress update',
          createdAt,
          running: true,
          stuck: false,
          heartbeatAt: createdAt,
          noPreviewReason: zh ? '预览还没准备好，正在构建。' : 'Preview is not ready yet. Building in progress.',
        }),
      ],
      running: true,
      stuck: false,
      currentStep: zh ? '修复并继续执行' : 'Repair and continue',
      lastHeartbeatAt: createdAt,
      lastSignalAt: createdAt,
      lastProgressKey: `repair-${input.mode}-${createdAt}`,
      trackingCancelled: false,
      lastTerminalState: null,
    }));

    setActiveConversationState((current) => ({
      ...current,
      busy: true,
      runState: 'queued',
      assistantError: null,
    }));

    try {
      await requestJson<OperatorResponse>(`/api/v1/operator/workspaces/${envelope.capsule.id}/continue`, {
        method: 'POST',
        body: {
          taskId: activeWorkflowTask.id,
          pendingConfirmationId: activeWorkflowTask.pendingConfirmation?.token ?? undefined,
          operation: 'continue',
          userIntent: buildRepairUserIntent({
            locale,
            mode: input.mode,
            startCommand,
            port,
            healthcheckPath,
            dockerServiceName,
          }),
          repair: {
            mode: input.mode,
            startCommand,
            port,
            healthcheckPath,
            dockerServiceName,
          },
        },
      });

      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        runState: 'running',
      }));
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const friendly = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        assistantError: friendly,
      }));
      appendRunLiveEntry(runLiveKey, friendly);
    }
  }

  async function handleSubmitMessage() {
    if (sendDisabledReason) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: sendDisabledReason,
      }));
      return;
    }

    const normalizedComposer = activeConversation.composer.trim();
    const hasDraftInput = activeConversation.surface === 'lobby' && hasProjectDraftInput(activeConversation.projectDraft);
    const draftMessage = hasDraftInput
      ? buildLobbyProjectMessage({
        locale,
        composer: normalizedComposer,
        draft: activeConversation.projectDraft,
      })
      : '';
    const rawMessage = draftMessage || normalizedComposer;
    if (!rawMessage && activeConversation.attachments.length === 0) {
      return;
    }

    const repoPreflight = preflightRepoInput(rawMessage);
    if (repoPreflight.invalidRepoUrl || (repoPreflight.hasRepoHostUrl && !repoPreflight.repoUrl)) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: zh
          ? '仓库地址看起来不合法。请只粘贴纯仓库 URL，例如 https://github.com/org/repo。'
          : 'The repository link looks invalid. Please provide a clean repository URL such as https://github.com/org/repo.',
      }));
      return;
    }

    const messageForAssistant = repoPreflight.repoUrl
      ? (repoPreflight.taskDescription
        ? `${repoPreflight.taskDescription}\n\n${repoPreflight.repoUrl}`
        : repoPreflight.repoUrl)
      : rawMessage;
    const normalizedMessage = messageForAssistant || (zh ? '请读取我上传的项目文件并进入规划。' : 'Read the uploaded project files and enter planning mode.');
    const effectiveMode = resolveEffectiveComposerMode(
      activeConversation.mode,
      normalizedMessage,
      Boolean(selectedWorkspaceId),
    );
    if (effectiveMode === 'run' && runLimitedReason) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: runLimitedReason,
      }));
      return;
    }

    setComposerExpanded(false);
    await sendAssistantMessage(normalizedMessage);
  }

  async function handleRetrySend() {
    if (!activeConversation.retrySnapshot) {
      return;
    }

    await sendAssistantMessage(activeConversation.retrySnapshot.message, {
      requestedAction: activeConversation.retrySnapshot.requestedAction,
      retrySnapshot: activeConversation.retrySnapshot,
    });
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    if (activeConversation.attachments.length + files.length > maxAttachmentCount) {
      setActiveConversationState((current) => ({
        ...current,
        attachmentError: zh ? `最多上传 ${maxAttachmentCount} 个文件。` : `You can upload up to ${maxAttachmentCount} files.`,
      }));
      return;
    }

    try {
      const parsed = await Promise.all(files.map(async (file, index) => {
        if (!isLikelyTextAttachment(file)) {
          throw new Error(zh ? '目前只支持上传文本项目文件，例如 Dockerfile、compose、package.json、配置文件或源码。' : 'Only text project files are supported right now, such as Dockerfile, compose files, package.json, config files, or source code.');
        }
        if (file.size > maxTextAttachmentBytes) {
          throw new Error(zh ? `${file.name} 过大，请控制在 ${Math.round(maxTextAttachmentBytes / 1024)}KB 以内。` : `${file.name} is too large. Keep it under ${Math.round(maxTextAttachmentBytes / 1024)}KB.`);
        }

        const textContent = await readFileAsText(file);
        return {
          id: `${file.name}-${file.lastModified}-${index}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          textContent,
        } satisfies OperatorV4ComposerAttachment;
      }));

      setActiveConversationState((current) => ({
        ...current,
        attachments: [...current.attachments, ...parsed],
        attachmentError: null,
      }));
    } catch (error) {
      setActiveConversationState((current) => ({
        ...current,
        attachmentError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    }
  }

  function handleNewConversation() {
    if (!selectedWorkspaceId) {
      handleOpenNewProjectConversation();
      return;
    }

    setComposerExpanded(true);
    setWorkspaceChatState(workspaceKey, (current) => {
      const conversation = createConversationState({
        surface: selectedWorkspaceId ? 'workspace' : 'lobby',
        mode: 'auto',
        forceNewTurn: true,
        advancedOptionsOpen: false,
        projectDraft: createDefaultNewProjectDraft(),
      });
      return {
        activeConversationId: conversation.id,
        conversationOrder: [...current.conversationOrder, conversation.id],
        conversations: {
          ...current.conversations,
          [conversation.id]: conversation,
        },
      };
    });
  }

  function handleOpenNewProjectConversation() {
    const conversation = createConversationState({
      surface: 'lobby',
      mode: 'auto',
      forceNewTurn: true,
      advancedOptionsOpen: false,
      projectDraft: createDefaultNewProjectDraft(),
    });
    setWorkspaceChatState(lobbyThreadKey, (current) => ({
      activeConversationId: conversation.id,
      conversationOrder: [...current.conversationOrder, conversation.id],
      conversations: {
        ...current.conversations,
        [conversation.id]: conversation,
      },
    }));
    setComposerExpanded(true);
    navigate(`/operator-lab?chat=${encodeURIComponent(conversation.id)}`);
  }

  async function refreshWorkspaceList() {
    setRefreshTick((current) => current + 1);
  }

  async function handleProposalSelect(entry: OperatorV4ConversationEntry, proposalId: string) {
    const proposal = activeConversation.proposals.find((item) => item.id === proposalId)
      ?? entry.choiceCard?.proposals?.find((item) => item.id === proposalId)
      ?? null;
    if (!proposal) {
      return;
    }

    setActiveConversationState((current) => ({
      ...current,
      proposals: current.proposals.filter((item) => item.id !== proposalId),
      pendingConfirmation: null,
      assistantError: null,
    }));
    await sendAssistantMessage(proposal.title, {
      requestedAction: proposal.action,
      forceMode: 'run',
    });
  }

  async function handlePendingConfirmationConfirm(_entry: OperatorV4ConversationEntry) {
    const token = activeConversation.pendingConfirmation?.token ?? null;
    if (!activeConversation.sessionId || !token) {
      return;
    }

    const createdAt = new Date().toISOString();
    setActiveConversationState((current) => ({
      ...current,
      busy: true,
      assistantError: null,
      optimisticEntries: [
        {
          id: `confirm-${createdAt}`,
          role: 'assistant',
          kind: 'assistant',
          content: zh ? '已确认，我继续执行。' : 'Confirmed. Continuing execution.',
          createdAt,
          status: 'sending',
        },
      ],
    }));
    try {
      const response = await requestJson<AssistantConfirmResponse>('/api/v1/assistant/actions/confirm', {
        method: 'POST',
        body: {
          sessionId: activeConversation.sessionId,
          confirmToken: token,
          locale,
        },
      });
      setActiveConversationState((current) => ({
        ...current,
        sessionId: response.data.session.sessionId,
        messages: dedupeMessagesById(response.data.session.messages ?? []),
        proposals: [],
        pendingConfirmation: null,
        actionResult: response.data.actionResult ?? null,
        runState: response.data.runState ?? 'queued',
        lastSource: response.data.source ?? 'system',
        lastRouting: response.data.routing ?? null,
        assistantError: null,
        busy: false,
        optimisticEntries: [],
      }));
      if (response.data.workspace?.capsuleId) {
        moveActiveConversationToWorkspace(response.data.workspace.capsuleId);
        selectWorkspace(response.data.workspace.capsuleId);
      } else {
        syncWorkspaceFromActionResult(response.data.actionResult ?? null);
      }
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const friendly = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
      setActiveConversationState((current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        assistantError: friendly,
        optimisticEntries: current.optimisticEntries.map((message) => ({
          ...message,
          content: `${message.content}\n\n${friendly}`,
          status: 'failed',
          retryable: false,
        })),
      }));
    }
  }

  function handlePendingConfirmationDismiss() {
    setActiveConversationState((current) => ({
      ...current,
      pendingConfirmation: null,
      assistantError: null,
    }));
  }

  async function handleRenameWorkspace(workspaceId: string) {
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    const initialValue = workspace ? resolveWorkspaceDisplayName(workspace, locale) : '';
    const nextName = window.prompt(zh ? '输入新的项目名' : 'Enter a new project name', initialValue)?.trim();
    if (!nextName) {
      return;
    }

    setWorkspaceMutationBusy(true);
    try {
      await requestJson<OperatorResponse>(`/api/v1/operator/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: {
          name: nextName,
        },
      });
      await refreshWorkspaceList();
    } catch (error) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    } finally {
      setWorkspaceMutationBusy(false);
    }
  }

  async function handleToggleArchiveWorkspace(workspaceId: string, archived: boolean) {
    setWorkspaceMutationBusy(true);
    try {
      await requestJson<OperatorResponse>(`/api/v1/operator/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: {
          archived: !archived,
        },
      });
      if (selectedWorkspaceId === workspaceId && !archived) {
        navigate('/operator-lab');
      }
      await refreshWorkspaceList();
    } catch (error) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    } finally {
      setWorkspaceMutationBusy(false);
    }
  }

  function handleDeleteLobbyConversation(railId: string) {
    const conversationId = lobbyConversationIdFromRailId(railId);
    setWorkspaceChatState(lobbyThreadKey, (current) => {
      if (!current.conversations[conversationId]) {
        return current;
      }

      const conversations = { ...current.conversations };
      delete conversations[conversationId];
      const conversationOrder = current.conversationOrder.filter((entry) => entry !== conversationId);
      if (conversationOrder.length === 0) {
        const fresh = createConversationState({
          surface: 'lobby',
          mode: 'auto',
          forceNewTurn: true,
        });
        return createWorkspaceChatState(fresh, 'lobby');
      }

      return {
        activeConversationId: current.activeConversationId === conversationId
          ? conversationOrder[0]!
          : current.activeConversationId,
        conversationOrder,
        conversations,
      };
    });

    if (!selectedWorkspaceId && activeConversation.id === conversationId) {
      navigate('/operator-lab');
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    if (isLobbyChatRailId(workspaceId)) {
      handleDeleteLobbyConversation(workspaceId);
      return;
    }

    setWorkspaceMutationBusy(true);
    try {
      await requestJson<{ data: { deleted: boolean } }>(`/api/v1/operator/workspaces/${workspaceId}`, {
        method: 'DELETE',
      });
      if (selectedWorkspaceId === workspaceId) {
        navigate('/operator-lab');
      }
      await refreshWorkspaceList();
    } catch (error) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    } finally {
      setWorkspaceMutationBusy(false);
    }
  }

  async function handleCleanupDisposableWorkspaces() {
    if (cleanupWorkspaceCandidates.length === 0) {
      return;
    }

    const previewNames = cleanupWorkspaceCandidates
      .slice(0, 4)
      .map((workspace) => resolveWorkspaceDisplayName(workspace, locale))
      .join('、');
    const confirmed = window.confirm(
      zh
        ? `确认清理最近的测试项目吗？${previewNames ? `\n\n例如：${previewNames}` : ''}`
        : `Clean the recent test projects?${previewNames ? `\n\nExamples: ${previewNames}` : ''}`,
    );
    if (!confirmed) {
      return;
    }

    setWorkspaceMutationBusy(true);
    try {
      for (const workspace of cleanupWorkspaceCandidates) {
        await requestJson<{ data: { deleted: boolean } }>(`/api/v1/operator/workspaces/${workspace.id}`, {
          method: 'DELETE',
        });
      }

      if (selectedWorkspaceId && cleanupWorkspaceCandidates.some((workspace) => workspace.id === selectedWorkspaceId)) {
        navigate('/operator-lab');
      }
      await refreshWorkspaceList();
    } catch (error) {
      setActiveConversationState((current) => ({
        ...current,
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    } finally {
      setWorkspaceMutationBusy(false);
    }
  }

  const loading = workspacesLoading || (workspaceLoading && Boolean(selectedWorkspaceId) && !envelope);
  if (loading && workspaces.length === 0 && conversationEntries.length === 0) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (workspacesError && workspaces.length === 0) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(workspacesError), locale)}</div>;
  }

  const showTrueEmptyState = !selectedWorkspaceId
    && workspaces.filter((workspace) => !workspace.archivedAt).length === 0
    && lobbyChatRailItems.length === 0;
  const emptyConversationLabel = showTrueEmptyState
    ? (zh ? '从一句话开始，我会在同一条会话流里持续推进项目。' : 'Start with one prompt, and the workspace will keep progressing in one conversation timeline.')
    : (zh ? '输入你的下一步目标，我会继续当前项目。' : 'Tell me the next goal and I will continue the current project.');

  return (
    <>
      <OperatorV4Shell
        railCollapsed={railCollapsed}
        drawer={(
          <DetailsDrawer
            activeTask={activeWorkflowTask}
            drawer={viewModel.v3ViewModel.drawer}
            envelope={conversationEnvelope}
            locale={locale}
            onToggle={() => setDrawerOpen((current) => !current)}
            open={drawerOpen}
            routing={activeConversation.lastRouting}
          />
        )}
        rail={(
          <ProjectRail
            busy={activeConversation.busy || workspaceMutationBusy}
            collapsed={railCollapsed}
            cleanupCount={cleanupWorkspaceCandidates.length}
            filter={projectFilter}
            items={railItems}
            lobby={!selectedWorkspaceId}
            locale={locale}
            onCleanupDisposableWorkspaces={() => void handleCleanupDisposableWorkspaces()}
            onDeleteWorkspace={(workspaceId) => void handleDeleteWorkspace(workspaceId)}
            onFilterChange={setProjectFilter}
            onOpenNewProject={handleOpenNewProjectConversation}
            onRenameWorkspace={(workspaceId) => void handleRenameWorkspace(workspaceId)}
            onSearchChange={setProjectSearch}
            onSelectWorkspace={handleRailItemSelect}
            onToggleCollapse={() => setRailCollapsed((current) => !current)}
            onToggleArchiveWorkspace={(workspaceId, archived) => void handleToggleArchiveWorkspace(workspaceId, archived)}
            search={projectSearch}
          />
        )}
        stage={(
          <div className="operator-v4-stage">
            <WorkspaceHeader
              activityText={quietStartStatusText}
              locale={locale}
              notice={null}
              onToggleDetails={() => setDrawerOpen((current) => !current)}
              statusLabel={workspaceStatusLabel}
              summary={viewModel.workspaceSummary}
              title={showTrueEmptyState ? (zh ? '欢迎来到 Operator v4' : 'Welcome to Operator v4') : workspaceTitle}
            />

            <ConversationList
              emptyLabel={emptyConversationLabel}
              dockExpanded={composerExpanded}
              dock={(
                <ComposerDock
                  activeModelLabel={activeModelLabel}
                  assistantError={assistantError}
                  attachmentError={activeConversation.attachmentError}
                  attachments={activeConversation.attachments}
                  busy={activeConversation.busy}
                  canContinueCurrentTask={canContinueCurrentTask}
                  composer={activeConversation.composer}
                  continueDisabledReason={continueDisabledReason}
                  expanded={composerExpanded}
                  fileInputRef={fileInputRef}
                  locale={locale}
                  mode={activeConversation.mode}
                  surface={activeConversation.surface}
                  advancedOptionsOpen={activeConversation.advancedOptionsOpen}
                  modelOptions={selectableModels.map((option) => ({
                    id: option.id,
                    label: option.label,
                    provider: option.provider,
                  }))}
                  onAttachmentChange={(event) => void handleAttachmentChange(event)}
                  onAttachmentRemove={(attachmentId) => setActiveConversationState((current) => ({
                    ...current,
                    attachments: current.attachments.filter((entry) => entry.id !== attachmentId),
                  }))}
                  onCollapse={() => setComposerExpanded(false)}
                  onComposerChange={(value) => setActiveConversationState((current) => ({
                    ...current,
                    composer: value,
                  }))}
                  onContinueCurrentTask={() => void handleContinueCurrentTask('continue')}
                  onExpand={() => setComposerExpanded(true)}
                  onModeChange={(mode) => setActiveConversationState((current) => ({
                    ...current,
                    mode,
                  }))}
                  onModelChange={setSelectedModelId}
                  onNewConversation={handleNewConversation}
                  onAdvancedOptionsToggle={() => setActiveConversationState((current) => ({
                    ...current,
                    advancedOptionsOpen: !current.advancedOptionsOpen,
                  }))}
                  onProjectDraftChange={(patch) => setActiveConversationState((current) => ({
                    ...current,
                    projectDraft: {
                      ...current.projectDraft,
                      ...patch,
                    },
                  }))}
                  onSubmit={() => void handleSubmitMessage()}
                  projectDraft={activeConversation.projectDraft}
                  runModeHint={runModeHint}
                  selectedModelId={selectedModelId}
                  sendDisabledReason={sendDisabledReason}
                />
              )}
              entries={renderedConversationEntries}
              historySummary={shouldShowQuietStart ? null : chatFirstConversation.historySummary}
              locale={locale}
              onConversationScroll={(scrollTop) => {
                if (scrollTop > 24 && composerExpanded) {
                  setComposerExpanded(false);
                }
              }}
              onRepairRedetect={(entry) => void continueFromRepairFlow({
                entry,
                mode: 're_detect',
              })}
              onRepairSubmitManual={(entry, payload) => void continueFromRepairFlow({
                entry,
                mode: 'manual',
                manual: payload,
              })}
              onRepairUseRecommended={(entry) => void continueFromRepairFlow({
                entry,
                mode: 'recommended',
              })}
              onPendingConfirmationConfirm={(entry) => void handlePendingConfirmationConfirm(entry)}
              onPendingConfirmationDismiss={(_entry) => handlePendingConfirmationDismiss()}
              onProposalSelect={(entry, proposalId) => void handleProposalSelect(entry, proposalId)}
              onRetry={() => void handleRetrySend()}
            />
          </div>
        )}
      />
    </>
  );
}
