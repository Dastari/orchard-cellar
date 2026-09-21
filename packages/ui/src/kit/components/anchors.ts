import { selectAtlasFrame } from '../../sprite.js';
import { nineSlicePatches } from '../../nine-slice.js';
import { UiElement } from '../runtime/element.js';
import type { UiInventoryController } from '../runtime/inventory.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { paintUiSkin, uiSkinFrame } from './art.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiSlot, type UiSlotOptions } from './inventory.js';
export interface UiSpeechBubbleOptions {
  readonly id?: string; readonly text: string; readonly name?: string; readonly nameplate?: boolean;
  readonly tone?: UiTone; readonly tail?: 'up' | 'down' | 'left' | 'right' | 'none'; readonly maxWidth?: ReturnType<typeof uiFixed>; readonly layout?: UiStyle;
}
export function uiSpeechBubble(options: UiSpeechBubbleOptions): UiElement {
  const tone = options.tone ?? 'neutral', tail = options.nameplate ? 'none' : options.tail ?? 'down';
  return new UiElement({ id: options.id, kind: 'speech-bubble', props: { tone },
    style: { display: 'flex', direction: 'column', gap: 4, width: 'fit', maxWidth: options.maxWidth ?? uiFixed(240), padding: { left: tail === 'left' ? 16 : 8, right: tail === 'right' ? 16 : 8, top: tail === 'up' ? 16 : 8, bottom: tail === 'down' ? 16 : 8 }, ...options.layout },
    children: [...(options.name ? [uiText(options.name, { role: 'label' })] : []), uiText(options.text)],
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, body = { x: r.x + (tail === 'left' ? 8 : 0), y: r.y + (tail === 'up' ? 8 : 0), width: Math.max(0, r.width - (tail === 'left' || tail === 'right' ? 8 : 0)), height: Math.max(0, r.height - (tail === 'up' || tail === 'down' ? 8 : 0)) };
      paintUiSkin(context, art.skin.frame, `${tone}.idle`, body); if (tail === 'none') return;
      const entry = art.skin.feedback[`${tone}.tail.down`]!, source = uiSkinFrame(entry); if (!source) return;
      // Exact 10×9 tail from the reviewed tag, rotated without interpolation.
      context.save();
      if (tail === 'down') context.translate(body.x + Math.floor(body.width / 2) - 5, body.y + body.height - 8);
      else if (tail === 'up') context.transform(-1, 0, 0, -1, body.x + Math.floor(body.width / 2) + 5, body.y + 8);
      else if (tail === 'right') context.transform(0, -1, 1, 0, body.x + body.width - 8, body.y + Math.floor(body.height / 2) + 5);
      else context.transform(0, 1, -1, 0, body.x + 8, body.y + Math.floor(body.height / 2) - 5);
      context.drawImage(entry.asset.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height); context.restore();
    },
  });
}
export interface UiRibbonOptions { readonly id?: string; readonly label: string; readonly subtitle?: string; readonly tone?: UiTone; readonly overflow?: 'grow' | 'ellipsis' | 'clip'; readonly layout?: UiStyle }
function ribbon(options: UiRibbonOptions, banner: boolean): UiElement {
  const tone = options.tone ?? 'primary', minimum = banner ? 78 : 64, height = options.subtitle ? 34 : banner ? 21 : 20;
  return new UiElement({ id: options.id, kind: banner ? 'banner' : 'ribbon', props: { tone },
    style: { display: 'flex', direction: 'column', width: 'fit', minWidth: uiFixed(minimum), height: uiFixed(height), padding: { left: 32, right: 32, top: 4, bottom: 4 }, ...options.layout },
    measure() { return { min: { width: minimum, height }, preferred: { width: options.label.length * 6 + 64, height } }; },
    children: [uiText(options.label, { overflow: options.overflow === 'clip' ? 'clip' : 'ellipsis', align: 'center', layout: { width: 'grow' } }), ...(options.subtitle ? [uiText(options.subtitle, { overflow: 'ellipsis', align: 'center', layout: { width: 'grow' } })] : [])],
    paint(element, { context, art }) {
      if (!art) return; const entry = art.skin.feedback[banner ? 'banner.base.0' : 'ribbon.base.0']!, source = selectAtlasFrame(entry.asset.metadata, entry.entry.group); if (!source) return;
      const left = Math.floor(source.width / 2);
      for (const patch of nineSlicePatches(source, element.rect, [left, 6, source.width - left - 1, 8])) { const a = patch.source, b = patch.destination; context.drawImage(entry.asset.image, a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height); }
      if (tone !== 'primary') { context.fillStyle = UI_TONE_FACES[tone].frame.face; const r = element.rect; context.fillRect(r.x + 28, r.y + 3, Math.max(0, r.width - 56), Math.max(0, r.height - 11)); }
    },
  });
}
export function uiRibbon(options: UiRibbonOptions): UiElement { return ribbon(options, false); }
export function uiBanner(options: UiRibbonOptions): UiElement { return ribbon(options, true); }
export function uiBadge(options: { readonly id?: string; readonly label: string; readonly tone?: UiTone; readonly layout?: UiStyle }): UiElement {
  const button = uiButton({ ...options, shape: 'pill', size: 'sm' }); return new UiElement({ ...button.hooks, kind: 'badge', focusable: false, pointerMode: 'passthrough', onKey: undefined, onPointer: undefined });
}
export function uiLoadingSpinner(options: { readonly id?: string; readonly layout?: UiStyle } = {}): UiElement {
  return new UiElement({ id: options.id, kind: 'loading-spinner', label: 'Loading', animated: true, style: { width: uiFixed(16), height: uiFixed(16), ...options.layout },
    paint(element, { context, art, now, reducedMotion }) { if (art) paintUiSkin(context, art.skin.cursor, `kit_loading_spinner.idle.${reducedMotion ? 0 : Math.floor(now * 12 / 1000) % 8}`, element.rect); },
  });
}
export function uiCrosshair(options: { readonly id?: string; readonly layout?: UiStyle } = {}): UiElement {
  return new UiElement({ id: options.id, kind: 'crosshair', style: { width: uiFixed(16), height: uiFixed(16), ...options.layout }, paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.cursor, 'crosshair.idle.0', element.rect); } });
}
export function uiCursor(options: { readonly id?: string; readonly controller?: UiInventoryController; readonly artwork?: UiSlotOptions['artwork']; readonly point?: () => { readonly x: number; readonly y: number }; readonly layout?: UiStyle } = {}): UiElement {
  let unsubscribe: (() => void) | undefined;
  const slot = options.controller ? uiSlot({ stack: () => options.controller!.model.displayedCursor(), artwork: options.artwork }) : undefined;
  const stack = slot ? new UiElement({ ...slot.hooks, focusable: false, pointerMode: 'passthrough', onPointer: undefined, onKey: undefined }) : undefined;
  let observed = { x: 0, y: 0 };
  const cursor = new UiElement({ id: options.id, kind: 'cursor', style: { position: 'fixed', zLayer: 'cursor', width: uiFixed(32), height: uiFixed(32), ...options.layout }, children: stack ? [stack] : [],
    onPointerObserved(event, element) { observed = event.point; element.invalidate(); },
    onPlace(element, viewport) { const point = options.point?.() ?? observed; element.setStyle({ inset: { left: uiFixed(Math.max(0, Math.min(viewport.width - 32, point.x))), top: uiFixed(Math.max(0, Math.min(viewport.height - 32, point.y))) } }); stack?.setStyle({ visible: Boolean(options.controller?.model.displayedCursor()) }); },
    paint(element, { context, art }) { if (art && !options.controller?.model.displayedCursor()) paintUiSkin(context, art.skin.cursor, 'cursor.idle.0', { ...element.rect, width: 16, height: 16 }); }, onDispose() { unsubscribe?.(); },
  }); if (options.controller) unsubscribe = options.controller.subscribe(() => cursor.invalidate()); return cursor;
}
export { uiTouchControls, type UiTouchControlsOptions } from './touch-controls.js';
