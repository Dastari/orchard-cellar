import { describe, expect, it, vi } from 'vitest';
import { OidcSessionRecoveryError, type OidcSession } from '@orchard/auth';
import { recoverStartupSession } from './startup-session.js';

describe('startup account recovery', () => {
  it('waits through connectivity failures and launches the same saved account', async () => {
    const session: OidcSession = {
      subject: 'original', issuer: 'https://issuer.example', idToken: 'renewed',
      refreshToken: 'rotated', expiresAt: 1_000_000, displayName: 'Farmer', emailVerified: true,
    };
    const ensure = vi.fn()
      .mockRejectedValueOnce(new OidcSessionRecoveryError())
      .mockRejectedValueOnce(new OidcSessionRecoveryError())
      .mockResolvedValue(session);
    const onRetry = vi.fn();
    const wait = vi.fn(async () => undefined);
    await expect(recoverStartupSession(ensure, onRetry, wait)).resolves.toBe(session);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenCalledTimes(3);
  });

  it('returns terminal authentication-required to the account screen without a guest retry', async () => {
    const wait = vi.fn(async () => undefined);
    await expect(recoverStartupSession(async () => null, vi.fn(), wait)).resolves.toBeNull();
    expect(wait).not.toHaveBeenCalled();
  });

  it('does not disguise programming or validation failures as connectivity retries', async () => {
    const wait = vi.fn(async () => undefined);
    const error = new Error('invalid configuration');
    await expect(recoverStartupSession(async () => { throw error; }, vi.fn(), wait)).rejects.toBe(error);
    expect(wait).not.toHaveBeenCalled();
  });
});
