export interface PaymenterAdapter {
  login(input: { email: string; password: string }): Promise<unknown>;
  listCatalog(input?: { locale?: string }): Promise<unknown>;
  createCart(input: Record<string, unknown>): Promise<unknown>;
  listInvoices(input?: { customerId?: string | number }): Promise<unknown>;
  getAccount(input: { accessToken?: string }): Promise<unknown>;
}

export interface ConvoyAdapter {
  getServer(input: { serverId: string }): Promise<unknown>;
  createConsoleSession(input: { serverId: string }): Promise<unknown>;
  powerAction(input: { serverId: string; action: 'start' | 'stop' | 'restart' | 'kill' }): Promise<unknown>;
  reinstall(input: { serverId: string; imageId: string; password?: string }): Promise<unknown>;
  revealPassword(input: { serverId: string }): Promise<unknown>;
}

export interface AssistantProvider {
  getStatus(): Promise<{
    providerConfigured: boolean;
    credentialsPresent: boolean;
    networkReachable: boolean;
    modelReachable: boolean;
    responseMode: 'live' | 'mock' | 'unavailable';
    canRun: boolean;
    reason: string;
  }>;
  sendMessage(input: {
    sessionId: string;
    mode: 'ask' | 'run';
    model?: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  }): Promise<unknown>;
}

export interface OpenClawConnector {
  handleWebhook(input: {
    source: 'webchat' | 'telegram' | 'slack' | 'other';
    conversationId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}
