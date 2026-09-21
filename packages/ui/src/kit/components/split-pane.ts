import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiFixedDimension, type UiStyle } from '../layout/box.js';
import { uiSeparator } from './layout.js';
export interface UiSplitPaneOptions {
  readonly id?: string; readonly label: string; readonly first: UiElement; readonly second: UiElement;
  readonly direction?: 'row' | 'column'; readonly ratio?: number; readonly minimum?: UiFixedDimension;
  readonly layout?: UiStyle; readonly onResize?: (ratio: number) => void;
}
/** The split handle takes part in layout, so both panes share paint/hit geometry. */
export function uiSplitPane(options: UiSplitPaneOptions): UiElement {
  if (options.ratio !== undefined && !Number.isFinite(options.ratio)) throw new Error('UI split ratio must be finite');
  const direction = options.direction ?? 'row', horizontal = direction === 'row', minimum = options.minimum?.size ?? 64;
  uiFixed(minimum);
  let preference = Math.max(0, Math.min(1, options.ratio ?? .5)), dragging = false;
  const handle = new UiElement({ id: options.id ? `${options.id}.resize` : undefined, kind: 'split-resize',
    label: `Resize ${options.label}`, focusable: true, pointerMode: 'capture',
    style: { width: horizontal ? uiFixed(4) : 'grow', height: horizontal ? 'grow' : uiFixed(4), shrink: 0 },
    children: [uiSeparator({ vertical: horizontal }).setStyle({ width: 'grow', height: 'grow' })],
    onPointer(event) {
      if (event.type === 'down' && event.button === 0) { dragging = true; event.capture(); return true; }
      if (dragging && event.type === 'move') {
        const rect = split.contentRect, available = Math.max(0, (horizontal ? rect.width : rect.height) - 4);
        apply(available ? ((horizontal ? event.point.x - rect.x : event.point.y - rect.y) - 2) / available : .5); return true;
      }
      if (dragging && (event.type === 'up' || event.type === 'cancel')) { dragging = false; event.release(); return true; }
      return false;
    },
    onKey(event) {
      const back = horizontal ? 'ArrowLeft' : 'ArrowUp', forward = horizontal ? 'ArrowRight' : 'ArrowDown';
      if (![back, forward, 'Home', 'End', 'Enter'].includes(event.key)) return false;
      apply(event.key === 'Enter' ? .5 : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : preference + (event.key === back ? -.05 : .05)); return true;
    },
  });
  const pane = (child: UiElement, name: string) => new UiElement({ id: options.id ? `${options.id}.${name}` : undefined,
    kind: 'split-pane', style: { width: 'grow', height: 'grow', display: 'stack' }, children: [child] });
  const first = pane(options.first, 'first'), second = pane(options.second, 'second');
  const clamp = (ratio: number) => {
    const available = Math.max(0, (horizontal ? split.contentRect.width : split.contentRect.height) - 4);
    const limit = available ? Math.min(.5, minimum / available) : .5;
    return Math.max(limit, Math.min(1 - limit, ratio));
  };
  const apply = (ratio: number) => { preference = clamp(ratio); split.invalidate(); options.onResize?.(preference); };
  const split = new UiElement({ id: options.id, kind: 'split', label: options.label,
    style: { width: 'grow', height: 'grow', ...options.layout, display: 'flex', direction, gap: 0 }, children: [first, handle, second],
    onArrange(element) {
      const available = Math.max(0, (horizontal ? element.contentRect.width : element.contentRect.height) - 4);
      const ratio = clamp(preference), size = Math.round(available * ratio);
      const dimension = horizontal ? first.style.width : first.style.height;
      if (typeof dimension !== 'object' || dimension.mode !== 'fixed' || dimension.size !== size)
        first.setStyle(horizontal ? { width: uiFixed(size), height: 'grow', shrink: 0 } : { height: uiFixed(size), width: 'grow', shrink: 0 });
      if (element.props['ratio'] !== ratio) element.setProps({ ratio }, false);
    },
  });
  return split;
}
