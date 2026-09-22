import { describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui/studio';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { kitElement, kitElements, pressKit } from '../kit-test-driver.js';

const mocked = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@orchard/ui/studio', async importOriginal => ({
  ...await importOriginal<typeof import('@orchard/ui/studio')>(),
  loadGeneratedAsset: mocked.load,
  loadGeneratedAssetCatalog: async () => ({ schemaVersion: 1, revision: 'test', revisionId: 1, placeholderAssetId: 0, assetsById: {}, assets: {} }),
}));
import { buildMapCanvasTool } from './canvas.js';

function context(): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('unused'); }, null);
  controller.navigate('/build/map/terrain-lab');
  return { controller, route: controller.activeRoute(), invalidate: vi.fn(),
    controlsBounds: { x: 0, y: 0, width: 300, height: 600 },
    workspaceBounds: { x: 300, y: 0, width: 600, height: 600 },
    bounds: { x: 300, y: 0, width: 600, height: 600 },
  };
}

function loaded(name: string): LoadedAsset {
  return { assetId: 1, name, image: {} as CanvasImageSource, anchor: [8, 15], collision: [], tags: [], atlasRevision: 1,
    placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    metadata: { image: 'test', animations: {}, states: { base: { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 } } },
  };
}

describe('Smart terrain thumbnails', () => {
  it('repaints ready artwork without rebuilding the retained palette while a popover is open', async () => {
    const pending = new Map<string, (value: LoadedAsset) => void>();
    mocked.load.mockImplementation((name: string) => new Promise<LoadedAsset>(resolve => pending.set(name, resolve)));
    const c = context();
    let surface = buildMapCanvasTool(c);
    pressKit(surface, 'map-tool-terrain');
    surface = buildMapCanvasTool(c);
    const first = kitElement(surface, 'map-material-grass_1')!.children[0]!;
    const select = kitElement(surface, 'map-auto-generation')!;
    select.hooks.onKey?.({ key: 'ArrowDown' }, select);
    const popup = kitElements(surface).find(element => element.kind === 'popover' && element.visible);
    expect(popup).toBeDefined();
    first.rect = { x: 0, y: 0, width: 32, height: 32 };
    const drawing = { imageSmoothingEnabled: true, drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const paint = { context: drawing, now: 0, focused: false, hovered: false, reducedMotion: false };
    first.hooks.paint?.(first, paint);
    expect(drawing.drawImage).not.toHaveBeenCalled();
    expect(pending.size).toBeGreaterThan(0);
    for (const [name, resolve] of pending) resolve(loaded(name));
    const state = c.controller.toolState('map-canvas:terrain-lab', () => null) as unknown as {
      previewAssets: Map<string, LoadedAsset>;
    };
    await vi.waitFor(() => expect(state.previewAssets.has('tile_cf_grass_1_middle')).toBe(true));
    // The shell deliberately defers buildTools while this popover remains open.
    // Exercise the identical retained thumbnail, not a newly built tool surface.
    first.hooks.paint?.(first, paint);
    expect(drawing.drawImage).toHaveBeenCalledWith(state.previewAssets.get('tile_cf_grass_1_middle')!.image,
      0, 0, 16, 16, 0, 0, 32, 32);
    expect(kitElement(surface, 'map-material-grass_1')!.children[0]).toBe(first);
    expect(popup!.visible).toBe(true);
    expect(select.props['value']).toBe('smart');
  });
});
