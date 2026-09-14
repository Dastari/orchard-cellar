import { gameHudLayout } from './game/hud-layout.js';
import { UI_SETTINGS_TABS } from './kit/components/settings.js';
import { UI_DEVELOPER_TABS } from './kit/components/developer.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { ui as kit } from './kit/components/index.js';
import type { UiElement } from './kit/runtime/element.js';
import { describe, expect, it, vi } from 'vitest';
import { UiRoot } from './kit/runtime/root.js';
import { bootstrapContentRows, buildContentRegistry, BACKPACK_SLOT_COUNT, CHEST_STORAGE_CAPACITY, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_OFFSET, HOTBAR_SLOT_COUNT } from '@orchard/sim';
import type { PixelUi } from './pixel-ui.js';
import {
  ONLINE_PLAYER_LIST_BOTTOM_PADDING,
  ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES,
  OverworldUi,
  onlinePlayerIdleMinutes,
  onlinePlayerListLabel,
  nextHomesteadMemberRole,
  onlinePlayerListFrameHeight,
  offlineNameplateFrameAt,
  processorCountdownLabel,
  hotbarReticleRect,
  hasEquippedWatch,
  isInterfaceVisibilityToggle,
  itemIconAnimation,
  nameplateRect,
  slotStackLabelPosition,
  slotDurabilityBarRect,
  watchStatusLabel,
  type OverworldUiCallbacks,
  type OverworldUiItemArt,
} from './game/index.js';
import type { UiSkin } from './skin.js';
import { RIBBON_TEXT_TOP_OFFSET, ribbonWidth } from './ribbon.js';

function kitControlNode(host: OverworldUi, id: string): UiElement {
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot; root.arrange();
  const walk = (node: UiElement): UiElement[] => [node, ...node.children.flatMap(walk)];
  const node = walk(root.tree).find(node => node.id === id)!;
  for (let parent = node.parent; parent; parent = parent.parent) {
    scrollUiElement(parent, parent.scroll.x, parent.scroll.y + node.rect.y - parent.contentRect.y); root.arrange();
  }
  return node;
}
function clickKitControl(host: OverworldUi, id: string): void {
  const rect = kitControlNode(host, id).clip;
  expect(rect.width).toBeGreaterThan(0); expect(rect.height).toBeGreaterThan(0);
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  host.pointerMove(point); expect(host.pointerDown(point, 0)).toBe(true); host.pointerUp(point, 0);
}

function packNode(host: OverworldUi, predicate: (node: UiElement) => boolean): UiElement {
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot; root.arrange();
  return root.entries().find(entry => predicate(entry.element))!.element;
}
function packSlotRect(host: OverworldUi, container: string, index: number) {
  return packNode(host, node => { const binding = node.props['binding'] as { container: string; index: number } | undefined;
    return node.kind === 'slot' && binding?.container === container && binding.index === index;
  }).clip;
}

