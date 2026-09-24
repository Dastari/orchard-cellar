import type { LoadedAsset } from '../../assets.js';
import { drawPixelText } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_ITEM_INKS, UI_TEXT_METRICS, type UiItemQuality } from '../tokens.js';
import { paintUiMissingArt, paintUiSkin } from './art.js';
import { uiCurrency, uiCurrencyWidth } from './currency.js';
import { uiFlex } from './layout.js';
import { uiIcon, type UiIconSource } from './media.js';
import { uiTextLines } from './text.js';

/** Line roles. Each selects one `UI_ITEM_INKS` entry; callers never pass colours. */
export const UI_ITEM_TOOLTIP_LINE_ROLES = ['body', 'muted', 'equip', 'flavour', 'unmet', 'itemLevel'] as const;
export type UiItemTooltipLineRole = typeof UI_ITEM_TOOLTIP_LINE_ROLES[number];
export interface UiItemTooltipLine {
  readonly role: UiItemTooltipLineRole;
  readonly text: string;
  /** Right-aligned on the line's first row, for example a weapon type or speed. */
  readonly right?: string;
}
/** A kit icon, or item artwork (the same `LoadedAsset` map slots use). */
export type UiItemTooltipIcon = UiIconSource | { readonly artwork: LoadedAsset; readonly animation?: string };
/** Pure presentation model; the host derives lines from item content. */
export interface UiItemTooltipModel {
  readonly name: string;
  readonly quality: UiItemQuality;
  readonly icon?: UiItemTooltipIcon;
  /** Adds the "Unique" line under the name. */
  readonly unique?: boolean;
  readonly lines: readonly UiItemTooltipLine[];
  /** Omit for items that cannot be sold. */
  readonly sellBronze?: bigint | number;
}
export interface UiItemTooltipOptions extends UiItemTooltipModel { readonly id?: string; readonly layout?: UiStyle }

/** Maximum logical width, matching the approved Gear-D4 mockups; shorter tooltips shrink to their content. */
export const UI_ITEM_TOOLTIP_WIDTH = 204;
export const UI_ITEM_TOOLTIP_MIN_WIDTH = 96;
const PADDING = 6, WELL = 20, WELL_GAP = 4, RIGHT_GAP = 6;
const glyph = UI_TEXT_METRICS.body;
const textWidth = (text: string) => Math.max(0, text.length * (glyph.glyphWidth + 1) - 1);
const RIM_QUALITIES: readonly UiItemQuality[] = ['uncommon', 'rare', 'epic', 'legendary'];

export function uiItemTooltipInk(role: UiItemTooltipLineRole): string {
  return role === 'itemLevel' ? UI_ITEM_INKS.flavour : UI_ITEM_INKS[role];
}
/** Uncommon and above take their quality rim; poor and common use the neutral rim. */
export function uiItemTooltipFrame(quality: UiItemQuality): `tooltip_dark.${'neutral' | UiItemQuality}` {
  return `tooltip_dark.${RIM_QUALITIES.includes(quality) ? quality : 'neutral'}`;
}
/** Left text wraps beside any right text; the right text sits on the first row. */
export function uiItemTooltipLineRows(line: Pick<UiItemTooltipLine, 'text' | 'right'>, width: number): string[] {
  const left = line.right ? Math.max(0, width - textWidth(line.right) - RIGHT_GAP) : width;
  return uiTextLines(line.text, left, 'body');
}

/** Content-fitted width between the minimum and the Gear-D4 maximum; long lines wrap at the maximum. */
export function uiItemTooltipWidth(model: UiItemTooltipModel): number {
  const lines = [...(model.unique ? [{ text: 'Unique' }] : []), ...model.lines] as readonly Pick<UiItemTooltipLine, 'text' | 'right'>[];
  const natural = Math.max(WELL + WELL_GAP + textWidth(model.name),
    ...lines.map(line => textWidth(line.text) + (line.right ? RIGHT_GAP + textWidth(line.right) : 0)),
    model.sellBronze !== undefined ? textWidth('Sell Price:') + 6 + uiCurrencyWidth(model.sellBronze) : 0);
  return Math.max(UI_ITEM_TOOLTIP_MIN_WIDTH, Math.min(UI_ITEM_TOOLTIP_WIDTH, natural + PADDING * 2));
}

function inkLine(kind: string, line: Pick<UiItemTooltipLine, 'text' | 'right'>, ink: string, role: string): UiElement {
  return new UiElement({ kind, label: line.right ? `${line.text} ${line.right}` : line.text, props: { text: line.text, right: line.right, role, ink },
    style: { width: 'grow', shrink: 0 },
    measure(_element, available) {
      const height = uiItemTooltipLineRows(line, available.width).length * glyph.lineHeight;
      return { min: { width: 0, height }, preferred: { width: available.width, height } };
    },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect;
      uiItemTooltipLineRows(line, r.width).forEach((row, index) => drawPixelText(context, art.pixel, row, r.x, r.y + index * glyph.lineHeight, { color: ink }));
      if (line.right) drawPixelText(context, art.pixel, line.right, r.x + r.width, r.y, { color: ink, align: 'right' });
    },
  });
}

