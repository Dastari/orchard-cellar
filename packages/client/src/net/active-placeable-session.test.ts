import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeChestObjectDefinition } from '@orchard/sim';
import type { WorldPlaceable, WorldPlaceableSlot } from '@orchard/world-bindings/types';
import { ActivePlaceableSession } from './active-placeable-session.js';
import { KeyedStore } from './keyed-store.js';

const registry = bootstrapContentRegistry();

function placeable(id: bigint, definitionId: string): WorldPlaceable {
  return { id, kind: definitionId.slice('object:'.length), definitionId, tileX: 60, tileY: 76, chunkX: 3, chunkY: 4,
    spaceId: 10_000, open: true, lit: false, facing: 'down', stateJson: '{}' } as unknown as WorldPlaceable;
}
function slot(placeableId: bigint, index: number, itemKind = 'empty'): WorldPlaceableSlot {
  return { id: `${placeableId}:${index}`, placeableId, slot: index, itemKind, quantity: itemKind === 'empty' ? 0 : 3, durability: 0, lit: true };
}
function session() {
  const slots = new KeyedStore<number, WorldPlaceableSlot>();
  const chestSlots = new KeyedStore<number, { chestId: bigint; slot: number; itemKind: string }>();
  const value = new ActivePlaceableSession(slots, chestSlots, {
    isChest: row => runtimeChestObjectDefinition(registry, row) !== null,
    toChest: row => ({ id: row.id }),
    toChestSlot: row => ({ chestId: row.placeableId, slot: row.slot, itemKind: row.itemKind }),
  });
  return { value, slots, chestSlots };
}

const workbench = placeable(8n, 'object:workbench');
const chestA = placeable(7n, 'object:chest');
const chestB = placeable(6n, 'object:chest');
const slotsOf = (id: bigint, item: string) => Array.from({ length: 16 }, (_, index) => slot(id, index, index === 0 ? item : 'empty'));

type Event = readonly [string, () => void];
/** Every order of the events one transaction can deliver (the SDK doesn't promise one). */
function orders(events: readonly Event[]): Event[][] {
  if (events.length <= 1) return [[...events]];
  return events.flatMap((event, index) => orders(events.filter((_, other) => other !== index)).map(rest => [event, ...rest]));
}

describe('active placeable session (BUG-058)', () => {
  it('keeps the chest session that replaces a workbench session, whatever order the view reports it in', () => {
    for (const insertFirst of [true, false]) {
      const { value, chestSlots } = session();
      value.setActive(workbench);
      const insert = () => { value.setActive(chestA); for (const row of slotsOf(7n, 'apple')) value.setSlot(row); };
      if (insertFirst) { insert(); value.deleteActive(workbench); } else { value.deleteActive(workbench); insert(); }
      expect(value.active?.id, `insert first: ${insertFirst}`).toBe(7n);
      expect(value.activeChest).toEqual({ id: 7n });
      expect(chestSlots.get(0)).toEqual({ chestId: 7n, slot: 0, itemKind: 'apple' });
      expect(chestSlots.size).toBe(16);
    }
  });

  it('switches from one chest to another with only the new chest\'s slots, in every event order', () => {
    const scenario = (s: ReturnType<typeof session>): Event[] => [
      ['insert B', () => s.value.setActive(chestB)],
      ['delete A', () => s.value.deleteActive(chestA)],
      ['B slots', () => { for (const row of slotsOf(6n, 'wood')) s.value.setSlot(row); }],
      ['A slots removed', () => { for (const row of slotsOf(7n, 'apple')) s.value.deleteSlot(row); }],
    ];
    const names = scenario(session()).map(([name]) => name);
    for (const order of orders(names.map(name => [name, () => {}] as const))) {
      const s = session();
      s.value.setActive(chestA); for (const row of slotsOf(7n, 'apple')) s.value.setSlot(row);
      const steps = new Map(scenario(s));
      for (const [name] of order) steps.get(name)!();
      const label = order.map(([name]) => name).join(' → ');
      expect(s.value.active?.id, label).toBe(6n);
      expect(s.value.activeChest, label).toEqual({ id: 6n });
      expect([...s.slots].every(row => row.placeableId === 6n), label).toBe(true);
      expect(s.slots.size, label).toBe(16);
      expect(s.chestSlots.size, label).toBe(16);
      expect(s.chestSlots.get(0), label).toEqual({ chestId: 6n, slot: 0, itemKind: 'wood' });
    }
  });

  it('ends the session when the current row is removed, and ignores a stale removal after a close', () => {
    const { value, slots, chestSlots } = session();
    value.setActive(chestA); for (const row of slotsOf(7n, 'apple')) value.setSlot(row);
    value.deleteActive(chestA);
    expect(value.active).toBeNull(); expect(value.activeChest).toBeNull();
    expect(slots.size).toBe(0); expect(chestSlots.size).toBe(0);
    value.deleteActive(chestB);
    expect(value.active).toBeNull();
  });

  it('keeps a non-chest session out of the chest copies and hydrates from a snapshot', () => {
    const { value, chestSlots } = session();
    value.setActive(workbench);
    value.setSlot(slot(8n, 0, 'plank'));
    expect(value.activeChest).toBeNull(); expect(chestSlots.size).toBe(0);
    value.hydrate(chestB, [...slotsOf(6n, 'wood'), slot(7n, 3, 'apple')]);
    expect(value.active?.id).toBe(6n);
    expect(chestSlots.size).toBe(16);
    expect(chestSlots.get(0)).toEqual({ chestId: 6n, slot: 0, itemKind: 'wood' });
    value.hydrate(null, []);
    expect(value.active).toBeNull(); expect(chestSlots.size).toBe(0);
  });

  it('is what the connection uses for the active placeable views', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    expect(source).toContain('connection.db.ownActivePlaceable.onDelete((context, row) => incoming(context.event.id, () => this.placeableSession.deleteActive(row)));');
    expect(source).toContain('connection.db.ownOpenPlaceableSlots.onDelete((context, row) => incoming(context.event.id, () => this.placeableSession.deleteSlot(row)));');
    expect(source).not.toMatch(/ownActivePlaceable\.onDelete\(\(context\) =>/);
  });
});
