import { renderOperationCounters, type AssetFrameSource } from '@orchard/ui';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import type { CelestialLighting } from './celestial-lighting.js';
import { groundedSpriteCaster, type DirectionalCaster } from './directional-shadows.js';
import type { LightOcclusionMap } from './light-occlusion.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import type { LightingReceiverClass } from './lighting-types.js';
import type { TileLightmap } from './lighting.js';
import type { PointLight } from './lighting.js';
import { ReceiverFrameCache, withWorldReceiverLight } from './receiver-frame-source.js';
import type { ActorShadowStamp } from './actor-shadow-stamps.js';
import { groundSourceContext, withGroundSpriteSource,type GroundSpriteBasis } from './ground-light-source.js';
import { webglFrameSource, webglWorldBackend } from './webgl/hooks.js';
import { CelestialReceiverScene, GAMEPLAY_GEOMETRY_TRANSITION, type ReceiverLightRaster } from './receiver-lighting.js';
import { lightingOwner, terrainLightingOwner } from './lighting-owner.js';
export { lightingOwner } from './lighting-owner.js';
import { terrainBaseDatum, type TerrainArray } from './terrain.js';

interface Upload { readonly canvas: HTMLCanvasElement; image: ImageData | null; pixels: WeakRef<Uint8ClampedArray<ArrayBuffer>> | null; revision: number }

interface Plane { readonly canvas: HTMLCanvasElement; readonly left: number; readonly top: number; readonly step: number; readonly raster: ReceiverLightRaster }
interface StampSurface { readonly canvas: HTMLCanvasElement; image: ImageData | null; revision: number; used: number }
interface LightWindow { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly step: number }

/** Receiver planes cover the viewport plus a margin, snapped to this many
 * world pixels, so walking reuses one retained plane for 64 px of travel. */
export const RECEIVER_WINDOW_SNAP = 64;
const RECEIVER_STEP = 4;
const STAMP_SURFACE_LIMIT = 64;

/** Receiver lighting in the actual world painter. Static ground planes are
 * resolved at four game pixels and smoothly upsampled; moving bodies' ground
 * shadows are native-pixel stamps that follow the sprite's pixel phase.
 * Every body receives its own RGB, so a shadow behind it cannot blacken it. */
