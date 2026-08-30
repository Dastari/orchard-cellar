import { authorityDayProgress, dayProgressAtClockTime, lunarIlluminationAtAuthorityTick } from '@orchard/sim';
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
  /** Ground-plane Y used to decide whether this emitter is in front of or
   * behind south-facing top-down artwork. Defaults to the emitter's Y. */
  readonly receiverDirectionWorldY?: number;
  readonly radiusTiles: number;
  readonly color: RgbColor;
  readonly strengthPerMille?: number;
  readonly facing?: LightFacing;
  readonly profile?: LightProfile;
  /** Integer terrain plane sampled at the emitter's ground contact. Lights
   * share shadows only with geometry on that plane. */
  readonly elevationLayer?: number;
}

export const LIGHTING_MODELS = ['classic', 'unified'] as const;
export type LightingModel = (typeof LIGHTING_MODELS)[number];

/** Unified's directional correction belongs to upright artwork, not to
 * ground-plane decals. Keeping this semantic beside the lighting model makes
 * receiver intent explicit at painter-queue insertion sites. */
export type UnifiedLightReceiver = 'flat' | 'south';

export function unifiedDecorationLightReceiver(kind: string): UnifiedLightReceiver {
  if (kind === 'camp_pond' || kind === 'nature_fish_shadow' || kind === 'nature_lily_pad') {
    return 'flat';
  }
  return 'south';
}

/** New installs stay on the comparison baseline; an explicitly stored
 * Unified choice survives reload throughout the migration. */
export function lightingModelFromStoredValue(value: string | null): LightingModel {
  return value === 'unified' ? 'unified' : 'classic';
}

interface RasterizedOcclusionLayer {
  readonly occlusion: Uint8Array;
  readonly trunkOwners: Uint16Array;
  readonly receiverOwners: Uint16Array;
  readonly relitReceiverOwners: Uint16Array;
  readonly trunkCellIndices: Uint32Array;
  readonly occlusionPrefix: Uint32Array;
  readonly trunkCellCount: number;
}

/** Quarter-tile spatial sampling keeps flood work bounded; 8-bit falloff,
 * fractional seeds and bilinear composition provide smooth visual movement. */
export const LIGHT_TEXELS_PER_TILE = 4;
export const LIGHTMAP_TEXELS_PER_TILE = LIGHT_TEXELS_PER_TILE;
export const LIGHT_POSITION_SUBPIXELS_PER_WORLD_PIXEL = 4;

interface AmbientKeyframe {
  readonly progress: number;
  readonly color: RgbColor;
}

const AMBIENT_KEYFRAMES: readonly AmbientKeyframe[] = [
  { progress: 0, color: { r: 222, g: 174, b: 126 } }, // 06:00
  { progress: dayProgressAtClockTime(8), color: { r: 255, g: 255, b: 255 } },
  { progress: dayProgressAtClockTime(17), color: { r: 255, g: 255, b: 255 } },
  { progress: dayProgressAtClockTime(19), color: { r: 166, g: 128, b: 157 } },
  { progress: dayProgressAtClockTime(21), color: { r: 89, g: 89, b: 105 } },
  { progress: dayProgressAtClockTime(4), color: { r: 89, g: 89, b: 105 } },
  { progress: 1, color: { r: 222, g: 174, b: 126 } }, // next day's 06:00
];

const NIGHTFALL_START = dayProgressAtClockTime(19);
const FULL_NIGHT_START = dayProgressAtClockTime(21);
const PRE_DAWN_START = dayProgressAtClockTime(4);

export function lunarNightWeightAtProgress(dayProgress: number): number {
  const progress = Math.max(0, Math.min(1, dayProgress));
  if (progress <= NIGHTFALL_START) return 0;
  if (progress < FULL_NIGHT_START) {
    return (progress - NIGHTFALL_START) / (FULL_NIGHT_START - NIGHTFALL_START);
  }
  if (progress <= PRE_DAWN_START) return 1;
  return Math.max(0, (1 - progress) / (1 - PRE_DAWN_START));
}

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

function perceivedLight(color: RgbColor): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function southFaceLightFactor(dx: number, dy: number): number {
  const distance = Math.hypot(dx, dy);
  if (distance < 0.25) return 1;
  const frontDot = dy / distance;
  const sideBand = 0.35;
  if (frontDot <= -sideBand) return 0;
  if (frontDot >= sideBand) return 1;
  return (frontDot + sideBand) / (sideBand * 2);
}

