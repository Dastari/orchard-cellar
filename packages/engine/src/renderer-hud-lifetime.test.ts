import { afterEach, expect, it, vi } from 'vitest';
import { disposeHudDisplayCaches } from '@orchard/ui';
import { UnifiedRenderer } from './renderer.js';

vi.mock('@orchard/ui', async (original) => ({ ...await original<typeof import('@orchard/ui')>(), disposeHudDisplayCaches: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
it('releases world resources even when a HUD disposable fails', () => {
  const surfaces: { width: number; height: number }[] = [];
  const create = () => {
    const canvas = { width: 300, height: 150, style: {}, getContext: () => ({}) };
    surfaces.push(canvas); return canvas;
  };
  vi.stubGlobal('document', { createElement: create });
  const display = create() as unknown as HTMLCanvasElement;
  const renderer = new UnifiedRenderer(display);
  vi.mocked(disposeHudDisplayCaches).mockImplementation(() => { throw new Error('test HUD disposal failure'); });
  expect(() => renderer.dispose()).toThrow('test HUD disposal failure');
  expect(disposeHudDisplayCaches).toHaveBeenCalledWith(display);
  expect(surfaces.slice(1).every((surface) => surface.width === 0 && surface.height === 0)).toBe(true);
});
