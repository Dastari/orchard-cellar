import { describe, expect, it } from 'vitest';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { parseContentDefinition, SUPPORTED_CONTENT_KINDS } from './definitions.js';
import { CONTENT_FIELD_SCHEMAS, contentFieldErrors, contentReferenceIndex } from './field-schema.js';

describe('type-derived content field schemas', () => {
  it('covers every supported kind and agrees with parsers on all bootstrap definitions', () => {
    expect(Object.keys(CONTENT_FIELD_SCHEMAS.roots).sort()).toEqual([...SUPPORTED_CONTENT_KINDS].sort());
    for (const definition of bootstrapContentDefinitions()) {
      const parsed = parseContentDefinition(definition.kind, definition);
      expect(contentFieldErrors(CONTENT_FIELD_SCHEMAS, CONTENT_FIELD_SCHEMAS.roots[definition.kind]!, parsed), definition.id).toEqual([]);
    }
  });
  it('indexes only typed references, including arrays, without counting IDs or prose', () => {
    const item = bootstrapContentDefinitions().find(value => value.kind === 'item')!;
    const recipe = { id: 'recipe:test', kind: 'recipe', schemaVersion: 1, recipeKind: 'shapeless', inputs: [{ item: item.id, count: 2 }], output: { item: item.id, count: 1 } };
    const index = contentReferenceIndex(CONTENT_FIELD_SCHEMAS, [item, recipe]);
    expect(index.get(item.id)?.filter(use => use.sourceId === recipe.id).map(use => use.path)).toEqual(['inputs[0].item', 'output.item']);
    expect(index.get(item.id)?.some(use => use.path === 'id')).toBe(false);
  });
});
