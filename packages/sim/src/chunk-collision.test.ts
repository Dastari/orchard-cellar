import { describe, expect, it } from 'vitest';
import {
  buildChunkWindowCollision, chunkAuthorityMetadata, chunkCollisionWindowBounds, composeChunkWindowCollision,
  type ChunkCollisionSource,
} from './chunk-collision.js';
import {
  collisionCellIndex, collisionTileIsBlocked, collisionTileIsBlockedAtPlane, findPlayerJumpLanding, movementPositionAllowed,
  positionCollides, positionCollidesOnlyHorseJumpableTerrain, terrainPlaneAtPosition,
} from './movement.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { hearthResourceGeometryAllows } from './hearth-resource-geometry.js';
import { activeHearthResourceSites } from './hearth-resource-sites.js';
import { firstProjectileTerrainHit } from './ranged.js';
import { TILE_SIZE_FIXED, type CollisionMap, type CollisionObstacle } from './state.js';
import type { TerrainTransition } from './terrain-elevation.js';
import { tileTargetIsBlocked } from './tile-targeting.js';
import {
  decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, WORLD_CHUNK_VOID,
  type ChunkArray, type WorldChunk, type WorldChunkManifest, type WorldChunkRecord,
} from './world-chunk.js';
import { cellFlags } from './cell-flags.js';

// Static world S4d: the client's windowed chunk collision and the origin-aware
// collision sampler. A 3 x 3 chunk map (192 x 176: the last row is partial) whose
// channels are simple functions of the tile, so every cell has a known answer.

const WIDTH = 192, HEIGHT = 176, PLANES = 2, MINIMUM = -1;
const T = TILE_SIZE_FIXED;
const groundBlocked = (x: number, y: number) => (x + 2 * y) % 11 === 0;
const elevation = (x: number) => Math.floor(x / 24) % 3 - 1;
const planeBlocked = (x: number, y: number, plane: number) => (x * 3 + y * 5 + plane) % 13 === 0;
const horse = (x: number, y: number) => (x + y) % 4 === 0;
const waterBlocked = (x: number, y: number) => (x * y) % 7 !== 0;
const medium = (x: number, y: number) => (x + y) % 5;
const solid = (x: number) => (x % 17 === 0 ? 1 : 0);

function wholeChannel(planes: number, value: (x: number, y: number, plane: number) => number, type: 'u8' | 'i16' = 'u8'): ChunkArray {
  const array = type === 'i16' ? new Int16Array(WIDTH * HEIGHT * planes) : new Uint8Array(WIDTH * HEIGHT * planes);
  for (let plane = 0; plane < planes; plane++) for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    array[plane * WIDTH * HEIGHT + y * WIDTH + x] = value(x, y, plane);
  }
  return array;
}
const CHANNELS: Record<string, ChunkArray> = {
  'authority.ground.blocked': wholeChannel(1, (x, y) => Number(groundBlocked(x, y))),
  'authority.ground.elevations': wholeChannel(1, elevation, 'i16'),
  'authority.ground.terrainPlaneBlocked': wholeChannel(PLANES, (x, y, plane) => Number(planeBlocked(x, y, plane))),
  'authority.ground.horseJumpableTerrain': wholeChannel(1, (x, y) => Number(horse(x, y))),
  'authority.water.blocked': wholeChannel(1, (x, y) => Number(waterBlocked(x, y))),
  'authority.combatRegion': wholeChannel(1, () => 0),
  medium: wholeChannel(1, medium),
  solidBlocked: wholeChannel(1, solid),
};
const box = (tileX: number, tileY: number, tiles = 1): CollisionObstacle =>
  ({ left: tileX * T, top: tileY * T, right: (tileX + tiles) * T - 1, bottom: (tileY + tiles) * T - 1 });
