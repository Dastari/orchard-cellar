/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { UiRect } from '../../geometry.js';
import { UiRoot } from '../runtime/root.js';
import type { UiElement } from '../runtime/element.js';
import { UI_ITEM_INKS, UI_ITEM_QUALITIES } from '../tokens.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { ui } from './index.js';
import {
  UI_ITEM_TOOLTIP_LINE_ROLES, UI_ITEM_TOOLTIP_MIN_WIDTH, UI_ITEM_TOOLTIP_WIDTH, uiItemTooltip, uiItemTooltipFrame, uiItemTooltipInk, uiItemTooltipWidth,
  type UiItemTooltipModel,
} from './item-tooltip.js';

const all = (element: UiElement): UiElement[] => [element, ...element.children.flatMap(all)];
const byKind = (element: UiElement, kind: string) => all(element).filter(node => node.kind === kind);
function mount(model: UiItemTooltipModel, scale: 1 | 2 = 1) {
  const root = new UiRoot({ scale }); root.resize(320, 400);
  const tooltip = uiItemTooltip(model); root.mount(tooltip); root.arrange();
  return { root, tooltip };
}
const bonecrippler: UiItemTooltipModel = {
  name: 'The Bonecrippler', quality: 'legendary', unique: true, sellBronze: 116017n, icon: { cf: 'sword' },
  lines: [
    { role: 'body', text: 'Two-Hand', right: 'Mace' },
    { role: 'itemLevel', text: 'Item Level 58' },
    { role: 'muted', text: 'Blackiron' },
    { role: 'body', text: '50 Damage', right: 'Slow' },
    { role: 'equip', text: 'Equip: Increases critical strike chance by 6%.' },
    { role: 'unmet', text: 'Requires Level 50' },
    { role: 'flavour', text: '"It has never needed a second swing."' },
  ],
};

