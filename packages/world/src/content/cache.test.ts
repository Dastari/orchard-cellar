import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, buildContentRegistry, contentDefinitionRowsHash } from '@orchard/sim';
import { contentRegistryForRows, invalidateContentRegistryCache } from './cache.js';

describe('revision-keyed content registry cache', () => {
  it('reads durable rows once across repeated lookups and reloads on every head change or invalidation', () => {
    invalidateContentRegistryCache();
    const rows = bootstrapContentRows();
    let reads = 0;
    const readRows = () => { reads += 1; return rows; };
    const head = { packId: 'live', revision: 1n, contentHash: contentDefinitionRowsHash(rows) };
    const first = contentRegistryForRows(head, readRows);
    for (let index = 0; index < 100; index += 1) {
      expect(contentRegistryForRows({ ...head }, readRows)).toBe(first);
    }
    expect(reads).toBe(1);

    const advanced = contentRegistryForRows({ ...head, revision: 2n }, readRows);
    expect(advanced).not.toBe(first);
    expect(reads).toBe(2);
    const otherPack = contentRegistryForRows({ ...head, packId: 'other' }, readRows);
    expect(otherPack).not.toBe(advanced);
    expect(reads).toBe(3);
    invalidateContentRegistryCache();
    expect(contentRegistryForRows({ ...head, packId: 'other' }, readRows)).not.toBe(otherPack);
    expect(reads).toBe(4);
  });

  it('validates changed hashes and rereads an earlier head after a transaction rollback', () => {
    invalidateContentRegistryCache();
    const rows = bootstrapContentRows();
    const head = { packId: 'live', revision: 1n, contentHash: contentDefinitionRowsHash(rows) };
    const original = contentRegistryForRows(head, () => rows);
    const changedRows = rows.map((row) => row.id !== 'item:wood' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)), displayName: 'Changed Wood' }),
    });
    const changedHead = { ...head, contentHash: contentDefinitionRowsHash(changedRows) };
    let reads = 0;
    const changed = contentRegistryForRows(changedHead, () => { reads += 1; return changedRows; });
    expect(reads).toBe(1);
    expect(changed.registry.items.get('item:wood')?.displayName).toBe('Changed Wood');
    expect(() => contentRegistryForRows({ ...changedHead, revision: 2n }, () => {
      reads += 1; return rows;
    })).toThrow('content_registry_hash_mismatch');
    expect(reads).toBe(2);
    expect(contentRegistryForRows(changedHead, () => { throw new Error('unexpected reread'); })).toBe(changed);

    // A failed transaction may have warmed a newer head; the next transaction
    // observes the old durable head and must rebuild from its own row snapshot.
    const restored = contentRegistryForRows(head, () => { reads += 1; return rows; });
    expect(reads).toBe(3);
    expect(restored.registry.items.get('item:wood')?.displayName)
      .toBe(original.registry.items.get('item:wood')?.displayName);
    expect(restored.contentHash).toBe(head.contentHash);
  });

  it('reuses one registry per revision and hash and rebuilds after head advance', () => {
    invalidateContentRegistryCache();
    const rows = bootstrapContentRows();
    const contentHash = buildContentRegistry(rows).registry.contentHash;
    const first = contentRegistryForRows({ packId: 'live', revision: 1n, contentHash }, rows);
    const repeated = contentRegistryForRows({ packId: 'live', revision: 1n, contentHash }, [...rows].reverse());
    const advanced = contentRegistryForRows({ packId: 'live', revision: 2n, contentHash }, rows);
    expect(repeated).toBe(first);
    expect(advanced).not.toBe(first);
    expect(advanced.registry.contentHash).toBe(first.registry.contentHash);
  });

  it('uses the compiled bootstrap only when no durable head exists', () => {
    invalidateContentRegistryCache();
    const fallback = contentRegistryForRows(null, []);
    expect(fallback.revision).toBe(0n);
    expect(fallback.registry.definitions.size).toBeGreaterThan(200);
    expect(() => contentRegistryForRows({ packId: 'live', revision: 1n, contentHash: 'wrong' }, []))
      .toThrow(/content_registry_/u);
  });

  it('verifies historical persisted JSON before projecting new parser defaults', () => {
    invalidateContentRegistryCache();
    const rows = bootstrapContentRows().map((row) => {
      if (row.id !== 'item:wood') return row;
      const payload = JSON.parse(String(row.json)) as Record<string, unknown>;
      payload['quality'] = 'common';
      return { ...row, json: JSON.stringify(payload) };
    });
    const contentHash = contentDefinitionRowsHash(rows);
    const normalizedHash = buildContentRegistry(rows).registry.contentHash;
    expect(contentHash).not.toBe(normalizedHash);
    const cached = contentRegistryForRows({ packId: 'live', revision: 1n, contentHash }, rows);
    expect(cached.contentHash).toBe(contentHash);
    expect(cached.registry.items.get('item:wood')?.onUse).toEqual([]);
    invalidateContentRegistryCache();
    expect(() => contentRegistryForRows({ packId: 'live', revision: 1n, contentHash: normalizedHash }, rows))
      .toThrow('content_registry_hash_mismatch');
  });
});
