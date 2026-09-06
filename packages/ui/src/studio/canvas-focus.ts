export type CanvasFocusRole = 'button' | 'tab' | 'textbox' | 'listbox' | 'option';

export interface CanvasFocusTarget {
  readonly id: string;
  readonly label: string;
  readonly role: CanvasFocusRole;
  readonly disabled?: boolean;
  readonly activate?: () => void;
}

export interface CanvasFocusSnapshot {
  readonly focusedId: string | null;
  readonly focusedLabel: string | null;
  readonly focusedRole: CanvasFocusRole | null;
  /** Short aliases retained for lightweight canvas status renderers. */
  readonly label: string | null;
  readonly role: CanvasFocusRole | null;
}

export interface CanvasFocusKeyEvent {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

const FOCUS_ROLES: readonly CanvasFocusRole[] = ['button', 'tab', 'textbox', 'listbox', 'option'];

function validTarget(target: CanvasFocusTarget): boolean {
  return target.id.trim().length > 0
    && target.label.trim().length > 0
    && FOCUS_ROLES.includes(target.role);
}

/**
 * DOM-independent roving focus for a retained canvas widget tree. The caller
 * maps pointer hit ids and keyboard events into this model, then paints the
 * returned label/role/focus id with the existing bitmap UI.
 */
export class CanvasFocusManager {
  #targets: readonly CanvasFocusTarget[] = Object.freeze([]);
  #focusedId: string | null = null;

  setTargets(targets: readonly CanvasFocusTarget[]): void {
    const ids = new Set<string>();
    const next: CanvasFocusTarget[] = [];
    for (const target of targets) {
      if (!validTarget(target) || ids.has(target.id)) {
        this.#targets = Object.freeze([]);
        this.#focusedId = null;
        throw new Error(`canvas_focus_target_invalid:${target.id}`);
      }
      ids.add(target.id);
      next.push(Object.freeze({ ...target }));
    }
    this.#targets = Object.freeze(next);
    if (this.#focusedId !== null && this.#enabledTarget(this.#focusedId) !== null) return;
    this.#focusedId = this.#enabledTargets()[0]?.id ?? null;
  }

  snapshot(): CanvasFocusSnapshot {
    const target = this.#focusedId === null ? null : this.#enabledTarget(this.#focusedId);
    const focusedId = target?.id ?? null;
    const label = target?.label ?? null;
    const role = target?.role ?? null;
    return Object.freeze({ focusedId, focusedLabel: label, focusedRole: role, label, role });
  }

  focus(id: string): boolean {
    const target = this.#enabledTarget(id);
    if (target === null) return false;
    this.#focusedId = target.id;
    return true;
  }

  focusFirst(): boolean {
    const first = this.#enabledTargets()[0];
    if (first === undefined) return false;
    this.#focusedId = first.id;
    return true;
  }

  focusLast(): boolean {
    const targets = this.#enabledTargets();
    const last = targets[targets.length - 1];
    if (last === undefined) return false;
    this.#focusedId = last.id;
    return true;
  }

  focusNext(reverse = false): boolean {
    const targets = this.#enabledTargets();
    if (targets.length === 0) return false;
    const current = targets.findIndex(({ id }) => id === this.#focusedId);
    const origin = current < 0 ? (reverse ? 0 : -1) : current;
    const offset = reverse ? -1 : 1;
    const index = (origin + offset + targets.length) % targets.length;
    this.#focusedId = targets[index]!.id;
    return true;
  }

  activate(): boolean {
    if (this.#focusedId === null) return false;
    const target = this.#enabledTarget(this.#focusedId);
    if (target === null || target.activate === undefined) return false;
    target.activate();
    return true;
  }

  handleKeyDown(event: CanvasFocusKeyEvent): boolean {
    if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false;
    if (event.key === 'Tab') return this.focusNext(event.shiftKey === true);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return this.focusNext(true);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return this.focusNext(false);
    if (event.key === 'Home') return this.focusFirst();
    if (event.key === 'End') return this.focusLast();
    if (event.key === 'Enter' || event.key === ' ') return this.activate();
    return false;
  }

  #enabledTargets(): readonly CanvasFocusTarget[] {
    return this.#targets.filter(({ disabled }) => disabled !== true);
  }

  #enabledTarget(id: string): CanvasFocusTarget | null {
    return this.#targets.find((target) => target.id === id && target.disabled !== true) ?? null;
  }
}
