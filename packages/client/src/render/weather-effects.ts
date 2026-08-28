import { AUTHORITY_HZ, type WeatherVisualState } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { atlasFrames, selectAtlasFrame } from './sprite.js';

const CLOUD_SPACING_X = 192;
const CLOUD_SPACING_Y = 160;
export const CLOUD_VISUAL_SCALES = [1, 1.5, 2, 2.5] as const;
const GUST_SPACING_X = 176;
const GUST_SPACING_Y = 112;

export interface WindTreeSource {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
}

function mix32(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/** Stable world-cell noise; exported so weather placement cannot silently become client-random. */
export function weatherCellNoise(cellX: number, cellY: number, salt = 0): number {
  return mix32(Math.imul(cellX | 0, 0x1f123bb5) ^ Math.imul(cellY | 0, 0x5f356495) ^ salt)
    / 0x1_0000_0000;
}

export function weatherLoopPhase(seconds: number, period: number, offset: number): number {
  const elapsed = seconds + offset * period;
  return ((elapsed % period) + period) % period / period;
}

export function cloudVisualScale(noise: number): number {
  const clamped = Math.max(0, Math.min(0.999_999, noise));
  if (clamped < 0.24) return CLOUD_VISUAL_SCALES[0];
  if (clamped < 0.54) return CLOUD_VISUAL_SCALES[1];
  if (clamped < 0.82) return CLOUD_VISUAL_SCALES[2];
  return CLOUD_VISUAL_SCALES[3];
}

export function cloudVariantIndex(cellX: number, cellY: number, variantCount: number): number {
  return Math.floor(weatherCellNoise(cellX, cellY, 0x53484144) * Math.max(1, variantCount));
}

/** Integrates cloud motion from monotonic authority deltas. Multiplying total
 * uptime by the current wind vector makes a direction change reinterpret all
 * previous motion and teleport the cloud field. */
export class CloudDriftIntegrator {
  private x = 0;
  private y = 0;
  private lastAuthorityTick: number | null = null;

  advance(
    renderAuthorityTick: number,
    speed: number,
    directionX: number,
    directionY: number,
  ): readonly [number, number] {
    if (this.lastAuthorityTick === null) {
      const seconds = renderAuthorityTick / AUTHORITY_HZ;
      this.x = seconds * speed * directionX;
      this.y = seconds * speed * directionY;
      this.lastAuthorityTick = renderAuthorityTick;
      return [this.x, this.y];
    }
    const elapsedTicks = renderAuthorityTick - this.lastAuthorityTick;
    this.lastAuthorityTick = renderAuthorityTick;
    // Background tabs, reconnects, and clock correction snaps should not make
    // cosmetic clouds race through missed history on one frame.
    if (elapsedTicks < 0 || elapsedTicks > AUTHORITY_HZ * 4) return [this.x, this.y];
    const elapsedSeconds = elapsedTicks / AUTHORITY_HZ;
    this.x += elapsedSeconds * speed * directionX;
    this.y += elapsedSeconds * speed * directionY;
    return [this.x, this.y];
  }

  reset(): void {
    this.lastAuthorityTick = null;
  }
}

export function windLeafOpacity(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  const fadeIn = Math.min(1, progress / 0.08);
  const fadeOut = progress <= 0.62 ? 1 : (1 - progress) / 0.38;
  return Math.max(0, Math.min(1, fadeIn * fadeOut * fadeOut));
}

export function windLeafEmission(windStrength: number): {
  readonly interval: number;
  readonly probability: number;
  readonly maximumAlpha: number;
} {
  const strength = Math.max(0, Math.min(1, (windStrength - 0.3) / 0.7));
  return {
    interval: 2.8 - strength * 1.2,
    probability: 0.06 + strength * 0.24,
    maximumAlpha: 0.42 + strength * 0.26,
  };
}

export function windDirectionLabel(directionX: number, directionY: number): string {
  const horizontal = Math.abs(directionX) < 0.25 ? '' : directionX > 0 ? 'E' : 'W';
  const vertical = Math.abs(directionY) < 0.25 ? '' : directionY > 0 ? 'S' : 'N';
  return `${vertical}${horizontal}` || '-';
}

export function treeSwayOffset(
  weather: WeatherVisualState,
  renderAuthorityTick: number,
  treeSeed: number,
): readonly [number, number] {
  if (weather.wind < 0.3) return [0, 0];
  const seconds = renderAuthorityTick / AUTHORITY_HZ;
  const phase = seconds * Math.PI * (0.7 + weather.wind * 0.75) + (treeSeed % 29) * 0.11;
  const wave = Math.sin(phase) * 0.78 + Math.sin(phase * 0.43 + 1.7) * 0.22;
  const amplitude = ((weather.wind - 0.3) / 0.7) * 1.8;
  return [
    Math.round(weather.windDirectionX * wave * amplitude),
    Math.round(weather.windDirectionY * wave * amplitude * 0.75),
  ];
}

function drawFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX = false,
): boolean {
  const frame = selectAtlasFrame(asset.metadata, animation, frameIndex);
  if (frame === null) return false;
  const drawX = Math.round(x);
  const drawY = Math.round(y);
  const width = frame.width * scale;
  const height = frame.height * scale;
  if (flipX) {
    context.save();
    context.translate(drawX + width, 0);
    context.scale(-1, 1);
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, 0, drawY, width, height);
    context.restore();
  } else {
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, drawX, drawY, width, height);
  }
  return true;
}

