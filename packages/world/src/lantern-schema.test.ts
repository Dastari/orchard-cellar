import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
function reducerSource(name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = source.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('switchable lantern authority', () => {
  it('stores additive lit state in every item custody table and public equipment state', () => {
    for (const tableName of [
      'inventory_slot', 'player_container_cell', 'inventory_overflow', 'world_item', 'world_chest_slot',
      'world_placeable_slot', 'placeable_container_cell',
    ]) {
      const start = source.indexOf(`const ${tableName} = table(`);
      const end = source.indexOf('\nconst ', start + 1);
      expect(source.slice(start, end), tableName).toContain('lit: t.bool().default(true)');
    }
    const positionStart = source.indexOf('const player_position = table(');
    const positionEnd = source.indexOf('\nconst player_input', positionStart);
    expect(source.slice(positionStart, positionEnd)).toContain('equippedLit: t.bool().default(true)');
  });

  it('retires specialized lantern functions in favour of generic lifecycle authority', () => {
    expect(existsSync(new URL('./behaviour/lights.ts', import.meta.url))).toBe(false);
    expect(source).toContain("target.kind === 'world_item'");
    expect(source).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'emits.light')");
  });

  it('preserves lantern state across drop and pickup instead of overloading durability', () => {
    expect(reducerSource('dropSelected')).toContain('lit: slot.lit');
    expect(reducerSource('pickupWorldItem')).toContain('lit: candidate.lit');
    expect(source).toContain('item.lit !== lit');
    expect(source).toContain('left?.lit === right?.lit');
    expect(source).not.toContain('isSwitchableLightKind');
  });

  it('operates an authored switchable light only from the restricted off-hand row', () => {
    expect(source).toContain('const equippedLifecycleLight = ()');
    expect(source).toContain("subjectItem?.containerId !== 'equipment'");
    // The off-hand row is read from the sender's own equipment container, never from a client-named row.
    expect(source).toContain('equipmentInventorySlot(ctx, ctx.sender, subjectItem.slot)');
    expect(source).toContain('row.id !== subjectItem.instanceId');
    expect(source).toContain('row.quantity <= 0');
    expect(source).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'emits.light')");
    expect(source).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'gear.off_hand')");
    expect(source).toContain("throw new SenderError('equipment_light_required')");
  });
});
