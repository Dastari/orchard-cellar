import { authorityDayProgress, lunarIlluminationAtAuthorityTick } from '@orchard/sim';
import {
  LIGHT_BANDS,
  QuantizedLightFlood,
  type LightFacing,
  type LightProfile,
} from './light-flood.js';
import { buildLightOcclusionPrefix, rasterizeLightOcclusion, type LightOcclusionMap } from './light-occlusion.js';
import type { TerrainArray } from './terrain.js';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PointLight {
  readonly worldX: number;
  readonly worldY: number;
  readonly radiusTiles: number;
  readonly color: RgbColor;
  readonly strengthPerMille?: number;
  readonly facing?: LightFacing;
  readonly profile?: LightProfile;
}

/** Quarter-tile sampling is the owner-reviewed balance between visible pixel
 * texture and a light pool that follows one-pixel player movement smoothly. */
export const LIGHT_TEXELS_PER_TILE = 4;
export const LIGHTMAP_TEXELS_PER_TILE = LIGHT_TEXELS_PER_TILE;

interface AmbientKeyframe {
  readonly progress: number;
  readonly color: RgbColor;
}

const AMBIENT_KEYFRAMES: readonly AmbientKeyframe[] = [
  { progress: 0, color: { r: 222, g: 174, b: 126 } },
  { progress: 0.1, color: { r: 255, g: 255, b: 255 } },
  { progress: 0.62, color: { r: 255, g: 255, b: 255 } },
  { progress: 0.72, color: { r: 166, g: 128, b: 157 } },
  { progress: 0.8, color: { r: 89, g: 89, b: 105 } },
  { progress: 1, color: { r: 89, g: 89, b: 105 } },
];

export const NEW_MOON_NIGHT_AMBIENT: RgbColor = { r: 20, g: 20, b: 32 };
export const FULL_MOON_NIGHT_AMBIENT: RgbColor = { r: 89, g: 89, b: 105 };

export const LANTERN_LIGHT: RgbColor = { r: 255, g: 217, b: 160 };
export const TORCH_LIGHT: RgbColor = { r: 255, g: 184, b: 104 };
export const CAMPFIRE_LIGHT: RgbColor = { r: 255, g: 205, b: 132 };
export const CAMPFIRE_LIGHT_RADIUS_TILES = 12;
export const TORCH_LIGHT_RADIUS_TILES = CAMPFIRE_LIGHT_RADIUS_TILES * 0.3;
export const LANTERN_LIGHT_RADIUS_TILES = CAMPFIRE_LIGHT_RADIUS_TILES * 0.75;

export function playerLightPosition(worldX: number, footY: number): readonly [number, number] {
  return [worldX, footY - 12];
}

function lerp(left: number, right: number, amount: number): number {
  return Math.round(left + (right - left) * amount);
}

function mixLightHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16_777_619) >>> 0;
}

export function ambientAtProgress(
  dayProgress: number,
  rainDarkening = 0,
  lunarIlluminationPerMille = 1000,
): RgbColor {
  const progress = Math.max(0, Math.min(1, dayProgress));
  let left = AMBIENT_KEYFRAMES[0] ?? { progress: 0, color: { r: 255, g: 255, b: 255 } };
  let right = AMBIENT_KEYFRAMES.at(-1) ?? left;
  for (let index = 1; index < AMBIENT_KEYFRAMES.length; index += 1) {
    const candidate = AMBIENT_KEYFRAMES[index];
    if (candidate === undefined || candidate.progress < progress) {
      if (candidate !== undefined) left = candidate;
      continue;
    }
    right = candidate;
    break;
  }
  const span = Math.max(0.0001, right.progress - left.progress);
  const amount = Math.max(0, Math.min(1, (progress - left.progress) / span));
  const base = {
    r: lerp(left.color.r, right.color.r, amount),
    g: lerp(left.color.g, right.color.g, amount),
    b: lerp(left.color.b, right.color.b, amount),
  };
  const moon = Math.max(0, Math.min(1000, lunarIlluminationPerMille)) / 1000;
  const lunarNight = {
    r: lerp(NEW_MOON_NIGHT_AMBIENT.r, FULL_MOON_NIGHT_AMBIENT.r, moon),
    g: lerp(NEW_MOON_NIGHT_AMBIENT.g, FULL_MOON_NIGHT_AMBIENT.g, moon),
    b: lerp(NEW_MOON_NIGHT_AMBIENT.b, FULL_MOON_NIGHT_AMBIENT.b, moon),
  };
  const lunarWeight = Math.max(0, Math.min(1, (progress - 0.72) / 0.08));
  const weather = 1 - Math.max(0, Math.min(0.18, rainDarkening));
  return {
    r: Math.max(NEW_MOON_NIGHT_AMBIENT.r, Math.round(lerp(base.r, lunarNight.r, lunarWeight) * weather)),
    g: Math.max(NEW_MOON_NIGHT_AMBIENT.g, Math.round(lerp(base.g, lunarNight.g, lunarWeight) * weather)),
    b: Math.max(NEW_MOON_NIGHT_AMBIENT.b, Math.round(lerp(base.b, lunarNight.b, lunarWeight) * weather)),
  };
}

