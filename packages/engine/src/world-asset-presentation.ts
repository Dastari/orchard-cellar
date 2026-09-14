import { emissiveFrameSpans, type AssetPresentation, type AssetFrameSource, type AtlasFrame, type LoadedAsset } from '@orchard/ui';
import type { WorldFrameEffect } from './world-frame-effect.js';
import { receiverFrameSource, setUnlitEffectPresentation } from './receiver-frame-source.js';
import { webglWorldBackend } from './webgl/hooks.js';

/** A committed atlas cohort supplies whole pages; it never prepares frames. */
export interface WorldAssetPages {
  readonly revision: number;
  source(asset: LoadedAsset): CanvasImageSource;
}
const presentations = new WeakMap<CanvasRenderingContext2D, WorldAssetPages>();
const originals = new WeakMap<LoadedAsset, WeakMap<AtlasFrame, AssetFrameSource>>();
const pageIds = new WeakMap<WorldAssetPages, number>();
const gpuPresentations = new WeakMap<CanvasRenderingContext2D, { pages: WorldAssetPages | undefined; revision: number }>();
let gpuRevision = 0;
const descriptors = new WeakMap<WorldAssetPages, WeakMap<LoadedAsset, WeakMap<AtlasFrame, AssetFrameSource>>>();
let nextPageId = 0;

/** UI remains on original art. Dynamic contexts select the committed page
 * cohort, including inherited chunk contexts, without mutating LoadedAsset. */
export function setWorldAssetPresentation(context: CanvasRenderingContext2D, pages?: WorldAssetPages,
  intent: AssetPresentation = 'original'): void {
  if (pages === undefined || intent === 'original') presentations.delete(context);
  else presentations.set(context, pages);
  const selected = presentations.get(context);
  setUnlitEffectPresentation(selected, selected?.revision ?? 0);
  const gpu = webglWorldBackend(context);
  if (gpu !== undefined) {
    const committed = presentations.get(context), revision = committed?.revision ?? 0;
    const previous = gpuPresentations.get(context);
    if (previous === undefined || previous.pages !== committed || previous.revision !== revision) {
      gpu.releasePresentation(++gpuRevision);
      gpuPresentations.set(context, { pages: committed, revision });
    }
  }
}
export function worldAssetPresentationKey(context: CanvasRenderingContext2D): string {
  const pages = presentations.get(context);
  if (pages === undefined) return 'original';
  let id = pageIds.get(pages);
  if (id === undefined) { id = ++nextPageId; pageIds.set(pages, id); }
  return `${id}:${pages.revision}:omit-baked-shadow`;
}
export function inheritWorldAssetPresentation(from: CanvasRenderingContext2D, to: CanvasRenderingContext2D): void {
  const pages = presentations.get(from);
  if (pages === undefined) presentations.delete(to);
  else presentations.set(to, pages);
}
function descriptor(asset: LoadedAsset, frame: AtlasFrame, pages?: WorldAssetPages): AssetFrameSource {
  let assets = originals;
  if (pages !== undefined) {
    let cached = descriptors.get(pages);
    if (cached === undefined) { cached = new WeakMap(); descriptors.set(pages, cached); }
    assets = cached;
  }
  let frames = assets.get(asset);
  if (frames === undefined) { frames = new WeakMap(); assets.set(asset, frames); }
  let source = frames.get(frame);
  if (source === undefined) {
    // This is rectangle metadata only. The getter holds no omit image reference:
    // resetting the cohort releases its images even if an old chunk survives.
    source = { get image() { return pages === undefined ? asset.image : pages.source(asset); },
      emissiveSpans: emissiveFrameSpans(asset, frame), x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    frames.set(frame, source);
  }
  return source;
}
export function worldAssetFrameSource(context: CanvasRenderingContext2D, asset: LoadedAsset, frame: AtlasFrame,
  transform?: (source: AssetFrameSource) => AssetFrameSource, effect?: WorldFrameEffect): AssetFrameSource | null {
  const source = descriptor(asset, frame, presentations.get(context));
  return receiverFrameSource(context, transform?.(source) ?? source, effect);
}
