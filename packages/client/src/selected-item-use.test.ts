import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, type ItemContentDefinition } from '@orchard/sim';
import {
  selectedLightEquipRequest,
  selectedCellarToolAction,
  selectedContextualWorldToolAction,
  selectedFarmToolAction,
  selectedFishingToolAction,
  selectedItemLifecycleAction,
  selectedItemLifecyclePrompt,
  selectedItemUseAction,
  selectedItemUsePrompt,
  selectedWoodcuttingUseWithAction,
  swingKeyIntent,
} from './selected-item-use.js';

function item(onUse: ItemContentDefinition['onUse']): ItemContentDefinition {
  return {
    id: 'item:field_notes',
    kind: 'item',
    schemaVersion: 1,
    displayName: 'Field Notes',
    icon: { asset: 'item_field_notes' },
    quality: 'common',
    maxStack: 1,
    tags: ['item.document'],
    economy: { buy: null, sell: 0 },
    onUse,
  };
}

describe('selected item use lifecycle', () => {
  it('routes selected lanterns and torches into the off-hand equipment slot', () => {
    const registry = bootstrapContentRegistry();
    for (const kind of ['lantern', 'torch']) expect(selectedLightEquipRequest(registry.items.get(`item:${kind}`), 5))
      .toEqual({ fromContainer: 'hotbar', fromIndex: 5, toContainer: 'equipment', toIndex: 5, quantity: 1 });
    expect(selectedLightEquipRequest(registry.items.get('item:axe'), 5)).toBeNull();
    expect(selectedLightEquipRequest(registry.items.get('item:lantern'), 35)).toBeNull();
  });
  it('advertises direct use for authored foods and tea but not deliberately inedible food tags', () => {
    const items = bootstrapContentRegistry().items;

    expect(selectedItemUsePrompt(items.get('item:apple')!)).toBe('[F] EAT APPLE');
    expect(selectedItemUsePrompt(items.get('item:cooked_beef')!)).toBe('[F] EAT COOKED BEEF');
    expect(selectedItemUsePrompt(items.get('item:orchard_tea')!)).toBe('[F] DRINK ORCHARD TEA');
    expect(selectedItemUsePrompt(items.get('item:raw_beef')!)).toBeNull();
    expect(selectedItemUsePrompt(items.get('item:preserved_apple')!)).toBeNull();
  });

  it('uses generated code metadata without shipping callback source to the client', () => {
    const apple = { ...item([]), id: 'item:apple' as const, displayName: 'Apple' };
    expect(selectedItemUseAction(apple)?.id).toBe('item:apple.on_use');
    expect(selectedItemUsePrompt(apple)).toBe('[F] EAT APPLE');
  });

  it('uses authored onUse presence as the direct-use capability', () => {
    const definition = item([{
      id: 'read',
      verb: 'secondary',
      prompt: 'Read field notes',
      conditions: [],
      effects: [{ learnRecipes: ['recipe:wooden_pickaxe'] }],
    }]);
    expect(selectedItemUseAction(definition)?.id).toBe('read');
    expect(selectedItemUsePrompt(definition)).toBe('[F] READ FIELD NOTES');
  });

  it('leaves an inert item without code metadata or content onUse unusable', () => {
    const inert = item([]);
    expect(selectedItemUseAction(inert)).toBeNull();
    expect(selectedItemUsePrompt(inert)).toBeNull();
  });

  it('keeps the input key outside authored content', () => {
    const definition = item([{
      id: 'drink',
      verb: 'secondary',
      prompt: 'Drink',
      conditions: [],
      effects: [{ consumeSelected: 1 }],
    }]);
    expect(selectedItemUsePrompt(definition, 'x')).toBe('[X] DRINK');
  });

  it('resolves higher priority before stable handler id and falls back to USE', () => {
    const definition = item([
      { id: 'z-low', verb: 'secondary', prompt: 'Low', priority: 1, conditions: [], effects: [{ consumeSelected: 1 }] },
      { id: 'z-high', verb: 'secondary', priority: 5, conditions: [], effects: [{ consumeSelected: 1 }] },
      { id: 'a-high', verb: 'secondary', priority: 5, conditions: [], effects: [{ consumeSelected: 1 }] },
    ]);
    expect(selectedItemUseAction(definition)?.id).toBe('a-high');
    expect(selectedItemUsePrompt(definition)).toBe('[F] USE FIELD NOTES');
  });

  it('ignores lifecycle entries that are not direct secondary use', () => {
    const definition = item([{
      id: 'place', verb: 'place', prompt: 'Place', conditions: [], effects: [{ consumeSelected: 1 }],
    }, {
      id: 'repair', verb: 'use_with', prompt: 'Repair', conditions: [], effects: [{ damageSelected: 1 }],
    }]);
    expect(selectedItemUseAction(definition)).toBeNull();
    expect(selectedItemLifecycleAction(definition, 'place')?.id).toBe('place');
    expect(selectedItemLifecycleAction(definition, 'useWith')?.id).toBe('repair');
    expect(selectedItemLifecycleAction(definition, 'useAt')).toBeNull();
    expect(selectedItemLifecycleAction(definition, 'equipmentUse')).toBeNull();
    expect(selectedItemLifecycleAction(definition, 'worldItemUse')).toBeNull();
    expect(selectedItemLifecyclePrompt(definition, 'place')).toBe('[F] PLACE');
    expect(selectedItemLifecyclePrompt(definition, 'useWith')).toBe('[F] REPAIR');
  });

  it('advertises generated placement and repair capability from code-free metadata', () => {
    const registry = bootstrapContentRegistry();
    expect(selectedItemLifecyclePrompt(registry.items.get('item:workbench'), 'place'))
      .toBe('[F] PLACE WORKBENCH');
    expect(selectedItemLifecyclePrompt(registry.items.get('item:axe'), 'useWith'))
      .toBe('[F] REPAIR WOODEN AXE (5 COPPER)');
    expect(selectedItemLifecyclePrompt(registry.items.get('item:copper_axe'), 'useWith'))
      .toBe('[F] REPAIR COPPER AXE (5 COPPER)');
    expect(selectedItemLifecyclePrompt(registry.items.get('item:sword'), 'secondary'))
      .toBe('[F] USE SWORD');
    expect(selectedItemLifecyclePrompt(registry.items.get('item:sword'), 'useWith'))
      .toBe('[F] REPAIR IRON SWORD (5 COPPER)');
    expect(selectedItemLifecycleAction(registry.items.get('item:lantern'), 'equipmentUse'))
      .toMatchObject({
        id: 'item:lantern.equipment_use', verb: 'equipment_use', prompt: 'TOGGLE LANTERN',
      });
    expect(selectedItemLifecycleAction(registry.items.get('item:lantern'), 'worldItemUse'))
      .toMatchObject({
        id: 'item:lantern.equipment_use', verb: 'world_item_use', prompt: 'TOGGLE LANTERN',
      });
    expect(selectedItemLifecycleAction(registry.items.get('item:torch'), 'equipmentUse'))
      .toMatchObject({
        id: 'item:torch.equipment_use', verb: 'equipment_use', prompt: 'TOGGLE TORCH',
      });
    expect(selectedItemLifecycleAction(registry.items.get('item:torch'), 'worldItemUse'))
      .toMatchObject({
        id: 'item:torch.equipment_use', verb: 'world_item_use', prompt: 'TOGGLE TORCH',
      });
    expect(selectedItemLifecycleAction(registry.items.get('item:raw_beef'), 'place')).toBeNull();
  });

  it('gates chest dismantling by authored useWith ownership and woodcutting specialization', () => {
    const items = bootstrapContentRegistry().items;
    expect(selectedWoodcuttingUseWithAction(items.get('item:axe'))).toMatchObject({
      id: 'item:axe.world_tool', verb: 'use_with',
    });
    expect(selectedWoodcuttingUseWithAction(items.get('item:pickaxe'))).toBeNull();
    expect(selectedWoodcuttingUseWithAction(items.get('item:hammer'))).toBeNull();
  });

  it('derives tile and world tool roles from live content plus lifecycle capability, not item kind', () => {
    const items = bootstrapContentRegistry().items;
    const hoe = items.get('item:hoe')!;
    const can = items.get('item:watering_can')!;
    const rod = items.get('item:fishing_rod')!;
    const pickaxe = items.get('item:pickaxe')!;

    expect(selectedFarmToolAction(hoe)).toMatchObject({ mode: 'cultivate', restoreActionId: 'restore' });
    expect(selectedFarmToolAction(can)).toMatchObject({ mode: 'water', restoreActionId: null });
    expect(selectedFishingToolAction(rod)).toMatchObject({ castActionId: 'cast', reelActionId: 'reel' });
    expect(selectedCellarToolAction(pickaxe)).toMatchObject({ actionId: 'dig_cellar' });
    expect(selectedContextualWorldToolAction(pickaxe)).toMatchObject({ verb: 'use_with' });
  });

  it('supports renamed authored tools and rejects inert or role-spoofing lookalikes', () => {
    const items = bootstrapContentRegistry().items;
    const hoe = items.get('item:hoe')!;
    const rod = items.get('item:fishing_rod')!;
    const pickaxe = items.get('item:pickaxe')!;
    const place = selectedItemLifecycleAction(hoe, 'place')!;
    const useAtFishing = selectedItemLifecycleAction(rod, 'useAt')!;
    const useAtMining = selectedItemLifecycleAction(pickaxe, 'useAt')!;
    const secondary = selectedItemLifecycleAction(pickaxe, 'secondary')!;
    const useWith = selectedItemLifecycleAction(pickaxe, 'useWith')!;
    const renamedHoe = { ...hoe, id: 'item:orchard_cultivator' as const, displayName: 'Orchard Cultivator' };
    const renamedRod = { ...rod, id: 'item:river_wand' as const, displayName: 'River Wand' };
    const renamedPickaxe = { ...pickaxe, id: 'item:cellar_mattock' as const, displayName: 'Cellar Mattock' };

    expect(selectedFarmToolAction(renamedHoe, place)?.mode).toBe('cultivate');
    expect(selectedFishingToolAction(renamedRod, useAtFishing)?.castActionId).toBe('cast');
    expect(selectedCellarToolAction(renamedPickaxe, useAtMining)?.actionId).toBe('dig_cellar');
    expect(selectedContextualWorldToolAction(renamedPickaxe, secondary, useWith)).not.toBeNull();

    expect(selectedFarmToolAction({ ...renamedHoe, tags: ['item.tool'] }, place)).toBeNull();
    expect(selectedFarmToolAction({ ...renamedHoe, tool: { ...renamedHoe.tool!, specialization: 'mining' } }, place)).toBeNull();
    expect(selectedFarmToolAction(renamedHoe, null)).toBeNull();
    expect(selectedFishingToolAction({ ...renamedRod, tool: { ...renamedRod.tool!, specialization: 'farming' } }, useAtFishing)).toBeNull();
    expect(selectedFishingToolAction(renamedRod, null)).toBeNull();
    expect(selectedCellarToolAction({ ...renamedPickaxe, tool: { ...renamedPickaxe.tool!, specialization: 'woodcutting' } }, useAtMining)).toBeNull();
    expect(selectedContextualWorldToolAction(renamedPickaxe, secondary, null)).toBeNull();
  });

  it('keeps the explicit cellar strike ahead of a swing that cannot dig terrain', () => {
    const wall = { hasAuthoredSwing: true, resourceTargeted: false, cellarWallInReach: true, cellarToolReady: true };
    expect(swingKeyIntent(wall)).toBe('dig_cellar');
    // A resource in front still belongs to the swing, which contacts the whole arc.
    expect(swingKeyIntent({ ...wall, resourceTargeted: true })).toBe('swing');
    expect(swingKeyIntent({ ...wall, cellarWallInReach: false })).toBe('swing');
    // Mounted, broken or non-mining tools cannot dig, so they swing instead.
    expect(swingKeyIntent({ ...wall, cellarToolReady: false })).toBe('swing');
    // Tools without an authored swing keep the original contextual world-tool path.
    expect(swingKeyIntent({ ...wall, hasAuthoredSwing: false })).toBe('contextual');
    expect(swingKeyIntent({ ...wall, hasAuthoredSwing: false, cellarWallInReach: false })).toBe('contextual');
  });

  it('exposes seed planting as an authored place lifecycle without stealing direct F use', () => {
    const carrotSeeds = bootstrapContentRegistry().items.get('item:carrot_seeds')!;
    expect(selectedItemLifecycleAction(carrotSeeds, 'place')).toMatchObject({
      id: 'item.carrot-seeds.on-use',
      verb: 'place',
      prompt: 'PLANT SEEDS',
    });
    expect(selectedItemUseAction(carrotSeeds)).toBeNull();
  });
});
