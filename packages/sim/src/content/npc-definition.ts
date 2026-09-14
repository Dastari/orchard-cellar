import {HEARTH_FURNISHING_CATEGORIES,type HearthFurnishingCategory} from '../hearth-furnishing-categories.js';

export type NpcDefinitionId = `npc:${string}`;
export type DialogueDefinitionId = `dialogue:${string}`;
export type QuestDefinitionId = `quest:${string}`;

export interface NpcVillageOrderContentDefinition {
  readonly id: string;
  readonly title: string;
  readonly item: `item:${string}`;
  readonly quantity: number;
  readonly bonusBronze: number;
  readonly sortOrder: number;
}

export interface NpcRecipeExchangeContentDefinition {
  readonly payment: { readonly item: `item:${string}`; readonly count: number };
  readonly recipes: readonly `recipe:${string}`[];
}

export interface NpcFishingCycleContentDefinition {
  readonly kind: 'fishing_cycle';
  readonly castTicks: number;
  readonly waitTicks: { readonly minimum: number; readonly maximum: number; readonly step: number };
  readonly reelTicks: number;
  readonly restTicks: { readonly minimum: number; readonly maximum: number; readonly step: number };
  readonly initialRestTicks: { readonly minimum: number; readonly maximum: number; readonly step: number };
  readonly barkChanceOneIn: number;
  readonly barks: readonly string[];
}

export type NpcAiContentDefinition =
  | { readonly kind: 'stationary' }
  | NpcFishingCycleContentDefinition;

export interface NpcWildlifeProfileContentDefinition {
  readonly species: string;
  readonly variant: number;
  /** Decimal u64 text matching the durable wildlife profile schema. */
  readonly packId: string;
  readonly habitat: string;
}

export interface NpcHorseMountContentDefinition {
  readonly adapter: 'horse';
  readonly requiredSkill?: string;
  readonly jumpSkill?: string;
  readonly reachFixed: number;
  readonly dismountDistanceFixed: number;
  readonly jump: {
    readonly maximumBlockedTiles: number;
    readonly maximumApproachTiles: number;
    readonly durationTicks: number;
  };
  readonly wander: {
    readonly radiusFixed: number;
    readonly speedFixed: number;
    readonly decisionMinimumTicks: number;
    readonly decisionJitterTicks: number;
    readonly blockedRetryTicks: number;
  };
}

export interface NpcBoatMountContentDefinition {
  readonly adapter: 'boat';
  readonly requiredSkill?: string;
  readonly jumpSkill?: string;
  readonly reachFixed: number;
}

export type NpcMountContentDefinition =
  | NpcBoatMountContentDefinition
  | NpcHorseMountContentDefinition;

interface AuthoredBase<K extends 'npc' | 'dialogue' | 'quest', I extends string> {
  readonly id: I;
  readonly kind: K;
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: I;
}

