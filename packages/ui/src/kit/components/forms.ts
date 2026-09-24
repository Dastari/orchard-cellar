import { containsPoint } from '../../geometry.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { toggleFrameIndex } from '../../toggle.js';
import { sliderValueAtPosition } from '../../slider.js';
import { boundedStepperValue } from '../../bounded-stepper.js';
import { drawPixelText, fitPixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone, UiControlSize } from '../tokens.js';
import { resolveUiTextContrast } from '../skin/contrast.js';
import { paintUiSkin } from './art.js';
import { uiButton } from './button.js';
import { uiIcon } from './media.js';
import { uiFlex } from './layout.js';
import { uiInput } from './input.js';
export interface UiChoiceOptions {
  readonly id?: string; readonly label: string; readonly tone?: UiTone; readonly size?: UiControlSize;
  readonly disabled?: boolean; readonly layout?: UiStyle;
}
export interface UiCheckboxOptions extends UiChoiceOptions { readonly value?: boolean | 'indeterminate'; readonly onChange?: (value: boolean) => void }
export function uiCheckbox(options: UiCheckboxOptions): UiElement {
  const mark = uiFlex({ width: uiFixed(16), height: uiFixed(16) });
  const rebuild = (value: boolean | 'indeterminate') => mark.replaceChildren(value === false ? [] : [uiIcon({ fantasy: value === 'indeterminate' ? 'minus_white_medium' : 'check_white_medium' })]);
  const base = uiButton({ ...options, leading: mark, onPress: () => { const value = element.props['value'] !== true; element.setProps({ value }, false); rebuild(value); options.onChange?.(value); } });
  const element = new UiElement({ ...base.hooks, kind: 'checkbox', props: { ...base.props, value: options.value ?? false }, children: [...base.children] });
  rebuild(options.value ?? false); return element;
}
export interface UiRadioOption { readonly value: string; readonly label: string; readonly disabled?: boolean }
export function uiRadioGroup(options: UiChoiceOptions & { readonly options: readonly UiRadioOption[]; readonly value?: string; readonly onChange?: (value: string) => void }): UiElement {
  const group = uiFlex({ id: options.id, label: options.label, direction: 'row', wrap: true, gap: 4, ...options.layout });
  group.setProps({ value: options.value ?? options.options.find(item => !item.disabled)?.value });
  const choose = (value: string) => { group.setProps({ value }, false); for (const child of group.children) child.setProps({ label: `${child.props['option'] === value ? '(o)' : '( )'} ${String(child.props['caption'])}` }); options.onChange?.(value); };
  for (const option of options.options) {
    const base = uiButton({ label: `${option.value === group.props['value'] ? '(o)' : '( )'} ${option.label}`, tone: options.tone, size: options.size, disabled: options.disabled || option.disabled, onPress: () => choose(option.value) });
    group.append(new UiElement({ ...base.hooks, kind: 'radio', focusGroup: group.id, props: { ...base.props, option: option.value, caption: option.label },
      onFocus(focused) { if (focused && group.props['value'] !== option.value) choose(option.value); },
    }));
  }
  return group;
}
export function uiSwitch(options: UiChoiceOptions & { readonly value?: boolean; readonly onChange?: (value: boolean) => void }): UiElement {
  let started = -Infinity, elapsed = Infinity, pressed = false;
  const change = (element: UiElement) => { const value = !element.props['value']; started = performance.now(); elapsed = 0; element.setProps({ value }, false); options.onChange?.(value); };
  return new UiElement({ id: options.id, kind: 'switch', label: options.label, focusable: true, disabled: options.disabled, pointerMode: 'capture',
    props: { tone: options.tone ?? 'neutral', value: options.value ?? false }, get animated() { return elapsed < 150; },
    style: { width: uiFixed(options.label.length * 6 + 44), height: uiFixed(24), ...options.layout },
    onPointer(event, element) { if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); return true; } if (pressed && (event.type === 'up' || event.type === 'cancel')) { pressed = false; event.release(); if (event.type === 'up' && containsPoint(element.clip, event.point)) change(element); return true; } return false; },
    onKey(event, element) { if (event.key !== ' ' && event.key !== 'Enter') return false; change(element); return true; },
    paint(element, { context, art, now, reducedMotion }) {
      if (!art) return; elapsed = now - started; const r = element.rect, tone = options.tone ?? 'neutral';
      paintUiSkin(context, art.skin.button, `${element.props['value'] ? tone : 'muted'}.md.pill.idle`, r);
      const frame = reducedMotion || elapsed >= 150 ? element.props['value'] ? 3 : 0 : toggleFrameIndex(Boolean(element.props['value']), elapsed);
      paintUiSkin(context, art.skin.toggle, `toggle_switch.neutral.${frame}`, { x: r.x + 4, y: r.y + Math.floor((r.height - 14) / 2), width: 30, height: 14 });
      drawPixelText(context, art.pixel, fitPixelText(options.label, Math.max(0, r.width - 42), 1, art.pixel.font), r.x + 38, r.y + Math.floor((r.height - 7) / 2),
        { color: resolveUiTextContrast(element.props['value'] ? tone : 'muted').color });
    },
  });
}
export interface UiSliderOptions extends UiChoiceOptions {
  readonly value?: number; readonly min?: number; readonly max?: number; readonly step?: number;
  readonly orientation?: 'horizontal' | 'vertical'; readonly ticks?: number; readonly valueLabel?: boolean; readonly onChange?: (value: number) => void;
}
export function uiSlider(options: UiSliderOptions): UiElement {
  const min = options.min ?? 0, max = options.max ?? 100, step = options.step ?? 1, vertical = options.orientation === 'vertical';
  if (!(Number.isFinite(min + max + step) && max > min && step > 0)) throw new Error('Slider requires finite ordered bounds and a positive step');
  let dragging = false, pendingTouch = false;
  const normalized = (value: number) => Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step));
  const change = (element: UiElement, value: number) => { const next = normalized(value); if (next !== element.props['value']) { element.setProps({ value: next }, false); options.onChange?.(next); } };
  const track = (element: UiElement) => { const r = element.rect; return { x: r.x + 8, y: r.y + 8, width: Math.max(1, r.width - 16 - (options.valueLabel && !vertical ? 36 : 0)), height: Math.max(1, r.height - 16) }; };
  const point = (element: UiElement, x: number, y: number) => change(element, min + sliderValueAtPosition(track(element), { x, y }, vertical ? 'vertical' : 'horizontal') * (max - min));
  return new UiElement({ id: options.id, kind: 'slider', label: options.label, focusable: true, disabled: options.disabled, pointerMode: 'capture', props: { value: normalized(options.value ?? min), tone: options.tone ?? 'primary' },
    style: { width: vertical ? uiFixed(32) : 'grow', height: vertical ? uiFixed(120) : uiFixed(32), ...options.layout },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) {
        dragging = true; pendingTouch = event.pointerType === 'touch'; event.capture();
        // Touch-scroll arbitration must decide direction before this control
        // sends a preference/world command. A stationary touch commits on up.
        if (!pendingTouch) point(element, event.point.x, event.point.y);
        return true;
      }
      if (dragging && event.type === 'move') { pendingTouch = false; point(element, event.point.x, event.point.y); return true; }
      if (dragging && (event.type === 'up' || event.type === 'cancel')) {
        const commitTap = pendingTouch && event.type === 'up' && containsPoint(element.clip, event.point);
        dragging = false; pendingTouch = false; event.release();
        if (commitTap) point(element, event.point.x, event.point.y);
        return true;
      }
      return false;
    },
    onWheel(event, element) { change(element, Number(element.props['value']) + (event.deltaY < 0 ? step : -step)); return true; },
    onKey(event, element) {
      const value = Number(element.props['value']);
      const next = event.key === 'Home' ? min : event.key === 'End' ? max : event.key === 'PageUp' ? value + step * 10 : event.key === 'PageDown' ? value - step * 10
        : ['ArrowUp', 'ArrowRight'].includes(event.key) ? value + step : ['ArrowDown', 'ArrowLeft'].includes(event.key) ? value - step : undefined;
      if (next === undefined) return false; change(element, next); return true;
    },
    paint(element, { context, art }) {
      if (!art) return; const t = track(element), value = Number(element.props['value']), fraction = (value - min) / (max - min);
      const tone = options.tone ?? 'primary', tokenFill = tone === 'info' || tone === 'neutral';
      const index = ({ success: 0, danger: 1, warning: 2, primary: 3, info: 5, neutral: 5, muted: 5 } as const)[options.tone ?? 'primary'];
      if (vertical) {
        const rect = { x: element.rect.x + Math.floor((element.rect.width - 16) / 2), y: t.y, width: 16, height: t.height };
        paintUiSkin(context, art.skin.slider, `slider_track_vertical.base.${index}`, rect);
        context.save(); context.beginPath(); context.rect(rect.x, rect.y + Math.round(rect.height * (1 - fraction)), rect.width, Math.round(rect.height * fraction)); context.clip();
        paintUiSkin(context, art.skin.slider, `slider_fill_vertical.base.${index}`, rect); context.restore();
        if (tokenFill) { context.fillStyle = UI_TONE_FACES[tone].frame.face; const height = Math.round((rect.height - 4) * fraction); context.fillRect(rect.x + 5, rect.y + rect.height - 2 - height, 6, height); }
        paintUiSkin(context, art.skin.slider, `slider_handle.vertical.${index * 2}`, { x: rect.x, y: Math.round(t.y + t.height * (1 - fraction) - 8), width: 16, height: 16 });
      } else {
        const rect = { x: t.x, y: element.rect.y + 10, width: t.width, height: 6 };
        paintUiSkin(context, art.skin.slider, `slider_track.base.${index}`, rect);
        if (fraction > 0) paintUiSkin(context, art.skin.slider, `slider_fill.base.${index}`, { x: rect.x + 1, y: rect.y + 1, width: Math.max(0, Math.round((rect.width - 2) * fraction)), height: 4 });
        if (tokenFill) { context.fillStyle = UI_TONE_FACES[tone].frame.face; context.fillRect(rect.x + 1, rect.y + 2, Math.round((rect.width - 2) * fraction), 2); }
        paintUiSkin(context, art.skin.slider, `slider_handle.horizontal.${index * 2}`, { x: Math.round(t.x + t.width * fraction - 8), y: element.rect.y + 5, width: 16, height: 16 });
      }
      const ink = resolveUiTextContrast(options.tone ?? 'neutral').color; context.fillStyle = ink;
      const ticks = Math.min(50, Math.max(0, options.ticks ?? 0));
      for (let i = 0; i < ticks; i++) { const f = i / Math.max(1, ticks - 1); if (vertical) context.fillRect(element.rect.x, Math.round(t.y + t.height * f), 3, 1); else context.fillRect(Math.round(t.x + t.width * f), element.rect.y + 24, 1, 3); }
      if (options.valueLabel) drawPixelText(context, art.pixel, String(Number(value.toPrecision(12))), vertical ? element.rect.x : t.x + t.width + 8, vertical ? element.rect.y : element.rect.y + 10, { color: ink });
    },
  });
}
export function uiStepper(options: UiSliderOptions): UiElement {
  const min = options.min ?? 0, max = options.max ?? 100, step = options.step ?? 1;
  if (!(Number.isFinite(min + max + step) && max >= min && step > 0)) throw new Error('Stepper requires finite ordered bounds and a positive step');
  let value = Math.max(min, Math.min(max, options.value ?? min));
  const input = uiInput({ label: options.label, value: String(Number(value.toPrecision(12))), tone: options.tone, size: options.size, disabled: options.disabled, onSubmit: text => commit(Number(text)) });
  const commit = (next: number) => { if (!Number.isFinite(next)) return; value = Math.max(min, Math.min(max, next)); input.setProps({ value: String(Number(value.toPrecision(12))) }, false); group.setProps({ value }, false); options.onChange?.(value); };
  const group = uiFlex({ id: options.id, label: options.label, direction: 'row', gap: 4, width: 'grow', ...options.layout });
  group.setProps({ value });
  for (const direction of [-1, 1] as const) {
    const base = uiButton({ label: direction < 0 ? '-' : '+', size: options.size, disabled: options.disabled, tone: options.tone, layout: { width: uiFixed(24) }, onPress: event => commit(boundedStepperValue(value / step, direction, min / step, max / step, { shift: event.shiftKey, control: event.ctrlKey || event.metaKey }) * step) });
    const node = new UiElement({ ...base.hooks, onKey(event, element) {
      if (event.key === 'Enter' || event.key === ' ') { commit(boundedStepperValue(value / step, direction, min / step, max / step, { shift: event.shiftKey, control: event.ctrlKey || event.metaKey }) * step); return true; }
      return base.hooks.onKey?.(event, element) ?? false;
    } });
    if (direction < 0) { group.append(node); group.append(input); } else group.append(node);
  }
  return group;
}
