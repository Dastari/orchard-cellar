
export type NpcDefinitionId = `npc:${string}`;
export type DialogueDefinitionId = `dialogue:${string}`;
export type QuestDefinitionId = `quest:${string}`;

interface AuthoredBase<K extends 'npc' | 'dialogue' | 'quest', I extends string> {
  readonly id: I;
  readonly kind: K;
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: I;
}

export interface NpcContentDefinition extends AuthoredBase<'npc', NpcDefinitionId> {
  readonly runtimeId: string;
  readonly actorAsset: string;
  readonly displayName: string;
  readonly home: { readonly spaceId: number; readonly tileX: number; readonly tileY: number };
  readonly facing: 'up' | 'down' | 'left' | 'right';
  readonly ai: { readonly kind: 'stationary' | 'fishing_cycle' };
  readonly dialogue?: DialogueDefinitionId;
  /** Dynamic templates are instantiated only by an authorized lifecycle. */
  readonly spawnPolicy?: 'dynamic';
  readonly mount?: {
    readonly adapter: 'boat' | 'horse';
    readonly requiredSkill?: string;
    readonly jumpSkill?: string;
  };
  readonly shop?: `shop:${string}`;
  readonly questGiver: readonly QuestDefinitionId[];
  readonly health: number;
  readonly barks?: readonly string[];
  readonly runtimeKind?: string;
  readonly initialDecisionDelayTicks?: number;
  readonly protectedPack?: {
    readonly packId: string;
    readonly response: string;
    readonly durationTicks: number;
  };
}

export interface DialogueChoiceContentDefinition {
  readonly id: string;
  readonly label: string;
  readonly nextNodeId: string | null;
  readonly tone?: 'normal' | 'accept' | 'decline';
  readonly questMarker?: 'offer' | 'complete';
  readonly quest?: {
    readonly quest: QuestDefinitionId;
    readonly requires: 'available' | 'active' | 'complete' | 'turned_in';
    readonly action?: 'accept' | 'turn_in';
  };
}

export interface DialogueNodeContentDefinition {
  readonly id: string;
  readonly speaker: string;
  readonly body: string;
  readonly mode: 'dialogue' | 'shop';
  readonly frameId?: `frame:${string}`;
  readonly choices: readonly DialogueChoiceContentDefinition[];
}

export interface DialogueContentDefinition extends AuthoredBase<'dialogue', DialogueDefinitionId> {
  readonly initialNodeId: string;
  readonly shop?: `shop:${string}`;
  readonly nodes: readonly DialogueNodeContentDefinition[];
}

export type QuestObjectiveContentDefinition =
  | { readonly id: string; readonly kind: 'collect'; readonly label: string;
    readonly items: readonly { readonly item: `item:${string}`; readonly count: number }[];
    readonly consumeOnTurnIn?: boolean }
  | { readonly id: string; readonly kind: 'statistic'; readonly label: string;
    readonly statisticKind: string; readonly subjectKind: string; readonly count: number }
  | { readonly id: string; readonly kind: 'action'; readonly label: string;
    readonly actionKind: string; readonly count: number }
  | { readonly id: string; readonly kind: 'location'; readonly label: string;
    readonly spaceId: number; readonly x: number; readonly y: number; readonly radiusFixed: number }
  | { readonly id: string; readonly kind: 'talk'; readonly label: string;
    readonly npcs: readonly NpcDefinitionId[]; readonly count: number };

