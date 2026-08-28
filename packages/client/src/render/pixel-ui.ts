import { loadGeneratedAsset, type LoadedAsset } from './assets.js';
import { selectAtlasFrame, type AtlasFrame } from './sprite.js';

const FALLBACK_CHARSET = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~×→♪♥☀❄';

export interface PixelUi {
  readonly font: LoadedAsset;
  readonly headerFont: LoadedAsset;
  readonly panel: LoadedAsset;
}

export interface PixelTextOptions {
  readonly align?: CanvasTextAlign;
  readonly scale?: number;
  readonly color?: string;
  readonly font?: 'body' | 'header';
}

export type PixelTextOverflow = 'ellipsis' | 'clip';

export interface PixelTextRectOptions extends PixelTextOptions {
  readonly verticalAlign?: 'top' | 'center' | 'bottom';
  readonly overflow?: PixelTextOverflow;
  readonly paddingX?: number;
  readonly paddingY?: number;
}

export interface PixelTextRectLayout {
  readonly text: string;
  readonly content: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly x: number;
  readonly y: number;
  readonly renderedWidth: number;
  readonly overflowed: boolean;
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

/** Returns an ellipsized string whose bitmap glyphs fit the supplied width.
 * If even `...` cannot fit, the suffix is reduced to two dots, one dot, then
 * an empty label. The result therefore never exceeds its render contract. */
export function fitPixelText(
  text: string,
  maximumWidth: number,
  scale = 1,
  asset?: Pick<LoadedAsset, 'font'>,
  suffix = '...',
): string {
  const available = Math.max(0, Math.floor(maximumWidth));
  if (measurePixelText(text, scale, asset) <= available) return text;
  let fittedSuffix = suffix;
  while (fittedSuffix.length > 0 && measurePixelText(fittedSuffix, scale, asset) > available) {
    fittedSuffix = fittedSuffix.slice(0, -1);
  }
  if (fittedSuffix.length === 0) return '';
  let prefix = text;
  while (prefix.length > 0
    && measurePixelText(`${prefix.trimEnd()}${fittedSuffix}`, scale, asset) > available) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix.trimEnd()}${fittedSuffix}`;
}

/** Measures one line inside a bounded face. Drawing and hit geometry can share
 * this result, and callers may add outlines without losing the same clipping. */
export function layoutPixelTextInRect(
  ui: PixelUi,
  text: string,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  options: PixelTextRectOptions = {},
): PixelTextRectLayout {
  const paddingX = Math.max(0, options.paddingX ?? 0);
  const paddingY = Math.max(0, options.paddingY ?? 0);
  const content = {
    x: bounds.x + paddingX,
    y: bounds.y + paddingY,
    width: Math.max(0, bounds.width - paddingX * 2),
    height: Math.max(0, bounds.height - paddingY * 2),
  };
  const asset = options.font === 'header' ? ui.headerFont : ui.font;
  const scale = options.scale ?? 1;
  const measured = measurePixelText(text, scale, asset);
  const overflowed = measured > content.width;
  const fitted = overflowed && (options.overflow ?? 'ellipsis') === 'ellipsis'
    ? fitPixelText(text, content.width, scale, asset)
    : text;
  const renderedWidth = measurePixelText(fitted, scale, asset);
  const glyphHeight = fontMetrics(asset).glyphHeight * scale;
  const align = options.align ?? 'left';
  const x = align === 'center'
    ? content.x + content.width / 2
    : align === 'right' || align === 'end'
      ? content.x + content.width
      : content.x;
  const verticalAlign = options.verticalAlign ?? 'top';
  const y = verticalAlign === 'center'
    ? content.y + Math.floor((content.height - glyphHeight) / 2)
    : verticalAlign === 'bottom'
      ? content.y + content.height - glyphHeight
      : content.y;
  return { text: fitted, content, x, y, renderedWidth, overflowed };
}

/** Draws one bitmap line and hard-clips it to the assigned content face. */
export function drawPixelTextInRect(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  text: string,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  options: PixelTextRectOptions = {},
): PixelTextRectLayout {
  const layout = layoutPixelTextInRect(ui, text, bounds, options);
  if (layout.content.width <= 0 || layout.content.height <= 0) return layout;
  context.save();
  context.beginPath();
  context.rect(layout.content.x, layout.content.y, layout.content.width, layout.content.height);
  context.clip();
  drawPixelText(context, ui, layout.text, layout.x, layout.y, options);
  context.restore();
  return layout;
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
  options: PixelTextOptions = {},
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

/** Bitmap-font outline rendered as eight one-pixel neighbours, preserving the
 * crisp authored glyph instead of applying a browser-smoothed text stroke. */
export function drawOutlinedPixelText(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  text: string,
  x: number,
  y: number,
  options: PixelTextOptions & { readonly outlineColor?: string } = {},
): void {
  const outlineColor = options.outlineColor ?? '#f8ead0';
  for (const [offsetX, offsetY] of [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const) {
    drawPixelText(context, ui, text, x + offsetX, y + offsetY, { ...options, color: outlineColor });
  }
  drawPixelText(context, ui, text, x, y, options);
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