const obstacle = (kind: 'ground' | 'water', ordinal: number, group: 'base' | 'authored', groupOrdinal: number, at: CollisionObstacle): WorldChunkRecord => ({
  kind: `authority.${kind}.obstacle`, ordinal, tileX: Math.floor(at.left / T), tileY: Math.floor(at.top / T),
  value: { group, ordinal: groupOrdinal, ...at, sourceId: `${group}-${groupOrdinal}` },
});
/** Server stream order: base 0 (chunk 0:0), base 1 (1:0), base 2 (2:2), then authored 0 (0:1), authored 1 (2:0). */
const BASE = [box(10, 10, 2), box(70, 5), box(150, 140)];
const AUTHORED = [box(20, 90), box(140, 20)];
const TRANSITIONS: TerrainTransition[] = [
  { contourLevel: 0, kind: 'slope', direction: 'right', lowerTileX: 23, lowerTileY: 40, upperTileX: 24, upperTileY: 40 },
  { contourLevel: 1, kind: 'stairs', direction: 'right', lowerTileX: 71, lowerTileY: 40, upperTileX: 72, upperTileY: 40 },
];
const RECORDS: WorldChunkRecord[] = [
  obstacle('ground', 0, 'base', 0, BASE[0]!), obstacle('ground', 1, 'base', 1, BASE[1]!), obstacle('ground', 2, 'base', 2, BASE[2]!),
  obstacle('ground', 3, 'authored', 0, AUTHORED[0]!), obstacle('ground', 4, 'authored', 1, AUTHORED[1]!),
  obstacle('water', 0, 'base', 0, box(100, 100)), obstacle('water', 1, 'authored', 0, box(30, 30)),
  // The base box at 70,5 is suppressed; so is a box a live chest will occupy (finding B).
  { kind: 'authority.suppressedObstacleKey', ordinal: 0, tileX: 70, tileY: 5, value: { medium: 'ground', ...box(70, 5) } },
  { kind: 'authority.suppressedObstacleKey', ordinal: 1, tileX: 75, tileY: 6, value: { medium: 'ground', ...box(75, 6) } },
  { kind: 'authority.suppressedObstacleKey', ordinal: 2, tileX: 100, tileY: 100, value: { medium: 'water', ...box(100, 100) } },
  ...TRANSITIONS.map((value, ordinal): WorldChunkRecord => ({ kind: 'authority.ground.transition', ordinal, tileX: value.lowerTileX, tileY: value.lowerTileY, value: { ...value } })),
];

function fixture(options: { readonly withoutAuthority?: string; readonly authoritySchema?: 1 | 2 } = {}): { manifest: WorldChunkManifest; chunks: Map<string, WorldChunk> } {
  const chunks = new Map<string, WorldChunk>();
  const heads: WorldChunkManifest['chunks'][number][] = [];
  for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) {
    const key = `${cx}:${cy}`, authority = options.withoutAuthority !== key;
    const arrays = Object.fromEntries(Object.entries(CHANNELS)
      .filter(([name]) => authority || !name.startsWith('authority.'))
      .map(([name, value]) => [name, sliceWorldChunkChannel(value, WIDTH, HEIGHT, cx, cy, /blocked/iu.test(name) ? 1 : name === 'medium' ? WORLD_CHUNK_VOID : 0)]));
    const records = authority ? RECORDS.filter(item => Math.floor(item.tileX / 64) === cx && Math.floor(item.tileY / 64) === cy) : [];
    const bytes = encodeWorldChunk({ schema: 1, mediumSchema: 1, ...(authority ? { authoritySchema: options.authoritySchema ?? 1 } : {}), spaceId: 0, cx, cy,
      assetRevision: 'a', records, assetIds: [], atlasPackIds: [], arrays });
    const chunk = decodeWorldChunk(bytes);
    chunks.set(key, chunk);
    heads.push({ cx, cy, byteLength: bytes.length, contentHash: chunk.contentHash });
  }
  const manifest = { schema: 1, chunkSize: 64, spaceId: 0, width: WIDTH, height: HEIGHT, assetRevision: 'a', sourceRevision: 1, sourceHash: 'map',
    metadata: {
      channels: { 'authority.ground.terrainPlaneBlocked': { type: 'u8', planes: PLANES } },
      authority: { schema: 1, combatRegions: [{ id: 'arena', spaceId: 0, minX: 0, minY: 0, maxX: 10, maxY: 10, policy: 'hostile' }],
        generatedSuppressions: ['resource-7', 'decoration-3'],
        collisions: { ground: { hasTraversalChannels: true, terrainMinimumElevation: MINIMUM, terrainTransitions: true }, water: { hasTraversalChannels: true } } },
    }, chunks: heads } as unknown as WorldChunkManifest;
  return { manifest, chunks };
}
function source(options: { readonly withoutAuthority?: string; readonly resident?: (key: string) => boolean; readonly authoritySchema?: 1 | 2 } = {}): ChunkCollisionSource {
  const { manifest, chunks } = fixture(options);
  return { manifest, peekChunk: (cx, cy) => (options.resident?.(`${cx}:${cy}`) ?? true) ? chunks.get(`${cx}:${cy}`) : undefined };
}

