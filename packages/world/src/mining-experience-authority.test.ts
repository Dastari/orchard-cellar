import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['applyHarvestResourceLifecycle', 'grantSkillExperience', 'requireUsableTool',
  'miningClassForResource', 'miningRespawnDelayTicks'];
const declarations = source.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration =>
    ['MINING_CLAIM_TICKS', 'MINING_DROP_RESERVATION_TICKS'].includes(declaration.name.getText(source))));
const code = ts.transpileModule([...declarations.map(node => node.getText(source)), ...names.map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(name);
  return node.getText(source);
})].join('\n') + '\nreturn applyHarvestResourceLifecycle;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const registry = sim.bootstrapContentRegistry();

function fixture(nodeClass: sim.MiningNodeClass, producedOre = true, depleted = false, kind = nodeClass === 'rock' ? 'rock_large' : 'ore_iron') {
  const sender = { toHexString: () => 'miner', isEqual: (other: unknown) => other === sender };
  const tracks = new Map(sim.SKILL_TRACKS.map(track => [track, { id: track, track, experience: 100n }]));
  let resource = { id: 1n, kind, spaceId: 0, tileX: 20, tileY: 20, miningClass: nodeClass,
    health: depleted ? 1 : 6, richness: depleted ? 1 : 6, maximumRichness: 6,
    yieldProgress: 9, yieldsProduced: depleted ? 5 : 0, producedOre: false, activationOrdinal: 0, depleted: false };
  const grants: sim.SkillTrack[] = [];
  const ctx = { sender, senderAuth: { jwt: {} }, db: {
    membership: { identity: { find: () => ({}) } },
    player_position: { identity: { find: () => ({ spaceId: 0, x: 20 * sim.TILE_SIZE_FIXED,
      y: 20 * sim.TILE_SIZE_FIXED, facing: 'down', actionStartedTick: 0n }), update: () => {} } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => ({ authorityTick: 100n }) } },
    world_seed: { id: { find: () => ({ seed: 42 }) } },
    inventory_slot: { id: { find: () => ({ itemKind: 'iron_pickaxe', durability: 750 }) } },
    world_resource: { id: { find: () => resource, update: (row: typeof resource) => { resource = row; } } },
    world_resource_mining_claim: { resourceId: { find: () => ({ claimedBy: sender, claimUntilTick: 700n }), update: () => {}, delete: () => {} } },
    player_skill_track: { id: { update: (row: { id: sim.SkillTrack; track: sim.SkillTrack; experience: bigint }) => {
      tracks.set(row.track, row); grants.push(row.track);
    } } },
  } };
  const noop = () => {};
  const deps = { ...sim, SenderError: Error, contentRegistry: () => registry,
    requireAuthorizedSender: noop, handsOccupiedFor: () => false, mountedNpcFor: () => null,
    requireWorldModificationAuthorized: noop, requireHearthResourceHarvestAccess: noop,
    liveMapGeneratedResourceSuppressed: () => false, isVitalsToolKind: () => true,
    resourceHarvestResult: () => resource.depleted ? 'depleted' : 'ok',
    playerPartyId: () => undefined, playerSkillRanks: () => ({}),
    spendToolVigour: noop, validateToolVigourSpend: noop, wearInventoryTool: noop,
    nextActionStartedTick: (_previous: bigint, tick: bigint) => tick,
    recordPlayerStatistic: noop, recordHearthResourceDepletion: noop,
    resolveMiningLoot: () => ({ producedOre, drops: [] }), applyLootDropsBehaviour: noop, lootAuthorityDependencies: {},
    ensurePlayerSkillTrack: (_ctx: unknown, _identity: unknown, track: sim.SkillTrack) => tracks.get(track),
  };
  const harvest = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { tracks, grants,
    setProgress: (yieldProgress: number) => { resource = { ...resource, yieldProgress }; },
    reject: () => { resource = { ...resource, depleted: true }; },
    harvest: (mutate = true, id = 1n) => harvest(ctx, id, mutate),
  };
}

describe('mining experience track', () => {
  it('awards every payout and depletion bonus to the track containing the mining skills', () => {
    const miningNodes = [...registry.skillTrees.values()].flatMap(tree => tree.nodes)
      .filter(node => node.specialization === 'mining');
    expect(miningNodes.length).toBeGreaterThan(0);
    expect(new Set(miningNodes.map(node => node.track))).toEqual(new Set(['farming']));
    const cases = [['rock', false, 2n], ['mixed', false, 3n], ['mixed', true, 6n],
      ['pure', true, 10n], ['pristine', true, 10n]] as const;
    for (const [nodeClass, producedOre, payout] of cases) for (const depleted of [false, true]) {
      const f = fixture(nodeClass, producedOre, depleted); f.harvest();
      expect(f.grants).toEqual(['farming']);
      expect(f.tracks.get('farming')?.experience).toBe(100n + payout + (depleted ? 6n : 0n));
      expect(f.tracks.get('explorer')?.experience).toBe(100n);
      expect(f.tracks.get('combat')?.experience).toBe(100n);
    }
  });

  it('routes basalt, cinder and emberglass mining through the same XP track', () => {
    for (const kind of ['rock_basalt', 'ore_cinder', 'ore_emberglass']) {
      const f = fixture(kind === 'rock_basalt' ? 'rock' : 'pure', true, false, kind);
      f.harvest(); expect(f.grants).toEqual(['farming']);
    }
  });

  it('grants no XP for preflight, partial work, whiffs or rejected targets', () => {
    const preflight = fixture('pure'); preflight.harvest(false); expect(preflight.grants).toEqual([]);
    const partial = fixture('pure'); partial.setProgress(0); partial.harvest(); expect(partial.grants).toEqual([]);
    const whiff = fixture('pure'); whiff.harvest(true, 0n); expect(whiff.grants).toEqual([]);
    const rejected = fixture('pure'); rejected.reject();
    expect(() => rejected.harvest()).toThrow('resource_depleted'); expect(rejected.grants).toEqual([]);
  });
});
