import type { CompletedRenderFrame } from '@orchard/engine/metrics';
import { RenderProtocolBuffer } from '@orchard/engine/render-protocol-buffer';

/** Revision changes only when the nine diffuse/sun/moon RGB channels change.
 * Geometry and moving-caster revisions must not be supplied here. */
export class ProtocolSkySteps {
  private revision: number | null = null;
  private nextFrame = false;
  private readonly first = new RenderProtocolBuffer();
  private readonly following = new RenderProtocolBuffer();
  observe(frame: CompletedRenderFrame, rgbRevision: number | null, sampling: boolean): boolean {
    if (rgbRevision === null) { this.revision = null; this.nextFrame = false; return false; }
    const changed = this.revision !== null && this.revision !== rgbRevision;
    this.revision = rgbRevision;
    if (sampling) {
      if (this.nextFrame) this.following.record(frame);
      if (changed) this.first.record(frame);
    }
    this.nextFrame = sampling && changed;
    return changed;
  }
  report() {
    return { firstFrame: this.first.report(), followingFrame: this.following.report(),
      observed: this.first.count > 0,
      scope: 'first completed frame with changed diffuse/sun/moon RGB, plus its next completed frame; initial preparation excluded; no observed step is not a zero-cost step' };
  }
}
