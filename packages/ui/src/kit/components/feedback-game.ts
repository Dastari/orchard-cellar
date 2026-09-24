import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_ITEM_INKS } from '../tokens.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiGlyphButton } from './window.js';
import { uiInput } from './input.js';
import type { CanvasTextEditor } from '../runtime/text-editor.js';

/** Everything that floats over the world shares the dark Gear-D4 frame and its tested inks. */
export const paintUiDarkFrame = (element: UiElement, context: CanvasRenderingContext2D, art: Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art'], frame = 'tooltip_dark.neutral') => {
  if (art) paintUiSkin(context, art.skin.frame, frame, element.rect);
};
const inked = (text: string, ink: string, layout?: UiStyle) => { const node = uiText(text, { wrap: true, layout }); node.setProps({ ink }); return node; };

export type UiNoticeKind = 'error' | 'info' | 'success';
/** Short action feedback above the hotbar: one line, icon-led, sized to its words. */
export function uiNotice(options: { readonly text: string; readonly kind?: UiNoticeKind }): UiElement {
  const kind = options.kind ?? 'info', ink = kind === 'error' ? UI_ITEM_INKS.unmet : kind === 'success' ? UI_ITEM_INKS.equip : UI_ITEM_INKS.body;
  const glyph = kind === 'error' ? 'glyph.cross.red' : kind === 'success' ? 'glyph.check' : 'notice.info';
  return new UiElement({ kind: 'notice', label: options.text, props: { itemInks: true }, style: { display: 'flex', direction: 'row', gap: 4, align: 'center', padding: { left: 4, right: 8, top: 2, bottom: 4 }, shrink: 0 },
    children: [new UiElement({ kind: 'glyph', style: { width: uiFixed(16), height: uiFixed(16), shrink: 0 }, paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.icon, glyph, element.rect); } }), inked(options.text, ink)],
    paint(element, { context, art }) { paintUiDarkFrame(element, context, art, kind === 'error' ? 'tooltip_dark.poor' : kind === 'success' ? 'tooltip_dark.uncommon' : 'tooltip_dark.neutral'); } });
}

/** A lasting announcement (skill point, level up): gold title, detail, an action and a dismiss cross. */
export function uiToastCard(options: { readonly title: string; readonly detail?: string; readonly icon?: string; readonly action?: { readonly label: string; readonly onPress: () => void }; readonly onDismiss?: () => void; readonly width?: number }): UiElement {
  const width = options.width ?? 200;
  const text = uiFlex({ direction: 'column', gap: 2, grow: 1 }, [inked(options.title, UI_ITEM_INKS.flavour), ...(options.detail ? [inked(options.detail, UI_ITEM_INKS.body)] : []),
    ...(options.action ? [new UiElement({ kind: 'link', label: options.action.label, focusable: true, pointerMode: 'capture', style: { height: uiFixed(10), width: uiFixed(options.action.label.length * 6 + 11) },
      onPointer(event) { if (event.type === 'up') { options.action!.onPress(); return true; } return event.type === 'down'; },
      onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; options.action!.onPress(); return true; },
      paint(element, { context, art, hovered, focused }) { if (!art) return; const label = `${options.action!.label} >`; drawPixelText(context, art.pixel, label, element.rect.x, element.rect.y, { color: hovered || focused ? UI_ITEM_INKS.flavour : UI_ITEM_INKS.equip }); } })] : [])]);
  return new UiElement({ kind: 'toast', label: options.title, props: { itemInks: true }, style: { display: 'flex', direction: 'row', gap: 6, align: 'start', padding: 6, width: uiFixed(width), shrink: 0 },
    children: [
      ...(options.icon ? [new UiElement({ kind: 'glyph', style: { width: uiFixed(16), height: uiFixed(16), shrink: 0 }, paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.icon, options.icon!, element.rect); } })] : []),
      text, ...(options.onDismiss ? [uiGlyphButton({ glyph: 'glyph.cross.light', chrome: 'none', label: 'Dismiss', onPress: options.onDismiss })] : [])],
    paint(element, { context, art }) { paintUiDarkFrame(element, context, art, 'tooltip_dark.legendary'); } });
}

