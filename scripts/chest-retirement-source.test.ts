import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const REQUIRED_FILES = [
  'world_placeable_table.ts', 'own_active_placeable_table.ts', 'own_open_placeable_slots_table.ts',
  'own_placed_placeable_slots_table.ts', 'own_placed_placeable_damage_table.ts',
  'admin_chest_migration_status_procedure.ts',
];
const REQUIRED_SYMBOLS = [
  'worldPlaceable', 'ownActivePlaceable', 'ownOpenPlaceableSlots',
  'ownPlacedPlaceableSlots', 'ownPlacedPlaceableDamage', 'adminChestMigrationStatus',
];

describe('chest retirement source gate', () => {
  it('accepts only a literal generic/status surface and rejects source or generated legacy remnants', () => {
    const repository = mkdtempSync(join(tmpdir(), 'orchard-retirement-source-'));
    try {
      const sourceRoot = join(repository, 'packages/world/src');
      const bindingsRoot = join(repository, 'packages/world-bindings/src');
      mkdirSync(sourceRoot, { recursive: true });
      mkdirSync(bindingsRoot, { recursive: true });
      writeFileSync(join(sourceRoot, 'index.ts'), `
        const world_placeable = "generic";
        export const adminChestMigrationStatus = procedure(() => ({
          phase: "drop_ready", legacyChestCount: "0", legacySlotCount: "0",
          legacyDamageCount: "0", mappingCount: "0", activeLegacySessionCount: "0",
          activeGenericSessionCount: genericSessions(),
        }));
      `);
      writeFileSync(join(bindingsRoot, 'index.ts'), `${REQUIRED_SYMBOLS.join('\n')}\n`);
      for (const file of REQUIRED_FILES) writeFileSync(join(bindingsRoot, file), 'export default {};\n');

      const accepted = spawnSync('bash', ['scripts/assert-chest-retirement-source.sh', repository], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
      });
      expect(accepted.status, accepted.stderr).toBe(0);

      writeFileSync(join(bindingsRoot, 'world_chest_table.ts'), 'export default {};\n');
      const staleBinding = spawnSync('bash', ['scripts/assert-chest-retirement-source.sh', repository], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
      });
      expect(staleBinding.status).not.toBe(0);
      expect(staleBinding.stderr).toContain('world_chest_table.ts');
      rmSync(join(bindingsRoot, 'world_chest_table.ts'));

      mkdirSync(join(sourceRoot, 'behaviour'));
      writeFileSync(join(sourceRoot, 'behaviour', 'interactions.ts'),
        'export const read = (ctx: any) => ctx.db.active_chest.iter();\n');
      const nestedSource = spawnSync('bash', ['scripts/assert-chest-retirement-source.sh', repository], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
      });
      expect(nestedSource.status).not.toBe(0);
      expect(nestedSource.stderr).toContain('legacy chest storage');
      rmSync(join(sourceRoot, 'behaviour', 'interactions.ts'));

      const clientRoot = join(repository, 'packages/client/src');
      mkdirSync(clientRoot, { recursive: true });
      writeFileSync(join(clientRoot, 'connection.ts'),
        'export const close = (connection: any) => connection.reducers.closeChest({});\n');
      const staleClient = spawnSync('bash', ['scripts/assert-chest-retirement-source.sh', repository], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
      });
      expect(staleClient.status).not.toBe(0);
      expect(staleClient.stderr).toContain('client still invokes');
      rmSync(join(clientRoot, 'connection.ts'));

      writeFileSync(join(sourceRoot, 'index.ts'), 'const world_chest = table({ name: "world_chest" });\n');
      const staleSource = spawnSync('bash', ['scripts/assert-chest-retirement-source.sh', repository], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
      });
      expect(staleSource.status).not.toBe(0);
      expect(staleSource.stderr).toContain('legacy chest storage');
    } finally { rmSync(repository, { recursive: true, force: true }); }
  });
});
