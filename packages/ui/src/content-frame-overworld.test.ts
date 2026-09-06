import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  type ContentRegistry,
  type FrameContentDefinition,
} from '@orchard/sim';
import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import {
  OverworldUi,
  type OverworldUiCallbacks,
  type OverworldUiItemArt,
  type OverworldWindow,
} from './overworld-ui.js';

const contentRegistry = buildContentRegistry(bootstrapContentRows()).registry;

function callbacks(): OverworldUiCallbacks {
  const noop = vi.fn();
  return {
    selectHotbar: noop, setTimeFraction: noop, shiftDay: noop, cycleWeather: noop,
    cycleWindDirection: noop, toggleLightingEffects: noop,
    setQuestPinned: noop, abandonQuest: noop, setAudioVolume: noop, setAudioBackground: noop,
    signOut: noop, quitToTitle: noop, startDelve: noop, exitDelve: noop,
    toggleFullscreen: noop, checkForClientUpdate: noop, applyClientUpdate: noop,
    toggleOnlinePlayers: noop, moveInventoryItem: noop, quickMoveInventoryItem: noop,
    quickMoveAllInventoryItems: noop, distributeInventoryItem: noop,
    inventoryCursorClick: noop, sortInventoryContainer: noop, inventoryCursorQuickCraft: noop,
    inventoryCursorPickupAll: noop, inventoryCursorSwapHotbar: noop, dropInventoryCursor: noop,
    throwMenuItem: noop, returnInventoryCursor: noop, craftInventoryRecipe: noop,
    ghostFillCraftingRecipe: noop, closeChest: noop, closePlaceable: noop, closeCrafting: noop,
    frameAction: noop,
  };
}

function update(
  ui: OverworldUi,
  registry: ContentRegistry,
  width: number,
  height: number,
  activeFrameId?: `frame:${string}`,
  inventoryFrameState?: Readonly<Record<string, boolean | string | number>>,
): void {
  ui.update({
    width, height, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], openChestInventory: [], openPlaceableInventory: [], hasBackpack: true,
    audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
    raining: false, weatherMode: 'auto', prompt: null, toast: null, contentRegistry: registry,
    ...(activeFrameId === undefined ? {} : { activeFrameId, activeFrameState: { sealed: false } }),
    inventoryFrameState,
  });
}

describe('authored content frames in Overworld UI', () => {
  it('routes an authored inventory recovery button using private inventory state even with another entity active', () => {
    const source = [...contentRegistry.frames.values()].find(({ presentation }) => presentation?.surface === 'inventory')!;
    const definition: FrameContentDefinition = {
      ...source, buttons: [{ label: 'RECOVER', interaction: 'return_private_batch',
        visibleWhen: { state: 'processJobPending', equals: true } }],
    };
    const registry = buildContentRegistry(bootstrapContentRows().map((row) => row.id === definition.id
      ? { ...row, json: definition } : row)).registry;
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    update(ui, registry, 480, 270, 'frame:furnace', { processJobPending: true });
    ui.openWindow = 'inventory';
    const internal = ui as unknown as {
      activeContentFrame(): { buttons: readonly { rect: { x: number; y: number } }[] };
    };
    const point = internal.activeContentFrame().buttons[0]!.rect;
    ui.pointerDown({ x: point.x + 1, y: point.y + 1 }, 0);
    expect(handlers.frameAction).toHaveBeenCalledWith('return_private_batch');
    vi.mocked(handlers.frameAction!).mockClear();
    update(ui, registry, 480, 270, 'frame:furnace', { processJobPending: false });
    ui.pointerDown({ x: point.x + 1, y: point.y + 1 }, 0);
    expect(handlers.frameAction).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3])('keeps every bound G1-G4 slot inside its authored frame at UI scale %i', (scale) => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    update(ui, contentRegistry, 480, 270);
    const internal = ui as unknown as {
      layout: { contentFrames: ReadonlyMap<string, { storage: { frame: { x: number; y: number; width: number; height: number } } }> };
      visibleItemSlots(): readonly { visible: boolean; bounds: { x: number; y: number; width: number; height: number } }[];
    };
    for (const window of ['inventory', 'crafting', 'chest', 'barrel', 'furnace', 'cooking', 'press', 'fermentation'] as const satisfies readonly OverworldWindow[]) {
      const frameKey = window === 'inventory' ? 'pack' : window;
      update(ui, contentRegistry, 480, 270, `frame:${frameKey}`);
      ui.openWindow = window;
      const frame = internal.layout.contentFrames.get(`frame:${frameKey}`)!.storage.frame;
      const slots = internal.visibleItemSlots().filter(({ visible }) => visible);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.bounds.x * scale).toBeGreaterThanOrEqual(frame.x * scale);
        expect((slot.bounds.x + slot.bounds.width) * scale).toBeLessThanOrEqual((frame.x + frame.width) * scale);
        expect(slot.bounds.y * scale).toBeGreaterThanOrEqual(frame.y * scale);
        expect((slot.bounds.y + slot.bounds.height) * scale).toBeLessThanOrEqual((frame.y + frame.height) * scale);
      }
    }
  });

  it('binds and acts on an arbitrary renamed entity frame by authored semantics', () => {
    const definition: FrameContentDefinition = {
      id: 'frame:moon_engine', kind: 'frame', schemaVersion: 1,
      title: 'MOON ENGINE', style: 'wood_parchment',
      presentation: { surface: 'entity', entityContainer: 'placeable' },
      panes: [{
        id: 'catalyst', kind: 'slots', label: 'CATALYST', columns: 1, rows: 1,
        bind: { entitySlots: [7] },
      }],
      buttons: [{ label: 'CHARGE', interaction: 'charge' }],
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: definition.id, kind: definition.kind, json: definition },
    ]).registry;
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    update(ui, registry, 480, 270, definition.id);
    ui.openWindow = 'content';
    const internal = ui as unknown as {
      activeContentFrame(): {
        definition: FrameContentDefinition;
        buttons: readonly { rect: { x: number; y: number; width: number; height: number } }[];
      } | null;
      visibleItemSlots(): readonly { containerId: string; index: number }[];
    };
    expect(internal.activeContentFrame()?.definition.title).toBe('MOON ENGINE');
    expect(internal.visibleItemSlots()).toEqual([
      expect.objectContaining({ containerId: 'placeable', index: 7 }),
    ]);
    const button = internal.activeContentFrame()!.buttons[0]!.rect;
    expect(ui.pointerDown({ x: button.x + 1, y: button.y + 1 }, 0)).toBe(true);
    expect(handlers.frameAction!).toHaveBeenCalledWith('charge');
  });
});
