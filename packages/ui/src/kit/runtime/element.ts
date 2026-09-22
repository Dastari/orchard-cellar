import type { UiKitArt } from '../components/art.js';
import type { UiPoint, UiRect, UiSize } from '../../geometry.js';
import { UI_EMPTY_RECT, uiIsFixed, validateUiStyle, type UiMeasurement, type UiStyle } from '../layout/box.js';

export interface UiElementPointer {
  readonly type: 'down' | 'move' | 'up' | 'cancel'; readonly point: UiPoint;
  readonly pointerId: number; readonly button: number; readonly shiftKey?: boolean; readonly altKey?: boolean; readonly ctrlKey?: boolean; readonly metaKey?: boolean;
  capture(): void; release(): void;
}
export interface UiElementWheel { readonly point: UiPoint; readonly deltaX: number; readonly deltaY: number }
export interface UiElementKey { readonly key: string; readonly shiftKey?: boolean; readonly altKey?: boolean; readonly ctrlKey?: boolean; readonly metaKey?: boolean }
export interface UiPaintContext {
  readonly art?: UiKitArt; readonly context: CanvasRenderingContext2D; readonly now: number; readonly focused: boolean;
  readonly hovered: boolean; readonly reducedMotion: boolean;
}
export interface UiElementHooks {
  readonly animated?: boolean; readonly updatesWhenReduced?: boolean;
  readonly measure?: (element: UiElement, available: UiSize) => UiMeasurement;
  readonly paint?: (element: UiElement, paint: UiPaintContext) => void;
  readonly paintOverlay?: (element: UiElement, paint: UiPaintContext) => void;
  readonly onPointerObserved?: (event: Omit<UiElementPointer, 'capture' | 'release'>, element: UiElement) => void;
  readonly onPointer?: (event: UiElementPointer, element: UiElement) => boolean;
  readonly onScroll?: (element: UiElement) => void;
  readonly onPlace?: (element: UiElement, viewport: UiRect) => void;
  readonly onArrange?: (element: UiElement) => void;
  readonly onWheel?: (event: UiElementWheel, element: UiElement) => boolean;
  readonly onKeyCapture?: (event: UiElementKey, element: UiElement) => boolean;
  readonly onContextMenu?: (event: UiElementPointer, element: UiElement) => boolean;
  readonly onOutsidePointer?: (element: UiElement, point: UiPoint) => void;
  readonly onKey?: (event: UiElementKey, element: UiElement) => boolean;
  readonly onBeforeInput?: (event: { readonly inputType: string; readonly data?: string | null }, element: UiElement) => boolean;
  readonly onComposition?: (type: 'start' | 'update' | 'end', data: string, element: UiElement) => boolean;
  readonly onClipboard?: (type: 'copy' | 'cut' | 'paste', data: string, element: UiElement) => string | null;
  readonly onText?: (text: string, element: UiElement) => boolean;
  readonly onHover?: (hovered: boolean, element: UiElement, since?: number) => void;
  readonly onFocus?: (focused: boolean, element: UiElement, source?: 'keyboard' | 'pointer') => void;
  readonly onDismiss?: (element: UiElement) => void;
  readonly onDispose?: (element: UiElement) => void;
}
export interface UiElementOptions extends UiElementHooks {
  readonly id?: string; readonly kind?: string; readonly style?: UiStyle;
  readonly props?: Readonly<Record<string, unknown>>; readonly children?: readonly UiElement[];
  readonly focusable?: boolean; readonly disabled?: boolean; readonly label?: string;
  readonly pointerMode?: 'capture' | 'passthrough'; readonly focusGroup?: string;
}
let nextId = 0;
export class UiElement {
  readonly id: string; readonly kind: string; readonly hooks: UiElementHooks;
  private childList: UiElement[] = [];
  parent: UiElement | null = null;
  private currentStyle: UiStyle; private currentProps: Readonly<Record<string, unknown>>;
  focusable: boolean; disabled: boolean; label: string; focusGroup?: string;
  pointerMode: 'capture' | 'passthrough';
  rect = UI_EMPTY_RECT; clip = UI_EMPTY_RECT; contentRect = UI_EMPTY_RECT;
  measured: UiMeasurement = { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } };
  measureWidth = -1; measureHeight = -1;
  measureDirty = true; layoutDirty = true; descendantsDirty = true;
  scroll = { x: 0, y: 0, maxX: 0, maxY: 0 };
  invalidateRoot?: (structure: boolean) => void;
  disposed = false;
  constructor(options: UiElementOptions = {}) {
    this.id = options.id ?? `ui-${++nextId}`; this.kind = options.kind ?? 'box'; this.hooks = options;
    this.currentStyle = validateUiStyle({ ...options.style }); this.currentProps = Object.freeze({ ...options.props });
    this.focusable = options.focusable ?? false; this.disabled = options.disabled ?? false;
    this.label = options.label ?? ''; this.focusGroup = options.focusGroup;
    this.pointerMode = options.pointerMode ?? 'passthrough';
    for (const child of options.children ?? []) this.append(child);
  }
  get style(): UiStyle { return this.currentStyle; }
  get props(): Readonly<Record<string, unknown>> { return this.currentProps; }
  get children(): readonly UiElement[] { return this.childList; }
  get visible(): boolean { return this.style.visible !== false && this.style.display !== 'none' && !this.disposed; }
  setStyle(style: Partial<UiStyle>): this {
    this.currentStyle = validateUiStyle({ ...this.style, ...style }); this.invalidate(true); return this;
  }
  setProps(props: Readonly<Record<string, unknown>>, affectsLayout = true): this {
    this.currentProps = Object.freeze({ ...this.props, ...props });
    if (typeof props['label'] === 'string') this.label = props['label'];
    else if (this.kind === 'text' && typeof props['text'] === 'string') this.label = props['text'];
    if (affectsLayout) this.invalidate(); else this.invalidateRoot?.(false);
    return this;
  }
  requestFocus(): this { this.setProps({ focusRequested: true }, false); return this; }
  setDisabled(disabled: boolean): this { this.disabled = disabled; this.invalidateRoot?.(true); return this; }
  append(child: UiElement): this {
    if (child.disposed || this.disposed) throw new Error('Cannot attach a disposed UI element');
    if (this === child) throw new Error('UI trees cannot contain cycles');
    for (let node = this.parent; node; node = node.parent) if (node === child) throw new Error('UI trees cannot contain cycles');
    if (child.parent) child.parent.remove(child);
    child.parent = this; this.childList.push(child); child.connect(this.invalidateRoot); this.invalidate(true); return this;
  }
  remove(child: UiElement): boolean {
    const index = this.childList.indexOf(child); if (index < 0) return false;
    this.childList.splice(index, 1); child.parent = null; child.connect(undefined); this.invalidate(true); return true;
  }
  replaceChildren(children: readonly UiElement[]): this {
    for (const child of [...this.childList]) this.remove(child);
    for (const child of children) this.append(child);
    return this;
  }
  connect(invalidate: ((structure: boolean) => void) | undefined): void {
    this.invalidateRoot = invalidate; for (const child of this.childList) child.connect(invalidate);
  }
  invalidate(structure = false): void {
    this.measureDirty = true; this.layoutDirty = true;
    let affectsSize = true;
    for (let parent = this.parent; parent; parent = parent.parent) {
      parent.descendantsDirty = true;
      if (affectsSize) {
        parent.layoutDirty = true; parent.measureDirty = true;
        affectsSize = !(uiIsFixed(parent.style.width) && uiIsFixed(parent.style.height));
      }
    }
    this.invalidateRoot?.(structure);
  }
  isDescendantOf(ancestor: UiElement): boolean {
    if (this === ancestor) return true;
    for (let node = this.parent; node; node = node.parent) if (node === ancestor) return true;
    return false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.parent?.remove(this); this.disposed = true;
    for (const child of [...this.childList]) child.dispose();
    this.childList = []; this.hooks.onDispose?.(this); this.connect(undefined);
  }
}
export interface UiElementInspection { readonly id: string; readonly kind: string; readonly parent: string | null;
  readonly style: UiStyle; readonly measured: UiMeasurement; readonly rect: UiRect; readonly clip: UiRect }
export function inspectUiElements(element: UiElement): UiElementInspection[] {
  const entries: UiElementInspection[] = [];
  function visit(node: UiElement): void {
    entries.push({ id: node.id, kind: node.kind, parent: node.parent?.id ?? null, style: node.style,
      measured: node.measured, rect: node.rect, clip: node.clip });
    for (const child of node.children) visit(child);
  }
  visit(element); return entries;
}

export function uiElementEnabled(element: UiElement): boolean {
  if (!element.visible || element.disabled) return false;
  for (let parent = element.parent; parent; parent = parent.parent) if (!parent.visible || parent.disabled) return false;
  return true;
}