/** Pre-darkens only the authored alpha pixels of a south-facing sprite so the
 * later shared lightmap cannot illuminate its visible front from behind. The
 * compensation is deliberately applied at sprite resolution rather than to
 * quarter-tile light texels; that keeps adjacent ground and foreground actors
 * untouched and avoids a bilinear halo around irregular silhouettes. */
export function southFacingReceiverBrightness(
  footX: number,
  footY: number,
  ambient: RgbColor,
  lights: readonly PointLight[],
  receiverElevationLayer?: number,
): number {
  const ambientLevel = perceivedLight(ambient);
  let unrestricted = ambientLevel;
  let facingRestricted = ambientLevel;
  for (const light of lights) {
    if (receiverElevationLayer !== undefined
      && (light.elevationLayer ?? 0) !== receiverElevationLayer) continue;
    const dx = light.worldX - footX;
    const emitterDy = light.worldY - footY;
    const absoluteX = Math.abs(dx);
    const absoluteY = Math.abs(emitterDy);
    const octileDistance = Math.max(absoluteX, absoluteY) + Math.min(absoluteX, absoluteY) * 0.5;
    const strength = Math.max(
      0,
      (light.strengthPerMille ?? 1000) / 1000 - octileDistance / Math.max(1, light.radiusTiles * 16),
    );
    if (strength <= 0) continue;
    const contribution = perceivedLight(light.color) * strength;
    unrestricted = Math.max(unrestricted, contribution);
    const directionY = (light.receiverDirectionWorldY ?? light.worldY) - footY;
    facingRestricted = Math.max(
      facingRestricted,
      contribution * southFaceLightFactor(dx, directionY),
    );
  }
  return unrestricted <= 0 ? 1 : Math.max(0, Math.min(1, facingRestricted / unrestricted));
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
  const lunarWeight = lunarNightWeightAtProgress(progress);
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
  private readonly southFacePixelsByElevation = new Map<number, Uint8Array>();
  private readonly occlusionLayers = new Map<number, RasterizedOcclusionLayer>();
  private floodTexelsVisitedValue = 0;
  private floodMsValue = 0;
  private fieldRebuildsValue = 0;
  private occlusionRebuildsValue = 0;
  private occlusionCacheHitsValue = 0;
  private boundsResizeMsValue = 0;
  private rasterizeMsValue = 0;
  private mergeMsValue = 0;
  private uploadMsValue = 0;
  private receiverMsValue = 0;
  private compositeMsValue = 0;
  private lastMinTileX = Number.NaN;
  private lastMinTileY = Number.NaN;
  private lastLightSignature = Number.NaN;
  private lastAmbientSignature = Number.NaN;
  private lastOcclusionMap: LightOcclusionMap | null = null;
  private lastLightingModel: LightingModel = 'classic';
  private haloVisible = false;
  private preparedMinTileX = 0;
  private preparedMinTileY = 0;
  private preparedTileWidth = 1;
  private preparedTileHeight = 1;
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
  get occlusionRebuilds(): number { return this.occlusionRebuildsValue; }
  get occlusionCacheHits(): number { return this.occlusionCacheHitsValue; }
  get boundsResizeMs(): number { return this.boundsResizeMsValue; }
  get rasterizeMs(): number { return this.rasterizeMsValue; }
  get mergeMs(): number { return this.mergeMsValue; }
  get uploadMs(): number { return this.uploadMsValue; }
  get receiverMs(): number { return this.receiverMsValue; }
  get compositeMs(): number { return this.compositeMsValue; }
  get averageMs(): number {
    let total = 0;
    for (let index = 0; index < this.lightmapFrameCount; index += 1) total += this.lightmapFrameTimes[index] ?? 0;
    return this.lightmapFrameCount === 0 ? 0 : total / this.lightmapFrameCount;
  }

  private lightSignature(lights: readonly PointLight[]): number {
    let hash = 2_166_136_261;
    hash = mixLightHash(hash, lights.length);
    for (const light of lights) {
      // Rebuild at quarter-world-pixel increments so the interpolated carried
      // light follows the rendered avatar rather than the 20 Hz authority step.
      hash = mixLightHash(hash, Math.round(light.worldX * LIGHT_POSITION_SUBPIXELS_PER_WORLD_PIXEL));
      hash = mixLightHash(hash, Math.round(light.worldY * LIGHT_POSITION_SUBPIXELS_PER_WORLD_PIXEL));
      hash = mixLightHash(hash, Math.round(
        (light.receiverDirectionWorldY ?? light.worldY) * LIGHT_POSITION_SUBPIXELS_PER_WORLD_PIXEL,
      ));
      hash = mixLightHash(hash, Math.round(light.radiusTiles * 100));
      hash = mixLightHash(hash, light.strengthPerMille ?? 1000);
      hash = mixLightHash(hash, light.color.r);
      hash = mixLightHash(hash, light.color.g);
      hash = mixLightHash(hash, light.color.b);
      hash = mixLightHash(hash, light.facing === 'up' ? 1 : light.facing === 'right' ? 2 : light.facing === 'down' ? 3 : light.facing === 'left' ? 4 : 0);
      hash = mixLightHash(hash, light.profile === 'flame' ? 1 : light.profile === 'pulse' ? 2 : 0);
      hash = mixLightHash(hash, light.elevationLayer ?? 0);
    }
    return hash;
  }

  prepare(
    terrain: TerrainArray,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
    ambient: RgbColor,
    lights: readonly PointLight[],
    occlusionMap: LightOcclusionMap | null = null,
    lightingModel: LightingModel = 'classic',
  ): void {
    const boundsStartedAt = performance.now();
    this.floodMsValue = 0;
    this.boundsResizeMsValue = 0;
    this.rasterizeMsValue = 0;
    this.mergeMsValue = 0;
    this.uploadMsValue = 0;
    this.receiverMsValue = 0;
    this.compositeMsValue = 0;
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
    const occlusionWindowChanged = minTileX !== this.lastMinTileX || minTileY !== this.lastMinTileY
      || occlusionMap !== this.lastOcclusionMap;
    if (occlusionWindowChanged) this.occlusionLayers.clear();
    const rebuild = minTileX !== this.lastMinTileX || minTileY !== this.lastMinTileY
      || signature !== this.lastLightSignature || occlusionMap !== this.lastOcclusionMap
      || lightingModel !== this.lastLightingModel;
    this.boundsResizeMsValue = performance.now() - boundsStartedAt;
    if (rebuild) {
      this.fieldRebuildsValue += 1;
      this.lightPixels.fill(0);
      this.haloPixels.fill(0);
      for (const facePixels of this.southFacePixelsByElevation.values()) facePixels.fill(0);
      this.floodTexelsVisitedValue = 0;
      const groupingStartedAt = performance.now();
      const lightsByElevation = new Map<number, PointLight[]>();
      for (const light of lights) {
        const elevation = light.elevationLayer ?? 0;
        const group = lightsByElevation.get(elevation) ?? [];
        group.push(light);
        lightsByElevation.set(elevation, group);
      }
      let floodMilliseconds = performance.now() - groupingStartedAt;
      let rasterizeMilliseconds = 0;
      for (const [elevation, elevationLights] of lightsByElevation) {
        const rasterStartedAt = performance.now();
        const layer = this.occlusionLayer(
          width, height, minTileX, minTileY, occlusionMap, elevation,
        );
        rasterizeMilliseconds += performance.now() - rasterStartedAt;
        const southFacePixels = lightingModel === 'unified'
          ? this.southFaceLayer(elevation, width * height)
          : null;
        const floodStartedAt = performance.now();
        for (const light of elevationLights) {
          this.flood.apply(
            this.lightPixels,
            this.haloPixels,
            width,
            height,
            {
              centerX: lightmapCoordinate(light.worldX, minTileX, LIGHT_TEXELS_PER_TILE),
              centerY: lightmapCoordinate(light.worldY, minTileY, LIGHT_TEXELS_PER_TILE),
              ...(light.receiverDirectionWorldY === undefined ? {} : {
                receiverDirectionCenterY: lightmapCoordinate(
                  light.receiverDirectionWorldY, minTileY, LIGHT_TEXELS_PER_TILE,
                ),
              }),
              radius: light.radiusTiles * LIGHT_TEXELS_PER_TILE,
              color: light.color,
              ...(light.strengthPerMille === undefined ? {} : { strengthPerMille: light.strengthPerMille }),
              ...(light.facing === undefined ? {} : { facing: light.facing }),
              ...(light.profile === undefined ? {} : { profile: light.profile }),
            },
            layer.occlusion,
            layer.occlusionPrefix,
            layer.trunkOwners,
            layer.receiverOwners,
            layer.trunkCellIndices,
            layer.trunkCellCount,
            layer.relitReceiverOwners,
            southFacePixels,
          );
          this.floodTexelsVisitedValue += this.flood.lastVisitedTexels;
        }
        floodMilliseconds += performance.now() - floodStartedAt;
      }
      this.floodMsValue = floodMilliseconds;
      this.rasterizeMsValue = rasterizeMilliseconds;
      this.lastMinTileX = minTileX;
      this.lastMinTileY = minTileY;
      this.lastLightSignature = signature;
      this.lastOcclusionMap = occlusionMap;
      this.lastLightingModel = lightingModel;
      this.haloVisible = lights.some((light) => light.profile === 'flame' || light.profile === 'pulse');
      const uploadStartedAt = performance.now();
      if (this.haloVisible && this.haloImage !== null) this.haloContext.putImageData(this.haloImage, 0, 0);
      this.uploadMsValue = performance.now() - uploadStartedAt;
    }
    if (this.image === null || this.haloImage === null) {
      return;
    }
    const ambientSignature = ambient.r << 16 | ambient.g << 8 | ambient.b;
    if (rebuild || ambientSignature !== this.lastAmbientSignature) {
      const mergeStartedAt = performance.now();
      fillLightmap(this.pixels, ambient);
      for (let offset = 0; offset < this.pixels.length; offset += 4) {
        this.pixels[offset] = Math.max(this.pixels[offset] ?? 0, this.lightPixels[offset] ?? 0);
        this.pixels[offset + 1] = Math.max(this.pixels[offset + 1] ?? 0, this.lightPixels[offset + 1] ?? 0);
        this.pixels[offset + 2] = Math.max(this.pixels[offset + 2] ?? 0, this.lightPixels[offset + 2] ?? 0);
      }
      this.mergeMsValue = performance.now() - mergeStartedAt;
      const uploadStartedAt = performance.now();
      this.context.putImageData(this.image, 0, 0);
      this.uploadMsValue += performance.now() - uploadStartedAt;
      this.lastAmbientSignature = ambientSignature;
    }
    this.preparedMinTileX = minTileX;
    this.preparedMinTileY = minTileY;
    this.preparedTileWidth = tileWidth;
    this.preparedTileHeight = tileHeight;
  }

  composite(
    target: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    scale: number,
  ): void {
    if (this.image === null || this.haloImage === null) {
      this.recordLightmapFrame();
      return;
    }
    const compositeStartedAt = performance.now();
    target.save();
    // Filter only the low-resolution light overlay. Terrain and sprites are
    // still drawn nearest-neighbour elsewhere, while bilinear sampling here
    // blends adjacent flood bands and prevents visible concentric stair steps.
    target.imageSmoothingEnabled = true;
    target.globalCompositeOperation = 'multiply';
    target.drawImage(
      this.canvas,
      Math.round((this.preparedMinTileX * 16 - cameraX) * scale),
      Math.round((this.preparedMinTileY * 16 - cameraY) * scale),
      this.preparedTileWidth * 16 * scale,
      this.preparedTileHeight * 16 * scale,
    );
    target.restore();
    if (this.haloVisible) {
      target.save();
      target.imageSmoothingEnabled = true;
      target.globalCompositeOperation = 'lighter';
      target.drawImage(
        this.haloCanvas,
        Math.round((this.preparedMinTileX * 16 - cameraX) * scale),
        Math.round((this.preparedMinTileY * 16 - cameraY) * scale),
        this.preparedTileWidth * 16 * scale,
        this.preparedTileHeight * 16 * scale,
      );
      target.restore();
    }
    target.imageSmoothingEnabled = false;
    this.compositeMsValue = performance.now() - compositeStartedAt;
    this.recordLightmapFrame();
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
    lightingModel: LightingModel = 'classic',
  ): void {
    this.prepare(
      terrain, cameraX, cameraY, scale, viewportWidth, viewportHeight,
      ambient, lights, occlusionMap, lightingModel,
    );
    this.composite(target, cameraX, cameraY, scale);
  }

  /** Returns the occlusion-aware correction for a south-facing elevated
   * receiver. The shared multiply pass supplies unrestricted illumination;
   * this ratio removes only light arriving through the receiver's back face. */
  southFaceBrightness(
    worldX: number,
    projectedWorldY: number,
    ambient: RgbColor,
    elevationLayer = 0,
  ): number {
    const startedAt = performance.now();
    const unrestricted = this.samplePreparedLuma(this.pixels, worldX, projectedWorldY, true);
    const facePixels = this.southFacePixelsByElevation.get(elevationLayer);
    const ambientLevel = perceivedLight(ambient);
    const restricted = Math.max(
      ambientLevel,
      facePixels === undefined ? 0 : this.samplePreparedLuma(facePixels, worldX, projectedWorldY, false),
    );
    const brightness = unrestricted <= 0 ? 1 : Math.max(0, Math.min(1, restricted / unrestricted));
    this.receiverMsValue += performance.now() - startedAt;
    return brightness;
  }

  private recordLightmapFrame(): void {
    const milliseconds = this.boundsResizeMsValue
      + this.rasterizeMsValue
      + this.floodMsValue
      + this.mergeMsValue
      + this.uploadMsValue
      + this.receiverMsValue
      + this.compositeMsValue;
    this.lightmapFrameTimes[this.lightmapFrameCursor] = milliseconds;
    this.lightmapFrameCursor = (this.lightmapFrameCursor + 1) % this.lightmapFrameTimes.length;
    this.lightmapFrameCount = Math.min(this.lightmapFrameTimes.length, this.lightmapFrameCount + 1);
  }

  private southFaceLayer(elevation: number, cellCount: number): Uint8Array {
    const current = this.southFacePixelsByElevation.get(elevation);
    if (current !== undefined && current.length === cellCount) return current;
    const next = new Uint8Array(cellCount);
    this.southFacePixelsByElevation.set(elevation, next);
    return next;
  }

  private occlusionLayer(
    width: number,
    height: number,
    minTileX: number,
    minTileY: number,
    occlusionMap: LightOcclusionMap | null,
    elevation: number,
  ): RasterizedOcclusionLayer {
    const cached = this.occlusionLayers.get(elevation);
    if (cached !== undefined) {
      this.occlusionCacheHitsValue += 1;
      return cached;
    }
    const cellCount = width * height;
    const occlusion = new Uint8Array(cellCount);
    const trunkOwners = new Uint16Array(cellCount);
    const receiverOwners = new Uint16Array(cellCount);
    const relitReceiverOwners = new Uint16Array(cellCount);
    const trunkCellIndices = new Uint32Array(cellCount);
    const occlusionPrefix = new Uint32Array((width + 1) * (height + 1));
    const trunkCellCount = rasterizeLightOcclusion(
      occlusion,
      width,
      height,
      minTileX,
      minTileY,
      LIGHT_TEXELS_PER_TILE,
      occlusionMap,
      trunkOwners,
      receiverOwners,
      trunkCellIndices,
      relitReceiverOwners,
      elevation,
    );
    buildLightOcclusionPrefix(occlusionPrefix, width, height, occlusion);
    const layer = {
      occlusion,
      trunkOwners,
      receiverOwners,
      relitReceiverOwners,
      trunkCellIndices,
      occlusionPrefix,
      trunkCellCount,
    } satisfies RasterizedOcclusionLayer;
    this.occlusionLayers.set(elevation, layer);
    this.occlusionRebuildsValue += 1;
    return layer;
  }

  private samplePreparedLuma(
    buffer: Uint8ClampedArray | Uint8Array,
    worldX: number,
    projectedWorldY: number,
    rgba: boolean,
  ): number {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0 || buffer.length === 0) return 0;
    const sampleX = Math.max(0, Math.min(
      width - 1,
      lightmapCoordinate(worldX, this.preparedMinTileX, LIGHT_TEXELS_PER_TILE),
    ));
    const sampleY = Math.max(0, Math.min(
      height - 1,
      lightmapCoordinate(projectedWorldY, this.preparedMinTileY, LIGHT_TEXELS_PER_TILE),
    ));
    const left = Math.floor(sampleX);
    const top = Math.floor(sampleY);
    const right = Math.min(width - 1, left + 1);
    const bottom = Math.min(height - 1, top + 1);
    const amountX = sampleX - left;
    const amountY = sampleY - top;
    const at = (x: number, y: number): number => {
      const index = y * width + x;
      if (!rgba) return buffer[index] ?? 0;
      const offset = index * 4;
      return (buffer[offset] ?? 0) * 0.2126
        + (buffer[offset + 1] ?? 0) * 0.7152
        + (buffer[offset + 2] ?? 0) * 0.0722;
    };
    const upper = at(left, top) + (at(right, top) - at(left, top)) * amountX;
    const lower = at(left, bottom) + (at(right, bottom) - at(left, bottom)) * amountX;
    return upper + (lower - upper) * amountY;
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
    this.occlusionLayers.clear();
    this.southFacePixelsByElevation.clear();
    this.image = new ImageData(this.pixels, width, height);
    this.haloImage = new ImageData(this.haloPixels, width, height);
    this.lastMinTileX = Number.NaN;
    this.lastMinTileY = Number.NaN;
    this.lastLightSignature = Number.NaN;
    this.lastAmbientSignature = Number.NaN;
    this.lastOcclusionMap = null;
    this.lastLightingModel = 'classic';
    this.haloVisible = false;
  }
}
