import { sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';
import { LightingNumericKey } from './lighting-numeric-key.js';
import type { ReceiverCoverageBounds } from './receiver-coverage.js';

interface Samples {
  readonly signature: readonly number[];
  readonly pixels: Uint8Array;
  readonly left: number; readonly top: number;
  readonly width: number; readonly height: number;
}

/** Cache the exact area samples shared by static cliff masks. Entries retain
 * only sampled bytes and numeric identities, never the much larger source mask.
 * Half-pixel caster positions and integral world grids translate exactly; all
 * other grids use the original sampler. */
export class StaticMaskSamples {
  private identities = new WeakMap<DirectionalShadowMask, number>();
  private sequence = 0;
  private readonly entries = new Map<number, Samples[]>();
  private readonly key = new LightingNumericKey();
  private bytesValue = 0;
  private count = 0;
  builds = 0;
  reuses = 0;
  constructor(readonly budgetBytes: number) {}
  get bytes(): number { return this.bytesValue; }

  blit(target: Uint8Array, caster: DirectionalCaster, mask: DirectionalShadowMask, bounds: ReceiverCoverageBounds): boolean {
    const { left, top, width, height, step } = bounds;
    if (!Number.isInteger(step) || step < 1 || step > 64 || left % step !== 0 || top % step !== 0
      || !Number.isInteger(mask.left) || !Number.isInteger(mask.top)
      || !Number.isInteger(caster.worldX * 2) || !Number.isInteger(caster.worldY * 2)
      || Math.abs(caster.worldX) > 67_108_864 || Math.abs(caster.worldY) > 67_108_864) return false;
    const phaseX = (caster.worldX % step + step) % step, phaseY = (caster.worldY % step + step) % step;
    let identity = this.identities.get(mask);
    if (identity === undefined) { identity = ++this.sequence; this.identities.set(mask, identity); }
    const key = this.key.reset().add(identity).add(step).add(phaseX).add(phaseY);
    let entry = this.entries.get(key.hash)?.find(value => key.matches(value.signature));
    if (entry === undefined) {
      const x = Math.floor((phaseX + mask.left) / step) * step;
      const y = Math.floor((phaseY + mask.top) / step) * step;
      const w = Math.ceil((phaseX + mask.left + mask.width - x) / step);
      const h = Math.ceil((phaseY + mask.top + mask.height - y) / step);
      const bytes = w * h;
      if (bytes > this.budgetBytes) return false;
      while (this.bytesValue + bytes > this.budgetBytes || this.count >= 4096) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        for (const old of this.entries.get(oldest)!) { this.bytesValue -= old.pixels.byteLength; this.count--; }
        this.entries.delete(oldest);
      }
      const pixels = new Uint8Array(bytes), translated = { ...caster, worldX: phaseX, worldY: phaseY };
      for (let row = 0; row < h; row++) for (let column = 0; column < w; column++) {
        pixels[row * w + column] = Math.round(sampleDirectionalMask(mask, translated,
          x + (column + .5) * step, y + (row + .5) * step, step) * 255);
      }
      entry = { signature: key.copy(), pixels, left: x - phaseX, top: y - phaseY, width: w, height: h };
      const bucket = this.entries.get(key.hash);
      if (bucket === undefined) this.entries.set(key.hash, [entry]); else bucket.push(entry);
      this.bytesValue += bytes; this.count++; this.builds++;
    } else this.reuses++;
    const offsetX = (left - caster.worldX - entry.left) / step;
    const offsetY = (top - caster.worldY - entry.top) / step;
    const x0 = Math.max(0, -offsetX), y0 = Math.max(0, -offsetY);
    const x1 = Math.min(width, entry.width - offsetX), y1 = Math.min(height, entry.height - offsetY);
    for (let y = y0; y < y1; y++) {
      let source = (y + offsetY) * entry.width + x0 + offsetX, output = y * width + x0;
      for (let x = x0; x < x1; x++, source++, output++) target[output] = Math.max(target[output]!, entry.pixels[source]!);
    }
    return true;
  }
  reset(): void {
    this.entries.clear(); this.identities = new WeakMap(); this.sequence = this.bytesValue = this.count = 0;
    this.builds = this.reuses = 0;
  }
}
