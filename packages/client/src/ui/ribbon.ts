import { drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { LoadedAsset } from '../render/assets.js';
import type { UiRect } from './geometry.js';
import { uiAssetFrame } from './skin.js';

const NATURAL_WIDTH = 78;
const CAP_WIDTH = 30;
const MIDDLE_WIDTH = NATURAL_WIDTH - CAP_WIDTH * 2;
const TEXT_PADDING = 40;

export function ribbonWidth(label: string, fonts: PixelUi): number {
  return Math.max(NATURAL_WIDTH, measurePixelText(label, 1, fonts.font) + TEXT_PADDING);
}

/** A fixed-pixel ribbon whose flat center tiles to fit its label. */
export class Ribbon {
  constructor(private readonly asset: LoadedAsset, private readonly fonts: PixelUi) {}

  draw(context: CanvasRenderingContext2D, label: string, centerX: number, y: number): UiRect | null {
    const source = uiAssetFrame(this.asset);
    if (!source) return null;
    const width = ribbonWidth(label, this.fonts);
    const x = Math.round(centerX - width / 2);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.asset.image, source.x, source.y, CAP_WIDTH, source.height, x, y, CAP_WIDTH, source.height);
    const middleTargetWidth = width - CAP_WIDTH * 2;
    for (let offset = 0; offset < middleTargetWidth; offset += MIDDLE_WIDTH) {
      const segment = Math.min(MIDDLE_WIDTH, middleTargetWidth - offset);
      context.drawImage(
        this.asset.image,
        source.x + CAP_WIDTH,
        source.y,
        segment,
        source.height,
        x + CAP_WIDTH + offset,
        y,
        segment,
        source.height,
      );
    }
    context.drawImage(
      this.asset.image,
      source.x + source.width - CAP_WIDTH,
      source.y,
      CAP_WIDTH,
      source.height,
      x + width - CAP_WIDTH,
      y,
      CAP_WIDTH,
      source.height,
    );
    drawPixelText(context, this.fonts, label, centerX, y + 7, { align: 'center', color: '#4d2e22', font: 'body' });
    return { x, y, width, height: source.height };
  }
}
