import type { AssetFrameSource } from '@orchard/ui';
import type { RgbColor } from './lighting.js';

/** Snug RGB-tinted sprite frames, independent of shared/original artwork.
 * Opaque body pixels retain exact channel multiplication and source alpha is
 * restored after the multiply so empty padding never becomes a rectangle. */
export class ReceiverFrameCache {
  private readonly entries = new Map<string, AssetFrameSource>();
  private readonly spareSurfaces: HTMLCanvasElement[] = [];
  private identities = new WeakMap<object, number>();
  private sequence = 0;
  private bytesValue = 0;
  private allocationsValue = 0;
  builds = 0;
  reuses = 0;
  constructor(readonly budgetBytes = 4 * 1024 * 1024, readonly surfaceLimit = 256) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0
      || !Number.isSafeInteger(surfaceLimit) || surfaceLimit < 1) throw new Error('Invalid receiver cache budget');
  }
  get bytes(): number { return this.bytesValue; }
  get surfaces(): number { return this.entries.size + this.spareSurfaces.length; }
  get allocations(): number { return this.allocationsValue; }
  /** Results are immediate-draw scratch sources. Consumers must not retain or
   * derive another identity-keyed cache from their mutable Canvas image. */
  source(source: AssetFrameSource, color: RgbColor): AssetFrameSource {
    if (color.r === 255 && color.g === 255 && color.b === 255) return source;
    let id = this.identities.get(source.image);
    if (id === undefined) { id = ++this.sequence; this.identities.set(source.image, id); }
    let emissionId = 0;
    if (source.emissiveSpans !== undefined && source.emissiveSpans.length > 0) {
      emissionId = this.identities.get(source.emissiveSpans) ?? ++this.sequence;
      this.identities.set(source.emissiveSpans, emissionId);
    }
    const key = `${id}:${emissionId}:${source.x}:${source.y}:${source.width}:${source.height}:${color.r}:${color.g}:${color.b}`;
    const existing = this.entries.get(key);
    if (existing !== undefined) { this.entries.delete(key); this.entries.set(key, existing); return existing; }
    const bytes = source.width * source.height * 4;
    if (bytes > this.budgetBytes) throw new Error('receiver_frame_budget_exceeded');
    let canvas: HTMLCanvasElement | undefined;
    while (this.bytesValue + bytes > this.budgetBytes || this.entries.size >= this.surfaceLimit) {
      const retired = this.retireOldest();
      if (canvas === undefined) canvas = retired;
      else { retired.width = retired.height = 0; this.spareSurfaces.push(retired); }
    }
    canvas ??= this.spareSurfaces.pop();
    if (canvas === undefined) { canvas = document.createElement('canvas'); this.allocationsValue++; }
    else this.reuses++;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width; canvas.height = source.height;
    }
    const context = canvas.getContext('2d');
    if (context === null || context.isContextLost?.()) {
      canvas.width = canvas.height = 0; this.spareSurfaces.push(canvas);
      throw new Error('receiver_frame_surface_unavailable');
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgb(${color.r},${color.g},${color.b})`; context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    // Restore only authored flame pixels after ambient/receiver multiplication.
    context.globalCompositeOperation = 'source-over';
    const emission = source.emissiveSpans ?? [];
    for (let i = 0; i < emission.length; i += 3) {
      const y = emission[i]!, x = emission[i + 1]!, width = emission[i + 2]!;
      context.drawImage(source.image, source.x + x, source.y + y, width, 1, x, y, width, 1);
    }
    const result = { image: canvas, x: 0, y: 0, width: canvas.width, height: canvas.height };
    this.entries.set(key, result); this.bytesValue += bytes; this.builds++;
    return result;
  }
  private retireOldest(): HTMLCanvasElement {
    const key = this.entries.keys().next().value;
    if (key === undefined) throw new Error('receiver_frame_budget_exceeded');
    const source = this.entries.get(key)!;
    this.entries.delete(key); this.bytesValue -= source.width * source.height * 4;
    return source.image as HTMLCanvasElement;
  }
  reset(): void {
    for (const source of this.entries.values()) {
      const canvas = source.image as HTMLCanvasElement; canvas.width = canvas.height = 0;
    }
    for (const canvas of this.spareSurfaces) canvas.width = canvas.height = 0;
    this.entries.clear(); this.spareSurfaces.length = 0; this.bytesValue = 0;
    this.identities = new WeakMap(); this.sequence = 0; this.builds = 0; this.reuses = 0; this.allocationsValue = 0;
  }
}

const receivers = new WeakMap<CanvasRenderingContext2D, { cache: ReceiverFrameCache; color: RgbColor }>();
export function withWorldReceiverLight(context: CanvasRenderingContext2D, cache: ReceiverFrameCache, color: RgbColor, draw: () => void): void {
  const previous = receivers.get(context);
  receivers.set(context, { cache, color });
  try { draw(); } finally {
    if (previous === undefined) receivers.delete(context); else receivers.set(context, previous);
  }
}
export function receiverFrameSource(context: CanvasRenderingContext2D, source: AssetFrameSource): AssetFrameSource {
  const receiver = receivers.get(context);
  return receiver === undefined ? source : receiver.cache.source(source, receiver.color);
}
