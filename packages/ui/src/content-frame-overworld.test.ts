import { UiRoot } from './kit/runtime/root.js';
import type { UiElement } from './kit/runtime/element.js';
import { scrollUiElement } from './kit/layout/scroll.js';
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
} from './game/index.js';

const contentRegistry = buildContentRegistry(bootstrapContentRows()).registry;

function frameActionButton(host: OverworldUi, label: string): UiElement {
  const root = (host as unknown as {chromeRoot:UiRoot}).chromeRoot; root.arrange();
  const walk = (node:UiElement):UiElement[] => [node,...node.children.flatMap(walk)];
  const button = walk(root.tree).find(node=>node.kind==='button' && node.label===label)!;
  for(let parent=button.parent;parent;parent=parent.parent){scrollUiElement(parent,parent.scroll.x,parent.scroll.y+button.rect.y-parent.contentRect.y);root.arrange();}
  return button;
}
function clickFrameAction(host: OverworldUi, label: string): {x:number;y:number} {
  const button=frameActionButton(host,label),r=button.clip;
  expect(r.width).toBeGreaterThan(0);expect(r.height).toBeGreaterThan(0);
  const point={x:r.x+r.width/2,y:r.y+r.height/2};
  host.pointerMove(point);expect(host.pointerDown(point,0)).toBe(true);host.pointerUp(point,0);return point;
}

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
    const point = clickFrameAction(ui, 'RECOVER');
    expect(handlers.frameAction).toHaveBeenCalledWith('return_private_batch');
    vi.mocked(handlers.frameAction!).mockClear();
    update(ui, registry, 480, 270, 'frame:furnace', { processJobPending: false });
    expect(frameActionButton(ui, 'RECOVER').visible).toBe(false);
    ui.pointerDown(point, 0); ui.pointerUp(point, 0);
    expect(handlers.frameAction).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3] as const)('clips bound G1-G4 kit slots inside their frame at UI scale %i', (scale) => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    update(ui, contentRegistry, 480, 270);
    const root = (ui as unknown as { chromeRoot: UiRoot }).chromeRoot;
    for (const window of ['inventory', 'crafting', 'chest', 'barrel', 'furnace', 'cooking', 'press', 'fermentation'] as const satisfies readonly OverworldWindow[]) {
      const frameKey = window === 'inventory' ? 'pack' : window;
      update(ui, contentRegistry, 480, 270, `frame:${frameKey}`);
      ui.openWindow = window;
      root.setScale(scale); root.resize(480 * scale, 270 * scale); root.arrange();
      const entries = root.entries().map(entry => entry.element);
      const frame = entries.find(node => node.id === `frame:${frameKey}`)!.rect;
      const slots = entries.filter(node => node.kind === 'slot');
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        if (!slot.clip.width || !slot.clip.height) continue;
        expect(slot.clip.x).toBeGreaterThanOrEqual(frame.x);
        expect(slot.clip.x + slot.clip.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(slot.clip.y).toBeGreaterThanOrEqual(frame.y);
        expect(slot.clip.y + slot.clip.height).toBeLessThanOrEqual(frame.y + frame.height);
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
    const root = (ui as unknown as { chromeRoot: UiRoot }).chromeRoot; root.arrange();
    const nodes = root.entries().map(entry => entry.element);
    expect(nodes.some(node => node.id === definition.id && node.kind === 'frame')).toBe(true);
    expect(nodes.filter(node => node.kind === 'slot').map(node => node.props['binding']))
      .toEqual([{ container: 'placeable', index: 7 }]);
    clickFrameAction(ui, 'CHARGE');
    expect(handlers.frameAction!).toHaveBeenCalledWith('charge');
  });
});
