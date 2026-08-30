import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_CLIFF_ROLES,
  TOPSIDE_SPACE_ID,
  survivalCliffRoleBlocksLight,
  type CollisionObstacle,
} from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import {
  LIGHT_CLIFF_FACE_BLOCKER,
  LIGHT_HARD_BLOCKER,
  LIGHT_OPEN,
  LIGHT_SOFT_ATTENUATOR,
  LIGHT_SPRITE_BLOCKER,
  LIGHT_TRUNK_BLOCKER,
} from './light-flood.js';
import { selectAtlasFrame } from './sprite.js';
import {
  plateauLayerPlansAt,
  terrainBiomeAt,
  terrainMaximumElevation,
  terrainProjectedRowsPerLevel,
  type TerrainArray,
} from './terrain.js';

export interface LightSpriteOccluder {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly opaque: Uint8Array;
  /** Logical terrain plane occupied by this caster. Undefined preserves the
   * legacy plane-zero behaviour for flat/fixed spaces. */
  readonly elevationLayer?: number;
}

export interface LightTrunkOccluder {
  /** Ground-contact footprint used only by column casters. Silhouette casters
   * preserve the authored receiver shape instead. */
  readonly obstacle: CollisionObstacle;
  /** Elevated visible pixels owned by this caster. Its own umbra must never be
   * multiplied back over these pixels. */
  readonly receiver: LightSpriteOccluder | null;
  /** World-space painter depth. The lower foot owns overlapping sprite pixels,
   * matching the world depth queue. */
  readonly footY: number;
  /** Horizontal ground-contact point. Defaults to the collision footprint
   * centre, but authored sprites should provide their painter anchor. */
  readonly footX?: number;
  /** Visible face represented by the receiver artwork. South-facing sprites
   * reject direct light from behind while retaining ambient illumination. */
  readonly receiverFacing?: 'omnidirectional' | 'south';
  /** Silhouette casters retain their authored umbra. Column casters use only
   * the collision base for a long projected shadow. */
  readonly shadowMode?: 'column' | 'silhouette';
  readonly elevationLayer?: number;
}

export interface LightOcclusionMap {
  readonly width: number;
  readonly height: number;
  readonly hardBlocked: Uint8Array;
  /** Authored south-facing wall artwork is both opaque and a visible receiver.
   * Contiguous face rows share the same surface instead of shadowing one
   * another from a light on the approach side. */
  readonly frontFaces: Uint8Array;
  readonly softObstacles: readonly CollisionObstacle[];
  readonly spriteOccluders: readonly LightSpriteOccluder[];
  readonly trunkOccluders: readonly LightTrunkOccluder[];
  /** Nested cliff faces in projected screen-world coordinates. Presence of
   * this channel replaces the old unprojected whole-tile terrain mask. */
  readonly terrainOccluders?: readonly LightSpriteOccluder[];
}

interface LightSpriteMask {
  readonly width: number;
  readonly height: number;
  readonly opaque: Uint8Array;
}

const spriteMaskCache = new Map<string, LightSpriteMask | null>();

/** Reads the authored sprite alpha once and places that silhouette in world
 * space. Semi-transparent painted shadows are deliberately excluded. */
export function createSpriteLightOccluder(
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
): LightSpriteOccluder | null {
  const frame = selectAtlasFrame(asset.metadata, animation, frameIndex);
  if (frame === null) return null;
  const key = `${asset.assetId}:${asset.atlasRevision}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`;
  let mask = spriteMaskCache.get(key);
  if (mask === undefined) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return null;
      context.drawImage(
        asset.image, frame.x, frame.y, frame.width, frame.height,
        0, 0, frame.width, frame.height,
      );
      const source = context.getImageData(0, 0, frame.width, frame.height).data;
      const opaque = new Uint8Array(frame.width * frame.height);
      for (let index = 0; index < opaque.length; index += 1) {
        opaque[index] = (source[index * 4 + 3] ?? 0) >= 128 ? 1 : 0;
      }
      mask = { width: frame.width, height: frame.height, opaque };
    } catch {
      mask = null;
    }
    spriteMaskCache.set(key, mask);
  }
  if (mask === null) return null;
  return {
    left: worldX - asset.anchor[0],
    top: worldY - asset.anchor[1],
    ...mask,
  };
}

