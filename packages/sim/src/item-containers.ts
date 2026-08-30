import type { Modifier } from './modifiers.js';
import { PRESERVED_CROP_ITEM_DEFINITIONS } from './barreling.js';
import { CROP_HARVEST_ITEM_DEFINITIONS, CROP_SEED_ITEM_DEFINITIONS } from './crops.js';
import { FOOD_ITEM_DEFINITIONS } from './food.js';
import {
  RECIPES,
  recipeDefinition,
  recipeMatches,
  shapedRecipeIndexes,
  type RecipeId,
} from './recipes.js';

/** Shared chest geometry. Keeping capacity derived from its authored grid
 * prevents the client layout and server authority from drifting apart. */
export const CHEST_STORAGE_COLUMNS = 4;
export const CHEST_STORAGE_ROWS = 4;
export const CHEST_STORAGE_CAPACITY = CHEST_STORAGE_COLUMNS * CHEST_STORAGE_ROWS;
/** Inventory slots available without the backpack equipment upgrade. */
export const BASE_BACKPACK_CAPACITY = 8;

/** Explicitly marks a quest-owned artifact. These items are protected from
 * player-to-player transfer, merchant sale, and world dropping. Objective
 * materials such as wood deliberately do not receive this tag. */
export const UNIQUE_QUEST_ITEM_TAG = 'item.quest_unique';

/** A placeable's interaction UI is a data capability, not a hard-coded item
 * kind. Adding one of these tags to any registered placeable gives it the
 * corresponding processor/container contract on both client and authority. */
export const PLACEABLE_INTERFACE_TAGS = {
  cooking: 'interface.cooking',
  furnace: 'interface.furnace',
  barrel: 'interface.barrel',
  press: 'interface.press',
  fermentation: 'interface.fermentation',
} as const;
export type PlaceableInterface = keyof typeof PLACEABLE_INTERFACE_TAGS;

/** Stable presentation tier for an item kind. This is deliberately distinct
 * from a future per-crafted-instance quality roll: no row schema is needed to
 * render the authored inventory-slot treatment for each registered kind. */
export type ItemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDefinition {
  readonly displayName: string;
  readonly iconKey: string;
  readonly iconAnimation?: string;
  readonly quality: ItemQuality;
  readonly maxStack: number;
  readonly tags: readonly string[];
  /** Equipped-item contributions enter the same two-pass stat pipeline as
   * effects and skills. Empty today is valid; adding data needs no reducer. */
  readonly modifiers?: readonly Modifier[];
}

function defineItem(
  kind: string,
  displayName: string,
  maxStack: number,
  tags: readonly string[],
  modifiers?: readonly Modifier[],
  icon?: { readonly key: string; readonly animation?: string },
  quality: ItemQuality = 'common',
): ItemDefinition {
  return {
    displayName,
    iconKey: icon?.key ?? `icon_cf_${kind}`,
    ...(icon?.animation ? { iconAnimation: icon.animation } : {}),
    quality,
    maxStack,
    tags,
    ...(modifiers ? { modifiers } : {}),
  };
}

