import { describe, expect, expectTypeOf, it } from 'vitest';
import { diffAdminValues } from '@orchard/sim';
import {
  ADMIN_REASON_MAX_LENGTH,
  parseAdminAuditPayload,
  parseAdminReason,
  serializeAdminAuditPayload,
  type AdminMutation,
  type AdminProcedureContract,
} from './contracts.js';

describe('Orchard Studio administration contracts', () => {
  it('normalizes a meaningful reason and rejects short or oversized input', () => {
    expect(parseAdminReason('  recover stuck player  ')).toEqual({
      ok: true,
      value: 'recover stuck player',
    });
    expect(parseAdminReason('refund')).toEqual({ ok: false, error: 'admin_invalid_reason' });
    expect(parseAdminReason('x'.repeat(ADMIN_REASON_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: 'admin_invalid_reason',
    });
  });

  it('round-trips a versioned, invertible audit payload', () => {
    const reason = parseAdminReason('restore lost sale proceeds');
    expect(reason.ok).toBe(true);
    if (!reason.ok) return;
    const payload = {
      schemaVersion: 1 as const,
      clientMutationId: 'studio.wallet.001',
      target: { kind: 'player' as const, identity: 'c200-player' },
      reason: reason.value,
      changes: diffAdminValues({ walletBronze: '100' }, { walletBronze: '250' }).changes,
      inverse: { operation: 'set_wallet' as const, args: { deltaBronze: '-150' } },
      notice: 'An administrator restored 150 bronze.',
    };

    expect(parseAdminAuditPayload(serializeAdminAuditPayload(payload))).toEqual({ ok: true, value: payload });
  });

  it('fails closed for malformed payloads, invalid reasons, and unknown operations', () => {
    expect(parseAdminAuditPayload('{')).toEqual({ ok: false, error: 'admin_payload_invalid' });
    expect(parseAdminAuditPayload(JSON.stringify({
      schemaVersion: 1,
      clientMutationId: 'valid-id',
      target: { kind: 'world' },
      reason: 'short',
      changes: [],
      inverse: null,
    }))).toEqual({ ok: false, error: 'admin_invalid_reason' });
    expect(parseAdminAuditPayload(JSON.stringify({
      schemaVersion: 1,
      clientMutationId: 'valid-id',
      target: { kind: 'world' },
      reason: 'repair orphaned portals',
      changes: [],
      inverse: { operation: 'delete_everything', args: {} },
    }))).toEqual({ ok: false, error: 'admin_payload_invalid' });
  });

  it('keeps mutation and procedure surfaces statically discoverable', () => {
    expectTypeOf<Extract<AdminMutation, { operation: 'set_wallet' }>>()
      .toHaveProperty('deltaBronze')
      .toEqualTypeOf<string>();
    expectTypeOf<AdminProcedureContract['adminFindPlayers']['result']['nextCursor']>()
      .toEqualTypeOf<string | null>();
  });
});