export interface QuestContentDefinition extends AuthoredBase<'quest', QuestDefinitionId> {
  readonly title: string;
  readonly summary: string;
  readonly giver: NpcDefinitionId;
  readonly prerequisites?: readonly QuestDefinitionId[];
  readonly objectives: readonly QuestObjectiveContentDefinition[];
  readonly acceptItems?: readonly { readonly item: `item:${string}`; readonly count: number }[];
  readonly rewards: {
    readonly bronze: number;
    readonly experience: readonly { readonly skill: string; readonly amount: number }[];
    readonly items: readonly { readonly item: `item:${string}`; readonly count: number }[];
    readonly homesteadSizeTier?: number;
  };
  readonly abandonRemovesItems?: readonly { readonly item: `item:${string}`; readonly count: number }[];
  readonly world?: {
    readonly surfaceItemsOnAccept?: readonly {
      readonly objectiveId: string;
      readonly surfaceId: string;
      readonly slot: number;
      readonly item: `item:${string}`;
    }[];
    readonly personalResource?: {
      readonly objectiveId: string;
      readonly resourceId: string;
      readonly resourceKind: string;
      readonly spaceId: number;
      readonly tileX: number;
      readonly tileY: number;
      readonly item: `item:${string}`;
    };
    readonly narrativeTriggers?: readonly {
      readonly id: string;
      readonly event: 'water_crop';
      readonly subjectKind: string;
      readonly body: string;
      readonly tone: string;
      readonly durationTicks: number;
    }[];
  };
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path}: expected non-empty string`);
  return value;
};
const integer = (value: unknown, path: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${path}: expected safe integer >= ${minimum}`);
  return value as number;
};
const array = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
};
const decoded = (value: string | unknown) => typeof value === 'string' ? JSON.parse(value) as unknown : value;
const id = <K extends string>(value: unknown, kind: K, path: string): `${K}:${string}` => {
  const result = string(value, path);
  if (!new RegExp(`^${kind}:[a-z0-9]+(?:_[a-z0-9]+)*$`).test(result)) throw new Error(`${path}: expected ${kind}: slug`);
  return result as `${K}:${string}`;
};
const common = <K extends 'npc' | 'dialogue' | 'quest'>(source: Record<string, unknown>, kind: K) => {
  if (source.kind !== kind || source.schemaVersion !== 1) throw new Error(`$: invalid ${kind} kind or schemaVersion`);
  return {
    id: id(source.id, kind, '$.id'), kind, schemaVersion: 1 as const,
    ...(source.retired === undefined ? {} : {
      retired: source.retired === true
        ? true
        : (() => { throw new Error('$.retired: expected true'); })(),
    }),
    ...(source.replacement === undefined ? {} : {
      replacement: id(source.replacement, kind, '$.replacement'),
    }),
  };
};
const itemAmounts = (value: unknown, path: string) => array(value, path).map((entry, index) => {
  const source = object(entry, `${path}[${index}]`);
  return { item: id(source.item, 'item', `${path}[${index}].item`), count: integer(source.count, `${path}[${index}].count`, 1) };
});

export function parseNpcDefinition(value: string | unknown): NpcContentDefinition {
  const source = object(decoded(value), '$');
  const home = object(source.home, '$.home');
  const ai = object(source.ai, '$.ai');
  const facing = string(source.facing, '$.facing');
  const aiKind = string(ai.kind, '$.ai.kind');
  if (!['up', 'down', 'left', 'right'].includes(facing)) throw new Error('$.facing: invalid facing');
  if (aiKind !== 'stationary' && aiKind !== 'fishing_cycle') throw new Error('$.ai.kind: invalid AI kind');
  return {
    ...common(source, 'npc'),
    runtimeId: string(source.runtimeId, '$.runtimeId'),
    actorAsset: string(source.actorAsset, '$.actorAsset'),
    displayName: string(source.displayName, '$.displayName'),
    home: { spaceId: integer(home.spaceId, '$.home.spaceId'), tileX: integer(home.tileX, '$.home.tileX'), tileY: integer(home.tileY, '$.home.tileY') },
    facing: facing as NpcContentDefinition['facing'],
    ai: { kind: aiKind },
    ...(source.dialogue === undefined ? {} : { dialogue: id(source.dialogue, 'dialogue', '$.dialogue') }),
    ...(source.spawnPolicy === undefined ? {} : { spawnPolicy: (() => {
      if (source.spawnPolicy !== 'dynamic') throw new Error('$.spawnPolicy: invalid spawn policy');
      return 'dynamic' as const;
    })() }),
    ...(source.mount === undefined ? {} : { mount: (() => {
      const mount = object(source.mount, '$.mount');
      if (mount.adapter !== 'boat' && mount.adapter !== 'horse') throw new Error('$.mount.adapter: invalid mount adapter');
      return {
        adapter: mount.adapter,
        ...(mount.requiredSkill === undefined ? {} : { requiredSkill: string(mount.requiredSkill, '$.mount.requiredSkill') }),
        ...(mount.jumpSkill === undefined ? {} : { jumpSkill: string(mount.jumpSkill, '$.mount.jumpSkill') }),
      };
    })() }),
    ...(source.shop === undefined ? {} : { shop: id(source.shop, 'shop', '$.shop') }),
    questGiver: array(source.questGiver, '$.questGiver').map((entry, index) => id(entry, 'quest', `$.questGiver[${index}]`)),
    health: integer(source.health, '$.health', 1),
    ...(source.barks === undefined ? {} : { barks: array(source.barks, '$.barks').map((entry, index) => string(entry, `$.barks[${index}]`)) }),
    ...(source.runtimeKind === undefined ? {} : { runtimeKind: string(source.runtimeKind, '$.runtimeKind') }),
    ...(source.initialDecisionDelayTicks === undefined ? {} : {
      initialDecisionDelayTicks: integer(source.initialDecisionDelayTicks, '$.initialDecisionDelayTicks', 1),
    }),
    ...(source.protectedPack === undefined ? {} : (() => {
      const pack = object(source.protectedPack, '$.protectedPack');
      return { protectedPack: {
        packId: string(pack.packId, '$.protectedPack.packId'),
        response: string(pack.response, '$.protectedPack.response'),
        durationTicks: integer(pack.durationTicks, '$.protectedPack.durationTicks', 1),
      } };
    })()),
  };
}

