import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, contentDefinitionsHash } from '@orchard/sim';
import bootstrapManifest from './fixtures/bootstrap-pack-manifest.json';
import {
  createWorldAuthoringModel,
  diffWorldPackManifest,
  parseWorldPack,
  planBoundedPackImport,
  serializeWorldPack,
  worldPackManifest,
} from './model.js';

describe('WorldAuthoringModel', () => {
  it('shares deterministic browser, validation, history, diff, undo, and CAS publish state', async () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const definitions = bootstrapContentDefinitions();
    const model = createWorldAuthoringModel({
      access: 'write',
      head: { packId: 'live', revision: 7n, engineVersion: 1,
        contentHash: contentDefinitionsHash(definitions), definitions },
      history: [{ revision: 7n, parentRevision: 6n, contentHash: contentDefinitionsHash(definitions),
        changeSetJson: '{"upserts":[],"deletes":[]}', inverseChangeSetJson: '{"upserts":[],"deletes":[]}',
        actor: 'owner', occurredAt: '2026-09-03T00:00:00Z', note: 'fixture' }],
      createPublishAdapter: () => ({ publishContentChangeSet, restoreContentRevision: async () => undefined }),
    });
    const crop = model.browser('crop')[0]!;
    expect(crop.referencedBy).toBeGreaterThanOrEqual(0);
    expect(model.browser('balance_group')[0]?.referencedBy).toBeGreaterThanOrEqual(0);
    const definition = model.definition(crop.id)!;
    model.upsert({ ...definition, displayName: 'Edited Crop' });
    expect(model.snapshot()).toMatchObject({ dirty: true, canUndo: true, canPublish: true, baseRevision: 7n });
    expect(model.snapshot().diffs[0]).toMatchObject({ id: crop.id, kind: 'update', changedPaths: ['$.displayName'] });
    model.undo(); expect(model.snapshot().dirty).toBe(false); model.redo();
    const request = await model.publish('world.fixture', 'world table parity');
    expect(request.expectedRevision).toBe(7n);
    expect(JSON.parse(request.upserts)).toHaveLength(1);
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
    expect(model.history()[0]?.note).toBe('fixture');
  });

  it('imports and exports one deterministic, bounded, validated pack', () => {
    const definitions = bootstrapContentDefinitions();
    const json = serializeWorldPack(definitions);
    expect(parseWorldPack(json)).toEqual([...definitions].sort((a, b) => a.id.localeCompare(b.id)));
    const batches = planBoundedPackImport(json, 40);
    expect(batches.every(({ definitions: batch }) => batch.length <= 40)).toBe(true);
    expect(batches.flatMap(({ definitions: batch }) => batch)).toHaveLength(definitions.length);
    expect(() => planBoundedPackImport(json, 101)).toThrow('content_import_batch_size_out_of_range');
    expect(worldPackManifest(definitions)).toEqual(expect.objectContaining({
      schemaVersion: 1, engineVersion: 1, definitionCount: definitions.length,
      contentHash: contentDefinitionsHash(definitions),
    }));
    expect(worldPackManifest(definitions)).toEqual(bootstrapManifest);
    const firstCrop = definitions.find(({ kind }) => kind === 'crop')!;
    expect(diffWorldPackManifest(definitions, bootstrapManifest)).toMatchObject({ matches: true, changedKinds: [] });
    expect(diffWorldPackManifest(definitions.map((definition) => definition.id === firstCrop.id
      ? { ...firstCrop, displayName: 'Fixture Diff' } : definition), bootstrapManifest))
      .toMatchObject({ matches: false, expectedHash: bootstrapManifest.contentHash, changedKinds: [] });
  });

  it('keeps playtests behind an injected live-admin seam and validates definition kinds', async () => {
    const definitions = bootstrapContentDefinitions();
    const offline = createWorldAuthoringModel({ access: 'anonymous' });
    const effect = definitions.find(({ kind }) => kind === 'effect')!;
    const request = { kind: 'apply_effect' as const, definitionId: effect.id, targetPlayer: 'Ari',
      reason: 'Test authored effect', clientMutationId: 'world.test.effect' };
    await expect(offline.playtest(request))
      .rejects.toThrow('world_playtest_live_admin_required');
    const run = vi.fn(async () => undefined);
    const live = createWorldAuthoringModel({ access: 'write', createPlaytestAdapter: () => ({ source: 'mock', run }) });
    await live.playtest(request); expect(run).toHaveBeenCalledWith(request);
    await expect(live.playtest({ ...request, definitionId: 'crop:wheat' })).rejects.toThrow('world_playtest_definition_mismatch');
  });
});
