import { containsPoint, type UiRect } from '../../geometry.js';
import { layoutUiAnchoredRect } from '../../design-system/layout.js';
import { UiElement, type UiElementOptions } from '../runtime/element.js';
import { measureUiElement } from '../layout/measure.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_MOTION, type UiTone } from '../tokens.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
export interface UiPopoverOptions {
  readonly id?: string; readonly anchor?: UiElement | (() => UiRect); readonly content: UiElement;
  readonly tone?: UiTone; readonly width?: ReturnType<typeof uiFixed>; readonly open?: boolean; readonly onClose?: () => void;
}
export class UiOverlay extends UiElement {
  private opener: UiElement | undefined;
  constructor(options: UiElementOptions, private readonly place: (overlay: UiOverlay) => void, private readonly closed?: () => void, private readonly opened?: () => void) { super({ ...options, onPlace: element => place(element as UiOverlay) }); }
  open(opener?: UiElement): this { this.opener = opener ?? this.opener; this.setStyle({ visible: true }); this.opened?.(); this.place(this); return this; }
  close(): this { this.setStyle({ visible: false }); this.opener?.requestFocus(); this.closed?.(); return this; }
}
function viewport(node: UiElement): UiRect { while (node.parent) node = node.parent; return node.rect.width ? node.rect : { x: 0, y: 0, width: 320, height: 240 }; }
export function uiPopover(options: UiPopoverOptions): UiOverlay {
  const body = uiFrame({ tone: options.tone ?? 'neutral', style: 'thin', layout: { width: 'grow', height: 'fit', gap: 4 }, children: [options.content] });
  const popup = new UiOverlay({ id: options.id, kind: 'popover', style: { position: 'fixed', zLayer: 'floating', visible: options.open ?? false, width: options.width ?? uiFixed(240), height: 'fit', overflow: 'scroll-y', display: 'stack' }, children: [body],
    onDismiss() { popup.close(); }, onOutsidePointer(_element, point) { const anchor = options.anchor instanceof UiElement ? options.anchor.rect : options.anchor?.(); if (!anchor || !containsPoint(anchor, point)) popup.close(); },
  }, overlay => {
    let modal = false;
    for (let parent = overlay.parent; parent; parent = parent.parent) if (parent.style.zLayer === 'modal') modal = true;
    overlay.setStyle({ zLayer: modal ? 'toast' : 'floating' });
    const bounds = viewport(overlay), width = Math.max(1, Math.min(options.width?.size ?? 240, bounds.width));
    overlay.setStyle({ width: uiFixed(width), height: 'fit' });
    const measured = measureUiElement(overlay, bounds).preferred;
    const target = options.anchor instanceof UiElement ? options.anchor.rect : options.anchor?.() ?? bounds;
    const rect = layoutUiAnchoredRect(target, { width, height: Math.min(bounds.height, measured.height) }, { targetAnchor: 'bottom_left', selfAnchor: 'top_left', offset: { x: 0, y: 4 }, constrainTo: bounds });
    overlay.setStyle({ height: uiFixed(rect.height), inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) } });
  }, options.onClose);
  return popup;
}
export interface UiMenuItem { readonly id: string; readonly label: string; readonly disabled?: boolean; readonly tone?: UiTone; readonly onSelect?: () => void }
export function uiMenu(options: Omit<UiPopoverOptions, 'content'> & { readonly items: readonly UiMenuItem[] }): UiOverlay {
  const content = uiFlex({ gap: 2, width: 'grow' });
  const menu = uiPopover({ ...options, content });
  for (const item of options.items) {
    const button = uiButton({ label: item.label, disabled: item.disabled, tone: item.tone, onPress: () => { item.onSelect?.(); menu.close(); } });
    button.focusGroup = content.id; content.append(button);
  }
  return menu;
}
export function uiContextMenu(child: UiElement, items: readonly UiMenuItem[]): UiElement {
  let point = { x: 0, y: 0, width: 0, height: 0 };
  const menu = uiMenu({ anchor: () => point, items });
  const wrapper = new UiElement({ kind: 'context-menu', style: { display: 'stack', width: 'grow', height: 'grow' }, children: [child, menu],
    onContextMenu(event) { if (event.type !== 'down' || event.button !== 2) return false; point = { ...event.point, width: 0, height: 0 }; menu.open(child); return true; },
    onKey(event) { if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false; point = child.rect; menu.open(child); return true; },
  }); return wrapper;
}
export interface UiDialogOptions {
  readonly id?: string; readonly title: string; readonly tone?: UiTone; readonly children: readonly UiElement[];
  readonly open?: boolean; readonly dismissOnBackdrop?: boolean; readonly onClose?: () => void; readonly layout?: UiStyle;
}
export function uiDialog(options: UiDialogOptions): UiOverlay {
  const body = uiFrame({ tone: options.tone ?? 'neutral', header: { title: options.title, closable: true, onClose: () => dialog.close() },
    layout: { position: 'absolute', inset: { left: 8, top: 8 }, width: uiFixed(300), height: 'fit', gap: 8, ...options.layout }, children: options.children });
  const dialog = new UiOverlay({ id: options.id, kind: 'dialog', label: options.title,
    style: { position: 'fixed', zLayer: 'modal', visible: options.open ?? false, inset: { left: 0, top: 0 }, width: 'grow', height: 'grow', display: 'stack' }, children: [body],
    onDismiss() { dialog.close(); },
    onPointer(event) { if (event.type === 'up' && !containsPoint(body.rect, event.point) && options.dismissOnBackdrop !== false) { dialog.close(); return true; } return !containsPoint(body.rect, event.point); },
    paint(element, { context }) { const r = element.rect; context.globalAlpha = .35; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face; context.fillRect(r.x, r.y, r.width, r.height); },
  }, overlay => {
    const bounds = viewport(overlay), width = Math.max(1, Math.min(360, bounds.width - 16));
    body.setStyle({ visible: true, width: uiFixed(width), height: 'fit' }); const measured = measureUiElement(body, bounds).preferred;
    const height = Math.max(1, Math.min(measured.height, bounds.height - 16));
    body.setStyle({ height: uiFixed(height), inset: { left: uiFixed(Math.max(0, Math.floor((bounds.width - width) / 2))), top: uiFixed(Math.max(0, Math.floor((bounds.height - height) / 2))) } });
  }, options.onClose);
  return dialog;
}
export function uiConfirm(options: { readonly title: string; readonly message: string; readonly danger?: boolean; readonly onConfirm: () => void }): UiOverlay {
  const dialog = uiDialog({ title: options.title, tone: options.danger ? 'danger' : 'neutral', children: [uiText(options.message),
    uiFlex({ direction: 'row', gap: 4 }, [uiButton({ label: 'Cancel', onPress: () => dialog.close() }), uiButton({ label: options.danger ? 'Delete' : 'Confirm', tone: options.danger ? 'danger' : 'success', onPress: () => { options.onConfirm(); dialog.close(); } })]),
  ] }); return dialog;
}
export function uiPrompt(options: { readonly title: string; readonly label: string; readonly value?: string; readonly onConfirm: (value: string) => void }): UiOverlay {
  let value = options.value ?? '';
  const submit = () => { options.onConfirm(value); dialog.close(); };
  const input = uiInput({ label: options.label, value, onChange: next => { value = next; }, onSubmit: submit });
  const dialog = uiDialog({ title: options.title, children: [uiText(options.label), input, uiButton({ label: 'Save', tone: 'success', onPress: submit })] }); return dialog;
}
export function uiToast(options: { readonly id?: string; readonly message: string; readonly tone?: UiTone; readonly duration?: number; readonly action?: UiMenuItem; readonly onDismiss?: () => void }): UiOverlay {
  let started: number | undefined; let pausedAt: number | undefined; let hovered = false, focused = false;
  const pause = () => { const now = performance.now(); if (hovered || focused) pausedAt ??= now; else if (pausedAt !== undefined) { if (started !== undefined) started += now - pausedAt; pausedAt = undefined; } };
  const body = uiFrame({ tone: options.tone ?? 'info', style: 'parchment_plain', layout: { width: 'grow', height: 'fit', gap: 4 }, children: [uiText(options.message),
    ...(options.action ? [uiButton({ label: options.action.label, onPress: () => { options.action?.onSelect?.(); toast.close(); } })] : []),
    uiButton({ label: 'Dismiss', size: 'sm', onPress: () => toast.close() }),
  ] });
  const toast = new UiOverlay({ id: options.id, kind: 'toast', pointerMode: 'capture', label: options.message, animated: true, updatesWhenReduced: true,
    style: { position: 'fixed', zLayer: 'toast', visible: false, inset: { right: 8, top: 8 }, width: uiFixed(220), height: 'fit', overflow: 'scroll-y', display: 'stack' }, children: [body],
    onHover(value) { hovered = value; pause(); },
    onFocus(value) { focused = value; pause(); },
    onDismiss() { toast.close(); },
    paint(_element, { now }) { started ??= now; if (pausedAt === undefined && now - started >= (options.duration ?? UI_MOTION.toastMs)) toast.close(); },
  }, overlay => {
    const bounds = viewport(overlay), width = Math.min(220, bounds.width - 16); overlay.setStyle({ width: uiFixed(Math.max(1, width)), maxHeight: uiFixed(Math.max(1, bounds.height - 16)) });
    let root: UiElement = overlay; while (root.parent) root = root.parent;
    const toasts = (node: UiElement): UiElement[] => node.children.flatMap(child => [...(child.kind === 'toast' && child.visible ? [child] : []), ...toasts(child)]);
    const ordered = toasts(root), previous = ordered.slice(0, ordered.indexOf(overlay)); const top = previous.reduce((sum, node) => sum + (node.rect.height || 80) + 8, 8);
    overlay.setStyle({ inset: { right: 8, top: uiFixed(Math.min(top, Math.max(0, bounds.height - 80))) } });
  }, options.onDismiss, () => { started = undefined; pausedAt = undefined; hovered = false; focused = false; });
  return toast;
}
