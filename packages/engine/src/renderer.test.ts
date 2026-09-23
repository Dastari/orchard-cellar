import { describe, expect, it, vi } from 'vitest';
import {
  authoredMapContentPainterTie,
  createEmptyMapDocument,
  migrateMapDocumentV2,
} from '@orchard/sim';
import {
  drawWorldDepthQueue,
  minimumWorldZoom,
  sortWorldDepthItems,
  worldPassCapacity,
  worldPassLayout,
  worldPresentLayout,
  UnifiedRenderer,
} from './renderer.js';

describe('unified renderer zoom math', () => {
  it('uses an integer sharp pass and a DPR-aware final scale', () => {
    const integer = worldPassLayout(960, 540, 2, 2);
    expect(integer.deviceZoom).toBe(4);
    expect(integer.integerScale).toBe(4);
    expect([integer.width, integer.height]).toEqual([1920, 1080]);

    const fractional = worldPassLayout(960, 540, 2, 2.25);
    expect(fractional.deviceZoom).toBe(4.5);
    expect(fractional.integerScale).toBe(5);
    expect([fractional.width, fractional.height]).toEqual([2134, 1200]);
  });

  it('keeps fixed world policies independent of DPR and preserves Native', () => {
    for (const dpr of [1, 2, 3]) for (const zoom of [2, 2.25, 3.5, 8]) {
      for (const [policy, expected] of [['1x', 1], ['2x', 2]] as const) {
        const layout = worldPassLayout(1280, 720, dpr, zoom, policy);
        expect(layout.integerScale).toBe(expected);
        expect(layout.width).toBe(Math.ceil(1280 * expected / zoom));
        expect(layout.height).toBe(Math.ceil(720 * expected / zoom));
      }
      expect(worldPassLayout(1280, 720, dpr, zoom, 'native'))
        .toEqual(worldPassLayout(1280, 720, dpr, zoom));
    }
  });

  it('selects the largest nearest integer upscale before the smooth remainder', () => {
    expect(worldPresentLayout(640, 360, 1280, 720)).toEqual({
      factor: 2, nearestWidth: 1280, nearestHeight: 720, exact: true,
    });
    expect(worldPresentLayout(569, 320, 1280, 720)).toEqual({
      factor: 2, nearestWidth: 1138, nearestHeight: 640, exact: false,
    });
    expect(worldPresentLayout(1707, 960, 1280, 720).factor).toBe(1);
  });

  it('requests an opaque display context without changing world alpha', () => {
    const display = { getContext: vi.fn(() => ({})), style: {} };
    const world = { getContext: vi.fn(() => ({})) };
    vi.stubGlobal('document', { createElement: () => world });
    try {
      new UnifiedRenderer(display as unknown as HTMLCanvasElement);
      expect(display.getContext).toHaveBeenCalledWith('2d', { alpha: false });
      expect(world.getContext).toHaveBeenCalledWith('2d');
    } finally { vi.unstubAllGlobals(); }
  });

  it('never grows backing stores during a complete supported zoom sweep', () => {
    const surfaces: Array<{ width: number; height: number }> = [];
    const createCanvas = () => {
      const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
      const canvas = { width: 300, height: 150, style: {}, parentElement: null,
        getContext: () => context };
      surfaces.push(canvas);
      return canvas;
    };
    vi.stubGlobal('document', { createElement: createCanvas });
    vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720);
    try {
      for (const dpr of [1, 2, 3]) for (const policy of ['1x', '2x', 'native'] as const) {
        const renderer = new UnifiedRenderer(createCanvas() as unknown as HTMLCanvasElement);
        renderer.resize(1280, 720, dpr); renderer.setWorldScale(policy);
        const capacities = surfaces.map(({ width, height }) => [width, height]);
        for (let i = 0; i <= 600; i++) {
          renderer.beginWorld(2 + i / 100); renderer.compositeWorld();
        }
        for (let i = 600; i >= 0; i--) {
          renderer.beginWorld(2 + i / 100); renderer.compositeWorld();
        }
        expect(surfaces.map(({ width, height }) => [width, height])).toEqual(capacities);
      }
    } finally { vi.unstubAllGlobals(); }
  });

  it('allows finite maps to sit inside a larger black viewport while respecting offscreen budgets', () => {
    expect(minimumWorldZoom(960, 540, 1, 192 * 16)).toBe(2);
    expect(minimumWorldZoom(1920, 1080, 1, 32 * 16)).toBe(2);
    const minimum = minimumWorldZoom(1920, 1080, 2, 192 * 16);
    const layout = worldPassLayout(1920, 1080, 2, minimum);
    expect(layout.width).toBeLessThanOrEqual(4096);
    expect(layout.height).toBeLessThanOrEqual(2304);
  });

  it('keeps a stable backing allocation through nearby eased zoom frames', () => {
    const first = worldPassCapacity(1_921, 1_081);
    expect(first).toEqual({ width: 2_048, height: 1_152 });
    expect(worldPassCapacity(1_980, 1_110, first.width, first.height)).toEqual(first);
    expect(worldPassCapacity(1_700, 900, first.width, first.height)).toEqual(first);
    expect(worldPassCapacity(2_049, 1_153, first.width, first.height)).toEqual({ width: 2_304, height: 1_296 });
  });

  it('never clips the active world pass at fractional integer-scale thresholds', () => {
    for (const zoom of [0.75, 1, 1.01, 1.25, 1.5, 2, 2.01, 2.25]) {
      const layout = worldPassLayout(1_400, 1_254, 2, zoom);
      expect(layout.width).toBeLessThanOrEqual(4_096);
      expect(layout.height).toBeLessThanOrEqual(2_304);
    }
  });

  it('interleaves depth layers around every sorted world drawable', () => {
    const order: string[] = [];
    const drawRange = vi.fn((minimum: number, maximum: number) => {
      order.push(`weather:${minimum}:${maximum}`);
      return 1;
    });
    const draws = drawWorldDepthQueue([
      { footY: 30, tie: 'house', draw: () => order.push('house') },
      { footY: 20, tie: 'tree', draw: () => order.push('tree') },
      { footY: 30, tie: 'player', draw: () => order.push('player') },
    ], 10, 2, drawRange);
    expect(draws).toBe(4);
    expect(order).toEqual([
      'weather:-Infinity:20',
      'tree',
      'weather:20:40',
      'house',
      'weather:40:40',
      'player',
      'weather:40:Infinity',
    ]);
  });

  it('World/Map & Terrain: composites raised caps above lower actors while wall faces retain foot-Y sorting', () => {
    const items = [
      { footY: 44, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'lower-behind' },
      { footY: 48, elevationLayer: 0, depthPhase: 'boundary' as const, tie: 'lower-wall-face' },
      { footY: 48, elevationLayer: 1, depthPhase: 'entity' as const, tie: 'upper-on-top' },
      { footY: 52, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'lower-in-front' },
      { footY: 48, elevationLayer: 1, depthPhase: 'surface' as const, tie: 'upper-cap' },
    ];
    expect(sortWorldDepthItems(items).map(({ tie }) => tie)).toEqual([
      'lower-behind',
      'lower-wall-face',
      'lower-in-front',
      'upper-cap',
      'upper-on-top',
    ]);
  });

  it('World/Map & Terrain: paints a wall before a lower actor once the actor foot is south of the visible wall', () => {
    expect(sortWorldDepthItems([
      { footY: 80, elevationLayer: 0, depthPhase: 'boundary' as const, tie: 'visible-wall' },
      { footY: 81, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'player-head-must-survive' },
    ]).map(({ tie }) => tie)).toEqual(['visible-wall', 'player-head-must-survive']);
  });

  it('World/Map & Terrain: keeps plane surfaces and cosmetic cliff trim below actors at every row', () => {
    expect(sortWorldDepthItems([
      { footY: 12, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'actor' },
      { footY: 96, elevationLayer: 0, depthPhase: 'surface' as const, tie: 'cliff-foot-trim' },
    ]).map(({ tie }) => tie)).toEqual(['cliff-foot-trim', 'actor']);
  });

  it('uses reordered authored layers only as the final equal-depth painter tie', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'layer-painter-order', title: 'Layer painter order', width: 4, height: 4,
    }));
    const document = {
      ...base,
      layers: base.layers.map((layer) => layer.id === 'ground'
        ? { ...layer, order: 30 }
        : layer.id === 'objects' ? { ...layer, order: 20 } : layer),
    };
    const lowerLayerTie = authoredMapContentPainterTie(document, 'objects', 'object', 'crate');
    const upperLayerTie = authoredMapContentPainterTie(document, 'ground', 'object', 'flowers');
    expect(sortWorldDepthItems([
      { footY: 32, elevationLayer: 0, depthPhase: 'entity' as const, tie: upperLayerTie },
      { footY: 32, elevationLayer: 0, depthPhase: 'entity' as const, tie: lowerLayerTie },
    ]).map(({ tie }) => tie)).toEqual([lowerLayerTie, upperLayerTie]);
    expect(sortWorldDepthItems([
      { footY: 31, elevationLayer: 0, depthPhase: 'entity' as const, tie: upperLayerTie },
      { footY: 32, elevationLayer: 0, depthPhase: 'entity' as const, tie: lowerLayerTie },
    ]).map(({ tie }) => tie)).toEqual([upperLayerTie, lowerLayerTie]);
  });
});
