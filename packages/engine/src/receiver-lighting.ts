import { renderOperationCounters } from '@orchard/ui';
import { buildActorShadowStamps, type ActorShadowStamp } from './actor-shadow-stamps.js';
import { maximumLight, type CelestialLighting, type CelestialSource } from './celestial-lighting.js';
import { directionalGeometryKey, directionalMaskBytes, DirectionalShadowCache, sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';
import type { RgbColor } from './lighting.js';
import type { LightingReceiver, LightingReceiverClass, ReceiverLightContributions } from './lighting-types.js';
import { LightingIdentities, LightingNumericKey } from './lighting-numeric-key.js';
import { RawReceiverFields, type RawReceiverField } from './receiver-raw-field.js';
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
  /** Local RGB per cell, resampled only when the caller's local revision changes. */
  readonly local: Uint8ClampedArray<ArrayBuffer>;
  /** Changes only when RGB bytes are merged; uploaders retain ImageData. */
  revision: number;
  /** Scene-unique version of the local bytes, for consumers that derive from it. */
  localVersion: number;
}

/** Sun-angle changes are prepared across frames, then crossfaded in steps.
 * Omit it (review tools, tests) to adopt every new angle immediately. */
export interface GeometryTransition {
  /** Main-thread time spent per frame projecting the next angle's masks. */
  readonly budgetMs: number;
  readonly fadeMs: number;
  /** Each step is one static coverage blend and one RGB merge. */
  readonly fadeSteps: number;
  readonly clock: () => number;
}
export const GAMEPLAY_GEOMETRY_TRANSITION: GeometryTransition = { budgetMs: 1, fadeMs: 600, fadeSteps: 8, clock: () => performance.now() };

interface CoveragePlane extends ReceiverCoverageBounds {
  readonly signature: readonly number[];
  /** Pure static coverage for the displayed geometry. */
  target: ReceiverCoverageChannels;
  targetGeneration: number;
  /** The next angle's static coverage, blitted in the background. */
  next: ReceiverCoverageChannels | null;
  nextJob: number;
  /** Displayed static coverage: target, or from/blend during a geometry fade. */
  fixed: ReceiverCoverageChannels;
  from: ReceiverCoverageChannels | null;
  blend: ReceiverCoverageChannels | null;
  fadeId: number;
  shownStep: number;
  /** Scene-unique; changes exactly when the displayed bytes change. */
  fixedVersion: number;
  /** Static plus moving coverage, allocated only for raw GPU fields. */
  working: ReceiverCoverageChannels | null;
  workingVersion: number;
  movingRevision: number;
  readonly spare: ReceiverCoverageChannels[];
  usedFrame: number;
  bytes: number;
}
interface PreparedPlane {
  readonly fixed: PreparedCaster[]; readonly moving: PreparedCaster[];
  movingRevision: number;
}
interface CachedRaster {
  readonly signature: readonly number[]; readonly raster: ReceiverLightRaster;
  plane: CoveragePlane | null; planeVersion: number; skyRevision: number;
  localRevision: string | number;
}
interface PendingGeometry {
  readonly id: number; readonly key: number; readonly sun: CelestialSource; readonly moon: CelestialSource;
  readonly heights: readonly number[];
  height: number; cohort: number; index: number;
  /** Planes displayed when mask preparation finished; each gets a next target. */
  planes: CoveragePlane[] | null; plane: number; caster: number; cleared: boolean;
}
const EMPTY_CASTERS: readonly DirectionalCaster[] = [];

/** Retain static receiver planes independently of interpolated actor placement.
 * Moving bodies never enter the Canvas RGB planes: they are resolved as native
 * pixel stamps against the retained static field (see actor-shadow-stamps). */
