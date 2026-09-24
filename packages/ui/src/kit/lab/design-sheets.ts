// Design review sheets rendered by design-render.test.ts. Each sheet builds a full
// logical viewport so the owner can review compositions at real game scale.
import { EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT, SKILL_NODE_DEFINITIONS, itemDefinition } from '@orchard/sim';
import { uiBookWindow, type UiBookChapter } from '../components/book-window.js';
import { uiBookBar, uiLedgerRow, uiObjective, uiPageHeading, uiPageLabel, uiPageRow, uiSkillDetail, uiSkillPage } from '../components/character-book.js';
import type { UiFactory } from '../components/index.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { uiWindow } from '../components/window.js';
import { uiPaperDoll, uiInventoryGrid, uiHotbar } from '../components/inventory.js';
import { uiHudAction, uiHudMinimap, uiHudPlayerCard, uiHudPurse, uiHudQuestTracker, uiHudZone, type UiHudQuest } from '../components/hud-game.js';
import { uiInventoryPanel } from '../components/inventory-panel.js';
import { uiViewport } from '../components/viewport.js';
import { paintUiCharacterPortrait } from '../components/character-portrait.js';
import { uiRecipeBook, type UiRecipeBookEntry } from '../components/recipe-book.js';
import { uiSlot, uiItemImage } from '../components/inventory.js';
import { uiGlyph, uiGlyphButton } from '../components/window.js';
import { uiStationLayout, uiStationMachine, uiStationSlot, type UiStationMood } from '../components/station.js';
import { uiHintPanel } from '../components/tooltip.js';
import { uiItemTooltip } from '../components/item-tooltip.js';
import { uiChoiceButton, uiDialogueBody, uiFolderTabs, uiMenuTab, uiMuteButton, uiOfferCard, uiSettingRow, uiShopRow } from '../components/social.js';
import { uiTouchAction, uiTouchPad } from '../components/touch-game.js';
import { uiGameLogo, uiHeroButton, uiLoadingBar, uiTextLink, uiTitleBackdrop } from '../components/gateway-game.js';
import { uiChatPanel, uiNameplate, uiNotice, uiToastCard, uiWorldHover } from '../components/feedback-game.js';
import { uiCurrency } from '../components/currency.js';
import { uiSwitch } from '../components/forms.js';
import { selectAtlasFrame } from '../../sprite.js';
import type { UiLabMocks } from './registry.js';
import { uiLabInventory } from './inventory-mock.js';
import { uiLabGameOptions } from './game-mock.js';

export type DesignSheetViewport = 'desktop' | 'laptop' | 'phone' | 'phone-landscape';
export interface DesignSheet {
  readonly id: string;
  readonly viewports: readonly DesignSheetViewport[];
  build(ui: UiFactory, mocks: UiLabMocks, viewport: DesignSheetViewport): UiElement;
}

const APPEARANCE = { hairKind: 'hair_1_brown', shirtKind: 'farmer_green', pantsKind: 'farmer_white_brown', shoesKind: 'brown' } as const;
const centred = (ui: UiFactory, child: UiElement) => ui.flex({ width: 'grow', height: 'grow', justify: 'center', align: 'center' }, [child]);
const section = (ui: UiFactory, label: string, children: readonly UiElement[]) => ui.flex({ direction: 'column', gap: 4, shrink: 0 }, [ui.text(label, { role: 'label' }), ...children]);

function inventoryWindow(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const { controller, artwork, containers } = uiLabInventory(mocks);
  containers['backpack'] = { ...containers['backpack']!, capacity: 30 };
  containers['equipment'] = { ...containers['equipment']!, slots: EQUIPMENT_SLOTS.map(slot => slot.id === 'watch' ? { itemKind: 'watch', quantity: 1 } : slot.id === 'head' ? { itemKind: 'helm', quantity: 1 } : null) };
  const portrait = uiViewport({ label: 'Character preview', render: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)) });
  return uiWindow({ id: 'design.inventory', title: 'INVENTORY', onClose: () => {},
    layout: { direction: 'row', gap: 16, wrap: false },
    children: [
      section(ui, 'EQUIPMENT', [uiPaperDoll({ id: 'design.equipment', container: 'equipment', controller, artwork, portrait })]),
      section(ui, 'BACKPACK', [uiInventoryPanel({ id: 'design.backpack', container: 'backpack', count: 30, columns: 5, visibleRows: 4, controller, artwork, onSort: () => {}, layout: { width: uiFixed(172) } })]),
    ],
    footer: uiInventoryGrid({ container: 'hotbar', count: HOTBAR_SLOT_COUNT, columns: HOTBAR_SLOT_COUNT, controller, artwork, hotkeys: true, layout: { shrink: 0, width: 'fit' } }),
  });
}

const RECIPES: readonly UiRecipeBookEntry[] = [
  { id: 'planks', name: 'Planks', output: { itemKind: 'plank', quantity: 4 }, status: 'ready', ingredients: [{ itemKind: 'wood', name: 'Wood', need: 1, have: 13 }] },
  { id: 'torch', name: 'Torch', output: { itemKind: 'torch', quantity: 2 }, status: 'missing', ingredients: [{ itemKind: 'wood', name: 'Wood', need: 1, have: 13 }, { itemKind: 'stone', name: 'Coal', need: 1, have: 0 }] },
  { id: 'workbench', name: 'Workbench', output: { itemKind: 'workbench', quantity: 1 }, status: 'ready', ingredients: [{ itemKind: 'plank', name: 'Planks', need: 4, have: 4 }] },
  { id: 'chest', name: 'Chest', output: { itemKind: 'chest', quantity: 1 }, status: 'missing', ingredients: [{ itemKind: 'plank', name: 'Planks', need: 8, have: 4 }] },
  { id: 'barrel', name: 'Preserving Barrel', output: { itemKind: 'barrel', quantity: 1 }, status: 'missing', ingredients: [{ itemKind: 'plank', name: 'Planks', need: 6, have: 4 }, { itemKind: 'iron_bar', name: 'Iron Bar', need: 1, have: 0 }] },
  { id: 'furnace', name: 'Furnace', output: { itemKind: 'furnace', quantity: 1 }, status: 'station', station: 'Workbench', ingredients: [{ itemKind: 'stone', name: 'Stone', need: 8, have: 3 }] },
  { id: 'axe', name: 'Stone Axe', output: { itemKind: 'axe', quantity: 1 }, status: 'ready', ingredients: [{ itemKind: 'stone', name: 'Stone', need: 3, have: 3 }, { itemKind: 'wood', name: 'Wood', need: 2, have: 13 }] },
  { id: 'pickaxe', name: 'Stone Pickaxe', output: { itemKind: 'pickaxe', quantity: 1 }, status: 'locked', ingredients: [{ itemKind: 'stone', name: 'Stone', need: 3, have: 3 }] },
  { id: 'lantern', name: 'Lantern', output: { itemKind: 'lantern', quantity: 1 }, status: 'missing', ingredients: [{ itemKind: 'iron_bar', name: 'Iron Bar', need: 2, have: 0 }] },
];

/** 3×3 pattern, arrow and result, headed by the recipe-book toggle. */
function craftingBench(ui: UiFactory, mocks: UiLabMocks, bookOpen: boolean): UiElement {
  const { controller, artwork } = uiLabInventory(mocks);
  const pattern = [null, null, null, null, 'wood', null, null, null, null];
  return ui.flex({ direction: 'column', gap: 4, shrink: 0 }, [
    ui.flex({ direction: 'row', align: 'center', gap: 4, alignSelf: 'stretch' }, [ui.text('CRAFTING', { role: 'label', layout: { grow: 1 } }),
      uiGlyphButton({ glyph: 'glyph.recipe_book', label: bookOpen ? 'Close recipe book' : 'Open recipe book', onPress: () => {} })]),
    ui.flex({ direction: 'row', align: 'center', gap: 6 }, [
      uiInventoryGrid({ container: 'crafting', count: 9, columns: 3, fixedColumns: true, controller, artwork, ghost: index => pattern[index] ? { itemKind: pattern[index]!, quantity: 1 } : null, layout: { width: 'fit' } }),
      uiGlyph('glyph.play'),
      uiSlot({ label: 'Craft result', stack: { itemKind: 'plank', quantity: 4 }, artwork, selected: true, onPress: () => {} }),
    ]),
  ]);
}

