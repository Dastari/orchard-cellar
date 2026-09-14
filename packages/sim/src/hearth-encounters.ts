import type { EnemyAttackPattern } from './combat-actions.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type {
  EncounterContentDefinition,
  EnemyContentDefinition,
} from './content/outdoor-encounter-definition.js';
import type { ContentRegistry } from './content/registry.js';
import type { EncounterRewardProfile } from './outdoor-encounters.js';
import type { RogueEnemyArchetype } from './roguelike.js';

/** Maximum regional visibility: 9 chunks × 16 tiles, one chunk of alignment,
 * 8 tiles of centre hysteresis and 8 tiles of actor/edge margin. Authority-owned. */
export const OUTDOOR_SIGHT_PADDING_TILES=176;

/** Durable value stored in outdoor_enemy_profile. It deliberately remains an
 * open string so a newly authored enemy does not require a server union edit. */
export type HearthEnemyKind=string;

export interface HearthEnemyProfile {
  readonly definitionId: string;
  readonly runtimeKind: string;
  readonly displayName: string;
  readonly npcKind: string;
  readonly health: number;
  readonly damageCenti: number;
  readonly pattern: EnemyAttackPattern;
  readonly rangeTiles: number;
  readonly aggroTiles: number;
  readonly speedPermille: number;
  readonly behavior: EnemyContentDefinition['behavior'];
}

export interface HearthEncounterDefinition {
  /** Durable outdoor_encounter primary key. */
  readonly id:string;
  readonly definitionId:string;
  readonly runtimeIndex:number;
  readonly tileX:number;readonly tileY:number;readonly radiusTiles:number;readonly elevation:number;
  readonly activation:'proximity'|'interact';readonly respawnDelayTicks:bigint;
  readonly roles:readonly string[];
  readonly completionStatistics: NonNullable<EncounterContentDefinition['completionStatistics']>;
  readonly members:readonly {readonly definitionId:string;readonly kind:HearthEnemyKind;readonly tileX:number;readonly tileY:number}[];
  readonly reward:EncounterRewardProfile;
  readonly summons?:{
    readonly phase:number;
    readonly definitionId:string;
    readonly kind:HearthEnemyKind;
    readonly offsets:readonly {readonly tileX:number;readonly tileY:number}[];
  };
}

const ENEMIES_BY_RUNTIME_KIND = new WeakMap<ContentRegistry, ReadonlyMap<string, EnemyContentDefinition>>();
const ENCOUNTERS_BY_RUNTIME_ID = new WeakMap<ContentRegistry, ReadonlyMap<string, EncounterContentDefinition>>();

function activeEnemiesByRuntimeKind(registry:ContentRegistry):ReadonlyMap<string,EnemyContentDefinition>{
  const cached=ENEMIES_BY_RUNTIME_KIND.get(registry);if(cached!==undefined)return cached;
  const rows=new Map<string,EnemyContentDefinition>();
  const ambiguous=new Set<string>();
  for(const definition of registry.enemies.values())if(definition.retired!==true){
    if(ambiguous.has(definition.runtimeKind))continue;
    if(rows.has(definition.runtimeKind)){rows.delete(definition.runtimeKind);ambiguous.add(definition.runtimeKind);continue;}
    rows.set(definition.runtimeKind,definition);
  }
  ENEMIES_BY_RUNTIME_KIND.set(registry,rows);return rows;
}
function activeEncountersByRuntimeId(registry:ContentRegistry):ReadonlyMap<string,EncounterContentDefinition>{
  const cached=ENCOUNTERS_BY_RUNTIME_ID.get(registry);if(cached!==undefined)return cached;
  const rows=new Map<string,EncounterContentDefinition>();
  for(const definition of registry.encounters.values())if(definition.retired!==true)rows.set(definition.runtimeId,definition);
  ENCOUNTERS_BY_RUNTIME_ID.set(registry,rows);return rows;
}

/** Explicit definition references never fall back to a same-slug bootstrap
 * row. Legacy profile rows without a definition id resolve by runtimeKind. */
export function runtimeHearthEnemyDefinition(
  registry:ContentRegistry,
  reference:string|{readonly enemyKind:string;readonly definitionId?:string},
):HearthEnemyProfile|null {
  const explicit=typeof reference==='string'&&reference.startsWith('enemy:')?reference
    :typeof reference==='object'?reference.definitionId:undefined;
  const runtimeKind=typeof reference==='string'&&!reference.startsWith('enemy:')?reference
    :typeof reference==='object'?reference.enemyKind:undefined;
  const definition=explicit!==undefined
    ? (explicit.startsWith('enemy:')?registry.enemies.get(explicit):undefined)
    : runtimeKind===undefined?undefined:activeEnemiesByRuntimeKind(registry).get(runtimeKind);
  if(definition===undefined||definition.retired===true)return null;
  return Object.freeze({definitionId:definition.id,runtimeKind:definition.runtimeKind,displayName:definition.displayName,
    npcKind:definition.npcKind,health:definition.health,damageCenti:definition.damageCenti,pattern:definition.pattern,
    rangeTiles:definition.rangeTiles,aggroTiles:definition.aggroTiles,speedPermille:definition.speedPermille,
    behavior:definition.behavior});
}

/** Resolves rogue NPC presentation kinds strictly through active enemy
 * authority. Multiple definitions may intentionally share a kind only when
 * their attack pattern agrees. Durable archetypes are retained state, not a
 * fallback content catalog: missing, retired, or conflicting definitions do
 * not regain compiled attack behavior. */
