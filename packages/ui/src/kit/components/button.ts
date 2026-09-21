import { containsPoint } from '../../geometry.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_SIZE_METRICS, type UiControlSize, type UiShape, type UiTone } from '../tokens.js';
import { resolveUiTextContrast } from '../skin/contrast.js';
import { paintUiMissingArt, paintUiSkin, uiElementTone } from './art.js';
export interface UiButtonModifiers { readonly button?: number; readonly shiftKey?: boolean; readonly altKey?: boolean; readonly ctrlKey?: boolean; readonly metaKey?: boolean }
export interface UiButtonOptions {
  readonly id?: string; readonly label: string; readonly ariaLabel?: string; readonly tone?: UiTone; readonly size?: UiControlSize;
  readonly shape?: UiShape; readonly disabled?: boolean; readonly loading?: boolean;
  readonly leading?: UiElement; readonly trailing?: UiElement; readonly layout?: UiStyle;
  readonly activateOn?: 'down' | 'up';
  readonly onPress?: (event: UiButtonModifiers) => void; readonly children?: readonly UiElement[];
}
export function uiButton(options: UiButtonOptions): UiElement {
  const tone = options.tone ?? 'neutral', size = options.size ?? 'md', shape = options.shape ?? 'chamfered';
  const metrics = UI_SIZE_METRICS[size]; let pressed = false;
  const activate = (element: UiElement, event: UiButtonModifiers = {}) => { if (!element.disabled && !options.loading) options.onPress?.(event); };
  const leading = options.loading ? new UiElement({ kind: 'button-spinner', animated: true, style: { width: uiFixed(16), height: uiFixed(16) },
    paint(element, { context, art, now, reducedMotion }) { if (art) paintUiSkin(context, art.skin.cursor, `kit_loading_spinner.idle.${reducedMotion ? 0 : Math.floor(now * 12 / 1000) % 8}`, element.rect); } }) : options.leading;
  const adorn = (child: UiElement, side: 'left' | 'right') => new UiElement({ kind: 'button-adornment', style: { position: 'absolute', inset: { [side]: 0, top: 0, bottom: 0 }, width: uiFixed(16), display: 'stack' }, children: [child.setStyle({ width: 'grow', height: 'grow' })] });
  const left = leading ? 20 : 0, right = options.trailing ? 20 : 0;
  return new UiElement({ id: options.id, kind: 'button', label: options.ariaLabel ?? options.label, focusable: true,
    disabled: options.disabled || options.loading, pointerMode: 'capture', props: { tone, buttonSurface: true, focusChrome: true, label: options.label },
    style: { height: uiFixed(metrics.controlHeight), padding: metrics.padding, display: 'stack', ...options.layout }, children: [...(options.children ?? []), ...(leading ? [adorn(leading, 'left')] : []), ...(options.trailing ? [adorn(options.trailing, 'right')] : [])],
    measure(element) {
      const width = String(element.props['label']).length * 6 + 16 + left + right;
      return { min: { width: metrics.controlHeight, height: metrics.controlHeight }, preferred: { width, height: metrics.controlHeight } };
    },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; element.setProps({ pressed: true }, false); event.capture(); element.invalidateRoot?.(false); if (options.activateOn === 'down') activate(element, event); return true; }
      if (event.type === 'up' && pressed) {
        pressed = false; element.setProps({ pressed: false }, false); event.release(); element.invalidateRoot?.(false);
        if (options.activateOn !== 'down' && containsPoint(element.clip, event.point)) activate(element, event); return true;
      }
      if (event.type === 'cancel') { pressed = false; element.setProps({ pressed: false }, false); event.release(); element.invalidateRoot?.(false); return true; }
      return pressed;
    },
    onKey(event, element) {
      if (event.key === 'Enter' || event.key === ' ') { activate(element, event); return true; } return false;
    },
    paint(element, { context, art, focused, hovered }) {
      if (!art) return;
      const tone = element.disabled ? 'muted' : uiElementTone(element);
      const state = element.disabled ? 'disabled' : pressed ? 'pressed' : 'idle';
      if (art.missingArt) paintUiMissingArt(context, element.rect, art);
      else paintUiSkin(context, art.skin.button, `${tone}.${size === 'sm' && options.label ? 'md' : size}.${shape}.${state}`, element.rect);
      const ink = resolveUiTextContrast(tone, 'label', `button_${state}`).color, r = element.rect;
      const text = fitPixelText(String(element.props['label']), Math.max(0, r.width - 12 - 2 * Math.max(left, right)), 1, art.pixel.font);
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - measurePixelText(text, 1, art.pixel.font)) / 2),
        r.y + Math.floor((r.height - 7) / 2) + (pressed ? 1 : 0), { color: ink });
      if ((focused || hovered) && !element.disabled && !art.missingArt) {
        paintUiSkin(context, art.skin.button, `outline.${size === 'sm' && options.label ? 'md' : size}.${shape}.${state}.${focused ? 'white' : 'gold'}`, r);
      }
    },
  });
}