function backpack(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const { controller, artwork, containers } = uiLabInventory(mocks);
  containers['backpack'] = { ...containers['backpack']!, capacity: 30 };
  return section(ui, 'BACKPACK', [uiInventoryPanel({ container: 'backpack', count: 30, columns: 5, visibleRows: 4, controller, artwork, onSort: () => {}, layout: { width: uiFixed(172) } })]);
}
function hotbar(mocks: UiLabMocks): UiElement {
  const { controller, artwork } = uiLabInventory(mocks);
  return uiInventoryGrid({ container: 'hotbar', count: HOTBAR_SLOT_COUNT, columns: HOTBAR_SLOT_COUNT, controller, artwork, hotkeys: true, layout: { shrink: 0, width: 'fit' } });
}
function craftingWindow(ui: UiFactory, mocks: UiLabMocks, bookOpen: boolean, book?: UiElement): UiElement {
  return uiWindow({ id: 'design.crafting', title: 'WORKBENCH', onClose: () => {},
    layout: { direction: 'row', gap: 16, align: 'center' },
    children: [...(book ? [book] : []), craftingBench(ui, mocks, bookOpen), backpack(ui, mocks)], footer: hotbar(mocks) });
}
function recipeBook(mocks: UiLabMocks, closable: boolean): UiElement {
  const { artwork } = uiLabInventory(mocks);
  return uiRecipeBook({ id: 'design.recipes', recipes: RECIPES, selected: 'barrel', artwork, onSelect: () => {}, onPlace: () => {}, ...(closable ? { onClose: () => {} } : {}) });
}

function art(mocks: UiLabMocks, itemKind: string) { return () => mocks.assets?.get(itemDefinition(itemKind)?.iconKey ?? ''); }
function artworkFor(mocks: UiLabMocks, kinds: readonly string[]) {
  const artwork: Record<string, NonNullable<ReturnType<ReturnType<typeof art>>>> = {};
  for (const kind of kinds) Object.defineProperty(artwork, kind, { enumerable: true, get: art(mocks, kind) });
  return artwork;
}
interface StationSpec {
  readonly id: string; readonly title: string; readonly itemKind: string; readonly mood: UiStationMood;
  readonly idle: string; readonly running?: string; readonly active: boolean;
  readonly inputs: readonly (readonly [string, string | null, number])[]; readonly outputs: readonly (readonly [string, string | null, number])[];
  readonly progress: number; readonly status: string; readonly actions?: readonly string[];
}
const STATIONS: readonly StationSpec[] = [
  { id: 'furnace', title: 'FURNACE', itemKind: 'furnace', mood: 'forge', idle: 'off', running: 'burn', active: true,
    inputs: [['ORE', 'iron_ore', 6], ['FUEL', 'wood', 3]], outputs: [['BARS', 'iron_bar', 2]], progress: .6, status: 'Smelting: 0:12 left' },
  { id: 'cooking', title: 'COOKING FIRE', itemKind: 'cooking_fire', mood: 'hearth', idle: 'off', running: 'burn', active: true,
    inputs: [['RAW', 'raw_beef', 4]], outputs: [['COOKED', 'cooked_beef', 2]], progress: .35, status: 'Cooking: 0:20 left', actions: ['Collect', 'Cancel'] },
  { id: 'press', title: 'FRUIT PRESS', itemKind: 'fruit_press', mood: 'orchard', idle: 'base', active: false,
    inputs: [['FRUIT', 'apple', 4]], outputs: [['MUST', 'must', 2], ['POMACE', 'pomace', 2]], progress: 0, status: 'Add 3 fruit of one kind' },
  { id: 'fermentation', title: 'FERMENTATION CASK', itemKind: 'fermentation_cask', mood: 'cellar', idle: 'base', active: false,
    inputs: [['MUST', 'must', 6]], outputs: [['BOTTLES', 'bottles', 2]], progress: .8, status: 'Fermenting: 2 days left' },
  { id: 'barrel', title: 'PRESERVING BARREL', itemKind: 'barrel', mood: 'pantry', idle: 'closed', active: false,
    inputs: [['CROPS', 'beetroot', 8]], outputs: [], progress: 0, status: 'Raw crops, 4+ of one kind', actions: ['Seal barrel'] },
];
function stationWindow(ui: UiFactory, mocks: UiLabMocks, spec: StationSpec): UiElement {
  const artwork = artworkFor(mocks, [spec.itemKind, ...spec.inputs.flatMap(([, kind]) => kind ? [kind] : []), ...spec.outputs.flatMap(([, kind]) => kind ? [kind] : [])]);
  const slot = ([label, kind, quantity]: readonly [string, string | null, number]) => uiStationSlot(label, uiSlot({ label, stack: kind ? { itemKind: kind, quantity } : null, artwork, onPress: () => {} }));
  const station = uiStationLayout({ emblem: uiItemImage({ itemKind: spec.itemKind, artwork, size: 24 }),
    inputs: spec.inputs.map(slot), outputs: spec.outputs.map(slot), progress: spec.progress, status: spec.status,
    machine: uiStationMachine({ label: spec.title, asset: art(mocks, spec.itemKind), idle: spec.idle, running: spec.running, active: () => spec.active, mood: spec.mood }),
    actions: spec.actions?.map((label, index) => ui.button({ label, tone: index === 0 ? 'success' : 'primary', size: 'md', onPress: () => {} })),
  });
  return uiWindow({ id: `design.${spec.id}`, title: spec.title, onClose: () => {},
    layout: { direction: 'row', gap: 16, align: 'center' }, children: [station, backpack(ui, mocks)], footer: hotbar(mocks) });
}

