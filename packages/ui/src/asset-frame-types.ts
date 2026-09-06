import type { LoadedAsset } from './assets.js';
import type { BuiltBakedShadowFrame } from './baked-shadow.js';
import type { AtlasFrame } from './sprite.js';

export type AssetPresentation = 'original' | 'omit-baked-shadow';
export interface AssetFrameSource {
  readonly image: CanvasImageSource;
  readonly emissiveSpans?: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Resolve by rectangle so animation/state aliases share the same selection. */
export function bakedShadowSelection(asset: LoadedAsset, frame: AtlasFrame): BuiltBakedShadowFrame | undefined {
  if (asset.bakedShadow === undefined) return undefined;
  for (const [group, selections] of Object.entries(asset.bakedShadow.frames)) {
    const originals = asset.metadata.animations[group] ?? asset.metadata.variants?.[group]
      ?? (asset.metadata.states?.[group] ? [asset.metadata.states[group]!] : []);
    for (let i = 0; i < originals.length; i++) {
      const candidate = originals[i]!;
      if (candidate.x === frame.x && candidate.y === frame.y
        && candidate.width === frame.width && candidate.height === frame.height) return selections[i];
    }
  }
  return undefined;
}

/** Resolve emission through rectangle aliases, like baked-shadow selections. */
export function emissiveFrameSpans(asset: LoadedAsset, frame: AtlasFrame): readonly number[] | undefined {
  if (asset.emissiveFrames === undefined) return undefined;
  for (const [name, spans] of Object.entries(asset.emissiveFrames)) {
    const originals = asset.metadata.animations[name] ?? asset.metadata.variants?.[name]
      ?? (asset.metadata.states?.[name] ? [asset.metadata.states[name]!] : []);
    const index = originals.findIndex((f) => f.x === frame.x && f.y === frame.y && f.width === frame.width && f.height === frame.height);
    if (index >= 0) return spans[index];
  }
  return undefined;
}

