import type { ContentRegistry } from '../packages/sim/src/content/registry.js';

/** Release-only promises recovered from the retained production module. These
 * values never select gameplay rewards: active authored policy does that. They
 * prevent a prospective content merge from making saved escrow inaccessible. */
const HISTORICAL_BATCHES = [
  { recipeId: 'cook_beef', input: 'raw_beef', output: 'cooked_beef', experience: 7 },
  { recipeId: 'cook_fish', input: 'raw_fish', output: 'cooked_fish', experience: 5 },
  { recipeId: 'roast_chicken', input: 'raw_chicken', output: 'cooked_chicken', experience: 5 },
  { recipeId: 'roast_mutton', input: 'raw_mutton', output: 'cooked_mutton', experience: 6 },
  { recipeId: 'roast_pork', input: 'raw_pork', output: 'cooked_pork', experience: 6 },
] as const;

/** Apply only to prospective publication, never historical captures/candidates.
 * Removing these obligations requires a separate verified escrow retirement. */
export function assertCookingRegistryCompatibility(registry: ContentRegistry): void {
  const frames = [...registry.frames.values()].filter((frame) => frame.retired !== true);
  const inventoryCancel = frames.filter((frame) => frame.presentation?.surface === 'inventory'
    && frame.buttons?.some((button) => button.onInvoke?.claimProcessJob === 'cancel'));
  if (inventoryCancel.length !== 1) throw new Error('cooking_content_inventory_recovery_missing_or_ambiguous');
  const processes = [...registry.processes.values()];
  for (const obligation of HISTORICAL_BATCHES) {
    const policies = processes.flatMap((process) => process.legacyJob?.recipeId === obligation.recipeId ? [process.legacyJob] : []);
    if (policies.length !== 1 || policies[0]!.farmingExperiencePerItem !== obligation.experience) {
      throw new Error(`cooking_content_progression_changed:${obligation.recipeId}`);
    }
    for (const item of [obligation.input, obligation.output]) {
      const maximum = registry.compiled.itemDefinitions[item]?.maxStack;
      if (!registry.items.has(`item:${item}`) || maximum === undefined || !Number.isSafeInteger(maximum) || maximum < 1) {
        throw new Error(`cooking_content_escrow_item_unavailable:${item}`);
      }
    }
  }
  for (const id of ['object:campfire', 'object:camp_cooking_fire']) {
    const object = registry.objects.get(id);
    const frameRef = object?.components.frame?.ref;
    const frame = frameRef === undefined ? undefined : registry.frames.get(frameRef);
    const processor = object?.components.processor;
    const adapters = new Set(processes.filter((process) => process.stationTag === processor?.processTag)
      .map((process) => process.adapter));
    const opensFrame = object?.components.interactions?.some((interaction) => interaction.verb === 'use'
      && interaction.conditions.length === 0
      && interaction.effects.some((effect) => 'openFrame' in effect && effect.openFrame === frameRef));
    if (object === undefined || object.retired === true || processor === undefined
      || object.components.container === undefined || adapters.size !== 1 || !adapters.has('campfire_cooking')
      || (processor.slotRoles.input?.length ?? 0) === 0 || (processor.slotRoles.output?.length ?? 0) === 0
      || frame === undefined || frame.retired === true || frame.presentation?.surface !== 'entity'
      || !frame.buttons?.some((button) => button.onInvoke?.claimProcessJob === 'collect') || !opensFrame) {
      throw new Error(`cooking_content_station_collection_unavailable:${id}`);
    }
  }
  const aliases = [...registry.spaces.values()].flatMap((space) => (space.landmarks ?? [])
    .flatMap((landmark) => landmark.decorations.flatMap((rule) => rule.kind === 'point'
      && rule.placeable?.runtimeId === '3000000004' ? [{ space, rule }] : [])));
  if (aliases.length !== 1 || aliases[0]!.space.retired === true || aliases[0]!.space.spaceId !== 0
    || aliases[0]!.rule.tileX !== 336 || aliases[0]!.rule.tileY !== 356
    || aliases[0]!.rule.placeable?.object !== 'object:camp_cooking_fire') {
    throw new Error('cooking_content_landmark_alias_changed');
  }
}
