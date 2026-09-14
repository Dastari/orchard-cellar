import { describe, expect, it, vi } from 'vitest';
import { startRenderProtocolWalk } from './render-protocol-walk.js';

describe('render protocol walking workload', () => {
  it('closes the walking path over the full warm-up/sample window and releases every key', () => {
    vi.useFakeTimers();
    const held = new Map<string, number>(), durations = new Map<string, number>();
    vi.stubGlobal('KeyboardEvent', class {
      constructor(readonly type: string, readonly options: { code: string }) {}
      get code() { return this.options.code; }
    });
    vi.stubGlobal('window', { dispatchEvent(event: { type: string; code: string }) {
      if (event.type === 'keydown') held.set(event.code, Date.now());
      else if (held.has(event.code)) {
        durations.set(event.code, (durations.get(event.code) ?? 0) + Date.now() - held.get(event.code)!);
        held.delete(event.code);
      }
    } });
    try {
      const stop = startRenderProtocolWalk();
      vi.advanceTimersByTime(35_000); stop();
      expect(held.size).toBe(0);
      expect(durations.get('ArrowRight')).toBe(durations.get('ArrowLeft'));
      expect(durations.get('ArrowDown')).toBe(durations.get('ArrowUp'));
      expect([...durations.values()].reduce((sum, value) => sum + value, 0)).toBe(35_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
