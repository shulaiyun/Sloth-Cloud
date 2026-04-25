export interface ResolveAssistantDevelopmentMockAllowanceInput {
  nodeEnv: string | null | undefined;
  explicitFlag: boolean;
}

export function resolveAssistantDevelopmentMockAllowance(
  input: ResolveAssistantDevelopmentMockAllowanceInput,
) {
  const normalizedEnv = String(input.nodeEnv ?? '').trim().toLowerCase();
  if (!input.explicitFlag) {
    return false;
  }

  return normalizedEnv !== 'production';
}