const QUESTS: readonly UiHudQuest[] = [
  { id: 'cellar', title: 'From Orchard to Cellar', objectives: [{ label: 'Press 3 fruit in a press', progress: '0/3', complete: false }, { label: 'Age 1 bottle in a cask', progress: '0/1', complete: false }, { label: 'Sell 1 bottle to Marlow', progress: '0/1', complete: false }] },
  { id: 'tools', title: 'Tools of the Trade', objectives: [{ label: 'Craft a stone axe', progress: '1/1', complete: true }] },
];
function paintMiniMap(context: CanvasRenderingContext2D, r: { x: number; y: number; width: number; height: number }) {
  context.fillStyle = '#3e8948'; context.fillRect(r.x, r.y, r.width, r.height);
  context.fillStyle = '#b8b05a'; for (let y = 0; y < r.height; y += 2) context.fillRect(r.x, r.y + y, Math.max(0, Math.round(r.width * .45 - y * .6)), 2);
  context.fillStyle = '#0095e9'; for (let y = 0; y < r.height; y += 2) context.fillRect(r.x + r.width - 12 + Math.round(Math.sin(y / 9) * 3), r.y + y, 5, 2);
  context.fillStyle = '#fff6e0'; context.fillRect(r.x + Math.floor(r.width / 2) - 2, r.y + Math.floor(r.height / 2) - 2, 4, 4);
  context.fillStyle = '#3f2832'; context.fillRect(r.x + Math.floor(r.width / 2) - 1, r.y + Math.floor(r.height / 2) - 1, 2, 2);
}
function hudSheet(ui: UiFactory, mocks: UiLabMocks, viewport: DesignSheetViewport): UiElement {
  const phone = viewport === 'phone';
  const { controller, artwork } = uiLabInventory(mocks);
  const place = (child: UiElement, inset: Record<string, number>) => child.setStyle({ position: 'absolute', inset: Object.fromEntries(Object.entries(inset).map(([k, v]) => [k, uiFixed(v)])) });
  const hotbar = uiHotbar({ container: 'hotbar', count: HOTBAR_SLOT_COUNT, controller, artwork, selected: 2, layout: { width: 'fit', shrink: 0 } });
  const actions = [uiHudAction({ id: 'hud.menu', label: 'Menu', hotkey: 'M', icon: 'hud.gear', onPress: () => {} }), uiHudAction({ id: 'hud.build', label: 'Build', hotkey: 'B', icon: 'hud.hammer', onPress: () => {} }), uiHudAction({ id: 'hud.crafting', label: 'Crafting', hotkey: 'C', icon: 'hud.wrench', onPress: () => {} })];
  const weapon = uiSlot({ label: 'Main hand', hotkey: 'V', placeholder: 'main_hand', stack: { itemKind: 'axe', quantity: 1 }, artwork, onPress: () => {} });
  const card = uiHudPlayerCard({ portrait: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)),
    vitals: () => ({ health: .82, mana: .55, vigour: .9, hunger: .44 }), hungerLabel: () => 'HUNGER 44', onOpen: () => {} });
  const purse = uiHudPurse({ balance: () => 34_673n, onOpen: () => {} });
  const chat = uiHudAction({ id: 'hud.chat', label: 'Chat', hotkey: 'T', icon: 'hud.chat', onPress: () => {} });
  const zone = uiHudZone({ title: () => 'Overworld', moon: () => 'waxing_crescent', online: () => 3, onPlayers: () => {} });
  const minimap = uiHudMinimap({ render: (context, bounds) => paintMiniMap(context, bounds), zoom: () => 2, onZoom: () => {} });
  const quests = uiHudQuestTracker({ quests: () => QUESTS, collapsed: () => false, onToggle: () => {}, onOpen: () => {}, width: phone ? 140 : 160 });
  const bottom = phone
    ? ui.flex({ direction: 'column', gap: 6, align: 'center' }, [ui.flex({ direction: 'row', gap: 4, align: 'end' }, [card, ui.flex({ width: uiFixed(40) }, []), ui.flex({ direction: 'column', gap: 4, align: 'end' }, [ui.flex({ direction: 'row', gap: 2 }, [...actions, weapon]), purse])]), hotbar])
    : ui.flex({ direction: 'row', gap: 6, align: 'end' }, [ui.flex({ direction: 'row', gap: 2 }, actions), hotbar, weapon]);
  return ui.flex({ width: 'grow', height: 'grow' }, [
    place(zone, { left: 6, top: 6 }), place(minimap, { right: 6, top: 6 }), place(quests, { right: 8, top: 124 }),
    place(ui.flex({ direction: 'row', justify: 'center' }, [bottom]), { left: 0, right: 0, bottom: 8 }),
    ...(phone ? [] : [place(card, { left: 8, bottom: 8 }), place(purse, { right: 8, bottom: 8 }), place(chat, { left: 8, bottom: 70 })]),
    ...(phone ? [place(chat, { left: 8, bottom: 150 })] : []),
  ]);
}

function tooltipSheet(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const art = (kind: string) => mocks.assets?.get(itemDefinition(kind)?.iconKey ?? '');
  const item = (kind: string) => { const asset = art(kind); return asset ? { artwork: asset, animation: itemDefinition(kind)?.iconAnimation } : undefined; };
  const hints = ['Crafting (C)', 'Hunger 4.4 / 10.0', 'Sort & stack: merges partial stacks and orders the backpack by kind.', 'Take the result. Shift-click to craft as many as you can.'].map(text => uiHintPanel(text));
  const items = [
    uiItemTooltip({ name: 'Wood', quality: 'common', icon: item('wood'), lines: [{ role: 'muted', text: 'Material' }], sellBronze: 2 }),
    uiItemTooltip({ name: 'Iron Pickaxe', quality: 'rare', icon: item('pickaxe'), lines: [{ role: 'itemLevel', text: 'Item Level 12' }, { role: 'body', text: 'Main Hand', right: 'Pickaxe' }, { role: 'body', text: '+3 Mining' }, { role: 'equip', text: 'Equip: Breaks stone 15% faster.' }, { role: 'body', text: 'Durability 88 / 100' }, { role: 'flavour', text: '"Forged in the valley smithy."' }], sellBronze: 1250 }),
    uiItemTooltip({ name: 'Apple', quality: 'common', icon: item('apple'), lines: [{ role: 'body', text: 'Restores 2 hunger.' }], sellBronze: 5 }),
  ];
  return ui.flex({ width: 'grow', height: 'grow', justify: 'center', align: 'center', gap: 24, direction: 'row' }, [
    ui.flex({ direction: 'column', gap: 12, align: 'start' }, hints), ui.flex({ direction: 'row', gap: 12, align: 'start' }, items)]);
}

