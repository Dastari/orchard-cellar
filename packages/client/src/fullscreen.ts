export interface FullscreenControl {
  readonly active: boolean;
  readonly standalone: boolean;
  readonly request?: () => void | Promise<void>;
  readonly exit?: () => void | Promise<void>;
  readonly lockEscape?: () => Promise<void>;
  readonly unlock?: () => void;
}

export type FullscreenToggleResult = 'entered' | 'exited' | 'unavailable';

/** Native fullscreen is only offered when Escape can remain the game's menu
 * key. Installed PWAs already own their display surface, while browsers without
 * Keyboard Lock would immediately use Escape to tear fullscreen down. */
export function fullscreenControlAvailable(control: FullscreenControl): boolean {
  return !control.standalone
    && control.request !== undefined
    && control.exit !== undefined
    && control.lockEscape !== undefined;
}

export async function toggleFullscreenWithEscapeLock(
  control: FullscreenControl,
): Promise<FullscreenToggleResult> {
  if (!fullscreenControlAvailable(control)) return 'unavailable';
  if (control.active) {
    try {
      await control.exit!();
    } finally {
      control.unlock?.();
    }
    return 'exited';
  }

  // Start both requests synchronously inside the button's user activation.
  // Keyboard Lock is initiated first, matching its fullscreen integration
  // guidance and keeping a normal Escape press available to the game menu.
  let lockPromise: Promise<void> | undefined;
  let requestPromise: Promise<void>;
  try {
    lockPromise = control.lockEscape!();
    requestPromise = Promise.resolve(control.request!());
  } catch (error) {
    if (lockPromise !== undefined) await Promise.allSettled([lockPromise]);
    try {
      await control.exit!();
    } catch {
      // Exiting a document that never entered fullscreen is expected to reject.
    }
    control.unlock?.();
    throw error;
  }
  const [lock, request] = await Promise.allSettled([lockPromise!, requestPromise]);
  if (lock.status === 'fulfilled' && request.status === 'fulfilled') return 'entered';

  // Never leave the player in native fullscreen when Escape could not be
  // captured. Wait for both operations above, then unwind either partial win.
  try {
    await control.exit!();
  } catch {
    // Exiting a document that never entered fullscreen is expected to reject.
  }
  control.unlock?.();
  throw (lock.status === 'rejected' ? lock.reason : (request as PromiseRejectedResult).reason);
}