/** The whole-map (server-shaped) maps of the same fixture, composed the server's way. */
function wholeMaps(live: readonly CollisionObstacle[] = []): { ground: CollisionMap; water: CollisionMap } {
  const booleans = (name: string) => cellFlags(CHANNELS[name]!);
  const traversalChannels = { width: WIDTH, height: HEIGHT, medium: CHANNELS['medium']!, solidBlocked: CHANNELS['solidBlocked']! };
  const suppressed = new Set([box(70, 5), box(75, 6)].map(({ left, top, right, bottom }) => `${left}:${top}:${right}:${bottom}`));
  return {
    ground: { traversalChannels, width: WIDTH, height: HEIGHT, blocked: booleans('authority.ground.blocked'),
      elevations: CHANNELS['authority.ground.elevations'] as Int16Array, terrainMinimumElevation: MINIMUM, terrainTransitions: TRANSITIONS,
      terrainPlaneBlocked: CHANNELS['authority.ground.terrainPlaneBlocked'] as Uint8Array, horseJumpableTerrain: booleans('authority.ground.horseJumpableTerrain'),
      obstacles: [...[...BASE, ...live].filter(o => !suppressed.has(`${o.left}:${o.top}:${o.right}:${o.bottom}`)), ...AUTHORED] },
    water: { traversalChannels, width: WIDTH, height: HEIGHT, blocked: booleans('authority.water.blocked'),
      horseJumpableTerrain: new Uint8Array(WIDTH * HEIGHT), obstacles: [box(30, 30)] },
  };
}

describe('origin-aware collision sampler (static world S4d)', () => {
  it('addresses cells from the origin and blocks every tile outside the window', () => {
    const map: CollisionMap = { width: 3, height: 2, originX: 100, originY: 50, blocked: cellFlags([false, true, false, false, false, true]) };
    expect(collisionCellIndex(map, 100, 50)).toBe(0);
    expect(collisionCellIndex(map, 102, 51)).toBe(5);
    expect([collisionCellIndex(map, 99, 50), collisionCellIndex(map, 103, 50), collisionCellIndex(map, 100, 49), collisionCellIndex(map, 100, 52)]).toEqual([-1, -1, -1, -1]);
    expect([collisionTileIsBlocked(map, 100, 50), collisionTileIsBlocked(map, 101, 50), collisionTileIsBlocked(map, 102, 51)]).toEqual([false, true, true]);
    // Tile (0, 0) is a real cell of a whole map but outside this window: blocked, never walkable.
    expect(collisionTileIsBlocked(map, 0, 0)).toBe(true);
    expect(collisionTileIsBlocked({ width: 3, height: 2, blocked: map.blocked }, 0, 0)).toBe(false);
    expect(positionCollides({ x: 100 * T + T / 2, y: 50 * T + T - 1 }, map)).toBe(false);
    expect(positionCollides({ x: 99 * T + T / 2, y: 50 * T + T - 1 }, map)).toBe(true);
  });

  it('answers exactly like the whole map for every movement, jump, placement and projectile query inside the window', () => {
    const whole = wholeMaps().ground;
    const window = buildChunkWindowCollision(source(), { cx: 1, cy: 0, columns: 2, rows: 3 });
    const windowed = composeChunkWindowCollision(window, 'ground');
    expect([windowed.originX, windowed.originY, windowed.width, windowed.height]).toEqual([64, 0, 128, 176]);
    let checked = 0;
    for (let tileY = 2; tileY < HEIGHT - 2; tileY += 3) for (let tileX = 66; tileX < WIDTH - 2; tileX += 3) {
      for (const [dx, dy] of [[0, 0], [5, 9], [15, 15]] as const) {
        const position = { x: tileX * T + dx * 16, y: tileY * T + dy * 16 + 1 };
        expect(terrainPlaneAtPosition(position, windowed)).toBe(terrainPlaneAtPosition(position, whole));
        expect(positionCollides(position, windowed)).toBe(positionCollides(position, whole));
        expect(positionCollidesOnlyHorseJumpableTerrain(position, windowed)).toBe(positionCollidesOnlyHorseJumpableTerrain(position, whole));
        for (const [mx, my] of [[T / 2, 0], [-T / 2, 0], [0, T / 2], [0, -T / 2]] as const) {
          const to = { x: position.x + mx, y: position.y + my };
          expect(movementPositionAllowed(position, to, windowed)).toBe(movementPositionAllowed(position, to, whole));
        }
        expect(findPlayerJumpLanding(position, 'right', windowed, 2, 2)).toEqual(findPlayerJumpLanding(position, 'right', whole, 2, 2));
        checked++;
      }
      expect(tileTargetIsBlocked(windowed, { tileX, tileY })).toBe(tileTargetIsBlocked(whole, { tileX, tileY }));
      for (let plane = MINIMUM; plane < MINIMUM + PLANES; plane++) {
        expect(collisionTileIsBlockedAtPlane(windowed, tileX, tileY, plane)).toBe(collisionTileIsBlockedAtPlane(whole, tileX, tileY, plane));
      }
      const from = { x: tileX * T + 8, y: tileY * T + 8 }, to = { x: from.x + 2 * T, y: from.y + T };
      expect(firstProjectileTerrainHit(from, to, windowed)).toEqual(firstProjectileTerrainHit(from, to, whole));
    }
    expect(checked).toBeGreaterThan(5_000);
    // Only the transition anchored inside the window is carried, and a step across it agrees.
    const lower = { x: 71 * T + T / 2, y: 40 * T + T - 1 + 6 * 16 }, upper = { x: 72 * T + T / 2, y: lower.y };
    expect(movementPositionAllowed(lower, upper, windowed)).toBe(movementPositionAllowed(lower, upper, whole));
    expect(windowed.terrainTransitions).toEqual([TRANSITIONS[1]]);
  });
});