export class WorldLightingRenderer {
  readonly mapper: LightCoordinateMapper;
  readonly scene: CelestialReceiverScene;
  readonly frames = new ReceiverFrameCache();
  private planes = new Map<number, Plane>();
  private stamps = new Map<number, readonly ActorShadowStamp[]>();
  private readonly stampSurfaces = new Map<ActorShadowStamp, StampSurface>();
  private frame = 0;
  private uploads = new Map<number, Upload>();
  private runCanvas: HTMLCanvasElement | null = null;
  private flameGlow: HTMLCanvasElement | null = null;
  private cameraX = 0;
  private cameraY = 0;
  private width = 0;
  private height = 0;
  private lightmap: TileLightmap | null = null;
  private localSourceRevision = -1;
  private localRevision = 0;
  receiverMs = 0;
  mergeMs = 0;
  uploadMs = 0;
  constructor(readonly terrain: TerrainArray) {
    this.mapper = new LightCoordinateMapper(terrain);
    this.scene = new CelestialReceiverScene(this.mapper.pixelsPerHeightSubunit, undefined, undefined, GAMEPLAY_GEOMETRY_TRANSITION);
  }
  begin(sky: CelestialLighting, fixed: readonly DirectionalCaster[], moving: readonly DirectionalCaster[], lightmap: TileLightmap,
    cameraX: number, cameraY: number, width: number, height: number, staticIdentity?: number): void {
    this.receiverMs = this.mergeMs = this.uploadMs = 0;
    this.scene.prepareSplit(sky, fixed, moving, staticIdentity);
    if (this.lightmap !== lightmap || this.localSourceRevision !== lightmap.receiverRevision) {
      this.localRevision++; this.localSourceRevision = lightmap.receiverRevision;
    }
    this.lightmap = lightmap; this.cameraX = cameraX; this.cameraY = cameraY; this.width = width; this.height = height;
    this.planes.clear(); this.stamps.clear(); this.frame++;
    for (const [stamp, surface] of this.stampSurfaces) {
      if (this.frame - surface.used > 60) { surface.canvas.width = surface.canvas.height = 0; this.stampSurfaces.delete(stamp); }
    }
  }
  private window(level: number): LightWindow {
    const snap = RECEIVER_WINDOW_SNAP, step = RECEIVER_STEP;
    // World-aligned raster avoids swimming when the camera moves a fraction.
    return { left: Math.floor(this.cameraX / snap) * snap - snap,
      top: Math.floor(this.mapper.logicalY(this.cameraY, level) / snap) * snap - snap,
      width: (Math.ceil(this.width / snap) + 3) * snap / step, height: (Math.ceil(this.height / snap) + 3) * snap / step, step };
  }
  drawReceiver(context: CanvasRenderingContext2D, x: number, y: number, level: number,
    receiver: LightingReceiverClass, draw: () => void): void {
    if (receiver === 'flat') {
      withGroundSpriteSource(context, (source, left, top,basis) => this.groundSource(source, left, top, level,basis), draw);
      return;
    }
    const started = performance.now();
    const local = this.lightmap!.sampleReceiverLight(x, this.mapper.projectedY(y, level), level, receiver);
    const color = this.scene.sample({ worldX: x, worldY: y, heightSubunits: this.mapper.heightAtLevel(level),
      receiver, owner: lightingOwner(x, y) }, local).combined;
    this.receiverMs += performance.now() - started;
    withWorldReceiverLight(context, this.frames, color, draw);
  }
  private plane(level: number): Plane {
    const existing = this.planes.get(level);
    if (existing !== undefined) return existing;
    if (this.planes.size >= 8) throw new Error('world_receiver_plane_budget_exceeded');
    const { left, top, width, height, step } = this.window(level);
    const mergeStarted = performance.now();
    const raster = this.scene.rasterizeCached(this.localRevision, left, top, width, height, this.mapper.heightAtLevel(level), step,
      (x, y) => this.lightmap!.sampleReceiverLight(x, this.mapper.projectedY(y, level), level));
    this.mergeMs += performance.now() - mergeStarted;
    let upload = this.uploads.get(level);
    if (upload === undefined) {
      if (this.uploads.size >= 8) {
        const first = this.uploads.keys().next().value!;
        const old = this.uploads.get(first)!; old.canvas.width = old.canvas.height = 0; this.uploads.delete(first);
      }
      upload = { canvas: document.createElement('canvas'), image: null, pixels: null, revision: -1 };
      this.uploads.set(level, upload);
    }
    const { canvas } = upload;
    if (canvas.width !== width || canvas.height !== height || upload.image === null) {
      canvas.width = width; canvas.height = height;
      upload.image = new ImageData(width, height); upload.pixels = null; upload.revision = -1;
    }
    const samePixels = upload.pixels?.deref() === raster.pixels;
    if (!samePixels || upload.revision !== raster.revision) {
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('world_receiver_surface_unavailable');
      const uploadStarted = performance.now();
      upload.image.data.set(raster.pixels);
      context.putImageData(upload.image, 0, 0);
      if (!samePixels) upload.pixels = new WeakRef(raster.pixels);
      upload.revision = raster.revision;
      this.uploadMs += performance.now() - uploadStarted;
    }
    const plane = { canvas, left, top, step, raster }; this.planes.set(level, plane); return plane;
  }
  private actorStamps(level: number): readonly ActorShadowStamp[] {
    let stamps = this.stamps.get(level);
    if (stamps === undefined) {
      const started = performance.now();
      stamps = this.scene.actorShadowStamps(this.plane(level).raster, this.mapper.heightAtLevel(level));
      this.stamps.set(level, stamps); this.receiverMs += performance.now() - started;
    }
    return stamps;
  }
  /** One retained surface per pooled stamp; bytes are re-uploaded only when
   * the stamp's shape or resolved light changes, not as it translates. */
  private stampSurface(stamp: ActorShadowStamp): HTMLCanvasElement {
    let surface = this.stampSurfaces.get(stamp);
    if (surface === undefined) {
      if (this.stampSurfaces.size >= STAMP_SURFACE_LIMIT) {
        let oldest: ActorShadowStamp | undefined;
        for (const [key, value] of this.stampSurfaces) if (oldest === undefined || value.used < this.stampSurfaces.get(oldest)!.used) oldest = key;
        const old = this.stampSurfaces.get(oldest!)!; old.canvas.width = old.canvas.height = 0; this.stampSurfaces.delete(oldest!);
      }
      surface = { canvas: document.createElement('canvas'), image: null, revision: -1, used: this.frame };
      this.stampSurfaces.set(stamp, surface);
    }
    surface.used = this.frame;
    if (surface.revision !== stamp.revision) {
      const { canvas } = surface, width = stamp.width, height = stamp.height;
      if (canvas.width < width) canvas.width = width;
      if (canvas.height < height) canvas.height = height;
      if (surface.image === null || surface.image.width !== width || surface.image.height !== height) surface.image = new ImageData(width, height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('world_actor_shadow_surface_unavailable');
      const started = performance.now();
      surface.image.data.set(stamp.pixels.subarray(0, width * height * 4));
      context.putImageData(surface.image, 0, 0);
      surface.revision = stamp.revision; this.uploadMs += performance.now() - started;
    }
    return surface.canvas;
  }
  compositeGround(context: CanvasRenderingContext2D, scale: number, level = terrainBaseDatum(this.terrain)): void {
    // A flattened CPU multiply would conceal the unresolved GPU lighting
    // accuracy gate. Reject before creating/uploading Canvas lighting surfaces.
    if (webglWorldBackend(context) !== undefined) throw new Error('webgl_accuracy_unverified_ground_composite');
    const plane = this.plane(level);
    context.save();
    try {
      context.globalCompositeOperation = 'multiply'; context.imageSmoothingEnabled = true;
      context.drawImage(plane.canvas, (plane.left - this.cameraX) * scale,
        (this.mapper.projectedY(plane.top, level) - this.cameraY) * scale,
        plane.canvas.width * plane.step * scale, plane.canvas.height * plane.step * scale);
      // Quantize exactly as actor sprites do, so the shadow keeps their pixel phase.
      context.imageSmoothingEnabled = false;
      const projection = this.mapper.projectionAtLevel(level);
      for (const stamp of this.actorStamps(level)) {
        context.drawImage(this.stampSurface(stamp), 0, 0, stamp.width, stamp.height,
          Math.round(stamp.anchorX * scale) - Math.round(this.cameraX * scale) + stamp.offsetX * scale,
          Math.round(stamp.anchorY * scale) - Math.round(this.cameraY * scale) + (stamp.offsetY - projection) * scale,
          stamp.width * scale, stamp.height * scale);
      }
    } finally { context.restore(); }
  }
  /** A restrained warm halo makes green ground read as firelit. One reusable
   * native texture; render below actors so flames/metal keep their own shading. */
  compositeFlameGlows(context: CanvasRenderingContext2D, lights: readonly PointLight[], scale: number): void {
    if (!lights.some((light) => light.profile === 'flame')) return;
    if (this.flameGlow === null) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const glow = canvas.getContext('2d');
      if (glow === null) { canvas.width = canvas.height = 0; return; }
      const gradient = glow.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,92,28,0.32)');
      gradient.addColorStop(0.4, 'rgba(255,74,20,0.12)');
      gradient.addColorStop(1, 'rgba(255,62,16,0)');
      glow.fillStyle = gradient; glow.fillRect(0, 0, 64, 64); this.flameGlow = canvas;
    }
    context.save();
    try {
      context.globalCompositeOperation = 'lighter'; context.imageSmoothingEnabled = true;
      for (const light of lights) {
        if (light.profile !== 'flame') continue;
        const radius = Math.min(40, light.radiusTiles * 4);
        context.globalAlpha = Math.min(1, (light.strengthPerMille ?? 1000) / 1000);
        context.drawImage(this.flameGlow, (light.worldX - this.cameraX - radius) * scale,
          (light.worldY - this.cameraY - radius) * scale, radius * 2 * scale, radius * 2 * scale);
      }
    } finally { context.restore(); }
  }
  /** Tint a projected chunk run before its alpha/cutaway composition. Multiplying
   * the destination afterwards would also darken the actor behind a cutaway. */
  groundSource(source: AssetFrameSource, x: number, y: number, level: number,basis?:GroundSpriteBasis): AssetFrameSource {
    const determinant=basis===undefined?1:basis.a*basis.d-basis.b*basis.c;
    if(!Number.isFinite(determinant)||determinant===0)throw new Error('invalid_ground_sprite_basis');
    const target = groundSourceContext();
    if (target !== undefined && webglWorldBackend(target) !== undefined) {
      // GPU fields still carry moving coverage; their stamp path is a follow-up.
      const { left, top, width, height, step } = this.window(level);
      const field = this.scene.rawFieldCached(this.localRevision, left, top, width, height, this.mapper.heightAtLevel(level), step,
        (worldX, worldY) => this.lightmap!.sampleReceiverLight(worldX, this.mapper.projectedY(worldY, level), level));
      return webglFrameSource(target, source, { ground: { field, worldX: x, worldY: y, ...(basis?{basis}:{}) } })!;
    }
    const plane = this.plane(level);
    this.runCanvas ??= document.createElement('canvas');
    const canvas = this.runCanvas;
    if (canvas.width !== source.width || canvas.height !== source.height) { canvas.width = source.width; canvas.height = source.height; }
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('world_ground_surface_unavailable');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over'; context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'multiply'; context.imageSmoothingEnabled = true;
    context.save();
    try {
      if(basis){
        context.setTransform(basis.d/determinant,-basis.b/determinant,-basis.c/determinant,basis.a/determinant,0,0);
      }
      context.drawImage(plane.canvas, plane.left - x, plane.top - y, plane.canvas.width * plane.step, plane.canvas.height * plane.step);
      context.imageSmoothingEnabled = false;
      for (const stamp of this.actorStamps(level)) {
        const stampX = Math.round(stamp.anchorX) + stamp.offsetX - x, stampY = Math.round(stamp.anchorY) + stamp.offsetY - y;
        if (basis === undefined && (stampX >= source.width || stampY >= source.height
          || stampX + stamp.width <= 0 || stampY + stamp.height <= 0)) continue;
        context.drawImage(this.stampSurface(stamp), 0, 0, stamp.width, stamp.height, stampX, stampY, stamp.width, stamp.height);
        renderOperationCounters.groundSourceOperations++;
      }
    } finally {context.restore();}
    context.globalCompositeOperation = 'destination-in'; context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'source-over';
    renderOperationCounters.groundSourceOperations += 3;
    return { image: canvas, x: 0, y: 0, width: source.width, height: source.height };
  }
  get bytes(): number {
    return this.frames.bytes + this.scene.retainedMaskBytes + this.scene.retainedCoverageBytes + this.scene.retainedRasterBytes
      + [...this.uploads.values()].reduce((sum, upload) => sum + upload.canvas.width * upload.canvas.height * 4 + (upload.image?.data.byteLength ?? 0), 0)
      + (this.runCanvas === null ? 0 : this.runCanvas.width * this.runCanvas.height * 4)
      + [...this.stampSurfaces.values()].reduce((sum, surface) => sum + surface.canvas.width * surface.canvas.height * 4 + (surface.image?.data.byteLength ?? 0), 0)
      + (this.flameGlow === null ? 0 : this.flameGlow.width * this.flameGlow.height * 4);
  }
  reset(): void {
    this.receiverMs = this.mergeMs = this.uploadMs = 0;
    this.frames.reset(); this.scene.reset(); this.planes.clear(); this.stamps.clear();
    for (const { canvas } of this.stampSurfaces.values()) canvas.width = canvas.height = 0;
    this.stampSurfaces.clear();
    for (const { canvas } of this.uploads.values()) canvas.width = canvas.height = 0;
    this.uploads.clear();
    if (this.runCanvas !== null) this.runCanvas.width = this.runCanvas.height = 0;
    this.runCanvas = null; this.lightmap = null;
    if (this.flameGlow !== null) this.flameGlow.width = this.flameGlow.height = 0;
    this.flameGlow = null;
  }
}

