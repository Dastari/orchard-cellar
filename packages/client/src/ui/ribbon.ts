import { drawPixelText, fontMetrics, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { LoadedAsset } from '../render/assets.js';
import type { UiRect } from './geometry.js';
import { uiAssetFrame } from './skin.js';

const NATURAL_WIDTH = 78;
const CAP_WIDTH = 30;
const MIDDLE_WIDTH = NATURAL_WIDTH - CAP_WIDTH * 2;
const TEXT_PADDING = 40;
const BOTTOM_FOLD_HEIGHT = 8;
export const STACKED_RIBBON_HEIGHT = 34;
/** The banner sprite includes lower folds/shadow outside its writable face, so
 * centring against the full 21px image puts every label visibly too low. */
export const RIBBON_TEXT_TOP_OFFSET = 5;

export function ribbonWidth(label: string, fonts: PixelUi): number {
  return Math.max(NATURAL_WIDTH, measurePixelText(label, 1, fonts.font) + TEXT_PADDING);
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
    if (!source) return false;
    context.imageSmoothingEnabled = false;
    const topHeight = 6;
    const bottomHeight = 8;
    const sourceMiddleHeight = source.height - topHeight - bottomHeight;
    const targetMiddleHeight = height - topHeight - bottomHeight;
    const drawSegment = (sourceX: number, sourceWidth: number, targetX: number, targetWidth: number): void => {
      context.drawImage(
        this.asset.image,
        sourceX, source.y, sourceWidth, topHeight,
        targetX, y, targetWidth, topHeight,
      );
      context.drawImage(
        this.asset.image,
        sourceX, source.y + topHeight, sourceWidth, sourceMiddleHeight,
        targetX, y + topHeight, targetWidth, targetMiddleHeight,
      );
      context.drawImage(
        this.asset.image,
        sourceX, source.y + source.height - bottomHeight, sourceWidth, bottomHeight,
        targetX, y + height - bottomHeight, targetWidth, bottomHeight,
      );
    };
    drawSegment(source.x, CAP_WIDTH, x, CAP_WIDTH);
    const middleTargetWidth = width - CAP_WIDTH * 2;
    for (let offset = 0; offset < middleTargetWidth; offset += MIDDLE_WIDTH) {
      const segment = Math.min(MIDDLE_WIDTH, middleTargetWidth - offset);
      drawSegment(source.x + CAP_WIDTH, segment, x + CAP_WIDTH + offset, segment);
    }
    drawSegment(source.x + source.width - CAP_WIDTH, CAP_WIDTH, x + width - CAP_WIDTH, CAP_WIDTH);
    return true;
  }

  draw(context: CanvasRenderingContext2D, label: string, centerX: number, y: number): UiRect | null {
    const source = uiAssetFrame(this.asset);
    if (!source) return null;
    const width = ribbonWidth(label, this.fonts);
    const x = Math.round(centerX - width / 2);
    this.drawChrome(context, x, y, width, source.height);
    drawPixelText(context, this.fonts, label, centerX, y + RIBBON_TEXT_TOP_OFFSET, {
      align: 'center', color: '#4d2e22', font: 'body',
    });
    return { x, y, width, height: source.height };
  }

  /** A fixed-width single-line HUD ribbon. */
  drawSingle(context: CanvasRenderingContext2D, label: string, rect: UiRect): UiRect | null {
    if (!this.drawChrome(context, rect.x, rect.y, rect.width, rect.height)) return null;
    const writableHeight = rect.height - BOTTOM_FOLD_HEIGHT;
    const glyphHeight = fontMetrics(this.fonts.headerFont).glyphHeight;
    const textY = rect.y + Math.round((writableHeight - glyphHeight) / 2);
    drawPixelText(context, this.fonts, label, rect.x + rect.width / 2, textY, {
      align: 'center', color: '#4d2e22', font: 'header',
    });
    return rect;
  }

  /** A taller location banner with a header-font zone name and compact calendar
   * line. The authored caps stay fixed-width while the center stretches. */
  drawStacked(
    context: CanvasRenderingContext2D,
    title: string,
    subtitle: string,
    rect: UiRect,
  ): UiRect | null {
    if (!this.drawChrome(context, rect.x, rect.y, rect.width, rect.height)) return null;
    const centerX = rect.x + rect.width / 2;
    drawPixelText(context, this.fonts, title, centerX, rect.y + 3, {
      align: 'center', color: '#4d2e22', font: 'header',
    });
    drawPixelText(context, this.fonts, subtitle, centerX, rect.y + 18, {
      align: 'center', color: '#6b4428', font: 'body',
    });
    return rect;
  }
}
