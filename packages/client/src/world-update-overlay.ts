import type { UnifiedRenderer } from '@orchard/engine/renderer';
import type { OverworldUi } from '@orchard/ui';
import { drawOrchardBackdrop } from '@orchard/ui';

/** Update decisions remain paintable while authority readiness blocks the
 * world render. Re-composite the retained world rather than darkening an
 * already composited modal again on each frame. */
export class WorldUpdateOverlay {
  private painted = false;

  reset(): void { this.painted = false; }

  draw(
    renderer: Pick<UnifiedRenderer, 'compositeWorld' | 'beginUi' | 'endUi' | 'cssWidth' | 'cssHeight'>,
    ui: Pick<OverworldUi, 'blockingUpdatePromptVisible' | 'drawBlockingOverlay' | 'drawCursorOverlay'>,
    viewport: { readonly scale: number; readonly left: number; readonly top: number },
    hasWorldFrame: boolean,
  ): boolean {
    if (!ui.blockingUpdatePromptVisible && !this.painted) return false;
    if (hasWorldFrame) renderer.compositeWorld();
    const context = renderer.beginUi(viewport.scale);
    try {
      if (!hasWorldFrame) {
        drawOrchardBackdrop(context, renderer.cssWidth / viewport.scale, renderer.cssHeight / viewport.scale);
      }
      context.translate(viewport.left / viewport.scale, viewport.top / viewport.scale);
      ui.drawBlockingOverlay(context);
      ui.drawCursorOverlay(context);
    } finally {
      renderer.endUi();
    }
    this.painted = ui.blockingUpdatePromptVisible;
    return true;
  }
}
