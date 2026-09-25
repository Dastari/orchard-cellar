import type { UiRect } from '../../geometry.js';
import { layoutUiAnchoredRect } from '../../design-system/layout.js';
import { measureUiElement } from '../layout/measure.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_MOTION } from '../tokens.js';
import { paintUiSkin } from './art.js';
import { UI_ITEM_INKS } from '../tokens.js';
import { uiText } from './text.js';
export const UI_TOOLTIP_MAX_WIDTH = 160;
/** The hint panel alone: dark frame, 6px padding, width fitted to the text up to the maximum. */
export function uiHintPanel(text: string): UiElement {
  const content = uiText(text, { wrap: true }); content.setProps({ ink: UI_ITEM_INKS.body });
  const width = Math.min(UI_TOOLTIP_MAX_WIDTH, measureUiElement(content, { width: UI_TOOLTIP_MAX_WIDTH - 12, height: 400 }).preferred.width + 12);
  return new UiElement({ kind: 'tooltip-frame', props: { itemInks: true }, style: { display: 'flex', direction: 'column', width: uiFixed(width), height: 'fit', padding: 6, shrink: 0 }, children: [content],
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.frame, 'tooltip_dark.neutral', element.rect); } });
}
export interface UiTooltipPlacement {
  /** A part of the child to point at (a hovered slot inside a bar); it follows while the popup is open. */
  readonly anchor?: () => UiRect | null;
  /** Below the target (default) or centred above it. */
  readonly side?: 'below' | 'above';
}
export function uiTooltip(label: string | (() => string), child: UiElement, layout?: UiStyle, placement: UiTooltipPlacement = {}): UiElement {
  const content = uiText(typeof label === 'function' ? label() : label, { wrap: true });
  // Plain hints share the dark Gear-D4 frame and body ink with item tooltips.
  content.setProps({ ink: UI_ITEM_INKS.body });
  const refresh = () => { const value = typeof label === 'function' ? label() : label; if (content.label !== value) content.setProps({ text: value }); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false, focused = false, dismissed = false;
  let hoverSince = 0;
  const popup = new UiElement({ kind: 'tooltip-popup', style: { position: 'fixed', zLayer: 'floating', visible: false, width: uiFixed(180), height: 'fit', display: 'stack', overflow: 'scroll-y' },
    children: [new UiElement({ kind: 'tooltip-frame', props: { itemInks: true }, style: { display: 'flex', direction: 'column', width: 'grow', height: 'fit', padding: 6 }, children: [content],
      paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.frame, 'tooltip_dark.neutral', element.rect); } })],
    onDismiss() { dismissed = true; hide(); },
  });
  const hide = () => { clearTimeout(timer); timer = undefined; popup.setStyle({ visible: false }); };
  const place = (element: UiElement, root: UiElement) => {
    const size = measureUiElement(popup, root.rect).preferred, target = placement.anchor?.() ?? element.rect;
    const above = placement.side === 'above';
    const rect = layoutUiAnchoredRect(target, { width: Math.min(size.width, root.rect.width), height: Math.min(size.height, root.rect.height) },
      above ? { targetAnchor: 'top', selfAnchor: 'bottom', offset: { x: 0, y: -4 }, constrainTo: root.rect }
        : { targetAnchor: 'bottom_left', selfAnchor: 'top_left', offset: { x: 0, y: 4 }, constrainTo: root.rect });
    popup.setStyle({ width: uiFixed(rect.width), height: uiFixed(rect.height), inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) } });
  };
  const update = (element: UiElement) => {
    if (!hovered && !focused) { dismissed = false; hide(); return; }
    if (dismissed || timer !== undefined || popup.visible) return;
    const show = () => {
      timer = undefined; refresh(); if(!content.label.trim())return;
      let root = element; let inModal=false;for(let ancestor:UiElement|null=element;ancestor;ancestor=ancestor.parent)if(ancestor.style.zLayer==='modal')inModal=true;while (root.parent) root = root.parent;
      popup.setStyle({zLayer:inModal?'toast':'floating'});
      // Fit the text plus 6px padding each side, wrapping once it reaches the 160px maximum.
      const natural = measureUiElement(content, { width: UI_TOOLTIP_MAX_WIDTH - 12, height: root.rect.height }).preferred.width + 12;
      popup.setStyle({ visible: true, width: uiFixed(Math.min(natural, UI_TOOLTIP_MAX_WIDTH, root.rect.width)), height: 'fit' });
      place(element, root);
    };
    const delay = focused ? 0 : Math.max(0, UI_MOTION.tooltipDelayMs - (performance.now() - hoverSince));
    if (delay === 0) show(); else timer = setTimeout(show, delay);
  };
  return new UiElement({ kind: 'tooltip', style: { display: 'stack', ...layout }, children: [child, popup],
    measure(element) {
      refresh();
      // An anchored popup follows its anchor (the next hovered slot) and closes when there is nothing to say.
      if (placement.anchor && popup.visible) {
        if (!content.label.trim()) hide();
        else { let root = element; while (root.parent) root = root.parent; place(element, root); }
      } else if (placement.anchor && content.label.trim()) update(element);
      return { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } };
    },
    onHover(value, element, since = performance.now()) { hovered = value; hoverSince = since; update(element); },
    onFocus(value, element, source) { focused = value && source !== 'pointer'; update(element); },
    onDispose: hide,
  });
}
