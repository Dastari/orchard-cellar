import { loadGeneratedAsset, type LoadedAsset } from './assets.js';
import { selectAtlasFrame, type AtlasFrame } from './sprite.js';

const FONT_5X7_CHARSET = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~×→♪♥☀❄';

export interface PixelUi {
  readonly font: LoadedAsset;
  readonly panel: LoadedAsset;
}

export async function loadPixelUi(): Promise<PixelUi> {
  const [font, panel] = await Promise.all([
    loadGeneratedAsset('font_5x7', 'summer'),
    loadGeneratedAsset('ui_panel_9slice', 'summer'),
  ]);
  return { font, panel };
}

function baseFrame(asset: LoadedAsset): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, 'base');
}

export function measurePixelText(text: string, scale = 1): number {
  return Math.max(0, text.length * 6 * scale - scale);
}

export function drawPixelText(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  text: string,
  x: number,
  y: number,
  options: { readonly align?: CanvasTextAlign; readonly scale?: number } = {},
): void {
  const frame = baseFrame(ui.font);
  if (frame === null) return;
  const scale = options.scale ?? 1;
  const width = measurePixelText(text, scale);
  let cursor = x;
  if (options.align === 'center') cursor -= Math.floor(width / 2);
  else if (options.align === 'right' || options.align === 'end') cursor -= width;
  for (const character of text) {
    const glyphIndex = FONT_5X7_CHARSET.indexOf(character);
    if (glyphIndex >= 0) {
      const sourceX = frame.x + glyphIndex % 16 * 6;
      const sourceY = frame.y + Math.floor(glyphIndex / 16) * 8;
      context.drawImage(ui.font.image, sourceX, sourceY, 5, 7, Math.round(cursor), Math.round(y), 5 * scale, 7 * scale);
    }
    cursor += 6 * scale;
  }
}

export function drawPixelPanel(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const frame = baseFrame(ui.panel);
  if (frame === null) return;
  const edge = 5;
  const middle = frame.width - edge * 2;
  const targetMiddleWidth = Math.max(1, width - edge * 2);
  const targetMiddleHeight = Math.max(1, height - edge * 2);
  const columns = [0, edge, frame.width - edge];
  const rows = [0, edge, frame.height - edge];
  const sourceWidths = [edge, middle, edge];
  const sourceHeights = [edge, middle, edge];
  const targetX = [x, x + edge, x + width - edge];
  const targetY = [y, y + edge, y + height - edge];
  const targetWidths = [edge, targetMiddleWidth, edge];
  const targetHeights = [edge, targetMiddleHeight, edge];
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
    context.drawImage(
      ui.panel.image,
      frame.x + (columns[column] ?? 0), frame.y + (rows[row] ?? 0),
      sourceWidths[column] ?? 1, sourceHeights[row] ?? 1,
      Math.round(targetX[column] ?? x), Math.round(targetY[row] ?? y),
      targetWidths[column] ?? 1, targetHeights[row] ?? 1,
    );
  }
}
