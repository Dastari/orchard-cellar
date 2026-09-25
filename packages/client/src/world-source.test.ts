import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, runtimeTraversalPolicy, SURVIVAL_ISLAND_MAP_GENERATOR, SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, type ChunkArray, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { BoundedChunkTerrainStore as Store } from '@orchard/engine/bounded-chunk-terrain-store';
import { terrainIndexAt } from '@orchard/engine/terrain-index';
import type { TerrainArray } from '@orchard/engine/terrain';
import { CHUNK_LOOKAHEAD_WAIT_FRAMES, WorldSource, type ChunkPinBounds } from './world-source.js';
import { WorldStaticProjectionCache } from './world-static-projection.js';
import { chunkWindowForView, chunkWindowKey, chunkWindowPinBounds } from '@orchard/engine/chunk-terrain-window';

const registry = bootstrapContentRegistry();
/** The live registry's traversal policy decides whether a publication must carry the channels. */
const TRAVERSAL = runtimeTraversalPolicy(registry) !== null;
/** The fixture island's size, passed as the live size (the dispatcher's guard_size). */
const FIXTURE_SIZE = { width: 384, height: 384 };
const SIZE = 384;

const FIXTURE_OBJECT = { id: 'crate', prefabId: 'crate', prefabRevision: 0, tileX: 70, tileY: 70, elevation: 0, layer: 'objects',
  quarterTurns: 0, flipX: false, enabled: true };

/** A 6 x 6 chunk topside map whose biome encodes the tile. */
function fixture(spaceId = 0, extraChannel?: string, authority = false): { manifest: WorldChunkManifest; chunks: Map<string, WorldChunk> } {
  const cells = SIZE * SIZE;
  const channels: Record<string, ChunkArray> = {
    biomes: Uint8Array.from({ length: cells }, (_, index) => (index % SIZE + Math.floor(index / SIZE)) % 7),
    elevations: new Int16Array(cells), dirtCliffRoles: new Uint8Array(cells), dirtTerraces: new Uint8Array(cells),
    blocked: new Uint8Array(cells), horseJumpableTerrain: new Uint8Array(cells), medium: new Uint8Array(cells), solidBlocked: new Uint8Array(cells),
    // Static world S4d: the authority extension (ground blocked where x is a multiple of 10).
    ...(authority ? {
      'authority.ground.blocked': Uint8Array.from({ length: cells }, (_, index) => index % SIZE % 10 === 0 ? 1 : 0),
      'authority.ground.elevations': new Int16Array(cells), 'authority.ground.terrainPlaneBlocked': new Uint8Array(cells),
      'authority.ground.horseJumpableTerrain': new Uint8Array(cells), 'authority.water.blocked': new Uint8Array(cells).fill(1),
      'authority.combatRegion': new Uint8Array(cells),
    } : {}),
  };
  const chunks = new Map<string, WorldChunk>();
  const heads: WorldChunkManifest['chunks'][number][] = [];
  for (let cy = 0; cy < SIZE / 64; cy++) for (let cx = 0; cx < SIZE / 64; cx++) {
    const bytes = encodeWorldChunk({ schema: 1, mediumSchema: 1, ...(authority ? { authoritySchema: 1 as const } : {}), spaceId, cx, cy, assetRevision: 'a',
      records: authority && cx === 1 && cy === 1 ? [{ kind: 'authority.ground.obstacle', ordinal: 0, tileX: 70, tileY: 70,
        value: { group: 'authored', ordinal: 0, left: 70 * 256, top: 70 * 256, right: 71 * 256 - 1, bottom: 71 * 256 - 1, sourceId: 'object:crate' } },
        // Static world S4e: map records (an authored object and a decoration in each of two chunks).
        { kind: 'objects', ordinal: 0, tileX: 70, tileY: 70, value: FIXTURE_OBJECT },
        { kind: 'decoration', ordinal: 1, tileX: 72, tileY: 72, value: { id: 7, kind: 'poi_rock_small', tileX: 72, tileY: 72, variant: 0, animationOffset: 0 } }]
        : authority && cx === 2 && cy === 1 ? [{ kind: 'decoration', ordinal: 0, tileX: 130, tileY: 70,
          value: { id: 6, kind: 'poi_rock_small', tileX: 130, tileY: 70, variant: 1, animationOffset: 2 } }] : [],
      assetIds: [], atlasPackIds: [],
      arrays: Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, sliceWorldChunkChannel(value, SIZE, SIZE, cx, cy, /blocked/iu.test(name) ? 1 : 0)])) });
    const chunk = decodeWorldChunk(bytes);
    chunks.set(`${cx}:${cy}`, chunk);
    heads.push({ cx, cy, byteLength: bytes.length, contentHash: chunk.contentHash });
  }
  const manifest = { schema: 1, chunkSize: 64, spaceId, width: SIZE, height: SIZE, assetRevision: 'a', sourceRevision: 4, sourceHash: 'map',
    metadata: { terrain: { seed: 9, version: 4, generator: 'island', projectionStyle: 'raised', baseDatum: 0 },
      collisions: { clientGround: { terrainMinimumElevation: 0 } },
      ...(authority ? { document: { id: 'live-island', layers: [{ id: 'objects', order: 30 }], prefabs: [],
        provenance: { kind: 'generated', generator: SURVIVAL_ISLAND_MAP_GENERATOR } } } : {}),
      ...(authority ? { authority: { schema: 1, combatRegions: [], generatedSuppressions: ['resource-42'],
        collisions: { ground: { terrainMinimumElevation: 0, terrainTransitions: 0, hasTraversalChannels: TRAVERSAL },
          water: { hasTraversalChannels: TRAVERSAL } } } } : {}),
      channels: Object.fromEntries([...Object.entries(channels).map(([name, value]) => [name, { type: value instanceof Int16Array ? 'i16' : 'u8', planes: 1 }]),
        // A manifest channel the chunks lack: the window build must throw.
        ...(extraChannel === undefined ? [] : [[extraChannel, { type: 'u8', planes: 1 }]])]) },
    chunks: heads } as WorldChunkManifest;
  return { manifest, chunks };
}