export type UiNameplateKind = 'self' | 'player' | 'friend' | 'npc' | 'offline';
const PLATE_INKS: Readonly<Record<UiNameplateKind, string>> = { self: UI_ITEM_INKS.body, player: UI_ITEM_INKS.body, friend: UI_ITEM_INKS.equip, npc: UI_ITEM_INKS.flavour, offline: UI_ITEM_INKS.muted };
/** A slim dark plate over a character's head; NPCs in gold, friends in green, offline in grey. */
export function uiNameplate(options: { readonly id?: string; readonly name: string; readonly kind?: UiNameplateKind; readonly detail?: string }): UiElement {
  const kind = options.kind ?? 'player';
  return new UiElement({ id: options.id, kind: 'nameplate', label: options.name, style: { height: uiFixed(options.detail ? 22 : 13), shrink: 0 },
    measure() { const width = Math.max(options.name.length, options.detail?.length ?? 0) * 6 + 7; return { min: { width, height: 13 }, preferred: { width, height: options.detail ? 22 : 13 } }; },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      context.fillStyle = 'rgba(14, 7, 27, 0.72)'; context.fillRect(r.x + 1, r.y, r.width - 2, r.height); context.fillRect(r.x, r.y + 1, r.width, r.height - 2);
      const w = measurePixelText(options.name, 1, art.pixel.font);
      drawPixelText(context, art.pixel, options.name, r.x + Math.floor((r.width - w) / 2), r.y + 3, { color: PLATE_INKS[kind] });
      if (options.detail) { const dw = measurePixelText(options.detail, 1, art.pixel.font); drawPixelText(context, art.pixel, options.detail, r.x + Math.floor((r.width - dw) / 2), r.y + 12, { color: UI_ITEM_INKS.muted }); }
    } });
}

/** Hover card for crops, trees and machines: gold title, detail lines and an optional growth bar. */
export function uiWorldHover(options: { readonly title: string; readonly lines: readonly string[]; readonly progress?: number }): UiElement {
  const width = Math.min(160, Math.max(options.title.length, ...options.lines.map(line => line.length)) * 6 + 12);
  return new UiElement({ kind: 'world-hover', label: options.title, props: { itemInks: true }, style: { display: 'flex', direction: 'column', gap: 4, padding: 6, width: uiFixed(width), shrink: 0 },
    children: [inked(options.title, UI_ITEM_INKS.flavour), ...options.lines.map(line => inked(line, UI_ITEM_INKS.body)),
      ...(options.progress !== undefined ? [new UiElement({ kind: 'meter', label: 'Progress', style: { height: uiFixed(4), alignSelf: 'stretch' },
        paint(element, { context }) { const r = element.rect; context.fillStyle = '#3a3150'; context.fillRect(r.x, r.y, r.width, r.height); context.fillStyle = '#63c74d'; context.fillRect(r.x, r.y, Math.round(r.width * options.progress!), r.height); } })] : [])],
    paint(element, { context, art }) { paintUiDarkFrame(element, context, art); } });
}

export interface UiChatLine { readonly channel: 'general' | 'trade' | 'party' | 'private' | 'system'; readonly author?: string; readonly text: string }
const CHANNEL_INKS: Readonly<Record<UiChatLine['channel'], string>> = { general: UI_ITEM_INKS.body, trade: UI_ITEM_INKS.flavour, party: '#5ac2e0', private: '#e58fd0', system: UI_ITEM_INKS.muted };
/** Chat log on the translucent dark frame with channel-inked lines and a parchment input at its foot. */
export function uiChatPanel(options: { readonly lines: readonly UiChatLine[]; readonly open: boolean; readonly editor?: CanvasTextEditor; readonly channel?: string; readonly width?: number; readonly rows?: number; readonly onSubmit?: (text: string) => void }): UiElement {
  const width = options.width ?? 260, rows = options.rows ?? 8;
  const log = new UiElement({ kind: 'chat-log', label: 'Chat messages', focusable: options.open, style: { height: uiFixed(rows * 11), alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, font = art.pixel.font; let y = r.y + r.height - 11;
      for (const line of [...options.lines].reverse()) {
        if (y < r.y) break;
        const prefix = line.author ? `${line.author}: ` : '', ink = CHANNEL_INKS[line.channel];
        if (prefix) drawPixelText(context, art.pixel, prefix, r.x, y, { color: ink === UI_ITEM_INKS.body ? UI_ITEM_INKS.flavour : ink });
        drawPixelText(context, art.pixel, fitPixelText(line.text, r.width - measurePixelText(prefix, 1, font), 1, font), r.x + measurePixelText(prefix, 1, font), y, { color: ink });
        y -= 11;
      }
    } });
  const input = options.open ? uiInput({ id: 'chat.input', label: 'Chat message', placeholder: `Say to ${options.channel ?? 'General'}`, editor: options.editor, size: 'md', onSubmit: options.onSubmit }) : null;
  return new UiElement({ id: 'chat', kind: 'chat', label: 'Chat', props: { itemInks: true }, style: { display: 'flex', direction: 'column', gap: 4, padding: 6, width: uiFixed(width), shrink: 0 },
    children: [log, ...(input ? [input] : [])],
    paint(element, { context, art }) { if (!options.open) return; context.save(); context.globalAlpha *= .88; paintUiDarkFrame(element, context, art); context.restore(); } });
}
