import { ReviewAtlasPages } from './review-atlas-pages.js';
import { type LoadedAsset, type BuiltAssetRecord, selectAtlasFrame } from '@orchard/ui';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { drawAuthoredOverworldObject } from './overworld-art.js';
import { ambientAtProgress, LANTERN_LIGHT, TileLightmap } from './lighting.js';
import { createLightOcclusionMap, createSpriteLightOccluder, resetSpriteLightMasks } from './light-occlusion.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { compositeBasicLighting } from './lighting-quality.js';
import { setWorldAssetPresentation } from './world-asset-presentation.js';
import type { TerrainArray } from './terrain.js';

export interface LightingReviewAsset {
  readonly name: string; readonly record: BuiltAssetRecord; readonly png: string; readonly omitPng?: string;
}

/** Ambient-only art study. The direction vectors are recorded for the next
 * shadow milestone; these panels do not claim to render celestial shadows. */
export async function runSeasonalLightingReview(inputs: readonly LightingReviewAsset[]) {
  const assets: LoadedAsset[] = [];
  for (const input of inputs) {
    const image = new Image(); image.src = input.png; await image.decode();
    const record = input.record;
    assets.push({ ...record, name: input.name, image, atlasRevision: 58,
      metadata: { image: input.name, animations: record.animations, variants: record.variants, states: record.states } });
  }
  const board = document.createElement('canvas'); board.width = 1280; board.height = 900;
  const output = board.getContext('2d')!;
  output.fillStyle = '#171923'; output.fillRect(0, 0, board.width, board.height);
  output.fillStyle = '#eeeeee'; output.font = '16px monospace';
  output.fillText('SEASONAL AMBIENT STUDY — ORIGINAL ART — CELESTIAL SHADOW PROJECTION PENDING', 12, 24);
  const panel = document.createElement('canvas'); panel.width = 320; panel.height = 192;
  const context = panel.getContext('2d')!;
  const samples = [];
  for (const [row, season] of ['spring', 'summer', 'autumn', 'winter'].entries()) {
    for (const [column, clockHours] of [6.5, 12, 18.5, 0].entries()) {
      const sky = celestialLightingAtCalendar({ continuousDay: row * 7 + 3.5, clockHours, lunarProgress: 0, lunarIllumination: 1 });
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#71934c'; context.fillRect(0, 0, 320, 192);
      context.fillStyle = '#819f58';
      for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if ((x + y) % 2 === 0) context.fillRect(x * 16, y * 16, 16, 16);
      for (const [name, x, y] of [
        ['tree_cf_oak_mature', 64, 108], ['tree_cf_oak_stump', 115, 108], ['resource_cf_rock_stone', 150, 108],
        ['prop_basket_press', 208, 154], ['avatar_cf_farmer', 110, 154], ['prop_cf_cave_doorway', 260, 108],
      ] as const) {
        drawAuthoredOverworldObject(context, assets.find((asset) => asset.name === name)!, 'base', 0, x, y, 0, 0, 1);
      }
      compositeBasicLighting(context, 320, 192, sky.combined);
      const x = column * 320, y = 36 + row * 216;
      output.fillStyle = '#eeeeee'; output.font = '12px monospace';
      output.fillText(`${season.toUpperCase()} ${clockHours === 0 ? 'FULL MOON' : `${Math.floor(clockHours)}:${clockHours % 1 ? '30' : '00'}`}`, x + 8, y + 16);
      output.drawImage(panel, x, y + 24);
      samples.push({ season, clockHours, sky });
    }
  }
  return { image: board.toDataURL(), samples };
}

/** Deterministic local-only scene using the actual world sprite helper and
 * lightmap. It never connects to the world authority or alters a player's state. */
