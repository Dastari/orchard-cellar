/** Local catalogue authoring; does not install or activate resource nodes. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseItemDefinition, parseLootDefinition } from '@orchard/sim';
const directory = resolve(import.meta.dirname, '../../assets/content');
const items = (JSON.parse(await readFile(resolve(directory, 'items.json'), 'utf8')) as unknown[]).map(parseItemDefinition);
const loots = (JSON.parse(await readFile(resolve(directory, 'loot.json'), 'utf8')) as unknown[]).map(parseLootDefinition);
const rock = loots.find(row => row.id === 'loot:mining_rock_large')!;
const rockBonus = loots.find(row => row.id === 'loot:mining_rock_bonus') ?? parseLootDefinition({
  id: 'loot:mining_rock_bonus', kind: 'loot', schemaVersion: 1,
  groups: rock.groups.filter(group => group.id === 'bonus'),
});
const bonusGroup = { id: 'bonus', entries: [{ id: 'fragments', weight: 1,
  target: { loot: 'loot:mining_rock_bonus' } }] };
const minerals = [['rock_basalt', 'basalt'], ['ore_cinder', 'cinder_ore'], ['ore_emberglass', 'emberglass']] as const;
const additions = minerals.map(([kind, item]) => parseLootDefinition({
  id: `loot:mining_${kind}`, kind: 'loot', schemaVersion: 1,
  groups: [{ id: 'primary', entries: [{ id: item, weight: 1,
    ...(kind.startsWith('ore_') ? { flags: ['ore'] } : {}),
    target: { item: `item:${item}`, min: 1, max: 1 },
  }] }, kind === 'rock_basalt' ? bonusGroup : {
    id: 'mother_lode', entries: [{ id: 'material', weight: 1, flags: ['ore'],
      conditions: [
        { context: { key: 'nodeClass', operator: 'eq', value: 'pure' } },
        { context: { key: 'maximumRichness', operator: 'gte', value: 5 } },
        { context: { key: 'yieldsProduced', operator: 'eq', value: 0 } },
        { skillRank: { skill: 'mother_lode', minimum: 1 } },
      ], target: { item: `item:${item}`, min: 1, max: 1 },
    }],
  }],
}));
additions.push(rockBonus, parseLootDefinition({ ...rock,
  groups: [...rock.groups.filter(group => group.id !== 'bonus'), bonusGroup],
}));
additions.push(parseLootDefinition({ id: 'loot:resource_tree_ashwood', kind: 'loot', schemaVersion: 1,
  groups: [{ id: 'primary', entries: [{ id: 'ashwood', weight: 1,
    conditions: [{ context: { key: 'remainingHealth', operator: 'eq', value: 0 } },
      { context: { key: 'treeGrowthStage', operator: 'eq', value: 3 } }],
    target: { item: 'item:ashwood', min: 3, max: 3 },
  }] }],
}));
for (const item of ['ashwood', ...minerals.map(([, item]) => item)]) {
  if (!items.some(row => row.id === `item:${item}` && !row.retired)) throw new Error(`missing_material:${item}`);
}
const tools: string[] = [];
const nextItems = items.map(item => {
  if (item.retired || item.tool?.specialization !== 'mining' || item.tool.mineableResources === undefined) return item;
  tools.push(item.id);
  return parseItemDefinition({ ...item, tool: { ...item.tool,
    mineableResources: [...new Set([...item.tool.mineableResources, ...minerals.map(([kind]) => kind)])],
  } });
});
const ids = new Set(additions.map(row => row.id));
await writeFile(resolve(directory, 'items.json'), JSON.stringify(nextItems, null, 2) + '\n');
await writeFile(resolve(directory, 'loot.json'), JSON.stringify([...loots.filter(row => !ids.has(row.id)), ...additions]
  .sort((a, b) => a.id.localeCompare(b.id)), null, 2) + '\n');
console.log(JSON.stringify({ lootProfiles: additions.length, tools }));
