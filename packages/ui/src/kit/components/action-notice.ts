import { drawPixelText, fitPixelText } from '../../pixel-ui.js';
import type { UiStyle } from '../layout/box.js';
import { uiFixed } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import { UI_ITEM_INKS, type UiTone } from '../tokens.js';
import { paintUiSkin } from './art.js';
import { uiButton } from './button.js';
import { paintUiDarkFrame } from './feedback-game.js';
export interface UiActionNoticeOptions {
  readonly id: string;
  readonly message: string;
  /** Second line under the title (dropped when dense). */
  readonly detail?: string;
  readonly tone?: UiTone;
  /** Skin icon at the card's left; defaults to the skills star. */
  readonly icon?: string;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly activateOn?: 'down' | 'up';
  readonly compact?: boolean;
  readonly dense?: boolean;
  readonly layout?: UiStyle;
}
/** A controlled announcement: the host owns its lifetime and action. Drawn as the approved gold toast card:
 * the icon, a gold title (the open action) with its detail beneath, and a light dismiss cross. */
export function uiActionNotice(options: UiActionNoticeOptions) {
  const tone = options.tone ?? 'info', detail = options.dense ? undefined : options.detail;
  const open = uiButton({ id: `${options.id}:open`, label: options.message, tone, activateOn: options.activateOn ?? 'down', onPress: options.onOpen,
    layout: { grow: 1, height: uiFixed(detail ? 26 : 16), padding: 0 },
    face: (element, { context, art, hovered, focused }) => {
      const r = element.rect, lit = hovered || focused, title = String(element.props['label']);
      drawPixelText(context, art.pixel, fitPixelText(title, r.width, 1, art.pixel.font), r.x, r.y + 4, { color: lit ? '#fff6e0' : UI_ITEM_INKS.flavour });
      if (detail) drawPixelText(context, art.pixel, fitPixelText(detail, r.width, 1, art.pixel.font), r.x, r.y + 16, { color: UI_ITEM_INKS.body });
      if (lit) { context.fillStyle = UI_ITEM_INKS.flavour; context.fillRect(r.x, r.y + 12, Math.min(r.width, title.length * 6), 1); }
    } });
  const dismiss = uiButton({ id: `${options.id}:dismiss`, label: 'X', ariaLabel: 'Dismiss notice', tone, activateOn: options.activateOn ?? 'down', onPress: options.onDismiss,
    layout: { width: uiFixed(options.compact ? 16 : 20), height: uiFixed(16), padding: 0, shrink: 0 },
    face: (element, { context, art, hovered, focused }) => {
      const r = element.rect; paintUiSkin(context, art.skin.icon, hovered || focused ? 'glyph.cross.red' : 'glyph.cross.light', { x: r.x + Math.floor((r.width - 16) / 2), y: r.y, width: 16, height: 16 });
    } });
  const icon = new UiElement({ kind: 'glyph', style: { width: uiFixed(16), height: uiFixed(16), shrink: 0 },
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.icon, options.icon ?? 'chapter.skills', element.rect); } });
  return new UiElement({ id: options.id, kind: 'toast', label: options.message, pointerMode: 'capture', onPointer: () => true, props: { itemInks: true, tone },
    style: { display: 'flex', direction: 'row', gap: 6, align: options.dense ? 'center' : 'start', padding: options.dense ? { left: 4, right: 4 } : 6, width: 'grow', height: 'fit', ...options.layout },
    children: [icon, open, dismiss],
    paint(element, { context, art }) { paintUiDarkFrame(element, context, art, 'tooltip_dark.legendary'); } });
}
