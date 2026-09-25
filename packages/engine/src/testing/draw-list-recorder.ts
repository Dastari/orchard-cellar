import { createHash } from 'node:crypto';
import type { LoadedAsset } from '@orchard/ui';
import { GroundChunkCache } from '../ground-cache.js';
import type { OverworldArt } from '../overworld-art.js';
import { enqueueRaisedTerrainDepth } from '../raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from '../renderer.js';
import type { TerrainArray } from '../terrain.js';

/**
 * Test support (static world S4c): records the ground pass and the sorted
 * raised-terrain depth queue as plain draw lists, without a browser, so a
 * chunk render window can be compared with the whole map it was cut from.
 * Ground chunk canvases are named by the digest of what was drawn into them,
 * so two caches (or one cache reused across window moves) compare by content.
 */
type Recorded = readonly (string | number)[];
interface RecordingCanvas { width: number; height: number; context: RecordingContext; getContext(): RecordingContext }

export const drawListDigest = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex').slice(0, 32);

class RecordingContext {
  readonly log: Recorded[] = [];
  imageSmoothingEnabled = false;
  fillStyle: unknown = '';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  save() { this.log.push(['save']); }
  restore() { this.log.push(['restore']); }
  translate(x: number, y: number) { this.log.push(['translate', x, y]); }
  scale(x: number, y: number) { this.log.push(['scale', x, y]); }
  rotate(angle: number) { this.log.push(['rotate', angle]); }
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  setTransform() { this.log.push(['setTransform']); }
  clip() { this.log.push(['clip']); }
  beginPath() { this.log.push(['beginPath']); }
  rect(...n: number[]) { this.log.push(['rect', ...n]); }
  clearRect(...n: number[]) { this.log.push(['clearRect', ...n]); }
  fillRect(...n: number[]) {
    this.log.push(['fillRect', String(this.fillStyle), this.globalCompositeOperation, this.globalAlpha, ...n]);
  }
  drawImage(image: { readonly name?: string; readonly context?: RecordingContext }, ...n: number[]) {
    const name = image.name ?? (image.context === undefined ? '?' : `chunk:${drawListDigest(image.context.log)}`);
    this.log.push(['drawImage', name, this.globalCompositeOperation, this.globalAlpha, ...n]);
  }
}

export function recordingCanvasFactory(): { readonly create: () => HTMLCanvasElement; readonly created: () => number } {
  let created = 0;
  return {
    create: () => {
      created += 1;
      const context = new RecordingContext();
      const canvas: RecordingCanvas = { width: 0, height: 0, context, getContext: () => context };
      return canvas as unknown as HTMLCanvasElement;
    },
    created: () => created,
  };
}

function fakeAsset(name: string): LoadedAsset {
  const frames = Array.from({ length: 256 }, (_, index) => ({ x: index * 16, y: 0, width: 16, height: 16, durationTicks: 0 }));
  return {
    name,
    image: { name } as unknown as CanvasImageSource,
    anchor: [8, 15],
    metadata: { animations: {}, variants: { base: frames } },
  } as unknown as LoadedAsset;
}

/** Every asset exists and draws under its own name. */
export function recordingArt(): OverworldArt {
  const assets = new Map<string, LoadedAsset>();
  const asset = (name: string): LoadedAsset => {
    let value = assets.get(name);
    if (value === undefined) { value = fakeAsset(name); assets.set(name, value); }
    return value;
  };
  const terrainAssets = new Proxy({}, { get: (_target, key) => typeof key === 'string' ? asset(key) : undefined });
  return new Proxy({}, {
    get: (_target, key) => key === 'terrainAssets' ? terrainAssets
      : typeof key === 'string' ? asset(`art_${key}`) : undefined,
  }) as OverworldArt;
}

export interface RecordedView { readonly cameraX: number; readonly cameraY: number; readonly width: number; readonly height: number }

/** Ground pass plus the sorted raised-terrain depth queue for one camera view. */
export function recordGroundDrawList(terrain: TerrainArray, cache: GroundChunkCache, art: OverworldArt, view: RecordedView): {
  readonly count: number; readonly digest: string; readonly log: readonly Recorded[];
} {
  const main = new RecordingContext();
  const context = main as unknown as CanvasRenderingContext2D;
  cache.draw(context, art, terrain, view.cameraX, view.cameraY, 1, view.width, view.height);
  const items: WorldDepthItem[] = [];
  enqueueRaisedTerrainDepth(items, context, art, terrain, cache, view.cameraX, view.cameraY, 1, view.width, view.height);
  for (const item of sortWorldDepthItems(items)) {
    main.log.push(['tie', String(item.tie)]);
    item.draw();
  }
  return { count: main.log.length, digest: drawListDigest(main.log), log: main.log };
}

export function recordingGroundCache(capacity = 512): { readonly cache: GroundChunkCache; readonly created: () => number } {
  const factory = recordingCanvasFactory();
  return { cache: new GroundChunkCache(capacity, factory.create), created: factory.created };
}
