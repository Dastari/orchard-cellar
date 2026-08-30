import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(start, startNeedle).toBeGreaterThanOrEqual(0);
  expect(end, endNeedle).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authoritative repeatable mining', () => {
  it('stores append-only richness, work, respawn, and party-claim state', () => {
    const table = sourceBetween('const world_resource = table(', 'const world_soil = table(');
    expect(table).toContain("accessor: 'by_depleted'");
    for (const field of [
      'miningClass', 'richness', 'maximumRichness', 'yieldProgress', 'yieldsProduced',
      'producedOre', 'spawnSiteId', 'activationOrdinal', 'respawnAtTick',
      'miningClaimedBy', 'miningPartyId', 'miningClaimUntilTick',
    ]) expect(table).toContain(`${field}:`);
  });

  it('resolves payouts through shared simulation rules and grants Explorer XP', () => {
    const reducer = sourceBetween('export const harvestResource =', 'function authorityBowChargeMs(');
    expect(reducer).toContain('miningWorkPerHit(');
    expect(reducer).toContain('resolveMiningYield({');
    expect(reducer).toContain("'explorer'");
    expect(reducer).toContain('MINING_DROP_RESERVATION_TICKS');
    expect(reducer).toContain("throw new SenderError('mining_claimed_by_other_party')");
    expect(reducer).toContain('miningRequiredPickaxeTier(');
  });

  it('moves surface population slots but replenishes cave veins and rocks in place', () => {
    const respawn = sourceBetween('function respawnMiningResources(', 'export const ownSurvival =');
    expect(respawn).toContain('surfaceOreRespawnCandidates(');
    expect(respawn).toContain('surfaceOreRespawnTileBlocked(');
    expect(respawn).toContain('surfaceOreResourceAtSite(');
    expect(respawn).toContain("'mining.respawn_richness'");
    expect(respawn).not.toContain('world_resource.clear()');
  });

  it('provides durable five-player party authority for future UI', () => {
    expect(source).toContain('const PARTY_MAX_MEMBERS = 5');
    for (const reducer of [
      'createParty', 'inviteToParty', 'acceptPartyInvite', 'leaveParty', 'removePartyMember',
    ]) expect(source).toContain(`export const ${reducer} = spacetimedb.reducer`);
  });
});
