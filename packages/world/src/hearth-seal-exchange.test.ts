import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function declaration(name: string) {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
    if (ts.isVariableStatement(node)) for (const row of node.declarationList.declarations) {
      if (row.name.getText(source) !== name || !row.initializer || !ts.isCallExpression(row.initializer)) continue;
      const callback = row.initializer.arguments.find(ts.isArrowFunction);
      if (callback) return `const ${name}=${callback.getText(source)};`;
    }
  }
  throw new Error(name);
}
const registry = sim.bootstrapContentRegistry();
function fixture() {
  const owner = { toHexString: () => 'alice' };
  const npc = registry.npcs.get('npc:willow_archivist')!;
  const dialogue = registry.dialogues.get('dialogue:willow_archivist')!;
  const choice = dialogue.nodes.find(node => node.id === dialogue.initialNodeId)!.choices.find(choice => choice.id === 'equipment_plans')!;
  const runtimeDialogueId = dialogue.id.slice('dialogue:'.length);
  const active = { npcId: BigInt(npc.runtimeId), dialogueId: runtimeDialogueId, nodeId: choice.nextNodeId };
  const worldNpc = { id: active.npcId, kind: npc.runtimeKind ?? npc.id.slice('npc:'.length), spaceId: 0 };
  let inventory: Record<string, sim.ContainerSnapshot> = {
    hotbar: { id: 'hotbar', capacity: 2, slots: [{ itemKind: 'guardian_seal', quantity: 1 }, { itemKind: 'wood', quantity: 5 }] },
    backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind: 'guardian_seal', quantity: 5 }] },
    crafting: { id: 'crafting', capacity: 1, slots: [{ itemKind: 'guardian_seal', quantity: 99 }] },
  };
  const known = new Map<string, { id: string; recipeId: string; sourceKind: string }>();
  const writes: string[] = [];
  let reachable = true, alive = true, locked = false, mounted = false, hands = false;
  const ctx = { sender: owner, senderAuth: { jwt: null }, db: {
    membership: { identity: { find: () => null } },
    active_dialogue: { identity: { find: () => active } },
    player_position: { identity: { find: () => ({ spaceId: 0 }) } },
    world_merchant: { npcId: { find: () => ({ dialogueId: runtimeDialogueId }) } },
    world_npc: { id: { find: () => worldNpc } },
    world_clock: { id: { find: () => ({ authorityTick: 42n }) } },
    player_known_recipe: { id: { find: (id: string) => known.get(id) ?? null }, insert: (row: { id: string; recipeId: string; sourceKind: string }) => { known.set(row.id, row); writes.push('knowledge'); } },
  } };
  const dependencies = { ...sim, SenderError: Error, contentRegistry: () => registry,
    requireAuthorizedSender: () => {}, requirePersistentInventoryAvailable: () => { if (locked) throw new Error('descent_inventory_locked'); },
    npcWithinInteractionReach: () => reachable, advancePlayerStats: () => ({ healthCenti: alive ? 100 : 0 }),
    mountedNpcFor: () => mounted ? {} : null, handsOccupiedFor: () => hands,
    inventorySlotOffset: sim.inventoryContainerSlotOffset,
    loadPlayerInventory: () => ({ containers: inventory, rowBySlot: new Map() }),
    writePlayerInventory: (_ctx: unknown, _rows: unknown, _old: unknown, next: typeof inventory) => { inventory = next; writes.push('inventory'); },
    updateEquippedFromInventory: () => {}, refreshSenderQuestsFromInventory: () => {}, recordPlayerStatistic: () => {},
  };
  const code = ts.transpileModule(['activeMerchantSession', 'unlockHearthLegendaryRecipe'].map(declaration).join('\n') + '\nreturn unlockHearthLegendaryRecipe;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const unlock = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  const request = { recipeId: 'hearth_legendary_sword', expectedSeals: 3, expectedContentHash: registry.contentHash };
  return { active, known, writes, request, use: () => unlock(ctx, request), snapshot: () => structuredClone(inventory),
    setInventory: (next: typeof inventory) => { inventory = next; },
    block: (kind: string) => { reachable = kind !== 'reach'; alive = kind !== 'dead'; locked = kind === 'locked'; mounted = kind === 'mounted'; hands = kind === 'hands'; },
  };
}
describe('guardian-seal exchange authority', () => {
  it('admits the actual authored Iona shop, consumes split seals and deduplicates retried requests', () => {
    const f = fixture(); f.use();
    expect(f.snapshot().hotbar!.slots).toEqual([null, { itemKind: 'wood', quantity: 5 }]);
    expect(f.snapshot().backpack!.slots).toEqual([{ itemKind: 'guardian_seal', quantity: 3 }]);
    expect(f.snapshot().crafting!.slots[0]!.quantity).toBe(99);
    expect(f.known.get('alice:hearth_legendary_sword')).toMatchObject({ recipeId: 'hearth_legendary_sword', sourceKind: 'guardian_seal' });
    const before = f.snapshot();
    expect(() => f.use()).toThrow('recipe_already_known');
    expect(f.snapshot()).toEqual(before); expect(f.writes).toEqual(['inventory', 'knowledge']);
  });
  it('rejects stale quotes, missing seals, unavailable recipes and invalid admission without inventory writes', () => {
    for (const kind of ['hash', 'price', 'recipe', 'missing', 'reach', 'dead', 'locked', 'mounted', 'hands', 'greeting', 'merchant']) {
      const f = fixture(); f.block(kind);
      if (kind === 'hash') f.request.expectedContentHash = 'stale';
      if (kind === 'price') f.request.expectedSeals = 2;
      if (kind === 'recipe') f.request.recipeId = 'hearth_epic_sword';
      if (kind === 'greeting') f.active.nodeId = 'greeting';
      if (kind === 'merchant') f.active.npcId = 1n;
      if (kind === 'missing') {
        const next = f.snapshot(); next.backpack = { id: 'backpack', capacity: 1, slots: [{ itemKind: 'guardian_seal', quantity: 1 }] }; f.setInventory(next);
      }
      const before = f.snapshot(); expect(() => f.use(), kind).toThrow();
      expect(f.snapshot()).toEqual(before); expect(f.writes).toEqual([]); expect(f.known.size).toBe(0);
    }
  });
  it('restricts the allowlist and fails closed for changed recipe outputs and hidden seal stacks', () => {
    const npc=registry.npcs.get('npc:willow_archivist')!;
    const recipeIds=npc.commerce!.recipeExchange!.recipes.map(id=>id.slice('recipe:'.length));
    expect(recipeIds).toHaveLength(8);
    for (const id of recipeIds) expect(sim.hearthLegendaryRecipeOffer(registry,npc.id,id)?.seals).toBe(3);
    const recipe = registry.recipes.get('recipe:hearth_legendary_sword')!;
    for (const patch of [{ retired: true }, { requiresKnowledge: false }, { output: { item: 'item:hearth_epic_sword', count: 1 } }] as const) {
      const recipes = new Map(registry.recipes); recipes.set(recipe.id, { ...recipe, ...patch });
      expect(sim.hearthLegendaryRecipeOffer({ ...registry, recipes },npc.id,'hearth_legendary_sword')).toBeNull();
    }
    const f = fixture(), next = f.snapshot(); next.backpack = { ...next.backpack!, capacity: 0 }; f.setInventory(next);
    expect(() => f.use()).toThrow('seal_inventory_invalid'); expect(f.writes).toEqual([]);
  });
});
