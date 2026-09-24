import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bootstrapContentRows,
  buildContentRegistry,
  itemContainerContentResolver,
  moveItemStacks,
  quickMoveItemStack,
} from '@orchard/sim';
import {
  authoredFrameAction,
  placeableFrameDefinition,
  placeableFrameRestrictions,
} from './frame-runtime.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;

describe('world frame resolver', () => {
  it.each([
    ['barrel', 'frame:barrel'], ['furnace', 'frame:furnace'], ['cooking_fire', 'frame:cooking'],
    ['fruit_press', 'frame:press'], ['fermentation_cask', 'frame:fermentation'],
  ])('resolves an empty-definition %s row through its authored %s object', (kind, frameId) => {
    expect(placeableFrameDefinition(registry, { kind })?.id).toBe(frameId);
  });

  it('resolves a Stage A migrated generic chest through the authored chest object', () => {
    expect(placeableFrameDefinition(registry, {
      kind: 'chest',
      definitionId: 'object:chest',
    })?.id).toBe('frame:chest');
  });

  it('resolves the same process-derived furnace restrictions as the client', () => {
    expect(placeableFrameRestrictions(registry, { kind: 'furnace' })).toEqual({
      0: { acceptedKinds: ['clay', 'copper_ore', 'gold_ore', 'iron_ore', 'sand', 'silver_ore', 'tin_ore'] },
      1: { acceptedKinds: ['plank', 'wood'] },
      2: { readOnly: true },
    });
  });

  it.each(['wood', 'plank'])('admits and merges authored %s fuel through real frame custody', (itemKind) => {
    const containers = {
      backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind, quantity: 5, lit: true }] },
      placeable: {
        id: 'placeable', capacity: 3,
        slots: [null, { itemKind, quantity: 2, lit: true }, null],
        restrictions: placeableFrameRestrictions(registry, { kind: 'furnace' }),
      },
    };
    const content = itemContainerContentResolver(registry);
    const moved = moveItemStacks(containers, {
      fromContainer: 'backpack', fromIndex: 0,
      toContainer: 'placeable', toIndex: 1, quantity: 5,
    }, content);
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error(moved.code);
    expect(moved.containers.backpack?.slots).toEqual([null]);
    expect(moved.containers.placeable?.slots).toEqual([null, { itemKind, quantity: 7, lit: true }, null]);
    const quick = quickMoveItemStack(containers, {
      fromContainer: 'backpack', fromIndex: 0, toContainers: ['placeable'],
    }, content);
    expect(quick).toEqual({ ...moved, outcome: 'quick_move' });
    expect(containers.placeable.slots[1]?.quantity).toBe(2);
    expect(containers.backpack.slots[0]?.quantity).toBe(5);
  });

  it.each([
    ['furnace', 'iron_ore', 0],
    ['cooking_fire', 'raw_beef', 0],
    ['fruit_press', 'apple', 0],
    ['fermentation_cask', 'must', 0],
  ])('admits authored %s inputs without relaxing its output protection', (kind, itemKind, slot) => {
    const object = registry.objects.get(`object:${kind}`);
    const capacity = object?.components.container?.slotCount;
    if (capacity === undefined) throw new Error(`missing container fixture: ${kind}`);
    const containers = {
      backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind, quantity: 1, lit: true }] },
      placeable: {
        id: 'placeable', capacity, slots: Array.from({ length: capacity }, () => null),
        restrictions: placeableFrameRestrictions(registry, { kind }),
      },
    };
    const request = {
      fromContainer: 'backpack', fromIndex: 0,
      toContainer: 'placeable', toIndex: slot, quantity: 1,
    };
    const content = itemContainerContentResolver(registry);
    expect(moveItemStacks(containers, request, content).ok).toBe(true);
    expect(moveItemStacks(containers, { ...request, toIndex: capacity - 1 }, content))
      .toMatchObject({ ok: false, code: 'slot_rejects_item' });
  });

  it('rejects nonfuel insertion while preserving extraction of existing unsupported fuel', () => {
    const containers = {
      backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind: 'stone', quantity: 4, lit: true }] },
      placeable: {
        id: 'placeable', capacity: 3, slots: [null, null, null],
        restrictions: placeableFrameRestrictions(registry, { kind: 'furnace' }),
      },
    };
    const content = itemContainerContentResolver(registry);
    expect(moveItemStacks(containers, {
      fromContainer: 'backpack', fromIndex: 0,
      toContainer: 'placeable', toIndex: 1, quantity: 4,
    }, content)).toMatchObject({ ok: false, code: 'slot_rejects_item' });
    const recovered = moveItemStacks({
      backpack: { ...containers.backpack, slots: [null] },
      placeable: { ...containers.placeable, slots: [null, containers.backpack.slots[0]!, null] },
    }, {
      fromContainer: 'placeable', fromIndex: 1,
      toContainer: 'backpack', toIndex: 0, quantity: 4,
    }, content);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) throw new Error(recovered.code);
    expect(recovered.containers.backpack?.slots).toEqual(containers.backpack.slots);
    expect(recovered.containers.placeable?.slots).toEqual([null, null, null]);
  });

  it('fails open to an empty restriction record when a frame is unavailable', () => {
    expect(placeableFrameRestrictions(registry, { kind: 'sign' })).toEqual({});
  });

  it('resolves an arbitrary authored frame semantic without processor-kind branching', () => {
    const custom = {
      ...placeableFrameDefinition(registry, { kind: 'barrel' })!,
      id: 'frame:signal_bell' as const,
      title: 'SIGNAL BELL',
      buttons: [{ label: 'RING', interaction: 'ring_bell', tone: 'success' as const }],
    };
    expect(authoredFrameAction(custom, 'ring_bell')).toEqual({
      label: 'RING', interaction: 'ring_bell', tone: 'success',
    });
    expect(authoredFrameAction(custom, 'seal')).toBeNull();
  });

  it('resolves an arbitrary renamed object id without a kind compatibility table', () => {
    const definition = {
      id: 'object:signal_bell', kind: 'object', schemaVersion: 1, displayName: 'Signal Bell',
      components: { frame: { ref: 'frame:barrel' } },
    } as const;
    const custom = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: definition.id, kind: definition.kind, slug: 'signal_bell', json: definition },
    ]).registry;
    expect(placeableFrameDefinition(custom, {
      kind: 'totally_renamed', definitionId: definition.id,
    })?.id).toBe('frame:barrel');
  });

  it('enforces container restrictions even when an object has no frame', () => {
    const definition = {
      id: 'object:sealed_drawer', kind: 'object', schemaVersion: 1, displayName: 'Sealed Drawer',
      components: { container: {
        slotCount: 2, access: 'private', sortAllowed: false,
        restrictions: [{ slots: [1], readOnly: true }],
      } },
    } as const;
    const custom = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: definition.id, kind: definition.kind, slug: 'sealed_drawer', json: definition },
    ]).registry;
    expect(placeableFrameRestrictions(custom, {
      kind: 'renamed_drawer', definitionId: definition.id,
    })).toEqual({ 1: { readOnly: true } });
  });

  it('keeps the authority inventory snapshot on the shared frame resolver', () => {
    const authority = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(authority).toContain('placeableFrameRestrictions(contentRegistry(ctx), placeable)');
    expect(authority).not.toContain('Object.keys(SMELTING_RECIPES)');
    expect(authority).not.toContain('PRESSABLE_FRUIT_KINDS');
    expect(readFileSync(new URL('./frame-runtime.ts', import.meta.url), 'utf8'))
      .not.toContain('LEGACY_FRAME_CAPABILITIES');
  });
});
