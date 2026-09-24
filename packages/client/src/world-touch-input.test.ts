import { GameUiRuntime } from '../../ui/src/game-host/runtime.js';
import type { UiKitArt } from '../../ui/src/kit/components/art.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchControls, touchControlLayout } from '@orchard/ui';
import { WorldTouchInput, WORLD_TOUCH_HOLD_MS } from './world-touch-input.js';

const point = (pointerId: number, x: number, y = 200) => ({ pointerId, x, y });
function harness() {
  vi.useFakeTimers();
  const callbacks = { canAct: vi.fn(() => true), getZoom: () => 2, zoomTo: vi.fn(), aim: vi.fn(), tap: vi.fn(), hold: vi.fn(), releaseHold: vi.fn() };
  return { callbacks, input: new WorldTouchInput(callbacks) };
}
afterEach(() => vi.useRealTimers());

describe('world touch gesture ownership', () => {
  it('dispatches a quick single tap exactly once on release', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    vi.advanceTimersByTime(80);
    expect(callbacks.tap).not.toHaveBeenCalled();
    expect(callbacks.hold).not.toHaveBeenCalled();
    expect(input.pointerUp(point(1, 102))).toBe(true);
    expect(callbacks.tap).toHaveBeenCalledExactlyOnceWith(point(1, 102));
    expect(input.pointerUp(point(1, 102))).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(callbacks.hold).not.toHaveBeenCalled();
  });

  it('pinches before the hold deadline without tools or a trailing tap', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS - 1);
    input.pointerDown(point(2, 200));
    input.pointerMove(point(2, 250));
    expect(callbacks.zoomTo).toHaveBeenLastCalledWith(3);
    input.pointerMove(point(2, 150));
    expect(callbacks.zoomTo).toHaveBeenLastCalledWith(1);
    input.pointerUp(point(2, 150));
    input.pointerMove(point(1, 110));
    input.pointerUp(point(1, 110));
    vi.advanceTimersByTime(1_000);
    expect(callbacks.tap).not.toHaveBeenCalled();
    expect(callbacks.hold).not.toHaveBeenCalled();
    expect(callbacks.releaseHold).not.toHaveBeenCalled();
  });

  it('keeps a long-press action owned when another finger arrives and leaves', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS);
    expect(callbacks.hold).toHaveBeenCalledExactlyOnceWith(point(1, 100));
    input.pointerMove(point(1, 150));
    expect(callbacks.aim).toHaveBeenLastCalledWith(point(1, 150));
    input.pointerDown(point(2, 250));
    input.pointerMove(point(2, 300));
    input.pointerUp(point(2, 300));
    expect(callbacks.releaseHold).not.toHaveBeenCalled();
    input.pointerUp(point(1, 150));
    expect(callbacks.releaseHold).toHaveBeenCalledExactlyOnceWith(false);
    expect(callbacks.zoomTo).not.toHaveBeenCalled();
    expect(callbacks.tap).not.toHaveBeenCalled();
  });

  it('consumes the remaining fingers after the held finger lifts', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS);
    input.pointerDown(point(2, 250));
    input.pointerUp(point(1, 100));
    input.pointerMove(point(2, 300));
    input.pointerUp(point(2, 300));
    expect(callbacks.releaseHold).toHaveBeenCalledExactlyOnceWith(false);
    expect(callbacks.hold).toHaveBeenCalledTimes(1);
    expect(callbacks.tap).not.toHaveBeenCalled();
    expect(callbacks.zoomTo).not.toHaveBeenCalled();
  });

  it('cancels a dragged single finger including coalesced movement at release', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    input.pointerMove(point(1, 120));
    vi.advanceTimersByTime(1_000);
    input.pointerUp(point(1, 100));
    input.pointerDown(point(2, 100));
    input.pointerUp(point(2, 120));
    expect(callbacks.hold).not.toHaveBeenCalled();
    expect(callbacks.tap).not.toHaveBeenCalled();
  });

  it('cancels pending/held gestures on blur, modal, resize, or pointer cancellation', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    input.reset();
    vi.advanceTimersByTime(1_000);
    expect(callbacks.hold).not.toHaveBeenCalled();
    input.pointerDown(point(2, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS);
    input.pointerUp(point(2, 0, 0), true);
    expect(callbacks.releaseHold).toHaveBeenCalledExactlyOnceWith(true);
    expect(callbacks.aim).toHaveBeenLastCalledWith(point(2, 100));
    input.reset();
    expect(callbacks.releaseHold).toHaveBeenCalledTimes(1);
    expect(input.ownsPointer(2)).toBe(false);
  });

  it('does not dispatch a deferred tap or hold after another touch opens chat or a modal, without waiting for a frame', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    callbacks.canAct.mockReturnValue(false);
    input.pointerUp(point(1, 100));
    expect(callbacks.tap).not.toHaveBeenCalled();
    callbacks.canAct.mockReturnValue(true);
    input.pointerDown(point(2, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS - 1);
    callbacks.canAct.mockReturnValue(false);
    vi.advanceTimersByTime(1);
    expect(callbacks.hold).not.toHaveBeenCalled();
    // Closing the modal before release cannot revive the cancelled hold.
    callbacks.canAct.mockReturnValue(true);
    input.pointerUp(point(2, 100));
    expect(callbacks.tap).not.toHaveBeenCalled();
    input.pointerDown(point(3, 100));
    vi.advanceTimersByTime(WORLD_TOUCH_HOLD_MS);
    callbacks.canAct.mockReturnValue(false);
    input.pointerUp(point(3, 100));
    expect(callbacks.releaseHold).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('excludes touches owned by thumb controls from world pinch recognition', () => {
    const { input, callbacks } = harness();
    const controls = new TouchControls({} as UiKitArt, () => {}, true);
    controls.setBounds(800,500);
    const runtime=new GameUiRuntime();runtime.register({id:'touch',root:controls.root,priority:25,active:()=>controls.visible,blocking:()=>false});
    const layout = touchControlLayout(800, 500);
    const route = (touch: ReturnType<typeof point>) => {
      if (!runtime.pointer({type:'down',point:touch,pointerId:touch.pointerId,pointerType:'touch',button:0},{hostId:'touch'})) input.pointerDown(touch);
    };
    route(point(1, layout.joystickCenter.x, layout.joystickCenter.y));
    route(point(2, 300));
    expect(runtime.tracksPointer(1)).toBe(true);
    expect(input.ownsPointer(1)).toBe(false);
    expect(input.pinching).toBe(false);
    input.pointerUp(point(2, 300));
    expect(callbacks.zoomTo).not.toHaveBeenCalled();
    expect(callbacks.tap).toHaveBeenCalledTimes(1);
    runtime.pointer({type:'up',point:layout.joystickCenter,pointerId:1,pointerType:'touch',button:0});
    runtime.dispose();controls.dispose();
  });

  it('ignores unrelated UI pointer releases and consumes all pinch fingers', () => {
    const { input, callbacks } = harness();
    input.pointerDown(point(1, 100));
    expect(input.pointerUp(point(99, 500))).toBe(false);
    input.pointerDown(point(2, 200));
    input.pointerDown(point(3, 300));
    input.pointerUp(point(2, 200), true);
    input.pointerUp(point(3, 300));
    input.pointerUp(point(1, 100));
    vi.advanceTimersByTime(1_000);
    expect(callbacks.tap).not.toHaveBeenCalled();
    expect(callbacks.hold).not.toHaveBeenCalled();
  });
});
