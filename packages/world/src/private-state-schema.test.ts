import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/net/overworld-connection.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');

function between(text: string, startAnchor: string, endAnchor: string): string {
  const start = text.indexOf(startAnchor);
  const end = text.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('T10 private high-churn state cutover', () => {
  it('keeps mining leases private and leaves public compatibility columns migration-only', () => {
    const claims = between(source, 'const world_resource_mining_claim = table(', 'const world_soil = table(');
    const mining = between(source, 'export const harvestResource =', 'function authorityBowChargeMs(');
    expect(claims).not.toContain('public: true');
    expect(claims).toContain('resourceId: t.u64().primaryKey()');
    expect(mining).toContain('world_resource_mining_claim.resourceId.find(resource.id)');
    expect(mining).toContain('world_resource_mining_claim.resourceId.update(claim)');
    expect(mining).not.toContain('resource.miningClaimedBy');
    expect(mining).not.toContain('resource.miningPartyId');
    expect(mining).not.toContain('resource.miningClaimUntilTick');
  });

  it('serves acknowledgements through an own view and jump presentation through a narrow regional table', () => {
    const position = between(source, 'const player_position = table(', 'const player_input = table(');
    const input = between(source, 'const player_input = table(', 'const player_jump_state = table(');
    const jump = between(source, 'const player_jump_state = table(', 'const bow_charge = table(');
    expect(position).toContain('lastProcessedSequence: t.u64()');
    expect(position).toContain('jumpUntilTick: t.option(t.u64())');
    expect(input).toContain('lastProcessedSequence: t.u64().default(0n)');
    expect(jump).toContain('public: true');
    expect(jump).toContain("columns: ['spaceId', 'chunkX', 'chunkY']");
    expect(source).toContain("name: 'own_player_prediction', public: true");
    expect(source).toContain('ctx.db.player_input.identity.find(ctx.sender)');
    expect(client).toContain('tables.ownPlayerPrediction');
    expect(client).toContain('const playerJumps = tables.playerJumpState');
    expect(main).toContain('snapshot.playerJumps.get(id)');
    expect(main).not.toContain('player.jumpUntilTick');
  });

  it('backfills once before leaving legacy columns inert', () => {
    const migration = between(source, 'function ensurePrivateStateMigration(', 'function surfaceOreRespawnTileBlocked(');
    const jumpReducer = between(source, 'export const jumpHorse =', 'export const dropSelected =');
    const movement = between(source, "tickStageTiming(telemetryTimingSample, 'movement');", "tickStageTiming(telemetryTimingSample, 'movement', true);");
    expect(migration).toContain('PRIVATE_STATE_MIGRATION_VERSION');
    expect(migration).toContain('position.lastProcessedSequence');
    expect(migration).toContain('resource.miningClaimedBy');
    expect(jumpReducer).toContain('ctx.db.player_jump_state');
    expect(jumpReducer).not.toContain('jumpFromX: position.x');
    expect(movement).toContain('lastProcessedSequence: acknowledgement.settledSequence');
    expect(movement).not.toContain('row.jumpUntilTick');
    expect(movement).not.toContain("'lastProcessedSequence'");
  });
});
