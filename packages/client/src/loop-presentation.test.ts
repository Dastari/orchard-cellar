import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepLoop } from './loop.js';

function harness(cap: 0 | 30) {
  let now = 0;
  let next: FrameRequestCallback | undefined;
  let updates = 0;
  const renders: { time: number; alpha: number; updates: number }[] = [];
  const observer = { recordRafTimestamp: vi.fn(), recordFixedUpdate: vi.fn(), recordCatchUp: vi.fn() };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { next = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { next = undefined; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const loop = new FixedStepLoop({ update: () => { updates++; },
    render: (alpha) => { renders.push({ time: now, alpha, updates }); } }, observer);
  loop.setPresentationRate(cap); loop.start();
  return { loop, renders, observer, updates: () => updates,
    tick: (time: number) => { now = time; const callback = next; next = undefined; callback?.(time); } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('presentation cap leaves fixed simulation on every rAF', () => {
  for (const hz of [60, 120, 144]) it(`submits 30 Hz on a ${hz} Hz display with identical update/interpolation values`, () => {
    const sample = (cap: 0 | 30) => {
      const run = harness(cap);
      for (let index = 1; index <= hz * 10; index++) run.tick(index * 1000 / hz);
      run.loop.stop();
      const result = { renders: run.renders, updates: run.updates(), rafs: run.observer.recordRafTimestamp.mock.calls.length };
      vi.restoreAllMocks(); vi.unstubAllGlobals();
      return result;
    };
    const direct = sample(0), capped = sample(30);
    expect(direct.renders).toHaveLength(hz * 10 + 1);
    expect(capped.renders).toHaveLength(301);
    expect(capped.updates).toBe(direct.updates);
    expect(capped.rafs).toBe(direct.rafs);
    for (const render of capped.renders) expect(render).toEqual(direct.renders.find((frame) => frame.time === render.time));
  });
  it('switches on a frame boundary and resets its deadline after suspension', () => {
    const run = harness(0);
    run.tick(10); run.loop.setPresentationRate(30); run.tick(20); run.tick(30); run.tick(40); run.tick(60);
    expect(run.renders.map((frame) => frame.time)).toEqual([0, 10, 20, 60]);
    run.loop.stop(); run.tick(10000); run.loop.start(); run.tick(10010); run.tick(10034);
    expect(run.renders.slice(-2).map((frame) => frame.time)).toEqual([10000, 10034]);
    run.loop.setPresentationRate(0); run.tick(10035);
    expect(run.renders.at(-1)?.time).toBe(10035);
    run.loop.stop();
  });
  it('skips missed presentation deadlines instead of submitting catch-up frames', () => {
    const run = harness(30);
    run.tick(500); run.tick(501); run.tick(534);
    expect(run.renders.map((frame) => frame.time)).toEqual([0, 500, 534]);
    expect(run.observer.recordCatchUp).toHaveBeenCalledTimes(3);
    run.loop.stop();
  });
});