/** Convert existing optical bodies through the one terrain coordinate mapper.
 * Collision remains unchanged; it supplies contact width, never sprite height. */
export function celestialCastersFromOcclusion(map: LightOcclusionMap | undefined, mapper: LightCoordinateMapper,
  left: number, top: number, right: number, bottom: number): DirectionalCaster[] {
  const result: DirectionalCaster[] = [];
  for (const item of map?.trunkOccluders ?? []) {
    if (item.shadowMode === 'none') continue;
    const mask = item.receiver;
    if (mask === null) continue;
    const level = item.elevationLayer ?? 0;
    const x = item.footX ?? (item.obstacle.left + item.obstacle.right) / (2 * FIXED_UNITS_PER_PIXEL);
    const y = mapper.logicalY(item.footY, level);
    if (x < left - 192 || x > right + 192 || y < top - 192 || y > bottom + 192) continue;
    const caster = groundedSpriteCaster({ owner: lightingOwner(x, y), worldX: x, worldY: y,
      baseHeightSubunits: mapper.heightAtLevel(level), pixelsPerHeightSubunit: mapper.pixelsPerHeightSubunit,
      mask, anchor: [x - mask.left, item.footY - mask.top], contact: item.contactEnabled ?? true,
      footprint: { left: item.obstacle.left / FIXED_UNITS_PER_PIXEL - x,
        right: item.obstacle.right / FIXED_UNITS_PER_PIXEL - x, top: -2, bottom: 1 } });
    if (caster !== null) result.push(caster);
  }
  for (const mask of map?.terrainOccluders ?? []) {
    const level = mask.elevationLayer ?? 0;
    const x = mask.left + mask.width / 2;
    const y = mapper.logicalY(mask.top + mask.height, level);
    if (x < left - 192 || x > right + 192 || y < top - 192 || y > bottom + 192) continue;
    result.push({ owner: terrainLightingOwner(mask), worldX: x, worldY: y,
      baseHeightSubunits: mapper.heightAtLevel(level), heightSubunits: mapper.heightAtLevel(1),
      footprint: { left: -mask.width / 2, right: mask.width / 2, top: -16, bottom: 0 }, contact: false });
  }
  return result;
}
