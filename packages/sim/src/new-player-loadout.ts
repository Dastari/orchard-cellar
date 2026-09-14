import type { ContentRegistry } from './content/registry.js';
import type { LoadoutContentDefinition, LoadoutDefinitionId } from './content/loadout-definition.js';

export interface NewPlayerLoadoutRequest {
  /** This gate is authority-owned. Existing characters must never receive a
   * newly published starter kit during reconnect or content migration. */
  readonly existingCharacter: boolean;
  readonly inventoryCapacity: number;
}

export interface NewPlayerInventorySlotPlan {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface SkippedNewPlayerLoadoutPlan {
  readonly ok: true;
  readonly apply: false;
  readonly slots: readonly [];
}

export interface AppliedNewPlayerLoadoutPlan {
  readonly ok: true;
  readonly apply: true;
  readonly definitionId: LoadoutDefinitionId;
  readonly selectedSlot: number;
  readonly equippedKind: string;
  readonly slots: readonly NewPlayerInventorySlotPlan[];
}

export interface FailedNewPlayerLoadoutPlan {
  readonly ok: false;
  readonly code: 'loadout_unavailable' | 'loadout_capacity_exceeded' | 'loadout_item_invalid';
}

export type NewPlayerLoadoutPlan =
  | SkippedNewPlayerLoadoutPlan
  | AppliedNewPlayerLoadoutPlan
  | FailedNewPlayerLoadoutPlan;

export function activeNewPlayerLoadout(
  registry: Pick<ContentRegistry, 'loadouts'>,
): LoadoutContentDefinition | null {
  const candidates = [...registry.loadouts.values()].filter((definition) => (
    definition.role === 'new_player' && definition.retired !== true
  ));
  return candidates.length === 1 ? candidates[0]! : null;
}

export function planNewPlayerLoadout(
  registry: Pick<ContentRegistry, 'items' | 'loadouts'>,
  request: NewPlayerLoadoutRequest,
): NewPlayerLoadoutPlan {
  // This must precede all content resolution: a missing or temporarily invalid
  // loadout can block new admission but can never rewrite a returning player.
  if (request.existingCharacter) return Object.freeze({ ok: true, apply: false, slots: [] as const });
  if (!Number.isSafeInteger(request.inventoryCapacity) || request.inventoryCapacity <= 0) {
    return Object.freeze({ ok: false, code: 'loadout_capacity_exceeded' });
  }
  const loadout = activeNewPlayerLoadout(registry);
  if (loadout === null) return Object.freeze({ ok: false, code: 'loadout_unavailable' });
  if (loadout.selectedSlot >= request.inventoryCapacity
    || loadout.entries.some(({ slot }) => slot >= request.inventoryCapacity)) {
    return Object.freeze({ ok: false, code: 'loadout_capacity_exceeded' });
  }

  const entries = new Map(loadout.entries.map((entry) => [entry.slot, entry] as const));
  const slots: NewPlayerInventorySlotPlan[] = [];
  for (let slot = 0; slot < request.inventoryCapacity; slot += 1) {
    const entry = entries.get(slot);
    if (entry === undefined) {
      slots.push(Object.freeze({ slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true }));
      continue;
    }
    const item = registry.items.get(entry.item);
    if (item === undefined || item.retired === true || entry.quantity > item.maxStack) {
      return Object.freeze({ ok: false, code: 'loadout_item_invalid' });
    }
    slots.push(Object.freeze({
      slot,
      itemKind: item.id.slice('item:'.length),
      quantity: entry.quantity,
      durability: item.durability?.max ?? 0,
      lit: entry.lit ?? true,
    }));
  }
  const equippedKind = slots[loadout.selectedSlot]?.itemKind;
  if (equippedKind === undefined || equippedKind === 'empty') {
    return Object.freeze({ ok: false, code: 'loadout_item_invalid' });
  }
  return Object.freeze({
    ok: true,
    apply: true,
    definitionId: loadout.id,
    selectedSlot: loadout.selectedSlot,
    equippedKind,
    slots: Object.freeze(slots),
  });
}