export const ITEM_DEFINITIONS = {
  homestead_deed: defineItem('homestead_deed', 'Homestead Deed', 1, ['item.document', 'item.homestead_deed'], undefined, undefined, 'legendary'),
  marlow_book: defineItem('marlow_book', 'Marlow\'s Book', 1, ['item.document', 'item.quest_reward', UNIQUE_QUEST_ITEM_TAG], undefined, { key: 'icon_cf_marlow_book' }),
  janes_gardening_book: defineItem('janes_gardening_book', 'Jane\'s Gardening Journal', 1, ['item.document', 'item.quest_reward', UNIQUE_QUEST_ITEM_TAG], undefined, { key: 'icon_cf_marlow_book' }, 'rare'),
  bob_fast_strawberry_seeds: defineItem('bob_fast_strawberry_seeds', 'Bob\'s Fast Strawberry Seeds', 99, ['item.seed', 'seed.strawberry', 'item.quest', UNIQUE_QUEST_ITEM_TAG], undefined, { key: 'item_cf_strawberry_seeds' }, 'rare'),
  axe: defineItem('axe', 'Iron Axe', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  hoe: defineItem('hoe', 'Iron Hoe', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  pickaxe: defineItem('pickaxe', 'Iron Pickaxe', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  watering_can: defineItem('watering_can', 'Watering Can', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  bow: defineItem('bow', 'Wooden Bow', 1, ['item.weapon', 'item.ranged_weapon', 'gear.hand'], undefined, undefined, 'rare'),
  sword: defineItem('sword', 'Iron Sword', 1, ['item.weapon', 'item.melee_weapon', 'gear.hand'], undefined, undefined, 'rare'),
  shovel: defineItem('shovel', 'Iron Shovel', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  hammer: defineItem('hammer', 'Iron Hammer', 1, ['item.tool', 'gear.hand'], undefined, undefined, 'uncommon'),
  torch: defineItem('torch', 'Torch', 16, ['item.tool', 'gear.hand', 'emits.light'], undefined, { key: 'item_cf_torch' }),
  lantern: defineItem('lantern', 'Lantern', 1, ['item.tool', 'gear.hand', 'emits.light'], undefined, { key: 'item_cf_lantern' }, 'rare'),
  arrow: defineItem('arrow', 'Arrow', 99, ['item.ammo', 'ammo.arrow'], undefined, { key: 'item_cf_arrow' }),
  wood: defineItem('wood', 'Wood', 99, ['item.resource', 'material.wood'], undefined, { key: 'item_cf_wood' }),
  pebble: defineItem('pebble', 'Pebble', 99, ['item.resource', 'material.stone', 'material.raw'], undefined, { key: 'item_cf_pebble' }),
  stone: defineItem('stone', 'Stone', 99, ['item.resource', 'material.stone'], undefined, { key: 'item_cf_stone' }),
  fiber: defineItem('fiber', 'Fiber', 99, ['item.resource', 'material.fiber'], undefined, { key: 'item_cf_fiber' }),
  iron_piece: defineItem('iron_piece', 'Iron Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.iron'], undefined, { key: 'item_cf_iron_piece' }),
  copper_piece: defineItem('copper_piece', 'Copper Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.copper'], undefined, { key: 'item_cf_copper_piece' }),
  gold_piece: defineItem('gold_piece', 'Gold Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.gold'], undefined, { key: 'item_cf_gold_piece' }),
  emerald_piece: defineItem('emerald_piece', 'Emerald Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.emerald'], undefined, { key: 'item_cf_emerald_piece' }),
  sapphire_piece: defineItem('sapphire_piece', 'Sapphire Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.sapphire'], undefined, { key: 'item_cf_sapphire_piece' }),
  topaz_piece: defineItem('topaz_piece', 'Topaz Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.topaz'], undefined, { key: 'item_cf_topaz_piece' }),
  ruby_piece: defineItem('ruby_piece', 'Ruby Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.ruby'], undefined, { key: 'item_cf_ruby_piece' }),
  amethyst_piece: defineItem('amethyst_piece', 'Amethyst Pieces', 99, ['item.resource', 'material.ore_piece', 'material.raw', 'ore.amethyst'], undefined, { key: 'item_cf_amethyst_piece' }),
  iron_ore: defineItem('iron_ore', 'Iron Ore Chunk', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.iron'], undefined, { key: 'item_cf_iron_ore' }),
  copper_ore: defineItem('copper_ore', 'Copper Ore Chunk', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.copper'], undefined, { key: 'item_cf_copper_ore' }),
  gold_ore: defineItem('gold_ore', 'Gold Ore Chunk', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.gold'], undefined, { key: 'item_cf_gold_ore' }),
  iron_bar: defineItem('iron_bar', 'Iron Bar', 99, ['item.resource', 'material.metal', 'material.bar', 'metal.iron'], undefined, { key: 'item_cf_iron_bar' }, 'uncommon'),
  copper_bar: defineItem('copper_bar', 'Copper Bar', 99, ['item.resource', 'material.metal', 'material.bar', 'metal.copper'], undefined, { key: 'item_cf_copper_bar' }, 'uncommon'),
  gold_bar: defineItem('gold_bar', 'Gold Bar', 99, ['item.resource', 'material.metal', 'material.bar', 'metal.gold'], undefined, { key: 'item_cf_gold_bar' }, 'rare'),
  emerald_ore: defineItem('emerald_ore', 'Emerald Ore', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.emerald'], undefined, { key: 'item_cf_emerald_ore' }),
  sapphire_ore: defineItem('sapphire_ore', 'Sapphire Ore', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.sapphire'], undefined, { key: 'item_cf_sapphire_ore' }),
  topaz_ore: defineItem('topaz_ore', 'Topaz Ore', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.topaz'], undefined, { key: 'item_cf_topaz_ore' }),
  ruby_ore: defineItem('ruby_ore', 'Ruby Ore', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.ruby'], undefined, { key: 'item_cf_ruby_ore' }),
  amethyst_ore: defineItem('amethyst_ore', 'Amethyst Ore', 99, ['item.resource', 'material.ore', 'material.raw', 'ore.amethyst'], undefined, { key: 'item_cf_amethyst_ore' }),
  plank: defineItem('plank', 'Wooden Planks', 99, ['item.resource', 'material.wood', 'item.crafted'], undefined, { key: 'item_cf_plank' }),
  stick: defineItem('stick', 'Stick', 99, ['item.resource', 'material.wood', 'item.crafted'], undefined, { key: 'item_cf_stick' }),
  cactus: defineItem('cactus', 'Cactus', 99, ['item.resource', 'material.plant', 'biome.desert'], undefined, { key: 'resource_cf_cactus' }),
  chest: defineItem('chest', 'Chest', 16, ['item.placeable', 'item.crafted', 'container.chest'], undefined, { key: 'prop_cf_chest', animation: 'chest' }),
  workbench: defineItem('workbench', 'Workbench', 16, ['item.placeable', 'item.crafted', 'station.workbench'], undefined, { key: 'prop_cf_workbench' }),
  anvil: defineItem('anvil', 'Anvil', 1, ['item.placeable', 'item.crafted', 'station.anvil'], undefined, { key: 'prop_cf_anvil', animation: 'animate' }),
  campfire: defineItem('campfire', 'Campfire', 16, ['item.placeable', 'item.crafted', 'station.campfire', 'emits.light'], undefined, { key: 'prop_cf_campfire', animation: 'burn' }),
  cooking_fire: defineItem('cooking_fire', 'Cooking Fire', 1, ['item.placeable', 'station.campfire', 'container.cooking_fire', PLACEABLE_INTERFACE_TAGS.cooking, 'emits.light'], undefined, { key: 'prop_cf_cooking_fire', animation: 'burn' }),
  camp_cooking_fire: defineItem('camp_cooking_fire', 'Camp Cooking Fire', 1, ['item.placeable', 'station.campfire', 'container.cooking_fire', PLACEABLE_INTERFACE_TAGS.cooking, 'emits.light'], undefined, { key: 'prop_cf_camp_cooking_fire', animation: 'burn' }),
  furnace: defineItem('furnace', 'Furnace', 1, ['item.placeable', 'item.crafted', 'station.furnace', 'container.furnace', PLACEABLE_INTERFACE_TAGS.furnace], undefined, { key: 'prop_cf_furnace', animation: 'off' }),
  fence: defineItem('fence', 'Fence', 99, ['item.placeable', 'item.crafted', 'build.fence'], undefined, { key: 'prop_cf_fence_corner' }),
  fence_gate: defineItem('fence_gate', 'Fence Gate', 16, ['item.placeable', 'item.crafted', 'build.fence'], undefined, { key: 'prop_cf_fence_gate' }),
  sign: defineItem('sign', 'Sign', 16, ['item.placeable', 'item.crafted'], undefined, { key: 'prop_cf_sign' }),
  standing_torch: defineItem('standing_torch', 'Standing Torch', 16, ['item.placeable', 'item.crafted', 'emits.light'], undefined, { key: 'prop_cf_standing_torch', animation: 'burn' }),
  fruit_press: defineItem('fruit_press', 'Fruit Press', 1, ['item.placeable', 'item.crafted', 'station.press', 'container.press', PLACEABLE_INTERFACE_TAGS.press], undefined, { key: 'prop_basket_press' }, 'uncommon'),
  fermentation_cask: defineItem('fermentation_cask', 'Fermentation Cask', 1, ['item.placeable', 'item.crafted', 'station.cellar', 'container.fermentation', PLACEABLE_INTERFACE_TAGS.fermentation], undefined, { key: 'prop_oak_barrel' }, 'uncommon'),
  sprinkler: defineItem('sprinkler', 'Sprinkler', 1, ['item.placeable', 'build.automation', 'build.sprinkler'], undefined, { key: 'prop_cf_sprinkler' }, 'uncommon'),
  shed: defineItem('shed', 'Estate Shed', 1, ['item.placeable', 'item.crafted', 'build.prefab'], undefined, { key: 'building_cf_shed' }, 'uncommon'),
  greenhouse: defineItem('greenhouse', 'Greenhouse', 1, ['item.placeable', 'item.crafted', 'build.prefab', 'build.greenhouse'], undefined, { key: 'building_cf_greenhouse' }, 'rare'),
  barn: defineItem('barn', 'Barn', 1, ['item.placeable', 'item.crafted', 'build.prefab'], undefined, { key: 'building_cf_barn' }, 'rare'),
  coop: defineItem('coop', 'Coop', 1, ['item.placeable', 'item.crafted', 'build.prefab'], undefined, { key: 'building_cf_coop' }, 'uncommon'),
  silo: defineItem('silo', 'Silo', 1, ['item.placeable', 'item.crafted', 'build.prefab'], undefined, { key: 'building_cf_silo' }, 'rare'),
  ...FOOD_ITEM_DEFINITIONS,
  ...CROP_SEED_ITEM_DEFINITIONS,
  ...CROP_HARVEST_ITEM_DEFINITIONS,
  ...PRESERVED_CROP_ITEM_DEFINITIONS,
  apple: defineItem('apple', 'Apple', 32, ['item.crop', 'item.food', 'crop.fruit'], undefined, { key: 'item_cf_apple' }),
  pear: defineItem('pear', 'Pear', 32, ['item.crop', 'item.food', 'crop.fruit'], undefined, { key: 'item_cf_pear' }),
  peach: defineItem('peach', 'Peach', 32, ['item.crop', 'item.food', 'crop.fruit'], undefined, { key: 'item_cf_peach' }),
  cherry: defineItem('cherry', 'Cherries', 32, ['item.crop', 'item.food', 'crop.fruit'], undefined, { key: 'item_cf_cherry' }),
  grape: defineItem('grape', 'Grapes', 99, ['item.crop', 'item.food', 'crop.grape', 'crop.fruit'], undefined, { key: 'item_cf_crop_grape' }),
  must: defineItem('must', 'Fresh Must', 99, ['item.resource', 'item.cellar', 'cellar.must'], undefined, { key: 'icon_resource_must' }, 'uncommon'),
  pomace: defineItem('pomace', 'Pomace', 99, ['item.resource', 'item.cellar', 'cellar.pomace'], undefined, { key: 'icon_resource_pomace' }),
  bottles: defineItem('bottles', 'Estate Bottles', 99, ['item.product', 'item.cellar', 'cellar.bottles'], undefined, { key: 'icon_resource_bottles' }, 'rare'),
  orchard_tea: defineItem('orchard_tea', 'Orchard Tea', 8, ['item.consumable', 'item.food', 'effect.orchard_tea'], undefined, { key: 'icon_cf_effect_orchard_tea' }),
  barrel: defineItem('barrel', 'Barrel', 16, ['item.placeable', 'item.crafted', 'container.barrel', PLACEABLE_INTERFACE_TAGS.barrel], undefined, { key: 'prop_cf_barrel', animation: 'closed' }),
  backpack: defineItem('backpack', 'Backpack', 1, ['item.equipment', 'container.backpack'], undefined, { key: 'item_cf_backpack' }, 'uncommon'),
  necklace: defineItem('necklace', 'Necklace', 1, ['item.equipment', 'gear.neck'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'neck' }, 'epic'),
  helm: defineItem('helm', 'Helm', 1, ['item.equipment', 'gear.head'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'head' }, 'uncommon'),
  tunic: defineItem('tunic', 'Tunic', 1, ['item.equipment', 'gear.body'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'body' }, 'uncommon'),
  ring: defineItem('ring', 'Ring', 1, ['item.equipment', 'gear.ring'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'ring' }, 'epic'),
  shield: defineItem('shield', 'Shield', 1, ['item.equipment', 'gear.hand', 'gear.off_hand'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'off_hand' }, 'rare'),
  gloves: defineItem('gloves', 'Gloves', 1, ['item.equipment', 'gear.hands'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'hands' }, 'uncommon'),
  pants: defineItem('pants', 'Pants', 1, ['item.equipment', 'gear.legs'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'legs' }, 'uncommon'),
  boots: defineItem('boots', 'Boots', 1, ['item.equipment', 'gear.feet'], undefined, { key: 'ui_cf_equipment_slot_icons', animation: 'feet' }, 'uncommon'),
} as const satisfies Readonly<Record<string, ItemDefinition>>;

export type KnownItemKind = keyof typeof ITEM_DEFINITIONS;

export interface ItemStack {
  readonly itemKind: string;
  readonly quantity: number;
  /** Present only for non-stackable durable tools. Storage authorities must
   * preserve it when moving/swapping the stack. */
  readonly durability?: number;
  /** Power state for switchable light sources. It is item metadata, so storage
   * authorities must preserve it through moves, drops, and container swaps. */
  readonly lit?: boolean;
}

export function isSwitchableLightKind(itemKind: string): boolean {
  return itemKind === 'lantern';
}

export function isUniqueQuestItemKind(itemKind: string): boolean {
  return itemDefinition(itemKind)?.tags.includes(UNIQUE_QUEST_ITEM_TAG) === true;
}

export function stackMetadataMatches(left: ItemStack, right: ItemStack): boolean {
  return left.durability === right.durability && left.lit === right.lit;
}

export function itemStacksCompatible(left: ItemStack, right: ItemStack): boolean {
  return left.itemKind === right.itemKind && stackMetadataMatches(left, right);
}

export interface SlotRestriction {
  readonly acceptedKinds?: readonly string[];
  readonly requiredTags?: readonly string[];
  /** Output/result cells may be extracted from but never used as a move target. */
  readonly readOnly?: boolean;
}

export interface ContainerSnapshot {
  readonly id: string;
  readonly capacity: number;
  /** Sparse rows from storage are represented as null slots at this boundary. */
  readonly slots: readonly (ItemStack | null)[];
  readonly restrictions?: Readonly<Record<number, SlotRestriction>>;
}

export interface MoveItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly toContainer: string;
  readonly toIndex: number;
  readonly quantity: number;
}

export interface QuickMoveItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly toContainers: readonly string[];
}

export interface QuickMoveAllMatchingRequest {
  readonly itemKind: string;
  readonly fromContainers: readonly string[];
  readonly toContainers: readonly string[];
}

export interface DistributeItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly targets: readonly DragDistributionTarget[];
  readonly quantity?: number;
}

export interface DragDistributionTarget {
  readonly container: string;
  readonly index: number;
}

export type CursorClickButton = 'left' | 'right';
export type QuickCraftMode = 'even' | 'one_each';

export interface CursorSlotRequest {
  readonly container: string;
  readonly index: number;
  readonly button: CursorClickButton;
}

export interface CursorQuickCraftRequest {
  readonly targets: readonly DragDistributionTarget[];
  readonly mode: QuickCraftMode;
}

export interface CursorInteractionSuccess {
  readonly ok: true;
  readonly outcome: 'pickup' | 'place' | 'merge' | 'swap' | 'quick_craft' | 'pickup_all';
  readonly movedQuantity: number;
  readonly cursor: ItemStack | null;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type CursorInteractionResult = ItemRuleFailure | CursorInteractionSuccess;

export type ItemRuleErrorCode =
  | 'container_not_found'
  | 'index_out_of_capacity'
  | 'invalid_quantity'
  | 'source_empty'
  | 'source_quantity_changed'
  | 'unknown_item_kind'
  | 'slot_rejects_item'
  | 'target_stack_full'
  | 'partial_swap_forbidden'
  | 'same_slot'
  | 'recipe_not_found'
  | 'recipe_inputs_missing'
  | 'recipe_output_blocked'
  | 'container_full';

export interface ItemRuleFailure {
  readonly ok: false;
  readonly code: ItemRuleErrorCode;
}

export interface MoveItemSuccess {
  readonly ok: true;
  readonly outcome: 'move' | 'split' | 'merge' | 'swap' | 'quick_move' | 'distribute';
  readonly movedQuantity: number;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type MoveItemResult = ItemRuleFailure | MoveItemSuccess;

export interface InsertItemSuccess {
  readonly ok: true;
  readonly insertedQuantity: number;
  readonly container: ContainerSnapshot;
}

export interface InsertItemPartialSuccess extends InsertItemSuccess {
  readonly remainderQuantity: number;
}

export type InsertItemResult = ItemRuleFailure | InsertItemSuccess;
export type InsertItemPartialResult = ItemRuleFailure | InsertItemPartialSuccess;

export interface SortContainerSuccess {
  readonly ok: true;
  readonly outcome: 'sort';
  readonly container: ContainerSnapshot;
}

export type SortContainerResult = ItemRuleFailure | SortContainerSuccess;

export interface CraftRequest {
  readonly recipeId: string;
  readonly gridContainer: string;
  /** A reserved result slot is never consumed as an input. */
  readonly resultIndex: number;
}

export interface CraftSuccess {
  readonly ok: true;
  readonly crafted: ItemStack;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type CraftResult = ItemRuleFailure | CraftSuccess;

export interface ConsumeRecipeSuccess {
  readonly ok: true;
  readonly crafted: ItemStack;
  readonly container: ContainerSnapshot;
}

export type ConsumeRecipeResult = ItemRuleFailure | ConsumeRecipeSuccess;

export function itemDefinition(itemKind: string): ItemDefinition | null {
  return Object.prototype.hasOwnProperty.call(ITEM_DEFINITIONS, itemKind)
    ? ITEM_DEFINITIONS[itemKind as KnownItemKind]
    : null;
}

export function itemHasTag(itemKind: string, tag: string): boolean {
  return itemDefinition(itemKind)?.tags.includes(tag) === true;
}

export function placeableInterface(itemKind: string): PlaceableInterface | null {
  for (const [capability, tag] of Object.entries(PLACEABLE_INTERFACE_TAGS) as readonly [PlaceableInterface, string][]) {
    if (itemHasTag(itemKind, tag)) return capability;
  }
  return null;
}

export function placeableHasInterface(itemKind: string, capability: PlaceableInterface): boolean {
  return itemHasTag(itemKind, PLACEABLE_INTERFACE_TAGS[capability]);
}

export function itemModifiers(itemKind: string): readonly Modifier[] {
  return itemDefinition(itemKind)?.modifiers ?? [];
}

export function maxStackFor(itemKind: string): number | null {
  return itemDefinition(itemKind)?.maxStack ?? null;
}

export function slotAcceptsItem(container: ContainerSnapshot, index: number, itemKind: string): boolean {
  const definition = itemDefinition(itemKind);
  if (!definition || !Number.isSafeInteger(index) || index < 0 || index >= container.capacity) return false;
  const restriction = container.restrictions?.[index];
  if (restriction?.readOnly === true) return false;
  if (!restriction) return true;
  if (restriction.acceptedKinds && !restriction.acceptedKinds.includes(itemKind)) return false;
  return (restriction.requiredTags ?? []).every((tag) => definition.tags.includes(tag));
}

/**
 * Inserts a complete pickup atomically, filling partial stacks before empty
 * slots. If the entire quantity cannot fit, the original container is left
 * untouched and the pickup must remain in the world.
 */
export function insertItemStack(container: ContainerSnapshot, item: ItemStack): InsertItemResult {
  const maxStack = maxStackFor(item.itemKind);
  if (maxStack === null) return failure('unknown_item_kind');
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return failure('invalid_quantity');
  const normalized = normalizeContainer(container);
  let available = 0;
  for (let index = 0; index < normalized.capacity; index += 1) {
    if (!slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const stack = normalized.slots[index];
    if (stack == null) available += maxStack;
    else if (stack.itemKind === item.itemKind && validStack(stack) && stackMetadataMatches(stack, item)) {
      available += maxStack - stack.quantity;
    }
  }
  if (available < item.quantity) return failure('container_full');

  const slots = [...normalized.slots];
  let remaining = item.quantity;
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    const stack = slots[index];
    if (stack?.itemKind !== item.itemKind || !stackMetadataMatches(stack, item)
      || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack - stack.quantity);
    if (inserted <= 0) continue;
    slots[index] = { ...stack, quantity: stack.quantity + inserted };
    remaining -= inserted;
  }
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index] !== null || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack);
    slots[index] = { ...item, quantity: inserted };
    remaining -= inserted;
  }
  return { ok: true, insertedQuantity: item.quantity, container: withSlots(normalized, slots) };
}

/** Inserts as much as possible without ever discarding the remainder. This is
 * used by durable overflow recovery, where a partially-drained safety stack
 * must stay recorded until more player inventory space becomes available. */
export function insertItemStackPartial(container: ContainerSnapshot, item: ItemStack): InsertItemPartialResult {
  const maxStack = maxStackFor(item.itemKind);
  if (maxStack === null) return failure('unknown_item_kind');
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return failure('invalid_quantity');
  const normalized = normalizeContainer(container);
  const slots = [...normalized.slots];
  let remaining = item.quantity;
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    const stack = slots[index];
    if (stack?.itemKind !== item.itemKind || !stackMetadataMatches(stack, item)
      || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack - stack.quantity);
    if (inserted <= 0) continue;
    slots[index] = { ...stack, quantity: stack.quantity + inserted };
    remaining -= inserted;
  }
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index] !== null || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack);
    slots[index] = { ...item, quantity: inserted };
    remaining -= inserted;
  }
  const insertedQuantity = item.quantity - remaining;
  if (insertedQuantity === 0) return failure('container_full');
  return {
    ok: true,
    insertedQuantity,
    remainderQuantity: remaining,
    container: withSlots(normalized, slots),
  };
}

