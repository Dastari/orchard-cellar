export type ConnectionRecoveryState = 'ready' | 'connecting' | 'reconnecting' | 'offline' | 'sign-in-required' | 'update-required';

/** A failure no retry can fix: signing in again, or loading a newer client (the world refused this one's protocol). */
export type ConnectionRecoveryTerminal = 'sign-in-required' | 'update-required';

/** World refusals only a newer client fixes, as `content_registry_invalid` is a content refusal: the world refuses
 * this bundle's inventory protocol (Uncapped Storage step 4). */
export const CLIENT_UPDATE_REQUIRED_ERRORS: readonly string[] = Object.freeze(['inventory_client_update_required']);

/** The terminal state for a refused connection: a client-update refusal asks for a reload, anything else a sign-in. */
export function recoveryTerminalFor(error: string): ConnectionRecoveryTerminal {
  return CLIENT_UPDATE_REQUIRED_ERRORS.some(code => error.includes(code)) ? 'update-required' : 'sign-in-required';
}

export interface ConnectionRecoveryDependencies {
  readonly connect: (generation: number) => Promise<void>;
  readonly disconnect: () => void;
  readonly changed: (error?: string) => void;
  readonly online: () => boolean;
  readonly visible: () => boolean;
  readonly socketClosed: () => boolean;
  readonly now?: () => number;
}

/** How long a connection back from a hidden or frozen tab may stay silent before the
 * watchdog treats it as stalled (BUG-062). The world clock ticks at 20 Hz, so a live socket
 * shows traffic within a few frames once the page runs again. */
export const RESUME_PROBE_MS = 3_000;

/** One connection generation owns all callbacks. Retries rebuild subscriptions;
 * they never replay reducer calls or fall back to a different account. */
export class ConnectionRecovery {
  private generationValue = 0;
  private attempt = 0;
  private startedAt = 0;
  private lastTrafficAt = 0;
  private pending = false;
  private hydrated = false;
  private stopped = false;
  private paused = false;
  private terminal: ConnectionRecoveryTerminal | null = null;
  private everLost = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** After a resume from hidden or frozen, the watchdog waits until then for traffic (BUG-062). */
  private resumeProbeUntil = 0;
  private readonly now: () => number;

  constructor(private readonly dependencies: ConnectionRecoveryDependencies) {
    this.now = dependencies.now ?? (() => Date.now());
  }

  get generation(): number { return this.generationValue; }
  get state(): ConnectionRecoveryState {
    if (this.terminal !== null) return this.terminal;
    if (!this.dependencies.online()) return 'offline';
    return this.hydrated ? 'ready' : this.everLost ? 'reconnecting' : 'connecting';
  }
  isCurrent(generation: number): boolean {
    return !this.stopped && generation === this.generationValue;
  }
  observedTraffic(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.lastTrafficAt = this.now();
    this.resumeProbeUntil = 0;
  }
  ready(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.pending = false;
    this.hydrated = true;
    this.attempt = 0;
    this.observedTraffic(generation);
    this.dependencies.changed();
  }
  /** `terminal` stops retrying: `true` (or 'sign-in-required') needs a new sign-in, 'update-required' a reload. */
  fail(generation: number, error: string, terminal: boolean | ConnectionRecoveryTerminal = false): void {
    if (!this.isCurrent(generation)) return;
    this.generationValue += 1;
    this.pending = false;
    this.hydrated = false;
    this.terminal = terminal === true ? 'sign-in-required' : terminal === false ? null : terminal;
    this.everLost = true;
    this.cancelRetry();
    this.dependencies.disconnect();
    this.dependencies.changed(error);
    if (this.terminal === null) this.schedule();
  }
  pause(): void {
    this.paused = true;
    this.cancelRetry();
    if (this.pending) this.fail(this.generationValue, 'connection_paused');
  }
  resume(): void {
    if (!this.dependencies.online()) {
      if (this.pending || this.hydrated) this.fail(this.generationValue, 'offline');
      return;
    }
    if (!this.dependencies.visible()) return;
    // Time spent hidden or frozen is not silence on the connection (BUG-062): the page could not
    // run, and the world's updates queued meanwhile arrive just after this. So a hydrated
    // connection gets RESUME_PROBE_MS to show traffic before the watchdog may fail it. A socket
    // that died meanwhile still fails at once through socketClosed.
    if (this.paused && this.hydrated) this.resumeProbeUntil = this.now() + RESUME_PROBE_MS;
    this.paused = false;
    this.check();
  }
  retry(): void {
    if (this.terminal !== null || this.stopped || !this.allowed()) return;
    // A button never creates a parallel auth refresh or socket handshake.
    if (this.pending) return;
    if (this.hydrated) this.fail(this.generationValue, 'reconnecting');
    this.cancelRetry();
    this.check();
  }
  check(): void {
    if (this.stopped || this.terminal !== null || !this.allowed()) return;
    if (this.pending || this.hydrated) {
      const probing = this.hydrated && this.now() < this.resumeProbeUntil;
      if (this.dependencies.socketClosed()
        || (!probing && this.now() - this.lastTrafficAt > 15_000)
        || (this.pending && this.now() - this.startedAt > 30_000)) {
        this.fail(this.generationValue, 'connection_stalled');
      }
      return;
    }
    if (this.retryTimer === null) this.start();
  }
  stop(): void {
    this.stopped = true;
    this.generationValue += 1;
    this.cancelRetry();
    this.dependencies.disconnect();
  }
  private allowed(): boolean {
    return !this.paused && this.dependencies.online() && this.dependencies.visible();
  }
  private cancelRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private schedule(): void {
    if (!this.allowed() || this.stopped || this.terminal !== null) return;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(this.attempt++, 5));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.allowed()) this.start();
    }, delay);
  }
  private start(): void {
    if (this.pending || this.hydrated || !this.allowed() || this.stopped || this.terminal !== null) return;
    this.pending = true;
    this.startedAt = this.now();
    this.lastTrafficAt = this.startedAt;
    const generation = ++this.generationValue;
    this.dependencies.changed();
    void this.dependencies.connect(generation).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.fail(generation, message);
    });
  }
}
