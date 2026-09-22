import { layoutUiAnchoredRect } from '../../design-system/layout.js';
import { measureUiElement } from '../layout/measure.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_MOTION } from '../tokens.js';
import { uiFrame } from './frame.js';
import { uiText } from './text.js';
export function uiTooltip(label: string | (() => string), child: UiElement, layout?: UiStyle): UiElement {
  const content = uiText(typeof label === 'function' ? label() : label,{wrap:true});
  const refresh = () => { const value = typeof label === 'function' ? label() : label; if (content.label !== value) content.setProps({ text: value }); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false, focused = false, dismissed = false;
  let hoverSince = 0;
  const popup = new UiElement({ kind: 'tooltip-popup', style: { position: 'fixed', zLayer: 'floating', visible: false, width: uiFixed(180), height: 'fit', display: 'stack', overflow: 'scroll-y' },
    children: [uiFrame({ tone: 'neutral', layout: { width: 'grow', height: 'fit' }, children: [content] })],
    onDismiss() { dismissed = true; hide(); },
  });
  const hide = () => { clearTimeout(timer); timer = undefined; popup.setStyle({ visible: false }); };
  const update = (element: UiElement) => {
    if (!hovered && !focused) { dismissed = false; hide(); return; }
    if (dismissed || timer !== undefined || popup.visible) return;
    timer = setTimeout(() => {
      timer = undefined; refresh(); if(!content.label.trim())return;
      let root = element; let inModal=false;for(let ancestor:UiElement|null=element;ancestor;ancestor=ancestor.parent)if(ancestor.style.zLayer==='modal')inModal=true;while (root.parent) root = root.parent;
      popup.setStyle({zLayer:inModal?'toast':'floating'});
      popup.setStyle({ visible: true, width: uiFixed(Math.min(180, root.rect.width)), height: 'fit' });
      const size = measureUiElement(popup, root.rect).preferred;
      const rect = layoutUiAnchoredRect(element.rect, { width: Math.min(size.width, root.rect.width), height: Math.min(size.height, root.rect.height) },
        { targetAnchor: 'bottom_left', selfAnchor: 'top_left', offset: { x: 0, y: 4 }, constrainTo: root.rect });
      popup.setStyle({ width: uiFixed(rect.width), height: uiFixed(rect.height), inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) } });
    }, focused ? 0 : Math.max(0, UI_MOTION.tooltipDelayMs - (performance.now() - hoverSince)));
  };
  return new UiElement({ kind: 'tooltip', style: { display: 'stack', ...layout }, children: [child, popup],
    measure() { refresh(); return { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } }; },
    onHover(value, element, since = performance.now()) { hovered = value; hoverSince = since; update(element); },
    onFocus(value, element, source) { focused = value && source !== 'pointer'; update(element); },
    onDispose: hide,
  });
}
