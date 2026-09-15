import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface RejoinCredential {
  readonly label: string;
  readonly token: string;
}

export interface StoredRejoinCredential {
  readonly label: string;
  readonly token?: string;
  readonly clientId?: 'orchard-web' | 'orchard-studio';
  readonly refreshToken?: string;
}

export interface RefreshedRejoinCredential {
  readonly token: string;
  readonly refreshToken: string;
}

export interface RefreshRejoinCredentialFileOptions {
  readonly path: string;
  readonly refresh: (credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>)
    => Promise<RefreshedRejoinCredential>;
  readonly validate?: (token: string, clientId: NonNullable<StoredRejoinCredential['clientId']>) => Promise<void>;
  readonly requireRefresh?: boolean;
  readonly minimumCredentials?: number;
  readonly signal?: AbortSignal;
}

export interface RefreshedRejoinCredentialFile {
  readonly credentials: readonly RejoinCredential[];
  readonly stored: readonly StoredRejoinCredential[];
  readonly rotated: boolean;
}

const LABEL = /^[A-Za-z0-9._-]+$/u;
const CLIENT_IDS = new Set(['orchard-web', 'orchard-studio']);

/** Accepts the original label -> token map and the refresh-capable array form. */
export function parseStoredRejoinCredentials(value: unknown): readonly StoredRejoinCredential[] {
  let credentials: StoredRejoinCredential[];
  if (Array.isArray(value)) {
    credentials = value.map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error('invalid_rejoin_credentials');
      }
      const source = entry as Record<string, unknown>;
      const label = source['label'];
      const token = source['token'];
      const refreshToken = source['refreshToken'];
      const clientId = source['clientId'];
      if (typeof label !== 'string'
        || (token !== undefined && typeof token !== 'string')
        || (refreshToken !== undefined && typeof refreshToken !== 'string')
        || (clientId !== undefined && (typeof clientId !== 'string' || !CLIENT_IDS.has(clientId)))) {
        throw new Error('invalid_rejoin_credentials');
      }
      return {
        label,
        ...(typeof token === 'string' ? { token } : {}),
        ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
        ...(clientId === 'orchard-web' || clientId === 'orchard-studio' ? { clientId } : {}),
      };
    });
  } else if (typeof value === 'object' && value !== null) {
    credentials = Object.entries(value as Record<string, unknown>).map(([label, token]) => {
      if (typeof token !== 'string') throw new Error('invalid_rejoin_credentials');
      return { label, token };
    });
  } else {
    throw new Error('invalid_rejoin_credentials');
  }
  if (credentials.length === 0
    || credentials.some(({ label, token, refreshToken, clientId }) => (
      !LABEL.test(label)
      || (refreshToken === undefined && (token === undefined || token.length === 0))
      || (refreshToken !== undefined && (refreshToken.length === 0 || clientId === undefined))
    ))
    || new Set(credentials.map(({ label }) => label)).size !== credentials.length) {
    throw new Error('invalid_rejoin_credentials');
  }
  return credentials.sort((left, right) => left.label.localeCompare(right.label));
}

export async function resolveRejoinCredentials(
  stored: readonly StoredRejoinCredential[],
  refresh: (credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>)
    => Promise<RefreshedRejoinCredential>,
): Promise<{ readonly credentials: readonly RejoinCredential[]; readonly stored: readonly StoredRejoinCredential[]; readonly rotated: boolean }> {
  let rotated = false;
  const next: StoredRejoinCredential[] = [];
  const credentials: RejoinCredential[] = [];
  for (const credential of stored) {
    if (credential.refreshToken !== undefined && credential.clientId !== undefined) {
      const refreshed = await refresh({ clientId: credential.clientId, refreshToken: credential.refreshToken });
      if (refreshed.token.length === 0 || refreshed.refreshToken.length === 0) {
        throw new Error('rejoin_refresh_invalid_response');
      }
      next.push({ ...credential, token: refreshed.token, refreshToken: refreshed.refreshToken });
      credentials.push({ label: credential.label, token: refreshed.token });
      rotated = true;
    } else {
      credentials.push({ label: credential.label, token: credential.token! });
      next.push(credential);
    }
  }
  return { credentials, stored: next, rotated };
}

interface PrivateCredentialFile {
  readonly contents: string;
  readonly credentials: readonly StoredRejoinCredential[];
  readonly fingerprint: string;
}

function fingerprint(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new Error('rejoin_credential_refresh_interrupted');
}

