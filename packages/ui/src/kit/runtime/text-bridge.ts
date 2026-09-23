import type { UiRect } from '../../geometry.js';
import type { UiElement } from './element.js';
import { CanvasTextEditor } from './text-editor.js';
/** Invisible native editing target provides browser IME and clipboard events.
 * All visual editing remains in the canvas control and its shared editor model. */
export class UiTextBridge {
  private static readonly blocked = new WeakSet<HTMLCanvasElement>();
  private static readonly bridges = new WeakMap<HTMLCanvasElement, Set<UiTextBridge>>();
  /** A blocking surface without text controls owns keyboard input until dismissed. */
  static setCanvasBlocked(canvas: HTMLCanvasElement, blocked: boolean): void {
    if (this.blocked.has(canvas) === blocked) return;
    if (blocked) this.blocked.add(canvas); else this.blocked.delete(canvas);
    for (const bridge of this.bridges.get(canvas) ?? []) bridge.sync();
  }
  static isCanvasBlocked(canvas: HTMLCanvasElement): boolean { return this.blocked.has(canvas); }
  readonly input: HTMLTextAreaElement;
  private abort = new AbortController(); private active: UiElement | null = null; private composing = false;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly target: () => UiElement | null,
    private readonly key: (event: KeyboardEvent) => boolean, private readonly rect: (element: UiElement) => UiRect,
    private readonly invalidate: () => void) {
    const bridges = UiTextBridge.bridges.get(canvas) ?? new Set<UiTextBridge>();
    bridges.add(this); UiTextBridge.bridges.set(canvas, bridges);
    this.input = document.createElement('textarea'); this.input.dataset['uiKitInput'] = 'true';
    Object.assign(this.input.style, { position: 'fixed', opacity: '0', width: '1px', height: '1px', padding: '0', border: '0', pointerEvents: 'none' });
    this.input.tabIndex = -1; this.input.spellcheck = false; document.body.append(this.input);
    const signal = this.abort.signal;
    this.input.addEventListener('keydown', event => {
      // Native editing owns key presses, including IME and clipboard
      // shortcuts that intentionally bypass the canvas key handler.
      event.stopPropagation();
      if (UiTextBridge.blocked.has(this.canvas)) { event.preventDefault(); return; }
      const clipboard = (event.ctrlKey || event.metaKey) && ['c', 'x', 'v'].includes(event.key.toLowerCase());
      if (!event.isComposing && !clipboard && this.key(event)) event.preventDefault(); this.sync();
    }, { signal });
    // Key releases still bubble: a world key held before editor focus must be
    // released by the game's existing window-level held-input cleanup.
    this.input.addEventListener('beforeinput', event => {
      event.stopPropagation();
      const node = this.current(); if (node?.hooks.onBeforeInput?.(event, node)) { event.preventDefault(); this.invalidate(); this.sync(); }
    }, { signal });
    for (const type of ['start', 'update', 'end'] as const) this.input.addEventListener(`composition${type}`, event => {
      event.stopPropagation();
      this.composing = type !== 'end'; const node = this.current(); node?.hooks.onComposition?.(type, (event as CompositionEvent).data, node); this.invalidate(); this.sync();
    }, { signal });
    for (const type of ['copy', 'cut', 'paste'] as const) this.input.addEventListener(type, event => {
      event.stopPropagation();
      const node = this.current(), result = node?.hooks.onClipboard?.(type, event.clipboardData?.getData('text/plain') ?? '', node);
      if (result !== undefined && result !== null) { if (type !== 'paste') event.clipboardData?.setData('text/plain', result); event.preventDefault(); this.invalidate(); this.sync(); }
    }, { signal });
  }
  private current(): UiElement | null { return UiTextBridge.blocked.has(this.canvas) ? null : this.target(); }
  sync(): void {
    const node = this.current(), editor = node?.props['editor'];
    if (!node || !(editor instanceof CanvasTextEditor) || node.disabled || !node.visible) {
      if (document.activeElement === this.input) this.canvas.focus({ preventScroll: true }); this.active = null; return;
    }
    const state = editor.snapshot(), bounds = this.rect(node);
    this.input.style.left = `${Math.max(0, bounds.x)}px`; this.input.style.top = `${Math.max(0, bounds.y)}px`;
    this.input.setAttribute('aria-label', node.label); this.input.readOnly = node.props['editable'] === false;
    if (!this.composing) { this.input.value = state.value; this.input.setSelectionRange(state.caretStart, state.caretEnd, state.anchor > state.focus ? 'backward' : 'forward'); }
    if (this.active !== node || document.activeElement === this.canvas) { this.active = node; this.input.focus({ preventScroll: true }); }
  }
  dispose(): void { UiTextBridge.bridges.get(this.canvas)?.delete(this); this.abort.abort(); this.input.remove(); this.active = null; }
}
