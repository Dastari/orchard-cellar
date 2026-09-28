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
  it('binds all twenty private stash slots in the kit window and routes presses and quick moves to stash custody',()=>{
    const handlers=callbacks(),ui=new OverworldUi({} as UiSkin,{} as PixelUi,{} as OverworldUiItemArt,handlers);
    update(ui,contentRegistry,480,270,'frame:hearth_stash');ui.openWindow='content';
    const internal=ui as unknown as { quickMoveDestinations(source:string):readonly string[]; quickMoveSourceContainers(source:string):readonly string[] };
    const root=ui.retainedInventoryRoot!;root.arrange();
    const stash=root.entries().filter(entry=>(entry.element.props['binding'] as {container?:string}|undefined)?.container==='stash').map(entry=>entry.element);
    expect(stash).toHaveLength(20);
    const last=stash.find(node=>(node.props['binding'] as {index:number}).index===19)!;
    const point={x:last.rect.x+last.rect.width/2,y:last.rect.y+last.rect.height/2};
    root.pointer({type:'down',point,pointerId:1,button:0});root.pointer({type:'up',point,pointerId:1,button:0});
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
    // The kit inventory window shows the authored button while its state holds, and routes it to the frame action.
    const root = ui.retainedInventoryRoot!;
    const button = () => { root.arrange(); return root.entries().find(entry => entry.element.label === 'Recover')?.element; };
    const press = () => { const node = button()!; root.focus.set(node, 'keyboard'); root.key({ key: 'Enter' }); };
    press();
    expect(handlers.frameAction).toHaveBeenCalledWith('return_private_batch');
    vi.mocked(handlers.frameAction!).mockClear();
    update(ui, registry, 480, 270, 'frame:furnace', { processJobPending: false });
    expect(button()?.style.display ?? 'none').toBe('none');
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
    // Adopted by its entity surface, not its id: the kit window binds its slot and runs its authored button (BUG-067).
    const root = ui.retainedInventoryRoot!;
    root.arrange();
    const bound = root.entries().map(({ element }) => element.props['binding'] as { container?: string; index?: number } | undefined)
      .filter(binding => binding?.container === 'placeable');
    expect(bound).toEqual([expect.objectContaining({ container: 'placeable', index: 7 })]);
    const button = root.entries().find(({ element }) => element.label === 'Charge')!.element;
    root.focus.set(button, 'keyboard');
    root.key({ key: 'Enter' });
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

  it.each([[384, 270], [480, 270], [1470, 820]])('gives a renamed chest frame the kit filters and sorts at %ix%i', (width, height) => {
    const { ui, handlers } = setup(width, height, true);
    const root = ui.retainedInventoryRoot!;
    root.arrange();
    const ids = root.entries().map(({ element }) => element.id);
    expect(ids).toContain('frame:orchard_storage.pane.contents.filter');
    expect(ids).toContain('frame:orchard_storage.pane.backpack.filter');
    for (const [container, pane] of [['chest', 'contents'], ['backpack', 'backpack']] as const) {
      root.arrange();
      const sort = root.entries().find(({ element }) => element.id === `frame:orchard_storage.pane.${pane}.sort`)!.element;
      const point = { x: sort.clip.x + sort.clip.width / 2, y: sort.clip.y + sort.clip.height / 2 };
      root.pointer({ type: 'down', point, pointerId: 1, button: 0 });
      root.pointer({ type: 'up', point, pointerId: 1, button: 0 });
      expect(handlers.sortInventoryContainer).toHaveBeenLastCalledWith(container);
    }
  });

  it('keeps the host search input hidden while a kit chest frame is open', () => {
    const { ui, internal, refresh } = setup(480, 270, true);
    const input = { hidden: false, focus: vi.fn(), blur: vi.fn() };
    internal.inventoryFilterInput = input;
    refresh();
    expect(input.hidden).toBe(true);
    expect(internal.inventorySearchRect()).toBeNull();
    ui.openWindow = null;
    expect(input.hidden).toBe(true);
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
