import { describe, expect, it } from 'vitest';
import {
  defineItemOnUse,
  defineItemOnUseHandlers,
  ITEM_ON_USE_INPUT_DISPATCH,
  itemOnUseEventItem,
  itemOnUseEventTarget,
  itemOnUseEventTile,
  normalizeItemOnUseTriggers,
} from './lifecycle-code.js';
import type { Handler } from './handler.js';
import type { ItemOnUseEvent } from './lifecycle-code.js';
import type { ReadOnlySnapshot } from './snapshot.js';

const woodenPickaxeRecipe = { id: 'recipe:wooden_pickaxe' } as const;
const woodenSwordRecipe = { id: 'recipe:wooden_sword' } as const;

function snapshot(knownRecipeIds: readonly string[] = []): ReadOnlySnapshot {
  return {
    tick: 1n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'hash', definitions: {} },
    space: { id: '1', kind: 'world', tags: [] },
    calendar: { minuteOfDay: 600, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [],
      tile: { spaceId: '1', x: 1, y: 1, tags: [] },
      bronze: 0n, vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [],
      worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
      knownRecipeIds,
    },
    selectedItem: {
      kind: 'woodworking_recipe_book', definitionId: 'item:woodworking_recipe_book',
      instanceId: 'slot', tags: [], count: 1,
    },
    nearbyObjects: [],
  };
}

