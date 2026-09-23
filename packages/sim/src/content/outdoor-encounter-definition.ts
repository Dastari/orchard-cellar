import { parseTraversalAbilities } from './traversal-definition.js';
import type { EnemyAttackPattern } from '../combat-actions.js';
import { CONTENT_SCHEMA_VERSION, ContentParseError } from './parse-contract.js';

export type EnemyDefinitionId = `enemy:${string}`;
export type EncounterDefinitionId = `encounter:${string}`;

interface OutdoorDefinitionBase<K extends 'enemy' | 'encounter', I extends string> {
  readonly id: I;
  readonly kind: K;
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly retired?: boolean;
  readonly replacement?: I;
}

export type EnemyBehaviorEngine = 'pursue' | 'kite' | 'orbit' | 'warden';
export type EnemyDelveTheme = 'cave' | 'volcanic' | 'dungeon';
export type EnemyDelveArchetype = 'm' | 'r' | 'g' | 'f';
export type EnemyDelvePoolEntry = readonly [
  npcKind: string,
  displayName: string,
  archetype: EnemyDelveArchetype,
  health: number,
  damage: number,
  speedPermille: number,
];
export type EnemyDelvePool = readonly [
  theme: EnemyDelveTheme,
  entries: readonly EnemyDelvePoolEntry[],
];

/** Authored parameters for the trusted outdoor-combat engine. `runtimeKind`
 * remains stable across authoring-id renames because existing profile rows
 * persist it. */
export interface EnemyContentDefinition extends OutdoorDefinitionBase<'enemy', EnemyDefinitionId> {
  readonly traversalAbilities?: readonly string[];
  readonly runtimeKind: string;
  readonly displayName: string;
  readonly npcKind: string;
  /** Additional persisted NPC presentation kinds sharing this attack family. */
  readonly aliases?: readonly string[];
  readonly health: number;
  readonly damageCenti: number;
  readonly pattern: EnemyAttackPattern;
  readonly rangeTiles: number;
  readonly aggroTiles: number;
  readonly speedPermille: number;
  readonly behavior: {
    readonly engine: EnemyBehaviorEngine;
    readonly minimumAttackRangeTiles: number;
    readonly repositionTicks: number;
    readonly retreatBelowTiles?: number;
    readonly holdWithinTiles?: number;
    readonly orbitWithinTiles?: number;
    readonly alternateAttack?: {
      readonly cycleModulo: number;
      readonly cycle: number;
      readonly pattern: EnemyAttackPattern;
      readonly damageCenti: number;
    };
  };
  /** One active definition may own the complete deterministic Delve catalog.
   * Compact tuples keep initial subscription payload bounded. */
  readonly delvePools?: readonly EnemyDelvePool[];
}

export interface EncounterRewardContentDefinition {
  readonly revision: string;
  readonly combatExperience: number;
  readonly drops: readonly {
    readonly item: `item:${string}`;
    readonly minimum: number;
    readonly maximum: number;
    readonly chanceBasisPoints: number;
  }[];
}

/** `runtimeId` is the durable outdoor_encounter primary key. Definition ids
 * may be renamed while that key, generations, contributions and claims stay
 * intact. */
export interface EncounterContentDefinition extends OutdoorDefinitionBase<'encounter', EncounterDefinitionId> {
  readonly runtimeId: string;
  /** Stable deterministic NPC-id block. Never renumber after publication. */
  readonly runtimeIndex: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly radiusTiles: number;
  readonly elevation: number;
  readonly activation: 'proximity' | 'interact';
  readonly respawnDelayTicks: number;
  readonly roles: readonly string[];
  readonly members: readonly {
    readonly enemy: EnemyDefinitionId;
    readonly tileX: number;
    readonly tileY: number;
  }[];
  readonly reward: EncounterRewardContentDefinition;
  /** Durable progression receipts emitted for every eligible participant in
   * the same completion transaction as their reward claim. */
  readonly completionStatistics?: readonly {
    readonly kind: string;
    readonly subject?: string;
    readonly delta: number;
  }[];
  readonly summons?: {
    readonly phase: number;
    readonly enemy: EnemyDefinitionId;
    readonly offsets: readonly { readonly tileX: number; readonly tileY: number }[];
  };
}

