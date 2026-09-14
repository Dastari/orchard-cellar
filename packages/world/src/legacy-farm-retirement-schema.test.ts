import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const generated = readFileSync(new URL('../../world-bindings/src/index.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('T11 legacy farm retirement', () => {
  it('keeps automatic-migration schemas private and removes the obsolete client surface', () => {
    for (const [start, end] of [
      ['const farm_parcel = table(', 'const crop_patch = table('],
      ['const crop_patch = table(', 'const farm_activity = table('],
      ['const farm_activity = table(', 'const movement_timer = table('],
    ] as const) expect(between(start, end)).not.toContain('public: true');
    expect(source).not.toContain('export const useFarmTile =');
    expect(source).not.toContain('export const useFarmTool =');
    expect(source).not.toContain('export const restoreFarmTile =');
    expect(generated).not.toContain('use_farm_tile');
    expect(generated).not.toContain('use_farm_tool');
    expect(generated).not.toContain('restore_farm_tile');
    expect(generated).not.toContain("name: 'farm_parcel'");
    expect(generated).not.toContain("name: 'crop_patch'");
    expect(generated).not.toContain("name: 'farm_activity'");
    for (const file of [
      '../../world-bindings/src/use_farm_tile_reducer.ts',
      '../../world-bindings/src/use_farm_tool_reducer.ts',
      '../../world-bindings/src/restore_farm_tile_reducer.ts',
      '../../world-bindings/src/farm_parcel_table.ts',
      '../../world-bindings/src/crop_patch_table.ts',
      '../../world-bindings/src/farm_activity_table.ts',
    ]) expect(existsSync(new URL(file, import.meta.url)), file).toBe(false);
  });

  it('backfills legacy soil, crops, inventory custody, and statistic floors exactly once', () => {
    const migration = between('function ensureLegacyFarmMigration(', 'function cancelPlayerTrade(');
    expect(migration).toContain('LEGACY_FARM_MIGRATION_VERSION');
    expect(migration).toContain('migration?.legacyFarmVersion');
    expect(migration).toContain('ctx.db.world_soil.insert');
    expect(migration).toContain('ctx.db.world_crop.insert');
    expect(migration).toContain("migrateItem(inventory.identity, 'apple', inventory.fruit)");
    expect(migration).toContain("migrateItem(inventory.identity, 'bottles', inventory.bottles)");
    expect(migration).toContain("migrateItem(survival.identity, 'wood'");
    expect(migration).toContain("migrateItem(survival.identity, 'stone'");
    expect(migration).toContain('drainPlayerOverflow(ctx, identity)');
    expect(migration).toContain('migrateLegacyStatisticFloor(');
    expect(migration).toContain('legacyFarmVersion: LEGACY_FARM_MIGRATION_VERSION');
  });

  it('leaves compatibility columns and tables inert outside migration paths', () => {
    const cropReducer = between('export const harvestCropTile =', 'export const tendTree =');
    const treeReducer = between('export const tendTree =', 'export const stepWorld =');
    const connect = between('export const onConnect =', 'export const onDisconnect =');
    expect(cropReducer).not.toContain('farm_activity');
    expect(treeReducer).not.toContain('private_inventory');
    expect(connect).not.toContain('private_inventory.insert');
    expect(connect).not.toContain('farm_activity.insert');
    expect(source).not.toContain('export const useCropTile =');
    expect(generated).not.toContain('use_crop_tile');
    expect(existsSync(new URL('../../world-bindings/src/use_crop_tile_reducer.ts', import.meta.url))).toBe(false);
    expect(source).toContain('wood: t.u32()');
    expect(source).toContain('stone: t.u32()');
    expect(source).toContain('ensureLegacyFarmMigration(ctx);');
  });

  it('requires an owner-gated inspect, parity, bounded-drain, candidate state machine', () => {
    const control = between('const legacy_farm_retirement_control = table(', 'const movement_timer = table(');
    expect(control).toContain('phase: t.string()');
    expect(control).toContain('inspectionFingerprint: t.string()');
    expect(control).toContain('verificationFingerprint: t.string()');
    expect(control).toContain('remainingFingerprint: t.string()');
    expect(control).toContain('drainFingerprint: t.string()');
    for (const reducer of ['adminInspectLegacyFarmRetirement', 'adminVerifyLegacyFarmRetirement',
      'adminSetLegacyFarmRetirementPhase', 'adminDrainLegacyFarmRetirement']) {
      const start = source.indexOf(`export const ${reducer} =`);
      expect(start, reducer).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + 1_600)).toContain('requireWorldOwner(');
    }
    const drain = between('export const adminDrainLegacyFarmRetirement =', '/** Publishes one atomic map snapshot.');
    expect(drain).toContain('LEGACY_FARM_RETIREMENT_BATCH_MAX');
    expect(drain).toContain('ctx.db.private_inventory.identity.delete');
    expect(drain).toContain('ctx.db.player_survival.identity.update({ ...row, wood: 0, stone: 0 })');
    expect(drain).toContain('ctx.db.farm_parcel.id.delete');
    expect(drain).toContain('ctx.db.crop_patch.id.delete');
    expect(drain).toContain('ctx.db.farm_activity.identity.delete');
    expect(drain).not.toContain('inventory_slot.');
    expect(drain).not.toContain('player_statistic.');
    expect(drain).not.toContain('world_soil.');
    expect(drain).not.toContain('world_crop.');
  });
});
