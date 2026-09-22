import { containsPoint } from '../../geometry.js';
import { paintUiScrollbar } from './scroll-art.js';
import { uiPaddingInsets } from '../layout/box.js';
import { UiElement, type UiElementOptions } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { resolveUiTextContrast } from '../skin/contrast.js';
import { uiElementTone } from './art.js';
import type { UiSpace } from '../tokens.js';
export interface UiContainerOptions extends UiStyle { readonly id?: string; readonly label?: string }
export function uiFlex(options: UiContainerOptions = {}, children: readonly UiElement[] = []): UiElement {
  const { id, label, ...style } = options;
  return new UiElement({ id, label, kind: 'flex', style: { display: 'flex', direction: 'column', ...style }, children });
}
export function uiGrid(options: UiContainerOptions = {}, children: readonly UiElement[] = []): UiElement {
  const { id, label, ...style } = options; return new UiElement({ id, label, kind: 'grid', style: { ...style, display: 'grid' }, children });
}
export function uiStack(options: UiContainerOptions = {}, children: readonly UiElement[] = []): UiElement {
  const { id, label, ...style } = options; return new UiElement({ id, label, kind: 'stack', style: { ...style, display: 'stack' }, children });
}
/** Windows retain their layout coordinates when focus raises their paint/hit order. */
export function uiWindowStack(options: UiContainerOptions = {}, windows: readonly UiElement[] = []): UiElement {
  const { id, label, ...style } = options;
  return new UiElement({ id, label, kind: 'window-stack', props: { windowStack: true }, style: { ...style, display: 'stack' }, children: windows,
    onPointerObserved(event, element) {
      if (event.type !== 'down') return;
      const window = element.children.toReversed().find(child => child.visible && containsPoint(child.rect, event.point) && containsPoint(child.clip, event.point));
      if (window && element.children.at(-1) !== window) element.append(window);
    },
  });
}
export function uiSpacer(size?: UiSpace): UiElement {
  return new UiElement({ kind: 'spacer', style: size === undefined ? { width: 'grow', height: 'grow' }
    : { width: uiFixed(size), height: uiFixed(size), shrink: 0 } });
}
export function uiSeparator(options: { readonly vertical?: boolean; readonly id?: string } = {}): UiElement {
  return new UiElement({ id: options.id, kind: 'separator', style: options.vertical
    ? { width: uiFixed(1), height: 'grow', shrink: 0 } : { width: 'grow', height: uiFixed(1), shrink: 0 },
  paint(element, { context }) {
    context.fillStyle = resolveUiTextContrast(uiElementTone(element)).color;
    const r = element.rect; context.fillRect(r.x, r.y, r.width, r.height);
  } });
}
export function uiScrollArea(options: UiContainerOptions & { readonly initialScrollY?: number; readonly onScroll?: (element: UiElement) => void } = {}, children: readonly UiElement[] = []): UiElement {
  const { id, label, initialScrollY, onScroll, ...style } = options;
  const area = new UiElement({ id, label, onScroll, kind: 'scroll-area', props:{scrollbarWidth:style.padding===undefined?12:Math.max(4,Math.min(12,uiPaddingInsets(style.padding).right))}, style: { display: 'flex', direction: 'column', width: 'grow', height: 'grow', ...style, padding:style.padding??{right:16}, overflow: options.overflow ?? 'scroll-y' }, children,
    paintOverlay(element, { context, art }) { paintUiScrollbar(element, context, art); },
  });
  area.scroll.y = Math.max(0, initialScrollY ?? 0); return area;
}
/** Internal component constructor keeps public composition on factories. */
export function uiComponent(options: UiElementOptions): UiElement { return new UiElement(options); }
