import { readFileSync } from 'node:fs';
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
      'inventory_slot', 'inventory_overflow', 'world_item', 'world_chest_slot', 'world_placeable_slot',
    ]) {
      const start = source.indexOf(`const ${tableName} = table(`);
      const end = source.indexOf('\nconst ', start + 1);
      expect(source.slice(start, end), tableName).toContain('lit: t.bool().default(true)');
    }
    const positionStart = source.indexOf('const player_position = table(');
    const positionEnd = source.indexOf('\nconst player_input', positionStart);
    expect(source.slice(positionStart, positionEnd)).toContain('equippedLit: t.bool().default(true)');
  });

  it('authenticates before reading state and validates dropped-lantern reach server-side', () => {
    for (const name of ['toggleHeldLantern', 'toggleWorldLantern']) {
      const reducer = reducerSource(name);
      expect(reducer.indexOf('requireAuthorizedSender('), name).toBeGreaterThanOrEqual(0);
      expect(reducer.indexOf('requireAuthorizedSender('), name).toBeLessThan(reducer.indexOf('.find('));
    }
    expect(reducerSource('toggleWorldLantern')).toContain('itemWithinPickupReach(');
  });

  it('preserves lantern state across drop and pickup instead of overloading durability', () => {
    expect(reducerSource('dropSelected')).toContain('lit: slot.lit');
    expect(reducerSource('pickupWorldItem')).toContain('{ lit: candidate.lit }');
    expect(source).toContain('item.lit !== lit');
    expect(source).toContain('left?.lit === right?.lit');
  });
});
