/// <reference types="vite/client" />

/**
 * What a retained UI host does when one screen throws (a kit invariant such as a duplicate UI id, BUG-066).
 *
 * - `throw`: development, the lab and tests. The error stays a hard failure so it is caught before release.
 * - `contain`: production builds. The failing screen is reported once and skipped; the frame, the other screens and
 *   the keyboard keep working.
 */
export type UiFailurePolicy = 'contain' | 'throw';

let policy: UiFailurePolicy = import.meta.env?.DEV === true ? 'throw' : 'contain';

export function uiFailurePolicy(): UiFailurePolicy { return policy; }

/** Sets the policy and returns the previous one (tests of the production behaviour restore it). */
export function setUiFailurePolicy(next: UiFailurePolicy): UiFailurePolicy {
  const previous = policy; policy = next; return previous;
}

/** Distinct contained failures remembered per log; past this, new ones are dropped rather than growing without bound. */
export const UI_FAILURE_LOG_LIMIT = 32;

/** Remembers which contained failures (scope and message) were already reported, up to a fixed number. */
export class UiFailureLog {
  private readonly seen = new Set<string>();
  /** Whether this failure is new and should be reported. */
  first(scope: string, error: unknown): boolean {
    if (this.seen.size >= UI_FAILURE_LOG_LIMIT) return false;
    const key = `${scope}:${error instanceof Error ? error.message : String(error)}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key); return true;
  }
}

type UiFailureReporter = (scope: string, error: unknown) => void;
let reporter: UiFailureReporter | null = null;

/** The host's error telemetry for contained failures (the game client's `clientErrorReporter`). */
export function setUiFailureReporter(next: UiFailureReporter | null): void { reporter = next; }

/** Reports a contained failure to the console and the host's telemetry. */
export function reportUiFailure(scope: string, error: unknown): void {
  console.error(`Orchard UI: the ${scope} view failed and was skipped`, error);
  try { reporter?.(scope, error); } catch { /* telemetry never takes the UI down */ }
}
