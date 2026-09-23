import {
  FIXED_UNITS_PER_PIXEL,
  type CollisionObstacle,
} from '@orchard/sim';
import { bakedShadowSelection, type AssetPresentation, type LoadedAsset } from '@orchard/ui';
import {
  LIGHT_CLIFF_FACE_BLOCKER,
  LIGHT_HARD_BLOCKER,
  LIGHT_OPEN,
  LIGHT_SOFT_ATTENUATOR,
  LIGHT_SPRITE_BLOCKER,
  LIGHT_TRUNK_BLOCKER,
} from './light-flood.js';
import { selectAtlasFrame, type AtlasFrame } from '@orchard/ui';
import { compareWorldDepthItems, type WorldDepthItem } from './renderer.js';
import {
  plateauLayerPlansAt,
  terrainBaseDatum,
  terrainBiomeAt,
  terrainMaximumElevation,
  terrainMinimumElevation,
  terrainProjectedDepthForElevation,
  terrainProjectionStyle,
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
  /** Exact visible painter ordering, distinct from the physical shadow foot.
   * Producers should supply the same projected depth/plane/tie as their draw.
   * Older producers retain stable foot ordering until migrated. */
  readonly painterOrder?: Pick<WorldDepthItem,
    'footY' | 'tie' | 'depthOffset' | 'elevationLayer' | 'depthPhase'>;
  /** Horizontal ground-contact point. Defaults to the collision footprint
   * centre, but authored sprites should provide their painter anchor. */
  readonly footX?: number;
  /** Visible face represented by the receiver artwork. South-facing sprites
   * reject direct light from behind while retaining ambient illumination. */
  readonly receiverFacing?: 'omnidirectional' | 'south';
  /** Silhouette casters retain their authored umbra. Column casters use only
   * the collision base for a long projected shadow. */
  readonly shadowMode?: 'column' | 'silhouette' | 'none';
  readonly occludesLocalLight?: boolean;
  readonly contactEnabled?: boolean;
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

export function resetSpriteLightMasks(): void { spriteMaskCache.clear(); }

const spriteMaskCache = new Map<string, LightSpriteMask | null>();
const maskIdentities = new WeakMap<object, number>();
let maskIdentitySequence = 0;
function maskIdentity(object: object): number {
  let id = maskIdentities.get(object);
  if (id === undefined) { id = ++maskIdentitySequence; maskIdentities.set(object, id); }
  return id;
}

/** Reads the authored sprite alpha once and places that silhouette in world
 * space. Semi-transparent painted shadows are deliberately excluded. */
export function createSpriteLightOccluder(
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
  presentation: AssetPresentation = 'omit-baked-shadow',
): LightSpriteOccluder | null {
  const frame = selectAtlasFrame(asset.metadata, animation, frameIndex);
  if (frame === null) return null;
  return createFrameLightOccluder(asset, frame, worldX, worldY, presentation);
}

/** Uses the exact selected native frame, including animated authored stamps. */
export function createFrameLightOccluder(
  asset: LoadedAsset, frame: AtlasFrame, worldX: number, worldY: number,
  presentation: AssetPresentation = 'omit-baked-shadow',
): LightSpriteOccluder | null {
  const key = `${maskIdentity(asset.image)}:${asset.bakedShadow ? maskIdentity(asset.bakedShadow) : 0}:${asset.atlasRevision}:${frame.x}:${frame.y}:${frame.width}:${frame.height}:${presentation}`;
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
      const selection = presentation === 'omit-baked-shadow' ? bakedShadowSelection(asset, frame) : undefined;
      if (selection !== undefined) for (let i = 0; i < selection.spans.length; i += 3) {
        const start = selection.spans[i]! * frame.width + selection.spans[i + 1]!;
        opaque.fill(0, start, start + selection.spans[i + 2]!);
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

function surfaceTileBlocksLight(terrain: TerrainArray, index: number, hasContours: boolean): boolean {
  if (!hasContours) return false;
  const tileX = index % terrain.width;
  const tileY = Math.floor(index / terrain.width);
  // The shared terrain sampler already classifies every blocking contour row
  // as ridge. Avoid resolving/caching three contour plans for all 692k ocean
  // and flat tiles when the live island contains only ~1.3k raised blockers.
  if (terrain.raisedTerrainCollisionClassified === true) {
    return terrainBiomeAt(terrain, tileX, tileY) === 'ridge';
  }
  return plateauLayerPlansAt(terrain, tileX, tileY).some(({ plan }) => plan.blocksLight);
}

function surfaceTileIsFrontFace(terrain: TerrainArray, index: number, hasContours: boolean): boolean {
  if (!hasContours) return false;
  const tileX = index % terrain.width;
  const tileY = Math.floor(index / terrain.width);
  return (terrain.raisedTerrainCollisionClassified !== true
    || terrainBiomeAt(terrain, tileX, tileY) === 'ridge')
    && plateauLayerPlansAt(terrain, tileX, tileY).some(({ plan }) => (
    plan.faceLayers.some((face) => face.direct && face.blocksLight)
  ));
}

/** Builds the durable part of the visible light classification when collision
 * changes. Water remains transparent; only structural terrain is hard. */
export function createLightOcclusionMap(
  terrain: TerrainArray,
  softObstacles: readonly CollisionObstacle[] = [],
  spriteOccluders: readonly LightSpriteOccluder[] = [],
  trunkOccluders: readonly LightTrunkOccluder[] = [],
  raisedTerrainAsset?: LoadedAsset,
  preparedTerrain?: PreparedLightTerrainOcclusion,
): LightOcclusionMap {
  return {
    ...(preparedTerrain ?? prepareLightTerrainOcclusion(terrain, raisedTerrainAsset)),
    softObstacles,
    spriteOccluders,
    trunkOccluders: [...trunkOccluders].sort((left, right) => compareWorldDepthItems(
      left.painterOrder ?? { footY: left.footY, tie: '' },
      right.painterOrder ?? { footY: right.footY, tie: '' },
    )),
  };
}

export type PreparedLightTerrainOcclusion = Omit<LightOcclusionMap,
  'softObstacles' | 'spriteOccluders' | 'trunkOccluders'>;

/** Explicitly prepared static classification. Its owner must invalidate it
 * after terrain edits or an authored raised-terrain asset change. */
export function prepareLightTerrainOcclusion(
  terrain: TerrainArray,
  raisedTerrainAsset?: LoadedAsset,
): PreparedLightTerrainOcclusion {
  const hardBlocked = new Uint8Array(terrain.width * terrain.height);
  const frontFaces = new Uint8Array(hardBlocked.length);
  const baseDatum = terrainBaseDatum(terrain);
  const traversalBlocksLight = terrainProjectionStyle(terrain) === 'interior';
  const hasContours = terrainMaximumElevation(terrain) > terrainMinimumElevation(terrain)
    || terrainMaximumElevation(terrain) !== baseDatum;
  for (let index = 0; index < hardBlocked.length; index += 1) {
    const blocked = (traversalBlocksLight && terrain.blocked[index] === true)
      || surfaceTileBlocksLight(terrain, index, hasContours);
    hardBlocked[index] = blocked ? 1 : 0;
    // Interior front faces project into excavated floor cells. Untouched rock
    // cannot receive one, so avoid running the contour resolver for nearly all
    // of a 1024-square cellar during zone entry. Outdoor contours retain their
    // existing classification because their source `blocked` channel differs.
    const canReceiveFrontFace = !traversalBlocksLight || terrain.blocked[index] !== true;
    frontFaces[index] = canReceiveFrontFace
      && surfaceTileIsFrontFace(terrain, index, hasContours) ? 1 : 0;
  }
  const terrainOccluders: LightSpriteOccluder[] | undefined =
    hasContours ? [] : undefined;
  if (terrainOccluders !== undefined) {
    for (let index = 0; index < hardBlocked.length; index += 1) {
      if (frontFaces[index] !== 1) continue;
      const tileX = index % terrain.width;
      const tileY = Math.floor(index / terrain.width);
      for (const { contourLevel, plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
        const projection = terrainProjectedDepthForElevation(
          terrain,
          contourLevel,
        );
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
    ...(terrainOccluders === undefined ? {} : { terrainOccluders }),
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
    if (trunk.occludesLocalLight === false) continue;
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
