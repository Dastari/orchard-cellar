import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const generated = readFileSync(new URL('../../client/src/net/generated/index.ts', import.meta.url), 'utf8');

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
    expect(generated).not.toContain('use_farm_tile');
    expect(generated).not.toContain("name: 'farm_parcel'");
    expect(generated).not.toContain("name: 'crop_patch'");
    expect(generated).not.toContain("name: 'farm_activity'");
    for (const file of [
      '../../client/src/net/generated/use_farm_tile_reducer.ts',
      '../../client/src/net/generated/farm_parcel_table.ts',
      '../../client/src/net/generated/crop_patch_table.ts',
      '../../client/src/net/generated/farm_activity_table.ts',
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
    const cropReducer = between('export const useCropTile =', 'export const tendTree =');
    const treeReducer = between('export const tendTree =', 'export const stepWorld =');
    const connect = between('export const onConnect =', 'export const onDisconnect =');
    expect(cropReducer).not.toContain('farm_activity');
    expect(treeReducer).not.toContain('private_inventory');
    expect(connect).not.toContain('private_inventory.insert');
    expect(connect).not.toContain('farm_activity.insert');
    expect(source).toContain('wood: t.u32()');
    expect(source).toContain('stone: t.u32()');
    expect(source).toContain('ensureLegacyFarmMigration(ctx);');
  });
});
