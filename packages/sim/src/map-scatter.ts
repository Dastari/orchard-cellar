import { MAP_BIOME_IDS, type MapBiomeId } from './biomes.js';
import {
  resolvedMapBiomeAt,
  terrainDocumentForMapV3,
  type MapDocumentV3,
  type MapObjectInstance,
  type MapObjectLayer,
} from './map-document-v3.js';
import { resolvedMapCellAt, type MapSurfaceKind } from './map-document.js';
import type { MapPoint } from './map-editing.js';

export interface MapScatterPaletteEntry {
  readonly prefabId: string;
  readonly weight: number;
}

export interface MapScatterRequest {
  readonly seed: number;
  readonly points: readonly MapPoint[];
  readonly palette: readonly MapScatterPaletteEntry[];
  /** Basis points, from 0 to 10,000. */
  readonly density: number;
  readonly minimumSpacing: number;
  readonly allowedBiomes?: readonly MapBiomeId[];
  readonly allowedSurfaces?: readonly MapSurfaceKind[];
  readonly minimumElevation?: number;
  readonly maximumElevation?: number;
  readonly layer: MapObjectLayer;
  readonly randomQuarterTurns?: boolean;
  readonly randomFlipX?: boolean;
  readonly idPrefix?: string;
}

function hash32(seed: number, x: number, y: number, salt: number): number {
  let value = (seed ^ Math.imul(x, 0x9e37_79b1) ^ Math.imul(y, 0x85eb_ca77) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function validRequest(request: MapScatterRequest): boolean {
  return Number.isInteger(request.seed)
    && Number.isInteger(request.density) && request.density >= 0 && request.density <= 10_000
    && Number.isInteger(request.minimumSpacing) && request.minimumSpacing >= 0
    && request.palette.length > 0
    && request.palette.every((entry) => Number.isInteger(entry.weight) && entry.weight > 0)
    && (request.allowedBiomes?.every((biome) => MAP_BIOME_IDS.includes(biome)) ?? true);
}

function farEnough(
  point: MapPoint,
  occupied: readonly MapPoint[],
  minimumSpacing: number,
): boolean {
  return occupied.every((entry) => (
    Math.max(Math.abs(entry.tileX - point.tileX), Math.abs(entry.tileY - point.tileY)) >= minimumSpacing
  ));
}

function weightedPrefab(
  request: MapScatterRequest,
  point: MapPoint,
): MapScatterPaletteEntry {
  const total = request.palette.reduce((sum, entry) => sum + entry.weight, 0);
  let choice = hash32(request.seed, point.tileX, point.tileY, 0x5ca7_7e12) % total;
  for (const entry of request.palette) {
    if (choice < entry.weight) return entry;
    choice -= entry.weight;
  }
  return request.palette[request.palette.length - 1]!;
}

/** Pure deterministic candidate generation. Accepting the result is one map command. */
export function generateMapScatter(
  document: MapDocumentV3,
  request: MapScatterRequest,
): readonly MapObjectInstance[] {
  if (!validRequest(request)) throw new TypeError('Map scatter request is invalid');
  const terrain = terrainDocumentForMapV3(document);
  const uniquePoints = [...new Map(request.points.map((point) => [
    `${point.tileX},${point.tileY}`, point,
  ])).values()].sort((left, right) => left.tileY - right.tileY || left.tileX - right.tileX);
  const occupied: MapPoint[] = document.objects
    .filter((object) => object.enabled)
    .map((object) => ({ tileX: object.tileX, tileY: object.tileY }));
  const result: MapObjectInstance[] = [];
  const idPrefix = request.idPrefix ?? `scatter-${(request.seed >>> 0).toString(16)}`;
  for (const point of uniquePoints) {
    if (point.tileX < 0 || point.tileY < 0 || point.tileX >= document.width || point.tileY >= document.height) continue;
    if (hash32(request.seed, point.tileX, point.tileY, 0x31d2_0f4b) % 10_000 >= request.density) continue;
    const biome = resolvedMapBiomeAt(document, point.tileX, point.tileY);
    if (request.allowedBiomes !== undefined && !request.allowedBiomes.includes(biome)) continue;
    const cell = resolvedMapCellAt(terrain, point.tileX, point.tileY);
    if (request.allowedSurfaces !== undefined && !request.allowedSurfaces.includes(cell.surface)) continue;
    if (cell.elevation < (request.minimumElevation ?? -32)
      || cell.elevation > (request.maximumElevation ?? 32)) continue;
    if (!farEnough(point, occupied, request.minimumSpacing)) continue;
    const selected = weightedPrefab(request, point);
    const prefab = document.prefabs.find((entry) => entry.id === selected.prefabId);
    if (prefab === undefined) throw new TypeError(`Map scatter prefab is unavailable: ${selected.prefabId}`);
    const ordinal = result.length.toString(36).padStart(3, '0');
    result.push({
      id: `${idPrefix}-${ordinal}`,
      prefabId: prefab.id,
      prefabRevision: prefab.revision,
      tileX: point.tileX,
      tileY: point.tileY,
      elevation: cell.elevation,
      layer: request.layer,
      quarterTurns: request.randomQuarterTurns === true
        ? hash32(request.seed, point.tileX, point.tileY, 0xa671_f829) % 4 as 0 | 1 | 2 | 3
        : 0,
      flipX: request.randomFlipX === true
        && (hash32(request.seed, point.tileX, point.tileY, 0xb14d_09c3) & 1) === 1,
      enabled: true,
    });
    occupied.push(point);
  }
  return result;
}
