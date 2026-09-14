import { ReviewAtlasPages } from './review-atlas-pages.js';
import { type LoadedAsset } from '@orchard/ui';
import type { LightingReviewAsset } from './lighting-review.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { CelestialReceiverScene } from './receiver-lighting.js';
import { createSpriteLightOccluder } from './light-occlusion.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import { groundedSpriteCaster, type DirectionalCaster } from './directional-shadows.js';
import { ReceiverFrameCache, withWorldReceiverLight } from './receiver-frame-source.js';
import { setWorldAssetPresentation } from './world-asset-presentation.js';
import { drawAuthoredOverworldObject } from './overworld-art.js';
import { compositeBasicLighting } from './lighting-quality.js';
import { LANTERN_LIGHT, TileLightmap } from './lighting.js';
import type { TerrainArray } from './terrain.js';

/** Local fixture for the combined shadow + omission + receiver path. The
 * stepped platform is explicit test geometry, not a gameplay map snapshot. */
export async function runCelestialShadowReview(inputs: readonly LightingReviewAsset[]) {
  const assets = new Map<string, LoadedAsset>();
  for (const input of inputs) {
    const image = new Image(); image.src = input.png; await image.decode();
    const r = input.record;
    assets.set(input.name, { ...r, image, name: input.name, atlasRevision: 58,
      metadata: { image: input.name, animations: r.animations, variants: r.variants, states: r.states } });
  }
  const terrain = { spaceId: 58, seed: 58, version: 1, width: 20, height: 12,
    biomes: new Uint8Array(240), blocked: Array<boolean>(240).fill(false), horseJumpableTerrain: Array<boolean>(240).fill(false),
    elevations: new Int16Array(240), dirtCliffRoles: new Uint8Array(240), dirtTerraces: new Uint8Array(240), projectionStyle: 'interior', baseDatum: 0 } as TerrainArray;
  const mapper = new LightCoordinateMapper(terrain);
  const frames = new ReviewAtlasPages(inputs), tints = new ReceiverFrameCache();
  const objects = [
    { name: 'tree_cf_oak_mature', x: 72, y: 116, level: 0, owner: 'oak' },
    { name: 'tree_cf_oak_stump', x: 132, y: 116, level: 0, owner: 'stump' },
    { name: 'resource_cf_rock_stone', x: 224, y: 112, level: 1, owner: 'upper-rock' },
    { name: 'prop_basket_press', x: 206, y: 165, level: 0, owner: 'press' },
    { name: 'avatar_cf_farmer', x: 115, y: 157, level: 0, owner: 'player' },
  ];
  const casters: DirectionalCaster[] = objects.map((object) => {
    const asset = assets.get(object.name)!;
    const mask = createSpriteLightOccluder(asset, 'base', 0, object.x, object.y)!;
    return groundedSpriteCaster({ owner: object.owner, worldX: object.x, worldY: object.y,
      baseHeightSubunits: mapper.heightAtLevel(object.level), pixelsPerHeightSubunit: mapper.pixelsPerHeightSubunit,
      mask, anchor: asset.anchor, footprint: { left: -4, top: -3, right: 4, bottom: 1 }, contact: true })!;
  });
  casters.push({ owner: 'terrace', worldX: 224, worldY: 112, baseHeightSubunits: 0, heightSubunits: 4,
    footprint: { left: -32, top: -24, right: 32, bottom: 24 }, contact: false });
  const scene = new CelestialReceiverScene(mapper.pixelsPerHeightSubunit);
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 384;
  const context = canvas.getContext('2d')!;
  const board = document.createElement('canvas'); board.width = 1920; board.height = 1260;
  const output = board.getContext('2d')!;
  const rasterCanvas = document.createElement('canvas'); rasterCanvas.width = 80; rasterCanvas.height = 48;
  const rasterContext = rasterCanvas.getContext('2d')!;
  const lightmap = new TileLightmap();
  const panels = [
    { hour: 7, label: 'SUNRISE — LONG WEST SHADOWS' }, { hour: 12, label: 'NOON — SHORT NORTH SHADOWS' }, { hour: 17, label: 'SUNSET — LONG EAST SHADOWS' },
    { hour: 20, label: 'MOONRISE — FULL MOON' }, { hour: 0, label: 'MIDNIGHT — FULL MOON' }, { hour: 4, label: 'MOONSET — FULL MOON' },
    { hour: 0, label: 'MOON SHADOW + WARM LANTERN', lantern: true }, { hour: 0, label: 'BASIC — ORIGINAL BAKED SHADOWS', basic: true },
    { hour: 0, label: 'NEW MOON — CONTACT ONLY', newMoon: true },
  ];
  const evidence = [];
  for (const [index, panel] of panels.entries()) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
      channel.port2.postMessage(null);
    });
    const sky = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: panel.hour, lunarProgress: panel.newMoon ? 0.5 : 0, lunarIllumination: panel.newMoon ? 0 : 1 });
    if (panel.basic) { frames.reset(); tints.reset(); scene.reset(); lightmap.reset(); }
    else {
      await frames.prepare();
      scene.prepare(sky, casters);
      await scene.prepareHeights([0, 4, ...objects.map((object) => mapper.heightAtLevel(object.level)
        + Math.round(mapper.heightForPixels(assets.get(object.name)!.anchor[1] / 2)))]);
    }
    const lights = panel.lantern ? [{ worldX: 45, worldY: 98, radiusTiles: 5, color: LANTERN_LIGHT, elevationLayer: 0 }] : [];
    if (!panel.basic) lightmap.prepare(terrain, 0, 0, 2, 640, 384, { r: 0, g: 0, b: 0 }, lights, null, 'unified', true);
    const started = performance.now();
    const floor = panel.basic ? null : scene.rasterizeCached(lightmap.fieldRebuilds, 0, 0, 80, 48, 0, 4, (x, y) => lightmap.sampleReceiverLight(x, y, 0));
    const upper = panel.basic ? null : scene.rasterizeCached(lightmap.fieldRebuilds, 0, 0, 80, 48, 4, 4, (x, y) => lightmap.sampleReceiverLight(x, mapper.projectedY(y, 1), 1));
    const rasterMs = performance.now() - started;
    const multiply = (raster: NonNullable<typeof floor>, projection: number) => {
      rasterContext.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
      context.save(); context.imageSmoothingEnabled = true; context.globalCompositeOperation = 'multiply';
      context.drawImage(rasterCanvas, 0, -projection * 2, 640, 384); context.restore();
    };
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#71934c'; context.fillRect(0, 0, 640, 384);
    context.fillStyle = '#819f58';
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if ((x + y) % 2 === 0) context.fillRect(x * 32, y * 32, 32, 32);
    if (floor !== null) multiply(floor, 0);
    const projection = mapper.projectionAtLevel(1);
    context.fillStyle = '#8a7c6c'; context.fillRect(384, (136 - projection) * 2, 128, projection * 2);
    if (!panel.basic) {
      const face = scene.sample({ worldX: 224, worldY: 136, heightSubunits: 2, receiver: 'south', owner: 'terrace' }).combined;
      context.save(); context.beginPath(); context.rect(384, (136 - projection) * 2, 128, projection * 2); context.clip();
      compositeBasicLighting(context, 640, 384, face); context.restore();
    }
    context.fillStyle = '#c5b182'; context.fillRect(384, (88 - projection) * 2, 128, 96);
    if (upper !== null) {
      context.save(); context.beginPath(); context.rect(384, (88 - projection) * 2, 128, 96); context.clip(); multiply(upper, projection); context.restore();
    }
    setWorldAssetPresentation(context, frames, panel.basic ? 'original' : 'omit-baked-shadow');
    for (const object of objects) {
      const asset = assets.get(object.name)!;
      const draw = () => drawAuthoredOverworldObject(context, asset, 'base', 0, object.x, mapper.projectedY(object.y, object.level), 0, 0, 2);
      if (panel.basic) draw();
      else {
        const receiver = { worldX: object.x, worldY: object.y, heightSubunits: mapper.heightAtLevel(object.level) + Math.round(mapper.heightForPixels(asset.anchor[1] / 2)), receiver: 'south' as const, owner: object.owner };
        const local = lightmap.sampleReceiverLight(object.x, mapper.projectedY(object.y, object.level), object.level, 'south');
        withWorldReceiverLight(context, tints, scene.sample(receiver, local).combined, draw);
      }
    }
    if (panel.basic) compositeBasicLighting(context, 640, 384, sky.combined);
    const x = index % 3 * 640, y = Math.floor(index / 3) * 420;
    output.fillStyle = '#111521'; output.fillRect(x, y, 640, 420);
    output.fillStyle = '#d7e3ff'; output.font = '17px monospace'; output.fillText(panel.label, x + 12, y + 25);
    output.drawImage(canvas, x, y + 36);
    evidence.push({ ...panel, sky, rasterMs, shadowCacheBytes: scene.cache.bytes, shadowBuilds: scene.cache.builds, tintedFrameBytes: tints.bytes,
      omitPageBytes: frames.bytes, receiverRasterBytes: scene.retainedRasterBytes, retainedMaskBytes: scene.retainedMaskBytes });
  }
  const image = board.toDataURL();
  frames.reset(); tints.reset(); scene.reset(); lightmap.reset(); setWorldAssetPresentation(context);
  return { image, evidence, releasedBytes: { omitPages: frames.bytes, tints: tints.bytes, shadows: scene.cache.bytes, lightmap: lightmap.retainedSurfaceBytes },
    fixture: 'local combined renderer fixture with synthetic stepped platform; no gameplay deployment', userAgent: navigator.userAgent };
}

