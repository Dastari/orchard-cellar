import type { SkillNodeDefinition } from '@orchard/sim';
import { containsPoint } from '../../geometry.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { selectAtlasFrame } from '../../sprite.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiSlot, type UiSlotOptions } from './inventory.js';
import { uiSkillGraph } from './skill-graph.js';

/** Book inks: dark plum body, warm muted brown, and success/danger for gains and shortfalls. */
const INK = '#3f2832', MUTED = '#9e5f45', GOOD = '#265c42', BAD = '#9e2835';

/** A chapter's page heading in the reading font, with a carved rule beneath. */
export function uiPageHeading(title: string, caption?: string, options: { readonly rule?: boolean } = {}): UiElement {
  return new UiElement({ kind: 'page-heading', label: title, style: { height: uiFixed(caption ? 30 : 20), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      const width = measurePixelText(title, 1, art.pixel.headerFont);
      drawPixelText(context, art.pixel, title, r.x + Math.floor((r.width - width) / 2), r.y, { font: 'header', color: INK });
      if (caption) { const w = measurePixelText(caption, 1, art.pixel.font); drawPixelText(context, art.pixel, caption, r.x + Math.floor((r.width - w) / 2), r.y + 17, { color: MUTED }); }
      if (options.rule !== false) { context.fillStyle = '#e4a672'; context.fillRect(r.x + 8, r.y + r.height - 2, r.width - 16, 1); }
    } });
}
/** Small caps section label used on book pages. */
export function uiPageLabel(text: string): UiElement { return uiText(text, { role: 'label', layout: { alignSelf: 'stretch' } }); }

/** Label on the left, value on the right, joined by a dotted leader; optional delta in gain/loss ink. */
export function uiLedgerRow(label: string, value: string, options: { readonly delta?: number; readonly muted?: boolean; readonly tooltip?: string } = {}): UiElement {
  return new UiElement({ kind: 'ledger-row', label: options.tooltip ?? `${label} ${value}`, focusable: Boolean(options.tooltip), style: { height: uiFixed(11), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art, focused, hovered }) {
      if (!art) return; const r = element.rect, font = art.pixel.font;
      if (hovered || focused) { context.fillStyle = 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x - 2, r.y - 1, r.width + 4, r.height); }
      const delta = options.delta ? `${options.delta > 0 ? '+' : ''}${options.delta}` : '';
      const valueWidth = measurePixelText(value, 1, font), deltaWidth = delta ? measurePixelText(delta, 1, font) + 4 : 0;
      const text = fitPixelText(label, r.width - valueWidth - deltaWidth - 8, 1, font), textWidth = measurePixelText(text, 1, font);
      drawPixelText(context, art.pixel, text, r.x, r.y + 1, { color: options.muted ? MUTED : INK });
      context.fillStyle = '#e4a672'; for (let x = r.x + textWidth + 3; x < r.x + r.width - valueWidth - deltaWidth - 3; x += 3) context.fillRect(x, r.y + 7, 1, 1);
      if (delta) drawPixelText(context, art.pixel, delta, r.x + r.width - valueWidth - deltaWidth + 0, r.y + 1, { color: options.delta! > 0 ? GOOD : BAD });
      drawPixelText(context, art.pixel, value, r.x + r.width - valueWidth, r.y + 1, { color: INK });
    } });
}

/** Labelled bar in the pack's meter colours: name, current/max and a thin track. */
export function uiBookBar(label: string, current: number, maximum: number, colour: 'red' | 'blue' | 'green' | 'gold', right?: string): UiElement {
  const fills = { red: '#e43b44', blue: '#0095e9', green: '#63c74d', gold: '#feae34' } as const;
  return new UiElement({ kind: 'book-bar', label: `${label} ${current}/${maximum}`, style: { height: uiFixed(15), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, text = right ?? `${current}/${maximum}`;
      drawPixelText(context, art.pixel, label, r.x, r.y, { color: INK });
      drawPixelText(context, art.pixel, text, r.x + r.width - measurePixelText(text, 1, art.pixel.font), r.y, { color: MUTED });
      context.fillStyle = INK; context.fillRect(r.x, r.y + 10, r.width, 4);
      context.fillStyle = '#743f39'; context.fillRect(r.x + 1, r.y + 11, r.width - 2, 2);
      context.fillStyle = fills[colour]; context.fillRect(r.x + 1, r.y + 11, Math.round((r.width - 2) * Math.max(0, Math.min(1, current / Math.max(1, maximum)))), 2);
    } });
}

