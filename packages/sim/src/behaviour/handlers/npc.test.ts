import { describe, expect, it } from 'vitest';

import { bootstrapContentRows } from '../../content/bootstrap-registry.js';
import { buildContentRegistry } from '../../content/registry.js';
import type { DialogueContentDefinition, NpcContentDefinition } from '../../content/npc-definition.js';
import type { LifecycleEvent } from '../events.js';
import { raiseEvent } from '../raise.js';
import { createHandlerRegistry } from '../registry.js';
import { createReadOnlySnapshot } from '../snapshot.js';
import {
  npcHandlerRegistrations,
  registerNpcHandlers,
} from './npc.js';

const build = buildContentRegistry(bootstrapContentRows());
if (!build.report.valid) throw new Error(JSON.stringify(build.report.errors));
const { npcs, dialogues } = build.registry;
const tile = { spaceId: '0', x: 338, y: 359, tags: [] } as const;

function effects(event: LifecycleEvent, definitionId: string, questStates: Readonly<Record<string, string>> = {},
  activeDialogues: ReadonlyMap<string, DialogueContentDefinition> = dialogues) {
  const target = { entityType: 'npc' as const, id: definitionId, definitionId, tags: ['quest_giver'], tile, state: {} };
  const actor = { entityType: 'player' as const, id: 'player' };
  const view = createReadOnlySnapshot({
    tick: 100n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'npc', definitions: {} },
    space: { id: '0', kind: 'overworld', tags: [] }, calendar: { minuteOfDay: 720, season: 'spring' },
    actor: { ...actor, tags: [], tile, bronze: 0n, vitals: { hunger: 1, vigour: 1 }, inventory: [],
      worldRoles: [], homesteadRoles: {}, questStates, statistics: {}, skillRanks: {} },
    target, nearbyObjects: [],
  });
  const result = raiseEvent(registerNpcHandlers([...npcs.values()], activeDialogues), event, view);
  return 'blocked' in result ? result : result.effects;
}

