import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { applyBehaviourEffects, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters } from './behaviour/applier.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'worldBehaviourEffectWriter')!;
const referenceDeclaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'authoredReferenceSlug')!;
const javascript = ts.transpileModule(referenceDeclaration.getText(source) + '\n' + declaration.getText(source) + '\nreturn worldBehaviourEffectWriter;', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
const registry = sim.bootstrapContentRegistry();
const batch: sim.Effect[] = [{consumeSelected: 1}, {restoreHunger: 1600}, {statistic: {kind: 'food_eaten', subject: 'preserved_carrot'}}];
function fixture() {
  const state = { item: {id: 'owner:0', itemKind: 'preserved_carrot', quantity: 1, slot: 0, durability: 0, lit: true},
    survival: {selectedSlot: 0, hungerCenti: 9900, hungerUpdatedTick: 0n}, writes: [] as string[],
    statistics: [] as {kind: string; amount: bigint; subject: string}[] };
  const ctx = {sender: {toHexString: () => 'owner'}, db: {
    player_position: {identity: {find: () => ({x: 0, y: 0, spaceId: 0})}},
    player_survival: {identity: {find: () => state.survival, update: (row: typeof state.survival) => {state.survival = row; state.writes.push('hunger');}}},
    inventory_slot: {id: {find: () => state.item}}, world_clock: {id: {find: () => ({authorityTick: 10n})}},
  }};
  const dependencies = {...sim, SenderError: Error, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters,
    ANVIL_REPAIR_COST_BRONZE: 5, U64_MAX: (1n << 64n) - 1n, contentRegistry: () => registry,
    writeInventorySlot: (_ctx: unknown, row: typeof state.item) => {state.item = row; state.writes.push('inventory');},
    updateEquippedForIdentity: () => {},
    recordPlayerStatistic: (_ctx: unknown, _identity: unknown, kind: string, amount: bigint, _tick: bigint, subject: string) => {
      state.statistics.push({kind, amount, subject}); state.writes.push('statistic');
    },
  };
  const writer = new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
  return {state, apply: (effects = batch, actorIsSender = true) => applyBehaviourEffects(effects, writer(ctx, undefined, actorIsSender))};
}

describe('preserved provision authority transaction', () => {
  it('caps hunger and consumes/records exactly one portion from current custody', () => {
    const f = fixture(); f.apply();
    expect(f.state.survival.hungerCenti).toBe(10000);
    expect(f.state.item).toMatchObject({itemKind: 'empty', quantity: 0});
    expect(f.state.statistics).toEqual([{kind: 'food_eaten', amount: 1n, subject: 'preserved_carrot'}]);
    const committed = [...f.state.writes];
    expect(() => f.apply()).toThrow(); expect(f.state.writes).toEqual(committed);
  });
  it('rejects full hunger and a stale selected stack before any consumption or statistic', () => {
    const full = fixture(); full.state.survival.hungerCenti = 10000;
    expect(() => full.apply()).toThrow('hunger_full'); expect(full.state.writes).toEqual([]);
    const stale = fixture(); stale.state.item.itemKind = 'wood';
    expect(() => stale.apply()).toThrow('food_not_edible'); expect(stale.state.writes).toEqual([]);
  });
  it('rejects unauthorized actors, changed amounts and incomplete batches without writes', () => {
    const actor = fixture(); expect(() => actor.apply(batch, false)).toThrow(); expect(actor.state.writes).toEqual([]);
    for (const effects of [[{restoreHunger: 1600}], [{consumeSelected: 1}, {restoreHunger: 5000}]] as sim.Effect[][]) {
      const f = fixture(); expect(() => f.apply(effects)).toThrow(); expect(f.state.writes).toEqual([]);
    }
  });
});
