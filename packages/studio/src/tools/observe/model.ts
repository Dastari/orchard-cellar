import type {
  AdminAuditRow,
  AdminConnectionRow,
  AdminPage,
} from '../../admin/api.js';
import type {
  AdminTelemetrySnapshot,
  AdminWorldValidationReport,
} from '../../../../world/src/admin/contracts.js';
import type { StudioToolDefinition } from '../../shell/tool-registry.js';

export const OBSERVE_TOOL_REGISTRATION = Object.freeze({
  id: 'observe', label: 'World Observe', mode: 'observe', icon: 'editor.observe',
  routes: ['/observe/world'], docks: ['live_outliner', 'telemetry', 'console'],
  commands: [{ id: 'observe.refresh', label: 'Refresh world observation', keywords: ['audit', 'connections', 'telemetry', 'validation'] }],
} satisfies StudioToolDefinition);

export type ObserveTab = 'audit' | 'connections' | 'client_errors' | 'presence' | 'telemetry' | 'validation';
export const OBSERVE_TABS = ['audit', 'connections', 'client_errors', 'presence', 'telemetry', 'validation'] as const satisfies readonly ObserveTab[];

export interface ObservePresenceRow {
  readonly identity: string;
  readonly displayName: string;
  readonly spaceId: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly online: boolean;
}

export interface ObserveClientErrorRow {
  readonly id: string;
  readonly actorIdentity: string;
  readonly clientMutationId: string;
  readonly kind: string;
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly buildId: string;
  readonly fingerprint: string;
  readonly clientObservedAtMs: string;
  readonly occurredAtMicros: string;
}

export interface ObserveClientErrorCursor { readonly afterMicros: string; readonly afterId: string }
export interface ObserveClientErrorPage {
  readonly rows: readonly ObserveClientErrorRow[];
  readonly next: ObserveClientErrorCursor | null;
}

export interface ObserveApi {
  auditPage(filter: Readonly<Record<string, string>>, cursor: string | null): Promise<AdminPage<AdminAuditRow>>;
  connectionsPage(identity: string | null, cursor: string | null): Promise<AdminPage<AdminConnectionRow>>;
  presence(): Promise<readonly ObservePresenceRow[]>;
  telemetry(): Promise<AdminTelemetrySnapshot>;
  validateWorld(): Promise<AdminWorldValidationReport>;
  clientErrors(cursor: ObserveClientErrorCursor | null, limit?: number): Promise<ObserveClientErrorPage>;
}

