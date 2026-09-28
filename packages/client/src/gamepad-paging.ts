import { uiGamepadPagingKeys } from '@orchard/ui';

type Pads = Iterable<{ readonly buttons: readonly { readonly pressed: boolean }[] } | null>;

/** A gamepad's shoulder buttons page an open window's inventory (wiki Roadmap/Uncapped Storage, step 2): each press
 * on any connected pad is sent as a PageUp or PageDown key, through the same keyboard path as the keys themselves. */
export class GamepadPaging {
  private readonly state = { held: 0 };
  private windowOpen = false;
  private readonly send = (key: 'PageUp' | 'PageDown') => { if (this.windowOpen) this.dispatch(key); };
  constructor(private readonly dispatch: (key: 'PageUp' | 'PageDown') => void = key => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key }));
  }) {}
  /** Call once a frame. Presses made while no window is open are not sent, and not replayed when one opens. */
  poll(windowOpen: boolean, pads: Pads = navigator.getGamepads?.() ?? []): void {
    this.windowOpen = windowOpen;
    uiGamepadPagingKeys(pads, this.state, this.send);
  }
}
