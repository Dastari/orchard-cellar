import type { CelestialLighting } from './celestial-lighting.js';
import type { RgbColor } from './lighting.js';
import type { ReceiverCoverageChannels } from './receiver-coverage.js';
import type { ReceiverLightRaster } from './receiver-lighting.js';
import type { ReceiverDamageSource, ReceiverLocalDamage } from './local-light-damage.js';

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
/** Previous coverage lets moving shadows update independently of local-light
 * damage. A local revision belongs to this plane and advances on intersection
 * only; the observed source revision also tracks harmless outside changes. */
export class ReceiverRasterMerge {
  private readonly previousCoverage: Uint32Array;
  private baseRevision = -1;
  private seenRevision: string | number = Number.NaN;
  private source: ReceiverDamageSource | undefined;
  localRevision = 0;
  constructor(size: number) { this.previousCoverage = new Uint32Array(size); }
  get bytes(): number { return this.previousCoverage.byteLength; }
  matches(revision: string | number, damage?: ReceiverLocalDamage): boolean {
    return this.seenRevision === revision && this.source === damage?.source;
  }
  merge(raster: ReceiverLightRaster, coverage: ReceiverCoverageChannels, sky: CelestialLighting,
    baseRevision: number, sourceRevision: string | number, local?: (x: number, y: number) => RgbColor,
    damage?: ReceiverLocalDamage): number {
    const { left, top, width, height, step, pixels } = raster;
    const sourceChanged = this.source !== damage?.source || !Number.isFinite(this.baseRevision) || this.baseRevision < 0;
    const localChanged = sourceChanged || this.seenRevision !== sourceRevision;
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    if (localChanged) {
      const bounds = sourceChanged || damage === undefined ? null
        : damage.source.receiverChangesSince(typeof this.seenRevision === 'number' ? this.seenRevision : Number.NaN);
      if (bounds === null) { x1 = width; y1 = height; }
      else {
        // Sample centres in logical world coordinates; expand the changed
        // source support by one plane texel for bilinear interpolation.
        const projection = damage?.projection ?? 0;
        x0 = Math.max(0, Math.ceil((bounds.left - step - left) / step - .5));
        x1 = Math.min(width, Math.floor((bounds.right + step - left) / step - .5) + 1);
        y0 = Math.max(0, Math.ceil((bounds.top + projection - step - top) / step - .5));
        y1 = Math.min(height, Math.floor((bounds.bottom + projection + step - top) / step - .5) + 1);
      }
      if (x0 < x1 && y0 < y1) this.localRevision++;
    }
    const full = this.baseRevision !== baseRevision;
    const { sun, moon, contact } = coverage;
    let merged = 0;
    for (let y = 0; y < height; y++) {
      const localRow = y >= y0 && y < y1;
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const packed = sun[index]! | moon[index]! << 8 | contact[index]! << 16;
        if (!full && packed === this.previousCoverage[index] && !(localRow && x >= x0 && x < x1)) continue;
        this.previousCoverage[index] = packed;
        const transmission = 1 - contact[index]! / 255 * .18;
        const sunWeight = (1 - sun[index]! / 255) * transmission;
        const moonWeight = (1 - moon[index]! / 255) * transmission;
        const point = local?.(left + (x + .5) * step, top + (y + .5) * step) ?? BLACK;
        pixels[index * 4] = Math.max(Math.round(sky.diffuse.r * transmission), Math.round(sky.sun.illumination.r * sunWeight), Math.round(sky.moon.illumination.r * moonWeight), point.r);
        pixels[index * 4 + 1] = Math.max(Math.round(sky.diffuse.g * transmission), Math.round(sky.sun.illumination.g * sunWeight), Math.round(sky.moon.illumination.g * moonWeight), point.g);
        pixels[index * 4 + 2] = Math.max(Math.round(sky.diffuse.b * transmission), Math.round(sky.sun.illumination.b * sunWeight), Math.round(sky.moon.illumination.b * moonWeight), point.b);
        pixels[index * 4 + 3] = 255;
        merged++;
      }
    }
    this.baseRevision = baseRevision; this.source = damage?.source; this.seenRevision = sourceRevision;
    if (merged > 0) raster.revision++;
    return merged;
  }
}
