import { describe, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { bootstrapContentRows, contentDefinitionRowsHash } from '@orchard/sim';
import type { StudioConnectionView, StudioLiveAdapter } from './studio-connection.js';
import { studioLiveContentSnapshot } from './live-content-readiness.js';

const metadata = { updatedBy: Identity.fromString('01'.repeat(32)), updatedAt: new Timestamp(0n) };

function liveView(patch: Partial<StudioConnectionView> = {}): StudioConnectionView {
  return {
    connected: true, synchronizing: false, identity: 'author', role: 'content_editor',
    contentRevision: 1n, mapRevision: null, mapDocument: null, publishingMap: false,
    worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
    ...patch,
  };
}

function adapter(view: StudioConnectionView): StudioLiveAdapter {
  return { view: () => view, connect: vi.fn(), disconnect: vi.fn() };
}

describe('Studio verified live-content readiness', () => {
  it('keeps bootstrap compatibility explicit to adapter-free offline mode', () => {
    expect(studioLiveContentSnapshot(null)).toMatchObject({
      mode: 'offline', contentKey: 'offline:bootstrap', definitions: null,
    });
  });

  it('never treats an empty or null-head connected subscription as offline content', () => {
    expect(studioLiveContentSnapshot(adapter(liveView({ contentHead: null, contentDefinitions: [] }))))
      .toMatchObject({ mode: 'unavailable', definitions: null });
    expect(studioLiveContentSnapshot(adapter(liveView({
      synchronizing: true, contentHead: undefined, contentDefinitions: undefined,
    })))).toMatchObject({ mode: 'loading', definitions: null });
  });

  it('accepts only a complete content-keyed and hash-verified live registry', () => {
    const source = bootstrapContentRows();
    const revision = 7n;
    const rows = source.map((row) => ({
      ...row, json: String(row.json), slug: row.id.split(':')[1]!, revision,
      hash: contentDefinitionRowsHash([row]), ...metadata,
    }));
    const hash = contentDefinitionRowsHash(source);
    const snapshot = studioLiveContentSnapshot(adapter(liveView({
      contentHead: {
        packId: 'live', revision, contentHash: hash, definitionCount: rows.length,
        engineVersion: 1, clientMutationId: 'readiness.test', ...metadata,
      },
      contentDefinitions: rows,
    })));
    expect(snapshot).toMatchObject({ mode: 'ready', contentKey: `7:${hash}` });
    expect(snapshot.definitions).toHaveLength(rows.length);

    const stale = studioLiveContentSnapshot(adapter(liveView({
      contentHead: {
        packId: 'live', revision, contentHash: '00000000', definitionCount: rows.length,
        engineVersion: 1, clientMutationId: 'readiness.stale', ...metadata,
      },
      contentDefinitions: rows,
    })));
    expect(stale).toMatchObject({ mode: 'unavailable', definitions: null });
  });
});
