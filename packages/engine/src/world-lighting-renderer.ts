import { renderOperationCounters, AssetFrameSourceCache, type AssetFrameSource, type LoadedAsset } from '@orchard/ui';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import type { CelestialLighting } from './celestial-lighting.js';
import { groundedSpriteCaster, type DirectionalCaster } from './directional-shadows.js';
import type { LightOcclusionMap } from './light-occlusion.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import type { LightingReceiverClass } from './lighting-types.js';
import type { TileLightmap } from './lighting.js';
import type { PointLight } from './lighting.js';
import { ReceiverFrameCache, withWorldReceiverLight } from './receiver-frame-source.js';
import { withGroundSpriteSource } from './ground-light-source.js';
import { CelestialReceiverScene } from './receiver-lighting.js';
import { terrainBaseDatum, type TerrainArray } from './terrain.js';

export const lightingOwner = (x: number, y: number): string => `foot:${Math.round(x)}:${Math.round(y)}`;

/** Own the bounded world frame cache; bulk preparation is available for previews.
 * No Canvas allocation or mask work takes place when Basic is requested. */
export class WorldShadowAssets {
  readonly cache = new AssetFrameSourceCache(8 * 1024 * 1024, undefined, () => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  }));
  private assets = new Set<LoadedAsset>();
  private generation = 0;
  private ready = false;
  private initialized = false;
  failure: string | null = null;
  beginFrame(): void { this.cache.beginFrame(); }
  prepare(assets: readonly LoadedAsset[]): boolean {
    if (this.initialized && assets.length === this.assets.size && assets.every((asset) => this.assets.has(asset))) return this.ready;
    this.initialized = true;
    this.assets = new Set(assets); this.ready = false; this.failure = null;
    const generation = ++this.generation;
    const requests = assets.flatMap((asset) => [
      ...Object.values(asset.metadata.animations).flat(),
      ...Object.values(asset.metadata.variants ?? {}).flat(),
      ...Object.values(asset.metadata.states ?? {}),
    ].map((frame) => ({ asset, frame })));
    void this.cache.prepareVisible(requests).then((result) => {
      if (generation !== this.generation) return;
      this.ready = result === 'ready';
      this.failure = result === 'ready' || result === 'cancelled' ? null : result;
    }).catch((error: unknown) => {
      if (generation === this.generation) this.failure = String(error);
    });
    return false;
  }
  reset(): void {
    this.generation++; this.assets.clear();
    this.ready = false; this.initialized = false; this.failure = null; this.cache.reset();
  }
}

interface Plane { readonly canvas: HTMLCanvasElement; readonly left: number; readonly top: number; readonly step: number }

/** Receiver lighting in the actual world painter. Ground planes are resolved at
 * four game pixels and smoothly upsampled; artwork stays nearest-neighbour.
 * Every body receives its own RGB, so a shadow behind it cannot blacken it. */
