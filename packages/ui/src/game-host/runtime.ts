import { uiFailurePolicy } from '../kit/runtime/failure-policy.js';
import type { UiElement, UiElementKey, UiElementWheel } from '../kit/runtime/element.js';
import type { UiRootPointer } from '../kit/runtime/input.js';
import type { UiRoot } from '../kit/runtime/root.js';

/** Hosts share the game's canvas, frame loop and logical UI coordinate space.
 * Higher priority receives input first. Host models remain authoritative. */
export interface GameUiHost {
  readonly id: string;
  readonly priority: number;
  readonly root: UiRoot;
  active(): boolean;
  blocking(): boolean;
}

export interface GameUiPointerScope {
  /** Restrict new gestures to this host at its legacy dispatch stage. */
  readonly hostId: string;
}

/** Routes existing game listeners; never binds a canvas or creates another RAF.
 * A consumed gesture keeps its owner until release, including outside the UI. */
export class GameUiRuntime {
  private readonly hosts = new Map<string, GameUiHost>();
  private readonly pointers = new Map<number, { host: GameUiHost; event: UiRootPointer }>();
  private readonly cancelled = new Set<number>();
  private keyboard: GameUiHost | null = null;
  private readonly reportedErrors = new Set<string>();

  /** A host whose tree is broken (a kit invariant such as a duplicate UI id) is reported once and treated as not
   * handling the event, so keys such as Escape still reach the game and the other hosts (BUG-063). */
  constructor(private readonly onHostError: (hostId: string, error: unknown) => void = (hostId, error) => {
    console.error(`Orchard UI: the ${hostId} host failed and was skipped`, error);
  }) {}

  private guard<T>(host: GameUiHost, fallback: T, run: () => T): T {
    try { return run(); } catch (error) {
      // Development, the lab and tests keep the error hard (BUG-066); production skips the host.
      if (uiFailurePolicy() === 'throw') throw error;
      const key = `${host.id}:${error instanceof Error ? error.message : String(error)}`;
      if (!this.reportedErrors.has(key)) { this.reportedErrors.add(key); this.onHostError(host.id, error); }
      return fallback;
    }
  }

  register(host: GameUiHost): () => void {
    if (this.hosts.has(host.id)) throw new Error(`Duplicate game UI host: ${host.id}`);
    this.hosts.set(host.id, host);
    return () => {
      if (this.hosts.get(host.id) !== host) return;
      this.cancelHost(host);
      this.hosts.delete(host.id);
      if (this.keyboard === host) this.keyboard = null;
    };
  }

  private eligible(): GameUiHost[] {
    const active = [...this.hosts.values()].filter(host => host.active())
      .sort((a, b) => b.priority - a.priority);
    const blocker = active.findIndex(host => host.blocking());
    return blocker < 0 ? active : active.slice(0, blocker + 1);
  }

  private cancelHost(host: GameUiHost): void {
    for (const [id, owned] of this.pointers) {
      if (owned.host !== host) continue;
      this.guard(host, false, () => host.root.pointer({ ...owned.event, type: 'cancel' }));
      this.pointers.delete(id);
      this.cancelled.add(id);
    }
    host.root.input.clearHover();
  }

  private clearOtherHover(owner: GameUiHost): void {
    for (const host of this.hosts.values()) if (host !== owner) host.root.input.clearHover();
  }

  /** Call after model changes, including modal takeover and disconnect. */
  reconcile(): void {
    const allowed = this.eligible();
    for (const host of this.hosts.values()) if (!allowed.includes(host)) this.cancelHost(host);
    if (this.keyboard && !allowed.includes(this.keyboard)) this.keyboard = null;
  }

  /** Includes cancelled tails, which the DOM adapter must swallow on release. */
  tracksPointer(pointerId: number): boolean {
    this.reconcile();
    return this.pointers.has(pointerId) || this.cancelled.has(pointerId);
  }

  /** Unexpected DOM capture loss cancels only this gesture and keeps its tail. */
  cancelPointer(pointerId: number): void {
    const owned = this.pointers.get(pointerId);
    if (!owned) return;
    this.guard(owned.host, false, () => owned.host.root.pointer({ ...owned.event, type: 'cancel' }));
    this.pointers.delete(pointerId);
    this.cancelled.add(pointerId);
  }

