import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import { uiDurabilityFraction } from './item-durability.js';
import { OverworldUi } from './overworld-ui.js';
import { drawUiInventorySlot } from './design-system/inventory.js';
import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;
const tools = ['axe', 'hoe', 'pickaxe', 'shovel'].flatMap(tool => (
  ['', 'stone_', 'copper_', 'gold_', 'silver_', 'iron_'].map(material => `${material}${tool}`)
));

describe('authored inventory durability', () => {
  it('shows full, worn and broken durability for every material tool', () => {
    expect(tools).toHaveLength(24);
    for (const tool of tools) {
      const maximum = registry.items.get(`item:${tool}`)!.durability!.max;
      expect(uiDurabilityFraction(tool, undefined, registry), tool).toBe(1);
      expect(uiDurabilityFraction(tool, maximum, registry), tool).toBe(1);
      expect(uiDurabilityFraction(tool, maximum - 1, registry), tool).toBeCloseTo((maximum - 1) / maximum);
      expect(uiDurabilityFraction(tool, 0, registry), tool).toBe(0);
    }
    expect(uiDurabilityFraction('wood', 10, registry)).toBeNull();
  });

  it('uses active maxima and never revives durability removed from authored content', () => {
    const source = registry.items.get('item:iron_axe')!;
    const authored = { ...registry, items: new Map(registry.items) };
    authored.items.set('item:iron_axe', { ...source, durability: { ...source.durability!, max: 1000 } });
    expect(uiDurabilityFraction('iron_axe', 250, authored)).toBe(0.25);
    const { durability: _removed, ...inert } = registry.items.get('item:axe')!;
    void _removed;
    authored.items.set('item:axe', inert);
    expect(uiDurabilityFraction('axe', 100, authored)).toBeNull();
  });

  it('draws broken indicators through both actual slot renderers for all 24 tools', () => {
    const context = {
      fillStyle: '', fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const rect = { x: 0, y: 0, width: 28, height: 31 };
    const frame = { x: 0, y: 0, width: 28, height: 31, durationTicks: 1 };
    const skin = { slot: { image: {}, uiSizing: 'fixed', metadata: {
      image: '', animations: { idle: [frame] },
    } } } as unknown as UiSkin;
    for (const itemKind of tools) {
      context.fillRect.mockClear();
      OverworldUi.prototype['drawDurabilityBar'].call(
        { model: { contentRegistry: registry } } as unknown as OverworldUi,
        context as unknown as CanvasRenderingContext2D, rect, itemKind, 0,
      );
      expect(context.fillRect, itemKind).toHaveBeenCalledTimes(2);
      context.fillRect.mockClear();
      drawUiInventorySlot(context as unknown as CanvasRenderingContext2D, {} as PixelUi,
        skin, {}, rect, { itemKind, quantity: 1, durability: 0 }, { contentRegistry: registry });
      expect(context.fillRect, itemKind).toHaveBeenCalledTimes(2);
    }
  });
});