describe('compiled NPC/dialogue/quest handlers', () => {
  it('registers authored NPC handlers idempotently alongside existing handlers', () => {
    const once = registerNpcHandlers([...npcs.values()], dialogues, createHandlerRegistry());
    const twice = registerNpcHandlers([...npcs.values()], dialogues, once);
    expect(twice.registrations.map(({ id }) => id).sort()).toEqual(once.registrations.map(({ id }) => id).sort());
    expect(once.registrations).toHaveLength(npcHandlerRegistrations([...npcs.values()], dialogues).length);
  });

  it('lets authored mount callbacks own arbitrary NPC ids without creating dynamic templates', () => {
    const boat: NpcContentDefinition = {
      ...npcs.get('npc:boat')!, id: 'npc:harbour_ferry', runtimeKind: 'ferry',
    };
    const handlers = registerNpcHandlers([boat], dialogues);
    expect(handlers.registrations.map(({ eventType }) => eventType)).toEqual(['use']);
    const actor = { entityType: 'player' as const, id: 'player' };
    const target = { entityType: 'npc' as const, id: '90001', definitionId: boat.id };
    const event = { type: 'use' as const, actor, target };
    const input = {
      tick: 100n,
      registry: { engineVersion: 1, revision: 10n, contentHash: 'mount', definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 720, season: 'spring' },
      actor: { ...actor, tags: [], tile, bronze: 0n, vitals: { hunger: 1, vigour: 1 },
        inventory: [], worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {} },
      target: { ...target, tags: [], tile, state: {} }, nearbyObjects: [],
    };
    expect(raiseEvent(handlers, event, createReadOnlySnapshot(input)))
      .toMatchObject({ effects: [{ mount: { npcId: '90001' } }] });
    expect(raiseEvent(handlers, event, createReadOnlySnapshot({
      ...input, actor: { ...input.actor, mountedEntityId: '90001' },
    }))).toMatchObject({ effects: [{ dismount: true }] });
    expect(raiseEvent(handlers, event, createReadOnlySnapshot({
      ...input, actor: { ...input.actor, mountedEntityId: '90002' },
    }))).toEqual({ blocked: 'mounted_action_forbidden' });
    expect(registerNpcHandlers([{ ...boat, retired: true }], dialogues).registrations).toHaveLength(0);
    const { mount, ...inert } = boat;
    expect(mount).toEqual({ adapter: 'boat', reachFixed: 8_192 });
    expect(registerNpcHandlers([inert], dialogues).registrations).toHaveLength(0);
  });

  it('matches §11 row 21 stable Marlow/Bob/Fin spawn effects', () => {
    for (const [definitionId, runtimeId, x, y] of [
      ['npc:marlow', '2', 338, 359], ['npc:farmer_bob', '3', 382, 378], ['npc:fisherman_fin', '7', 409, 317],
    ] as const) {
      expect(npcs.get(definitionId)).toMatchObject({ runtimeId, home: { tileX: x, tileY: y }, health: 100 });
      expect(effects({ type: 'spawn', subject: { entityType: 'npc', id: runtimeId, definitionId } }, definitionId))
        .toEqual([{ spawnNpc: { definitionId, at: { spaceId: '0', x, y } } }]);
    }
  });

  it('matches §11 row 22 shop-mode and row 23 quest-gating effects', () => {
    expect(effects({
      type: 'dialogueChoice', actor: { entityType: 'player', id: 'player' },
      npc: { entityType: 'npc', id: '2', definitionId: 'npc:marlow' }, nodeId: 'greeting', choiceId: 'offer',
    }, 'npc:marlow')).toEqual([{ openFrame: 'frame:shop' }]);
    expect(effects({
      type: 'dialogueChoice', actor: { entityType: 'player', id: 'player' },
      npc: { entityType: 'npc', id: '3', definitionId: 'npc:farmer_bob' }, nodeId: 'strawberry_request', choiceId: 'accept',
    }, 'npc:farmer_bob')).toEqual([{ questAction: { questId: 'farmer_bob_fast_strawberries', action: 'accept' } }]);
    expect(effects({
      type: 'dialogueChoice', actor: { entityType: 'player', id: 'player' },
      npc: { entityType: 'npc', id: '3', definitionId: 'npc:farmer_bob' }, nodeId: 'strawberry_request', choiceId: 'accept',
    }, 'npc:farmer_bob', { farmer_bob_fast_strawberries: 'active' }))
      .toEqual({ blocked: 'dialogue_choice_unavailable' });
  });

  it('opens the authored merchant frame and grants no frame from shop mode alone', () => {
    const npc = npcs.get('npc:marlow')!;
    const dialogue = dialogues.get(npc.dialogue!)!;
    const event = {
      type: 'dialogueChoice' as const, actor: { entityType: 'player' as const, id: 'player' },
      npc: { entityType: 'npc' as const, id: npc.runtimeId, definitionId: npc.id },
      nodeId: 'greeting', choiceId: 'offer',
    };
    const renamed = new Map(dialogues).set(dialogue.id, {
      ...dialogue, nodes: dialogue.nodes.map((node) => node.mode === 'shop'
        ? { ...node, frameId: 'frame:night_market' as const } : node),
    });
    expect(effects(event, npc.id, {}, renamed)).toEqual([{ openFrame: 'frame:night_market' }]);
    const inert = new Map(dialogues).set(dialogue.id, {
      ...dialogue, nodes: dialogue.nodes.map(({ id, speaker, body, mode, choices }) => (
        { id, speaker, body, mode, choices }
      )),
    });
    expect(effects(event, npc.id, {}, inert)).toEqual([]);
  });

  it('routes Fin coarse ticks through the extracted deterministic fishing cycle', () => {
    const target = { entityType: 'npc' as const, id: '7', definitionId: 'npc:fisherman_fin', tags: [], tile,
      state: { activity: 'fish_rest', nextDecisionTick: 100 } };
    const view = createReadOnlySnapshot({ tick: 100n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'npc', definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] }, calendar: { minuteOfDay: 0, season: 'spring' },
      target, nearbyObjects: [] });
    const result = raiseEvent(registerNpcHandlers([...npcs.values()], dialogues), {
      type: 'tick', subject: { entityType: 'npc', id: '7', definitionId: 'npc:fisherman_fin' },
    }, view);
    expect(result).toEqual({ effects: [
      { setState: { activity: 'fish_cast', nextDecisionTick: 120 } },
      { animation: 'fish_cast' },
    ] });
  });

  it('registers spawn and fishing-cycle ticks for an arbitrary authored definition', () => {
    const source = npcs.get('npc:fisherman_fin')!;
    if (source.ai.kind !== 'fishing_cycle') throw new Error('authored fishing fixture missing');
    const definition: NpcContentDefinition = {
      ...source,
      id: 'npc:harbour_keeper',
      runtimeId: '99',
      displayName: 'Harbour Keeper',
      home: { spaceId: 12, tileX: -7, tileY: 21 },
      facing: 'left',
      ai: { ...source.ai, castTicks: 37 },
    };
    const registry = registerNpcHandlers([definition], dialogues);
    const target = {
      entityType: 'npc' as const,
      id: '99',
      definitionId: definition.id,
      tags: [],
      tile: { spaceId: '12', x: -7, y: 21, tags: [] },
      state: { activity: 'fish_rest', nextDecisionTick: 100 },
    };
    const view = createReadOnlySnapshot({
      tick: 100n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'custom-npc', definitions: {} },
      space: { id: '12', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      target,
      nearbyObjects: [],
    });
    expect(raiseEvent(registry, {
      type: 'spawn',
      subject: { entityType: 'npc', id: '99', definitionId: definition.id },
    }, view)).toEqual({ effects: [{
      spawnNpc: { definitionId: definition.id, at: { spaceId: '12', x: -7, y: 21 } },
    }] });
    expect(raiseEvent(registry, {
      type: 'tick',
      subject: { entityType: 'npc', id: '99', definitionId: definition.id },
    }, view)).toEqual({ effects: [
      { setState: { activity: 'fish_cast', nextDecisionTick: 137 } },
      { animation: 'fish_cast' },
    ] });
  });
});
