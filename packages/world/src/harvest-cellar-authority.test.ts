import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function load(names: string[], dependencies: Record<string, unknown>, result = names[names.length - 1]) {
  const declarations = names.map(name => source.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)))!.getText(source));
  const code = ts.transpileModule(declarations.join('\n').replaceAll('export const ', 'const ') + `\nreturn ${result};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
const registry = sim.bootstrapContentRegistry();
const owner = { toHexString: () => 'owner', isEqual: (other: unknown) => other === owner };
const home = { spaceId: 10002, residenceSpaceId: 30004, owner };
const homeDb = { spaceId: { find: (id: number) => id === home.spaceId ? home : null },
  by_residence_space: { filter: (id: number) => id === home.residenceSpaceId ? [home] : [] } };
const firstIndexRow = (rows: Iterable<unknown>) => [...rows][0] ?? null;

describe('harvest/cellar authority', () => {
  it('uses estate ranks in the garden, residence and cellar, never a different estate', () => {
    const findRank = load(['homesteadForSpace', 'homesteadUpgradeId', 'homesteadUpgradeRank'], {
      ...sim, firstIndexRow, contentRegistry: () => registry,
    });
    const keys: string[] = [];
    const ctx = { db: { homestead: homeDb, homestead_upgrade: { id: { find: (id: string) => {
      keys.push(id); return id === '10002:barrel_cellar' ? { rank: 3 } : null;
    } } } } };
    for (const space of [10002, 30004, 30005]) expect(findRank(ctx, space, 'barrel')).toBe(3);
    expect(keys).toEqual(Array(3).fill('10002:barrel_cellar'));
    expect(findRank(ctx, 10001, 'barrel')).toBe(0);
  });

  it('allows cellar upgrade purchases only by the estate owner and charges the authored quote', () => {
    let position = { spaceId: 30005 };
    let ownedHome: typeof home | null = home;
    let wallet = { balanceBronze: 100_000n };
    const writes: unknown[] = [];
    const purchase = load(['homesteadForSpace', 'homesteadUpgradeId', 'purchaseHomesteadUpgrade'], {
      ...sim, firstIndexRow, contentRegistry: () => registry, SenderError: Error,
      spacetimedb: { reducer: (_args: unknown, fn: unknown) => fn }, t: { string: () => ({}) },
      requireAuthorizedSender: () => {}, homesteadForOwner: () => ownedHome, recordPlayerStatistic: () => {}, grantSkillExperience: () => {},
    });
    const ctx = { sender: owner, senderAuth: { jwt: null }, db: {
      membership: { identity: { find: () => ({}) } }, player_position: { identity: { find: () => position } },
      world_clock: { id: { find: () => ({ authorityTick: 1n }) } }, homestead: homeDb,
      player_wallet: { identity: { find: () => wallet, update: (value: typeof wallet) => { wallet = value; } } },
      homestead_upgrade: { id: { find: () => null }, insert: (value: unknown) => writes.push(value) },
    } };
    purchase(ctx, { upgradeKind: 'barrel_cellar' });
    expect(writes).toEqual([expect.objectContaining({ spaceId: 10002, rank: 1 })]);
    expect(wallet.balanceBronze).toBe(100_000n - sim.runtimeHomesteadUpgradeQuote(registry, 'barrel_cellar', 0)!.costBronze);
    position = { spaceId: 10001 };
    expect(() => purchase(ctx, { upgradeKind: 'barrel_cellar' })).toThrow('homestead_upgrade_requires_home');
    expect(writes).toHaveLength(1);
    position = { spaceId: 30005 }; ownedHome = null;
    expect(() => purchase(ctx, { upgradeKind: 'barrel_cellar' })).toThrow('homestead_upgrade_not_ready');
    expect(writes).toHaveLength(1);
  });

  it('runs the full harvest handler and keeps failed seed insertion ahead of crop deletion and daily counters', () => {
    let cropDeleted = false;
    const inserts: string[] = [];
    const statistics: string[] = [];
    let failSeed = true;
    const crop = { id: 'crop', owner, cropKind: 'grape', growthTicks: 1n, growthUpdatedAtTick: 0n,
      tileX: 1, tileY: 1, plantedAtTick: 1n };
    const definition = { harvestItemKind: 'grape', seedItemKind: 'grape_seed', harvestQuantity: 4, tags: [] as string[] };
    const harvest = load(['harvestCropTile'], {
      ...sim, SenderError: Error, spacetimedb: { reducer: (_args: unknown, fn: unknown) => fn }, t: { i16: () => ({}) },
      requireAuthorizedSender: () => {}, handsOccupiedFor: () => false, mutableFarmTileAuthorized: () => true,
      mountedNpcFor: () => null, worldSoilId: () => 'crop', homesteadForSpace: () => home,
      cropDefinitionForHomestead: () => definition,
      cropGrowthAt: () => ({ mature: true }), cropAutomaticallyWatered: () => false,
      cropCalendarOffset: () => 0n, cropGreenhouseProtected: () => false, homesteadUpgradeRank: () => 0,
      contentRegistry: () => registry, playerSkillRanks: () => ({}),
      farmingHarvestReward: () => ({ quantity: 8, seeds: 1 }),
      insertPlayerCarriedItem: (_ctx: unknown, kind: string) => { inserts.push(kind); return !(failSeed && kind === 'grape_seed'); },
      scheduleEmptyTopsideSoilDecay: () => {}, recordPlayerStatistic: (_ctx: unknown, _who: unknown, kind: string) => statistics.push(kind),
      grantSkillExperience: () => {},
    });
    const ctx = { sender: owner, senderAuth: { jwt: null }, db: {
      membership: { identity: { find: () => ({}) } },
      player_position: { identity: { find: () => ({ spaceId: 10002, x: sim.TILE_SIZE_FIXED, y: sim.TILE_SIZE_FIXED }) } },
      player_survival: { identity: { find: () => ({}) } }, world_clock: { id: { find: () => ({ authorityTick: 1n }) } },
      world_soil: { id: { find: () => ({ watered: true, wateredAtTick: 0n }), update: (x: unknown) => x } },
      world_crop: { id: { find: () => crop, delete: () => { cropDeleted = true; } } },
      player_statistic: { by_identity: { filter: () => [] } },
    } };
    expect(() => harvest(ctx, { tileX: 1, tileY: 1 })).toThrow('inventory_full');
    expect(cropDeleted).toBe(false); expect(statistics).toEqual([]);
    failSeed = false; harvest(ctx, { tileX: 1, tileY: 1 });
    expect(cropDeleted).toBe(true);
    expect(inserts).toEqual(['grape', 'grape_seed', 'grape', 'grape_seed']);
    expect(statistics).toContain('crops_harvested');
    definition.tags = ['crop.quest']; inserts.length = 0;
    harvest(ctx, { tileX: 1, tileY: 1 });
    expect(inserts).toEqual(['grape']);
  });
});


it('projects only the current estate farming ranks and restores personal ranks outside it', () => {
  const personal = { nodeId: 'green_thumb', track: 'farming', rank: 1 };
  const estate = { nodeId: 'barreling', track: 'farming', rank: 1 };
  const combat = { nodeId: 'blade_training', track: 'combat', rank: 3 };
  const visitor = {};
  let spaceId = 30005;
  const view = load(['homesteadForSpace', 'activeFarmSkillNodes'], {
    firstIndexRow, spacetimedb: { view: (_options: unknown, _type: unknown, fn: unknown) => fn },
    t: { array: () => ({}) }, player_skill_node: { rowType: {} },
  });
  const ctx = { sender: visitor, db: {
    homestead: homeDb, player_position: { identity: { find: () => ({ spaceId }) } },
    player_skill_node: { by_identity: { filter: (who: unknown) => who === owner ? [estate, combat] : [personal] } },
  } };
  expect(view(ctx)).toEqual([estate]);
  spaceId = 10002; expect(view(ctx)).toEqual([estate]);
  spaceId = 0; expect(view(ctx)).toEqual([personal]);
});

it('projects the active estate upgrades for cellar visitors and clears them outside home spaces', () => {
  let spaceId = 30005;
  const rows = [{ spaceId: 10002, upgradeKind: 'estate_vintage', rank: 2 }];
  const view = load(['homesteadForSpace', 'activeFarmUpgrades'], {
    firstIndexRow, spacetimedb: { view: (_options: unknown, _type: unknown, fn: unknown) => fn },
    t: { array: () => ({}) }, homestead_upgrade: { rowType: {} },
  });
  const ctx = { sender: {}, db: {
    homestead: homeDb, player_position: { identity: { find: () => ({ spaceId }) } },
    homestead_upgrade: { by_space: { filter: (id: number) => id === 10002 ? rows : [] } },
  } };
  expect(view(ctx)).toEqual(rows);
  spaceId = 30004; expect(view(ctx)).toEqual(rows);
  spaceId = 10002; expect(view(ctx)).toEqual(rows);
  spaceId = 0; expect(view(ctx)).toEqual([]);
});
