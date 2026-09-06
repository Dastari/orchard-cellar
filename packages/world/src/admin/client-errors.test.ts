import { describe, expect, it } from 'vitest';
import {
  CLIENT_ERROR_RATE_LIMIT,
  CLIENT_ERROR_RATE_WINDOW_MICROS,
  CLIENT_ERROR_RETENTION_MICROS,
  clientErrorExpired,
  planClientErrorReport,
  type ClientErrorMutation,
} from './client-errors.js';

const mutation: ClientErrorMutation = {
  clientMutationId: 'client-error.fixture-1', kind: 'error', message: 'renderer failed',
  stack: 'Error: renderer failed\n at render (overworld.js:1)', route: '/',
  buildId: 'release-42', fingerprint: 'deadbeef', observedAtMs: 1_788_414_400_000,
};

describe('client error report authority plan', () => {
  it('accepts one bounded, credential-free idempotent report and stamps server time', () => {
    const plan = planClientErrorReport(mutation, [], 42_000_000n);
    expect(plan).toMatchObject({
      clientMutationId: mutation.clientMutationId, kind: 'error', message: 'renderer failed',
      occurredAtMicros: 42_000_000n, clientObservedAtMs: 1_788_414_400_000n,
    });
    expect(planClientErrorReport(mutation, [{
      clientMutationId: mutation.clientMutationId, fingerprint: 'deadbeef', occurredAtMicros: 41_000_000n,
    }], 42_000_000n)).toBeNull();
  });

  it('rejects secrets, query-bearing routes, invalid kinds, and oversized payloads', () => {
    expect(() => planClientErrorReport({ ...mutation, message: 'Bearer secret-token' }, [], 1n)).toThrow('admin_payload_invalid');
    expect(() => planClientErrorReport({ ...mutation, route: '/?token=secret' }, [], 1n)).toThrow('admin_payload_invalid');
    expect(() => planClientErrorReport({ ...mutation, kind: 'telemetry' }, [], 1n)).toThrow('admin_payload_invalid');
    expect(() => planClientErrorReport({ ...mutation, stack: 'x'.repeat(2_049) }, [], 1n)).toThrow('admin_payload_invalid');
  });

  it('enforces six reports per actor per rolling minute', () => {
    const now = 100_000_000n;
    const recent = Array.from({ length: CLIENT_ERROR_RATE_LIMIT }, (_, index) => ({
      clientMutationId: `prior-${index}`, fingerprint: `${index}`.padStart(8, '0'),
      occurredAtMicros: now - CLIENT_ERROR_RATE_WINDOW_MICROS + BigInt(index + 1),
    }));
    expect(() => planClientErrorReport(mutation, recent, now)).toThrow('admin_rate_limited');
    expect(planClientErrorReport(mutation, recent.map((row) => ({
      ...row, occurredAtMicros: row.occurredAtMicros - CLIENT_ERROR_RATE_WINDOW_MICROS,
    })), now)).not.toBeNull();
  });

  it('marks immutable reports for bounded retention only after fourteen days', () => {
    expect(clientErrorExpired(10n, 10n + CLIENT_ERROR_RETENTION_MICROS - 1n)).toBe(false);
    expect(clientErrorExpired(10n, 10n + CLIENT_ERROR_RETENTION_MICROS)).toBe(true);
  });
});