function craftingTestLayout(host: OverworldUi) {
  const slots = (container: string, count: number) => Array.from({ length: count }, (_, index) => packSlotRect(host, container, index));
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot; root.arrange();
  return { craftingWindow: packNode(host, node => node.id === 'frame:crafting').rect, inventoryHotbarSlots: slots('hotbar',10), craftingSlots: slots('crafting',9),
    craftingInventorySlots: slots('backpack',8), craftingResult: packNode(host, node => node.label === 'Craft result').clip,
    craftingRecipeRows: root.entries().filter(entry => entry.element.kind === 'list-row').map(entry => entry.element.clip),
  };
}

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
    setQuestPinned: vi.fn(),
    abandonQuest: vi.fn(),
    setAppearance: vi.fn(),
    purchaseSkillNode: vi.fn(),
    resetSkillTree: vi.fn(),
    dismissSkillPointNotice: vi.fn(),
    setAudioVolume: vi.fn(),
    setAudioBackground: vi.fn(),
    setNameplatesVisible: vi.fn(),
    setLightingModel: vi.fn(),
    signOut: vi.fn(),
    quitToTitle: vi.fn(),
    startDelve: vi.fn(),
    exitDelve: vi.fn(),
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

  it('opens crafting from the keyboard-focused kit control and hides it behind the window', () => {
    const root = new UiRoot({ scale: 1 });
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks(),
      undefined, undefined, undefined, undefined, undefined, root);
    root.arrange();
    const control = root.entries().find(entry => entry.element.id === 'hud.crafting')!.element;
    expect(control.label).toBe('Crafting'); expect(control.rect).toEqual(control.clip);
    root.focus.set(control, 'keyboard');
    expect(ui.handleKeyDown('Enter', false)).toBe(true);
    expect(ui.openWindow).toBe('crafting'); expect(control.visible).toBe(false);
    ui.handleKeyDown('Escape', false); expect(control.visible).toBe(true); root.dispose();
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

  it('opens the notified skill tree when clicked and provides a separate dismiss target', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
      skillPointNotice: { track: 'farming', points: 1 },
    });
    const notice = ui.skillPointNoticeLayout()!;
    expect(ui.pointerDown({ x: notice.frame.x + 4, y: notice.frame.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('skills');
    expect(ui.activeSkillTrack).toBe('farming');
    expect(handlers.dismissSkillPointNotice).toHaveBeenCalledOnce();
    ui.pointerUp({ x: notice.frame.x + 4, y: notice.frame.y + 4 }, 0);

    ui.openWindow = null;
    vi.mocked(handlers.dismissSkillPointNotice!).mockClear();
    expect(ui.pointerDown({ x: notice.dismiss.x + 4, y: notice.dismiss.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBeNull();
    expect(handlers.dismissSkillPointNotice).toHaveBeenCalledOnce();
  });

  it('opens the notified tree with the existing K keyboard shortcut', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
      skillPointNotice: { track: 'combat', points: 1 },
    });
    expect(ui.handleKeyDown('KeyK', false)).toBe(true);
    expect(ui.openWindow).toBe('skills');
    expect(ui.activeSkillTrack).toBe('combat');
    expect(handlers.dismissSkillPointNotice).toHaveBeenCalledOnce();
  });

  it('switches the shared character frame between character, skills, and statistics tabs', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 800, height: 500, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
      statistics: { statistics: [] },
    });
    ui.openWindow = 'character';
    const stats = packNode(ui,node=>node.kind==='button'&&node.label==='STATISTICS').rect;
    const point={x:stats.x+4,y:stats.y+4};expect(ui.pointerDown(point,0)).toBe(true);ui.pointerUp(point,0);
    expect(ui.openWindow).toBe('statistics');
    expect(ui.handleKeyDown('KeyK', false)).toBe(true);
    expect(ui.openWindow).toBe('skills');
  });

  it('uses the authored closed chest animation for chest slot icons', () => {
    expect(itemIconAnimation('chest')).toBe('chest');
    expect(itemIconAnimation('barrel')).toBe('closed');
    expect(itemIconAnimation('furnace')).toBe('off');
    expect(itemIconAnimation('wood')).toBe('base');
  });

  it('binds furnace ingredients and output to the kit slots', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'furnace';
    ui.update({
      contentRegistry: buildContentRegistry(bootstrapContentRows()).registry, activeFrameId: 'frame:furnace',
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], openPlaceableInventory: [
        { slot: 0, itemKind: 'iron_ore', quantity: 1 },
        { slot: 1, itemKind: 'wood', quantity: 1 },
      ], furnaceProgress: 0.5, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const controller = ui.createInventoryController();
    expect([0, 1, 2].map(index => controller.model.stack({ container: 'placeable', index })?.itemKind ?? null))
      .toEqual(['iron_ore', 'wood', null]);
    for (const index of [0, 1, 2]) expect(packSlotRect(ui, 'placeable', index).width).toBe(28);
    expect(packSlotRect(ui, 'backpack', 0).width).toBe(28);
    controller.dispose();
  });

  it('keeps cooking ingredient and fuel slots separate at compact widths', () => {
    for (const width of [360, 480]) {
      const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
      const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
      host.update({ ...model, width, height: 270 }); host.openWindow = 'cooking';
      const input = packSlotRect(host, 'placeable', 0), fuel = packSlotRect(host, 'placeable', 1);
      for (const slot of [input, fuel]) expect({ width: slot.width, height: slot.height }).toEqual({ width: 28, height: 31 });
      expect(input.x + input.width <= fuel.x || fuel.x + fuel.width <= input.x
        || input.y + input.height <= fuel.y || fuel.y + fuel.height <= input.y).toBe(true);
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

  it('anchors the zone, purse, hotbar and vitals at 480x270', () => {
    const layout = gameHudLayout(480, 270);
    expect(layout.status).toEqual({ x: 4, y: 2, width: 220, height: 34 });
    expect(layout.watchStatus).toEqual({ x: 4, y: 38, width: 220, height: 18 });
    expect(layout.currency).toEqual({ x: 380, y: 238, width: 94, height: 26 });
    expect(layout.hotbar.x).toBe(76);
    expect(layout.hotbar.y + layout.hotbar.height).toBe(264);
    expect(layout.vitals).toEqual({ x: 76, y: 210, width: 48, height: 19 });
    expect(layout.targetVitals).toEqual({ x: 326, y: 210, width: 48, height: 19 });
    expect(layout.vitals.y + layout.vitals.height).toBe(layout.hotbar.y - 4);
    expect(layout.collapsedZoneTab).toEqual({ x: 0, y: 4, width: 32, height: 16 });
  });

  it('keeps the kit game menu compact on wide viewports', () => {
    for (const width of [960, 1920]) {
      const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
      const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
      host.update({ ...model, width, height: 540 }); host.openWindow = 'system';
      const frame = packNode(host, node => node.id === 'game.menu');
      expect(frame.rect.width).toBe(220);
      expect(frame.rect.x).toBe((width - frame.rect.width) / 2);
      expect(frame.rect.height).toBeLessThan(540);
    }
  });

  it('makes all nine privileged menu actions reachable in the kit scroll area', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    host.update({ ...model, width: 480, height: 270, canAdministerWorld: true, pwaUpdateStatus: 'current', delveActive: true });
    host.openWindow = 'system';
    const frame = packNode(host, node => node.id === 'game.menu').rect;
    for (const action of ['resume', 'settings', 'help', 'developer', 'fullscreen', 'update', 'exit-delve', 'sign-out', 'quit']) {
      const button = kitControlNode(host, `game-menu.${action}`);
      expect(button.clip.width).toBeGreaterThan(0);
      expect(button.clip.height).toBeGreaterThan(0);
      expect(button.clip.y).toBeGreaterThanOrEqual(frame.y);
      expect(button.clip.y + button.clip.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it.each([[480, 270], [360, 180]] as const)(
    'clips every settings and developer page within a %ix%i canvas', (width, height) => {
      const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
      const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
      host.update({ ...model, width, height, canAdministerWorld: true });
      const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
      for (const [surface, pages] of [['settings', UI_SETTINGS_TABS], ['developer', UI_DEVELOPER_TABS]] as const) {
        host.openWindow = surface;
        for (const page of pages) {
          const tab = packNode(host, node => node.kind === 'tab' && node.label === page.toUpperCase());
          root.focus.set(tab, 'keyboard'); root.arrange();
          expect(packNode(host, node => node.id === `${surface}.pages`).props['value']).toBe(page);
          for (const { element } of root.entries()) {
            if (!element.clip.width || !element.clip.height) continue;
            expect(element.clip.x).toBeGreaterThanOrEqual(0);
            expect(element.clip.y).toBeGreaterThanOrEqual(0);
            expect(element.clip.x + element.clip.width).toBeLessThanOrEqual(width);
            expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(height);
          }
        }
      }
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
    const layout = gameHudLayout(480, 270);
    const online = packNode(ui, node => node.id === 'hud.online-players').clip;
    ui.pointerDown({ x: online.x + 4, y: online.y + 4 }, 0);
    expect(handlers.toggleOnlinePlayers).toHaveBeenCalledOnce();
    ui.pointerUp({ x: online.x + 4, y: online.y + 4 }, 0);
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
    const layout = gameHudLayout(480, 270);
    const zoomIn = packNode(ui, node => node.id === 'hud.minimap.zoom-in').clip;
    expect(layout.collapsedMinimapTab).toEqual({ x: 448, y: 4, width: 32, height: 16 });
    ui.pointerDown({ x: zoomIn.x + 4, y: zoomIn.y + 4 }, 0);
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
    for (const [id, tooltip] of [['hud.crafting', 'CRAFTING'], ['hud.currency-inventory', 'BACKPACK'], ['hud.online-players', 'ONLINE PLAYERS']]) {
      const rect = packNode(ui, node => node.id === id).clip;
      ui.pointerMove({ x: rect.x + 5, y: rect.y + 5 });
      expect(ui.tooltipText()).toBe(tooltip);
    }
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

    const hotbar = packSlotRect(ui, 'hotbar', 0);
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
    const slot = packSlotRect(ui, 'hotbar', HOTBAR_SLOT_COUNT - 1);
    expect(ui.pointerDown({ x: slot.x + 4, y: slot.y + 4 }, 0)).toBe(true);
    expect(handlers.selectHotbar).toHaveBeenCalledWith(HOTBAR_SLOT_COUNT - 1);
  });

  it('reveals calendar and lunar details only for a watch worn in the ring slot', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 12', timeLabel: '14:35', timeFraction: 0.6,
      moonPhase: 'waxing_crescent', moonIlluminationPerMille: 250,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = gameHudLayout(480, 270);
    ui.pointerMove({ x: layout.watchStatus.x + 20, y: layout.watchStatus.y + 8 });
    expect(ui.tooltipText()).toBeNull();
    expect(hasEquippedWatch([{ slot: 0, itemKind: 'watch', quantity: 1 }])).toBe(false);

    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: EQUIPMENT_SLOT_OFFSET + 2, itemKind: 'watch', quantity: 1 }],
      hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 12', timeLabel: '14:35', timeFraction: 0.6,
      moonPhase: 'waxing_crescent', moonIlluminationPerMille: 250,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    expect(hasEquippedWatch([{ slot: EQUIPMENT_SLOT_OFFSET + 2, itemKind: 'watch', quantity: 1 }])).toBe(true);
    expect(ui.tooltipText()).toBe('TIME 14:35 · SPRING 12 · WAXING CRESCENT');
    expect(watchStatusLabel('14:35', 'SPRING 12', 'waxing_crescent'))
      .toBe('Time 14:35 · SPRING 12 · Waxing Crescent');
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
    expect((ui as unknown as { chromeRoot: UiRoot }).chromeRoot.entries().some(entry => entry.element.id === 'developer.wind')).toBe(false);
    expect(ui.pointerDown({ x: 240, y: 130 }, 0)).toBe(false);
    ui.openWindow = 'system';
    clickKitControl(ui, 'game-menu.developer');
    expect(ui.openWindow).toBe('developer');
    clickKitControl(ui, 'developer.wind');
    expect(handlers.cycleWindDirection).toHaveBeenCalledOnce();
    clickKitControl(ui, 'developer.pages:tab:render');
    clickKitControl(ui, 'developer.lighting-effects');
    expect(handlers.toggleLightingEffects).toHaveBeenCalledOnce();
    clickKitControl(ui, 'developer.ore-preview');
    expect(handlers.toggleCellarOrePreview).toHaveBeenCalledOnce();
    for (const tab of ['quests','player']) clickKitControl(ui, `developer.pages:tab:${tab}`);

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
    expect(kitControlNode(ui, 'game-menu.developer').visible).toBe(false);
    expect(kitControlNode(ui, 'game-menu.settings').props['label']).toBe('SETTINGS');
  });

  it('keeps the phone HUD clipped and its ten hotbar slots in two tight rows', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    host.update({ ...model, width: 360, height: 180 });
    const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
    for (const { element } of root.entries()) {
      if (!element.clip.width || !element.clip.height) continue;
      expect(element.clip.x).toBeGreaterThanOrEqual(0);
      expect(element.clip.y).toBeGreaterThanOrEqual(0);
      expect(element.clip.x + element.clip.width).toBeLessThanOrEqual(360);
      expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(180);
    }
    const slots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => packSlotRect(host, 'hotbar', index));
    expect(new Set(slots.map(slot => slot.y)).size).toBe(2);
    expect(slots.filter(slot => slot.y === slots[0]!.y)).toHaveLength(5);
    expect(slots[1]!.x - slots[0]!.x - slots[0]!.width).toBe(2);
    expect(slots[5]!.y - slots[0]!.y - slots[0]!.height).toBe(2);
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
    const button = packNode(ui, node => node.id === 'hud.mobile-menu').clip;
    expect(button.y).toBe(58);
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
    const button = packNode(ui, node => node.id === 'hud.mobile-menu').clip;
    expect(ui.pointerDown({ x: button.x + 4, y: button.y + 4 }, 0)).toBe(true);
    expect(ui.openWindow).toBe('system');
  });

  it('places inventory currency at bottom-right and crafting beside the hotbar on every device', () => {
    const layout = gameHudLayout(600, 900);
    expect(layout.currency).toEqual({ x: 482, y: 868, width: 112, height: 26 });
    expect(layout.craftingButton.x + layout.craftingButton.width)
      .toBeLessThanOrEqual(layout.hotbar.x);
    const touchLayout = gameHudLayout(600, 900);
    expect(touchLayout.currency).toEqual(layout.currency);
    expect(touchLayout.craftingButton).toEqual(layout.craftingButton);
  });

  it('opens inventory from the purse and crafting from the shared desktop kit tool button', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.update({
      width: 600, height: 900, connected: true,
      playerCount: 1, selectedSlot: 0, inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = gameHudLayout(600, 900);
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
    expect(kitControlNode(ui, 'game-menu.update').visible).toBe(false);
    clickKitControl(ui, 'game-menu.fullscreen');
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
    clickKitControl(ui, 'game-menu.fullscreen');
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
    clickKitControl(ui, 'game-menu.update');
    expect(handlers.checkForClientUpdate).toHaveBeenCalledOnce();

    ui.update({ ...base, pwaUpdateStatus: 'available' });
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.blockingUpdatePromptVisible).toBe(false);
    clickKitControl(ui, 'game-menu.update');
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

    const pressUpdate = (host: OverworldUi, id: string) => {
      const root = (host as unknown as { updateRoot: UiRoot }).updateRoot; root.arrange();
      const button = root.entries().find(entry => entry.element.id === id)!.element;
      root.focus.set(button); root.arrange();
      const point = { x: button.clip.x + button.clip.width / 2, y: button.clip.y + button.clip.height / 2 };
      expect(host.pointerDown(point, 0)).toBe(true); host.pointerUp(point, 0);
    };
    ui.openWindow = 'system';
    pressUpdate(ui, 'update-ready.refresh');
    expect(handlers.applyClientUpdate).toHaveBeenCalledOnce();
    const laterUi = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    laterUi.update(model); pressUpdate(laterUi, 'update-ready.later');
    expect(laterUi.blockingUpdatePromptVisible).toBe(false);
    laterUi.update(model); expect(laterUi.blockingUpdatePromptVisible).toBe(false);
    laterUi.update({...model,pwaUpdateStatus:'current'});laterUi.update(model);expect(laterUi.blockingUpdatePromptVisible).toBe(true);
    laterUi.handleKeyDown('Escape',false);expect(laterUi.blockingUpdatePromptVisible).toBe(false);

  });

  it('aligns smaller self and mirrored target frames to the hotbar edges at UI scales 1/2/3', () => {
    for (const [cssWidth, cssHeight, scale] of [[480, 270, 1], [1280, 720, 2], [1920, 1080, 3]] as const) {
      const layout = gameHudLayout(Math.floor(cssWidth / scale), Math.floor(cssHeight / scale));
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
    const layout = gameHudLayout(480, 270);
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

  it('closes the arranged online-player modal through the shared toggle', () => {
    const handlers = callbacks(), root = new UiRoot({ scale: 1 });
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers,
      undefined, undefined, undefined, undefined, undefined, root);
    const model = (ui as unknown as { model: Parameters<typeof ui.update>[0] }).model;
    ui.update({ ...model, onlinePlayersVisible: true, onlinePlayers: [{ displayName: 'Toby', self: true, idleMinutes: null }] });
    const modal = root.entries().find(entry => entry.element.id === 'hud.player-roster')!.element;
    const close = root.entries().find(entry => entry.element.kind === 'button' && entry.element.label === 'X' && entry.element.isDescendantOf(modal))!.element;
    expect(close.clip).toEqual(close.rect);
    const point = { x: close.rect.x + 8, y: close.rect.y + 8 };
    expect(ui.pointerDown(point, 0)).toBe(true); ui.pointerUp(point, 0);
    expect(handlers.toggleOnlinePlayers).toHaveBeenCalledOnce(); root.dispose();
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

  it('composes all equipment, expanded backpack and hotbar bindings inside the kit pack', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    host.update({ ...model, width: 480, height: 270, hasBackpack: true }); host.openWindow = 'inventory';
    const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
    const frame = packNode(host, node => node.id === 'frame:pack').rect;
    for (const [container, count] of [['equipment', EQUIPMENT_SLOTS.length], ['backpack', BACKPACK_SLOT_COUNT], ['hotbar', HOTBAR_SLOT_COUNT]] as const) {
      const slots = root.entries().filter(({ element }) => element.kind === 'slot' && (element.props['binding'] as {container: string}).container === container);
      expect(slots).toHaveLength(count);
      for (const { element } of slots) {
        expect({ width: element.rect.width, height: element.rect.height }).toEqual({ width: 28, height: 31 });
        if (!element.clip.width || !element.clip.height) continue;
        expect(element.clip.x).toBeGreaterThanOrEqual(frame.x);
        expect(element.clip.x + element.clip.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(frame.y + frame.height);
      }
    }
  });

  it('keeps modal hotbars native-sized with tight gaps when they wrap', () => {
    for (const width of [360, 390, 419, 480]) {
      const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
      const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
      host.update({ ...model, width, height: 270 });
      for (const surface of ['inventory', 'chest'] as const) {
        host.openWindow = surface;
        const slots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => packSlotRect(host, 'hotbar', index));
        for (const [index, slot] of slots.entries()) {
          expect(slot.width).toBe(28);
          if (index) {
            const previous = slots[index - 1]!;
            if (slot.y === previous.y) expect(slot.x - previous.x - previous.width).toBe(2);
            else expect(slot.y - previous.y - previous.height).toBe(2);
          }
        }
      }
    }
  });

  it('keeps recipe search, crafting and inventory search in separate kit panes', () => {
    for (const width of [360, 480, 600]) {
      const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
      const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
      host.update({ ...model, width, height: 300 }); host.openWindow = 'crafting';
      const recipe = packNode(host, node => node.label === 'Search recipes');
      const inventory = packNode(host, node => node.label === 'Filter items');
      expect(recipe).not.toBe(inventory);
      expect(recipe.rect.width).toBeGreaterThan(0); expect(inventory.rect.width).toBeGreaterThan(0);
      expect(recipe.rect.x + recipe.rect.width <= inventory.rect.x || inventory.rect.x + inventory.rect.width <= recipe.rect.x
        || recipe.rect.y + recipe.rect.height <= inventory.rect.y || inventory.rect.y + inventory.rect.height <= recipe.rect.y).toBe(true);
      expect(packNode(host, node => node.kind === 'inventory-grid' && node.props['container'] === 'crafting').children).toHaveLength(9);
    }
  });

  it('keeps crafting kit paint and hit rectangles aligned through viewport changes and reopen', () => {
    const contentRegistry = buildContentRegistry(bootstrapContentRows()).registry, handlers = callbacks();
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    for (const width of [360,480,600,480]) {
      host.update({ ...model, width, height: 300, contentRegistry, inventory: [{ slot: 39, itemKind: 'wood', quantity: 1 }], knownRecipeIds: ['planks'] });
      host.openWindow = 'inventory'; host.openWindow = 'crafting';
      const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
      const grid = packNode(host, node => node.kind === 'inventory-grid' && node.props['container'] === 'crafting');
      expect(grid.children).toHaveLength(9);
      const [first,second,,below] = grid.children;
      expect(first!.rect).toEqual(first!.clip);
      expect(second!.rect.x - first!.rect.x - first!.rect.width).toBe(2);
      expect(below!.rect.y - first!.rect.y - first!.rect.height).toBe(2);
      const point = { x: first!.rect.x + 4, y: first!.rect.y + 4 };
      expect(root.input.hits(point)).toContain(first);
      host.pointerDown(point,0); host.pointerUp(point,0);
      expect(handlers.inventoryCursorClick).toHaveBeenLastCalledWith('crafting',0,'left');
      const hotbar = root.entries().filter(({element}) => element.kind === 'slot' && (element.props['binding'] as {container?:string}|undefined)?.container === 'hotbar');
      expect(hotbar).toHaveLength(10); for (const {element} of hotbar) expect(element.clip).toEqual(element.rect);
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
    const scroll = packNode(ui, node => node.scroll.maxY > 0);
    const start = { x: scroll.clip.x + 10, y: scroll.clip.y + scroll.clip.height - 8 };
    ui.pointerDown(start, 0, { pointerType: 'touch' });
    ui.pointerMove({ x: start.x, y: start.y - 45 });
    expect(ui.pointerUp({ x: start.x, y: start.y - 45 }, 0)).toBe(true);
    expect(scroll.scroll.y).toBeGreaterThan(0);
    expect(handlers.inventoryCursorClick).not.toHaveBeenCalled();
  });

  it('keeps chest and backpack groups separate without dropping bindings', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    host.update({ ...model, width: 640, height: 400, hasBackpack: true }); host.openWindow = 'chest';
    const chest = packNode(host, node => node.kind === 'inventory-grid' && node.props['container'] === 'chest');
    const backpack = packNode(host, node => node.kind === 'inventory-grid' && node.props['container'] === 'backpack');
    expect(chest.children).toHaveLength(CHEST_STORAGE_CAPACITY);
    expect(backpack.children).toHaveLength(BACKPACK_SLOT_COUNT);
    expect(chest.rect.x + chest.rect.width <= backpack.rect.x || chest.rect.y + chest.rect.height <= backpack.rect.y).toBe(true);
    for (const group of [chest, backpack]) for (const cell of group.children) {
      expect({ width: cell.rect.width, height: cell.rect.height }).toEqual({ width: 28, height: 31 });
    }
  });

  it('places each storage sort control after its own search field', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
    host.update({ ...model, width: 640, height: 400, hasBackpack: true }); host.openWindow = 'chest';
    const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
    const sorts = root.entries().filter(({ element }) => element.label === 'Sort inventory').map(entry => entry.element);
    expect(sorts).toHaveLength(2);
    for (const sort of sorts) {
      const input = root.entries().find(({ element }) => element.kind === 'input' && element.label === 'Filter items' && element.isDescendantOf(sort.parent!))!.element;
      expect(input.rect.x + input.rect.width).toBeLessThanOrEqual(sort.rect.x);
      expect(sort.rect.x + sort.rect.width).toBeLessThanOrEqual(sort.parent!.contentRect.x + sort.parent!.contentRect.width);
    }
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
    update('inventory');
    const sort = packNode(ui, node => node.label === 'Sort inventory').rect;
    ui.pointerDown({ x: sort.x + 4, y: sort.y + 4 }, 0);
    ui.pointerUp({ x: sort.x + 4, y: sort.y + 4 }, 0);
    update('chest');
    const chestSort = packNode(ui, node => node.id === 'preview.frame:chest.pane.contents.sort').clip;
    ui.pointerDown({ x: chestSort.x + 4, y: chestSort.y + 4 }, 0);
    ui.pointerUp({ x: chestSort.x + 4, y: chestSort.y + 4 }, 0);
    update('barrel');
    const barrelSort = packNode(ui, node => node.id === 'preview.frame:barrel.pane.contents.sort').clip;
    ui.pointerDown({ x: barrelSort.x + 4, y: barrelSort.y + 4 }, 0);
    ui.pointerUp({ x: barrelSort.x + 4, y: barrelSort.y + 4 }, 0);
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(1, 'backpack');
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(2, 'chest');
    expect(handlers.sortInventoryContainer).toHaveBeenNthCalledWith(3, 'placeable');
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
    const source = packSlotRect(ui, 'backpack', 0);
    const target = packSlotRect(ui, 'chest', 0);
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
    const original = { frame: { ...packNode(ui, node => node.id === 'frame:chest').rect } };
    const handle = packNode(ui, node => node.label === 'Resize CHEST se').rect;
    const point = { x: handle.x + 4, y: handle.y + 4 };
    expect(ui.pointerDown(point, 0)).toBe(true);
    ui.pointerMove({ x: point.x + 30, y: point.y + 20 });
    expect(ui.pointerUp({ x: point.x + 30, y: point.y + 20 }, 0)).toBe(true);
    const resized = packNode(ui, node => node.id === 'frame:chest').rect;
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
    expect(ui.handleKeyDown('Tab', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('KeyI', false);
    expect(ui.handleKeyDown('KeyW', false)).toBe(true);
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
  });

  it('opens the system menu on Escape during a Delve and exits only from its contextual action', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, delveActive: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });

    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBe('system');
    expect(handlers.exitDelve).not.toHaveBeenCalled();

    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
    expect(handlers.exitDelve).not.toHaveBeenCalled();

    ui.handleKeyDown('Escape', false);
    clickKitControl(ui, 'game-menu.exit-delve');
    expect(handlers.exitDelve).toHaveBeenCalledOnce();
    expect(ui.openWindow).toBeNull();
  });

  it('requires explicit confirmation before starting a Delve', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.update({
      width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });

    ui.openWindow = 'delve-confirmation';
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(ui.openWindow).toBeNull();
    expect(handlers.startDelve).not.toHaveBeenCalled();

    ui.openWindow = 'delve-confirmation';
    clickKitControl(ui, 'delve-confirmation.cancel');
    expect(ui.openWindow).toBeNull();
    expect(handlers.startDelve).not.toHaveBeenCalled();

    ui.openWindow = 'delve-confirmation';
    expect(ui.handleKeyDown('KeyE', false)).toBe(true);
    expect(handlers.startDelve).toHaveBeenCalledOnce();
    expect(ui.openWindow).toBeNull();

    ui.openWindow = 'delve-confirmation';
    clickKitControl(ui, 'delve-confirmation.begin');
    expect(handlers.startDelve).toHaveBeenCalledTimes(2);
    expect(ui.openWindow).toBeNull();
  });

  it('omits Exit Delve from the system menu outside a run', () => {
    const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    host.openWindow = 'system';
    expect(kitControlNode(host, 'game-menu.exit-delve').visible).toBe(false);
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
    clickKitControl(ui, 'game-menu.help');
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
    const source = packSlotRect(ui, 'hotbar', 0);
    expect(ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0)).toBe(true);

    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBeNull();
    ui.handleKeyDown('Escape', false);
    expect(ui.openWindow).toBe('system');
    clickKitControl(ui, 'game-menu.settings');
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
    clickKitControl(ui, 'settings.pages:tab:audio');
    clickKitControl(ui, 'settings.background.music');
    clickKitControl(ui, 'settings.background.sounds');
    expect(handlers.setAudioBackground).toHaveBeenNthCalledWith(1, 'music', true);
    expect(handlers.setAudioBackground).toHaveBeenNthCalledWith(2, 'sounds', false);

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
    clickKitControl(ui, 'settings.nameplates');
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
    clickKitControl(ui, 'settings.pages:tab:video');
    clickKitControl(ui, 'settings.lighting');
    expect(ui.handleKeyDown('ArrowUp', false)).toBe(true);
    expect(ui.handleKeyDown('Enter', false)).toBe(true);
    expect(handlers.setLightingModel).toHaveBeenCalledWith('classic');
  });

  it('mutes and restores the saved volume from its kit mute control', () => {
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
    clickKitControl(ui, 'settings.pages:tab:audio');
    clickKitControl(ui, 'settings.mute.master');
    expect(handlers.setAudioVolume).toHaveBeenLastCalledWith('master', 0);
    ui.update({ ...model, audioVolumes: { ...model.audioVolumes, master: 0 } });
    clickKitControl(ui, 'settings.mute.master');
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
    const source = packSlotRect(ui, 'hotbar', 0);
    const hand = packSlotRect(ui, 'equipment', 2);
    expect(ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0)).toBe(true);
    ui.pointerMove({ x: hand.x + 4, y: hand.y + 4 });
    expect(ui.pointerUp({ x: hand.x + 4, y: hand.y + 4 }, 0)).toBe(true);
    expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
    expect(handlers.moveInventoryItem).not.toHaveBeenCalled();
  });

  it('does not drop a tool into the off-hand lantern slot', () => {
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
    const source = packSlotRect(ui, 'hotbar', 0);
    const head = packSlotRect(ui, 'equipment', 2);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 9 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui); const source = layout.inventoryHotbarSlots[0]!; const target = layout.craftingSlots[0]!;
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [
        { slot: 0, itemKind: 'wood', quantity: 36 },
        { slot: 42, itemKind: 'empty', quantity: 0 },
      ],
      hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }, { slot: 42, itemKind: 'wood', quantity: 1 }],
      hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
    const slot = packSlotRect(ui, 'backpack', 0);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'wood', quantity: 8 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const frame = craftingTestLayout(ui).craftingWindow;
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui); const source = layout.inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    ui.pointerUp({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 0, ['crafting']);

    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 10 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
    const slot = packSlotRect(ui, 'hotbar', 0);
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
    const hotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => packSlotRect(ui, 'hotbar', index));
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
    const slot = packSlotRect(ui, 'hotbar', 0);
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
    const hotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => packSlotRect(ui, 'hotbar', index));
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 39, itemKind: 'wood', quantity: 25 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const result = craftingTestLayout(ui).craftingResult;
    expect(ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, { shift: true })).toBe(true);
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('planks', true);
  });

  it('keeps an authored skill-gated result locked until the required rank arrives', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'recipe:planks' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)),
        skillRequirement: { skillNode: 'greenhouse_charter', minimumRank: 1 } }),
    });
    const registry = buildContentRegistry(rows).registry;
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    const model = {
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 39, itemKind: 'wood', quantity: 1 }], hasBackpack: false,
      contentRegistry: registry, knownRecipeIds: ['planks'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update(model);
    const result = craftingTestLayout(ui).craftingResult;
    const point = { x: result.x + 4, y: result.y + 4 };
    ui.pointerMove(point);
    const skillName = registry.compiled.skillNodes.find(({ id }) => id === 'greenhouse_charter')!.name;
    expect(ui.tooltipText()).toBe(`REQUIRES ${skillName.toUpperCase()} RANK 1`);
    ui.pointerDown(point, 0, {});
    expect(handlers.craftInventoryRecipe).not.toHaveBeenCalled();
    ui.update({ ...model, skills: { tracks: [], ranks: [{ nodeId: 'greenhouse_charter', rank: 1 }], balanceBronze: 0n } });
    ui.pointerDown(point, 0, {});
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('planks', false);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto' as const, prompt: null, toast: null,
    };
    ui.update({ ...model, nearbyCraftingStations: [] });
    const result = craftingTestLayout(ui).craftingResult;
    ui.pointerMove({ x: result.x + 4, y: result.y + 4 });
    expect(ui.tooltipText()).toBe('REQUIRES A WORKBENCH WITHIN 2 TILES');
    ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, {});
    expect(handlers.craftInventoryRecipe).not.toHaveBeenCalled();

    ui.update({ ...model, nearbyCraftingStations: ['workbench'] });
    ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, {});
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('chest', false);
  });

  it('crafts a manually arranged unknown recipe without recipe-book knowledge', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [0, 2, 3, 4, 5].map((index) => ({
        slot: 39 + index, itemKind: 'plank', quantity: 4,
      })),
      hasBackpack: false,
      nearbyCraftingStations: ['workbench'],
      knownRecipeIds: [],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const result = craftingTestLayout(ui).craftingResult;
    ui.pointerDown({ x: result.x + 4, y: result.y + 4 }, 0, {});
    expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('boat', false);
    expect(handlers.ghostFillCraftingRecipe).not.toHaveBeenCalled();
  });

  it('clicks a visible recipe-book row to request ghost fill', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'plank', quantity: 4 }], hasBackpack: false,
      nearbyCraftingStations: [],
      knownRecipeIds: ['planks', 'sticks', 'torch', 'campfire', 'workbench'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const workbenchRow = craftingTestLayout(ui).craftingRecipeRows[4]!;
    ui.pointerDown({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    ui.pointerUp({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    expect(handlers.ghostFillCraftingRecipe).toHaveBeenCalledWith('workbench');
    const selected = ui as unknown as { selectedCraftingRecipeId: string | null };
    expect(selected.selectedCraftingRecipeId).toBe('workbench');
    ui.pointerDown({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    ui.pointerUp({ x: workbenchRow.x + 2, y: workbenchRow.y + 2 }, 0, {});
    expect(selected.selectedCraftingRecipeId).toBeNull();
    expect(handlers.ghostFillCraftingRecipe).toHaveBeenCalledTimes(1);
  });

  it('explains an unavailable crafting station when hovering its visible recipe', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, nearbyCraftingStations: [],
      knownRecipeIds: ['planks', 'fruit_press'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    // Registry projections are canonical-id ordered, so fruit_press precedes planks.
    const recipeRow = craftingTestLayout(ui).craftingRecipeRows[0]!;
    ui.pointerMove({ x: recipeRow.x + 2, y: recipeRow.y + 2 });
    expect(ui.tooltipText()).toBe('REQUIRES A WORKBENCH WITHIN 2 TILES');
  });

  it('clears a selected recipe when clicking away and labels hovered ghost ingredients', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, nearbyCraftingStations: [],
      knownRecipeIds: ['workbench'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
    const recipeRow = layout.craftingRecipeRows[0]!;
    ui.pointerDown({ x: recipeRow.x + 2, y: recipeRow.y + 2 }, 0);
    ui.pointerUp({ x: recipeRow.x + 2, y: recipeRow.y + 2 }, 0);

    const firstGhost = layout.craftingSlots[0]!;
    ui.pointerMove({ x: firstGhost.x + 8, y: firstGhost.y + 8 });
    expect(ui.tooltipText()).toBe('WOODEN PLANKS');

    ui.pointerDown({ x: firstGhost.x + 8, y: firstGhost.y + 8 }, 0);
    const selected = ui as unknown as { selectedCraftingRecipeId: string | null };
    expect(selected.selectedCraftingRecipeId).toBeNull();
    expect(ui.tooltipText()).toBeNull();
  });

  it('filters only the player-known recipe rows by recipe or output name', () => {
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], hasBackpack: false, nearbyCraftingStations: [],
      knownRecipeIds: ['planks', 'sticks', 'workbench'],
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const internal = ui as unknown as {
      recipeFilterText: string;
      recipeBookEntries: () => readonly { readonly recipeId: string }[];
    };
    internal.recipeFilterText = 'bench';
    expect(internal.recipeBookEntries().map((entry) => entry.recipeId)).toEqual(['workbench']);
    internal.recipeFilterText = 'stick';
    expect(internal.recipeBookEntries().map((entry) => entry.recipeId)).toEqual(['sticks']);
  });

  it('starts even distribution from an already-held cursor stack without Shift', () => {
    const handlers = callbacks();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
    ui.openWindow = 'crafting';
    ui.update({
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 10 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [], cursorStack: { itemKind: 'plank', quantity: 9 }, hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }], hasBackpack: false,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const layout = craftingTestLayout(ui);
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
      width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
      inventory: [{ slot: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: true,
      audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
      dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0,
      raining: false, weatherMode: 'auto', prompt: null, toast: null,
    });
    const source = craftingTestLayout(ui).inventoryHotbarSlots[0]!;
    ui.pointerDown({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    ui.pointerUp({ x: source.x + 4, y: source.y + 4 }, 0, { shift: true });
    expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 0, ['crafting']);
  });
});

it.each([240,320,390,480,640])('keeps currency clear of every HUD slot at width %i', width => {
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, width, height: 400 });
  const currency = packNode(host, node => node.id === 'hud.currency-inventory').clip;
  const slots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => packSlotRect(host, 'hotbar', index));
  for (const slot of slots) {
    expect(slot.x < currency.x + currency.width && slot.x + slot.width > currency.x
      && slot.y < currency.y + currency.height && slot.y + slot.height > currency.y).toBe(false);
  }
  if (width < 420) expect(slots[5]!.y - slots[0]!.y - slots[0]!.height).toBe(2);
});

