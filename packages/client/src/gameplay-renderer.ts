import { readWorldScale, WORLD_SCALE_EVENT } from '@orchard/ui';
import { UnifiedRenderer } from '@orchard/engine/renderer';

/** Client policy owns persistence; the shared renderer also serves Studio. */
export function createGameplayRenderer(canvas: HTMLCanvasElement): UnifiedRenderer {
  const renderer = new UnifiedRenderer(canvas);
  const apply = () => renderer.setWorldScale(readWorldScale());
  apply();
  window.addEventListener(WORLD_SCALE_EVENT, apply);
  import.meta.hot?.dispose(() => window.removeEventListener(WORLD_SCALE_EVENT, apply));
  return renderer;
}

export function gameplayDisplaySnapshot(renderer: UnifiedRenderer, worldZoom: number, uiScale: () => number) {
  return {
    dpr: renderer.dpr,
    cssWidth: renderer.cssWidth,
    cssHeight: renderer.cssHeight,
    worldZoom,
    uiScale: uiScale(),
    worldScale: renderer.worldScale,
    backend: 'canvas2d' as const,
    activeWorldPixels: renderer.activeWorldPixels,
    worldBackingWidth: renderer.worldWidth,
    worldBackingHeight: renderer.worldHeight,
    presentBytes: renderer.presentBytes,
  };
}
