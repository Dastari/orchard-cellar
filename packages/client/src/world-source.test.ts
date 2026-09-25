import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, type ChunkArray, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { BoundedChunkTerrainStore as Store } from '@orchard/engine/bounded-chunk-terrain-store';
import { terrainIndexAt } from '@orchard/engine/terrain-index';
import type { TerrainArray } from '@orchard/engine/terrain';
import { WorldSource, type ChunkPinBounds } from './world-source.js';

const registry = bootstrapContentRegistry();
const SIZE = 384;

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
        value: { group: 'authored', ordinal: 0, left: 70 * 256, top: 70 * 256, right: 71 * 256 - 1, bottom: 71 * 256 - 1, sourceId: 'object:crate' } }] : [],
      assetIds: [], atlasPackIds: [],
      arrays: Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, sliceWorldChunkChannel(value, SIZE, SIZE, cx, cy, /blocked/iu.test(name) ? 1 : 0)])) });
    const chunk = decodeWorldChunk(bytes);
    chunks.set(`${cx}:${cy}`, chunk);
    heads.push({ cx, cy, byteLength: bytes.length, contentHash: chunk.contentHash });
  }
  const manifest = { schema: 1, chunkSize: 64, spaceId, width: SIZE, height: SIZE, assetRevision: 'a', sourceRevision: 4, sourceHash: 'map',
    metadata: { terrain: { seed: 9, version: 4, generator: 'island', projectionStyle: 'raised', baseDatum: 0 },
      collisions: { clientGround: { terrainMinimumElevation: 0 } },
      ...(authority ? { authority: { schema: 1, combatRegions: [], generatedSuppressions: ['resource-42'],
        collisions: { ground: { terrainMinimumElevation: 0 }, water: {} } } } : {}),
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
    const render = main.indexOf('if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) worldSource.setView(estimatedCameraTiles(localX, localY));');
    expect(render).toBeGreaterThan(0);
    expect(main.indexOf('const terrain = terrainForSnapshot(snapshot);', render)).toBeGreaterThan(render);
    expect(main.slice(render, main.indexOf('const terrain = terrainForSnapshot(snapshot);', render))).not.toContain('beginWorld');
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
  it('keeps the legacy collision in modes off and shadow, when stale, and without the authority extension', () => {
    // Off and shadow: no serving store, so no chunk collision or suppression source.
    const off = new WorldSource({ store: () => undefined, pin: () => undefined });
    off.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    expect(off.collision(registry)).toBeUndefined();
    expect(off.authority()).toBeUndefined();
    expect(off.suppressesGeneratedResource(42n)).toBeUndefined();
    // On, but the manifest was published without the authority extension.
    const bare = servingStore();
    const unextended = new WorldSource({ store: () => bare.store, pin: bare.pin });
    unextended.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    expect(unextended.collision(registry)).toBeUndefined();
    expect(unextended.suppressesGeneratedResource(42n)).toBeUndefined();
    // On and extended, but stale: the server falls back to its document, so does the client.
    const serving = servingStore(0, undefined, true);
    let stale = true;
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin, stale: () => stale });
    source.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
    expect(source.collision(registry)).toBeUndefined();
    expect(source.suppressesGeneratedResource(42n)).toBeUndefined();
    stale = false;
    expect(source.collision(registry)).toBeDefined();
    expect(source.suppressesGeneratedResource(42n)).toBe(true);
    expect(source.suppressesGeneratedResource(43n)).toBe(false);
    // Another space never serves chunk collision.
    const other = servingStore(7, undefined, true);
    expect(new WorldSource({ store: () => other.store, pin: other.pin }).collision(registry)).toBeUndefined();
  });

  it('builds collision once per render window from exactly its chunks, and rebuilds when the window changes', () => {
    const serving = servingStore(0, undefined, true);
    const source = new WorldSource({ store: () => serving.store, pin: serving.pin });
    source.setView({ minX: 300, minY: 300, maxX: 340, maxY: 322 });
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