export function runtimeRogueEnemyAttackPattern(
  registry: ContentRegistry,
  npcKind: string,
  _archetype: RogueEnemyArchetype | string,
): EnemyAttackPattern | null {
  void _archetype;
  const authored = [...registry.enemies.values()].filter((definition) => (
    definition.npcKind === npcKind || definition.aliases?.includes(npcKind) === true
  ));
  const activePatterns = new Set(authored
    .filter((definition) => definition.retired !== true)
    .map((definition) => definition.pattern));
  if (activePatterns.size === 1) return [...activePatterns][0]!;
  return null;
}

function runtimeReward(definition:EncounterContentDefinition):EncounterRewardProfile {
  return Object.freeze({revision:definition.reward.revision,combatExperience:definition.reward.combatExperience,
    drops:Object.freeze(definition.reward.drops.map(drop=>Object.freeze({itemKind:drop.item.slice('item:'.length),
      minimum:drop.minimum,maximum:drop.maximum,chanceBasisPoints:drop.chanceBasisPoints})))});
}

function projectEncounter(registry:ContentRegistry,definition:EncounterContentDefinition):HearthEncounterDefinition|null {
  const members=[];
  for(const member of definition.members){
    const enemy=runtimeHearthEnemyDefinition(registry,member.enemy);if(enemy===null)return null;
    members.push(Object.freeze({definitionId:enemy.definitionId,kind:enemy.runtimeKind,tileX:member.tileX,tileY:member.tileY}));
  }
  let summons:HearthEncounterDefinition['summons'];
  if(definition.summons!==undefined){
    const enemy=runtimeHearthEnemyDefinition(registry,definition.summons.enemy);if(enemy===null)return null;
    summons=Object.freeze({phase:definition.summons.phase,definitionId:enemy.definitionId,kind:enemy.runtimeKind,
      offsets:Object.freeze(definition.summons.offsets.map(offset=>Object.freeze({...offset})))});
  }
  return Object.freeze({id:definition.runtimeId,definitionId:definition.id,runtimeIndex:definition.runtimeIndex,
    tileX:definition.tileX,tileY:definition.tileY,radiusTiles:definition.radiusTiles,elevation:definition.elevation,
    activation:definition.activation,respawnDelayTicks:BigInt(definition.respawnDelayTicks),roles:definition.roles,
    completionStatistics:Object.freeze((definition.completionStatistics ?? []).map(statistic=>Object.freeze({...statistic}))),
    members:Object.freeze(members),reward:runtimeReward(definition),...(summons===undefined?{}:{summons})});
}

export function runtimeHearthEncounterDefinition(registry:ContentRegistry,reference:string):HearthEncounterDefinition|null {
  const definition=reference.startsWith('encounter:')?registry.encounters.get(reference)
    :activeEncountersByRuntimeId(registry).get(reference);
  return definition===undefined||definition.retired===true?null:projectEncounter(registry,definition);
}

export function activeHearthEncounterDefinitions(registry:ContentRegistry):readonly HearthEncounterDefinition[] {
  return Object.freeze([...registry.encounters.values()].filter(definition=>definition.retired!==true)
    .sort((left,right)=>left.runtimeIndex-right.runtimeIndex)
    .flatMap(definition=>{const projected=projectEncounter(registry,definition);return projected===null?[]:[projected];}));
}

/** Bootstrap projections are explicit accessors so importing @orchard/sim is
 * dependency-safe. Production reducers resolve their subscribed registry and
 * tools/tests opt into bootstrap construction only when they need a fixture. */
export function bootstrapHearthEncounterDefinitions():readonly HearthEncounterDefinition[] {
  return activeHearthEncounterDefinitions(bootstrapContentRegistry());
}

export function bootstrapHearthEnemyProfiles():Readonly<Record<HearthEnemyKind,HearthEnemyProfile>> {
  const registry=bootstrapContentRegistry();
  return Object.freeze(Object.fromEntries(
    [...registry.enemies.values()].filter(definition=>definition.retired!==true).map(definition=>{
      const projected=runtimeHearthEnemyDefinition(registry,definition.id)!;
      return [projected.runtimeKind,projected];
    }),
  ));
}

let bootstrapEncounterCache:readonly HearthEncounterDefinition[]|null=null;
let bootstrapEnemyProfileCache:Readonly<Record<HearthEnemyKind,HearthEnemyProfile>>|null=null;

/** @deprecated Runtime authority must use its subscribed registry. This lazy
 * compatibility view exists for authoring tools and preserved test fixtures. */
export const HEARTH_ENCOUNTERS:readonly HearthEncounterDefinition[]=new Proxy(
  [] as HearthEncounterDefinition[],
  {get:(_target,key)=>{
    bootstrapEncounterCache??=bootstrapHearthEncounterDefinitions();
    const value=Reflect.get(bootstrapEncounterCache,key,bootstrapEncounterCache);
    return typeof value==='function'?value.bind(bootstrapEncounterCache):value;
  }},
);

/** @deprecated Runtime authority must use its subscribed registry. */
export const HEARTH_ENEMY_PROFILES:Readonly<Record<HearthEnemyKind,HearthEnemyProfile>>=new Proxy(
  Object.create(null) as Record<HearthEnemyKind,HearthEnemyProfile>,
  {get:(_target,key)=>{
    bootstrapEnemyProfileCache??=bootstrapHearthEnemyProfiles();
    return Reflect.get(bootstrapEnemyProfileCache,key,bootstrapEnemyProfileCache);
  }},
);
