// planTerrain: the exact tile draws the game makes for a small terrain layout.
//
// It runs the real engine path Studio uses (GroundChunkCache for flat and
// raised ground, then the raised-terrain depth queue sorted by
// sortWorldDepthItems) against a recording canvas, so cliff rims, insets,
// projected wall faces, foot rows, raised surfaces and stairs come out exactly
// as the game paints them, without a second copy of the rules. The wiki's live
// tile layouts load a browser bundle of this file (scripts/build-terrain-plan.mjs).
//
// Frame numbers are indexes into each asset's base frames (the same order as
// the terrain catalogue's frameIds): fake source rectangles encode the index as
// x = frame * FRAME_STRIDE, so no reverse atlas lookup is needed.
import { createEmptyMapDocument, expandStairRun, mapCellKey, rampPlacementFindings, stairRunValid, type MapDocumentV2, type RampPlacementFinding, type StairRun } from '../packages/sim/src/index.js';
import type { EmptyMapOptions } from '../packages/sim/src/terrain-lab.js';
import { terrainArrayForMapDocument } from '../packages/engine/src/editor-terrain.js';
import { GroundChunkCache } from '../packages/engine/src/ground-cache.js';
import { MAP_EDITOR_ASSET_NAMES } from '../packages/engine/src/overworld-art.js';
import { enqueueRaisedTerrainDepth } from '../packages/engine/src/raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from '../packages/engine/src/renderer.js';

type FrameSize = { width: number; height: number };
/** The atlas meta fields planTerrain needs for one asset (atlas_<category>.meta.json). */
export interface TerrainPlanAtlasAsset {
  anchor: [number, number];
  variants?: Record<string, FrameSize[]>;
  animations?: Record<string, FrameSize[]>;
  states?: Record<string, FrameSize | FrameSize[]>;
}
export interface TerrainPlanCell { x: number; y: number; cliffFamily?: string; surfaceFamily?: string; surface?: string }
export interface TerrainPlanInput {
  width: number;
  height: number;
  /** [y][x] contour level; 0 is the base ground. */
  heights: number[][];
  /** Map defaults (cliff family also sets the per-level projection). */
  cliffFamily?: string;
  surfaceFamily?: string;
  cells?: TerrainPlanCell[];
  /** North/up runs, at least two lanes wide: x, y is the bottom-left lower tile. */
  stairRuns?: StairRun[];
  atlas: Record<string, TerrainPlanAtlasAsset>;
}
/** One sprite draw in paint order. x, y are the sprite's top-left in map pixels
 * (anchor and height projection applied; raised rows can be negative). */
export interface TerrainPlanDraw {
  assetId: string;
  frame: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pass: 'ground' | 'depth';
  /** Depth-queue key, e.g. "0-terrain:1:face:5:3" (level, part, row, column). */
  tie?: string;
  /** Present when only part of the sprite is painted (a raised ground strip
   * copied from a pre-drawn chunk): the visible rectangle in map pixels. */
  clip?: { x: number; y: number; w: number; h: number };
}

export const FRAME_STRIDE = 4096;

function baseFrames(meta: TerrainPlanAtlasAsset): FrameSize[] {
  const state = meta.states?.base;
  return meta.animations?.base ?? meta.variants?.base ?? (state ? (Array.isArray(state) ? state : [state]) : []);
}

function recordingArt(atlas: TerrainPlanInput['atlas']) {
  const cache = new Map<string, unknown>();
  const asset = (name: string) => {
    if (cache.has(name)) return cache.get(name);
    const meta = atlas[name];
    const loaded = meta ? {
      name,
      image: { planAsset: name },
      anchor: meta.anchor,
      metadata: { animations: {}, variants: { base: baseFrames(meta).map((f, i) => ({ x: i * FRAME_STRIDE, y: 0, width: f.width, height: f.height, durationTicks: 0 })) } },
    } : undefined;
    cache.set(name, loaded);
    return loaded;
  };
  const named = MAP_EDITOR_ASSET_NAMES as Record<string, string>;
  const terrainAssets = new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? asset(key) : undefined) });
  return new Proxy({ terrainAssets } as Record<string, unknown>, {
    get: (target, key) => (key === 'terrainAssets' ? target.terrainAssets
      : typeof key === 'string' && named[key] ? asset(named[key]) : undefined),
  });
}

interface Recorded { image: RecordedImage; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number; tie?: string }
type RecordedImage = { planAsset?: string; ctx?: RecordingContext; width?: number; height?: number };

class RecordingContext {
  draws: Recorded[] = [];
  tie?: string;
  imageSmoothingEnabled = false;
  fillStyle: unknown = '';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  private tx = 0;
  private ty = 0;
  private readonly stack: [number, number][] = [];
  save() { this.stack.push([this.tx, this.ty]); }
  restore() { [this.tx, this.ty] = this.stack.pop() ?? [0, 0]; }
  translate(x: number, y: number) { this.tx += x; this.ty += y; }
  /** Identity: translations are applied to recorded draws instead. */
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  setTransform() {}
  fillRect() {}
  clearRect() {}
  clip() {}
  beginPath() {}
  rect() {}
  drawImage(image: RecordedImage, ...n: number[]) {
    const [sx, sy, sw, sh, dx, dy, dw, dh] = n.length === 8 ? n
      : n.length === 4 ? [0, 0, image.width ?? 0, image.height ?? 0, n[0], n[1], n[2], n[3]]
        : [0, 0, image.width ?? 0, image.height ?? 0, n[0], n[1], image.width ?? 0, image.height ?? 0];
    this.draws.push({ image, sx: sx!, sy: sy!, sw: sw!, sh: sh!, dx: dx! + this.tx, dy: dy! + this.ty, dw: dw!, dh: dh!, tie: this.tie });
  }
}

