import type { AssetFrameSource } from '@orchard/ui';
export type GroundLightSource = (source: AssetFrameSource, x: number, y: number, level: number) => AssetFrameSource;
const sources = new WeakMap<CanvasRenderingContext2D, GroundLightSource>();
const spriteSources = new WeakMap<CanvasRenderingContext2D, (source: AssetFrameSource, x: number, y: number) => AssetFrameSource>();
/** Flat world artwork must sample the ground field across its whole rectangle,
 * not inherit one actor-style RGB sample from its anchor. */
export function withGroundSpriteSource(context: CanvasRenderingContext2D,
  source: (source: AssetFrameSource, x: number, y: number) => AssetFrameSource, draw: () => void): void {
  const previous = spriteSources.get(context);
  spriteSources.set(context, source);
  try { draw(); } finally {
    if (previous === undefined) spriteSources.delete(context); else spriteSources.set(context, previous);
  }
}
export function groundSpriteSource(context: CanvasRenderingContext2D, source: AssetFrameSource, x: number, y: number): AssetFrameSource {
  return spriteSources.get(context)?.(source, x, y) ?? source;
}
export function setGroundLightSource(context: CanvasRenderingContext2D, source?: GroundLightSource): void {
  if (source === undefined) sources.delete(context); else sources.set(context, source);
}
export function groundLightSource(context: CanvasRenderingContext2D, source: AssetFrameSource, x: number, y: number, level: number): AssetFrameSource {
  return sources.get(context)?.(source, x, y, level) ?? source;
}