it('tabs through the live kit hotbar in both directions without changing inventory contents', () => {
  const handlers = callbacks(), root = new UiRoot({ scale: 1 });
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers,
    undefined, undefined, undefined, undefined, undefined, root);
  for (let step = 0; step < 30 && root.focus.current?.label !== 'hotbar/0'; step++) ui.handleKeyDown('Tab', false);
  expect(root.focus.current?.label).toBe('hotbar/0');
  ui.handleKeyDown('Tab', false); ui.handleKeyDown('Enter', false);
  expect(handlers.selectHotbar).toHaveBeenLastCalledWith(1);
  ui.handleKeyDown('Tab', false, { shift: true }); ui.handleKeyDown('Space', false);
  expect(handlers.selectHotbar).toHaveBeenLastCalledWith(0); root.dispose();
});

it('retains paused notifications past the host counter and reopens identical new events', () => {
  const root = new UiRoot({ scale: 1 });
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks(),
    undefined, undefined, undefined, undefined, undefined, root);
  const model = { width: 480, height: 480, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: false, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto' as const,
    prompt: null, toast: 'HARVEST SAVED', toastId: 1, toastDurationMs: 100 };
  ui.update(model);
  const first = root.entries().find(entry => entry.element.id === 'hud.notification')!.element;
  ui.update({ ...model, toast: null });
  expect(ui.notificationText()).toBe('HARVEST SAVED');
  const dismiss = root.entries().find(entry => entry.element.label === 'Dismiss' && entry.element.isDescendantOf(first))!.element;
  root.focus.set(dismiss, 'keyboard'); ui.handleKeyDown('Enter', false);
  expect(ui.notificationText()).toBeNull();
  ui.update(model); expect(ui.notificationText()).toBeNull();
  ui.update({ ...model, toastId: 2 });
  expect(ui.notificationText()).toBe('HARVEST SAVED');
  expect(first.disposed).toBe(true);
  expect(root.entries().filter(entry => entry.element.kind === 'toast')).toHaveLength(1); root.dispose();
});


