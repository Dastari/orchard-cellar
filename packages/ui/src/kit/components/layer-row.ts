import { containsPoint } from '../../geometry.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import { UI_TONE_FACES, resolveUiTextContrast } from '../skin/contrast.js';
import { uiElementTone } from './art.js';
import { uiIcon, type UiIconSource } from './media.js';
import { uiText } from './text.js';
import { uiTooltip } from './tooltip.js';

/** One compact editor layer: optional visibility and lock toggles, then the
 * selectable name. Rows are 16 logical pixels high so a whole layer stack fits
 * in a drawer without scrolling. */
export interface UiLayerRowOptions {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly visible: boolean;
  /** Lock toggle appears only when `onToggleLock` is supplied. */
  readonly locked?: boolean;
  readonly onSelect: () => void;
  readonly onToggleVisible: () => void;
  readonly onToggleLock?: () => void;
  /** Stable control ids. Default to `${id}.select`, `${id}.visibility`, `${id}.lock`. */
  readonly selectId?: string;
  readonly visibilityId?: string;
  readonly lockId?: string;
  readonly layout?: UiStyle;
}

const ROW_HEIGHT = 16;

function layerAction(id: string, label: string, content: UiElement, onPress: () => void, width?: number): UiElement {
  let pressed = false;
  return new UiElement({
    id, kind: 'layer-action', label, focusable: true, pointerMode: 'capture',
    style: { display: 'flex', direction: 'row', align: 'center', justify: width ? 'center' : 'start',
      width: width ? uiFixed(width) : 'grow', height: uiFixed(ROW_HEIGHT), padding: 0 },
    children: [content],
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); return true; }
      if (event.type === 'up' && pressed) {
        pressed = false; event.release();
        if (containsPoint(element.clip, event.point)) onPress();
        return true;
      }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key === 'Enter' || event.key === ' ') { onPress(); return true; } return false; },
    paintOverlay(element, { context, focused }) {
      if (!focused) return;
      const r = element.rect;
      context.strokeStyle = resolveUiTextContrast(uiElementTone(element)).color; context.lineWidth = 1;
      context.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.width - 1), Math.max(0, r.height - 1));
    },
  });
}

function toggle(id: string, label: string, icon: UiIconSource, onPress: () => void): UiElement {
  return uiTooltip(label, layerAction(id, label, uiIcon(icon, { label, layout: { width: 'grow', height: 'grow' } }), onPress, ROW_HEIGHT),
    { width: uiFixed(ROW_HEIGHT), height: uiFixed(ROW_HEIGHT), shrink: 0 });
}

export function uiLayerRow(options: UiLayerRowOptions): UiElement {
  const selected = options.selected ?? false;
  const children = [
    toggle(options.visibilityId ?? `${options.id}.visibility`, `${options.visible ? 'Hide' : 'Show'} ${options.label}`,
      { lucide: options.visible ? 'visibility' : 'eyeOff' }, options.onToggleVisible),
    ...(options.onToggleLock ? [toggle(options.lockId ?? `${options.id}.lock`, `${options.locked ? 'Unlock' : 'Lock'} ${options.label}`,
      { lucide: options.locked ? 'lock' : 'unlock' }, options.onToggleLock)] : []),
    layerAction(options.selectId ?? `${options.id}.select`, options.label,
      uiText(options.label, { maxLines: 1, layout: { width: 'grow', minWidth: uiFixed(0) } }), options.onSelect),
  ];
  return new UiElement({
    id: options.id, kind: 'layer-row', label: options.label,
    props: { selected, visible: options.visible, locked: options.locked ?? false, ...(selected ? { tone: 'success' } : {}) },
    style: { display: 'flex', direction: 'row', width: 'grow', height: uiFixed(ROW_HEIGHT), align: 'center', gap: 2, shrink: 0, ...options.layout },
    paint(element, { context }) {
      if (!selected) return;
      const r = element.rect;
      context.fillStyle = UI_TONE_FACES.success.frame.face; context.fillRect(r.x, r.y, r.width, r.height);
    },
    children,
  });
}
