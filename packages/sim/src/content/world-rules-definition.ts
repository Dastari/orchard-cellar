import type { TraversalPolicy } from '../traversal.js';
import { ContentParseError } from './parse-contract.js';
import { parseTraversalAbilities, parseTraversalPolicy } from './traversal-definition.js';

export type WorldRulesDefinitionId = `world_rules:${string}`;
export interface WorldRulesContentDefinition {
  readonly id: WorldRulesDefinitionId;
  readonly kind: 'world_rules';
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: WorldRulesDefinitionId;
  readonly profile: 'traversal';
  /** Activation is an authored, reviewed content change after shadow parity. */
  readonly mode: 'shadow' | 'active';
  readonly playerAbilities: readonly string[];
  readonly projectileAbilities: readonly string[];
  readonly media: TraversalPolicy;
}
export function parseWorldRulesDefinition(value: string | unknown): WorldRulesContentDefinition {
  let source: unknown = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source) as unknown; }
    catch { throw new ContentParseError('invalid_json', '$', 'invalid world rules JSON'); }
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new ContentParseError('invalid_type', '$', 'expected world rules object');
  }
  const row = source as Record<string, unknown>;
  for (const key of Object.keys(row)) if (!['id', 'kind', 'schemaVersion', 'retired', 'replacement', 'profile', 'mode', 'playerAbilities', 'projectileAbilities', 'media'].includes(key)) {
    throw new ContentParseError('invalid_type', `$.${key}`, 'unknown field');
  }
  if (row.kind !== 'world_rules') throw new ContentParseError('kind_mismatch', '$.kind', 'expected world_rules');
  if (row.schemaVersion !== 1) throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'expected schema 1');
  if (typeof row.id !== 'string' || !/^world_rules:[a-z0-9][a-z0-9_]*$/u.test(row.id)) {
    throw new ContentParseError('invalid_id', '$.id', 'expected world_rules identifier');
  }
  if (row.profile !== 'traversal') throw new ContentParseError('invalid_type', '$.profile', 'expected traversal profile');
  if (row.mode !== 'shadow' && row.mode !== 'active') throw new ContentParseError('invalid_type', '$.mode', 'expected shadow or active');
  if (row.retired !== undefined && typeof row.retired !== 'boolean') throw new ContentParseError('invalid_type', '$.retired', 'expected boolean');
  if (row.replacement !== undefined && (typeof row.replacement !== 'string' || !/^world_rules:[a-z0-9][a-z0-9_]*$/u.test(row.replacement))) {
    throw new ContentParseError('invalid_id', '$.replacement', 'expected world_rules identifier');
  }
  return Object.freeze({
    id: row.id as WorldRulesDefinitionId, kind: 'world_rules', schemaVersion: 1, profile: 'traversal', mode: row.mode,
    ...(row.retired === undefined ? {} : { retired: row.retired }),
    ...(row.replacement === undefined ? {} : { replacement: row.replacement as WorldRulesDefinitionId }),
    playerAbilities: parseTraversalAbilities(row.playerAbilities, '$.playerAbilities'),
    projectileAbilities: parseTraversalAbilities(row.projectileAbilities, '$.projectileAbilities'),
    media: parseTraversalPolicy(row.media),
  });
}
