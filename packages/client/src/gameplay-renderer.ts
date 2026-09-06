import { UnifiedRenderer } from '@orchard/engine/renderer';

/** Gameplay renderer construction and display diagnostics, mechanically moved. */
export function createGameplayRenderer(canvas: HTMLCanvasElement): UnifiedRenderer {
  return new UnifiedRenderer(canvas);
}

export function gameplayDisplaySnapshot(renderer: UnifiedRenderer, worldZoom: number, uiScale: () => number) {
  return {
    dpr: renderer.dpr,
    cssWidth: renderer.cssWidth,
    cssHeight: renderer.cssHeight,
    worldZoom,
    uiScale: uiScale(),
  };
}
