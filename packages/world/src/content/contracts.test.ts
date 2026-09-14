import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, buildContentRegistry, contentDefinitionRowsHash } from '@orchard/sim';
import {
  ContentAuthorityError,
  assertContentRevision,
  contentMutationDisposition,
  normalizedContentRequest,
  planContentPublication,
  type ContentChangeSetInput,
  type StoredContentDefinition,
} from './contracts.js';

function storedBootstrap(): readonly StoredContentDefinition[] {
  return bootstrapContentRows().map((row) => ({
    id: row.id,
    kind: row.kind,
    slug: row.slug ?? '',
    revision: 1n,
    hash: 'bootstrap',
    json: row.json as string,
  }));
}

function input(overrides: Partial<ContentChangeSetInput> = {}): ContentChangeSetInput {
  const wood = JSON.parse(storedBootstrap().find(({ id }) => id === 'item:wood')!.json) as Record<string, unknown>;
  return {
    packId: 'live',
    expectedRevision: 1n,
    clientMutationId: 'studio-test-1',
    upserts: JSON.stringify([{ id: 'item:wood', kind: 'item', json: JSON.stringify({ ...wood, displayName: 'Oak Wood' }) }]),
    deletes: '[]',
    note: 'Rename wood',
    ...overrides,
  };
}

describe('content publication contracts', () => {
  it('hashes the exact persisted pack while preserving untouched legacy JSON and fingerprints', () => {
    const current = storedBootstrap().map((row) => {
      if (row.id !== 'item:plank') return row;
      const original = JSON.parse(row.json) as Record<string, unknown>;
      delete original['onUse'];
      original['futureMetadata'] = { note: 'preserve this exact durable row' };
      const legacy = { ...row, revision: 7n, json: JSON.stringify(original, null, 2) };
      return { ...legacy, hash: contentDefinitionRowsHash([legacy]) };
    });
    const before = current.find(({ id }) => id === 'item:plank')!;
    const plan = planContentPublication(current, 8n, input());
    expect(plan.definitions.find(({ id }) => id === before.id)).toEqual(before);
    expect(plan.upserts.map(({ id }) => id)).toEqual(['item:wood']);
    expect(plan.upserts[0]?.hash).toBe(contentDefinitionRowsHash(plan.upserts));
    const persisted = new Map(current.map((row) => [row.id, row]));
    for (const id of plan.deletes) persisted.delete(id);
    for (const row of plan.upserts) persisted.set(row.id, row);
    expect(plan.contentHash).toBe(contentDefinitionRowsHash([...persisted.values()]));
    expect(plan.registry.contentHash).toBe(buildContentRegistry([...persisted.values()]).registry.contentHash);
    expect(plan.contentHash).not.toBe(plan.registry.contentHash);
  });

  it('builds a validated whole-registry change with a reversible inverse', () => {
    const current = storedBootstrap();
    const plan = planContentPublication(current, 2n, input());
    expect(plan.definitionCount).toBe(current.length);
    expect(JSON.parse(plan.upserts[0]!.json)).toMatchObject({ id: 'item:wood', displayName: 'Oak Wood' });
    expect(plan.upserts[0]!.revision).toBe(2n);
    const inverse = JSON.parse(plan.inverseChangeSetJson) as {
      upserts: Array<{ id: string; json: string }>;
      deletes: string[];
    };
    expect(inverse.deletes).toEqual([]);
    expect(JSON.parse(inverse.upserts[0]!.json)).toMatchObject({ id: 'item:wood', displayName: 'Wood' });
  });

  it('rejects duplicate changes and a deletion which would leave dangling references', () => {
    expect(() => normalizedContentRequest(input({
      deletes: JSON.stringify(['item:wood']),
    }))).toThrowError(new ContentAuthorityError('duplicate_content_change'));
    expect(() => planContentPublication(storedBootstrap(), 2n, input({
      upserts: '[]',
      deletes: JSON.stringify(['item:wood']),
    }))).toThrow(/content_validation_failed:unresolved_reference/u);
  });

  it('canonicalizes ordering for stable retry fingerprints', () => {
    const left = normalizedContentRequest(input({
      upserts: JSON.stringify([
        { id: 'item:z', kind: 'item', json: '{}' },
        { id: 'item:a', kind: 'item', json: '{}' },
      ]),
      deletes: JSON.stringify(['shop:z', 'shop:a']),
    }));
    const right = normalizedContentRequest(input({
      upserts: JSON.stringify([
        { id: 'item:a', kind: 'item', json: '{}' },
        { id: 'item:z', kind: 'item', json: '{}' },
      ]),
      deletes: JSON.stringify(['shop:a', 'shop:z']),
    }));
    expect(right.requestHash).toBe(left.requestHash);
    expect(right.changeSetJson).toBe(left.changeSetJson);
  });

  it('enforces compare-and-swap and distinguishes replay from mutation-id reuse', () => {
    expect(() => assertContentRevision(4n, 3n)).toThrowError(new ContentAuthorityError('content_revision_conflict'));
    expect(contentMutationDisposition([{ requestHash: 'same' }], 'same')).toBe('replay');
    expect(() => contentMutationDisposition([{ requestHash: 'old' }], 'changed'))
      .toThrowError(new ContentAuthorityError('content_mutation_id_reused'));
  });

  it('validates a 500-row publish as one bounded registry build', () => {
    const base = storedBootstrap();
    const source = JSON.parse(base.find(({ id }) => id === 'item:wood')!.json) as Record<string, unknown>;
    const upserts = Array.from({ length: 500 }, (_, index) => {
      const slug = `load_fixture_${String(index).padStart(3, '0')}`;
      const id = `item:${slug}`;
      return { id, kind: 'item', json: JSON.stringify({ ...source, id, displayName: `Load Fixture ${index}` }) };
    });
    const startedAt = performance.now();
    const plan = planContentPublication(base, 2n, input({
      clientMutationId: 'studio-load-500',
      upserts: JSON.stringify(upserts),
    }));
    const elapsedMs = performance.now() - startedAt;
    expect(plan.definitionCount).toBe(base.length + 500);
    // Keep the test tolerant of shared CI load while still detecting an
    // accidentally quadratic or unbounded publication planner.
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
