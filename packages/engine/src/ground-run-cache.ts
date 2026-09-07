import { renderOperationCounters, type AssetFrameSource } from '@orchard/ui';
import { LightingNumericKey } from './lighting-numeric-key.js';
import { GroundRunLightStamp, groundRunStampBytes, type GroundRunLightPlane } from './ground-run-light-stamp.js';

interface Surface { readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D }
interface Entry {
  readonly hash: number; readonly signature: readonly number[];
  readonly surface: Surface; readonly source: AssetFrameSource; readonly stamp: GroundRunLightStamp;
}

/** Preserve the original whole-canvas source path for translucent runs. Atlas
 * subrectangle draws can round differently at 1x. Each immutable chunk/art run
 * retains one bounded surface; eviction recycles it without a new canvas.
 * Results are immediate-draw sources, never retained by the painter or GPU. */
export class GroundRunCache {
  private readonly entries = new Map<number, Entry[]>();
  private readonly lru = new Set<Entry>();
  private readonly key = new LightingNumericKey();
  private identities = new WeakMap<object, number>();
  private sequence = 0;
  private bytesValue = 0;
  readonly diagnostics = { builds: 0, reuses: 0, allocations: 0, evictions: 0 };

  constructor(readonly budgetBytes = 8 * 1024 * 1024, readonly surfaceLimit = 512) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0 || !Number.isSafeInteger(surfaceLimit) || surfaceLimit < 1) {
      throw new Error('world_ground_cache_budget_invalid');
    }
  }
  get bytes(): number { return this.bytesValue; }
  get surfaces(): number { return this.lru.size; }

  source(source: AssetFrameSource, x: number, y: number, level: number, plane: GroundRunLightPlane, capRun: boolean): AssetFrameSource {
    if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
      || source.width <= 0 || source.height <= 0 || source.width > 512 || source.height > 2048
      || !Number.isFinite(plane.step) || plane.step <= 0) throw new Error('world_ground_cache_bounds_invalid');
    const key = this.key.reset().add(this.identity(source.image)).add(source.x).add(source.y)
      .add(source.width).add(source.height).add(x).add(y).add(level).add(plane.step);
    const hash = key.hash;
    let entry: Entry | undefined;
    const bucket = this.entries.get(hash);
    if (bucket !== undefined) for (const candidate of bucket) {
      if (key.matches(candidate.signature)) { entry = candidate; break; }
    }
    if (entry === undefined) {
      const signature = key.copy();
      const required = source.width * source.height * 4 + groundRunStampBytes(source.width, source.height, plane.step);
      const surface = this.reserve(source.width, source.height, required);
      const target = { image: surface.canvas, x: 0, y: 0, width: source.width, height: source.height };
      entry = { hash, signature, surface, source: target, stamp: new GroundRunLightStamp(source.width, source.height, plane.step) };
      const current = this.entries.get(hash);
      if (current === undefined) this.entries.set(hash, [entry]); else current.push(entry);
      this.bytesValue += required;
    }
    this.lru.delete(entry); this.lru.add(entry);
    if (entry.surface.context.isContextLost?.()) { this.reset(); throw new Error('world_ground_surface_unavailable'); }
    if (entry.stamp.update(plane, this.identity(plane.pixels), x, y)) {
      this.diagnostics.reuses++; renderOperationCounters.groundSourceReuses++;
      return entry.source;
    }
    try { this.draw(entry.surface.context, source, plane, x, y); }
    catch (error) { this.reset(); throw new Error('world_ground_surface_unavailable', { cause: error }); }
    this.diagnostics.builds++;
    renderOperationCounters.groundSourceOperations += 3;
    if (capRun) renderOperationCounters.capRunComposites++;
    else renderOperationCounters.flatSourceComposites++;
    return entry.source;
  }

  private identity(value: object): number {
    let id = this.identities.get(value);
    if (id === undefined) { id = ++this.sequence; this.identities.set(value, id); }
    return id;
  }

  private reserve(width: number, height: number, required: number): Surface {
    if (!Number.isSafeInteger(required) || required > this.budgetBytes) throw new Error('world_ground_cache_budget_exceeded');
    let reused: Surface | undefined;
    while (this.lru.size >= this.surfaceLimit || this.bytesValue + required > this.budgetBytes) {
      const oldest = this.lru.values().next().value!;
      this.lru.delete(oldest);
      const bucket = this.entries.get(oldest.hash)!;
      bucket.splice(bucket.indexOf(oldest), 1);
      if (bucket.length === 0) this.entries.delete(oldest.hash);
      this.bytesValue -= oldest.source.width * oldest.source.height * 4 + oldest.stamp.bytes;
      if (reused === undefined) reused = oldest.surface;
      else oldest.surface.canvas.width = oldest.surface.canvas.height = 0;
      this.diagnostics.evictions++;
    }
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = reused?.canvas ?? document.createElement('canvas');
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = reused?.context ?? canvas.getContext('2d');
      if (context === null || context.isContextLost?.()) throw new Error('Canvas unavailable');
      if (reused === undefined) this.diagnostics.allocations++;
      return { canvas, context };
    } catch (error) {
      if (canvas !== undefined) canvas.width = canvas.height = 0;
      throw new Error('world_ground_surface_unavailable', { cause: error });
    }
  }

  private draw(context: CanvasRenderingContext2D, source: AssetFrameSource, plane: GroundRunLightPlane, x: number, y: number): void {
    // Exact original operation sequence on an exclusively owned canvas.
    context.clearRect(0, 0, source.width, source.height);
    context.globalCompositeOperation = 'source-over'; context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'multiply'; context.imageSmoothingEnabled = true;
    context.drawImage(plane.canvas, plane.left - x, plane.top - y, plane.canvas.width * plane.step, plane.canvas.height * plane.step);
    context.globalCompositeOperation = 'destination-in'; context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'source-over';
  }

  reset(): void {
    for (const entry of this.lru) entry.surface.canvas.width = entry.surface.canvas.height = 0;
    this.lru.clear(); this.entries.clear(); this.bytesValue = 0;
    this.identities = new WeakMap(); this.sequence = 0;
  }
}