const ID = /^(?:enemy|encounter|item):[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const ATTACK_PATTERNS = new Set<EnemyAttackPattern>(['charge', 'bolt', 'dive', 'pulse', 'burst']);
const BEHAVIOR_ENGINES = new Set<EnemyBehaviorEngine>(['pursue', 'kite', 'orbit', 'warden']);

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentParseError('invalid_type', path, 'expected object');
  }
  return value as Record<string, unknown>;
}
function decoded(value: string | unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; }
  catch (error) {
    throw new ContentParseError('invalid_json', '$', error instanceof Error ? error.message : 'invalid JSON');
  }
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ContentParseError('invalid_type', path, 'expected non-empty string');
  return value;
}
function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ContentParseError('invalid_type', path, `expected safe integer >= ${minimum}`);
  }
  return value as number;
}
function number(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new ContentParseError('invalid_type', path, `expected finite number >= ${minimum}`);
  }
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ContentParseError('invalid_type', path, 'expected boolean');
  return value;
}
function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ContentParseError('invalid_type', path, 'expected array');
  return value;
}
function reference<P extends 'enemy' | 'encounter' | 'item'>(value: unknown, prefix: P, path: string): `${P}:${string}` {
  const result = string(value, path);
  if (!ID.test(result) || !result.startsWith(`${prefix}:`)) {
    throw new ContentParseError('invalid_id', path, `expected ${prefix}: slug`);
  }
  return result as `${P}:${string}`;
}
function attackPattern(value: unknown, path: string): EnemyAttackPattern {
  const result = string(value, path) as EnemyAttackPattern;
  if (!ATTACK_PATTERNS.has(result)) throw new ContentParseError('invalid_type', path, 'unknown enemy attack pattern');
  return result;
}
function sourceFor<K extends 'enemy' | 'encounter'>(value: string | unknown, kind: K): Record<string, unknown> {
  const source = object(decoded(value), '$');
  if (source.kind !== kind) throw new ContentParseError('kind_mismatch', '$.kind', `expected ${kind}`);
  if (source.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'only schema version 1 is supported');
  }
  reference(source.id, kind, '$.id');
  return source;
}
function base<K extends 'enemy' | 'encounter'>(source: Record<string, unknown>, kind: K) {
  return {
    id: reference(source.id, kind, '$.id'), kind, schemaVersion: CONTENT_SCHEMA_VERSION,
    ...(source.retired === undefined ? {} : { retired: boolean(source.retired, '$.retired') }),
    ...(source.replacement === undefined ? {} : { replacement: reference(source.replacement, kind, '$.replacement') }),
  };
}