/** Chunk `key` as a decoder sees a later, unknown authority version (records and channels intact). */
function laterAuthority(key: string): ChunkCollisionSource {
  const input = source();
  return { manifest: input.manifest, peekChunk: (cx, cy) => {
    const chunk = input.peekChunk(cx, cy);
    return chunk === undefined || `${cx}:${cy}` !== key ? chunk : { ...chunk, authoritySchema: 3 };
  } };
}

describe('buildChunkWindowCollision (static world S4d)', () => {
  it('composes the identical window from authority schema 2 (obstacle table) blobs (BUG-044)', () => {
    const rect = { cx: 0, cy: 0, columns: 3, rows: 3 }, live = [box(75, 6), box(80, 8)];
    const v1 = buildChunkWindowCollision(source(), rect), v2 = buildChunkWindowCollision(source({ authoritySchema: 2 }), rect);
    expect(v2.issues).toEqual([]);
    expect(v2.present.size).toBe(9);
    for (const medium of ['ground', 'water'] as const) {
      expect(composeChunkWindowCollision(v2, medium, live), medium).toEqual(composeChunkWindowCollision(v1, medium, live));
    }
  });
  it('reproduces every authority channel, record group, suppression and manifest field of the server composition', () => {
    const live = [box(75, 6), box(80, 8)];
    const whole = wholeMaps(live);
    const rect = { cx: 0, cy: 0, columns: 3, rows: 3 };
    const window = buildChunkWindowCollision(source(), rect);
    expect(window.issues).toEqual([]);
    expect(window.present.size).toBe(9);
    expect([window.originX, window.originY, window.width, window.height]).toEqual([0, 0, WIDTH, HEIGHT]);
    const ground = composeChunkWindowCollision(window, 'ground', live), water = composeChunkWindowCollision(window, 'water');
    for (const [name, map, reference] of [['ground', ground, whole.ground], ['water', water, whole.water]] as const) {
      expect(Object.keys(map).filter(key => key !== 'originX' && key !== 'originY'), name).toEqual(Object.keys(reference));
      expect(Array.from(map.blocked), name).toEqual(Array.from(reference.blocked));
      expect(map.obstacles, name).toEqual(reference.obstacles);
      expect(Array.from(map.traversalChannels!.medium), name).toEqual(Array.from(reference.traversalChannels!.medium));
      expect(Array.from(map.traversalChannels!.solidBlocked), name).toEqual(Array.from(reference.traversalChannels!.solidBlocked));
      expect(map.horseJumpableTerrain, name).toEqual(reference.horseJumpableTerrain);
    }
    expect(Array.from(ground.elevations!)).toEqual(Array.from(whole.ground.elevations!));
    expect(Array.from(ground.terrainPlaneBlocked!)).toEqual(Array.from(whole.ground.terrainPlaneBlocked!));
    expect(ground.terrainMinimumElevation).toBe(MINIMUM);
    expect(ground.terrainTransitions).toEqual(TRANSITIONS);
    // Finding B: the live box on a suppressed key is dropped with the suppressed base box; the other stays.
    expect(ground.obstacles).toEqual([BASE[0], BASE[2], box(80, 8), ...AUTHORED]);
    expect(water.obstacles).toEqual([box(30, 30)]);
    expect([...window.generatedSuppressions]).toEqual(['resource-7', 'decoration-3']);
    expect(window.combatRegions.map(({ id }) => id)).toEqual(['arena']);
  });

  it('keeps a window chunk that is not resident, or lacks the authority extension, void and solid', () => {
    const rect = { cx: 0, cy: 0, columns: 2, rows: 2 };
    for (const [label, input, kind] of [
      ['not resident', source({ resident: key => key !== '1:0' }), 'chunk_missing'],
      ['no authority', source({ withoutAuthority: '1:0' }), 'authority_missing'],
      // A later authority version decodes (its data unvalidated) but is never used: fall back.
      ['later authority version', laterAuthority('1:0'), 'authority_missing'],
    ] as const) {
      const window = buildChunkWindowCollision(input, rect);
      expect(window.issues, label).toEqual([{ kind, cx: 1, cy: 0 }]);
      expect(window.present.has('1:0'), label).toBe(false);
      const ground = composeChunkWindowCollision(window, 'ground'), water = composeChunkWindowCollision(window, 'water');
      for (let tileY = 0; tileY < 64; tileY++) for (let tileX = 64; tileX < 128; tileX++) {
        const cell = collisionCellIndex(ground, tileX, tileY);
        if (!ground.blocked[cell] || !water.blocked[cell] || ground.horseJumpableTerrain![cell] || ground.traversalChannels!.medium[cell] !== WORLD_CHUNK_VOID
          || ground.traversalChannels!.solidBlocked[cell] !== 1 || [0, 1].some(plane => ground.terrainPlaneBlocked![plane * ground.width * ground.height + cell] !== 1)) {
          throw new Error(`${label}: cell ${tileX},${tileY} is not void and solid`);
        }
        expect(positionCollides({ x: tileX * T + 8, y: tileY * T + T - 1 }, ground)).toBe(true);
      }
      // Its records are absent (the suppressed base box at 70,5 and its key lived there).
      expect(ground.obstacles, label).toEqual([BASE[0], AUTHORED[0]]);
      // The other chunks are untouched.
      expect(collisionTileIsBlocked(ground, 5, 5), label).toBe(groundBlocked(5, 5));
    }
  });

  it('checks record order in a window: a base record after an authored one, or a repeated ordinal, is incomplete', () => {
    const input = source();
    const rect = { cx: 0, cy: 0, columns: 1, rows: 2 };
    expect(buildChunkWindowCollision(input, rect).authorityIncomplete).toBe(false);
    const edited = (edit: (item: WorldChunkRecord) => WorldChunkRecord): ChunkCollisionSource => ({ manifest: input.manifest, peekChunk: (cx, cy) => {
      const chunk = input.peekChunk(cx, cy);
      return chunk === undefined || cx !== 0 || cy !== 0 ? chunk : { ...chunk, records: chunk.records.map(edit) };
    } });
    // Base 0 (chunk 0:0) moved after authored 0 (chunk 0:1, stream ordinal 3).
    const late = buildChunkWindowCollision(edited(item => item.kind === 'authority.ground.obstacle' ? { ...item, ordinal: 10 } : item), rect);
    expect(late.issues).toEqual([{ kind: 'record_order', detail: 'authority.ground.obstacle groups' }]);
    expect(late.authorityIncomplete).toBe(true);
    // The first transition given the second one's stream ordinal.
    const repeated = buildChunkWindowCollision(edited(item => item.kind === 'authority.ground.transition' ? { ...item, ordinal: 1 } : item),
      { cx: 0, cy: 0, columns: 2, rows: 1 });
    expect(repeated.issues).toEqual([{ kind: 'record_order', detail: 'authority.ground.transition' }]);
    // Not-yet-resident chunks alone are not an authority problem (spawn readiness, S4f).
    const loading = buildChunkWindowCollision(source({ resident: key => key !== '0:1' }), rect);
    expect([loading.issues, loading.authorityIncomplete]).toEqual([[{ kind: 'chunk_missing', cx: 0, cy: 1 }], false]);
  });

  it('clamps a window at the map edge, reads the manifest metadata once, and refuses a manifest without it', () => {
    expect(chunkCollisionWindowBounds({ cx: 1, cy: 1, columns: 2, rows: 2 }, WIDTH, HEIGHT)).toEqual({ originX: 64, originY: 64, width: 128, height: 112 });
    const input = source();
    expect(chunkAuthorityMetadata(input.manifest)).toBe(chunkAuthorityMetadata(input.manifest));
    const window = buildChunkWindowCollision(input, { cx: 2, cy: 2, columns: 1, rows: 1 });
    expect([window.originX, window.originY, window.width, window.height]).toEqual([128, 128, 64, 48]);
    expect(collisionTileIsBlocked(window.ground, 191, 175)).toBe(groundBlocked(191, 175));
    expect(collisionTileIsBlocked(window.ground, 191, 176)).toBe(true);
    const bare = { ...input.manifest, metadata: {} } as WorldChunkManifest;
    expect(chunkAuthorityMetadata(bare)).toBeUndefined();
    expect(() => buildChunkWindowCollision({ manifest: bare, peekChunk: input.peekChunk }, { cx: 0, cy: 0, columns: 1, rows: 1 })).toThrow('chunk_authority_metadata_missing');
  });
});

