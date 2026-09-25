/** Per-cell queries over a `TerrainArray`: biomes, elevations, projection,
 * contour and cliff plans, frame selection for terrain art, and plane
 * collision. Everything here reads the arrays it is given; nothing generates
 * terrain.
 *
 * Import boundary (static-world S6a): this module takes sim values only from
 * generator-free `@orchard/sim/*` leaf subpaths and never imports
 * `terrain.ts`, the island generator, the map compiler or the sim barrel, so
 * chunk-native renderers can use it without the generator. `terrain.ts`
 * re-exports all of it (one module instance: its elevation and contour caches
 * are module state). `space-terrain.test.ts` enforces the boundary. */
import type {
  RaisedTerrainContourPlan,
  RaisedTerrainGrid,
  RaisedTerrainRampRole,
  RaisedTerrainTilePlan,
  RaisedTerrainTileSet,
  ResolvedRuleFrame,
  TerrainOverride,
  TerrainTransition,
} from '@orchard/sim';
import { CAVE_RAISED_CLIFF_TILE_SET } from '@orchard/sim/cave-autotile';
import { PLAYER_HITBOX_FOOT_OFFSET } from '@orchard/sim/movement';
import {
  raisedTerrainProjectionRowsPerLevel,
  resolveRaisedTerrainContoursAt,
  resolveRaisedTerrainTile,
} from '@orchard/sim/raised-terrain-autotile';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim/state';
import { SURVIVAL_BIOMES, SURVIVAL_DIRT_CLIFF_ROLES, type SurvivalBiome } from '@orchard/sim/survival-biomes';
import { SURVIVAL_RAISED_CLIFF_TILE_SET } from '@orchard/sim/survival-tileset';
import {
  maximumTerrainElevation,
  minimumTerrainElevation,
  terrainElevationAt as sampleTerrainElevation,
  terrainProjectedDepthOffset,
  terrainTransitionLaneAt,
  terrainWalkingStepAllowed,
} from '@orchard/sim/terrain-elevation';
import { farmlandRuleLayers } from '@orchard/sim/terrain-rule-catalogue';
import { cliffFamilyAtIndex, TERRAIN_CLIFF_FAMILY_IDS, terrainCliffTileSet } from '@orchard/sim/terrain-tilesets';
import type { TerrainArray } from "./terrain-array.js";
import { terrainIndexAt, terrainIsWindow, terrainSparseKey } from "./terrain-index.js";
import { blob47FrameIndexFor } from "./tilemap.js";


export { SURVIVAL_BIOMES };
export { terrainContains, terrainIndexAt, type TerrainWindow } from "./terrain-index.js";
export type { TerrainArray } from "./terrain-array.js";

export const BIOME_COLORS = [
  "#0095e9",
  "#e4a672",
  "#0789d1",
  "#00b9f2",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#e8a261",
  "#e4a672",
  "#8f583c",
  "#7f8b42",
  "#16bed0",
  "#a8a34f",
  "#3e8948",
  "#e4a672",
  "#9c6754",
  "#66535d",
  "#ed632c",
  "#d8b38a",
] as const;

const WATER = 0;


export function terrainBiomeAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): SurvivalBiome {
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (index < 0) return "water";
  return (
    SURVIVAL_BIOMES[terrain.biomes[index] ?? WATER] ??
    "water"
  );
}

export function terrainColorAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): string {
  const index = terrainIndexAt(terrain, tileX, tileY);
  const biome = index < 0 ? WATER : (terrain.biomes[index] ?? WATER);
  return BIOME_COLORS[biome] ?? BIOME_COLORS[WATER];
}

function edgeFrameIndex(
  north: boolean,
  east: boolean,
  south: boolean,
  west: boolean,
): number {
  if (north && west) return 0;
  if (north && east) return 2;
  if (south && west) return 6;
  if (south && east) return 8;
  if (north) return 1;
  if (west) return 3;
  if (east) return 5;
  if (south) return 7;
  return 4;
}

function oceanWaterBiome(biome: SurvivalBiome): boolean {
  return biome === "water";
}

function freshwaterBiome(biome: SurvivalBiome): boolean {
  return biome === "freshwater" || biome === "waterfall" || biome === "water";
}

export function beachFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const water = (offsetX: number, offsetY: number): boolean =>
    oceanWaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = water(0, -1);
  const east = water(1, 0);
  const south = water(0, 1);
  const west = water(-1, 0);
  return edgeFrameIndex(north, east, south, west);
}

function vegetatedBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "plains" ||
    biome === "meadow" ||
    biome === "forest" ||
    biome === "valley" ||
    biome === "highland" ||
    biome === "oasis" ||
    biome === "savanna"
  );
}

function darkGrassBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "plains" ||
    biome === "meadow" ||
    biome === "forest" ||
    biome === "valley" ||
    biome === "highland"
  );
}

function desertGroundBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "desert" || biome === "desert_shore" || biome === "desert_ridge"
  );
}

