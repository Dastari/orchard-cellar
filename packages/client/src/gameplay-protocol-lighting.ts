import type { LightingQualityState } from '@orchard/engine/lighting-quality';
import type { GameplayCelestialPass } from './gameplay-celestial-pass.js';
import type { GameplayLightingPresentation } from './gameplay-lighting-presentation.js';

/** Stable, read-only view for per-frame capture. Unlike the full diagnostic
 * snapshot, reading this view does not enumerate caches or allocate arrays. */
export function gameplayProtocolLighting(quality: LightingQualityState,
  presentation: GameplayLightingPresentation, pass: GameplayCelestialPass) {
  return {
    get requestedQuality() { return quality.requested; },
    get effectiveQuality() { return quality.effective; },
    get model() { return presentation.model; },
    get fallbackReason() { return quality.reason; },
    get skyRgbRevision() { return pass.renderer?.scene.diagnostics.skyRgbRevision ?? null; },
  };
}
