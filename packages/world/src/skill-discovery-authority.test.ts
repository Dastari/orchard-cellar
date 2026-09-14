import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows, buildContentRegistry, isSkillTrack,
  runtimeResourcePerception, runtimeSkillNodeDefinition, runtimeSkillPurchaseRejection,
  skillExperienceForLevel, skillRespecCostBronze,
} from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function callback(name: string): string {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== name || declaration.initializer === undefined
        || !ts.isCallExpression(declaration.initializer)) continue;
      const fn = declaration.initializer.arguments.find(ts.isArrowFunction);
      if (fn !== undefined) return ts.transpileModule(`(${fn.getText(source)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
      }).outputText;
    }
  }
  throw new Error(`missing authority reducer: ${name}`);
}
const bootstrap = buildContentRegistry(bootstrapContentRows()).registry;
const discoveryIds = ['ore_sense', 'deep_ore_sense', 'ore_identification', 'ore_mapping', 'fishing_mapping'];
const rename = (id: string) => discoveryIds.includes(id) ? `survey_${id}` : id;
const farming = bootstrap.skillTrees.get('skill_tree:farming');
if (farming === undefined) throw new Error('missing farming fixture');
const custom = buildContentRegistry(bootstrapContentRows().map((row) => row.id !== farming.id ? row : {
  ...row,
  json: JSON.stringify({ ...farming, nodes: farming.nodes.map((node) => ({
    ...node, id: rename(node.id), connects: node.connects.map(rename),
    ...(node.prerequisites === undefined ? {} : { prerequisites: node.prerequisites.map(rename) }),
    ...(discoveryIds.includes(node.id) ? { pointCost: 3 } : {}),
  })) }),
}));

type RankRow = { id: string; identity: unknown; track: string; nodeId: string; rank: number };
function fixture(initialRanks: Readonly<Record<string, number>> = {}) {
  const sender = { toHexString: () => 'discovery-owner' };
  const foreign = { toHexString: () => 'other-player' };
  const ranks = new Map<string, RankRow>(Object.entries(initialRanks).map(([nodeId, rank]) => [nodeId, {
    id: `${sender.toHexString()}:${nodeId}`, identity: sender, track: 'farming', nodeId, rank,
  }]));
  const foreignRow: RankRow = { id: 'other-player:survey_ore_sense', identity: foreign, track: 'farming', nodeId: 'survey_ore_sense', rank: 1 };
  const rankRows = new Map([...ranks.values(), foreignRow].map((row) => [row.id, row]));
  let progress = { id: 'discovery-owner:farming', identity: sender, track: 'farming',
    experience: skillExperienceForLevel(50), spentPoints: Object.keys(initialRanks).length,
    bonusPoints: 10, respecCount: 0 };
  let wallet = { identity: sender, balanceBronze: 1234n };
  const writes: string[] = [];
  const playerRanks = () => Object.fromEntries([...rankRows.values()]
    .filter((row) => row.identity === sender).map((row) => [row.nodeId, row.rank]));
  const tables = {
    membership: { identity: { find: () => ({}) } },
    player_skill_node: {
      id: {
        find: (id: string) => rankRows.get(id) ?? null,
        update: (row: RankRow) => { writes.push('rank'); rankRows.set(row.id, row); },
        delete: (id: string) => { writes.push('rank'); rankRows.delete(id); },
      },
      insert: (row: RankRow) => { writes.push('rank'); rankRows.set(row.id, row); },
      by_identity: { filter: (identity: unknown) => [...rankRows.values()].filter((row) => row.identity === identity) },
    },
    player_skill_track: { id: { update: (row: typeof progress) => { writes.push('track'); progress = row; } } },
    player_wallet: { identity: {
      find: () => wallet,
      update: (row: typeof wallet) => { writes.push('wallet'); wallet = row; },
    } },
    world_clock: { id: { find: () => ({ authorityTick: 100n }) } },
  };
  const ctx = { sender, senderAuth: { jwt: {} }, db: new Proxy(tables, {
    get: (target, key) => {
      if (!(key in target)) throw new Error(`passive purchase accessed unexpected table: ${String(key)}`);
      return Reflect.get(target, key);
    },
  }) };
  const dependencies = {
    SenderError: Error, requireAuthorizedSender: () => undefined,
    // Existing normalized rows are supplied; normalization migration has its
    // own tests. Purchase/reset bodies and registry policy below are real.
    normalizePlayerSkillTracks: () => undefined,
    contentRegistry: () => custom.registry,
    runtimeSkillNodeDefinition, runtimeSkillPurchaseRejection,
    ensurePlayerSkillTrack: () => progress,
    playerSkillRanks: playerRanks,
    playerSkillNodeId: (identity: string, nodeId: string) => `${identity}:${nodeId}`,
    recordPlayerStatistic: () => { writes.push('statistic'); },
    isSkillTrack, skillRespecCostBronze,
  };
  function run(name: string, request: object): void {
    const reducer = new Function(...Object.keys(dependencies), `return ${callback(name)}`)(...Object.values(dependencies)) as (context: typeof ctx, request: object) => void;
    reducer(ctx, request);
  }
  return {
    buy: (nodeId: string) => run('purchaseSkillNode', { nodeId }),
    reset: () => run('resetSkillTree', { track: 'farming' }),
    perception: () => runtimeResourcePerception(custom.registry, playerRanks()),
    snapshot: () => ({ ranks: [...rankRows.values()], progress, wallet, writes: [...writes] }),
  };
}

describe('authoritative passive discovery purchases', () => {
  it('rejects skipping prerequisite chains despite an owned connected descendant without spending points', () => {
    expect(custom.report.errors).toEqual([]);
    const test = fixture({ prospector: 1, survey_ore_mapping: 1 });
    const before = test.snapshot();
    expect(() => test.buy('survey_ore_identification')).toThrow('skill_not_connected');
    expect(() => test.buy('survey_deep_ore_sense')).toThrow('skill_not_connected');
    expect(test.snapshot()).toEqual(before);
    expect(test.perception()).toMatchObject({ buriedOreRadiusTiles: 0, identifyBuriedOre: false, minimapOre: false });
  });

  it('uses active renamed definitions and costs for sequential passive unlocks', () => {
    const test = fixture({ prospector: 1 });
    expect(runtimeSkillNodeDefinition(bootstrap, 'survey_ore_sense')).toBeNull();
    const before = test.snapshot();
    test.buy('survey_ore_sense');
    expect(test.perception()).toMatchObject({ buriedOreRadiusTiles: 15, identifyBuriedOre: false, minimapOre: false });
    test.buy('survey_deep_ore_sense');
    expect(test.perception()).toMatchObject({ buriedOreRadiusTiles: 60, identifyBuriedOre: false, minimapOre: false });
    test.buy('survey_ore_identification');
    expect(test.perception()).toMatchObject({ identifyBuriedOre: true, minimapOre: false });
    test.buy('survey_ore_mapping');
    expect(test.perception()).toMatchObject({ minimapOre: true, minimapOreRadiusTiles: 60, minimapFishing: false });
    expect(test.snapshot().progress.spentPoints - before.progress.spentPoints).toBe(12);
    expect(test.snapshot().progress.experience).toBe(before.progress.experience);
    expect(test.snapshot().wallet).toEqual(before.wallet);
    expect(test.snapshot().writes.every((kind) => ['rank', 'track', 'statistic'].includes(kind))).toBe(true);
  });

  it('requires the authored fishing prerequisite independently of ore ownership', () => {
    const locked = fixture({ prospector: 1, survey_ore_mapping: 1 });
    const before = locked.snapshot();
    expect(() => locked.buy('survey_fishing_mapping')).toThrow('skill_not_connected');
    expect(locked.snapshot()).toEqual(before);
    const angler = fixture({ seasoned_angler: 1 });
    angler.buy('survey_fishing_mapping');
    expect(angler.perception()).toMatchObject({ minimapFishing: true, minimapFishingRadiusTiles: 60, minimapOre: false });
  });

  it('removes passive capabilities on real respec while preserving other players and inventory authority boundaries', () => {
    const test = fixture({ prospector: 1, seasoned_angler: 1 });
    for (const node of discoveryIds) test.buy(rename(node));
    expect(test.perception()).toMatchObject({ minimapFishing: true, minimapOre: true });
    const before = test.snapshot();
    test.reset();
    expect(test.perception()).toMatchObject({ buriedOreRadiusTiles: 0, identifyBuriedOre: false, minimapOre: false, minimapFishing: false });
    expect(test.snapshot().progress).toMatchObject({ experience: before.progress.experience, bonusPoints: 10, spentPoints: 0, respecCount: 1 });
    expect(test.snapshot().wallet).toEqual(before.wallet);
    expect(test.snapshot().ranks).toEqual(before.ranks.filter((row) => row.id.startsWith('other-player:')));
  });
});
