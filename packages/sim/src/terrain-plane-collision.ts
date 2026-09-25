/** Plane-indexed cliff collision for compiled maps and bare elevation grids,
 * plus the compiled-map shape and per-cell samplers it needs.
 *
 * Generator-free leaf (static-world S6a): this module must not import the
 * island generator (`survival-world.ts`), `procedural-terrain`, the map
 * compiler, `map-document-v3` or the sim barrel, so interior spaces (delve
 * lobby, roguelike rooms) can build collision without the map compiler.
 * `map-compiler.ts` re-exports the public names, so existing imports keep
 * working and share this one module instance (the elevation-range cache is
 * module state). `generator-free-leaves.test.ts` enforces the boundary. */
import type { MapFeatureKind, MapSurfaceKind, TerrainOverride } from './map-document.js';
import type { CellPart } from './map-cell-parts.js';
import {
  resolveRaisedTerrainContoursAt,
  raisedTerrainProjectionRowsPerLevel,
  type RaisedTerrainRampRole,
} from './raised-terrain-autotile.js';
import { terrainCliffTileSet, type CliffFamilyId } from './terrain-tilesets.js';
import type { RuntimeTilesetResolver } from './terrain/tileset-registry.js';
import { terrainTransitionLaneAt, type TerrainTransition } from './terrain-elevation.js';

export interface CompiledMapDocument {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly baseElevation: number;
  readonly defaultCliffFamily: string;
  readonly cliffFamilyIds: readonly string[];
  readonly tilesets?: RuntimeTilesetResolver;
  readonly elevations: Int16Array;
  readonly cliffFamilies: Uint8Array;
  readonly surfaceFamilies: Uint8Array;
  readonly terrainOverrides: readonly (TerrainOverride | null)[];
  /** Sparse authored part stacks keyed by `tileY * width + tileX`. Present
   * only when at least one cell stores `parts`, so pre-parts maps compile to
   * the exact historical shape. Contour parts are also folded into
   * `terrainOverrides`; renderers read non-contour exact parts from here. */
  readonly cellParts?: ReadonlyMap<number, readonly CellPart[]>;
  readonly ledges: Uint8Array;
  readonly surfaces: readonly MapSurfaceKind[];
  readonly features: readonly MapFeatureKind[];
  readonly blocked: readonly boolean[];
  readonly transitions: readonly TerrainTransition[];
}

const compiledElevationRangeCache = new WeakMap<
  CompiledMapDocument,
  { readonly minimum: number; readonly maximum: number }
>();

export function compiledElevationRange(
  compiled: CompiledMapDocument,
): { readonly minimum: number; readonly maximum: number } {
  const cached = compiledElevationRangeCache.get(compiled);
  if (cached !== undefined) return cached;
  let minimum = compiled.baseElevation;
  let maximum = compiled.baseElevation;
  for (const elevation of compiled.elevations) {
    minimum = Math.min(minimum, elevation);
    maximum = Math.max(maximum, elevation);
  }
  const range = { minimum, maximum };
  compiledElevationRangeCache.set(compiled, range);
  return range;
}

export function compiledMapElevationAt(map: CompiledMapDocument, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    const tileSet = map.tilesets?.tileSetFor(map.defaultCliffFamily) ?? terrainCliffTileSet(map.defaultCliffFamily);
    return tileSet?.baseDatum ?? 0;
  }
  return map.elevations[tileY * map.width + tileX] ?? 0;
}

export function rampRoleAt(
  transitions: readonly TerrainTransition[],
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  const lane = terrainTransitionLaneAt(transitions, contourLevel, tileX, tileY);
  if (lane === null) return null;
  return `ramp_${lane.endpoint === 'upper' ? 'top' : 'bottom'}_${lane.position}`;
}

export function cellFamilyAt(
  compiled: CompiledMapDocument,
  tileX: number,
  tileY: number,
): string {
  if (tileX < 0 || tileY < 0 || tileX >= compiled.width || tileY >= compiled.height) {
    return compiled.defaultCliffFamily;
  }
  const index = compiled.cliffFamilies[tileY * compiled.width + tileX] ?? 0;
  return index === 0 ? compiled.defaultCliffFamily
    : compiled.cliffFamilyIds[index - 1] ?? compiled.defaultCliffFamily;
}

