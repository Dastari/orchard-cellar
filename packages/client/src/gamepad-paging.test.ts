import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GamepadPaging } from './gamepad-paging.js';

const pad = (...pressed: number[]) => [{ buttons: Array.from({ length: 8 }, (_, index) => ({ pressed: pressed.includes(index) })) }];

describe('gamepad paging (Uncapped Storage step 2)', () => {
  it('sends one PageUp or PageDown per shoulder press while a window is open', () => {
    const dispatch = vi.fn(), paging = new GamepadPaging(dispatch);
    paging.poll(true, pad(5)); paging.poll(true, pad(5)); paging.poll(true, pad());
    paging.poll(true, pad(4));
    expect(dispatch.mock.calls).toEqual([['PageDown'], ['PageUp']]);
    // A press with no window open is dropped, and holding it doesn't replay once a window opens.
    paging.poll(false, pad(4, 5)); paging.poll(true, pad(4, 5)); paging.poll(true, []);
    expect(dispatch).toHaveBeenCalledTimes(2);
    // Any connected pad pages, not only the first; empty pad slots are skipped.
    paging.poll(true, [null, ...pad(5)]);
    expect(dispatch).toHaveBeenLastCalledWith('PageDown');
  });

  it('is polled every frame with the open-window state', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    expect(main).toContain('gamepadPaging.poll(overworldUi.openWindow !== null || tradeUi.active || npcInteractionUi.active);');
  });
});
