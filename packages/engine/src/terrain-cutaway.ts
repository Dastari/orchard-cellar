import { TILE_SIZE_PIXELS } from '@orchard/sim';
import { compareWorldDepthItems, type WorldDepthItem } from './renderer.js';

type TerrainCutawayDepth = Pick<
  WorldDepthItem,
  'footY' | 'tie' | 'depthOffset' | 'elevationLayer' | 'depthPhase'
>;

export const TERRAIN_CUTAWAY_RADIUS_X = 18;
export const TERRAIN_CUTAWAY_RADIUS_Y = 24;
export const TERRAIN_CUTAWAY_FOOT_OFFSET_Y = 13;

const TERRAIN_CUTAWAY_ALPHA = 0.22;
const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const;

export interface TerrainCutawayFocus {
  /** Local player's unprojected horizontal world coordinate. */
  readonly worldX: number;
  /** Local player's projected foot line in world-pass coordinates. */
  readonly projectedFootY: number;
  /** The exact depth key used by the local player's queued drawable. */
  readonly depth: TerrainCutawayDepth;
  readonly radiusX?: number;
  readonly radiusY?: number;
  readonly visibility?: number;
}

export interface TerrainCutawayMask {
  readonly inside: Path2D;
  readonly outside: Path2D;
  readonly stipple: Path2D;
  readonly baseAlpha: number;
  readonly stippleAlpha: number;
}

export interface TerrainCutawayRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function terrainCutawayCenterY(focus: TerrainCutawayFocus): number {
  return focus.projectedFootY - TERRAIN_CUTAWAY_FOOT_OFFSET_Y;
}

/** A terrain receiver participates only when the existing painter queue will
 * place it after the local player. This avoids holes in walls that are already
 * correctly behind the actor. */
export function terrainCutawayReceiverOccludes(
  receiver: TerrainCutawayDepth,
  focus: TerrainCutawayFocus,
): boolean {
  return compareWorldDepthItems(receiver, focus.depth) > 0;
}

export function terrainCutawayOverlapsRect(
  focus: TerrainCutawayFocus,
  rect: TerrainCutawayRect,
): boolean {
  const radiusX = focus.radiusX ?? TERRAIN_CUTAWAY_RADIUS_X;
  const radiusY = focus.radiusY ?? TERRAIN_CUTAWAY_RADIUS_Y;
  const centerY = terrainCutawayCenterY(focus);
  const nearestX = Math.max(rect.left, Math.min(focus.worldX, rect.right));
  const nearestY = Math.max(rect.top, Math.min(centerY, rect.bottom));
  const normalizedX = (nearestX - focus.worldX) / radiusX;
  const normalizedY = (nearestY - centerY) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

export function terrainCutawayOverlapsTile(
  focus: TerrainCutawayFocus,
  tileX: number,
  tileY: number,
  visualOffset: number,
): boolean {
  // A small gutter covers authored shadows, seams, and cave supports which can
  // extend beyond their owning 16px terrain cell.
  const gutter = 4;
  return terrainCutawayOverlapsRect(focus, {
    left: tileX * TILE_SIZE_PIXELS - gutter,
    top: tileY * TILE_SIZE_PIXELS - visualOffset - gutter,
    right: (tileX + 1) * TILE_SIZE_PIXELS + gutter,
    bottom: (tileY + 1) * TILE_SIZE_PIXELS - visualOffset + gutter,
  });
}

/** Ordered coverage rises toward the rim so the wall reads as a stable
 * pixel-art dissolve rather than a smooth, blurry alpha circle. */
export function terrainCutawayStippleCoverage(normalizedRadius: number): number {
  if (normalizedRadius >= 0.86) return 0.75;
  if (normalizedRadius >= 0.68) return 0.5;
  if (normalizedRadius >= 0.5) return 0.25;
  return 0.125;
}

export function createTerrainCutawayMask(
  context: CanvasRenderingContext2D,
  focus: TerrainCutawayFocus,
  cameraX: number,
  cameraY: number,
  scale: number,
): TerrainCutawayMask {
  const radiusX = focus.radiusX ?? TERRAIN_CUTAWAY_RADIUS_X;
  const radiusY = focus.radiusY ?? TERRAIN_CUTAWAY_RADIUS_Y;
  const centerY = terrainCutawayCenterY(focus);
  const screenCenterX = Math.round((focus.worldX - cameraX) * scale);
  const screenCenterY = Math.round((centerY - cameraY) * scale);
  const screenRadiusX = radiusX * scale;
  const screenRadiusY = radiusY * scale;
  const inside = new Path2D();
  inside.ellipse(screenCenterX, screenCenterY, screenRadiusX, screenRadiusY, 0, 0, Math.PI * 2);
  const outside = new Path2D();
  outside.rect(0, 0, context.canvas.width, context.canvas.height);
  outside.ellipse(screenCenterX, screenCenterY, screenRadiusX, screenRadiusY, 0, 0, Math.PI * 2);
  const stipple = new Path2D();
  const minimumWorldX = Math.floor(focus.worldX - radiusX);
  const maximumWorldX = Math.ceil(focus.worldX + radiusX);
  const minimumWorldY = Math.floor(centerY - radiusY);
  const maximumWorldY = Math.ceil(centerY + radiusY);
  for (let worldY = minimumWorldY; worldY <= maximumWorldY; worldY += 1) {
    for (let worldX = minimumWorldX; worldX <= maximumWorldX; worldX += 1) {
      const normalizedX = (worldX + 0.5 - focus.worldX) / radiusX;
      const normalizedY = (worldY + 0.5 - centerY) / radiusY;
      const normalizedRadius = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
      if (normalizedRadius > 1) continue;
      const threshold = terrainCutawayStippleCoverage(normalizedRadius) * BAYER_4.length;
      const bayerX = positiveModulo(worldX, 4);
      const bayerY = positiveModulo(worldY, 4);
      if ((BAYER_4[bayerY * 4 + bayerX] ?? BAYER_4.length) >= threshold) continue;
      stipple.rect(
        Math.round((worldX - cameraX) * scale),
        Math.round((worldY - cameraY) * scale),
        scale,
        scale,
      );
    }
  }
  const visibility = Math.max(0, Math.min(1, focus.visibility ?? 1));
  return {
    inside,
    outside,
    stipple,
    baseAlpha: 1 - (1 - TERRAIN_CUTAWAY_ALPHA) * visibility,
    stippleAlpha: (1 - TERRAIN_CUTAWAY_ALPHA) * visibility,
  };
}

/** Draws one terrain receiver in three clipped passes. Only the receiver is
 * dissolved; already-painted ground/entities and later props never enter the
 * mask, preserving the normal depth queue exactly. */
export function drawWithTerrainCutaway(
  context: CanvasRenderingContext2D,
  mask: TerrainCutawayMask,
  draw: () => void,
): void {
  context.save();
  context.clip(mask.outside, 'evenodd');
  draw();
  context.restore();

  context.save();
  context.clip(mask.inside);
  context.globalAlpha *= mask.baseAlpha;
  draw();
  context.restore();

  if (mask.stippleAlpha <= 0) return;
  context.save();
  context.clip(mask.stipple);
  context.globalAlpha *= mask.stippleAlpha;
  draw();
  context.restore();
}
