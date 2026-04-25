import { describe, expect, it } from 'vitest';

import {
  decodeWorkspaceTitle,
  dedupeMessagesById,
  dedupeProposalsById,
  getWorkflowCardStableId,
  mergeActionCards,
  resolveActiveTaskTruth,
  resolveLegacyCapsuleRedirect,
  resolveWorkflowCardKindLabel,
  resolveSelectedWorkspaceId,
  resolveThreadKey,
  selectActiveWorkflowTask,
  shouldShowLobbyPanels,
} from './operator-workbench-state';
import type { OperatorEnvelope } from './operator-types';

describe('operator-workbench-state helpers', () => {
  it('switches workspace-specific thread keys so thread/draft/result can stay isolated', () => {
    const workspaceAKey = resolveThreadKey('capsule_a');
    const workspaceBKey = resolveThreadKey('capsule_b');
    const lobbyKey = resolveThreadKey(null);

    expect(workspaceAKey).toBe('capsule_a');
    expect(workspaceBKey).toBe('capsule_b');
    expect(lobbyKey).toBe('__lobby__');
    expect(workspaceAKey).not.toBe(workspaceBKey);
  });

  it('hides lobby-only cards after selecting a workspace', () => {
    expect(shouldShowLobbyPanels(null)).toBe(true);
    expect(shouldShowLobbyPanels('capsule_01')).toBe(false);
  });

  it('dedupes message/proposal/system-card ids to prevent rerender duplicates', () => {
    const messages = dedupeMessagesById([
      { id: 'm1', role: 'user', content: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'm1', role: 'user', content: 'a duplicate', createdAt: '2026-01-01T00:00:01.000Z' },
      { id: 'm2', role: 'assistant', content: 'b', createdAt: '2026-01-01T00:00:02.000Z' },
    ]);
    expect(messages.map((item) => item.id)).toEqual(['m1', 'm2']);

    const proposals = dedupeProposalsById([
      {
        id: 'p1',
        title: 'First',
        description: 'desc',
        risk: 'low',
        requiresConfirmation: false,
        action: { kind: 'create-repo-workspace', serviceId: null, invoiceId: null },
      },
      {
        id: 'p1',
        title: 'First duplicate',
        description: 'desc',
        risk: 'low',
        requiresConfirmation: false,
        action: { kind: 'create-repo-workspace', serviceId: null, invoiceId: null },
      },
    ]);
    expect(proposals).toHaveLength(1);

    const cards = mergeActionCards(
      [{ id: 'result:r1', source: 'system' }],
      [{ id: 'result:r1', source: 'system' }, { id: 'proposal:p1', source: 'llm' }],
    );
    expect(cards.map((item) => item.id)).toEqual(['result:r1', 'proposal:p1']);
  });

  it('keeps workspace identity stable during legacy route redirect', () => {
    const selectedFromLegacy = resolveSelectedWorkspaceId(null, 'capsule_abc');
    const redirect = resolveLegacyCapsuleRedirect(null, 'capsule_abc');
    const selectedAfterRedirect = resolveSelectedWorkspaceId('capsule_abc', null);

    expect(selectedFromLegacy).toBe('capsule_abc');
    expect(redirect).toBe('/operator-lab/capsule_abc');
    expect(selectedAfterRedirect).toBe(selectedFromLegacy);
    expect(resolveThreadKey(selectedAfterRedirect)).toBe(resolveThreadKey(selectedFromLegacy));
  });

  it('decodes percent-encoded workspace titles for display', () => {
    expect(decodeWorkspaceTitle('%E6%A0%91%E6%87%92%E4%BA%91')).toBe('树懒云');
    const looseDecoded = decodeWorkspaceTitle('test2.git%E7%BB%99%E6%88%91%E9%83%A8%E7%BD');
    expect(looseDecoded.startsWith('test2.git')).toBe(true);
    expect(looseDecoded.includes('%')).toBe(false);
    expect(decodeWorkspaceTitle('repo%')).toBe('repo%');
  });

  it('selects active task truth for the right panel from workflow state', () => {
    const envelope = {
      workflow: {
        planningMode: 'off' as const,
        activeTaskId: 'task_active',
        tasks: [
          {
            id: 'task_old',
            title: 'Old',
            planningMode: 'off' as const,
            thread: { sessionId: null, messages: [], lastUpdatedAt: null },
            draft: '',
            userIntent: '',
            parsedInput: {
              kind: 'repo' as const,
              rawInput: '',
              repoUrl: null,
              notes: null,
              idea: null,
              serverHost: null,
              planningMode: 'off' as const,
              confidence: null,
            },
            currentStage: 'draft' as const,
            timeline: [],
            evidence: [],
            diagnostics: [],
            artifacts: [],
            deployReadiness: { sshStatus: null, envStatus: null, ready: false, summary: '' },
            publishHistory: [],
            failure: null,
            pendingConfirmation: null,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'task_active',
            title: 'Active',
            planningMode: 'off' as const,
            thread: { sessionId: null, messages: [], lastUpdatedAt: null },
            draft: '',
            userIntent: '',
            parsedInput: {
              kind: 'repo' as const,
              rawInput: '',
              repoUrl: null,
              notes: null,
              idea: null,
              serverHost: null,
              planningMode: 'off' as const,
              confidence: null,
            },
            currentStage: 'running' as const,
            timeline: [],
            evidence: [],
            diagnostics: [],
            artifacts: [{ id: 'artifact_1', label: 'Preview', detail: 'preview://capsule', url: null }],
            deployReadiness: { sshStatus: null, envStatus: null, ready: false, summary: '' },
            publishHistory: [],
            failure: {
              failureCode: 'preview_failed' as const,
              humanSummary: 'Preview failed',
              probableRootCause: 'Build output missing',
              recommendedActions: ['retry preview', 'check build logs'],
              evidence: [],
              detectedAt: '',
              stage: 'failed' as const,
            },
            pendingConfirmation: null,
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
      latestJob: {
        id: 'job_1',
        kind: 'deploy_preview' as const,
        title: 'Deploy preview',
        status: 'running' as const,
        progress: 60,
        summary: '',
        updatedAt: '',
        completedAt: null,
        error: null,
      },
      artifactSummary: {
        sourceType: 'repository' as const,
        sourceRef: 'https://example.com/repo',
        archiveUrl: null,
        manifestUrl: null,
        entryFile: 'src/main.tsx',
        runCommands: [],
        fileCount: 0,
        installCommand: null,
        buildCommand: null,
      },
    } as unknown as OperatorEnvelope;

    expect(selectActiveWorkflowTask(envelope)?.id).toBe('task_active');
    expect(resolveActiveTaskTruth(envelope)).toEqual({
      currentStage: 'running',
      runState: 'running',
      activeTaskId: 'task_active',
      latestArtifact: 'preview://capsule',
      failureCode: 'preview_failed',
      summary: 'Preview failed',
      actions: ['retry preview', 'check build logs'],
      humanSummary: 'Preview failed',
      probableRootCause: 'Build output missing',
      recommendedActions: ['retry preview', 'check build logs'],
    });
  });

  it('maps workflow card kinds to the visible timeline vocabulary', () => {
    expect(resolveWorkflowCardKindLabel('execution')).toBe('executor');
    expect(resolveWorkflowCardKindLabel('verification')).toBe('verifying');
    expect(resolveWorkflowCardKindLabel('failure_diagnosis')).toBe('diagnosis');
    expect(resolveWorkflowCardKindLabel('next_step')).toBe('next step');
  });

  it('uses workflow card ids as stable timeline ids', () => {
    expect(getWorkflowCardStableId({ id: 'workflow-card-123' })).toBe('workflow-card-123');
    expect(getWorkflowCardStableId({ id: '  workflow-card-456  ' })).toBe('workflow-card-456');
  });
});
