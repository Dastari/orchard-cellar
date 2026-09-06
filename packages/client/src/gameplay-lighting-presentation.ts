import { WorldShadowAssets } from '@orchard/engine/world-lighting-renderer';
import type { LightingQualityState } from '@orchard/engine/lighting-quality';
import type { LightingModel } from '@orchard/engine/lighting';

/** Mechanical ownership extraction; constructor timing, frame quality order
 * and the existing dynamic-error Basic redraw are unchanged. */
export function createGameplayShadowAssets(): WorldShadowAssets {
  return new WorldShadowAssets();
}
export function prepareGameplayLightingFrame(lightingQuality: LightingQualityState,
  lightingModel: LightingModel, lightingFailure: string | null, shadowAssets: WorldShadowAssets): void {
  if (lightingQuality.requested === 'basic') {
    lightingQuality.commit(lightingQuality.generation, false);
    shadowAssets.reset();
  } else if (lightingModel === 'classic') {
    // Classic needs neither shadow omission preparation nor seasonal surfaces.
    lightingQuality.commit(lightingQuality.generation, true);
  } else if (lightingFailure !== null) {
    lightingQuality.fallback(lightingQuality.generation, lightingFailure);
  } else {
    shadowAssets.beginFrame();
    lightingQuality.commit(lightingQuality.generation, true);
  }
}

export function renderWithGameplayLightingFallback(alpha: number, renderFrame: (alpha: number) => void,
  lightingEffectsDisabled: () => boolean, setFailure: (reason: string) => void): void {
  try { renderFrame(alpha); } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!/^(?:world_asset_frame_|receiver_|directional_|world_receiver_|world_ground_)/.test(reason)
      || lightingEffectsDisabled()) throw error;
    console.warn('Dynamic lighting unavailable; using Basic.', reason);
    setFailure(reason);
    // Discard the unfinished world buffer and redraw the complete Basic frame.
    renderFrame(alpha);
  }
}
