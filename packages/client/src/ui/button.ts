import {
  drawOutlinedPixelText,
  drawPixelText,
  fitPixelText,
  fontMetrics,
  type PixelUi,
} from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import {
  drawUiIconAsset,
  drawUiSkinAsset,
  type UiIconAsset,
  type UiSkin,
} from './skin.js';
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

export function buttonTextFace(rect: UiRect, state: ButtonVisualState = 'idle'): UiRect {
  const horizontalPadding = state === 'idle' ? 6 : 8;
  const top = state === 'idle' ? 3 : state === 'pressed' ? 4 : 5;
  const bottom = state === 'idle' ? 5 : 4;
  return {
    x: rect.x + horizontalPadding,
    y: rect.y + top,
    width: Math.max(0, rect.width - horizontalPadding * 2),
    height: Math.max(0, rect.height - top - bottom),
  };
}

export function buttonLabelTop(
  rect: UiRect,
  fonts: PixelUi,
  size: ButtonSize = 'regular',
  state: ButtonVisualState = 'idle',
): number {
  const glyphHeight = fontMetrics(fonts.font).glyphHeight;
  const face = buttonTextFace(rect, state);
  const compactBias = size === 'compact' && state === 'idle' ? -1 : 0;
  return face.y + Math.max(0, Math.floor((face.height - glyphHeight) / 2) + compactBias);
}

export function fitButtonLabel(
  label: string,
  rect: UiRect,
  fonts: PixelUi,
  state: ButtonVisualState = 'idle',
): string {
  return fitPixelText(label, buttonTextFace(rect, state).width, 1, fonts.font);
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
  const face = buttonTextFace(rect, state);
  const label = fitButtonLabel(options.label, rect, fonts, state);
  const labelX = rect.x + rect.width / 2;
  const labelY = buttonLabelTop(rect, fonts, options.size, state);
  if (face.width <= 0 || face.height <= 0 || label.length === 0) return;
  context.save();
  context.beginPath();
  context.rect(face.x, face.y, face.width, face.height);
  context.clip();
  if (state === 'disabled') {
    drawOutlinedPixelText(context, fonts, label, labelX, labelY, {
      align: 'center', color: '#e0c49a', outlineColor: '#5f3b24',
    });
  } else {
    drawPixelText(context, fonts, label, labelX, labelY, {
      align: 'center', color: tone === 'neutral' ? '#5f3b24' : '#fff2d0',
    });
  }
  context.restore();
}

export interface DrawSmallIconButtonOptions {
  readonly icon: UiIconAsset;
  readonly tone?: 'neutral' | 'success';
  readonly state?: ButtonVisualState;
}

/** The authored 16px round button has a narrow central face. Editor SVG icons
 * are capped at 14px and centred there instead of filling the complete sprite. */
export function smallButtonIconRect(
  rect: UiRect,
  state: ButtonVisualState = 'idle',
): UiRect {
  const size = Math.max(1, Math.min(14, rect.width - 12, rect.height - 12));
  return {
    x: Math.round(rect.x + (rect.width - size) / 2),
    y: Math.round(rect.y + (rect.height - size) / 2 + (state === 'pressed' ? 1 : 0)),
    width: size,
    height: size,
  };
}

export function drawSmallIconButton(
  context: CanvasRenderingContext2D,
  skin: Pick<UiSkin, 'buttonSmall' | 'buttonSmallConfirm'>,
  rect: UiRect,
  options: DrawSmallIconButtonOptions,
): void {
  const state = options.state ?? 'idle';
  const asset = options.tone === 'success' ? skin.buttonSmallConfirm : skin.buttonSmall;
  drawUiSkinAsset(context, asset, rect, state);
  drawUiIconAsset(context, options.icon, smallButtonIconRect(rect, state), state === 'disabled' ? 0.45 : 0.9);
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
