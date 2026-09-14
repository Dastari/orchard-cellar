import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/net/overworld-connection.ts', import.meta.url), 'utf8');
const game = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../../studio/src/shell/studio-connection.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../../scripts/chest-migration-runner.ts', import.meta.url), 'utf8');
const credentialHelper = readFileSync(new URL('../../../scripts/world-rejoin-credentials.ts', import.meta.url), 'utf8');

describe('transitional chest migration schema and consumers', () => {
  it('retains legacy tables while adding private mapping/control authority', () => {
    for (const table of ['world_chest', 'world_chest_slot', 'world_chest_damage', 'active_chest',
      'chest_migration_mapping', 'chest_migration_control']) {
      expect(world).toContain(`name: '${table}'`);
    }
    expect(world).toContain("legacy_reads: 'backfill', backfill: 'dual_write', dual_write: 'placeable_reads'");
  });

  it('exposes only bounded owner migration operations with exact receipt gates', () => {
    for (const reducer of ['adminBackfillLegacyChests', 'adminVerifyLegacyChests',
      'adminSetChestMigrationPhase', 'adminDrainLegacyChests']) expect(world).toContain(`export const ${reducer}`);
    expect(world).toContain('requireWorldOwner(ctx.senderAuth.jwt');
    expect(world).toContain('limit > CHEST_MIGRATION_BATCH_MAX');
    expect(world).toContain("throw new SenderError('chest_migration_verification_stale')");
    expect(world).toContain("throw new SenderError('chest_migration_active_custody')");
    expect(world).toContain('activeGenericSessionCount: activeGenericChestSessionCount(tx).toString()');
  });

  it('keeps old and generic mutations mirrored until the read switch', () => {
    const resolver = world.slice(
      world.indexOf('function authoredPlaceableDefinition('),
      world.indexOf('function genericPlaceableCapacity('),
    );
    expect(world).toContain('function syncGenericChestLegacyMirror');
    expect(world).toContain('function syncLegacyChestGenericMirror');
    expect(world).toContain('return authoredPlaceableDefinition(ctx, row)?.components.container?.slotCount ?? 0;');
    expect(resolver).toContain('return placeableObjectDefinition(contentRegistry(ctx), row);');
    expect(resolver).not.toContain('`object:${row.kind}`');
    expect(world).toContain("definitionId: 'object:chest'");
  });

  it('moves game and Studio reads to generic placeables without deleting legacy declarations', () => {
    expect(client).not.toContain('tables.worldChest');
    expect(client).not.toContain('connection.db.worldChest');
    expect(client).not.toContain('tables.ownActiveChest');
    expect(client).toContain('compatibilityChest(row)');
    expect(game).toContain("network.interactEntity('placeable', target.chest.id, 'use')");
    expect(game).not.toContain("network.interactEntity('chest', target.chest.id, 'use')");
    expect(studio).not.toContain('tables.worldChest');
    expect(studio).toContain("row.definitionId === 'object:chest'");
  });

  it('requires refresh OIDC, consumer acknowledgements, and literal-zero readiness in the runner', () => {
    expect(runner).toContain('refreshRejoinCredentialFile({');
    expect(credentialHelper).toContain('refresh_capable_rejoin_credentials_required');
    expect(runner).toContain('CHEST_MIGRATION_CLIENTS_READY');
    expect(runner).toContain('CHEST_MIGRATION_STUDIO_READY');
    expect(runner).toContain("status.legacyChestCount !== '0'");
    expect(runner).toContain("status.activeGenericSessionCount !== '0'");
    expect(runner).toContain('CHEST_MIGRATION_PRODUCTION_CONFIRM');
  });
});
