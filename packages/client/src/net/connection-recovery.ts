export type ConnectionRecoveryState = 'ready' | 'connecting' | 'reconnecting' | 'offline' | 'sign-in-required';

export interface ConnectionRecoveryDependencies {
  readonly connect: (generation: number) => Promise<void>;
  readonly disconnect: () => void;
  readonly changed: (error?: string) => void;
  readonly online: () => boolean;
  readonly visible: () => boolean;
  readonly socketClosed: () => boolean;
  readonly now?: () => number;
}

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
  private terminal = false;
  private everLost = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(private readonly dependencies: ConnectionRecoveryDependencies) {
    this.now = dependencies.now ?? (() => Date.now());
  }

  get generation(): number { return this.generationValue; }
  get state(): ConnectionRecoveryState {
    if (this.terminal) return 'sign-in-required';
    if (!this.dependencies.online()) return 'offline';
    return this.hydrated ? 'ready' : this.everLost ? 'reconnecting' : 'connecting';
  }
  isCurrent(generation: number): boolean {
    return !this.stopped && generation === this.generationValue;
  }
  observedTraffic(generation: number): void {
    if (this.isCurrent(generation)) this.lastTrafficAt = this.now();
  }
  ready(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.pending = false;
    this.hydrated = true;
    this.attempt = 0;
    this.observedTraffic(generation);
    this.dependencies.changed();
  }
  fail(generation: number, error: string, terminal = false): void {
    if (!this.isCurrent(generation)) return;
    this.generationValue += 1;
    this.pending = false;
    this.hydrated = false;
    this.terminal = terminal;
    this.everLost = true;
    this.cancelRetry();
    this.dependencies.disconnect();
    this.dependencies.changed(error);
    if (!terminal) this.schedule();
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
    this.paused = false;
    this.check();
  }
  retry(): void {
    if (this.terminal || this.stopped || !this.allowed()) return;
    // A button never creates a parallel auth refresh or socket handshake.
    if (this.pending) return;
    if (this.hydrated) this.fail(this.generationValue, 'reconnecting');
    this.cancelRetry();
    this.check();
  }
  check(): void {
    if (this.stopped || this.terminal || !this.allowed()) return;
    if (this.pending || this.hydrated) {
      if (this.dependencies.socketClosed()
        || this.now() - this.lastTrafficAt > 15_000
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
    if (!this.allowed() || this.stopped || this.terminal) return;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(this.attempt++, 5));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.allowed()) this.start();
    }, delay);
  }
  private start(): void {
    if (this.pending || this.hydrated || !this.allowed() || this.stopped || this.terminal) return;
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