export function ambientAtTick(authorityTick: bigint, rainDarkening = 0): RgbColor {
  return ambientAtProgress(
    authorityDayProgress(authorityTick),
    rainDarkening,
    lunarIlluminationAtAuthorityTick(authorityTick),
  );
}

export function fillLightmap(buffer: Uint8ClampedArray, ambient: RgbColor): void {
  for (let index = 0; index < buffer.length; index += 4) {
    buffer[index] = ambient.r;
    buffer[index + 1] = ambient.g;
    buffer[index + 2] = ambient.b;
    buffer[index + 3] = 255;
  }
}

/** Converts a world point to a texel index where texels sample evenly within
 * each tile. A value of one retains the original tile-centre coordinate rule. */
export function lightmapCoordinate(
  worldPixels: number,
  firstTile: number,
  texelsPerTile = 1,
): number {
  return (worldPixels / 16 - firstTile) * texelsPerTile - 0.5;
}

export function stampPointLight(
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: RgbColor,
): void {
  const safeRadius = Math.max(0.001, radius);
  const minX = Math.max(0, Math.floor(centerX - safeRadius));
  const minY = Math.max(0, Math.floor(centerY - safeRadius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + safeRadius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + safeRadius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > safeRadius) continue;
      const strength = 1 - distance / safeRadius;
      const band = Math.max(0, Math.min(LIGHT_BANDS, Math.round(strength * LIGHT_BANDS)));
      if (band === 0) continue;
      const offset = (y * width + x) * 4;
      buffer[offset] = Math.max(buffer[offset] ?? 0, Math.round(color.r * band / LIGHT_BANDS));
      buffer[offset + 1] = Math.max(buffer[offset + 1] ?? 0, Math.round(color.g * band / LIGHT_BANDS));
      buffer[offset + 2] = Math.max(buffer[offset + 2] ?? 0, Math.round(color.b * band / LIGHT_BANDS));
    }
  }
}

export class TileLightmap {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly haloCanvas = document.createElement('canvas');
  private readonly haloContext: CanvasRenderingContext2D;
  private readonly flood = new QuantizedLightFlood();
  private image: ImageData | null = null;
  private haloImage: ImageData | null = null;
  private pixels = new Uint8ClampedArray(0);
  private lightPixels = new Uint8ClampedArray(0);
  private haloPixels = new Uint8ClampedArray(0);
  private occlusion = new Uint8Array(0);
  private occlusionPrefix = new Uint32Array(0);
  private floodTexelsVisitedValue = 0;
  private floodMsValue = 0;
  private fieldRebuildsValue = 0;
  private lastMinTileX = Number.NaN;
  private lastMinTileY = Number.NaN;
  private lastLightSignature = Number.NaN;
  private lastAmbientSignature = Number.NaN;
  private lastOcclusionMap: LightOcclusionMap | null = null;
  private haloVisible = false;
  private readonly lightmapFrameTimes = new Float32Array(60);
  private lightmapFrameCursor = 0;
  private lightmapFrameCount = 0;

