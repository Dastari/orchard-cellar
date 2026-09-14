import { ContentParseError } from './parse-contract.js';
import { definitionSlug } from './definition-id.js';
import type { ContentDefinitionRow, SupportedContentDefinition } from './definitions.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(source[key])}`
  )).join(',')}}`;
}

/** Platform-neutral FNV-1a keeps the registry deterministic in browsers and
 * the SpaceTimeDB runtime. A cryptographic publish hash can wrap these bytes. */
export function contentDefinitionsHash(definitions: readonly SupportedContentDefinition[]): string {
  return hashCanonicalDefinitions(definitions.map((definition) => {
    if (definition.kind !== 'item' || definition.quality !== 'common') return definition;
    const { quality, ...canonical } = definition;
    void quality;
    return canonical;
  }));
}

/** Fingerprints the immutable row topology independently of payload JSON. It
 * identifies historical pack lineages without weakening raw payload hashes. */
export function contentDefinitionRowIdentityHash(rows:readonly ContentDefinitionRow[]):string{
  return hashCanonicalDefinitions(rows.map(row=>({id:row.id,kind:row.kind})));
}

function hashCanonicalDefinitions(definitions: readonly { readonly id: string }[]): string {
  const canonical = [...definitions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(canonicalJson)
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function assertJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)) {
    throw new ContentParseError('invalid_json', '$', 'content row must contain a JSON value');
  }
  ancestors.add(value);
  for (const child of Object.values(value)) assertJsonValue(child, ancestors);
  ancestors.delete(value);
}

/** Hashes the exact durable JSON definitions before parser defaults or upgrades.
 * Unknown JSON fields remain part of this integrity check. Semantic validation
 * and ContentRegistry.contentHash deliberately remain a separate contract.
 */
export function contentDefinitionRowsHash(rows: readonly ContentDefinitionRow[]): string {
  const ids = new Set<string>();
  const definitions = rows.map((row) => {
    let value: unknown;
    try {
      value = typeof row.json === 'string' ? JSON.parse(row.json) : row.json;
    } catch {
      throw new ContentParseError('invalid_json', '$', 'content row contains malformed JSON');
    }
    assertJsonValue(value);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ContentParseError('invalid_type', '$', 'expected a content definition object');
    }
    const definition = value as Record<string, unknown>;
    const id = definition['id'];
    const slug = typeof id === 'string' ? definitionSlug(id) : null;
    if (typeof id !== 'string' || slug === null || ids.has(id)) {
      throw new ContentParseError('invalid_id', '$.id', 'invalid or duplicate content definition id');
    }
    if (id !== row.id || definition['kind'] !== row.kind
      || !id.startsWith(`${row.kind}:`) || (row.slug !== undefined && row.slug !== slug)) {
      throw new ContentParseError('kind_mismatch', '$.id', 'row identity does not match its JSON definition');
    }
    ids.add(id);
    return { ...definition, id };
  });
  return hashCanonicalDefinitions(definitions);
}
