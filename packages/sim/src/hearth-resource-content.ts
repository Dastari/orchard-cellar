import type { ContentRegistry } from './content/registry.js';
import { runtimeItemDefinition, runtimeToolCanMineResource, runtimeToolDefinition } from './content/runtime.js';
import { activeHearthResourceSites, runtimeHearthResourceDefinition } from './hearth-resource-sites.js';

/** Authority content contract for the reviewed deterministic gathering
 * cohort. Deliberately checks authored retirement as well as compiled runtime
 * availability; a material record alone does not make a node harvestable. */
export function hearthGatheringContentReady(registry: ContentRegistry): boolean {
  const resources = [...registry.resources.values()].filter(
    (definition) => definition.fixedSites !== undefined,
  );
  if (resources.length === 0) return false;
  if (resources.some((definition) => definition.retired === true)) return false;
  const projectedSites = activeHearthResourceSites(registry);
  if (projectedSites.length !== resources.reduce(
    (count, definition) => count + (definition.fixedSites?.length ?? 0), 0,
  )) return false;
  for (const authored of resources) {
    const resource = runtimeHearthResourceDefinition(registry, {
      kind: authored.runtimeKind,
      definitionId: authored.id,
    });
    if (resource === null || resource.interaction.mode === 'gather') return false;
    const loot = registry.loots.get(resource.loot);
    if (loot === undefined || loot.retired === true || loot.groups.length !== 1) return false;
    const group = loot.groups[0]!;
    if ((group.conditions?.length ?? 0) !== 0 || group.entries.length !== 1) return false;
    const entry = group.entries[0]!;
    if (!(entry.weight > 0) || !('item' in entry.target)
      || entry.target.min <= 0 || entry.target.max !== entry.target.min) return false;
    const materialKind = entry.target.item.slice('item:'.length);
    const item = registry.items.get(entry.target.item);
    if (item === undefined || item.retired === true
      || runtimeItemDefinition(registry, materialKind) === null) return false;
    const conditions = entry.conditions ?? [];
    if (resource.maturityGrowthStage !== undefined) {
      if (conditions.length !== 2 || ![
        ['remainingHealth', 0], ['treeGrowthStage', resource.maturityGrowthStage],
      ].every(([key, value]) =>
        conditions.some(condition => 'context' in condition && condition.context.key === key
          && condition.context.operator === 'eq' && condition.context.value === value))) return false;
    } else if (conditions.length !== 0) return false;
    const requirement = resource.interaction.tool;
    if (requirement?.baselineItem === undefined) return false;
    const candidate = registry.items.get(requirement.baselineItem);
    const itemKind = requirement.baselineItem.slice('item:'.length);
    const tool = runtimeToolDefinition(registry, itemKind);
    if (candidate === undefined || candidate.retired === true || candidate.quality !== 'common'
      || tool?.specialization !== requirement.specialization
      || tool.tier < requirement.minimumTier
      || (tool.reachTiles ?? 0) < 1 || (tool.swingTicks ?? 0) <= 0
      || tool.avatarAction === undefined || candidate.equip?.avatarAction !== tool.avatarAction
      || candidate.durability === undefined || candidate.durability.max <= 0
      || candidate.vigour === undefined
      || (resource.interaction.mode === 'mine'
        && !runtimeToolCanMineResource(registry, itemKind, resource.runtimeKind))) return false;
  }
  return true;
}