export interface ObserveSnapshot {
  readonly tab: ObserveTab;
  readonly audit: readonly AdminAuditRow[];
  readonly auditCursor: string | null;
  readonly connections: readonly AdminConnectionRow[];
  readonly connectionCursor: string | null;
  readonly clientErrors: readonly ObserveClientErrorRow[];
  readonly clientErrorCursor: ObserveClientErrorCursor | null;
  readonly presence: readonly ObservePresenceRow[];
  readonly telemetry: AdminTelemetrySnapshot | null;
  readonly validation: AdminWorldValidationReport | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export class ObserveModel {
  #tab: ObserveTab = 'presence';
  #audit: readonly AdminAuditRow[] = Object.freeze([]);
  #auditCursor: string | null = null;
  #connections: readonly AdminConnectionRow[] = Object.freeze([]);
  #connectionCursor: string | null = null;
  #clientErrors: readonly ObserveClientErrorRow[] = Object.freeze([]);
  #clientErrorCursor: ObserveClientErrorCursor | null = null;
  #presence: readonly ObservePresenceRow[] = Object.freeze([]);
  #telemetry: AdminTelemetrySnapshot | null = null;
  #validation: AdminWorldValidationReport | null = null;
  #loading = false;
  #error: string | null = null;
  #epoch = 0;

  constructor(private readonly api: ObserveApi) {}

  snapshot(): ObserveSnapshot {
    return Object.freeze({
      tab: this.#tab, audit: this.#audit, auditCursor: this.#auditCursor,
      connections: this.#connections, connectionCursor: this.#connectionCursor,
      clientErrors: this.#clientErrors, clientErrorCursor: this.#clientErrorCursor,
      presence: this.#presence, telemetry: this.#telemetry, validation: this.#validation,
      loading: this.#loading, error: this.#error,
    });
  }

  selectTab(tab: ObserveTab): void { this.#tab = tab; }

  async refresh(filter: Readonly<Record<string, string>> = {}, identity: string | null = null): Promise<void> {
    const epoch = ++this.#epoch; this.#loading = true; this.#error = null;
    try {
      const [audit, connections, clientErrors, presence, telemetry, validation] = await Promise.all([
        this.api.auditPage(filter, null), this.api.connectionsPage(identity, null), this.api.clientErrors(null),
        this.api.presence(), this.api.telemetry(), this.api.validateWorld(),
      ]);
      if (epoch !== this.#epoch) return;
      this.#audit = audit.rows; this.#auditCursor = audit.nextCursor;
      this.#connections = connections.rows; this.#connectionCursor = connections.nextCursor;
      this.#clientErrors = clientErrors.rows; this.#clientErrorCursor = clientErrors.next;
      this.#presence = presence; this.#telemetry = telemetry; this.#validation = validation;
    } catch (error: unknown) {
      if (epoch === this.#epoch) this.#error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally { if (epoch === this.#epoch) this.#loading = false; }
  }

  async moreAudit(filter: Readonly<Record<string, string>> = {}): Promise<void> {
    if (this.#auditCursor === null || this.#loading) return;
    const page = await this.api.auditPage(filter, this.#auditCursor);
    this.#audit = Object.freeze([...this.#audit, ...page.rows]); this.#auditCursor = page.nextCursor;
  }

  async moreConnections(identity: string | null = null): Promise<void> {
    if (this.#connectionCursor === null || this.#loading) return;
    const page = await this.api.connectionsPage(identity, this.#connectionCursor);
    this.#connections = Object.freeze([...this.#connections, ...page.rows]); this.#connectionCursor = page.nextCursor;
  }

  async moreClientErrors(): Promise<void> {
    if (this.#clientErrorCursor === null || this.#loading) return;
    const page = await this.api.clientErrors(this.#clientErrorCursor);
    this.#clientErrors = Object.freeze([...this.#clientErrors, ...page.rows]); this.#clientErrorCursor = page.next;
  }
}

export class MockObserveApi implements ObserveApi {
  async auditPage(_filter: Readonly<Record<string, string>>, cursor: string | null): Promise<AdminPage<AdminAuditRow>> {
    const rows: readonly AdminAuditRow[] = [{
      id: `audit-${cursor ?? '0'}`, actorIdentity: 'identity-ada', operation: 'unstick',
      target: { kind: 'player', identity: 'identity-bea' }, occurredAtMicros: '1780000000000000',
      payload: {
        schemaVersion: 1, clientMutationId: 'observe-fixture', target: { kind: 'player', identity: 'identity-bea' },
        reason: 'Seeded support remedy' as AdminAuditRow['payload']['reason'], changes: [], inverse: null,
      },
    }];
    return Object.freeze({ rows: Object.freeze(rows), nextCursor: cursor === null ? 'page-2' : null });
  }

  async connectionsPage(identity: string | null, cursor: string | null): Promise<AdminPage<AdminConnectionRow>> {
    const resolved = identity ?? 'identity-bea';
    return Object.freeze({ rows: Object.freeze([{ connectionId: `connection-${cursor ?? '0'}`, identity: resolved, connectedAtMicros: '1780000000000000', disconnectedAtMicros: null, remoteAddress: null, active: true }]), nextCursor: cursor === null ? 'page-2' : null });
  }

  async presence(): Promise<readonly ObservePresenceRow[]> {
    return Object.freeze([{ identity: 'identity-bea', displayName: 'Bea Bramble', spaceId: '0', chunkX: 2, chunkY: 3, online: true }]);
  }

  async telemetry(): Promise<AdminTelemetrySnapshot> {
    return Object.freeze({
      sampledAtMicros: '1780000000000000',
      tick: { authorityTick: '42', ticks: 42, obstacleTotal: 100 },
      rowsTouched: { total: 12, playerPositionUpdates: 4, npcUpdates: 3, chestUpdates: 0, itemDeletes: 0, auditDeletes: 0 },
      rowsScanned: { total: 20, trade: 0, overflow: 0, regrowth: 2, effects: 1, invites: 0, items: 3, audit: 0, speech: 0 },
      subscriptions: { activeConnections: '1', onlinePlayers: 1 },
    });
  }

  async validateWorld(): Promise<AdminWorldValidationReport> {
    return Object.freeze({ reportId: 'report-clean', worldVersion: 'world-v42', fingerprint: 'report:clean', issues: Object.freeze([]), expiresAtMicros: '1780000060000000' });
  }

  async clientErrors(cursor: ObserveClientErrorCursor | null): Promise<ObserveClientErrorPage> {
    return Object.freeze({ rows: Object.freeze([{
      id: `client-error-${cursor?.afterId ?? '0'}`, actorIdentity: 'identity-bea',
      clientMutationId: 'observe-client-error', kind: 'connection', message: 'Connection retry exhausted',
      stack: '', route: '/play', buildId: 'sandbox', fingerprint: 'deadbeef',
      clientObservedAtMs: '1780000000000', occurredAtMicros: '1780000000000000',
    }]), next: cursor === null ? Object.freeze({ afterMicros: '1780000000000000', afterId: 'client-error-0' }) : null });
  }
}
