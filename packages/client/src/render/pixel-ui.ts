import { loadGeneratedAsset, type LoadedAsset } from './assets.js';
import { selectAtlasFrame, type AtlasFrame } from './sprite.js';

const FALLBACK_CHARSET = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~×→♪♥☀❄';

export interface PixelUi {
  readonly font: LoadedAsset;
  readonly headerFont: LoadedAsset;
  readonly panel: LoadedAsset;
}

interface FontMetrics {
  readonly charset: string;
  readonly glyphWidth: number;
  readonly glyphHeight: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
}

export async function loadPixelUi(): Promise<PixelUi> {
  const [font, headerFont, panel] = await Promise.all([
    loadGeneratedAsset('font_5x7', 'summer'),
    loadGeneratedAsset('font_8x12', 'summer'),
    loadGeneratedAsset('ui_panel_9slice', 'summer'),
  ]);
  return { font, headerFont, panel };
}

function baseFrame(asset: LoadedAsset): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, 'base');
}

export function fontMetrics(asset?: Pick<LoadedAsset, 'font'>): FontMetrics {
  return {
    charset: asset?.font?.charset ?? FALLBACK_CHARSET,
    glyphWidth: asset?.font?.glyphSize[0] ?? 5,
    glyphHeight: asset?.font?.glyphSize[1] ?? 7,
    cellWidth: asset?.font?.cellSize[0] ?? 6,
    cellHeight: asset?.font?.cellSize[1] ?? 8,
    columns: asset?.font?.columns ?? 16,
  };
}

export function panelSlice(asset?: Pick<LoadedAsset, 'slice'>): readonly [number, number, number, number] {
  return asset?.slice ?? [4, 4, 4, 4];
}

export function measurePixelText(text: string, scale = 1, asset?: Pick<LoadedAsset, 'font'>): number {
  const metrics = fontMetrics(asset);
  return Math.max(0, text.length * metrics.cellWidth * scale - (metrics.cellWidth - metrics.glyphWidth) * scale);
}

const tintedFonts = new Map<string, HTMLCanvasElement>();

function tintedFont(asset: LoadedAsset, frame: AtlasFrame, color: string): CanvasImageSource {
  const key = `${asset.atlasRevision}:${asset.assetId}:${color.toLowerCase()}`;
  const cached = tintedFonts.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) return asset.image;
  context.imageSmoothingEnabled = false;
  context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, frame.width, frame.height);
  context.globalCompositeOperation = 'source-over';
  tintedFonts.set(key, canvas);
  return canvas;
}

export function drawPixelText(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  text: string,
  x: number,
  y: number,
  options: {
    readonly align?: CanvasTextAlign;
    readonly scale?: number;
    readonly color?: string;
    readonly font?: 'body' | 'header';
  } = {},
): void {
  const asset = options.font === 'header' ? ui.headerFont : ui.font;
  const frame = baseFrame(asset);
  if (frame === null) return;
  const metrics = fontMetrics(asset);
  const scale = options.scale ?? 1;
  const width = measurePixelText(text, scale, asset);
  let cursor = x;
  if (options.align === 'center') cursor -= Math.floor(width / 2);
  else if (options.align === 'right' || options.align === 'end') cursor -= width;
  const image = options.color ? tintedFont(asset, frame, options.color) : asset.image;
  const frameX = options.color ? 0 : frame.x;
  const frameY = options.color ? 0 : frame.y;
  for (const character of text) {
    const glyphIndex = metrics.charset.indexOf(character);
    if (glyphIndex >= 0) {
      const sourceX = frameX + glyphIndex % metrics.columns * metrics.cellWidth;
      const sourceY = frameY + Math.floor(glyphIndex / metrics.columns) * metrics.cellHeight;
      context.drawImage(
        image,
        sourceX,
        sourceY,
        metrics.glyphWidth,
        metrics.glyphHeight,
        Math.round(cursor),
        Math.round(y),
        metrics.glyphWidth * scale,
        metrics.glyphHeight * scale,
      );
    }
    cursor += metrics.cellWidth * scale;
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
  const [left, top, right, bottom] = panelSlice(ui.panel);
  const sourceMiddleWidth = frame.width - left - right;
  const sourceMiddleHeight = frame.height - top - bottom;
  const targetMiddleWidth = Math.max(1, width - left - right);
  const targetMiddleHeight = Math.max(1, height - top - bottom);
  const columns = [0, left, frame.width - right];
  const rows = [0, top, frame.height - bottom];
  const sourceWidths = [left, sourceMiddleWidth, right];
  const sourceHeights = [top, sourceMiddleHeight, bottom];
  const targetX = [x, x + left, x + width - right];
  const targetY = [y, y + top, y + height - bottom];
  const targetWidths = [left, targetMiddleWidth, right];
  const targetHeights = [top, targetMiddleHeight, bottom];
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
