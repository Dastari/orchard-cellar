import { describe, expect, it, vi } from 'vitest';
import { changeWorldScale, readWorldScale, WORLD_SCALE_EVENT, WORLD_SCALE_KEY } from './world-scale-setting.js';

describe('per-client world scale', () => {
  it('defaults to 1× for absent or unknown saved values and persists each supported policy', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    try {
      expect(readWorldScale(storage)).toBe('1x');
      values.set(WORLD_SCALE_KEY, 'future-policy');
      expect(readWorldScale(storage)).toBe('1x');
      for (const policy of ['2x', 'native', '1x'] as const) {
        changeWorldScale(policy, storage);
        expect(readWorldScale(storage)).toBe(policy);
        expect(dispatchEvent.mock.lastCall?.[0]).toMatchObject({ type: WORLD_SCALE_EVENT, detail: policy });
      }
    } finally { vi.unstubAllGlobals(); }
  });
});
