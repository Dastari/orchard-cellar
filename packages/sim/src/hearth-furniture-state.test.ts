import { describe, expect, it } from 'vitest';
import {
  hearthFurniturePersistentId, hearthFurniturePlacementFromRow,
  hearthFurnitureShapeForPlaceable, hearthFurnitureStateWithSupport, hearthFurnitureSupportId,
  hearthFurnitureRevision, hearthFurnitureStateWithRevision, hearthFurniturePreservePlacementState,
} from './hearth-furniture-state.js';
import { hearthFurnitureObstacle } from './hearth-furniture-placement.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import type {ObjectContentDefinition} from './content/object-definition.js';

describe('persisted furniture state', () => {
  it('preserves geometry revision through state updates and never wraps the counter', () => {
    expect(hearthFurnitureRevision('{}')).toBe(0n);
    const previous = hearthFurnitureStateWithRevision('{"lit":true,"hearthFurnitureSupportId":"8"}', 9007199254740993n);
    const next = hearthFurniturePreservePlacementState('{"lit":false}', previous);
    expect(hearthFurnitureRevision(next)).toBe(9007199254740993n);
    expect(hearthFurnitureSupportId(next)).toBe('8');
    expect(JSON.parse(next).lit).toBe(false);
    expect(() => hearthFurnitureStateWithRevision('{}', 18446744073709551616n)).toThrow('furniture_revision_invalid');
    expect(() => hearthFurnitureRevision('{"hearthFurnitureRevision":"01"}')).toThrow('furniture_revision_invalid');
  });
  it('round trips the full u64 identity range without numeric precision loss', () => {
    for (const id of ['0', '9007199254740993', '18446744073709551615']) {
      expect(hearthFurniturePersistentId(id)).toBe(true);
      expect(hearthFurnitureSupportId(hearthFurnitureStateWithSupport('{}', id))).toBe(id);
    }
    for (const id of ['', '01', '-1', '1.0', '1e3', ' 1', '18446744073709551616', 1, null]) {
      expect(hearthFurniturePersistentId(id)).toBe(false);
      expect(hearthFurnitureSupportId(JSON.stringify({ hearthFurnitureSupportId: id }))).toBeUndefined();
    }
  });
  it('preserves unrelated state when changing or removing a support and rejects corruption on mutation', () => {
    const original = { lit: false, open: true, custom: { revision: 3 }, hearthFurnitureSupportId: '3' };
    const attached = hearthFurnitureStateWithSupport(JSON.stringify(original), '4');
    expect(JSON.parse(attached)).toEqual({ ...original, hearthFurnitureSupportId: '4' });
    expect(JSON.parse(hearthFurnitureStateWithSupport(attached))).toEqual({ lit: false, open: true, custom: { revision: 3 } });
    for (const corrupt of ['no', 'null', '[]', '1']) {
      expect(hearthFurnitureSupportId(corrupt)).toBeUndefined();
      expect(() => hearthFurnitureStateWithSupport(corrupt, '4')).toThrow();
    }
    expect(() => hearthFurnitureStateWithSupport('{}', '01')).toThrow('furniture_support_invalid');
  });
  it('uses the stored definition rather than a conflicting kind or invented geometry', () => {
    const row = { id: 9007199254740993n, kind: 'chest', definitionId: 'object:furniture_rustic_dining_table',
      tileX: 5, tileY: 5, stateJson: '{"shape":{"base":null}}' };
    const placement = hearthFurniturePlacementFromRow(row)!;
    expect(placement.id).toBe('9007199254740993');
    expect(placement.shape.width).toBe(3);
    expect(hearthFurnitureObstacle(placement)).not.toBeNull();
    expect(hearthFurniturePlacementFromRow({ ...row, stateJson: 'broken' })?.shape).toEqual(placement.shape);
    expect(hearthFurniturePlacementFromRow({ ...row, carriedBy: 'owner' })).toBeNull();
    expect(hearthFurniturePlacementFromRow({ ...row, tileX: NaN })).toBeNull();
    for (const definitionId of ['object:missing', 'invalid']) {
      expect(hearthFurnitureShapeForPlaceable({ kind: 'furniture_rustic_chair', definitionId })).toBeNull();
    }
    for (const kind of ['__proto__', 'constructor', 'chest']) expect(hearthFurnitureShapeForPlaceable({ kind })).toBeNull();
  });

  it('resolves renamed authored furniture and fails closed for retired or ambiguous content', () => {
    const bootstrap=bootstrapContentRegistry(),source=bootstrap.objects.get('object:furniture_rustic_bench')!;
    const renamed:ObjectContentDefinition={...source,id:'object:moon_settee',components:{...source.components,
      placement:{...source.components.placement!,item:'item:moon_settee'}}};
    const objects=new Map(bootstrap.objects);objects.delete(source.id);objects.set(renamed.id,renamed);
    const registry={...bootstrap,objects};
    const row={id:7n,kind:'moon_settee',definitionId:renamed.id,tileX:4,tileY:5,stateJson:'{}'};
    expect(hearthFurniturePlacementFromRow(registry,row)?.shape).toMatchObject({
      id:'moon_settee',layer:'standing',width:2,height:1,
      base:{halfWidth:15,depth:8},seatPoseOffsetPixels:8,
    });
    objects.set(renamed.id,{...renamed,retired:true});
    expect(hearthFurniturePlacementFromRow(registry,row)).toBeNull();
    const ambiguousPlacement={...renamed.components.placement!,item:'item:ambiguous_settee' as const};
    objects.delete(renamed.id);
    objects.set('object:first_settee',{...renamed,id:'object:first_settee',components:{...renamed.components,
      placement:ambiguousPlacement}});
    objects.set('object:second_settee',{...renamed,id:'object:second_settee',components:{...renamed.components,
      placement:ambiguousPlacement}});
    expect(hearthFurnitureShapeForPlaceable(registry,{kind:'ambiguous_settee'})).toBeNull();
  });
});
