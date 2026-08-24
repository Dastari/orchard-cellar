import { authorityDayProgress } from '@orchard/sim';
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
}

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

export const LANTERN_LIGHT: RgbColor = { r: 255, g: 217, b: 160 };
export const TORCH_LIGHT: RgbColor = { r: 255, g: 184, b: 104 };

export function playerLightPosition(worldX: number, footY: number): readonly [number, number] {
  return [worldX, footY - 12];
}

function lerp(left: number, right: number, amount: number): number {
  return Math.round(left + (right - left) * amount);
}

export function ambientAtProgress(dayProgress: number, rainDarkening = 0): RgbColor {
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
  const weather = 1 - Math.max(0, Math.min(0.18, rainDarkening));
  return {
    r: Math.max(89, Math.round(lerp(left.color.r, right.color.r, amount) * weather)),
    g: Math.max(89, Math.round(lerp(left.color.g, right.color.g, amount) * weather)),
    b: Math.max(89, Math.round(lerp(left.color.b, right.color.b, amount) * weather)),
  };
}

export function ambientAtTick(authorityTick: bigint, rainDarkening = 0): RgbColor {
  return ambientAtProgress(authorityDayProgress(authorityTick), rainDarkening);
}

export function fillLightmap(buffer: Uint8ClampedArray, ambient: RgbColor): void {
  for (let index = 0; index < buffer.length; index += 4) {
    buffer[index] = ambient.r;
    buffer[index + 1] = ambient.g;
    buffer[index + 2] = ambient.b;
    buffer[index + 3] = 255;
  }
}

/** Converts a world point to a texel index where texels sample tile centres. */
export function lightmapCoordinate(worldPixels: number, firstTile: number): number {
  return worldPixels / 16 - firstTile - 0.5;
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
      const offset = (y * width + x) * 4;
      buffer[offset] = Math.max(buffer[offset] ?? 0, Math.round(color.r * strength));
      buffer[offset + 1] = Math.max(buffer[offset + 1] ?? 0, Math.round(color.g * strength));
      buffer[offset + 2] = Math.max(buffer[offset + 2] ?? 0, Math.round(color.b * strength));
    }
  }
}

export class TileLightmap {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private pixels = new Uint8ClampedArray(0);

  constructor() {
    const context = this.canvas.getContext('2d');
    if (context === null) throw new Error('Lightmap Canvas 2D unavailable');
    this.context = context;
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
  ): void {
    const margin = 2;
    const minTileX = Math.max(0, Math.floor(cameraX / 16) - margin);
    const minTileY = Math.max(0, Math.floor(cameraY / 16) - margin);
    const maxTileX = Math.min(terrain.width - 1, Math.ceil((cameraX + viewportWidth / scale) / 16) + margin);
    const maxTileY = Math.min(terrain.height - 1, Math.ceil((cameraY + viewportHeight / scale) / 16) + margin);
    const width = Math.max(1, maxTileX - minTileX + 1);
    const height = Math.max(1, maxTileY - minTileY + 1);
    this.resize(width, height);
    fillLightmap(this.pixels, ambient);
    for (const light of lights) {
      stampPointLight(
        this.pixels,
        width,
        height,
        lightmapCoordinate(light.worldX, minTileX),
        lightmapCoordinate(light.worldY, minTileY),
        light.radiusTiles,
        light.color,
      );
    }
    if (this.image === null) return;
    this.context.putImageData(this.image, 0, 0);
    target.save();
    target.imageSmoothingEnabled = false;
    target.globalCompositeOperation = 'multiply';
    target.drawImage(
      this.canvas,
      Math.round((minTileX * 16 - cameraX) * scale),
      Math.round((minTileY * 16 - cameraY) * scale),
      width * 16 * scale,
      height * 16 * scale,
    );
    target.restore();
    target.imageSmoothingEnabled = false;
  }

  private resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height && this.image !== null) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.image = new ImageData(this.pixels, width, height);
  }
}