it('routes kit slot hits through the existing authority and drag-distribution prediction', () => {
  const handlers = callbacks();
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  host.openWindow = 'inventory';
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, inventory: [{ slot: 0, itemKind: 'wood', quantity: 9 }] });
  const controller = host.createInventoryController(), root = new UiRoot({ scale: 1 }); root.resize(320,200);
  root.mount(kit.flex({ width: 'grow', gap: 8 }, [kit.inventoryGrid({ container: 'hotbar', count: 10, controller }), kit.inventoryGrid({ container: 'backpack', count: 10, controller })])); root.arrange();
  const point = (label: string) => { const node = root.entries().find(entry => entry.element.label === label)!.element; return { x: node.rect.x + 5, y: node.rect.y + 5 }; };
  const pointer = (type: 'down' | 'move' | 'up', label: string, button = 0) => root.pointer({ type, point: point(label), button, pointerId: 1 });
  expect(controller.model.stack({ container: 'hotbar', index: 0 })?.quantity).toBe(9);
  expect(pointer('down','hotbar/0',2)).toBe(true);
  expect(controller.model.dragging).toBe(true);
  pointer('up','hotbar/0',2);
  expect(controller.model.dragging).toBe(false);
  expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar',0,'right');
  expect(controller.model.displayedCursor()?.quantity).toBe(5);
  pointer('down','backpack/0'); pointer('move','backpack/1'); pointer('up','backpack/1');
  expect(handlers.inventoryCursorQuickCraft).toHaveBeenCalledWith([{ container: 'backpack', index: 0 },{ container: 'backpack', index: 1 }], 'even');
  expect(controller.model.stack({ container: 'backpack', index: 0 })?.quantity).toBe(2);
  expect(controller.model.displayedCursor()?.quantity).toBe(1);
  controller.dispose(); root.dispose();
});


