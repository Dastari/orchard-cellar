import { gameHudLayout } from './hud-layout.js';
import type { UiContentFrameOptions, UiCraftingSnapshot, UiCraftingFrameElement } from '../kit/components/index.js';
import { UiInventoryController, type UiInventorySlotRef } from '../kit/runtime/inventory.js';
import { bootstrapContentRegistry, type FrameContentDefinition, type SlotRestriction } from '@orchard/sim';
import { ui, uiFixed, UiRoot, UiTextBridge, scrollUiElement, type UiElement, type UiKitArt, type UiVitalKind, type UiOverlay } from '../kit/index.js';
import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, BOOTSTRAP_ITEM_CONTAINER_CONTENT, CHEST_STORAGE_CAPACITY, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_OFFSET, HOTBAR_SLOT_COUNT, clickContainerSlot, craftingRecipeOutput, hotbarSlotForInputCode, itemContainerContentResolver, itemDefinition, itemStacksCompatible, matchingRecipeId, maxStackFor, pickupAllToCursor, quickCraftCursorStack, quickMoveAllMatchingStacks, recipeDefinition, runtimeCraftingRecipeOutput, runtimeDurabilityDefinition, runtimeItemDefinition, runtimeMatchingRecipeId, runtimeMaxStack, runtimeRecipeDefinition, runtimeRecipeSkillSatisfied, type ContainerSnapshot, type CraftingStation, type ItemStack } from '@orchard/sim';
import type { LoadedAsset } from '../assets.js';
import { type PixelUi } from '../pixel-ui.js';
import { craftingRecipeBookEntries, craftingRecipePattern } from '../recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from '../geometry.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot } from '../item-slot.js';
import { resolveFramePaneSlots, contentFramePaneVisible } from '../content-frame.js';
import { type UiSkin } from '../skin.js';
import { type Direction, type PlayerAppearanceSelection, type SkillTrack } from '@orchard/sim';
import { type FrameSurface, type OverworldWindow, SETTINGS_TABS, type SettingsTab, DEVELOPER_TABS, type DeveloperTab, type AudioVolumeBus, type OverworldUiTargetVitals, type OverworldUiModel, type MinimapDrawer, type OverworldUiCallbacks, type OverworldUiItemArt } from './contracts.js';
import { contentFrameDefinitionForSurface, onlinePlayerListLabel, nextHomesteadMemberRole, processorCountdownLabel, MOON_PHASE_LABELS, hasEquippedWatch, watchStatusLabel, itemIconAnimation } from './helpers.js';

const DEFAULT_INVENTORY_SLOTS = 8;

const UNAVAILABLE_CONTAINER_FRAME: FrameContentDefinition = {
  id: 'frame:unavailable', kind: 'frame', schemaVersion: 1, title: 'CONTAINER UNAVAILABLE', style: 'wood_parchment',
  panes: [{ id: 'message', kind: 'text', bind: { state: 'frameError' } }],
};

const INVENTORY_DOUBLE_CLICK_MS = 500;

const INVENTORY_DRAG_START_DISTANCE = 3;

export class OverworldUi {
  private readonly nameplateRoot: UiRoot;
  private readonly nameplateLayer: UiElement;
  private readonly hudRoot: UiRoot;
  private readonly hudHotbar: UiElement;
  private readonly hudGroup: UiElement;
  private readonly chromeRoot: UiRoot;
  private containerFrame?: ReturnType<typeof ui.contentFrame>;
  private containerController?: UiInventoryController;
  private containerCursor?: UiElement;
  private systemCursor?: UiElement;
  private hudTooltip?: ReturnType<typeof ui.hudTooltip>;
  private containerDefinition?: FrameContentDefinition;
  private containerViewportKey = '';
  private containerTextBridge?: UiTextBridge;
  private containerSwipe?: { readonly node: UiElement; readonly start: UiPoint; readonly offset: number; active: boolean };
  private containerTooltip?: UiElement;
  private skillNoticeNode?: UiElement;
  private skillNoticeKey = '';
  private notificationNode?: UiOverlay;
  private notificationKey = '';
  private feedbackPressed = false;
  private zoneChrome: UiElement | null = null;
  private minimapChrome: UiElement | null = null;
  private zoneChromeKey = '';
  private minimapChromeKey = '';
  private readonly currencyNode: UiElement;
  private readonly mobileMenuNode: UiElement;
  private readonly craftingNode: UiElement;
  private readonly inventoryHotbarSlots: ItemSlot[];
  private readonly backpackItemSlots: ItemSlot[];
  private readonly equipmentItemSlots: ItemSlot[];
  private readonly craftingItemSlots: ItemSlot[];
  private readonly chestItemSlots: ItemSlot[];
  /** One retained pool for all authored placeable frames. Slot meaning,
   * ordering, restrictions and visibility come from the active definition. */
  private readonly placeableItemSlots: ItemSlot[];
  private delveConfirmationFrame?: ReturnType<typeof ui.delveConfirmation>;
  private textCanvas?: HTMLCanvasElement;
  private readonly updateRoot: UiRoot;
  private updateFrame?: UiElement;
  private developerFrame?: ReturnType<typeof ui.developer>;
  private settingsFrame?: ReturnType<typeof ui.settings>;
  private menuFrame?: ReturnType<typeof ui.gameMenu>;
  private helpFrame?: ReturnType<typeof ui.helpBook>;
  private helpViewport = '';
  private readonly watchStatusOutput: HTMLElement | null;
  private inventoryFilterText = '';
  private recipeFilterText = '';
  private selectedCraftingRecipeId: string | null = null;
  private readonly hudVitals: UiElement;
  private readonly hudEffects: UiElement;
  private readonly hudTargetVitals: UiElement;
  private readonly hudHunger: UiElement;
  private readonly hudHungerLabel: UiElement;
  private readonly hudTargetLabel: UiElement;
  private characterFrame?: ReturnType<typeof ui.character>;
  private characterViewport = '';
  private characterLoadingFrame?: UiElement;
  private readonly drawCharacterPortrait: NonNullable<Parameters<typeof ui.character>[0]['renderPortrait']>;
  private skillsFrame?: ReturnType<typeof ui.skills>;
  private skillsViewport = '';
  private selectedSkillTrack: SkillTrack = 'explorer';
  private statisticsFrame?: ReturnType<typeof ui.statistics>;
  private statisticsViewport = ''; 
  private questFrame?: ReturnType<typeof ui.questLog>;
  private questViewport = '';
  private selectedQuest: string | null = null;
  private model: OverworldUiModel = {
    width: 480, height: 270, connected: false, playerCount: 0, selectedSlot: 0, balanceBronze: 0n,
    inventory: [], openChestInventory: [], hasBackpack: false, audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
    audioBackground: { music: false, sounds: false },
    nameplatesVisible: true, delveActive: false,
    canAdministerWorld: false, dateLabel: 'SPRING 1', timeLabel: '06:00',
    timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
  };
  private layout = gameHudLayout(480, 270);
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredSlot: number | null = null;
  private cursorPress: {
    readonly origin: ItemSlot;
    readonly button: 'left' | 'right';
    readonly cursorWasHeld: boolean;
    readonly startPoint: UiPoint;
    readonly targets: ItemSlot[];
    dragged: boolean;
    pickedUpDuringDrag: boolean;
  } | null = null;
  private readonly quickCraftOriginalItems = new Map<ItemSlot, ItemStack | null>();
  private readonly quickCraftPreviewItems = new Map<ItemSlot, ItemStack | null>();
  private quickCraftOriginalCursor: ItemStack | null = null;
  private quickCraftPreviewCursor: ItemStack | null | undefined;
  private readonly optimisticMenuItems = new Map<ItemSlot, ItemStack | null>();
  private optimisticMenuCursor: ItemStack | null | undefined;
  private optimisticMenuStartedAt: number | null = null;
  private inventoryOutsidePress: 'left' | 'right' | null = null;
  private lastShiftClick: { readonly sourceRegion: string; readonly itemKind: string; readonly at: number } | null = null;
  private lastCursorClick: {
    readonly itemKind: string;
    readonly sourceRegion: string;
    readonly transferCandidate: boolean;
    readonly at: number;
  } | null = null;
  private clickStartedAt = Number.NEGATIVE_INFINITY;
  private openWindowValue: OverworldWindow | null = null;
  private onlinePlayerListActive = false;
  private onlinePlayersNode: UiElement | null = null;
  private onlinePlayersKey = '';
  private onlinePlayersLayoutKey = '';

  private zoneCollapsed = false;
  private minimapCollapsed = false;
  private minimapZoomIndex = 1;
  private updatePromptDismissed = false;
  private settingsTab: SettingsTab = 'gameplay';
  private developerTab: DeveloperTab = 'world';
  private readonly audioRestoreVolume: Record<AudioVolumeBus, number> = {
    master: 0.8,
    music: 0.7,
    sfx: 0.35,
  };

