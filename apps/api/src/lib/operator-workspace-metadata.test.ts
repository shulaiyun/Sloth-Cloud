import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createOperatorEngine } from './operator.js';

function createTestEngine() {
  const root = mkdtempSync(join(tmpdir(), 'sloth-workspace-metadata-'));
  return createOperatorEngine({
    stateFilePath: join(root, 'state.json'),
    generatedProjectsRoot: join(root, 'generated-projects'),
    previewBaseUrl: 'http://preview.local',
    artifactBaseUrl: 'http://artifact.local',
    executionProviders: [],
  });
}

describe('operator workspace metadata', () => {
  it('renames, archives, and restores a workspace without removing it from the list', () => {
    const engine = createTestEngine();
    const created = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'Original Workspace',
      brief: 'Build a launch-ready app',
      planningMode: 'on',
    });

    const renamed = engine.updateWorkspace({
      capsuleId: created.capsule.id,
      name: 'Renamed Workspace',
      archived: true,
    });

    expect(renamed?.capsule.name).toBe('Renamed Workspace');
    expect(renamed?.capsule.archivedAt).toBeTruthy();
    expect(renamed?.capsule.lastActiveAt).toBeTruthy();
    expect(engine.listWorkspaces()).toHaveLength(1);
    expect(engine.listWorkspaces()[0]?.archivedAt).toBeTruthy();

    const restored = engine.updateWorkspace({
      capsuleId: created.capsule.id,
      archived: false,
    });

    expect(restored?.capsule.archivedAt).toBeNull();
    expect(engine.getCapsule(created.capsule.id)?.capsule.name).toBe('Renamed Workspace');
  });
});