function recordingCanvas(): HTMLCanvasElement {
  const canvas: RecordedImage & { getContext?: () => RecordingContext } = { width: 0, height: 0 };
  canvas.ctx = new RecordingContext();
  canvas.getContext = () => canvas.ctx!;
  return canvas as unknown as HTMLCanvasElement;
}

function draw(r: Recorded, x: number, y: number, pass: TerrainPlanDraw['pass'], tie?: string): TerrainPlanDraw {
  return { assetId: r.image.planAsset!, frame: Math.round(r.sx / FRAME_STRIDE), x, y, w: r.sw, h: r.sh, pass, ...(tie ? { tie } : {}) };
}

export function planTerrain(input: TerrainPlanInput): TerrainPlanDraw[] {
  const empty = createEmptyMapDocument({
    id: 'terrain-plan', title: 'terrain plan', width: input.width, height: input.height,
    cliffFamily: (input.cliffFamily ?? 'stone_1') as EmptyMapOptions['cliffFamily'],
    surfaceFamily: (input.surfaceFamily ?? 'grass_1') as EmptyMapOptions['surfaceFamily'],
  });
  const cells: Record<string, Record<string, unknown>> = {};
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    const elevation = input.heights[y]?.[x] ?? 0;
    if (elevation !== 0) cells[mapCellKey(x, y)] = { elevation };
  }
  for (const c of input.cells ?? []) {
    const key = mapCellKey(c.x, c.y);
    cells[key] = {
      ...cells[key],
      ...(c.cliffFamily ? { cliffFamily: c.cliffFamily } : {}),
      ...(c.surfaceFamily ? { surfaceFamily: c.surfaceFamily } : {}),
      ...(c.surface ? { surface: c.surface } : {}),
    };
  }
  const document = { ...empty, cells, stairRuns: input.stairRuns ?? [] } as MapDocumentV2;
  const terrain = terrainArrayForMapDocument(document, undefined, undefined, { includeTerrainPlaneCollision: false });
  const art = recordingArt(input.atlas) as never;
  const ctx = new RecordingContext();
  const c2d = ctx as unknown as CanvasRenderingContext2D;
  const cache = new GroundChunkCache(64, recordingCanvas);
  const w = input.width * 16;
  const h = input.height * 16;
  cache.draw(c2d, art, terrain, 0, 0, 1, w, h);
  const groundCount = ctx.draws.length;
  const items: WorldDepthItem[] = [];
  enqueueRaisedTerrainDepth(items, c2d, art, terrain, cache, 0, 0, 1, w, h);
  for (const item of sortWorldDepthItems(items)) {
    ctx.tie = String(item.tie);
    item.draw();
  }
  // Ground chunks are pre-drawn canvases; expand each copy back into its tile draws.
  const out: TerrainPlanDraw[] = [];
  ctx.draws.forEach((d, i) => {
    const pass = i < groundCount ? 'ground' : 'depth';
    if (!d.image.ctx) { out.push(draw(d, d.dx, d.dy, pass, d.tie)); return; }
    for (const child of d.image.ctx.draws) {
      if (child.dx + child.dw <= d.sx || child.dx >= d.sx + d.sw || child.dy + child.dh <= d.sy || child.dy >= d.sy + d.sh) continue;
      const drawn = draw(child, d.dx + (child.dx - d.sx), d.dy + (child.dy - d.sy), pass, d.tie);
      const x0 = Math.max(child.dx, d.sx), y0 = Math.max(child.dy, d.sy);
      const x1 = Math.min(child.dx + child.dw, d.sx + d.sw), y1 = Math.min(child.dy + child.dh, d.sy + d.sh);
      if (x0 > child.dx || y0 > child.dy || x1 < child.dx + child.dw || y1 < child.dy + child.dh) {
        drawn.clip = { x: d.dx + (x0 - d.sx), y: d.dy + (y0 - d.sy), w: x1 - x0, h: y1 - y0 };
      }
      out.push(drawn);
    }
  });
  return out;
}

/** Asset ids the terrain art loads by field name (caveSupport, dirtCliffEdge, …):
 * a plan can draw these besides the tile-category assets. */
export const TERRAIN_PLAN_NAMED_ASSETS: readonly string[] = [...new Set(Object.values(MAP_EDITOR_ASSET_NAMES as Record<string, string>))];

/** The stair runs of a layout that break the owner stair rule (straight cliff
 * edges only); Studio refuses these placements. Outside the layout counts as
 * ground level. */
export function stairPlacementFindings(input: Pick<TerrainPlanInput, 'width' | 'height' | 'heights' | 'stairRuns'>): readonly RampPlacementFinding[] {
  const heightAt = (x: number, y: number) => (x < 0 || y < 0 || x >= input.width || y >= input.height ? 0 : input.heights[y]?.[x] ?? 0);
  return rampPlacementFindings((input.stairRuns ?? []).filter(stairRunValid).flatMap(expandStairRun), heightAt);
}
