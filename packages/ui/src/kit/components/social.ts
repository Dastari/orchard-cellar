import { itemDefinition } from '@orchard/sim';
import { containsPoint, type UiRect } from '../../geometry.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiLoadedSkinFamily } from '../skin/load.js';
import { paintUiSkin, uiSkinFrame } from './art.js';
import { uiFlex } from './layout.js';
import { uiRichText } from './text.js';
import { uiCurrency } from './currency.js';
import { uiItemFrame } from './inventory.js';
import { uiGlyphButton } from './window.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';

const INK = '#3f2832', MUTED = '#9e5f45';

type Press = (event: Parameters<NonNullable<UiElement['hooks']['onPointer']>>[0], element: UiElement) => boolean;
/** Release-inside activation shared by the custom controls in this module. */
function pressHooks(onPress: () => void, enabled: () => boolean = () => true): { onPointer: Press; onKey: (event: { readonly key: string }) => boolean; readonly pressed: () => boolean } {
  let pressed = false;
  return {
    onPointer(event, element) {
      if (!enabled()) return false;
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (!enabled() || (event.key !== 'Enter' && event.key !== ' ')) return false; onPress(); return true; },
    pressed: () => pressed,
  };
}

/** Folder tab drawn from the book tab art, stretched sideways by its plain centre column to fit a label. */
function paintFolderTab(context: CanvasRenderingContext2D, family: UiLoadedSkinFamily, key: string, r: UiRect): void {
  const entry = family[key], source = entry && uiSkinFrame(entry); if (!entry || !source) return;
  const raised = key.endsWith('_raised'), top = raised ? 0 : 3, head = raised ? 5 : 8, band = source.height - 1, cap = 5;
  const columns = [[0, cap, r.x, cap], [cap, 1, r.x + cap, r.width - cap * 2], [source.width - cap, cap, r.x + r.width - cap, cap]] as const;
  for (const [sx, sw, dx, dw] of columns) {
    context.drawImage(entry.asset.image, source.x + sx, source.y + top, sw, head, dx, r.y, dw, head);
    context.drawImage(entry.asset.image, source.x + sx, source.y + band, sw, 1, dx, r.y + head, dw, Math.max(0, r.height - head));
  }
}

export interface UiFolderTab { readonly id: string; readonly label: string }
/** A row of labelled folder tabs sitting on a page edge; the current tab stands raised. */
export function uiFolderTabs(options: { readonly id?: string; readonly tabs: readonly UiFolderTab[]; readonly active: string; readonly onSelect: (id: string) => void }): UiElement {
  return uiFlex({ id: options.id, direction: 'row', gap: 2, align: 'end', shrink: 0 }, options.tabs.map(tab => {
    const hooks = pressHooks(() => options.onSelect(tab.id));
    return new UiElement({ id: options.id ? `${options.id}.${tab.id}` : undefined, kind: 'tab', label: tab.label, focusable: true, pointerMode: 'capture', props: { selected: tab.id === options.active },
      style: { width: uiFixed(Math.max(30, tab.label.length * 6 + 11)), height: uiFixed(18), shrink: 0 }, ...hooks,
      paint(element, { context, art, hovered, focused }) {
        if (!art) return;
        const r = element.rect, current = tab.id === options.active, lift = current ? 0 : hovered || focused ? 2 : 3;
        paintFolderTab(context, art.skin.book, current ? 'tab.peach_raised' : 'tab.cream', { x: r.x, y: r.y + lift, width: r.width, height: r.height - lift });
        const width = measurePixelText(tab.label, 1, art.pixel.font);
        drawPixelText(context, art.pixel, tab.label, r.x + Math.floor((r.width - width) / 2), r.y + lift + 5, { color: INK });
      } });
  }));
}