function surfaceTileBlocksLight(terrain: TerrainArray, index: number, nested: boolean): boolean {
  const tileX = index % terrain.width;
  const tileY = Math.floor(index / terrain.width);
  // The shared terrain sampler already classifies every blocking contour row
  // as ridge. Avoid resolving/caching three contour plans for all 692k ocean
  // and flat tiles when the live island contains only ~1.3k raised blockers.
  if (nested && terrain.raisedTerrainCollisionClassified === true) {
    return terrainBiomeAt(terrain, tileX, tileY) === 'ridge';
  }
  if (nested && plateauLayerPlansAt(terrain, tileX, tileY).some(({ plan }) => plan.blocksLight)) return true;
  const cliffRole = SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[index] ?? 0] ?? 'none';
  // Biome/top-surface labels are not height. Only an authored vertical wall
  // role casts a surface-terrain shadow; ridge tops, insets, shores and water
  // remain light receivers.
  return survivalCliffRoleBlocksLight(cliffRole);
}

function surfaceTileIsFrontFace(terrain: TerrainArray, index: number, nested: boolean): boolean {
  const tileX = index % terrain.width;
  const tileY = Math.floor(index / terrain.width);
  if (nested && (terrain.raisedTerrainCollisionClassified !== true
    || terrainBiomeAt(terrain, tileX, tileY) === 'ridge')
    && plateauLayerPlansAt(terrain, tileX, tileY).some(({ plan }) => (
    plan.faceLayers.some((face) => face.direct && face.blocksLight)
  ))) return true;
  const cliffRole = SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[index] ?? 0] ?? 'none';
  return cliffRole.startsWith('wall') || cliffRole.startsWith('lower_wall');
}

/** Builds the durable part of the visible light classification when collision
 * changes. Water remains transparent; only structural terrain is hard. */