/** Measures cold coverage, resident-field lookup and local RGB re-merge
 * separately. It does not claim whole-game GPU or low-end device performance. */
export async function benchmarkCelestialShadows(inputs: readonly LightingReviewAsset[]) {
  const input = inputs.find((asset) => asset.name === 'tree_cf_oak_mature')!;
  const image = new Image(); image.src = input.png; await image.decode();
  const r = input.record;
  const asset: LoadedAsset = { ...r, image, name: input.name, atlasRevision: 58,
    metadata: { image: input.name, animations: r.animations, variants: r.variants, states: r.states } };
  const mask = createSpriteLightOccluder(asset, 'base', 0, 0, 0)!;
  const casters = Array.from({ length: 200 }, (_, i) => groundedSpriteCaster({ owner: `oak-${i}`,
    worldX: 16 + i % 20 * 32, worldY: 32 + Math.floor(i / 20) * 32,
    baseHeightSubunits: 0, pixelsPerHeightSubunit: 4, anchor: asset.anchor, mask,
    footprint: { left: -4, top: -3, right: 4, bottom: 1 }, contact: true })!);
  const scene = new CelestialReceiverScene(4);
  scene.prepare(celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 20, lunarProgress: 0, lunarIllumination: 1 }), casters);
  await scene.prepareHeights([0]);
  const coldStart = performance.now();
  const initial = scene.rasterizeCached('steady', 0, 0, 160, 96, 0, 4);
  const coldCoverageMs = performance.now() - coldStart;
  const buildsBefore = scene.cache.builds;
  const lookup: number[] = [], merge: number[] = [];
  const local = { r: 140, g: 95, b: 40 };
  for (let i = 0; i < 120; i++) {
    if (i % 8 === 0) await new Promise<void>((resolve) => {
      const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); }; channel.port2.postMessage(null);
    });
    const a = performance.now();
    if (scene.rasterizeCached('steady', 0, 0, 160, 96, 0, 4) !== initial) throw new Error('resident_field_rebuilt');
    const b = performance.now();
    // Same shadow coverage; changing local-light revision must only re-merge RGB.
    scene.rasterizeCached(`local-${i}`, 0, 0, 160, 96, 0, 4, () => local);
    const c = performance.now();
    if (i >= 20) { lookup.push(b - a); merge.push(c - b); }
  }
  lookup.sort((a, b) => a - b); merge.sort((a, b) => a - b);
  const result = { casters: 200, worldWidth: 640, worldHeight: 384, lightTexels: 160 * 96,
    coldCoverageMs, cachedLookupP95Ms: lookup[95], localRgbRemergeP95Ms: merge[95],
    steadyGeometryBuilds: scene.cache.builds - buildsBefore, geometryCacheBytes: scene.cache.bytes,
    receiverCoverageBytes: scene.retainedCoverageBytes, receiverRasterBytes: scene.retainedRasterBytes,
    userAgent: navigator.userAgent };
  scene.reset(); return result;
}
