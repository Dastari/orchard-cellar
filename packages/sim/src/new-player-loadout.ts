import type { ContentRegistry } from './content/registry.js';
import type {
  LoadoutCellDefinition, LoadoutContainerId, LoadoutContentDefinition, LoadoutDefinitionId, LoadoutEntryDefinition,
} from './content/loadout-definition.js';
import {
  LEGACY_GLOBAL_SLOT_CONTAINERS, MAIN_HAND_EQUIPMENT_INDEX, MAIN_HAND_SELECTED_SLOT, legacyGlobalSlotToCell,
} from './container-addressing.js';
import { HOTBAR_SLOT_COUNT } from './inventory-layout.js';

export interface NewPlayerLoadoutRequest {
  /** This gate is authority-owned. Existing characters must never receive a
   * newly published starter kit during reconnect or content migration. */
  readonly existingCharacter: boolean;
  /** The cells a new character's container holds; a starter cell at or past it refuses the loadout. */
  readonly containerCapacity: (container: LoadoutContainerId) => number;
}

/** One starter stack and the cell it starts in. Only occupied cells are planned. */
export interface NewPlayerCellPlan {
  readonly container: LoadoutContainerId;
  readonly index: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface SkippedNewPlayerLoadoutPlan {
  readonly ok: true;
  readonly apply: false;
  readonly cells: readonly [];
}

export interface AppliedNewPlayerLoadoutPlan {
  readonly ok: true;
  readonly apply: true;
  readonly definitionId: LoadoutDefinitionId;
  readonly knownRecipeIds: readonly string[];
  /** The stored `player_survival.selectedSlot` value: a hotbar index, or `MAIN_HAND_SELECTED_SLOT`. */
  readonly selectedSlot: number;
  readonly selectedCell: LoadoutCellDefinition;
  readonly equippedKind: string;
  /** Occupied starter cells in container order (hotbar, backpack, equipment, crafting), then index. */
  readonly cells: readonly NewPlayerCellPlan[];
}

export interface FailedNewPlayerLoadoutPlan {
  readonly ok: false;
  readonly code: 'loadout_unavailable' | 'loadout_capacity_exceeded' | 'loadout_item_invalid' | 'loadout_recipe_invalid';
}

export type NewPlayerLoadoutPlan =
  | SkippedNewPlayerLoadoutPlan
  | AppliedNewPlayerLoadoutPlan
  | FailedNewPlayerLoadoutPlan;

/** An authored loadout address as a cell: a `cell` as given, or a legacy global `slot` translated once through the
 * frozen legacy layout. Null for a legacy slot past that layout. */
function loadoutAddressCell(address: { readonly slot?: number; readonly cell?: LoadoutCellDefinition }): LoadoutCellDefinition | null {
  if (address.cell !== undefined) return address.cell;
  if (address.slot === undefined) return null;
  const cell = legacyGlobalSlotToCell(address.slot);
  return cell === null || cell.container === 'stash' ? null : Object.freeze({ container: cell.container, index: cell.index });
}

export function loadoutEntryCell(entry: LoadoutEntryDefinition): LoadoutCellDefinition | null {
  return loadoutAddressCell(entry);
}

export function loadoutSelectedCell(loadout: LoadoutContentDefinition): LoadoutCellDefinition | null {
  return loadoutAddressCell({
    ...(loadout.selectedSlot === undefined ? {} : { slot: loadout.selectedSlot }),
    ...(loadout.selectedCell === undefined ? {} : { cell: loadout.selectedCell }),
  });
}

/** The stored selected-slot value naming a cell: a hotbar index or the Main Hand; null for any other cell. */
function selectedSlotForCell(cell: LoadoutCellDefinition): number | null {
  if (cell.container === 'hotbar' && cell.index < HOTBAR_SLOT_COUNT) return cell.index;
  return cell.container === 'equipment' && cell.index === MAIN_HAND_EQUIPMENT_INDEX ? MAIN_HAND_SELECTED_SLOT : null;
}

const cellKey = (cell: LoadoutCellDefinition): string => `${cell.container}:${cell.index}`;

export function activeNewPlayerLoadout(
  registry: Pick<ContentRegistry, 'loadouts'>,
): LoadoutContentDefinition | null {
  const candidates = [...registry.loadouts.values()].filter((definition) => (
    definition.role === 'new_player' && definition.retired !== true
  ));
  return candidates.length === 1 ? candidates[0]! : null;
}

export function planNewPlayerLoadout(
  registry: Pick<ContentRegistry, 'items' | 'loadouts' | 'recipes'>,
  request: NewPlayerLoadoutRequest,
): NewPlayerLoadoutPlan {
  // This must precede all content resolution: a missing or temporarily invalid
  // loadout can block new admission but can never rewrite a returning player.
  if (request.existingCharacter) return Object.freeze({ ok: true, apply: false, cells: [] as const });
  const loadout = activeNewPlayerLoadout(registry);
  if (loadout === null) return Object.freeze({ ok: false, code: 'loadout_unavailable' });
  const recipes = loadout.recipes ?? [];
  if (recipes.some(id => { const recipe = registry.recipes.get(id); return !recipe || recipe.retired === true; })) {
    return Object.freeze({ ok: false, code: 'loadout_recipe_invalid' });
  }
  const fits = (cell: LoadoutCellDefinition | null): cell is LoadoutCellDefinition => {
    if (cell === null) return false;
    const capacity = request.containerCapacity(cell.container);
    return Number.isSafeInteger(capacity) && cell.index < capacity;
  };
  const selectedCell = loadoutSelectedCell(loadout);
  const placed = loadout.entries.map((entry) => ({ entry, cell: loadoutEntryCell(entry) }));
  if (!fits(selectedCell) || !placed.every(({ cell }) => fits(cell))) {
    return Object.freeze({ ok: false, code: 'loadout_capacity_exceeded' });
  }
  const containerOrder = (container: LoadoutContainerId): number => LEGACY_GLOBAL_SLOT_CONTAINERS.indexOf(container);
  placed.sort((left, right) => containerOrder(left.cell!.container) - containerOrder(right.cell!.container)
    || left.cell!.index - right.cell!.index);

  const cells: NewPlayerCellPlan[] = [];
  for (const { entry, cell } of placed) {
    const item = registry.items.get(entry.item);
    if (item === undefined || item.retired === true || entry.quantity > item.maxStack) {
      return Object.freeze({ ok: false, code: 'loadout_item_invalid' });
    }
    cells.push(Object.freeze({
      container: cell!.container,
      index: cell!.index,
      itemKind: item.id.slice('item:'.length),
      quantity: entry.quantity,
      durability: item.durability?.max ?? 0,
      lit: entry.lit ?? true,
    }));
  }
  const selectedSlot = selectedSlotForCell(selectedCell);
  const equippedKind = cells.find((cell) => cellKey(cell) === cellKey(selectedCell))?.itemKind;
  if (selectedSlot === null || equippedKind === undefined) {
    return Object.freeze({ ok: false, code: 'loadout_item_invalid' });
  }
  return Object.freeze({
    ok: true,
    apply: true,
    definitionId: loadout.id,
    knownRecipeIds: Object.freeze(recipes.map(id => id.slice('recipe:'.length))),
    selectedSlot,
    selectedCell: Object.freeze({ container: selectedCell.container, index: selectedCell.index }),
    equippedKind,
    cells: Object.freeze(cells),
  });
}
