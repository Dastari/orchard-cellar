import { describe, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { contentDefinitionRowsHash, contentDefinitionsHash } from '@orchard/sim';
import stageAContentRows from '../../../../sim/src/content/fixtures/stage-a-content-459.json';
import type { StudioConnectionView } from '../../shell/studio-connection.js';
import type { StudioLiveAdapter } from '../../shell/studio-connection.js';
import { createNarrativeWorkspace } from '../narrative/model.js';
import { createWorldAuthoringModel } from '../world-tables/model.js';
import { createItemsTool } from './model.js';
import { itemsAccessForConnection, itemsHeadFromConnection, itemsPublishAdapterFromConnection } from './connection.js';

function stageAView(rows = stageAContentRows, revision = 1n): StudioConnectionView {
  const metadata = { updatedBy: Identity.fromString('01'.repeat(32)), updatedAt: new Timestamp(0n) };
  return {
    ...adapter(true).view(),
    contentHead: { packId: 'live', revision, contentHash: contentDefinitionRowsHash(rows),
      definitionCount: rows.length, engineVersion: 1, clientMutationId: 'historical.fixture', ...metadata },
    contentDefinitions: rows.map((row) => ({ ...row, slug: row.id.split(':')[1]!, revision,
      hash: contentDefinitionRowsHash([row]), ...metadata })),
  };
}

function adapter(connected: boolean): StudioLiveAdapter {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    view: () => ({ connected, synchronizing: false, identity: connected ? 'identity' : null, role: connected ? 'content_editor' : null,
      contentRevision: null, mapRevision: null, mapDocument: null, publishingMap: false, worldMutating: false, error: null,
      rows: { placeables: [], npcs: [], homesteads: [], players: [] } }),
    publishContentChangeSet: vi.fn(async () => undefined), restoreContentRevision: vi.fn(async () => undefined),
  };
}

describe('Items Studio connection seam', () => {
  it('opens the original production head while retaining its exact payload hash', () => {
    const head = itemsHeadFromConnection(stageAView())!;
    expect(head.contentHash).toBe('ba28da55');
    expect(contentDefinitionsHash(head.definitions)).not.toBe(head.contentHash);
    expect(head.sourceRows?.find(({ id }) => id === 'item:wood')?.json)
      .toBe(stageAContentRows.find(({ id }) => id === 'item:wood')?.json);
    expect(createItemsTool({ access: 'read_only', head }).snapshot()).toMatchObject({ dirty: false, headRevision: 1n });
  });

  it('rejects payload tampering, incomplete rows, and semantically invalid content', () => {
    const view = stageAView();
    const changed = stageAContentRows.map((row) => row.id === 'item:wood'
      ? { ...row, json: JSON.stringify({ ...JSON.parse(row.json), ignoredFutureField: 'tampered' }) } : row);
    expect(() => itemsHeadFromConnection({ ...stageAView(changed), contentHead: view.contentHead }))
      .toThrow('items_content_head_hash_mismatch');
    expect(() => itemsHeadFromConnection({ ...view, contentDefinitions: view.contentDefinitions!.slice(1) }))
      .toThrow('items_content_head_count_mismatch');
    const broken = stageAContentRows.map((row) => row.kind === 'recipe'
      ? { ...row, json: JSON.stringify({ ...JSON.parse(row.json), output: { item: 'item:missing', count: 1 } }) } : row);
    expect(() => itemsHeadFromConnection(stageAView(broken))).toThrow('invalid_items_content_head:');
  });

  it.each(['item', 'npc', 'crop'] as const)('acknowledges a published %s edit against the normalized draft', (kind) => {
    const head = itemsHeadFromConnection(stageAView())!;
    const items = createItemsTool({ access: 'anonymous', head });
    const narrative = createNarrativeWorkspace({ access: 'anonymous', head });
    const world = createWorldAuthoringModel({ access: 'anonymous', head });
    const model = kind === 'item' ? items : kind === 'npc' ? narrative : world;
    const definition = head.definitions.find((entry) => entry.kind === kind)!;
    const edited = { ...definition, displayName: 'Incident draft acknowledgement' };
    if (kind === 'item') items.upsertDefinition(edited);
    else if (kind === 'npc') narrative.upsertDefinitions([edited]);
    else world.upsert(edited);
    expect(model.snapshot().dirty).toBe(true);
    const publishedRows = stageAContentRows.map((row) => row.id === edited.id
      ? { ...row, json: JSON.stringify(edited) } : row);
    const published = itemsHeadFromConnection(stageAView(publishedRows, 2n))!;
    expect(contentDefinitionsHash(published.definitions)).not.toBe(published.contentHash);
    expect(model.receiveHead(published)).toMatchObject({ dirty: false, baseRevision: 2n, headRevision: 2n });
  });

  it('keeps anonymous and disconnected rendering entirely adapter-free', () => {
    expect(itemsAccessForConnection('write', null)).toBe('anonymous');
    expect(itemsAccessForConnection('write', adapter(false))).toBe('anonymous');
  });

  it('uses the single explicit Studio adapter for connected publishing', async () => {
    const live = adapter(true); const content = itemsPublishAdapterFromConnection(live)!;
    await content.publishContentChangeSet({ packId: 'live', expectedRevision: 2n, clientMutationId: 'studio.2', upserts: '[]', deletes: '[]', note: '' });
    expect(live.publishContentChangeSet).toHaveBeenCalledOnce();
    expect(itemsAccessForConnection('write', live)).toBe('write');
    expect(itemsAccessForConnection('read_only', live)).toBe('read_only');
  });
});
