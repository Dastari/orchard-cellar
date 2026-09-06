import type { RgbColor } from './lighting.js';

export type LightingQuality = 'basic' | 'dynamic';
export const LIGHTING_QUALITY_KEY = 'orchard.video.lighting-quality';
export const LEGACY_LIGHTING_DISABLED_KEY = 'orchard.developer.lighting-effects-disabled';
interface LightingStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function readLightingQuality(storage: LightingStorage): LightingQuality {
  const stored = storage.getItem(LIGHTING_QUALITY_KEY);
  const quality = stored === 'basic' || stored === 'dynamic' ? stored
    : storage.getItem(LEGACY_LIGHTING_DISABLED_KEY) === 'true' ? 'basic' : 'dynamic';
  storage.setItem(LIGHTING_QUALITY_KEY, quality);
  storage.removeItem(LEGACY_LIGHTING_DISABLED_KEY);
  return quality;
}

/** Requested choice is persisted independently of any preparation fallback. */
export class LightingQualityState {
  private generationValue = 0;
  requested: LightingQuality;
  effective: LightingQuality;
  reason: string | null = null;
  constructor(initial: LightingQuality) { this.requested = this.effective = initial; }
  get generation(): number { return this.generationValue; }
  request(quality: LightingQuality): number {
    this.requested = quality; this.reason = null;
    return ++this.generationValue;
  }
  /** Call only at a frame boundary, after that generation's visible inputs are ready. */
  commit(generation: number, dynamicReady: boolean): boolean {
    if (generation !== this.generationValue || (this.requested === 'dynamic' && !dynamicReady)) return false;
    this.effective = this.requested; this.reason = null;
    return true;
  }
  fallback(generation: number, reason: string): void {
    if (generation !== this.generationValue) return;
    this.effective = 'basic'; this.reason = reason;
  }
}

/** One fill over the active world viewport. The caller draws HUD/UI afterwards. */
export function compositeBasicLighting(context: CanvasRenderingContext2D, width: number, height: number, color: RgbColor): void {
  if (color.r === 255 && color.g === 255 && color.b === 255) return;
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.beginPath(); context.rect(0, 0, width, height); context.clip();
    context.globalAlpha = 1;
    context.filter = 'none';
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    context.fillRect(0, 0, width, height);
  } finally { context.restore(); }
}
