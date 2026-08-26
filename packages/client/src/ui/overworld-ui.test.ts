import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import {
  ONLINE_PLAYER_LIST_BOTTOM_PADDING,
  OverworldUi,
  onlinePlayerListFrameHeight,
  overworldUiLayout,
  itemIconAnimation,
  slotStackLabelPosition,
  slotDurabilityBarRect,
  type OverworldUiCallbacks,
  type OverworldUiItemArt,
} from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import { RIBBON_TEXT_TOP_OFFSET, ribbonWidth } from './ribbon.js';

function callbacks(): OverworldUiCallbacks {
  return {
    selectHotbar: vi.fn(),
    setTimeFraction: vi.fn(),
    shiftDay: vi.fn(),
    cycleWeather: vi.fn(),
    cycleWindDirection: vi.fn(),
    setAudioVolume: vi.fn(),
    signOut: vi.fn(),
    quitToTitle: vi.fn(),
    moveInventoryItem: vi.fn(),
    quickMoveInventoryItem: vi.fn(),
    quickMoveAllInventoryItems: vi.fn(),
    distributeInventoryItem: vi.fn(),
    craftInventoryRecipe: vi.fn(),
    ghostFillCraftingRecipe: vi.fn(),
    closeCrafting: vi.fn(),
    closeChest: vi.fn(),
    closePlaceable: vi.fn(),
  };
}

describe('overworld retained UI layout', () => {
  it('uses the authored closed chest animation for chest slot icons', () => {
    expect(itemIconAnimation('chest')).toBe('chest');
    expect(itemIconAnimation('wood')).toBe('base');
  });

  it('anchors status, weather, hotbar, and window at 480x270', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.status).toEqual({ x: 4, y: 4, width: 190, height: 24 });
    expect(layout.weather.x + layout.weather.width).toBe(476);
    expect(layout.previousDayButton).toMatchObject({ width: 64, height: 20 });
    expect(layout.nextDayButton).toMatchObject({ width: 64, height: 20 });
    expect(layout.weatherButton.height).toBe(22);
    expect(layout.windDirectionButton).toMatchObject({ height: 22 });
    expect(layout.windDirectionButton.y + layout.windDirectionButton.height).toBeLessThan(layout.developerWindow.y + layout.developerWindow.height);
    expect(layout.hotbar.x).toBe(105);
    expect(layout.hotbar.y + layout.hotbar.height).toBe(264);
    expect(layout.vitals).toEqual({ x: 192, y: 191, width: 96, height: 38 });
    expect(layout.vitals.x + layout.vitals.width / 2).toBe(layout.hotbar.x + layout.hotbar.width / 2);
    expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
    expect(layout.tooltip.height).toBe(16);
    expect(layout.window.x).toBe(105);
    expect(layout.window.y).toBe(43);
  });

  it('only exposes owner world controls through the framed developer window', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: true,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', windDirectionMode: 'auto', windDirectionLabel: 'SE',
      prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    expect(ui.pointerDown({ x: layout.windDirectionButton.x + 4, y: layout.windDirectionButton.y + 4 }, 0)).toBe(false);
    ui.openWindow = 'system';
    expect(ui.pointerDown({ x: layout.developerButton.x + 4, y: layout.developerButton.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('developer');
    const button = layout.windDirectionButton;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.cycleWindDirection).toHaveBeenCalledOnce();
  });

  it('keeps all anchored UI inside a narrow viewport', () => {
    const layout = overworldUiLayout(360, 180);
    for (const rect of [layout.status, layout.weather, layout.hotbar, layout.window, layout.closeButton]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(360);
      expect(rect.y + rect.height).toBeLessThanOrEqual(180);
    }
  });

  it('centres the doubled vitals frame immediately above the hotbar at UI scales 1/2/3', () => {
    for (const [cssWidth, cssHeight, scale] of [[480, 270, 1], [1280, 720, 2], [1920, 1080, 3]] as const) {
      const layout = overworldUiLayout(Math.floor(cssWidth / scale), Math.floor(cssHeight / scale));
      expect(layout.vitals.x + layout.vitals.width / 2).toBe(layout.hotbar.x + layout.hotbar.width / 2);
      expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
      expect(layout.vitals.y).toBeGreaterThanOrEqual(layout.weather.y + layout.weather.height);
      expect(layout.vitals.x + layout.vitals.width).toBeLessThanOrEqual(cssWidth / scale);
      expect(layout.vitals.y + layout.vitals.height).toBeLessThanOrEqual(cssHeight / scale);
    }
  });

  it('reserves explicit bottom padding as the online roster grows', () => {
    expect(onlinePlayerListFrameHeight(1) - onlinePlayerListFrameHeight(0)).toBe(12);
    expect(onlinePlayerListFrameHeight(3) - (29 + 3 * 12)).toBe(ONLINE_PLAYER_LIST_BOTTOM_PADDING);
  });

  it('keeps stack counts above and inside the slot bevel', () => {
    expect(slotStackLabelPosition({ x: 40, y: 70, width: 28, height: 31 }))
      .toEqual({ x: 63, y: 87 });
  });

  it('keeps durability bars inside the usable slot face above the bottom bevel', () => {
    const slot = { x: 40, y: 70, width: 28, height: 31 };
    const bar = slotDurabilityBarRect(slot);
    expect(bar).toEqual({ x: 45, y: 94, width: 18, height: 3 });
    expect(bar.x).toBeGreaterThan(slot.x);
    expect(bar.x + bar.width).toBeLessThan(slot.x + slot.width);
    expect(bar.y + bar.height).toBeLessThan(slot.y + slot.height);
  });
});