/** A window (origin set) cut from a whole map: what the client holds in chunk mode on. */
function crop(whole: CollisionMap, originX: number, originY: number, width: number, height: number): CollisionMap {
  const cells = <T>(values: ArrayLike<T>, planes = 1): T[] => {
    const result: T[] = [];
    for (let plane = 0; plane < planes; plane++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      result.push(values[plane * whole.width * whole.height + (originY + y) * whole.width + originX + x]!);
    }
    return result;
  };
  return { ...whole, width, height, originX, originY, blocked: Uint8Array.from(cells(whole.blocked)),
    ...(whole.elevations === undefined ? {} : { elevations: Int16Array.from(cells(whole.elevations)) }) };
}

describe('window collision for topside hearth resource sites (static world S4d)', () => {
  it('allows exactly the approaches the whole map allows, for every site', () => {
    const registry = bootstrapContentRegistry();
    const sites = activeHearthResourceSites(registry);
    expect(sites.length).toBeGreaterThan(0);
    const size = 832, elevations = new Int16Array(size * size);
    for (const site of sites) for (let y = site.tileY - 6; y <= site.tileY + 6; y++) for (let x = site.tileX - 6; x <= site.tileX + 6; x++) {
      elevations[y * size + x] = site.elevation;
    }
    const whole: CollisionMap = { width: size, height: size, blocked: new Uint8Array(size * size), elevations };
    let allowed = 0, compared = 0;
    for (const site of sites) {
      const window = crop(whole, Math.max(0, site.tileX - 160), Math.max(0, site.tileY - 160), 320, 320);
      expect(window.originX! + window.originY!, `site ${site.id} window has a non-zero origin`).toBeGreaterThan(0);
      for (let dy = -2 * T; dy <= 3 * T; dy += T / 4) for (let dx = -2 * T; dx <= 2 * T; dx += T / 4) {
        const position = { x: site.tileX * T + T / 2 + dx, y: site.tileY * T + T / 2 + dy };
        const expected = hearthResourceGeometryAllows(position, site.id, whole, registry);
        expect(hearthResourceGeometryAllows(position, site.id, window, registry), `${site.id} ${position.x},${position.y}`).toBe(expected);
        if (expected) allowed++;
        compared++;
      }
    }
    expect(allowed, 'some approaches are allowed on the whole map').toBeGreaterThan(sites.length);
    expect(compared).toBeGreaterThan(1_000);
  });
});
