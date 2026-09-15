import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  type ContentRegistry,
  type FrameContentDefinition,
} from '@orchard/sim';
import type { ItemSlot } from './item-slot.js';
import type { UiRect } from './geometry.js';
import type { ContentFrameLayout } from './content-frame.js';
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
  overrides: Partial<Parameters<OverworldUi['update']>[0]> = {},
): void {
  ui.update({
    width, height, connected: true, playerCount: 1, selectedSlot: 0,
    openStashInventory:activeFrameId==='frame:hearth_stash'?[{slot:19,itemKind:'torch',quantity:1,lit:false}]:[],
    inventory: [], openChestInventory: [], openPlaceableInventory: [], hasBackpack: true,
    audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
    raining: false, weatherMode: 'auto', prompt: null, toast: null, contentRegistry: registry,
    ...(activeFrameId === undefined ? {} : { activeFrameId, activeFrameState: { sealed: false } }),
    inventoryFrameState,
    ...overrides,
  });
}

describe('authored content frames in Overworld UI', () => {
  it('binds all twenty private stash slots and routes pointer and quick moves to stash custody',()=>{
    const handlers=callbacks(),ui=new OverworldUi({} as UiSkin,{} as PixelUi,{} as OverworldUiItemArt,handlers);
    update(ui,contentRegistry,480,270,'frame:hearth_stash');ui.openWindow='content';
    const internal=ui as unknown as {
      visibleItemSlots():{containerId:string;index:number;bounds:{x:number;y:number}}[];
      quickMoveDestinations(source:string):readonly string[];
      quickMoveSourceContainers(source:string):readonly string[];
    };
    const slots=internal.visibleItemSlots().filter(slot=>slot.containerId==='stash');
    expect(slots).toHaveLength(20);
    const last=slots.find(slot=>slot.index===19)!;
    ui.pointerDown({x:last.bounds.x+8,y:last.bounds.y+8},0);
    ui.pointerUp({x:last.bounds.x+8,y:last.bounds.y+8},0);
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('stash',19,'left');
    expect(internal.quickMoveDestinations('hotbar')).toEqual(['stash']);
    expect(internal.quickMoveDestinations('stash')).toEqual(['hotbar','backpack']);
    expect(internal.quickMoveSourceContainers('stash')).toEqual(['stash']);
    ui.openWindow=null;expect(handlers.closePlaceable).toHaveBeenCalled();
  });
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


describe('chest search and sort controls', () => {
  function setup(width = 480, height = 270, renamed = false) {
    const source = contentRegistry.frames.get('frame:chest')!;
    const id = renamed ? 'frame:orchard_storage' : source.id;
    const registry = renamed ? buildContentRegistry(bootstrapContentRows().map((row) => row.id === source.id
      ? { ...row, id, json: { ...source, id } } : row)).registry : contentRegistry;
    const handlers = { ...callbacks(), sortInventoryContainer: vi.fn(), inventoryCursorClick: vi.fn() };
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const refresh = (overrides: Partial<Parameters<OverworldUi['update']>[0]> = {}) => update(ui, registry, width, height, id, undefined, {
      inventory: [{ slot: 18, itemKind: 'apple', quantity: 3 }],
      openChestInventory: [{ slot: 11, itemKind: 'apple', quantity: 2 }, { slot: 3, itemKind: 'wood', quantity: 4 }],
      ...overrides,
    });
    refresh();
    ui.openWindow = renamed ? 'content' : 'chest';
    const internal = ui as unknown as {
      inventoryFilterText: string;
      inventoryFilterInput: { hidden: boolean; blur(): void; focus(): void } | null;
      inventorySearchRect(): UiRect | null;
      activeContentFrame(): ContentFrameLayout;
      visibleItemSlots(): ItemSlot[];
      chestSortNode: { bounds: UiRect; visible: boolean; enabled: boolean };
      backpackSortNode: { bounds: UiRect; visible: boolean; enabled: boolean };
    };
    return { ui, handlers, internal, refresh };
  }

  it.each([false, true])('filters both panes without changing physical slot custody (renamed: %s)', (renamed) => {
    const { ui, handlers, internal, refresh } = setup(480, 270, renamed);
    internal.inventoryFilterText = '  APPle  ';
    refresh();
    const slots = internal.visibleItemSlots().filter((slot) => slot.containerId !== 'hotbar');
    expect(slots.map((slot) => [slot.containerId, slot.index])).toEqual(expect.arrayContaining([
      ['chest', 11], ['backpack', 8],
    ]));
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      const point = { x: slot.bounds.x + 8, y: slot.bounds.y + 8 };
      ui.pointerDown(point, 0);
      ui.pointerUp(point, 0);
      expect(handlers.inventoryCursorClick).toHaveBeenCalledWith(slot.containerId, slot.index, 'left');
    }
    internal.inventoryFilterText = 'no matches';
    refresh();
    expect(internal.visibleItemSlots().filter((slot) => slot.containerId !== 'hotbar')).toHaveLength(0);
    internal.inventoryFilterText = '';
    refresh();
    expect(internal.visibleItemSlots().filter((slot) => slot.containerId === 'chest')).toHaveLength(16);
  });

  it('matches display names and item IDs, retaining empty slots when search is cleared', () => {
    const { internal, refresh } = setup();
    const inventory = { openChestInventory: [{ slot: 12, itemKind: 'copper_ore', quantity: 2 }] };
    for (const query of ['Copper Ore', 'copper_ore']) {
      internal.inventoryFilterText = query;
      refresh(inventory);
      expect(internal.visibleItemSlots().filter((slot) => slot.containerId === 'chest').map((slot) => slot.index)).toEqual([12]);
    }
    internal.inventoryFilterText = '';
    refresh(inventory);
    expect(internal.visibleItemSlots().filter((slot) => slot.containerId === 'chest')).toHaveLength(16);
  });

  it.each([[384, 270], [480, 270], [1470, 820]])('fits search and sort around the grids at %ix%i', (width, height) => {
    const { ui, internal, handlers } = setup(width, height, true);
    const frame = internal.activeContentFrame();
    const search = internal.inventorySearchRect()!;
    expect(search.y).toBeGreaterThanOrEqual(Math.max(...frame.panes.map(({ layout }) => layout.grid.y + layout.grid.height)));
    expect(search.y + search.height).toBeLessThanOrEqual(frame.storage.divider!.y);
    expect(search.x).toBeGreaterThan(frame.storage.frame.x);
    expect(search.x + search.width).toBeLessThan(frame.storage.frame.x + frame.storage.frame.width);
    for (const [container, node] of [['chest', internal.chestSortNode], ['backpack', internal.backpackSortNode]] as const) {
      expect(node.visible).toBe(true);
      expect(node.enabled).toBe(true);
      const pane = frame.panes.find((pane) => pane.slots.some((binding) => binding.containerId === container))!;
      expect(node.bounds.y + node.bounds.height).toBeLessThanOrEqual(pane.layout.grid.y);
      expect(node.bounds.x + node.bounds.width).toBe(pane.layout.grid.x + pane.layout.grid.width);
      ui.pointerDown({ x: node.bounds.x + 8, y: node.bounds.y + 8 }, 0);
      expect(handlers.sortInventoryContainer).toHaveBeenLastCalledWith(container);
    }
  });

  it('shows and focuses the shared search input for chest frames, then hides it on close', () => {
    const { ui, internal, refresh } = setup(480, 270, true);
    const input = { hidden: true, focus: vi.fn(), blur: vi.fn() };
    internal.inventoryFilterInput = input;
    refresh();
    expect(input.hidden).toBe(false);
    const rect = internal.inventorySearchRect()!;
    ui.pointerDown({ x: rect.x + 8, y: rect.y + 8 }, 0);
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    ui.openWindow = null;
    expect(input.hidden).toBe(true);
    expect(input.blur).toHaveBeenCalled();
  });

  it('disables sorting while holding a stack and hides chest search after closing', () => {
    const { ui, internal, refresh } = setup();
    refresh({ cursorStack: { itemKind: 'wood', quantity: 1 } });
    expect(internal.chestSortNode.enabled).toBe(false);
    expect(internal.backpackSortNode.enabled).toBe(false);
    ui.openWindow = null;
    expect(internal.inventorySearchRect()).toBeNull();
    expect(internal.chestSortNode.visible).toBe(false);
  });
});