/** Authored cloud shadows and wind debris derived entirely from shared weather + clock state. */
export class WeatherEffects {
  private readonly cloudDrift = new CloudDriftIntegrator();

  constructor(
    private readonly cloudShadow: LoadedAsset,
    private readonly windGust: LoadedAsset,
    private readonly oakLeaf: LoadedAsset,
    private readonly birchLeaf: LoadedAsset,
    private readonly spruceLeaf: LoadedAsset,
  ) {}

  resetTimeline(): void {
    this.cloudDrift.reset();
  }

  drawCloudShadows(
    context: CanvasRenderingContext2D,
    weather: WeatherVisualState,
    renderAuthorityTick: number,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWorldWidth: number,
    viewportWorldHeight: number,
  ): number {
    if (weather.cloudShadow <= 0.01) return 0;
    const cloudSpeed = 3 + weather.wind * 12;
    const [driftX, driftY] = this.cloudDrift.advance(
      renderAuthorityTick,
      cloudSpeed,
      weather.windDirectionX,
      weather.windDirectionY,
    );
    const frames = atlasFrames(this.cloudShadow.metadata, 'base');
    const maximumFrameSize = frames.reduce((largest, frame) => (
      Math.max(largest, frame.width, frame.height)
    ), 64);
    const margin = Math.ceil(maximumFrameSize * CLOUD_VISUAL_SCALES.at(-1)!);
    const firstCellX = Math.floor((cameraX - margin - driftX) / CLOUD_SPACING_X);
    const lastCellX = Math.ceil((cameraX + viewportWorldWidth + margin - driftX) / CLOUD_SPACING_X);
    const firstCellY = Math.floor((cameraY - margin - driftY) / CLOUD_SPACING_Y);
    const lastCellY = Math.ceil((cameraY + viewportWorldHeight + margin - driftY) / CLOUD_SPACING_Y);
    const density = 0.08 + weather.cloudShadow * 0.68;
    const previousAlpha = context.globalAlpha;
    const weatherAlpha = Math.min(1, 0.22 + weather.cloudShadow * 0.9);
    let draws = 0;
    for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
      for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
        if (weatherCellNoise(cellX, cellY, 0x434c4f55) > density) continue;
        const variant = cloudVariantIndex(cellX, cellY, frames.length);
        const visualScale = cloudVisualScale(weatherCellNoise(cellX, cellY, 0x53495a45));
        const opacityNoise = weatherCellNoise(cellX, cellY, 0x4f504143);
        const sizeFade = 1 - (visualScale - 1) * 0.06;
        context.globalAlpha = previousAlpha * weatherAlpha * sizeFade * (0.76 + opacityNoise * 0.24);
        const offsetX = weatherCellNoise(cellX, cellY, 0x584f4646) * 72;
        const offsetY = weatherCellNoise(cellX, cellY, 0x594f4646) * 56;
        const worldX = cellX * CLOUD_SPACING_X + driftX + offsetX;
        const worldY = cellY * CLOUD_SPACING_Y + driftY + offsetY;
        if (drawFrame(
          context,
          this.cloudShadow,
          'base',
          variant,
          (worldX - cameraX) * scale,
          (worldY - cameraY) * scale,
          scale * visualScale,
        )) draws += 1;
      }
    }
    context.globalAlpha = previousAlpha;
    return draws;
  }

  drawWind(
    context: CanvasRenderingContext2D,
    weather: WeatherVisualState,
    renderAuthorityTick: number,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWorldWidth: number,
    viewportWorldHeight: number,
    trees: readonly WindTreeSource[],
  ): number {
    // A light breeze moves shadows but does not fill the screen with debris.
    if (weather.wind < 0.3) return 0;
    const seconds = renderAuthorityTick / AUTHORITY_HZ;
    const previousAlpha = context.globalAlpha;
    let draws = 0;
    const gustFrames = this.windGust.metadata.animations['gust'] ?? [];
    const gustPeriod = 4.5 - weather.wind * 2.6;
    const gustDuration = Math.max(0.2, gustFrames.length / 14);
    const firstGustX = Math.floor((cameraX - 32) / GUST_SPACING_X);
    const lastGustX = Math.ceil((cameraX + viewportWorldWidth + 32) / GUST_SPACING_X);
    const firstGustY = Math.floor((cameraY - 24) / GUST_SPACING_Y);
    const lastGustY = Math.ceil((cameraY + viewportWorldHeight + 24) / GUST_SPACING_Y);
    context.globalAlpha = previousAlpha * Math.min(0.82, 0.28 + weather.wind * 0.54);
    for (let cellY = firstGustY; cellY <= lastGustY; cellY += 1) {
      for (let cellX = firstGustX; cellX <= lastGustX; cellX += 1) {
        if (weatherCellNoise(cellX, cellY, 0x47555354) > weather.wind * 0.44) continue;
        const phase = weatherLoopPhase(seconds, gustPeriod, weatherCellNoise(cellX, cellY, 0x50484153));
        const activeFraction = gustDuration / gustPeriod;
        if (phase >= activeFraction) continue;
        const animationProgress = phase / activeFraction;
        const frameIndex = Math.min(gustFrames.length - 1, Math.floor(animationProgress * gustFrames.length));
        const gustTravel = animationProgress * 18 * weather.wind;
        const worldX = cellX * GUST_SPACING_X + weatherCellNoise(cellX, cellY, 0x47555358) * 96
          + gustTravel * weather.windDirectionX;
        const worldY = cellY * GUST_SPACING_Y + weatherCellNoise(cellX, cellY, 0x47555359) * 72
          + gustTravel * weather.windDirectionY;
        if (drawFrame(
          context, this.windGust, 'gust', frameIndex,
          (worldX - cameraX) * scale, (worldY - cameraY) * scale, scale,
          weather.windDirectionX < 0,
        )) draws += 1;
      }
    }
    draws += this.drawTreeLeaves(context, weather, seconds, cameraX, cameraY, scale, trees, previousAlpha);
    context.globalAlpha = previousAlpha;
    return draws;
  }

  private drawTreeLeaves(
    context: CanvasRenderingContext2D,
    weather: WeatherVisualState,
    seconds: number,
    cameraX: number,
    cameraY: number,
    scale: number,
    trees: readonly WindTreeSource[],
    baseAlpha: number,
  ): number {
    const emission = windLeafEmission(weather.wind);
    const interval = emission.interval;
    const lifetime = 2.35;
    const generations = Math.ceil(lifetime / interval) + 1;
    let draws = 0;
    for (const tree of trees) {
      const treePhase = weatherCellNoise(tree.id, 0, 0x4c465048) * interval;
      const latestGeneration = Math.floor((seconds - treePhase) / interval);
      for (let offset = 0; offset < generations; offset += 1) {
        const generation = latestGeneration - offset;
        if (weatherCellNoise(tree.id, generation, 0x4c465052) > emission.probability) continue;
        const timeNoise = weatherCellNoise(tree.id, generation, 0x4c46544d);
        const spawnedAt = generation * interval + treePhase + timeNoise * interval * 0.14;
        const age = seconds - spawnedAt;
        if (age < 0 || age >= lifetime) continue;
        const progress = age / lifetime;
        const opacity = windLeafOpacity(progress) * emission.maximumAlpha;
        if (opacity <= 0.01) continue;
        const canopyWidth = tree.kind === 'tree_acacia' ? 62 : 34;
        const startX = tree.x + (weatherCellNoise(tree.id, generation, 0x4c465358) - 0.5) * canopyWidth;
        const startY = tree.y - 47 + weatherCellNoise(tree.id, generation, 0x4c465359) * 22;
        const travelSpeed = 21 + weather.wind * 34;
        const crosswind = (weatherCellNoise(tree.id, generation, 0x4c465843) - 0.5) * 8;
        const worldX = startX
          + weather.windDirectionX * travelSpeed * age
          - weather.windDirectionY * crosswind * age;
        const worldY = startY
          + weather.windDirectionY * travelSpeed * age
          + weather.windDirectionX * crosswind * age
          - Math.sin(progress * Math.PI) * (7 + weather.wind * 5)
          + progress * progress * 9;
        context.globalAlpha = baseAlpha * opacity;
        if (drawFrame(
          context,
          this.leafAsset(tree.kind),
          'base',
          0,
          (worldX - cameraX) * scale,
          (worldY - cameraY) * scale,
          scale * 0.7,
          weatherCellNoise(tree.id, generation, 0x4c464c50) > 0.5,
        )) draws += 1;
      }
    }
    return draws;
  }

  private leafAsset(treeKind: string): LoadedAsset {
    if (treeKind === 'tree_birch') return this.birchLeaf;
    if (treeKind === 'tree_spruce') return this.spruceLeaf;
    return this.oakLeaf;
  }
}
