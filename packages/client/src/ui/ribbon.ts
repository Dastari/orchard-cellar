import {
  drawPixelText,
  fitPixelText,
  fontMetrics,
  measurePixelText,
  type PixelUi,
} from '../render/pixel-ui.js';
import type { LoadedAsset } from '../render/assets.js';
import type { UiRect } from './geometry.js';
import { snapRectForContext } from './nine-slice.js';
import { uiAssetFrame } from './skin.js';

const BANNER_NATURAL_WIDTH = 78;
const TEXT_FACE_PADDING = 54;
const GROW_PADDING = 64;
const FACE_HORIZONTAL_INSET = TEXT_FACE_PADDING / 2;
const FACE_TOP = 3;
const BOTTOM_FOLD_HEIGHT = 8;
export const STACKED_RIBBON_HEIGHT = 34;
/** The banner sprite includes lower folds/shadow outside its writable face, so
 * centring against the full 21px image puts every label visibly too low. */
export const RIBBON_TEXT_TOP_OFFSET = 5;

export type RibbonOverflow = 'grow' | 'ellipsis' | 'clip';

export interface RibbonDrawOptions {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  /** `grow` measures the whole label. Supplying maxWidth defaults to ellipsis. */
  readonly overflow?: RibbonOverflow;
}
export interface RibbonFixedTextOptions {
  readonly overflow?: Exclude<RibbonOverflow, 'grow'>;
}

export interface RibbonDrawResult extends UiRect {
  readonly renderedLabel: string;
  readonly overflowed: boolean;
  readonly face: UiRect;
}

export function ribbonWidth(label: string, fonts: PixelUi): number {
  const measured = measurePixelText(label, 1, fonts.font);
  return measured <= BANNER_NATURAL_WIDTH - TEXT_FACE_PADDING
    ? BANNER_NATURAL_WIDTH
    : measured + GROW_PADDING;
}

/** Writable face excludes both folded tails and the lower shadow/fold band. */
export function ribbonTextFace(rect: UiRect): UiRect {
  const inset = Math.min(FACE_HORIZONTAL_INSET, Math.max(0, rect.width / 2));
  const top = Math.min(FACE_TOP, rect.height);
  const bottom = Math.min(BOTTOM_FOLD_HEIGHT, Math.max(0, rect.height - top));
  return {
    x: rect.x + inset,
    y: rect.y + top,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - top - bottom),
  };
}

export function fitRibbonLabel(
  label: string,
  width: number,
  fonts: PixelUi,
  font: 'body' | 'header' = 'body',
): string {
  const asset = font === 'header' ? fonts.headerFont : fonts.font;
  return fitPixelText(label, Math.max(0, width - TEXT_FACE_PADDING), 1, asset);
}

/** A fixed-pixel ribbon whose flat center tiles to fit its label. */
export class Ribbon {
  constructor(private readonly asset: LoadedAsset, private readonly fonts: PixelUi) {}

