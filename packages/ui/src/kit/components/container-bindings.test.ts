import { uiLabInventory } from '../lab/inventory-mock.js';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT, type FrameContentDefinition } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import { uiHotbar, uiPaperDoll } from './inventory.js';
import { uiContentFrame } from './content-frame.js';

it('keeps every enabled pack slot reachable when a short 3x frame wraps its hotbar', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:pack')!;
  const { controller } = uiLabInventory({ activate: vi.fn() });
  const root = new UiRoot({ scale: 3 }); root.resize(920, 430);
  root.mount(uiContentFrame({ definition, controller, aliases: { hotbar: 'hotbar', backpack: 'backpack', equipment: 'equipment' }, registry: { items: new Map(), processes: new Map() } }));
  root.arrange();
  const slots = root.entries().filter(({ element }) => element.kind === 'slot' && !element.disabled).map(({ element }) => element);
  expect(slots.length).toBeGreaterThan(HOTBAR_SLOT_COUNT);
  for (const slot of slots) {
    root.focus.set(slot, 'keyboard'); root.arrange(); expect(root.focus.current).toBe(slot);
    expect(slot.clip).toEqual(slot.rect);
  }
  root.dispose(); controller.dispose();
});

describe('canonical carried inventory bindings', () => {
  it('exposes every hotbar binding including zero by default', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(320,200); const hotbar = root.mount(uiHotbar({ container: 'hotbar' })); root.arrange();
    expect(hotbar.children).toHaveLength(HOTBAR_SLOT_COUNT);
    root.focus.set(hotbar.children[0]!, 'keyboard'); root.key({ key: '0' });
    expect(hotbar.props['selected']).toBe(9); root.dispose();
  });
  it('uses all canonical equipment positions with every current slot enabled', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(240,200); const doll = root.mount(uiPaperDoll({ container: 'equipment' })); root.arrange();
    expect(doll.children.map(node => node.props['binding'])).toEqual(EQUIPMENT_SLOTS.map(slot => ({ container: 'equipment', index: slot.index })));
    expect(doll.children.filter(node => !node.disabled).map(node => node.props['binding'])).toEqual(EQUIPMENT_SLOTS.map(slot => ({ container: 'equipment', index: slot.index })));
    const [a,b,,d] = doll.children;
    expect(b!.rect.x - a!.rect.x - a!.rect.width).toBe(2); expect(d!.rect.y - a!.rect.y - a!.rect.height).toBe(2); root.dispose();
  });
  it('uses the game equipment restrictions in the lab authority', () => {
    const { model, controller } = uiLabInventory({ activate: vi.fn() });
    controller.activate({ container: 'backpack', index: 5 });
    expect(model.cursor?.itemKind).toBe('watch');
    controller.activate({ container: 'equipment', index: 2 });
    expect(model.stack({ container: 'equipment', index: 2 })?.itemKind).toBe('watch');
    controller.activate({ container: 'hotbar', index: 2 });
    controller.activate({ container: 'equipment', index: 2 });
    expect(model.cursor?.itemKind).toBe('torch');
    controller.activate({ container: 'equipment', index: 5 });
    expect(model.stack({ container: 'equipment', index: 5 })?.itemKind).toBe('torch'); controller.dispose();
  });
  it.each([320,640,960])('binds the pack frame hotbar and paper doll at width %i', width => {
    const definitions = bootstrapContentDefinitions();
    const definition = definitions.find((entry): entry is FrameContentDefinition => entry.id === 'frame:pack')!;
    const root = new UiRoot({ scale: 1 }); root.resize(width,480);
    root.mount(uiContentFrame({ definition, aliases: { hotbar: 'hotbar', backpack: 'backpack', equipment: 'equipment' }, registry: { items: new Map(), processes: new Map() } })); root.arrange();
    const slots = root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element);
    const hotbar = slots.filter(node => (node.props['binding'] as { container: string }).container === 'hotbar');
    expect(hotbar).toHaveLength(HOTBAR_SLOT_COUNT);
    for (const slot of hotbar) expect(slot.rect).toEqual(slot.clip);
    const equipment = slots.filter(node => (node.props['binding'] as { container: string }).container === 'equipment');
    expect(equipment.map(node => node.props['binding'])).toEqual(EQUIPMENT_SLOTS.map(slot => ({container: 'equipment', index: slot.index}))); expect(equipment.filter(node => !node.disabled)).toHaveLength(EQUIPMENT_SLOTS.length); root.dispose();
  });
});

it('binds cooking batch progress to its state value independently of immediate processing', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:cooking')!;
  const root = new UiRoot({ scale: 1 }); root.resize(640,480);
  root.mount(uiContentFrame({ definition, aliases: { entity: 'placeable', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() },
    progress: .2, state: { processJobPending: true, processJobProgress: .8, processJobLabel: '7 × Soup' },
  })); root.arrange();
  expect(root.entries().find(entry => entry.element.kind === 'meter' && entry.element.label === 'BATCH PROGRESS')!.element.props['value']).toBe(.8);
  expect(root.entries().find(entry => entry.element.kind === 'meter' && entry.element.label === 'PROGRESS')!.element.props['value']).toBe(.2);
  expect(root.entries().some(entry => entry.element.kind === 'text' && entry.element.label === '7 × Soup')).toBe(true);
  root.dispose();
});


it('keeps filtered chest slots native-sized with equal compact gaps', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:chest')!;
  const { controller } = uiLabInventory({ activate: vi.fn() });
  const root = new UiRoot({ scale: 1 }); root.resize(640,400);
  root.mount(uiContentFrame({ definition, aliases: { entity: 'backpack', backpack: 'backpack', hotbar: 'hotbar' },
    registry: { items: new Map(), processes: new Map() }, controller,
    inventoryControls: { backpack: { filter: 'wood' } },
  })); root.arrange();
  const slots = root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element);
  expect(slots.filter(slot => (slot.props['binding'] as { container: string }).container === 'backpack').length).toBeGreaterThan(0);
  for (const slot of slots) expect({ width: slot.rect.width, height: slot.rect.height }).toEqual({ width: 28, height: 31 });
  root.dispose(); controller.dispose();
});