/** The authored 47-frame fringe is drawn on sandy cells, but ocean counts as
 * part of the mask so the grass fringe is emitted only along landward edges. */
export function grassSandTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "beach") return null;
  const frame = blob47FrameIndexFor(
    (offsetX, offsetY) =>
      !vegetatedBiome(
        terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
      ),
  );
  return frame === 46 ? null : frame;
}

/** Paving uses the same native grass fringe, including diagonal inside corners.
 * Water/bridge decks count as continuous pavement so quay ends stay unobstructed. */
export function pavingGrassTransitionFrameIndexAt(terrain: TerrainArray,tileX:number,tileY:number):number|null {
  if(terrainBiomeAt(terrain,tileX,tileY)!=='paving')return null;
  const frame=blob47FrameIndexFor((dx,dy)=>!vegetatedBiome(terrainBiomeAt(terrain,tileX+dx,tileY+dy)));
  return frame===46?null:frame;
}

/** Savanna is the ecological buffer between humid grass and bare desert. Its
 * licensed olive fill receives a dark-grass blob fringe on only the humid side. */
export function savannaGrassTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "savanna") return null;
  const frame = blob47FrameIndexFor(
    (offsetX, offsetY) =>
      !darkGrassBiome(
        terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
      ),
  );
  return frame === 46 ? null : frame;
}

/** The desert pack supplies its own olive grass fringe as a 3x3 edge set. */
export function desertGrassEdgeFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return null;
  const grass = (offsetX: number, offsetY: number): boolean =>
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  return edgeFrameIndex(grass(0, -1), grass(1, 0), grass(0, 1), grass(-1, 0));
}

export function desertGrassInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return [];
  const grass = (offsetX: number, offsetY: number): boolean =>
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = grass(0, -1);
  const east = grass(1, 0);
  const south = grass(0, 1);
  const west = grass(-1, 0);
  const frames: number[] = [];
  if (!south && !east && grass(1, 1)) frames.push(0);
  if (!south && !west && grass(-1, 1)) frames.push(1);
  if (!north && !east && grass(1, -1)) frames.push(2);
  if (!north && !west && grass(-1, -1)) frames.push(3);
  return frames;
}

/** The shoreline sheets place their four inward corners in a 2x2 block after
 * the outer 3x3 tiles: SE, SW, NE, NW. They are needed when only a diagonal
 * neighbour is water, as happens at the inside of a cove. */
export function shorelineInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  if (biome !== "beach" && biome !== "desert_shore") return [];
  const water = (offsetX: number, offsetY: number): boolean => {
    const neighbor = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === "beach"
      ? neighbor === "water"
      : neighbor === "water" || neighbor === "oasis_water";
  };
  const north = water(0, -1);
  const east = water(1, 0);
  const south = water(0, 1);
  const west = water(-1, 0);
  const frames: number[] = [];
  if (!south && !east && water(1, 1)) frames.push(0);
  if (!south && !west && water(-1, 1)) frames.push(1);
  if (!north && !east && water(1, -1)) frames.push(2);
  if (!north && !west && water(-1, -1)) frames.push(3);
  return frames;
}

/** Grass-edged freshwater frames are selected from the water tile itself, so
 * exposed sides are the neighboring non-water sides rather than adjacent water. */
export function freshwaterFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const land = (offsetX: number, offsetY: number): boolean =>
    !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  return edgeFrameIndex(land(0, -1), land(1, 0), land(0, 1), land(-1, 0));
}

/** Water Tile 1 supplies four inverse banks as full frames. Rendering only
 * one loses the opposite corner of a two-tile diagonal river, producing the
 * square blue protrusions visible at every bend. The runtime uses water-keyed
 * transparent extracts of those frames, so every valid diagonal can compose
 * over the cardinal base. Frame order is SE, SW, NE, NW. */
export function freshwaterInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "freshwater") return [];
  const land = (offsetX: number, offsetY: number): boolean =>
    !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = land(0, -1);
  const east = land(1, 0);
  const south = land(0, 1);
  const west = land(-1, 0);
  const frames: number[] = [];
  if (!south && !east && land(1, 1)) frames.push(0);
  if (!south && !west && land(-1, 1)) frames.push(1);
  if (!north && !east && land(1, -1)) frames.push(2);
  if (!north && !west && land(-1, -1)) frames.push(3);
  return frames;
}

function waterDecorationGroup(biome: SurvivalBiome): number {
  if (biome === "water") return 1;
  if (biome === "freshwater" || biome === "waterfall") return 2;
  if (biome === "oasis_water") return 3;
  return 0;
}

/** Water details only occupy uninterrupted interior water, never a bank frame. */
export function waterDecorationAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  const group = waterDecorationGroup(terrainBiomeAt(terrain, tileX, tileY));
  if (group === 0 || terrainBiomeAt(terrain, tileX, tileY) === "waterfall")
    return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (
        waterDecorationGroup(
          terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
        ) !== group
      )
        return false;
    }
  }
  return true;
}