function header(model: UiItemTooltipModel): UiElement {
  const ink = UI_ITEM_INKS.quality[model.quality];
  const wellInk = RIM_QUALITIES.includes(model.quality) ? ink : UI_ITEM_INKS.muted;
  const nameRows = (width: number) => uiTextLines(model.name, Math.max(0, width - WELL - WELL_GAP), 'body');
  const layout = (width: number) => {
    const rows = nameRows(width), textHeight = rows.length * glyph.lineHeight - (glyph.lineHeight - glyph.glyphHeight);
    const height = Math.max(WELL, textHeight);
    return { rows, height, top: Math.floor((height - textHeight) / 2) };
  };
  const icon = model.icon;
  const children = icon && !('artwork' in icon)
    ? [uiIcon(icon, { layout: { position: 'absolute', inset: { left: 2, top: 2 } } })] : [];
  return new UiElement({ kind: 'item-tooltip-header', label: model.name, props: { text: model.name, role: 'name', ink }, children,
    style: { width: 'grow', shrink: 0, display: 'stack' },
    measure(_element, available) {
      const { height } = layout(available.width);
      return { min: { width: 0, height }, preferred: { width: available.width, height } };
    },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, { rows, top } = layout(r.width);
      context.strokeStyle = wellInk; context.lineWidth = 1;
      context.strokeRect(r.x + 0.5, r.y + 0.5, WELL - 1, WELL - 1);
      if (icon && 'artwork' in icon) {
        const { artwork } = icon, metadata = artwork.metadata;
        const source = selectAtlasFrame(metadata, icon.animation ?? 'base', 0) ?? selectAtlasFrame(metadata, 'idle', 0)
          ?? selectAtlasFrame(metadata, Object.keys(metadata.animations)[0] ?? Object.keys(metadata.states ?? {})[0] ?? 'base', 0);
        if (source) {
          const factor = Math.min(1, 16 / source.width, 16 / source.height);
          const width = Math.max(1, Math.round(source.width * factor)), height = Math.max(1, Math.round(source.height * factor));
          context.imageSmoothingEnabled = false;
          context.drawImage(artwork.image, source.x, source.y, source.width, source.height,
            r.x + Math.floor((WELL - width) / 2), r.y + Math.floor((WELL - height) / 2), width, height);
        }
      }
      rows.forEach((row, index) => drawPixelText(context, art.pixel, row, r.x + WELL + WELL_GAP, r.y + top + index * glyph.lineHeight, { color: ink }));
    },
  });
}

function sections(model: UiItemTooltipModel): UiElement[] {
  const lines = [...(model.unique ? [{ role: 'body', text: 'Unique' } as const] : []), ...model.lines];
  const out = [header(model)];
  if (lines.length) out.push(uiFlex({ width: 'grow', gap: 0 }, lines.map(line => inkLine('item-tooltip-line', line, uiItemTooltipInk(line.role), line.role))));
  if (model.sellBronze !== undefined) {
    const label = inkLine('item-tooltip-sell-label', { text: 'Sell Price:' }, UI_ITEM_INKS.body, 'body');
    label.setStyle({ width: uiFixed(textWidth('Sell Price:')) });
    out.push(uiFlex({ direction: 'row', width: 'grow', gap: 6, align: 'center' }, [label, uiCurrency({ bronze: model.sellBronze })]));
  }
  return out;
}

/**
 * WoW-style item tooltip on the dark Gear-D4 frame: icon and quality-coloured
 * name, role-inked lines with optional right text, and a coin sell price. Its
 * inks come only from `UI_ITEM_INKS` (the documented exception to D5).
 */
export function uiItemTooltip(options: UiItemTooltipOptions) {
  let model: UiItemTooltipModel = options;
  const element = new UiElement({ id: options.id, kind: 'item-tooltip', label: options.name,
    props: { quality: options.quality, frame: uiItemTooltipFrame(options.quality), itemInks: true },
    style: { width: uiFixed(uiItemTooltipWidth(options)), height: 'fit', display: 'flex', direction: 'column', gap: 4, padding: PADDING, overflow: 'clip', shrink: 0, ...options.layout },
    children: sections(options),
    paint(self, { context, art }) {
      if (!art) return;
      if (art.missingArt) { paintUiMissingArt(context, self.rect, art); return; }
      paintUiSkin(context, art.skin.frame, String(self.props['frame']), self.rect);
    },
  });
  return Object.assign(element, {
    /** Replace the model, for example when the hovered item changes. */
    updateItemTooltip(next: UiItemTooltipModel) {
      if (next === model) return;
      model = next; element.label = next.name;
      element.setProps({ quality: next.quality, frame: uiItemTooltipFrame(next.quality) });
      element.setStyle({ width: uiFixed(uiItemTooltipWidth(next)) });
      const previous = [...element.children];
      element.replaceChildren(sections(next));
      for (const child of previous) child.dispose();
    },
  });
}
