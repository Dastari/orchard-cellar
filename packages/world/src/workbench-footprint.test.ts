import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import * as sim from '@orchard/sim';
import { tilePlacementResult } from './world-rules.js';
import { placeableTargetMatchesFacingTile } from './behaviour/interact-entity.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function production(name: string, dependencies: Record<string, unknown>) {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(name);
  const code = ts.transpileModule(`${node.getText(source)}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
const registry = sim.bootstrapContentRegistry();
const bench = { id: 1n, kind: 'workbench', tileX: 10, tileY: 10, spaceId: 10 };

it('requires both destination cells clear for new and carried workbench placement', () => {
  const collision = { width: 20, height: 20, blocked: new Array<boolean>(400).fill(false) };
  let occupied = false;
  const validate = production('requirePlaceablePlacementTile', { ...sim, SenderError: Error,
    contentRegistry: () => registry, tilePlacementResult,
    collisionForSpace: () => collision, tileOverlapsAnyPlayer: (_ctx: unknown, _space: number, x: number) => occupied && x === 11,
  });
  const position = { spaceId: 10, x: 10.5 * sim.TILE_SIZE_FIXED, y: 12 * sim.TILE_SIZE_FIXED };
  expect(() => validate({}, position, 10, 10, bench)).not.toThrow();
  collision.blocked[10 * 20 + 11] = true;
  expect(() => validate({}, position, 10, 10, bench)).toThrow('placement_blocked');
  collision.blocked[10 * 20 + 11] = false; occupied = true;
  expect(() => validate({}, position, 10, 10, bench)).toThrow('placement_blocked');
  occupied = false;
  expect(() => validate({}, { ...position, x: 19.5 * sim.TILE_SIZE_FIXED }, 19, 10, bench)).toThrow('placement_blocked');
});

it('finds a workbench when facing either occupied tile', () => {
  const target = production('placeableAtFacingTile', { ...sim, contentRegistry: () => registry,
    facingTile: (_x: number, _y: number, facing: string) => ({ tileX: Number(facing), tileY: 10 }) });
  const ctx = { db: { world_placeable: { by_chunk: { filter: () => [bench] } } } };
  for (const facing of ['10', '11']) expect(target(ctx, { spaceId: 10, facing })).toBe(bench);
  expect(target(ctx, { spaceId: 10, facing: '12' })).toBeNull();
});

it('dismantles the workbench after three axe hits and drops four planks exactly once', () => {
  let damage: { placeableId: bigint; hits: number } | null = null;
  let present = true;
  const dropped = vi.fn();
  const position = { x: 11.5 * sim.TILE_SIZE_FIXED, y: 12 * sim.TILE_SIZE_FIXED, spaceId: 10 };
  const ctx = { sender: {}, senderAuth: { jwt: null }, db: {
    membership: { identity: { find: () => null } },
    player_position: { identity: { find: () => position } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => ({ authorityTick: 10n }) } },
    world_placeable: { id: { find: () => present ? bench : null, delete: () => { present = false; } } },
    inventory_slot: { id: { find: () => ({ itemKind: 'axe' }) } },
    player_cooking_job: { by_target: { filter: () => [] } },
    world_placeable_damage: { placeableId: { find: () => damage,
      update: (row: typeof damage) => { damage = row; }, delete: () => { damage = null; } },
    insert: (row: typeof damage) => { damage = row; } },
    world_placeable_slot: { by_placeable: { filter: () => [] } },
    active_placeable: { by_placeable: { filter: () => [] } },
    world_placeable_build: { placeableId: { find: () => null } },
  } };
  ctx.sender = { toHexString: () => 'player' };
  const harvest = production('applyHarvestPlaceableLifecycle', { ...sim, SenderError: Error,
    requireAuthorizedSender: vi.fn(), contentRegistry: () => registry,
    authoredHitsDamageable: () => sim.runtimeObjectDamageable(registry, bench),
    authoredSalvageRecipe: () => sim.runtimeRecipeDefinition(registry, 'workbench'),
    isAuthoredLandmarkPlaceable: () => false, requireWorldModificationAuthorized: vi.fn(),
    mountedNpcFor: () => null, requireUsableTool: vi.fn(), campfireWithinReach: () => true,
    processorAdapterForPlaceableBehaviour: () => null, dropWorldItemStack: dropped, recordPlayerStatistic: vi.fn(),
  });
  for (let hit = 0; hit < 2; hit++) harvest(ctx, 1n, true, { prepaid: true });
  expect(dropped).not.toHaveBeenCalled();
  expect(present).toBe(true);
  harvest(ctx, 1n, true, { prepaid: true });
  expect(present).toBe(false);
  expect(dropped).toHaveBeenCalledOnce();
  expect(dropped.mock.calls[0]?.[1]).toMatchObject({ itemKind: 'plank', quantity: 4 });
  expect(() => harvest(ctx, 1n, true, { prepaid: true })).toThrow('target_not_ready');
  expect(dropped).toHaveBeenCalledOnce();
});

it('preserves the carried entity until the whole placement succeeds', () => {
  const carried = { ...bench, carriedBy: 'player', stateJson: '{"custom":true}' };
  const update = vi.fn();
  let blocked = true;
  const place = production('placeCarriedHandsObject', { ...sim, contentRegistry: () => registry,
    requirePlaceablePlacementTile: (_ctx: unknown, _position: unknown, _x: number, _y: number, reference: unknown) => {
      expect(reference).toBe(carried);
      if (blocked) throw new Error('placement_blocked');
    }, genericChest: () => false, updateEquippedForIdentity: vi.fn(), recordPlayerStatistic: vi.fn(),
  });
  const ctx = { sender: {}, db: { world_placeable: { id: { update } }, world_clock: { id: { find: () => null } } } };
  const position = { spaceId: 10, facing: 'down' };
  expect(() => place(ctx, position, null, carried, 12, 10)).toThrow('placement_blocked');
  expect(update).not.toHaveBeenCalled();
  blocked = false;
  expect(place(ctx, position, null, carried, 12, 10)).toBe(true);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    id: 1n, tileX: 12, tileY: 10, carriedBy: undefined, stateJson: carried.stateJson,
  }));
});

it('allows use and pickup facing the second cell, but rejects other spaces and tiles', () => {
  const position = { x: 11.5 * sim.TILE_SIZE_FIXED, y: 12 * sim.TILE_SIZE_FIXED, facing: 'up', spaceId: 10 };
  const faced = sim.facedTileTarget(position.x, position.y, 'up');
  const ctx = { sender: {}, db: { player_position: { identity: { find: () => position } } } };
  const validate = production('assertBehaviourTargetReach', { ...sim, SenderError: Error,
    contentRegistry: () => registry, parseDirection: () => 'up', placeableTargetMatchesFacingTile });
  const target = { kind: 'placeable', snapshot: { entityType: 'object', definitionId: 'object:workbench',
    tags: ['station.workbench'], state: {}, tile: { spaceId: '10', x: faced.tileX - 1, y: faced.tileY } } };
  for (const verb of ['use', 'pickup', 'use_with']) expect(() => validate(ctx, target, verb)).not.toThrow();
  target.snapshot.tile.spaceId = '11';
  expect(() => validate(ctx, target, 'pickup')).toThrow('behaviour_target_out_of_range');
  target.snapshot.tile.spaceId = '10'; target.snapshot.tile.x -= 2;
  expect(() => validate(ctx, target, 'use')).toThrow('behaviour_target_out_of_range');
});