  constructor(
    private readonly skin: UiSkin,
    _fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: OverworldUiCallbacks,
    drawPlayerHead: (context: CanvasRenderingContext2D, playerId: string, rect: UiRect) => void = () => undefined,
    drawTargetPortrait: (context: CanvasRenderingContext2D, target: OverworldUiTargetVitals, rect: UiRect) => void = () => undefined,
    drawPlayerDoll: (context: CanvasRenderingContext2D, appearance: PlayerAppearanceSelection, facing: Direction, rect: UiRect) => void = () => undefined,
    private readonly drawMinimap: MinimapDrawer = () => undefined,
    kitArt?: UiKitArt,
    kitRoot?: UiRoot,
  ) {
    this.watchStatusOutput = typeof document === 'undefined'
      ? null : document.querySelector<HTMLElement>('#watch-accessibility-status');
    this.drawCharacterPortrait = drawPlayerDoll;
    this.chromeRoot = kitRoot ?? new UiRoot({ art: kitArt, scale: 1 });
    this.updateRoot = new UiRoot({ art: kitArt, scale: 1 });
    this.nameplateRoot = new UiRoot({ art: kitArt, scale: 1 });
    this.nameplateLayer = this.nameplateRoot.mount(ui.nameplates());
    this.currencyNode = this.chromeRoot.mount(ui.purse({ id: 'hud.currency-inventory', balance: 0n,
      onOpen: () => { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; },
      layout: { position: 'absolute' },
    }));
    this.mobileMenuNode = this.chromeRoot.mount(ui.button({ id: 'hud.mobile-menu', label: 'MENU', activateOn: 'down',
      onPress: () => { this.openWindow = this.openWindowValue === 'system' ? null : 'system'; },
      layout: { position: 'absolute' },
    }));
    this.craftingNode = this.chromeRoot.mount(ui.iconButton({ cf: 'wrench' }, {
      id: 'hud.crafting', label: 'Crafting', tone: 'primary', activateOn: 'down',
      onPress: () => { this.openWindow = 'crafting'; }, layout: { position: 'absolute' },
    }));
    this.hudRoot = this.chromeRoot;
    this.hudGroup = this.hudRoot.mount(ui.stack({ width: 'grow', height: 'grow' }));
    const mountHud = (node: UiElement): UiElement => { this.hudGroup.append(node); return node; };
    this.hudHotbar = mountHud(ui.hotbar({
      id: 'hud.hotbar', container: 'hotbar', count: HOTBAR_SLOT_COUNT,
      columns: 'auto', slotSize: 'sm', artwork: itemArt,
      iconAnimation: item => itemIconAnimation(item.itemKind, this.model.contentRegistry),
      stack: index => {
        const item = this.model.inventory.find(item => item.slot === index);
        return item && item.itemKind !== 'empty' && item.quantity > 0 ? item : null;
      },
      onSelect: index => this.callbacks.selectHotbar(index),
      layout: { position: 'absolute' },
    }));
    this.hudEffects = mountHud(ui.statusEffects({ id: 'hud.effects', effects: [], ticksPerSecond: 20, layout: { position: 'absolute' } }));
    this.hudVitals = mountHud(ui.vitals({ id: 'hud.vitals', values: () => this.model.vitals,
      portrait: ui.viewport({ label: 'Player portrait', render: (context, rect) => {
        if (this.model.vitals) drawPlayerHead(context, this.model.vitals.playerId, rect);
      } }), layout: { position: 'absolute' },
    }));
    this.hudTargetVitals = mountHud(ui.vitals({ id: 'hud.target-vitals', mirrored: true, values: () => this.model.targetVitals,
      portrait: ui.viewport({ label: 'Target portrait', render: (context, rect) => {
        if (this.model.targetVitals) drawTargetPortrait(context, this.model.targetVitals, rect);
      } }), layout: { position: 'absolute' },
    }));
    this.hudHunger = mountHud(ui.meter({ id: 'hud.hunger', label: 'Hunger', tone: 'warning', variant: 'thin',
      value: () => { const hunger = this.model.hunger; return hunger && hunger.maximum > 0 ? hunger.current / hunger.maximum : 0; },
      layout: { position: 'absolute' },
    }));
    this.hudHungerLabel = mountHud(ui.text('', { outline: true, overflow: 'ellipsis',
      layout: { position: 'absolute' } }));
    this.hudTargetLabel = mountHud(ui.text('', { outline: true, overflow: 'ellipsis', align: 'right',
      layout: { position: 'absolute' } }));
    this.inventoryHotbarSlots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.inventory.hotbar.${slot}`, 'hotbar', slot));
    this.backpackItemSlots = Array.from({ length: BACKPACK_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.inventory.backpack.${slot}`, 'backpack', slot));
    this.equipmentItemSlots = EQUIPMENT_SLOTS.map(({ index }) => (
      new ItemSlot(
        `window.inventory.equipment.${index}`, 'equipment', index,
        EQUIPMENT_SLOT_RESTRICTIONS[index],
      )
    ));
    this.craftingItemSlots = Array.from({ length: CRAFTING_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.crafting.${slot}`, 'crafting', slot));
    this.chestItemSlots = Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, slot) => new ItemSlot(`window.chest.${slot}`, 'chest', slot));
    this.placeableItemSlots = Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, slot) => (
      new ItemSlot(`window.content.entity.${slot}`, 'placeable', slot)
    ));
    this.update(this.model);
  }

  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  get activeSkillTrack(): SkillTrack { return this.skillsFrame?.selectedTrack ?? this.selectedSkillTrack; }
  get selectedSettingsTab(): SettingsTab { return this.settingsTab; }
  get selectedDeveloperTab(): DeveloperTab { return this.developerTab; }
  get blockingUpdatePromptVisible(): boolean {
    return this.model.pwaUpdateStatus === 'available' && !this.updatePromptDismissed;
  }
  get minimapBounds(): UiRect {
    return this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap;
  }

  private toggleAudioMute(bus: AudioVolumeBus): void {
    const current = this.model.audioVolumes[bus];
    if (current > 0.001) {
      this.audioRestoreVolume[bus] = current;
      this.callbacks.setAudioVolume(bus, 0);
      return;
    }
    this.callbacks.setAudioVolume(bus, Math.max(0.05, this.audioRestoreVolume[bus]));
  }

  private confirmDelve(): void {
    if (this.openWindowValue !== 'delve-confirmation') return;
    this.openWindow = null;
    this.callbacks.startDelve();
  }

  openQuest(questId: string): boolean {
    if (!this.model.quests?.some(quest=>quest.id===questId)) return false;
    this.selectedQuest=questId;
    this.openWindow = 'quests';
    this.questFrame?.select(questId);this.chromeRoot.arrange();
    return true;
  }

  openSkillTrack(track: SkillTrack): void {
    this.selectedSkillTrack = track;
    this.skillsFrame?.selectTrack(track);
    this.openWindow = 'skills';
  }
  set openWindow(window: OverworldWindow | null) {
    const requestedWindow = window === 'pack' ? 'inventory' : window;
    const nextWindow = requestedWindow === 'developer' && !this.model.canAdministerWorld ? 'system' : requestedWindow;
    if (this.openWindowValue === 'chest' && nextWindow !== 'chest') this.callbacks.closeChest();
    if ((this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation')
      && nextWindow !== this.openWindowValue) this.callbacks.closePlaceable();
    if (this.openWindowValue === 'crafting' && nextWindow !== 'crafting') {
      this.selectedCraftingRecipeId = null;
      this.callbacks.closeCrafting();
    }
    if (this.isInventoryWindow(this.openWindowValue) && !this.isInventoryWindow(nextWindow)) {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      this.cursorPress = null;
      this.inventoryOutsidePress = null;
      this.callbacks.returnInventoryCursor();
    }
    if (this.skillsFrame) this.selectedSkillTrack = this.skillsFrame.selectedTrack;
    this.openWindowValue = nextWindow;
    this.syncActiveWindow();
  }

  update(model: OverworldUiModel): void {
    const previousUpdateStatus = this.model.pwaUpdateStatus;
    this.model = model;
    if (this.watchStatusOutput !== null) {
      const watchStatus = hasEquippedWatch(model.inventory)
        ? watchStatusLabel(model.timeLabel, model.dateLabel, model.moonPhase)
        : '';
      const skillStatus = model.skillPointNotice === null || model.skillPointNotice === undefined
        ? ''
        : `${model.skillPointNotice.points} new ${model.skillPointNotice.track} skill point${model.skillPointNotice.points === 1 ? '' : 's'}. Press K to open that skill tree.`;
      this.watchStatusOutput.textContent = [watchStatus, skillStatus].filter(Boolean).join(' ');
    }
    if (model.pwaUpdateStatus !== 'available' || previousUpdateStatus !== 'available') {
      this.updatePromptDismissed = false;
    }
    if (this.openWindowValue === 'developer' && !model.canAdministerWorld) this.openWindowValue = 'system';
    if (this.openWindowValue === 'delve-confirmation' && model.delveActive === true) {
      this.openWindowValue = null;
    }
    this.layout = gameHudLayout(model.width, model.height);
    this.chromeRoot.resize(model.width, model.height);
    this.syncZoneChrome();
    this.syncMinimapChrome();
    this.syncOnlinePlayers();
    this.syncSkillNotice();
    this.syncNotification();
    const purse = this.layout.currency;
    this.currencyNode.setStyle({ inset: { left: uiFixed(purse.x), top: uiFixed(purse.y) }, width: uiFixed(purse.width), height: uiFixed(purse.height) });
    this.currencyNode.setProps({ balance: model.balanceBronze ?? 0n });
    this.hudRoot.resize(model.width, model.height);
    this.hudHotbar.setStyle({ inset: { left: uiFixed(this.layout.hotbar.x), top: uiFixed(this.layout.hotbar.y) },
      width: uiFixed(this.layout.hotbar.width), height: uiFixed(this.layout.hotbar.height) });
    this.hudHotbar.children.forEach((node, slot) => node.setProps({ selected: slot === model.selectedSlot }, false));
    for (const [node, rect, visible] of [
      [this.hudVitals, this.layout.vitals, model.vitals !== undefined],
      [this.hudTargetVitals, this.layout.targetVitals, model.targetVitals !== undefined],
      [this.hudHunger, { ...this.layout.vitals, y: this.layout.vitals.y - 9, height: 6 }, model.hunger !== undefined],
      [this.hudHungerLabel, { ...this.layout.vitals, width: 72, y: this.layout.vitals.y - 19, height: 10 }, model.hunger !== undefined],
      [this.hudTargetLabel, { ...this.layout.targetVitals, x: this.layout.targetVitals.x + this.layout.targetVitals.width - 72, width: 72, y: this.layout.targetVitals.y - 12, height: 10 }, model.targetVitals !== undefined],
    ] as const) node.setStyle({ inset: { left: uiFixed(Math.max(0, rect.x)), top: uiFixed(Math.max(0, rect.y)) },
      width: uiFixed(rect.width), height: uiFixed(rect.height), visible });
    this.hudHungerLabel.setProps({ text: model.hunger ? `HUNGER ${Math.ceil(model.hunger.current / 100)}` : '' });
    this.hudTargetLabel.setProps({ text: model.targetVitals?.displayName.toUpperCase() ?? '' });
    this.hudHunger.setProps({ tone: model.hunger && model.hunger.current <= model.hunger.maximum * .25 ? 'danger' : 'warning' }, false);
    for (const entry of this.hudRoot.entries()) if (entry.element.id === 'hud.vitals:vigour') {
      entry.element.setProps({ tone: model.vigourDenied ? 'danger' : 'success' }, false);
    }
    this.hudEffects.setProps({ effects: (model.effects ?? []).map(effect => ({
      id: effect.effectKind, name: effect.name, stacks: effect.stacks, remainingTicks: effect.remainingTicks, durationTicks: effect.durationTicks,
      icon: effect.effectKind === 'orchard_tea' ? { lucide: 'sprout' } : effect.effectKind === 'winded' || effect.effectKind === 'fruitful_energy' ? { cf: 'lightning' } : { cf: 'heart' },
      tone: effect.effectKind === 'winded' ? 'danger' : 'success',
    })) });
    this.hudEffects.setStyle({ inset: { left: uiFixed(this.layout.hotbar.x), top: uiFixed(Math.max(0, this.layout.vitals.y - 47)) },
      width: uiFixed(this.layout.hotbar.width), height: uiFixed(24), visible: (model.effects?.length ?? 0) > 0 });
    this.hudRoot.arrange();
    // The world table keeps explicit `empty` rows for vacant cells. Those are a
    // persistence detail, not an item stack: retaining them here makes a slot
    // look empty while drop validation sees an incompatible item occupying it.
    const inventoryBySlot = new Map(model.inventory
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.inventoryHotbarSlots.forEach((slot, index) => {
      slot.enabled = true;
      slot.item = inventoryBySlot.get(index) ?? null;
    });
    this.backpackItemSlots.forEach((slot, index) => {
      slot.enabled = index < (model.backpackSlotCapacity ?? (model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS));
      slot.item = inventoryBySlot.get(BACKPACK_SLOT_OFFSET + index) ?? null;
    });
    this.equipmentItemSlots.forEach((slot) => {
      slot.enabled = true;
      slot.item = inventoryBySlot.get(EQUIPMENT_SLOT_OFFSET + slot.index) ?? null;
    });
    this.craftingItemSlots.forEach((slot, index) => {
      slot.enabled = true;
      slot.item = inventoryBySlot.get(CRAFTING_SLOT_OFFSET + index) ?? null;
    });
    const chestBySlot = new Map((model.openChestInventory ?? [])
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.chestItemSlots.forEach((slot, index) => {
      slot.enabled = true; slot.item = chestBySlot.get(index) ?? null;
    });
    const placeableBySlot = new Map((model.openPlaceableInventory ?? [])
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.placeableItemSlots.forEach((slot, index) => {
      slot.enabled = true;
      slot.item = placeableBySlot.get(index) ?? null;
      slot.setRestriction(undefined);
    });
    this.reconcileOptimisticMenu();
    if (this.cursorPress?.cursorWasHeld && this.cursorPress.targets.length > 0) this.applyQuickCraftPreview();
    this.syncUpdatePrompt();
    const menu = this.layout.mobileMenuButton;
    this.mobileMenuNode.setStyle({ inset: { left: uiFixed(menu.x), top: uiFixed(menu.y) }, width: uiFixed(menu.width), height: uiFixed(menu.height),
      visible: (model.touchControls === true || model.width < 420) && this.openWindowValue === null });
    if (this.chromeRoot.tree.children.at(-1) !== this.mobileMenuNode) this.chromeRoot.mount(this.mobileMenuNode);
    const crafting = this.layout.craftingButton;
    this.craftingNode.setStyle({ inset: { left: uiFixed(crafting.x), top: uiFixed(crafting.y) },
      width: uiFixed(crafting.width), height: uiFixed(crafting.height), visible: this.openWindowValue === null });
    for (const bus of ['master', 'music', 'sfx'] as const) {
      if (model.audioVolumes[bus] > 0.001) this.audioRestoreVolume[bus] = model.audioVolumes[bus];
    }
    this.syncActiveWindow();
  }

  handleKeyDown(code: string, repeat: boolean, modifiers: { readonly ctrl?: boolean; readonly shift?: boolean; readonly alt?: boolean; readonly meta?: boolean } = {}): boolean {
    if (repeat) return false;
    if (this.blockingUpdatePromptVisible) {
      this.updateRoot.key({ key: code === 'Space' ? ' ' : code, ctrlKey: modifiers.ctrl, shiftKey: modifiers.shift, altKey: modifiers.alt, metaKey: modifiers.meta });
      return true;
    }
    if (this.openWindowValue === 'help' && this.helpFrame?.handleHelpKey(code)) return true;
    if (this.openWindowValue === 'settings' && (code === 'ArrowUp' || code === 'ArrowDown') && !['slider','select','list-row','tab'].includes(this.chromeRoot.focus.current?.kind ?? '')) {
      const current = SETTINGS_TABS.indexOf(this.settingsTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.settingsTab = SETTINGS_TABS[(current + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if (this.openWindowValue === 'developer' && (code === 'ArrowUp' || code === 'ArrowDown') && !['slider','tab'].includes(this.chromeRoot.focus.current?.kind ?? '')) {
      const current = DEVELOPER_TABS.indexOf(this.developerTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.developerTab = DEVELOPER_TABS[(current + delta + DEVELOPER_TABS.length) % DEVELOPER_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if ((this.openWindowValue === null || this.usesKitWindow()) && (code === 'Tab' || (this.chromeRoot.focus.inputSource === 'keyboard' || this.usesKitWindow()) && (code === 'Enter' || code === 'Space' || code.startsWith('Arrow') || code === 'ContextMenu' || code === 'Home' || code === 'End' || code === 'PageUp' || code === 'PageDown' || code === 'Digit0'))) {
      if (this.chromeRoot.key({ key: code === 'Space' ? ' ' : code === 'Digit0' ? '0' : code, ctrlKey: modifiers.ctrl,
        shiftKey: modifiers.shift, altKey: modifiers.alt, metaKey: modifiers.meta })) return true;
    }
    if (this.openWindowValue === 'settings' && this.settingsTab === 'gameplay' && code === 'KeyN') {
      this.settingsFrame?.toggleNameplates();
      return true;
    }

    if (this.openWindowValue === 'delve-confirmation'
      && (code === 'Enter' || code === 'Space' || code === 'KeyE')) {
      this.confirmDelve();
      return true;
    }
    if (code === 'Escape') {
      if (this.openWindowValue === 'settings' || this.openWindowValue === 'developer' || this.openWindowValue === 'help') this.openWindow = 'system';
      else if (this.openWindowValue !== null) this.openWindow = null;
      else this.openWindow = 'system';
      return true;
    }
    if (code === 'KeyI') { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; return true; }
    if (code === 'KeyC') { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; return true; }
    if (code === 'KeyP') { this.openWindow = this.openWindowValue === 'character' ? null : 'character'; return true; }
    if (code === 'KeyK') {
      const notice = this.model.skillPointNotice;
      if (notice !== null && notice !== undefined) {
        this.openSkillTrack(notice.track);
        this.callbacks.dismissSkillPointNotice?.();
      } else this.openWindow = this.openWindowValue === 'skills' ? null : 'skills';
      return true;
    }
    if (code === 'KeyL') { this.openWindow = this.openWindowValue === 'quests' ? null : 'quests'; return true; }
    if (this.openWindowValue === 'barrel' && code === 'KeyS') {
      const state = { sealed: this.model.barrelSealed ?? false, ...this.model.activeFrameState };
      const seal = this.containerDefinition?.buttons?.find(button => button.interaction === 'seal'
        && (!button.visibleWhen || state[button.visibleWhen.state as keyof typeof state] === button.visibleWhen.equals));
      if (seal) this.callbacks.frameAction?.(seal.interaction);
      return true;
    }
    if (this.isInventoryWindow(this.openWindowValue)) {
      const hovered = this.inventoryItemSlotAt(this.pointer);
      const hotbarIndex = hotbarSlotForInputCode(code);
      if (hovered !== null && hotbarIndex !== null) {
        this.callbacks.inventoryCursorSwapHotbar(hovered.containerId, hovered.index, hotbarIndex);
        return true;
      }
      if (code === 'KeyQ') {
        if (this.model.cursorStack !== null && this.model.cursorStack !== undefined) {
          this.callbacks.dropInventoryCursor(modifiers.ctrl ? 'left' : 'right');
          return true;
        }
        if (hovered !== null && hovered.item !== null) {
          this.callbacks.throwMenuItem(hovered.containerId, hovered.index, modifiers.ctrl === true);
          return true;
        }
      }
    }
    return this.openWindowValue !== null;
  }

  handleOnlinePlayersKeyDown(code: string, shiftKey = false): boolean {
    return this.onlinePlayerListActive && this.chromeRoot.key({ key: code === 'Space' ? ' ' : code === 'Digit0' ? '0' : code, shiftKey });
  }

  pointerMove(point: UiPoint, _modifiers: { readonly shift?: boolean } = {}): void {
    void _modifiers;
    this.systemCursorMove(point);
    if (this.blockingUpdatePromptVisible) { this.updateRoot.pointer({type:'move',point,button:0,pointerId:1}); return; }
    if (this.usesKitWindow() && this.containerSwipe) {
      const swipe = this.containerSwipe, dy = point.y - swipe.start.y;
      if (swipe.active || Math.abs(dy) >= INVENTORY_DRAG_START_DISTANCE) {
        if (!swipe.active) { this.chromeRoot.pointer({ type: 'cancel', point, button: 0, pointerId: 1 }); this.inventoryOutsidePress = null; swipe.active = true; }
        scrollUiElement(swipe.node, swipe.node.scroll.x, swipe.offset - dy); return;
      }
    }
    this.chromeRoot.pointer({ type: 'move', point, button: 0, pointerId: 1 });
    if (this.usesKitContainer()) return;
    this.hoveredSlot = this.hudHotbar.children.findIndex(node => containsPoint(node.rect, point) && containsPoint(node.clip, point));
    if (this.hoveredSlot < 0) this.hoveredSlot = null;
    this.moveInventoryPointer(point);
  }

  pointerDown(point: UiPoint, button: number, modifiers: {
    readonly shift?: boolean;
    readonly pointerType?: string;
  } = {}): boolean {
    if (this.pointerFeedbackDown(point, button)) return true;
    this.systemCursorDown(point);
    if (this.blockingUpdatePromptVisible) {
      this.updateRoot.pointer({ type: 'down', point, button, pointerId: 1 });
      return true;
    }
    if (this.openWindowValue === 'delve-confirmation' || this.openWindowValue === 'statistics' || this.openWindowValue === 'character' || this.openWindowValue === 'skills' || this.openWindowValue === 'quests' || this.openWindowValue === 'help' || this.openWindowValue === 'system' || this.openWindowValue === 'settings' || this.openWindowValue === 'developer') {
      if ((this.openWindowValue === 'delve-confirmation' || this.openWindowValue === 'system' || this.openWindowValue === 'settings' || this.openWindowValue === 'developer') && modifiers.pointerType === 'touch' && button === 0) {
        this.chromeRoot.pointer({type:'move',point,button,pointerId:1});
        const hits = this.chromeRoot.input.hits(point);
        const scroll = hits.some(node=>node.kind==='slider') ? undefined : hits.find(node => node.scroll.maxY > 0);
        this.containerSwipe = scroll ? {node:scroll,start:point,offset:scroll.scroll.y,active:false} : undefined;
      }
      this.chromeRoot.pointer({type:'down',point,button,pointerId:1,shiftKey:modifiers.shift}); return true;
    }
    if (this.usesKitContainer()) {
      this.chromeRoot.arrange();
      const hits = this.chromeRoot.input.hits(point);
      if (this.openWindowValue === 'crafting' && this.selectedCraftingRecipeId !== null && !hits.some(node => node.kind === 'list-row' || node.label === 'Recipes')) {
        this.selectedCraftingRecipeId = null;
        (this.containerFrame as UiCraftingFrameElement).updateCrafting(this.craftingSnapshot());
      }
      const control = hits.some(node => node.focusable) || this.chromeRoot.entries().some(({ element }) => element.kind === 'slot'
        && containsPoint(element.rect, point) && containsPoint(element.clip, point));
      const scroll = modifiers.pointerType === 'touch' && button === 0 ? hits.find(node => node.scroll.maxY > 0) : undefined;
      this.containerSwipe = scroll ? { node: scroll, start: point, offset: scroll.scroll.y, active: false } : undefined;
      if (!control && (button === 0 || button === 2) && this.heldCursorStack()) this.inventoryOutsidePress = button === 2 ? 'right' : 'left';
      this.chromeRoot.pointer({ type: 'down', point, button, pointerId: 1, shiftKey: modifiers.shift });
      this.containerTextBridge?.sync();
      return true;
    }
    if ((this.onlinePlayerListActive || this.openWindowValue === null || containsPoint(this.currencyNode.clip, point)) && this.chromeRoot.pointer({ type: 'down', point, button, pointerId: 1 })) return true;
    if (this.openWindowValue === null && this.model.vitals !== undefined
      && containsPoint(this.layout.vitals, point)) {
      if (button === 0) this.openWindow = 'character';
      return true;
    }
    if (this.openWindowValue === null && this.model.targetVitals !== undefined
      && containsPoint(this.layout.targetVitals, point)) return true;
    return false;
  }

  pointerUp(point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    this.pointer = point;
    if (this.blockingUpdatePromptVisible) {
      this.updateRoot.pointer({ type: 'up', point, button, pointerId: 1 });
      return true;
    }
    const swipe = this.containerSwipe; this.containerSwipe = undefined;
    if (swipe?.active) { this.chromeRoot.pointer({ type: 'up', point, button, pointerId: 1 }); return true; }
    if (this.usesKitContainer() && this.inventoryOutsidePress !== null) {
      const outsideButton = this.inventoryOutsidePress; this.inventoryOutsidePress = null;
      if (this.inventoryItemSlotAt(point) === null) {
        if (containsPoint(this.activeWindowRect(), point)) {
          this.cancelQuickCraftPreview(); this.clearOptimisticMenu(); this.callbacks.returnInventoryCursor();
        } else if (this.predictCursorDrop(outsideButton)) this.trackInventoryPrediction(this.callbacks.dropInventoryCursor(outsideButton));
      }
      this.chromeRoot.pointer({ type: 'up', point, button, pointerId: 1, shiftKey: modifiers.shift });
      this.containerController?.refresh(); return true;
    }
    if (this.feedbackPressed) {
      this.feedbackPressed = false;
      this.chromeRoot.pointer({ type: 'up', point, button, pointerId: 1 });
      return true;
    }
    if (this.chromeRoot.pointer({ type: 'up', point, button, pointerId: 1, shiftKey: modifiers.shift })) return true;
    if (this.finishInventoryPointer(modifiers)) return true;
    if (this.inventoryOutsidePress !== null) {
      const outsideButton = this.inventoryOutsidePress;
      this.inventoryOutsidePress = null;
      if (this.inventoryItemSlotAt(point) === null) {
        if (containsPoint(this.activeWindowRect(), point)) {
          this.cancelQuickCraftPreview();
          this.clearOptimisticMenu();
          this.callbacks.returnInventoryCursor();
        } else if (this.predictCursorDrop(outsideButton)) {
          this.trackInventoryPrediction(this.callbacks.dropInventoryCursor(outsideButton));
        }
      }
      return true;
    }
    return false;
  }

  private beginInventoryPointer(slot: ItemSlot, point: UiPoint, button: number): void {
    const cursor = this.heldCursorStack();
    const cursorWasHeld = cursor != null;
    const stack = slot.item;
    const originEligible = cursor !== null && cursor !== undefined && slot.accepts(cursor.itemKind)
      && (stack === null || (itemStacksCompatible(stack, cursor)
        && stack.quantity < this.maxStackFor(cursor.itemKind)));
    this.cursorPress = {
      origin: slot, button: button === 2 ? 'right' : 'left', cursorWasHeld,
      startPoint: point,
      targets: cursorWasHeld && originEligible ? [slot] : [], dragged: false,
      pickedUpDuringDrag: false,
    };
    if (cursorWasHeld && originEligible) this.applyQuickCraftPreview();
  }

  private moveInventoryPointer(point: UiPoint, targetOverride?: ItemSlot | null): void {
    if (this.cursorPress !== null && !this.cursorPress.cursorWasHeld
      && !this.cursorPress.pickedUpDuringDrag && this.cursorPress.origin.item !== null) {
      const dx = point.x - this.cursorPress.startPoint.x;
      const dy = point.y - this.cursorPress.startPoint.y;
      if (dx * dx + dy * dy >= INVENTORY_DRAG_START_DISTANCE * INVENTORY_DRAG_START_DISTANCE
        && this.predictCursorClick(this.cursorPress.origin, this.cursorPress.button)) {
        this.cursorPress.pickedUpDuringDrag = true;
        this.cursorPress.dragged = true;
        this.trackInventoryPrediction(this.callbacks.inventoryCursorClick(
          this.cursorPress.origin.containerId,
          this.cursorPress.origin.index,
          this.cursorPress.button,
        ));
      }
    }
    if (this.cursorPress?.cursorWasHeld) {
      const target = targetOverride === undefined ? this.inventoryItemSlotAt(point) : targetOverride;
      const cursor = this.heldCursorStack();
      const targetStack = target?.item ?? null;
      const targetCompatible = targetStack === null || (cursor !== null && cursor !== undefined
        && itemStacksCompatible(targetStack, cursor)
        && targetStack.quantity < this.maxStackFor(cursor.itemKind));
      if (target !== null && cursor != null && target.accepts(cursor.itemKind) && targetCompatible
        && !this.cursorPress.targets.includes(target)) {
        this.cursorPress.targets.push(target);
        if (target !== this.cursorPress.origin) this.cursorPress.dragged = true;
        if (this.cursorPress.targets.length > 1) this.applyQuickCraftPreview();
      }
    }
  }

  private finishInventoryPointer(modifiers: { readonly shift?: boolean }): boolean {
    if (this.cursorPress !== null) {
      const press = this.cursorPress;
      this.cursorPress = null;
      const pressed = press.origin;
      if (press.pickedUpDuringDrag) {
        this.cancelQuickCraftPreview();
        this.lastCursorClick = null;
      } else if (modifiers.shift && press.button === 'left') {
          this.cancelQuickCraftPreview();
          const sourceContainers = this.quickMoveSourceContainers(pressed.containerId);
          const sourceRegion = sourceContainers.join('|');
          const now = performance.now();
          const previousClick = this.lastShiftClick;
          const secondClickKind = pressed.item?.itemKind
            ?? (press.cursorWasHeld ? previousClick?.itemKind : undefined);
          const doubleClick = secondClickKind !== undefined && previousClick !== null
            && previousClick.sourceRegion === sourceRegion && previousClick.itemKind === secondClickKind
            && now - previousClick.at <= INVENTORY_DOUBLE_CLICK_MS;
          if (doubleClick) {
            const destinations = this.quickMoveDestinations(pressed.containerId);
            this.predictQuickMoveAll(secondClickKind, sourceContainers, destinations);
            this.trackInventoryPrediction(this.callbacks.quickMoveAllInventoryItems(
              secondClickKind, sourceContainers, destinations,
            ));
            this.lastShiftClick = null;
          } else if (pressed.item !== null) {
            const itemKind = pressed.item.itemKind;
            this.callbacks.quickMoveInventoryItem(pressed.containerId, pressed.index, this.quickMoveDestinations(pressed.containerId));
            this.lastShiftClick = { sourceRegion, itemKind, at: now };
          } else {
            this.lastShiftClick = null;
          }
      } else if (press.cursorWasHeld && press.targets.length > 0
        && (press.dragged || press.targets.length > 1)) {
        if (this.quickCraftPreviewCursor === undefined) {
          this.cancelQuickCraftPreview();
          return true;
        }
        this.promoteQuickCraftPreview();
        this.trackInventoryPrediction(this.callbacks.inventoryCursorQuickCraft(
          press.targets.map((slot) => ({ container: slot.containerId, index: slot.index })),
          press.button === 'right' ? 'one_each' : 'even',
        ));
      } else {
        this.cancelQuickCraftPreview();
        const cursor = this.heldCursorStack();
        const now = performance.now();
        const clickedKind = cursor?.itemKind ?? pressed.item?.itemKind;
        const sourceContainers = this.quickMoveSourceContainers(pressed.containerId);
        const sourceRegion = sourceContainers.join('|');
        const previousClick = this.lastCursorClick;
        const doubleClick = press.button === 'left' && clickedKind !== undefined
          && previousClick?.itemKind === clickedKind && previousClick.sourceRegion === sourceRegion
          && now - previousClick.at <= INVENTORY_DOUBLE_CLICK_MS;
        if (doubleClick) {
          if (previousClick.transferCandidate) {
            const destinations = this.quickMoveDestinations(pressed.containerId);
            this.predictQuickMoveAll(clickedKind, sourceContainers, destinations);
            this.trackInventoryPrediction(this.callbacks.quickMoveAllInventoryItems(
              clickedKind, sourceContainers, destinations,
            ));
          } else if (this.predictPickupAll()) {
            this.trackInventoryPrediction(this.callbacks.inventoryCursorPickupAll(this.visibleContainerOrder()));
          }
          this.lastCursorClick = null;
        } else {
          const transferCandidate = cursor !== null && pressed.item !== null
            && itemStacksCompatible(cursor, pressed.item);
          if (this.predictCursorClick(pressed, press.button)) {
            this.trackInventoryPrediction(
              this.callbacks.inventoryCursorClick(pressed.containerId, pressed.index, press.button),
            );
          }
          this.lastCursorClick = press.button !== 'left' || clickedKind === undefined
            ? null
            : { itemKind: clickedKind, sourceRegion, transferCandidate, at: now };
        }
      }
      return true;
    }
    return false;
  }

  /** Connects kit hit testing to the existing authority/prediction pipeline.
   * The host keeps transaction ownership; kit slots own their arranged bounds. */
  createInventoryController(): UiInventoryController {
    const owner = () => this;
    let shift = false;
    const slotAt = (ref: UiInventorySlotRef) => {
      const slots = ref.container === 'hotbar' ? owner().inventoryHotbarSlots
        : ref.container === 'backpack' ? owner().backpackItemSlots
          : ref.container === 'equipment' ? owner().equipmentItemSlots
            : ref.container === 'crafting' ? owner().craftingItemSlots
              : ref.container === 'chest' ? owner().chestItemSlots
                : ref.container === 'placeable' ? owner().placeableItemSlots : [];
      return slots.find(slot => slot.index === ref.index);
    };
    const action = () => ({ ok: true, status: 'Inventory gesture handled' });
    const controller = new UiInventoryController({
      get cursor() { return owner().heldCursorStack() ?? null; },
      get status() { return ''; },
      get dragging() { return owner().cursorPress !== null; },
      stack: ref => slotAt(ref)?.item ?? null,
      displayedCursor: () => owner().cursorPress?.cursorWasHeld && owner().quickCraftPreviewCursor !== undefined
        ? owner().quickCraftOriginalCursor ?? null : owner().heldCursorStack() ?? null,
      canAccept: (ref, item) => { const slot = slotAt(ref), stack = item ?? owner().heldCursorStack(); return Boolean(slot?.enabled && (!stack || slot.accepts(stack.itemKind))); },
      pointerDown(ref, button, options) {
        const slot = slotAt(ref); shift = options?.shift === true;
        if (slot?.enabled) owner().beginInventoryPointer(slot, controller.point, button);
        return action();
      },
      pointerEnter(ref) { const slot = slotAt(ref); if (!slot) return false; owner().moveInventoryPointer(controller.point, slot); return true; },
      pointerMove(point, ref) { owner().moveInventoryPointer(point, ref ? slotAt(ref) ?? null : null); },
      pointerUp(_ref, options) { owner().finishInventoryPointer({ shift: options?.shift ?? shift });
        if (owner().openWindowValue === 'crafting') (owner().containerFrame as UiCraftingFrameElement | undefined)?.updateCrafting(owner().craftingSnapshot());
        return action(); },
      cancel() { owner().cancelQuickCraftPreview(); owner().cursorPress = null; owner().inventoryOutsidePress = null; },
    });
    return controller;
  }

  pointerLeave(): void {
    this.containerSwipe = undefined;
    this.feedbackPressed = false;
    this.updateRoot.pointer({ type: 'cancel', point: this.pointer, button: 0, pointerId: 1 });
    this.updateRoot.input.clearHover();
    this.chromeRoot.pointer({ type: 'cancel', point: this.pointer, button: 0, pointerId: 1 });
    this.chromeRoot.input.clearHover();
    this.systemCursorLeave();
    this.hoveredSlot = null;
    this.cancelQuickCraftPreview();
    this.cursorPress = null;
    this.inventoryOutsidePress = null;
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (!this.blockingUpdatePromptVisible && this.feedbackAtPoint(point)) {
      this.chromeRoot.wheel({ point, deltaX, deltaY }); return true;
    }
    if (this.blockingUpdatePromptVisible) { this.updateRoot.wheel({point,deltaX,deltaY}); return true; }
    if (this.usesKitWindow()) { this.chromeRoot.wheel({ point, deltaX, deltaY }); return true; }
    if ((this.onlinePlayerListActive || this.openWindowValue === null) && this.chromeRoot.wheel({ point, deltaX, deltaY })) return true;
    return false;
  }

  drawHud(context: CanvasRenderingContext2D): void {
    this.chromeRoot.drawInContext(context, performance.now(), undefined, ['base', 'floating']);
  }

  draw(context: CanvasRenderingContext2D): void {
    if (this.usesKitContainer() && this.containerFrame) {
      const text = this.tooltipText();
      if (!this.containerTooltip) { this.containerTooltip = ui.worldHint({ layout: { position: 'fixed', inset: { left: 0, top: 0 }, width: 'grow', height: 'grow' } }); this.containerFrame.append(this.containerTooltip); }
      this.containerTooltip.setProps({ hint: text ? { x: this.pointer.x, y: this.pointer.y - 8,
        title: text, lines: [], tone: 'neutral' } : null });
    }
    if (!this.hudTooltip) {
      this.hudTooltip = ui.hudTooltip({ text: null, anchor: { x: 0, y: 0 } });
      this.chromeRoot.mount(this.hudTooltip);
    }
    this.hudTooltip.updateHudTooltip({
      text: this.openWindowValue === null || this.openWindowValue === 'system' ? this.tooltipText() : null,
      anchor: { x: this.model.width / 2, y: Math.max(0, (this.hudVitals.visible && this.hudVitals.rect.height > 0 ? this.hudVitals.rect.y : this.hudHotbar.rect.y) - 4) },
    });
    this.chromeRoot.drawInContext(context, performance.now(), undefined, ['modal', 'toast']);
  }

  private syncUpdatePrompt(): void {
    if (this.textCanvas) UiTextBridge.setCanvasBlocked(this.textCanvas, this.blockingUpdatePromptVisible);
    this.updateRoot.resize(this.model.width, this.model.height);
    if (!this.blockingUpdatePromptVisible) { this.updateFrame?.dispose(); this.updateFrame = undefined; return; }
    if (!this.updateFrame) {
      this.updateFrame = ui.updateReady({ onRefresh: () => { if (this.blockingUpdatePromptVisible) this.callbacks.applyClientUpdate(); },
        onLater: () => { this.updatePromptDismissed = true; this.syncUpdatePrompt(); } });
      this.updateRoot.mount(this.updateFrame); this.updateRoot.arrange();
      this.updateRoot.focus.set(this.updateRoot.entries().find(entry => entry.element.id === 'update-ready.refresh')?.element ?? null);
    }
    this.updateRoot.arrange();
  }
  /** The kit update root paints last so the decision remains above other dialogs. */
  drawBlockingOverlay(context: CanvasRenderingContext2D): void {
    if (this.blockingUpdatePromptVisible) this.updateRoot.drawInContext(context);
  }

  drawNameplates(context: CanvasRenderingContext2D, labels: readonly {
    readonly id?: string; readonly x: number; readonly y: number; readonly text: string; readonly offline?: boolean;
  }[], viewport: { readonly width: number; readonly height: number } = this.model): void {
    this.nameplateRoot.resize(viewport.width, viewport.height);
    this.nameplateLayer.setProps({ labels });
    this.nameplateRoot.drawInContext(context);
  }

  private syncOnlinePlayers(): void {
    const visible = this.model.onlinePlayersVisible === true;
    this.onlinePlayerListActive = visible;
    if (!visible) {
      if (this.onlinePlayersNode?.visible) this.onlinePlayersNode.setStyle({ visible: false });
      return;
    }
    const players = this.model.onlinePlayers ?? [];
    const entries = players.map((player, index) => ({
      id: player.identityHex ?? `anonymous-${index}`,
      label: `${onlinePlayerListLabel(player)}${player.homesteadRole ? `  [${player.homesteadRole.toUpperCase()}]` : ''}`,
      idle: player.idleMinutes !== null,
      manageable: this.model.canManageHomestead === true && !player.self && player.identityHex !== undefined,
    }));
    if (!this.onlinePlayersNode) this.onlinePlayersNode = this.chromeRoot.mount(ui.onlinePlayers({
      id: 'hud.player-roster', players: entries,
      onClose: () => { this.onlinePlayerListActive = false; this.onlinePlayersNode?.setStyle({ visible: false }); this.callbacks.toggleOnlinePlayers(); },
      onCycleRole: id => {
        const player = this.model.onlinePlayers?.find(player => player.identityHex === id);
        if (player && !player.self && this.model.canManageHomestead) this.callbacks.manageHomesteadMember?.(id, nextHomesteadMemberRole(player.homesteadRole), false);
      },
      onRemove: id => {
        const player = this.model.onlinePlayers?.find(player => player.identityHex === id);
        if (player && !player.self && this.model.canManageHomestead) this.callbacks.manageHomesteadMember?.(id, null, true);
      },
    }));
    const key = JSON.stringify(entries);
    if (key !== this.onlinePlayersKey) { this.onlinePlayersKey = key; this.onlinePlayersNode.setProps({ players: entries }); }
    const width = Math.min(300, Math.max(0, this.model.width - 16));
    const layoutKey = `${this.model.width}:${this.model.height}:${players.length}`;
    if (layoutKey === this.onlinePlayersLayoutKey && this.onlinePlayersNode.visible) return;
    this.onlinePlayersLayoutKey = layoutKey;
    this.onlinePlayersNode.setStyle({ visible: true, zLayer: 'modal', position: 'absolute',
      inset: { left: uiFixed(Math.round((this.model.width - width) / 2)), top: uiFixed(12) },
      width: uiFixed(width), height: uiFixed(Math.max(0, Math.min(this.model.height - 24, 90 + Math.max(1, players.length) * 30))),
    });
  }

  /** Drawn by the scene after every window and overlay. The system cursor is
   * intentionally the final UI composite and therefore cannot be occluded. */
  drawCursorOverlay(context: CanvasRenderingContext2D): void {
    if (this.usesKitContainer()) {
      this.systemCursor?.setStyle({ visible: false });
      this.chromeRoot.drawInContext(context, performance.now(), undefined, ['cursor']); return;
    }
    this.systemCursor ??= this.chromeRoot.mount(ui.systemCursor({ point: () => this.pointer, clickedAt: () => this.clickStartedAt }));
    this.systemCursor.setStyle({ visible: this.model.touchControls !== true && this.pointer.x >= 0 && this.pointer.y >= 0 });
    this.chromeRoot.drawInContext(context, performance.now(), undefined, ['cursor']);
  }

  systemCursorMove(point: UiPoint): void {
    this.pointer = point;
    if (this.containerCursor) this.containerCursor.setStyle({ visible: (this.model.touchControls !== true || Boolean(this.heldCursorStack())) && point.x >= 0 && point.y >= 0 });
  }

  systemCursorDown(point: UiPoint): void {
    this.pointer = point;
    this.clickStartedAt = performance.now();
  }

  systemCursorLeave(): void {
    // Touch pointers commonly emit pointerleave immediately after a tap. Keep
    // the last touch position so a held stack remains visible and movable.
    if (this.model.touchControls !== true) { this.pointer = { x: -100, y: -100 }; this.containerCursor?.setStyle({ visible: false }); }
  }

  private syncZoneChrome(): void {
    const watch = hasEquippedWatch(this.model.inventory);
    const key = JSON.stringify([this.model.width, this.zoneCollapsed, this.model.zoneName, this.model.playerCount,
      watch, watch ? this.model.timeLabel : '', watch ? this.model.dateLabel : '', watch ? this.model.moonPhase : '']);
    if (key === this.zoneChromeKey) return;
    this.zoneChromeKey = key;
    const focus = this.chromeRoot.focus.current, source = this.chromeRoot.focus.inputSource;
    const restore = focus && this.zoneChrome && focus.isDescendantOf(this.zoneChrome) ? focus.id : undefined;
    if (this.zoneChrome) { this.chromeRoot.unmount(this.zoneChrome); this.zoneChrome.dispose(); }
    const rect = this.zoneCollapsed ? this.layout.collapsedZoneTab : this.layout.status;
    this.zoneChrome = this.chromeRoot.mount(ui.zoneHeader({ title: this.model.zoneName ?? 'Overworld',
      collapsed: this.zoneCollapsed, onlineCount: this.model.playerCount,
      watch: watch ? { time: this.model.timeLabel, date: this.model.dateLabel,
        moon: this.model.moonPhase ? MOON_PHASE_LABELS[this.model.moonPhase] : 'Moon unknown' } : undefined,
      onToggle: () => { this.zoneCollapsed = !this.zoneCollapsed; this.syncZoneChrome(); },
      onPlayers: () => this.callbacks.toggleOnlinePlayers(),
      layout: { position: 'absolute', inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) },
        width: uiFixed(rect.width), height: uiFixed(this.zoneCollapsed ? rect.height : rect.height + (watch ? 20 : 0)) },
    }));
    this.chromeRoot.arrange();
    if (restore) this.chromeRoot.focus.set(this.chromeRoot.entries().find(entry => entry.element.id === restore)?.element ?? null, source);
  }

  private syncMinimapChrome(): void {
    const key = JSON.stringify([this.model.width, this.minimapCollapsed, this.minimapZoomIndex]);
    if (key === this.minimapChromeKey) return;
    this.minimapChromeKey = key;
    const focus = this.chromeRoot.focus.current, source = this.chromeRoot.focus.inputSource;
    const restore = focus && this.minimapChrome && focus.isDescendantOf(this.minimapChrome) ? focus.id : undefined;
    if (this.minimapChrome) { this.chromeRoot.unmount(this.minimapChrome); this.minimapChrome.dispose(); }
    const rect = this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap;
    this.minimapChrome = this.chromeRoot.mount(ui.minimap({ collapsed: this.minimapCollapsed, zoom: this.minimapZoomIndex + 1,
      onToggle: () => { this.minimapCollapsed = !this.minimapCollapsed; this.syncMinimapChrome(); },
      onZoom: zoom => { this.minimapZoomIndex = zoom - 1; this.syncMinimapChrome(); },
      render: (context, bounds) => this.drawMinimap(context, bounds, this.minimapZoomIndex + 1, this.model.minimapTrackingEnabled === true),
      layout: { position: 'absolute', inset: { left: uiFixed(Math.max(0, rect.x)), top: uiFixed(rect.y) }, width: uiFixed(rect.width), height: uiFixed(rect.height) },
    }));
    this.chromeRoot.arrange();
    if (restore) this.chromeRoot.focus.set(this.chromeRoot.entries().find(entry => entry.element.id === restore)?.element ?? null, source);
  }

  private chromeAtPoint(id: string): boolean {
    this.chromeRoot.arrange();
    return this.chromeRoot.entries().some(({ element }) => element.id === id && containsPoint(element.rect, this.pointer) && containsPoint(element.clip, this.pointer));
  }

  private activeWindowRect(): UiRect {
    this.chromeRoot.arrange();
    return this.containerFrame?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  private activeFrameDefinition(window: OverworldWindow | null = this.openWindowValue): FrameContentDefinition | null {
    if (window === null) return null;
    const registry = this.model.contentRegistry;
    const entityWindow = window === 'content' || window === 'chest' || window === 'barrel'
      || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
    if (entityWindow && this.model.activeFrameId !== undefined) {
      const selected = registry?.frames.get(this.model.activeFrameId);
      if (selected?.presentation?.surface === 'entity') return selected;
    }
    const surface: FrameSurface | null = window === 'inventory' || window === 'pack'
      ? 'inventory' : window === 'crafting' ? 'crafting' : null;
    return surface === null || registry === undefined ? null : contentFrameDefinitionForSurface(registry.frames, surface);
  }

  /** Keep the active modal's hit targets in lockstep with its visual state. */
  private syncActiveWindow(): void {
    this.hudGroup.setStyle({ visible: !this.isInventoryWindow(this.openWindowValue) });
    this.mobileMenuNode.setStyle({ visible: (this.model.touchControls === true || this.model.width < 420) && this.openWindowValue === null });
    this.craftingNode.setStyle({ visible: this.openWindowValue === null });
    for (const slot of [
      ...this.inventoryHotbarSlots, ...this.backpackItemSlots, ...this.equipmentItemSlots,
      ...this.craftingItemSlots, ...this.chestItemSlots, ...this.placeableItemSlots,
    ]) slot.visible = false;
    this.syncContainerWindow();
    this.syncStatisticsWindow();
    this.syncCharacterWindow();
    this.syncSkillsWindow();
    this.syncQuestWindow();
    this.syncHelpWindow();
    this.syncGameMenu();
    this.syncDelveConfirmation();
    this.syncSettingsWindow();
    this.syncDeveloperWindow();
  }

  private usesKitWindow(): boolean { return this.usesKitContainer() || this.openWindowValue === 'delve-confirmation' || this.openWindowValue === 'statistics' || this.openWindowValue === 'character' || this.openWindowValue === 'skills' || this.openWindowValue === 'quests' || this.openWindowValue === 'help' || this.openWindowValue === 'system' || this.openWindowValue === 'settings' || this.openWindowValue === 'developer'; }

  private syncDeveloperWindow(): void {
    if(this.openWindowValue!=='developer'||!this.model.canAdministerWorld){this.developerFrame?.dispose();this.developerFrame=undefined;return;}
    if(!this.developerFrame){
      this.developerFrame=ui.developer({model:this.model,tab:this.developerTab,layout:{position:'fixed',zLayer:'modal'},onTab:tab=>{this.developerTab=tab;},
        onTime:value=>this.callbacks.setTimeFraction(value),onBack:()=>{this.openWindow='system';},onAction:action=>{
          if(action==='previous-day')this.callbacks.shiftDay(-1);else if(action==='next-day')this.callbacks.shiftDay(1);
          else if(action==='weather')this.callbacks.cycleWeather();else if(action==='wind')this.callbacks.cycleWindDirection();
          else if(action==='lighting-effects')this.callbacks.toggleLightingEffects();else this.callbacks.toggleCellarOrePreview?.();
        }});this.chromeRoot.mount(this.developerFrame);
    }
    if(this.developerFrame.selectedTab!==this.developerTab)this.developerFrame.selectDeveloperTab(this.developerTab);
    this.developerFrame.updateDeveloper(this.model);
    this.developerFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});
    this.chromeRoot.arrange();
  }

  private syncSettingsWindow(): void {
    if (this.openWindowValue !== 'settings') { this.settingsFrame?.dispose(); this.settingsFrame = undefined; return; }
    if (!this.settingsFrame) {
      this.settingsFrame = ui.settings({model:this.model,tab:this.settingsTab,layout:{position:'fixed',zLayer:'modal'},
        onTab:tab=>{this.settingsTab=tab;},onVolume:(bus,value)=>this.callbacks.setAudioVolume(bus,value),onMute:bus=>this.toggleAudioMute(bus),
        onBackground:(bus,value)=>this.callbacks.setAudioBackground(bus,value),onNameplates:value=>this.callbacks.setNameplatesVisible?.(value),
        onLighting:value=>this.callbacks.setLightingModel?.(value),onBack:()=>{this.openWindow='system';}});
      this.chromeRoot.mount(this.settingsFrame);
    }
    if(this.settingsFrame.selectedTab!==this.settingsTab)this.settingsFrame.selectSettingsTab(this.settingsTab);
    this.settingsFrame.updateSettings(this.model);
    this.settingsFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});
    this.chromeRoot.arrange();
  }

  private syncDelveConfirmation(): void {
    if (this.openWindowValue !== 'delve-confirmation') { this.delveConfirmationFrame?.dispose(); this.delveConfirmationFrame = undefined; return; }
    if (!this.delveConfirmationFrame) {
      this.delveConfirmationFrame = ui.delveConfirmation({ onBegin: () => this.confirmDelve(), onCancel: () => { this.openWindow = null; } });
      this.chromeRoot.mount(this.delveConfirmationFrame);
      this.delveConfirmationFrame.focusBegin();
    }
    this.chromeRoot.arrange();
  }

  private syncGameMenu(): void {
    if (this.openWindowValue !== 'system') { this.menuFrame?.dispose(); this.menuFrame = undefined; return; }
    if (!this.menuFrame) {
      this.menuFrame = ui.gameMenu({ model: this.model, layout: { position: 'fixed', zLayer: 'modal' }, onAction: action => {
        if (action === 'resume') this.openWindow = null;
        else if (action === 'settings' || action === 'help' || action === 'developer') this.openWindow = action;
        else if (action === 'fullscreen') this.callbacks.toggleFullscreen();
        else if (action === 'check-update') this.callbacks.checkForClientUpdate();
        else if (action === 'apply-update') this.callbacks.applyClientUpdate();
        else if (action === 'exit-delve') { this.openWindow = null; this.callbacks.exitDelve(); }
        else if (action === 'sign-out') this.callbacks.signOut();
        else if (action === 'quit') this.callbacks.quitToTitle();
      } });
      this.chromeRoot.mount(this.menuFrame);
    }
    this.menuFrame.updateGameMenu(this.model);
    const count = 6 + Number(this.model.canAdministerWorld === true) + Number(this.model.delveActive === true)
      + Number(this.model.pwaUpdateStatus !== undefined && this.model.pwaUpdateStatus !== 'unsupported');
    const width = Math.max(0, Math.min(220, this.model.width - 16));
    const height = Math.max(0, Math.min(60 + count * 28, this.model.height - 16));
    this.menuFrame.setStyle({ inset: { left: uiFixed(Math.max(0, (this.model.width - width) / 2)), top: uiFixed(Math.max(0, (this.model.height - height) / 2)) }, width: uiFixed(width), height: uiFixed(height) });
    this.chromeRoot.arrange();
  }

  private syncHelpWindow(): void {
    if(this.openWindowValue!=='help'){this.helpFrame?.dispose();this.helpFrame=undefined;this.helpViewport='';return;}
    if(!this.helpFrame){this.helpFrame=ui.helpBook({onClose:()=>{this.openWindow='system';},layout:{position:'fixed',zLayer:'modal'}});this.chromeRoot.mount(this.helpFrame);}
    const viewport=`${this.model.width}:${this.model.height}`;
    if(viewport!==this.helpViewport){this.helpViewport=viewport;this.helpFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});}
    this.chromeRoot.arrange();
  }

  private syncQuestWindow(): void {
    if(this.openWindowValue!=='quests'){if(this.questFrame)this.selectedQuest=this.questFrame.selectedQuest;this.questFrame?.dispose();this.questFrame=undefined;this.questViewport='';return;}
    const entries=this.model.quests??[];
    if(!this.questFrame){this.questFrame=ui.questLog({entries,selected:this.selectedQuest,setPinned:(id,pinned)=>this.callbacks.setQuestPinned(id,pinned),drop:id=>this.callbacks.abandonQuest(id),onClose:()=>{this.openWindow=null;},layout:{position:'fixed',zLayer:'modal'}});this.chromeRoot.mount(this.questFrame);}
    this.questFrame.updateQuests(entries);
    const viewport=`${this.model.width}:${this.model.height}`;
    if(viewport!==this.questViewport){this.questViewport=viewport;this.questFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});}
    this.chromeRoot.arrange();
  }

  private syncSkillsWindow(): void {
    if(this.openWindowValue!=='skills'){if(this.skillsFrame)this.selectedSkillTrack=this.skillsFrame.selectedTrack;this.skillsFrame?.dispose();this.skillsFrame=undefined;this.skillsViewport='';return;}
    const model=this.model.skills??{tracks:[],ranks:[],balanceBronze:0n};
    if(!this.skillsFrame){this.skillsFrame=ui.skills({model,track:this.selectedSkillTrack,artwork:this.skin.skillIcons,purchase:id=>this.callbacks.purchaseSkillNode?.(id),reset:track=>this.callbacks.resetSkillTree?.(track),onClose:()=>{this.openWindow=null;},onNavigate:page=>{this.openWindow=page;},layout:{position:'fixed',zLayer:'modal'}});this.chromeRoot.mount(this.skillsFrame);}
    this.skillsFrame.updateSkills(model);
    const viewport=`${this.model.width}:${this.model.height}`;
    if(viewport!==this.skillsViewport){this.skillsViewport=viewport;this.skillsFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});}
    this.chromeRoot.arrange();
  }

  private syncCharacterWindow(): void {
    if(this.openWindowValue!=='character'){this.characterLoadingFrame?.dispose();this.characterLoadingFrame=undefined;this.characterFrame?.dispose();this.characterFrame=undefined;this.characterViewport='';return;}
    const model=this.model.character;
    if(!model){
      if(!this.characterLoadingFrame)this.characterLoadingFrame=this.chromeRoot.mount(ui.frame({header:{title:'CHARACTER',closable:true,onClose:()=>{this.openWindow=null;}},layout:{position:'fixed',zLayer:'modal'},children:[ui.flex({direction:'row',gap:4},(['character','skills','statistics']as const).map(page=>ui.button({label:page.toUpperCase(),size:'sm',onPress:()=>{this.openWindow=page;}}))),ui.text('Waiting for character data.')] }));
      this.characterLoadingFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});this.chromeRoot.arrange();return;
    }
    this.characterLoadingFrame?.dispose();this.characterLoadingFrame=undefined;
    if(!this.characterFrame){this.characterFrame=ui.character({model,artwork:this.itemArt as Readonly<Record<string,LoadedAsset>>,renderPortrait:this.drawCharacterPortrait,onAppearance:value=>this.callbacks.setAppearance?.(value),onClose:()=>{this.openWindow=null;},onNavigate:page=>{this.openWindow=page;},layout:{position:'fixed',zLayer:'modal'}});this.chromeRoot.mount(this.characterFrame);}
    this.characterFrame.updateCharacter(model);
    const viewport=`${this.model.width}:${this.model.height}`;
    if(viewport!==this.characterViewport){this.characterViewport=viewport;this.characterFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))});}
    this.chromeRoot.arrange();
  }

  private syncStatisticsWindow(): void {
    if (this.openWindowValue !== 'statistics') { this.statisticsFrame?.dispose(); this.statisticsFrame = undefined; this.statisticsViewport = ''; return; }
    if (!this.statisticsFrame) { this.statisticsFrame = ui.statistics({ model: this.model.statistics ?? {statistics:[]}, onClose:()=>{this.openWindow=null;}, onNavigate:page=>{this.openWindow=page;}, layout:{position:'fixed',zLayer:'modal'} }); this.chromeRoot.mount(this.statisticsFrame); }
    this.statisticsFrame.updateStatistics(this.model.statistics ?? {statistics:[]});
    const viewport = `${this.model.width}:${this.model.height}`;
    if (viewport !== this.statisticsViewport) { this.statisticsViewport=viewport; this.statisticsFrame.setStyle({inset:{left:8,top:8},width:uiFixed(Math.max(0,this.model.width-16)),height:uiFixed(Math.max(0,this.model.height-16))}); }
    this.chromeRoot.arrange();
  }

  private usesKitContainer(): boolean { return this.isInventoryWindow(this.openWindowValue); }

  private containerProgress(): number {
    return this.model.activeFrameProgress ?? (this.openWindowValue === 'barrel' ? this.model.barrelProgress
      : this.openWindowValue === 'furnace' ? this.model.furnaceProgress
        : this.openWindowValue === 'cooking' ? this.model.cookingFireProgress : this.model.cellarProcessorProgress) ?? 0;
  }

  private containerStatus(): string | undefined {
    const seconds = this.openWindowValue === 'furnace' ? this.model.furnaceRemainingSeconds
      : this.openWindowValue === 'cooking' ? this.model.cookingFireRemainingSeconds : this.model.cellarProcessorRemainingSeconds;
    const status = this.openWindowValue === 'furnace' ? seconds != null ? 'SMELTING' : 'ADD INPUTS'
      : this.openWindowValue === 'cooking' ? this.model.cookingFireLit === false ? 'PRESS F TO LIGHT' : seconds != null ? 'COOKING' : 'ADD RAW FOOD'
        : this.openWindowValue === 'press' ? seconds != null ? 'PRESSING FRUIT' : 'ADD FRUIT'
          : this.openWindowValue === 'fermentation' ? seconds != null ? 'FERMENTING' : 'ADD 3 MUST' : undefined;
    if (this.openWindowValue === 'barrel') return (this.model.activeFrameState?.['sealed'] ?? this.model.barrelSealed)
      ? `CURING ${Math.floor(Math.max(0, Math.min(1, this.containerProgress())) * 100)}%` : '[S] SEAL 4–24 MATCHING CROPS';
    if (!status) return undefined;
    const product = this.openWindowValue === 'fermentation' ? ` · ${(this.model.cellarProductLabel ?? 'BOTTLES').toUpperCase()}` : '';
    return `${status}${seconds != null ? ` ${processorCountdownLabel(seconds)}` : ''}${product}`;
  }

  private syncContainerWindow(): void {
    if (!this.usesKitContainer()) {
      if (this.containerFrame) { this.containerFrame.dispose(); this.containerFrame = undefined; }
      if (this.containerCursor) { this.containerCursor.dispose(); this.containerCursor = undefined; }
      if (this.containerTooltip) { this.containerTooltip.dispose(); this.containerTooltip = undefined; }
      this.containerSwipe = undefined; this.containerTextBridge?.sync();
      this.containerDefinition = undefined; return;
    }
    const registry = this.model.contentRegistry ?? bootstrapContentRegistry();
    const inventory = this.openWindowValue === 'inventory', barrel = this.openWindowValue === 'barrel';
    const fallbackId = inventory ? 'frame:pack' : `frame:${this.openWindowValue}`;
    const definition = (inventory ? contentFrameDefinitionForSurface(registry.frames, 'inventory')
      : this.activeFrameDefinition() ?? registry.frames.get(fallbackId)) ?? registry.frames.get(fallbackId) ?? UNAVAILABLE_CONTAINER_FRAME;
    const aliases = { entity: this.openWindowValue === 'chest' ? 'chest' : 'placeable', backpack: 'backpack', equipment: 'equipment', hotbar: 'hotbar', crafting: 'crafting' };
    const state = inventory ? this.model.inventoryFrameState ?? {} : { ...(barrel ? { sealed: this.model.barrelSealed ?? false } : {}), ...this.model.activeFrameState, ...(definition === UNAVAILABLE_CONTAINER_FRAME ? { frameError: 'This container has no available frame definition. Close it and try again.' } : {}) };
    const collections: Readonly<Record<string, readonly ItemSlot[]>> = { chest: this.chestItemSlots, placeable: this.placeableItemSlots, backpack: this.backpackItemSlots, hotbar: this.inventoryHotbarSlots, equipment: this.equipmentItemSlots, crafting: this.craftingItemSlots };
    for (const pane of definition.panes) for (const binding of resolveFramePaneSlots(pane, aliases, registry)) {
      const slot = collections[binding.containerId]?.find(slot => slot.index === binding.index);
      if (slot) this.bindSlotRestriction(slot, binding.restriction);
      if (slot) slot.visible = contentFramePaneVisible(pane, state);
    }
    this.containerController ??= this.createInventoryController();
    if (!this.containerFrame || definition !== this.containerDefinition) {
      this.containerFrame?.dispose(); this.containerTooltip = undefined; this.containerDefinition = definition; this.containerViewportKey = '';
      const options: UiContentFrameOptions = { definition,
        aliases,
        registry, controller: this.containerController,
        artwork: this.itemArt as Readonly<Record<string, LoadedAsset>>, state,
        iconAnimation: item => itemIconAnimation(item.itemKind, this.model.contentRegistry),
        progress: () => this.containerProgress(),
        inventoryControls: { ...(barrel ? { placeable: { onSort: () => { this.cancelQuickCraftPreview(); this.trackInventoryPrediction(this.callbacks.sortInventoryContainer('placeable')); } } } : {}), chest: { onSort: () => { this.cancelQuickCraftPreview(); this.trackInventoryPrediction(this.callbacks.sortInventoryContainer('chest')); } }, backpack: { filter: this.inventoryFilterText,
          onFilter: value => { this.inventoryFilterText = value; },
          itemLabel: item => this.itemDefinition(item.itemKind)?.displayName ?? item.itemKind,
          capacity: () => this.model.backpackSlotCapacity ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS),
          onSort: () => { this.cancelQuickCraftPreview(); this.trackInventoryPrediction(this.callbacks.sortInventoryContainer('backpack')); },
        } }, onInvoke: action => this.callbacks.frameAction?.(action), onClose: () => { this.openWindow = null; },
        status: this.containerStatus() ? { label: this.containerStatus()!, ...(barrel ? { progress: () => this.containerProgress() } : {}) } : undefined,
        layout: { position: 'fixed', zLayer: 'modal' },
      };
      this.containerFrame = this.openWindowValue === 'crafting' ? ui.craftingFrame({ ...options, crafting: this.craftingSnapshot(), recipeFilter: this.recipeFilterText,
        onRecipe: id => { this.selectCraftingRecipe(id); this.syncContainerWindow(); },
        onRecipeFilter: query => { this.recipeFilterText = query; this.syncContainerWindow(); },
        onCraft: all => { const id = this.currentRecipeId(); if (id && !this.currentRecipeLocked()) this.callbacks.craftInventoryRecipe(id, all); },
      }) : ui.contentFrame(options);
      this.chromeRoot.mount(this.containerFrame);
    }
    this.containerFrame.updateState(state);
    if (this.openWindowValue === 'crafting') (this.containerFrame as UiCraftingFrameElement).updateCrafting(this.craftingSnapshot());
    const width = Math.max(0, Math.min(760, this.model.width - 16)), height = Math.max(0, Math.min(520, this.model.height - 16));
    const viewportKey = `${this.model.width}:${this.model.height}`;
    if (viewportKey !== this.containerViewportKey) {
      this.containerViewportKey = viewportKey;
      this.containerFrame.setStyle({ inset: { left: uiFixed(Math.max(0, Math.round((this.model.width - width) / 2))), top: uiFixed(8) }, width: uiFixed(width), height: uiFixed(height) });
    }
    this.containerCursor ??= this.chromeRoot.mount(ui.cursor({ controller: this.containerController, artwork: this.itemArt as Readonly<Record<string, LoadedAsset>>, point: () => this.pointer }));
    this.containerCursor.setStyle({ visible: (this.model.touchControls !== true || Boolean(this.heldCursorStack())) && this.pointer.x >= 0 && this.pointer.y >= 0 });
    this.containerController.refresh(); this.chromeRoot.arrange(); this.containerTextBridge?.sync();
    for (const { element } of this.chromeRoot.entries()) {
      if (element.id === `${definition.id}.status`) {
        const text = this.containerStatus() ?? '';
        if (element.props['text'] !== text) element.setProps({ text });
      }
      const binding = element.props['binding'] as UiInventorySlotRef | undefined;
      if (element.kind === 'slot' && binding) {
        const slot = collections[binding.container]?.find(candidate => candidate.index === binding.index);
        if (slot) { slot.setBounds(element.rect); slot.visible = true; }
      }
      if (element.kind === 'slot' && binding?.container === 'hotbar') {
        const selected = binding.index === this.model.selectedSlot;
        if (element.props['selected'] !== selected) element.setProps({ selected }, false);
      }
    }
  }

  /** The game already owns pointer routing and its HUD transform. Bind only
   * native text editing here; do not install a second canvas input router. */
  bindTextInput(canvas: HTMLCanvasElement, clientRect: (rect: UiRect) => UiRect): void {
    this.textCanvas = canvas; UiTextBridge.setCanvasBlocked(canvas, this.blockingUpdatePromptVisible);
    this.containerTextBridge?.dispose();
    this.containerTextBridge = new UiTextBridge(canvas, () => this.usesKitContainer() ? this.chromeRoot.focus.current : null,
      event => event.key === 'Escape' ? this.handleKeyDown('Escape', false) : this.chromeRoot.key(event),
      node => clientRect(node.rect), () => this.chromeRoot.invalidate());
    for (const type of ['keydown', 'keyup'] as const) this.containerTextBridge.input.addEventListener(type, event => event.stopPropagation());
  }

  private bindSlotRestriction(slot: ItemSlot, pane: SlotRestriction | undefined): void {
    const equipment = slot.containerId === 'equipment' ? EQUIPMENT_SLOT_RESTRICTIONS[slot.index] : undefined;
    slot.setRestriction(equipment ? {
      acceptedKinds: equipment.acceptedKinds?.filter(kind => !pane?.acceptedKinds || pane.acceptedKinds.includes(kind)) ?? pane?.acceptedKinds,
      requiredTags: [...equipment.requiredTags ?? [], ...pane?.requiredTags ?? []],
      readOnly: equipment.readOnly || pane?.readOnly,
    } : pane);
  }

  private vitalAtPoint(node: UiElement): UiVitalKind | null {
    const entry = this.hudRoot.entries().find(({ element }) => element.isDescendantOf(node)
      && element.props['resource'] !== undefined && containsPoint(element.rect, this.pointer)
      && containsPoint(element.clip, this.pointer));
    return entry?.element.props['resource'] as UiVitalKind | undefined ?? null;
  }

  private syncNotification(): void {
    const { toast, toastId, toastKind, toastDurationMs } = this.model;
    // Event IDs let the kit retain a hovered/focused toast after the host's
    // legacy tick counter elapses, and reopen identical consecutive messages.
    if (toast === null) {
      if (toastId === undefined) { this.notificationNode?.close(); this.notificationKey = ''; }
      return;
    }
    const key = toastId === undefined ? `${toastKind}:${toast}` : `event:${toastId}`;
    if (key === this.notificationKey) return;
    this.notificationNode?.dispose(); this.notificationKey = key;
    this.notificationNode = ui.toast({ id: 'hud.notification', message: toast,
      tone: toastKind === 'failure' ? 'danger' : toastKind ?? 'info', duration: toastDurationMs,
    });
    this.chromeRoot.mount(this.notificationNode); this.notificationNode.open();
  }

  notificationText(): string | null {
    return this.notificationNode?.visible ? this.notificationNode.label : null;
  }

  private syncSkillNotice(): void {
    const notice = this.model.skillPointNotice;
    const key = notice ? `${notice.track}:${notice.points}` : '';
    if (key !== this.skillNoticeKey) {
      this.skillNoticeNode?.dispose(); this.skillNoticeNode = undefined; this.skillNoticeKey = key;
      if (notice) this.skillNoticeNode = this.chromeRoot.mount(ui.actionNotice({ id: 'hud.skill-notice', tone: 'success',
        message: `${notice.points} NEW ${notice.track.toUpperCase()} SKILL ${notice.points === 1 ? 'POINT' : 'POINTS'} · OPEN`,
        onOpen: () => { this.openSkillTrack(notice.track); this.callbacks.dismissSkillPointNotice?.(); },
        onDismiss: () => this.callbacks.dismissSkillPointNotice?.(),
        layout: { position: 'fixed', zLayer: 'toast' },
      }));
    }
    const width = Math.max(0, Math.min(400, this.model.width - 12));
    this.skillNoticeNode?.setStyle({ width: uiFixed(width), inset: {
      left: uiFixed(Math.max(0, Math.round((this.model.width - width) / 2))),
      top: uiFixed(Math.max(0, this.layout.notification.y - 48)),
    } });
  }

  private feedbackAtPoint(point: UiPoint): boolean {
    this.chromeRoot.arrange();
    const hits = new Set(this.chromeRoot.input.hits(point));
    return this.chromeRoot.entries().some(entry => entry.layer === 'toast' && hits.has(entry.element));
  }

  pointerFeedbackDown(point: UiPoint, button: number): boolean {
    if (this.blockingUpdatePromptVisible) return false;
    if (!this.feedbackAtPoint(point)) return false;
    this.feedbackPressed = true;
    this.chromeRoot.pointer({ type: 'down', point, button, pointerId: 1 });
    return true;
  }

  skillPointNoticeLayout(): { readonly frame: UiRect; readonly dismiss: UiRect } | null {
    if (!this.skillNoticeNode) return null;
    this.chromeRoot.arrange();
    const entries = this.chromeRoot.entries();
    const open = entries.find(entry => entry.element.id === 'hud.skill-notice:open')!.element;
    const dismiss = entries.find(entry => entry.element.id === 'hud.skill-notice:dismiss')!.element;
    return { frame: open.rect, dismiss: dismiss.rect };
  }

  tooltipText(): string | null {
    if (this.openWindowValue === null) {
      if (this.chromeAtPoint('hud.crafting')) return 'CRAFTING';
      if (this.chromeAtPoint('hud.currency-inventory')) return 'BACKPACK';
      if (this.chromeAtPoint('hud.online-players')) return 'ONLINE PLAYERS';
      if (this.zoneCollapsed && this.chromeAtPoint('hud.zone')) return 'EXPAND ZONE NAME';
      if (!this.zoneCollapsed && hasEquippedWatch(this.model.inventory)
        && containsPoint(this.layout.watchStatus, this.pointer)) {
        return watchStatusLabel(this.model.timeLabel, this.model.dateLabel, this.model.moonPhase).toUpperCase();
      }
    }
    if (this.openWindowValue === 'crafting') {
      const row = this.chromeRoot.input.hits(this.pointer).find(node => node.kind === 'list-row');
      const hoveredRecipe = this.recipeBookEntries().find(entry => entry.recipeId === row?.props['key']);
      if (hoveredRecipe?.stationAvailable === false && hoveredRecipe.requiredStation !== null) {
        return this.craftingStationRequirement(hoveredRecipe.requiredStation);
      }
      if (hoveredRecipe?.skillAvailable === false) return this.recipeSkillRequirement(hoveredRecipe.recipeId);
      if (this.kitCraftingResultAt(this.pointer) && this.currentRecipeLocked()) {
        const station = this.recipeDefinition(this.currentRecipeId() ?? '')?.station;
        if (station !== undefined && !(this.model.nearbyCraftingStations ?? []).includes(station)) {
          return this.craftingStationRequirement(station);
        }
        return this.recipeSkillRequirement(this.currentRecipeId() ?? '');
      }
    }
    const item = this.hoveredItem();
    if (item !== null) {
      const label = this.itemDefinition(item.itemKind)?.displayName.toUpperCase()
        ?? item.itemKind.replaceAll('_', ' ').toUpperCase();
      const durability = this.durabilityDefinition(item.itemKind);
      return durability === null ? label : `${label}  ${item.durability ?? 0}/${durability.maximum}`;
    }

    if (this.openWindowValue === null && this.model.vitals) {
      const resource = this.vitalAtPoint(this.hudVitals);
      if (resource !== null) {
        const entries = {
          health: ['HEALTH', this.model.vitals.health, this.model.vitals.maxHealth],
          mana: ['MANA', this.model.vitals.mana, this.model.vitals.maxMana],
          vigour: ['VIGOUR', this.model.vitals.vigour, this.model.vitals.maxVigour],
        } as const;
        const [name, current, maximum] = entries[resource];
        return `${name}  ${(current / 100).toFixed(1)}/${(maximum / 100).toFixed(1)}`;
      }
    }
    if (this.openWindowValue === null && this.model.targetVitals) {
      const target = this.model.targetVitals;
      const resource = this.vitalAtPoint(this.hudTargetVitals);
      const values = resource === 'health' ? ['HEALTH', target.health, target.maxHealth] as const
        : resource === 'mana' && target.mana !== undefined && target.maxMana !== undefined
          ? ['MANA', target.mana, target.maxMana] as const
          : resource === 'vigour' && target.vigour !== undefined && target.maxVigour !== undefined
            ? ['VIGOUR', target.vigour, target.maxVigour] as const : null;
      if (values !== null) {
        const [name, current, maximum] = values;
        return `${target.displayName.toUpperCase()}  ${name}  ${Math.round(current)}/${Math.round(maximum)}`;
      }
    }
    return this.openWindowValue === null ? this.model.prompt : null;
  }

  private hoveredItem(): ItemStack | null {
    if (this.usesKitContainer()) return this.kitCraftingResultAt(this.pointer) ? this.recipeOutput(this.currentRecipeId() ?? '') : this.inventoryItemSlotAt(this.pointer)?.item ?? this.hoveredCraftingGhostItem();
    if (this.hoveredSlot === null) return null;
    const hovered = this.model.inventory.find((item) => item.slot === this.hoveredSlot);
    return hovered && hovered.itemKind !== 'empty' && hovered.quantity > 0 ? hovered : null;
  }

  private inventoryItemSlotAt(point: UiPoint): ItemSlot | null {
    if (this.usesKitContainer() && this.containerFrame) {
      this.chromeRoot.arrange();
      const binding = this.chromeRoot.input.hits(point).find(node => node.kind === 'slot')?.props['binding'] as UiInventorySlotRef | undefined;
      return binding ? this.visibleItemSlots().find(slot => slot.containerId === binding.container && slot.index === binding.index && slot.enabled) ?? null : null;
    }
    return null;
  }

  private isInventoryWindow(window: OverworldWindow | null): boolean {
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'content' || window === 'chest' || window === 'barrel' || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.activeFrameDefinition() !== null) {
      return [
        ...this.inventoryHotbarSlots, ...this.backpackItemSlots, ...this.equipmentItemSlots,
        ...this.craftingItemSlots, ...this.chestItemSlots, ...this.placeableItemSlots,
      ].filter((slot) => slot.visible);
    }
    if (this.openWindowValue === 'inventory') return [...this.equipmentItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'crafting') return [...this.craftingItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'chest') return [...this.chestItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation') {
      return [...this.placeableItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    }
    return [];
  }

  private craftingSnapshot(): UiCraftingSnapshot {
    const matched = this.currentRecipeId();
    const recipe = this.recipeDefinition(matched ?? '');
    const requirement = this.currentRecipeLocked()
      ? recipe?.station && !(this.model.nearbyCraftingStations ?? []).includes(recipe.station)
        ? this.craftingStationRequirement(recipe.station) : this.recipeSkillRequirement(matched ?? '') ?? 'SKILL REQUIRED'
      : undefined;
    return { selected: this.selectedCraftingRecipeId,
      recipes: this.recipeBookEntries().map(entry => ({ id: entry.recipeId,
        label: `${entry.outputQuantity} ${this.itemDefinition(entry.outputKind)?.displayName ?? entry.outputKind}`,
        detail: !entry.stationAvailable && entry.requiredStation ? this.craftingStationRequirement(entry.requiredStation)
          : !entry.skillAvailable ? this.recipeSkillRequirement(entry.recipeId) ?? 'SKILL REQUIRED'
            : entry.missingIngredients ? 'MISSING INGREDIENTS' : 'READY',
      })),
      pattern: this.selectedCraftingRecipeId ? craftingRecipePattern(this.selectedCraftingRecipeId, this.model.knownRecipeIds ?? [], this.model.contentRegistry) ?? [] : [],
      output: this.recipeOutput(matched ?? ''), requirement,
    };
  }

  private kitCraftingResultAt(point: UiPoint): boolean {
    return this.openWindowValue === 'crafting' && this.chromeRoot.entries().some(({ element }) => element.label === 'Craft result' && containsPoint(element.rect, point) && containsPoint(element.clip, point));
  }

  private currentRecipeId(): string | null {
    const grid = { id: 'crafting', capacity: 9, slots: this.craftingItemSlots.map((slot) => slot.item) };
    return this.model.contentRegistry === undefined
      ? matchingRecipeId(grid)
      : runtimeMatchingRecipeId(this.model.contentRegistry, grid);
  }

  private itemDefinition(itemKind: string) {
    return this.model.contentRegistry === undefined
      ? itemDefinition(itemKind)
      : runtimeItemDefinition(this.model.contentRegistry, itemKind) ?? itemDefinition(itemKind);
  }

  private durabilityDefinition(itemKind: string) {
    return runtimeDurabilityDefinition(
      this.model.contentRegistry ?? bootstrapContentRegistry(), itemKind,
    );
  }

  private maxStackFor(itemKind: string): number {
    return this.model.contentRegistry === undefined
      ? maxStackFor(itemKind) ?? 0
      : runtimeMaxStack(this.model.contentRegistry, itemKind) ?? maxStackFor(itemKind) ?? 0;
  }

  private itemContainerContent() {
    return this.model.contentRegistry === undefined
      ? BOOTSTRAP_ITEM_CONTAINER_CONTENT
      : itemContainerContentResolver(this.model.contentRegistry);
  }

  private recipeDefinition(recipeId: string) {
    return this.model.contentRegistry === undefined
      ? recipeDefinition(recipeId)
      : runtimeRecipeDefinition(this.model.contentRegistry, recipeId);
  }

  private recipeOutput(recipeId: string): ItemStack | null {
    return this.model.contentRegistry === undefined
      ? craftingRecipeOutput(recipeId)
      : runtimeCraftingRecipeOutput(this.model.contentRegistry, recipeId);
  }

  private currentRecipeLocked(): boolean {
    const recipe = this.recipeDefinition(this.currentRecipeId() ?? '');
    return (recipe?.station !== undefined
      && !(this.model.nearbyCraftingStations ?? []).includes(recipe.station))
      || (this.model.contentRegistry !== undefined && this.currentRecipeId() !== null
        && !runtimeRecipeSkillSatisfied(this.model.contentRegistry, this.currentRecipeId()!, this.recipeSkillRanks()));
  }

  private recipeSkillRanks(): Readonly<Record<string, number>> {
    return Object.fromEntries((this.model.skills?.ranks ?? []).map(({ nodeId, rank }) => [nodeId, rank]));
  }

  private recipeSkillRequirement(recipeId: string): string | null {
    const registry = this.model.contentRegistry;
    const requirement = registry?.recipes.get(recipeId.startsWith('recipe:') ? recipeId : `recipe:${recipeId}`)?.skillRequirement;
    if (requirement === undefined) return null;
    const name = registry?.compiled.skillNodes.find(({ id }) => id === requirement.skillNode)?.name
      ?? requirement.skillNode.replaceAll('_', ' ');
    return `REQUIRES ${name.toUpperCase()} RANK ${requirement.minimumRank}`;
  }

  private craftingStationLabel(station: CraftingStation): string {
    return station.replaceAll('_', ' ').toUpperCase();
  }

  private craftingStationRequirement(station: CraftingStation): string {
    return `REQUIRES A ${this.craftingStationLabel(station)} WITHIN 2 TILES`;
  }

  private recipeBookEntries() {
    const entries = craftingRecipeBookEntries(
      this.model.nearbyCraftingStations ?? [],
      this.model.inventory,
      this.model.knownRecipeIds ?? [],
      this.model.contentRegistry,
      this.recipeSkillRanks(),
    );
    const query = this.recipeFilterText.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const definition = this.itemDefinition(entry.outputKind);
      return entry.recipeId.toLowerCase().includes(query)
        || entry.outputKind.toLowerCase().includes(query)
        || (definition?.displayName.toLowerCase().includes(query) ?? false);
    });
  }

  private selectCraftingRecipe(recipeId: string): void {
    if (this.selectedCraftingRecipeId === recipeId) {
      this.selectedCraftingRecipeId = null;
      return;
    }
    this.selectedCraftingRecipeId = recipeId;
    this.callbacks.ghostFillCraftingRecipe(recipeId);
  }

  private hoveredCraftingGhostItem(): ItemStack | null {
    if (this.openWindowValue !== 'crafting' || this.selectedCraftingRecipeId === null) return null;
    const hovered = this.inventoryItemSlotAt(this.pointer);
    const slotIndex = hovered?.containerId === 'crafting' ? hovered.index : -1;
    if (slotIndex < 0 || this.craftingItemSlots[slotIndex]?.item !== null) return null;
    const pattern = craftingRecipePattern(
      this.selectedCraftingRecipeId,
      this.model.knownRecipeIds ?? [],
      this.model.contentRegistry,
    );
    const itemKind = pattern?.[slotIndex] ?? null;
    return itemKind === null ? null : { itemKind, quantity: 1 };
  }

  private quickMoveDestinations(source: string): readonly string[] {
    if (source === 'chest') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'chest') return ['chest'];
    if (source === 'placeable') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation') return ['placeable'];
    if (this.openWindowValue === 'crafting') return source === 'crafting' ? ['hotbar', 'backpack'] : ['crafting'];
    if (source === 'hotbar') return ['backpack'];
    return ['hotbar'];
  }

  private quickMoveSourceContainers(source: string): readonly string[] {
    if (source === 'chest') return ['chest'];
    if (source === 'crafting') return ['crafting'];
    if (source === 'equipment') return ['equipment'];
    if (source === 'placeable') return ['placeable'];
    return ['hotbar', 'backpack'];
  }

  private visibleContainerOrder(): readonly string[] {
    return [...new Set(this.visibleItemSlots().map((slot) => slot.containerId))];
  }

  /** Recomputes QUICK_CRAFT from the gesture's original snapshots every time a
   * new slot is visited. This is presentation prediction only; release still
   * emits one reducer transaction containing the complete visited-slot list. */
  private applyQuickCraftPreview(): void {
    const press = this.cursorPress;
    const cursor = this.heldCursorStack();
    if (!press?.cursorWasHeld || press.targets.length === 0 || cursor == null) return;
    const slots = this.visibleItemSlots();
    if (this.quickCraftOriginalItems.size === 0) {
      this.quickCraftOriginalCursor = { ...cursor };
      for (const slot of slots) {
        this.quickCraftOriginalItems.set(slot, slot.item === null ? null : { ...slot.item });
      }
    }
    const grouped = new Map<string, ItemSlot[]>();
    for (const slot of slots) grouped.set(slot.containerId, [...(grouped.get(slot.containerId) ?? []), slot]);
    const containers: Record<string, ContainerSnapshot> = {};
    for (const [id, containerSlots] of grouped) {
      const capacity = Math.max(...containerSlots.map((slot) => slot.index)) + 1;
      const restrictions = Object.fromEntries(containerSlots.flatMap((slot) => (
        slot.restriction === undefined ? [] : [[slot.index, slot.restriction] as const]
      )));
      containers[id] = {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const slot = containerSlots.find((candidate) => candidate.index === index);
          return slot === undefined ? null : this.quickCraftOriginalItems.get(slot) ?? null;
        }),
        ...(Object.keys(restrictions).length === 0 ? {} : { restrictions }),
      };
    }
    const preview = quickCraftCursorStack(containers, cursor, {
      mode: press.button === 'right' ? 'one_each' : 'even',
      targets: press.targets.map((slot) => ({ container: slot.containerId, index: slot.index })),
    }, this.itemContainerContent());
    if (!preview.ok) return;
    this.quickCraftPreviewItems.clear();
    for (const slot of slots) {
      const item = preview.containers[slot.containerId]?.slots[slot.index] ?? null;
      this.quickCraftPreviewItems.set(slot, item);
      slot.item = item;
    }
    this.quickCraftPreviewCursor = preview.cursor;
  }

  private samePreviewStack(left: ItemStack | null, right: ItemStack | null): boolean {
    return left === null || right === null
      ? left === right
      : left.itemKind === right.itemKind && left.quantity === right.quantity
        && left.durability === right.durability && left.lit === right.lit;
  }

  private clearQuickCraftPreview(): void {
    this.quickCraftOriginalItems.clear();
    this.quickCraftPreviewItems.clear();
    this.quickCraftOriginalCursor = null;
    this.quickCraftPreviewCursor = undefined;
  }

  private cancelQuickCraftPreview(): void {
    for (const [slot, item] of this.quickCraftOriginalItems) slot.item = item;
    this.clearQuickCraftPreview();
  }

  private promoteQuickCraftPreview(): void {
    if (this.quickCraftPreviewCursor === undefined) return;
    this.optimisticMenuItems.clear();
    for (const [slot, item] of this.quickCraftPreviewItems) this.optimisticMenuItems.set(slot, item);
    this.optimisticMenuCursor = this.quickCraftPreviewCursor;
    this.optimisticMenuStartedAt = performance.now();
    this.clearQuickCraftPreview();
    this.reapplyOptimisticMenu();
  }

  private heldCursorStack(): ItemStack | null {
    return this.optimisticMenuCursor === undefined
      ? this.model.cursorStack ?? null
      : this.optimisticMenuCursor;
  }

  private visibleMenuContainers(): Readonly<Record<string, ContainerSnapshot>> {
    const grouped = new Map<string, ItemSlot[]>();
    for (const slot of this.visibleItemSlots()) {
      grouped.set(slot.containerId, [...(grouped.get(slot.containerId) ?? []), slot]);
    }
    return Object.fromEntries([...grouped].map(([id, slots]) => {
      const capacity = Math.max(...slots.map((slot) => slot.index)) + 1;
      const restrictions = Object.fromEntries(slots.flatMap((slot) => (
        slot.restriction === undefined ? [] : [[slot.index, slot.restriction] as const]
      )));
      return [id, {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => (
          slots.find((slot) => slot.index === index)?.item ?? null
        )),
        ...(Object.keys(restrictions).length === 0 ? {} : { restrictions }),
      } satisfies ContainerSnapshot];
    }));
  }

  private acceptOptimisticMenu(
    containers: Readonly<Record<string, ContainerSnapshot>>,
    cursor: ItemStack | null,
  ): void {
    this.optimisticMenuItems.clear();
    for (const slot of this.visibleItemSlots()) {
      this.optimisticMenuItems.set(slot, containers[slot.containerId]?.slots[slot.index] ?? null);
    }
    this.optimisticMenuCursor = cursor;
    this.optimisticMenuStartedAt = performance.now();
    this.reapplyOptimisticMenu();
  }

  private predictCursorClick(slot: ItemSlot, button: 'left' | 'right'): boolean {
    const result = clickContainerSlot(this.visibleMenuContainers(), this.heldCursorStack(), {
      container: slot.containerId, index: slot.index, button,
    }, this.itemContainerContent());
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, result.cursor);
    return true;
  }

  private predictPickupAll(): boolean {
    const result = pickupAllToCursor(
      this.visibleMenuContainers(), this.heldCursorStack(), this.visibleContainerOrder(),
      this.itemContainerContent(),
    );
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, result.cursor);
    return true;
  }

  private predictQuickMoveAll(
    itemKind: string,
    fromContainers: readonly string[],
    toContainers: readonly string[],
  ): boolean {
    const result = quickMoveAllMatchingStacks(this.visibleMenuContainers(), {
      itemKind, fromContainers, toContainers,
    }, this.itemContainerContent());
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, this.heldCursorStack());
    return true;
  }

  private predictCursorDrop(button: 'left' | 'right'): boolean {
    const cursor = this.heldCursorStack();
    if (cursor === null) return false;
    const quantity = button === 'right' ? 1 : cursor.quantity;
    this.acceptOptimisticMenu(this.visibleMenuContainers(), quantity === cursor.quantity
      ? null
      : { ...cursor, quantity: cursor.quantity - quantity });
    return true;
  }

  private reapplyOptimisticMenu(): void {
    for (const [slot, item] of this.optimisticMenuItems) slot.item = item;
  }

  private optimisticMenuMatchesAuthority(): boolean {
    if (this.optimisticMenuCursor === undefined) return true;
    if (!this.samePreviewStack(this.model.cursorStack ?? null, this.optimisticMenuCursor)) return false;
    for (const [slot, expected] of this.optimisticMenuItems) {
      if (!this.samePreviewStack(slot.item, expected)) return false;
    }
    return true;
  }

  private reconcileOptimisticMenu(): void {
    if (this.optimisticMenuCursor === undefined) return;
    if (this.optimisticMenuMatchesAuthority()
      || (this.optimisticMenuStartedAt !== null && performance.now() - this.optimisticMenuStartedAt > 5_000)) {
      this.clearOptimisticMenu();
      return;
    }
    this.reapplyOptimisticMenu();
  }

  private clearOptimisticMenu(): void {
    this.optimisticMenuItems.clear();
    this.optimisticMenuCursor = undefined;
    this.optimisticMenuStartedAt = null;
  }

  private trackInventoryPrediction(result: void | Promise<void>): void {
    void Promise.resolve(result).catch(() => {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      // Restore the latest subscribed authority snapshot immediately. The
      // callback owns the error toast; this path only rolls presentation back.
      this.update(this.model);
    });
  }


}
