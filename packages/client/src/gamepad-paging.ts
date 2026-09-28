import { uiGamepadPagingKeys } from '@orchard/ui';

/** A gamepad's shoulder buttons page an open window's inventory (wiki Roadmap/Uncapped Storage, step 2): each press
 * is sent as a PageUp or PageDown key, through the same keyboard path as the keys themselves. */
export class GamepadPaging {
  private held: ReadonlySet<number> = new Set();
  constructor(private readonly dispatch: (key: 'PageUp' | 'PageDown') => void = key => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key }));
  }) {}
  /** Call once a frame. Presses made while no window is open are not sent, and not replayed when one opens. */
  poll(windowOpen: boolean, gamepad: { readonly buttons: readonly { readonly pressed: boolean }[] } | null | undefined = navigator.getGamepads?.()[0]): void {
    const state = uiGamepadPagingKeys(gamepad?.buttons ?? [], this.held);
    this.held = state.held;
    if (windowOpen) for (const key of state.keys) this.dispatch(key);
  }
}