function servingStore(spaceId = 0, extraChannel?: string, authority = false) {
  const { manifest, chunks } = fixture(spaceId, extraChannel, authority);
  const resident = new Set<string>();
  let pins: string[] = [];
  let installs = 0;
  const store = {
    manifest,
    get installs() { return installs; },
    get pinnedKeys() { return pins; },
    peekChunk: (cx: number, cy: number) => resident.has(`${cx}:${cy}`) ? chunks.get(`${cx}:${cy}`) : undefined,
  } as unknown as BoundedChunkTerrainStore;
  // The chunk runtime pins the bounds and the loader installs every pinned chunk.
  const real = new Store(manifest);
  const pin = (bounds: ChunkPinBounds) => {
    real.pinView(...bounds);
    pins = [...real.pinnedKeys];
    for (const key of pins) { resident.add(key); installs++; }
  };
  return { store, pin, resident, install: () => { installs++; } };
}

describe('WorldSource (static world S4c)', () => {
  const legacyTerrain = { width: SIZE, height: SIZE } as TerrainArray;

  it('returns the legacy terrain untouched when no chunk store is serving (off, shadow)', () => {
    const pin = vi.fn();
    const source = new WorldSource({ store: () => undefined, pin });
    const legacy = vi.fn(() => legacyTerrain);
    expect(source.topsideTerrain(legacy, registry)).toBe(legacyTerrain);
    expect(source.minimapTerrain(legacy, registry)).toEqual({ terrain: legacyTerrain, key: '' });
    const regions: unknown[] = [];
    source.drainGroundInvalidations((region) => regions.push(region));
    expect(regions).toEqual([]);
    // Shadow still pins the camera's window (25 chunks at most), not the entity radius.
    source.setView({ minX: 400, minY: 400, maxX: 520, maxY: 468 });
    source.setView({ minX: 401, minY: 400, maxX: 521, maxY: 468 });
    expect(pin).toHaveBeenCalledTimes(1);
    expect(pin).toHaveBeenCalledWith([384, 320, 575, 511]);
    expect(SURVIVAL_WORLD_SIZE).toBe(832);
  });

  it('serves a window around the camera in chunk mode on, and keeps legacy for another space', () => {
    const serving = servingStore();
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin });
    const legacy = vi.fn(() => legacyTerrain);
    source.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    const terrain = source.topsideTerrain(legacy, registry);
    expect(legacy).not.toHaveBeenCalled();
    expect([terrain.originX, terrain.originY, terrain.width, terrain.height]).toEqual([64, 64, 320, 320]);
    expect(terrain.biomes[terrainIndexAt(terrain, 310, 305)]).toBe((310 + 305) % 7);
    // Same frame, same window: no rebuild.
    expect(source.topsideTerrain(legacy, registry)).toBe(terrain);
    const minimap = source.minimapTerrain(legacy, registry);
    expect(minimap.terrain).toBe(terrain);
    expect(minimap.key).toBe('window:1');
    const regions: unknown[] = [];
    source.drainGroundInvalidations((region) => regions.push(region));
    expect(regions).toEqual([{ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity }]);
    // Moving the camera across the map moves the window and invalidates only changed chunks.
    source.setView({ minX: 10, minY: 10, maxX: 50, maxY: 32 });
    const moved = source.topsideTerrain(legacy, registry);
    expect([moved.originX, moved.originY]).toEqual([0, 0]);
    regions.length = 0;
    source.drainGroundInvalidations((region) => regions.push(region));
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).not.toContainEqual({ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity });
    const other = new WorldSource({ store: () => servingStore(7).store, pin: () => undefined });
    expect(other.topsideTerrain(legacy, registry)).toBe(legacyTerrain);
  });

  it('falls back to the legacy terrain when a window cannot be built, and reports it', () => {
    const broken = servingStore(0, 'ledges');
    let store = broken.store;
    const source = new WorldSource({ store: () => store, pin: broken.pin });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    source.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    expect(source.topsideTerrain(() => legacyTerrain, registry)).toBe(legacyTerrain);
    expect(source.status).toEqual({ failures: 1, lastError: 'chunk_window_channel_mismatch:ledges', fallback: true });
    // Not retried every frame: only once the store, the window or the chunks change.
    expect(source.topsideTerrain(() => legacyTerrain, registry)).toBe(legacyTerrain);
    expect(source.status.failures).toBe(1);
    broken.install();
    expect(source.topsideTerrain(() => legacyTerrain, registry)).toBe(legacyTerrain);
    expect(source.status.failures).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
    // A good revision recovers.
    const good = servingStore();
    good.pin([128, 128, 319, 319]);
    store = good.store;
    const terrain = source.topsideTerrain(() => legacyTerrain, registry);
    expect(terrain).not.toBe(legacyTerrain);
    expect(source.status).toEqual({ failures: 2, lastError: null, fallback: false });
    warn.mockRestore();
  });

  it('chooses the window before the frame serves terrain (no one-frame lag)', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const render = main.indexOf('worldSource.setView(estimatedCameraTiles(localX, localY));');
    expect(render).toBeGreaterThan(0);
    expect(main.indexOf('const terrain = terrainForSnapshot(snapshot);', render)).toBeGreaterThan(render);
    const beforeTerrain = main.slice(render, main.indexOf('const terrain = terrainForSnapshot(snapshot);', render));
    expect(beforeTerrain).not.toContain('beginWorld');
    // S4f: the prepared window advances one stage before this frame's terrain is served.
    expect(beforeTerrain).toContain('worldSource.advance(snapshot.content.registry);');
    // A teleport serves the new window from the very next terrain request.
    const serving = servingStore();
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin });
    source.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    expect(source.topsideTerrain(() => legacyTerrain, registry).originX).toBe(64);
    source.setView({ minX: 5, minY: 5, maxX: 45, maxY: 27 });
    expect(source.topsideTerrain(() => legacyTerrain, registry).originX).toBe(0);
  });

  it('builds from the runtime pins before the first camera frame', () => {
    const serving = servingStore();
    serving.pin([128, 128, 191, 191]);
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin });
    const terrain = source.topsideTerrain(() => legacyTerrain, registry);
    expect([terrain.originX, terrain.originY, terrain.width, terrain.height]).toEqual([64, 64, 192, 192]);
  });
});