describe('item tooltip', () => {
  it('is registered as ui.itemTooltip', () => {
    expect(ui.itemTooltip).toBe(uiItemTooltip);
  });
  it('fits its content between the minimum and maximum width while its height grows with lines', () => {
    const short = mount({ name: 'Iron Sallet', quality: 'common', lines: [{ role: 'body', text: 'Head', right: 'Plate' }] });
    const long = mount({ ...bonecrippler, lines: [...bonecrippler.lines, ...bonecrippler.lines] });
    expect(short.tooltip.rect.width).toBe(uiItemTooltipWidth({ name: 'Iron Sallet', quality: 'common', lines: [{ role: 'body', text: 'Head', right: 'Plate' }] }));
    expect(short.tooltip.rect.width).toBeGreaterThanOrEqual(UI_ITEM_TOOLTIP_MIN_WIDTH);
    expect(short.tooltip.rect.width).toBeLessThan(UI_ITEM_TOOLTIP_WIDTH);
    expect(long.tooltip.rect.width).toBe(UI_ITEM_TOOLTIP_WIDTH);
    expect(long.tooltip.rect.height).toBeGreaterThan(short.tooltip.rect.height);
    const one = mount({ name: 'X', quality: 'common', lines: [{ role: 'body', text: 'a' }] }).tooltip.rect.height;
    const two = mount({ name: 'X', quality: 'common', lines: [{ role: 'body', text: 'a' }, { role: 'body', text: 'b' }] }).tooltip.rect.height;
    expect(two - one).toBe(10);
    // Scale changes device pixels, not logical layout.
    expect(mount(bonecrippler, 2).tooltip.rect).toEqual(mount(bonecrippler).tooltip.rect);
    short.root.dispose(); long.root.dispose();
  });
  it('wraps long line text inside the tooltip width', () => {
    const { tooltip, root } = mount({ name: 'Rod', quality: 'rare', lines: [{ role: 'equip', text: 'Equip: Crops you tend grow one stage sooner while this staff is equipped.' }] });
    const [line] = byKind(tooltip, 'item-tooltip-line');
    expect(line!.rect.height).toBe(30);
    expect(line!.rect.x + line!.rect.width).toBeLessThanOrEqual(tooltip.rect.x + UI_ITEM_TOOLTIP_WIDTH - 6);
    root.dispose();
  });
  it('wraps a long name beside the icon well in the quality ink', () => {
    const single = mount({ name: 'Frostwhisper', quality: 'legendary', lines: [] });
    const double = mount({ name: 'Emberwake, Blade of the Last Hearth', quality: 'legendary', lines: [] });
    const [a] = byKind(single.tooltip, 'item-tooltip-header'), [b] = byKind(double.tooltip, 'item-tooltip-header');
    expect(a!.rect.height).toBe(20);
    expect(b!.rect.height).toBe(20);
    const triple = mount({ name: 'Bulwark of the Hundred Winters of the Long Night Eternal', quality: 'epic', lines: [] });
    expect(byKind(triple.tooltip, 'item-tooltip-header')[0]!.rect.height).toBe(27);
    expect(b!.props['ink']).toBe(UI_ITEM_INKS.quality.legendary);
    single.root.dispose(); double.root.dispose(); triple.root.dispose();
  });
  it('maps every line role to its UI_ITEM_INKS entry and adds Unique for unique items', () => {
    const expected = { body: UI_ITEM_INKS.body, muted: UI_ITEM_INKS.muted, equip: UI_ITEM_INKS.equip, flavour: UI_ITEM_INKS.flavour, unmet: UI_ITEM_INKS.unmet, itemLevel: UI_ITEM_INKS.flavour };
    for (const role of UI_ITEM_TOOLTIP_LINE_ROLES) expect(uiItemTooltipInk(role), role).toBe(expected[role]);
    const { tooltip, root } = mount(bonecrippler);
    const lines = byKind(tooltip, 'item-tooltip-line');
    expect(lines[0]!.props).toMatchObject({ text: 'Unique', role: 'body', ink: UI_ITEM_INKS.body });
    for (const [index, line] of bonecrippler.lines.entries()) expect(lines[index + 1]!.props['ink']).toBe(expected[line.role]);
    root.dispose();
  });
  it('chooses the neutral frame below uncommon and the quality rim from uncommon up', () => {
    expect(UI_ITEM_QUALITIES.map(uiItemTooltipFrame)).toEqual(['tooltip_dark.neutral', 'tooltip_dark.neutral',
      'tooltip_dark.uncommon', 'tooltip_dark.rare', 'tooltip_dark.epic', 'tooltip_dark.legendary']);
    const { tooltip, root } = mount({ name: 'Iron Sallet', quality: 'common', lines: [] });
    expect(tooltip.props['frame']).toBe('tooltip_dark.neutral');
    tooltip.updateItemTooltip({ ...bonecrippler, quality: 'epic' }); root.arrange();
    expect(tooltip.props['frame']).toBe('tooltip_dark.epic');
    expect(byKind(tooltip, 'item-tooltip-line')).toHaveLength(bonecrippler.lines.length + 1);
    root.dispose();
  });
  it('shows a sell price row only when the item has one', () => {
    const priced = mount(bonecrippler), free = mount({ ...bonecrippler, sellBronze: undefined });
    expect(byKind(priced.tooltip, 'currency')[0]!.label).toBe('11g 60s 17b');
    expect(byKind(free.tooltip, 'currency')).toHaveLength(0);
    expect(free.tooltip.rect.height).toBeLessThan(priced.tooltip.rect.height);
    priced.root.dispose(); free.root.dispose();
  });
});

