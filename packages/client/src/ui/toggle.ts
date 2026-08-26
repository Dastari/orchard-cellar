import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

export interface ToggleOptions {
  readonly id: string;
  readonly skin: UiSkin;
  readonly fonts: PixelUi;
  readonly value?: boolean;
  readonly onChange: (value: boolean) => void;
}

/** A retained, skinned on/off control shared by settings screens. */
export class Toggle {
  readonly node: WidgetNode;
  private currentValue: boolean;

  constructor(private readonly options: ToggleOptions) {
    this.currentValue = options.value ?? false;
    this.node = widget('toggle', options.id, {
      onPointer: (event) => {
        if (!this.node.enabled || event.kind !== 'pointer_down') return false;
        this.currentValue = !this.currentValue;
        this.options.onChange(this.currentValue);
        return true;
      },
    });
  }

  get value(): boolean { return this.currentValue; }
  set value(value: boolean) { this.currentValue = value; }
  get enabled(): boolean { return this.node.enabled; }
  set enabled(enabled: boolean) { this.node.enabled = enabled; }

  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }

  draw(context: CanvasRenderingContext2D): void {
    const bounds = this.node.bounds;
    context.save();
    if (!this.node.enabled) context.globalAlpha *= 0.42;
    drawUiSkinAsset(
      context,
      this.currentValue ? this.options.skin.buttonConfirm : this.options.skin.button,
      bounds,
      this.node.enabled ? 'idle' : 'disabled',
    );
    drawPixelText(context, this.options.fonts, this.currentValue ? 'ON' : 'OFF',
      bounds.x + bounds.width / 2, bounds.y + 5, {
        align: 'center',
        color: this.currentValue ? '#fff2d0' : '#5f3b24',
      });
    context.restore();
  }
}