function characterBook(ui: UiFactory, mocks: UiLabMocks, chapter: string, viewport: DesignSheetViewport): UiElement {
  const { controller, artwork, containers } = uiLabInventory(mocks);
  containers['equipment'] = { ...containers['equipment']!, slots: EQUIPMENT_SLOTS.map(slot => slot.id === 'watch' ? { itemKind: 'watch', quantity: 1 } : slot.id === 'head' ? { itemKind: 'helm', quantity: 1 } : slot.id === 'main_hand' ? { itemKind: 'axe', quantity: 1 } : null) };
  const skillArt = Object.fromEntries(SKILL_NODE_DEFINITIONS.flatMap(node => { const asset = mocks.assets?.get(node.iconAsset); return asset ? [[node.id, asset]] : []; }));
  const farming = SKILL_NODE_DEFINITIONS.filter(node => node.track === 'farming'), ranks = { farming_root: 1, green_thumb: 3, farmcraft: 2, tender_hand: 1 };
  const selectedNode = farming.find(node => node.id === 'green_thumb')!;
  const portrait = uiViewport({ label: 'Character preview', render: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)) });
  const chapters: UiBookChapter[] = [
    { id: 'character', label: 'Character', icon: 'chapter.character', hotkey: 'P',
      left: () => ui.flex({ direction: 'column', gap: 6, align: 'center' }, [uiPageHeading('Mara', 'Level 12 Farmer'),
        uiPaperDoll({ id: 'book.equipment', container: 'equipment', controller, artwork, portrait }),
        ui.flex({ direction: 'row', gap: 4, align: 'center' }, [uiGlyphButton({ glyph: 'glyph.previous', chrome: 'none', label: 'Turn left', onPress: () => {} }), ui.text('Turn', { role: 'caption' }), uiGlyphButton({ glyph: 'glyph.next', chrome: 'none', label: 'Turn right', onPress: () => {} })])]),
      right: () => ui.flex({ direction: 'column', gap: 4, alignSelf: 'stretch' }, [
        uiPageLabel('ATTRIBUTES'),
        uiLedgerRow('Strength', '12', { delta: 2, tooltip: 'Strength 10 base, +2 from Helm' }), uiLedgerRow('Dexterity', '10'), uiLedgerRow('Constitution', '11', { delta: 1 }),
        uiLedgerRow('Intellect', '10'), uiLedgerRow('Wisdom', '9', { delta: -1 }), uiLedgerRow('Charisma', '10'),
        uiPageLabel('VITALS'), uiBookBar('Health', 82, 100, 'red'), uiBookBar('Mana', 55, 100, 'blue'), uiBookBar('Vigour', 90, 100, 'green'),
        uiPageLabel('PROFESSIONS'), uiBookBar('Farming', 1200, 1800, 'gold', 'Lv 12'), uiBookBar('Explorer', 300, 900, 'gold', 'Lv 4'), uiBookBar('Combat', 40, 400, 'gold', 'Lv 2'),
      ]) },
    { id: 'skills', label: 'Skills', icon: 'chapter.skills', hotkey: 'K',
      left: () => ui.flex({ direction: 'column', gap: 4, alignSelf: 'stretch' }, [uiPageHeading('Farming', 'Lv 12, 3 points'),
        uiPageRow({ label: 'Farming', note: 'Lv 12', glyph: 'chapter.skills', selected: true, onPress: () => {} }), uiPageRow({ label: 'Explorer', note: 'Lv 4', glyph: 'chapter.skills', onPress: () => {} }), uiPageRow({ label: 'Combat', note: 'Lv 2', glyph: 'chapter.skills', onPress: () => {} }),
        uiPageLabel('SELECTED'), uiSkillDetail({ node: selectedNode, rank: 3, asset: skillArt[selectedNode.id], canLearn: true, onLearn: () => {} })]),
      right: () => uiSkillPage({ nodes: farming, ranks, selected: selectedNode.id, artwork: skillArt, onSelect: () => {} }) },
    { id: 'quests', label: 'Quests', icon: 'chapter.quests', hotkey: 'L',
      left: () => ui.flex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, [uiPageHeading('Quests'), uiPageLabel('ACTIVE'),
        uiPageRow({ label: 'From Orchard to Cellar', note: '0/3', glyph: 'chapter.quests', selected: true, onPress: () => {} }), uiPageRow({ label: 'A Home of Your Own', note: '1/4', glyph: 'chapter.quests', onPress: () => {} }), uiPageRow({ label: 'The Lost Lantern', note: '0/1', glyph: 'chapter.quests', onPress: () => {} }),
        uiPageLabel('COMPLETED'), uiPageRow({ label: 'Tools of the Trade', muted: true, onPress: () => {} }), uiPageRow({ label: 'First Harvest', muted: true, onPress: () => {} })]),
      right: () => ui.flex({ direction: 'column', gap: 4, alignSelf: 'stretch' }, [uiPageHeading('Orchard to Cellar', 'From Marlow'),
        ui.text('Marlow wants to see whether the old press still turns. Press fresh fruit, age a bottle in a cask and bring it back to sell.', { wrap: true, layout: { alignSelf: 'stretch' } }),
        uiPageLabel('OBJECTIVES'), uiObjective('Press 3 fruit in a press', '0/3', false), uiObjective('Age 1 bottle in a cask', '0/1', false), uiObjective('Sell 1 bottle to Marlow', '0/1', false),
        uiPageLabel('REWARDS'), ui.flex({ direction: 'row', gap: 4, align: 'center' }, [uiSlot({ label: 'Bottles', stack: { itemKind: 'bottles', quantity: 3 }, artwork }), uiSlot({ label: 'Apple', stack: { itemKind: 'apple', quantity: 10 }, artwork }), ui.text('100 Farming XP', { role: 'caption' })]),
        ui.flex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch' }, [ui.button({ label: 'Unpin', tone: 'primary', size: 'sm', onPress: () => {} }), ui.button({ label: 'Abandon', tone: 'danger', size: 'sm', onPress: () => {} })])]) },
    { id: 'statistics', label: 'Statistics', icon: 'chapter.statistics',
      left: () => ui.flex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, [uiPageHeading('Records'),
        uiPageRow({ label: 'General', selected: true, onPress: () => {} }), uiPageRow({ label: 'Gathering', onPress: () => {} }), uiPageRow({ label: 'Crafting', onPress: () => {} }), uiPageRow({ label: 'Economy', onPress: () => {} }), uiPageRow({ label: 'Adventure', onPress: () => {} })]),
      right: () => ui.flex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, [uiPageHeading('General'),
        uiLedgerRow('Time played', '20h 20m'), uiLedgerRow('Days survived', '41'), uiLedgerRow('Coins earned', '1g 23s 45b'), uiLedgerRow('Distance walked', '84 km'), uiLedgerRow('Trees felled', '1,200'), uiLedgerRow('Fruit pressed', '310'), uiLedgerRow('Bottles aged', '42'), uiLedgerRow('Quests completed', '12')]) },
  ];
  return centred(ui, uiBookWindow({ id: 'design.character-book', chapters, active: chapter, onChapter: () => {}, onClose: () => {}, page: viewport === 'phone' ? { width: 160, height: 300 } : { width: 200, height: 248 } }));
}

