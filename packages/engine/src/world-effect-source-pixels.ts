import { renderOperationCounters, renderCounterSupport, type AssetFrameSource } from '@orchard/ui';
import type { RgbColor } from './lighting.js';
import type { WorldFrameEffect } from './world-frame-effect.js';
import { writeWorldEffectPixels } from './world-effect-pixels.js';

export const WORLD_EFFECT_AUXILIARY_LIMIT = 12 * 1024 * 1024;
const WIDTH = 512, HEIGHT = 2048, PIXEL_LIMIT = WIDTH * HEIGHT * 4;
/** Immutable original/omit (or stone-art) pixels only; never a receiver scratch
 * page. Bounded source FIFO plus one fixed reader and one upload ImageData. */
export class WorldEffectSourcePixels {
  private reader: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private upload: ImageData | null = null;
  private pixels = new Map<string, Uint8ClampedArray>();
  private identities = new WeakMap<object, number>();
  private sequence = 0;
  private pixelBytes = 0;
  get bytes(): number { return this.pixelBytes + (this.reader === null ? 0 : PIXEL_LIMIT) + (this.upload?.data.byteLength ?? 0); }
  get surfaces(): number { return this.reader === null ? 0 : 1; }
  draw(target: CanvasRenderingContext2D, source: AssetFrameSource, color: RgbColor, effect: WorldFrameEffect, x: number, y: number): void {
    try {
      this.prepare();
      const input = this.source(source);
      writeWorldEffectPixels(input, source.width, source.height, this.upload!.data, WIDTH, color, effect, source.emissiveSpans);
      target.putImageData(this.upload!, x, y, 0, 0, source.width, source.height);
    } catch (error) { this.reset(); throw error; }
  }
  private prepare(): void {
    if (this.reader !== null) {
      if (this.context!.isContextLost?.()) throw new Error('world_effect_source_unavailable');
      return;
    }
    this.reader = document.createElement('canvas');
    if (!renderCounterSupport.nativeCanvas) renderOperationCounters.surfaceAllocations++;
    this.reader.width = WIDTH; this.reader.height = HEIGHT;
    this.context = this.reader.getContext('2d', { willReadFrequently: true });
    if (this.context === null || this.context.isContextLost?.()) throw new Error('world_effect_source_unavailable');
    this.upload = this.context.createImageData(WIDTH, HEIGHT);
    if (!renderCounterSupport.nativeCanvas) renderOperationCounters.imageDataAllocations++;
  }
  private source(source: AssetFrameSource): Uint8ClampedArray {
    let id = this.identities.get(source.image);
    if (id === undefined) { id = ++this.sequence; this.identities.set(source.image, id); }
    const key = `${id}:${source.x}:${source.y}:${source.width}:${source.height}`;
    const cached = this.pixels.get(key);
    if (cached !== undefined) return cached;
    const context = this.context!;
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    const data = context.getImageData(0, 0, source.width, source.height).data;
    // The native probe wraps constructors/createImageData, not source reads.
    renderOperationCounters.imageDataAllocations++;
    while (this.pixelBytes + data.byteLength > PIXEL_LIMIT) {
      const first = this.pixels.keys().next().value;
      if (first === undefined) throw new Error('world_effect_source_budget_exceeded');
      this.pixelBytes -= this.pixels.get(first)!.byteLength; this.pixels.delete(first);
    }
    this.pixels.set(key, data); this.pixelBytes += data.byteLength; return data;
  }
  reset(): void {
    if (this.reader !== null) this.reader.width = this.reader.height = 0;
    this.reader = null; this.context = null; this.upload = null;
    this.pixels.clear(); this.pixelBytes = 0; this.identities = new WeakMap(); this.sequence = 0;
  }
}