export class WorldLightingRenderer {
  readonly mapper: LightCoordinateMapper;
  readonly scene: CelestialReceiverScene;
  readonly frames = new ReceiverFrameCache();
  private planes = new Map<number, Plane>();
  private uploads = new Map<number, HTMLCanvasElement>();
  private runCanvas: HTMLCanvasElement | null = null;
  private flameGlow: HTMLCanvasElement | null = null;
  private casters: readonly DirectionalCaster[] = [];
  private signature = '';
  private placementSignature = '';
  private cameraX = 0;
  private cameraY = 0;
  private width = 0;
  private height = 0;
  private lightmap: TileLightmap | null = null;
  constructor(readonly terrain: TerrainArray) {
    this.mapper = new LightCoordinateMapper(terrain);
    this.scene = new CelestialReceiverScene(this.mapper.pixelsPerHeightSubunit);
  }
  begin(sky: CelestialLighting, casters: readonly DirectionalCaster[], signature: string, lightmap: TileLightmap,
    cameraX: number, cameraY: number, width: number, height: number): void {
    // Geometry/owner keys intentionally omit subpixel position. Presentation
    // must nevertheless consume the latest interpolated feet on every move.
    const placement = casters.map((caster) => `${caster.worldX}:${caster.worldY}`).join(';');
    if (signature !== this.signature || placement !== this.placementSignature) {
      this.casters = casters; this.signature = signature; this.placementSignature = placement;
    }
    this.scene.prepare(sky, this.casters);
    this.lightmap = lightmap; this.cameraX = cameraX; this.cameraY = cameraY; this.width = width; this.height = height;
    this.planes.clear();
  }
  drawReceiver(context: CanvasRenderingContext2D, x: number, y: number, level: number,
    receiver: LightingReceiverClass, draw: () => void): void {
    if (receiver === 'flat') {
      withGroundSpriteSource(context, (source, left, top) => this.groundSource(source, left, top, level), draw);
      return;
    }
    const local = this.lightmap!.sampleReceiverLight(x, this.mapper.projectedY(y, level), level, receiver);
    const color = this.scene.sample({ worldX: x, worldY: y, heightSubunits: this.mapper.heightAtLevel(level),
      receiver, owner: lightingOwner(x, y) }, local).combined;
    withWorldReceiverLight(context, this.frames, color, draw);
  }
  private plane(level: number): Plane {
    const existing = this.planes.get(level);
    if (existing !== undefined) return existing;
    if (this.planes.size >= 8) throw new Error('world_receiver_plane_budget_exceeded');
    const step = 4;
    // World-aligned raster avoids swimming when the camera moves a fraction.
    const left = Math.floor(this.cameraX / step) * step - step;
    const top = Math.floor(this.mapper.logicalY(this.cameraY, level) / step) * step - step;
    const width = Math.ceil(this.width / step) + 3, height = Math.ceil(this.height / step) + 3;
    const raster = this.scene.rasterize(left, top, width, height, this.mapper.heightAtLevel(level), step,
      (x, y) => this.lightmap!.sampleReceiverLight(x, this.mapper.projectedY(y, level), level));
    let canvas = this.uploads.get(level);
    if (canvas === undefined) {
      // Retain only a bounded number of upload surfaces across terrain changes.
      if (this.uploads.size >= 8) {
        const first = this.uploads.keys().next().value!;
        const old = this.uploads.get(first)!; old.width = old.height = 0; this.uploads.delete(first);
      }
      canvas = document.createElement('canvas'); this.uploads.set(level, canvas);
    }
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('world_receiver_surface_unavailable');
    context.putImageData(new ImageData(raster.pixels, width, height), 0, 0);
    const plane = { canvas, left, top, step }; this.planes.set(level, plane); return plane;
  }
  compositeGround(context: CanvasRenderingContext2D, scale: number, level = terrainBaseDatum(this.terrain)): void {
    const plane = this.plane(level);
    context.save();
    try {
      context.globalCompositeOperation = 'multiply'; context.imageSmoothingEnabled = true;
      context.drawImage(plane.canvas, (plane.left - this.cameraX) * scale,
        (this.mapper.projectedY(plane.top, level) - this.cameraY) * scale,
        plane.canvas.width * plane.step * scale, plane.canvas.height * plane.step * scale);
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
  groundSource(source: AssetFrameSource, x: number, y: number, level: number): AssetFrameSource {
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
    context.drawImage(plane.canvas, plane.left - x, plane.top - y, plane.canvas.width * plane.step, plane.canvas.height * plane.step);
    context.globalCompositeOperation = 'destination-in'; context.imageSmoothingEnabled = false;
    context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = 'source-over';
    renderOperationCounters.groundSourceOperations += 3;
    return { image: canvas, x: 0, y: 0, width: source.width, height: source.height };
  }
  get bytes(): number {
    return this.frames.bytes + this.scene.retainedMaskBytes + this.scene.retainedCoverageBytes + this.scene.retainedRasterBytes
      + [...this.uploads.values()].reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0)
      + (this.runCanvas === null ? 0 : this.runCanvas.width * this.runCanvas.height * 4)
      + (this.flameGlow === null ? 0 : this.flameGlow.width * this.flameGlow.height * 4);
  }
  reset(): void {
    this.frames.reset(); this.scene.reset(); this.planes.clear(); this.casters = []; this.signature = ''; this.placementSignature = '';
    for (const canvas of this.uploads.values()) canvas.width = canvas.height = 0;
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
    const mask = item.receiver;
    if (mask === null) continue;
    const level = item.elevationLayer ?? 0;
    const x = item.footX ?? (item.obstacle.left + item.obstacle.right) / (2 * FIXED_UNITS_PER_PIXEL);
    const y = mapper.logicalY(item.footY, level);
    if (x < left - 192 || x > right + 192 || y < top - 192 || y > bottom + 192) continue;
    const caster = groundedSpriteCaster({ owner: lightingOwner(x, y), worldX: x, worldY: y,
      baseHeightSubunits: mapper.heightAtLevel(level), pixelsPerHeightSubunit: mapper.pixelsPerHeightSubunit,
      mask, anchor: [x - mask.left, item.footY - mask.top], contact: true,
      footprint: { left: item.obstacle.left / FIXED_UNITS_PER_PIXEL - x,
        right: item.obstacle.right / FIXED_UNITS_PER_PIXEL - x, top: -2, bottom: 1 } });
    if (caster !== null) result.push(caster);
  }
  for (const mask of map?.terrainOccluders ?? []) {
    const level = mask.elevationLayer ?? 0;
    const x = mask.left + mask.width / 2;
    const y = mapper.logicalY(mask.top + mask.height, level);
    if (x < left - 192 || x > right + 192 || y < top - 192 || y > bottom + 192) continue;
    result.push({ owner: `terrain:${x}:${y}:${level}`, worldX: x, worldY: y,
      baseHeightSubunits: mapper.heightAtLevel(level), heightSubunits: mapper.heightAtLevel(1),
      footprint: { left: -mask.width / 2, right: mask.width / 2, top: -16, bottom: 0 }, contact: false });
  }
  return result;
}