it('keeps captured kit pickup motion outside slots and honours Shift at release', () => {
  const handlers = callbacks();
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  host.openWindow = 'inventory';
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, inventory: [{ slot: 0, itemKind: 'wood', quantity: 9 }, { slot: 1, itemKind: 'apple', quantity: 3 }] });
  const controller = host.createInventoryController(), root = new UiRoot({ scale: 1 }); root.resize(320,200);
  const grid = root.mount(kit.inventoryGrid({ container: 'hotbar', count: 10, controller })); root.arrange();
  const point = (index: number) => ({ x: grid.children[index]!.rect.x + 5, y: grid.children[index]!.rect.y + 5 });
  root.pointer({ type: 'down', point: point(0), button: 0, pointerId: 1 });
  root.pointer({ type: 'move', point: { x: 310, y: 190 }, button: 0, pointerId: 1 });
  expect(handlers.inventoryCursorClick).toHaveBeenCalledWith('hotbar', 0, 'left');
  root.pointer({ type: 'up', point: { x: 310, y: 190 }, button: 0, pointerId: 1 });
  expect(handlers.inventoryCursorClick).toHaveBeenCalledOnce();
  expect(controller.model.displayedCursor()?.quantity).toBe(9);
  root.pointer({ type: 'down', point: point(1), button: 0, pointerId: 1 });
  root.pointer({ type: 'up', point: point(1), button: 0, pointerId: 1, shiftKey: true });
  expect(handlers.quickMoveInventoryItem).toHaveBeenCalledWith('hotbar', 1, expect.any(Array));
  root.dispose(); controller.dispose();
});

