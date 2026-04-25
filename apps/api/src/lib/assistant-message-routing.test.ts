import { describe, expect, it } from 'vitest';

import { classifyAssistantMessageRoute } from './assistant-message-routing.js';

describe('classifyAssistantMessageRoute', () => {
  it('routes deploy requests with repo URLs into repo_import_deploy', () => {
    const decision = classifyAssistantMessageRoute({
      message: '把这个仓库部署出来：https://github.com/acme/repo',
      locale: 'zh-CN',
      askMode: false,
      hasActiveWorkspace: true,
    });

    expect(decision).toMatchObject({
      route: 'repo_import_deploy',
      lane: 'repository',
      source: 'repository',
      operation: 'deploy',
    });
  });

  it('never routes repo deploy into the generated-project lane', () => {
    const decision = classifyAssistantMessageRoute({
      message: '继续部署 https://github.com/acme/repo 这个仓库',
      locale: 'zh-CN',
      askMode: false,
      hasActiveWorkspace: true,
    });

    expect(decision.route).toBe('repo_import_deploy');
    expect(decision.lane).not.toBe('generated-project');
  });

  it('keeps generated-project lane for idea and start-from-scratch requests only', () => {
    const ideaDecision = classifyAssistantMessageRoute({
      message: '从零开始帮我做一个 landing page',
      locale: 'zh-CN',
      askMode: false,
      hasActiveWorkspace: false,
    });
    expect(ideaDecision).toMatchObject({
      route: 'idea_generate',
      lane: 'generated-project',
      source: 'idea',
    });

    const repoDecision = classifyAssistantMessageRoute({
      message: '从零开始部署这个仓库 https://github.com/acme/repo',
      locale: 'zh-CN',
      askMode: false,
      hasActiveWorkspace: false,
    });
    expect(repoDecision).toMatchObject({
      route: 'repo_import_deploy',
      lane: 'repository',
      source: 'repository',
    });
  });

  it('falls back to workspace continuation only when there is no repo import route', () => {
    const decision = classifyAssistantMessageRoute({
      message: '继续当前任务',
      locale: 'zh-CN',
      askMode: false,
      hasActiveWorkspace: true,
    });

    expect(decision).toMatchObject({
      route: 'workspace_continue',
      lane: 'workspace_continuation',
      source: 'workspace',
      operation: 'continue',
    });
  });
});
