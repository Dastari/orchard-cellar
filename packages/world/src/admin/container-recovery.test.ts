import { describe, expect, it } from 'vitest';
import { AdminObjectError, type AdminManagedEntity } from './objects.js';
import { adminRoleCanMutate } from './auth-policy.js';
import { inspectMissingContainerRecovery, missingContainerEntityFromAudit,
  missingContainerRecoveryVersion, planMissingContainerRecovery, type MissingContainerAuditSource } from './container-recovery.js';

const owner = '01'.repeat(32);
const carrier = '02'.repeat(32);
const entity = Object.freeze({
  entityId: '91', entityKind: 'chest', definitionId: 'object:chest', ownerIdentity: owner,
  spaceId: '4', tileX: 12, tileY: -3, state: { open: false, lit: true, facing: 'down' },
  slots: Object.freeze([{ itemKind: 'apple', quantity: 7, durability: 4, lit: false }, null]),
  processor: Object.freeze({ processStartTick: '42', processStartedBy: owner, processInputKind: 'apple',
    smeltStartTick: null, barrelSealedTick: null, barrelSealedBy: null, cookStartTick: null,
    cookStartedBy: null, cookInputKind: null }),
  persistence: 'placeable', custody: Object.freeze({ carriedBy: carrier }), damage: 2,
  build: Object.freeze({ spaceId: '4', placedBy: owner, placedAtTick: '17' }),
} satisfies AdminManagedEntity);

function source(value: AdminManagedEntity = entity): MissingContainerAuditSource {
  return Object.freeze({ id: '300', action: 'despawn_entity', targetKey: 'entity:91', payload: JSON.stringify({
    schemaVersion: 1, clientMutationId: 'despawn-91', target: { kind: 'entity', entityId: '91' },
    reason: 'Remove corrupted chest after report', changes: [],
    inverse: { operation: 'undo', args: { objectState: { entities: [value], resources: [], spilledItems: [],
      nextEntityId: '92', nextWorldItemId: '1' } } },
  }) });
}

const authority = Object.freeze({ current: null, ownerExists: true, carrierExists: true,
  destinationBlocked: false, definitionCapacity: 2 });

describe('exact missing-container recovery', () => {
  it('is a support remedy without granting content editors or moderators object authority', () => {
    expect(adminRoleCanMutate('support', 'restore_missing_container')).toBe(true);
    expect(adminRoleCanMutate('content_editor', 'restore_missing_container')).toBe(false);
    expect(adminRoleCanMutate('moderator', 'restore_missing_container')).toBe(false);
  });

  it('accepts only the matching server-authored despawn inverse and owner', () => {
    expect(missingContainerEntityFromAudit(source(), '91', owner)).toEqual(entity);
    expect(missingContainerEntityFromAudit(source(), '91', '03'.repeat(32))).toBeNull();
    expect(missingContainerEntityFromAudit({ ...source(), action: 'repair_entity' }, '91', owner)).toBeNull();
    const old = { ...entity, build: undefined } as unknown as AdminManagedEntity;
    expect(missingContainerEntityFromAudit(source(old), '91', owner)).toBeNull();
    const legacy = { ...entity, state: {}, slots: [null, null], processor: null,
      persistence: undefined, build: undefined } as unknown as AdminManagedEntity;
    expect(missingContainerEntityFromAudit(source(legacy), '91', owner))
      .toMatchObject({ persistence: 'legacy_chest', entityId: '91' });
  });

  it('reports exact custody recoverability and detects an already restored entity', () => {
    const missing = inspectMissingContainerRecovery(source(), '91', owner, authority);
    expect(missing).toMatchObject({ recoverable: true, auditId: '300' });
    expect(missing.summary).toContain('processor');
    const present = inspectMissingContainerRecovery(source(), '91', owner, { ...authority, current: entity });
    expect(present).toMatchObject({ recoverable: false, summary: 'The container is already present with the exact audited state.' });
    expect(present.version).toBe(missingContainerRecoveryVersion('300', entity, true));
  });

  it('binds preview and commit to the exact audit, authority state, and inverse', () => {
    const baseVersion = missingContainerRecoveryVersion('300', entity, false);
    const common = { entityId: '91', targetIdentity: owner, reason: 'Restore exact missing chest custody',
      clientMutationId: 'restore-91', expectedBaseVersion: baseVersion, nowMicros: 5n, source: source(), authority };
    const preview = planMissingContainerRecovery({ ...common, dryRun: true, previewFingerprint: null });
    expect(preview.entity).toEqual(entity);
    expect(preview.preview.preview.changes.length).toBeGreaterThan(0);
    expect(preview.audit.inverse).toEqual({ operation: 'despawn_entity', args: {
      entityId: '91', spillContents: false, destructionReason: 'Inverse of audited missing-container restoration',
    } });
    const commit = planMissingContainerRecovery({ ...common, dryRun: false,
      previewFingerprint: preview.previewFingerprint });
    expect(commit.committedVersion).toBe(missingContainerRecoveryVersion('300', entity, true));
    expect(() => planMissingContainerRecovery({ ...common, expectedBaseVersion: 'stale', dryRun: true,
      previewFingerprint: null })).toThrowError(new AdminObjectError('admin_preview_stale'));
    expect(() => planMissingContainerRecovery({ ...common, authority: { ...authority, destinationBlocked: true },
      dryRun: true, previewFingerprint: null })).toThrowError(new AdminObjectError('admin_position_blocked'));
  });
});
