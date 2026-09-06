import { maximumLight, type CelestialLighting } from './celestial-lighting.js';
import { directionalGeometry, directionalMaskBytes, DirectionalShadowCache, sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';
import type { RgbColor } from './lighting.js';
import type { LightingReceiver, LightingReceiverClass, ReceiverLightContributions } from './lighting-types.js';

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const scale = (color: RgbColor, value: number): RgbColor => ({ r: Math.round(color.r * value), g: Math.round(color.g * value), b: Math.round(color.b * value) });
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const faceGate = (south: number, receiver: LightingReceiverClass) => receiver === 'south' ? clamp((south + 0.35) / 0.7) : 1;

/** Each shadow gates only its own light. Local light can fill a moon shadow;
 * warm and cool face contributions remain RGB through the final max resolve. */
export function resolveReceiverLight(sky: CelestialLighting, receiver: LightingReceiverClass, sunVisibility: number, moonVisibility: number, local: RgbColor = BLACK, contact = 0): ReceiverLightContributions {
  const contactTransmission = 1 - clamp(contact) * 0.18;
  const diffuse = scale(sky.diffuse, contactTransmission);
  const sun = scale(sky.sun.illumination, clamp(sunVisibility) * faceGate(sky.sun.direction[1], receiver) * contactTransmission);
  const moon = scale(sky.moon.illumination, clamp(moonVisibility) * faceGate(sky.moon.direction[1], receiver) * contactTransmission);
  return { diffuse, sun, moon, local, combined: maximumLight(diffuse, sun, moon, local) };
}

interface PreparedCaster {
  readonly caster: DirectionalCaster;
  readonly sun: DirectionalShadowMask | null;
  readonly moon: DirectionalShadowMask | null;
}
export interface ReceiverLightRaster {
  readonly left: number; readonly top: number;
  readonly width: number; readonly height: number; readonly step: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

/** A scene uses logical feet and explicit receiver height; painter code chooses
 * the visible receiver. It must never reuse ground RGB on elevated sprite art. */
export class CelestialReceiverScene {
  private casters: readonly DirectionalCaster[] = [];
  private skyValue: CelestialLighting | null = null;
  private geometryKey = '';
  private readonly prepared = new Map<number, readonly PreparedCaster[]>();
  private preparedBytes = 0;
  private generation = 0;
  private rasterSignature = '';
  private readonly rasters = new Map<string, ReceiverLightRaster>();
  private rasterBytes = 0;
  private readonly coverageFields = new Map<string, { sun: Uint8Array; moon: Uint8Array; contact: Uint8Array }>();
  private coverageBytes = 0;
  constructor(readonly pixelsPerHeightSubunit: number, readonly cache = new DirectionalShadowCache()) {}
  prepare(sky: CelestialLighting, casters: readonly DirectionalCaster[]): void {
    const key = `${directionalGeometry(sky.sun)?.key ?? '-'}:${directionalGeometry(sky.moon)?.key ?? '-'}`;
    if (casters !== this.casters || key !== this.geometryKey) {
      this.prepared.clear(); this.preparedBytes = 0; this.coverageFields.clear(); this.coverageBytes = 0; this.generation++;
    }
    const signature = `${key}:${sky.diffuse.r}:${sky.diffuse.g}:${sky.diffuse.b}:${sky.sun.illumination.r}:${sky.sun.illumination.g}:${sky.sun.illumination.b}:${sky.moon.illumination.r}:${sky.moon.illumination.g}:${sky.moon.illumination.b}`;
    if (casters !== this.casters || signature !== this.rasterSignature) { this.rasters.clear(); this.rasterBytes = 0; this.rasterSignature = signature; }
    this.casters = casters; this.geometryKey = key; this.skyValue = sky;
  }
  /** Prepare pending sky geometry outside painting. The caller keeps its prior
   * complete presentation until this generation is ready to commit. */
  async prepareHeights(heights: readonly number[], yieldBatch: () => Promise<void> = () => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  })): Promise<boolean> {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const generation = this.generation, sky = this.skyValue;
    let start = performance.now(), count = 0;
    for (const height of new Set(heights)) {
      for (const caster of this.casters) {
        if (generation !== this.generation) return false;
        this.cache.get(caster, sky.sun, height, this.pixelsPerHeightSubunit);
        this.cache.get(caster, sky.moon, height, this.pixelsPerHeightSubunit);
        if (++count >= 8 || performance.now() - start >= 4) { await yieldBatch(); count = 0; start = performance.now(); }
      }
      if (generation !== this.generation) return false;
      this.atHeight(height);
    }
    return generation === this.generation;
  }
  rasterizeCached(localRevision: string | number, left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    const key = `${localRevision}:${left}:${top}:${width}:${height}:${receiverHeight}:${step}`;
    const existing = this.rasters.get(key);
    if (existing !== undefined) { this.rasters.delete(key); this.rasters.set(key, existing); return existing; }
    const raster = this.rasterize(left, top, width, height, receiverHeight, step, local);
    const bytes = raster.pixels.byteLength;
    if (bytes > 16 * 1024 * 1024) throw new Error('receiver_raster_budget_exceeded');
    while (this.rasterBytes + bytes > 16 * 1024 * 1024 || this.rasters.size >= 64) {
      const oldest = this.rasters.keys().next().value;
      if (oldest === undefined) break;
      this.rasterBytes -= this.rasters.get(oldest)!.pixels.byteLength; this.rasters.delete(oldest);
    }
    this.rasters.set(key, raster); this.rasterBytes += bytes; return raster;
  }
  private atHeight(height: number): readonly PreparedCaster[] {
    const existing = this.prepared.get(height);
    if (existing !== undefined) return existing;
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const list = this.casters.map((caster) => ({ caster,
      sun: this.cache.get(caster, this.skyValue!.sun, height, this.pixelsPerHeightSubunit),
      moon: this.cache.get(caster, this.skyValue!.moon, height, this.pixelsPerHeightSubunit) }));
    const unique = new Set(list.flatMap(({ sun, moon }) => [sun, moon]));
    let bytes = 0;
    for (const mask of unique) bytes += directionalMaskBytes(mask);
    if (bytes > this.cache.budgetBytes) throw new Error('directional_receiver_plane_budget_exceeded');
    // Active receiver planes have their own bounded references. Cache eviction
    // alone cannot release a mask that an active plane still references.
    if (this.preparedBytes + bytes > this.cache.budgetBytes || this.prepared.size >= 64) {
      this.prepared.clear(); this.preparedBytes = 0;
    }
    this.preparedBytes += bytes;
    this.prepared.set(height, list);
    return list;
  }
  sample(receiver: LightingReceiver, local: RgbColor = BLACK): ReceiverLightContributions {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    let sun = 0, moon = 0, contact = 0;
    for (const item of this.atHeight(receiver.heightSubunits)) {
      if (item.caster.owner === receiver.owner) continue;
      sun = Math.max(sun, sampleDirectionalMask(item.sun, item.caster, receiver.worldX, receiver.worldY));
      moon = Math.max(moon, sampleDirectionalMask(item.moon, item.caster, receiver.worldX, receiver.worldY));
      if (receiver.receiver === 'flat') contact = Math.max(contact, contactCoverage(item.caster, receiver.worldX, receiver.worldY, receiver.heightSubunits));
    }
    return resolveReceiverLight(this.skyValue, receiver.receiver, 1 - sun, 1 - moon, local, contact);
  }
  /** Rasterize max coverage once per plane, then merge RGB per texel. Cost is
   * proportional to covered mask area, not viewport pixels times caster count. */
  rasterize(left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || step <= 0 || width * height > 4_194_304) throw new Error('invalid_receiver_raster_bounds');
    const coverageKey = `${left}:${top}:${width}:${height}:${receiverHeight}:${step}`;
    let coverage = this.coverageFields.get(coverageKey);
    if (coverage === undefined) {
      const bytes = width * height * 3;
      if (bytes > 8 * 1024 * 1024) throw new Error('directional_coverage_budget_exceeded');
      while (this.coverageBytes + bytes > 8 * 1024 * 1024 || this.coverageFields.size >= 64) {
        const oldest = this.coverageFields.keys().next().value;
        if (oldest === undefined) break;
        this.coverageBytes -= this.coverageFields.get(oldest)!.sun.byteLength * 3; this.coverageFields.delete(oldest);
      }
      coverage = { sun: new Uint8Array(width * height), moon: new Uint8Array(width * height), contact: new Uint8Array(width * height) };
      const { sun, moon, contact } = coverage;
      const blit = (target: Uint8Array, caster: DirectionalCaster, mask: DirectionalShadowMask | null) => {
        if (mask === null) return;
        const minX = Math.max(0, Math.floor((caster.worldX + mask.left - left) / step));
        const minY = Math.max(0, Math.floor((caster.worldY + mask.top - top) / step));
        const maxX = Math.min(width, Math.ceil((caster.worldX + mask.left + mask.width - left) / step));
        const maxY = Math.min(height, Math.ceil((caster.worldY + mask.top + mask.height - top) / step));
        for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
          const index = y * width + x;
          target[index] = Math.max(target[index]!, Math.round(sampleDirectionalMask(mask, caster, left + (x + 0.5) * step, top + (y + 0.5) * step, step) * 255));
        }
      };
      for (const item of this.atHeight(receiverHeight)) {
        blit(sun, item.caster, item.sun); blit(moon, item.caster, item.moon);
        const caster = item.caster;
        if (!caster.contact || receiverHeight !== caster.baseHeightSubunits) continue;
        const f = caster.footprint;
        const minX = Math.max(0, Math.floor((caster.worldX + f.left - 1 - left) / step));
        const maxX = Math.min(width, Math.ceil((caster.worldX + f.right + 1 - left) / step));
        const minY = Math.max(0, Math.floor((caster.worldY + f.top - 1 - top) / step));
        const maxY = Math.min(height, Math.ceil((caster.worldY + f.bottom + 1 - top) / step));
        for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
          const index = y * width + x;
          contact[index] = Math.max(contact[index]!, Math.round(contactCoverage(caster, left + (x + 0.5) * step, top + (y + 0.5) * step, receiverHeight) * 255));
        }
      }
      this.coverageFields.set(coverageKey, coverage); this.coverageBytes += bytes;
    }
    const { sun, moon, contact } = coverage;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const sky = this.skyValue;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const transmission = 1 - contact[index]! / 255 * 0.18;
      const sunWeight = (1 - sun[index]! / 255) * transmission;
      const moonWeight = (1 - moon[index]! / 255) * transmission;
      const point = local?.(left + (x + 0.5) * step, top + (y + 0.5) * step) ?? BLACK;
      pixels[index * 4] = Math.max(Math.round(sky.diffuse.r * transmission), Math.round(sky.sun.illumination.r * sunWeight), Math.round(sky.moon.illumination.r * moonWeight), point.r);
      pixels[index * 4 + 1] = Math.max(Math.round(sky.diffuse.g * transmission), Math.round(sky.sun.illumination.g * sunWeight), Math.round(sky.moon.illumination.g * moonWeight), point.g);
      pixels[index * 4 + 2] = Math.max(Math.round(sky.diffuse.b * transmission), Math.round(sky.sun.illumination.b * sunWeight), Math.round(sky.moon.illumination.b * moonWeight), point.b);
      pixels[index * 4 + 3] = 255;
    }
    return { left, top, width, height, step, pixels };
  }
  /** Conservative bound including cache and active-plane references. */
  get retainedMaskBytes(): number { return this.cache.bytes + this.preparedBytes; }
  get retainedRasterBytes(): number { return this.rasterBytes; }
  get retainedCoverageBytes(): number { return this.coverageBytes; }
  reset(): void { this.generation++; this.prepared.clear(); this.preparedBytes = 0; this.rasters.clear(); this.rasterBytes = 0; this.coverageFields.clear(); this.coverageBytes = 0; this.rasterSignature = ''; this.casters = []; this.skyValue = null; this.geometryKey = ''; this.cache.reset(); }
}

function contactCoverage(caster: DirectionalCaster, x: number, y: number, height: number): number {
  if (!caster.contact || height !== caster.baseHeightSubunits) return 0;
  const f = caster.footprint;
  const centerX = caster.worldX + (f.left + f.right) / 2, centerY = caster.worldY + (f.top + f.bottom) / 2;
  const distance = Math.hypot((x - centerX) / Math.max(1, (f.right - f.left) / 2 + 1), (y - centerY) / Math.max(1, (f.bottom - f.top) / 2 + 1));
  return clamp((1 - distance) / 0.4);
}
