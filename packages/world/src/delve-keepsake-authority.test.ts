import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function load(dependencies: Record<string, unknown>) {
  const names = ['playerStatisticRowId', 'syncDelveCompletionKeepsake', 'recordDelveCompletion', 'finishRogueRun'];
  const text = names.map(name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(source)).join('\n');
  const code = ts.transpileModule(text + `\nreturn {${names.join(',')}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
function fixture() {
  type Row = Record<string, unknown>;
  const identity = { toHexString: () => 'player' };
  const partner = { toHexString: () => 'partner' };
  let registry = sim.bootstrapContentRegistry();
  const run = { id: 1n, phase: 'complete', roomNumber: 11, roomKind: 'boss', updatedTick: 20n };
  let storedRun: typeof run | null = run;
  const receipt = new Map<string, { id: string; identity: typeof identity; flag: string }>();
  const knowledge = new Map<string, Row>();
  const statistics = new Map<string, { value: bigint }>();
  const members = new Map([identity, partner].map(identity => [identity.toHexString(), {
    identity, returnSpaceId: 0, returnX: 5, returnY: 6, returnFacing: 'up',
    savedHealthCenti: 4300, savedManaCenti: 2200, savedVigourCenti: 8100,
    savedHealthRemainder: 1, savedManaRemainder: 2, savedVigourRemainder: 3, savedHungerCenti: 5600,
  }]));
  const originalMembers = [...members.values()];
  const upgrades = new Map([['1:boon', { id: '1:boon' }]]);
  const positions = new Map([identity, partner].map(id => [id.toHexString(), { identity: id, facing: 'down', spaceId: 50000 }]));
  const stats = new Map<string, Row>([identity, partner].map(id => [id.toHexString(), { identity: id, healthCenti: 99000 }]));
  const survival = new Map<string, Row>([identity, partner].map(id => [id.toHexString(), { identity: id, hungerCenti: 9900 }]));
  let cleaned = 0;
  const ctx = { sender: identity, db: {
    world_clock: { id: { find: () => ({ authorityTick: 100n }) } },
    rogue_run: { id: { find: (id: bigint) => storedRun?.id === id ? storedRun : null, delete: () => { storedRun = null; } } },
    rogue_run_member: { by_run: { filter: () => members.values() }, identity: { delete: (id: typeof identity) => members.delete(id.toHexString()) } },
    rogue_run_upgrade: { by_run: { filter: () => upgrades.values() }, id: { delete: (id: string) => upgrades.delete(id) } },
    player_position: { identity: { find: (id: typeof identity) => positions.get(id.toHexString()) ?? null,
      update: (row: typeof positions extends Map<string, infer R> ? R : never) => positions.set(row.identity.toHexString(), row) } },
    player_stats: { identity: { find: (id: typeof identity) => stats.get(id.toHexString()) ?? null,
      update: (row: Row & { identity: typeof identity }) => stats.set(row.identity.toHexString(), row) } },
    player_survival: { identity: { find: (id: typeof identity) => survival.get(id.toHexString()) ?? null,
      update: (row: Row & { identity: typeof identity }) => survival.set(row.identity.toHexString(), row) } },
    bow_charge: { identity: { delete: () => {} } },
    player_quest_flag: { id: { find: (id: string) => receipt.get(id) ?? null,
      update: (row: typeof receipt extends Map<string, infer R> ? R : never) => receipt.set(row.id, row) },
      insert: (row: typeof receipt extends Map<string, infer R> ? R : never) => receipt.set(row.id, row) },
    player_known_recipe: { id: { find: (id: string) => knowledge.get(id) ?? null },
      insert: (row: Row & { id: string }) => { if (knowledge.has(row.id)) throw Error('duplicate'); knowledge.set(row.id, row); } },
    player_statistic: { id: { find: (id: string) => statistics.get(id) ?? null } },
  } };
  const api = load({ ...sim, contentRegistry: () => registry,
    clearRogueRoomRows: () => { cleaned++; },
    teleportPlayer: (_ctx: unknown, row: { identity: typeof identity; facing: string }, spaceId: number) => positions.set(row.identity.toHexString(), { ...row, spaceId }),
    recordPlayerStatistic: (_ctx: unknown, id: typeof identity, kind: string, delta: bigint) => {
      const key = JSON.stringify([id.toHexString(), kind, '']);
      statistics.set(key, { value: (statistics.get(key)?.value ?? 0n) + delta });
    },
  });
  return { run, receipt, knowledge, statistics, members, upgrades, stats, survival, positions,
    get cleaned() { return cleaned; },
    finish: (patch = {}) => api.finishRogueRun(ctx, { ...run, ...patch }),
    reconnect: () => api.syncDelveCompletionKeepsake(ctx, identity, 200n),
    stat: (kind: string) => statistics.get(JSON.stringify(['player', kind, '']))?.value ?? 0n,
    setContent: (value: sim.ContentRegistry) => { registry = value; },
    newRun: () => { run.id++; storedRun = { ...run }; for (const member of originalMembers) members.set(member.identity.toHexString(), member); },
  };
}

describe('Delve completion return-home reward', () => {
  it('retains the lifetime receipt while the production quest-reset block clears quest flags', () => {
    let block: ts.Statement | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isIfStatement(node) && node.expression.getText(source) === 'resetAllQuests') block = node.thenStatement;
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(block).toBeDefined();
    const flags = new Map([
      ['player:delve.completed', { id: 'player:delve.completed', flag: 'delve.completed:2' }],
      ['player:quest_intro', { id: 'player:quest_intro', flag: 'quest_intro' }],
    ]);
    const ctx = { db: { player_quest_flag: { by_identity: { filter: () => flags.values() },
      id: { delete: (id: string) => flags.delete(id) } }, player_thought: { identity: { find: () => null } } } };
    const code = ts.transpileModule(block!.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('ctx', 'identity', 'identityHex', 'DELVE_COMPLETION_FLAG', code)(ctx, {}, 'player', sim.DELVE_COMPLETION_FLAG);
    expect([...flags.keys()]).toEqual(['player:delve.completed']);
  });
  it('unlocks a home recipe for every member without a home or inventory, restores vitals and clears run state', () => {
    const f = fixture(); f.finish();
    expect(f.knowledge.size).toBe(2); expect(f.receipt.size).toBe(2);
    expect(f.knowledge.get('player:delver_memorial_planter')).toMatchObject({ recipeId: 'delver_memorial_planter', sourceKind: 'delve_completion' });
    expect(f.stat('delves_completed')).toBe(1n); expect(f.stat('recipes_learned')).toBe(1n);
    expect(f.stats.get('player')).toMatchObject({ healthCenti: 4300, manaCenti: 2200, vigourCenti: 8100,
      healthRemainder: 1, manaRemainder: 2, vigourRemainder: 3, regenTick: 100n });
    expect(f.survival.get('player')).toMatchObject({ hungerCenti: 5600, hungerUpdatedTick: 100n });
    expect(f.positions.get('player')).toMatchObject({ spaceId: 0, facing: 'up' });
    expect(f.members.size).toBe(0); expect(f.upgrades.size).toBe(0); expect(f.cleaned).toBe(1);
    f.finish(); f.reconnect(); f.reconnect();
    expect(f.stat('delves_completed')).toBe(1n); expect(f.stat('recipes_learned')).toBe(1n); expect(f.cleaned).toBe(1);
  });
  it('counts subsequent full wins without duplicating the recipe or granting repeat items/currency', () => {
    const f = fixture(); f.finish(); f.newRun(); f.finish();
    expect(f.stat('delves_completed')).toBe(2n); expect(f.stat('recipes_learned')).toBe(1n);
    expect(f.knowledge.size).toBe(2); expect(f.receipt.get('player:delve.completed')?.flag).toBe('delve.completed:2');
  });
  it('does not trust a complete caller snapshot for death, abandonment, early rooms or non-guardian endings', () => {
    for (const patch of [{ phase: 'combat' }, { phase: 'reward' }, { phase: 'doors' }, { roomNumber: 3 }, { roomKind: 'treasure' }]) {
      const f = fixture(); Object.assign(f.run, patch);
      f.finish({ phase: 'complete', roomNumber: 11, roomKind: 'boss' });
      expect(f.receipt.size).toBe(0); expect(f.knowledge.size).toBe(0); expect(f.stat('delves_completed')).toBe(0n);
      expect(f.members.size).toBe(0); expect(f.positions.get('player')?.spaceId).toBe(0);
    }
  });
  it('still unlocks and exits when recipes-learned metadata is missing or disabled', () => {
    const complete = sim.bootstrapContentRegistry();
    for (const reserved of [false, true]) {
      const f = fixture();
      const statistics = { ...complete.compiled.statistics };
      if (reserved) statistics.recipes_learned = { ...statistics.recipes_learned!, reserved: true };
      else delete statistics.recipes_learned;
      f.setContent({ ...complete, compiled: { ...complete.compiled, statistics } });
      f.finish(); f.reconnect();
      expect(f.knowledge.size).toBe(2); expect(f.members.size).toBe(0);
      expect(f.stat('delves_completed')).toBe(1n); expect(f.stat('recipes_learned')).toBe(0n);
    }
  });
  it('exits under missing or retired content and repairs the pending recipe/statistic exactly once on reconnect', () => {
    const complete = sim.bootstrapContentRegistry();
    for (const retired of [false, true]) {
      const f = fixture();
      const recipes = new Map(complete.recipes);
      const statistics = { ...complete.compiled.statistics };
      const reward = recipes.get('recipe:delver_memorial_planter')!;
      if (retired) recipes.set(reward.id, { ...reward, retired: true }); else recipes.delete(reward.id);
      delete statistics.delves_completed;
      f.setContent({ ...complete, recipes, compiled: { ...complete.compiled, statistics } });
      f.finish(); f.newRun(); f.finish();
      expect(f.knowledge.size).toBe(0); expect(f.stat('delves_completed')).toBe(0n);
      expect(f.receipt.get('player:delve.completed')?.flag).toBe('delve.completed:2');
      f.setContent(complete); f.reconnect(); f.reconnect();
      expect(f.stat('delves_completed')).toBe(2n); expect(f.stat('recipes_learned')).toBe(1n);
      expect(f.knowledge.has('player:delver_memorial_planter')).toBe(true);
      f.statistics.clear(); f.reconnect();
      expect(f.stat('delves_completed')).toBe(2n); expect(f.knowledge.size).toBe(1);
    }
  });
});