export function terrainDecorationHash(tileX: number, tileY: number): number {
  return (Math.imul(tileX, 73_856_093) ^ Math.imul(tileY, 19_349_663)) >>> 0;
}

export function grassTuftAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  // Biomes are deliberately reused as inexpensive substrate data by indoor
  // generators. They must not inherit outdoor ambient decoration merely
  // because their backing tile happens to be classified as plains.
  if (
    terrain.generator !== "island" &&
    terrain.generator !== "homestead" &&
    terrain.generator !== "debug_flat"
  )
    return false;
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  if (biome !== "plains" && biome !== "meadow" && biome !== "forest")
    return false;
  return (
    terrainDecorationHash(tileX, tileY) % (biome === "meadow" ? 9 : 23) === 0
  );
}

export function animatedWaterRockAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  const hash = terrainDecorationHash(tileX, tileY);
  return (
    (biome === "freshwater" || biome === "oasis_water") &&
    waterDecorationAllowedAt(terrain, tileX, tileY) &&
    hash % 113 === 0 &&
    hash % 13 !== 0
  );
}

export function waterfallTopLeftAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return (
    terrainBiomeAt(terrain, tileX, tileY) === "waterfall" &&
    terrainBiomeAt(terrain, tileX - 1, tileY) !== "waterfall" &&
    terrainBiomeAt(terrain, tileX, tileY - 1) !== "waterfall"
  );
}

/** Raised waterfalls are composed in the depth queue rather than baked into
 * the ground cache. Test a complete local fall neighbourhood so every member
 * cell makes the same decision, not only its north-west anchor. */
export function waterfallUsesRaisedCompositionAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "waterfall") return false;
  let minimumElevation = Number.POSITIVE_INFINITY;
  let maximumElevation = Number.NEGATIVE_INFINITY;
  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      if (terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) !== "waterfall")
        continue;
      const elevation = terrainElevationAt(
        terrain,
        tileX + offsetX,
        tileY + offsetY,
      );
      minimumElevation = Math.min(minimumElevation, elevation);
      maximumElevation = Math.max(maximumElevation, elevation);
    }
  }
  return maximumElevation > minimumElevation;
}

export function desertShoreFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const water = (offsetX: number, offsetY: number): boolean => {
    const biome = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === "water" || biome === "oasis_water";
  };
  return edgeFrameIndex(water(0, -1), water(1, 0), water(0, 1), water(-1, 0));
}

export function waterfallFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "waterfall") return null;
  const waterfall = (offsetX: number, offsetY: number): boolean =>
    terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) === "waterfall";
  const column = !waterfall(-1, 0) ? 0 : !waterfall(1, 0) ? 2 : 1;
  const row = !waterfall(0, -1)
    ? 0
    : !waterfall(0, 1)
      ? 4
      : !waterfall(0, -2)
        ? 1
        : !waterfall(0, 2)
          ? 3
          : 2;
  return row * 3 + column;
}

function plateauAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return terrainElevationAt(terrain, tileX, tileY) >= 1;
}

export function terrainElevationAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  // Negative form of the window test, so NaN counts as inside exactly as the
  // historical `tileX < 0 || ...` check did (S4c: window-relative).
  const index = terrainIndexAt(terrain, tileX, tileY);
  const outside = index < 0;
  // An interior map is a window cut into a continuous solid mass one level
  // above its floor datum. Treating its array boundary as open floor creates a
  // false rectangular cliff. Bounds are checked before any family lookup
  // because this is a hot resolver callback and projection is a space
  // property, not a per-cell art property.
  if (outside && terrainProjectionStyle(terrain) === 'interior') {
    return terrainBaseDatum(terrain) + 1;
  }
  if (!terrainIsWindow(terrain)) {
    return sampleTerrainElevation(
      terrain.elevations,
      terrain.width,
      terrain.height,
      tileX,
      tileY,
    );
  }
  // Same answers as the sampler (0 outside, `?? 0` inside) on window-local cells.
  return outside ? 0 : terrain.elevations[index] ?? 0;
}

export function terrainElevationAtWorldFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  const fixedPlane = terrainFixedPlane(terrain);
  if (fixedPlane !== undefined) return fixedPlane;
  return terrainElevationAt(
    terrain,
    Math.floor(worldX / 16),
    Math.floor((worldFootY - 0.001) / 16),
  );
}

/** The avatar authority anchor sits below its physical shoe contact. Terrain
 * presentation must sample the same point as the shared movement solver. */
export function terrainContactWorldYForPlayer(worldAnchorY: number): number {
  return worldAnchorY - (PLAYER_HITBOX_FOOT_OFFSET + 1) / FIXED_UNITS_PER_PIXEL;
}

function dirtCliffRoleAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): (typeof SURVIVAL_DIRT_CLIFF_ROLES)[number] {
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (index < 0) return "none";
  return (
    SURVIVAL_DIRT_CLIFF_ROLES[
      terrain.dirtCliffRoles[index] ?? 0
    ] ?? "none"
  );
}

function dirtTerraceAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (index < 0) return false;
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  return (
    terrain.dirtTerraces[index] === 1 &&
    (biome === "dirt_terrace" || biome === "dirt_ridge")
  );
}

/** Stone Cliff 1 plugs into the generic raised-terrain topology. Other natural
 * wall sheets provide another data object rather than another resolver. */
export const STONE_RAISED_CLIFF_TILE_SET = SURVIVAL_RAISED_CLIFF_TILE_SET;

// Keep the cave tileset visible to renderer consumers while its frame-role
// contract lives beside the shared mountain contract in @orchard/sim.
export { CAVE_RAISED_CLIFF_TILE_SET };

export function terrainCliffFamilyAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): string {
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (index >= 0) {
    const overrideFamily = terrain.terrainOverrides?.[index]?.family;
    if (overrideFamily !== undefined) return overrideFamily;
    const ordinal = terrain.cliffFamilies?.[index];
    if (ordinal !== undefined) {
      const family = terrain.cliffFamilyIds?.[ordinal - 1] ?? cliffFamilyAtIndex(ordinal);
      if (family !== null) return family;
    }
  }
  return terrain.defaultCliffFamily ?? 'stone_1';
}

function planWithTerrainOverride(
  plan: RaisedTerrainTilePlan,
  tileSet: RaisedTerrainTileSet,
  override: TerrainOverride | null | undefined,
  contourLevel: number,
): RaisedTerrainTilePlan {
  if (override === null || override === undefined
    || override.contourLevel !== contourLevel
    || (override.role === undefined && override.frameIndex === undefined)) return plan;
  const frame = override.frameIndex;
  const role = override.role;
  if (role?.startsWith('face.')) {
    const [, rowId, join] = role.split('.');
    const index = plan.faceLayers.findIndex((face) => face.rowId === rowId && face.join === join);
    if (index >= 0 && frame !== undefined) {
      const faceLayers = [...plan.faceLayers];
      faceLayers[index] = { ...faceLayers[index]!, frame };
      return { ...plan, faceLayers };
    }
  }
  if (role !== undefined && role in tileSet.edgeFrames) {
    return { ...plan, edgeRole: role as typeof plan.edgeRole, edgeFrame: frame ?? tileSet.edgeFrames[role as keyof typeof tileSet.edgeFrames] ?? null };
  }
  if (role !== undefined && role in tileSet.insetFrames) {
    const insetRole = role as typeof plan.insetRoles[number];
    const insetFrame = frame ?? tileSet.insetFrames[insetRole];
    return insetFrame === undefined ? plan : { ...plan, insetRoles: [insetRole], insetFrames: [insetFrame] };
  }
  if (role !== undefined && role in tileSet.rampFrames) {
    const rampRole = role as RaisedTerrainRampRole;
    return { ...plan, rampRole, rampFrame: frame ?? tileSet.rampFrames[rampRole] ?? null };
  }
  if (frame === undefined) return plan;
  if (plan.rampFrame !== null) return { ...plan, rampFrame: frame };
  if (plan.insetFrames.length > 0) {
    const insetFrames = [...plan.insetFrames];
    insetFrames[insetFrames.length - 1] = frame;
    return { ...plan, insetFrames };
  }
  if (plan.edgeFrame !== null) return { ...plan, edgeFrame: frame };
  if (plan.faceLayers.length > 0) {
    const faceLayers = [...plan.faceLayers];
    faceLayers[faceLayers.length - 1] = { ...faceLayers[faceLayers.length - 1]!, frame };
    return { ...plan, faceLayers };
  }
  return plan;
}

const faceReachCache = new WeakMap<object, number>();
/**
 * A bound, in tiles, on how far north a raised-terrain contour plan reads from
 * its tile (static world S4f: the light preparation's reuse radius must cover
 * it). A face reads its source tiles up to its deepest course: every face row
 * of any tileset the terrain can name (its resolver's families and the built-in
 * ones), plus one projected course per level of the terrain's elevation span,
 * plus the contour grid's neighbour ring.
 */
export function terrainRaisedFaceReach(terrain: TerrainArray): number {
  const key = terrain.tilesets ?? faceReachCache;
  let rows = faceReachCache.get(key);
  if (rows === undefined) {
    const sets = [STONE_RAISED_CLIFF_TILE_SET, CAVE_RAISED_CLIFF_TILE_SET,
      ...TERRAIN_CLIFF_FAMILY_IDS.map((family) => terrainCliffTileSet(family)),
      ...(terrain.tilesets?.familyIds ?? []).map((family) => terrain.tilesets!.tileSetFor(family))];
    rows = 0;
    for (const set of sets) {
      if (set === null) continue;
      for (const profile of Object.values(set.faceProfiles)) rows = Math.max(rows, profile.rows.length);
      rows = Math.max(rows, raisedTerrainProjectionRowsPerLevel(set));
    }
    faceReachCache.set(key, rows);
  }
  const span = Math.max(0, terrainMaximumElevation(terrain) - Math.min(terrainMinimumElevation(terrain), terrainBaseDatum(terrain)));
  return rows * Math.max(1, span) + 2;
}

