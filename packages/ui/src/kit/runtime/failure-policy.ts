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
