import { describe, expect, it } from 'vitest';

import { DIALOGUE_DEFINITIONS } from '../dialogue.js';
import { QUEST_DEFINITIONS } from '../quests.js';
import {
  parseDialogueDefinition,
  parseNpcDefinition,
  parseQuestDefinition,
} from './npc-definition.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { validateContentDefinitions } from './validate.js';

describe('NPC/dialogue/quest content definitions', () => {
  const definitionsOfKind = <K extends 'npc' | 'dialogue' | 'quest'>(kind: K) => (
    bootstrapContentDefinitions().filter(
      (definition): definition is Extract<ReturnType<typeof bootstrapContentDefinitions>[number], { kind: K }> => definition.kind === kind,
    )
  );
  const bootstrapNpcDefinitions = () => [...definitionsOfKind('npc')]
    .sort((left, right) => Number(left.runtimeId) - Number(right.runtimeId));
  const bootstrapDialogueDefinitions = () => definitionsOfKind('dialogue');
  const bootstrapQuestDefinitions = () => definitionsOfKind('quest');

  it('round-trips every bootstrap definition through its versioned parser', () => {
    for (const definition of bootstrapNpcDefinitions()) expect(parseNpcDefinition(JSON.stringify(definition))).toEqual(definition);
    for (const definition of bootstrapDialogueDefinitions()) expect(parseDialogueDefinition(JSON.stringify(definition))).toEqual(definition);
    for (const definition of bootstrapQuestDefinitions()) expect(parseQuestDefinition(JSON.stringify(definition))).toEqual(definition);
  });

  it('validates merchant frame references by authored surface, including renamed frames', () => {
    const all = bootstrapContentDefinitions();
    const dialogue = bootstrapDialogueDefinitions().find((entry) => entry.nodes.some((node) => node.mode === 'shop'))!;
    const frame = all.find((entry) => entry.kind === 'frame' && entry.presentation?.surface === 'merchant')!;
    const authored = parseDialogueDefinition({
      ...dialogue,
      nodes: dialogue.nodes.map((node) => node.mode === 'shop'
        ? { ...node, frameId: 'frame:night_market' } : node),
    });
    if (frame.kind !== 'frame') throw new Error('merchant frame missing');
    const renamed = { ...frame, id: 'frame:night_market' as const };
    const rest = all.filter((entry) => entry.id !== dialogue.id);
    expect(validateContentDefinitions([...rest, authored, renamed]).errors).toEqual([]);
    expect(validateContentDefinitions([...rest, authored]).errors).toContainEqual(expect.objectContaining({
      definitionId: dialogue.id, code: 'unresolved_reference',
    }));
    const wrongSurface = parseDialogueDefinition({
      ...authored,
      nodes: authored.nodes.map((node) => node.mode === 'shop'
        ? { ...node, frameId: 'frame:chest' } : node),
    });
    expect(validateContentDefinitions([...rest, wrongSurface]).errors).toContainEqual(expect.objectContaining({
      definitionId: dialogue.id, code: 'invalid_dialogue_graph',
    }));
  });

  it('materializes Marlow, Bob, and Fin plus all legacy dialogue and quest ids', () => {
    expect(bootstrapNpcDefinitions().filter((npc) => npc.spawnPolicy !== 'dynamic')
      .map(({ id, runtimeId }) => [id, runtimeId])).toEqual([
      ['npc:marlow', '2'], ['npc:farmer_bob', '3'], ['npc:fisherman_fin', '7'],
    ]);
    expect(bootstrapDialogueDefinitions().map(({ id }) => id).sort()).toEqual(
      Object.keys(DIALOGUE_DEFINITIONS).map((id) => `dialogue:${id}`).sort(),
    );
    expect(bootstrapQuestDefinitions().map(({ id }) => id).sort()).toEqual(
      Object.keys(QUEST_DEFINITIONS).map((id) => `quest:${id}`).sort(),
    );
  });

  it('validates all cross references and rejects dangling dialogue nodes', () => {
    expect(validateContentDefinitions(bootstrapContentDefinitions()).valid).toBe(true);
    const dialogue = bootstrapDialogueDefinitions()[0]!;
    const invalid = { ...dialogue, initialNodeId: 'missing' };
    const definitions = bootstrapContentDefinitions().map((definition) => definition.id === dialogue.id ? invalid : definition);
    expect(validateContentDefinitions(definitions).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_dialogue_graph', definitionId: dialogue.id, path: 'initialNodeId',
    }));
  });

  it('rejects duplicate runtime ids and cyclic quest prerequisites', () => {
    const [firstNpc, secondNpc] = bootstrapNpcDefinitions();
    const duplicateRuntime = bootstrapContentDefinitions().map((definition) => (
      definition.id === secondNpc!.id ? { ...secondNpc!, runtimeId: firstNpc!.runtimeId } : definition
    ));
    expect(validateContentDefinitions(duplicateRuntime).errors).toContainEqual(expect.objectContaining({
      path: 'runtimeId',
    }));

    const [firstQuest, secondQuest] = bootstrapQuestDefinitions();
    const cyclic = bootstrapContentDefinitions().map((definition) => {
      if (definition.id === firstQuest!.id) return { ...firstQuest!, prerequisites: [secondQuest!.id] };
      if (definition.id === secondQuest!.id) return { ...secondQuest!, prerequisites: [firstQuest!.id] };
      return definition;
    });
    expect(validateContentDefinitions(cyclic).errors).toContainEqual(expect.objectContaining({
      code: 'cyclic_quest_prerequisite',
    }));
  });

  it('validates renamed NPC, quest resource, and landmark surface metadata semantically', () => {
    const sourceNpc = bootstrapNpcDefinitions()[0]!;
    const npc = parseNpcDefinition({
      ...sourceNpc,
      id: 'npc:harbour_keeper',
      runtimeId: '99',
      runtimeKind: 'harbour_master',
      initialDecisionDelayTicks: 61,
      questGiver: [],
      protectedPack: { packId: '99001', response: 'Mind the geese!', durationTicks: 75 },
    });
    const sourceSpace = bootstrapContentDefinitions().find(({ id }) => id === 'space:marlow_tent')!;
    expect(sourceSpace.kind).toBe('space');
    if (sourceSpace.kind !== 'space') throw new Error('space fixture missing');
    const space = {
      ...sourceSpace,
      id: 'space:harbour_hut' as const,
      spaceId: 61_000,
      name: 'harbour_hut',
      surfaces: [{ id: '4990000100', kind: 'writing_desk', tileX: 5, tileY: 4, capacity: 2 }],
    };
    const sourceResourceQuest = bootstrapQuestDefinitions()
      .find((definition) => definition.world?.personalResource !== undefined)!;
    const resourceQuest = parseQuestDefinition({
      ...sourceResourceQuest,
      id: 'quest:harbour_lesson',
      giver: npc.id,
      world: {
        personalResource: {
          ...sourceResourceQuest.world!.personalResource!,
          resourceId: '2990000100',
          spaceId: space.spaceId,
          tileX: 8,
          tileY: 7,
        },
      },
    });
    const sourceSurfaceQuest = bootstrapQuestDefinitions()
      .find((definition) => definition.world?.surfaceItemsOnAccept !== undefined)!;
    const surfaceQuest = parseQuestDefinition({
      ...sourceSurfaceQuest,
      id: 'quest:archive_errand',
      giver: npc.id,
      world: {
        surfaceItemsOnAccept: [{
          ...sourceSurfaceQuest.world!.surfaceItemsOnAccept![0]!,
          surfaceId: space.surfaces[0]!.id,
          slot: 1,
        }],
      },
    });
    const report = validateContentDefinitions([
      ...bootstrapContentDefinitions(), npc, space, resourceQuest, surfaceQuest,
    ]);
    expect(report.errors).toEqual([]);
    expect(resourceQuest.world?.personalResource?.resourceId).toBe('2990000100');
    expect(surfaceQuest.world?.surfaceItemsOnAccept?.[0]?.surfaceId).toBe('4990000100');

    const dangling = { ...surfaceQuest, world: {
      surfaceItemsOnAccept: [{ ...surfaceQuest.world!.surfaceItemsOnAccept![0]!, surfaceId: '4999999999' }],
    } };
    expect(validateContentDefinitions([
      ...bootstrapContentDefinitions(), npc, space, resourceQuest, dangling,
    ]).errors).toContainEqual(expect.objectContaining({
      definitionId: surfaceQuest.id,
      path: 'world.surfaceItemsOnAccept[0].surfaceId',
      code: 'unresolved_reference',
    }));
  });
});