function validStack(stack: ItemStack | null): stack is ItemStack {
  if (!stack) return false;
  const maxStack = maxStackFor(stack.itemKind);
  return maxStack !== null && Number.isSafeInteger(stack.quantity) && stack.quantity > 0 && stack.quantity <= maxStack;
}

function normalizeContainer(container: ContainerSnapshot): ContainerSnapshot {
  return {
    ...container,
    slots: Array.from({ length: container.capacity }, (_, index) => container.slots[index] ?? null),
  };
}

function cloneContainers(containers: Readonly<Record<string, ContainerSnapshot>>): Record<string, ContainerSnapshot> {
  return Object.fromEntries(Object.entries(containers).map(([id, container]) => [id, normalizeContainer(container)]));
}

function failure(code: ItemRuleErrorCode): ItemRuleFailure {
  return { ok: false, code };
}

function withSlots(container: ContainerSnapshot, slots: readonly (ItemStack | null)[]): ContainerSnapshot {
  return { ...container, slots };
}

/** Compacts compatible stacks and orders them deterministically. This is the
 * shared rule behind every storage-pane sort button; callers persist the
 * returned snapshot as one authoritative transaction. Item metadata is part
 * of stack identity, so tools and differently powered lanterns never merge. */
export function sortAndStackContainer(container: ContainerSnapshot): SortContainerResult {
  const normalized = normalizeContainer(container);
  const groups: { exemplar: ItemStack; quantity: number }[] = [];
  for (const stack of normalized.slots) {
    if (stack === null) continue;
    if (!validStack(stack)) return failure('unknown_item_kind');
    const group = groups.find((candidate) => itemStacksCompatible(candidate.exemplar, stack));
    if (group === undefined) groups.push({ exemplar: { ...stack }, quantity: stack.quantity });
    else group.quantity += stack.quantity;
  }
  groups.sort((left, right) => {
    const leftDefinition = itemDefinition(left.exemplar.itemKind)!;
    const rightDefinition = itemDefinition(right.exemplar.itemKind)!;
    if (leftDefinition.displayName !== rightDefinition.displayName) {
      return leftDefinition.displayName < rightDefinition.displayName ? -1 : 1;
    }
    if (left.exemplar.itemKind !== right.exemplar.itemKind) {
      return left.exemplar.itemKind < right.exemplar.itemKind ? -1 : 1;
    }
    const leftDurability = left.exemplar.durability ?? -1;
    const rightDurability = right.exemplar.durability ?? -1;
    if (leftDurability !== rightDurability) return rightDurability - leftDurability;
    return Number(right.exemplar.lit ?? false) - Number(left.exemplar.lit ?? false);
  });

  const stacks: ItemStack[] = [];
  for (const group of groups) {
    const maximum = maxStackFor(group.exemplar.itemKind)!;
    let remaining = group.quantity;
    while (remaining > 0) {
      const quantity = Math.min(maximum, remaining);
      stacks.push({ ...group.exemplar, quantity });
      remaining -= quantity;
    }
  }

  const slots = Array.from({ length: normalized.capacity }, () => null as ItemStack | null);
  for (const stack of stacks) {
    const destination = slots.findIndex((candidate, index) => (
      candidate === null && slotAcceptsItem(normalized, index, stack.itemKind)
    ));
    if (destination < 0) return failure('slot_rejects_item');
    slots[destination] = stack;
  }
  return { ok: true, outcome: 'sort', container: withSlots(normalized, slots) };
}

