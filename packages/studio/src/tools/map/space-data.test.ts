import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, buildSpaceRegistry } from '@orchard/sim';
import type { StudioLiveAdapter } from '../../shell/studio-connection.js';
import { studioLivePickerSources, studioRuntimeSpaceTerrain } from './space-data.js';
import { studioMapId, studioSpacePath, studioSpaceRef } from './routes.js';
import { buildRuntimeSpaceTool } from './space-canvas.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';

describe('runtime space data boundary', () => {
  it('separates u16 runtime routes from editable documents', () => {
    expect(studioSpaceRef('/build/map/space/65532')).toEqual({ kind: 'space', spaceId: 65532, readOnly: true });
    expect(studioSpaceRef('/build/map/live-island')).toEqual({ kind: 'document', mapId: 'live-island' });
    expect(studioSpaceRef('/build/map/space/65536')).toBeNull();
    expect(studioSpaceRef('/build/map/space/-1')).toBeNull();
    expect(studioSpaceRef('/build/map/space/01')).toBeNull();
    expect(() => studioMapId('/build/map/space/0')).toThrow('runtime_space_is_not_a_map_document');
    expect(studioSpacePath(20001)).toBe('/build/map/space/20001');
  });
  it('resolves non-document residence terrain with live definitions and correct dimensions', () => {
    const entry = buildSpaceRegistry([], [{ spaceId: 10000, residenceSpaceId: 20000, ownerName: 'Ada' }], [])[1]!;
    const terrain = studioRuntimeSpaceTerrain({ kind: 'space', spaceId: 20000, readOnly: true }, entry, 17, 1, bootstrapContentRegistry());
    expect(terrain).toMatchObject({ spaceId: 20000, generator: 'residence', width: 16, height: 16 });
    expect(() => studioRuntimeSpaceTerrain({ kind: 'document', mapId: 'live-island' }, entry, 17, 1, bootstrapContentRegistry()))
      .toThrow('space_reference_mismatch');
  });
  it('passes opaque entity cursors unchanged and discovers space paths', async () => {
    const listEntities = vi.fn(async () => ({ rows: [], nextCursor: 'opaque', worldVersion: '', rowsScanned: 2048 }));
    const adapter = { adminObjects: { listEntities }, spaceRegistry: async () => buildSpaceRegistry([], [{ spaceId: 10000 }], []) } as unknown as StudioLiveAdapter;
    const sources = studioLivePickerSources(adapter);
    const query = { spaceId: '10000', kinds: ['crop'] as const, x0: 48, y0: 48, x1: 79, y1: 79, limit: 50, cursor: 'opaque', text: '' };
    expect((await sources.spaces())[0]?.path).toBe('/build/map/space/10000');
    await expect(sources.entities(query)).resolves.toMatchObject({ nextCursor: 'opaque', rowsScanned: 2048 });
    expect(listEntities).toHaveBeenCalledWith(query);
  });
  it('retries runtime metadata after a disconnected shell connects', async () => {
    let connected = false;
    const states = new Map<string, unknown>();
    const spaceRegistry = vi.fn(async () => {
      if (!connected) throw new Error('not_connected');
      return buildSpaceRegistry([], [{ spaceId: 10000 }], []);
    });
    const context = { route: { path: '/build/map/space/10000' }, invalidate: vi.fn(), controller: {
      liveAdapter: () => ({ view: () => ({ connected, identity: 'ada', role: 'admin' }), spaceRegistry }),
      toolState: (key: string, create: () => unknown) => {
        if (!states.has(key)) states.set(key, create());
        return states.get(key);
      },
    } } as unknown as StudioCanvasToolContext;
    buildRuntimeSpaceTool(context);
    await Promise.resolve(); await Promise.resolve();
    connected = true;
    buildRuntimeSpaceTool(context);
    await Promise.resolve();
    expect(spaceRegistry).toHaveBeenCalledTimes(2);
    expect(context.invalidate).toHaveBeenCalled();
  });
});