export interface NpcContentDefinition extends AuthoredBase<'npc', NpcDefinitionId> {
  readonly legacyCompatibility?: true;
  readonly runtimeId: string;
  readonly actorAsset: string;
  readonly displayName: string;
  readonly home: { readonly spaceId: number; readonly tileX: number; readonly tileY: number };
  readonly facing: 'up' | 'down' | 'left' | 'right';
  readonly ai: NpcAiContentDefinition;
  readonly dialogue?: DialogueDefinitionId;
  /** Dynamic templates are instantiated only by an authorized lifecycle. */
  readonly spawnPolicy?: 'dynamic';
  readonly mount?: NpcMountContentDefinition;
  /** Optional durable wildlife projection for an authored fixed NPC. */
  readonly wildlifeProfile?: NpcWildlifeProfileContentDefinition;
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
  /** Bounded peaceful commerce owned by this NPC. Transactional settlement
   * remains engine code; these fields only author the offers and payment. */
  readonly commerce?: {
    readonly villageOrders?: readonly NpcVillageOrderContentDefinition[];
    readonly recipeExchange?: NpcRecipeExchangeContentDefinition;
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
  | {readonly id:string;readonly kind:'equipment';readonly label:string;readonly category:'weapon'|'body'}
  | {readonly id:string;readonly kind:'furnishing';readonly label:string;readonly category:HearthFurnishingCategory}
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
const boundedInteger = (value: unknown, path: string, minimum: number, maximum: number): number => {
  const result = integer(value, path, minimum);
  if (result > maximum) throw new Error(`${path}: expected safe integer <= ${maximum}`);
  return result;
};
const stableName = (value: unknown, path: string): string => {
  const result = string(value, path);
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(result)) throw new Error(`${path}: expected stable name`);
  return result;
};
const unsignedIntegerText = (value: unknown, path: string): string => {
  const result = string(value, path);
  if (!/^\d+$/u.test(result) || BigInt(result) > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${path}: expected unsigned 64-bit integer text`);
  }
  return result;
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
  const commerce = source.commerce === undefined ? undefined : object(source.commerce, '$.commerce');
  const villageOrders = commerce?.villageOrders === undefined ? undefined
    : array(commerce.villageOrders, '$.commerce.villageOrders').map((entry, index) => {
      const order = object(entry, `$.commerce.villageOrders[${index}]`);
      const quantity = integer(order.quantity, `$.commerce.villageOrders[${index}].quantity`, 1);
      const bonusBronze = integer(order.bonusBronze, `$.commerce.villageOrders[${index}].bonusBronze`);
      if (quantity > 65_535) throw new Error(`$.commerce.villageOrders[${index}].quantity: exceeds bounded order quantity`);
      if (bonusBronze > 4_294_967_295) throw new Error(`$.commerce.villageOrders[${index}].bonusBronze: exceeds bounded bronze bonus`);
      const orderId = string(order.id, `$.commerce.villageOrders[${index}].id`);
      if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(orderId)) {
        throw new Error(`$.commerce.villageOrders[${index}].id: expected stable order id`);
      }
      return {
        id: orderId,
        title: string(order.title, `$.commerce.villageOrders[${index}].title`),
        item: id(order.item, 'item', `$.commerce.villageOrders[${index}].item`),
        quantity,
        bonusBronze,
        sortOrder: integer(order.sortOrder, `$.commerce.villageOrders[${index}].sortOrder`),
      };
    });
  if ((villageOrders?.length ?? 0) > 64) throw new Error('$.commerce.villageOrders: exceeds 64 offers');
  const recipeExchange = commerce?.recipeExchange === undefined ? undefined : (() => {
    const exchange = object(commerce.recipeExchange, '$.commerce.recipeExchange');
    const payment = object(exchange.payment, '$.commerce.recipeExchange.payment');
    const count = integer(payment.count, '$.commerce.recipeExchange.payment.count', 1);
    const recipes = array(exchange.recipes, '$.commerce.recipeExchange.recipes')
      .map((entry, index) => id(entry, 'recipe', `$.commerce.recipeExchange.recipes[${index}]`));
    if (count > 65_535) throw new Error('$.commerce.recipeExchange.payment.count: exceeds bounded payment quantity');
    if (recipes.length === 0 || recipes.length > 64) throw new Error('$.commerce.recipeExchange.recipes: expected 1 to 64 recipes');
    return { payment: { item: id(payment.item, 'item', '$.commerce.recipeExchange.payment.item'), count }, recipes };
  })();
  if (!['up', 'down', 'left', 'right'].includes(facing)) throw new Error('$.facing: invalid facing');
  if (aiKind !== 'stationary' && aiKind !== 'fishing_cycle') throw new Error('$.ai.kind: invalid AI kind');
  const fishingAi = ai;
  const legacyFishing=aiKind==='fishing_cycle'&&fishingAi.castTicks===undefined
    &&fishingAi.waitTicks===undefined&&fishingAi.reelTicks===undefined&&fishingAi.restTicks===undefined
    &&fishingAi.initialRestTicks===undefined&&fishingAi.barkChanceOneIn===undefined&&fishingAi.barks===undefined;
  const legacyFishingDefaults=legacyFishing?{
    castTicks:20,waitTicks:{minimum:500,maximum:900,step:20},reelTicks:20,
    restTicks:{minimum:300,maximum:600,step:20},initialRestTicks:{minimum:120,maximum:240,step:20},
    barkChanceOneIn:5,barks:["I swear it was THIS big...","The lake's keeping its secrets today.",
      'Patience catches more fish than fancy bait.',"Easy now... don't spook the silverfin.",
      'A quiet line is still a hopeful line.','Nearly had that one!',
      'The best bites come when nobody is watching.','Just one more cast...'],
  }:undefined;
  const fishingSource=legacyFishingDefaults??fishingAi;
  const tickRange = (key: 'waitTicks' | 'restTicks' | 'initialRestTicks') => {
    const range = object(fishingSource[key], `$.ai.${key}`);
    const minimum = integer(range.minimum, `$.ai.${key}.minimum`, 1);
    const maximum = integer(range.maximum, `$.ai.${key}.maximum`, 1);
    const step = integer(range.step, `$.ai.${key}.step`, 1);
    if (minimum > maximum) throw new Error(`$.ai.${key}: minimum exceeds maximum`);
    if (maximum > 72_000) throw new Error(`$.ai.${key}.maximum: exceeds bounded phase duration`);
    if ((maximum - minimum) % step !== 0) throw new Error(`$.ai.${key}.step: must divide phase duration range`);
    return { minimum, maximum, step };
  };
  const parsedAi: NpcAiContentDefinition = aiKind === 'stationary'
    ? { kind: 'stationary' }
    : (() => {
      const castTicks = integer(fishingSource.castTicks, '$.ai.castTicks', 1);
      const reelTicks = integer(fishingSource.reelTicks, '$.ai.reelTicks', 1);
      const barkChanceOneIn = integer(fishingSource.barkChanceOneIn, '$.ai.barkChanceOneIn', 1);
      const barks = array(fishingSource.barks, '$.ai.barks').map((entry, index) => {
        const bark = string(entry, `$.ai.barks[${index}]`);
        if (bark.length > 160) throw new Error(`$.ai.barks[${index}]: exceeds 160 characters`);
        return bark;
      });
      if (castTicks > 72_000) throw new Error('$.ai.castTicks: exceeds bounded phase duration');
      if (reelTicks > 72_000) throw new Error('$.ai.reelTicks: exceeds bounded phase duration');
      if (barkChanceOneIn > 1_000_000) throw new Error('$.ai.barkChanceOneIn: exceeds bounded chance denominator');
      if (barks.length > 64) throw new Error('$.ai.barks: exceeds 64 barks');
      return {
        kind: 'fishing_cycle' as const,
        castTicks,
        waitTicks: tickRange('waitTicks'),
        reelTicks,
        restTicks: tickRange('restTicks'),
        initialRestTicks: tickRange('initialRestTicks'),
        barkChanceOneIn,
        barks,
      };
    })();
  const runtimeId = unsignedIntegerText(source.runtimeId, '$.runtimeId');
  const parsedMount: NpcMountContentDefinition | undefined = source.mount === undefined ? undefined : (() => {
    const mount = object(source.mount, '$.mount');
    if (mount.adapter !== 'boat' && mount.adapter !== 'horse') throw new Error('$.mount.adapter: invalid mount adapter');
    const skills = {
      ...(mount.requiredSkill === undefined ? {} : { requiredSkill: stableName(mount.requiredSkill, '$.mount.requiredSkill') }),
      ...(mount.jumpSkill === undefined ? {} : { jumpSkill: stableName(mount.jumpSkill, '$.mount.jumpSkill') }),
    };
    if (mount.adapter === 'boat') return {
      adapter: 'boat',
      ...skills,
      reachFixed: boundedInteger(mount.reachFixed, '$.mount.reachFixed', 1, 0xffff_ffff),
    };
    const jump = object(mount.jump, '$.mount.jump');
    const wander = object(mount.wander, '$.mount.wander');
    return {
      adapter: 'horse',
      ...skills,
      reachFixed: boundedInteger(mount.reachFixed, '$.mount.reachFixed', 1, 0xffff_ffff),
      dismountDistanceFixed: boundedInteger(mount.dismountDistanceFixed, '$.mount.dismountDistanceFixed', 1, 0xffff_ffff),
      jump: {
        maximumBlockedTiles: boundedInteger(jump.maximumBlockedTiles, '$.mount.jump.maximumBlockedTiles', 1, 64),
        maximumApproachTiles: boundedInteger(jump.maximumApproachTiles, '$.mount.jump.maximumApproachTiles', 0, 64),
        durationTicks: boundedInteger(jump.durationTicks, '$.mount.jump.durationTicks', 1, 72_000),
      },
      wander: {
        radiusFixed: boundedInteger(wander.radiusFixed, '$.mount.wander.radiusFixed', 1, 0xffff_ffff),
        speedFixed: boundedInteger(wander.speedFixed, '$.mount.wander.speedFixed', 1, 0xffff_ffff),
        decisionMinimumTicks: boundedInteger(wander.decisionMinimumTicks, '$.mount.wander.decisionMinimumTicks', 1, 72_000),
        decisionJitterTicks: boundedInteger(wander.decisionJitterTicks, '$.mount.wander.decisionJitterTicks', 1, 72_000),
        blockedRetryTicks: boundedInteger(wander.blockedRetryTicks, '$.mount.wander.blockedRetryTicks', 1, 72_000),
      },
    };
  })();
  const parsedWildlifeProfile: NpcWildlifeProfileContentDefinition | undefined = source.wildlifeProfile === undefined
    ? undefined
    : (() => {
      const profile = object(source.wildlifeProfile, '$.wildlifeProfile');
      return {
        species: stableName(profile.species, '$.wildlifeProfile.species'),
        variant: boundedInteger(profile.variant, '$.wildlifeProfile.variant', 0, 65_535),
        packId: unsignedIntegerText(profile.packId, '$.wildlifeProfile.packId'),
        habitat: stableName(profile.habitat, '$.wildlifeProfile.habitat'),
      };
    })();
  if (parsedMount?.adapter === 'horse' && parsedWildlifeProfile === undefined) {
    throw new Error('$.wildlifeProfile: horse mount requires an authored wildlife profile');
  }
  return {
    ...common(source, 'npc'),
    ...(legacyFishing||source.legacyCompatibility===true?{legacyCompatibility:true as const}:{}),
    runtimeId,
    actorAsset: string(source.actorAsset, '$.actorAsset'),
    displayName: string(source.displayName, '$.displayName'),
    home: { spaceId: integer(home.spaceId, '$.home.spaceId'), tileX: integer(home.tileX, '$.home.tileX'), tileY: integer(home.tileY, '$.home.tileY') },
    facing: facing as NpcContentDefinition['facing'],
    ai: parsedAi,
    ...(source.dialogue === undefined ? {} : { dialogue: id(source.dialogue, 'dialogue', '$.dialogue') }),
    ...(source.spawnPolicy === undefined ? {} : { spawnPolicy: (() => {
      if (source.spawnPolicy !== 'dynamic') throw new Error('$.spawnPolicy: invalid spawn policy');
      return 'dynamic' as const;
    })() }),
    ...(parsedMount === undefined ? {} : { mount: parsedMount }),
    ...(parsedWildlifeProfile === undefined ? {} : { wildlifeProfile: parsedWildlifeProfile }),
    ...(source.shop === undefined ? {} : { shop: id(source.shop, 'shop', '$.shop') }),
    questGiver: array(source.questGiver, '$.questGiver').map((entry, index) => id(entry, 'quest', `$.questGiver[${index}]`)),
    health: integer(source.health, '$.health', 1),
    ...(source.barks === undefined || aiKind === 'fishing_cycle' ? {} : {
      barks: array(source.barks, '$.barks').map((entry, index) => string(entry, `$.barks[${index}]`)),
    }),
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
    ...(commerce === undefined ? {} : { commerce: {
      ...(villageOrders === undefined ? {} : { villageOrders }),
      ...(recipeExchange === undefined ? {} : { recipeExchange }),
    } }),
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
  if(kind==='equipment'){
    const category=string(source.category,`${path}.category`);
    if(category!=='weapon'&&category!=='body')throw new Error(`${path}.category is invalid`);
    return {...shared,kind,category};
  }
  if(kind==='furnishing'){
    const category=string(source.category,`${path}.category`) as HearthFurnishingCategory;
    if(!HEARTH_FURNISHING_CATEGORIES.includes(category))throw new Error(`${path}.category is invalid`);
    return {...shared,kind,category};
  }
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