export function parseEnemyDefinition(value: string | unknown): EnemyContentDefinition {
  const source = sourceFor(value, 'enemy');
  const behavior = object(source.behavior, '$.behavior');
  const engine = string(behavior.engine, '$.behavior.engine') as EnemyBehaviorEngine;
  if (!BEHAVIOR_ENGINES.has(engine)) throw new ContentParseError('invalid_type', '$.behavior.engine', 'unknown enemy behavior engine');
  let alternateAttack: EnemyContentDefinition['behavior']['alternateAttack'];
  if (behavior.alternateAttack !== undefined) {
    const alternate = object(behavior.alternateAttack, '$.behavior.alternateAttack');
    const cycleModulo = integer(alternate.cycleModulo, '$.behavior.alternateAttack.cycleModulo', 1);
    const cycle = integer(alternate.cycle, '$.behavior.alternateAttack.cycle');
    if (cycle >= cycleModulo) throw new ContentParseError('invalid_type', '$.behavior.alternateAttack.cycle', 'cycle must be less than cycleModulo');
    alternateAttack = {
      cycleModulo, cycle,
      pattern: attackPattern(alternate.pattern, '$.behavior.alternateAttack.pattern'),
      damageCenti: integer(alternate.damageCenti, '$.behavior.alternateAttack.damageCenti', 1),
    };
  }
  let delvePools: readonly EnemyDelvePool[] | undefined;
  if (source.delvePools !== undefined) {
    const themes = new Set<EnemyDelveTheme>();
    delvePools = Object.freeze(array(source.delvePools, '$.delvePools').map((value, poolIndex) => {
      const path = `$.delvePools[${poolIndex}]`;
      const pool = array(value, path);
      if (pool.length !== 2) throw new ContentParseError('invalid_type', path, 'expected [theme, entries]');
      const theme = string(pool[0], `${path}[0]`) as EnemyDelveTheme;
      if (theme !== 'cave' && theme !== 'volcanic' && theme !== 'dungeon') {
        throw new ContentParseError('invalid_type', `${path}[0]`, 'unknown Delve theme');
      }
      if (themes.has(theme)) throw new ContentParseError('invalid_type', `${path}[0]`, 'duplicate Delve theme');
      themes.add(theme);
      const entries = Object.freeze(array(pool[1], `${path}[1]`).map((value, entryIndex) => {
        const entryPath = `${path}[1][${entryIndex}]`;
        const entry = array(value, entryPath);
        if (entry.length !== 6) {
          throw new ContentParseError('invalid_type', entryPath, 'expected six Delve enemy fields');
        }
        const archetype = string(entry[2], `${entryPath}[2]`) as EnemyDelveArchetype;
        if (archetype !== 'm' && archetype !== 'r' && archetype !== 'g' && archetype !== 'f') {
          throw new ContentParseError('invalid_type', `${entryPath}[2]`, 'unknown Delve archetype');
        }
        return Object.freeze([
          string(entry[0], `${entryPath}[0]`),
          string(entry[1], `${entryPath}[1]`),
          archetype,
          integer(entry[3], `${entryPath}[3]`, 1),
          integer(entry[4], `${entryPath}[4]`, 1),
          integer(entry[5], `${entryPath}[5]`, 1),
        ] as const);
      }));
      if (entries.length === 0) throw new ContentParseError('invalid_type', `${path}[1]`, 'Delve pool must not be empty');
      return Object.freeze([theme, entries] as const);
    }));
    if (delvePools.length !== 3 || themes.size !== 3) {
      throw new ContentParseError('invalid_type', '$.delvePools', 'complete cave, volcanic and dungeon pools required');
    }
  }
  return Object.freeze({
    ...base(source, 'enemy'),
    ...(source.traversalAbilities === undefined ? {} : { traversalAbilities: parseTraversalAbilities(source.traversalAbilities) }),
    runtimeKind: string(source.runtimeKind, '$.runtimeKind'),
    displayName: string(source.displayName, '$.displayName'),
    npcKind: string(source.npcKind, '$.npcKind'),
    ...(source.aliases === undefined ? {} : {
      aliases: Object.freeze(array(source.aliases, '$.aliases')
        .map((alias, index) => string(alias, `$.aliases[${index}]`))),
    }),
    health: integer(source.health, '$.health', 1),
    damageCenti: integer(source.damageCenti, '$.damageCenti', 1),
    pattern: attackPattern(source.pattern, '$.pattern'),
    rangeTiles: number(source.rangeTiles, '$.rangeTiles', Number.EPSILON),
    aggroTiles: number(source.aggroTiles, '$.aggroTiles'),
    speedPermille: integer(source.speedPermille, '$.speedPermille', 1),
    behavior: {
      engine,
      minimumAttackRangeTiles: number(behavior.minimumAttackRangeTiles, '$.behavior.minimumAttackRangeTiles'),
      repositionTicks: integer(behavior.repositionTicks, '$.behavior.repositionTicks'),
      ...(behavior.retreatBelowTiles === undefined ? {} : { retreatBelowTiles: number(behavior.retreatBelowTiles, '$.behavior.retreatBelowTiles') }),
      ...(behavior.holdWithinTiles === undefined ? {} : { holdWithinTiles: number(behavior.holdWithinTiles, '$.behavior.holdWithinTiles') }),
      ...(behavior.orbitWithinTiles === undefined ? {} : { orbitWithinTiles: number(behavior.orbitWithinTiles, '$.behavior.orbitWithinTiles') }),
      ...(alternateAttack === undefined ? {} : { alternateAttack }),
    },
    ...(delvePools === undefined ? {} : { delvePools }),
  });
}

