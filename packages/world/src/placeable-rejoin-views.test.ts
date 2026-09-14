import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('durable owned-placeable reconnect views', () => {
  it('indexes placeables by placer and projects every owned slot and damage row', () => {
    expect(world).toContain("{ accessor: 'by_placer', algorithm: 'btree', columns: ['placedBy'] }");
    expect(world).toContain("name: 'own_placed_placeable_slots'");
    expect(world).toContain("name: 'own_placed_placeable_damage'");
    expect(world.match(/world_placeable\.by_placer\.filter\(ctx\.sender\)/gu)).toHaveLength(2);
    expect(world).toContain('world_placeable_slot.by_placeable.filter(placeable.id)');
    expect(world).toContain('world_placeable_damage.placeableId.find(placeable.id)');
  });
});