it('keeps held items on disabled equipment and returns them only from blank pack chrome', () => {
  const handlers = callbacks(), host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, width: 640, height: 400, cursorStack: { itemKind: 'wood', quantity: 4 } }); host.openWindow = 'inventory';
  const denied = packSlotRect(host, 'equipment', 0), point = { x: denied.x + 3, y: denied.y + 3 };
  host.pointerDown(point, 0); host.pointerUp(point, 0);
  expect(handlers.returnInventoryCursor).not.toHaveBeenCalled(); expect(handlers.inventoryCursorClick).not.toHaveBeenCalled();
  const frame = packNode(host, node => node.kind === 'frame' && node.id === 'frame:pack');
  const blank = { x: frame.rect.x + 12, y: frame.rect.y + 40 };
  host.pointerDown(blank, 0); host.pointerUp(blank, 0); expect(handlers.returnInventoryCursor).toHaveBeenCalledOnce();
});

it('preserves kit pack resize and filter focus across unchanged authority updates', () => {
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
  const model = { ...(host as unknown as { model: Parameters<typeof host.update>[0] }).model, width: 640, height: 400 };
  host.update(model); host.openWindow = 'inventory';
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
  const input = packNode(host, node => node.kind === 'input' && node.label === 'Filter items');
  root.focus.set(input, 'keyboard'); root.text('wood');
  const handle = packNode(host, node => node.label === 'Resize INVENTORY se'); root.focus.set(handle, 'keyboard'); root.key({ key: 'ArrowLeft' });
  const frame = packNode(host, node => node.id === 'frame:pack'), width = frame.rect.width;
  root.focus.set(input, 'keyboard'); host.update(model); root.arrange();
  expect(frame.rect.width).toBe(width); expect(root.focus.current).toBe(input); expect(input.props['value']).toBe('wood');
  host.handleKeyDown('Escape', false); expect(host.openWindow).toBeNull();
});