describe('Studio-authored item lifecycle code', () => {
  it('supports the proposed findRecipe/giveRecipe callback without duplicate grants', () => {
    const registration = defineItemOnUse({
      itemId: 'item:woodworking_recipe_book',
      id: 'item.woodworking-recipe-book.on-use',
      prompt: 'READ',
      run: (context) => {
        const recipes = [woodenPickaxeRecipe, woodenSwordRecipe];
        for (const recipe of recipes) {
          if (!context.player.findRecipe(recipe.id)) context.player.giveRecipe(recipe);
        }
        context.item.consume();
      },
    });
    const result = registration.handler({
      type: 'secondary', actor: { entityType: 'player', id: 'player' },
      selectedItem: { kind: 'woodworking_recipe_book' },
    }, snapshot(['recipe:wooden_pickaxe']));
    expect(result).toEqual({ effects: [
      { learnRecipes: ['recipe:wooden_sword'] },
      { consumeSelected: 1 },
    ] });
  });

  it('turns authored precondition failures into an authority block', () => {
    const registration = defineItemOnUse({
      itemId: 'item:apple', id: 'item.apple.on-use', prompt: 'EAT',
      run: (context) => context.block('hunger_full'),
    });
    expect(registration.handler({
      type: 'secondary', actor: { entityType: 'player', id: 'player' },
      selectedItem: { kind: 'apple' },
    }, snapshot())).toEqual({ blocked: 'hunger_full' });
  });

  it('exposes bounded hunger restoration and selected-item repair capabilities', () => {
    const registration = defineItemOnUse({
      itemId: 'item:apple', id: 'item.apple.restore-and-repair', prompt: 'RESTORE',
      run: (context) => {
        context.player.restoreHunger(700);
        context.item.repair();
      },
    });
    const event = {
      type: 'secondary', actor: { entityType: 'player', id: 'player' },
      selectedItem: { kind: 'apple' },
    } as const;
    expect(registration.handler(event, snapshot())).toEqual({ effects: [
      { restoreHunger: 700 },
      { repairSelected: true },
    ] });

    const invalid = defineItemOnUse({
      itemId: 'item:apple', id: 'item.apple.invalid-restore', prompt: 'RESTORE',
      run: (context) => context.player.restoreHunger(0),
    });
    expect(() => invalid.handler(event, snapshot())).toThrow('hunger restore must be a positive safe integer');
  });

  it('runs one typed callback across every item invocation trigger with event references intact', () => {
    const seen: Array<{ readonly type: string; readonly target?: string; readonly tile?: string }> = [];
    const registrations = defineItemOnUseHandlers({
      itemId: 'item:wooden_pickaxe',
      id: 'item.wooden-pickaxe.on-use',
      prompt: 'USE PICKAXE',
      triggers: ['secondary', 'equipmentUse', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place'],
      run(context) {
        seen.push({
          type: context.event.type,
          ...(context.target === undefined ? {} : {
            target: 'entityType' in context.target ? context.target.id : `${context.target.x},${context.target.y}`,
          }),
          ...(context.tile === undefined ? {} : { tile: `${context.tile.x},${context.tile.y}` }),
        });
        context.item.damage();
      },
    });
    const events = [
      {
        type: 'secondary', actor: { entityType: 'player', id: 'player' },
        selectedItem: { kind: 'wooden_pickaxe' },
        target: { spaceId: '1', x: 2, y: 3 },
      },
      {
        type: 'equipmentUse', actor: { entityType: 'player', id: 'player' },
        equipmentItem: { kind: 'wooden_pickaxe', containerId: 'equipment', slot: 35 },
        equipmentSlot: 35,
      },
      {
        type: 'worldItemUse', actor: { entityType: 'player', id: 'player' },
        worldItem: { kind: 'wooden_pickaxe', containerId: 'world', instanceId: 'world:1' },
        target: { entityType: 'object', id: 'world:1', definitionId: 'object:wooden_pickaxe' },
      },
      {
        type: 'useWith', actor: { entityType: 'player', id: 'player' },
        selectedItem: { kind: 'wooden_pickaxe' },
        target: { entityType: 'object', id: 'rock' },
      },
      {
        type: 'useAt', actor: { entityType: 'player', id: 'player' },
        selectedItem: { kind: 'wooden_pickaxe' },
        tile: { spaceId: '1', x: 6, y: 7 }, actionId: 'mine', targetId: '42',
      },
      {
        type: 'aimedUse', actor: { entityType: 'player', id: 'player' },
        selectedItem: { kind: 'wooden_pickaxe' }, phase: 'fire', aimX: 4, aimY: 5, chargeMs: 600,
      },
      {
        type: 'place', actor: { entityType: 'player', id: 'player' },
        subject: { kind: 'wooden_pickaxe' }, tile: { spaceId: '1', x: 4, y: 5 },
      },
    ] as const satisfies readonly ItemOnUseEvent[];
    expect(registrations.map(({ id, eventType, source }) => ({ id, eventType, source }))).toEqual([
      { id: 'item.wooden-pickaxe.on-use.secondary', eventType: 'secondary', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.equipmentUse', eventType: 'equipmentUse', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.worldItemUse', eventType: 'worldItemUse', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.useWith', eventType: 'useWith', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.useAt', eventType: 'useAt', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.aimedUse', eventType: 'aimedUse', source: 'selectedItem' },
      { id: 'item.wooden-pickaxe.on-use.place', eventType: 'place', source: 'selectedItem' },
    ]);
    for (const [index, registration] of registrations.entries()) {
      expect((registration.handler as Handler)(events[index]!, snapshot())).toEqual({
        effects: [{ damageSelected: 1 }],
      });
    }
    expect(seen).toEqual([
      { type: 'secondary', target: '2,3', tile: '2,3' },
      { type: 'equipmentUse' },
      { type: 'worldItemUse', target: 'world:1' },
      { type: 'useWith', target: 'rock' },
      { type: 'useAt', tile: '6,7' },
      { type: 'aimedUse' },
      { type: 'place', tile: '4,5' },
    ]);
  });

  it('publishes deterministic input-dispatch metadata and rejects ambiguous trigger lists', () => {
    expect(ITEM_ON_USE_INPUT_DISPATCH).toEqual({
      secondary: { eventType: 'secondary', itemRef: 'selectedItem', target: 'optional', tile: 'none' },
      equipmentUse: { eventType: 'equipmentUse', itemRef: 'equipmentItem', target: 'none', tile: 'none' },
      worldItemUse: { eventType: 'worldItemUse', itemRef: 'worldItem', target: 'required', tile: 'none' },
      useWith: { eventType: 'useWith', itemRef: 'selectedItem', target: 'required', tile: 'none' },
      useAt: { eventType: 'useAt', itemRef: 'selectedItem', target: 'none', tile: 'required' },
      aimedUse: { eventType: 'aimedUse', itemRef: 'selectedItem', target: 'none', tile: 'none' },
      place: { eventType: 'place', itemRef: 'subject', target: 'none', tile: 'required' },
    });
    expect(normalizeItemOnUseTriggers(undefined)).toEqual(['secondary']);
    expect(() => normalizeItemOnUseTriggers(['place', 'secondary'])).toThrow('canonical');
    expect(() => normalizeItemOnUseTriggers(['secondary', 'secondary'])).toThrow('duplicate');
  });

  it('extracts item, target, and tile references without treating an object subject as an item', () => {
    const place = {
      type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'chest' }, tile: { spaceId: '1', x: 8, y: 9 },
    } as const satisfies ItemOnUseEvent;
    expect(itemOnUseEventItem(place)).toEqual({ kind: 'chest' });
    expect(itemOnUseEventTarget(place)).toBeUndefined();
    expect(itemOnUseEventTile(place)).toEqual({ spaceId: '1', x: 8, y: 9 });
    expect(itemOnUseEventItem({ ...place, subject: { entityType: 'object', id: 'object:1' } })).toBeNull();
  });

  it('can explicitly pass through and always declines carried-object placement', () => {
    const [registration] = defineItemOnUseHandlers({
      itemId: 'item:wooden_pickaxe', id: 'item.wooden-pickaxe.place', prompt: 'PLACE',
      triggers: ['place'],
      run(context) {
        if (context.snapshot.actor?.carriedEntityId !== undefined) context.pass();
        context.item.consume();
      },
    });
    expect((registration!.handler as Handler)({
      type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'wooden_pickaxe' }, tile: { spaceId: '1', x: 2, y: 3 },
    }, { ...snapshot(), actor: { ...snapshot().actor!, carriedEntityId: 'object:1' } }))
      .toEqual({ effects: [], continue: true });
    expect((registration!.handler as Handler)({
      type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { entityType: 'object', id: 'object:1' }, tile: { spaceId: '1', x: 2, y: 3 },
    }, snapshot())).toEqual({ effects: [], continue: true });
  });

  it('lets an authored seed own its tile planting effect without database access', () => {
    const [registration] = defineItemOnUseHandlers({
      itemId: 'item:carrot_seeds',
      id: 'item.carrot-seeds.on-use',
      prompt: 'PLANT CARROT SEEDS',
      triggers: ['place'],
      run(context) {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({ plantSeed: targetTile });
        context.item.consume();
      },
    });
    expect((registration!.handler as Handler)({
      type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'carrot_seeds' }, tile: { spaceId: '1', x: 4, y: 5 },
    }, {
      ...snapshot(),
      selectedItem: {
        kind: 'carrot_seeds', definitionId: 'item:carrot_seeds',
        instanceId: 'slot', tags: ['item.seed'], count: 3,
      },
    })).toEqual({ effects: [
      { plantSeed: { spaceId: '1', x: 4, y: 5 } },
      { consumeSelected: 1 },
    ] });
  });

  it('lets an authored farm tool choose a bounded action from its place event', () => {
    const [registration] = defineItemOnUseHandlers({
      itemId: 'item:hoe',
      id: 'item.hoe.on-use',
      prompt: 'USE HOE',
      triggers: ['place'],
      run(context) {
        const targetTile = context.tile;
        if (targetTile === undefined) context.block('farm_tile_required');
        else context.emit({
          farmTool: {
            action: context.event.type === 'place' && context.event.actionId === 'restore'
              ? 'restore'
              : 'use',
            at: targetTile,
          },
        });
      },
    });
    expect((registration!.handler as Handler)({
      type: 'place', actionId: 'restore', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'hoe' }, tile: { spaceId: '1', x: 4, y: 5 },
    }, snapshot())).toEqual({ effects: [
      { farmTool: { action: 'restore', at: { spaceId: '1', x: 4, y: 5 } } },
    ] });
  });
});
