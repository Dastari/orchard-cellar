import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, buildContentRegistry, contentDefinitionRowsHash } from '@orchard/sim';
import stageAContentRows from '../../../sim/src/content/fixtures/stage-a-content-459.json';
import {
  CLIENT_CONTENT_ENGINE_VERSION,
  LiveContentRegistry,
  type ContentStorage,
  type LiveContentHead,
} from './live-content.js';

class MemoryStorage implements ContentStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function fixture(): { readonly rows: ReturnType<typeof bootstrapContentRows>; readonly head: LiveContentHead } {
  const rows = bootstrapContentRows();
  return { rows, head: {
    packId: 'live', revision: 4n,
    contentHash: buildContentRegistry(rows).registry.contentHash,
    engineVersion: CLIENT_CONTENT_ENGINE_VERSION,
    definitionCount: rows.length,
  } };
}

describe('live client content registry', () => {
  const stageAHead: LiveContentHead = {
    packId: 'live', revision: 1n, contentHash: 'ba28da55',
    engineVersion: CLIENT_CONTENT_ENGINE_VERSION, definitionCount: 459,
  };

  it('accepts the original production payloads across parser normalization and cache restoration', () => {
    expect(contentDefinitionRowsHash(stageAContentRows)).toBe(stageAHead.contentHash);
    const projected = buildContentRegistry(stageAContentRows);
    expect(projected.report.valid).toBe(true);
    expect(projected.registry.contentHash).not.toBe(stageAHead.contentHash);
    const storage = new MemoryStorage();
    const content = new LiveContentRegistry('stage-a', storage);
    const ready = content.update(stageAHead, stageAContentRows);
    expect(ready).toMatchObject({ source: 'live', status: 'ready', issues: [], head: stageAHead });
    expect(ready.registry.items.get('item:wood')?.onUse).toEqual([]);
    expect(content.liveRows.find(({ id }) => id === 'item:wood')?.json)
      .toBe(stageAContentRows.find(({ id }) => id === 'item:wood')?.json);
    const restored = new LiveContentRegistry('stage-a', storage);
    expect(restored.state).toMatchObject({ source: 'cache', status: 'ready', head: stageAHead });
    expect(restored.liveRows).toEqual(content.liveRows);
  });

  it('rejects stored-payload tampering even when parsing discards the changed field', () => {
    const content = new LiveContentRegistry('stage-a', null);
    const ready = content.update(stageAHead, stageAContentRows);
    const changed = stageAContentRows.map((row) => row.id !== 'item:wood' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(row.json), unrecognizedField: 'tampered' }),
    });
    expect(buildContentRegistry(changed).registry.contentHash).toBe(ready.registry.contentHash);
    const invalid = content.update(stageAHead, changed);
    expect(invalid.status).toBe('invalid');
    expect(invalid.issues).toContain('content_hash_mismatch');
    expect(invalid.registry).toBe(ready.registry);
  });

  it('retains semantic, count, and identity validation after a stored hash matches', () => {
    const content = new LiveContentRegistry('stage-a', null);
    const ready = content.update(stageAHead, stageAContentRows);
    const brokenReference = stageAContentRows.map((row) => row.kind !== 'recipe' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(row.json), output: { item: 'item:missing', count: 1 } }),
    });
    const semanticFailure = content.update({ ...stageAHead,
      contentHash: contentDefinitionRowsHash(brokenReference) }, brokenReference);
    expect(semanticFailure.status).toBe('invalid');
    expect(semanticFailure.issues).not.toContain('content_hash_mismatch');
    expect(semanticFailure.registry).toBe(ready.registry);
    expect(content.update({ ...stageAHead, definitionCount: 458 }, stageAContentRows).issues)
      .toContain('content_definition_count_mismatch');
    const malformed = stageAContentRows.map((row, index) => index === 0 ? { ...row, json: '{' } : row);
    expect(content.update(stageAHead, malformed)).toMatchObject({ status: 'invalid', registry: ready.registry });
    expect(content.state.issues).toContain('content_payload_hash_invalid');
    const duplicates = stageAContentRows.map((row, index) => index === 1 ? stageAContentRows[0]! : row);
    expect(content.update(stageAHead, duplicates).issues).toContain('content_payload_hash_invalid');
  });

  it('rejects a tampered historical cache without adopting its runtime projection', () => {
    const storage = new MemoryStorage();
    const content = new LiveContentRegistry('stage-a', storage);
    content.update(stageAHead, stageAContentRows);
    const key = 'orchard:content:stage-a:v1';
    const stored = JSON.parse(storage.values.get(key)!);
    stored.rows[0].json = JSON.stringify({ ...JSON.parse(stored.rows[0].json), injected: true });
    storage.values.set(key, JSON.stringify(stored));
    const restored = new LiveContentRegistry('stage-a', storage);
    expect(restored.state).toMatchObject({ source: 'bootstrap', status: 'waiting' });
    expect(storage.values.size).toBe(0);
  });

  it('adopts and persists only a complete compatible live revision', () => {
    const storage = new MemoryStorage();
    const source = fixture();
    const content = new LiveContentRegistry('test', storage);
    expect(content.update(source.head, source.rows)).toMatchObject({ source: 'live', status: 'ready' });
    expect(storage.values.size).toBe(1);
    const restored = new LiveContentRegistry('test', storage);
    expect(restored.state).toMatchObject({ source: 'cache', status: 'ready', head: { revision: 4n } });
  });

  it('keeps the last verified registry across partial, corrupt, and incompatible updates', () => {
    const source = fixture();
    const content = new LiveContentRegistry('test', null);
    const ready = content.update(source.head, source.rows);
    const partial = content.update(source.head, source.rows.slice(1));
    expect(partial.status).toBe('invalid');
    expect(partial.registry).toBe(ready.registry);
    const incompatible = content.update({ ...source.head, engineVersion: 2 }, source.rows);
    expect(incompatible.status).toBe('engine_update_required');
    expect(incompatible.registry).toBe(ready.registry);
  });

  it('builds an isolated draft overlay without mutating the live base', () => {
    const source = fixture();
    const content = new LiveContentRegistry('test', null);
    content.update(source.head, source.rows);
    const wood = source.rows.find(({ id }) => id === 'item:wood')!;
    const definition = JSON.parse(String(wood.json)) as Record<string, unknown>;
    const draft = content.withDraft({ upserts: [{ ...wood, json: JSON.stringify({ ...definition, displayName: 'Draft Oak' }) }], deletes: [] });
    expect(draft.source).toBe('draft');
    expect(draft.registry.items.get('item:wood')?.displayName).toBe('Draft Oak');
    expect(content.state.registry.items.get('item:wood')?.displayName).toBe('Wood');
  });

  it('makes the same published definition visible to two clients without reload', () => {
    const source = fixture();
    const wood = source.rows.find(({ id }) => id === 'item:wood')!;
    const definition = JSON.parse(String(wood.json)) as Record<string, unknown>;
    const rows = source.rows.map((row) => row.id === wood.id
      ? { ...row, json: JSON.stringify({ ...definition, displayName: 'Published Oak' }) }
      : row);
    const head = {
      ...source.head,
      revision: source.head.revision + 1n,
      contentHash: buildContentRegistry(rows).registry.contentHash,
    };
    const first = new LiveContentRegistry('first', null);
    const second = new LiveContentRegistry('second', null);
    first.update(source.head, source.rows);
    second.update(source.head, source.rows);
    expect(first.update(head, rows).registry.items.get('item:wood')?.displayName).toBe('Published Oak');
    expect(second.update(head, rows).registry.items.get('item:wood')?.displayName).toBe('Published Oak');
  });

  it('deletes a corrupt cache and falls back to the bootstrap registry', () => {
    const storage = new MemoryStorage();
    storage.setItem('orchard:content:test:v1', '{oops');
    const content = new LiveContentRegistry('test', storage);
    expect(content.state).toMatchObject({ source: 'bootstrap', status: 'waiting' });
    expect(storage.values.size).toBe(0);
  });
});
