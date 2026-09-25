/** Player-facing wording for authority rejections. The toast has room for 42 characters. The new
 * wordings from the BUG-037 follow-up (recipe placement, crafting mismatch) fit within 42; some
 * older entries below are longer and overflow, which BUG-043 tracks. */
export type FailureWording = readonly (readonly [code: string, text: string])[];
// Placing a recipe first returns the grid's other items to the pack; it fails only when they don't fit.
export const RECIPE_PLACE_FAILURES: FailureWording = [['container_full', 'NO ROOM TO CLEAR THE CRAFTING GRID']];
// At the anvil a wrong tool means an undamaged one, so it keeps its specific wording.
export const ANVIL_FAILURES: FailureWording = [['wrong_tool', 'SELECT A DAMAGED TOOL']];

export function failureToastText(error: unknown, overrides: FailureWording = []): string {
  const raw = error instanceof Error ? error.message : String(error);
  const knownFailures = [
    ...overrides,
    ['inventory_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['container_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['insufficient_vigour', 'INSUFFICIENT VIGOUR'],
    ['anvil_copper_missing', 'ANVIL REPAIR NEEDS 5 COPPER'],
    ['anvil_not_in_reach', 'FACE A NEARBY ANVIL'],
    ['furnace_slot_restricted', 'ORE GOES ABOVE, WOOD OR PLANKS BELOW'],
    ['recipe_inputs_missing', "THE GRID DOESN'T MATCH THE RECIPE"],
    ['recipe_not_found', 'THAT RECIPE IS NOT AVAILABLE'],
    ['item_reserved', 'THAT DROP IS RESERVED FOR ITS MINER'],
    ['mining_claimed_by_other_party', 'ANOTHER MINER OR PARTY IS WORKING THIS NODE'],
    ['pickaxe_tier_too_low', 'THIS VEIN NEEDS A STRONGER PICKAXE'],
    ['fishing_requires_water', 'FISHING REQUIRES A CLEAR WATER TILE'],
    ['tool_not_damaged', 'TOOL IS ALREADY FULLY REPAIRED'],
    ['wrong_tool', 'THAT NEEDS A DIFFERENT TOOL'],
    ['target_out_of_range', 'TOO FAR AWAY'],
    ['resource_depleted', 'NOTHING LEFT TO GATHER'],
    ['hands_occupied', 'YOUR HANDS ARE FULL'],
    ['tool_broken', 'THIS TOOL IS BROKEN'],
    ['out_of_arrows', 'NO ARROWS LEFT'],
    ['backpack_in_use', 'EMPTY THE EXTRA PACK SLOTS BEFORE UNEQUIPPING IT'],
    ['stable_hand_required', 'LEARN STABLE HAND IN ANIMAL HUSBANDRY'],
    ['steeplechase_required', 'LEARN STEEPLECHASE IN EXPLORER'],
    ['surefooted_required', 'LEARN SUREFOOTED OR CLIFF CLIMBER IN EXPLORER'],
    ['jump_no_safe_landing', 'NO SAFE JUMP LANDING'],
    ['jump_cooldown', 'STILL LANDING'],
    ['tool_skill_required', 'MORE SPECIALIZATION RANKS ARE REQUIRED FOR THIS TOOL'],
    ['equipment_light_required', 'EQUIP A SWITCHABLE LIGHT IN YOUR OFF-HAND SLOT'],
  ] as const satisfies FailureWording;
  const known = knownFailures.find(([code]) => raw.toLowerCase().includes(code));
  return known?.[1] ?? raw.replaceAll('_', ' ').toUpperCase();
}

// Rejections the player can already see (the swing animation simply doesn't repeat) show no toast.
export const SILENT_FAILURES = ['swing_too_soon'] as const;