export function raisedCliffTileSetFor(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): RaisedTerrainTileSet {
  const family = terrainCliffFamilyAt(terrain, tileX, tileY);
  return terrain.tilesets?.tileSetFor(family)
    ?? terrainCliffTileSet(family)
    ?? STONE_RAISED_CLIFF_TILE_SET;
}

function terrainDefaultCliffTileSet(terrain: TerrainArray): RaisedTerrainTileSet {
  const family = terrain.defaultCliffFamily ?? 'stone_1';
  return terrain.tilesets?.tileSetFor(family)
    ?? terrainCliffTileSet(family)
    ?? STONE_RAISED_CLIFF_TILE_SET;
}

export function terrainProjectionStyle(
  terrain: TerrainArray,
): RaisedTerrainTileSet['projectionStyle'] {
  return terrain.projectionStyle ?? terrainDefaultCliffTileSet(terrain).projectionStyle;
}

export function terrainBaseDatum(terrain: TerrainArray): number {
  return terrain.baseDatum ?? terrainDefaultCliffTileSet(terrain).baseDatum ?? 0;
}

export function terrainFixedPlane(terrain: TerrainArray): number | undefined {
  if ('fixedTerrainPlane' in terrain) return terrain.fixedTerrainPlane ?? undefined;
  return terrainDefaultCliffTileSet(terrain).fixedPlane;
}

function plateauRampRoleAt(
  terrain: TerrainArray,
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  const lane = terrainTransitionLaneAt(
    terrain.terrainTransitions ?? [], contourLevel, tileX, tileY,
  );
  if (lane === null) return null;
  return `ramp_${lane.endpoint === 'upper' ? 'top' : 'bottom'}_${lane.position}`;
}

const plateauGridCache = new WeakMap<TerrainArray, RaisedTerrainGrid>();
const maximumElevationCache = new WeakMap<TerrainArray, number>();
const minimumElevationCache = new WeakMap<TerrainArray, number>();
const contourPlanCache = new WeakMap<
  TerrainArray,
  Map<number, readonly RaisedTerrainContourPlan[]>
>();
const transitionsByTileCache = new WeakMap<
  TerrainArray,
  Map<number, readonly TerrainTransition[]>
>();

function plateauGridFor(terrain: TerrainArray): RaisedTerrainGrid {
  let grid = plateauGridCache.get(terrain);
  if (!grid) {
    grid = {
      raisedAt: (tileX, tileY) => plateauAt(terrain, tileX, tileY),
      rampRoleAt: (tileX, tileY) => plateauRampRoleAt(terrain, 1, tileX, tileY),
    };
    plateauGridCache.set(terrain, grid);
  }
  return grid;
}

export function plateauLayerPlanAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): RaisedTerrainTilePlan {
  return resolveRaisedTerrainTile(
    plateauGridFor(terrain),
    raisedCliffTileSetFor(terrain, tileX, tileY),
    "tall",
    tileX,
    tileY,
  );
}

export function plateauLayerPlansAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly RaisedTerrainContourPlan[] {
  let plansByTile = contourPlanCache.get(terrain);
  if (plansByTile === undefined) {
    plansByTile = new Map();
    contourPlanCache.set(terrain, plansByTile);
  }
  // A cache key, not an array index: callers probe neighbours past the edge,
  // and those keys must keep their historical values. Kept by hand (S4b).
  const tileKey = terrainSparseKey(terrain, tileX, tileY);
  const cached = plansByTile.get(tileKey);
  if (cached !== undefined) return cached;
  const tileSet = raisedCliffTileSetFor(terrain, tileX, tileY);
  const baseDatum = terrainBaseDatum(terrain);
  const maximumElevation = Math.max(terrainMaximumElevation(terrain), baseDatum);
  const overrideIndex = terrainIndexAt(terrain, tileX, tileY);
  const override = overrideIndex >= 0
    ? terrain.terrainOverrides?.[overrideIndex]
    : null;
  const plans = resolveRaisedTerrainContoursAt(
    (x, y) => terrainElevationAt(terrain, x, y),
    maximumElevation,
    tileSet,
    "tall",
    tileX,
    tileY,
    (contourLevel, x, y) => plateauRampRoleAt(terrain, contourLevel, x, y),
    Math.min(terrainMinimumElevation(terrain), baseDatum) + 1,
  );
  const overridden = plans.map(({ contourLevel, plan }) => ({
    contourLevel,
    plan: planWithTerrainOverride(plan, tileSet, override, contourLevel),
  }));
  plansByTile.set(tileKey, overridden);
  return overridden;
}