describe('item tooltip paint', () => {
  const hex = (data: Uint8ClampedArray | Buffer, index: number) => `#${[0, 1, 2].map(offset => data[index + offset]!.toString(16).padStart(2, '0')).join('')}`;
  async function render(model: UiItemTooltipModel) {
    const art = await uiTestArt();
    const root = new UiRoot({ art, scale: 1 }); root.resize(UI_ITEM_TOOLTIP_WIDTH, 400);
    const tooltip = uiItemTooltip(model); root.mount(tooltip); root.arrange();
    const canvas = createCanvas(UI_ITEM_TOOLTIP_WIDTH, 400), context = canvas.getContext('2d');
    root.draw(context as unknown as CanvasRenderingContext2D, 0);
    const pixels = context.getImageData(0, 0, UI_ITEM_TOOLTIP_WIDTH, 400).data;
    const colours = (rect: UiRect) => {
      const found = new Set<string>();
      for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
        const index = (y * UI_ITEM_TOOLTIP_WIDTH + x) * 4; if (pixels[index + 3] === 255) found.add(hex(pixels, index));
      }
      return found;
    };
    return { root, tooltip, colours, pixel: (x: number, y: number) => hex(pixels, (y * UI_ITEM_TOOLTIP_WIDTH + x) * 4) };
  }
  const frame = JSON.parse(readFileSync(new URL('../../../../assets/ui/ui_orchard_tooltip_dark.sprite.json', import.meta.url), 'utf8')) as
    { frames: Record<string, string[][]>; sourcePalette: Record<string, string> };
  const rim = (name: string) => frame.sourcePalette[frame.frames[name]![0]![1]![5]!]!;

  it('paints the quality rim, role inks, name ink and coins with real art', async () => {
    const { root, tooltip, colours, pixel } = await render(bonecrippler);
    expect(pixel(5, 1)).toBe(rim('legendary'));
    const header = byKind(tooltip, 'item-tooltip-header')[0]!;
    expect(colours(header.rect).has(UI_ITEM_INKS.quality.legendary)).toBe(true);
    const lines = byKind(tooltip, 'item-tooltip-line');
    for (const line of lines) {
      const found = colours(line.rect);
      expect(found.has(String(line.props['ink'])), String(line.props['text'])).toBe(true);
      for (const ink of [UI_ITEM_INKS.equip, UI_ITEM_INKS.unmet, UI_ITEM_INKS.muted]) if (ink !== line.props['ink']) expect(found.has(ink)).toBe(false);
    }
    // Right-aligned text ends at the content edge.
    const typed = lines[1]!, right = typed.rect.x + typed.rect.width;
    const ink = String(typed.props['ink']);
    const columns = [...Array(typed.rect.width).keys()].map(dx => colours({ x: typed.rect.x + dx, y: typed.rect.y, width: 1, height: 7 }).has(ink));
    expect(columns.lastIndexOf(true) + typed.rect.x).toBeLessThan(right);
    expect(columns.lastIndexOf(true) + typed.rect.x).toBeGreaterThanOrEqual(right - 2);
    const coin = JSON.parse(readFileSync(new URL('../../../../assets/ui/ui_cf_coin_gold.sprite.json', import.meta.url), 'utf8')) as { sourcePalette: Record<string, string> };
    const currency = byKind(tooltip, 'currency')[0]!;
    expect(colours(currency.rect).has(coin.sourcePalette['2']!)).toBe(true);
    expect(colours(currency.rect).has(UI_ITEM_INKS.body)).toBe(true);
    root.dispose();
  });
  it('uses the neutral rim for poor and common items and paints item artwork', async () => {
    const artwork = uiTestAsset('ui_cf_coin_silver');
    const { root, pixel, colours, tooltip } = await render({ name: 'Rusted Iron Arming Sword', quality: 'poor', icon: { artwork }, lines: [] });
    expect(pixel(5, 1)).toBe(rim('neutral'));
    const header = byKind(tooltip, 'item-tooltip-header')[0]!;
    expect(colours({ ...header.rect, width: 20, height: 20 }).has(UI_ITEM_INKS.muted)).toBe(true);
    expect(colours({ x: header.rect.x + 2, y: header.rect.y + 2, width: 16, height: 16 }).size).toBeGreaterThan(1);
    root.dispose();
  });
});