function reward(value: unknown): EncounterRewardContentDefinition {
  const source = object(value, '$.reward');
  return {
    revision: string(source.revision, '$.reward.revision'),
    combatExperience: integer(source.combatExperience, '$.reward.combatExperience'),
    drops: array(source.drops, '$.reward.drops').map((value, index) => {
      const path = `$.reward.drops[${index}]`, drop = object(value, path);
      const minimum = integer(drop.minimum, `${path}.minimum`);
      const maximum = integer(drop.maximum, `${path}.maximum`);
      if (maximum < minimum) throw new ContentParseError('invalid_type', `${path}.maximum`, 'maximum must be at least minimum');
      return {
        item: reference(drop.item, 'item', `${path}.item`), minimum, maximum,
        chanceBasisPoints: integer(drop.chanceBasisPoints, `${path}.chanceBasisPoints`),
      };
    }),
  };
}

export function parseEncounterDefinition(value: string | unknown): EncounterContentDefinition {
  const source = sourceFor(value, 'encounter');
  const activation = string(source.activation, '$.activation');
  if (activation !== 'proximity' && activation !== 'interact') {
    throw new ContentParseError('invalid_type', '$.activation', 'unknown encounter activation');
  }
  let summons: EncounterContentDefinition['summons'];
  if (source.summons !== undefined) {
    const authored = object(source.summons, '$.summons');
    summons = {
      phase: integer(authored.phase, '$.summons.phase', 1),
      enemy: reference(authored.enemy, 'enemy', '$.summons.enemy'),
      offsets: array(authored.offsets, '$.summons.offsets').map((value, index) => {
        const path = `$.summons.offsets[${index}]`, offset = object(value, path);
        return {
          tileX: integer(offset.tileX, `${path}.tileX`, Number.MIN_SAFE_INTEGER),
          tileY: integer(offset.tileY, `${path}.tileY`, Number.MIN_SAFE_INTEGER),
        };
      }),
    };
  }
  return Object.freeze({
    ...base(source, 'encounter'),
    runtimeId: string(source.runtimeId, '$.runtimeId'),
    runtimeIndex: integer(source.runtimeIndex, '$.runtimeIndex'),
    tileX: integer(source.tileX, '$.tileX', Number.MIN_SAFE_INTEGER),
    tileY: integer(source.tileY, '$.tileY', Number.MIN_SAFE_INTEGER),
    radiusTiles: integer(source.radiusTiles, '$.radiusTiles', 1),
    elevation: integer(source.elevation, '$.elevation', Number.MIN_SAFE_INTEGER),
    activation,
    respawnDelayTicks: integer(source.respawnDelayTicks, '$.respawnDelayTicks', 1),
    roles: array(source.roles, '$.roles').map((role, index) => string(role, `$.roles[${index}]`)),
    members: array(source.members, '$.members').map((value, index) => {
      const path = `$.members[${index}]`, member = object(value, path);
      return {
        enemy: reference(member.enemy, 'enemy', `${path}.enemy`),
        tileX: integer(member.tileX, `${path}.tileX`, Number.MIN_SAFE_INTEGER),
        tileY: integer(member.tileY, `${path}.tileY`, Number.MIN_SAFE_INTEGER),
      };
    }),
    reward: reward(source.reward),
    ...(source.completionStatistics === undefined ? {} : {
      completionStatistics: array(source.completionStatistics, '$.completionStatistics').map((value, index) => {
        const path = `$.completionStatistics[${index}]`;
        const statistic = object(value, path);
        return {
          kind: string(statistic.kind, `${path}.kind`),
          ...(statistic.subject === undefined ? {} : { subject: string(statistic.subject, `${path}.subject`) }),
          delta: integer(statistic.delta, `${path}.delta`, 1),
        };
      }),
    }),
    ...(summons === undefined ? {} : { summons }),
  });
}
