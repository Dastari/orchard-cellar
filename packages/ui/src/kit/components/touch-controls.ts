import { touchControlLayout, touchDirectionFromDelta, type TouchDirection } from '../../touch-control-layout.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { uiFlex } from './layout.js';
import { paintUiSkin } from './art.js';
export interface UiTouchControlsOptions {
  readonly id?: string;
  readonly placement?: 'inline' | 'hud';
  readonly layout?: UiStyle;
  readonly onDirection?: (direction: TouchDirection) => void;
  readonly onAction?: (action: 'interact' | 'secondary' | 'jump') => void;
}
export function uiTouchControls(options: UiTouchControlsOptions): UiElement {
  let pointer: number | undefined;
  let vector = { x: 0, y: 0 };
  const knob = new UiElement({ kind: 'joystick-knob', style: { position: 'absolute', width: uiFixed(24), height: uiFixed(24) },
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.button, 'success.md.pill.idle', element.rect); },
  });
  const placeKnob = (element: UiElement) => {
    const radius = Math.max(0, Math.min(element.rect.width, element.rect.height) / 2 - 14);
    const length = Math.hypot(vector.x, vector.y), scale = length > radius ? radius / length : 1;
    knob.setStyle({ inset: { left: uiFixed(Math.max(0, Math.round(element.rect.width / 2 - 12 + vector.x * scale))),
      top: uiFixed(Math.max(0, Math.round(element.rect.height / 2 - 12 + vector.y * scale))) } });
  };
  const move = (element: UiElement, x: number, y: number) => {
    vector = { x, y }; element.setProps({ direction: touchDirectionFromDelta(x,y) }, false);
    placeKnob(element); options.onDirection?.(touchDirectionFromDelta(x,y));
  };
  const joystick = new UiElement({ id: options.id ? `${options.id}:movement` : undefined, kind: 'joystick', label: 'Movement',
    focusable: true, pointerMode: 'capture', props: { tone: 'primary', touchAction: 'movement' },
    style: { width: uiFixed(80), height: uiFixed(80), shrink: 0 }, children: [knob],
    onArrange: placeKnob,
    onDispose() { options.onDirection?.('idle'); },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0 && pointer === undefined) { pointer = event.pointerId; event.capture(); }
      if (pointer !== event.pointerId) return false;
      if (event.type === 'up' || event.type === 'cancel') { pointer = undefined; event.release(); move(element,0,0); }
      else move(element, event.point.x - element.rect.x - element.rect.width / 2, event.point.y - element.rect.y - element.rect.height / 2);
      return true;
    },
    onKey(event, element) {
      const delta = ({ ArrowUp: [0,-20], ArrowDown: [0,20], ArrowLeft: [-20,0], ArrowRight: [20,0], ' ': [0,0], Escape: [0,0] } as Record<string, readonly number[]>)[event.key];
      if (!delta) return false; move(element,delta[0]!,delta[1]!); return true;
    },
    onFocus(focused, element) { if (!focused && pointer === undefined) move(element,0,0); },
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.button, 'primary.lg.pill.idle', element.rect); },
  });
  const actions = (['interact','secondary','jump'] as const).map(action => {
    const held = new Set<number>();
    const button = uiButton({ id: options.id ? `${options.id}:${action}` : undefined,
    label: options.placement === 'hud' ? ({ interact: 'E', secondary: 'F', jump: 'JUMP' })[action] : action,
    ariaLabel: action, size: 'lg', tone: action === 'interact' ? 'success' : 'primary', activateOn: 'down', onPress: () => options.onAction?.(action),
    });
    return new UiElement({ ...button.hooks, props: { ...button.props, touchAction: action },
      onPointer(event, element) {
        if (event.type === 'down' && event.button === 0) held.add(event.pointerId);
        if (event.type === 'up' || event.type === 'cancel') { held.delete(event.pointerId); if (held.size) return true; }
        return button.hooks.onPointer?.(event, element) ?? false;
      },
    });
  });
  if (options.placement !== 'hud') return uiFlex({ id: options.id, direction: 'row', gap: 16, wrap: true, align: 'center', ...options.layout }, [joystick, uiFlex({ gap: 4 }, actions)]);
  return new UiElement({ id: options.id, kind: 'touch-controls', style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [joystick, ...actions],
    measure(_element, available) {
      const layout = touchControlLayout(available.width, available.height);
      const rects = [{ x: layout.joystickCenter.x - layout.joystickRadius, y: layout.joystickCenter.y - layout.joystickRadius,
        width: layout.joystickRadius * 2, height: layout.joystickRadius * 2 }, layout.interactButton, layout.secondaryButton, layout.jumpButton];
      [joystick,...actions].forEach((node,index) => { const rect = rects[index]!; node.setStyle({ position: 'absolute', width: uiFixed(rect.width), height: uiFixed(rect.height),
        inset: { left: uiFixed(Math.max(0,rect.x)), top: uiFixed(Math.max(0,rect.y)) } }); });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
