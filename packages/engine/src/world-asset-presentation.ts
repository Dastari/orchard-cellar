import { AssetFrameSourceCache, emissiveFrameSpans, type AssetPresentation, type AssetFrameSource, type AtlasFrame, type LoadedAsset } from '@orchard/ui';
import { receiverFrameSource } from './receiver-frame-source.js';

const presentations = new WeakMap<CanvasRenderingContext2D, { cache: AssetFrameSourceCache; intent: AssetPresentation }>();
const originals = new WeakMap<LoadedAsset, WeakMap<AtlasFrame, AssetFrameSource>>();
const cacheIds = new WeakMap<AssetFrameSourceCache, number>();
let nextCacheId = 0;

/** Explicit per-world-context intent. UI contexts and shared loaded atlases are
 * never mutated. Missing frames are filtered from their precomputed spans on demand. */
export function setWorldAssetPresentation(context: CanvasRenderingContext2D, cache?: AssetFrameSourceCache, intent: AssetPresentation = 'original'): void {
  if (cache === undefined) presentations.delete(context);
  else presentations.set(context, { cache, intent });
}

export function worldAssetPresentationKey(context: CanvasRenderingContext2D): string {
  const state = presentations.get(context);
  if (state === undefined || state.intent === 'original') return 'original';
  let id = cacheIds.get(state.cache);
  if (id === undefined) { id = ++nextCacheId; cacheIds.set(state.cache, id); }
  return `${id}:${state.cache.revision}:${state.intent}`;
}

export function inheritWorldAssetPresentation(from: CanvasRenderingContext2D, to: CanvasRenderingContext2D): void {
  const state = presentations.get(from);
  if (state === undefined) presentations.delete(to);
  else presentations.set(to, state);
}

export function worldAssetFrameSource(context: CanvasRenderingContext2D, asset: LoadedAsset, frame: AtlasFrame, transform?: (source: AssetFrameSource) => AssetFrameSource): AssetFrameSource | null {
  const presentation = presentations.get(context);
  if (presentation !== undefined) {
    const source = presentation.cache.sourceForDraw(asset, frame, presentation.intent);
    return receiverFrameSource(context, transform?.(source) ?? source);
  }
  let frames = originals.get(asset);
  if (frames === undefined) { frames = new WeakMap(); originals.set(asset, frames); }
  let source = frames.get(frame);
  if (source === undefined) {
    source = { emissiveSpans: emissiveFrameSpans(asset, frame), image: asset.image, x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    frames.set(frame, source);
  }
  return receiverFrameSource(context, transform?.(source) ?? source);
}
