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

/** Routes existing game listeners; never binds a canvas or creates another RAF.
 * A consumed gesture keeps its owner until release, including outside the UI. */
export class GameUiRuntime {
  private readonly hosts = new Map<string, GameUiHost>();
  private readonly pointers = new Map<number, { host: GameUiHost; event: UiRootPointer }>();
  private readonly cancelled = new Set<number>();
  private keyboard: GameUiHost | null = null;

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
      host.root.pointer({ ...owned.event, type: 'cancel' });
      this.pointers.delete(id);
      this.cancelled.add(id);
    }
    host.root.input.clearHover();
  }

  /** Call after model changes, including modal takeover and disconnect. */
  reconcile(): void {
    const allowed = this.eligible();
    for (const host of this.hosts.values()) if (!allowed.includes(host)) this.cancelHost(host);
    if (this.keyboard && !allowed.includes(this.keyboard)) this.keyboard = null;
  }

  pointer(event: UiRootPointer): boolean {
    this.reconcile();
    if (event.type === 'down') this.cancelled.delete(event.pointerId);
    else if (this.cancelled.has(event.pointerId)) {
      if (event.type === 'up' || event.type === 'cancel') this.cancelled.delete(event.pointerId);
      return true;
    }
    const owned = this.pointers.get(event.pointerId);
    if (owned) {
      owned.event = event;
      owned.host.root.pointer(event);
      if (event.type === 'up' || event.type === 'cancel') this.pointers.delete(event.pointerId);
      return true;
    }
    // A release from a world gesture must never activate an up-only UI link.
    if (event.type === 'up' || event.type === 'cancel') return this.eligible().some(host => host.blocking());
    for (const host of this.eligible()) {
      if (host.root.pointer(event) || host.blocking()) {
        if (event.type === 'down') {
          this.pointers.set(event.pointerId, { host, event });
          this.keyboard = host;
        }
        return true;
      }
    }
    if (event.type === 'down') this.keyboard = null;
    return false;
  }

  wheel(event: UiElementWheel): boolean {
    this.reconcile();
    for (const host of this.eligible()) if (host.root.wheel(event) || host.blocking()) return true;
    return false;
  }

  private keyboardHost(): GameUiHost | undefined {
    const eligible = this.eligible();
    return eligible.find(host => host.blocking()) ??
      (this.keyboard && eligible.includes(this.keyboard) ? this.keyboard : undefined);
  }

  key(event: UiElementKey): boolean {
    this.reconcile();
    const host = this.keyboardHost();
    if (!host) return false;
    host.root.arrange();
    // An empty passive root must not consume the game's Tab roster shortcut.
    if (!host.blocking() && !host.root.entries().some(({ element }) => element.focusable && element.visible && !element.disabled)) return false;
    return host.root.key(event) || host.blocking();
  }

  get focusedElement(): UiElement | null {
    this.reconcile();
    const host = this.keyboardHost();
    host?.root.arrange();
    return host?.root.focus.current ?? null;
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