it('preserves canonical equipment restrictions when a frame pane has no restriction', () => {
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
  host.openWindow = 'inventory';
  const controller = host.createInventoryController();
  expect(controller.model.canAccept({ container: 'equipment', index: 2 }, { itemKind: 'wood', quantity: 1 })).toBe(false);
  expect(controller.model.canAccept({ container: 'equipment', index: 2 }, { itemKind: 'watch', quantity: 1 })).toBe(true);
  expect(controller.model.canAccept({ container: 'equipment', index: 5 }, { itemKind: 'axe', quantity: 1 })).toBe(false);
  controller.dispose();
});

it('uses barrel frame restrictions and only exposes Seal while unsealed', () => {
  const handlers = { ...callbacks(), frameAction: vi.fn() }, host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  const model = { ...(host as unknown as { model: Parameters<typeof host.update>[0] }).model, width: 640, height: 400, barrelSealed: false };
  host.update(model); host.openWindow = 'barrel';
  const controller = host.createInventoryController();
  expect(controller.model.canAccept({ container: 'placeable', index: 0 }, { itemKind: 'wood', quantity: 1 })).toBe(false);
  expect(controller.model.canAccept({ container: 'placeable', index: 0 }, { itemKind: 'carrot', quantity: 1 })).toBe(true);
  host.handleKeyDown('KeyS', false); expect(handlers.frameAction).toHaveBeenCalledWith('seal');
  host.update({ ...model, barrelSealed: true, barrelProgress: .5 }); host.handleKeyDown('KeyS', false);
  expect(handlers.frameAction).toHaveBeenCalledOnce();
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
  expect(root.entries().some(entry => entry.element.label === 'SEAL')).toBe(false);
  expect(root.entries().some(entry => entry.element.label === 'CURING 50%')).toBe(true); controller.dispose();
});

