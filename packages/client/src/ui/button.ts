import { drawPixelText, fontMetrics, type PixelUi } from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

export type ButtonTone = 'neutral' | 'success' | 'danger';
export type ButtonSize = 'compact' | 'regular';
export type ButtonVisualState = 'idle' | 'pressed' | 'disabled';

export const BUTTON_HEIGHT: Readonly<Record<ButtonSize, number>> = {
  compact: 16,
  regular: 22,
};

export interface DrawButtonOptions {
  readonly label: string;
  readonly tone?: ButtonTone;
  readonly size?: ButtonSize;
  readonly state?: ButtonVisualState;
}

export function buttonLabelTop(rect: UiRect, fonts: PixelUi, size: ButtonSize = 'regular'): number {
  const glyphHeight = fontMetrics(fonts.font).glyphHeight;
  const authoredFaceBias = size === 'regular' ? -1 : 0;
  return rect.y + Math.max(2, Math.floor((rect.height - glyphHeight) / 2) + authoredFaceBias);
}

export function drawButton(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  fonts: PixelUi,
  rect: UiRect,
  options: DrawButtonOptions,
): void {
  const tone = options.tone ?? 'neutral';
  const state = options.state ?? 'idle';
  const asset = tone === 'success' ? skin.buttonConfirm
    : tone === 'danger' ? skin.buttonDeny : skin.button;
  drawUiSkinAsset(context, asset, rect, state);
  drawPixelText(context, fonts, options.label, rect.x + rect.width / 2,
    buttonLabelTop(rect, fonts, options.size), {
      align: 'center',
      color: state === 'disabled' ? '#8c6c54' : tone === 'neutral' ? '#5f3b24' : '#fff2d0',
    });
}

export interface CanvasButtonOptions {
  readonly id: string;
  readonly skin: UiSkin;
  readonly fonts: PixelUi;
  readonly label: string;
  readonly tone?: ButtonTone;
  readonly size?: ButtonSize;
  readonly onPress: () => void;
}

/** Retained semantic button. Layout selects a standard size; the component owns
 * skin selection, label centering, disabled styling, and pressed feedback. */
export class CanvasButton {
  readonly node: WidgetNode;
  private pressedUntil = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: CanvasButtonOptions) {
    const size = options.size ?? 'regular';
    this.node = widget('button', options.id, {
      minSize: { width: 16, height: BUTTON_HEIGHT[size] },
      onPointer: (event) => {
        if (!this.node.enabled || event.kind !== 'pointer_down') return false;
        this.pressedUntil = performance.now() + 90;
        this.options.onPress();
        return true;
      },
    });
  }

  get enabled(): boolean { return this.node.enabled; }
  set enabled(value: boolean) { this.node.enabled = value; }
  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    drawButton(context, this.options.skin, this.options.fonts, this.node.bounds, {
      label: this.options.label,
      tone: this.options.tone,
      size: this.options.size,
      state: !this.node.enabled ? 'disabled' : now < this.pressedUntil ? 'pressed' : 'idle',
    });
  }
}
