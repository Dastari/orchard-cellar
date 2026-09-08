import { drawPixelText, type PixelUi } from './pixel-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';
import { drawFantasyButton, type FantasyButtonTone, type FantasyButtonGlyph } from './design-system/fantasy-controls.js';
export function drawLabel(context: CanvasRenderingContext2D, ui: PixelUi, text: string, x: number, y: number, options: { align?: CanvasTextAlign; color?: string; font?: 'body' | 'header' } = {}): void {
  drawPixelText(context, ui, text, Math.round(x), Math.round(y), { align: options.align, color: options.color ?? '#3f2d25', font: options.font });
}

export function drawMenuButton(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  fonts: PixelUi,
  pointer: UiPoint,
  rect: UiRect,
  label: string,
  options: {
    readonly tone?: FantasyButtonTone;
    readonly glyph?: FantasyButtonGlyph;
    readonly disabled?: boolean;
    readonly active?: boolean;
    readonly compact?: boolean;
  } = {},
): void {
  const tone = options.tone ?? (options.active === true ? 'green' : 'peach');
  drawFantasyButton(context, skin, fonts, rect, {
    tone,
    shape: options.compact === true || options.active === true ? 'square' : 'chamfered',
    ...(options.compact === true ? { size: 'small' as const } : {}),
    state: options.disabled === true ? 'disabled' : 'idle',
    hovered: options.disabled !== true && containsPoint(rect, pointer),
    hoverOutline: 'gold',
    ...(options.compact === true ? {} : { label }),
    ...(options.glyph === undefined ? {} : { glyph: options.glyph }),
  });
}

export function drawInsetPanel(context: CanvasRenderingContext2D, skin: UiSkin, rect: UiRect): void {
  drawUiSkinAsset(context, skin.frameThin, rect);
  context.save();
  context.fillStyle = '#ead0aa44';
  context.fillRect(rect.x + 6, rect.y + 7, Math.max(0, rect.width - 12), Math.max(0, rect.height - 14));
  context.restore();
}

