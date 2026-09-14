import type { ContentRegistry } from './content/registry.js';
import type { NpcContentDefinition, NpcDefinitionId } from './content/npc-definition.js';
import type { ContainerSnapshot } from './item-containers.js';

export function hearthRecipeExchangeNpcForRuntimeId(
  registry: ContentRegistry,
  runtimeId: string,
): NpcContentDefinition | null {
  const matches = [...registry.npcs.values()].filter(npc => npc.retired !== true
    && npc.runtimeId === runtimeId && npc.commerce?.recipeExchange !== undefined);
  return matches.length === 1 ? matches[0]! : null;
}

export function hearthLegendaryRecipeOffer(
  registry: ContentRegistry,
  npcId: NpcDefinitionId,
  recipeId: string,
) {
  const npc = registry.npcs.get(npcId), exchange = npc?.commerce?.recipeExchange;
  if (!npc || npc.retired || !exchange || !exchange.recipes.includes(`recipe:${recipeId}`)) return null;
  const recipe = registry.recipes.get(`recipe:${recipeId}`);
  const item = recipe && registry.items.get(recipe.output.item);
  const paymentItem = registry.items.get(exchange.payment.item);
  if (!recipe || recipe.retired || recipe.requiresKnowledge !== true || !item || item.retired
    || item.quality !== 'legendary' || !item.equip || recipe.output.count !== 1
    || !paymentItem || paymentItem.retired || paymentItem.durability !== undefined) return null;
  return { recipeId, itemKind: item.id.slice('item:'.length), title: item.displayName,
    seals: exchange.payment.count, paymentItemKind: paymentItem.id.slice('item:'.length), npcId };
}

/** Preflight only. The authority commits inventory and unique recipe knowledge
 * together; the knowledge row itself prevents repeat charges on retries. */
export function planHearthSealExchange(input: {
  registry: ContentRegistry; npcId: NpcDefinitionId; recipeId: string; alreadyKnown: boolean;
  expectedContentHash: string; expectedSeals: number;
  containers: Readonly<Record<string, ContainerSnapshot>>;
}) {
  const fail = (code: string) => ({ ok: false as const, code });
  if (input.expectedContentHash !== input.registry.contentHash) return fail('seal_exchange_content_changed');
  const offer = hearthLegendaryRecipeOffer(input.registry, input.npcId, input.recipeId);
  if (!offer) return fail('seal_recipe_unavailable');
  if (input.alreadyKnown) return fail('recipe_already_known');
  if (input.expectedSeals !== offer.seals) return fail('seal_exchange_quote_changed');
  const paymentItem = input.registry.items.get(`item:${offer.paymentItemKind}`);
  if (!paymentItem || paymentItem.retired || paymentItem.durability !== undefined) return fail('seal_exchange_unavailable');
  const containers = { ...input.containers };
  let remaining = offer.seals;
  for (const id of ['hotbar', 'backpack']) {
    const container = input.containers[id];
    if (!container || container.id !== id || !Number.isSafeInteger(container.capacity)
      || container.capacity < 0 || container.capacity > container.slots.length) return fail('seal_inventory_invalid');
    const slots = [...container.slots];
    for (let index = 0; index < slots.length; index++) {
      const stack = slots[index];
      if (!stack || stack.itemKind !== offer.paymentItemKind) continue;
      if (index >= container.capacity || !Number.isSafeInteger(stack.quantity) || stack.quantity <= 0
        || stack.quantity > paymentItem.maxStack || (stack.durability ?? 0) !== 0
        || container.restrictions?.[index]?.readOnly === true) return fail('seal_inventory_invalid');
      const count = Math.min(remaining, stack.quantity);
      remaining -= count;
      slots[index] = count === stack.quantity ? null : { ...stack, quantity: stack.quantity - count };
    }
    containers[id] = { ...container, slots };
  }
  if (remaining > 0) return fail('guardian_seals_missing');
  return { ok: true as const, offer, containers };
}