export function parseDialogueDefinition(value: string | unknown): DialogueContentDefinition {
  const source = object(decoded(value), '$');
  return {
    ...common(source, 'dialogue'),
    initialNodeId: string(source.initialNodeId, '$.initialNodeId'),
    ...(source.shop === undefined ? {} : { shop: id(source.shop, 'shop', '$.shop') }),
    nodes: array(source.nodes, '$.nodes').map((entry, nodeIndex) => {
      const node = object(entry, `$.nodes[${nodeIndex}]`);
      const mode = string(node.mode, `$.nodes[${nodeIndex}].mode`);
      if (mode !== 'dialogue' && mode !== 'shop') throw new Error(`$.nodes[${nodeIndex}].mode: invalid mode`);
      return {
        id: string(node.id, `$.nodes[${nodeIndex}].id`), speaker: string(node.speaker, `$.nodes[${nodeIndex}].speaker`),
        body: string(node.body, `$.nodes[${nodeIndex}].body`), mode,
        ...(node.frameId === undefined ? {} : { frameId: id(node.frameId, 'frame', `$.nodes[${nodeIndex}].frameId`) }),
        choices: array(node.choices, `$.nodes[${nodeIndex}].choices`).map((entry, choiceIndex) => {
          const choice = object(entry, `$.nodes[${nodeIndex}].choices[${choiceIndex}]`);
          const quest = choice.quest === undefined ? undefined : object(choice.quest, `$.nodes[${nodeIndex}].choices[${choiceIndex}].quest`);
          if (choice.tone !== undefined && !['normal', 'accept', 'decline'].includes(choice.tone as string)) {
            throw new Error('choice.tone: invalid tone');
          }
          if (choice.questMarker !== undefined && choice.questMarker !== 'offer' && choice.questMarker !== 'complete') {
            throw new Error('choice.questMarker: invalid marker');
          }
          if (quest !== undefined && !['available', 'active', 'complete', 'turned_in'].includes(quest.requires as string)) {
            throw new Error('choice.quest.requires: invalid quest state');
          }
          if (quest?.action !== undefined && quest.action !== 'accept' && quest.action !== 'turn_in') {
            throw new Error('choice.quest.action: invalid quest action');
          }
          return {
            id: string(choice.id, 'choice.id'), label: string(choice.label, 'choice.label'),
            nextNodeId: choice.nextNodeId === null ? null : string(choice.nextNodeId, 'choice.nextNodeId'),
            ...(choice.tone === undefined ? {} : {
              tone: string(choice.tone, 'choice.tone') as NonNullable<DialogueChoiceContentDefinition['tone']>,
            }),
            ...(choice.questMarker === undefined ? {} : { questMarker: string(choice.questMarker, 'choice.questMarker') as 'offer' | 'complete' }),
            ...(quest === undefined ? {} : { quest: {
              quest: id(quest.quest, 'quest', 'choice.quest.quest'),
              requires: string(quest.requires, 'choice.quest.requires') as 'available' | 'active' | 'complete' | 'turned_in',
              ...(quest.action === undefined ? {} : { action: string(quest.action, 'choice.quest.action') as 'accept' | 'turn_in' }),
            } }),
          };
        }),
      };
    }),
  };
}

function parseQuestObjective(value: unknown, path: string): QuestObjectiveContentDefinition {
  const source = object(value, path);
  const shared = { id: string(source.id, `${path}.id`), label: string(source.label, `${path}.label`) };
  const kind = string(source.kind, `${path}.kind`);
  if (kind === 'collect') return { ...shared, kind, items: itemAmounts(source.items, `${path}.items`), ...(source.consumeOnTurnIn === true ? { consumeOnTurnIn: true } : {}) };
  if (kind === 'statistic') return { ...shared, kind, statisticKind: string(source.statisticKind, `${path}.statisticKind`), subjectKind: typeof source.subjectKind === 'string' ? source.subjectKind : '', count: integer(source.count, `${path}.count`, 1) };
  if (kind === 'action') return { ...shared, kind, actionKind: string(source.actionKind, `${path}.actionKind`), count: integer(source.count, `${path}.count`, 1) };
  if (kind === 'location') return { ...shared, kind, spaceId: integer(source.spaceId, `${path}.spaceId`), x: integer(source.x, `${path}.x`, Number.MIN_SAFE_INTEGER), y: integer(source.y, `${path}.y`, Number.MIN_SAFE_INTEGER), radiusFixed: integer(source.radiusFixed, `${path}.radiusFixed`, 1) };
  if (kind === 'talk') return { ...shared, kind, npcs: array(source.npcs, `${path}.npcs`).map((entry, index) => id(entry, 'npc', `${path}.npcs[${index}]`)), count: integer(source.count, `${path}.count`, 1) };
  throw new Error(`${path}.kind: invalid quest objective`);
}

