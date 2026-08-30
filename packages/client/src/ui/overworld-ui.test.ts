import { describe, expect, it, vi } from 'vitest';
import { BACKPACK_SLOT_COUNT, CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, CHEST_STORAGE_ROWS, EQUIPMENT_SLOT_COUNT, HOTBAR_SLOT_COUNT } from '@orchard/sim';
import type { PixelUi } from '../render/pixel-ui.js';
import {
  DEVELOPER_TABS,
  ONLINE_PLAYER_LIST_BOTTOM_PADDING,
  ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES,
  OverworldUi,
  SETTINGS_TABS,
  SYSTEM_MENU_TITLE,
  onlinePlayerIdleMinutes,
  onlinePlayerListLabel,
  nextHomesteadMemberRole,
  onlinePlayerListCloseButtonRect,
  onlinePlayerListFrameHeight,
  offlineNameplateFrameAt,
  overworldUiLayout,
  pwaUpdatePromptLayout,
  processorCountdownLabel,
  hotbarReticleRect,
  isInterfaceVisibilityToggle,
  itemIconAnimation,
  nameplateRect,
  slotStackLabelPosition,
  slotDurabilityBarRect,
  type OverworldUiCallbacks,
  type OverworldUiItemArt,
  type OverworldUiLayout,
} from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import { RIBBON_TEXT_TOP_OFFSET, ribbonWidth } from './ribbon.js';

describe('homestead member role controls', () => {
  it('cycles invite roles before returning to revoked', () => {
    expect([null, 'guest', 'worker', 'builder'].map((role) => nextHomesteadMemberRole(
      role as null | 'guest' | 'worker' | 'builder',
    ))).toEqual(['guest', 'worker', 'builder', null]);
  });
});

function callbacks(): OverworldUiCallbacks {
  return {
    selectHotbar: vi.fn(),
    setTimeFraction: vi.fn(),
    shiftDay: vi.fn(),
    cycleWeather: vi.fn(),
    cycleWindDirection: vi.fn(),
    toggleLightingEffects: vi.fn(),
    toggleCellarOrePreview: vi.fn(),
    resetMyQuestProgress: vi.fn(),
    setQuestPinned: vi.fn(),
    abandonQuest: vi.fn(),
    setAppearance: vi.fn(),
    purchaseSkillNode: vi.fn(),
    resetSkillTree: vi.fn(),
    grantDebugSkillPoints: vi.fn(),
    setAudioVolume: vi.fn(),
    setAudioBackground: vi.fn(),
    setNameplatesVisible: vi.fn(),
    setLightingModel: vi.fn(),
    signOut: vi.fn(),
    quitToTitle: vi.fn(),
    toggleFullscreen: vi.fn(),
    checkForClientUpdate: vi.fn(),
    applyClientUpdate: vi.fn(),
    toggleOnlinePlayers: vi.fn(),
    moveInventoryItem: vi.fn(),
    quickMoveInventoryItem: vi.fn(),
    quickMoveAllInventoryItems: vi.fn(),
    distributeInventoryItem: vi.fn(),
    inventoryCursorClick: vi.fn(),
    sortInventoryContainer: vi.fn(),
    inventoryCursorQuickCraft: vi.fn(),
    inventoryCursorPickupAll: vi.fn(),
    inventoryCursorSwapHotbar: vi.fn(),
    dropInventoryCursor: vi.fn(),
    throwMenuItem: vi.fn(),
    returnInventoryCursor: vi.fn(),
    craftInventoryRecipe: vi.fn(),
    ghostFillCraftingRecipe: vi.fn(),
    closeCrafting: vi.fn(),
    closeChest: vi.fn(),
    closePlaceable: vi.fn(),
  };
}