  constructor() {
    const context = this.canvas.getContext('2d');
    if (context === null) throw new Error('Lightmap Canvas 2D unavailable');
    this.context = context;
    const haloContext = this.haloCanvas.getContext('2d');
    if (haloContext === null) throw new Error('Lightmap halo Canvas 2D unavailable');
    this.haloContext = haloContext;
  }

  get floodTexelsVisited(): number { return this.floodTexelsVisitedValue; }
  get floodMs(): number { return this.floodMsValue; }
  get fieldRebuilds(): number { return this.fieldRebuildsValue; }
  get averageMs(): number {
    let total = 0;
    for (let index = 0; index < this.lightmapFrameCount; index += 1) total += this.lightmapFrameTimes[index] ?? 0;
    return this.lightmapFrameCount === 0 ? 0 : total / this.lightmapFrameCount;
  }

  private lightSignature(lights: readonly PointLight[]): number {
    let hash = 2_166_136_261;
    hash = mixLightHash(hash, lights.length);
    for (const light of lights) {
      // Quarter-texel signature steps make a four-texel lightmap respond to
      // each world pixel without changing its deliberately pixelated buffer.
      hash = mixLightHash(hash, Math.round(light.worldX * LIGHT_TEXELS_PER_TILE / 4));
      hash = mixLightHash(hash, Math.round(light.worldY * LIGHT_TEXELS_PER_TILE / 4));
      hash = mixLightHash(hash, Math.round(light.radiusTiles * 100));
      hash = mixLightHash(hash, light.strengthPerMille ?? 1000);
      hash = mixLightHash(hash, light.color.r);
      hash = mixLightHash(hash, light.color.g);
      hash = mixLightHash(hash, light.color.b);
      hash = mixLightHash(hash, light.facing === 'up' ? 1 : light.facing === 'right' ? 2 : light.facing === 'down' ? 3 : light.facing === 'left' ? 4 : 0);
      hash = mixLightHash(hash, light.profile === 'flame' ? 1 : light.profile === 'pulse' ? 2 : 0);
    }
    return hash;
  }

