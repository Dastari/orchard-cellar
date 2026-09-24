import type { GameUiRuntime, UiRootPointer } from '@orchard/ui/game';
import type { UiPoint, UiRect } from '@orchard/ui';

/** Inverse of the game's pointerUiPosition, including fitted scale and safe area. */
export function retainedUiClientRect(rect: UiRect, canvas: { left: number; top: number; width: number; height: number },
  css: { width: number; height: number }, safe: { left: number; top: number }, scale: number): UiRect {
  const x = canvas.width / Math.max(1, css.width), y = canvas.height / Math.max(1, css.height);
  return { x: canvas.left + (safe.left + rect.x * scale) * x,
    y: canvas.top + (safe.top + rect.y * scale) * y,
    width: rect.width * scale * x, height: rect.height * scale * y };
}

/** Installs only retained gesture tails. New gestures stay in the game's ordered
 * canvas listeners, interleaved with legacy hosts until migration is complete. */
export class RetainedUiPointers {
  private readonly abort = new AbortController();
  // This tracks browser capture resources, not gesture ownership (runtime owns it).
  private readonly captures = new Set<number>();
  private readonly expectedLoss = new Set<number>();

  get hasCapture(): boolean { return this.captures.size > 0; }

  constructor(private readonly canvas: HTMLCanvasElement, target: Window,
    private readonly runtime: GameUiRuntime, private readonly point: (event: PointerEvent) => UiPoint,
    private readonly sync: () => void, private readonly observe: (event: PointerEvent) => void) {
    const signal = this.abort.signal;
    target.addEventListener('pointerdown', event => {
      // A blur may lose the old physical up outside this window. Reused mouse
      // IDs must not let that tombstone consume a later native-control click.
      this.runtime.beginPointer(event.pointerId);
    }, { capture: true, signal });
    for (const [name, type] of [['pointermove', 'move'], ['pointerup', 'up'], ['pointercancel', 'cancel']] as const) {
      target.addEventListener(name, event => {
        if (!this.runtime.tracksPointer(event.pointerId)) return;
        this.observe(event);
        this.dispatch(type, event);
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, passive: false, signal });
    }
    canvas.addEventListener('lostpointercapture', event => {
      this.captures.delete(event.pointerId);
      if (this.expectedLoss.delete(event.pointerId)) return;
      this.runtime.cancelPointer(event.pointerId);
      this.sync();
    }, { signal });
  }

  private release(pointerId: number): void {
    this.captures.delete(pointerId);
    if (!this.canvas.hasPointerCapture(pointerId)) return;
    this.expectedLoss.add(pointerId);
    this.canvas.releasePointerCapture(pointerId);
  }

  dispatch(type: UiRootPointer['type'], event: PointerEvent, hostId?: string): boolean {
    if (type === 'down') this.expectedLoss.delete(event.pointerId);
    // Safari must complete canvas capture before a control opens native editing.
    if (type === 'up' || type === 'cancel') this.release(event.pointerId);
    const consumed = this.runtime.pointer({ type, point: this.point(event),
      pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
      button: event.button, shiftKey: event.shiftKey, altKey: event.altKey,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey }, hostId === undefined ? undefined : { hostId });
    if (consumed && type === 'down') {
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      this.captures.add(event.pointerId);
    }
    this.sync();
    return consumed;
  }

  cancel(): void {
    this.runtime.cancel();
    for (const id of [...this.captures]) this.release(id);
    this.sync();
  }

  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.expectedLoss.clear();
  }
}
