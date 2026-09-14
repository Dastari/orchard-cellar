import { renderOperationCounters } from '@orchard/ui';
import { maximumLight, type CelestialLighting } from './celestial-lighting.js';
import { directionalGeometryKey, directionalMaskBytes, DirectionalShadowCache, sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';
import type { RgbColor } from './lighting.js';
import type { LightingReceiver, LightingReceiverClass, ReceiverLightContributions } from './lighting-types.js';
import { LightingIdentities, LightingNumericKey } from './lighting-numeric-key.js';
import { blitReceiverCoverage, contactCoverage, copyReceiverCoverage, createReceiverCoverage, type PreparedCaster, type ReceiverCoverageBounds, type ReceiverCoverageChannels } from './receiver-coverage.js';

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

export interface ReceiverLightRaster {
  readonly left: number; readonly top: number;
  readonly width: number; readonly height: number; readonly step: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  /** Changes only when RGB bytes are merged; uploaders retain ImageData. */
  revision: number;
}

interface CoveragePlane extends ReceiverCoverageBounds {
  readonly signature: readonly number[];
  readonly fixed: ReceiverCoverageChannels;
  readonly working: ReceiverCoverageChannels;
  movingRevision: number;
}
interface PreparedPlane {
  readonly fixed: PreparedCaster[]; readonly moving: PreparedCaster[];
  movingRevision: number;
}
interface CachedRaster {
  readonly signature: readonly number[]; readonly raster: ReceiverLightRaster;
  revision: number;
  localRevision: string | number;
}
const EMPTY_CASTERS: readonly DirectionalCaster[] = [];

/** Retain static receiver planes independently of interpolated actor placement.
 * Working coverage and RGB buffers remain allocated across moving updates. */
export class CelestialReceiverScene {
  private staticCasters: readonly DirectionalCaster[] = EMPTY_CASTERS;
  private movingCasters: readonly DirectionalCaster[] = EMPTY_CASTERS;
  private staticIdentity: number | undefined;
  private skyValue: CelestialLighting | null = null;
  private geometryKey = -1;
  private readonly prepared = new Map<number, PreparedPlane>();
  private preparedBytes = 0;
  private generation = 0;
  private revision = 0;
  private movingRevision = 0;
  private skySignature: readonly number[] = [];
  private movingSignature: number[] = [];
  private readonly activeMasks = new Set<DirectionalShadowMask | null>();
  private readonly key = new LightingNumericKey();
  private readonly identities = new LightingIdentities();
  private readonly rasters = new Map<number, CachedRaster[]>();
  private rasterBytes = 0;
  private rasterCount = 0;
  private readonly coverageFields = new Map<number, CoveragePlane[]>();
  private coverageBytes = 0;
  private coverageCount = 0;
  readonly diagnostics = { staticCoverageBuilds: 0, movingCoverageBlits: 0, movingCastersBlitted: 0, rgbMerges: 0, numericKeyLookups: 0 };
  constructor(readonly pixelsPerHeightSubunit: number, readonly cache = new DirectionalShadowCache(),
    private readonly observeKey?: (key: number) => void) {}
  private lookupKey(key: number): number { this.observeKey?.(key); this.diagnostics.numericKeyLookups++; return key; }
  prepare(sky: CelestialLighting, casters: readonly DirectionalCaster[]): void {
    this.prepareSplit(sky, casters, EMPTY_CASTERS);
  }
  prepareSplit(sky: CelestialLighting, fixed: readonly DirectionalCaster[], moving: readonly DirectionalCaster[], staticIdentity?: number): void {
    const geometry = (directionalGeometryKey(sky.sun) ?? 0) * 131072 + (directionalGeometryKey(sky.moon) ?? 0);
    this.lookupKey(geometry);
    const staticChanged = staticIdentity === undefined ? fixed !== this.staticCasters : staticIdentity !== this.staticIdentity;
    if (staticChanged || geometry !== this.geometryKey) {
      this.prepared.clear(); this.preparedBytes = 0; this.activeMasks.clear(); this.coverageFields.clear(); this.coverageBytes = 0; this.coverageCount = 0;
      this.generation++; this.revision++;
    }
    const key = this.key.reset().add(sky.diffuse.r).add(sky.diffuse.g).add(sky.diffuse.b)
      .add(sky.sun.illumination.r).add(sky.sun.illumination.g).add(sky.sun.illumination.b)
      .add(sky.moon.illumination.r).add(sky.moon.illumination.g).add(sky.moon.illumination.b);
    if (!key.matches(this.skySignature)) { this.skySignature = key.copy(); this.revision++; }
    key.reset().add(moving.length);
    for (const caster of moving) {
      const f = caster.footprint, body = caster.silhouette;
      key.add(typeof caster.owner === 'number' ? 1 : 0).add(this.identities.get(caster.owner)).add(caster.worldX).add(caster.worldY).add(caster.baseHeightSubunits).add(caster.heightSubunits)
        .add(f.left).add(f.top).add(f.right).add(f.bottom).add(caster.contact ? 1 : 0)
        .add(this.identities.get(body?.opaque)).add(body?.width ?? 0).add(body?.height ?? 0).add(body?.anchorX ?? 0).add(body?.anchorY ?? 0);
    }
    if (!key.matches(this.movingSignature)) {
      key.copyInto(this.movingSignature); this.movingRevision++; this.generation++; this.revision++;
    }
    this.staticCasters = fixed; this.staticIdentity = staticIdentity; this.movingCasters = moving; this.geometryKey = geometry; this.skyValue = sky;
  }
  /** Prepare pending geometry without committing a stale moving/static generation. */
  async prepareHeights(heights: readonly number[], yieldBatch: () => Promise<void> = () => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  })): Promise<boolean> {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const generation = this.generation, sky = this.skyValue;
    let start = performance.now(), count = 0;
    for (const height of new Set(heights)) {
      for (const cohort of [this.staticCasters, this.movingCasters]) for (const caster of cohort) {
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
  private prepareCohort(target: PreparedCaster[], casters: readonly DirectionalCaster[], height: number): boolean {
    let masksChanged = target.length !== casters.length;
    for (let i = 0; i < casters.length; i++) {
      const caster = casters[i]!;
      const sun = this.cache.get(caster, this.skyValue!.sun, height, this.pixelsPerHeightSubunit);
      const moon = this.cache.get(caster, this.skyValue!.moon, height, this.pixelsPerHeightSubunit);
      const item = target[i];
      if (item === undefined) { target.push({ caster, sun, moon }); masksChanged = true; }
      else { masksChanged ||= item.sun !== sun || item.moon !== moon; item.caster = caster; item.sun = sun; item.moon = moon; }
    }
    target.length = casters.length; return masksChanged;
  }
  private atHeight(height: number): PreparedPlane {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    let plane = this.prepared.get(height);
    let masksChanged = false;
    if (plane === undefined) {
      plane = { fixed: [], moving: [], movingRevision: -1 };
      this.prepareCohort(plane.fixed, this.staticCasters, height); masksChanged = true;
      if (this.prepared.size >= 64) { this.prepared.clear(); this.preparedBytes = 0; this.activeMasks.clear(); }
      this.prepared.set(height, plane); renderOperationCounters.preparedHeightRebuilds++;
    }
    if (plane.movingRevision !== this.movingRevision) {
      masksChanged = this.prepareCohort(plane.moving, this.movingCasters, height) || masksChanged; plane.movingRevision = this.movingRevision;
    }
    if (masksChanged) {
      // Count each mask once across active planes. The cache and plane budgets
      // remain independent, because active references survive cache eviction.
      const unique = this.activeMasks; unique.clear();
      for (const current of this.prepared.values()) for (let cohortIndex = 0; cohortIndex < 2; cohortIndex++) {
        for (const item of cohortIndex === 0 ? current.fixed : current.moving) { unique.add(item.sun); unique.add(item.moon); }
      }
      let bytes = 0;
      for (const mask of unique) bytes += directionalMaskBytes(mask);
      if (bytes > this.cache.budgetBytes) { this.prepared.clear(); this.preparedBytes = 0; this.activeMasks.clear(); throw new Error('directional_receiver_plane_budget_exceeded'); }
      this.preparedBytes = bytes;
    }
    return plane;
  }
  sample(receiver: LightingReceiver, local: RgbColor = BLACK): ReceiverLightContributions {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    let sun = 0, moon = 0, contact = 0;
    const plane = this.atHeight(receiver.heightSubunits);
    // Exact owner exclusion and sample-before-max ordering remain authoritative.
    for (let cohortIndex = 0; cohortIndex < 2; cohortIndex++) for (const item of cohortIndex === 0 ? plane.fixed : plane.moving) {
      if (item.caster.owner === receiver.owner) continue;
      sun = Math.max(sun, sampleDirectionalMask(item.sun, item.caster, receiver.worldX, receiver.worldY));
      moon = Math.max(moon, sampleDirectionalMask(item.moon, item.caster, receiver.worldX, receiver.worldY));
      if (receiver.receiver === 'flat') contact = Math.max(contact, contactCoverage(item.caster, receiver.worldX, receiver.worldY, receiver.heightSubunits));
    }
    return resolveReceiverLight(this.skyValue, receiver.receiver, 1 - sun, 1 - moon, local, contact);
  }
  private coverage(left: number, top: number, width: number, height: number, receiverHeight: number, step: number): CoveragePlane {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || step <= 0 || width * height > 4_194_304) throw new Error('invalid_receiver_raster_bounds');
    const key = this.key.reset().add(left).add(top).add(width).add(height).add(receiverHeight).add(step);
    let coverage = this.coverageFields.get(this.lookupKey(key.hash))?.find((entry) => key.matches(entry.signature));
    const prepared = this.atHeight(receiverHeight);
    if (coverage === undefined) {
      const bytes = width * height * 6;
      if (bytes > 8 * 1024 * 1024) throw new Error('directional_coverage_budget_exceeded');
      while (this.coverageBytes + bytes > 8 * 1024 * 1024 || this.coverageCount >= 64) {
        const oldest = this.coverageFields.keys().next().value;
        if (oldest === undefined) break;
        for (const entry of this.coverageFields.get(oldest)!) { this.coverageBytes -= entry.width * entry.height * 6; this.coverageCount--; }
        this.coverageFields.delete(oldest);
      }
      coverage = { left, top, width, height, receiverHeight, step, signature: key.copy(), fixed: createReceiverCoverage(width * height), working: createReceiverCoverage(width * height), movingRevision: -1 };
      blitReceiverCoverage(coverage.fixed, prepared.fixed, coverage);
      renderOperationCounters.coverageFieldRebuilds++; this.diagnostics.staticCoverageBuilds++;
      const bucket = this.coverageFields.get(key.hash);
      if (bucket === undefined) this.coverageFields.set(key.hash, [coverage]); else bucket.push(coverage);
      this.coverageCount++; this.coverageBytes += bytes;
    }
    if (coverage.movingRevision !== this.movingRevision) {
      copyReceiverCoverage(coverage.working, coverage.fixed);
      blitReceiverCoverage(coverage.working, prepared.moving, coverage);
      coverage.movingRevision = this.movingRevision;
      this.diagnostics.movingCoverageBlits++; this.diagnostics.movingCastersBlitted += prepared.moving.length;
    }
    return coverage;
  }
  rasterizeCached(localRevision: string | number, left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || step <= 0 || width * height > 4_194_304) throw new Error('invalid_receiver_raster_bounds');
    const key = this.key.reset().add(left).add(top).add(width).add(height).add(receiverHeight).add(step);
    const hash = this.lookupKey(key.hash);
    let entry = this.rasters.get(hash)?.find((entry) => key.matches(entry.signature));
    if (entry !== undefined && entry.revision === this.revision && entry.localRevision === localRevision) return entry.raster;
    if (entry === undefined) {
      const signature = key.copy();
      const bytes = width * height * 4;
      if (bytes > 16 * 1024 * 1024) throw new Error('receiver_raster_budget_exceeded');
      while (this.rasterBytes + bytes > 16 * 1024 * 1024 || this.rasterCount >= 64) {
        const oldest = this.rasters.keys().next().value;
        if (oldest === undefined) break;
        for (const old of this.rasters.get(oldest)!) { this.rasterBytes -= old.raster.pixels.byteLength; this.rasterCount--; }
        this.rasters.delete(oldest);
      }
      entry = { signature, raster: { left, top, width, height, step, pixels: new Uint8ClampedArray(bytes), revision: 0 }, revision: -1, localRevision };
      const bucket = this.rasters.get(hash);
      if (bucket === undefined) this.rasters.set(hash, [entry]); else bucket.push(entry);
      this.rasterBytes += bytes; this.rasterCount++;
    }
    this.merge(entry.raster, receiverHeight, local); entry.revision = this.revision; entry.localRevision = localRevision;
    return entry.raster;
  }
  rasterize(left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    // NaN is deliberately unequal to its previous value: callers without a
    // local revision always refresh RGB while retaining the same backing array.
    return this.rasterizeCached(Number.NaN, left, top, width, height, receiverHeight, step, local);
  }
  private merge(raster: ReceiverLightRaster, receiverHeight: number, local?: (x: number, y: number) => RgbColor): void {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const { left, top, width, height, step, pixels } = raster;
    const { sun, moon, contact } = this.coverage(left, top, width, height, receiverHeight, step).working;
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
    raster.revision++; this.diagnostics.rgbMerges++;
  }
  /** Read-only diagnostic seam: callers must never mutate retained arrays. */
  coverageSnapshot(): readonly { readonly static: ReceiverCoverageChannels; readonly working: ReceiverCoverageChannels }[] {
    return [...this.coverageFields.values()].flatMap((bucket) => bucket.map((plane) => ({ static: plane.fixed, working: plane.working })));
  }
  get retainedMaskBytes(): number { return this.cache.bytes + this.preparedBytes; }
  get retainedRasterBytes(): number { return this.rasterBytes; }
  get retainedCoverageBytes(): number { return this.coverageBytes; }
  reset(): void {
    this.generation++; this.revision++; this.prepared.clear(); this.preparedBytes = 0; this.rasters.clear(); this.rasterBytes = 0; this.rasterCount = 0;
    this.coverageFields.clear(); this.coverageBytes = 0; this.coverageCount = 0; this.skySignature = []; this.movingSignature = [];
    this.staticCasters = EMPTY_CASTERS; this.movingCasters = EMPTY_CASTERS; this.staticIdentity = undefined; this.skyValue = null; this.geometryKey = -1;
    this.cache.reset(); this.identities.reset(); this.activeMasks.clear();
    for (const key of Object.keys(this.diagnostics) as (keyof typeof this.diagnostics)[]) this.diagnostics[key] = 0;
  }
}