export async function runLightingReview(inputs: readonly LightingReviewAsset[], progress: (stage: string) => void = () => {}) {
  progress('loading');
  const assets = new Map<string, LoadedAsset>();
  for (const input of inputs) {
    const image = new Image(); image.src = input.png; await image.decode();
    const record = input.record;
    assets.set(input.name, { ...record, name: input.name, image, atlasRevision: 58,
      metadata: { image: input.name, animations: record.animations, variants: record.variants, states: record.states } });
  }
  const width = 320, height = 192, zoom = 2;
  const canvas = document.createElement('canvas'); canvas.width = width * zoom; canvas.height = height * zoom;
  const context = canvas.getContext('2d')!;
  const terrain: TerrainArray = { spaceId: 58, seed: 58, version: 1, width: 20, height: 12,
    biomes: new Uint8Array(240), blocked: Array<boolean>(240).fill(false), horseJumpableTerrain: Array<boolean>(240).fill(false),
    elevations: new Int16Array(240), dirtCliffRoles: new Uint8Array(240), dirtTerraces: new Uint8Array(240), projectionStyle: 'interior', baseDatum: 0 };
  const placements = [
    ['tile_cf_water', 250, 80], ['tile_cf_stone_cliff_variants', 238, 116], ['prop_cf_cave_doorway', 260, 116],
    ['tree_cf_oak_mature', 70, 112], ['tree_cf_oak_stump', 125, 112], ['resource_cf_rock_stone', 174, 112],
    ['prop_basket_press', 208, 154], ['avatar_cf_farmer', 110, 154], ['tool_cf_lantern_idle', 110, 154],
  ] as const;
  const tree = assets.get('tree_cf_oak_mature')!;
  const pages = new ReviewAtlasPages(inputs);
  await pages.prepare();
  const modes = ['legacy-disabled', 'legacy-classic', 'legacy-unified', 'basic-new-moon', 'dynamic-full-moon', 'omission-review'] as const;
  const board = document.createElement('canvas'); board.width = canvas.width * 2; board.height = (canvas.height + 24) * 3;
  const boardContext = board.getContext('2d')!;
  const measurements = [];
  for (const [index, mode] of modes.entries()) {
    progress(mode);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    resetSpriteLightMasks();
    const map = new TileLightmap();
    const dynamic = mode === 'legacy-classic' || mode === 'legacy-unified' || mode === 'dynamic-full-moon';
    const basic = mode === 'basic-new-moon';
    let maskCalls = 0;
    const occlusion = basic ? undefined : createLightOcclusionMap(terrain, [], [], [{
      obstacle: { left: 66 * FIXED_UNITS_PER_PIXEL, top: 108 * FIXED_UNITS_PER_PIXEL, right: 74 * FIXED_UNITS_PER_PIXEL, bottom: 112 * FIXED_UNITS_PER_PIXEL },
      receiver: (maskCalls++, createSpriteLightOccluder(tree, 'base', 0, 70, 112)), footX: 70, footY: 112,
      shadowMode: 'column', receiverFacing: 'south',
    }]);
    const lights = basic ? [] : [{ worldX: 110, worldY: 142, receiverDirectionWorldY: 154, radiusTiles: 9, color: LANTERN_LIGHT }];
    const ambient = mode === 'dynamic-full-moon'
      ? celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 0, lunarProgress: 0, lunarIllumination: 1 }).combined
      : basic ? celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 0, lunarProgress: 0.5, lunarIllumination: 0 }).combined
        : ambientAtProgress(0.75);
    const samples: number[] = [];
    for (let sample = 0; sample < 120; sample++) {
      if (sample % 10 === 0) { progress(`${mode}:${sample}`); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#71934c'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#819f58';
      for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if ((x + y) % 2 === 0) context.fillRect(x * 32, y * 32, 32, 32);
      const start = performance.now();
      if (dynamic) map.prepare(terrain, 0, 0, zoom, canvas.width, canvas.height, ambient, lights, occlusion, mode === 'legacy-classic' ? 'classic' : 'unified');
      setWorldAssetPresentation(context, pages, mode === 'omission-review' ? 'omit-baked-shadow' : 'original');
      for (const [name, x, y] of placements) {
        const asset = assets.get(name)!;
        context.save();
        if (dynamic && mode !== 'legacy-classic') {
          const brightness = map.southFaceBrightness(x, y, ambient);
          if (brightness < 0.995) context.filter = `brightness(${brightness * 100}%)`;
        }
        drawAuthoredOverworldObject(context, asset, 'base', 0, x, y, 0, 0, zoom);
        context.restore();
      }
      const beforeComposite = performance.now();
      if (dynamic) map.composite(context, 0, 0, zoom);
      if (basic) compositeBasicLighting(context, canvas.width, canvas.height, ambient);
      if (sample >= 20) samples.push(performance.now() - beforeComposite);
      if (sample === 119) {
        const x = (index % 2) * canvas.width, y = Math.floor(index / 2) * (canvas.height + 24);
        boardContext.fillStyle = '#171923'; boardContext.fillRect(x, y, canvas.width, canvas.height + 24);
        boardContext.fillStyle = '#eeeeee'; boardContext.font = '14px monospace'; boardContext.fillText(mode.toUpperCase(), x + 8, y + 17);
        boardContext.drawImage(canvas, x, y + 24);
        samples.sort((a, b) => a - b);
        measurements.push({ mode, maskCalls, pointLights: lights.length, fieldRebuilds: map.fieldRebuilds,
          floodTexelsVisited: map.floodTexelsVisited, retainedSurfaceBytes: map.retainedSurfaceBytes,
          compositeP95Ms: samples[95], finalLightingAndPainterMs: beforeComposite - start });
      }
    }
    map.reset();
    if (map.retainedSurfaceBytes !== 0) throw new Error('Lightmap reset retained surfaces');
  }
  // Verify exact omission in the browser independently of the lighting multiply.
  const original = { ...selectAtlasFrame(tree.metadata, 'base')!, image: tree.image };
  const omitted = { ...original, image: pages.source(tree) };
  const probe = document.createElement('canvas'); probe.width = original.width; probe.height = original.height;
  const probeContext = probe.getContext('2d', { willReadFrequently: true })!;
  probeContext.drawImage(original.image, original.x, original.y, original.width, original.height, 0, 0, original.width, original.height);
  const before = probeContext.getImageData(0, 0, probe.width, probe.height).data;
  probeContext.clearRect(0, 0, probe.width, probe.height); probeContext.drawImage(omitted.image, omitted.x, omitted.y, omitted.width, omitted.height, 0, 0, omitted.width, omitted.height);
  const after = probeContext.getImageData(0, 0, probe.width, probe.height).data;
  let removed = 0, changedBody = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i + 3] !== 0 && after[i + 3] === 0) removed++;
    else if ([0, 1, 2, 3].some((c) => before[i + c] !== after[i + c])) changedBody++;
  }
  const pageEvidence = { bytes: pages.bytes, removed, changedBody };
  pages.reset(); setWorldAssetPresentation(context);
  return { image: board.toDataURL(), measurements, omitPages: pageEvidence, omitBytesAfterReset: pages.bytes,
    fixture: 'local deterministic world-draw/lightmap fixture; no authenticated gameplay or live deployment', userAgent: navigator.userAgent };
}
