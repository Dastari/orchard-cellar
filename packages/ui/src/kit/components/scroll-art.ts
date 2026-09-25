import type { UiRect } from '../../geometry.js';
import { uiScrollThumb } from '../layout/scroll.js';
import type { UiElement } from '../runtime/element.js';
import type { UiLoadedSkinFamily } from '../skin/load.js';
import { uiSkinFrame, type UiKitArt } from './art.js';

/** The rail art is a 6px rounded pill: 3px leading cap, a repeatable body and a 2px trailing cap. */
export const UI_SCROLL_RAIL = 6;
const LEAD = 3, TRAIL = 2;
// Brown recessed rail with a peach thumb, the same pair on every surface (game panels and Studio).
const RAIL_FRAME = 4, THUMB_FRAME = 2, GRIP = '#f77622';

/** Shared rail and proportional thumb for continuous and virtual scroll areas. */
export function paintUiScrollbar(element: UiElement, context: CanvasRenderingContext2D, art: UiKitArt | undefined): void {
  if (!art || art.missingArt) return;
  for (const axis of ['x', 'y'] as const) {
    const geometry = uiScrollThumb(element, axis); if (!geometry) continue;
    const vertical = axis === 'y', sprite = vertical ? 'slider_track_vertical' : 'slider_track';
    const rail = art.skin.slider[`${sprite}.base.${RAIL_FRAME}`], thumb = art.skin.slider[`${sprite}.base.${THUMB_FRAME}`];
    if (!rail || !thumb) continue;
    const lane = uiScrollRail(geometry.track, vertical);
    const knob = vertical ? { ...lane, y: geometry.thumb.y, height: geometry.thumb.height } : { ...lane, x: geometry.thumb.x, width: geometry.thumb.width };
    paintPill(context, rail, lane, vertical); paintPill(context, thumb, knob, vertical);
    // Three grip notches once the thumb is long enough to carry them.
    const length = vertical ? knob.height : knob.width;
    if (length >= 16) {
      context.fillStyle = GRIP;
      const centre = Math.floor(length / 2) - 3;
      for (let step = 0; step < 3; step++) {
        if (vertical) context.fillRect(knob.x + 2, knob.y + centre + step * 2, 2, 1);
        else context.fillRect(knob.x + centre + step * 2, knob.y + 2, 1, 2);
      }
    }
  }
}

/** The 6px rail centred in the hit track; a narrower track keeps the whole rail inside its element. */
export function uiScrollRail(track: UiRect, vertical: boolean): UiRect {
  if (vertical) { const x = Math.min(track.x + Math.floor((track.width - UI_SCROLL_RAIL) / 2), track.x + track.width - UI_SCROLL_RAIL); return { x, y: track.y, width: UI_SCROLL_RAIL, height: track.height }; }
  const y = Math.min(track.y + Math.floor((track.height - UI_SCROLL_RAIL) / 2), track.y + track.height - UI_SCROLL_RAIL);
  return { x: track.x, y, width: track.width, height: UI_SCROLL_RAIL };
}

/** Draws the pill uncropped: fixed caps at both ends and the body stretched between them. */
function paintPill(context: CanvasRenderingContext2D, entry: UiLoadedSkinFamily[string], rect: UiRect, vertical: boolean): void {
  const source = uiSkinFrame(entry); if (!source) return;
  const image = entry.asset.image, length = vertical ? rect.height : rect.width;
  if (length < LEAD + TRAIL) return;
  if (vertical) {
    // The vertical art is 16px wide with the rail in columns 5-10.
    const sx = source.x + Math.floor((source.width - UI_SCROLL_RAIL) / 2), bottom = source.y + source.height - TRAIL;
    context.drawImage(image, sx, source.y, UI_SCROLL_RAIL, LEAD, rect.x, rect.y, UI_SCROLL_RAIL, LEAD);
    context.drawImage(image, sx, source.y + LEAD, UI_SCROLL_RAIL, 1, rect.x, rect.y + LEAD, UI_SCROLL_RAIL, length - LEAD - TRAIL);
    context.drawImage(image, sx, bottom, UI_SCROLL_RAIL, TRAIL, rect.x, rect.y + length - TRAIL, UI_SCROLL_RAIL, TRAIL);
    return;
  }
  const right = source.x + source.width - TRAIL;
  context.drawImage(image, source.x, source.y, LEAD, UI_SCROLL_RAIL, rect.x, rect.y, LEAD, UI_SCROLL_RAIL);
  context.drawImage(image, source.x + LEAD, source.y, 1, UI_SCROLL_RAIL, rect.x + LEAD, rect.y, length - LEAD - TRAIL, UI_SCROLL_RAIL);
  context.drawImage(image, right, source.y, TRAIL, UI_SCROLL_RAIL, rect.x + length - TRAIL, rect.y, TRAIL, UI_SCROLL_RAIL);
}
