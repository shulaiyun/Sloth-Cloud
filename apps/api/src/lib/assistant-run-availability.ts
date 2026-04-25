export interface AssistantRunAvailabilityInput {
  locale: string;
  canRun: boolean;
  reason: string;
  allowDevelopmentMock: boolean;
}

export interface AssistantRunAvailability {
  runAllowed: boolean;
  source: 'system' | 'mock';
  runState: 'blocked';
  replyText: string;
  detail: string;
  code: 'ASSISTANT_LIVE_PROVIDER_REQUIRED' | 'ASSISTANT_RUN_LIMITED_MOCK';
}

function isZh(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

export function resolveAssistantRunAvailability(
  input: AssistantRunAvailabilityInput,
): AssistantRunAvailability | null {
  if (input.canRun) {
    return null;
  }

  const zh = isZh(input.locale);
  if (input.allowDevelopmentMock) {
    return {
      runAllowed: false,
      source: 'mock',
      runState: 'blocked',
      code: 'ASSISTANT_RUN_LIMITED_MOCK',
      replyText: zh
        ? '当前 live provider 未连接，Run 已进入开发受限模式。你仍然可以查看历史、解释已有结果，或继续当前任务；新的执行不会再静默回退成 mock。'
        : 'The live provider is unavailable, so Run has entered a development-only limited mode. You can still inspect history, explain existing results, or continue the current task, but new execution will not silently fall back to mock.',
      detail: zh
        ? `当前 AI 未连接，新的 Run 已被限制。开发环境下会明确标记为 source=mock，且不会再假装完成真实执行。${input.reason ? ` 探针原因：${input.reason}` : ''}`
        : `AI is currently offline, so new Run requests are limited. In development, the UI must mark this as source=mock and must not pretend that real execution completed.${input.reason ? ` Probe reason: ${input.reason}` : ''}`,
    };
  }

  return {
    runAllowed: false,
    source: 'system',
    runState: 'blocked',
    code: 'ASSISTANT_LIVE_PROVIDER_REQUIRED',
    replyText: zh
      ? '当前 AI 未连接，Run 已被禁用。你仍然可以查看历史、解释已有结果，或继续当前任务。'
      : 'AI is currently offline, so Run is disabled. You can still inspect history, explain existing results, or continue the current task.',
      detail: zh
        ? `当前 live provider 不可用，新的 Run 不能继续。请先恢复 AI 连接，或改用 Ask 查看历史和分析已有结果。${input.reason ? ` 探针原因：${input.reason}` : ''}`
        : `The live provider is unavailable, so new Run requests cannot continue. Restore the AI connection first, or switch to Ask to inspect history and analyze existing results.${input.reason ? ` Probe reason: ${input.reason}` : ''}`,
  };
}