/** A dialogue or menu choice: the peach button face, a number key badge and left-set wording. */
export function uiChoiceButton(options: { readonly id?: string; readonly index?: number; readonly label: string; readonly tone?: 'primary' | 'success' | 'danger'; readonly disabled?: boolean; readonly onPress: () => void; readonly layout?: UiStyle }): UiElement {
  const hooks = pressHooks(options.onPress, () => node.disabled !== true);
  const node: UiElement = new UiElement({ id: options.id, kind: 'button', label: options.index !== undefined ? `${options.index}. ${options.label}` : options.label, focusable: true, disabled: options.disabled, pointerMode: 'capture',
    props: { tone: options.tone ?? 'primary', buttonSurface: true, label: options.label }, style: { height: uiFixed(20), alignSelf: 'stretch', shrink: 0, ...options.layout }, ...hooks,
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      // Label and tone are live props so hosts can relabel a retained button.
      const tone = (element.props['tone'] as 'primary' | 'success' | 'danger' | undefined) ?? 'primary', label = String(element.props['label'] ?? options.label);
      const r = element.rect, state = element.disabled ? 'disabled' : hooks.pressed() ? 'pressed' : 'idle', drop = hooks.pressed() ? 1 : 0;
      paintUiSkin(context, art.skin.button, `${element.disabled ? 'muted' : tone}.md.chamfered.${state}`, r);
      const ink = tone === 'primary' ? INK : '#fff6e0';
      let x = r.x + 8;
      if (options.index !== undefined) { drawPixelText(context, art.pixel, `${options.index}.`, x, r.y + 6 + drop, { color: tone === 'primary' ? MUTED : ink }); x += 16; }
      drawPixelText(context, art.pixel, fitPixelText(label, r.x + r.width - x - 8, 1, art.pixel.font), x, r.y + 6 + drop, { color: ink });
      if ((hovered || focused) && !element.disabled) paintUiSkin(context, art.skin.button, `outline.md.chamfered.${state}.${focused ? 'white' : 'gold'}`, r);
    } });
  return node;
}

/** A framed portrait well for dialogue and trade partners. */
export function uiPortraitWell(options: { readonly label: string; readonly size?: number; readonly paint: (context: CanvasRenderingContext2D, bounds: UiRect) => void }): UiElement {
  const size = options.size ?? 52;
  return new UiElement({ kind: 'portrait', label: options.label, style: { width: uiFixed(size), height: uiFixed(size + 3), shrink: 0 },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.frame, 'thin', r);
      context.save(); context.beginPath(); context.rect(r.x + 4, r.y + 4, r.width - 8, r.height - 11); context.clip();
      options.paint(context, { x: r.x + 4, y: r.y + 4, width: r.width - 8, height: r.height - 11 }); context.restore();
    } });
}

/** NPC conversation body: portrait, flowing text and numbered choices (number keys pick them). */
export function uiDialogueBody(options: { readonly speaker: string; readonly body: string; readonly choices: readonly { readonly id: string; readonly label: string; readonly tone?: 'primary' | 'success' | 'danger' }[];
  readonly portrait: (context: CanvasRenderingContext2D, bounds: UiRect) => void; readonly onChoose: (id: string) => void; readonly onLink?: (target: UiTextLinkTarget) => void; readonly width?: number }): UiElement {
  const width = options.width ?? 320;
  const text = uiRichText(options.body, { wrap: true, onLink: options.onLink, layout: { width: uiFixed(width - 52 - 8) } });
  return new UiElement({ kind: 'dialogue', label: `${options.speaker} says`, style: { display: 'flex', direction: 'column', gap: 8, width: uiFixed(width) },
    children: [uiFlex({ direction: 'row', gap: 8, align: 'start' }, [uiPortraitWell({ label: options.speaker, paint: options.portrait }), text]),
      uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, options.choices.map((choice, index) => uiChoiceButton({ id: `dialogue.choice.${choice.id}`, index: index + 1, label: choice.label, tone: choice.tone, onPress: () => options.onChoose(choice.id) })))],
    onKey(event) { const index = Number(event.key) - 1; const choice = options.choices[index]; if (!choice || event.repeat) return false; options.onChoose(choice.id); return true; } });
}

