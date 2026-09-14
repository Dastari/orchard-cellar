import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import * as sim from '@orchard/sim';
import { resolvePlaceableObject } from './content/object-runtime.js';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function authority(dependencies: Record<string, unknown>, names = ['requireFurnitureBuilder', 'furnitureInResidence', 'requireFurnitureReach', 'requireFurnitureDestination',
  'requireFurnitureRow', 'placeHearthFurniture', 'moveHearthFurniture', 'pickupHearthFurniture']) {
  const code = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn) return fn.getText(source);
    for (const node of source.statements) {
      if (!ts.isVariableStatement(node)) continue;
      const declaration = node.declarationList.declarations.find(d => d.name.getText(source) === name);
      if (!declaration?.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const callback = declaration.initializer.arguments.find(ts.isArrowFunction);
      if (callback) return `const ${name}=${callback.getText(source)};`;
    }
    throw new Error(`missing ${name}`);
  });
  return new Function(...Object.keys(dependencies), ts.transpileModule(code.join('\n') + `\nreturn {${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText)(...Object.values(dependencies));
}
type Row = { id: bigint; kind: string; definitionId: string; spaceId: number; tileX: number; tileY: number;
  stateJson: string; lit: boolean; facing: string; carriedBy?: string };
function fixture() {
  const rows = new Map<bigint, Row>(), slots = new Map<string, { id: string; placeableId: bigint; itemKind: string; quantity: number }>();
  const received: unknown[] = [];
  let nextId = 1n, consumed = 0, full = false, role = 'builder', locked = false, mounted = false;
  const position = { spaceId: 30000, identity: 'alice', x: 6.5 * sim.TILE_SIZE_FIXED, y: 7.5 * sim.TILE_SIZE_FIXED };
  const collision: sim.CollisionMap = { width: 16, height: 16,
    blocked: Array.from({ length: 256 }, (_, i) => i < 16 || i >= 240 || i % 16 === 0 || i % 16 === 15) };
  const definitions = new Map(Object.values(sim.HEARTH_FURNITURE_SHAPES).map(shape => [`object:${shape.id}`, {
    id: `object:${shape.id}`, components: {
      identity: { tags: ['furniture'] },
      furniture: shape.layer === 'wall' ? ['w'] : shape.layer === 'tabletop' ? ['t']
        : shape.layer === 'standing' ? [shape.base!.halfWidth, shape.base!.depth,
          ...(shape.seatPoseOffsetPixels === undefined
            ? shape.tabletopSurface === undefined ? [] : [[
              shape.tabletopSurface.insetLeft, shape.tabletopSurface.insetTop,
              shape.tabletopSurface.width, shape.tabletopSurface.height,
              shape.tabletopSurface.liftPixels,
            ]]
            : [shape.seatPoseOffsetPixels])]
        : undefined,
      placement: { item: `item:${shape.id}`, spaces: ['residence'],
        layer: shape.layer === 'standing' ? 'object' : shape.layer === 'floor' ? 'ground' : 'overlay',
        footprint: Array.from({ length: shape.height }, () => Array(shape.width).fill(15)) },
      states: { lit: { type: 'bool', default: true } },
      collision: { blocksMovement: !!shape.base,
        footprint: Array.from({ length: shape.height }, () => Array(shape.width).fill(15)) } },
  }]));
  const empty = { find: () => null, delete: () => {} };
  const ctx = { sender: 'alice', senderAuth: { jwt: null }, db: {
    membership: { identity: empty }, player_position: { identity: { find: () => position }, by_chunk: { filter: () => [position] } },
    player_stats: { identity: { find: () => ({ healthCenti: 100 }) } },
    world_placeable: { id: { find: (id: bigint) => rows.get(id) ?? null, update: (row: Row) => rows.set(row.id, row), delete: (id: bigint) => rows.delete(id) },
      by_chunk: { filter: (space: number) => [...rows.values()].filter(row => row.spaceId === space) } },
    world_placeable_slot: { by_placeable: { filter: (id: bigint) => [...slots.values()].filter(row => row.placeableId === id) },
      id: { delete: (id: string) => slots.delete(id) } },
    world_placeable_build: { placeableId: empty }, world_placeable_damage: { placeableId: empty },
    player_seat: { placeableId: empty }, active_placeable: { by_placeable: { filter: () => [] } },
  } };
  const api = authority({ ...sim, resolvePlaceableObject, SenderError: Error, requireAuthorizedSender: () => {},
    requirePersistentInventoryAvailable: () => { if (locked) throw new Error('descent_inventory_locked'); },
    requireWorldModificationAuthorized: () => {}, mountedNpcFor: () => mounted ? {} : null, handsOccupiedFor: () => false,
    homesteadForSpace: () => ({ residenceSpaceId: 30000 }), activeSpaceDefinition: () => ({ generator: 'residence' }),
    homesteadRoleFor: () => role, homesteadRoleAtLeast: (value: string) => value === 'builder',
    collisionForSpace: () => collision, isAuthoredLandmarkPlaceable: () => false,
    contentRegistry: () => ({ objects: definitions, items: sim.bootstrapContentRegistry().items }),
    placeableObjectDefinition: (_registry: unknown, kind: string) => definitions.get(`object:${kind}`) ?? null,
    authoredPlaceableDefinition: (_ctx: unknown, row: Row) => definitions.get(row.definitionId),
    removePlayerBuildItem: () => { consumed++; return { lit: false }; },
    insertWorldPlaceable: (_ctx: unknown, actor: typeof position, definitionId: string, tileX: number, tileY: number) => {
      const row = { id: nextId++, kind: definitionId.slice(7), definitionId, tileX, tileY, spaceId: actor.spaceId,
        stateJson: '{"lit":true}', lit: true, facing: 'left' }; rows.set(row.id, row); return row;
    },
    insertPlayerCarriedItem: (_ctx: unknown, kind: string, quantity: number, metadata: unknown) => {
      if (full) return false; received.push({ kind, quantity, metadata }); return true;
    }, updateEquippedForIdentity: () => {}, refreshResidenceFurnishingQuests: () => {},
  });
  return { api, ctx, rows, slots, position, received, consumed: () => consumed,
    setFull: () => { full = true; }, setRole: (value: string) => { role = value; }, lock: () => { locked = true; }, mount: () => { mounted = true; } };
}
describe('furniture authority transactions', () => {
  it('rejects stale inverse moves even after another builder moves the object away and back', () => {
    const f = fixture();
    f.api.placeHearthFurniture(f.ctx, { itemKind: 'furniture_rustic_chair', tileX: 5, tileY: 5 });
    f.api.moveHearthFurniture(f.ctx, { placeableId: 1n, tileX: 7, tileY: 5, expectedRevision: 0n });
    expect(sim.hearthFurnitureRevision(f.rows.get(1n)!.stateJson)).toBe(1n);
    f.api.moveHearthFurniture(f.ctx, { placeableId: 1n, tileX: 5, tileY: 5, expectedRevision: 1n });
    expect(sim.hearthFurnitureRevision(f.rows.get(1n)!.stateJson)).toBe(2n);
    const before = f.rows.get(1n);
    expect(() => f.api.moveHearthFurniture(f.ctx, { placeableId: 1n, tileX: 7, tileY: 5, expectedRevision: 1n })).toThrow('furniture_changed');
    expect(f.rows.get(1n)).toBe(before);
    expect(f.consumed()).toBe(1); expect(f.received).toEqual([]);
  });
  it('round trips an unlit lamp through actual inventory helpers and cannot stack it into lit lamps in a full bag', () => {
    const rows = new Map(Array.from({ length: sim.INVENTORY_SLOT_COUNT }, (_, slot) => [slot, {
      id: `alice:${slot}`, identity: 'alice', slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true,
    }]));
    const initial = { ...rows.get(0)!, itemKind: 'furniture_townhouse_table_lamp', quantity: 2, lit: false };
    rows.set(0, initial);
    const ctx = { sender: 'alice', db: {
      inventory_slot: { by_identity: { filter: () => [...rows.values()] }, id: { update: (row: typeof initial) => rows.set(row.slot, row) } },
      world_clock: { id: { find: () => ({ authorityTick: 1n }) } },
      inventory_overflow_retry: { identity: { find: () => null } },
    } };
    const api = authority({ ...sim, DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY, SenderError: Error,
      contentRegistry: () => sim.bootstrapContentRegistry(), equippedInventoryCapacity: () => sim.BASE_BACKPACK_CAPACITY,
      playerDebugBackpackSlots: () => 0, updateEquippedForIdentity: () => {},
    }, ['insertPlayerCarriedItem', 'removePlayerBuildItem', 'loadPlayerInventory', 'writePlayerInventory',
      'storedStack', 'storedDurability', 'storedLit', 'sameStoredStack', 'inventorySlotOffset', 'inventoryContainerCapacity',
      'accessibleInventoryContainerCapacity', 'activeItemContainerContent']);
    const removed = api.removePlayerBuildItem(ctx, initial.itemKind);
    expect(removed.lit).toBe(false); expect(rows.get(0)?.quantity).toBe(1);
    expect(api.insertPlayerCarriedItem(ctx, initial.itemKind, 1, { lit: removed.lit })).toBe(true);
    expect(rows.get(0)).toEqual(initial);
    for (let slot = 0; slot < sim.EQUIPMENT_SLOT_OFFSET; slot++) {
      rows.set(slot, { ...rows.get(slot)!, itemKind: 'wood', quantity: 99 });
    }
    rows.set(0, { ...initial, lit: true, quantity: 15 });
    const before = [...rows.values()];
    expect(api.insertPlayerCarriedItem(ctx, initial.itemKind, 1, { lit: false })).toBe(false);
    expect([...rows.values()]).toEqual(before);
    expect(api.insertPlayerCarriedItem(ctx, initial.itemKind, 1, { lit: true })).toBe(true);
    expect(rows.get(0)).toMatchObject({ lit: true, quantity: 16 });
  });
  it('places supported furniture, preserves identity during moves, and returns an intact unlit lamp', () => {
    const f = fixture();
    f.api.placeHearthFurniture(f.ctx, { itemKind: 'furniture_rustic_dining_table', tileX: 5, tileY: 5 });
    f.api.placeHearthFurniture(f.ctx, { itemKind: 'furniture_townhouse_table_lamp', tileX: 5, tileY: 4, supportId: 1n });
    expect(f.consumed()).toBe(2);
    expect(() => f.api.moveHearthFurniture(f.ctx, { expectedRevision: 0n, placeableId: 1n, tileX: 7, tileY: 5 })).toThrow('furniture_has_attachments');
    expect(() => f.api.pickupHearthFurniture(f.ctx, { placeableId: 1n })).toThrow('furniture_has_attachments');
    f.api.moveHearthFurniture(f.ctx, { expectedRevision: 0n, placeableId: 2n, tileX: 6, tileY: 4, supportId: 1n });
    expect(f.rows.get(2n)).toMatchObject({ id: 2n, tileX: 6, lit: false, facing: 'down' });
    expect(sim.hearthFurnitureSupportId(f.rows.get(2n)!.stateJson)).toBe('1');
    f.api.pickupHearthFurniture(f.ctx, { placeableId: 2n });
    expect(f.received).toEqual([{ kind: 'furniture_townhouse_table_lamp', quantity: 1, metadata: { lit: false } }]);
    expect(f.rows.has(2n)).toBe(false);
    expect(() => f.api.pickupHearthFurniture(f.ctx, { placeableId: 2n })).toThrow('furniture_not_movable');
    f.api.moveHearthFurniture(f.ctx, { expectedRevision: 0n, placeableId: 1n, tileX: 7, tileY: 5 });
    expect(f.rows.get(1n)?.tileX).toBe(7);
  });
  it('rejects failed placement before consuming an item, including missing or cross-space support', () => {
    const f = fixture(), place = (supportId?: bigint) => f.api.placeHearthFurniture(f.ctx,
      { itemKind: 'furniture_townhouse_table_lamp', tileX: 5, tileY: 5, supportId });
    expect(() => place()).toThrow('furniture_tabletop_support_required');
    f.rows.set(1n, { id: 1n, spaceId: 0, kind: 'furniture_rustic_dining_table', definitionId: 'object:furniture_rustic_dining_table',
      tileX: 5, tileY: 6, stateJson: '{}', lit: true, facing: 'down' });
    expect(() => place(1n)).toThrow('furniture_tabletop_support_required');
    expect(f.consumed()).toBe(0);
  });
  it('keeps rows and contents when storage is occupied or the bag is full', () => {
    const f = fixture();
    f.api.placeHearthFurniture(f.ctx, { itemKind: 'furniture_rustic_chest', tileX: 5, tileY: 5 });
    f.slots.set('1:0', { id: '1:0', placeableId: 1n, itemKind: 'wood', quantity: 3 });
    expect(() => f.api.pickupHearthFurniture(f.ctx, { placeableId: 1n })).toThrow('furniture_not_empty');
    f.api.moveHearthFurniture(f.ctx, { expectedRevision: 0n, placeableId: 1n, tileX: 7, tileY: 5 });
    expect(f.slots.get('1:0')?.quantity).toBe(3);
    f.slots.clear(); f.setFull(); const before = f.rows.get(1n);
    expect(() => f.api.pickupHearthFurniture(f.ctx, { placeableId: 1n })).toThrow('inventory_full');
    expect(f.rows.get(1n)).toBe(before); expect(f.received).toEqual([]);
  });
  it('rejects visitors, other spaces, Delve custody and mounted actors before mutation', () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => f.setRole('visitor'), (f: ReturnType<typeof fixture>) => { f.position.spaceId = 0; },
      (f: ReturnType<typeof fixture>) => f.lock(), (f: ReturnType<typeof fixture>) => f.mount()]) {
      const f = fixture(); mutate(f);
      expect(() => f.api.placeHearthFurniture(f.ctx, { itemKind: 'furniture_rustic_chair', tileX: 5, tileY: 5 })).toThrow();
      expect(f.consumed()).toBe(0); expect(f.rows.size).toBe(0);
    }
  });
});
