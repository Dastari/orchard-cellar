import { OidcSessionRecoveryError, type OidcSession } from '@orchard/auth';

function waitForAccountRetry(): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      window.removeEventListener('online', finish);
      window.removeEventListener('pageshow', finish);
      document.removeEventListener('visibilitychange', visible);
      resolve();
    };
    const visible = (): void => { if (!document.hidden) finish(); };
    const timer = setTimeout(finish, 5_000);
    window.addEventListener('online', finish);
    window.addEventListener('pageshow', finish);
    document.addEventListener('visibilitychange', visible);
  });
}

/** Offline launch keeps the account intact while waiting for connectivity. */
export async function recoverStartupSession(
  ensure: () => Promise<OidcSession | null>,
  onRetry: () => void,
  wait = waitForAccountRetry,
): Promise<OidcSession | null> {
  for (;;) {
    try { return await ensure(); } catch (error: unknown) {
      if (!(error instanceof OidcSessionRecoveryError)) throw error;
      onRetry();
      await wait();
    }
  }
}