export function moveItemStacks(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: MoveItemRequest,
): MoveItemResult {
  const from = containers[request.fromContainer];
  const to = containers[request.toContainer];
  if (!from || !to) return failure('container_not_found');
  if (![request.fromIndex, request.toIndex].every(Number.isSafeInteger)
    || request.fromIndex < 0 || request.fromIndex >= from.capacity
    || request.toIndex < 0 || request.toIndex >= to.capacity) return failure('index_out_of_capacity');
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) return failure('invalid_quantity');
  if (request.fromContainer === request.toContainer && request.fromIndex === request.toIndex) return failure('same_slot');

  const source = from.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  if (request.quantity > source.quantity) return failure('source_quantity_changed');
  if (!slotAcceptsItem(to, request.toIndex, source.itemKind)) return failure('slot_rejects_item');
  const target = to.slots[request.toIndex] ?? null;
  if (target && !validStack(target)) return failure('unknown_item_kind');

  const next = cloneContainers(containers);
  const sameContainer = request.fromContainer === request.toContainer;
  const fromSlots = [...next[request.fromContainer]!.slots];
  const toSlots = sameContainer ? fromSlots : [...next[request.toContainer]!.slots];
  const sourceRemainder = source.quantity - request.quantity;

  let outcome: MoveItemSuccess['outcome'];
  let movedQuantity = request.quantity;
  if (!target) {
    fromSlots[request.fromIndex] = sourceRemainder ? { ...source, quantity: sourceRemainder } : null;
    toSlots[request.toIndex] = { ...source, quantity: request.quantity };
    outcome = sourceRemainder ? 'split' : 'move';
  } else if (target.itemKind === source.itemKind && stackMetadataMatches(target, source)) {
    const maxStack = maxStackFor(source.itemKind)!;
    movedQuantity = Math.min(request.quantity, maxStack - target.quantity);
    if (movedQuantity <= 0) return failure('target_stack_full');
    fromSlots[request.fromIndex] = source.quantity === movedQuantity ? null : { ...source, quantity: source.quantity - movedQuantity };
    toSlots[request.toIndex] = { ...target, quantity: target.quantity + movedQuantity };
    outcome = 'merge';
  } else {
    if (request.quantity !== source.quantity) return failure('partial_swap_forbidden');
    if (!slotAcceptsItem(from, request.fromIndex, target.itemKind)) return failure('slot_rejects_item');
    fromSlots[request.fromIndex] = target;
    toSlots[request.toIndex] = source;
    outcome = 'swap';
  }

  next[request.fromContainer] = withSlots(next[request.fromContainer]!, fromSlots);
  next[request.toContainer] = withSlots(next[request.toContainer]!, toSlots);
  return { ok: true, outcome, movedQuantity, containers: next };
}

