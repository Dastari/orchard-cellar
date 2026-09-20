import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeConsumeCraftingRecipe, runtimeCraftingRecipeOutput,
  runtimeMatchingRecipeId, type Handler, type ReadOnlySnapshot } from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '../../lifecycle-authoring/generated/item-lifecycles.js';
import { selectedItemLifecycleAction, selectedItemLifecyclePrompt } from './selected-item-use.js';

const registry = bootstrapContentRegistry();
describe('press to compost to crop loop', () => {
  it('makes a station-free recipe from press byproduct and gathering fiber', () => {
    expect(registry.processes.get('process:press_apple')?.outputs).toContainEqual({ item: 'item:pomace', count: 1 });
    expect(registry.recipes.get('recipe:compost')).toMatchObject({
      inputs: [{ item: 'item:pomace', count: 4 }, { item: 'item:fiber', count: 1 }],
    });
    expect(registry.recipes.get('recipe:compost')?.stationRequirement).toBeUndefined();
    expect(registry.recipes.get('recipe:compost')?.unlockHint).toBeUndefined();
    const grid = { id: 'crafting', capacity: 4, slots: [
      { itemKind: 'pomace', quantity: 4 }, { itemKind: 'fiber', quantity: 1 }, null, null,
    ] };
    expect(runtimeMatchingRecipeId(registry, grid, grid.capacity, undefined, [])).toBe('compost');
    expect(runtimeCraftingRecipeOutput(registry, 'compost')).toEqual({ itemKind: 'compost', quantity: 1 });
    expect(runtimeConsumeCraftingRecipe(registry, grid, 'compost')).toMatchObject({ ok: true });
    expect(runtimeMatchingRecipeId(registry, { ...grid, slots: [{ itemKind: 'pomace', quantity: 3 }, { itemKind: 'fiber', quantity: 1 }, null, null] })).toBeNull();
  });

  it('advertises and emits the same atomic tile action through authored metadata', () => {
    const definition = registry.items.get('item:compost')!;
    expect(selectedItemLifecycleAction(definition, 'place')?.verb).toBe('place');
    expect(selectedItemLifecyclePrompt(definition, 'place')).toBe('[F] COMPOST CROP (+25% GROWTH, ONCE PER PLANTING)');
    const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(({ id }) => id === 'item:compost.on_use.place')!;
    const snapshot: ReadOnlySnapshot = {
      tick: 1n, registry: { engineVersion: 1, revision: 1n, contentHash: registry.contentHash, definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] }, calendar: { minuteOfDay: 600, season: 'spring' },
      actor: { entityType: 'player', id: 'player', tags: [], tile: { spaceId: '0', x: 1, y: 1, tags: [] },
        bronze: 0n, vitals: { hunger: 10_000, vigour: 10_000 }, inventory: [], worldRoles: [], homesteadRoles: {},
        questStates: {}, statistics: {}, skillRanks: {}, knownRecipeIds: [] },
      selectedItem: { kind: 'compost', definitionId: 'item:compost', instanceId: 'hotbar:0', tags: definition.tags, count: 1 },
      nearbyObjects: [],
    };
    expect((registration.handler as Handler)({ type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'compost' }, tile: { spaceId: '0', x: 1, y: 1 } }, snapshot)).toEqual({ effects: [
      { compostCrop: { spaceId: '0', x: 1, y: 1 } }, { consumeSelected: 1 }, { statistic: { kind: 'compost_applied' } },
    ] });
  });

  it('routes keyboard and pointer actions through selected place authority', () => {
    const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const keyboard = source.slice(source.indexOf('const cropTile = targetFarmTile();'), source.indexOf('const farmToolAction = selectedFarmToolAction(selectedUseDefinition);'));
    const pointer = source.slice(source.indexOf('const pointerCrop = targetCrop(latestSnapshot);'), source.indexOf('const restoringFarmTile ='));
    for (const lane of [keyboard, pointer]) {
      expect(lane).toContain("tags.includes('item.farming.compost')");
      expect(lane).toContain("network.useSelected('place'");
      expect(lane).toContain("'CROP COMPOSTED'");
    }
  });
});
