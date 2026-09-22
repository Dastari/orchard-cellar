import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { OverworldUi, overworldItemArtwork, overworldUiLayout, type OverworldUiItemArt } from './overworld-ui.js';

vi.mock('./design-system/inventory.js', async importOriginal => ({
  ...await importOriginal<typeof import('./design-system/inventory.js')>(),
  drawUiInventorySlotBacking: vi.fn(),
}));
vi.mock('./pixel-ui.js', async importOriginal => ({
  ...await importOriginal<typeof import('./pixel-ui.js')>(), drawPixelText: vi.fn(),
}));

const missing = { id: 'missing' };
const apple = { id: 'apple' };
const art = { missing, apple } as unknown as OverworldUiItemArt;

it('never resolves the empty sentinel to missing-item artwork', () => {
  expect(overworldItemArtwork(art, 'empty', bootstrapContentRegistry())).toBeUndefined();
  expect(overworldItemArtwork(art, 'unknown-item', bootstrapContentRegistry())).toBe(missing);
});

it('draws only occupied hotbar rows, retaining fallback art for unknown real items', () => {
  const drawItemArtwork = vi.fn();
  const drawDurabilityBar = vi.fn();
  const receiver = {
    model: {
      inventory: [
        { slot: 0, itemKind: 'empty', quantity: 0 },
        { slot: 1, itemKind: 'apple', quantity: 0 },
        { slot: 2, itemKind: 'apple', quantity: 1 },
        { slot: 3, itemKind: 'unknown-item', quantity: 1 },
      ],
      selectedSlot: -1, contentRegistry: bootstrapContentRegistry(),
    },
    layout: overworldUiLayout(800, 600), hoveredSlot: -1,
    skin: {}, fonts: {}, itemArt: art, drawItemArtwork, drawDurabilityBar,
  };
  const prototype = OverworldUi.prototype as unknown as {
    drawHotbar: (context: CanvasRenderingContext2D) => void;
  };
  prototype.drawHotbar.call(receiver, {} as CanvasRenderingContext2D);
  expect(drawItemArtwork.mock.calls.map(call => call[2])).toEqual(['apple', 'unknown-item']);
  expect(drawDurabilityBar.mock.calls.map(call => call[2])).toEqual(['apple', 'unknown-item']);
});
