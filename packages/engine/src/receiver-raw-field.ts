import type { CelestialLighting } from './celestial-lighting.js';
import type { RgbColor } from './lighting.js';
import { LightingNumericKey } from './lighting-numeric-key.js';
import type { ReceiverCoverageChannels } from './receiver-coverage.js';

export interface RawReceiverField {
  coverage: ReceiverCoverageChannels;
  readonly localPixels: Uint8ClampedArray<ArrayBuffer>;
  readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly step: number;
  revision: number;
  diffuse: RgbColor; sunLight: RgbColor; moonLight: RgbColor;
}
interface Entry { readonly signature: readonly number[]; readonly field: RawReceiverField; localRevision: string | number; sceneRevision: number }
/** GPU inputs retain coverage and local light separately. No Canvas, ImageData
 * or CPU maximum-light merge is needed. Bound all referenced arrays, including
 * coverage that may have been evicted from the scene's independent cache. */
export class RawReceiverFields {
  private readonly entries = new Map<number, Entry[]>();
  private readonly key = new LightingNumericKey();
  private count = 0;
  private revision = 0;
  bytes = 0;
  get(localRevision: string | number, sceneRevision: number, sky: CelestialLighting,
    left: number, top: number, width: number, height: number, receiverHeight: number, step: number,
    coverage: ReceiverCoverageChannels, local?: (x: number, y: number) => RgbColor): RawReceiverField {
    const key = this.key.reset().add(left).add(top).add(width).add(height).add(receiverHeight).add(step);
    let entry = this.entries.get(key.hash)?.find(value => key.matches(value.signature));
    if (entry === undefined) {
      const bytes = width * height * 7;
      if (bytes > 16 * 1024 * 1024) throw new Error('receiver_raw_field_budget_exceeded');
      while (this.bytes + bytes > 16 * 1024 * 1024 || this.count >= 8) {
        const oldest = this.entries.keys().next().value!;
        for (const value of this.entries.get(oldest)!) { this.bytes -= value.field.width * value.field.height * 7; this.count--; }
        this.entries.delete(oldest);
      }
      entry = { signature: key.copy(), localRevision: Number.NaN, sceneRevision: -1,
        field: { coverage, localPixels: new Uint8ClampedArray(width * height * 4), left, top, width, height, step,
          revision: 0, diffuse: sky.diffuse, sunLight: sky.sun.illumination, moonLight: sky.moon.illumination } };
      const bucket = this.entries.get(key.hash);
      if (bucket === undefined) this.entries.set(key.hash, [entry]); else bucket.push(entry);
      this.count++; this.bytes += bytes;
    }
    const field = entry.field;
    if (entry.localRevision !== localRevision) {
      const pixels = field.localPixels;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const color = local?.(left + (x + 0.5) * step, top + (y + 0.5) * step);
        const offset = (y * width + x) * 4;
        pixels[offset] = color?.r ?? 0; pixels[offset + 1] = color?.g ?? 0;
        pixels[offset + 2] = color?.b ?? 0; pixels[offset + 3] = 255;
      }
    }
    // GPU texture ownership can outlive an evicted raw entry while retaining
    // its coverage array. Never reuse an upload revision for different local RGB.
    if (entry.localRevision !== localRevision || entry.sceneRevision !== sceneRevision || field.coverage !== coverage) field.revision = ++this.revision;
    entry.localRevision = localRevision; entry.sceneRevision = sceneRevision;
    field.coverage = coverage; field.diffuse = sky.diffuse;
    field.sunLight = sky.sun.illumination; field.moonLight = sky.moon.illumination;
    return field;
  }
  reset(): void { this.entries.clear(); this.count = this.bytes = 0; }
}
