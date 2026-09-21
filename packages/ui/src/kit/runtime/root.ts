import { paintUiSkin } from '../components/art.js';
import { UiTextBridge } from './text-bridge.js';
import type { UiKitArt } from '../components/art.js';
import type { UiPoint, UiRect } from '../../geometry.js';
import { uiIntersectRect } from '../layout/box.js';
import { arrangeUiElement, type UiArrangeStats } from '../layout/arrange.js';
import type { UiLayer, UiScale } from '../tokens.js';
import { UiAnimations, type UiAnimation } from './animation.js';
import { UiElement, type UiElementKey, type UiElementWheel, type UiElementHooks } from './element.js';
import { UiFocus } from './focus.js';
import { UiInput, type UiRootPointer } from './input.js';
import { uiPaintEntries, type UiPaintEntry } from './layers.js';
export interface UiRootOptions { readonly onInvalidate?: () => void; readonly art?: UiKitArt; readonly scale?: UiScale; readonly dpr?: number; readonly label?: string; readonly reducedMotion?: boolean }
export class UiRoot {
  readonly tree = new UiElement({ id: 'ui-root', kind: 'root', style: { display: 'stack', width: 'grow', height: 'grow' } });
  readonly animations = new UiAnimations();
  readonly focus = new UiFocus(() => this.invalidate());
  readonly input = new UiInput(() => this.entries(), this.focus, () => this.invalidate());
  art?: UiKitArt; scale: UiScale; dpr: number; reducedMotion: boolean;
  viewport: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private paintList: UiPaintEntry[] = [];
  private structureDirty = true; private dirty = true;
  private canvas: HTMLCanvasElement | null = null;
  private frame: number | null = null;
  private cleanup: (() => void) | null = null;
  private cssWidth = 0; private cssHeight = 0;
  private label: string; private readonly notify?: () => void;
  disposed = false;
  constructor(options: UiRootOptions = {}) {
    this.notify = options.onInvalidate; this.art = options.art; this.scale = options.scale ?? 2; this.dpr = options.dpr ?? 1;
    this.reducedMotion = options.reducedMotion ?? false; this.label = options.label ?? 'Orchard UI';
    this.tree.connect(structure => this.invalidate(structure));
  }
  animate(id: string, animation: UiAnimation): void { this.animations.add(id, animation); this.invalidate(); }
  mount(element: UiElement): UiElement { this.tree.append(element); return element; }
  unmount(element: UiElement): void { this.tree.remove(element); }
  resize(width: number, height: number, dpr = this.dpr): void {
    if (![width, height, dpr].every(Number.isFinite) || dpr <= 0) throw new Error('Invalid UI viewport');
    if (this.cssWidth === width && this.cssHeight === height && this.dpr === dpr
      && this.viewport.width === Math.floor(width / this.scale) && this.viewport.height === Math.floor(height / this.scale)
      && (!this.canvas || this.canvas.width === Math.round(width * dpr) && this.canvas.height === Math.round(height * dpr))) return;
    this.cssWidth = Math.max(0, width); this.cssHeight = Math.max(0, height); this.dpr = dpr;
    this.viewport = { x: 0, y: 0, width: Math.floor(this.cssWidth / this.scale), height: Math.floor(this.cssHeight / this.scale) };
    if (this.canvas) {
      this.canvas.width = Math.round(this.cssWidth * dpr); this.canvas.height = Math.round(this.cssHeight * dpr);
      this.canvas.style.width = `${this.cssWidth}px`; this.canvas.style.height = `${this.cssHeight}px`;
    }
    this.tree.invalidate();
  }
  setScale(scale: UiScale): void {
    if (![1, 2, 3].includes(scale)) throw new Error('UI scale must be 1, 2 or 3');
    if (scale !== this.scale) { this.scale = scale; this.resize(this.cssWidth, this.cssHeight); }
  }
  invalidate(structure = false): void {
    if (this.disposed) return;
    this.dirty = true; this.structureDirty ||= structure; this.notify?.(); this.schedule();
  }
  entries(): readonly UiPaintEntry[] {
    if (this.structureDirty) { this.paintList = uiPaintEntries(this.tree); this.structureDirty = false; }
    return this.paintList;
  }
  arrange(): UiArrangeStats {
    if (this.tree.props['art'] !== this.art) this.tree.setProps({ art: this.art }, false);
    const stats = arrangeUiElement(this.tree, this.viewport, this.viewport, this.viewport);
    this.focus.update(this.entries()); this.textBridge?.sync(); return stats;
  }
  draw(context: CanvasRenderingContext2D, now = performance.now(), clear = true, view?: { readonly scale: number; readonly x: number; readonly y: number; readonly clip?: UiRect }): void {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (clear) context.clearRect(0, 0, Math.round(this.cssWidth * this.dpr), Math.round(this.cssHeight * this.dpr));
    context.setTransform((view?.scale ?? this.scale) * this.dpr, 0, 0, (view?.scale ?? this.scale) * this.dpr, (view?.x ?? 0) * this.dpr, (view?.y ?? 0) * this.dpr);
    try { this.drawInContext(context, now, view?.clip); } finally { context.restore(); }
  }
  /** Paint into a host-owned HUD layer, preserving its transform and pixels.
   * Input coordinates and resize dimensions remain logical kit coordinates. */
  drawInContext(context: CanvasRenderingContext2D, now = performance.now(), viewportClip?: UiRect, layers?: readonly UiLayer[]): void {
    this.arrange();
    context.save();
    context.imageSmoothingEnabled = false;
    try {
      const paint = (element: UiElement, hook: UiElementHooks['paint']) => {
        if (!hook || element.clip.width <= 0 || element.clip.height <= 0) return;
        const clip = viewportClip ? uiIntersectRect(element.clip, viewportClip) : element.clip;
        if (clip.width <= 0 || clip.height <= 0) return;
        context.save(); context.beginPath(); context.rect(clip.x, clip.y, clip.width, clip.height); context.clip();
        try { hook(element, { art: this.art, context, now, focused: this.focus.current === element,
          hovered: this.input.hovered?.isDescendantOf(element) ?? false, reducedMotion: this.reducedMotion }); }
        finally { context.restore(); }
      };
      // Scroll chrome follows its content within its layer, below floating windows.
      let layer: UiPaintEntry['layer'] | undefined;
      const overlays: UiElement[] = [];
      const flush = (count = overlays.length) => {
        for (let i = 0; i < count; i++) {
          const node = overlays.pop()!; paint(node, node.hooks.paintOverlay);
          if (this.focus.current === node && this.focus.inputSource === 'keyboard' && !node.props['focusChrome']) paint(node, (element, { context }) => {
            if (this.art && !this.art.missingArt) paintUiSkin(context, this.art.skin.button, 'outline.md.chamfered.idle.white', element.rect);
          });
        }
      };
      for (const entry of this.entries()) {
        if (layers && !layers.includes(entry.layer)) continue;
        if (entry.layer !== layer) { flush(); layer = entry.layer; }
        while (overlays.length && !entry.element.isDescendantOf(overlays.at(-1)!)) flush(1);
        paint(entry.element, entry.element.hooks.paint);
        if (entry.element.hooks.paintOverlay || this.focus.current === entry.element) overlays.push(entry.element);
      }
      flush();
    } finally { context.restore(); }
    this.dirty = false;
    if (this.canvas) this.canvas.setAttribute('aria-label', `${this.label}${this.focus.current ? `: ${this.focus.current.label || this.focus.current.id}` : ''}`);
  }
  pointer(event: UiRootPointer): boolean { this.arrange(); return this.input.pointer(event); }
  wheel(event: UiElementWheel): boolean { this.arrange(); return this.input.wheel(event); }
  key(event: UiElementKey): boolean { this.arrange(); return this.input.key(event); }
  text(text: string): boolean { return this.input.text(text); }
  clientPoint(x: number, y: number): UiPoint {
    const bounds = this.canvas?.getBoundingClientRect();
    return bounds ? { x: (x - bounds.left) * this.cssWidth / Math.max(1, bounds.width) / this.scale,
      y: (y - bounds.top) * this.cssHeight / Math.max(1, bounds.height) / this.scale } : { x: x / this.scale, y: y / this.scale };
  }
  bindCanvas(canvas: HTMLCanvasElement): () => void {
    this.cleanup?.(); this.canvas = canvas;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', this.label);
    this.textBridge = new UiTextBridge(canvas, () => this.focus.current, event => this.key(event), element => { const bounds = canvas.getBoundingClientRect(); return { x: bounds.x + element.rect.x * this.scale, y: bounds.y + element.rect.y * this.scale, width: element.rect.width * this.scale, height: element.rect.height * this.scale }; }, () => this.invalidate());
    const oldTouch = canvas.style.touchAction; canvas.style.touchAction = 'none';
    const abort = new AbortController(), signal = abort.signal;
    const pointer = (type: UiRootPointer['type']) => (event: PointerEvent) => {
      if (type === 'down') { canvas.focus(); canvas.setPointerCapture(event.pointerId); }
      if (this.pointer({ type, point: this.clientPoint(event.clientX, event.clientY), pointerId: event.pointerId,
        button: event.button, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey })) event.preventDefault();
      if ((type === 'up' || type === 'cancel') && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerdown', pointer('down'), { signal });
    canvas.addEventListener('pointermove', pointer('move'), { signal });
    canvas.addEventListener('pointerup', pointer('up'), { signal });
    canvas.addEventListener('pointercancel', pointer('cancel'), { signal });
    canvas.addEventListener('pointerleave', () => this.input.clearHover(), { signal });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    canvas.addEventListener('keydown', event => { if (this.key(event)) event.preventDefault(); }, { signal });
    canvas.addEventListener('wheel', event => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.cssHeight : 1;
      if (this.wheel({ point: this.clientPoint(event.clientX, event.clientY), deltaX: event.deltaX * unit / this.scale,
        deltaY: event.deltaY * unit / this.scale })) event.preventDefault();
    }, { passive: false, signal });
    for (const type of ['start', 'update', 'end'] as const) canvas.addEventListener(`composition${type}`, event => {
      const node = this.focus.current;
      node?.hooks.onComposition?.(type, (event as CompositionEvent).data, node);
      this.invalidate();
    }, { signal });
    canvas.addEventListener('beforeinput', event => {
      const node = this.focus.current;
      if (node?.hooks.onBeforeInput?.(event, node) || (event.inputType === 'insertText' && event.data && this.text(event.data))) event.preventDefault();
    }, { signal });
    for (const type of ['copy', 'cut', 'paste'] as const) canvas.addEventListener(type, event => {
      const node = this.focus.current;
      const result = node?.hooks.onClipboard?.(type, event.clipboardData?.getData('text/plain') ?? '', node);
      if (result !== undefined && result !== null) {
        if (type !== 'paste') event.clipboardData?.setData('text/plain', result);
        event.preventDefault(); this.invalidate();
      }
    }, { signal });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { this.reducedMotion = media.matches; this.invalidate(); };
    media.addEventListener('change', motion, { signal }); motion();
    const visibility = () => {
      if (document.hidden) { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.animations.resetClock(); }
      else this.invalidate();
    };
    document.addEventListener('visibilitychange', visibility, { signal });
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) this.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    });
    observer.observe(canvas);
    window.addEventListener('resize', () => {
      const bounds = canvas.getBoundingClientRect(); this.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
    }, { signal });
    const rect = canvas.getBoundingClientRect(); this.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    let attached = true;
    const cleanup = () => {
      if (!attached) return;
      attached = false;
      abort.abort(); this.textBridge?.dispose(); this.textBridge = undefined; observer.disconnect(); if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null; this.canvas = null; canvas.style.touchAction = oldTouch; this.input.dispose(); this.cleanup = null;
    };
    this.cleanup = cleanup;
    return cleanup;
  }
  private textBridge?: UiTextBridge;
  private schedule(): void {
    if (!this.canvas || this.frame !== null || this.disposed || document.hidden) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      const animated = this.animations.active || this.entries().some(({ element }) => element.hooks.animated && (!this.reducedMotion || element.hooks.updatesWhenReduced) && element.clip.width > 0 && element.clip.height > 0);
      this.animations.tick(now, true, this.reducedMotion);
      const context = this.canvas?.getContext('2d');
      if (context && (this.dirty || animated)) this.draw(context, now);
      if (animated) this.schedule();
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.cleanup?.(); this.disposed = true; this.tree.dispose(); this.animations.dispose(); this.input.dispose(); this.focus.dispose(); this.paintList = [];
  }
}