it.each([
  ['furnace', 'copper_ore', 2, 'SMELTING'],
  ['cooking', 'raw_fish', 1, 'COOKING'],
  ['press', 'apple', 1, 'PRESSING FRUIT'],
  ['fermentation', 'must', 1, 'FERMENTING'],
] as const)('binds %s inputs, read-only outputs and changing progress through the kit', (window, itemKind, output, status) => {
  const handlers = callbacks(), host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  const model = { ...(host as unknown as { model: Parameters<typeof host.update>[0] }).model,
    width: 640, height: 400, inventory: [{ slot: 0, itemKind, quantity: 4 }],
    furnaceRemainingSeconds: 12, cookingFireRemainingSeconds: 12, cellarProcessorRemainingSeconds: 12, activeFrameProgress: .2,
  };
  host.update(model); host.openWindow = window;
  const controller = host.createInventoryController(), frame = packNode(host, node => node.id === `frame:${window}`);
  expect(controller.model.canAccept({ container: 'placeable', index: 0 }, { itemKind, quantity: 1 })).toBe(true);
  expect(controller.model.canAccept({ container: 'placeable', index: 0 }, { itemKind: 'wood', quantity: 1 })).toBe(false);
  controller.activate({ container: 'hotbar', index: 0 }, 2); controller.activate({ container: 'placeable', index: output });
  expect(controller.model.displayedCursor()?.quantity).toBe(2); expect(handlers.inventoryCursorClick).toHaveBeenCalledOnce();
  expect(packNode(host, node => node.id === `frame:${window}.status`).label).toContain(`${status} 0:12`);
  host.update({ ...model, activeFrameProgress: .73 });
  expect(packNode(host, node => node.id === `frame:${window}`)).toBe(frame);
  const progress = packNode(host, node => node.kind === 'meter' && node.label === 'PROGRESS').props['value'] as () => number;
  expect(progress()).toBe(.73); controller.dispose();
});

it('keeps the processor filter, caret and frame while batch state and visibility change', () => {
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
  const model = { ...(host as unknown as { model: Parameters<typeof host.update>[0] }).model,
    width: 640, height: 400, activeFrameState: { processJobPending: true, processJobProgress: .2, processJobLabel: 'Cooking' },
  };
  host.update(model); host.openWindow = 'cooking';
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
  const frame = packNode(host, node => node.id === 'frame:cooking');
  const input = packNode(host, node => node.kind === 'input' && node.label === 'Filter items');
  root.focus.set(input, 'keyboard'); root.text('wood'); root.key({ key: 'ArrowLeft' });
  host.update({ ...model, activeFrameState: { processJobPending: true, processJobProgress: .8, processJobLabel: 'Ready' } });
  expect(packNode(host, node => node.id === 'frame:cooking')).toBe(frame);
  expect(root.focus.current).toBe(input);
  expect(packNode(host, node => node.kind === 'meter' && node.label === 'BATCH PROGRESS').props['value']).toBe(.8);
  expect(root.entries().some(entry => entry.element.kind === 'text' && entry.element.label === 'Ready')).toBe(true);
  host.update({ ...model, activeFrameState: { processJobPending: false, processJobProgress: 0, processJobLabel: '' } });
  expect(root.entries().some(entry => entry.element.label === 'BATCH PROGRESS')).toBe(false);
  expect(root.focus.current).toBe(input); root.text('X'); expect(input.props['value']).toBe('wooXd');
  expect(packNode(host, node => node.id === 'frame:cooking')).toBe(frame);
});


it('replaces the previous container with a closable message when an entity frame is missing', () => {
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks());
  host.openWindow = 'inventory'; host.openWindow = 'content';
  const root = (host as unknown as { chromeRoot: UiRoot }).chromeRoot;
  expect(root.entries().some(entry => entry.element.id === 'frame:pack')).toBe(false);
  expect(root.entries().some(entry => entry.element.label === 'CONTAINER UNAVAILABLE')).toBe(true);
  expect(root.entries().some(entry => entry.element.kind === 'slot' && entry.element.props['binding'])).toBe(false);
  host.handleKeyDown('Escape', false); expect(host.openWindow).toBeNull();
});

it('enables the crafting result immediately after a predicted ingredient transfer', () => {
  const handlers = callbacks(), host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, width: 640, height: 480, inventory: [{slot:0,itemKind:'wood',quantity:3}] }); host.openWindow = 'crafting';
  const result = packNode(host, node => node.label === 'Craft result'); expect(result.disabled).toBe(true);
  const controller = host.createInventoryController(); controller.activate({container:'hotbar',index:0}); controller.activate({container:'crafting',index:0});
  expect(result.disabled).toBe(false);
  const root = (host as unknown as {chromeRoot:UiRoot}).chromeRoot; root.arrange(); root.focus.set(result,'keyboard'); root.key({key:'Enter',shiftKey:true});
  expect(handlers.craftInventoryRecipe).toHaveBeenCalledWith('planks',true); controller.dispose();
});

it('scrolls the compact game menu by touch without activating the pressed action', () => {
  const handlers = callbacks();
  const host = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, handlers);
  const model = (host as unknown as { model: Parameters<typeof host.update>[0] }).model;
  host.update({ ...model, width: 200, height: 180, canAdministerWorld: true, delveActive: true });
  host.openWindow = 'system';
  const button = kitControlNode(host, 'game-menu.resume'), point = {x: button.clip.x+4,y:button.clip.y+4};
  const root = (host as unknown as {chromeRoot:UiRoot}).chromeRoot;
  const scroll = root.entries().find(entry=>entry.element.kind==='scroll-area' && entry.element.scroll.maxY>0)!.element;
  host.pointerDown(point,0,{pointerType:'touch'});
  host.pointerMove({x:point.x,y:point.y-40});
  host.pointerUp({x:point.x,y:point.y-40},0);
  expect(host.openWindow).toBe('system'); expect(scroll.scroll.y).toBeGreaterThan(0);
  clickKitControl(host, 'game-menu.quit'); expect(handlers.quitToTitle).toHaveBeenCalledOnce();
});
