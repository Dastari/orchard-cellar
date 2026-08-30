import type { LoadedAsset } from '../render/assets.js';
import type { UiPoint, UiRect } from './geometry.js';
import { drawUiSkinAsset, drawUiSkinNatural, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

const DEFAULT_WHEEL_STEP = 0.05;

export const AUTHORED_SLIDER_CATALOG_COLUMNS = 38;
export const AUTHORED_SLIDER_CATALOG_ROWS = 10;
export const AUTHORED_SLIDER_CATALOG_COUNT = AUTHORED_SLIDER_CATALOG_COLUMNS * AUTHORED_SLIDER_CATALOG_ROWS;

export function authoredSliderCellIndex(column: number, row: number): number {
  const safeColumn = Math.max(0, Math.min(AUTHORED_SLIDER_CATALOG_COLUMNS - 1, Math.floor(column)));
  const safeRow = Math.max(0, Math.min(AUTHORED_SLIDER_CATALOG_ROWS - 1, Math.floor(row)));
  return safeRow * AUTHORED_SLIDER_CATALOG_COLUMNS + safeColumn;
}

export function drawAuthoredSliderCell(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
  column: number,
  row: number,
): void {
  drawUiSkinAsset(context, asset, rect, 'catalog', authoredSliderCellIndex(column, row));
}

export const SLIDER_TONES = ['green', 'red', 'gold', 'peach', 'brown', 'silver'] as const;
export type SliderTone = (typeof SLIDER_TONES)[number];
export type SliderOrientation = 'horizontal' | 'vertical';

const SLIDER_TONE_VARIANT: Readonly<Record<SliderTone, number>> = {
  green: 0,
  red: 1,
  gold: 2,
  peach: 3,
  brown: 4,
  silver: 5,
};

export interface SliderOptions {
  readonly id: string;
  readonly skin: UiSkin;
  readonly value?: number;
  readonly wheelStep?: number;
  readonly tone?: SliderTone;
  readonly orientation?: SliderOrientation;
  /** The authored sheet supplies two handle silhouettes per colour ramp. */
  readonly handleVariant?: number;
  readonly compactHandle?: boolean;
  readonly onChange: (value: number) => void;
}

export function clampSliderValue(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sliderValueAtPoint(bounds: UiRect, pointerX: number): number {
  if (bounds.width <= 0) return 0;
  return clampSliderValue((pointerX - bounds.x) / bounds.width);
}

export function sliderValueAtPosition(
  bounds: UiRect,
  point: UiPoint,
  orientation: SliderOrientation,
): number {
  if (orientation === 'horizontal') return sliderValueAtPoint(bounds, point.x);
  if (bounds.height <= 0) return 0;
  return clampSliderValue((bounds.y + bounds.height - point.y) / bounds.height);
}

/** Retained authored slider shared by menus and tools. Both orientations use
 * fixed-size handles and repeated track centres, so no control art stretches. */
export class Slider {
  readonly node: WidgetNode;
  private currentValue: number;
  private dragging = false;

  constructor(private readonly options: SliderOptions) {
    this.currentValue = clampSliderValue(options.value ?? 0);
    this.node = widget('slider', options.id, {
      onPointer: (event) => {
        if (!this.node.enabled) return false;
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        this.dragging = true;
        this.setValueAt(event.point);
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
    this.setValueAt(point);
    return true;
  }

  pointerUp(point: UiPoint): boolean {
    if (!this.node.enabled || !this.dragging) return false;
    this.setValueAt(point);
    this.dragging = false;
    return true;
  }

  pointerLeave(): void { this.dragging = false; }

  draw(context: CanvasRenderingContext2D): void {
    const bounds = this.node.bounds;
    const orientation = this.options.orientation ?? 'horizontal';
    const toneVariant = SLIDER_TONE_VARIANT[this.options.tone ?? 'gold'];
    const handleVariant = Math.max(0, Math.min(15,
      this.options.handleVariant ?? toneVariant * 2));
    context.save();
    if (!this.node.enabled) context.globalAlpha *= 0.42;
    if (orientation === 'horizontal') {
      const track = {
        x: bounds.x + 7,
        y: bounds.y + Math.round((bounds.height - 6) / 2),
        width: Math.max(1, bounds.width - 14),
        height: 6,
      };
      drawUiSkinAsset(context, this.options.skin.sliderTrack, track, 'base', toneVariant);
      const fillWidth = Math.round(track.width * this.currentValue);
      if (fillWidth > 0) drawUiSkinAsset(context, this.options.skin.sliderFill, {
        x: track.x + 1,
        y: track.y + 1,
        width: Math.max(1, fillWidth - 2),
        height: 4,
      }, 'base', toneVariant);
      drawUiSkinNatural(
        context,
        this.options.skin.sliderHandle,
        bounds.x + Math.round(Math.max(0, bounds.width - 16) * this.currentValue),
        bounds.y + Math.round((bounds.height - 16) / 2),
        this.options.compactHandle === true ? 'compact' : 'horizontal',
        handleVariant,
      );
    } else {
      const track = {
        x: bounds.x + Math.round((bounds.width - 16) / 2),
        y: bounds.y + 7,
        width: 16,
        height: Math.max(1, bounds.height - 14),
      };
      drawUiSkinAsset(context, this.options.skin.sliderTrackVertical, track, 'base', toneVariant);
      if (this.currentValue > 0) {
        const fillHeight = Math.max(1, Math.round(track.height * this.currentValue));
        context.save();
        context.beginPath();
        context.rect(track.x, track.y + track.height - fillHeight, track.width, fillHeight);
        context.clip();
        drawUiSkinAsset(context, this.options.skin.sliderFillVertical, track, 'base', toneVariant);
        context.restore();
      }
      drawUiSkinNatural(
        context,
        this.options.skin.sliderHandle,
        bounds.x + Math.round((bounds.width - 16) / 2),
        bounds.y + Math.round(Math.max(0, bounds.height - 16) * (1 - this.currentValue)),
        'vertical',
        handleVariant,
      );
    }
    context.restore();
  }

  private setValueAt(point: UiPoint): void {
    this.setValue(sliderValueAtPosition(
      this.node.bounds,
      point,
      this.options.orientation ?? 'horizontal',
    ));
  }

  private setValue(value: number): void {
    if (!this.node.enabled) return;
    const next = clampSliderValue(value);
    this.currentValue = next;
    this.options.onChange(next);
  }
}
