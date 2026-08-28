import { describe, expect, it } from 'vitest';
import type { ContainerSnapshot } from '@orchard/sim';
import { UiInventoryInteractionModel, uiInventorySelectorRect } from './inventory.js';

function fixtures(): Readonly<Record<string, ContainerSnapshot>> {
  return {
    bag: {
      id: 'bag', capacity: 4,
      slots: [
        { itemKind: 'wood', quantity: 9 },
        { itemKind: 'ring', quantity: 1 },
        { itemKind: 'apple', quantity: 7 },
        null,
      ],
    },
    chest: { id: 'chest', capacity: 4, slots: [null, null, { itemKind: 'wood', quantity: 98 }, null] },
    equipment: {
      id: 'equipment', capacity: 2, slots: [null, null],
      restrictions: { 0: { requiredTags: ['gear.head'] }, 1: { requiredTags: ['gear.ring'] } },
    },
  };
}

describe('design-system inventory interaction model', () => {
  it('places the visible selector corners outside a standard inventory slot', () => {
    expect(uiInventorySelectorRect({ x: 40, y: 50, width: 28, height: 31 }))
      .toEqual({ x: 22, y: 34, width: 63, height: 63 });
  });

  it('picks up whole and half stacks with Minecraft pointer rules', () => {
    const left = new UiInventoryInteractionModel(fixtures());
    expect(left.pointerDown({ container: 'bag', index: 0 }, 0).status).toBe('PICKUP 9');
    expect(left.cursor).toEqual({ itemKind: 'wood', quantity: 9 });
    expect(left.stack({ container: 'bag', index: 0 })).toBeNull();

    const right = new UiInventoryInteractionModel(fixtures());
    expect(right.pointerDown({ container: 'bag', index: 0 }, 2).status).toBe('PICKUP 5');
    expect(right.cursor?.quantity).toBe(5);
    expect(right.stack({ container: 'bag', index: 0 })?.quantity).toBe(4);
  });

  it('previews and commits even and one-each drag distribution', () => {
    const even = new UiInventoryInteractionModel(fixtures());
    even.pointerDown({ container: 'bag', index: 0 }, 0);
    even.pointerDown({ container: 'chest', index: 0 }, 0);
    even.pointerEnter({ container: 'chest', index: 1 });
    expect(even.stack({ container: 'chest', index: 0 })?.quantity).toBe(4);
    expect(even.displayedCursor()?.quantity).toBe(1);
    expect(even.pointerUp().status).toBe('QUICK_CRAFT 8');
    expect(even.stack({ container: 'chest', index: 1 })?.quantity).toBe(4);

    const oneEach = new UiInventoryInteractionModel(fixtures());
    oneEach.pointerDown({ container: 'bag', index: 2 }, 0);
    oneEach.pointerDown({ container: 'chest', index: 0 }, 2);
    oneEach.pointerEnter({ container: 'chest', index: 1 });
    oneEach.pointerEnter({ container: 'chest', index: 3 });
    expect(oneEach.pointerUp().status).toBe('QUICK_CRAFT 3');
    expect(oneEach.cursor?.quantity).toBe(4);
  });

  it('preserves a cursor stack when an equipment restriction rejects it', () => {
    const model = new UiInventoryInteractionModel(fixtures());
    model.pointerDown({ container: 'bag', index: 1 }, 0);
    model.pointerDown({ container: 'equipment', index: 0 }, 0);
    expect(model.pointerUp().status).toBe('SLOT REJECTS ITEM');
    expect(model.cursor).toEqual({ itemKind: 'ring', quantity: 1 });
    expect(model.stack({ container: 'equipment', index: 0 })).toBeNull();
    expect(model.canAccept({ container: 'equipment', index: 1 })).toBe(true);
  });

  it('shift-moves through the same shared merge-before-empty authority', () => {
    const model = new UiInventoryInteractionModel(fixtures(), null, { bag: ['chest'] });
    expect(model.pointerDown({ container: 'bag', index: 0 }, 0, { shift: true }).status).toBe('QUICK_MOVE 9');
    expect(model.stack({ container: 'chest', index: 2 })?.quantity).toBe(99);
    expect(model.stack({ container: 'chest', index: 0 })?.quantity).toBe(8);
  });
});
