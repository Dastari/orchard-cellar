import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStoredRejoinCredentials, refreshRejoinCredentialFile,
  resolveRejoinCredentials, type StoredRejoinCredential } from './world-rejoin-credentials.js';

const temporaryDirectories: string[] = [];

async function credentialFile(credentials: readonly StoredRejoinCredential[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orchard-rejoin-credentials-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'credentials.json');
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return path;
}

async function storedAt(path: string): Promise<readonly StoredRejoinCredential[]> {
  return parseStoredRejoinCredentials(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('world rejoin credential rotation', () => {
  it('retains a rotated refresh token after signing-key failure without exposing an unverified identity', async () => {
    const path = await credentialFile([{ label: 'owner', clientId: 'orchard-web', token: 'old-id', refreshToken: 'old-refresh' }]);
    const validate = vi.fn(async () => { throw new Error('signing_keys_unavailable'); });
    await expect(refreshRejoinCredentialFile({ path,
      refresh: async () => ({ token: 'unverified-id', refreshToken: 'rotated-refresh' }), validate,
    })).rejects.toThrow('signing_keys_unavailable');
    expect(validate).toHaveBeenCalledWith('unverified-id', 'orchard-web');
    await expect(storedAt(path)).resolves.toEqual([
      { label: 'owner', clientId: 'orchard-web', refreshToken: 'rotated-refresh' },
    ]);
    await expect(exists(`${path}.lock`)).resolves.toBe(false);
    const refresh = vi.fn(async () => ({ token: 'verified-id', refreshToken: 'next-refresh' }));
    const result = await refreshRejoinCredentialFile({ path, refresh,
      validate: async () => {
        expect((await storedAt(path))[0]).not.toHaveProperty('token');
      },
    });
    expect(refresh).toHaveBeenCalledWith({ clientId: 'orchard-web', refreshToken: 'rotated-refresh' });
    expect(result.credentials).toEqual([{ label: 'owner', token: 'verified-id' }]);
    expect((await storedAt(path))[0]).toMatchObject({ token: 'verified-id', refreshToken: 'next-refresh' });
  });

  it('keeps the original opaque-token formats compatible and deterministically sorted', async () => {
    const objectForm = parseStoredRejoinCredentials({ second: 'token-b', first: 'token-a' });
    const arrayForm = parseStoredRejoinCredentials([
      { label: 'second', token: 'token-b' }, { label: 'first', token: 'token-a' },
    ]);
    expect(objectForm).toEqual(arrayForm);
    const refresh = vi.fn();
    await expect(resolveRejoinCredentials(objectForm, refresh)).resolves.toMatchObject({
      credentials: [{ label: 'first', token: 'token-a' }, { label: 'second', token: 'token-b' }],
      rotated: false,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes every rotating identity without exposing its refresh token to the connection list', async () => {
    const stored = parseStoredRejoinCredentials([
      { label: 'owner', clientId: 'orchard-web', refreshToken: 'refresh-old' },
    ]);
    const result = await resolveRejoinCredentials(stored, async ({ clientId, refreshToken }) => {
      expect({ clientId, refreshToken }).toEqual({ clientId: 'orchard-web', refreshToken: 'refresh-old' });
      return { token: 'id-token-new', refreshToken: 'refresh-new' };
    });
    expect(result.credentials).toEqual([{ label: 'owner', token: 'id-token-new' }]);
    expect(result.credentials).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ refreshToken: expect.anything() }),
    ]));
    expect(result.stored).toEqual([{
      label: 'owner', clientId: 'orchard-web', token: 'id-token-new', refreshToken: 'refresh-new',
    }]);
    expect(result.rotated).toBe(true);
  });

  it('rejects missing credentials, duplicate labels, unknown clients, and incomplete refresh sessions', () => {
    for (const value of [
      [],
      [{ label: 'same', token: 'a' }, { label: 'same', token: 'b' }],
      [{ label: 'owner', clientId: 'other', refreshToken: 'refresh' }],
      [{ label: 'owner', refreshToken: 'refresh' }],
      [{ label: 'owner', clientId: 'orchard-web' }],
    ]) expect(() => parseStoredRejoinCredentials(value)).toThrow('invalid_rejoin_credentials');
  });

  it('fails closed when a refresh response lacks either reusable credential', async () => {
    const stored = parseStoredRejoinCredentials([
      { label: 'owner', clientId: 'orchard-web', refreshToken: 'refresh-old' },
    ]);
    await expect(resolveRejoinCredentials(stored, async () => ({ token: '', refreshToken: 'next' })))
      .rejects.toThrow('rejoin_refresh_invalid_response');
  });

  it('durably checkpoints an earlier rotation when a later credential refresh fails', async () => {
    const path = await credentialFile([
      { label: 'first', clientId: 'orchard-web', refreshToken: 'first-old' },
      { label: 'second', clientId: 'orchard-studio', refreshToken: 'second-old' },
    ]);
    const refresh = vi.fn(async ({ refreshToken }: { readonly refreshToken: string }) => {
      if (refreshToken === 'second-old') throw new Error('provider_unavailable');
      return { token: 'first-id-new', refreshToken: 'first-refresh-new' };
    });

    await expect(refreshRejoinCredentialFile({ path, refresh, requireRefresh: true, minimumCredentials: 2 }))
      .rejects.toThrow('provider_unavailable');

    await expect(storedAt(path)).resolves.toEqual([
      { label: 'first', clientId: 'orchard-web', token: 'first-id-new', refreshToken: 'first-refresh-new' },
      { label: 'second', clientId: 'orchard-studio', refreshToken: 'second-old' },
    ]);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    await expect(exists(`${path}.lock`)).resolves.toBe(false);
  });

  it('persists the last issued token before honoring an interruption', async () => {
    const path = await credentialFile([
      { label: 'first', clientId: 'orchard-web', refreshToken: 'first-old' },
      { label: 'second', clientId: 'orchard-studio', refreshToken: 'second-old' },
    ]);
    const controller = new AbortController();

    await expect(refreshRejoinCredentialFile({
      path,
      requireRefresh: true,
      minimumCredentials: 2,
      signal: controller.signal,
      refresh: async () => {
        controller.abort();
        return { token: 'first-id-new', refreshToken: 'first-refresh-new' };
      },
    })).rejects.toThrow('rejoin_credential_refresh_interrupted');

    await expect(storedAt(path)).resolves.toEqual([
      { label: 'first', clientId: 'orchard-web', token: 'first-id-new', refreshToken: 'first-refresh-new' },
      { label: 'second', clientId: 'orchard-studio', refreshToken: 'second-old' },
    ]);
    await expect(exists(`${path}.lock`)).resolves.toBe(false);
  });

  it('admits only one rotating consumer for a credential path', async () => {
    const path = await credentialFile([
      { label: 'owner', clientId: 'orchard-web', refreshToken: 'refresh-old' },
    ]);
    let releaseRefresh!: () => void;
    const refreshReleased = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let markStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    const first = refreshRejoinCredentialFile({ path, requireRefresh: true, refresh: async () => {
      markStarted();
      await refreshReleased;
      return { token: 'id-new', refreshToken: 'refresh-new' };
    } });
    await refreshStarted;

    await expect(refreshRejoinCredentialFile({ path, requireRefresh: true,
      refresh: async () => ({ token: 'racing-id', refreshToken: 'racing-refresh' }) }))
      .rejects.toThrow('rejoin_credentials_locked');

    releaseRefresh();
    await expect(first).resolves.toMatchObject({ rotated: true,
      credentials: [{ label: 'owner', token: 'id-new' }] });
    await expect(storedAt(path)).resolves.toEqual([
      { label: 'owner', clientId: 'orchard-web', token: 'id-new', refreshToken: 'refresh-new' },
    ]);
    await expect(exists(`${path}.lock`)).resolves.toBe(false);
  });

  it('detects an out-of-band file replacement before committing a rotated token', async () => {
    const path = await credentialFile([
      { label: 'owner', clientId: 'orchard-web', refreshToken: 'refresh-old' },
    ]);
    const replacement = [{ label: 'replacement', clientId: 'orchard-web' as const,
      refreshToken: 'replacement-refresh' }];

    await expect(refreshRejoinCredentialFile({ path, requireRefresh: true, refresh: async () => {
      await writeFile(path, `${JSON.stringify(replacement)}\n`, { encoding: 'utf8', mode: 0o600 });
      return { token: 'id-new', refreshToken: 'refresh-new' };
    } })).rejects.toThrow('rejoin_credentials_changed');

    await expect(storedAt(path)).resolves.toEqual(replacement);
    await expect(exists(`${path}.lock`)).resolves.toBe(false);
  });
});
