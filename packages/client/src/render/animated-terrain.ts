import type { LoadedAsset } from './assets.js';
import { animatedWaterRockAllowedAt, grassTuftAllowedAt, terrainBiomeAt, terrainDecorationHash, waterfallTopLeftAt, waterfallUsesRaisedCompositionAt, type TerrainArray } from './terrain.js';

export { waterfallUsesRaisedCompositionAt } from './terrain.js';

const TILE_SIZE_PIXELS = 16;

export interface AnimatedTerrainArt {
  readonly waterfallFlow: LoadedAsset;
  readonly waterRockFlow: LoadedAsset;
  readonly grassTuft: LoadedAsset;
  readonly oceanSurfaceDecorations: readonly LoadedAsset[];
}

export function oceanSurfaceAllowedAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) !== 'water') return false;
    }
  }
  return true;
}

export function loopingAnimationFrame(nowMs: number, fps: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.floor(Math.max(0, nowMs) * Math.max(0.01, fps) / 1_000) % frameCount;
}

export function windGrassFrame(
  nowMs: number,
  fps: number,
  frameCount: number,
  windStrength: number,
  windDirectionX: number,
  phase: number,
): number {
  if (frameCount <= 1 || windStrength < 0.3) return 0;
  const base = loopingAnimationFrame(nowMs, fps * (0.55 + windStrength * 1.1), frameCount);
  const phased = (base + phase) % frameCount;
  return windDirectionX < 0 ? frameCount - 1 - phased : phased;
}

function drawAnimationFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): boolean {
  const frames = asset.metadata.animations[animation] ?? [];
  const frame = frames[frameIndex % Math.max(1, frames.length)];
  if (!frame) return false;
  context.drawImage(
    asset.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.round((tileX * TILE_SIZE_PIXELS - cameraX) * scale),
    Math.round((tileY * TILE_SIZE_PIXELS - cameraY) * scale),
    frame.width * scale,
    frame.height * scale,
  );
  return true;
}

/** Draws authored terrain animation above cached ground without rebuilding chunks. */
export function drawAnimatedTerrain(
  context: CanvasRenderingContext2D,
  art: AnimatedTerrainArt,
  terrain: TerrainArray,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  nowMs = performance.now(),
  windStrength = 0,
  windDirectionX = 1,
): number {
  const minimumTileX = Math.max(0, Math.floor(cameraX / TILE_SIZE_PIXELS) - 3);
  const minimumTileY = Math.max(0, Math.floor(cameraY / TILE_SIZE_PIXELS) - 5);
  const maximumTileX = Math.min(terrain.width - 1, Math.ceil((cameraX + viewportWidth) / TILE_SIZE_PIXELS) + 3);
  const maximumTileY = Math.min(terrain.height - 1, Math.ceil((cameraY + viewportHeight) / TILE_SIZE_PIXELS) + 5);
  const waterfallFrames = art.waterfallFlow.metadata.animations['flow'] ?? [];
  const waterfallFps = art.waterfallFlow.metadata.animationMeta?.['flow']?.fps ?? 8;
  const waterfallFrame = loopingAnimationFrame(nowMs, waterfallFps, waterfallFrames.length);
  const rockFrames = art.waterRockFlow.metadata.animations['flow'] ?? [];
  const rockFps = art.waterRockFlow.metadata.animationMeta?.['flow']?.fps ?? 8;
  const rockFrame = loopingAnimationFrame(nowMs, rockFps, rockFrames.length);
  const grassFrames = art.grassTuft.metadata.animations['base'] ?? [];
  const grassFps = art.grassTuft.metadata.animationMeta?.['base']?.fps ?? 8;
  let draws = 0;

  for (let tileY = minimumTileY; tileY <= maximumTileY; tileY += 1) {
    for (let tileX = minimumTileX; tileX <= maximumTileX; tileX += 1) {
      if (waterfallTopLeftAt(terrain, tileX, tileY)
        && !waterfallUsesRaisedCompositionAt(terrain, tileX, tileY)) {
        if (drawAnimationFrame(
          context, art.waterfallFlow, 'flow', waterfallFrame,
          tileX, tileY, cameraX, cameraY, scale,
        )) draws += 1;
        continue;
      }
      const waterNoise = terrainDecorationHash(tileX, tileY);
      if (waterNoise % 1_000 < 25 && oceanSurfaceAllowedAt(terrain, tileX, tileY)) {
        const surfaces = art.oceanSurfaceDecorations;
        const surface = surfaces[Math.floor(waterNoise / 1_000) % Math.max(1, surfaces.length)];
        if (surface !== undefined) {
          const surfaceFrames = surface.metadata.animations['sway'] ?? [];
          const surfaceFps = surface.metadata.animationMeta?.['sway']?.fps ?? 4;
          const surfaceFrame = loopingAnimationFrame(nowMs, surfaceFps, surfaceFrames.length)
            + Math.floor(waterNoise / 17) % Math.max(1, surfaceFrames.length);
          if (drawAnimationFrame(
            context, surface, 'sway', surfaceFrame,
            tileX, tileY, cameraX, cameraY, scale,
          )) draws += 1;
        }
      }
      if (animatedWaterRockAllowedAt(terrain, tileX, tileY)) {
        const phase = (tileX * 3 + tileY * 5) % Math.max(1, rockFrames.length);
        if (drawAnimationFrame(
          context, art.waterRockFlow, 'flow', rockFrame + phase,
          tileX, tileY, cameraX, cameraY, scale,
        )) draws += 1;
      }
      if (grassTuftAllowedAt(terrain, tileX, tileY)) {
        const phase = terrainDecorationHash(tileX, tileY) % Math.max(1, grassFrames.length);
        const grassFrame = windGrassFrame(
          nowMs, grassFps, grassFrames.length, windStrength, windDirectionX, phase,
        );
        if (drawAnimationFrame(
          context, art.grassTuft, 'base', grassFrame,
          tileX, tileY, cameraX, cameraY, scale,
        )) draws += 1;
      }
    }
  }
  return draws;
}
