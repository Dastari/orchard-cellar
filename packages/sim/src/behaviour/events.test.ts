import { describe, expect, it } from 'vitest';
import {
  DATA_GRAPH_EVENT_TYPES,
  LIFECYCLE_EVENT_TYPES,
  interactionVerbForEventType,
  isLifecycleEventType,
  type LifecycleEvent,
} from './events.js';

describe('behaviour lifecycle event contract', () => {
  it('keeps the Tier-B event set fixed and duplicate-free', () => {
    expect(LIFECYCLE_EVENT_TYPES).toHaveLength(23);
    expect(new Set(LIFECYCLE_EVENT_TYPES).size).toBe(LIFECYCLE_EVENT_TYPES.length);
    expect(LIFECYCLE_EVENT_TYPES).toEqual([
      'use', 'frameAction', 'secondary', 'equipmentUse', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place', 'pickup', 'break', 'slotChanged',
      'processComplete', 'timer', 'walkOnto', 'enterSpace', 'leaveSpace', 'spawn',
      'despawn', 'tick', 'dialogueChoice', 'questState', 'statistic',
    ]);
  });

  it('maps only authored graph events to their persisted verbs', () => {
    expect(DATA_GRAPH_EVENT_TYPES.map((type) => interactionVerbForEventType(type))).toEqual([
      'use', 'secondary', 'use_with', 'place', 'walk_onto', 'tick', 'break', 'timer',
    ]);
    expect(interactionVerbForEventType('slotChanged')).toBeNull();
    expect(interactionVerbForEventType('dialogueChoice')).toBeNull();
  });

  it('recognises event names without accepting arbitrary strings', () => {
    expect(isLifecycleEventType('processComplete')).toBe(true);
    expect(isLifecycleEventType('use_with')).toBe(false);
    expect(isLifecycleEventType(1)).toBe(false);
  });

  it('provides typed payloads for every event family', () => {
    const actor = { entityType: 'player', id: 'player:1' } as const;
    const object = { entityType: 'object', id: 'object:1', definitionId: 'object:chest' } as const;
    const npc = { entityType: 'npc', id: 'npc:1', definitionId: 'npc:fin' } as const;
    const item = { kind: 'axe', containerId: 'hands', slot: 0 } as const;
    const tile = { spaceId: 'space:homestead', x: 4, y: 7 } as const;
    const events = [
      { type: 'use', actor, target: object },
      { type: 'frameAction', actor, frameId: 'frame:custom', actionId: 'collect', target: object },
      { type: 'secondary', actor, selectedItem: item, target: tile },
      { type: 'equipmentUse', actor, equipmentItem: item, equipmentSlot: 35 },
      { type: 'worldItemUse', actor, worldItem: item, target: object },
      { type: 'useWith', actor, selectedItem: item, target: object },
      {
        type: 'useAt', actor, selectedItem: item, tile,
        actionId: 'cast', targetId: '42',
      },
      { type: 'aimedUse', actor, selectedItem: item, phase: 'fire', aimX: 12, aimY: -4, chargeMs: 500 },
      { type: 'place', actor, tile, subject: item },
      { type: 'pickup', actor, tile, subject: object },
      { type: 'break', actor, object, tool: item },
      { type: 'slotChanged', container: { id: 'container:1' }, slot: 0, before: null, after: item },
      { type: 'processComplete', object, unitsSettled: 2 },
      { type: 'timer', object, timerId: 'soil-decay' },
      { type: 'walkOnto', actor, tile },
      { type: 'enterSpace', actor, space: { id: 'space:cellar', kind: 'interior' } },
      { type: 'leaveSpace', actor, space: { id: 'space:homestead', kind: 'homestead' } },
      { type: 'spawn', subject: npc },
      { type: 'despawn', subject: object },
      { type: 'tick', subject: npc },
      { type: 'dialogueChoice', actor, npc, nodeId: 'hello', choiceId: 'shop' },
      { type: 'questState', actor, questId: 'quest:first', from: 'available', to: 'active' },
      { type: 'statistic', actor, kind: 'items_crafted', subject: 'chest', delta: 1n },
    ] as const satisfies readonly LifecycleEvent[];

    expect(events.map((event) => event.type)).toEqual(LIFECYCLE_EVENT_TYPES);
  });
});
