import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_BIOMES,
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  TOPSIDE_SPACE_ID,
  survivalCliffRoleBlocksMovement,
  type CollisionObstacle,
} from '@orchard/sim';
import { LIGHT_HARD_BLOCKER, LIGHT_OPEN, LIGHT_SOFT_ATTENUATOR } from './light-flood.js';
import type { TerrainArray } from './terrain.js';

export interface LightOcclusionMap {
  readonly width: number;
  readonly height: number;
  readonly hardBlocked: Uint8Array;
  readonly softObstacles: readonly CollisionObstacle[];
}

function surfaceTileBlocksLight(terrain: TerrainArray, index: number): boolean {
  const cliffRole = SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[index] ?? 0] ?? 'none';
  if (survivalCliffRoleBlocksMovement(cliffRole)) return true;
  const dirtRole = SURVIVAL_DIRT_CLIFF_ROLES[terrain.dirtCliffRoles[index] ?? 0] ?? 'none';
  if (dirtRole === 'edge') return true;
  const biome = SURVIVAL_BIOMES[terrain.biomes[index] ?? 0] ?? 'water';
  return biome === 'ridge' || biome === 'desert_ridge' || biome === 'coastal_cliff' || biome === 'dirt_ridge';
}

/** Builds the durable part of the visible light classification when collision
 * changes. Water remains transparent; only structural terrain is hard. */
export function createLightOcclusionMap(
  terrain: TerrainArray,
  softObstacles: readonly CollisionObstacle[] = [],
): LightOcclusionMap {
  const hardBlocked = new Uint8Array(terrain.width * terrain.height);
  for (let index = 0; index < hardBlocked.length; index += 1) {
    const blocked = terrain.spaceId === TOPSIDE_SPACE_ID
      ? surfaceTileBlocksLight(terrain, index)
      : terrain.blocked[index] === true;
    hardBlocked[index] = blocked ? 1 : 0;
  }
  return { width: terrain.width, height: terrain.height, hardBlocked, softObstacles };
}

/** Rasterizes tile blockers and fixed-point collision footprints into the
 * current lightmap window. The destination buffer is reused each frame. */
export function rasterizeLightOcclusion(
  target: Uint8Array,
  width: number,
  height: number,
  minTileX: number,
  minTileY: number,
  texelsPerTile: number,
  map: LightOcclusionMap | null,
): void {
  target.fill(LIGHT_OPEN);
  if (map === null) return;

  const tileWidth = Math.ceil(width / texelsPerTile);
  const tileHeight = Math.ceil(height / texelsPerTile);
  for (let localTileY = 0; localTileY < tileHeight; localTileY += 1) {
    const tileY = minTileY + localTileY;
    if (tileY < 0 || tileY >= map.height) continue;
    for (let localTileX = 0; localTileX < tileWidth; localTileX += 1) {
      const tileX = minTileX + localTileX;
      if (tileX < 0 || tileX >= map.width || map.hardBlocked[tileY * map.width + tileX] !== 1) continue;
      const startX = localTileX * texelsPerTile;
      const startY = localTileY * texelsPerTile;
      for (let offsetY = 0; offsetY < texelsPerTile && startY + offsetY < height; offsetY += 1) {
        const row = (startY + offsetY) * width;
        for (let offsetX = 0; offsetX < texelsPerTile && startX + offsetX < width; offsetX += 1) {
          target[row + startX + offsetX] = LIGHT_HARD_BLOCKER;
        }
      }
    }
  }

  const texelPixels = 16 / texelsPerTile;
  const originPixelX = minTileX * 16;
  const originPixelY = minTileY * 16;
  for (const obstacle of map.softObstacles) {
    const left = obstacle.left / FIXED_UNITS_PER_PIXEL;
    const top = obstacle.top / FIXED_UNITS_PER_PIXEL;
    const rightExclusive = (obstacle.right + 1) / FIXED_UNITS_PER_PIXEL;
    const bottomExclusive = (obstacle.bottom + 1) / FIXED_UNITS_PER_PIXEL;
    const minX = Math.max(0, Math.floor((left - originPixelX) / texelPixels));
    const minY = Math.max(0, Math.floor((top - originPixelY) / texelPixels));
    const maxX = Math.min(width - 1, Math.ceil((rightExclusive - originPixelX) / texelPixels) - 1);
    const maxY = Math.min(height - 1, Math.ceil((bottomExclusive - originPixelY) / texelPixels) - 1);
    if (minX > maxX || minY > maxY) continue;
    for (let y = minY; y <= maxY; y += 1) {
      const row = y * width;
      for (let x = minX; x <= maxX; x += 1) {
        const index = row + x;
        if (target[index] === LIGHT_OPEN) target[index] = LIGHT_SOFT_ATTENUATOR;
      }
    }
  }
}

export function buildLightOcclusionPrefix(
  target: Uint32Array,
  width: number,
  height: number,
  mask: Uint8Array,
): void {
  const stride = width + 1;
  if (target.length < stride * (height + 1)) return;
  target.fill(0);
  for (let y = 0; y < height; y += 1) {
    let rowCount = 0;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] !== LIGHT_OPEN) rowCount += 1;
      target[(y + 1) * stride + x + 1] = (target[y * stride + x + 1] ?? 0) + rowCount;
    }
  }
}
