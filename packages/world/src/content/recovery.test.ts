import { bootstrapContentRows, contentDefinitionRowsHash } from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import { contentEditorAuthorized } from './authorization.js';
import { contentRegistryForRows, invalidateContentRegistryCache } from './cache.js';
import { planContentPublication, type StoredContentDefinition } from './contracts.js';
import { assertContentIntegrity, contentRecoveryConnection } from './recovery.js';

function fixture() {
  const current: StoredContentDefinition[] = bootstrapContentRows().map(row => {
    const stored = { ...row, slug: row.slug ?? '', revision: 1n, json: row.json as string, hash: '' };
    return { ...stored, hash: contentDefinitionRowsHash([stored]) };
  });
  const legacy = current.map(row => {
    if (row.id !== 'upgrade:barrel_cellar') return row;
    const payload = JSON.parse(row.json);
    delete payload.mechanic;
    const old = { ...row, json: JSON.stringify(payload) };
    return { ...old, hash: contentDefinitionRowsHash([old]) };
  });
  const head = { packId: 'live', revision: 1n, contentHash: contentDefinitionRowsHash(legacy), definitionCount: legacy.length };
  invalidateContentRegistryCache();
  return { current, legacy, head };
}

describe('historical content recovery authority', () => {
  it('lets an existing editor connect and plan a strict upgrade without rewriting the historical baseline', () => {
    const { current, legacy, head } = fixture();
    const before = JSON.stringify(legacy, (_key, value: unknown) => typeof value === 'bigint' ? String(value) : value);
    expect(() => contentRegistryForRows(head, legacy)).toThrow('content_registry_invalid:');
    const requireEditor = vi.fn();
    expect(contentRecoveryConnection({
      validateRuntime: () => contentRegistryForRows(head, legacy), requireEditor,
      verifyIntegrity: () => assertContentIntegrity(head, legacy),
    })).toBe(true);
    expect(requireEditor).toHaveBeenCalledOnce();
    const restored = current.find(row => row.id === 'upgrade:barrel_cellar')!;
    const plan = planContentPublication(legacy, 2n, {
      packId: 'live', expectedRevision: 1n, clientMutationId: 'repair-legacy', note: 'Repair historical schema',
      upserts: JSON.stringify([{ id: restored.id, kind: restored.kind, json: restored.json }]), deletes: '[]',
    });
    const nextHead = { ...head, revision: 2n, contentHash: plan.contentHash };
    assertContentIntegrity(nextHead, plan.definitions);
    expect(contentRecoveryConnection({ validateRuntime: () => contentRegistryForRows(nextHead, plan.definitions),
      requireEditor: () => { throw new Error('normal_connection_must_not_require_editor'); },
      verifyIntegrity: () => { throw new Error('unexpected_recovery'); },
    })).toBe(false);
    expect(JSON.stringify(legacy, (_key, value: unknown) => typeof value === 'bigint' ? String(value) : value)).toBe(before);
    expect(() => planContentPublication(legacy, 2n, { packId: 'live', expectedRevision: 1n,
      clientMutationId: 'incomplete-repair', note: 'Incomplete',
      upserts: JSON.stringify(current.filter(row => row.id === 'item:wood').map(({ id, kind, json }) => ({ id, kind, json }))), deletes: '[]',
    })).toThrow('content_validation_failed:');
  });

  it('retains editor authorization and rejects blocked, revoked, missing, or ungranted memberships', () => {
    const { legacy, head } = fixture();
    for (const member of [null, { role: 'friend', blocked: false, revokedAt: undefined },
      { role: 'owner', blocked: true, revokedAt: undefined }, { role: 'admin', blocked: false, revokedAt: 1n }]) {
      const verifyIntegrity = vi.fn();
      expect(() => contentRecoveryConnection({ validateRuntime: () => contentRegistryForRows(head, legacy),
        requireEditor: () => { if (!contentEditorAuthorized(member, null)) throw new Error('content_editor_required'); },
        verifyIntegrity,
      })).toThrow('content_editor_required');
      expect(verifyIntegrity).not.toHaveBeenCalled();
    }
  });

  it('rejects corrupted historical rows, hashes, counts, and revisions even for an editor', () => {
    const { legacy, head } = fixture();
    const variants = [legacy.slice(1), [...legacy, legacy[0]!],
      legacy.map((row, i) => i === 0 ? { ...row, hash: '00000000' } : row),
      legacy.map((row, i) => i === 0 ? { ...row, revision: 2n } : row),
      legacy.map((row, i) => i === 0 ? { ...row, json: '{}' } : row),
      legacy.map((row, i) => i === 0 ? { ...row, json: '{' } : row)];
    for (const rows of variants) {
      expect(() => contentRecoveryConnection({
        validateRuntime: () => { throw new Error('content_registry_invalid:historical'); }, requireEditor: () => {},
        verifyIntegrity: () => assertContentIntegrity(head, rows),
      })).toThrow(/content_registry_/u);
    }
    expect(() => assertContentIntegrity({ ...head, contentHash: '00000000' }, legacy)).toThrow('content_registry_hash_mismatch');
  });

  it('never treats unrelated runtime errors as recoverable content compatibility', () => {
    const requireEditor = vi.fn();
    expect(() => contentRecoveryConnection({ validateRuntime: () => { throw new Error('content_registry_hash_mismatch'); },
      requireEditor, verifyIntegrity: vi.fn(),
    })).toThrow('content_registry_hash_mismatch');
    expect(requireEditor).not.toHaveBeenCalled();
  });
});