async function readPrivateCredentialFile(path: string): Promise<PrivateCredentialFile> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('rejoin_token_file_must_be_regular', { cause: error });
    }
    throw error;
  }
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) throw new Error('rejoin_token_file_must_be_regular');
    if ((metadata.mode & 0o777) !== 0o600) throw new Error('rejoin_token_file_permissions_must_be_0600');
    const contents = await file.readFile('utf8');
    return {
      contents,
      credentials: parseStoredRejoinCredentials(JSON.parse(contents) as unknown),
      fingerprint: fingerprint(contents),
    };
  } finally {
    await file.close();
  }
}

async function persistCredentialCheckpoint(
  path: string,
  credentials: readonly StoredRejoinCredential[],
  expectedFingerprint: string,
): Promise<string> {
  const current = await readPrivateCredentialFile(path);
  if (current.fingerprint !== expectedFingerprint) throw new Error('rejoin_credentials_changed');
  const contents = `${JSON.stringify(credentials, null, 2)}\n`;
  const temporary = `${path}.rotate-${process.pid}-${randomUUID()}`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(contents, 'utf8');
    await file.sync();
    await file.chmod(0o600);
    await file.close();
    const beforeRename = await readPrivateCredentialFile(path);
    if (beforeRename.fingerprint !== expectedFingerprint) throw new Error('rejoin_credentials_changed');
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    return fingerprint(contents);
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function acquireCredentialLock(path: string): Promise<{ readonly path: string; readonly close: () => Promise<void> }> {
  const lockPath = `${path}.lock`;
  let file;
  try {
    file = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('rejoin_credentials_locked', { cause: error });
    }
    throw error;
  }
  try {
    await file.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, 'utf8');
    await file.sync();
    await file.chmod(0o600);
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    throw error;
  }
  return {
    path: lockPath,
    close: async () => {
      await file.close();
      await unlink(lockPath);
    },
  };
}

/**
 * Refreshes a private credential file under an exclusive same-directory lock.
 * Each successfully rotated token is durably checkpointed before the next remote
 * refresh begins, so a later failure cannot discard an already-issued replacement.
 */
export async function refreshRejoinCredentialFile(
  options: RefreshRejoinCredentialFileOptions,
): Promise<RefreshedRejoinCredentialFile> {
  assertNotAborted(options.signal);
  const lock = await acquireCredentialLock(options.path);
  try {
    const initial = await readPrivateCredentialFile(options.path);
    if (initial.credentials.length < (options.minimumCredentials ?? 1)) {
      throw new Error('rejoin_minimum_credentials_required');
    }
    if (options.requireRefresh === true
      && initial.credentials.some(({ refreshToken, clientId }) => refreshToken === undefined || clientId === undefined)) {
      throw new Error('refresh_capable_rejoin_credentials_required');
    }

    let expectedFingerprint = initial.fingerprint;
    const stored = [...initial.credentials];
    const credentials: RejoinCredential[] = [];
    let rotated = false;
    for (let index = 0; index < stored.length; index += 1) {
      assertNotAborted(options.signal);
      const credential = stored[index]!;
      if (credential.refreshToken !== undefined && credential.clientId !== undefined) {
        const refreshed = await options.refresh({ clientId: credential.clientId, refreshToken: credential.refreshToken });
        if (refreshed.token.length === 0 || refreshed.refreshToken.length === 0) {
          throw new Error('rejoin_refresh_invalid_response');
        }
        if (options.validate !== undefined) {
          // Rotation has already consumed the old refresh token. Preserve its
          // replacement before network-dependent verification, but withhold the
          // identity token until validation succeeds. Capture refuses tokenless
          // records; a retry can safely rotate the checkpointed refresh token.
          stored[index] = { label: credential.label, clientId: credential.clientId, refreshToken: refreshed.refreshToken };
          expectedFingerprint = await persistCredentialCheckpoint(options.path, stored, expectedFingerprint);
          await options.validate(refreshed.token, credential.clientId);
        }
        stored[index] = { ...credential, token: refreshed.token, refreshToken: refreshed.refreshToken };
        expectedFingerprint = await persistCredentialCheckpoint(options.path, stored, expectedFingerprint);
        credentials.push({ label: credential.label, token: refreshed.token });
        rotated = true;
      } else {
        credentials.push({ label: credential.label, token: credential.token! });
      }
    }
    return { credentials, stored, rotated };
  } finally {
    await lock.close();
  }
}
