import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SPACES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  bootstrapContentRegistry,
  spaceDefinitionFor,
  type ContentRegistry,
  type SpaceDefinition,
} from '@orchard/sim';
import { terrainForSpace, terrainForWorld, type TerrainArray } from './terrain.js';

/** Per-field digest of a terrain: typed arrays by type and bytes, everything
 * else by stable JSON, so the golden pins every channel byte for byte. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (ArrayBuffer.isView(entry)) {
      const bytes = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
      return { typedArray: entry.constructor.name, base64: Buffer.from(bytes).toString('base64') };
    }
    if (entry instanceof Map) return { map: [...entry.entries()] };
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)));
    }
    return entry;
  });
}

function fingerprint(terrain: TerrainArray): Record<string, unknown> {
  const fields = Object.entries(terrain).sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(fields.map(([key, value]) => {
    if (value === undefined || value === null || typeof value !== 'object') return [key, value ?? null];
    const text = stableJson(value);
    return [key, text.length <= 64 ? JSON.parse(text) : `sha256:${createHash('sha256').update(text).digest('hex')}`];
  }));
}

const registry = bootstrapContentRegistry();
const architecture = (revision: number, cells: readonly object[]) => JSON.stringify({ recipeVersion: 1, revision: String(revision), cells });
const residenceCells = [
  { tileX: 20, tileY: 20, floor: 'townhouse', partition: 'wall' },
  { tileX: 21, tileY: 20, floor: 'stone' },
];

function instance(spaceId: number, row: Parameters<typeof spaceDefinitionFor>[1]): SpaceDefinition {
  const space = spaceDefinitionFor(spaceId, row);
  if (space === undefined) throw new Error(`no instance space ${spaceId}`);
  return space;
}

const handmade = (fields: Partial<SpaceDefinition> & Pick<SpaceDefinition, 'spaceId' | 'generator' | 'sizeTiles'>): SpaceDefinition => ({
  name: `${fields.generator}_${fields.spaceId}`, environment: 'indoor', ambient: 'clock', weather: false, audioBed: 'cave', ...fields,
});

/** Every non-island space kind terrainForSpace builds, with and without an
 * explicit content registry. The island is covered once at the end. */
function cases(): readonly { readonly name: string; readonly space: SpaceDefinition; readonly registry?: ContentRegistry; readonly seed: number; readonly version: number }[] {
  const out: { name: string; space: SpaceDefinition; registry?: ContentRegistry; seed: number; version: number }[] = [];
  const add = (name: string, space: SpaceDefinition, seed = 1234, version = 7) => {
    out.push({ name: `${name}/bootstrap`, space, seed, version });
    out.push({ name: `${name}/registry`, space, registry, seed, version });
  };
  for (const space of SPACES) if (space.generator !== 'island') add(`static:${space.spaceId}:${space.generator}`, space);
  for (const sizeTier of [0, 1, 2, 3]) {
    add(`homestead:tier${sizeTier}`, instance(10_000, { spaceId: 10_000, sizeTier, residenceSpaceId: 30_000, overworldTileX: 400, overworldTileY: 380 }), SURVIVAL_WORLD_SEED, 3);
  }
  add('homestead:no-site', instance(10_001, { spaceId: 10_001, residenceSpaceId: 30_002 }));
  for (const rank of [0, 1, 2]) {
    add(`residence:rank${rank}`, instance(30_000, { spaceId: 10_000, residenceSpaceId: 30_000, residenceExpansionRank: rank }));
    add(`residence:rank${rank}:architecture`, instance(30_000, {
      spaceId: 10_000, residenceSpaceId: 30_000, residenceExpansionRank: rank, residenceArchitectureJson: architecture(1, residenceCells),
    }));
  }
  add('cellar', instance(30_001, { spaceId: 10_000, residenceSpaceId: 30_000 }), 99, 2);
  for (const theme of ['cave', 'dungeon', 'volcanic']) for (const roomKind of ['combat', 'elite', 'shop', 'recovery', 'treasure', 'boss']) {
    add(`roguelike:${theme}:${roomKind}`, instance(40_000, { spaceId: 40_000, instanceKind: 'roguelike', seed: 0xbeef, roomNumber: 3, roomKind, theme }));
  }
  add('roguelike:seed2', instance(40_001, { spaceId: 40_001, instanceKind: 'roguelike', seed: 77, roomNumber: 1, roomKind: 'combat', theme: 'cave' }));
  add('roguelike:no-room', handmade({ spaceId: 40_002, generator: 'roguelike', sizeTiles: 32 }));
  add('mine', handmade({ spaceId: 50_000, generator: 'mine', sizeTiles: 48 }));
  add('debug_flat:handmade', handmade({ spaceId: 50_001, generator: 'debug_flat', sizeTiles: 16 }));
  add('village_interior:unknown', handmade({ spaceId: 50_002, generator: 'village_interior', sizeTiles: 32 }));
  add('delve_lobby:unknown', handmade({ spaceId: 50_003, generator: 'delve_lobby', sizeTiles: 24 }));
  return out;
}

describe('terrainForSpace output for every space kind', () => {
  it('matches the golden recorded from the pre-split terrain.ts (ce68068a)', async () => {
    const output: Record<string, unknown> = {};
    for (const { name, space, registry: explicit, seed, version } of cases()) {
      let first: TerrainArray;
      try { first = terrainForSpace(space, seed, version, explicit); } catch (error) {
        output[name] = { error: (error as Error).message };
        continue;
      }
      const second = terrainForSpace(space, seed, version, explicit);
      output[name] = { cachedIdentity: first === second, terrain: fingerprint(first) };
    }
    await expect(`${JSON.stringify(output, null, 1)}\n`).toMatchFileSnapshot('./space-terrain.golden.json');
  });

  it('keeps the island terrain and terrainForWorld identical to the recorded generator output', async () => {
    const island = SPACES.find((space) => space.generator === 'island')!;
    const world = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
    const output = {
      world: fingerprint(world),
      staticIsland: fingerprint(terrainForSpace(island, SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION)),
      worldCached: world === terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION),
    };
    await expect(`${JSON.stringify(output, null, 1)}\n`).toMatchFileSnapshot('./space-terrain-island.golden.json');
  });

  it('bounds residence architecture revisions in the cache exactly as before', () => {
    const space = (revision: number) => instance(30_100, {
      spaceId: 10_100, residenceSpaceId: 30_100, residenceExpansionRank: 1,
      residenceArchitectureJson: architecture(revision, [{ tileX: 20 + revision, tileY: 20, floor: 'stone' }]),
    });
    const first = terrainForSpace(space(1), 5, 5, registry);
    expect(terrainForSpace(space(1), 5, 5, registry)).toBe(first);
    for (let revision = 2; revision <= 6; revision += 1) terrainForSpace(space(revision), 5, 5, registry);
    const again = terrainForSpace(space(1), 5, 5, registry);
    expect(again).not.toBe(first);
    expect(fingerprint(again)).toEqual(fingerprint(first));
    expect(terrainForSpace(space(6), 5, 5, registry)).toBe(terrainForSpace(space(6), 5, 5, registry));
  });

  it('returns fresh fully blocked terrain for unknown authored interiors without caching it', () => {
    for (const generator of ['village_interior', 'delve_lobby'] as const) {
      const space = handmade({ spaceId: 50_010, generator, sizeTiles: 8 });
      const first = terrainForSpace(space, 1, 1, registry);
      expect(first.blocked.every(Boolean)).toBe(true);
      expect(terrainForSpace(space, 1, 1, registry)).not.toBe(first);
    }
  });
});
