import { stepFishermanCycle } from '../../npc.js';
import type {
  DialogueContentDefinition,
  NpcContentDefinition,
} from '../../content/npc-definition.js';
import { blockedResult, effectsResult } from '../handler.js';
import {
  createHandlerRegistry,
  type AnyHandlerRegistration,
  type BehaviourHandlerRegistry,
} from '../registry.js';

function dialogueHandler(
  npc: NpcContentDefinition,
  dialogue: DialogueContentDefinition,
): AnyHandlerRegistration {
  return {
    id: `npc.dialogue.${npc.id}`,
    eventType: 'dialogueChoice',
    source: 'target',
    match: { kind: 'definition', definitionId: npc.id },
    priority: 100,
    handler: (event, view) => {
      const node = dialogue.nodes.find(({ id }) => id === event.nodeId);
      const choice = node?.choices.find(({ id }) => id === event.choiceId);
      if (node === undefined || choice === undefined) return blockedResult('dialogue_choice_not_found');
      if (choice.quest !== undefined) {
        const questId = choice.quest.quest.slice('quest:'.length);
        const actual = view.actor?.questStates[questId] ?? 'available';
        if (actual !== choice.quest.requires) return blockedResult('dialogue_choice_unavailable');
      }
      const next = choice.nextNodeId === null
        ? undefined
        : dialogue.nodes.find(({ id }) => id === choice.nextNodeId);
      return effectsResult([
        ...(choice.quest?.action === undefined ? [] : [{ questAction: {
          questId: choice.quest.quest.slice('quest:'.length),
          action: choice.quest.action,
        } } as const]),
        ...(next?.frameId === undefined ? [] : [{ openFrame: next.frameId }]),
      ]);
    },
  };
}

function mountHandler(npc: NpcContentDefinition): AnyHandlerRegistration {
  return {
    id: `npc.mount.${npc.id}`, eventType: 'use', source: 'target',
    match: { kind: 'definition', definitionId: npc.id }, priority: 100,
    handler: (_event, view) => {
      if (view.actor === undefined || view.target === undefined
        || !('entityType' in view.target) || view.target.entityType !== 'npc') return blockedResult('player_not_ready');
      if (view.actor.mountedEntityId !== undefined) {
        return view.actor.mountedEntityId === view.target.id
          ? effectsResult([{ dismount: true }]) : blockedResult('mounted_action_forbidden');
      }
      return effectsResult([{ mount: { npcId: view.target.id } }]);
    },
  };
}

function spawnHandler(npc: NpcContentDefinition): AnyHandlerRegistration {
  return {
    id: `npc.spawn.${npc.id}`,
    eventType: 'spawn',
    source: 'target',
    match: { kind: 'definition', definitionId: npc.id },
    priority: 100,
    handler: () => effectsResult([{ spawnNpc: {
      definitionId: npc.id,
      at: { spaceId: String(npc.home.spaceId), x: npc.home.tileX, y: npc.home.tileY },
    } }]),
  };
}

function fishermanTickHandler(npc: NpcContentDefinition): AnyHandlerRegistration {
  if (npc.ai.kind !== 'fishing_cycle') throw new Error(`npc fishing-cycle AI missing: ${npc.id}`);
  const ai = npc.ai;
  return {
    id: `npc.tick.${npc.id}`,
    eventType: 'tick',
    source: 'target',
    match: { kind: 'definition', definitionId: npc.id },
    priority: 100,
    handler: (_event, view) => {
      const state = view.target !== undefined && 'state' in view.target ? view.target.state : {};
      const step = stepFishermanCycle(
        ai,
        BigInt(npc.runtimeId),
        typeof state.activity === 'string' ? state.activity : 'idle',
        typeof state.nextDecisionTick === 'number' ? BigInt(state.nextDecisionTick) : view.tick,
        view.tick,
      );
      return effectsResult([
        { setState: { activity: step.activity, nextDecisionTick: Number(step.nextDecisionTick) } },
        { animation: step.activity },
        ...(step.speech === undefined ? [] : [{ say: step.speech }]),
      ]);
    },
  };
}

export function npcHandlerRegistrations(
  npcs: readonly NpcContentDefinition[],
  dialogues: ReadonlyMap<string, DialogueContentDefinition>,
): readonly AnyHandlerRegistration[] {
  return npcs.filter((npc) => npc.retired !== true).flatMap((npc) => {
    const dialogue = npc.dialogue === undefined ? undefined : dialogues.get(npc.dialogue);
    if (npc.dialogue !== undefined && dialogue === undefined) throw new Error(`npc dialogue missing: ${npc.dialogue}`);
    return [
      ...(npc.spawnPolicy === 'dynamic' ? [] : [spawnHandler(npc)]),
      ...(dialogue === undefined ? [] : [dialogueHandler(npc, dialogue)]),
      ...(npc.mount === undefined ? [] : [mountHandler(npc)]),
      ...(npc.ai.kind === 'fishing_cycle' ? [fishermanTickHandler(npc)] : []),
    ];
  });
}

export function registerNpcHandlers(
  npcs: readonly NpcContentDefinition[],
  dialogues: ReadonlyMap<string, DialogueContentDefinition>,
  registry: BehaviourHandlerRegistry = createHandlerRegistry(),
): BehaviourHandlerRegistry {
  const existing = new Set(registry.registrations.map(({ id }) => id));
  return createHandlerRegistry([
    ...registry.registrations,
    ...npcHandlerRegistrations(npcs, dialogues)
      .filter((registration) => existing.has(registration.id) === false),
  ]);
}
