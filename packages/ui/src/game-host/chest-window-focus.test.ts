import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiItemArt, type OverworldUiModel, type OverworldWindow } from '../overworld-ui.js';
import type { UiSkin } from '../skin.js';
import type { PixelUi } from '../pixel-ui.js';
import type { UiKitArt } from '../kit/components/art.js';
import type { UiElement } from '../kit/runtime/element.js';
import type { UiRootPointer } from '../kit/runtime/input.js';
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
    setLightingQuality: vi.fn(),
    signOut: vi.fn(),
    quitToTitle: vi.fn(),
    startDelve: vi.fn(),
    exitDelve: vi.fn(),
    toggleFullscreen: vi.fn(),
    checkForClientUpdate: vi.fn(),
    applyClientUpdate: vi.fn(),
    toggleOnlinePlayers: vi.fn(),
    manageHomesteadMember: vi.fn(),
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
    frameAction: vi.fn(),
  };
}


const registry = bootstrapContentRegistry();
function fixture(window: OverworldWindow = 'inventory', overrides: Partial<OverworldUiModel> = {}, paint?: { skin: UiSkin; fonts: PixelUi }) {
  const handlers = callbacks();
  const ui = new OverworldUi(paint?.skin ?? {} as UiSkin, paint?.fonts ?? {} as PixelUi, {} as OverworldUiItemArt, handlers);
  let model: OverworldUiModel = { width: 800, height: 600, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [{ container: 'backpack', index: 0, itemKind: 'wood', quantity: 8 }], hasBackpack: true, backpackSlotCapacity: 20,
    contentRegistry: registry, activeFrameId: window === 'chest' ? 'frame:chest' : window === 'barrel' ? 'frame:barrel' : undefined,
    activeFrameState: { sealed: false }, knownRecipeIds: ['planks'],
    audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
    ...overrides };
  ui.update(model); ui.openWindow = window;
  const root = ui.enableRetainedInventory({} as UiKitArt);
  const slot = (container: string, index: number): UiElement => {
    root.arrange();
    const node = root.entries().find(({ element }) => {
      const ref = element.props['binding'] as { container: string; index: number } | undefined;
      return ref?.container === container && ref.index === index;
    })?.element;
    if (!node) throw new Error(`Missing kit slot ${container}/${index}`);
    return node;
  };
  const point = (node: UiElement) => ({ x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 });
  const pointer = (type: UiRootPointer['type'], node: UiElement, extra: Partial<UiRootPointer> = {}) => root.pointer({ type,
    point: point(node), pointerId: 1, button: 0, ...extra });
  const click = (node: UiElement, extra: Partial<UiRootPointer> = {}) => { pointer('down', node, extra); pointer('up', node, extra); };
  return { ui, root, handlers, slot, point, pointer, click,
    update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); },
    dispose() { ui.disposeRetainedInventory(); } };
}

describe('chest window keyboard focus (BUG-064)', () => {
  it('opens without focusing the Filter, so keys and Escape stay with the game and window', () => {
    const f = fixture('chest', { openChestInventory: [{ index: 0, itemKind: 'apple', quantity: 5 }] });
    try {
      f.root.arrange();
      const focused = f.root.focus.current;
      expect(focused).not.toBeNull();
      expect(focused!.props['editor']).toBeUndefined();
      expect(focused!.label).not.toBe('Filter items');
      // The automatic first focus draws no ring (:focus-visible): it is not keyboard focus.
      expect(f.root.focus.inputSource).toBe('pointer');
      // Escape closes the chest at once (it used to clear, then refocus, the filter).
      f.root.key({ key: 'Escape' });
      expect(f.ui.openWindow).toBeNull();
      expect(f.handlers.closeChest).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it('still lets the player click into the Filter and type', () => {
    const f = fixture('chest', { openChestInventory: [{ index: 0, itemKind: 'apple', quantity: 5 }] });
    try {
      f.root.arrange();
      const filter = f.root.entries().find(({ element }) => element.label === 'Filter items')!.element;
      f.pointer('down', filter); f.pointer('up', filter); f.root.arrange();
      expect(f.root.focus.current).toBe(filter);
      expect(f.root.focus.inputSource).toBe('pointer');
      f.root.text('apple'); f.root.arrange();
      expect((filter.props['editor'] as { snapshot(): { value: string } }).snapshot().value).toBe('apple');
    } finally { f.dispose(); }
  });
});
