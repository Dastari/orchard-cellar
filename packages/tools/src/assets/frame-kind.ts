import type { AssetSource, FrameKind, PixelGrid } from './types.js';

/**
 * Classify legacy frame groups without relying on filenames. New or ambiguous
 * imports should persist an explicit frameKinds entry during review.
 */
export function frameKind(asset: AssetSource, name: string, frames: readonly PixelGrid[]): FrameKind {
  const explicit = asset.frameKinds?.[name];
  if (explicit) return explicit;
  if (frames.length <= 1) return 'state';
  if (asset.animationFps?.[name] !== undefined || asset.fps !== undefined) return 'animation';
  return 'variant';
}

export function variantTopology(
  asset: AssetSource,
  name: string,
  frames: readonly PixelGrid[],
): 'blob47' | undefined {
  if (asset.variantTopologies?.[name]) return asset.variantTopologies[name];
  if (asset.autotile === 'blob47' && name === 'base') return 'blob47';
  if (asset.category === 'tiles' && frames.length === 47) return 'blob47';
  return undefined;
}