describe('overworld retained UI layout', () => {
  it('marks players idle only after ten complete minutes and formats the roster suffix', () => {
    const nowMillis = 1_000_000;
    const nowMicros = BigInt(nowMillis) * 1_000n;
    const thresholdMicros = BigInt(ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES) * 60_000_000n;
    expect(onlinePlayerIdleMinutes(nowMicros - thresholdMicros, nowMillis)).toBeNull();
    expect(onlinePlayerIdleMinutes(nowMicros - thresholdMicros - 1n, nowMillis)).toBe(10);
    expect(onlinePlayerIdleMinutes(nowMicros - 12n * 60_000_000n, nowMillis)).toBe(12);
    expect(onlinePlayerIdleMinutes(0n, nowMillis)).toBeNull();
    expect(onlinePlayerListLabel({ displayName: 'Toby', self: false, idleMinutes: 12 }))
      .toBe('Toby  (idle 12 min)');
    expect(onlinePlayerListLabel({ displayName: 'Toby', self: true, idleMinutes: 12 }))
      .toBe('Toby  (YOU)  (idle 12 min)');
  });

  it('uses Z as a non-repeating full-interface toggle', () => {
    expect(isInterfaceVisibilityToggle('KeyZ', false)).toBe(true);
    expect(isInterfaceVisibilityToggle('KeyZ', true)).toBe(false);
    expect(isInterfaceVisibilityToggle('KeyX', false)).toBe(false);
    expect(isInterfaceVisibilityToggle('KeyZ', false, true)).toBe(false);
  });

  it('deep-links P to Character, K to Skills, and L to the Quest Log', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    expect(ui.handleKeyDown('KeyP', false)).toBe(true);
    expect(ui.openWindow).toBe('character');
    expect(ui.handleKeyDown('KeyP', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
    expect(ui.handleKeyDown('KeyK', false)).toBe(true);
    expect(ui.openWindow).toBe('skills');
    expect(ui.handleKeyDown('KeyL', false)).toBe(true);
    expect(ui.openWindow).toBe('quests');
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
  });

  it('uses the authored closed chest animation for chest slot icons', () => {
    expect(itemIconAnimation('chest')).toBe('chest');
    expect(itemIconAnimation('barrel')).toBe('closed');
    expect(itemIconAnimation('furnace')).toBe('off');
    expect(itemIconAnimation('wood')).toBe('base');
  });

  it('separates stacked furnace inputs from a centred output and vertical meter', () => {
    for (const width of [360, 480]) {
      const layout = overworldUiLayout(width, 270);
      expect(layout.furnaceSlots).toHaveLength(3);
      expect(layout.furnaceSlots[0]!.x).toBe(layout.furnaceSlots[1]!.x);
      expect(layout.furnaceSlots[0]!.y).toBeLessThan(layout.furnaceSlots[1]!.y);
      expect(layout.furnaceSlots[2]!.x).toBeGreaterThan(
        layout.furnaceSlots[0]!.x + layout.furnaceSlots[0]!.width,
      );
      expect(layout.furnaceSlots[2]!.y + layout.furnaceSlots[2]!.height / 2).toBe(
        (layout.furnaceSlots[0]!.y + layout.furnaceSlots[0]!.height / 2
          + layout.furnaceSlots[1]!.y + layout.furnaceSlots[1]!.height / 2) / 2,
      );
      expect(layout.furnaceProgress.x).toBeGreaterThan(
        layout.furnaceSlots[2]!.x + layout.furnaceSlots[2]!.width,
      );
      expect(layout.furnaceProgress.height).toBe(
        layout.furnaceSlots[1]!.y + layout.furnaceSlots[1]!.height - layout.furnaceSlots[0]!.y,
      );
      expect(layout.furnaceTimer.y).toBeGreaterThanOrEqual(
        layout.furnaceProgress.y + layout.furnaceProgress.height,
      );
      expect(layout.furnaceProgress.x + layout.furnaceProgress.width)
        .toBeLessThanOrEqual(layout.backpackSlots[0]!.x);
      expect(layout.furnaceStatus.x + layout.furnaceStatus.width)
        .toBeLessThanOrEqual(layout.backpackSlots[0]!.x);
      expect(layout.furnaceStatus.y + layout.furnaceStatus.height)
        .toBeLessThan(layout.inventoryHotbarSlots[0]!.y);
    }
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'furnace';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], openPlaceableInventory: [
        { slot: 0, itemKind: 'iron_ore', quantity: 1 },
        { slot: 1, itemKind: 'wood', quantity: 1 },
      ], furnaceProgress: 0.5, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const internal = ui as unknown as {
      furnaceItemSlots: readonly { readonly item: { readonly itemKind: string } | null; readonly visible: boolean }[];
      backpackItemSlots: readonly { readonly visible: boolean }[];
    };
    expect(internal.furnaceItemSlots.map((slot) => slot.item?.itemKind ?? null))
      .toEqual(['iron_ore', 'wood', null]);
    expect(internal.furnaceItemSlots.every((slot) => slot.visible)).toBe(true);
    expect(internal.backpackItemSlots.some((slot) => slot.visible)).toBe(true);
  });

  it('stacks cooking slots beside a three-slot vertical meter without entering the backpack pane', () => {
    for (const width of [360, 480]) {
      const layout = overworldUiLayout(width, 270);
      expect(layout.cookingSlots).toHaveLength(2);
      expect(layout.cookingSlots[0]!.x).toBe(layout.cookingSlots[1]!.x);
      expect(layout.cookingSlots[1]!.y - (layout.cookingSlots[0]!.y + layout.cookingSlots[0]!.height))
        .toBe(layout.cookingSlots[0]!.height);
      expect(layout.cookingProgress.x).toBeGreaterThan(
        layout.cookingSlots[0]!.x + layout.cookingSlots[0]!.width,
      );
      expect(layout.cookingProgress.height).toBe(layout.cookingSlots[0]!.height * 3);
      const processorLeft = layout.inventoryWindow.x + 18;
      const processorRight = layout.backpackSlots[0]!.x - 10;
      expect(Math.abs(
        (layout.cookingSlots[0]!.x - processorLeft)
        - (processorRight - (layout.cookingProgress.x + layout.cookingProgress.width)),
      )).toBeLessThanOrEqual(1);
      expect(layout.cookingTimer.y).toBeGreaterThanOrEqual(
        layout.cookingProgress.y + layout.cookingProgress.height,
      );
      expect(layout.cookingProgress.x + layout.cookingProgress.width)
        .toBeLessThanOrEqual(layout.backpackSlots[0]!.x);
      expect(layout.processorStatus.x + layout.processorStatus.width)
        .toBeLessThanOrEqual(layout.backpackSlots[0]!.x);
    }
    expect(processorCountdownLabel(0)).toBe('0:00');
    expect(processorCountdownLabel(65.1)).toBe('1:06');
    expect(processorCountdownLabel(3_661)).toBe('1:01:01');
  });

  it('closes an authority-owned furnace when its window is dismissed', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'furnace';
    ui.openWindow = null;
    expect(handlers.closePlaceable).toHaveBeenCalledOnce();
    expect(ui.openWindow).toBeNull();
  });

  it('anchors the zone ribbon, currency, hotbar, and window at 480x270', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.status).toEqual({ x: 4, y: 2, width: 220, height: 34 });
    expect(layout.currency).toEqual({ x: 380, y: 238, width: 94, height: 26 });
    expect(layout.previousDayButton).toMatchObject({ width: 58, height: 20 });
    expect(layout.nextDayButton).toMatchObject({ width: 58, height: 20 });
    expect(layout.weatherButton.height).toBe(22);
    expect(layout.windDirectionButton).toMatchObject({ height: 22 });
    expect(layout.windDirectionButton.y + layout.windDirectionButton.height).toBeLessThan(layout.developerWindow.y + layout.developerWindow.height);
    expect(layout.hotbar.x).toBe(90);
    expect(layout.hotbar.y + layout.hotbar.height).toBe(264);
    expect(layout.vitals).toEqual({ x: 90, y: 200, width: 72, height: 29 });
    expect(layout.targetVitals).toEqual({ x: 318, y: 200, width: 72, height: 29 });
    expect(layout.vitals.x).toBe(layout.hotbar.x);
    expect(layout.targetVitals.x + layout.targetVitals.width).toBe(layout.hotbar.x + layout.hotbar.width);
    expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
    expect(layout.tooltip.height).toBe(16);
    expect(layout.notification.y + layout.notification.height).toBeLessThan(layout.tooltip.y);
    expect(layout.window.x).toBe(105);
    expect(layout.window.y).toBe(43);
    expect(layout.onlinePlayersButton.x + layout.onlinePlayersButton.width)
      .toBeLessThanOrEqual(layout.status.x + layout.status.width - 28);
    expect(layout.collapsedZoneTab).toEqual({ x: 0, y: 4, width: 32, height: 16 });
    expect(layout.systemWindow.width).toBe(190);
    expect(layout.systemWindow.height).toBe(195);
    expect(layout.settingsButton.width).toBe(layout.resumeButton.width);
    const systemButtons = [
      layout.resumeButton, layout.settingsButton, layout.helpButton,
      layout.fullscreenButton, layout.signOutButton, layout.quitButton,
    ];
    expect(systemButtons.every((button) => button.x === systemButtons[0]!.x)).toBe(true);
    expect(systemButtons.every((button, index) => index === 0
      || button.y > systemButtons[index - 1]!.y + systemButtons[index - 1]!.height)).toBe(true);
    expect(systemButtons.every((button) => (
      button.y >= layout.systemWindow.y
      && button.y + button.height <= layout.systemWindow.y + layout.systemWindow.height
    ))).toBe(true);
    expect(layout.systemWindow.y + layout.systemWindow.height
      - (layout.quitButton.y + layout.quitButton.height)).toBe(18);
    expect(layout.developerButton.width).toBe(0);
    expect(layout.updateButton.width).toBe(0);
    expect(SYSTEM_MENU_TITLE).toBe('GAME MENU');
  });

  it('keeps the system menu content-sized on wide viewports', () => {
    expect(overworldUiLayout(960, 540).systemWindow.width).toBe(190);
    expect(overworldUiLayout(1_920, 1_080).systemWindow.width).toBe(190);
  });

  it('fits every privileged system action into the same vertical column', () => {
    const layout = overworldUiLayout(480, 270, {
      canAdministerWorld: true,
      pwaUpdateVisible: true,
    });
    const systemButtons = [
      layout.resumeButton, layout.settingsButton, layout.helpButton,
      layout.developerButton, layout.fullscreenButton, layout.updateButton,
      layout.signOutButton, layout.quitButton,
    ];
    expect(systemButtons.every((button) => button.width > 0)).toBe(true);
    expect(systemButtons.every((button) => button.x === systemButtons[0]!.x)).toBe(true);
    expect(systemButtons.every((button, index) => index === 0
      || button.y > systemButtons[index - 1]!.y + systemButtons[index - 1]!.height)).toBe(true);
    expect(systemButtons.at(-1)!.y + systemButtons.at(-1)!.height)
      .toBeLessThanOrEqual(layout.systemWindow.y + layout.systemWindow.height);
  });

  it.each([[480, 270], [360, 180]] as const)(
    'keeps tabbed settings and developer controls inside a %ix%i canvas',
    (width, height) => {
      const layout = overworldUiLayout(width, height);
      const inside = (outer: { x: number; y: number; width: number; height: number },
        inner: { x: number; y: number; width: number; height: number }): boolean => (
        inner.x >= outer.x && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
      );
      expect(inside(layout.settingsWindow, layout.settingsContent)).toBe(true);
      expect(inside(layout.settingsWindow, layout.settingsBackButton)).toBe(true);
      expect(SETTINGS_TABS.every((tab) => inside(layout.settingsWindow, layout.settingsTabs[tab]))).toBe(true);
      expect(inside(layout.settingsContent, layout.masterSlider)).toBe(true);
      expect(inside(layout.settingsContent, layout.musicSlider)).toBe(true);
      expect(inside(layout.settingsContent, layout.sfxSlider)).toBe(true);
      expect(inside(layout.settingsContent, layout.nameplatesToggle)).toBe(true);
      expect(inside(layout.developerWindow, layout.developerContent)).toBe(true);
      expect(inside(layout.developerWindow, layout.developerBackButton)).toBe(true);
      expect(DEVELOPER_TABS.every((tab) => inside(layout.developerWindow, layout.developerTabs[tab]))).toBe(true);
      expect(inside(layout.developerContent, layout.weatherButton)).toBe(true);
      expect(inside(layout.developerContent, layout.windDirectionButton)).toBe(true);
    },
  );

  it('keeps online-list and ribbon-collapse actions separate', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const online = layout.onlinePlayersButton;
    ui.pointerDown({ x: online.x + 4, y: online.y + 4 }, 0);
    expect(handlers.toggleOnlinePlayers).toHaveBeenCalledOnce();
    expect((ui as unknown as { zoneCollapsed: boolean }).zoneCollapsed).toBe(false);

    ui.pointerDown({ x: layout.status.x + 45, y: layout.status.y + 12 }, 0);
    expect((ui as unknown as { zoneCollapsed: boolean }).zoneCollapsed).toBe(true);
    ui.pointerDown({ x: layout.collapsedZoneTab.x + 5, y: layout.collapsedZoneTab.y + 5 }, 0);
    expect((ui as unknown as { zoneCollapsed: boolean }).zoneCollapsed).toBe(false);
  });

  it('collapses the minimap to a right-hand tab and supports independent zoom controls', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    expect(layout.collapsedMinimapTab).toEqual({ x: 448, y: 4, width: 32, height: 16 });
    ui.pointerDown({ x: layout.minimapZoomInButton.x + 4, y: layout.minimapZoomInButton.y + 4 }, 0);
    expect((ui as unknown as { minimapZoomIndex: number }).minimapZoomIndex).toBe(2);
    ui.pointerDown({ x: layout.minimap.x + 4, y: layout.minimap.y + 4 }, 0);
    expect((ui as unknown as { minimapCollapsed: boolean }).minimapCollapsed).toBe(true);
    ui.pointerDown({ x: layout.collapsedMinimapTab.x + 4, y: layout.collapsedMinimapTab.y + 4 }, 0);
    expect((ui as unknown as { minimapCollapsed: boolean }).minimapCollapsed).toBe(false);
  });

  it('provides tooltips for the global crafting, backpack, and online controls', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    ui.pointerMove({ x: layout.craftingButton.x + 5, y: layout.craftingButton.y + 5 });
    expect(ui.tooltipText()).toBe('CRAFTING');
    ui.pointerMove({ x: layout.currency.x + 5, y: layout.currency.y + 5 });
    expect(ui.tooltipText()).toBe('BACKPACK');
    ui.pointerMove({ x: layout.onlinePlayersButton.x + 5, y: layout.onlinePlayersButton.y + 5 });
    expect(ui.tooltipText()).toBe('ONLINE PLAYERS');
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

  it('routes a click on the 0-labelled final slot to hotbar index 9', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const slot = overworldUiLayout(480, 270).slots[HOTBAR_SLOT_COUNT - 1]!;
    expect(ui.pointerDown({ x: slot.x + 4, y: slot.y + 4 }, 0)).toBe(true);
    expect(handlers.selectHotbar).toHaveBeenCalledWith(HOTBAR_SLOT_COUNT - 1);
  });

  it('does not expose removed calendar or lunar details from the top ribbon', () => {
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
    const layout = overworldUiLayout(480, 270, { canAdministerWorld: true });
    expect(ui.pointerDown({ x: layout.windDirectionButton.x + 4, y: layout.windDirectionButton.y + 4 }, 0)).toBe(false);
    ui.openWindow = 'system';
    expect(ui.pointerDown({ x: layout.developerButton.x + 4, y: layout.developerButton.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('developer');
    const button = layout.windDirectionButton;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.cycleWindDirection).toHaveBeenCalledOnce();
    const renderTab = layout.developerTabs.render;
    expect(ui.pointerDown({ x: renderTab.x + 4, y: renderTab.y + 4 }, 0)).toBe(true);
    const lightingButton = layout.lightingEffectsButton;
    expect(ui.pointerDown({ x: lightingButton.x + 4, y: lightingButton.y + 4 }, 0)).toBe(true);
    expect(handlers.toggleLightingEffects).toHaveBeenCalledOnce();
    const orePreviewButton = layout.orePreviewButton;
    expect(ui.pointerDown({ x: orePreviewButton.x + 4, y: orePreviewButton.y + 4 }, 0)).toBe(true);
    expect(handlers.toggleCellarOrePreview).toHaveBeenCalledOnce();
    const questsTab = layout.developerTabs.quests;
    expect(ui.pointerDown({ x: questsTab.x + 4, y: questsTab.y + 4 }, 0)).toBe(true);
    const resetButton = layout.resetQuestsButton;
    expect(ui.pointerDown({ x: resetButton.x + 4, y: resetButton.y + 4 }, 0)).toBe(true);
    expect(handlers.resetMyQuestProgress).toHaveBeenCalledOnce();
    const playerTab = layout.developerTabs.player;
    expect(ui.pointerDown({ x: playerTab.x + 4, y: playerTab.y + 4 }, 0)).toBe(true);
    const explorerPoints = layout.skillPointButtons.explorer;
    expect(ui.pointerDown({ x: explorerPoints.x + 4, y: explorerPoints.y + 4 }, 0)).toBe(true);
    expect(handlers.grantDebugSkillPoints).toHaveBeenCalledWith('explorer', 1);
  });

  it('removes the developer action from the system menu without world authority', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 3, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'system';
    const layout = overworldUiLayout(480, 270);
    const internal = ui as unknown as { developerNode: { readonly visible: boolean } };
    expect(layout.developerButton.width).toBe(0);
    expect(internal.developerNode.visible).toBe(false);
    ui.pointerMove({
      x: layout.settingsButton.x + layout.settingsButton.width / 2,
      y: layout.settingsButton.y + layout.settingsButton.height / 2,
    });
    expect(ui.tooltipText()).toBe('SETTINGS');
  });

  it('keeps all anchored UI inside a narrow viewport', () => {
    const layout = overworldUiLayout(360, 180);
    for (const rect of [layout.status, layout.currency, layout.hotbar, layout.mobileMenuButton, layout.window, layout.closeButton]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(360);
      expect(rect.y + rect.height).toBeLessThanOrEqual(180);
    }
    expect(layout.slots).toHaveLength(10);
    expect(new Set(layout.slots.map((slot) => slot.y)).size).toBe(2);
    expect(layout.slots.filter((slot) => slot.y === layout.slots[0]!.y)).toHaveLength(5);
  });

  it('opens the Escape menu from the phone menu button', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 360, height: 180, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const button = overworldUiLayout(360, 180).mobileMenuButton;
    expect(button.y).toBe(4);
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('system');
  });

  it('shows the mobile Menu button on touch tablets above the phone breakpoint', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 600, height: 900, connected: true, touchControls: true,
      playerCount: 1, selectedSlot: 0, inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const button = overworldUiLayout(600, 900).mobileMenuButton;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('system');
  });

  it('places inventory currency at bottom-right and crafting beside the hotbar on every device', () => {
    const layout = overworldUiLayout(600, 900);
    expect(layout.currency).toEqual({ x: 482, y: 868, width: 112, height: 26 });
    expect(layout.craftingButton.x + layout.craftingButton.width)
      .toBeLessThanOrEqual(layout.hotbar.x);
    const touchLayout = overworldUiLayout(600, 900, { touchControls: true });
    expect(touchLayout.currency).toEqual(layout.currency);
    expect(touchLayout.craftingButton).toEqual(layout.craftingButton);
  });

  it('opens inventory from the purse and crafting from the shared desktop ghost tool button', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 600, height: 900, connected: true,
      playerCount: 1, selectedSlot: 0, inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(600, 900);
    expect(ui.pointerDown({ x: layout.currency.x + 4, y: layout.currency.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('inventory');
    ui.openWindow = null;
    expect(ui.pointerDown({
      x: layout.craftingButton.x + 4,
      y: layout.craftingButton.y + 4,
    }, 0)).toBe(true);
    expect(ui.openWindow).toBe('crafting');
  });

  it('offers a fullscreen toggle from the Escape menu', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, fullscreen: false, fullscreenAvailable: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'system';
    const layout = overworldUiLayout(480, 270);
    const button = layout.fullscreenButton;
    const internal = ui as unknown as {
      fullscreenNode: { readonly bounds: { readonly x: number; readonly width: number } };
      updateNode: { readonly visible: boolean };
    };
    expect(internal.updateNode.visible).toBe(false);
    expect(internal.fullscreenNode.bounds.x).toBe(layout.fullscreenButton.x);
    expect(internal.fullscreenNode.bounds.width).toBe(layout.fullscreenButton.width);
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it('disables fullscreen when the browser cannot preserve Escape as the menu key', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, fullscreen: true, fullscreenAvailable: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', pwaUpdateStatus: 'current', prompt: null, toast: null,
    });
    ui.openWindow = 'system';
    const button = overworldUiLayout(480, 270, { pwaUpdateVisible: true }).fullscreenButton;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.toggleFullscreen).not.toHaveBeenCalled();
  });

  it('checks for a client update and explicitly applies a waiting build', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const base = {
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update({ ...base, pwaUpdateStatus: 'current' });
    ui.openWindow = 'system';
    const button = overworldUiLayout(480, 270, { pwaUpdateVisible: true }).updateButton;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.checkForClientUpdate).toHaveBeenCalledOnce();

    ui.update({ ...base, pwaUpdateStatus: 'available' });
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.blockingUpdatePromptVisible).toBe(false);
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(handlers.applyClientUpdate).toHaveBeenCalledOnce();
  });

  it('opens a blocking in-game prompt when a new client build is ready', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const model = {
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
      pwaUpdateStatus: 'available' as const,
    };
    ui.update(model);
    expect(ui.blockingUpdatePromptVisible).toBe(true);

    const prompt = pwaUpdatePromptLayout(480, 270);
    expect(ui.pointerDown({
      x: prompt.refreshButton.x + 4,
      y: prompt.refreshButton.y + 4,
    }, 0)).toBe(true);
    expect(handlers.applyClientUpdate).toHaveBeenCalledOnce();

    const laterUi = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    laterUi.update(model);
    expect(laterUi.pointerDown({
      x: prompt.laterButton.x + 4,
      y: prompt.laterButton.y + 4,
    }, 0)).toBe(true);
    expect(laterUi.blockingUpdatePromptVisible).toBe(false);
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

  it('opens Character from the player resource frame while only capturing target-frame clicks', () => {
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
    expect(ui.openWindow).toBe('character');
    ui.openWindow = null;
    expect(ui.pointerDown({ x: layout.targetVitals.x + 2, y: layout.targetVitals.y + 2 }, 0)).toBe(true);
    expect(ui.openWindow).toBeNull();
  });

  it('reserves explicit bottom padding as the online roster grows', () => {
    expect(onlinePlayerListFrameHeight(1) - onlinePlayerListFrameHeight(0)).toBe(12);
    expect(onlinePlayerListFrameHeight(3) - (29 + 3 * 12)).toBe(ONLINE_PLAYER_LIST_BOTTOM_PADDING);
  });

  it('reserves an in-plate icon gutter and cycles the offline lightning frames', () => {
    expect(nameplateRect(100, 20, 'Dastari', true).width
      - nameplateRect(100, 20, 'Dastari').width).toBe(9);
    expect([0, 170, 340, 510, 680].map((elapsed) => (
      offlineNameplateFrameAt(elapsed, 4)
    ))).toEqual([0, 1, 2, 3, 0]);
  });

  it('places a close button inside the online-player frame and closes through the shared toggle', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const frame = { x: 125, y: 12, width: 230, height: 65 };
    const close = onlinePlayerListCloseButtonRect(frame);
    expect(close).toEqual({ x: 330, y: 20, width: 16, height: 16 });
    Object.assign(ui as unknown as Record<string, unknown>, {
      onlinePlayerListActive: true,
      onlinePlayerListRect: frame,
      onlinePlayerListCloseButton: close,
    });
    expect(ui.pointerDown({ x: close.x + 8, y: close.y + 8 }, 0)).toBe(true);
    expect(handlers.toggleOnlinePlayers).toHaveBeenCalledOnce();
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
    expect(layout.equipmentSlots).toHaveLength(EQUIPMENT_SLOT_COUNT);
    expect(layout.backpackSlots).toHaveLength(BACKPACK_SLOT_COUNT);
    expect(layout.inventoryHotbarSlots).toHaveLength(HOTBAR_SLOT_COUNT);
    for (const slot of [...layout.equipmentSlots, ...layout.backpackSlots, ...layout.inventoryHotbarSlots]) {
      expect(slot.x).toBeGreaterThanOrEqual(layout.inventoryWindow.x);
      expect(slot.x + slot.width).toBeLessThanOrEqual(layout.inventoryWindow.x + layout.inventoryWindow.width);
      expect(slot.y + slot.height).toBeLessThanOrEqual(layout.inventoryWindow.y + layout.inventoryWindow.height);
    }
    const inventoryBottom = layout.inventoryWindow.y + layout.inventoryWindow.height;
    expect(Math.max(...layout.inventoryHotbarSlots.map((slot) => slot.y + slot.height))).toBeLessThanOrEqual(inventoryBottom - 17);
  });

  it('keeps every modal hotbar centred when the compact HUD wraps to two rows', () => {
    for (const width of [360, 390, 419, 480]) {
      const layout = overworldUiLayout(width, 270);
      const inventoryLeft = Math.min(...layout.inventoryHotbarSlots.map((slot) => slot.x));
      const inventoryRight = Math.max(...layout.inventoryHotbarSlots.map((slot) => slot.x + slot.width));
      const chestLeft = Math.min(...layout.chestHotbarSlots.map((slot) => slot.x));
      const chestRight = Math.max(...layout.chestHotbarSlots.map((slot) => slot.x + slot.width));
      expect(Math.abs((inventoryLeft + inventoryRight) / 2 - width / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs((chestLeft + chestRight) / 2 - width / 2)).toBeLessThanOrEqual(0.5);
      expect(inventoryLeft).toBeGreaterThanOrEqual(layout.inventoryWindow.x);
      expect(inventoryRight).toBeLessThanOrEqual(layout.inventoryWindow.x + layout.inventoryWindow.width);
    }
  });

  it('places a wider scrollable recipe pane left of the crafting grid and searchable backpack', () => {
    for (const width of [360, 480, 600]) {
      const layout = overworldUiLayout(width, 300);
      const recipeRight = Math.max(...layout.craftingRecipeRows.map((row) => row.x + row.width));
      const gridLeft = Math.min(...layout.craftingSlots.map((slot) => slot.x));
      const resultRight = layout.craftingResult.x + layout.craftingResult.width;
      const backpackLeft = Math.min(...layout.craftingInventorySlots.map((slot) => slot.x));
      if (width >= 480) {
        expect(layout.craftingWindow.width).toBeGreaterThan(layout.inventoryWindow.width);
        expect(layout.craftingRecipeRows[0]!.width).toBeGreaterThanOrEqual(100);
      }
      expect(recipeRight).toBeLessThan(gridLeft);
      expect(resultRight).toBeLessThanOrEqual(backpackLeft);
      expect(layout.craftingRecipeScroll.x).toBeGreaterThan(recipeRight);
      expect(layout.craftingInventoryFilter.x).toBe(backpackLeft);
      expect(layout.craftingInventoryFilter.x + layout.craftingInventoryFilter.width)
        .toBeLessThanOrEqual(layout.craftingBackpackSortButton.x);
    }
  });

  it('swipe-scrolls compact backpack inventories without picking up a slot', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 360, height: 270, connected: true, touchControls: true,
      playerCount: 1, selectedSlot: 0,
      inventory: Array.from({ length: 20 }, (_, index) => ({
        slot: 10 + index, itemKind: 'wood', quantity: 1,
      })),
      hasBackpack: true, backpackSlotCapacity: 20,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(360, 270);
    const start = {
      x: layout.inventoryBackpackViewport.x + 10,
      y: layout.inventoryBackpackViewport.y + layout.inventoryBackpackViewport.height - 8,
    };
    ui.pointerDown(start, 0, { pointerType: 'touch' });
    ui.pointerMove({ x: start.x, y: start.y - 45 });
    expect(ui.pointerUp({ x: start.x, y: start.y - 45 }, 0)).toBe(true);
    const internal = ui as unknown as { inventoryScrollBar: { position: number } };
    expect(internal.inventoryScrollBar.position).toBe(1);
    expect(handlers.inventoryCursorClick).not.toHaveBeenCalled();
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

  it('right-aligns sort controls to each sortable storage header', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.inventorySortButton.x + layout.inventorySortButton.width)
      .toBe(Math.max(...layout.backpackSlots.map((slot) => slot.x + slot.width)));
    expect(layout.chestSortButton.x + layout.chestSortButton.width)
      .toBe(Math.max(...layout.chestSlots.map((slot) => slot.x + slot.width)));
    expect(layout.chestBackpackSortButton.x + layout.chestBackpackSortButton.width)
      .toBe(Math.max(...layout.chestBackpackSlots.map((slot) => slot.x + slot.width)));
    expect(layout.barrelSortButton.x + layout.barrelSortButton.width)
      .toBe(Math.max(...layout.barrelSlots.map((slot) => slot.x + slot.width)));
  });

  it('sorts only the real storage pane selected by its header control', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const update = (window: 'inventory' | 'chest' | 'barrel') => {
      ui.openWindow = window;
      ui.update({
        width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
        inventory: [], openChestInventory: [], openPlaceableInventory: [], hasBackpack: true,
        audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
        dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
        raining: false, weatherMode: 'auto', prompt: null, toast: null,
      });
    };
    const layout = overworldUiLayout(480, 270);
    update('inventory');
    ui.pointerDown({ x: layout.inventorySortButton.x + 8, y: layout.inventorySortButton.y + 8 }, 0);
    update('chest');
    ui.pointerDown({ x: layout.chestSortButton.x + 8, y: layout.chestSortButton.y + 8 }, 0);
    update('barrel');
    ui.pointerDown({ x: layout.barrelSortButton.x + 8, y: layout.barrelSortButton.y + 8 }, 0);
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(1, 'backpack');
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(2, 'chest');
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(3, 'placeable');
  });

  it('places touch inventory tooltips below the window hotbar', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, touchControls: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const tooltip = (ui as unknown as { touchInventoryTooltipRect(): { y: number } }).touchInventoryTooltipRect();
    expect(tooltip.y).toBeGreaterThan(Math.max(...layout.inventoryHotbarSlots.map((slot) => slot.y + slot.height)));
  });

  it('keeps a held stack anchored after Mobile Safari ends its touch pointer', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, touchControls: true,
      playerCount: 1, selectedSlot: 0, inventory: [],
      cursorStack: { itemKind: 'wood', quantity: 3 }, hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.pointerMove({ x: 120, y: 90 });
    ui.pointerLeave();
    expect((ui as unknown as { pointer: { x: number; y: number } }).pointer)
      .toEqual({ x: 120, y: 90 });
  });

  it('picks up from the visible backpack without placing on mouse release over a chest', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }],
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('backpack', 0, 'left');
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
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

  it('closes gameplay popups before Escape can open the system menu', () => {
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
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
  });

  it('closes an open chest on Escape without opening the system menu', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
    expect(handlers.closeChest).toHaveBeenCalledOnce();
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

  it('gives the system menu pointer priority after inventory is dismissed', () => {
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
    expect(ui.openWindow).toBeNull();
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
    const audioTab = layout.settingsTabs.audio;
    expect(ui.pointerDown({ x: audioTab.x + 4, y: audioTab.y + 4 }, 0)).toBe(true);
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

  it('uses the gameplay tab to control persisted nameplate visibility on touch devices', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
      nameplatesVisible: false,
      canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'settings';
    expect(ui.selectedSettingsTab).toBe('gameplay');
    const toggle = overworldUiLayout(480, 270).nameplatesToggle;
    expect(ui.pointerDown({ x: toggle.x + 4, y: toggle.y + 4 }, 0)).toBe(true);
    expect(handlers.setNameplatesVisible).toHaveBeenCalledWith(true);
    expect(ui.handleKeyDown('KeyN', false)).toBe(true);
    expect(handlers.setNameplatesVisible).toHaveBeenLastCalledWith(false);
    expect(ui.handleKeyDown('ArrowDown', false)).toBe(true);
    expect(ui.selectedSettingsTab).toBe('controls');
  });

  it('switches between the classic and unified lighting models from Video settings', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, lightingModel: 'unified',
      canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.openWindow = 'settings';
    const layout = overworldUiLayout(480, 270);
    expect(ui.pointerDown({
      x: layout.settingsTabs.video.x + 4,
      y: layout.settingsTabs.video.y + 4,
    }, 0)).toBe(true);
    expect(ui.pointerDown({
      x: layout.lightingModelButton.x + 4,
      y: layout.lightingModelButton.y + 4,
    }, 0)).toBe(true);
    expect(handlers.setLightingModel).toHaveBeenCalledWith('classic');
    expect(layout.lightingModelButton.y).toBeGreaterThanOrEqual(layout.settingsContent.y);
    expect(layout.lightingModelButton.y + layout.lightingModelButton.height)
      .toBeLessThanOrEqual(layout.settingsContent.y + layout.settingsContent.height);
  });

  it('mutes and restores each audio bus from its authored icon button', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const model = {
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
      canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update(model);
    ui.openWindow = 'settings';
    const layout = overworldUiLayout(480, 270);
    ui.pointerDown({ x: layout.settingsTabs.audio.x + 4, y: layout.settingsTabs.audio.y + 4 }, 0);
    ui.pointerDown({ x: layout.audioMuteButtons.master.x + 4, y: layout.audioMuteButtons.master.y + 4 }, 0);
    expect(handlers.setAudioVolume).toHaveBeenLastCalledWith('master', 0);
    ui.update({ ...model, audioVolumes: { ...model.audioVolumes, master: 0 } });
    ui.pointerDown({ x: layout.audioMuteButtons.master.x + 4, y: layout.audioMuteButtons.master.y + 4 }, 0);
    expect(handlers.setAudioVolume).toHaveBeenLastCalledWith('master', 0.8);
  });

  it('does not place a picked-up item merely by releasing over equipment', () => {
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
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
    expect(handlers.inventoryCursorClick).toHaveBeenNthCalledWith(1, 'hotbar', 0, 'right');
    expect(handlers.inventoryCursorClick).toHaveBeenNthCalledWith(2, 'crafting', 0, 'left');
  });

  it('treats persisted empty rows as vacant drag targets', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [
        { slot: 0, itemKind: 'wood', quantity: 36 },
        { slot: 42, itemKind: 'empty', quantity: 0 },
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
  });

  it('shows item-name tooltips for inventory slots and the crafting result', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }, { slot: 42, itemKind: 'wood', quantity: 1 }],
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

  it('uses number keys to swap hovered slots and Q / Control-Q to throw stacks', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 10, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const slot = overworldUiLayout(480, 270).backpackSlots[0]!;
    ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 });
    expect(ui.handleKeyDown('Digit3', false)).toBe(true);
    expect(handlers.inventoryCursorSwapHotbar).toHaveBeenCalledWith('backpack', 0, 2);
    expect(ui.handleKeyDown('KeyQ', false)).toBe(true);
    expect(handlers.throwMenuItem).toHaveBeenCalledWith('backpack', 0, false);
    ui.handleKeyDown('KeyQ', false, { ctrl: true });
    expect(handlers.throwMenuItem).toHaveBeenCalledWith('backpack', 0, true);
  });

  it('right-clicks outside to drop one item from the persistent cursor', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'wood', quantity: 8 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    expect(ui.pointerDown({ x: 2, y: 2 }, 2)).toBe(true);
    ui.pointerUp({ x: 2, y: 2 }, 2);
    expect(handlers.dropInventoryCursor).toHaveBeenCalledWith('right');
  });

  it('returns a carried item when released over blank space inside an inventory frame', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'wood', quantity: 8 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const frame = overworldUiLayout(480, 270).inventoryWindow;
    const blank = { x: frame.x + 8, y: frame.y + 30 };
    expect(ui.pointerDown(blank, 0)).toBe(true);
    ui.pointerUp(blank, 0);
    expect(handlers.returnInventoryCursor).toHaveBeenCalledOnce();
    expect(handlers.dropInventoryCursor).not.toHaveBeenCalled();
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

    expect(handlers.inventoryCursorClick).toHaveBeenNthCalledWith(1, 'hotbar', 0, 'left');
    expect(handlers.inventoryCursorClick).toHaveBeenNthCalledWith(2, 'crafting', 0, 'right');
    expect(handlers.inventoryCursorClick).toHaveBeenNthCalledWith(3, 'crafting', 1, 'left');
  });

  it('uses another click, rather than mouse release, to place a held stack', () => {
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('crafting', 0, 'left');
  });

  it('picks a slotted stack up as soon as a drag starts and keeps it held on release', () => {
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
    ui.pointerMove({ x: sourcePoint.x + 4, y: sourcePoint.y });
    const internal = ui as unknown as {
      optimisticMenuCursor: { readonly itemKind: string; readonly quantity: number } | null | undefined;
      inventoryHotbarSlots: readonly { readonly item: { readonly quantity: number } | null }[];
      craftingItemSlots: readonly { readonly item: { readonly quantity: number } | null }[];
    };
    expect(handlers.inventoryCursorClick).toHaveBeenCalledTimes(1);
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
    expect(internal.optimisticMenuCursor).toMatchObject({ itemKind: 'wood', quantity: 8 });
    expect(internal.inventoryHotbarSlots[0]?.item).toBeNull();

    ui.pointerMove(targetPoint);
    ui.pointerUp(targetPoint, 0);
    expect(handlers.inventoryCursorClick).toHaveBeenCalledTimes(1);
    expect(internal.optimisticMenuCursor).toMatchObject({ itemKind: 'wood', quantity: 8 });
    expect(internal.craftingItemSlots[0]?.item).toBeNull();
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

  it('shift-clicks and quick-crafts a held cursor stack without Shift', () => {
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

    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'wood', quantity: 8 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const first = layout.craftingSlots[0]!;
    ui.pointerDown({ x: first.x + 4, y: first.y + 4 }, 0);
    for (const slot of layout.craftingSlots.slice(1, 3)) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 });
    const last = layout.craftingSlots[2]!;
    ui.pointerUp({ x: last.x + 4, y: last.y + 4 }, 0);
    expect(handlers.inventoryCursorQuickCraft).toHaveBeenCalledWith([
      { container: 'crafting', index: 0 }, { container: 'crafting', index: 1 }, { container: 'crafting', index: 2 },
    ], 'even');
  });

  it('tracks every unique slot visited by a cursor quick-craft gesture', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 10 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const targets = layout.craftingSlots.slice(0, 3);
    const first = targets[0]!;
    ui.pointerDown({ x: first.x + 4, y: first.y + 4 }, 0);
    const initial = ui as unknown as {
      quickCraftOriginalCursor: { readonly quantity: number } | null;
      quickCraftPreviewCursor: { readonly quantity: number } | null | undefined;
      craftingItemSlots: readonly { readonly item: { readonly quantity: number } | null }[];
    };
    expect(initial.craftingItemSlots[0]?.item?.quantity).toBe(10);
    expect(initial.quickCraftOriginalCursor?.quantity).toBe(10);
    expect(initial.quickCraftPreviewCursor).toBeNull();
    for (const slot of targets.slice(1)) {
      ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 });
    }
    const internal = ui as unknown as {
      cursorPress: { readonly targets: readonly { readonly containerId: string; readonly index: number }[] } | null;
      quickCraftPreviewCursor: { readonly quantity: number } | null | undefined;
      craftingItemSlots: readonly { readonly item: { readonly quantity: number } | null }[];
    };
    expect(internal.cursorPress?.targets.map((slot) => [slot.containerId, slot.index])).toEqual([
      ['crafting', 0], ['crafting', 1], ['crafting', 2],
    ]);
    expect(internal.craftingItemSlots.slice(0, 3).map((slot) => slot.item?.quantity)).toEqual([3, 3, 3]);
    expect(internal.quickCraftPreviewCursor?.quantity).toBe(1);
  });

  it('predicts cursor pickup immediately, ignores empty-to-empty clicks, and rolls back a rejected authority call', async () => {
    const rejectedClick = vi.fn(() => Promise.reject(new Error('authority_rejected')));
    const handlers = { ...callbacks(), inventoryCursorClick: rejectedClick };
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'inventory';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const slot = overworldUiLayout(480, 270).inventoryHotbarSlots[0]!;
    const point = { x: slot.x + 4, y: slot.y + 4 };
    ui.pointerDown(point, 0);
    ui.pointerUp(point, 0);
    const internal = ui as unknown as {
      optimisticMenuCursor: { readonly itemKind: string; readonly quantity: number } | null | undefined;
      inventoryHotbarSlots: readonly { readonly item: { readonly quantity: number } | null }[];
    };
    expect(internal.optimisticMenuCursor).toMatchObject({ itemKind: 'wood', quantity: 8 });
    expect(internal.inventoryHotbarSlots[0]?.item).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(internal.optimisticMenuCursor).toBeUndefined();
    expect(internal.inventoryHotbarSlots[0]?.item?.quantity).toBe(8);

    rejectedClick.mockClear();
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: null, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    ui.pointerDown(point, 0);
    ui.pointerUp(point, 0);
    expect(rejectedClick).not.toHaveBeenCalled();
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
    const hotbar = overworldUiLayout(480, 270).chestHotbarSlots;
    const firstPoint = { x: hotbar[0]!.x + 4, y: hotbar[0]!.y + 4 };
    ui.pointerDown(firstPoint, 0, { shift: true });
    ui.pointerUp(firstPoint, 0, { shift: true });
    now.mockReturnValue(300);
    const secondPoint = { x: hotbar[1]!.x + 4, y: hotbar[1]!.y + 4 };
    ui.pointerDown(secondPoint, 0, { shift: true });
    ui.pointerUp(secondPoint, 0, { shift: true });
    expect(handlers.quickMoveAllInventoryItems).toHaveBeenCalledWith('wood', ['hotbar', 'backpack'], ['chest']);
    now.mockRestore();
  });

  it('finishes a held-stack shift-double-click after the first click empties the underlying slot', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    const common = {
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      cursorStack: { itemKind: 'stone', quantity: 5 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update({
      ...common,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }, { slot: 1, itemKind: 'wood', quantity: 9 }],
      openChestInventory: [],
    });
    const slot = overworldUiLayout(480, 270).chestHotbarSlots[0]!;
    const point = { x: slot.x + 4, y: slot.y + 4 };

    ui.pointerDown(point, 0, { shift: true });
    ui.pointerUp(point, 0, { shift: true });
    expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 0, ['chest']);

    // Reproduce the authority update that made this intermittent: the first
    // clicked stack has already moved before the second click arrives.
    ui.update({
      ...common,
      inventory: [{ slot: 1, itemKind: 'wood', quantity: 9 }],
      openChestInventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }],
    });
    now.mockReturnValue(450);
    ui.pointerDown(point, 0, { shift: true });
    ui.pointerUp(point, 0, { shift: true });

    expect(handlers.quickMoveAllInventoryItems).toHaveBeenCalledWith(
      'wood', ['hotbar', 'backpack'], ['chest'],
    );
    now.mockRestore();
  });

  it('double-clicks a similar stack while carrying an item to transfer all matches to the other inventory', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'chest';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }, { slot: 1, itemKind: 'wood', quantity: 9 }],
      cursorStack: { itemKind: 'wood', quantity: 5 }, openChestInventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const hotbar = overworldUiLayout(480, 270).chestHotbarSlots;
    const firstPoint = { x: hotbar[0]!.x + 4, y: hotbar[0]!.y + 4 };
    const secondPoint = { x: hotbar[1]!.x + 4, y: hotbar[1]!.y + 4 };

    ui.pointerDown(firstPoint, 0);
    ui.pointerUp(firstPoint, 0);
    now.mockReturnValue(550);
    ui.pointerDown(secondPoint, 0);
    ui.pointerUp(secondPoint, 0);

    expect(handlers.quickMoveAllInventoryItems).toHaveBeenCalledWith(
      'wood', ['hotbar', 'backpack'], ['chest'],
    );
    expect(handlers.inventoryCursorPickupAll).not.toHaveBeenCalled();
    const internal = ui as unknown as {
      chestItemSlots: readonly { readonly item: { readonly itemKind: string; readonly quantity: number } | null }[];
    };
    expect(internal.chestItemSlots[0]?.item).toMatchObject({ itemKind: 'wood', quantity: 22 });
    now.mockRestore();
  });

  it('shift-clicks a recipe result to request a maximum-stack craft', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 39, itemKind: 'wood', quantity: 25 }], hasBackpack: false,
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
      slot: 39 + index,
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
      knownRecipeIds: ['planks', 'sticks', 'torch', 'campfire', 'workbench'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const workbenchRow = overworldUiLayout(480, 270).craftingRecipeRows[4]!;
    ui.pointerDown({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    expect(handlers.ghostFillCraftingRecipe).toHaveBeenCalledWith('workbench');
  });

  it('starts even distribution from an already-held cursor stack without Shift', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 10 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const targets = layout.craftingSlots.slice(0, 3);
    const first = targets[0]!;
    ui.pointerDown({ x: first.x + 4, y: first.y + 4 }, 0);
    for (const slot of targets.slice(1)) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 });
    const last = targets[2]!;
    ui.pointerUp({ x: last.x + 4, y: last.y + 4 }, 0);
    expect(handlers.inventoryCursorQuickCraft).toHaveBeenCalledWith([
      { container: 'crafting', index: 0 },
      { container: 'crafting', index: 1 },
      { container: 'crafting', index: 2 },
    ], 'even');
  });

  it('uses right-drag to place one cursor item in each visited slot', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 9 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = overworldUiLayout(480, 270);
    const targets = layout.craftingSlots.slice(0, 3);
    const first = targets[0]!;
    ui.pointerDown({ x: first.x + 4, y: first.y + 4 }, 2);
    for (const slot of targets.slice(1)) ui.pointerMove({ x: slot.x + 4, y: slot.y + 4 });
    const lastPoint = { x: targets[2]!.x + 4, y: targets[2]!.y + 4 };
    ui.pointerUp(lastPoint, 2);
    expect(handlers.inventoryCursorQuickCraft).toHaveBeenCalledWith([
      { container: 'crafting', index: 0 },
      { container: 'crafting', index: 1 },
      { container: 'crafting', index: 2 },
    ], 'one_each');
  });

  it('shows and permits dragging from the eight default inventory cells while crafting', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
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
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('backpack', 0, 'left');
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
