import { describe, expect, it } from 'vitest';
import npcsJson from '../../../assets/content/npcs.json' with { type: 'json' };

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

  it('stores expanded mount, fishing-cycle, and starter projection fields in authored JSON', () => {
    const boat = npcsJson.find(({ id }) => id === 'npc:boat')!;
    const horse = npcsJson.find(({ id }) => id === 'npc:horse')!;
    const fisher = npcsJson.find(({ id }) => id === 'npc:fisherman_fin')!;
    expect(boat.mount).toMatchObject({ adapter: 'boat', reachFixed: 8_192 });
    expect(horse).toMatchObject({
      mount: {
        adapter: 'horse', reachFixed: 8_192, dismountDistanceFixed: 4_608,
        jump: { maximumBlockedTiles: 3, maximumApproachTiles: 1, durationTicks: 10 },
        wander: { radiusFixed: 12_288, speedFixed: 128, blockedRetryTicks: 8 },
      },
      wildlifeProfile: { species: 'horse', variant: 0, packId: '0', habitat: 'pasture' },
    });
    expect(fisher.ai).toMatchObject({
      kind: 'fishing_cycle', castTicks: 20, reelTicks: 20, barkChanceOneIn: 5,
      waitTicks: { minimum: 500, maximum: 900, step: 20 },
      restTicks: { minimum: 300, maximum: 600, step: 20 },
      initialRestTicks: { minimum: 120, maximum: 240, step: 20 },
    });
    expect(fisher.ai.barks).toHaveLength(8);
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
    expect(bootstrapNpcDefinitions().filter((npc) => npc.spawnPolicy !== 'dynamic' && !npc.id.startsWith('npc:willow_'))
      .map(({ id, runtimeId }) => [id, runtimeId])).toEqual([
      ['npc:horse', '1'], ['npc:marlow', '2'], ['npc:farmer_bob', '3'], ['npc:fisherman_fin', '7'],
      ['npc:delve_quartermaster', '4294966920'],
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

  it('requires every fixed starter horse projection and mount tuning field', () => {
    const horse = bootstrapNpcDefinitions().find((definition) => definition.runtimeId === '1')!;
    expect(horse).toMatchObject({
      id: 'npc:horse', runtimeId: '1', runtimeKind: 'horse', displayName: 'Nados Mum',
      home: { spaceId: 0, tileX: 372, tileY: 370 }, facing: 'down', health: 140,
      wildlifeProfile: { species: 'horse', variant: 0, packId: '0', habitat: 'pasture' },
      mount: {
        adapter: 'horse', reachFixed: 8_192, dismountDistanceFixed: 4_608,
        jump: { maximumBlockedTiles: 3, maximumApproachTiles: 1, durationTicks: 10 },
        wander: {
          radiusFixed: 12_288, speedFixed: 128, decisionMinimumTicks: 30,
          decisionJitterTicks: 71, blockedRetryTicks: 8,
        },
      },
    });
    expect(horse.spawnPolicy).toBeUndefined();

    const mount = horse.mount;
    if (mount?.adapter !== 'horse') throw new Error('starter horse mount fixture missing');
    expect(() => parseNpcDefinition({ ...horse, wildlifeProfile: undefined }))
      .toThrow(/authored wildlife profile/u);
    expect(() => parseNpcDefinition({ ...horse, mount: { ...mount, reachFixed: undefined } }))
      .toThrow(/reachFixed/u);
    expect(() => parseNpcDefinition({ ...horse, mount: { ...mount, dismountDistanceFixed: undefined } }))
      .toThrow(/dismountDistanceFixed/u);
    expect(() => parseNpcDefinition({ ...horse, mount: { ...mount, jump: undefined } }))
      .toThrow(/\.mount\.jump/u);
    expect(() => parseNpcDefinition({ ...horse, mount: { ...mount, wander: undefined } }))
      .toThrow(/\.mount\.wander/u);
    expect(() => parseNpcDefinition({
      ...horse,
      mount: { ...mount, jump: { ...mount.jump, maximumBlockedTiles: 65 } },
    })).toThrow(/maximumBlockedTiles/);
  });

  it('requires authored boat interaction reach', () => {
    const boat = bootstrapNpcDefinitions().find((definition) => definition.id === 'npc:boat')!;
    expect(boat.mount).toEqual({ adapter: 'boat', reachFixed: 8_192 });
    expect(() => parseNpcDefinition({ ...boat, mount: { adapter: 'boat' } }))
      .toThrow(/reachFixed/u);
    expect(parseNpcDefinition({ ...boat, mount: { adapter: 'boat', reachFixed: 313 } }).mount)
      .toEqual({ adapter: 'boat', reachFixed: 313 });
    expect(() => parseNpcDefinition({ ...boat, mount: { adapter: 'boat', reachFixed: 0 } }))
      .toThrow(/reachFixed/);
  });

  it('validates the unique fixed horse capability without depending on definition id', () => {
    const all = bootstrapContentDefinitions();
    const horse = all.find((definition) => definition.kind === 'npc' && definition.runtimeId === '1')!;
    if (horse.kind !== 'npc') throw new Error('starter horse fixture missing');
    const renamed = { ...horse, id: 'npc:island_starter' as const };
    const renamedPack = all.map((definition) => definition.id === horse.id ? renamed : definition);
    expect(validateContentDefinitions(renamedPack).errors).toEqual([]);
    const invalidProfile = {
      ...renamed,
      wildlifeProfile: { ...renamed.wildlifeProfile!, species: 'missing_horse' },
    };
    expect(validateContentDefinitions(renamedPack.map((definition) => (
      definition.id === renamed.id ? invalidProfile : definition
    ))).errors).toContainEqual(expect.objectContaining({
      definitionId: renamed.id, path: 'wildlifeProfile.species', code: 'unresolved_reference',
    }));
    const duplicate = {
      ...renamed,
      id: 'npc:second_fixed_horse' as const,
      runtimeId: '99',
      runtimeKind: 'second_fixed_horse',
    };
    expect(validateContentDefinitions([...renamedPack, duplicate]).errors).toContainEqual(expect.objectContaining({
      definitionId: duplicate.id,
      path: 'mount',
      code: 'ambiguous_interaction',
    }));
  });

  it('bounds NPC commerce and validates authored offer references and unique order ownership', () => {
    const all=bootstrapContentDefinitions(),archivist=bootstrapNpcDefinitions().find(npc=>npc.id==='npc:willow_archivist')!;
    expect(archivist.commerce?.recipeExchange).toMatchObject({payment:{item:'item:guardian_seal',count:3}});
    expect(()=>parseNpcDefinition({...archivist,commerce:{recipeExchange:{
      ...archivist.commerce!.recipeExchange!,payment:{item:'item:guardian_seal',count:65_536},
    }}})).toThrow(/bounded payment quantity/);
    expect(()=>parseNpcDefinition({...archivist,commerce:{villageOrders:[{
      id:'Not stable',title:'Invalid',item:'item:carrot',quantity:1,bonusBronze:0,sortOrder:0,
    }]}})).toThrow(/stable order id/);

    const dangling=parseNpcDefinition({...archivist,id:'npc:exchange_curator',runtimeId:'99003',commerce:{recipeExchange:{
      payment:{item:'item:missing_token',count:2},recipes:['recipe:missing_pattern'],
    }}});
    const danglingReport=validateContentDefinitions([...all,dangling]);
    expect(danglingReport.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({definitionId:dangling.id,code:'unresolved_reference'}),
      expect.objectContaining({definitionId:dangling.id,path:'commerce.recipeExchange.recipes[0]',code:'unresolved_reference'}),
    ]));

    const storekeeper=bootstrapNpcDefinitions().find(npc=>npc.id==='npc:willow_storekeeper')!;
    const duplicate=parseNpcDefinition({...storekeeper,id:'npc:second_buyer',runtimeId:'99004'});
    expect(validateContentDefinitions([...all,duplicate]).errors).toContainEqual(expect.objectContaining({
      definitionId:duplicate.id,path:'commerce.villageOrders',code:'ambiguous_interaction',
    }));
  });

  it('bounds authored fishing-cycle timings and bark policy', () => {
    const fin = bootstrapNpcDefinitions().find((npc) => npc.id === 'npc:fisherman_fin')!;
    if (fin.ai.kind !== 'fishing_cycle') throw new Error('authored fishing fixture missing');
    expect(fin.ai).toMatchObject({
      castTicks: 20,
      waitTicks: { minimum: 500, maximum: 900, step: 20 },
      reelTicks: 20,
      restTicks: { minimum: 300, maximum: 600 },
      barkChanceOneIn: 5,
    });
    const renamed = parseNpcDefinition({
      ...fin,
      id: 'npc:harbour_angler',
      runtimeId: '99005',
      ai: {
        ...fin.ai,
        castTicks: 37,
        barkChanceOneIn: 1,
        barks: ['The harbour is calm today.'],
      },
    });
    expect(renamed.ai).toMatchObject({
      kind: 'fishing_cycle', castTicks: 37, barkChanceOneIn: 1,
      barks: ['The harbour is calm today.'],
    });
    expect(() => parseNpcDefinition({
      ...fin, ai: { ...fin.ai, waitTicks: { minimum: 901, maximum: 900, step: 20 } },
    })).toThrow(/minimum exceeds maximum/);
    expect(() => parseNpcDefinition({
      ...fin, ai: { ...fin.ai, reelTicks: 72_001 },
    })).toThrow(/bounded phase duration/);
    expect(() => parseNpcDefinition({
      ...fin, ai: { ...fin.ai, barks: Array.from({ length: 65 }, () => 'Too many fish stories.') },
    })).toThrow(/exceeds 64 barks/);

    expect(parseNpcDefinition({ ...fin, ai: { kind: 'fishing_cycle' } })).toMatchObject({
      legacyCompatibility: true,
      ai: {
        kind: 'fishing_cycle', castTicks: 20,
        waitTicks: { minimum: 500, maximum: 900, step: 20 },
      },
    });
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
      surfaces: [{
        id: '4990000100', kind: 'writing_desk', tileX: 5, tileY: 4,
        capacity: 2, footprint: [-1, 0, 1, 0] as const,
      }],
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