  private drawChrome(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean {
    const source = uiAssetFrame(this.asset);
    if (!source || width <= 0 || height <= 0) return false;
    context.imageSmoothingEnabled = false;
    // Stretch exactly one clean centre column. Repeating a wider strip also
    // repeats isolated fold pixels from the transparent lower band, which
    // appears as vertical ticks hanging below long ribbons.
    const sourceLeft = Math.max(1, Math.floor(source.width / 2));
    const sourceMiddleWidth = 1;
    const sourceRight = Math.max(1, source.width - sourceLeft - sourceMiddleWidth);
    const sourceTop = Math.min(6, source.height);
    const sourceBottom = Math.min(BOTTOM_FOLD_HEIGHT, Math.max(0, source.height - sourceTop));
    const sourceMiddleHeight = Math.max(0, source.height - sourceTop - sourceBottom);

    const fitFixedPair = (total: number, before: number, after: number): readonly [number, number] => {
      if (before + after <= total) return [before, after];
      const fittedBefore = Math.floor(total * before / Math.max(1, before + after));
      return [fittedBefore, total - fittedBefore];
    };
    const [targetLeft, targetRight] = fitFixedPair(width, sourceLeft, sourceRight);
    const [targetTop, targetBottom] = fitFixedPair(height, sourceTop, sourceBottom);
    const sourceWidths = [sourceLeft, sourceMiddleWidth, sourceRight];
    const sourceHeights = [sourceTop, sourceMiddleHeight, sourceBottom];
    const targetWidths = [targetLeft, Math.max(0, width - targetLeft - targetRight), targetRight];
    const targetHeights = [targetTop, Math.max(0, height - targetTop - targetBottom), targetBottom];
    let sourceY = source.y;
    let targetY = y;
    for (let row = 0; row < 3; row += 1) {
      let sourceX = source.x;
      let targetX = x;
      for (let column = 0; column < 3; column += 1) {
        const sourceWidth = sourceWidths[column]!;
        const sourceHeight = sourceHeights[row]!;
        const targetWidth = targetWidths[column]!;
        const targetHeight = targetHeights[row]!;
        if (sourceWidth > 0 && sourceHeight > 0 && targetWidth > 0 && targetHeight > 0) {
          const destination = snapRectForContext(context, {
            x: targetX, y: targetY, width: targetWidth, height: targetHeight,
          });
          context.drawImage(
            this.asset.image,
            sourceX, sourceY, sourceWidth, sourceHeight,
            destination.x, destination.y, destination.width, destination.height,
          );
        }
        sourceX += sourceWidth;
        targetX += targetWidth;
      }
      sourceY += sourceHeights[row]!;
      targetY += targetHeights[row]!;
    }
    return true;
  }

  private clippedLabel(
    context: CanvasRenderingContext2D,
    label: string,
    rect: UiRect,
    font: 'body' | 'header',
    y: number,
    overflow: Exclude<RibbonOverflow, 'grow'>,
  ): { readonly renderedLabel: string; readonly overflowed: boolean; readonly face: UiRect } {
    const face = ribbonTextFace(rect);
    const asset = font === 'header' ? this.fonts.headerFont : this.fonts.font;
    const overflowed = measurePixelText(label, 1, asset) > face.width;
    const renderedLabel = overflowed && overflow === 'ellipsis'
      ? fitPixelText(label, face.width, 1, asset)
      : label;
    if (face.width > 0 && face.height > 0 && renderedLabel.length > 0) {
      context.save();
      context.beginPath();
      context.rect(face.x, face.y, face.width, face.height);
      context.clip();
      drawPixelText(context, this.fonts, renderedLabel, rect.x + rect.width / 2, y, {
        align: 'center', color: '#4d2e22', font,
      });
      context.restore();
    }
    return { renderedLabel, overflowed, face };
  }

  draw(
    context: CanvasRenderingContext2D,
    label: string,
    centerX: number,
    y: number,
    options: RibbonDrawOptions = {},
  ): RibbonDrawResult | null {
    const source = uiAssetFrame(this.asset);
    if (!source) return null;
    const overflow = options.overflow ?? (options.maxWidth === undefined ? 'grow' : 'ellipsis');
    const naturalWidth = Math.max(source.width, options.minWidth ?? 0);
    const measured = measurePixelText(label, 1, this.fonts.font);
    const measuredWidth = measured <= naturalWidth - TEXT_FACE_PADDING
      ? naturalWidth
      : measured + GROW_PADDING;
    const width = overflow === 'grow' || options.maxWidth === undefined
      ? measuredWidth
      : Math.max(1, Math.min(measuredWidth, options.maxWidth));
    const x = Math.round(centerX - width / 2);
    const rect = { x, y, width, height: source.height };
    this.drawChrome(context, rect.x, rect.y, rect.width, rect.height);
    const fitted = this.clippedLabel(
      context,
      label,
      rect,
      'body',
      y + RIBBON_TEXT_TOP_OFFSET,
      overflow === 'grow' ? 'clip' : overflow,
    );
    return { ...rect, ...fitted };
  }

  /** A fixed-width single-line HUD ribbon. Fixed faces ellipsize by default. */
  drawSingle(
    context: CanvasRenderingContext2D,
    label: string,
    rect: UiRect,
    options: RibbonFixedTextOptions = {},
  ): RibbonDrawResult | null {
    if (!this.drawChrome(context, rect.x, rect.y, rect.width, rect.height)) return null;
    const face = ribbonTextFace(rect);
    const glyphHeight = fontMetrics(this.fonts.headerFont).glyphHeight;
    const textY = face.y + Math.floor((face.height - glyphHeight) / 2);
    const fitted = this.clippedLabel(context, label, rect, 'header', textY, options.overflow ?? 'ellipsis');
    return { ...rect, ...fitted };
  }

  /** A taller location banner. Title and subtitle each fit the same safe face. */
  drawStacked(
    context: CanvasRenderingContext2D,
    titleText: string,
    subtitle: string,
    rect: UiRect,
    options: RibbonFixedTextOptions = {},
  ): RibbonDrawResult | null {
    if (!this.drawChrome(context, rect.x, rect.y, rect.width, rect.height)) return null;
    const overflow = options.overflow ?? 'ellipsis';
    const face = ribbonTextFace(rect);
    const titleHeight = fontMetrics(this.fonts.headerFont).glyphHeight;
    const bodyHeight = fontMetrics(this.fonts.font).glyphHeight;
    const title = this.clippedLabel(context, titleText, rect, 'header', face.y, overflow);
    const subtitleY = face.y + face.height - bodyHeight;
    if (subtitleY >= face.y + titleHeight + 1) {
      this.clippedLabel(context, subtitle, rect, 'body', subtitleY, overflow);
    }
    return { ...rect, ...title };
  }
}
