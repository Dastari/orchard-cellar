import type { SupportedContentDefinition } from '@orchard/sim';
import type { DefinitionDiff } from './contracts.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(source[key])}`
  )).join(',')}}`;
}

function changedPaths(before: unknown, after: unknown, path = '$'): readonly string[] {
  if (canonicalJson(before) === canonicalJson(after)) return [];
  if (Array.isArray(before) || Array.isArray(after)
    || typeof before !== 'object' || before === null
    || typeof after !== 'object' || after === null) return [path];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((key) => changedPaths(left[key], right[key], `${path}.${key}`));
}

export function diffContentDefinitions(
  before: readonly SupportedContentDefinition[],
  after: readonly SupportedContentDefinition[],
): readonly DefinitionDiff[] {
  const left = new Map<string, SupportedContentDefinition>(before.map((definition) => [definition.id, definition]));
  const right = new Map<string, SupportedContentDefinition>(after.map((definition) => [definition.id, definition]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((id): readonly DefinitionDiff[] => {
      const previous = left.get(id);
      const next = right.get(id);
      if (previous === undefined && next !== undefined) return [{
        id, kind: 'create', definitionKind: next.kind, changedPaths: ['$'], after: next,
      }];
      if (previous !== undefined && next === undefined) return [{
        id, kind: 'delete', definitionKind: previous.kind, changedPaths: ['$'], before: previous,
      }];
      if (previous === undefined || next === undefined) return [];
      const paths = changedPaths(previous, next);
      return paths.length === 0 ? [] : [{
        id, kind: 'update', definitionKind: next.kind, changedPaths: paths, before: previous, after: next,
      }];
    });
}

export function applyDefinitionChangeSet(
  definitions: readonly SupportedContentDefinition[],
  changeSet: {
    readonly upserts: readonly SupportedContentDefinition[];
    readonly deletes: readonly string[];
  },
): readonly SupportedContentDefinition[] {
  const result = new Map<string, SupportedContentDefinition>(definitions.map((definition) => [definition.id, definition]));
  for (const definition of changeSet.upserts) result.set(definition.id, definition);
  for (const id of changeSet.deletes) result.delete(id);
  return [...result.values()].sort((left, right) => left.id.localeCompare(right.id));
}
