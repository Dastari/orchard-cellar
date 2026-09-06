import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const dispatchSource = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../../client/src/overworld-main.ts', import.meta.url), 'utf8',
);
const bridgeUrl = new URL('../../../sim/src/behaviour/handlers/items.ts', import.meta.url);
const entityDispatchSource = readFileSync(new URL('./interact-entity.ts', import.meta.url), 'utf8');
const objectDefinitions = readFileSync(
  new URL('../../../assets/content/objects.json', import.meta.url), 'utf8',
);
const itemDefinitions = readFileSync(
  new URL('../../../assets/content/items.json', import.meta.url), 'utf8',
);

describe('authored portable-light authority', () => {
  it('resolves and validates the concrete active equipment row', () => {
    expect(worldSource).toContain('function equipmentBehaviourItem(');
    expect(worldSource).toContain("containerId: 'equipment'");
    expect(worldSource).toContain('activeEquipmentSlotAccepts(slot - EQUIPMENT_SLOT_OFFSET, row.itemKind)');
    expect(dispatchSource).toContain("request.verb === 'equipment_use'");
    expect(dispatchSource).toContain('equipmentItem: equipment.ref');
    expect(dispatchSource).toContain('authority.snapshot(ctx, undefined, equipment.snapshot)');
  });

  it('preflights both effects before atomically updating item and player light state', () => {
    expect(worldSource).toContain("if (effect.toggleState !== 'lit')");
    expect(worldSource).toContain('const row = equippedLifecycleLight();');
    expect(worldSource).toContain("contentRegistry(ctx).items.get(`item:${row.itemKind}`)");
    expect(worldSource).toContain('definition?.light === undefined');
    expect(worldSource).toContain("definition.equip?.slot !== 'off_hand'");
    expect(worldSource).toContain("throw new SenderError('equipment_light_required')");
    expect(worldSource).toContain('ctx.db.inventory_slot.id.update({ ...row, lit: !row.lit })');
    expect(worldSource).toContain('equippedKind: lightItem.itemKind');
    expect(worldSource).toContain('equippedLit: light.enabled');
  });

  it('resolves a ground entity as the item lifecycle subject and preserves the spatial target', () => {
    expect(worldSource).toContain("containerId: 'world'");
    expect(worldSource).toContain('snapshot: behaviourWorldItemSnapshot(ctx, item)');
    expect(entityDispatchSource).toContain("request.verb === 'use' && target.kind === 'world_item'");
    expect(entityDispatchSource).toContain("type: 'worldItemUse'");
    expect(entityDispatchSource).toContain('worldItem: target.item.ref');
  });

  it('gates prompt and dispatch on equipmentUse metadata and retires the global bridge', () => {
    expect(clientSource).toContain("selectedItemLifecycleAction(\n    liveItemContentDefinition(snapshot, selectedLight.itemKind),\n    'equipmentUse'");
    expect(clientSource).toContain("network.useSelected('equipment_use', { equipmentSlot: selectedLight.slot })");
    expect(clientSource).toContain("'worldItemUse'");
    expect(clientSource).toContain("network.interactEntity('world_item', groundLightItem.id, 'use')");
    expect(clientSource).not.toContain('groundLantern');
    expect(clientSource).not.toContain('selectedLantern');
    expect(existsSync(bridgeUrl), 'empty compiled item-handler bridge must stay retired').toBe(false);
    const lantern = (JSON.parse(objectDefinitions) as { id: string; components: { interactions?: unknown[] } }[])
      .find(({ id }) => id === 'object:lantern');
    expect(lantern?.components.interactions).toEqual([]);
  });

  it('makes both light items reachable through the same off-hand lifecycle lane', () => {
    const items = JSON.parse(itemDefinitions) as {
      readonly id: string;
      readonly maxStack: number;
      readonly tags: readonly string[];
      readonly equip?: { readonly slot: string };
      readonly light?: { readonly radiusTiles: number; readonly profile: string };
    }[];
    const lantern = items.find(({ id }) => id === 'item:lantern');
    const torch = items.find(({ id }) => id === 'item:torch');
    expect(lantern).toMatchObject({
      maxStack: 1, equip: { slot: 'off_hand' }, light: { radiusTiles: 4, profile: 'steady' },
    });
    expect(torch).toMatchObject({
      maxStack: 16, equip: { slot: 'off_hand' }, light: { radiusTiles: 3, profile: 'flicker' },
    });
    expect(torch?.tags).toEqual(expect.arrayContaining(['item.equipment', 'gear.off_hand', 'emits.light']));
    expect(clientSource).toContain("const itemLight = liveItemContentDefinition(snapshot, item.itemKind)?.light;");
    expect(clientSource).toContain("const equippedLight = equippedDefinition?.light;");
    expect(clientSource).toContain("equippedLight.profile === 'flicker'");
    expect(clientSource).not.toContain("item.itemKind === 'lantern'");
    expect(clientSource).not.toContain("equipped === 'lantern'");
    expect(clientSource).not.toContain("equipped === 'torch'");
  });
});
