import { coins, rarity } from './catalogue.js';
import type { Item, TooltipLine } from './items.js';
import { TOOLTIP_COLORS } from './items.js';
import { Raster } from './raster.js';
import { drawText, nineSlice, textWidth, type BitmapFont } from './sprites.js';

export interface TooltipAssets {
  readonly font: BitmapFont;
  /** `ui_orchard_tooltip_dark` frames by name (neutral, poor … legendary) and its nine-slice insets. */
  readonly panel: { readonly frames: Readonly<Record<string, Raster>>; readonly slice: readonly [number, number, number, number] };
  readonly coinGold: Raster;
  readonly coinSilver: Raster;
  readonly coinBronze: Raster;
}

const WIDTH = 204;
const PAD = 6;
const LINE = 10;
const RIM = '#5a6988';

function wrap(font: BitmapFont, text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(font, next) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const trim = (image: Raster): Raster => {
  const bounds = image.bounds()!;
  return image.crop(bounds.x, bounds.y, bounds.width, bounds.height);
};

/**
 * WoW-style item tooltip in the game's own 5×7 bitmap font and coin icons:
 * rarity-coloured name beside the icon, slot/type row, material and tier,
 * armour or damage, white primary attributes, green Equip effects, durability,
 * requirement, gold flavour text and the sell price in coins.
 */
export function renderTooltip(item: Item, assets: TooltipAssets): Raster {
  const { font } = assets;
  const inner = WIDTH - PAD * 2;
  const nameLines = wrap(font, item.name, inner - 24);
  type Row = { line: TooltipLine; wrapped: string[] };
  const rows: Row[] = item.lines.map((line) => ({
    line,
    wrapped: line.right ? [line.text] : wrap(font, line.text, inner),
  }));
  const headerHeight = Math.max(20, nameLines.length * LINE + 2);
  const bodyHeight = rows.reduce((sum, row) => sum + row.wrapped.length * LINE, 0);
  const height = PAD + headerHeight + 4 + bodyHeight + LINE + 4 + PAD;
  const out = new Raster(WIDTH, height);

  // Kit dark panel, nine-sliced; uncommon and above take their rarity rim.
  const frameName = ['uncommon', 'rare', 'epic', 'legendary'].includes(item.rarity) ? item.rarity : 'neutral';
  out.draw(nineSlice(assets.panel.frames[frameName]!, assets.panel.slice, WIDTH, height), 0, 0);
  const rimColor = frameName === 'neutral' ? RIM : rarity(item.rarity).color;

  // Icon in a small slot, name beside it.
  for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 20; x += 1) {
      const border = x === 0 || y === 0 || x === 19 || y === 19;
      out.set(PAD + x, PAD + y, border ? rimColor : '#2a2f4e');
    }
  }
  out.draw(item.icon, PAD + 2, PAD + 2);
  const nameColor = rarity(item.rarity).color;
  nameLines.forEach((text, index) => {
    drawText(out, font, text, PAD + 24, PAD + 1 + index * LINE + (nameLines.length === 1 ? 5 : 0), nameColor);
  });

  let y = PAD + headerHeight + 4;
  for (const { line, wrapped } of rows) {
    for (const text of wrapped) {
      drawText(out, font, text, PAD, y, line.color);
      if (line.right) drawText(out, font, line.right, WIDTH - PAD - textWidth(font, line.right), y, line.color);
      y += LINE;
    }
  }

  // Sell price with the game's coin icons.
  y += 2;
  drawText(out, font, 'Sell Price:', PAD, y, TOOLTIP_COLORS.white);
  let x = PAD + textWidth(font, 'Sell Price:') + 5;
  const purse = coins(item.sellBronze);
  const parts: [number, Raster][] = [[purse.gold, assets.coinGold], [purse.silver, assets.coinSilver], [purse.bronze, assets.coinBronze]];
  const firstShown = parts.findIndex(([value]) => value > 0);
  for (const [value, coin] of parts.slice(Math.max(0, firstShown))) {
    const label = String(value);
    drawText(out, font, label, x, y, TOOLTIP_COLORS.white);
    x += textWidth(font, label) + 2;
    const icon = trim(coin);
    out.draw(icon, x, y + Math.floor((7 - icon.height) / 2));
    x += icon.width + 5;
  }
  return out;
}