export function createLightOcclusionMap(
  terrain: TerrainArray,
  softObstacles: readonly CollisionObstacle[] = [],
  spriteOccluders: readonly LightSpriteOccluder[] = [],
  trunkOccluders: readonly LightTrunkOccluder[] = [],
  raisedTerrainAsset?: LoadedAsset,
): LightOcclusionMap {
  const hardBlocked = new Uint8Array(terrain.width * terrain.height);
  const frontFaces = new Uint8Array(hardBlocked.length);
  const nested = terrainMaximumElevation(terrain) > 1;
  for (let index = 0; index < hardBlocked.length; index += 1) {
    const blocked = terrain.spaceId === TOPSIDE_SPACE_ID
      ? surfaceTileBlocksLight(terrain, index, nested)
      : terrain.blocked[index] === true;
    hardBlocked[index] = blocked ? 1 : 0;
    frontFaces[index] = terrain.spaceId === TOPSIDE_SPACE_ID
      && surfaceTileIsFrontFace(terrain, index, nested) ? 1 : 0;
  }
  const terrainOccluders: LightSpriteOccluder[] | undefined =
    terrain.spaceId === TOPSIDE_SPACE_ID && nested ? [] : undefined;
  if (terrainOccluders !== undefined) {
    const projectionRows = terrainProjectedRowsPerLevel(terrain);
    for (let index = 0; index < hardBlocked.length; index += 1) {
      if (hardBlocked[index] !== 1) continue;
      const tileX = index % terrain.width;
      const tileY = Math.floor(index / terrain.width);
      for (const { contourLevel, plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
        const projection = contourLevel * projectionRows * 16;
        for (const face of plan.faceLayers) {
          if (!face.direct || !face.blocksLight) continue;
          const authored = raisedTerrainAsset === undefined ? null : createSpriteLightOccluder(
            raisedTerrainAsset,
            'base',
            face.frame,
            tileX * 16 + 8,
            (tileY + 1) * 16 - 1 - projection,
          );
          terrainOccluders.push({
            ...(authored ?? {
              left: tileX * 16,
              top: tileY * 16 - projection,
              width: 16,
              height: 16,
              opaque: new Uint8Array(16 * 16).fill(1),
            }),
            elevationLayer: contourLevel - 1,
          });
        }
      }
    }
  }
  return {
    width: terrain.width,
    height: terrain.height,
    hardBlocked,
    frontFaces,
    softObstacles,
    spriteOccluders,
    ...(terrainOccluders === undefined ? {} : { terrainOccluders }),
    // Painter-depth order lets the lower foot own overlapping elevated pixels
    // without allocating a separate depth buffer on every lightmap rebuild.
    trunkOccluders: [...trunkOccluders].sort((left, right) => left.footY - right.footY),
  };
}

function rasterizeSpriteBlocker(
  target: Uint8Array,
  width: number,
  height: number,
  originPixelX: number,
  originPixelY: number,
  texelPixels: number,
  occluder: LightSpriteOccluder,
  blocker: number,
): void {
  const minX = Math.max(0, Math.floor((occluder.left - originPixelX) / texelPixels));
  const minY = Math.max(0, Math.floor((occluder.top - originPixelY) / texelPixels));
  const maxX = Math.min(width - 1, Math.ceil((occluder.left + occluder.width - originPixelX) / texelPixels) - 1);
  const maxY = Math.min(height - 1, Math.ceil((occluder.top + occluder.height - originPixelY) / texelPixels) - 1);
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const sourceLeft = Math.max(0, Math.floor(originPixelX + x * texelPixels - occluder.left));
    const sourceTop = Math.max(0, Math.floor(originPixelY + y * texelPixels - occluder.top));
    const sourceRight = Math.min(
      occluder.width,
      Math.ceil(originPixelX + (x + 1) * texelPixels - occluder.left),
    );
    const sourceBottom = Math.min(
      occluder.height,
      Math.ceil(originPixelY + (y + 1) * texelPixels - occluder.top),
    );
    let opaquePixels = 0;
    let sampledPixels = 0;
    for (let sourceY = sourceTop; sourceY < sourceBottom; sourceY += 1) {
      const row = sourceY * occluder.width;
      for (let sourceX = sourceLeft; sourceX < sourceRight; sourceX += 1) {
        sampledPixels += 1;
        opaquePixels += occluder.opaque[row + sourceX] ?? 0;
      }
    }
    if (sampledPixels === 0 || opaquePixels * 4 < sampledPixels) continue;
    const index = y * width + x;
    if (blocker === LIGHT_SPRITE_BLOCKER
      && (target[index] === LIGHT_HARD_BLOCKER || target[index] === LIGHT_CLIFF_FACE_BLOCKER)) continue;
    target[index] = blocker;
  }
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
  trunkOwners: Uint16Array | null = null,
  receiverOwners: Uint16Array | null = null,
  trunkCellIndices: Uint32Array | null = null,
  relitReceiverOwners: Uint16Array | null = null,
  elevationLayer = 0,
): number {
  target.fill(LIGHT_OPEN);
  trunkOwners?.fill(0);
  receiverOwners?.fill(0);
  relitReceiverOwners?.fill(0);
  let trunkCellCount = 0;
  if (map === null) return trunkCellCount;

  const tileWidth = Math.ceil(width / texelsPerTile);
  const tileHeight = Math.ceil(height / texelsPerTile);
  if (map.terrainOccluders === undefined) for (let localTileY = 0; localTileY < tileHeight; localTileY += 1) {
    const tileY = minTileY + localTileY;
    if (tileY < 0 || tileY >= map.height) continue;
    for (let localTileX = 0; localTileX < tileWidth; localTileX += 1) {
      const tileX = minTileX + localTileX;
      const tileIndex = tileY * map.width + tileX;
      if (tileX < 0 || tileX >= map.width || map.hardBlocked[tileIndex] !== 1) continue;
      const blocker = map.frontFaces[tileIndex] === 1
        ? LIGHT_CLIFF_FACE_BLOCKER
        : LIGHT_HARD_BLOCKER;
      const startX = localTileX * texelsPerTile;
      const startY = localTileY * texelsPerTile;
      for (let offsetY = 0; offsetY < texelsPerTile && startY + offsetY < height; offsetY += 1) {
        const row = (startY + offsetY) * width;
        for (let offsetX = 0; offsetX < texelsPerTile && startX + offsetX < width; offsetX += 1) {
          target[row + startX + offsetX] = blocker;
        }
      }
    }
  }

  const texelPixels = 16 / texelsPerTile;
  const originPixelX = minTileX * 16;
  const originPixelY = minTileY * 16;
  for (const occluder of map.terrainOccluders ?? []) {
    if ((occluder.elevationLayer ?? 0) !== elevationLayer) continue;
    rasterizeSpriteBlocker(
      target,
      width,
      height,
      originPixelX,
      originPixelY,
      texelPixels,
      occluder,
      LIGHT_CLIFF_FACE_BLOCKER,
    );
  }
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

  for (const occluder of map.spriteOccluders) {
    if ((occluder.elevationLayer ?? 0) !== elevationLayer) continue;
    rasterizeSpriteBlocker(
      target, width, height, originPixelX, originPixelY, texelPixels,
      occluder, LIGHT_SPRITE_BLOCKER,
    );
  }

  for (const [trunkIndex, trunk] of map.trunkOccluders.entries()) {
    if ((trunk.elevationLayer ?? 0) !== elevationLayer) continue;
    const owner = trunkIndex + 1;
    if (owner > 0xffff) break;
    const receiver = trunk.receiver;
    if (trunk.shadowMode === 'silhouette' && receiver !== null) {
      const receiverMinX = Math.max(0, Math.floor((receiver.left - originPixelX) / texelPixels));
      const receiverMinY = Math.max(0, Math.floor((receiver.top - originPixelY) / texelPixels));
      const receiverMaxX = Math.min(
        width - 1,
        Math.ceil((receiver.left + receiver.width - originPixelX) / texelPixels) - 1,
      );
      const receiverMaxY = Math.min(
        height - 1,
        Math.ceil((receiver.top + receiver.height - originPixelY) / texelPixels) - 1,
      );
      for (let y = receiverMinY; y <= receiverMaxY; y += 1) for (let x = receiverMinX; x <= receiverMaxX; x += 1) {
        const sourceLeft = Math.max(0, Math.floor(originPixelX + x * texelPixels - receiver.left));
        const sourceTop = Math.max(0, Math.floor(originPixelY + y * texelPixels - receiver.top));
        const sourceRight = Math.min(
          receiver.width,
          Math.ceil(originPixelX + (x + 1) * texelPixels - receiver.left),
        );
        const sourceBottom = Math.min(
          receiver.height,
          Math.ceil(originPixelY + (y + 1) * texelPixels - receiver.top),
        );
        let opaquePixels = 0;
        let sampledPixels = 0;
        for (let sourceY = sourceTop; sourceY < sourceBottom; sourceY += 1) {
          const row = sourceY * receiver.width;
          for (let sourceX = sourceLeft; sourceX < sourceRight; sourceX += 1) {
            sampledPixels += 1;
            opaquePixels += receiver.opaque[row + sourceX] ?? 0;
          }
        }
        if (sampledPixels === 0 || opaquePixels * 4 < sampledPixels) continue;
        const index = y * width + x;
        if (target[index] === LIGHT_HARD_BLOCKER) continue;
        if (target[index] !== LIGHT_SPRITE_BLOCKER && trunkCellIndices !== null
          && trunkCellCount < trunkCellIndices.length) {
          trunkCellIndices[trunkCellCount] = index;
          trunkCellCount += 1;
        }
        target[index] = LIGHT_SPRITE_BLOCKER;
        if (trunkOwners !== null) trunkOwners[index] = owner;
        if (receiverOwners !== null) receiverOwners[index] = owner;
        if (relitReceiverOwners !== null && opaquePixels === sampledPixels) {
          relitReceiverOwners[index] = owner;
        }
      }
      continue;
    }
    const obstacle = trunk.obstacle;
    const left = obstacle.left / FIXED_UNITS_PER_PIXEL;
    const top = obstacle.top / FIXED_UNITS_PER_PIXEL;
    const rightExclusive = (obstacle.right + 1) / FIXED_UNITS_PER_PIXEL;
    const bottomExclusive = (obstacle.bottom + 1) / FIXED_UNITS_PER_PIXEL;
    const minX = Math.max(0, Math.floor((left - originPixelX) / texelPixels));
    const minY = Math.max(0, Math.floor((top - originPixelY) / texelPixels));
    const maxX = Math.min(width - 1, Math.ceil((rightExclusive - originPixelX) / texelPixels) - 1);
    const maxY = Math.min(height - 1, Math.ceil((bottomExclusive - originPixelY) / texelPixels) - 1);
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (target[index] === LIGHT_HARD_BLOCKER) continue;
      // Column casters still use the ordinary opaque visibility blocker: the
      // obstacle above is only the collision-width trunk base, and symmetric
      // shadowcasting fills the complete umbra between its boundary rays.
      // LIGHT_TRUNK_BLOCKER is the legacy ray-stamped fallback for callers
      // without an explicit shadow mode; routing columns through it produces
      // visibly hollow, parallel shadow lines at oblique light angles.
      const blocker = trunk.shadowMode === 'column' ? LIGHT_SPRITE_BLOCKER : LIGHT_TRUNK_BLOCKER;
      if (target[index] === LIGHT_SPRITE_BLOCKER && blocker !== LIGHT_SPRITE_BLOCKER) continue;
      if (target[index] !== blocker && trunkCellIndices !== null
        && trunkCellCount < trunkCellIndices.length) {
        trunkCellIndices[trunkCellCount] = index;
        trunkCellCount += 1;
      }
      target[index] = blocker;
      if (trunkOwners !== null) trunkOwners[index] = owner;
    }
    if (receiver === null || receiverOwners === null) continue;
    const receiverMinX = Math.max(0, Math.floor((receiver.left - originPixelX) / texelPixels));
    const receiverMinY = Math.max(0, Math.floor((receiver.top - originPixelY) / texelPixels));
    const receiverMaxX = Math.min(
      width - 1,
      Math.ceil((receiver.left + receiver.width - originPixelX) / texelPixels) - 1,
    );
    const receiverMaxY = Math.min(
      height - 1,
      Math.ceil((receiver.top + receiver.height - originPixelY) / texelPixels) - 1,
    );
    for (let y = receiverMinY; y <= receiverMaxY; y += 1) for (let x = receiverMinX; x <= receiverMaxX; x += 1) {
      const sourceLeft = Math.max(0, Math.floor(originPixelX + x * texelPixels - receiver.left));
      const sourceTop = Math.max(0, Math.floor(originPixelY + y * texelPixels - receiver.top));
      const sourceRight = Math.min(
        receiver.width,
        Math.ceil(originPixelX + (x + 1) * texelPixels - receiver.left),
      );
      const sourceBottom = Math.min(
        receiver.height,
        Math.ceil(originPixelY + (y + 1) * texelPixels - receiver.top),
      );
      let opaquePixels = 0;
      let sampledPixels = 0;
      for (let sourceY = sourceTop; sourceY < sourceBottom; sourceY += 1) {
        const row = sourceY * receiver.width;
        for (let sourceX = sourceLeft; sourceX < sourceRight; sourceX += 1) {
          sampledPixels += 1;
          opaquePixels += receiver.opaque[row + sourceX] ?? 0;
        }
      }
      const index = y * width + x;
      if (sampledPixels > 0 && opaquePixels * 4 >= sampledPixels) receiverOwners[index] = owner;
      if (relitReceiverOwners !== null && sampledPixels > 0 && opaquePixels === sampledPixels) {
        relitReceiverOwners[index] = owner;
      }
    }
  }
  return trunkCellCount;
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
