import { describe, expect, it } from 'vitest';

import { normalizeOperatorEnvelope, type OperatorResponse } from './operator-types';
import {
  resolveNoPreviewReason,
  resolveOperatorTerminalState,
  resolveRunStepLabel,
} from './operator-v4-runtime';
import { classifyPreviewState } from './operator-v4-view-model';

const timestamp = '2026-04-22T08:00:00.000Z';

function makeEnvelope(overrides: Record<string, unknown> = {}) {
  const response = {
    message: 'ok',
    meta: {
      generatedAt: timestamp,
      sourceMode: 'live',
    },
    data: {
      capsule: {
        id: 'capsule_1',
        name: 'Preview workspace',
        slug: 'preview-workspace',
        entryKind: 'upload-project',
        status: 'planning',
        headline: 'Preview workspace',
        summary: 'summary',
        stackLabel: 'Vite',
        healthScore: 80,
        previewUrl: null,
        productionUrl: null,
        source: {
          repoUrl: 'https://github.com/acme/repo',
          idea: null,
          serverHost: null,
        },
        connector: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        lastActiveAt: timestamp,
        recentEvents: [],
        truthState: 'planning',
        latestJob: null,
        workflowStage: 'running',
      },
      workflow: {
        planningMode: 'off',
        activeTaskId: 'task_default',
        tasks: [{
          id: 'task_default',
          title: 'default task',
          planningMode: 'off',
          thread: {
            sessionId: null,
            messages: [],
            lastUpdatedAt: timestamp,
          },
          draft: '',
          userIntent: '',
          parsedInput: {
            kind: 'repo',
            rawInput: '',
            repoUrl: null,
            notes: null,
            idea: null,
            serverHost: null,
            planningMode: 'off',
            confidence: 0.2,
          },
          currentStage: 'running',
          timeline: [],
          evidence: [],
          diagnostics: [],
          artifacts: [],
          deployReadiness: {
            sshStatus: null,
            envStatus: null,
            ready: false,
            summary: 'running',
          },
          publishHistory: [],
          failure: null,
          pendingConfirmation: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
      },
      ...overrides,
    },
  } as unknown as OperatorResponse;

  return normalizeOperatorEnvelope(response.data)!;
}

describe('operator-v4 runtime helpers', () => {
  it('keeps terminal states in the allowed set', () => {
    const blocked = makeEnvelope({
      workflow: {
        planningMode: 'off',
        activeTaskId: 'task_1',
        tasks: [{
          id: 'task_1',
          title: 'blocked',
          planningMode: 'off',
          thread: { sessionId: null, messages: [], lastUpdatedAt: timestamp },
          draft: '',
          userIntent: '',
          parsedInput: { kind: 'repo', rawInput: '', repoUrl: null, notes: null, idea: null, serverHost: null, planningMode: 'off', confidence: 0.2 },
          currentStage: 'blocked',
          timeline: [],
          evidence: [],
          diagnostics: [],
          artifacts: [],
          deployReadiness: { sshStatus: null, envStatus: null, ready: false, summary: 'blocked' },
          publishHistory: [],
          failure: null,
          pendingConfirmation: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
      },
    });
    const blockedTask = blocked.workflow.tasks[0]!;

    const states = new Set([
      resolveOperatorTerminalState({
        envelope: blocked,
        activeTask: blockedTask,
        previewLevel: 'draft_preview',
      }),
      resolveOperatorTerminalState({
        envelope: makeEnvelope({
          previewSummary: {
            status: 'preview_live',
            headline: 'live',
            detail: null,
            previewUrl: 'http://127.0.0.1:4173',
            verified: false,
            lastError: null,
            evidence: {
              runtimeLiveAt: timestamp,
              healthPassedAt: null,
              smokePassedAt: null,
              screenshotPath: null,
            },
          },
        }),
        activeTask: null,
        previewLevel: 'live_preview',
      }),
      resolveOperatorTerminalState({
        envelope: makeEnvelope({
          previewSummary: {
            status: 'preview_ready',
            headline: 'verified',
            detail: null,
            previewUrl: 'http://127.0.0.1:4173',
            verified: true,
            lastError: null,
            evidence: {
              runtimeLiveAt: timestamp,
              healthPassedAt: timestamp,
              smokePassedAt: timestamp,
              screenshotPath: '/tmp/screenshot.png',
            },
          },
        }),
        activeTask: null,
        previewLevel: 'verified_preview',
      }),
      resolveOperatorTerminalState({
        envelope: makeEnvelope({
          truthState: 'production_live',
          productionUrl: 'https://example.com',
        }),
        activeTask: null,
        previewLevel: 'verified_preview',
      }),
    ]);

    const allowed = new Set([
      'preview_ready',
      'verified_preview',
      'blocked',
      'failed',
      'published',
      null,
    ]);
    for (const state of states) {
      expect(allowed.has(state as string | null)).toBe(true);
    }
  });

  it('maps run stages to user-facing progress labels', () => {
    const envelope = makeEnvelope();
    const task = {
      ...envelope.workflow.tasks[0]!,
      currentStage: 'preflight' as const,
    };
    expect(resolveRunStepLabel({ envelope, activeTask: task, locale: 'zh-CN' })).toBe('识别技术栈');
  });

  it('returns explicit no-preview reasons', () => {
    const blocked = makeEnvelope();
    const task = {
      ...blocked.workflow.tasks[0]!,
      currentStage: 'blocked' as const,
      failure: {
        failureCode: 'package_manager_unknown' as const,
        humanSummary: 'blocked',
        probableRootCause: 'blocked',
        recommendedActions: [],
        evidence: [],
        detectedAt: timestamp,
        stage: 'blocked' as const,
      },
    };

    expect(resolveNoPreviewReason({
      envelope: blocked,
      activeTask: task,
      locale: 'zh-CN',
    })).toBe('缺少入口');
  });

  it('classifies preview tiers from envelope evidence', () => {
    const preview = classifyPreviewState(makeEnvelope({
      previewSummary: {
        status: 'preview_live',
        headline: 'live',
        detail: null,
        previewUrl: 'http://127.0.0.1:4173',
        verified: false,
        lastError: null,
        evidence: {
          runtimeLiveAt: timestamp,
          healthPassedAt: null,
          smokePassedAt: null,
          screenshotPath: null,
        },
      },
    }), 'zh-CN');

    expect(preview.level).toBe('live_preview');
  });
});