function npcPortrait(mocks: UiLabMocks) {
  return (context: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }) => {
    const asset = mocks.assets?.get('npc_cf_desert_person_01'); if (!asset) return;
    const group = Object.keys(asset.metadata.animations)[0]!, frame = selectAtlasFrame(asset.metadata, group, 0); if (!frame) return;
    context.imageSmoothingEnabled = false;
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, bounds.x + Math.floor((bounds.width - frame.width * 2) / 2), bounds.y - 8, frame.width * 2, frame.height * 2);
  };
}
function dialogueWindow(mocks: UiLabMocks): UiElement {
  return uiWindow({ id: 'design.dialogue', title: 'MARLOW', onClose: () => {}, children: [uiDialogueBody({ speaker: 'Marlow', portrait: npcPortrait(mocks), onChoose: () => {},
    body: 'Well met, traveller. Tools wear out, supplies wander off, and I make sure neither keeps you down for long.',
    choices: [{ id: 'shop', label: 'Let me see what you have to offer.' }, { id: 'trade', label: 'What do you trade?' }, { id: 'island', label: 'What have you seen on the island?' }, { id: 'bye', label: 'Goodbye.' }] })] });
}
function merchantWindow(ui: UiFactory, mocks: UiLabMocks, tab: 'buy' | 'sell', query = ''): UiElement {
  const asset = (kind: string) => mocks.assets?.get(itemDefinition(kind)?.iconKey ?? '');
  const stock = tab === 'buy'
    ? [['axe', 'Stone Axe', 120, 1, 0], ['pickaxe', 'Stone Pickaxe', 140, 0, 1], ['torch', 'Torch', 8, 4, 3], ['lantern', 'Lantern', 60, 0, 0], ['bottles', 'Empty Bottle', 12, 0, 2], ['workbench', 'Workbench Kit', 300, 0, 0],
       ['chest', 'Chest', 180, 0, 1], ['barrel', 'Preserving Barrel', 220, 0, 0], ['apple', 'Apple Sapling', 45, 0, 0], ['grape', 'Grape Cutting', 50, 0, 0], ['iron_bar', 'Iron Bar', 40, 0, 2], ['wood', 'Wood', 3, 0, 13]] as const
    : [['apple', 'Apple', 5, 3, 7], ['wood', 'Wood', 2, 0, 13], ['stone', 'Stone', 1, 0, 9], ['grape', 'Grape', 6, 0, 6], ['iron_ore', 'Iron Ore', 9, 0, 12]] as const;
  const rows = stock.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()));
  const list = ui.scrollArea({ scrollStyle: 'wood', height: uiFixed(7 * 22), padding: { right: 24 }, overflow: 'scroll-y', width: 'grow' } as never,
    rows.length ? rows.map(([kind, name, price, quantity, owned]) => uiShopRow({ itemKind: kind, name, unitPrice: price, quantity, max: 20, owned, asset: asset(kind), onQuantity: () => {} }))
      : [ui.text(`Nothing matches "${query}".`, { align: 'center', layout: { width: 'grow' } })]);
  const panel = ui.frame({ style: 'parchment_plain', padding: 4, layout: { direction: 'column', gap: 0, width: uiFixed(300), padding: { top: 8, left: 4, right: 4, bottom: 4 } }, children: [list] });
  const search = ui.input({ id: 'merchant.search', label: 'Search wares', placeholder: 'Search', value: query, clearable: true, size: 'sm', leading: uiGlyph('glyph.search'), layout: { width: uiFixed(116) } });
  // The panel art keeps a 5px transparent margin: tab feet land on its top border (y 21) and the first
  // tab starts just inside its left edge, so the tabs open into the panel like folder tabs.
  const header = ui.flex({ direction: 'row', align: 'end', gap: 4, width: uiFixed(300), height: uiFixed(21), position: 'absolute', inset: { left: 8, top: 0 } }, [
    uiFolderTabs({ id: 'merchant.tabs', tabs: [{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' }], active: tab, onSelect: () => {} }), ui.flex({ grow: 1 }, []),
    ui.flex({ padding: { bottom: 6, right: 16 } }, [search])]);
  const total = ui.flex({ direction: 'row', align: 'center', gap: 6, width: uiFixed(300) }, [ui.text('TOTAL', { role: 'label' }), uiCurrency({ bronze: tab === 'buy' ? 152 : 15 }), ui.flex({ grow: 1 }, []),
    ui.text('PURSE', { role: 'label' }), uiCurrency({ bronze: 34_673 })]);
  return uiWindow({ id: 'design.merchant', title: "MARLOW'S WARES", onClose: () => {}, layout: { direction: 'column', gap: 4 }, children: [
    ui.stack({}, [ui.flex({ direction: 'column', padding: { top: 16 } }, [panel]), header]), total,
    ui.flex({ direction: 'row', gap: 4, justify: 'end', width: uiFixed(300) }, [ui.button({ label: 'Back', tone: 'primary', onPress: () => {} }), ui.button({ label: tab === 'buy' ? 'Buy 5 items' : 'Sell 3 items', tone: 'success', onPress: () => {} })]),
  ] });
}
function tradeWindow(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const { artwork } = uiLabInventory(mocks);
  const offer = (label: string, items: readonly (readonly [string, number])[], coins: number, accepted: boolean) => ui.flex({ direction: 'column', gap: 4, shrink: 0 }, [
    // The tick area is always reserved so both offer columns line up.
    ui.flex({ direction: 'row', gap: 4, align: 'center', alignSelf: 'stretch', height: uiFixed(16) }, [ui.text(label, { role: 'label', layout: { grow: 1 } }), accepted ? uiGlyph('glyph.check') : ui.flex({ width: uiFixed(16) }, [])]),
    uiInventoryGrid({ container: label, count: 8, columns: 4, stack: index => items[index] ? { itemKind: items[index]![0], quantity: items[index]![1] } : null, artwork, layout: { width: 'fit' } }),
    ui.flex({ direction: 'row', gap: 4, align: 'center' }, [ui.text('COINS', { role: 'caption' }), uiCurrency({ bronze: coins })])]);
  return uiWindow({ id: 'design.trade', title: 'TRADE WITH TOBY', onClose: () => {}, layout: { direction: 'column', gap: 8, align: 'center' }, children: [
    ui.flex({ direction: 'row', gap: 16, align: 'start' }, [offer('YOUR OFFER', [['apple', 10], ['wood', 20]], 0, true), offer("TOBY'S OFFER", [['iron_bar', 2]], 150, false)]),
    ui.text('Toby is still deciding. Changing an offer clears both ticks.', { wrap: true, align: 'center', layout: { width: uiFixed(260) } }),
    ui.flex({ direction: 'row', gap: 4, justify: 'center' }, [ui.button({ label: 'Cancel', tone: 'danger', onPress: () => {} }), ui.button({ label: 'Accept', tone: 'success', onPress: () => {} })]),
  ], footer: hotbar(mocks) });
}
function chestWindow(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const { controller, artwork, containers } = uiLabInventory(mocks);
  containers['entity'] = { ...containers['entity']!, capacity: 30 };
  return uiWindow({ id: 'design.chest', title: 'CHEST', frame: 'crate', onClose: () => {}, layout: { direction: 'row', gap: 16, align: 'start' }, children: [
    section(ui, 'CHEST', [uiInventoryPanel({ container: 'entity', count: 30, columns: 5, visibleRows: 4, controller, artwork, onSort: () => {}, layout: { width: uiFixed(172) } })]),
    backpack(ui, mocks)], footer: hotbar(mocks) });
}
function gameMenu(): UiElement {
  const items = [['Resume', 'success'], ['Character', 'primary'], ['Settings', 'primary'], ['Help', 'primary'], ['Fullscreen', 'primary'], ['Check for update', 'primary'], ['Sign out', 'danger'], ['Quit to title', 'danger']] as const;
  return uiWindow({ id: 'design.menu', title: 'MENU', onClose: () => {}, layout: { direction: 'column', gap: 2, width: uiFixed(150) },
    children: items.map(([label, tone]) => uiChoiceButton({ label, tone, onPress: () => {} })) });
}
const SETTINGS_TABS = [['Gameplay', 'play'], ['Controls', 'key_a'], ['Video', 'square'], ['Audio', 'star'], ['Interface', 'pointer'], ['Access', 'heart']] as const;
function settingsWindow(ui: UiFactory, page: 'Audio' | 'Gameplay'): UiElement {
  const audioRow = (label: string, kind: 'sound' | 'music', value: number) => ui.flex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch' }, [
    uiMuteButton({ label, kind, muted: value === 0, onToggle: () => {} }), ui.text(label, { layout: { width: uiFixed(56) } }),
    ui.slider({ label, value: value * 100, layout: { width: uiFixed(96), height: uiFixed(26) } }), ui.text(`${Math.round(value * 100)}%`, { align: 'right', layout: { width: uiFixed(26) } })]);
  const toggle = (label: string, value: boolean, hint?: string) => uiSettingRow(label, uiSwitch({ label, value, bare: true, coloured: true }), hint);
  const content = page === 'Audio'
    ? [audioRow('Master', 'sound', .8), audioRow('Music', 'music', .7), audioRow('Effects', 'sound', 0), toggle('Music in background', true), toggle('Sounds in background', false)]
    : [toggle('Player nameplates', true, 'Same as pressing N'), toggle('Show tutorial hints', true), toggle('Confirm rare item drops', true), toggle('Auto-sort pickups', false), toggle('Hold to harvest', false)];
  const panel = ui.frame({ style: 'parchment_plain', padding: 8, layout: { direction: 'column', gap: 4, width: uiFixed(236), height: uiFixed(180) },
    children: [uiPageHeading(page, undefined, { rule: false }), ...content] });
  const tabs = ui.flex({ direction: 'column', gap: 2 }, [...SETTINGS_TABS.map(([label, glyph]) => uiMenuTab({ label, glyph, active: label === page, onPress: () => {} })),
    ui.flex({ height: uiFixed(8) }, []), uiMenuTab({ label: 'Back', glyph: 'back', active: false, onPress: () => {} })]);
  return uiWindow({ id: 'design.settings', title: 'SETTINGS', onClose: () => {}, layout: { direction: 'row', gap: 8, align: 'start' }, children: [tabs, panel] });
}
function feedbackSheet(ui: UiFactory): UiElement {
  return ui.flex({ width: 'grow', height: 'grow', direction: 'row', gap: 24, justify: 'center', align: 'center' }, [
    ui.flex({ direction: 'column', gap: 12, align: 'start' }, [
      uiNotice({ text: 'Nothing to light here', kind: 'error' }), uiNotice({ text: 'Watered 4 crops', kind: 'success' }), uiNotice({ text: 'Your pack is full', kind: 'info' }),
      uiToastCard({ title: 'New farming skill point', detail: 'Spend it in the Skills chapter.', icon: 'chapter.skills', action: { label: 'Open skills', onPress: () => {} }, onDismiss: () => {} })]),
    ui.flex({ direction: 'column', gap: 12, align: 'center' }, [uiNameplate({ name: 'Mara', kind: 'self' }), uiNameplate({ name: 'Toby', kind: 'friend' }), uiNameplate({ name: 'Marlow', kind: 'npc', detail: 'Supplies' }), uiNameplate({ name: 'Cellar keeper', kind: 'offline', detail: 'Offline' }),
      uiWorldHover({ title: 'Apple Tree', lines: ['Watered', 'Fruit in 2 min'], progress: .7 })]),
    uiChatPanel({ open: true, lines: [{ channel: 'system', text: 'Welcome to the Overworld.' }, { channel: 'general', author: 'Mara', text: 'The apples are ready!' }, { channel: 'general', author: 'Toby', text: 'I will bring a basket.' }, { channel: 'trade', author: 'Wren', text: 'Selling iron bars, 40b each' }, { channel: 'private', author: 'Toby', text: 'Meet me at the orchard.' }] }),
  ]);
}

function gatewayWindow(ui: UiFactory, state: 'signed-out' | 'error'): UiElement {
  const wide = (label: string, tone: 'primary' | 'success' | 'danger' | 'muted') => ui.button({ label, tone, onPress: () => {}, layout: { width: 'grow' } });
  return uiWindow({ id: `design.gateway.${state}`, title: 'ORCHARD & CELLAR', layout: { direction: 'column', gap: 4, width: uiFixed(200), align: 'stretch' }, children: [
    ui.text('Version 0.40.1', { role: 'caption', align: 'center', layout: { width: 'grow' } }),
    ...(state === 'error' ? [uiNotice({ text: 'Sign-in failed. Try again.', kind: 'error' })] : []),
    wide('Sign in', 'success'), wide('Create account', 'primary'), wide('Recover account', 'primary'),
    ui.flex({ height: uiFixed(4) }, []), wide('Local preview', 'muted')] });
}
function nameWindow(ui: UiFactory, mocks: UiLabMocks, taken: boolean): UiElement {
  const portrait = uiViewport({ label: 'You', render: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)) });
  portrait.setStyle({ width: uiFixed(64), height: uiFixed(80), shrink: 0 });
  return uiWindow({ id: `design.name.${taken}`, title: 'NAME YOUR CHARACTER', layout: { direction: 'row', gap: 12, align: 'center' }, children: [
    // The live nameplate floats just above the preview's head, as other players will see it.
    ui.stack({ width: uiFixed(64), height: uiFixed(80) }, [portrait, ui.flex({ direction: 'row', justify: 'center', position: 'absolute', inset: { left: 0, right: 0, top: 16 } }, [uiNameplate({ name: 'Mara', kind: 'self' })])]),
    ui.flex({ direction: 'column', gap: 6, width: uiFixed(170) }, [
      ui.text('Other players see this name above your head. It is separate from your sign-in email.', { wrap: true, layout: { width: 'grow' } }),
      ui.input({ label: 'Character name', value: 'Mara', maxLength: 16 }),
      ...(taken ? [uiNotice({ text: 'That name is taken.', kind: 'error' })] : [ui.text('3 to 16 letters.', { role: 'caption' })]),
      ui.flex({ direction: 'row', justify: 'end' }, [ui.button({ label: 'Begin', tone: 'success', onPress: () => {} })])])] });
}
function updateDialog(ui: UiFactory): UiElement {
  return uiWindow({ id: 'design.update', title: 'UPDATE READY', onClose: () => {}, layout: { direction: 'column', gap: 8, width: uiFixed(200) }, children: [
    ui.text('A new version of Orchard & Cellar is ready. Reload to update; your progress is saved.', { wrap: true, layout: { width: 'grow' } }),
    ui.flex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch' }, [ui.button({ label: 'Later', tone: 'primary', onPress: () => {} }), ui.button({ label: 'Reload', tone: 'success', onPress: () => {} })])] });
}
function delveConfirm(ui: UiFactory): UiElement {
  return uiWindow({ id: 'design.delve', title: 'THE CELLAR DELVE', onClose: () => {}, layout: { direction: 'column', gap: 6, width: uiFixed(220) }, children: [
    ui.text('Twelve rooms beneath the old cellar. Each run is new; embers you earn buy boons from the Cellar Trader.', { wrap: true, layout: { width: 'grow' } }),
    uiLedgerRow('Rooms', '12'), uiLedgerRow('Your best', 'Room 7'), uiLedgerRow('Entry', 'Free'),
    ui.flex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch' }, [ui.button({ label: 'Stay', tone: 'primary', onPress: () => {} }), ui.button({ label: 'Delve', tone: 'danger', onPress: () => {} })])] });
}
function delveRewards(ui: UiFactory): UiElement {
  return uiWindow({ id: 'design.trader', title: 'THE CELLAR TRADER', onClose: () => {}, layout: { direction: 'column', gap: 6, align: 'center' }, children: [
    ui.flex({ direction: 'row', gap: 12, alignSelf: 'stretch' }, [ui.text('Delve 3 of 12', { role: 'label', layout: { grow: 1 } }), ui.text('20 embers', { role: 'label' })]),
    ui.flex({ direction: 'row', gap: 6 }, [
      uiOfferCard({ rarity: 'uncommon', hotkey: '1', name: 'Keen Edge', effect: '+16% sword damage', price: '10 embers', affordable: true, onBuy: () => {} }),
      uiOfferCard({ rarity: 'rare', hotkey: '2', name: 'Iron Heart', effect: '+16% max health; heals the increase', price: '20 embers', affordable: true, onBuy: () => {} }),
      uiOfferCard({ rarity: 'legendary', hotkey: '3', name: 'Field Dressing', effect: 'Restore 16% of missing health', price: '30 embers', affordable: false, onBuy: () => {} })]),
    ui.button({ label: 'Leave shop', tone: 'primary', onPress: () => {} })] });
}
function buildPalette(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const { artwork } = uiLabInventory(mocks);
  const kinds = ['workbench', 'chest', 'barrel', 'furnace', 'cooking_fire', 'fruit_press', 'fermentation_cask', 'lantern', 'torch'];
  const art = artworkFor(mocks, kinds);
  return uiWindow({ id: 'design.build', title: 'BUILD', onClose: () => {}, layout: { direction: 'column', gap: 6, width: uiFixed(268) }, children: [
    uiHotbar({ container: 'build', count: kinds.length, stack: index => ({ itemKind: kinds[index]!, quantity: 1 }), artwork: { ...artwork, ...art }, selected: 1, layout: { width: 'fit' } }),
    ui.flex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch' }, [ui.text('Chest', { layout: { grow: 1 } }), ui.text('Cost', { role: 'caption' }), uiCurrency({ bronze: 180 }),
      uiHudAction({ id: 'build.remove', label: 'Remove and refund', hotkey: 'X', icon: 'hud.hammer', onPress: () => {} })]),
    ui.text('Left click places, right click rotates, Esc leaves.', { role: 'caption', wrap: true, layout: { width: uiFixed(268) } })] });
}
function onlinePlayers(ui: UiFactory): UiElement {
  const row = (name: string, title: string, zone: string, kind: 'friend' | 'player') => ui.flex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch' }, [
    uiNameplate({ name, kind }), ui.text(title, { role: 'caption', layout: { grow: 1 } }), ui.text(zone, { role: 'caption' }),
    uiGlyphButton({ glyph: 'hud.chat', label: `Whisper ${name}`, chrome: 'none', onPress: () => {} })]);
  return uiWindow({ id: 'design.online', title: 'ONLINE  3', onClose: () => {}, layout: { direction: 'column', gap: 4, width: uiFixed(240) }, children: [
    row('Mara', 'Orchard farmer', 'Sanctuary', 'player'), row('Toby', 'Cellar keeper', 'Orchard', 'friend'), row('Wren', 'Tinkerer', 'Overworld', 'player')] });
}
function targetFrame(ui: UiFactory, mocks: UiLabMocks): UiElement {
  const card = uiHudPlayerCard({ portrait: (context, bounds) => npcPortrait(mocks)(context, { ...bounds, y: bounds.y + 22 }), vitals: () => ({ health: .45, mana: 0, vigour: .7, hunger: 1 }), hungerLabel: () => 'WILD BOAR LV 3' });
  const effects = ui.flex({ direction: 'row', gap: 2 }, ['chapter.skills', 'touch.block', 'notice.info'].map(icon => uiHudAction({ id: `effect.${icon}`, label: 'Effect', icon, onPress: () => {} })));
  return ui.flex({ direction: 'column', gap: 4, align: 'center' }, [card, effects]);
}
function touchHud(ui: UiFactory, mocks: UiLabMocks, landscape = false): UiElement {
  const place = (child: UiElement, inset: Record<string, number>) => child.setStyle({ position: 'absolute', inset: Object.fromEntries(Object.entries(inset).map(([k, v]) => [k, uiFixed(v)])) });
  const actions = ui.stack({ width: uiFixed(128), height: uiFixed(120) }, [
    place(uiTouchAction({ label: 'Interact', key: 'E', icon: 'touch.hand', tone: 'success', size: 44 }), { right: 0, bottom: 0 }),
    place(uiTouchAction({ label: 'Use', key: 'F', icon: 'touch.tool', size: 40 }), { right: 50, bottom: 2 }),
    place(uiTouchAction({ label: 'Jump', key: 'SPACE', icon: 'touch.jump', size: 36 }), { right: 4, bottom: 52 }),
    place(uiTouchAction({ label: 'Dodge', key: 'V', icon: 'touch.dodge', tone: 'info', size: 32, cooldown: .4 }), { right: 50, bottom: 48 }),
    place(uiTouchAction({ label: 'Block', key: 'HOLD', icon: 'touch.block', tone: 'danger', size: 32 }), { right: 88, bottom: 30 })]);
  if (landscape) {
    const { controller, artwork } = uiLabInventory(mocks);
    const card = uiHudPlayerCard({ portrait: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)), vitals: () => ({ health: .82, mana: .55, vigour: .9, hunger: .44 }), hungerLabel: () => 'HUNGER 44', onOpen: () => {} });
    const shortcuts = ui.flex({ direction: 'row', gap: 4, align: 'center' }, [uiHudAction({ id: 'hud.menu', label: 'Menu', hotkey: 'M', icon: 'hud.gear', onPress: () => {} }), uiHudAction({ id: 'hud.build', label: 'Build', hotkey: 'B', icon: 'hud.hammer', onPress: () => {} }), uiHudAction({ id: 'hud.crafting', label: 'Crafting', hotkey: 'C', icon: 'hud.wrench', onPress: () => {} }), uiHudPurse({ balance: () => 34_673n, onOpen: () => {} })]);
    return ui.flex({ width: 'grow', height: 'grow' }, [
      place(uiHudZone({ title: () => 'Overworld', moon: () => 'waxing_crescent', online: () => 3, onPlayers: () => {} }), { left: 6, top: 6 }), place(card, { left: 8, top: 34 }),
      place(ui.flex({ direction: 'row', justify: 'center' }, [shortcuts]), { left: 0, right: 0, top: 6 }),
      place(uiHudMinimap({ render: (context, bounds) => paintMiniMap(context, bounds), zoom: () => 2, onZoom: () => {} }), { right: 6, top: 6 }),
      place(uiHudQuestTracker({ quests: () => QUESTS, collapsed: () => true, onToggle: () => {}, onOpen: () => {} }), { right: 8, top: 124 }),
      place(ui.flex({ direction: 'row', justify: 'center' }, [uiHotbar({ container: 'hotbar', count: HOTBAR_SLOT_COUNT, controller, artwork, selected: 2, layout: { width: 'fit', shrink: 0 } })]), { left: 0, right: 0, bottom: 8 }),
      place(uiTouchPad({ knob: { x: .35, y: -.2 } }), { left: 14, bottom: 12 }), place(actions, { right: 8, bottom: 8 })]);
  }
  return ui.flex({ width: 'grow', height: 'grow' }, [hudSheet(ui, mocks, 'phone').setStyle({ position: 'absolute', inset: { left: 0, top: 0, right: 0, bottom: 0 } }),
    place(uiTouchPad({ knob: { x: .35, y: -.2 } }), { left: 14, bottom: 176 }), place(actions, { right: 8, bottom: 168 })]);
}
function helpBook(ui: UiFactory, viewport: DesignSheetViewport): UiElement {
  const chapter = (id: string, label: string, icon: string, topics: readonly string[], body: string): UiBookChapter => ({ id, label, icon,
    left: () => ui.flex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, [uiPageHeading(label), ...topics.map((topic, index) => uiPageRow({ label: topic, selected: index === 0, onPress: () => {} }))]),
    right: () => ui.flex({ direction: 'column', gap: 4, alignSelf: 'stretch' }, [uiPageHeading(topics[0]!), ui.text(body, { wrap: true, layout: { width: 'grow' } })]) });
  const chapters = [chapter('basics', 'Basics', 'chapter.quests', ['Moving about', 'Actions', 'Windows', 'Saving'],
    'WASD or the arrow keys move you in eight directions. On touch screens, drag the pad on the left.\n\nHold Shift to sprint at 125% speed; sprinting spends vigour.\n\nNumber keys 1 to 0 pick a hotbar slot.'),
    chapter('farming', 'Farming', 'chapter.skills', ['Planting', 'Watering', 'Harvest'], ''), chapter('cellar', 'Cellar', 'chapter.statistics', ['Pressing', 'Ageing', 'Selling'], '')];
  return centred(ui, uiBookWindow({ id: 'design.help', chapters, active: 'basics', onChapter: () => {}, onClose: () => {}, page: viewport === 'phone' ? { width: 160, height: 280 } : { width: 200, height: 232 } }));
}

