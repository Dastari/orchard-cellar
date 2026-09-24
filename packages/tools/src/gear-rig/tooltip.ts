import { coins, rarity } from './catalogue.js';
import type { Item, TooltipLine } from './items.js';
import { TOOLTIP_COLORS } from './items.js';
import { Raster } from './raster.js';
import { drawText, textWidth, type BitmapFont } from './sprites.js';

export interface TooltipAssets {
  readonly font: BitmapFont;
  readonly coinGold: Raster;
  readonly coinSilver: Raster;
  readonly coinBronze: Raster;
}

const WIDTH = 204;
const PAD = 6;
const LINE = 10;
const PANEL = '#1d1a2b';
const RIM = '#5a6988';
const OUTLINE = '#0e071b';

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

  // Panel with a one-pixel rim; epic and legendary rims take the rarity colour.
  const rimColor = item.rarity === 'epic' || item.rarity === 'legendary' ? rarity(item.rarity).color : RIM;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const edge = x === 0 || y === 0 || x === WIDTH - 1 || y === height - 1;
      const rim = x === 1 || y === 1 || x === WIDTH - 2 || y === height - 2;
      const corner = (x < 2 || x > WIDTH - 3) && (y < 2 || y > height - 3);
      if (corner && (x === 0 || x === WIDTH - 1) && (y === 0 || y === height - 1)) continue;
      out.set(x, y, edge ? OUTLINE : rim ? rimColor : PANEL, edge || rim ? 255 : 245);
    }
  }

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
