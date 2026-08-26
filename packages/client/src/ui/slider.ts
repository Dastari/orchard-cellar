import type { UiPoint, UiRect } from './geometry.js';
import { drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

const DEFAULT_WHEEL_STEP = 0.05;

export interface SliderOptions {
  readonly id: string;
  readonly skin: UiSkin;
  readonly value?: number;
  readonly wheelStep?: number;
  readonly onChange: (value: number) => void;
}

export function clampSliderValue(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sliderValueAtPoint(bounds: UiRect, pointerX: number): number {
  if (bounds.width <= 0) return 0;
  return clampSliderValue((pointerX - bounds.x) / bounds.width);
}

/** A retained, skinned horizontal slider with shared drawing and drag behavior. */
export class Slider {
  readonly node: WidgetNode;
  private currentValue: number;
  private dragging = false;

  constructor(private readonly options: SliderOptions) {
    this.currentValue = clampSliderValue(options.value ?? 0);
    this.node = widget('slider', options.id, {
      onPointer: (event) => {
        if (!this.node.enabled) return false;
        if (event.kind !== 'pointer_down') return false;
        this.dragging = true;
        this.setValueAt(event.point.x);
        return true;
      },
      onWheel: (event) => {
        if (!this.node.enabled) return false;
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (delta === 0) return true;
        this.setValue(this.currentValue + (delta < 0 ? 1 : -1) * (options.wheelStep ?? DEFAULT_WHEEL_STEP));
        return true;
      },
    });
  }

  get value(): number { return this.currentValue; }
  set value(value: number) { this.currentValue = clampSliderValue(value); }
  get enabled(): boolean { return this.node.enabled; }
  set enabled(enabled: boolean) {
    this.node.enabled = enabled;
    if (!enabled) this.dragging = false;
  }

  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }

  pointerMove(point: UiPoint): boolean {
    if (!this.node.enabled || !this.dragging) return false;
    this.setValueAt(point.x);
    return true;
  }

  pointerUp(point: UiPoint): boolean {
    if (!this.node.enabled || !this.dragging) return false;
    this.setValueAt(point.x);
    this.dragging = false;
    return true;
  }

  pointerLeave(): void { this.dragging = false; }

  draw(context: CanvasRenderingContext2D): void {
    const bounds = this.node.bounds;
    const handleWidth = uiAssetFrame(this.options.skin.sliderHandle, 'idle')?.width ?? 6;
    context.save();
    if (!this.node.enabled) context.globalAlpha *= 0.42;
    drawUiSkinAsset(context, this.options.skin.sliderTrack, {
      x: bounds.x,
      y: bounds.y + 4,
      width: bounds.width,
      height: 6,
    });
    const fillWidth = Math.max(1, Math.round((bounds.width - 2) * this.currentValue));
    drawUiSkinAsset(context, this.options.skin.barGold, {
      x: bounds.x + 1,
      y: bounds.y + 5,
      width: fillWidth,
      height: 4,
    });
    drawUiSkinNatural(
      context,
      this.options.skin.sliderHandle,
      bounds.x + Math.round((bounds.width - handleWidth) * this.currentValue),
      bounds.y,
      'idle',
    );
    context.restore();
  }

  private setValueAt(pointerX: number): void {
    this.setValue(sliderValueAtPoint(this.node.bounds, pointerX));
  }

  private setValue(value: number): void {
    if (!this.node.enabled) return;
    const next = clampSliderValue(value);
    this.currentValue = next;
    this.options.onChange(next);
  }
}