/** Minus / count / plus with authored glyph buttons; Arrow keys step by one, Page keys by ten. */
export function uiQuantityStepper(options: { readonly id?: string; readonly value: number; readonly max: number; readonly onChange: (value: number) => void }): UiElement {
  const set = (value: number) => options.onChange(Math.max(0, Math.min(options.max, value)));
  const count = new UiElement({ kind: 'text', label: `Quantity ${options.value}`, style: { width: uiFixed(20), height: uiFixed(16) },
    paint(element, { context, art }) { if (!art) return; const text = String(options.value), w = measurePixelText(text, 1, art.pixel.font); drawPixelText(context, art.pixel, text, element.rect.x + Math.floor((20 - w) / 2), element.rect.y + 5, { color: options.value ? INK : MUTED }); } });
  return new UiElement({ id: options.id, kind: 'stepper', label: 'Quantity', style: { display: 'flex', direction: 'row', align: 'center', gap: 0, shrink: 0 },
    children: [uiGlyphButton({ glyph: 'glyph.minus', chrome: 'none', label: 'Fewer', disabled: options.value <= 0, onPress: () => set(options.value - 1) }), count,
      uiGlyphButton({ glyph: 'glyph.plus', chrome: 'none', label: 'More', disabled: options.value >= options.max, onPress: () => set(options.value + 1) })],
    onKey(event) {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key]; if (!step) return false;
      set(options.value + step); return true;
    } });
}

/** One shop line: item art, name, unit price in coins and the quantity stepper. */
export function uiShopRow(options: { readonly itemKind: string; readonly name: string; readonly unitPrice: number; readonly quantity: number; readonly max: number; readonly owned?: number;
  readonly asset?: LoadedAsset; readonly onQuantity: (value: number) => void; readonly selected?: boolean }): UiElement {
  const art = new UiElement({ kind: 'item-image', label: options.name, style: { width: uiFixed(20), height: uiFixed(20), shrink: 0 },
    paint(element, { context }) {
      const frame = options.asset && uiItemFrame(options.asset, itemDefinition(options.itemKind)?.iconAnimation); if (!options.asset || !frame) return;
      const f = Math.min(1, 16 / frame.width, 16 / frame.height), w = Math.round(frame.width * f), h = Math.round(frame.height * f);
      context.drawImage(options.asset.image, frame.x, frame.y, frame.width, frame.height, element.rect.x + Math.floor((20 - w) / 2), element.rect.y + Math.floor((20 - h) / 2), w, h);
    } });
  const name = new UiElement({ kind: 'text', label: options.name, style: { grow: 1, height: uiFixed(20) },
    paint(element, { context, art: kit }) {
      if (!kit) return; const r = element.rect;
      drawPixelText(context, kit.pixel, fitPixelText(options.name, r.width, 1, kit.pixel.font), r.x, r.y + (options.owned !== undefined ? 2 : 6), { color: INK });
      if (options.owned !== undefined) drawPixelText(context, kit.pixel, `You have ${options.owned}`, r.x, r.y + 11, { color: MUTED });
    } });
  return new UiElement({ kind: 'shop-row', label: `${options.name}, ${options.unitPrice} bronze`, props: { selected: options.selected ?? false },
    style: { display: 'flex', direction: 'row', gap: 4, align: 'center', height: uiFixed(22), alignSelf: 'stretch', shrink: 0, padding: { left: 2, right: 2 } },
    children: [art, name, uiCurrency({ bronze: options.unitPrice }), uiQuantityStepper({ value: options.quantity, max: options.max, onChange: options.onQuantity })],
    paint(element, { context, hovered }) {
      const r = element.rect;
      if (options.quantity > 0 || hovered) { context.fillStyle = options.quantity > 0 ? '#e4a672' : 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x, r.y, r.width, r.height); }
      context.fillStyle = '#e4a672'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1);
    } });
}