export class CelestialReceiverScene {
  private readonly rawFields = new RawReceiverFields();
  private staticCasters: readonly DirectionalCaster[] = EMPTY_CASTERS;
  private movingCasters: readonly DirectionalCaster[] = EMPTY_CASTERS;
  private staticIdentity: number | undefined;
  private skyValue: CelestialLighting | null = null;
  /** Sources whose quantized geometry is currently displayed. */
  private displaySun: CelestialSource | null = null;
  private displayMoon: CelestialSource | null = null;
  private geometryKey = -1;
  private pending: PendingGeometry | null = null;
  private fade: { readonly id: number; readonly startedAt: number; step: number } | null = null;
  private jobSequence = 0;
  private fadeSequence = 0;
  private frame = 0;
  private version = 0;
  private readonly single: PreparedCaster[] = [];
  private readonly sunTable = new Float64Array(768);
  private readonly moonTable = new Float64Array(768);
  private readonly prepared = new Map<number, PreparedPlane>();
  private preparedBytes = 0;
  private generation = 0;
  /** Any input change, including moving bodies: raw GPU fields. */
  private revision = 0;
  /** RGB sky changes; static coverage is versioned per plane. */
  private skyRevision = 0;
  private staticGeneration = 0;
  private movingRevision = 0;
  private localVersion = 0;
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
  private readonly stampPools = new Map<number, ActorShadowStamp[]>();
  readonly diagnostics = { staticCoverageBuilds: 0, movingCoverageBlits: 0, movingCastersBlitted: 0, rgbMerges: 0, numericKeyLookups: 0, skyRgbRevision: 0, staticCasters: 0,
    geometrySwaps: 0, geometryPreparedCasters: 0, geometryBlittedCasters: 0, geometryFadeSteps: 0 };
  constructor(readonly pixelsPerHeightSubunit: number, readonly cache = new DirectionalShadowCache(),
    private readonly observeKey?: (key: number) => void, private readonly transition?: GeometryTransition) {}
  private lookupKey(key: number): number { this.observeKey?.(key); this.diagnostics.numericKeyLookups++; return key; }
  prepare(sky: CelestialLighting, casters: readonly DirectionalCaster[]): void {
    this.prepareSplit(sky, casters, EMPTY_CASTERS);
  }
  prepareSplit(sky: CelestialLighting, fixed: readonly DirectionalCaster[], moving: readonly DirectionalCaster[], staticIdentity?: number): void {
    this.frame++;
    const geometry = (directionalGeometryKey(sky.sun) ?? 0) * 131072 + (directionalGeometryKey(sky.moon) ?? 0);
    this.lookupKey(geometry);
    const staticChanged = staticIdentity === undefined ? fixed !== this.staticCasters : staticIdentity !== this.staticIdentity;
    if (staticChanged || this.geometryKey === -1 || this.transition === undefined) {
      if (staticChanged || geometry !== this.geometryKey) this.adopt(sky, geometry);
    } else if (geometry === this.geometryKey) this.pending = null;
    else if (this.pending?.key !== geometry) {
      this.pending = { id: ++this.jobSequence, key: geometry, sun: sky.sun, moon: sky.moon, heights: [...this.prepared.keys()],
        height: 0, cohort: 0, index: 0, planes: null, plane: 0, caster: 0, cleared: false };
    }
    const key = this.key.reset().add(sky.diffuse.r).add(sky.diffuse.g).add(sky.diffuse.b)
      .add(sky.sun.illumination.r).add(sky.sun.illumination.g).add(sky.sun.illumination.b)
      .add(sky.moon.illumination.r).add(sky.moon.illumination.g).add(sky.moon.illumination.b);
    if (!key.matches(this.skySignature)) {
      this.skySignature = key.copy(); this.revision++; this.skyRevision++; this.diagnostics.skyRgbRevision++;
    }
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
    this.diagnostics.staticCasters = fixed.length;
    this.staticCasters = fixed; this.staticIdentity = staticIdentity; this.movingCasters = moving; this.skyValue = sky;
    if (this.pending !== null) this.advancePending();
    this.advanceFade();
  }
  /** Immediate adoption: a new static set or the first frame has nothing to fade from. */
  private adopt(sky: CelestialLighting, geometry: number): void {
    this.rawFields.reset();
    this.prepared.clear(); this.preparedBytes = 0; this.activeMasks.clear(); this.coverageFields.clear(); this.coverageBytes = 0; this.coverageCount = 0;
    this.generation++; this.revision++; this.staticGeneration++;
    this.geometryKey = geometry; this.displaySun = sky.sun; this.displayMoon = sky.moon;
    this.pending = null; this.fade = null;
  }
  /** Spend at most the frame budget on the next angle: first its masks at
   * every receiver height in use, then each displayed plane's next static
   * coverage, one caster at a time. The swap itself copies nothing. */
  private advancePending(): void {
    const job = this.pending!, transition = this.transition!;
    const started = transition.clock();
    let first = true;
    const spend = (): boolean => {
      if (!first && transition.clock() - started >= transition.budgetMs) return false;
      first = false; return true;
    };
    while (job.height < job.heights.length) {
      const casters = job.cohort === 0 ? this.staticCasters : this.movingCasters;
      if (job.index >= casters.length) {
        if (job.cohort === 0) job.cohort = 1; else { job.cohort = 0; job.height++; }
        job.index = 0; continue;
      }
      if (!spend()) return;
      const caster = casters[job.index++]!, height = job.heights[job.height]!;
      this.cache.get(caster, job.sun, height, this.pixelsPerHeightSubunit);
      this.cache.get(caster, job.moon, height, this.pixelsPerHeightSubunit);
      this.diagnostics.geometryPreparedCasters++;
    }
    job.planes ??= this.livePlanes();
    while (job.plane < job.planes.length) {
      const plane = job.planes[job.plane]!;
      if (!job.cleared) {
        if (!spend()) return;
        plane.next ??= this.takeChannels(plane);
        for (const channel of [plane.next.sun, plane.next.moon, plane.next.contact]) channel.fill(0);
        job.cleared = true;
      }
      if (job.caster < this.staticCasters.length) {
        if (!spend()) return;
        const caster = this.staticCasters[job.caster++]!;
        this.single[0] = { caster, sun: this.cache.get(caster, job.sun, plane.receiverHeight, this.pixelsPerHeightSubunit),
          moon: this.cache.get(caster, job.moon, plane.receiverHeight, this.pixelsPerHeightSubunit) };
        blitReceiverCoverage(plane.next!, this.single, plane);
        this.diagnostics.geometryBlittedCasters++;
        continue;
      }
      plane.nextJob = job.id; job.plane++; job.caster = 0; job.cleared = false;
    }
    this.swap(job);
  }
  private livePlanes(): CoveragePlane[] {
    const planes: CoveragePlane[] = [];
    for (const bucket of this.coverageFields.values()) for (const plane of bucket) if (plane.usedFrame >= this.frame - 1) planes.push(plane);
    return planes;
  }
  private swap(job: PendingGeometry): void {
    const transition = this.transition!;
    const fading = transition.fadeMs > 0 && transition.fadeSteps > 0;
    this.pending = null;
    this.geometryKey = job.key; this.displaySun = job.sun; this.displayMoon = job.moon;
    this.prepared.clear(); this.preparedBytes = 0; this.activeMasks.clear();
    const previousGeneration = this.staticGeneration++, fadeId = ++this.fadeSequence;
    for (const [hash, bucket] of this.coverageFields) for (let index = bucket.length - 1; index >= 0; index--) {
      const plane = bucket[index]!;
      if (!fading || plane.usedFrame < this.frame - 1 || plane.targetGeneration !== previousGeneration) {
        // Nothing on screen to fade from: rebuild lazily if ever revisited.
        bucket.splice(index, 1); this.coverageBytes -= plane.bytes; this.coverageCount--;
        if (bucket.length === 0) this.coverageFields.delete(hash);
        continue;
      }
      // Fade from exactly what is displayed, including a fade still in progress.
      const shown = plane.fixed;
      const ready = plane.nextJob === job.id ? plane.next : null;
      for (const channels of [plane.target, plane.from, plane.blend, plane.next]) {
        if (channels !== null && channels !== shown && channels !== ready && !plane.spare.includes(channels)) plane.spare.push(channels);
      }
      plane.from = shown; plane.blend = null; plane.next = null;
      if (ready !== null) { plane.target = ready; plane.targetGeneration = this.staticGeneration; }
      else { plane.target = this.takeChannels(plane); plane.targetGeneration = -1; }
      plane.fadeId = fadeId; plane.shownStep = 0; plane.fixed = shown;
    }
    this.generation++; this.revision++;
    this.fade = fading ? { id: fadeId, startedAt: transition.clock(), step: 0 } : null;
    this.diagnostics.geometrySwaps++;
  }
  private advanceFade(): void {
    if (this.fade === null) return;
    const transition = this.transition!;
    const step = Math.min(transition.fadeSteps, Math.max(0, Math.floor((transition.clock() - this.fade.startedAt) / transition.fadeMs * transition.fadeSteps)));
    if (step === this.fade.step) return;
    this.fade.step = step;
    if (step >= transition.fadeSteps) this.fade = null;
    this.revision++; this.diagnostics.geometryFadeSteps++;
  }
  /** Buffers stay with their plane and are recycled across transitions. */
  private takeChannels(plane: CoveragePlane): ReceiverCoverageChannels {
    const spare = plane.spare.pop();
    if (spare !== undefined) return spare;
    const bytes = plane.width * plane.height * 3;
    plane.bytes += bytes; this.coverageBytes += bytes;
    return createReceiverCoverage(plane.width * plane.height);
  }
  /** Prepare pending geometry without committing a stale moving/static generation. */
  async prepareHeights(heights: readonly number[], yieldBatch: () => Promise<void> = () => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  })): Promise<boolean> {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const generation = this.generation, sun = this.displaySun!, moon = this.displayMoon!;
    let start = performance.now(), count = 0;
    for (const height of new Set(heights)) {
      for (const cohort of [this.staticCasters, this.movingCasters]) for (const caster of cohort) {
        if (generation !== this.generation) return false;
        this.cache.get(caster, sun, height, this.pixelsPerHeightSubunit);
        this.cache.get(caster, moon, height, this.pixelsPerHeightSubunit);
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
      const sun = this.cache.get(caster, this.displaySun!, height, this.pixelsPerHeightSubunit);
      const moon = this.cache.get(caster, this.displayMoon!, height, this.pixelsPerHeightSubunit);
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
  private coverage(left: number, top: number, width: number, height: number, receiverHeight: number, step: number, includeMoving: boolean): CoveragePlane {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || step <= 0 || width * height > 4_194_304) throw new Error('invalid_receiver_raster_bounds');
    const key = this.key.reset().add(left).add(top).add(width).add(height).add(receiverHeight).add(step);
    let coverage = this.coverageFields.get(this.lookupKey(key.hash))?.find((entry) => key.matches(entry.signature));
    const prepared = this.atHeight(receiverHeight);
    if (coverage === undefined) {
      // Reserve room for a target, next target, fade origin and blend.
      const bytes = width * height * 3;
      if (bytes * 4 > 8 * 1024 * 1024) throw new Error('directional_coverage_budget_exceeded');
      while (this.coverageBytes + bytes * 4 > 8 * 1024 * 1024 || this.coverageCount >= 64) {
        const oldest = this.coverageFields.keys().next().value;
        if (oldest === undefined) break;
        for (const entry of this.coverageFields.get(oldest)!) { this.coverageBytes -= entry.bytes; this.coverageCount--; }
        this.coverageFields.delete(oldest);
      }
      const target = createReceiverCoverage(width * height);
      coverage = { left, top, width, height, receiverHeight, step, signature: key.copy(), target, targetGeneration: -1,
        next: null, nextJob: -1, fixed: target, from: null, blend: null, fadeId: -1, shownStep: -1, fixedVersion: ++this.version,
        working: null, workingVersion: -1, movingRevision: -1, spare: [], usedFrame: this.frame, bytes };
      const bucket = this.coverageFields.get(key.hash);
      if (bucket === undefined) this.coverageFields.set(key.hash, [coverage]); else bucket.push(coverage);
      this.coverageCount++; this.coverageBytes += bytes;
    }
    coverage.usedFrame = this.frame;
    if (coverage.targetGeneration !== this.staticGeneration) {
      for (const channel of [coverage.target.sun, coverage.target.moon, coverage.target.contact]) channel.fill(0);
      blitReceiverCoverage(coverage.target, prepared.fixed, coverage);
      coverage.targetGeneration = this.staticGeneration;
      if (coverage.fixed === coverage.target) coverage.fixedVersion = ++this.version;
      renderOperationCounters.coverageFieldRebuilds++; this.diagnostics.staticCoverageBuilds++;
    }
    if (coverage.from !== null) {
      if (this.fade === null || coverage.fadeId !== this.fade.id) {
        for (const channels of [coverage.from, coverage.blend]) if (channels !== null && channels !== coverage.target) coverage.spare.push(channels);
        coverage.from = null; coverage.blend = null; coverage.fixed = coverage.target; coverage.fixedVersion = ++this.version;
      } else if (coverage.shownStep !== this.fade.step) {
        const blend = coverage.blend ??= this.takeChannels(coverage);
        const t = this.fade.step / this.transition!.fadeSteps, from = coverage.from, to = coverage.target;
        for (const channel of ['sun', 'moon', 'contact'] as const) {
          const a = from[channel], b = to[channel], out = blend[channel];
          for (let i = 0; i < out.length; i++) out[i] = Math.round(a[i]! + (b[i]! - a[i]!) * t);
        }
        coverage.fixed = blend; coverage.shownStep = this.fade.step; coverage.fixedVersion = ++this.version;
      }
    }
    if (includeMoving && (coverage.movingRevision !== this.movingRevision || coverage.workingVersion !== coverage.fixedVersion)) {
      if (coverage.working === null) {
        const bytes = width * height * 3;
        coverage.working = createReceiverCoverage(width * height); coverage.bytes += bytes; this.coverageBytes += bytes;
      }
      copyReceiverCoverage(coverage.working, coverage.fixed);
      blitReceiverCoverage(coverage.working, prepared.moving, coverage);
      coverage.movingRevision = this.movingRevision; coverage.workingVersion = coverage.fixedVersion;
      this.diagnostics.movingCoverageBlits++; this.diagnostics.movingCastersBlitted += prepared.moving.length;
    }
    return coverage;
  }
  /** Static-only RGB plane. Moving bodies are delivered by actorShadowStamps. */
  rasterizeCached(localRevision: string | number, left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const plane = this.coverage(left, top, width, height, receiverHeight, step, false);
    const key = this.key.reset().add(left).add(top).add(width).add(height).add(receiverHeight).add(step);
    const hash = this.lookupKey(key.hash);
    let entry = this.rasters.get(hash)?.find((entry) => key.matches(entry.signature));
    if (entry !== undefined && entry.plane === plane && entry.planeVersion === plane.fixedVersion
      && entry.skyRevision === this.skyRevision && entry.localRevision === localRevision) return entry.raster;
    if (entry === undefined) {
      const signature = key.copy();
      const bytes = width * height * 8;
      if (bytes > 16 * 1024 * 1024) throw new Error('receiver_raster_budget_exceeded');
      while (this.rasterBytes + bytes > 16 * 1024 * 1024 || this.rasterCount >= 64) {
        const oldest = this.rasters.keys().next().value;
        if (oldest === undefined) break;
        for (const old of this.rasters.get(oldest)!) { this.rasterBytes -= old.raster.pixels.byteLength + old.raster.local.byteLength; this.rasterCount--; }
        this.rasters.delete(oldest);
      }
      entry = { signature, raster: { left, top, width, height, step, pixels: new Uint8ClampedArray(width * height * 4),
        local: new Uint8ClampedArray(width * height * 4), revision: 0, localVersion: 0 },
        plane: null, planeVersion: -1, skyRevision: -1, localRevision: Number.NaN };
      const bucket = this.rasters.get(hash);
      if (bucket === undefined) this.rasters.set(hash, [entry]); else bucket.push(entry);
      this.rasterBytes += bytes; this.rasterCount++;
    }
    if (entry.localRevision !== localRevision) this.sampleLocal(entry.raster, local);
    this.merge(entry.raster, plane.fixed);
    entry.plane = plane; entry.planeVersion = plane.fixedVersion; entry.skyRevision = this.skyRevision; entry.localRevision = localRevision;
    return entry.raster;
  }
  rawFieldCached(localRevision: string | number, left: number, top: number, width: number, height: number,
    receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): RawReceiverField {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const coverage = this.coverage(left, top, width, height, receiverHeight, step, true).working!;
    return this.rawFields.get(localRevision, this.revision, this.skyValue, left, top, width, height, receiverHeight, step, coverage, local);
  }
  rasterize(left: number, top: number, width: number, height: number, receiverHeight: number, step = 1, local?: (x: number, y: number) => RgbColor): ReceiverLightRaster {
    // NaN is deliberately unequal to its previous value: callers without a
    // local revision always refresh RGB while retaining the same backing array.
    return this.rasterizeCached(Number.NaN, left, top, width, height, receiverHeight, step, local);
  }
  /** Moving shadows for a plane returned by rasterizeCached in this frame. */
  actorShadowStamps(raster: ReceiverLightRaster, receiverHeight: number): readonly ActorShadowStamp[] {
    if (this.skyValue === null) throw new Error('celestial_scene_not_prepared');
    const plane = this.coverage(raster.left, raster.top, raster.width, raster.height, receiverHeight, raster.step, false);
    const prepared = this.atHeight(receiverHeight);
    let pool = this.stampPools.get(receiverHeight);
    if (pool === undefined) {
      if (this.stampPools.size >= 64) this.stampPools.clear();
      pool = []; this.stampPools.set(receiverHeight, pool);
    }
    if (prepared.moving.length === 0) { pool.length = 0; return pool; }
    const sky = this.skyValue;
    return buildActorShadowStamps({ casters: prepared.moving, receiverHeight, bounds: plane, coverage: plane.fixed, local: raster.local,
      sky: { diffuse: sky.diffuse, sun: sky.sun.illumination, moon: sky.moon.illumination },
      context: [raster.left, raster.top, raster.width, raster.height, raster.step, this.skyRevision, plane.fixedVersion, raster.localVersion], pool });
  }
  private sampleLocal(raster: ReceiverLightRaster, local?: (x: number, y: number) => RgbColor): void {
    const { left, top, width, height, step } = raster, pixels = raster.local;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const point = local?.(left + (x + 0.5) * step, top + (y + 0.5) * step) ?? BLACK, index = (y * width + x) * 4;
      pixels[index] = point.r; pixels[index + 1] = point.g; pixels[index + 2] = point.b; pixels[index + 3] = 255;
    }
    raster.localVersion = ++this.localVersion;
  }
  private merge(raster: ReceiverLightRaster, coverage: ReceiverCoverageChannels): void {
    const { width, height, pixels, local } = raster, { sun, moon, contact } = coverage;
    const sky = this.skyValue!, sunLight = sky.sun.illumination, moonLight = sky.moon.illumination;
    // Without contact, transmission is exactly 1: per-byte tables reproduce
    // the general expression bit for bit at a fraction of the cost.
    const sunTable = this.sunTable, moonTable = this.moonTable;
    for (let value = 0; value < 256; value++) {
      const weight = 1 - value / 255;
      sunTable[value * 3] = Math.round(sunLight.r * weight); sunTable[value * 3 + 1] = Math.round(sunLight.g * weight); sunTable[value * 3 + 2] = Math.round(sunLight.b * weight);
      moonTable[value * 3] = Math.round(moonLight.r * weight); moonTable[value * 3 + 1] = Math.round(moonLight.g * weight); moonTable[value * 3 + 2] = Math.round(moonLight.b * weight);
    }
    const diffuseR = Math.round(sky.diffuse.r * 1), diffuseG = Math.round(sky.diffuse.g * 1), diffuseB = Math.round(sky.diffuse.b * 1);
    for (let index = 0; index < width * height; index++) {
      const out = index * 4;
      if (contact[index] === 0) {
        const s = sun[index]! * 3, m = moon[index]! * 3;
        pixels[out] = Math.max(diffuseR, sunTable[s]!, moonTable[m]!, local[out]!);
        pixels[out + 1] = Math.max(diffuseG, sunTable[s + 1]!, moonTable[m + 1]!, local[out + 1]!);
        pixels[out + 2] = Math.max(diffuseB, sunTable[s + 2]!, moonTable[m + 2]!, local[out + 2]!);
        pixels[out + 3] = 255;
        continue;
      }
      const transmission = 1 - contact[index]! / 255 * 0.18;
      const sunWeight = (1 - sun[index]! / 255) * transmission;
      const moonWeight = (1 - moon[index]! / 255) * transmission;
      pixels[out] = Math.max(Math.round(sky.diffuse.r * transmission), Math.round(sunLight.r * sunWeight), Math.round(moonLight.r * moonWeight), local[out]!);
      pixels[out + 1] = Math.max(Math.round(sky.diffuse.g * transmission), Math.round(sunLight.g * sunWeight), Math.round(moonLight.g * moonWeight), local[out + 1]!);
      pixels[out + 2] = Math.max(Math.round(sky.diffuse.b * transmission), Math.round(sunLight.b * sunWeight), Math.round(moonLight.b * moonWeight), local[out + 2]!);
      pixels[out + 3] = 255;
    }
    raster.revision++; this.diagnostics.rgbMerges++;
  }
  /** Read-only diagnostic seam: callers must never mutate retained arrays. */
  coverageSnapshot(): readonly { readonly static: ReceiverCoverageChannels; readonly working: ReceiverCoverageChannels }[] {
    return [...this.coverageFields.values()].flatMap((bucket) => bucket.map((plane) => ({ static: plane.fixed, working: plane.working ?? plane.fixed })));
  }
  get retainedMaskBytes(): number { return this.cache.bytes + this.preparedBytes; }
  get retainedRasterBytes(): number { return this.rasterBytes + this.rawFields.bytes; }
  get retainedCoverageBytes(): number { return this.coverageBytes; }
  reset(): void {
    this.rawFields.reset();
    this.generation++; this.revision++; this.skyRevision++; this.staticGeneration++;
    this.prepared.clear(); this.preparedBytes = 0; this.rasters.clear(); this.rasterBytes = 0; this.rasterCount = 0;
    this.coverageFields.clear(); this.coverageBytes = 0; this.coverageCount = 0; this.skySignature = []; this.movingSignature = [];
    this.staticCasters = EMPTY_CASTERS; this.movingCasters = EMPTY_CASTERS; this.staticIdentity = undefined; this.skyValue = null; this.geometryKey = -1;
    this.displaySun = null; this.displayMoon = null; this.pending = null; this.fade = null; this.stampPools.clear();
    this.cache.reset(); this.identities.reset(); this.activeMasks.clear();
    for (const key of Object.keys(this.diagnostics) as (keyof typeof this.diagnostics)[]) this.diagnostics[key] = 0;
  }
}
