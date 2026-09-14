import { describe, expect, it, vi } from 'vitest';
import { EMPTY_STUDIO_CANVAS_TOOL_SURFACE } from './canvas-tool.js';
import { StudioCanvasToolRegistry } from './canvas-tool-registry.js';

describe('StudioCanvasToolRegistry', () => {
  it('loads each registered builder once and then resolves it synchronously', async () => {
    const registry = new StudioCanvasToolRegistry();
    const builder = vi.fn(() => EMPTY_STUDIO_CANVAS_TOOL_SURFACE);
    const loader = vi.fn(async () => builder);
    registry.register('items', loader);
    expect(registry.builder('items')).toBeNull();
    expect(await registry.load('items')).toBe(builder);
    expect(await registry.load('items')).toBe(builder);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(registry.builder('items')).toBe(builder);
  });

  it('rejects duplicate or malformed registrations and leaves unknown tools empty', async () => {
    const registry = new StudioCanvasToolRegistry();
    const loader = async () => () => EMPTY_STUDIO_CANVAS_TOOL_SURFACE;
    registry.register('map', loader);
    expect(() => registry.register('map', loader)).toThrow('studio_canvas_tool_duplicate:map');
    expect(() => registry.register('Bad Tool', loader)).toThrow('studio_canvas_tool_id_invalid:Bad Tool');
    await expect(registry.load('missing')).resolves.toBeNull();
  });
});