/** Settings line: label (and optional hint) on the left, its control on the right. */
export function uiSettingRow(label: string, control: UiElement, hint?: string): UiElement {
  const text = new UiElement({ kind: 'text', label, style: { grow: 1, height: uiFixed(hint ? 20 : 16) },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      drawPixelText(context, art.pixel, fitPixelText(label, r.width, 1, art.pixel.font), r.x, r.y + (hint ? 1 : 5), { color: INK });
      if (hint) drawPixelText(context, art.pixel, fitPixelText(hint, r.width, 1, art.pixel.font), r.x, r.y + 11, { color: MUTED });
    } });
  return new UiElement({ kind: 'setting-row', label, style: { display: 'flex', direction: 'row', gap: 8, align: 'center', alignSelf: 'stretch', padding: { top: 2, bottom: 2 }, shrink: 0 },
    children: [text, control] });
}

/** Vertical menu tab in the legacy settings idiom: peach chamfered at rest, a green square face when current,
 * with its authored button glyph leading the label. */
export function uiMenuTab(options: { readonly id?: string; readonly label: string; readonly glyph: string; readonly active: boolean; readonly onPress: () => void; readonly width?: number; /** Glyph only, for narrow screens; the label stays the accessible name. */ readonly iconOnly?: boolean }): UiElement {
  const hooks = pressHooks(options.onPress);
  return new UiElement({ id: options.id, kind: 'tab', label: options.label, focusable: true, pointerMode: 'capture', props: { selected: options.active, tone: options.active ? 'success' : 'primary', buttonSurface: true },
    style: { width: uiFixed(options.width ?? (options.iconOnly ? 22 : 88)), height: uiFixed(22), shrink: 0 }, ...hooks,
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      const r = element.rect, tone = options.active ? 'success' : 'primary', shape = options.active ? 'square' : 'chamfered', state = hooks.pressed() ? 'pressed' : 'idle', drop = hooks.pressed() ? 1 : 0;
      paintUiSkin(context, art.skin.button, `${tone}.md.${shape}.${state}`, r);
      paintUiSkin(context, art.skin.icon, `bglyph.${options.glyph}.${tone}`, { x: r.x + 3, y: r.y + 3 + drop, width: 16, height: 16 });
      if (!options.iconOnly) drawPixelText(context, art.pixel, fitPixelText(options.label, r.width - 26, 1, art.pixel.font), r.x + 21, r.y + 8 + drop, { color: options.active ? '#fff6e0' : INK });
      if (hovered || focused) paintUiSkin(context, art.skin.button, `outline.md.${shape}.${state}.${focused ? 'white' : 'gold'}`, r);
    } });
}

const creamGlyphs = new Map<string, CanvasImageSource>();
/** The authored glyph's pixels re-inked cream, for legibility on saturated button faces. */
function creamGlyph(family: UiLoadedSkinFamily, key: string): CanvasImageSource | null {
  const cached = creamGlyphs.get(key); if (cached) return cached;
  const entry = family[key], source = entry && uiSkinFrame(entry); if (!entry || !source) return null;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 16, height: 16 }) : null;
  const context = canvas?.getContext('2d') as CanvasRenderingContext2D | null | undefined; if (!canvas || !context) return null;
  context.drawImage(entry.asset.image, source.x, source.y, 16, 16, 0, 0, 16, 16);
  context.globalCompositeOperation = 'source-in'; context.fillStyle = '#fff6e0'; context.fillRect(0, 0, 16, 16);
  creamGlyphs.set(key, canvas as CanvasImageSource); return canvas as CanvasImageSource;
}