/** Minecraft PICKUP authority. The cursor is a real stack, separate from every
 * container slot; mouse-up never implicitly returns it to its source. */
export function clickContainerSlot(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  cursor: ItemStack | null,
  request: CursorSlotRequest,
): CursorInteractionResult {
  const container = containers[request.container];
  if (!container) return failure('container_not_found');
  if (!Number.isSafeInteger(request.index) || request.index < 0 || request.index >= container.capacity) {
    return failure('index_out_of_capacity');
  }
  const normalized = normalizeContainer(container);
  const slot = normalized.slots[request.index] ?? null;
  if (slot !== null && !validStack(slot)) return failure('unknown_item_kind');
  if (cursor !== null && !validStack(cursor)) return failure('unknown_item_kind');
  if (cursor === null && slot === null) return failure('source_empty');

  const next = cloneContainers(containers);
  const slots = [...next[request.container]!.slots];
  if (cursor === null) {
    const pickedUp = request.button === 'right' ? Math.ceil(slot!.quantity / 2) : slot!.quantity;
    const remainder = slot!.quantity - pickedUp;
    slots[request.index] = remainder === 0 ? null : { ...slot!, quantity: remainder };
    next[request.container] = withSlots(next[request.container]!, slots);
    return {
      ok: true, outcome: 'pickup', movedQuantity: pickedUp,
      cursor: { ...slot!, quantity: pickedUp }, containers: next,
    };
  }

  if (slot === null) {
    if (!slotAcceptsItem(normalized, request.index, cursor.itemKind)) return failure('slot_rejects_item');
    const capacity = maxStackFor(cursor.itemKind)!;
    const placed = request.button === 'right' ? 1 : Math.min(cursor.quantity, capacity);
    slots[request.index] = { ...cursor, quantity: placed };
    next[request.container] = withSlots(next[request.container]!, slots);
    return {
      ok: true, outcome: 'place', movedQuantity: placed,
      cursor: cursor.quantity === placed ? null : { ...cursor, quantity: cursor.quantity - placed },
      containers: next,
    };
  }

  if (itemStacksCompatible(slot, cursor)) {
    if (!slotAcceptsItem(normalized, request.index, cursor.itemKind)) return failure('slot_rejects_item');
    const free = maxStackFor(cursor.itemKind)! - slot.quantity;
    const moved = Math.min(cursor.quantity, request.button === 'right' ? Math.min(1, free) : free);
    if (moved <= 0) return failure('target_stack_full');
    slots[request.index] = { ...slot, quantity: slot.quantity + moved };
    next[request.container] = withSlots(next[request.container]!, slots);
    return {
      ok: true, outcome: 'merge', movedQuantity: moved,
      cursor: cursor.quantity === moved ? null : { ...cursor, quantity: cursor.quantity - moved },
      containers: next,
    };
  }

  // Both mouse buttons swap incompatible stacks in vanilla PICKUP handling.
  if (!slotAcceptsItem(normalized, request.index, cursor.itemKind)) return failure('slot_rejects_item');
  slots[request.index] = cursor;
  next[request.container] = withSlots(next[request.container]!, slots);
  return { ok: true, outcome: 'swap', movedQuantity: cursor.quantity, cursor: slot, containers: next };
}