export function terrainMaximumElevation(terrain: TerrainArray): number {
  let maximumElevation = maximumElevationCache.get(terrain);
  if (maximumElevation === undefined) {
    maximumElevation = terrain.elevationRange?.maximum ?? maximumTerrainElevation(terrain.elevations);
    maximumElevationCache.set(terrain, maximumElevation);
  }
  return maximumElevation;
}

export function terrainMinimumElevation(terrain: TerrainArray): number {
  let minimumElevation = minimumElevationCache.get(terrain);
  if (minimumElevation === undefined) {
    minimumElevation = terrain.elevationRange?.minimum ?? minimumTerrainElevation(terrain.elevations);
    minimumElevationCache.set(terrain, minimumElevation);
  }
  return minimumElevation;
}

/** Seeds the two elevation caches when a worker or overview pass has already
 * measured the same immutable terrain. This avoids repeating an O(map area)
 * scan on the first inspector interaction. */
export function primeTerrainElevationRange(
  terrain: TerrainArray,
  minimumElevation: number,
  maximumElevation: number,
): void {
  minimumElevationCache.set(terrain, minimumElevation);
  maximumElevationCache.set(terrain, maximumElevation);
}

function cellarWallTileIsExposed(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  // Only interior tiles qualify: both diagonal corners must be in the window.
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (
    terrainIndexAt(terrain, tileX - 1, tileY - 1) < 0 ||
    terrainIndexAt(terrain, tileX + 1, tileY + 1) < 0 ||
    !terrain.blocked[index]
  )
    return false;
  return (
    terrain.blocked[terrainIndexAt(terrain, tileX, tileY - 1)] === 0 ||
    terrain.blocked[terrainIndexAt(terrain, tileX + 1, tileY)] === 0 ||
    terrain.blocked[terrainIndexAt(terrain, tileX, tileY + 1)] === 0 ||
    terrain.blocked[terrainIndexAt(terrain, tileX - 1, tileY)] === 0
  );
}

/** True for solid cellar rock with at least one open orthogonal neighbour:
 * the only rock a pickaxe may strike. */
export function cellarExposedWallAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return cellarWallTileIsExposed(terrain, tileX, tileY);
}

/** Maps the tile under a drawn cave-wall pixel back to the solid source tile
 * that owns it. Rock is displaced north by its wall height, so a drawn cell
 * shows either the rim of the rock two rows south or a face course whose
 * source is the south edge below it. This keeps pointer targeting in the same
 * logical coordinate system as server collision. */
export function cellarWallSourceAtProjectedTile(
  terrain: TerrainArray,
  projectedTileX: number,
  projectedTileY: number,
): { readonly tileX: number; readonly tileY: number } | null {
  if (terrainProjectionStyle(terrain) !== 'interior') return null;
  const sourceProjectionRows = terrainVisualProjectionRowsPerLevel(terrain);
  const logicalTileY = projectedTileY + sourceProjectionRows;
  if (cellarWallTileIsExposed(terrain, projectedTileX, logicalTileY)) {
    return { tileX: projectedTileX, tileY: logicalTileY };
  }
  for (const { plan } of plateauLayerPlansAt(
    terrain,
    projectedTileX,
    logicalTileY,
  )) {
    const face = plan.faceLayers.find((layer) => layer.direct);
    if (face === undefined) continue;
    const sourceTileY = logicalTileY - face.depth;
    if (cellarWallTileIsExposed(terrain, projectedTileX, sourceTileY)) {
      return { tileX: projectedTileX, tileY: sourceTileY };
    }
  }
  return null;
}

export function terrainProjectedDepthAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  return terrainProjectedDepthForElevation(
    terrain,
    terrainProjectedElevationAtFoot(terrain, worldX, worldFootY),
  );
}

/** Converts a logical plane to its screen displacement using the selected
 * family's datum and visual projection. This is also the canonical editor
 * overlay/picking transform for signed elevations. */
export function terrainProjectedDepthForElevation(
  terrain: TerrainArray,
  elevation: number,
): number {
  return terrainProjectedDepthOffset(
    elevation,
    terrainVisualProjectionRowsPerLevel(terrain),
    16,
    terrainBaseDatum(terrain),
  );
}

function terrainTransitionsByTile(
  terrain: TerrainArray,
): Map<number, readonly TerrainTransition[]> {
  let byTile = transitionsByTileCache.get(terrain);
  if (byTile !== undefined) return byTile;
  const mutable = new Map<number, TerrainTransition[]>();
  for (const transition of terrain.terrainTransitions ?? []) {
    for (const [tileX, tileY] of [
      [transition.lowerTileX, transition.lowerTileY],
      [transition.upperTileX, transition.upperTileY],
    ] as const) {
      // Sparse key over authored data, not an array index: kept by hand so
      // any off-map endpoint keys exactly as before (S4b; S4c re-keys).
      const key = terrainSparseKey(terrain, tileX, tileY);
      const entries = mutable.get(key) ?? [];
      entries.push(transition);
      mutable.set(key, entries);
    }
  }
  byTile = mutable;
  transitionsByTileCache.set(terrain, byTile);
  return byTile;
}

