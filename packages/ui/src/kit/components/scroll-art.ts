import { uiScrollThumb } from '../layout/scroll.js';
import type { UiElement } from '../runtime/element.js';
import { paintUiSkin, uiSkinFrame, type UiKitArt } from './art.js';

/** Shared native track and grip for continuous and virtual scroll areas. */
export function paintUiScrollbar(element: UiElement, context: CanvasRenderingContext2D, art: UiKitArt | undefined): void {
  if (!art || art.missingArt) return;
  for (const axis of ['x', 'y'] as const) {
    const geometry = uiScrollThumb(element, axis); if (!geometry) continue;
    const orientation = axis === 'y' ? 'vertical' : 'horizontal';
    paintUiSkin(context, art.skin.slider, axis==='y'?'slider_track_vertical.base.0':'slider_track.base.0', geometry.track);
    const r = geometry.thumb;
    paintUiSkin(context, art.skin.frame, 'parchment_plain.idle', r);
    const grip = art.skin.slider[`slider_handle.${orientation}.0`];
    const source = grip && uiSkinFrame(grip); if (!source) continue;
    const size = Math.min(12, r.width, r.height);
    context.drawImage(grip.asset.image, source.x, source.y, source.width, source.height,
      r.x + Math.floor((r.width-size)/2), r.y + Math.floor((r.height-size)/2), size, size);
  }
}
