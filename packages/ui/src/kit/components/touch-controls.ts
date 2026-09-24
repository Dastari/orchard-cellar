import { DEFAULT_TOUCH_CONTROL_PREFERENCES, normalizeTouchControlPreferences, touchControlLayout, touchDirectionFromDelta,
  type TouchControlAction, type TouchControlPreferences, type TouchDirection } from '../../touch-control-layout.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { uiFlex } from './layout.js';
import { paintUiSkin } from './art.js';
import { paintUiTouchDisc, paintUiTouchKnob, paintUiTouchPad, type UiTouchTone } from './touch-game.js';
export type UiTouchAction = Exclude<TouchControlAction, 'movement'>;
const TOUCH_DISCS: Record<UiTouchAction, { readonly tone: UiTouchTone; readonly icon: string; readonly key: string }> = {
  interact: { tone: 'success', icon: 'touch.hand', key: 'E' }, secondary: { tone: 'primary', icon: 'touch.tool', key: 'F' },
  jump: { tone: 'primary', icon: 'touch.jump', key: 'SPACE' }, dodge: { tone: 'info', icon: 'touch.dodge', key: 'V' },
  block: { tone: 'danger', icon: 'touch.block', key: 'HOLD' },
};
export interface UiTouchControlsOptions {
  readonly id?: string; readonly placement?: 'inline' | 'hud'; readonly layout?: UiStyle;
  /** Production gameplay keys use the existing world controls, not HUD focus. */
  readonly keyboard?: boolean; readonly preferences?: TouchControlPreferences;
  readonly onDirection?: (direction: TouchDirection) => void;
  readonly onAction?: (action: UiTouchAction) => void;
}
export interface UiTouchControlsElement extends UiElement {
  readonly direction: TouchDirection;
  isHeld(action: UiTouchAction): boolean;
  setPreferences(preferences: TouchControlPreferences): void;
  reset(): void;
}
/** Deliberately multi-pointer: movement, held guard and actions are independent. */
export function uiTouchControls(options: UiTouchControlsOptions): UiTouchControlsElement {
  let pointer: number | undefined, vector = { x: 0, y: 0 };
  let preferences = normalizeTouchControlPreferences(options.preferences ?? DEFAULT_TOUCH_CONTROL_PREFERENCES);
  const held = new Map<UiTouchAction, Set<number>>();
  const knob = new UiElement({ kind: 'joystick-knob', style: { position: 'absolute', width: uiFixed(24), height: uiFixed(24) },
    paint(element, { context, art }) {
      if (options.placement === 'hud') paintUiTouchKnob(context, element.rect.x + element.rect.width / 2, element.rect.y + element.rect.height / 2, 11);
      else if (art) paintUiSkin(context, art.skin.button, 'success.md.pill.idle', element.rect);
    },
  });
  const placeKnob = (element: UiElement) => {
    const radius = Math.max(0, Math.min(element.rect.width, element.rect.height) / 2 - 19);
    const length = Math.hypot(vector.x, vector.y), scale = length > radius ? radius / length : 1;
    knob.setStyle({ inset: { left: uiFixed(Math.max(0, Math.round(element.rect.width / 2 - 12 + vector.x * scale))),
      top: uiFixed(Math.max(0, Math.round(element.rect.height / 2 - 12 + vector.y * scale))) } });
  };
  const move = (element: UiElement, x: number, y: number) => {
    vector = { x, y }; const direction = touchDirectionFromDelta(x, y); element.setProps({ direction }, false);
    placeKnob(element); options.onDirection?.(direction);
  };
  const joystick = new UiElement({ id: options.id ? `${options.id}:movement` : undefined, kind: 'joystick', label: 'Movement',
    focusable: options.keyboard !== false, pointerMode: 'passthrough', props: { tone: 'primary', touchAction: 'movement' },
    style: { width: uiFixed(80), height: uiFixed(80), shrink: 0 }, children: [knob], onArrange: placeKnob,
    onPointer(event, element) {
      const x = event.point.x - element.rect.x - element.rect.width / 2, y = event.point.y - element.rect.y - element.rect.height / 2;
      if (event.type === 'down' && event.button === 0 && pointer === undefined) {
        // Keep the production circular radius+8 hit region, not its square bounds.
        if (Math.hypot(x, y) > Math.min(element.rect.width, element.rect.height) / 2) return false;
        pointer = event.pointerId; event.capture();
      }
      if (pointer !== event.pointerId) return false;
      if (event.type === 'up' || event.type === 'cancel') { pointer = undefined; event.release(); move(element, 0, 0); }
      else move(element, x, y);
      return true;
    },
    onKey(event, element) {
      if (options.keyboard === false) return false;
      const delta = ({ ArrowUp: [0,-20], ArrowDown: [0,20], ArrowLeft: [-20,0], ArrowRight: [20,0], ' ': [0,0], Escape: [0,0] } as Record<string, readonly number[]>)[event.key];
      if (!delta) return false; move(element, delta[0]!, delta[1]!); return true;
    },
    onFocus(focused, element) { if (!focused && pointer === undefined) move(element, 0, 0); },
    paint(element, { context, art }) {
      const well = { x: element.rect.x + 8, y: element.rect.y + 8, width: Math.max(0, element.rect.width - 16), height: Math.max(0, element.rect.height - 16) };
      // In the game the pad is the translucent parchment well; the inline lab keeps the pack's pill.
      if (options.placement === 'hud') paintUiTouchPad(context, well);
      else if (art) paintUiSkin(context, art.skin.button, 'primary.lg.pill.idle', well);
    },
  });
  const actions = (['interact','secondary','jump','dodge','block'] as const).map(action => {
    const pointers = new Set<number>(); held.set(action, pointers);
    const disc = TOUCH_DISCS[action];
    const button = uiButton({ id: options.id ? `${options.id}:${action}` : undefined,
      label: options.placement === 'hud' ? disc.key : action,
      layout: options.placement === 'hud' ? { padding: 0 } : undefined,
      // In the game each action is a round thumb disc: tone face, symbol and its keyboard letter.
      face: options.placement === 'hud' ? (element, { context, art, pressed, hovered, focused }) =>
        paintUiTouchDisc(context, art, element.rect, { tone: disc.tone, icon: disc.icon, key: disc.key, pressed: pressed || element.props['pressed'] === true, lit: hovered || focused }) : undefined,
      ariaLabel: action === 'block' ? 'Hold to block' : action === 'dodge' ? 'Dodge · 18 vigour' : action,
      size: 'lg', tone: action === 'interact' ? 'success' : 'primary', activateOn: 'down', onPress: () => options.onAction?.(action),
    });
    button.focusable = options.keyboard !== false; button.setProps({ touchAction: action });
    const original = button.hooks.onPointer!;
    Object.assign(button.hooks, { onPointer: (event: Parameters<typeof original>[0], element: UiElement) => {
      if (event.type === 'down' && event.button === 0) pointers.add(event.pointerId);
      if (event.type === 'up' || event.type === 'cancel') {
        pointers.delete(event.pointerId);
        if (pointers.size) { event.release(); return true; }
      }
      return original(event, element);
    } });
    return button;
  });
  const reset = (): void => {
    pointer = undefined; move(joystick, 0, 0);
    for (const button of actions) { held.get(button.props['touchAction'] as UiTouchAction)!.clear(); button.setProps({ pressed: false }, false); }
  };
  const root = options.placement !== 'hud'
    ? uiFlex({ id: options.id, direction: 'row', gap: 16, wrap: true, align: 'center', ...options.layout }, [joystick, uiFlex({ gap: 4 }, actions)])
    : new UiElement({ id: options.id, kind: 'touch-controls', style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [joystick, ...actions],
      measure(_element, available) {
        const layout = touchControlLayout(available.width, available.height, preferences), hitRadius = layout.joystickRadius + 8;
        const rects = [{ x: layout.joystickCenter.x - hitRadius, y: layout.joystickCenter.y - hitRadius, width: hitRadius * 2, height: hitRadius * 2 },
          layout.interactButton, layout.secondaryButton, layout.jumpButton, layout.dodgeButton, layout.blockButton];
        [joystick, ...actions].forEach((node, index) => { const rect = rects[index]!; node.setStyle({ position: 'absolute', width: uiFixed(rect.width), height: uiFixed(rect.height),
          inset: { left: uiFixed(Math.max(0, rect.x)), top: uiFixed(Math.max(0, rect.y)) } }); });
        return { min: { width: 0, height: 0 }, preferred: available };
      },
    });
  Object.assign(root.hooks, { onDispose: reset });
  const control = Object.assign(root, {
    isHeld: (action: UiTouchAction) => (held.get(action)?.size ?? 0) > 0,
    setPreferences(next: TouchControlPreferences) { reset(); preferences = normalizeTouchControlPreferences(next); root.invalidate(); },
    reset,
  });
  return Object.defineProperty(control, 'direction', { get: () => touchDirectionFromDelta(vector.x, vector.y) }) as UiTouchControlsElement;
}
