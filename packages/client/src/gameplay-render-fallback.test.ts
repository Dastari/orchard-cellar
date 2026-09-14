import { afterEach, expect, it, vi } from 'vitest';
import { fallbackGameplayWorldBackend } from './gameplay-world-backend.js';
import { renderWithGameplayLightingFallback } from './gameplay-lighting-presentation.js';
vi.mock('./gameplay-world-backend.js', () => ({ fallbackGameplayWorldBackend: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it.each([true, false])('completes a frame when lighting and backend fail in either order (%s)', backendFirst => {
  let backend = true, lighting = true, calls = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(fallbackGameplayWorldBackend).mockImplementation(error => {
    if ((error as Error).message !== 'gpu' || !backend) return false;
    backend = false; return true;
  });
  const render = () => {
    calls++;
    if (backendFirst ? backend : !lighting && backend) throw new Error('gpu');
    if (lighting) throw new Error('receiver_surface_failed');
  };
  renderWithGameplayLightingFallback(0.5, render, () => !lighting, () => { lighting = false; });
  expect(calls).toBe(3); expect(backend || lighting).toBe(false);
});
it('does not loop indefinitely when the fallback frame also throws', () => {
  const render = vi.fn(() => { throw new Error('gpu'); });
  vi.mocked(fallbackGameplayWorldBackend).mockReturnValue(true);
  expect(() => renderWithGameplayLightingFallback(1, render, () => false, vi.fn())).toThrow('gpu');
  expect(render).toHaveBeenCalledTimes(2);
});
