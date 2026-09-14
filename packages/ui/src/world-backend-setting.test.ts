import { afterEach, expect, it, vi } from 'vitest';
import { changeExperimentalWebGL, EXPERIMENTAL_WEBGL_EVENT, EXPERIMENTAL_WEBGL_KEY,
  readExperimentalWebGL, updateWorldBackendStatus, worldBackendStatus } from './world-backend-setting.js';
afterEach(() => vi.unstubAllGlobals());
it('defaults to Canvas, persists the experimental choice, and preserves it after fallback', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent });
  expect(readExperimentalWebGL(storage)).toBe(false);
  values.set(EXPERIMENTAL_WEBGL_KEY, 'invalid'); expect(readExperimentalWebGL(storage)).toBe(false);
  changeExperimentalWebGL(true, storage);
  expect(readExperimentalWebGL(storage)).toBe(true);
  expect(dispatchEvent.mock.lastCall?.[0]).toMatchObject({ type: EXPERIMENTAL_WEBGL_EVENT, detail: true });
  updateWorldBackendStatus('canvas2d', 'webgl_context_lost');
  expect(readExperimentalWebGL(storage)).toBe(true);
  expect(worldBackendStatus()).toMatchObject({ backend: 'canvas2d', fallbackReason: 'webgl_context_lost' });
  changeExperimentalWebGL(false, storage); updateWorldBackendStatus('canvas2d', null);
});
it('keeps the live control consistent when storage throws', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  expect(readExperimentalWebGL(blocked)).toBe(false);
  changeExperimentalWebGL(true, blocked); expect(readExperimentalWebGL()).toBe(true);
  changeExperimentalWebGL(false, { getItem: () => null, setItem: () => {} });
});