  /** A fresh native down (including outside the canvas) starts a new gesture. */
  beginPointer(pointerId: number): void {
    this.cancelPointer(pointerId);
    this.cancelled.delete(pointerId);
  }

  /** Final world/legacy handoff clears retained keyboard ownership and hover. */
  clearFocus(): void { this.keyboard = null; this.clearHover(); }

  clearHover(): void {
    for (const host of this.hosts.values()) host.root.input.clearHover();
  }

  pointer(event: UiRootPointer, scope?: GameUiPointerScope): boolean {
    this.reconcile();
    if (event.type === 'down') this.cancelled.delete(event.pointerId);
    else if (this.cancelled.has(event.pointerId)) {
      if (event.type === 'up' || event.type === 'cancel') this.cancelled.delete(event.pointerId);
      return true;
    }
    const owned = this.pointers.get(event.pointerId);
    if (owned) {
      owned.event = event;
      this.guard(owned.host, false, () => owned.host.root.pointer(event));
      this.clearOtherHover(owned.host);
      if (event.type === 'up' || event.type === 'cancel') this.pointers.delete(event.pointerId);
      return true;
    }
    // A release from a world gesture must never activate an up-only UI link.
    const candidates = this.eligible().filter(host => !scope || host.id === scope.hostId);
    if (event.type === 'up' || event.type === 'cancel') return candidates.some(host => host.blocking());
    for (const host of candidates) {
      if (this.guard(host, false, () => host.root.pointer(event)) || host.blocking()) {
        this.clearOtherHover(host);
        if (event.type === 'down') {
          this.pointers.set(event.pointerId, { host, event });
          this.keyboard = host;
        }
        return true;
      }
    }
    if (event.type === 'down' && !scope) this.keyboard = null;
    return false;
  }

  wheel(event: UiElementWheel, hostId?: string): boolean {
    this.reconcile();
    for (const host of this.eligible()) if ((!hostId || host.id === hostId) && (this.guard(host, false, () => host.root.wheel(event)) || host.blocking())) return true;
    return false;
  }

  private keyboardHost(): GameUiHost | undefined {
    const eligible = this.eligible();
    return eligible.find(host => host.blocking()) ??
      (this.keyboard && eligible.includes(this.keyboard) ? this.keyboard : undefined);
  }

  /** Keyboard shortcuts can open a passive panel without a pointer gesture.
   * Its UiRoot retains control focus; unhandled keys may still reach the game. */
  focus(id: string): boolean {
    this.reconcile();
    const host = this.hosts.get(id);
    if (!host || !this.eligible().includes(host)) return false;
    this.keyboard = host;
    this.guard(host, undefined, () => host.root.arrange());
    return true;
  }

  key(event: UiElementKey, hostId?: string): boolean {
    this.reconcile();
    const host = this.keyboardHost();
    if (!host || (hostId !== undefined && host.id !== hostId)) return false;
    return this.guard(host, false, () => {
      host.root.arrange();
      // An empty passive root must not consume the game's Tab roster shortcut.
      if (!host.blocking() && !host.root.entries().some(({ element }) => element.focusable && element.visible && !element.disabled)) return false;
      // A held activation key is one gesture. Text editors retain native repeat
      // (spaces, deletion and navigation); their submission policy belongs to the host.
      const focused = host.root.focus.current;
      if (event.repeat && focused && !focused.props['editor']
        && ['Enter', ' ', 'ContextMenu'].includes(event.key)) return true;
      return host.root.key(event) || host.blocking();
    });
  }

  get focusedElement(): UiElement | null {
    this.reconcile();
    const host = this.keyboardHost();
    if (!host) return null;
    return this.guard(host, null, () => { host.root.arrange(); return host.root.focus.current; });
  }

  resize(width: number, height: number): void {
    for (const host of this.hosts.values()) {
      host.root.setScale(1);
      host.root.resize(width, height, 1);
    }
  }

  /** Blur/suspension cancels gestures without emitting their release action. */
  cancel(): void {
    for (const host of this.hosts.values()) this.cancelHost(host);
    this.keyboard = null;
  }

  /** Hosts own their roots and dispose them after unregistering. */
  dispose(): void {
    this.cancel();
    this.hosts.clear();
    this.cancelled.clear();
  }
}