/** Continuous presentation elevation along an authored crossing. Collision
 * remains integer and authoritative; only the 2.5D screen projection blends
 * between the lower and upper tile centres. */
export function terrainProjectedElevationAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  const tileX = Math.floor(worldX / 16);
  const tileY = Math.floor((worldFootY - 0.001) / 16);
  const fixedPlane = terrainFixedPlane(terrain);
  if (fixedPlane !== undefined) return fixedPlane;
  const baseElevation = terrainElevationAt(terrain, tileX, tileY);
  // Same hand-kept sparse key as terrainTransitionsByTile (feet may be off-map).
  const transitions =
    terrainTransitionsByTile(terrain).get(terrainSparseKey(terrain, tileX, tileY)) ?? [];
  for (const transition of transitions) {
    if (transition.kind !== "slope" && transition.kind !== "stairs") continue;
    const lowerX = (transition.lowerTileX + 0.5) * 16;
    const lowerY = (transition.lowerTileY + 0.5) * 16;
    const deltaX = (transition.upperTileX - transition.lowerTileX) * 16;
    const deltaY = (transition.upperTileY - transition.lowerTileY) * 16;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    const progress =
      ((worldX - lowerX) * deltaX + (worldFootY - lowerY) * deltaY) /
      distanceSquared;
    if (progress < 0 || progress > 1) continue;
    const perpendicular =
      Math.abs((worldX - lowerX) * deltaY - (worldFootY - lowerY) * deltaX) /
      Math.sqrt(distanceSquared);
    if (perpendicular > 8) continue;
    return transition.contourLevel - 1 + progress;
  }
  return baseElevation;
}

const TERRAIN_PLANE_SORT_EPSILON = 1 / 1_024;

/** Stable sub-pixel tie-break within the explicit elevation/phase ordering.
 * Projection affects drawing; it never replaces the logical foot-Y key. */
export function terrainProjectedSortOffset(
  elevation: number,
  boundary = false,
): number {
  return (elevation - (boundary ? 0.5 : 0)) * TERRAIN_PLANE_SORT_EPSILON;
}

/** Screen-space projection for 2.5D terrain. Logical coordinates and server
 * collision remain unchanged; raised surfaces and their occupants render
 * north by the selected face height, creating a lower-plane walk-behind band. */
export function terrainProjectedWorldYAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  return worldFootY - terrainProjectedDepthAtFoot(terrain, worldX, worldFootY);
}

export type TerrainContourBoundary = "none" | "blocked" | "transition";
export type TerrainPlaneCollisionCell = "open" | "blocked" | "transition";

/** Classifies one logical tile for the actor's current elevation plane. This
 * is the debug/editor counterpart of the movement guard: other elevations are
 * solid, while authored slope/stair endpoints remain visibly traversable. */
export function terrainPlaneCollisionCellAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  activeElevation: number,
): TerrainPlaneCollisionCell {
  const index = terrainIndexAt(terrain, tileX, tileY);
  if (index < 0) return "blocked";
  if (terrainFixedPlane(terrain) !== undefined) {
    // The map's own border ring in world tiles. A chunk render window (S4c)
    // keeps the map border, never its own edge, via worldWidth/worldHeight.
    const lastX = (terrain.worldWidth ?? terrain.width) - 1;
    const lastY = (terrain.worldHeight ?? terrain.height) - 1;
    if (tileX === 0 || tileY === 0 || tileX === lastX || tileY === lastY) {
      return "blocked";
    }
    if (terrain.terrainPlaneBlocked === undefined) return "open";
    const stride = terrain.width * terrain.height;
    const planeIndex = activeElevation - terrainMinimumElevation(terrain);
    return planeIndex >= 0 && terrain.terrainPlaneBlocked[planeIndex * stride + index] === 1
      ? "blocked"
      : "open";
  }
  if ((terrain.blocked[index] ?? 1) !== 0) return "blocked";
  const transition = (terrainTransitionsByTile(terrain).get(terrainSparseKey(terrain, tileX, tileY)) ?? []).some(
    (candidate) => {
      if (candidate.kind !== "slope" && candidate.kind !== "stairs")
        return false;
      const endpoint =
        (candidate.lowerTileX === tileX && candidate.lowerTileY === tileY) ||
        (candidate.upperTileX === tileX && candidate.upperTileY === tileY);
      return (
        endpoint &&
        (candidate.contourLevel === activeElevation ||
          candidate.contourLevel - 1 === activeElevation)
      );
    },
  );
  if (transition) return "transition";
  return terrainElevationAt(terrain, tileX, tileY) === activeElevation
    ? "open"
    : "blocked";
}

