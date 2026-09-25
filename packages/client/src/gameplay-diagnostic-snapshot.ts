import type { TileLightmap, LightingModel } from '@orchard/engine/lighting';
import type { LightingQualityState } from '@orchard/engine/lighting-quality';
import type { GameplayCelestialPass } from './gameplay-celestial-pass.js';
import type { GameplayLightingPresentation } from './gameplay-lighting-presentation.js';
import { gameplayDisplaySnapshot, type createGameplayRenderer } from './gameplay-renderer.js';
import { renderMetricsSnapshot } from './gameplay-render-diagnostics.js';

interface GameplayDiagnosticsInput {
  readonly atlasPresentation: GameplayLightingPresentation;
  readonly lightingModel: LightingModel;
  readonly lightingEffectsDisabled: boolean;
  readonly lightingQuality: LightingQualityState;
  readonly lightmap: TileLightmap;
  readonly celestialPass: GameplayCelestialPass;
  readonly renderer: ReturnType<typeof createGameplayRenderer>;
  readonly worldZoom: number;
  readonly currentUiScale: () => number;
  readonly activeSpaceDefinition: { readonly spaceId: number };
  readonly latestLightCount: number;
  readonly rain: { readonly activeCount: number };
  readonly groundCache: { readonly residentCount: number };
  /** Static world chunk runtime: controller status, render window and collision (S4c/S4d). */
  readonly chunks?: { readonly runtime: unknown; readonly window: unknown; readonly collision: unknown };
}

/** On-demand diagnostic snapshot; mechanically extracted from the gameplay API. */
export function gameplayDiagnostics({ atlasPresentation, lightingModel, lightingEffectsDisabled,
  lightingQuality, lightmap, celestialPass, renderer, worldZoom, currentUiScale,
  activeSpaceDefinition, latestLightCount, rain, groundCache, chunks }: GameplayDiagnosticsInput) {
  return {
    schemaVersion: 1,
    rendering: renderMetricsSnapshot(),
    lighting: {
      model: atlasPresentation.model,
      requestedModel: lightingModel,
      effectsDisabled: lightingEffectsDisabled,
      requestedQuality: lightingQuality.requested,
      effectiveQuality: lightingQuality.effective,
      retainedSurfaceBytes: lightmap.retainedSurfaceBytes + atlasPresentation.retainedBytes + (celestialPass.renderer?.bytes ?? 0),
      fallbackReason: lightingQuality.reason,
      omitPages: atlasPresentation.pages.diagnostics(),
      tintedSurfaces: celestialPass.renderer?.frames.surfaces ?? 0,
      tintCanvasAllocations: celestialPass.renderer?.frames.allocations ?? 0,
      tintSurfaceReuses: celestialPass.renderer?.frames.reuses ?? 0,
      tintedBytes: celestialPass.renderer?.frames.bytes ?? 0,
      receiverCoverage: celestialPass.renderer?.scene.diagnostics ?? null,
      renderer: lightingQuality.effective === 'basic' ? 'basic-filter'
        : atlasPresentation.model === 'classic' ? 'classic-lightmap' : 'seasonal-receivers-v1',
      averageMs: lightmap.averageMs,
      floodMs: lightmap.floodMs,
      fieldRebuilds: lightmap.fieldRebuilds,
      floodTexelsVisited: lightmap.floodTexelsVisited,
      occlusionRebuilds: lightmap.occlusionRebuilds,
      occlusionCacheHits: lightmap.occlusionCacheHits,
      boundsResizeMs: lightmap.boundsResizeMs,
      rasterizeMs: lightmap.rasterizeMs,
      mergeMs: lightmap.mergeMs,
      uploadMs: lightmap.uploadMs,
      receiverMs: lightmap.receiverMs,
      compositeMs: lightmap.compositeMs,
    },
    display: gameplayDisplaySnapshot(renderer, worldZoom, currentUiScale),
    world: {
      spaceId: activeSpaceDefinition.spaceId,
      lightCount: latestLightCount,
      particleCount: rain.activeCount,
      residentGroundChunks: groundCache.residentCount,
    },
    chunks: chunks ?? null,
  };
}
