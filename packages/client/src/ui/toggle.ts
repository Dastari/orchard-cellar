import type { PixelUi } from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinNatural, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

export type ToggleStyle = 'colored' | 'neutral';
export const TOGGLE_ANIMATION_DURATION_MS = 150;

export interface ToggleOptions {
  readonly id: string;
  readonly skin: UiSkin;
  readonly fonts: PixelUi;
  readonly value?: boolean;
  readonly style?: ToggleStyle;
  readonly onChange: (value: boolean) => void;
}

export function toggleFrameIndex(value: boolean, elapsedMs: number): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / TOGGLE_ANIMATION_DURATION_MS));
  const travelled = Math.min(3, Math.floor(progress * 4));
  return value ? travelled : 3 - travelled;
}

export function toggleSwitchRect(bounds: UiRect): UiRect {
  return {
    x: Math.round(bounds.x + (bounds.width - 30) / 2),
    y: Math.round(bounds.y + (bounds.height - 14) / 2),
    width: 30,
    height: 14,
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface DrawToggleSwitchOptions {
  readonly value: boolean;
  readonly style?: ToggleStyle;
  readonly enabled?: boolean;
  readonly frame?: number;
}

export function drawToggleSwitch(
  context: CanvasRenderingContext2D,
  skin: Pick<UiSkin, 'toggleSwitch'>,
  bounds: UiRect,
  options: DrawToggleSwitchOptions,
): void {
  const rect = toggleSwitchRect(bounds);
  context.save();
  if (options.enabled === false) context.globalAlpha *= 0.42;
  drawUiSkinNatural(
    context,
    skin.toggleSwitch,
    rect.x,
    rect.y,
    options.style ?? 'colored',
    options.frame ?? (options.value ? 3 : 0),
  );
  context.restore();
}

/** A retained, skinned on/off control shared by settings screens. */
export class Toggle {
  readonly node: WidgetNode;
  private currentValue: boolean;
  private animationStartedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: ToggleOptions) {
    this.currentValue = options.value ?? false;
    this.node = widget('toggle', options.id, {
      onPointer: (event) => {
        if (!this.node.enabled || event.kind !== 'pointer_down' || event.button !== 0) return false;
        this.toggle();
        return true;
      },
    });
  }

  get value(): boolean { return this.currentValue; }
  set value(value: boolean) {
    if (value === this.currentValue) return;
    this.currentValue = value;
    this.animationStartedAt = performance.now();
  }
  get enabled(): boolean { return this.node.enabled; }
  set enabled(enabled: boolean) { this.node.enabled = enabled; }

  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }

  toggle(now = performance.now()): void {
    if (!this.node.enabled) return;
    this.currentValue = !this.currentValue;
    this.animationStartedAt = now;
    this.options.onChange(this.currentValue);
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    const elapsed = now - this.animationStartedAt;
    const frame = !prefersReducedMotion()
      && Number.isFinite(elapsed) && elapsed < TOGGLE_ANIMATION_DURATION_MS
      ? toggleFrameIndex(this.currentValue, elapsed)
      : this.currentValue ? 3 : 0;
    drawToggleSwitch(context, this.options.skin, this.node.bounds, {
      value: this.currentValue,
      style: this.options.style,
      enabled: this.node.enabled,
      frame,
    });
  }
}