/** Cream text with the plum outline used for anything written straight onto the world. */
function worldText(ui: UiFactory, text: string): UiElement {
  const node = ui.text(text, { outline: true }); node.setProps({ ink: '#fff6e0', outlineInk: '#3f2832' }); return node;
}
type TitleState = 'signed-out' | 'welcome' | 'loading' | 'error' | 'name';
/** Every title state shares one frame: the logo sign, then the same wood-and-parchment window at a fixed
 * size (matching the Keycloak sign-in card). Only the ribbon title and the window's contents change, so
 * sign-in, loading and welcome read as one continuous screen. */
function titleScreen(ui: UiFactory, mocks: UiLabMocks, state: TitleState, viewport: DesignSheetViewport): UiElement {
  const compact = viewport === 'phone', width = compact ? 250 : 272;
  const logo = uiGameLogo({ cask: mocks.assets?.get('prop_cf_barrel'), compact });
  const portrait = () => { const view = uiViewport({ label: 'Mara', render: (context, bounds) => paintUiCharacterPortrait(context, APPEARANCE, 'down', bounds, name => mocks.assets?.get(name)) }); view.setStyle({ width: uiFixed(64), height: uiFixed(80), shrink: 0 });
    return ui.stack({ width: uiFixed(64), height: uiFixed(80) }, [view, ui.flex({ direction: 'row', justify: 'center', position: 'absolute', inset: { left: 0, right: 0, top: 16 } }, [uiNameplate({ name: 'Mara', kind: 'self' })])]); };
  const links = (...items: readonly string[]) => ui.flex({ direction: 'row', gap: 12, justify: 'center' }, items.map(label => uiTextLink({ label, onPress: () => {} })));
  const says = (text: string) => ui.text(text, { wrap: true, align: 'center', layout: { width: uiFixed(width - 56) } });
  const screens: Record<TitleState, { readonly title: string; readonly body: readonly UiElement[] }> = {
    'signed-out': { title: 'WELCOME', body: [says('Tend the orchard, fill the cellar, share the island.'), uiHeroButton({ label: 'Sign in', onPress: () => {} }), links('Create account', 'Recover account')] },
    welcome: { title: 'WELCOME BACK', body: [ui.flex({ direction: 'row', gap: 12, align: 'center' }, [portrait(), ui.flex({ direction: 'column', gap: 2 }, [ui.text('Mara', { role: 'special-heading' }), ui.text('Level 12 Farmer', { role: 'caption' }), ui.flex({ height: uiFixed(4) }, []), uiHeroButton({ label: 'Enter the world', width: 140, onPress: () => {} })])]), links('Switch account', 'Sign out')] },
    loading: { title: 'LOADING', body: [says('Growing the orchard...'), uiLoadingBar({ progress: () => .62, width: width - 64 }), ui.text('Tip: shift-click moves a whole stack between your pack and a chest.', { wrap: true, align: 'center', role: 'caption', layout: { width: uiFixed(width - 56) } })] },
    error: { title: 'CONNECTION LOST', body: [uiNotice({ text: 'Could not reach the island.', kind: 'error' }), says('Your progress is safe on the server.'), uiHeroButton({ label: 'Try again', tone: 'primary', onPress: () => {} }), links('Sign out')] },
    name: { title: 'NAME YOUR CHARACTER', body: [ui.flex({ direction: 'row', gap: 12, align: 'center' }, [portrait(), ui.flex({ direction: 'column', gap: 6, width: uiFixed(compact ? 130 : 150) }, [
      ui.text('What should the island call you?', { wrap: true, layout: { width: 'grow' } }), ui.input({ label: 'Character name', value: 'Mara', maxLength: 16 }), uiHeroButton({ label: 'Begin', width: compact ? 130 : 150, onPress: () => {} })])])] },
  };
  const screen = screens[state];
  const board = uiWindow({ id: `design.title.${state}`, title: screen.title, layout: { direction: 'column', gap: 8, align: 'center', justify: 'center', width: uiFixed(width), height: uiFixed(116) }, children: screen.body });
  const corner = (child: UiElement, inset: Record<string, number>) => child.setStyle({ position: 'absolute', inset: Object.fromEntries(Object.entries(inset).map(([k, v]) => [k, uiFixed(v)])) });
  return ui.stack({ width: 'grow', height: 'grow' }, [
    uiTitleBackdrop({ image: () => mocks.assets?.get('island-background')?.image as never, children: [logo, board] }),
    corner(worldText(ui, 'Version 0.40.1'), { left: 8, bottom: 8 }),
    ...(state === 'signed-out' ? [corner(uiTextLink({ label: 'Local preview', light: true, onPress: () => {} }), { right: 8, bottom: 8 })] : []),
  ]);
}

