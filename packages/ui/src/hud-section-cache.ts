import type { LoadedAsset } from './assets.js';
import type { UiRect } from './geometry.js';
import { registerHudDisplayCache, unregisterHudDisplayCache } from './hud-display-caches.js';

/** Retained semantic dependencies; comparing a new UI model never serializes it. */
export class HudCacheKey {
  private readonly values: unknown[] = [];
  private cursor = 0;
  private changed = true;
  begin(): void { this.cursor = 0; }
  add(value: unknown): this {
    if (!Object.is(this.values[this.cursor], value)) {
      this.values[this.cursor] = value; this.changed = true;
    }
    this.cursor++; return this;
  }
  asset(asset: LoadedAsset | undefined): this {
    return this.add(asset).add(asset?.image).add(asset?.atlasRevision);
  }
  rect(rect: UiRect): this { return this.add(rect.x).add(rect.y).add(rect.width).add(rect.height); }
  consume(): boolean {
    if (this.values.length !== this.cursor) { this.values.length = this.cursor; this.changed = true; }
    const changed = this.changed; this.changed = false; return changed;
  }
  invalidate(): void { this.changed = true; }
  clear(): void { this.values.length = 0; this.invalidate(); }
}

/** A display-resolution HUD layer. Keeping the original dimensions/transform
 * preserves Canvas nearest-neighbour raster decisions; translating into a tight
 * crop changes edge sampling on fractional UI scales. Only the section bounds
 * are copied during composition. Never samples the world backing. */
export class HudSectionCache {
  readonly key = new HudCacheKey();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private display: WeakRef<HTMLCanvasElement> | null = null;
  private buildsValue = 0;
  private reusesValue = 0;
  private allocationsValue = 0;
  get builds(): number { return this.buildsValue; }
  get reuses(): number { return this.reusesValue; }
  get allocations(): number { return this.allocationsValue; }
  get bytes(): number { return (this.canvas?.width ?? 0) * (this.canvas?.height ?? 0) * 4; }

  draw(target: CanvasRenderingContext2D, bounds: UiRect, paint: (context: CanvasRenderingContext2D) => void): void {
    const previousDisplay = this.display?.deref();
    if (previousDisplay !== target.canvas) {
      if (previousDisplay !== undefined) unregisterHudDisplayCache(previousDisplay, this);
      registerHudDisplayCache(target.canvas, this);
      this.display = new WeakRef(target.canvas);
    }
    const matrix = target.getTransform();
    // The gameplay HUD is axis-aligned and fully opaque at the context level.
    // Unknown transforms/effects retain the direct reference path.
    if (matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0
      || target.globalAlpha !== 1 || target.globalCompositeOperation !== 'source-over'
      || target.filter !== 'none') { this.key.invalidate(); paint(target); return; }
    const left = Math.max(0, Math.floor(bounds.x * matrix.a + matrix.e));
    const top = Math.max(0, Math.floor(bounds.y * matrix.d + matrix.f));
    const right = Math.min(target.canvas.width, Math.ceil((bounds.x + bounds.width) * matrix.a + matrix.e));
    const bottom = Math.min(target.canvas.height, Math.ceil((bounds.y + bounds.height) * matrix.d + matrix.f));
    const width = right - left, height = bottom - top;
    if (width <= 0 || height <= 0) return;
    this.key.add(matrix.a).add(matrix.d).add(matrix.e).add(matrix.f)
      .add(target.canvas.width).add(target.canvas.height).add(left).add(top).add(width).add(height);
    const changed = this.key.consume();
    if (this.canvas === null) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context === null) { canvas.width = canvas.height = 0; this.key.invalidate(); paint(target); return; }
      this.canvas = canvas; this.context = context; this.allocationsValue++;
    }
    const canvas = this.canvas, context = this.context!;
    if (changed || canvas.width !== target.canvas.width || canvas.height !== target.canvas.height) {
      if (canvas.width !== target.canvas.width) canvas.width = target.canvas.width;
      if (canvas.height !== target.canvas.height) canvas.height = target.canvas.height;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(matrix.a, 0, 0, matrix.d, matrix.e, matrix.f);
      context.imageSmoothingEnabled = false;
      context.save();
      try { paint(context); } catch (error) { this.key.invalidate(); throw error; } finally { context.restore(); }
      this.buildsValue++;
    } else this.reusesValue++;
    target.save();
    try {
      target.setTransform(1, 0, 0, 1, 0, 0); target.imageSmoothingEnabled = false;
      target.drawImage(canvas, left, top, width, height, left, top, width, height);
    } finally { target.restore(); }
  }

  dispose(): void {
    const display = this.display?.deref();
    if (display !== undefined) unregisterHudDisplayCache(display, this);
    this.display = null;
    if (this.canvas !== null) this.canvas.width = this.canvas.height = 0;
    this.canvas = null; this.context = null; this.key.clear();
  }
}
