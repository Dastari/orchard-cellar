import { describe, expect, it, vi } from 'vitest';
import { CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, CHEST_STORAGE_ROWS } from '@orchard/sim';
import type { PixelUi } from '../render/pixel-ui.js';
import {
  ONLINE_PLAYER_LIST_BOTTOM_PADDING,
  OverworldUi,
  onlinePlayerListFrameHeight,
  overworldUiLayout,
  hotbarReticleRect,
  itemIconAnimation,
  slotStackLabelPosition,
  slotDurabilityBarRect,
  type OverworldUiCallbacks,
  type OverworldUiItemArt,
  type OverworldUiLayout,
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
    setAudioBackground: vi.fn(),
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

  it('anchors the zone ribbon, currency, hotbar, and window at 480x270', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.status).toEqual({ x: 4, y: 2, width: 220, height: 34 });
    expect(layout.moon).toEqual({ x: 173, y: 11, width: 16, height: 16 });
    expect(layout.moon.x).toBeGreaterThanOrEqual(layout.status.x);
    expect(layout.moon.x + layout.moon.width).toBeLessThanOrEqual(layout.status.x + layout.status.width);
    expect(layout.currency).toEqual({ x: 376, y: 4, width: 100, height: 24 });
    expect(layout.previousDayButton).toMatchObject({ width: 64, height: 20 });
    expect(layout.nextDayButton).toMatchObject({ width: 64, height: 20 });
    expect(layout.weatherButton.height).toBe(22);
    expect(layout.windDirectionButton).toMatchObject({ height: 22 });
    expect(layout.windDirectionButton.y + layout.windDirectionButton.height).toBeLessThan(layout.developerWindow.y + layout.developerWindow.height);
    expect(layout.hotbar.x).toBe(105);
    expect(layout.hotbar.y + layout.hotbar.height).toBe(264);
    expect(layout.vitals).toEqual({ x: 105, y: 200, width: 72, height: 29 });
    expect(layout.targetVitals).toEqual({ x: 303, y: 200, width: 72, height: 29 });
    expect(layout.vitals.x).toBe(layout.hotbar.x);
    expect(layout.targetVitals.x + layout.targetVitals.width).toBe(layout.hotbar.x + layout.hotbar.width);
    expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
    expect(layout.tooltip.height).toBe(16);
    expect(layout.notification.y + layout.notification.height).toBeLessThan(layout.tooltip.y);
    expect(layout.window.x).toBe(105);
    expect(layout.window.y).toBe(43);
  });

  it('keeps action failures visible independently of prompts and item tooltips', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: '[E] OPEN CHEST',
      toast: 'NOT ENOUGH INVENTORY SPACE', toastKind: 'failure',
    });

    expect(ui.tooltipText()).toBe('[E] OPEN CHEST');
    expect(ui.notificationText()).toBe('NOT ENOUGH INVENTORY SPACE');

    const hotbar = overworldUiLayout(480, 270).slots[0]!;
    ui.pointerMove({ x: hotbar.x + 4, y: hotbar.y + 4 });
    expect(ui.tooltipText()).toBe('WOOD');
    expect(ui.notificationText()).toBe('NOT ENOUGH INVENTORY SPACE');
  });

  it('shows lunar details only while hovering the moon, not the ribbon', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 12', timeLabel: '14:35', timeFraction: 0.6,
      moonPhase: 'waxing_crescent', moonIlluminationPerMille: 250,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    ui.pointerMove({ x: layout.status.x + 20, y: layout.status.y + 10 });
    expect(ui.tooltipText()).toBeNull();
    ui.pointerMove({ x: layout.moon.x + 5, y: layout.moon.y + 5 });
    expect(ui.tooltipText()).toBe('Waxing Crescent — 250/1000');
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
    for (const rect of [layout.status, layout.currency, layout.hotbar, layout.window, layout.closeButton]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(360);
      expect(rect.y + rect.height).toBeLessThanOrEqual(180);
    }
  });

  it('aligns smaller self and mirrored target frames to the hotbar edges at UI scales 1/2/3', () => {
    for (const [cssWidth, cssHeight, scale] of [[480, 270, 1], [1280, 720, 2], [1920, 1080, 3]] as const) {
      const layout = overworldUiLayout(Math.floor(cssWidth / scale), Math.floor(cssHeight / scale));
      expect(layout.vitals.x).toBe(layout.hotbar.x);
      expect(layout.targetVitals.x + layout.targetVitals.width).toBe(layout.hotbar.x + layout.hotbar.width);
      expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
      expect(layout.targetVitals.y).toBe(layout.vitals.y);
      expect(layout.vitals.y).toBeGreaterThanOrEqual(layout.status.y + layout.status.height);
      expect(layout.vitals.x + layout.vitals.width).toBeLessThanOrEqual(cssWidth / scale);
      expect(layout.vitals.y + layout.vitals.height).toBeLessThanOrEqual(cssHeight / scale);
    }
  });

  it('captures HUD portrait clicks instead of targeting the world behind them', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 2, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      vitals: { playerId: 'self', health: 100, maxHealth: 100, mana: 100, maxMana: 100, vigour: 100, maxVigour: 100 },
      targetVitals: {
        targetId: 'npc:7', displayName: 'Horse', health: 80, maxHealth: 100,
        portrait: { kind: 'npc', npcKind: 'horse', species: 'horse', variant: 0 },
      },
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    expect(ui.pointerDown({ x: layout.vitals.x + 2, y: layout.vitals.y + 2 }, 0)).toBe(true);
    expect(ui.pointerDown({ x: layout.targetVitals.x + 2, y: layout.targetVitals.y + 2 }, 0)).toBe(true);
  });

  it('reserves explicit bottom padding as the online roster grows', () => {
    expect(onlinePlayerListFrameHeight(1) - onlinePlayerListFrameHeight(0)).toBe(12);
    expect(onlinePlayerListFrameHeight(3) - (29 + 3 * 12)).toBe(ONLINE_PLAYER_LIST_BOTTOM_PADDING);
  });

  it('keeps stack counts above and inside the slot bevel', () => {
    expect(slotStackLabelPosition({ x: 40, y: 70, width: 28, height: 31 }))
      .toEqual({ x: 63, y: 87 });
  });

  it('places the selected and hovered hotbar reticle outside the slot labels', () => {
    expect(hotbarReticleRect({ x: 40, y: 70, width: 28, height: 31 }))
      .toEqual({ x: 24, y: 56, width: 60, height: 60 });
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

  it('fits chest storage beside the player backpack without overlapping', () => {
    const layout = overworldUiLayout(480, 270);
    const chestRight = Math.max(...layout.chestSlots.map((slot) => slot.x + slot.width));
    const backpackLeft = Math.min(...layout.chestBackpackSlots.map((slot) => slot.x));
    expect(layout.chestSlots).toHaveLength(CHEST_STORAGE_CAPACITY);
    expect(layout.chestBackpackSlots).toHaveLength(20);
    expect(new Set(layout.chestSlots.map((slot) => slot.x)).size).toBe(CHEST_STORAGE_COLUMNS);
    expect(new Set(layout.chestSlots.map((slot) => slot.y)).size).toBe(CHEST_STORAGE_ROWS);
    expect(layout.chestWindow.width).toBeLessThan(layout.inventoryWindow.width);
    expect(Math.min(...layout.chestSlots.map((slot) => slot.x))).toBeGreaterThanOrEqual(layout.chestWindow.x + 17);
    expect(chestRight).toBeLessThanOrEqual(backpackLeft);
    for (const slot of [...layout.chestSlots, ...layout.chestBackpackSlots, ...layout.chestHotbarSlots]) {
      expect(slot.x).toBeGreaterThanOrEqual(layout.chestWindow.x);
      expect(slot.x + slot.width).toBeLessThanOrEqual(layout.chestWindow.x + layout.chestWindow.width);
    }
  });

  it('moves items directly between the visible backpack and an open chest', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 9, itemKind: 'wood', quantity: 3 }],
      openChestInventory: [], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const source = layout.chestBackpackSlots[0]!;
    const target = layout.chestSlots.at(-1)!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0);
    ui.pointerMove({ x: target.x + 4, y: target.y + 4 });
    ui.pointerUp({ x: target.x + 4, y: target.y + 4 }, 0);
    expect(handlers.moveInventoryItem).toHaveBeenCalledWith({
      fromContainer: 'backpack', fromIndex: 0, toContainer: 'chest', toIndex: CHEST_STORAGE_CAPACITY - 1, quantity: 3,
    });
  });

  it('resizes the composed chest frame from a corner without moving the opposite corner', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'chest';
    ui.update({
      width: 640, height: 400, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], openChestInventory: [], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const original = overworldUiLayout(640, 400).chestStorageFrame;
    const handle = original.resizeHandles.south_east;
    const point = { x: handle.x + 4, y: handle.y + 4 };
    expect(ui.pointerDown(point, 0)).toBe(true);
    ui.pointerMove({ x: point.x + 30, y: point.y + 20 });
    expect(ui.pointerUp({ x: point.x + 30, y: point.y + 20 }, 0)).toBe(true);
    const resized = (ui as unknown as { layout: OverworldUiLayout }).layout.chestStorageFrame.frame;
    expect(resized).toEqual({
      x: original.frame.x,
      y: original.frame.y,
      width: original.frame.width + 30,
      height: original.frame.height + 20,
    });
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

  it('persists independent background playback choices from the settings window', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
      audioBackground: { music: false, sounds: true },
      canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'settings';
    const layout = overworldUiLayout(480, 270);
    expect(ui.pointerDown({
      x: layout.musicBackgroundToggle.x + 4, y: layout.musicBackgroundToggle.y + 4,
    }, 0)).toBe(true);
    expect(ui.pointerDown({
      x: layout.soundsBackgroundToggle.x + 4, y: layout.soundsBackgroundToggle.y + 4,
    }, 0)).toBe(true);
    expect(handlers.setAudioBackground).toHaveBeenNthCalledWith(1, 'music', true);
    expect(handlers.setAudioBackground).toHaveBeenNthCalledWith(2, 'sounds', false);
    expect(layout.musicBackgroundToggle.y + layout.musicBackgroundToggle.height)
      .toBeLessThan(layout.soundsBackgroundToggle.y);
    expect(layout.soundsBackgroundToggle.y + layout.soundsBackgroundToggle.height)
      .toBeLessThan(layout.settingsBackButton.y);
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
    const source = overworldUiLayout(480, 270).chestHotbarSlots[0]!;
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

  it('locks a workbench result at range and unlocks it beside the station', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    const inventory = Array.from({ length: 9 }, (_, index) => ({
      slot: 38 + index,
      itemKind: index === 4 ? 'empty' : 'plank',
      quantity: index === 4 ? 0 : 1,
    }));
    const model = {
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update({ ...model, nearbyCraftingStations: [] });
    const result = overworldUiLayout(480, 270).craftingResult;
    ui.pointerMove({ x: result.x + 4, y: result.y + 4 });
    expect(ui.tooltipText()).toBe('REQUIRES A WORKBENCH WITHIN 2 TILES');
    ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, {});
    expect(handlers.craftInventoryRecipe).not.toHaveBeenCalled();

    ui.update({ ...model, nearbyCraftingStations: ['workbench'] });
    ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, {});
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('chest', false);
  });

  it('clicks a visible recipe-book row to request ghost fill', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'plank', quantity: 4 }], hasBackpack: false,
      nearbyCraftingStations: [],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const workbenchRow = overworldUiLayout(480, 270).craftingRecipeRows[4]!;
    ui.pointerDown({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    expect(handlers.ghostFillCraftingRecipe).toHaveBeenCalledWith('workbench');
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