/** Selectable page line: optional item icon, text, right-hand note, current-row highlight. */
export function uiPageRow(options: { readonly id?: string; readonly label: string; readonly note?: string; readonly icon?: () => { readonly asset: LoadedAsset; readonly animation?: string } | undefined; readonly glyph?: string;
  readonly selected?: boolean; readonly muted?: boolean; readonly onPress?: () => void }): UiElement {
  let pressed = false;
  return new UiElement({ id: options.id, kind: 'page-row', label: options.label, focusable: Boolean(options.onPress), pointerMode: options.onPress ? 'capture' : 'passthrough', props: { selected: options.selected ?? false },
    style: { height: uiFixed(16), shrink: 0, alignSelf: 'stretch' },
    onPointer(event, element) {
      if (!options.onPress) return false;
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (options.onPress && (event.key === 'Enter' || event.key === ' ')) { options.onPress(); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect;
      if (options.selected || hovered || focused) { context.fillStyle = options.selected ? '#e4a672' : 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x, r.y, r.width, r.height); }
      if (focused) { context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1); }
      let x = r.x + 2;
      const icon = options.icon?.();
      if (icon) { const frame = selectAtlasFrame(icon.asset.metadata, icon.animation ?? 'base', 0) ?? selectAtlasFrame(icon.asset.metadata, 'base', 0); if (frame) { const f = Math.min(1, 16 / frame.width, 16 / frame.height); context.drawImage(icon.asset.image, frame.x, frame.y, frame.width, frame.height, x, r.y + Math.floor((16 - frame.height * f) / 2), Math.round(frame.width * f), Math.round(frame.height * f)); } x += 18; }
      else if (options.glyph) { paintUiSkin(context, art.skin.icon, options.glyph, { x, y: r.y, width: 16, height: 16 }); x += 18; }
      const note = options.note ?? '', noteWidth = note ? measurePixelText(note, 1, art.pixel.font) + 4 : 0;
      drawPixelText(context, art.pixel, fitPixelText(options.label, r.x + r.width - x - noteWidth - 2, 1, art.pixel.font), x, r.y + 4, { color: options.muted ? MUTED : INK });
      if (note) drawPixelText(context, art.pixel, note, r.x + r.width - noteWidth + 2, r.y + 4, { color: MUTED });
    } });
}

/** Objective line with a drawn tick box: ticked in success ink once complete. */
export function uiObjective(label: string, progress: string, complete: boolean): UiElement {
  return new UiElement({ kind: 'objective', label: `${label} ${progress}`, style: { height: uiFixed(12), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, font = art.pixel.font;
      context.fillStyle = INK; context.fillRect(r.x, r.y + 1, 8, 8); context.fillStyle = '#f6ca9f'; context.fillRect(r.x + 1, r.y + 2, 6, 6);
      if (complete) { context.fillStyle = GOOD; for (const [x, y] of [[1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [7, 2]] as const) context.fillRect(r.x + x, r.y + y, 1, 2); }
      const progressWidth = measurePixelText(progress, 1, font);
      drawPixelText(context, art.pixel, fitPixelText(label, r.width - progressWidth - 16, 1, font), r.x + 12, r.y + 2, { color: complete ? MUTED : INK });
      drawPixelText(context, art.pixel, progress, r.x + r.width - progressWidth, r.y + 2, { color: complete ? GOOD : MUTED });
    } });
}

/** Skills chapter, right leaf: the authored graph for one track inside the page. */
export function uiSkillPage(options: { readonly nodes: readonly SkillNodeDefinition[]; readonly ranks: Readonly<Record<string, number>>; readonly selected: string | null;
  readonly artwork?: Readonly<Record<string, LoadedAsset>>; readonly onSelect: (id: string) => void }): UiElement {
  return uiSkillGraph({ nodes: options.nodes, ranks: options.ranks, selected: options.selected, artwork: options.artwork, onSelect: options.onSelect, layout: { width: 'grow', height: 'grow' } });
}

/** Skill detail block for the left leaf: icon slot, name, rank pips, description and Learn. */
export function uiSkillDetail(options: { readonly node: SkillNodeDefinition; readonly rank: number; readonly icon?: UiSlotOptions['icon']; readonly asset?: LoadedAsset; readonly canLearn: boolean; readonly onLearn: () => void }): UiElement {
  const pips = new UiElement({ kind: 'rank-pips', label: `Rank ${options.rank} of ${options.node.maxRank}`, style: { height: uiFixed(6), width: uiFixed(Math.max(1, options.node.maxRank) * 6), shrink: 0 },
    paint(element, { context }) {
      for (let index = 0; index < options.node.maxRank; index++) {
        const x = element.rect.x + index * 6; context.fillStyle = INK; context.fillRect(x, element.rect.y, 5, 5);
        context.fillStyle = index < options.rank ? '#feae34' : '#f6ca9f'; context.fillRect(x + 1, element.rect.y + 1, 3, 3);
      }
    } });
  const artwork = options.asset ? { [options.node.id]: options.asset } : undefined;
  return uiFlex({ direction: 'column', gap: 4, alignSelf: 'stretch' }, [
    uiFlex({ direction: 'row', gap: 6, align: 'center' }, [
      uiSlot({ label: options.node.name, stack: options.asset ? { itemKind: options.node.id, quantity: 1 } : null, artwork }),
      uiFlex({ direction: 'column', gap: 2 }, [uiText(options.node.name, { wrap: true, maxLines: 2, layout: { width: uiFixed(150) } }), pips]),
    ]),
    uiText(options.node.description, { wrap: true, maxLines: 5, layout: { alignSelf: 'stretch' } }),
    uiFlex({ direction: 'row', align: 'center', gap: 6, alignSelf: 'stretch' }, [
      uiText(`Cost ${options.node.pointCost} point${options.node.pointCost === 1 ? '' : 's'}`, { layout: { grow: 1 } }),
      uiButton({ id: 'skills.learn', label: options.rank >= options.node.maxRank ? 'Mastered' : 'Learn', tone: 'success', disabled: !options.canLearn, onPress: options.onLearn }),
    ]),
  ]);
}