describe('WorldSource collision (static world S4d)', () => {
  const VIEW = { minX: 300, minY: 300, maxX: 340, maxY: 322 };
  /** A serving `on` source over the authority fixture, with a mutable manifest and gate. */
  function onSource(options: { manifest?: (manifest: WorldChunkManifest) => WorldChunkManifest } = {}) {
    const serving = servingStore(0, undefined, true);
    const manifest = options.manifest?.(serving.store.manifest) ?? serving.store.manifest;
    const store = Object.create(serving.store, { manifest: { value: manifest } }) as BoundedChunkTerrainStore;
    const state = { gate: null as string | null, resident: serving.resident };
    const source = new WorldSource({ store: () => store, pin: serving.pin, authorityGate: () => state.gate, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    return { source, state, serving };
  }

  it('keeps the legacy collision in modes off and shadow, and wherever the server would serve its compiled map', () => {
    // Off and shadow: no serving store, so no chunk collision or suppression source.
    const off = new WorldSource({ store: () => undefined, pin: () => undefined });
    off.setView(VIEW);
    expect(off.collision(registry)).toBeUndefined();
    expect(off.authority(registry)).toBeUndefined();
    expect(off.suppressesGeneratedResource(42n, registry)).toBeUndefined();
    expect(off.collisionStatus.fallbackReason).toBeNull();
    // The gate: a newer publication still loading here, or stale content or map (never the atlas).
    const { source, state } = onSource();
    for (const gate of ['superseded', 'stale_content', 'stale_map']) {
      state.gate = gate;
      expect(source.collision(registry), gate).toBeUndefined();
      expect(source.suppressesGeneratedResource(42n, registry), gate).toBeUndefined();
      expect(source.collisionStatus.fallbackReason).toBe(gate);
    }
    state.gate = null;
    expect(source.collision(registry)).toBeDefined();
    expect(source.collisionStatus).toMatchObject({ fallbackReason: null, authorityIncomplete: false, missingChunks: 0 });
    expect(source.suppressesGeneratedResource(42n, registry)).toBe(true);
    expect(source.suppressesGeneratedResource(43n, registry)).toBe(false);
    // Publication-level refusals of the server dispatcher.
    const authority = (manifest: WorldChunkManifest) => manifest.metadata['authority'] as Record<string, never>;
    for (const [reason, change] of [
      ['authority_metadata_missing', (manifest: WorldChunkManifest) => ({ ...manifest, metadata: { ...manifest.metadata, authority: null } })],
      ['ground_fields_missing: terrainTransitions', (manifest: WorldChunkManifest) => ({ ...manifest, metadata: { ...manifest.metadata,
        authority: { ...authority(manifest), collisions: { ground: { terrainMinimumElevation: 0 }, water: {} } } } })],
      ['traversal_policy_mismatch', (manifest: WorldChunkManifest) => ({ ...manifest, metadata: { ...manifest.metadata,
        authority: { ...authority(manifest), collisions: { ground: { terrainMinimumElevation: 0, terrainTransitions: 0, hasTraversalChannels: !TRAVERSAL },
          water: { hasTraversalChannels: !TRAVERSAL } } } } })],
      ['incomplete: head_missing@5,5', (manifest: WorldChunkManifest) => ({ ...manifest, chunks: manifest.chunks.filter(head => !(head.cx === 5 && head.cy === 5)) })],
      ['guard_size: 320x384', (manifest: WorldChunkManifest) => ({ ...manifest, width: 320 })],
      ['guard_base', (manifest: WorldChunkManifest) => ({ ...manifest, metadata: { ...manifest.metadata, document: { provenance: { kind: 'blank' } } } })],
      ['guard_base', (manifest: WorldChunkManifest) => ({ ...manifest, metadata: { ...manifest.metadata, document: {} } })],
    ] as const) {
      const refused = onSource({ manifest: change as (manifest: WorldChunkManifest) => WorldChunkManifest }).source;
      expect(refused.collision(registry), reason).toBeUndefined();
      expect(refused.collisionStatus.fallbackReason, reason).toBe(reason);
      expect(refused.authority(registry), reason).toBeUndefined();
    }
    // Another space never serves chunk collision.
    const other = servingStore(7, undefined, true);
    expect(new WorldSource({ store: () => other.store, pin: other.pin }).collision(registry)).toBeUndefined();
  });

  it('keeps a not-yet-resident window chunk solid, but falls back when a resident one is malformed', () => {
    const { source, state } = onSource();
    // The window is built from what is resident: one chunk is still loading.
    state.resident.delete('2:2');
    const collision = source.collision(registry)!;
    expect(collision.collision.issues).toEqual([{ kind: 'chunk_missing', cx: 2, cy: 2 }]);
    expect(source.collisionStatus).toMatchObject({ fallbackReason: null, authorityIncomplete: false, missingChunks: 1 });
    // A resident chunk published without the authority extension: the server refuses the publication.
    const unextended = servingStore(0, undefined, true);
    const store = Object.create(unextended.store, { peekChunk: { value: (cx: number, cy: number) => {
      const resident = unextended.store.peekChunk(cx, cy);
      return cx === 1 && cy === 1 && resident !== undefined ? { ...resident, authoritySchema: undefined } : resident;
    } } }) as BoundedChunkTerrainStore;
    const broken = new WorldSource({ store: () => store, pin: unextended.pin, authorityGate: () => null, worldSize: FIXTURE_SIZE });
    broken.setView(VIEW);
    expect(broken.collision(registry)).toBeUndefined();
    expect(broken.collisionStatus).toMatchObject({ fallbackReason: 'incomplete: authority_missing@1,1', authorityIncomplete: true });
  });

  it('builds collision once per render window from exactly its chunks, and rebuilds when the window changes', () => {
    const serving = servingStore(0, undefined, true);
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    const first = source.collision(registry)!;
    expect(first.terrain).toBe(source.topsideTerrain(() => ({ width: 0, height: 0 }) as TerrainArray, registry));
    expect([first.collision.originX, first.collision.originY, first.collision.width, first.collision.height]).toEqual([64, 64, 320, 320]);
    expect(first.collision.ground.originX).toBe(64);
    expect(first.collision.issues).toEqual([]);
    expect(first.collision.ground.obstacles).toEqual([{ left: 70 * 256, top: 70 * 256, right: 71 * 256 - 1, bottom: 71 * 256 - 1 }]);
    // Same window: the same collision (and serial).
    expect(source.collision(registry)).toBe(first);
    source.setView({ minX: 10, minY: 10, maxX: 50, maxY: 32 });
    const moved = source.collision(registry)!;
    expect(moved.serial).toBeGreaterThan(first.serial);
    expect([moved.collision.originX, moved.collision.originY]).toEqual([0, 0]);
  });
});

describe('WorldSource map records (static world S4e)', () => {
  const VIEW = { minX: 300, minY: 300, maxX: 340, maxY: 322 };

  it('serves no records in modes off and shadow, or wherever the chunk collision does not serve', () => {
    const off = new WorldSource({ store: () => undefined, pin: () => undefined });
    off.setView(VIEW);
    expect(off.mapRecords(registry)).toBeUndefined();
    const serving = servingStore(0, undefined, true);
    const state = { gate: null as string | null };
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin, authorityGate: () => state.gate, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    expect(source.mapRecords(registry)).toBeDefined();
    for (const gate of ['superseded', 'stale_content', 'stale_map']) {
      state.gate = gate;
      expect(source.mapRecords(registry), gate).toBeUndefined();
    }
    // No authority extension at all: neither collision nor records.
    const legacyOnly = servingStore();
    const unextended = new WorldSource({ store: () => legacyOnly.store, pin: legacyOnly.pin });
    unextended.setView(VIEW);
    expect(unextended.collision(registry)).toBeUndefined();
    expect(unextended.mapRecords(registry)).toBeUndefined();
    // Another space never serves topside records.
    const other = servingStore(7, undefined, true);
    expect(new WorldSource({ store: () => other.store, pin: other.pin }).mapRecords(registry)).toBeUndefined();
    expect(source.recordsStatus).toEqual({ failures: 0, lastError: null });
  });

  it('builds the records of the window the collision serves, once per window', () => {
    const serving = servingStore(0, undefined, true);
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    const records = source.mapRecords(registry)!;
    expect(records.rect).toEqual(source.collision(registry)!.window.rect);
    expect(records.objects).toEqual([FIXTURE_OBJECT]);
    expect(records.decorations.map(({ id }) => id)).toEqual([6, 7]);
    expect([records.id, records.layers, records.prefabs, records.generatedSuppressions, records.combatRegions])
      .toEqual(['live-island', [{ id: 'objects', order: 30 }], [], ['resource-42'], []]);
    expect(source.mapRecords(registry)).toBe(records);
    // Another window (it still holds chunks 1:1 and 2:1): its own records.
    source.setView({ minX: 10, minY: 10, maxX: 50, maxY: 32 });
    const moved = source.mapRecords(registry)!;
    expect(moved).not.toBe(records);
    expect(moved.rect).toEqual({ cx: 0, cy: 0, columns: 5, rows: 5 });
    expect(moved.objects).toEqual([FIXTURE_OBJECT]);
  });

  it('skips a window chunk evicted before its records were built, and rebuilds once the store installs again', () => {
    const serving = servingStore(0, undefined, true);
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin, authorityGate: () => null, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    const window = source.window(registry)!;
    expect(window.present.has('2:1')).toBe(true);
    // The look-ahead pin moved on and the store evicted a chunk of the served window.
    serving.resident.delete('2:1');
    const holed = source.mapRecords(registry)!;
    expect(holed.evicted).toEqual(['2:1']);
    expect(holed.decorations.map(({ id }) => id)).toEqual([7]);
    // The collision reads it as missing (solid) and keeps serving: no fallback.
    expect(source.collisionStatus).toMatchObject({ fallbackReason: null, missingChunks: 1 });
    expect(source.mapRecords(registry)).toBe(holed);
    serving.resident.add('2:1'); serving.install();
    const whole = source.mapRecords(registry)!;
    expect(whole.evicted).toEqual([]);
    expect(whole.decorations.map(({ id }) => id)).toEqual([6, 7]);
    expect(source.mapRecords(registry)).toBe(whole);
    expect(source.recordsStatus.failures).toBe(0);
  });

  it('falls back as a unit (collision too) when a record is malformed, and reports it once', () => {
    const serving = servingStore(0, undefined, true);
    const store = Object.create(serving.store, { peekChunk: { value: (cx: number, cy: number) => {
      const resident = serving.store.peekChunk(cx, cy);
      return cx === 2 && cy === 1 && resident !== undefined
        ? { ...resident, records: [{ kind: 'decoration', ordinal: 0, tileX: 130, tileY: 70, value: { id: 6, tileX: 130, tileY: 70 } }] } : resident;
    } } }) as BoundedChunkTerrainStore;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source = new WorldSource({ store: () => store, pin: serving.pin, authorityGate: () => null, worldSize: FIXTURE_SIZE });
    source.setView(VIEW);
    expect(source.mapRecords(registry)).toBeUndefined();
    expect(source.mapRecords(registry)).toBeUndefined();
    expect(source.recordsStatus).toEqual({ failures: 1, lastError: 'chunk_map_record_invalid:decoration@2,1#0' });
    // The window falls back as a unit, like the server's `incomplete`: legacy collision and drawing.
    expect(source.collision(registry)).toBeUndefined();
    expect(source.collisionStatus).toMatchObject({ fallbackReason: 'incomplete: map_records:chunk_map_record_invalid:decoration@2,1#0',
      authorityIncomplete: true });
    expect(source.window(registry)).toBeDefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('WorldSource staged window moves (static world S4f)', () => {
  // The window 1:0 (tiles 64-383 x 0-319) keeps views with minX >= 96; views in [96, 112) are in the lookahead band.
  const START = { minX: 230, minY: 100, maxX: 270, maxY: 122 };
  const BAND = { minX: 100, minY: 100, maxX: 140, maxY: 122 };
  const FAR = { minX: 10, minY: 100, maxX: 50, maxY: 122 };
  // Back to the window 1:0 from 0:0 (its margin needs tiles past 319).
  const RIGHT = { minX: 340, minY: 100, maxX: 380, maxY: 122 };

  /** An `on` source whose loader installs pinned chunks only when told to. */
  function staging(options: { prewarm?: number; failed?: ReadonlySet<string> } = {}) {
    const serving = servingStore(0, undefined, true);
    const held = new Set<string>();
    const pins: ChunkPinBounds[] = [];
    const pin = (bounds: ChunkPinBounds) => {
      pins.push(bounds);
      const before = new Set(serving.resident);
      serving.pin(bounds);
      for (const key of serving.resident) if (!before.has(key) && held.has(key)) serving.resident.delete(key);
    };
    const calls: { step: number; window: unknown; collision: unknown; records: unknown }[] = [];
    const prewarm = Array.from({ length: options.prewarm ?? 2 }, (_, step) =>
      (prepared: { window: unknown; collision: unknown; records: unknown }) => { calls.push({ step, ...prepared }); });
    const source = new WorldSource({ store: () => serving.store, pin, authorityGate: () => null, worldSize: FIXTURE_SIZE, prewarm,
      ...(options.failed === undefined ? {} : { failedChunks: () => options.failed }) });
    source.setView(START);
    const first = source.window(registry)!;
    return { serving, held, pins, calls, source, first,
      hold(key: string) { held.add(key); serving.resident.delete(key); },
      release(key: string) { held.delete(key); serving.resident.add(key); serving.install(); } };
  }

  it('pins and prepares the next window ahead of the view, one stage per frame, then serves it in one assignment', () => {
    const { source, first, pins, calls, held, release } = staging();
    expect([first.rect.cx, first.rect.cy]).toEqual([1, 0]);
    held.add('0:0'); held.add('0:1');
    source.setView(BAND);
    // Still serving the current window, which keeps the S4c margin; the next one is pinned.
    expect(source.window(registry)).toBe(first);
    expect(pins.at(-1)).toEqual(chunkWindowPinBounds({ cx: 0, cy: 0, columns: 5, rows: 5 }));
    expect(source.stagingStatus.pending).toBe('0:0:5x5:resident');
    // Waits for its published chunks.
    source.advance(registry);
    expect(source.stagingStatus.pending).toBe('0:0:5x5:resident');
    release('0:0'); release('0:1');
    const frames: string[] = [];
    for (let frame = 0; frame < 6 && source.window(registry) === first; frame++) {
      source.setView(BAND);
      source.advance(registry);
      frames.push(String(source.stagingStatus.pending));
    }
    expect(frames).toEqual(['0:0:5x5:collision', '0:0:5x5:records', '0:0:5x5:prewarm0', '0:0:5x5:prewarm1', '0:0:5x5:prewarm2', '0:0:5x5:ready']);
    const served = source.window(registry)!;
    expect([served.rect.cx, served.rect.cy, served.missing]).toEqual([0, 0, 0]);
    // Each prewarm step saw the window about to be served, its collision and its map records (S4e).
    expect(calls.map(({ step }) => step)).toEqual([0, 1]);
    for (const call of calls) {
      expect(call.window).toBe(served);
      expect(call.collision).toBe(source.collision(registry)!.collision);
      expect(call.records).toBe(source.mapRecords(registry));
    }
    expect(source.mapRecords(registry)!.objects).toEqual([FIXTURE_OBJECT]);
    expect(source.stagingStatus).toEqual({ staged: 1, synchronous: 0, arrivals: 0, pending: null });
  });

  it('serves the same window, collision and invalidations as a synchronous rebuild', () => {
    const staged = staging(), synchronous = staging({ prewarm: 0 });
    const drain = (source: WorldSource) => { const regions: unknown[] = []; source.drainGroundInvalidations((region) => regions.push(region)); return regions; };
    drain(staged.source); drain(synchronous.source);
    for (let frame = 0; frame < 8; frame++) { staged.source.setView(BAND); staged.source.advance(registry); }
    const prepared = staged.source.window(registry)!;
    synchronous.source.setView(FAR);
    const built = synchronous.source.window(registry)!;
    expect(prepared.rect).toEqual(built.rect);
    for (const channel of ['biomes', 'elevations', 'dirtCliffRoles'] as const) expect(prepared.terrain[channel]).toEqual(built.terrain[channel]);
    expect(prepared.terrain.blocked).toEqual(built.terrain.blocked);
    expect(drain(staged.source)).toEqual(drain(synchronous.source));
    const a = staged.source.collision(registry)!.collision, b = synchronous.source.collision(registry)!.collision;
    expect(a.ground.blocked).toEqual(b.ground.blocked);
    expect(a.ground.obstacles).toEqual(b.ground.obstacles);
    expect(a.issues).toEqual(b.issues);
    expect(synchronous.source.stagingStatus).toMatchObject({ staged: 0, synchronous: 1 });
  });

  it('switches at once when the view outruns the prepared window, and drops it when the view turns back', () => {
    const { source } = staging();
    source.setView(BAND);
    source.advance(registry); // built, not yet served
    expect(source.stagingStatus.pending).toBe('0:0:5x5:collision');
    // A jump past the margin: this very frame serves the needed window (what was built so far is used).
    source.setView(FAR);
    const jumped = source.window(registry)!;
    expect([jumped.rect.cx, jumped.rect.cy]).toEqual([0, 0]);
    expect(source.stagingStatus).toMatchObject({ staged: 0, synchronous: 1, pending: null });
    expect(source.collision(registry)).toBeDefined();
    // Turning back before the next window is ready cancels it and restores the pin.
    const other = staging();
    other.source.setView(BAND);
    other.source.advance(registry);
    other.source.setView(START);
    expect(other.source.stagingStatus.pending).toBeNull();
    expect(other.pins.at(-1)).toEqual(other.pins[0]);
    expect(other.source.window(registry)).toBe(other.first);
  });

  it('waits for every published chunk of the next window before building it', () => {
    const { source, held, release } = staging();
    held.add('0:4');
    source.setView(BAND);
    // 0:4 belongs to the next window (0:0, 5 x 5): it arrives late.
    for (let frame = 0; frame < 2; frame++) { source.setView(BAND); source.advance(registry); }
    expect(source.stagingStatus.pending).toBe('0:0:5x5:resident');
    // Once every published chunk is resident, the build runs.
    release('0:4');
    source.setView(BAND); source.advance(registry);
    expect(source.stagingStatus.pending).toBe('0:0:5x5:collision');
  });

  it('stages one coalesced rebuild for chunks that arrive after the window was built', () => {
    const { source, hold, release } = staging();
    source.setView(FAR); source.advance(registry);
    const far = source.window(registry)!;
    expect([far.rect.cx, far.missing]).toEqual([0, 0]);
    // Back to 1:0 with two of its chunks still loading: a synchronous move (the view needs it now).
    hold('5:1'); hold('5:2');
    source.setView(RIGHT); source.advance(registry);
    const partial = source.window(registry)!;
    expect([partial.rect.cx, partial.missing]).toEqual([1, 2]);
    expect(source.stagingStatus).toMatchObject({ synchronous: 2, arrivals: 0 }); // FAR, then back to 1:0
    release('5:1');
    source.setView(RIGHT); source.advance(registry);
    // Still served as is while the late chunks coalesce; nothing is rebuilt synchronously.
    expect(source.window(registry)).toBe(partial);
    expect(source.stagingStatus.pending).toBe('1:0:5x5:resident');
    release('5:2');
    const frames: string[] = [];
    for (let frame = 0; frame < 8 && source.window(registry) === partial; frame++) {
      source.setView(RIGHT); source.advance(registry); frames.push(String(source.stagingStatus.pending));
    }
    expect(frames).toEqual(['1:0:5x5:collision', '1:0:5x5:records', '1:0:5x5:prewarm0', '1:0:5x5:prewarm1', '1:0:5x5:prewarm2', '1:0:5x5:ready']);
    const rebuilt = source.window(registry)!;
    expect(rebuilt.missing).toBe(0);
    expect(source.stagingStatus).toEqual({ staged: 0, synchronous: 2, arrivals: 1, pending: null });
    // A chunk that never arrives does not hold back the ones that did for more than a few frames.
    const stuck = staging();
    stuck.source.setView(FAR); stuck.source.advance(registry); stuck.source.window(registry);
    stuck.hold('5:1'); stuck.hold('5:2');
    stuck.source.setView(RIGHT); stuck.source.advance(registry);
    const missingTwo = stuck.source.window(registry)!;
    stuck.release('5:1');
    let served: { missing: number } = missingTwo;
    for (let frame = 0; frame < 20 && served === missingTwo; frame++) {
      stuck.source.setView(RIGHT); stuck.source.advance(registry); served = stuck.source.window(registry)!;
    }
    expect(served.missing).toBe(1);
    expect(stuck.source.stagingStatus.arrivals).toBe(1);
  });

  it('never holds back chunks the served window lacks behind a window prepared ahead (review round 2)', () => {
    // Served 1:0 lacking the player's chunk 1:1; the view then sits in the look-ahead band while
    // the next window (0:0) waits on a chunk that does not come.
    const failed = new Set<string>();
    const { source: tracked, hold, release } = staging({ failed });
    tracked.setView(FAR); tracked.advance(registry); tracked.window(registry);
    hold('1:1');
    tracked.setView(RIGHT); tracked.advance(registry);
    const partial = tracked.window(registry)!;
    expect([partial.rect.cx, partial.present.has('1:1')]).toEqual([1, false]);
    hold('0:0');
    tracked.setView(BAND); tracked.advance(registry);
    expect(tracked.stagingStatus.pending).toBe('0:0:5x5:resident');
    release('1:1');
    let served = tracked.window(registry)!;
    for (let frame = 0; frame < 3 && !served.present.has('1:1'); frame++) {
      tracked.setView(BAND); tracked.advance(registry); served = tracked.window(registry)!;
    }
    expect(served.rect.cx).toBe(1);
    expect(served.present.has('1:1')).toBe(true);
    expect(tracked.collision(registry)!.collision.present.has('1:1')).toBe(true);
    // The look-ahead window never waits on a chunk whose load failed ...
    failed.add('0:0');
    for (let frame = 0; frame < 8 && tracked.window(registry)!.rect.cx !== 0; frame++) { tracked.setView(BAND); tracked.advance(registry); }
    expect(tracked.window(registry)!.rect.cx).toBe(0);
    // ... nor for long on one that is merely slow.
    const slow = staging();
    slow.source.setView(RIGHT); slow.source.advance(registry); slow.source.window(registry);
    slow.hold('0:0');
    let frames = 0;
    for (; frames < CHUNK_LOOKAHEAD_WAIT_FRAMES + 10 && slow.source.window(registry)!.rect.cx !== 0; frames++) { slow.source.setView(BAND); slow.source.advance(registry); }
    expect(slow.source.window(registry)!.rect.cx).toBe(0);
    expect(frames).toBeGreaterThanOrEqual(CHUNK_LOOKAHEAD_WAIT_FRAMES);
  });

  it('keeps at most the served and the next window alive, however long the walk (no chain through cached collisions)', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const { source } = staging({ prewarm: 0 });
    const projection = new WorldStaticProjectionCache();
    const windows: WeakRef<object>[] = [];
    for (let move = 0; move < 24; move++) {
      for (const view of move % 2 === 0 ? [BAND, BAND, BAND, BAND, BAND, BAND, BAND, FAR] : [RIGHT]) {
        source.setView(view); source.advance(registry);
        const window = source.window(registry)!;
        const collision = source.collision(registry)!;
        projection.prepareWindowLight(collision.window);
        if (windows.at(-1)?.deref() !== window) windows.push(new WeakRef(window));
      }
    }
    expect(windows.length).toBeGreaterThanOrEqual(20);
    await new Promise(resolve => setTimeout(resolve, 0));
    gc(); await new Promise(resolve => setTimeout(resolve, 0)); gc();
    expect(windows.filter(ref => ref.deref() !== undefined).length).toBeLessThanOrEqual(3);
  });

  it('never stages in modes off and shadow, or before a window is served', () => {
    const pin = vi.fn();
    const off = new WorldSource({ store: () => undefined, pin, prewarm: [() => { throw new Error('no prewarm'); }] });
    off.setView(START); off.setView(BAND); off.setView(FAR); off.advance(registry);
    expect(off.stagingStatus).toEqual({ staged: 0, synchronous: 0, arrivals: 0, pending: null });
    // Exactly the S4c pins: the needed window only (on the live island's size, with hysteresis).
    const expected: ChunkPinBounds[] = [];
    let rect: ReturnType<typeof chunkWindowForView> | undefined;
    for (const view of [START, BAND, FAR]) {
      const next = chunkWindowForView(view, SURVIVAL_WORLD_SIZE, SURVIVAL_WORLD_SIZE, rect);
      if (rect === undefined || chunkWindowKey(next) !== chunkWindowKey(rect)) expected.push(chunkWindowPinBounds(next));
      rect = next;
    }
    expect(pin.mock.calls.map(([bounds]) => bounds)).toEqual(expected);
    // `on`, before the first window is served: no lookahead either.
    const serving = servingStore(0, undefined, true);
    const early = new WorldSource({ store: () => serving.store, pin: serving.pin, prewarm: [() => { throw new Error('no prewarm'); }] });
    early.setView(BAND); early.advance(registry);
    expect(early.stagingStatus.pending).toBeNull();
  });
});
