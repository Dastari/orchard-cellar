import { renderOperationCounters, type AssetFrameSource } from '@orchard/ui';
import type { RgbColor } from './lighting.js';
import { LightingNumericKey } from './lighting-numeric-key.js';

export const RECEIVER_TINT_PAGE_WIDTH = 512;
export const RECEIVER_TINT_PAGE_HEIGHT = 2048;
export const RECEIVER_TINT_PAGE_BYTES = RECEIVER_TINT_PAGE_WIDTH * RECEIVER_TINT_PAGE_HEIGHT * 4;
interface TintEntry {
  readonly hash: number; readonly signature: readonly number[];
  readonly source: AssetFrameSource; readonly page: TintPage;
}
interface TintPage {
  readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D;
  readonly entries: TintEntry[];
  x: number; y: number; rowHeight: number; generation: number; used: number;
}
interface Slot { readonly page: TintPage; readonly x: number; readonly y: number }

/** Exact-RGB frames share bounded tint pages. A generation rollover invalidates
 * the whole page; callers must draw returned scratch rectangles immediately. */
export class ReceiverFrameCache {
  private readonly entries = new Map<number, TintEntry[]>();
  private readonly pages: TintPage[] = [];
  private readonly key = new LightingNumericKey();
  private identities = new WeakMap<object, number>();
  private sequence = 0;
  private clock = 0;
  private allocationsValue = 0;
  builds = 0;
  reuses = 0;
  /** surfaceLimit now caps pages; budgets below one full page permit only white passthrough. */
  constructor(readonly budgetBytes = 4 * 1024 * 1024, readonly surfaceLimit = 256) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0
      || !Number.isSafeInteger(surfaceLimit) || surfaceLimit < 1) throw new Error('Invalid receiver cache budget');
  }
  get bytes(): number { return this.pages.length * RECEIVER_TINT_PAGE_BYTES; }
  get surfaces(): number { return this.pages.length; }
  get allocations(): number { return this.allocationsValue; }
  /** Results are immediate-draw scratch sources. Consumers must not retain or
   * derive another identity-keyed cache from their mutable Canvas image. */
  source(source: AssetFrameSource, color: RgbColor): AssetFrameSource {
    if (color.r === 255 && color.g === 255 && color.b === 255) return source;
    if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
      || source.width <= 0 || source.height <= 0 || source.width > RECEIVER_TINT_PAGE_WIDTH
      || source.height > RECEIVER_TINT_PAGE_HEIGHT || this.budgetBytes < RECEIVER_TINT_PAGE_BYTES) throw new Error('receiver_frame_budget_exceeded');
    const key = this.key.reset().add(this.identity(source.image)).add(source.emissiveSpans?.length ? this.identity(source.emissiveSpans) : 0)
      .add(source.x).add(source.y).add(source.width).add(source.height).add(color.r).add(color.g).add(color.b);
    const bucket = this.entries.get(key.hash);
    if (bucket !== undefined) for (const entry of bucket) if (key.matches(entry.signature)) {
      this.requireContext(entry.page); entry.page.used = ++this.clock;
      renderOperationCounters.tintReuses++; return entry.source;
    }
    const slot = this.reserve(source.width, source.height);
    const { page, x, y } = slot;
    try { this.draw(page.context, source, color, x, y); }
    catch (error) { this.release(page); throw new Error('receiver_frame_surface_unavailable', { cause: error }); }
    const result = { image: page.canvas, x, y, width: source.width, height: source.height };
    const entry = { hash: key.hash, signature: key.copy(), source: result, page };
    const current = this.entries.get(entry.hash);
    if (current === undefined) this.entries.set(entry.hash, [entry]); else current.push(entry);
    page.entries.push(entry); page.used = ++this.clock;
    this.builds++; renderOperationCounters.tintBuilds++;
    return result;
  }
  private identity(value: object): number {
    let id = this.identities.get(value);
    if (id === undefined) { id = ++this.sequence; this.identities.set(value, id); }
    return id;
  }
  private reserve(width: number, height: number): Slot {
    for (const page of this.pages) {
      const slot = this.fit(page, width, height);
      if (slot !== null) { this.requireContext(page); return slot; }
    }
    if (this.pages.length < Math.min(this.surfaceLimit, Math.floor(this.budgetBytes / RECEIVER_TINT_PAGE_BYTES))) {
      let canvas: HTMLCanvasElement | undefined;
      try {
        canvas = document.createElement('canvas'); this.allocationsValue++;
        canvas.width = RECEIVER_TINT_PAGE_WIDTH; canvas.height = RECEIVER_TINT_PAGE_HEIGHT;
        const context = canvas.getContext('2d');
        if (context === null || context.isContextLost?.()) throw new Error('Canvas unavailable');
        const page = { canvas, context, entries: [], x: 0, y: 0, rowHeight: 0, generation: 0, used: 0 };
        this.pages.push(page); return this.fit(page, width, height)!;
      } catch (error) {
        if (canvas !== undefined) canvas.width = canvas.height = 0;
        throw new Error('receiver_frame_surface_unavailable', { cause: error });
      }
    }
    let page = this.pages[0];
    if (page === undefined) throw new Error('receiver_frame_budget_exceeded');
    for (const candidate of this.pages) if (candidate.used < page.used) page = candidate;
    this.requireContext(page); this.evict(page);
    try {
      page.context.setTransform(1, 0, 0, 1, 0, 0);
      page.context.clearRect(0, 0, RECEIVER_TINT_PAGE_WIDTH, RECEIVER_TINT_PAGE_HEIGHT);
    } catch (error) { this.release(page); throw new Error('receiver_frame_surface_unavailable', { cause: error }); }
    page.x = page.y = page.rowHeight = 0; page.generation++;
    this.reuses++; renderOperationCounters.tintSurfaceReuses++;
    return this.fit(page, width, height)!;
  }
  private fit(page: TintPage, width: number, height: number): Slot | null {
    let x = page.x, y = page.y, rowHeight = page.rowHeight;
    if (x + width > RECEIVER_TINT_PAGE_WIDTH) { x = 0; y += rowHeight; rowHeight = 0; }
    if (y + height > RECEIVER_TINT_PAGE_HEIGHT) return null;
    page.x = x + width; page.y = y; page.rowHeight = Math.max(rowHeight, height);
    return { page, x, y };
  }
  private requireContext(page: TintPage): void {
    if (page.context.isContextLost?.()) { this.release(page); throw new Error('receiver_frame_surface_unavailable'); }
  }
  private draw(context: CanvasRenderingContext2D, source: AssetFrameSource, color: RgbColor, x: number, y: number): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.imageSmoothingEnabled = false;
    context.save();
    try {
      // destination-in otherwise clears neighboring packed entries outside its source rectangle.
      context.beginPath(); context.rect(x, y, source.width, source.height); context.clip();
      context.clearRect(x, y, source.width, source.height);
      context.drawImage(source.image, source.x, source.y, source.width, source.height, x, y, source.width, source.height);
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = `rgb(${color.r},${color.g},${color.b})`; context.fillRect(x, y, source.width, source.height);
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(source.image, source.x, source.y, source.width, source.height, x, y, source.width, source.height);
      context.globalCompositeOperation = 'source-over';
      const emission = source.emissiveSpans;
      for (let i = 0; i < (emission?.length ?? 0); i += 3) {
        const row = emission![i]!, left = emission![i + 1]!, width = emission![i + 2]!;
        context.drawImage(source.image, source.x + left, source.y + row, width, 1, x + left, y + row, width, 1);
      }
    } finally { context.restore(); }
  }
  private evict(page: TintPage): void {
    for (const entry of page.entries) {
      const bucket = this.entries.get(entry.hash)!;
      bucket.splice(bucket.indexOf(entry), 1);
      if (bucket.length === 0) this.entries.delete(entry.hash);
    }
    page.entries.length = 0;
  }
  private release(page: TintPage): void {
    this.evict(page); page.canvas.width = page.canvas.height = 0;
    const index = this.pages.indexOf(page);
    if (index >= 0) this.pages.splice(index, 1);
  }
  reset(): void {
    for (const page of this.pages) { page.canvas.width = page.canvas.height = 0; page.entries.length = 0; }
    this.pages.length = 0; this.entries.clear(); this.identities = new WeakMap(); this.sequence = 0; this.clock = 0;
    this.builds = 0; this.reuses = 0; this.allocationsValue = 0;
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
