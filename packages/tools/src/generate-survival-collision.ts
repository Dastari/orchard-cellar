import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSurvivalCollisionMap, SURVIVAL_WORLD_SEED } from '@orchard/sim';

/** Rebuild the fixed-seed server projection from the same generator used by clients.
 * Run from the repository root: npm run world:collision:generate -w @orchard/tools
 */
function numericRuns(values: Iterable<number | boolean>): readonly (readonly [number, number])[] {
  const runs: [number, number][] = [];
  for (const value of values) {
    const numeric = Number(value);
    const previous = runs[runs.length - 1];
    if (previous?.[0] === numeric) previous[1] += 1;
    else runs.push([numeric, 1]);
  }
  return runs;
}

const ground = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], 'ground');
const water = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], 'water');
if (ground.horseJumpableTerrain === undefined || ground.elevations === undefined
  || ground.terrainPlaneBlocked === undefined || ground.terrainTransitions === undefined
  || ground.terrainMinimumElevation !== 0 || water.width !== ground.width || water.height !== ground.height) {
  throw new Error('unsupported_survival_collision_projection');
}
const constants = [
  `const WIDTH = ${ground.width};`,
  `const HEIGHT = ${ground.height};`,
  `const GROUND_BLOCKED = decodeBooleans(WIDTH * HEIGHT, ${JSON.stringify(numericRuns(ground.blocked))});`,
  `const WATER_BLOCKED = decodeBooleans(WIDTH * HEIGHT, ${JSON.stringify(numericRuns(water.blocked))});`,
  `const HORSE_JUMPABLE = decodeBooleans(WIDTH * HEIGHT, ${JSON.stringify(numericRuns(ground.horseJumpableTerrain))});`,
  `const ELEVATIONS = decodeBytes(WIDTH * HEIGHT, ${JSON.stringify(numericRuns(ground.elevations))});`,
  `const TERRAIN_PLANE_BLOCKED = decodeBytes(${ground.terrainPlaneBlocked.length}, ${JSON.stringify(numericRuns(ground.terrainPlaneBlocked))});`,
  `const GROUND_TRANSITIONS = ${JSON.stringify(ground.terrainTransitions)} as const;`,
  `const GROUND_OBSTACLES = ${JSON.stringify(ground.obstacles)} as const;`,
  `const WATER_OBSTACLES = ${JSON.stringify(water.obstacles)} as const;`,
].join('\n');
const prelude = `import type { CollisionMap } from '@orchard/sim';

type NumericRun = readonly [value: number, length: number];

/** A per-cell flag plane: one byte per cell, 1 where set (CollisionMap.blocked). */
function decodeBooleans(length: number, runs: readonly NumericRun[]): Uint8Array {
  const values = new Uint8Array(length);
  let offset = 0;
  for (const [value, runLength] of runs) {
    values.fill(value !== 0 ? 1 : 0, offset, offset + runLength);
    offset += runLength;
  }
  if (offset !== length) throw new Error('invalid_precomputed_survival_collision');
  return values;
}

function decodeBytes(length: number, runs: readonly NumericRun[]): Uint8Array {
  const values = new Uint8Array(length);
  let offset = 0;
  for (const [value, runLength] of runs) {
    values.fill(value, offset, offset + runLength);
    offset += runLength;
  }
  if (offset !== length) throw new Error('invalid_precomputed_survival_collision');
  return values;
}

`;
const postlude = `
/** Build-time golden for the fixed production seed. This avoids executing the
 * O(width * height) procedural generator in a scheduled reducer. SpacetimeDB
 * does not guarantee module globals survive between reducer invocations. */
export function precomputedSurvivalCollisionMap(medium: 'ground' | 'water'): CollisionMap {
  if (medium === 'water') return {
    width: WIDTH,
    height: HEIGHT,
    blocked: WATER_BLOCKED,
    obstacles: WATER_OBSTACLES,
  };
  return {
    width: WIDTH,
    height: HEIGHT,
    blocked: GROUND_BLOCKED,
    elevations: ELEVATIONS,
    terrainMinimumElevation: 0,
    terrainTransitions: GROUND_TRANSITIONS,
    terrainPlaneBlocked: TERRAIN_PLANE_BLOCKED,
    horseJumpableTerrain: HORSE_JUMPABLE,
    obstacles: GROUND_OBSTACLES,
  };
}
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../world/src/precomputed-survival-collision.ts');
await writeFile(target, `${prelude}${constants}\n${postlude}`);
console.info(`Regenerated ${target}`);