describe('overworld inventory and system menu', () => {
  it('grows ribbons around their body-font labels without stretching their caps', () => {
    const font = { font: { cellSize: [6, 8], glyphSize: [5, 7], columns: 16, charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } };
    expect(ribbonWidth('MENU', font as unknown as PixelUi)).toBe(78);
    expect(ribbonWidth('INVENTORY', font as unknown as PixelUi)).toBeGreaterThan(78);
    expect(RIBBON_TEXT_TOP_OFFSET).toBe(5);
  });

  it('lays out a paper doll, expandable inventory grid, and separate hotbar', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.equipmentSlots).toHaveLength(9);
    expect(layout.backpackSlots).toHaveLength(20);
    expect(layout.inventoryHotbarSlots).toHaveLength(9);
    for (const slot of [...layout.equipmentSlots, ...layout.backpackSlots, ...layout.inventoryHotbarSlots]) {
      expect(slot.x).toBeGreaterThanOrEqual(layout.inventoryWindow.x);
      expect(slot.x + slot.width).toBeLessThanOrEqual(layout.inventoryWindow.x + layout.inventoryWindow.width);
      expect(slot.y + slot.height).toBeLessThanOrEqual(layout.inventoryWindow.y + layout.inventoryWindow.height);
    }
    const inventoryBottom = layout.inventoryWindow.y + layout.inventoryWindow.height;
    expect(Math.max(...layout.inventoryHotbarSlots.map((slot) => slot.y + slot.height))).toBeLessThanOrEqual(inventoryBottom - 17);
  });

  it('returns transient crafting inputs when the window closes', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.openWindow = 'system';
    expect(handlers.closeCrafting).toHaveBeenCalledOnce();
  });

  it('treats the campfire cooking placeholder as a dismissible modal', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'cooking';
    expect(ui.handleKeyDown('KeyW', false)).toBe(true);
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
  });

  it('reserves Escape for the system menu while inventory has its own key', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBe('system');
    ui.openWindow = 'settings';
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('KeyI', false);
    expect(ui.openWindow).toBe('inventory');
    ui.handleKeyDown('KeyI', false);
    expect(ui.openWindow).toBeNull();
    expect(ui.handleKeyDown('Tab', false)).toBe(false);
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('KeyI', false);
    expect(ui.handleKeyDown('KeyW', false)).toBe(true);
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
  });

  it('opens Help from the Escape menu and returns to the menu on Escape', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'system';
    const help = overworldUiLayout(480, 270).helpButton;
    expect(ui.pointerDown({ x: help.x + 4, y: help.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('help');
    expect(ui.handleKeyDown('ArrowRight', false)).toBe(true);
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBe('system');
  });

  it('gives the system menu immediate pointer priority over an open inventory', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'axe', quantity: 1 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    expect(ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0)).toBe(true);

    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
    expect(ui.pointerDown({
      x: layout.settingsButton.x + layout.settingsButton.width / 2,
      y: layout.settingsButton.y + layout.settingsButton.height / 2,
    }, 0)).toBe(true);
    expect(ui.openWindow).toBe('settings');
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
  });

  it('drags a compatible hotbar item into its typed equipment slot', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'axe', quantity: 1 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const hand = layout.equipmentSlots[3]!;
    expect(ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0)).toBe(true);
    ui.pointerMove({ x: hand.x + 4, y: hand.y + 4 });
    expect(ui.pointerUp({ x: hand.x + 4, y: hand.y + 4 }, 0)).toBe(true);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'equipment', toIndex: 3, quantity: 1,
    });
  });

  it('does not drop a hand item into a head-only equipment slot', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'axe', quantity: 1 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const head = layout.equipmentSlots[1]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    ui.pointerMove({ x: head.x + 4, y: head.y + 4 });
    ui.pointerUp({ x: head.x + 4, y: head.y + 4 }, 0);
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
  });

  it('supports click-to-hold then click-to-place and right-click half splitting', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 9 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270); const source = layout.inventoryHotbarSlots[0]!; const target = layout.craftingSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 2);
    ui.pointerUp({ x: source.x + 4, y: source.y + 4 }, 2);
    ui.pointerDown({ x: target.x + 4, y: target.y + 4 }, 0);
    ui.pointerUp({ x: target.x + 4, y: target.y + 4 }, 0);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 5,
    });
  });

  it('treats persisted empty rows as vacant drag targets', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [
        { slot: 0, itemKind: 'wood', quantity: 36 },
        { slot: 41, itemKind: 'empty', quantity: 0 },
      ],
      hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const target = layout.craftingSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    ui.pointerMove({ x: target.x + 4, y: target.y + 4 });
    ui.pointerUp({ x: target.x + 4, y: target.y + 4 }, 0);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 36,
    });
  });

  it('shows item-name tooltips for inventory slots and the crafting result', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }, { slot: 41, itemKind: 'wood', quantity: 1 }],
      hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const hotbar = layout.inventoryHotbarSlots[0]!;
    ui.pointerMove({ x: hotbar.x + 4, y: hotbar.y + 4 });
    expect(ui.tooltipText()).toBe('WOOD');
    ui.pointerMove({ x: layout.craftingResult.x + 4, y: layout.craftingResult.y + 4 });
    expect(ui.tooltipText()).toBe('WOODEN PLANKS');
  });

  it('cancels an active drag when the player right-clicks outside a compatible slot', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    expect(ui.pointerDown({ x: 2, y: 2 }, 2)).toBe(true);
    ui.pointerUp({ x: 2, y: 2 }, 0);
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
  });

  it('right-clicks one carried item into a compatible slot and keeps carrying the remainder', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const firstTarget = layout.craftingSlots[0]!;
    const secondTarget = layout.craftingSlots[1]!;
    const sourcePoint = { x: source.x + 4, y: source.y + 4 };
    const firstPoint = { x: firstTarget.x + 4, y: firstTarget.y + 4 };
    const secondPoint = { x: secondTarget.x + 4, y: secondTarget.y + 4 };

    ui.pointerDown(sourcePoint, 0);
    ui.pointerUp(sourcePoint, 0);
    expect(ui.pointerDown(firstPoint, 2)).toBe(true);
    ui.pointerUp(firstPoint, 2);
    ui.pointerDown(secondPoint, 0);
    ui.pointerUp(secondPoint, 0);

    expect(handlers.moveInventoryItem).toHaveBeenNthCalledWith(1, {
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1,
    });
    expect(handlers.moveInventoryItem).toHaveBeenNthCalledWith(2, {
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 2,
    });
  });

  it('does not cancel a held stack on an immediate source re-click', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const target = layout.craftingSlots[0]!;
    const sourcePoint = { x: source.x + 4, y: source.y + 4 };
    const targetPoint = { x: target.x + 4, y: target.y + 4 };

    ui.pointerDown(sourcePoint, 0);
    ui.pointerUp(sourcePoint, 0);
    ui.pointerDown(sourcePoint, 0);
    ui.pointerUp(sourcePoint, 0);

    ui.pointerDown(targetPoint, 0);
    ui.pointerUp(targetPoint, 0);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 8,
    });
  });

  it('cancels when a dragged stack is held before returning to its source slot', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const target = layout.craftingSlots[0]!;
    const sourcePoint = { x: source.x + 4, y: source.y + 4 };
    const targetPoint = { x: target.x + 4, y: target.y + 4 };

    ui.pointerDown(sourcePoint, 0);
    ui.pointerMove(targetPoint);
    ui.pointerMove(sourcePoint);
    now.mockReturnValue(1_300);
    ui.pointerUp(sourcePoint, 0);

    ui.pointerDown(targetPoint, 0);
    ui.pointerUp(targetPoint, 0);
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('shift-clicks and shift-drags through the reusable bulk gesture callbacks', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270); const source = layout.inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    ui.pointerUp({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 0, ['crafting']);

    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    for (const slot of layout.craftingSlots.slice(0, 3)) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 }, { shift: true });
    const last = layout.craftingSlots[2]!;
    ui.pointerUp({ x: last.x + 4, y: last.y + 4 }, 0, { shift: true });
    expect(handlers.distributeInventoryItem).toHaveBeenCalledWith('hotbar', 0, [
      { container: 'crafting', index: 0 }, { container: 'crafting', index: 1 }, { container: 'crafting', index: 2 },
    ], 8);
  });

  it('previews even distribution live as each shifted-over slot is added', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'plank', quantity: 10 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    for (const slot of layout.craftingSlots.slice(0, 3)) {
      ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 }, { shift: true });
    }
    const internal = ui as unknown as {
      shiftDragRemaining: number;
      craftingItemSlots: readonly { readonly item: { readonly quantity: number } | null }[];
    };
    expect(internal.shiftDragRemaining).toBe(0);
    expect(internal.craftingItemSlots.slice(0, 3).map((slot) => slot.item?.quantity)).toEqual([4, 3, 3]);
  });

  it('shift-double-clicks all matching stacks toward the normal destination inventory', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }, { slot: 1, itemKind: 'wood', quantity: 9 }],
      openChestInventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const source = overworldUiLayout(480, 270).inventoryHotbarSlots[0]!;
    const point = { x: source.x + 4, y: source.y + 4 };
    ui.pointerDown(point, 0, { shift: true });
    ui.pointerUp(point, 0, { shift: true });
    now.mockReturnValue(300);
    ui.pointerDown(point, 0, { shift: true });
    ui.pointerUp(point, 0, { shift: true });
    expect(handlers.quickMoveAllInventoryItems).toHaveBeenCalledWith('wood', ['hotbar', 'backpack'], ['chest']);
    now.mockRestore();
  });

  it('shift-clicks a recipe result to request a maximum-stack craft', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 38, itemKind: 'wood', quantity: 25 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const result = overworldUiLayout(480, 270).craftingResult;
    expect(ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, { shift: true })).toBe(true);
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('planks', true);
  });

  it('starts even distribution when Shift is pressed after picking the stack up', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'plank', quantity: 10 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const targets = layout.craftingSlots.slice(0, 3);
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    for (const slot of targets) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 }, { shift: true });
    const last = targets[2]!;
    ui.pointerUp({ x: last.x + 4, y: last.y + 4 }, 0, { shift: true });
    expect(handlers.distributeInventoryItem).toHaveBeenCalledWith('hotbar', 0, [
      { container: 'crafting', index: 0 },
      { container: 'crafting', index: 1 },
      { container: 'crafting', index: 2 },
    ], 10);
  });

  it('keeps the original source when a held stack is shift-swept before the finishing click', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'plank', quantity: 9 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.inventoryHotbarSlots[0]!;
    const targets = layout.craftingSlots.slice(0, 3);
    const sourcePoint = { x: source.x + 4, y: source.y + 4 };
    ui.pointerDown(sourcePoint, 0);
    ui.pointerUp(sourcePoint, 0);
    for (const slot of targets) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 }, { shift: true });
    const lastPoint = { x: targets[2]!.x + 4, y: targets[2]!.y + 4 };
    ui.pointerDown(lastPoint, 0, { shift: true });
    ui.pointerUp(lastPoint, 0, { shift: true });
    expect(handlers.distributeInventoryItem).toHaveBeenCalledWith('hotbar', 0, [
      { container: 'crafting', index: 0 },
      { container: 'crafting', index: 1 },
      { container: 'crafting', index: 2 },
    ], 9);
  });

  it('shows and permits dragging from the eight default inventory cells while crafting', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 9, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.craftingInventorySlots[0]!;
    const target = layout.craftingSlots[8]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    ui.pointerMove({ x: target.x + 4, y: target.y + 4 });
    ui.pointerUp({ x: target.x + 4, y: target.y + 4 }, 0);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'backpack', fromIndex: 0, toContainer: 'crafting', toIndex: 8, quantity: 3,
    });
  });

  it('shift-clicks inventory items into crafting even after a backpack is equipped', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const source = overworldUiLayout(480, 270).inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    ui.pointerUp({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 0, ['crafting']);
  });
});