/** The real game crafting surface (content frame path) with its recipe book open. */
function gameCrafting(ui: UiFactory, mocks: UiLabMocks, open: boolean): UiElement {
  const surface = ui.gameSurface(uiLabGameOptions('crafting', {}, mocks));
  const find = (node: UiElement): UiElement | undefined => node.kind === 'crafting-bench' ? node : node.children.map(find).find(Boolean);
  const bench = find(surface) as (UiElement & { setRecipeBook?: (open: boolean) => void }) | undefined;
  bench?.setRecipeBook?.(open);
  return centred(ui, surface);
}

export const DESIGN_SHEETS: readonly DesignSheet[] = [
  ...['character', 'skills', 'quests', 'statistics'].map((chapter): DesignSheet => ({ id: `book-${chapter}`, viewports: ['desktop', 'phone'], build: (ui, mocks, viewport) => characterBook(ui, mocks, chapter, viewport) })),
  { id: 'dialogue', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, dialogueWindow(mocks)) },
  { id: 'merchant-buy', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, merchantWindow(ui, mocks, 'buy')) },
  { id: 'merchant-sell', viewports: ['desktop'], build: (ui, mocks) => centred(ui, merchantWindow(ui, mocks, 'sell')) },
  { id: 'merchant-search', viewports: ['desktop'], build: (ui, mocks) => centred(ui, merchantWindow(ui, mocks, 'buy', 'to')) },
  { id: 'trade', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, tradeWindow(ui, mocks)) },
  { id: 'chest', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, chestWindow(ui, mocks)) },
  { id: 'game-menu', viewports: ['desktop'], build: ui => centred(ui, gameMenu()) },
  { id: 'settings-audio', viewports: ['desktop', 'phone'], build: ui => centred(ui, settingsWindow(ui, 'Audio')) },
  { id: 'settings-gameplay', viewports: ['desktop'], build: ui => centred(ui, settingsWindow(ui, 'Gameplay')) },
  { id: 'feedback', viewports: ['desktop'], build: ui => feedbackSheet(ui) },
  ...(['signed-out', 'welcome', 'loading', 'error', 'name'] as const).map((state): DesignSheet => ({ id: `title-${state}`, viewports: ['desktop', 'phone'], build: (ui, mocks, viewport) => titleScreen(ui, mocks, state, viewport) })),
  { id: 'b4-gateway', viewports: ['desktop'], build: ui => centred(ui, ui.flex({ direction: 'row', gap: 16, align: 'center' }, [gatewayWindow(ui, 'signed-out'), gatewayWindow(ui, 'error')])) },
  { id: 'b4-name', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, nameWindow(ui, mocks, false)) },
  { id: 'b4-dialogs', viewports: ['desktop'], build: (ui, mocks) => centred(ui, ui.flex({ direction: 'row', gap: 16, align: 'center' }, [updateDialog(ui), delveConfirm(ui), nameWindow(ui, mocks, true)])) },
  { id: 'b4-delve-rewards', viewports: ['desktop', 'phone'], build: ui => centred(ui, delveRewards(ui)) },
  { id: 'b4-build', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, buildPalette(ui, mocks)) },
  { id: 'b4-online-target', viewports: ['desktop'], build: (ui, mocks) => centred(ui, ui.flex({ direction: 'row', gap: 24, align: 'center' }, [onlinePlayers(ui), targetFrame(ui, mocks)])) },
  { id: 'b4-touch', viewports: ['phone', 'phone-landscape'], build: (ui, mocks, viewport) => touchHud(ui, mocks, viewport === 'phone-landscape') },
  { id: 'b4-help', viewports: ['desktop', 'phone'], build: (ui, _mocks, viewport) => helpBook(ui, viewport) },
  { id: 'game-crafting-closed', viewports: ['desktop', 'phone'], build: (ui, mocks) => gameCrafting(ui, mocks, false) },
  { id: 'game-crafting-open', viewports: ['desktop', 'phone'], build: (ui, mocks) => gameCrafting(ui, mocks, true) },
  { id: 'tooltips', viewports: ['desktop'], build: (ui, mocks) => tooltipSheet(ui, mocks) },
  { id: 'hud', viewports: ['desktop', 'phone'], build: (ui, mocks, viewport) => hudSheet(ui, mocks, viewport) },
  { id: 'inventory', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, inventoryWindow(ui, mocks)) },
  { id: 'crafting-closed', viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, craftingWindow(ui, mocks, false)) },
  { id: 'crafting-book-dialog', viewports: ['desktop', 'phone'], build: (ui, mocks, viewport) => centred(ui, ui.flex({ direction: viewport === 'phone' ? 'column' : 'row', gap: 8, align: 'center' }, [recipeBook(mocks, true), craftingWindow(ui, mocks, true)])) },
  ...STATIONS.map((spec): DesignSheet => ({ id: `station-${spec.id}`, viewports: ['desktop', 'phone'], build: (ui, mocks) => centred(ui, stationWindow(ui, mocks, spec)) })),
  { id: 'crafting-book-expanded', viewports: ['desktop'], build: (ui, mocks) => centred(ui, craftingWindow(ui, mocks, true, recipeBook(mocks, false))) },
];
