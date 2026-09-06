export const CLIENT_ERROR_MESSAGE_MAX = 512;
export const CLIENT_ERROR_STACK_MAX = 2_048;
export const CLIENT_ERROR_QUEUE_MAX = 16;
export const CLIENT_ERROR_RATE_LIMIT = 6;
export const CLIENT_ERROR_RATE_WINDOW_MS = 60_000;
export const CLIENT_ERROR_QUEUE_KEY = 'orchard.client-error-queue:v1';

export type ClientErrorKind = 'error' | 'unhandled_rejection' | 'connection' | 'content';

export interface ClientErrorReport {
  readonly schemaVersion: 1;
  readonly clientMutationId: string;
  readonly kind: ClientErrorKind;
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly buildId: string;
  readonly fingerprint: string;
  readonly observedAtMs: number;
}

export interface ClientErrorReportAdapter {
  reportClientError(report: ClientErrorReport): Promise<void>;
}

export interface ClientErrorReporterHost {
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
}

export interface ClientErrorReporterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CreateClientErrorReporterOptions {
  readonly host?: ClientErrorReporterHost;
  readonly storage?: ClientErrorReporterStorage | null;
  readonly route?: () => string;
  readonly buildId?: string;
  readonly now?: () => number;
  readonly mutationId?: () => string;
}

const WHOLE_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu,
  /\b(?:access|refresh|id)[_-]?token\b\s*[:=]\s*["']?[^\s"']+/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
] as const;
const QUERY_SECRET_PATTERN = /([?&](?:code|token|access_token|id_token|refresh_token)=)[^&#\s]+/giu;

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function redactClientErrorText(value: string, maximum: number): string {
  let result = value;
  for (const pattern of WHOLE_SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]');
  result = result.replace(QUERY_SECRET_PATTERN, '$1[REDACTED]');
  return [...result].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  }).join('').slice(0, maximum);
}

function safeRoute(route: string): string {
  const path = route.split(/[?#]/u, 1)[0] ?? '/';
  return redactClientErrorText(path.startsWith('/') ? path : '/', 160);
}

function errorParts(value: unknown): { readonly message: string; readonly stack: string } {
  if (value instanceof Error) return { message: value.message, stack: value.stack ?? '' };
  if (typeof value === 'string') return { message: value, stack: '' };
  try { return { message: JSON.stringify(value), stack: '' }; }
  catch { return { message: String(value), stack: '' }; }
}

function isReport(value: unknown): value is ClientErrorReport {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ClientErrorReport>;
  return candidate.schemaVersion === 1
    && typeof candidate.clientMutationId === 'string'
    && ['error', 'unhandled_rejection', 'connection', 'content'].includes(candidate.kind ?? '')
    && typeof candidate.message === 'string'
    && typeof candidate.stack === 'string'
    && typeof candidate.route === 'string'
    && typeof candidate.buildId === 'string'
    && typeof candidate.fingerprint === 'string'
    && typeof candidate.observedAtMs === 'number';
}

function readQueue(storage: ClientErrorReporterStorage | null): ClientErrorReport[] {
  if (storage === null) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CLIENT_ERROR_QUEUE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isReport).slice(-CLIENT_ERROR_QUEUE_MAX) : [];
  } catch { return []; }
}

export class ClientErrorReporter {
  readonly #host: ClientErrorReporterHost | null;
  readonly #storage: ClientErrorReporterStorage | null;
  readonly #route: () => string;
  readonly #buildId: string;
  readonly #now: () => number;
  readonly #mutationId: () => string;
  readonly #sentAt: number[] = [];
  #queue: ClientErrorReport[];
  #adapter: ClientErrorReportAdapter | null = null;
  #flushPromise: Promise<void> | null = null;
  #disposed = false;

  constructor(options: CreateClientErrorReporterOptions = {}) {
    this.#host = options.host ?? (typeof window === 'undefined' ? null : window);
    this.#storage = options.storage === undefined
      ? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
      : options.storage;
    this.#route = options.route ?? (() => typeof location === 'undefined' ? '/' : location.pathname);
    this.#buildId = redactClientErrorText(options.buildId ?? 'development', 96);
    this.#now = options.now ?? (() => Date.now());
    this.#mutationId = options.mutationId ?? (() => crypto.randomUUID());
    this.#queue = readQueue(this.#storage);
    this.#host?.addEventListener('error', this.onError);
    this.#host?.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  queued(): readonly ClientErrorReport[] { return Object.freeze([...this.#queue]); }

  attach(adapter: ClientErrorReportAdapter): void {
    if (this.#disposed) return;
    this.#adapter = adapter;
    void this.flush();
  }

  detach(): void { this.#adapter = null; }

  capture(kind: ClientErrorKind, value: unknown): ClientErrorReport | null {
    if (this.#disposed) return null;
    const observedAtMs = Math.floor(this.#now());
    while (this.#sentAt.length > 0
      && observedAtMs - this.#sentAt[0]! >= CLIENT_ERROR_RATE_WINDOW_MS) this.#sentAt.shift();
    if (this.#sentAt.length >= CLIENT_ERROR_RATE_LIMIT) return null;
    const parts = errorParts(value);
    const message = redactClientErrorText(parts.message || 'Unknown client error', CLIENT_ERROR_MESSAGE_MAX);
    const stack = redactClientErrorText(parts.stack, CLIENT_ERROR_STACK_MAX);
    const route = safeRoute(this.#route());
    const fingerprint = stableHash(`${kind}\n${message}\n${stack.split('\n')[0] ?? ''}\n${route}`);
    if (this.#queue.some((report) => report.fingerprint === fingerprint)) return null;
    this.#sentAt.push(observedAtMs);
    const report = Object.freeze({
      schemaVersion: 1 as const,
      clientMutationId: `client-error.${this.#mutationId()}`.slice(0, 96),
      kind, message, stack, route, buildId: this.#buildId, fingerprint, observedAtMs,
    });
    this.#queue.push(report);
    this.#queue = this.#queue.slice(-CLIENT_ERROR_QUEUE_MAX);
    this.persist();
    void this.flush();
    return report;
  }

  async flush(): Promise<void> {
    if (this.#flushPromise !== null) return await this.#flushPromise;
    if (this.#adapter === null || this.#disposed) return;
    this.#flushPromise = (async () => {
      while (this.#adapter !== null && this.#queue.length > 0) {
        const current = this.#queue[0]!;
        try { await this.#adapter.reportClientError(current); }
        catch { return; }
        this.#queue.shift();
        this.persist();
      }
    })();
    try { await this.#flushPromise; }
    finally { this.#flushPromise = null; }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#adapter = null;
    this.#host?.removeEventListener('error', this.onError);
    this.#host?.removeEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private persist(): void {
    try { this.#storage?.setItem(CLIENT_ERROR_QUEUE_KEY, JSON.stringify(this.#queue)); }
    catch { /* Error reporting must never destabilize the game. */ }
  }

  private readonly onError = (event: ErrorEvent): void => {
    this.capture('error', event.error ?? event.message);
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.capture('unhandled_rejection', event.reason);
  };
}

export function createClientErrorReporter(options: CreateClientErrorReporterOptions = {}): ClientErrorReporter {
  return new ClientErrorReporter(options);
}

/** Installed before either account or overworld chunks load. It queues only
 * redacted reports locally until the authenticated world connection attaches
 * the audited reducer adapter. */
export const clientErrorReporter = createClientErrorReporter({
  buildId: import.meta.env['VITE_BUILD_ID'] ?? import.meta.env.MODE,
});