  draw(
    target: CanvasRenderingContext2D,
    terrain: TerrainArray,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
    ambient: RgbColor,
    lights: readonly PointLight[],
    occlusionMap: LightOcclusionMap | null = null,
  ): void {
    const lightmapStartedAt = performance.now();
    const margin = 2;
    const minTileX = Math.max(0, Math.floor(cameraX / 16) - margin);
    const minTileY = Math.max(0, Math.floor(cameraY / 16) - margin);
    const maxTileX = Math.min(terrain.width - 1, Math.ceil((cameraX + viewportWidth / scale) / 16) + margin);
    const maxTileY = Math.min(terrain.height - 1, Math.ceil((cameraY + viewportHeight / scale) / 16) + margin);
    const tileWidth = Math.max(1, maxTileX - minTileX + 1);
    const tileHeight = Math.max(1, maxTileY - minTileY + 1);
    const width = tileWidth * LIGHTMAP_TEXELS_PER_TILE;
    const height = tileHeight * LIGHTMAP_TEXELS_PER_TILE;
    this.resize(width, height);
    const signature = this.lightSignature(lights);
    const rebuild = minTileX !== this.lastMinTileX || minTileY !== this.lastMinTileY
      || signature !== this.lastLightSignature || occlusionMap !== this.lastOcclusionMap;
    if (rebuild) {
      this.fieldRebuildsValue += 1;
      const startedAt = performance.now();
      this.lightPixels.fill(0);
      this.haloPixels.fill(0);
      rasterizeLightOcclusion(
        this.occlusion,
        width,
        height,
        minTileX,
        minTileY,
        LIGHT_TEXELS_PER_TILE,
        occlusionMap,
      );
      buildLightOcclusionPrefix(this.occlusionPrefix, width, height, this.occlusion);
      this.floodTexelsVisitedValue = 0;
      for (const light of lights) {
        this.flood.apply(
          this.lightPixels,
          this.haloPixels,
          width,
          height,
          {
            centerX: lightmapCoordinate(light.worldX, minTileX, LIGHT_TEXELS_PER_TILE),
            centerY: lightmapCoordinate(light.worldY, minTileY, LIGHT_TEXELS_PER_TILE),
            radius: light.radiusTiles * LIGHT_TEXELS_PER_TILE,
            color: light.color,
            ...(light.strengthPerMille === undefined ? {} : { strengthPerMille: light.strengthPerMille }),
            ...(light.facing === undefined ? {} : { facing: light.facing }),
            ...(light.profile === undefined ? {} : { profile: light.profile }),
          },
          this.occlusion,
          this.occlusionPrefix,
        );
        this.floodTexelsVisitedValue += this.flood.lastVisitedTexels;
      }
      this.floodMsValue = performance.now() - startedAt;
      this.lastMinTileX = minTileX;
      this.lastMinTileY = minTileY;
      this.lastLightSignature = signature;
      this.lastOcclusionMap = occlusionMap;
      this.haloVisible = lights.some((light) => light.profile === 'flame' || light.profile === 'pulse');
      if (this.haloVisible && this.haloImage !== null) this.haloContext.putImageData(this.haloImage, 0, 0);
    }
    if (this.image === null || this.haloImage === null) {
      this.recordLightmapFrame(performance.now() - lightmapStartedAt);
      return;
    }
    const ambientSignature = ambient.r << 16 | ambient.g << 8 | ambient.b;
    if (rebuild || ambientSignature !== this.lastAmbientSignature) {
      fillLightmap(this.pixels, ambient);
      for (let offset = 0; offset < this.pixels.length; offset += 4) {
        this.pixels[offset] = Math.max(this.pixels[offset] ?? 0, this.lightPixels[offset] ?? 0);
        this.pixels[offset + 1] = Math.max(this.pixels[offset + 1] ?? 0, this.lightPixels[offset + 1] ?? 0);
        this.pixels[offset + 2] = Math.max(this.pixels[offset + 2] ?? 0, this.lightPixels[offset + 2] ?? 0);
      }
      this.context.putImageData(this.image, 0, 0);
      this.lastAmbientSignature = ambientSignature;
    }
    target.save();
    // Filter only the low-resolution light overlay. Terrain and sprites are
    // still drawn nearest-neighbour elsewhere, while bilinear sampling here
    // blends adjacent flood bands and prevents visible concentric stair steps.
    target.imageSmoothingEnabled = true;
    target.globalCompositeOperation = 'multiply';
    target.drawImage(
      this.canvas,
      Math.round((minTileX * 16 - cameraX) * scale),
      Math.round((minTileY * 16 - cameraY) * scale),
      tileWidth * 16 * scale,
      tileHeight * 16 * scale,
    );
    target.restore();
    if (this.haloVisible) {
      target.save();
      target.imageSmoothingEnabled = true;
      target.globalCompositeOperation = 'lighter';
      target.drawImage(
        this.haloCanvas,
        Math.round((minTileX * 16 - cameraX) * scale),
        Math.round((minTileY * 16 - cameraY) * scale),
        tileWidth * 16 * scale,
        tileHeight * 16 * scale,
      );
      target.restore();
    }
    target.imageSmoothingEnabled = false;
    this.recordLightmapFrame(performance.now() - lightmapStartedAt);
  }

  private recordLightmapFrame(milliseconds: number): void {
    this.lightmapFrameTimes[this.lightmapFrameCursor] = milliseconds;
    this.lightmapFrameCursor = (this.lightmapFrameCursor + 1) % this.lightmapFrameTimes.length;
    this.lightmapFrameCount = Math.min(this.lightmapFrameTimes.length, this.lightmapFrameCount + 1);
  }

  private resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height && this.image !== null) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.haloCanvas.width = width;
    this.haloCanvas.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.lightPixels = new Uint8ClampedArray(width * height * 4);
    this.haloPixels = new Uint8ClampedArray(width * height * 4);
    this.occlusion = new Uint8Array(width * height);
    this.occlusionPrefix = new Uint32Array((width + 1) * (height + 1));
    this.image = new ImageData(this.pixels, width, height);
    this.haloImage = new ImageData(this.haloPixels, width, height);
    this.lastMinTileX = Number.NaN;
    this.lastMinTileY = Number.NaN;
    this.lastLightSignature = Number.NaN;
    this.lastAmbientSignature = Number.NaN;
    this.lastOcclusionMap = null;
    this.haloVisible = false;
  }
}
