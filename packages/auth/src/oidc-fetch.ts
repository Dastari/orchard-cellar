export const OIDC_REQUEST_TIMEOUT_MS = 10_000;

/** Connectivity failure: retain the existing account and retry later. */
export class OidcSessionRecoveryError extends Error {
  constructor() {
    super('The account service is temporarily unavailable. Reconnecting to your account.');
    this.name = 'OidcSessionRecoveryError';
  }
}

/** Bound both headers and body reads; suspended requests cannot stall resume. */
export async function fetchOidcJson(url: string, init: RequestInit): Promise<{
  readonly ok: boolean; readonly status: number; readonly body: unknown;
}> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          throw new OidcSessionRecoveryError();
        }
        return { ok: response.ok, status: response.status, body: await response.json() as unknown };
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new OidcSessionRecoveryError());
        }, OIDC_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch {
    throw new OidcSessionRecoveryError();
  } finally {
    clearTimeout(timeout);
  }
}
