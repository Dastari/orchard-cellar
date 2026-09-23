import { RULE_MEDIA } from '../rule-catalogue.js';
import type { MediumTraversalRule, TraversalPolicy } from '../traversal.js';
import { ContentParseError } from './parse-contract.js';

const fail = (path: string, message: string): never => {
  throw new ContentParseError('invalid_type', path, message);
};
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected object');
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string, maximum = 32): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(path, `expected array of at most ${maximum} entries`);
  return value;
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(value)) return fail(path, 'expected stable ability identifier');
  return value;
}
function positiveInteger(value: unknown, path: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > maximum) return fail(path, 'expected positive bounded integer');
  return value;
}
function keys(source: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown field');
}
export function parseTraversalAbilities(value: unknown, path = '$.traversalAbilities'): readonly string[] {
  const result = array(value, path).map((entry, index) => identifier(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length) return fail(path, 'duplicate ability');
  return Object.freeze(result);
}

/** Complete media policy is required: adding a medium cannot silently grant access. */
export function parseTraversalPolicy(value: unknown, path = '$.media'): TraversalPolicy {
  const source = object(value, path);
  keys(source, RULE_MEDIA, path);
  const entries = RULE_MEDIA.map(medium => {
    const location = `${path}.${medium}`;
    const rule = object(source[medium], location);
    keys(rule, ['requiresAny', 'hazards'], location);
    const requiresAny = Object.freeze(array(rule.requiresAny, `${location}.requiresAny`)
      .map((clause, index) => parseTraversalAbilities(clause, `${location}.requiresAny[${index}]`)));
    const hazards = Object.freeze(array(rule.hazards, `${location}.hazards`, 16).map((value, index) => {
      const p = `${location}.hazards[${index}]`;
      const hazard = object(value, p);
      keys(hazard, ['id', 'maxHealthBasisPointsPerSecond', 'intervalTicks', 'immunityAbilities'], p);
      return Object.freeze({
        id: identifier(hazard.id, `${p}.id`),
        maxHealthBasisPointsPerSecond: positiveInteger(hazard.maxHealthBasisPointsPerSecond, `${p}.maxHealthBasisPointsPerSecond`, 100_000),
        intervalTicks: positiveInteger(hazard.intervalTicks, `${p}.intervalTicks`, 1_200),
        immunityAbilities: parseTraversalAbilities(hazard.immunityAbilities, `${p}.immunityAbilities`),
      });
    }));
    if (new Set(hazards.map(hazard => hazard.id)).size !== hazards.length) fail(location, 'duplicate hazard');
    return [medium, Object.freeze({ requiresAny, hazards })] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<typeof RULE_MEDIA[number], MediumTraversalRule>>;
}
