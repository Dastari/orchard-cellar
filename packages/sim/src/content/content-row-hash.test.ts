import { describe, expect, it } from 'vitest';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry, contentDefinitionRowsHash, contentDefinitionsHash } from './registry.js';

function fixture() {
  const row = bootstrapContentRows().find(({ id }) => id === 'item:wood')!;
  return { ...row, json: JSON.parse(row.json as string) as Record<string, unknown> };
}

describe('durable content definition hashing', () => {
  it('keeps parser defaults separate from original durable JSON integrity', () => {
    const row = fixture();
    delete row.json['onUse'];
    const built = buildContentRegistry([row]);
    expect(built.report.valid).toBe(true);
    expect(built.registry.items.get(row.id)?.onUse).toEqual([]);
    expect(JSON.parse(JSON.stringify(built.registry.items.get(row.id)))).not.toHaveProperty('onUse');
    expect(built.registry.contentHash).toBe(contentDefinitionsHash([...built.registry.definitions.values()]));
    expect(contentDefinitionRowsHash([row])).toBe(built.registry.contentHash);
    expect(contentDefinitionRowsHash([{ ...row, json: { ...row.json, onUse: [] } }]))
      .not.toBe(built.registry.contentHash);
  });

  it('preserves unknown nested fields and ignores JSON whitespace and key/row ordering', () => {
    const row = fixture();
    const extra = { ...row, id: 'item:other_wood', slug: 'other_wood', json: {
      ...row.json, id: 'item:other_wood', future: { b: [2, 1], a: { note: 'preserve me' } },
    } };
    const reordered = { ...extra, json: JSON.stringify({
      ...Object.fromEntries(Object.entries(extra.json).reverse()),
      future: { a: { note: 'preserve me' }, b: [2, 1] },
    }, null, 2) };
    expect(contentDefinitionRowsHash([row, extra])).toBe(contentDefinitionRowsHash([reordered, row]));
    expect(buildContentRegistry([extra]).registry.contentHash)
      .toBe(buildContentRegistry([{ ...extra, json: { ...extra.json, future: 'tampered' } }]).registry.contentHash);
    expect(contentDefinitionRowsHash([extra]))
      .not.toBe(contentDefinitionRowsHash([{ ...extra, json: { ...extra.json, future: 'tampered' } }]));
  });

  it('rejects malformed JSON, invalid payloads, identity drift and duplicate rows', () => {
    const row = fixture();
    for (const json of ['{', 'null', '[]', '"text"', { ...row.json, extra: undefined },
      { ...row.json, extra: Number.POSITIVE_INFINITY }, { ...row.json, extra: 1n },
      { ...row.json, id: 'invalid id' }, { ...row.json, id: 'item:another' },
      { ...row.json, kind: 'crop' }]) {
      expect(() => contentDefinitionRowsHash([{ ...row, json }])).toThrow();
    }
    expect(() => contentDefinitionRowsHash([{ ...row, slug: 'wrong' }])).toThrow();
    expect(() => contentDefinitionRowsHash([row, row])).toThrow();
    const circular: Record<string, unknown> = { ...row.json };
    circular['cycle'] = circular;
    expect(() => contentDefinitionRowsHash([{ ...row, json: circular }])).toThrow();
  });
});
