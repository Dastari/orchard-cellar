import { afterEach, describe, expect, it, vi } from 'vitest';
import { changePresentationCap, PRESENTATION_CAP_EVENT, PRESENTATION_CAP_KEY, readPresentationCap } from './presentation-cap-setting.js';

afterEach(() => vi.unstubAllGlobals());
describe('per-client presentation cap', () => {
  it('defaults off and persists supported choices with a live change event', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent });
    expect(readPresentationCap(storage)).toBe('off');
    values.set(PRESENTATION_CAP_KEY, 'invalid'); expect(readPresentationCap(storage)).toBe('off');
    for (const value of ['30hz', 'off'] as const) {
      changePresentationCap(value, storage);
      expect(readPresentationCap(storage)).toBe(value);
      expect(dispatchEvent.mock.lastCall?.[0]).toMatchObject({ type: PRESENTATION_CAP_EVENT, detail: value });
    }
  });
  it('does not interrupt gameplay when storage is restricted', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    expect(readPresentationCap(storage)).toBe('off');
    expect(() => changePresentationCap('30hz', storage)).not.toThrow();
    expect(readPresentationCap()).toBe('30hz');
    changePresentationCap('off', { getItem: () => null, setItem: () => {} });
  });
});