/** Builds plane-indexed physical cliff geometry for an authored map. Unlike
 * the legacy island/cellar producers, the first slice is the document's true
 * signed minimum elevation, so pits and peaks share one collision contract. */
export function compiledMapTerrainPlaneCollisionBytes(
  compiled: CompiledMapDocument,
  projection?: {readonly baseDatum: number},
): Uint8Array {
  const stride = compiled.width * compiled.height;
  const { minimum, maximum } = compiledElevationRange(compiled);
  const blocked = new Uint8Array((maximum - minimum + 1) * stride);
  const elevationAt = (x: number, y: number): number => compiledMapElevationAt(compiled, x, y);
  const contractTileSet = compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily)
    ?? terrainCliffTileSet(compiled.defaultCliffFamily);
  const projectedRows = contractTileSet === null ? 0
    : raisedTerrainProjectionRowsPerLevel(contractTileSet);
  const baseDatum = projection?.baseDatum ?? contractTileSet?.baseDatum ?? compiled.baseElevation;
  for (let tileY = 0; tileY < compiled.height; tileY += 1) {
    for (let tileX = 0; tileX < compiled.width; tileX += 1) {
      const family = cellFamilyAt(compiled, tileX, tileY);
      const tileSet = compiled.tilesets?.tileSetFor(family) ?? terrainCliffTileSet(family)
        ?? compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily) ?? terrainCliffTileSet(compiled.defaultCliffFamily);
      if (tileSet === null) continue;
      for (const { contourLevel, plan } of resolveRaisedTerrainContoursAt(
        elevationAt,
        maximum,
        tileSet,
        'tall',
        tileX,
        tileY,
        (level, x, y) => rampRoleAt(compiled.transitions, level, x, y),
        minimum + 1,
      )) {
        const tileIndex = tileY * compiled.width + tileX;
        const capPlane = contourLevel - minimum;
        if (plan.rampFrame === null
          && (plan.edgeFrame !== null || plan.insetFrames.length > 0)) {
          blocked[capPlane * stride + tileIndex] = 1;
        }
        if (!plan.faceLayers.some((face) => face.direct && face.blocksMovement)) continue;
        const projectedTileY = tileY - (contourLevel - baseDatum) * projectedRows;
        const facePlane = contourLevel - 1 - minimum;
        if (projectedTileY >= 0 && projectedTileY < compiled.height && facePlane >= 0) {
          blocked[facePlane * stride + projectedTileY * compiled.width + tileX] = 1;
        }
      }
    }
  }
  // Crossings are authored doorways through both adjacent plane guards.
  for (const transition of compiled.transitions) {
    if (transition.kind !== 'slope' && transition.kind !== 'stairs') continue;
    for (const [tileX, tileY, plane] of [
      [transition.lowerTileX, transition.lowerTileY, transition.contourLevel - 1],
      [transition.upperTileX, transition.upperTileY, transition.contourLevel],
    ] as const) {
      if (tileX < 0 || tileY < 0 || tileX >= compiled.width || tileY >= compiled.height) continue;
      const planeIndex = plane - minimum;
      if (planeIndex >= 0 && planeIndex <= maximum - minimum) {
        blocked[planeIndex * stride + tileY * compiled.width + tileX] = 0;
      }
    }
  }
  return blocked;
}

export function terrainPlaneCollisionBytesForElevationGrid(
  width: number,
  height: number,
  elevations: Int16Array,
  transitions: readonly TerrainTransition[],
  defaultCliffFamily: CliffFamilyId,
  projection?: {readonly baseDatum: number},
): Uint8Array {
  if (elevations.length !== width * height) {
    throw new Error(`Terrain elevation field has ${elevations.length} cells; expected ${width * height}`);
  }
  return compiledMapTerrainPlaneCollisionBytes({
    id: 'elevation-grid',
    width,
    height,
    revision: 0,
    baseElevation: terrainCliffTileSet(defaultCliffFamily)?.baseDatum ?? 0,
    defaultCliffFamily,
    cliffFamilyIds: [defaultCliffFamily],
    elevations,
    cliffFamilies: new Uint8Array(width * height),
    surfaceFamilies: new Uint8Array(width * height),
    terrainOverrides: Array(width * height).fill(null),
    ledges: new Uint8Array(width * height),
    surfaces: Array(width * height).fill('stone'),
    features: Array(width * height).fill('none'),
    blocked: Array<boolean>(width * height).fill(false),
    transitions,
  }, projection);
}
