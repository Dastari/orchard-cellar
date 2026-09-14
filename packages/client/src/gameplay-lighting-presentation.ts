import { AtlasVariantCohort, AtlasVariantLoadError, worldAtlasVariants } from '@orchard/ui';
import type { LightingQualityState } from '@orchard/engine/lighting-quality';
import type { LightingModel } from '@orchard/engine/lighting';
import { fallbackGameplayWorldBackend } from './gameplay-world-backend.js';

/** Select one complete page cohort at a frame boundary. The loader holds late
 * assets behind the same publication barrier; original UI images stay immutable. */
export class GameplayLightingPresentation {
  private started = false;
  private prepared = false;
  private generation = 0;
  private failureValue: string | null = null;
  model: LightingModel = 'unified';
  modelChanged = false;
  constructor(readonly pages: AtlasVariantCohort = worldAtlasVariants) {}
  get failure(): string | null { return this.failureValue ?? this.pages.failure; }
  get retainedBytes(): number {
    const state = this.pages.diagnostics();
    return state.decodedPageBytes + state.recoloredSurfaceBytes;
  }
  reset(): void {
    this.generation++;
    if (this.started || this.pages.active || this.pages.pending) this.pages.reset();
    this.started = false; this.prepared = false; this.failureValue = null;
  }
  prepare(quality: LightingQualityState, requestedModel: LightingModel, failure: string | null): void {
    const previous = this.model;
    if (quality.requested === 'basic' || requestedModel === 'classic') {
      if (this.started || this.pages.active || this.pages.pending || this.failure !== null) this.reset();
      this.model = requestedModel;
      quality.commit(quality.generation, quality.requested !== 'basic');
    } else {
      const reason = failure ?? this.failure;
      if (reason !== null) {
        this.reset(); this.failureValue = reason;
        this.model = requestedModel;
        quality.fallback(quality.generation, reason);
      } else {
        if (!this.started) {
          this.started = true;
          const generation = this.generation;
          void this.pages.prepare().then((ready) => {
            if (generation !== this.generation) return;
            this.prepared = ready;
            if (!ready) this.failureValue = this.pages.failure ?? 'atlas_variant_preparation_cancelled';
          }).catch((error: unknown) => {
            if (generation === this.generation) this.failureValue = error instanceof Error ? error.message : String(error);
          });
        }
        if (this.prepared && this.pages.commit()) {
          this.model = requestedModel;
          quality.commit(quality.generation, true);
        } else {
          // Preserve an already complete Classic or Dynamic frame until the
          // new cohort is ready. Initial entry stays on complete Basic artwork.
          quality.reason = 'preparing';
          if (quality.effective === 'basic') quality.fallback(quality.generation, 'preparing');
        }
      }
    }
    this.modelChanged = previous !== this.model;
  }
}

export function renderWithGameplayLightingFallback(alpha: number, renderFrame: (alpha: number) => void,
  lightingEffectsDisabled: () => boolean, setFailure: (reason: string) => void): void {
  let retriedBackend = false, retriedLighting = false;
  for (;;) {
    try { renderFrame(alpha); return; } catch (error: unknown) {
      if (!retriedBackend && fallbackGameplayWorldBackend(error)) {
        retriedBackend = true; continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      if (!(error instanceof AtlasVariantLoadError)
        && !/^(?:receiver_|directional_|world_receiver_|world_ground_)/.test(reason)) throw error;
      if (retriedLighting || lightingEffectsDisabled()) throw error;
      console.warn('Dynamic lighting unavailable; using Basic.', reason);
      setFailure(reason); retriedLighting = true;
      // Each policy can retry once; both discard the unfinished world surface.
    }
  }
}
