import { readPresentationCap, readWorldScale, worldBackendStatus, WORLD_SCALE_EVENT } from '@orchard/ui';
import { UnifiedRenderer } from '@orchard/engine/renderer';
import { installGameplayWorldBackend } from './gameplay-world-backend.js';
import { renderMetrics } from './gameplay-render-diagnostics.js';

/** Client policy owns persistence; the shared renderer also serves Studio. */
export function createGameplayRenderer(canvas: HTMLCanvasElement): UnifiedRenderer {
  const renderer = new UnifiedRenderer(canvas);
  const backend = installGameplayWorldBackend(renderer, renderMetrics);
  const apply = () => renderer.setWorldScale(readWorldScale());
  apply();
  window.addEventListener(WORLD_SCALE_EVENT, apply);
  import.meta.hot?.dispose(() => {
    window.removeEventListener(WORLD_SCALE_EVENT, apply);
    backend.dispose(); renderer.dispose();
  });
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
    backend: renderer.worldPassBackend,
    worldPassFallbackReason: worldBackendStatus().fallbackReason,
    presentationCap: readPresentationCap(),
    activeWorldPixels: renderer.activeWorldPixels,
    worldBackingWidth: renderer.worldWidth,
    worldBackingHeight: renderer.worldHeight,
    presentBytes: renderer.presentBytes,
    hudCache: renderer.hudCacheDiagnostics,
  };
}