export function terrainContourBoundaryBetween(
  terrain: TerrainArray,
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): TerrainContourBoundary {
  const fromElevation = terrainElevationAt(terrain, fromTileX, fromTileY);
  const toElevation = terrainElevationAt(terrain, toTileX, toTileY);
  if (fromElevation === toElevation) return "none";
  // The sim step check indexes a whole map from (0, 0); a window translates the
  // step and its transitions into window-local tiles first (S4c).
  const originX = terrain.originX ?? 0;
  const originY = terrain.originY ?? 0;
  const transitions = originX === 0 && originY === 0
    ? terrain.terrainTransitions ?? []
    : (terrain.terrainTransitions ?? []).map((transition) => ({
      ...transition,
      lowerTileX: transition.lowerTileX - originX,
      lowerTileY: transition.lowerTileY - originY,
      upperTileX: transition.upperTileX - originX,
      upperTileY: transition.upperTileY - originY,
    }));
  return terrainWalkingStepAllowed(
    terrain.elevations,
    terrain.width,
    terrain.height,
    transitions,
    fromTileX - originX,
    fromTileY - originY,
    toTileX - originX,
    toTileY - originY,
  )
    ? "transition"
    : "blocked";
}

/** Number of authored wall rows which displace one logical terrain level.
 * This is the visible walk-behind depth, not the underground stratum number.
 * Omitting terrain retains the mountain profile for editor-only callers. */
export function terrainProjectedRowsPerLevel(
  terrain?: TerrainArray,
): number {
  const tileSet = terrain === undefined
    ? STONE_RAISED_CLIFF_TILE_SET
    : terrainDefaultCliffTileSet(terrain);
  return raisedTerrainProjectionRowsPerLevel(tileSet);
}

/** Rows by which the logical source plane is moved on screen. Every raised
 * surface moves north by its wall height, underground rock included. Cave
 * collision additionally places blocking front-face courses at those visual
 * destinations; the excavated floor immediately south remains open. */
export function terrainVisualProjectionRowsPerLevel(
  terrain?: TerrainArray,
): number {
  return terrainProjectedRowsPerLevel(terrain);
}

/** Editor preview mutates a working elevation buffer in place. Production
 * terrain snapshots stay immutable; the editor calls this after each stroke. */
export function invalidateTerrainElevationCaches(terrain: TerrainArray): void {
  maximumElevationCache.delete(terrain);
  minimumElevationCache.delete(terrain);
  contourPlanCache.delete(terrain);
  plateauGridCache.delete(terrain);
  transitionsByTileCache.delete(terrain);
}

/** Background faces are returned deepest-to-nearest for correct compositing. */
export function plateauBackgroundFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  return plateauLayerPlanAt(terrain, tileX, tileY).faceLayers.map(
    (layer) => layer.frame,
  );
}

/** Organic raised areas use the matching cap and side frames from Stone Cliff
 * 1. Unlike the blob edge sheet, these read as the top of a raised landform. */
export function plateauEdgeFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return plateauLayerPlanAt(terrain, tileX, tileY).edgeFrame;
}

/** Standard diagonal-inner-corner rule used by blob/autotile renderers. A
 * plateau cell can need more than one foreground quadrant in pinched shapes. */
export function plateauForegroundFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  return plateauLayerPlanAt(terrain, tileX, tileY).insetFrames;
}

export function plateauRampFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return plateauLayerPlanAt(terrain, tileX, tileY).rampFrame;
}

export function dirtTerraceFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (
    !dirtTerraceAt(terrain, tileX, tileY) ||
    dirtCliffRoleAt(terrain, tileX, tileY).startsWith("ramp_top")
  )
    return null;
  return blob47FrameIndexFor((offsetX, offsetY) =>
    dirtTerraceAt(terrain, tileX + offsetX, tileY + offsetY),
  );
}

/** Blob frame for a dry, visual-only authored farmland cell. */
export function authoredFarmlandFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return authoredFarmlandRuleLayersAt(terrain,tileX,tileY)[0]?.frame ?? null;
}

/** Shared hoed/authored catalogue; only the source of occupancy differs. */
export function authoredFarmlandRuleLayersAt(terrain:TerrainArray,tileX:number,tileY:number):readonly ResolvedRuleFrame[] {
  const mask = terrain.authoredFarmland;
  const present = (offsetX:number,offsetY:number):boolean => {
    const x=tileX+offsetX,y=tileY+offsetY;
    const index=terrainIndexAt(terrain,x,y);
    return mask!==undefined&&index>=0&&mask[index]===1;
  };
  return present(0,0)?farmlandRuleLayers(present):[];
}

export function dirtTerraceRampFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  const role = dirtCliffRoleAt(terrain, tileX, tileY);
  if (role === "ramp_top_left") return 0;
  if (role === "ramp_top_right") return 1;
  if (role === "ramp_bottom_left") return 2;
  if (role === "ramp_bottom_right") return 3;
  return null;
}