export function parseQuestDefinition(value: string | unknown): QuestContentDefinition {
  const source = object(decoded(value), '$');
  const rewards = object(source.rewards, '$.rewards');
  const world = source.world === undefined ? undefined : object(source.world, '$.world');
  const personalResource = world?.personalResource === undefined
    ? undefined : object(world.personalResource, '$.world.personalResource');
  return {
    ...common(source, 'quest'), title: string(source.title, '$.title'), summary: string(source.summary, '$.summary'),
    giver: id(source.giver, 'npc', '$.giver'),
    ...(source.prerequisites === undefined ? {} : { prerequisites: array(source.prerequisites, '$.prerequisites').map((entry, index) => id(entry, 'quest', `$.prerequisites[${index}]`)) }),
    objectives: array(source.objectives, '$.objectives').map((entry, index) => parseQuestObjective(entry, `$.objectives[${index}]`)),
    ...(source.acceptItems === undefined ? {} : { acceptItems: itemAmounts(source.acceptItems, '$.acceptItems') }),
    rewards: {
      bronze: integer(rewards.bronze, '$.rewards.bronze'),
      experience: array(rewards.experience, '$.rewards.experience').map((entry, index) => { const experience = object(entry, `$.rewards.experience[${index}]`); return { skill: string(experience.skill, 'experience.skill'), amount: integer(experience.amount, 'experience.amount') }; }),
      items: itemAmounts(rewards.items, '$.rewards.items'),
      ...(rewards.homesteadSizeTier === undefined ? {} : { homesteadSizeTier: integer(rewards.homesteadSizeTier, '$.rewards.homesteadSizeTier') }),
    },
    ...(source.abandonRemovesItems === undefined ? {} : { abandonRemovesItems: itemAmounts(source.abandonRemovesItems, '$.abandonRemovesItems') }),
    ...(world === undefined ? {} : { world: {
      ...(world.surfaceItemsOnAccept === undefined ? {} : {
        surfaceItemsOnAccept: array(world.surfaceItemsOnAccept, '$.world.surfaceItemsOnAccept').map((entry, index) => {
          const item = object(entry, `$.world.surfaceItemsOnAccept[${index}]`);
          return {
            objectiveId: string(item.objectiveId, `$.world.surfaceItemsOnAccept[${index}].objectiveId`),
            surfaceId: string(item.surfaceId, `$.world.surfaceItemsOnAccept[${index}].surfaceId`),
            slot: integer(item.slot, `$.world.surfaceItemsOnAccept[${index}].slot`),
            item: id(item.item, 'item', `$.world.surfaceItemsOnAccept[${index}].item`),
          };
        }),
      }),
      ...(personalResource === undefined ? {} : { personalResource: {
        objectiveId: string(personalResource.objectiveId, '$.world.personalResource.objectiveId'),
        resourceId: string(personalResource.resourceId, '$.world.personalResource.resourceId'),
        resourceKind: string(personalResource.resourceKind, '$.world.personalResource.resourceKind'),
        spaceId: integer(personalResource.spaceId, '$.world.personalResource.spaceId'),
        tileX: integer(personalResource.tileX, '$.world.personalResource.tileX', Number.MIN_SAFE_INTEGER),
        tileY: integer(personalResource.tileY, '$.world.personalResource.tileY', Number.MIN_SAFE_INTEGER),
        item: id(personalResource.item, 'item', '$.world.personalResource.item'),
      } }),
      ...(world.narrativeTriggers === undefined ? {} : {
        narrativeTriggers: array(world.narrativeTriggers, '$.world.narrativeTriggers').map((entry, index) => {
          const trigger = object(entry, `$.world.narrativeTriggers[${index}]`);
          if (trigger.event !== 'water_crop') throw new Error(`$.world.narrativeTriggers[${index}].event: invalid event`);
          return {
            id: string(trigger.id, `$.world.narrativeTriggers[${index}].id`),
            event: 'water_crop' as const,
            subjectKind: string(trigger.subjectKind, `$.world.narrativeTriggers[${index}].subjectKind`),
            body: string(trigger.body, `$.world.narrativeTriggers[${index}].body`),
            tone: string(trigger.tone, `$.world.narrativeTriggers[${index}].tone`),
            durationTicks: integer(trigger.durationTicks, `$.world.narrativeTriggers[${index}].durationTicks`, 1),
          };
        }),
      }),
    } }),
  };
}