/** Minecraft QUICK_CRAFT. Targets are unique and only compatible cells take
 * part. Even mode assigns floor(starting cursor / eligible cells) to each;
 * unlike the old source-slot drag, its remainder stays on the cursor. */
export function quickCraftCursorStack(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  cursor: ItemStack | null,
  request: CursorQuickCraftRequest,
): CursorInteractionResult {
  if (cursor === null) return failure('source_empty');
  if (!validStack(cursor)) return failure('unknown_item_kind');
  const seen = new Set<string>();
  const targets = request.targets.flatMap((target) => {
    const key = `${target.container}:${target.index}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const container = containers[target.container];
    if (!container) return [];
    if (!Number.isSafeInteger(target.index) || target.index < 0 || target.index >= container.capacity) return [];
    if (!slotAcceptsItem(container, target.index, cursor.itemKind)) return [];
    const stack = container.slots[target.index] ?? null;
    if (stack !== null && (!validStack(stack) || !itemStacksCompatible(stack, cursor))) return [];
    const available = maxStackFor(cursor.itemKind)! - (stack?.quantity ?? 0);
    return available > 0 ? [{ ...target, available }] : [];
  });
  if (targets.length === 0) return failure('container_full');
  const perTarget = request.mode === 'one_each' ? 1 : Math.floor(cursor.quantity / targets.length);
  if (perTarget <= 0) return failure('invalid_quantity');

  const next = cloneContainers(containers);
  let remaining = cursor.quantity;
  let movedQuantity = 0;
  for (const target of targets) {
    if (remaining === 0) break;
    const moved = Math.min(perTarget, target.available, remaining);
    if (moved <= 0) continue;
    const container = next[target.container]!;
    const slots = [...container.slots];
    const stack = slots[target.index];
    slots[target.index] = stack
      ? { ...stack, quantity: stack.quantity + moved }
      : { ...cursor, quantity: moved };
    next[target.container] = withSlots(container, slots);
    remaining -= moved;
    movedQuantity += moved;
  }
  if (movedQuantity === 0) return failure('container_full');
  return {
    ok: true, outcome: 'quick_craft', movedQuantity,
    cursor: remaining === 0 ? null : { ...cursor, quantity: remaining }, containers: next,
  };
}

/** Minecraft PICKUP_ALL traversal, including item metadata in stack identity. */
export function pickupAllToCursor(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  cursor: ItemStack | null,
  containerOrder: readonly string[],
): CursorInteractionResult {
  if (cursor === null) return failure('source_empty');
  if (!validStack(cursor)) return failure('unknown_item_kind');
  const maximum = maxStackFor(cursor.itemKind)!;
  let needed = maximum - cursor.quantity;
  if (needed <= 0) return failure('target_stack_full');
  const next = cloneContainers(containers);
  let movedQuantity = 0;
  for (const id of uniqueContainerIds(containerOrder)) {
    const container = next[id];
    if (!container) return failure('container_not_found');
    const slots = [...container.slots];
    for (let index = 0; index < container.capacity && needed > 0; index += 1) {
      const stack = slots[index];
      if (stack == null || !validStack(stack) || !itemStacksCompatible(stack, cursor)) continue;
      const moved = Math.min(stack.quantity, needed);
      slots[index] = stack.quantity === moved ? null : { ...stack, quantity: stack.quantity - moved };
      movedQuantity += moved;
      needed -= moved;
    }
    next[id] = withSlots(container, slots);
    if (needed === 0) break;
  }
  if (movedQuantity === 0) return failure('source_empty');
  return {
    ok: true, outcome: 'pickup_all', movedQuantity,
    cursor: { ...cursor, quantity: cursor.quantity + movedQuantity }, containers: next,
  };
}

function uniqueContainerIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Minecraft-style shift click: merge into existing stacks first, then fill
 * empty slots in destination-container order. A partial move is valid. */
export function quickMoveItemStack(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: QuickMoveItemRequest,
): MoveItemResult {
  const sourceContainer = containers[request.fromContainer];
  if (!sourceContainer) return failure('container_not_found');
  if (!Number.isSafeInteger(request.fromIndex) || request.fromIndex < 0 || request.fromIndex >= sourceContainer.capacity) {
    return failure('index_out_of_capacity');
  }
  const source = sourceContainer.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  const destinationIds = uniqueContainerIds(request.toContainers).filter((id) => id !== request.fromContainer);
  if (destinationIds.some((id) => containers[id] === undefined)) return failure('container_not_found');

  const next = cloneContainers(containers);
  let remaining = source.quantity;
  const maximum = maxStackFor(source.itemKind)!;
  const passes = ['merge', 'empty'] as const;
  for (const pass of passes) for (const id of destinationIds) {
    const destination = next[id]!;
    const slots = [...destination.slots];
    for (let index = 0; index < destination.capacity && remaining > 0; index += 1) {
      if (!slotAcceptsItem(destination, index, source.itemKind)) continue;
      const stack = slots[index];
      if (pass === 'merge' && stack?.itemKind === source.itemKind && stackMetadataMatches(stack, source)) {
        const moved = Math.min(remaining, maximum - stack.quantity);
        if (moved > 0) slots[index] = { ...stack, quantity: stack.quantity + moved };
        remaining -= moved;
      } else if (pass === 'empty' && stack === null) {
        const moved = Math.min(remaining, maximum);
        slots[index] = { ...source, quantity: moved };
        remaining -= moved;
      }
    }
    next[id] = withSlots(destination, slots);
  }
  const movedQuantity = source.quantity - remaining;
  if (movedQuantity <= 0) return failure('container_full');
  const sourceSlots = [...next[request.fromContainer]!.slots];
  sourceSlots[request.fromIndex] = remaining === 0 ? null : { ...source, quantity: remaining };
  next[request.fromContainer] = withSlots(next[request.fromContainer]!, sourceSlots);
  return { ok: true, outcome: 'quick_move', movedQuantity, containers: next };
}

/** Shift-double-click: transfer every matching stack from the selected
 * inventory side in deterministic slot order. The entire gesture is computed
 * from immutable snapshots so an authority can commit it as one transaction. */
export function quickMoveAllMatchingStacks(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: QuickMoveAllMatchingRequest,
): MoveItemResult {
  if (maxStackFor(request.itemKind) === null) return failure('unknown_item_kind');
  const sourceIds = uniqueContainerIds(request.fromContainers);
  if ([...sourceIds, ...request.toContainers].some((id) => containers[id] === undefined)) {
    return failure('container_not_found');
  }
  let next = cloneContainers(containers);
  let movedQuantity = 0;
  for (const sourceId of sourceIds) {
    const capacity = next[sourceId]!.capacity;
    for (let index = 0; index < capacity; index += 1) {
      const stack = next[sourceId]!.slots[index];
      if (stack?.itemKind !== request.itemKind) continue;
      const moved = quickMoveItemStack(next, {
        fromContainer: sourceId,
        fromIndex: index,
        toContainers: request.toContainers,
      });
      if (!moved.ok) {
        if (moved.code === 'container_full') return movedQuantity === 0
          ? moved
          : { ok: true, outcome: 'quick_move', movedQuantity, containers: next };
        return moved;
      }
      movedQuantity += moved.movedQuantity;
      next = { ...moved.containers };
    }
  }
  return movedQuantity === 0
    ? failure('source_empty')
    : { ok: true, outcome: 'quick_move', movedQuantity, containers: next };
}

/** Evenly spreads a held stack over every compatible slot crossed during a
 * shift-drag. Remainders are assigned in first-visited order. */
export function distributeItemStack(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: DistributeItemRequest,
): MoveItemResult {
  const sourceContainer = containers[request.fromContainer];
  if (!sourceContainer) return failure('container_not_found');
  if (!Number.isSafeInteger(request.fromIndex) || request.fromIndex < 0 || request.fromIndex >= sourceContainer.capacity) {
    return failure('index_out_of_capacity');
  }
  const source = sourceContainer.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  const requestedQuantity = request.quantity ?? source.quantity;
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > source.quantity) {
    return failure('invalid_quantity');
  }

  const seen = new Set<string>();
  const targets = request.targets.filter((target) => {
    const key = `${target.container}:${target.index}`;
    if (seen.has(key) || (target.container === request.fromContainer && target.index === request.fromIndex)) return false;
    seen.add(key);
    return true;
  });
  const capacities = targets.flatMap((target) => {
    const container = containers[target.container];
    if (!container) return [];
    if (!Number.isSafeInteger(target.index) || target.index < 0 || target.index >= container.capacity) return [];
    if (!slotAcceptsItem(container, target.index, source.itemKind)) return [];
    const stack = container.slots[target.index] ?? null;
    if (stack !== null && stack.itemKind !== source.itemKind) return [];
    return [{ ...target, available: (maxStackFor(source.itemKind) ?? 0) - (stack?.quantity ?? 0) }];
  }).filter((target) => target.available > 0);
  if (capacities.length === 0) return failure('container_full');
  const movedQuantity = Math.min(requestedQuantity, capacities.reduce((sum, target) => sum + target.available, 0));
  if (movedQuantity <= 0) return failure('container_full');

  const allocations = capacities.map(() => 0);
  let remaining = movedQuantity;
  while (remaining > 0) {
    const eligible = capacities.map((target, index) => ({ target, index }))
      .filter(({ target, index }) => allocations[index]! < target.available);
    if (eligible.length === 0) break;
    const share = Math.max(1, Math.floor(remaining / eligible.length));
    for (const { target, index } of eligible) {
      const moved = Math.min(share, target.available - allocations[index]!, remaining);
      allocations[index] = allocations[index]! + moved;
      remaining -= moved;
      if (remaining === 0) break;
    }
  }

  const next = cloneContainers(containers);
  capacities.forEach((target, allocationIndex) => {
    const quantity = allocations[allocationIndex] ?? 0;
    if (quantity <= 0) return;
    const container = next[target.container]!;
    const slots = [...container.slots];
    const stack = slots[target.index];
    slots[target.index] = stack
      ? { ...stack, quantity: stack.quantity + quantity }
      : { ...source, quantity };
    next[target.container] = withSlots(container, slots);
  });
  const sourceSlots = [...next[request.fromContainer]!.slots];
  const sourceRemainder = source.quantity - movedQuantity;
  sourceSlots[request.fromIndex] = sourceRemainder === 0 ? null : { ...source, quantity: sourceRemainder };
  next[request.fromContainer] = withSlots(next[request.fromContainer]!, sourceSlots);
  return { ok: true, outcome: 'distribute', movedQuantity, containers: next };
}

function inputSlots(grid: ContainerSnapshot, resultIndex: number): readonly (ItemStack | null)[] {
  return grid.slots.filter((_stack, index) => index !== resultIndex);
}

export function matchingRecipeId(
  grid: ContainerSnapshot,
  resultIndex = grid.capacity,
): RecipeId | null {
  const slots = inputSlots(normalizeContainer(grid), resultIndex);
  for (const [recipeId, recipe] of Object.entries(RECIPES)) {
    if (recipeMatches(recipe, slots)) return recipeId as RecipeId;
  }
  return null;
}

export function craftingRecipeOutput(recipeId: string): ItemStack | null {
  const recipe = recipeDefinition(recipeId);
  return recipe ? { ...recipe.output } : null;
}

export function consumeCraftingRecipe(
  grid: ContainerSnapshot,
  recipeId: string,
  resultIndex = grid.capacity,
): ConsumeRecipeResult {
  const recipe = recipeDefinition(recipeId);
  if (!recipe) return failure('recipe_not_found');
  const normalized = normalizeContainer(grid);
  if (!recipeMatches(recipe, inputSlots(normalized, resultIndex))) return failure('recipe_inputs_missing');
  const slots = [...normalized.slots];
  if (recipe.kind === 'shaped') {
    const indexes = shapedRecipeIndexes(recipe, inputSlots(normalized, resultIndex));
    if (indexes === null) return failure('recipe_inputs_missing');
    indexes.forEach((index) => {
      const stack = slots[index]!;
      slots[index] = stack.quantity === 1 ? null : { ...stack, quantity: stack.quantity - 1 };
    });
  } else {
    for (const [itemKind, quantity] of Object.entries(recipe.inputs)) {
      let remaining = quantity;
      for (let index = 0; index < slots.length && remaining > 0; index += 1) {
        if (index === resultIndex || slots[index]?.itemKind !== itemKind) continue;
        const stack = slots[index]!;
        const consumed = Math.min(stack.quantity, remaining);
        remaining -= consumed;
        slots[index] = stack.quantity === consumed ? null : { ...stack, quantity: stack.quantity - consumed };
      }
    }
  }
  return { ok: true, crafted: recipe.output, container: withSlots(normalized, slots) };
}

export function craftItem(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: CraftRequest,
): CraftResult {
  const recipe = recipeDefinition(request.recipeId);
  if (!recipe) return failure('recipe_not_found');
  const grid = containers[request.gridContainer];
  if (!grid) return failure('container_not_found');
  if (!Number.isSafeInteger(request.resultIndex) || request.resultIndex < 0 || request.resultIndex >= grid.capacity) {
    return failure('index_out_of_capacity');
  }
  if (!slotAcceptsItem(grid, request.resultIndex, recipe.output.itemKind)) return failure('recipe_output_blocked');

  const outputStack = grid.slots[request.resultIndex] ?? null;
  const outputMax = maxStackFor(recipe.output.itemKind);
  if (outputMax === null) return failure('unknown_item_kind');
  if (outputStack && (outputStack.itemKind !== recipe.output.itemKind
    || outputStack.quantity + recipe.output.quantity > outputMax)) return failure('recipe_output_blocked');

  const consumed = consumeCraftingRecipe(grid, request.recipeId, request.resultIndex);
  if (!consumed.ok) return consumed;
  const next = cloneContainers(containers);
  const slots = [...consumed.container.slots];
  slots[request.resultIndex] = outputStack
    ? { ...outputStack, quantity: outputStack.quantity + recipe.output.quantity }
    : { ...recipe.output };
  next[request.gridContainer] = withSlots(next[request.gridContainer]!, slots);
  return { ok: true, crafted: recipe.output, containers: next };
}