/** Square mute toggle: green with the live speaker or note, red with the struck-out one when muted. */
export function uiMuteButton(options: { readonly id?: string; readonly label: string; readonly kind: 'sound' | 'music'; readonly muted: boolean | (() => boolean); readonly onToggle: () => void }): UiElement {
  const muted = () => typeof options.muted === 'function' ? options.muted() : options.muted;
  const hooks = pressHooks(options.onToggle);
  return new UiElement({ id: options.id, kind: 'button', label: `${muted() ? 'Unmute' : 'Mute'} ${options.label}`, focusable: true, pointerMode: 'capture', props: { tone: muted() ? 'danger' : 'success', buttonSurface: true, label: muted() ? 'UNMUTE' : 'MUTE' },
    style: { width: uiFixed(20), height: uiFixed(20), shrink: 0 }, ...hooks,
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, face = { x: r.x + 2, y: r.y + 2, width: 16, height: 16 }, state = hooks.pressed() ? 'pressed' : 'idle';
      const off = muted(); paintUiSkin(context, art.skin.button, `${off ? 'danger' : 'success'}.sm.square.${state}`, face);
      const glyph = creamGlyph(art.skin.icon, `audio.${options.kind}.success`); if (glyph) context.drawImage(glyph, face.x, face.y + (hooks.pressed() ? 1 : 0));
      if (off) { context.fillStyle = '#fff6e0'; for (let i = 0; i < 10; i++) context.fillRect(face.x + 3 + i, face.y + 3 + i, 1, 1); }
      if (hovered || focused) paintUiSkin(context, art.skin.button, `outline.sm.square.${state}.${focused ? 'white' : 'gold'}`, face);
    } });
}

/** Reward offer on the dark item frame, rimmed by rarity: label in quality ink, name, effect and its price. */
export function uiOfferCard(options: { readonly rarity: 'uncommon' | 'rare' | 'epic' | 'legendary'; readonly name: string; readonly effect: string; readonly price: string; readonly affordable: boolean; readonly hotkey?: string; readonly onBuy: () => void }): UiElement {
  const inks = { uncommon: '#63c74d', rare: '#5a8ee0', epic: '#b56be0', legendary: '#f6b83f' } as const;
  const line = (text: string, ink: string) => new UiElement({ kind: 'text', label: text, props: { text, ink }, style: { alignSelf: 'stretch', shrink: 0 },
    measure(_element, available) { const rows = Math.max(1, Math.ceil(text.length * 6 / Math.max(6, available.width))); return { min: { width: 0, height: rows * 10 }, preferred: { width: available.width, height: rows * 10 } }; },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, words = text.split(' '); let row = '', y = r.y;
      for (const word of words) { const next = row ? `${row} ${word}` : word; if (measurePixelText(next, 1, art.pixel.font) > r.width && row) { drawPixelText(context, art.pixel, row, r.x, y, { color: ink }); y += 10; row = word; } else row = next; }
      if (row) drawPixelText(context, art.pixel, row, r.x, y, { color: ink });
    } });
  const hooks = pressHooks(options.onBuy, () => options.affordable);
  const buy = new UiElement({ kind: 'button', label: `Buy ${options.name} for ${options.price}`, focusable: true, disabled: !options.affordable, pointerMode: 'capture', props: { tone: options.affordable ? 'success' : 'muted', buttonSurface: true },
    style: { height: uiFixed(20), alignSelf: 'stretch' }, ...hooks,
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, tone = options.affordable ? 'success' : 'muted', state = element.disabled ? 'disabled' : hooks.pressed() ? 'pressed' : 'idle';
      paintUiSkin(context, art.skin.button, `${tone}.md.chamfered.${state}`, r);
      const text = options.affordable ? options.price : `Needs ${options.price}`, w = measurePixelText(text, 1, art.pixel.font);
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - w) / 2), r.y + 6, { color: options.affordable ? '#fff6e0' : '#3f2832' });
      if ((hovered || focused) && options.affordable) paintUiSkin(context, art.skin.button, `outline.md.chamfered.${state}.${focused ? 'white' : 'gold'}`, r);
    } });
  return new UiElement({ kind: 'offer-card', label: `${options.rarity} ${options.name}`, props: { itemInks: true }, style: { display: 'flex', direction: 'column', gap: 4, padding: 6, width: uiFixed(116), height: uiFixed(104), shrink: 0 },
    // A growing spacer keeps every card's price button on the same baseline.
    children: [line(`${options.hotkey ? `${options.hotkey}  ` : ''}${options.rarity.toUpperCase()}`, inks[options.rarity]), line(options.name, '#f4f1e8'), line(options.effect, '#a9a3b8'), uiFlex({ grow: 1 }, []), buy],
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.frame, `tooltip_dark.${options.rarity}`, element.rect); } });
}
