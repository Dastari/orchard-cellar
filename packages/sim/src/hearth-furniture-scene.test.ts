import { describe, expect, it } from 'vitest';
import { hearthFurnitureDrawGroup, hearthFurnitureScene } from './hearth-furniture-scene.js';
const table = { id: 1n, kind: 'furniture_rustic_dining_table', spaceId: 30000, tileX: 5, tileY: 5, stateJson: '{}' };
const lamp = { id: 2n, kind: 'furniture_townhouse_table_lamp', spaceId: 30000, tileX: 5, tileY: 4,
  stateJson: '{"hearthFurnitureSupportId":"1","lit":true}' };
describe('furniture presentation grouping', () => {
  it('draws a supported lamp after its table even when subscription order is reversed', () => {
    const scene = hearthFurnitureScene([lamp, table]);
    const group = hearthFurnitureDrawGroup(scene, '1');
    expect(group.map(entry => entry.placement.id)).toEqual(['1', '2']);
    expect(group[0]?.anchor).toEqual({ x: 88, y: 96 });
    expect(group[1]?.anchor).toEqual({ x: 88, y: 76 });
    expect(group[1]?.contact).toEqual({ x: 88, y: 96 });
    expect(hearthFurnitureDrawGroup(scene, '2')).toEqual([]);
  });
  it('withholds orphan, cross-space, carried-parent and out-of-surface attachments', () => {
    for (const rows of [[lamp], [lamp, { ...table, spaceId: 0 }], [lamp, { ...table, carriedBy: 'owner' }],
      [{ ...lamp, tileY: 5 }, table], [{ ...lamp, stateJson: '{"hearthFurnitureSupportId":"01"}' }, table]]) {
      expect(hearthFurnitureScene(rows).has('2')).toBe(false);
    }
    expect(hearthFurnitureScene([table, { ...lamp, carriedBy: 'owner' }]).has('2')).toBe(false);
  });
  it('keeps rugs independent and updates attached anchors when a support changes', () => {
    const rug = { ...table, id: 3n, kind: 'furniture_rustic_woven_rug' };
    const scene = hearthFurnitureScene([table, lamp, rug]);
    expect(hearthFurnitureDrawGroup(scene, '3').map(entry => entry.placement.shape.layer)).toEqual(['floor']);
    const changed = hearthFurnitureScene([{ ...table, tileY: 6 }, { ...lamp, tileY: 5 }]);
    expect(changed.get('2')?.anchor.y).toBe(92);
    expect(changed.get('2')?.contact.y).toBe(112);
  });
});
