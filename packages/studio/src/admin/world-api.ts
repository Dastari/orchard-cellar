import { diffAdminValues, type AdminJsonObject } from '@orchard/sim';
import type {
  AdminMutationPreview,
  AdminReason,
  AdminValidationIssue,
  AdminWorldValidationReport,
} from '../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from './api.js';

export interface AdminSpaceRecord {
  readonly spaceId: string;
  readonly label: string;
  readonly sizeTiles: number;
  readonly flags: AdminJsonObject;
}

export interface AdminWorldControlSnapshot {
  readonly worldVersion: string;
  readonly spaces: readonly AdminSpaceRecord[];
  readonly portals: readonly Readonly<{ portalId: string; fromSpace: string; toSpace: string; paired: boolean }>[];
  readonly environment: Readonly<{ calendarTick: string; weatherMode: string; windDirection: string; motd: string }>;
  readonly mapRevisions: readonly Readonly<{ revisionId: string; revision: number; label: string }>[];
  readonly homesteads: readonly Readonly<{ spaceId: string; ownerName: string; tileX: number; tileY: number }>[];
}

export type AdminWorldControlDraft =
  | { readonly operation: 'set_space_flags'; readonly spaceId: string; readonly patch: AdminJsonObject }
  | { readonly operation: 'repair_portal_pair'; readonly portalId: string }
  | { readonly operation: 'run_world_repair'; readonly reportId: string }
  | { readonly operation: 'set_time'; readonly calendarTick: string }
  | { readonly operation: 'set_weather'; readonly weatherMode: string }
  | { readonly operation: 'set_wind'; readonly direction: string }
  | { readonly operation: 'set_motd'; readonly body: string }
  | { readonly operation: 'global_notice'; readonly body: string }
  | { readonly operation: 'respawn_resources'; readonly spaceId: string; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
  | { readonly operation: 'restore_map'; readonly revisionId: string }
  | { readonly operation: 'move_homestead'; readonly spaceId: string; readonly tileX: number; readonly tileY: number };

export interface AdminWorldControlMutation {
  readonly draft: AdminWorldControlDraft;
  readonly reason: AdminReason;
  readonly clientMutationId: string;
  readonly dryRun: boolean;
}

export interface AdminWorldControlPreview extends Omit<AdminMutationPreview, 'operation'> {
  readonly operation: AdminWorldControlDraft['operation'];
  readonly fingerprint: string;
}

export interface AdminWorldControlResult {
  readonly preview: AdminWorldControlPreview;
  readonly committed: boolean;
  readonly worldVersion: string;
  readonly auditId: string | null;
  readonly notice: string | null;
}

/** Final U5 live-service seam. Generated bindings implement this once W5 is
 * generated; sandbox is the only place allowed to construct the mock. */
export interface AdminWorldApi {
  readonly source: 'mock' | 'live';
  snapshot(): Promise<AdminWorldControlSnapshot>;
  validateWorld(): Promise<AdminWorldValidationReport>;
  mutate(
    mutation: AdminWorldControlMutation,
    expectedWorldVersion: string,
    previewFingerprint: string | null,
    reportFingerprint: string | null,
  ): Promise<AdminWorldControlResult>;
}

interface Receipt {
  readonly mutation: AdminWorldControlMutation;
  readonly baseVersion: string;
  readonly fingerprint: string;
  readonly reportFingerprint: string | null;
  readonly preview: AdminWorldControlPreview;
}

const frozen = <T>(value: T): Readonly<T> => Object.freeze(structuredClone(value));

function hash(value: unknown): string {
  let result = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}

function documentFor(snapshot: AdminWorldControlSnapshot, draft: AdminWorldControlDraft): readonly [AdminJsonObject, AdminJsonObject] {
  const before: AdminJsonObject = { worldVersion: snapshot.worldVersion };
  switch (draft.operation) {
    case 'set_space_flags': {
      const space = snapshot.spaces.find(({ spaceId }) => spaceId === draft.spaceId);
      if (space === undefined) throw new Error('admin_entity_not_found');
      return [{ ...before, flags: space.flags }, { ...before, flags: { ...space.flags, ...draft.patch } }];
    }
    case 'repair_portal_pair': return [{ ...before, portalId: draft.portalId, paired: false }, { ...before, portalId: draft.portalId, paired: true }];
    case 'run_world_repair': return [{ ...before, reportId: draft.reportId, repaired: false }, { ...before, reportId: draft.reportId, repaired: true }];
    case 'set_time': return [{ ...before, calendarTick: snapshot.environment.calendarTick }, { ...before, calendarTick: draft.calendarTick }];
    case 'set_weather': return [{ ...before, weatherMode: snapshot.environment.weatherMode }, { ...before, weatherMode: draft.weatherMode }];
    case 'set_wind': return [{ ...before, direction: snapshot.environment.windDirection }, { ...before, direction: draft.direction }];
    case 'set_motd': return [{ ...before, body: snapshot.environment.motd }, { ...before, body: draft.body.trim() }];
    case 'global_notice': return [{ ...before, notice: null }, { ...before, notice: draft.body.trim() }];
    case 'respawn_resources': return [{ ...before, resourcesRespawned: null }, { ...before, resourcesRespawned: `${draft.spaceId}:${draft.x0},${draft.y0}-${draft.x1},${draft.y1}` }];
    case 'restore_map': return [{ ...before, revisionId: 'head' }, { ...before, revisionId: draft.revisionId }];
    case 'move_homestead': {
      const home = snapshot.homesteads.find(({ spaceId }) => spaceId === draft.spaceId);
      if (home === undefined) throw new Error('admin_entity_not_found');
      return [{ ...before, tileX: home.tileX, tileY: home.tileY }, { ...before, tileX: draft.tileX, tileY: draft.tileY }];
    }
  }
}

export class MockAdminWorldApi implements AdminWorldApi {
  readonly source = 'mock' as const;
  readonly #receipts = new Map<string, Receipt>();
  #revision = 7;
  #spaces: AdminSpaceRecord[] = [
    { spaceId: '0', label: 'Topside', sizeTiles: 128, flags: { ownerOnly: false, buildAllowed: true, weather: true } },
    { spaceId: '30000', label: 'Ada homestead', sizeTiles: 48, flags: { ownerOnly: false, buildAllowed: true, weather: true } },
  ];
  #environment = { calendarTick: '42000', weatherMode: 'auto', windDirection: 'auto', motd: 'Welcome to Orchard.' };
  #homesteads = [{ spaceId: '30000', ownerName: 'Ada Orchard', tileX: 24, tileY: 30 }];
  #activeReport: AdminWorldValidationReport | null = null;
  #auditSequence = 0;

  async snapshot(): Promise<AdminWorldControlSnapshot> {
    return frozen({
      worldVersion: this.worldVersion(), spaces: this.#spaces.slice(0, 100), environment: this.#environment,
      portals: [{ portalId: '81', fromSpace: '0', toSpace: '30000', paired: false }].slice(0, 100),
      mapRevisions: [{ revisionId: '18', revision: 18, label: 'Current' }, { revisionId: '17', revision: 17, label: 'Before orchard expansion' }],
      homesteads: this.#homesteads.slice(0, 100),
    });
  }

  async validateWorld(): Promise<AdminWorldValidationReport> {
    const issues: readonly AdminValidationIssue[] = [
      { code: 'portal_pair_missing', severity: 'error', target: { kind: 'entity', entityId: 'portal:81' }, message: 'Reverse portal is missing.', repairable: true },
      { code: 'definition_missing', severity: 'warning', target: { kind: 'entity', entityId: 'legacy:4' }, message: 'Legacy definition is unavailable; no automatic rewrite will occur.', repairable: false },
    ];
    const report = frozen({ reportId: `report-${this.#revision}`, worldVersion: this.worldVersion(),
      fingerprint: `report:${hash({ revision: this.#revision, issues })}`, issues,
      expiresAtMicros: String(1_900_000_060_000_000 + this.#revision) });
    this.#activeReport = report; return report;
  }

  async mutate(
    mutation: AdminWorldControlMutation,
    expectedWorldVersion: string,
    previewFingerprint: string | null,
    reportFingerprint: string | null,
  ): Promise<AdminWorldControlResult> {
    normalizeAdminReason(String(mutation.reason));
    const current = await this.snapshot();
    if (expectedWorldVersion !== current.worldVersion) throw new Error('admin_world_revision_conflict');
    if (mutation.draft.operation === 'run_world_repair' && (this.#activeReport?.reportId !== mutation.draft.reportId
      || this.#activeReport.fingerprint !== reportFingerprint || this.#activeReport.worldVersion !== expectedWorldVersion)) {
      throw new Error('admin_preview_required');
    }
    const [before, after] = documentFor(current, mutation.draft);
    const fingerprint = `preview:${hash({ mutation: { ...mutation, dryRun: false }, expectedWorldVersion, reportFingerprint, after })}`;
    const preview: AdminWorldControlPreview = frozen({ operation: mutation.draft.operation,
      target: 'spaceId' in mutation.draft ? { kind: 'space', spaceId: mutation.draft.spaceId } : { kind: 'world' },
      baseVersion: expectedWorldVersion, preview: diffAdminValues(before, after), warnings:
        mutation.draft.operation === 'run_world_repair' ? ['Only safe actions in the exact validation report will be applied.'] : [],
      expiresAtMicros: '1900000060000000', fingerprint });
    if (mutation.dryRun) {
      this.#receipts.set(mutation.clientMutationId, { mutation, baseVersion: expectedWorldVersion,
        fingerprint, reportFingerprint, preview });
      return frozen({ preview, committed: false, worldVersion: expectedWorldVersion, auditId: null, notice: null });
    }
    const receipt = this.#receipts.get(mutation.clientMutationId);
    if (receipt === undefined || receipt.baseVersion !== expectedWorldVersion
      || receipt.fingerprint !== previewFingerprint || receipt.reportFingerprint !== reportFingerprint
      || hash({ ...receipt.mutation, dryRun: false }) !== hash({ ...mutation, dryRun: false })) {
      throw new Error('admin_preview_required');
    }
    this.apply(mutation.draft); this.#receipts.delete(mutation.clientMutationId); this.#revision += 1;
    return frozen({ preview, committed: true, worldVersion: this.worldVersion(),
      auditId: `world-audit-${++this.#auditSequence}`, notice: 'Active players were notified of the world administration change.' });
  }

  private worldVersion(): string { return `world-v${this.#revision}`; }

  private apply(draft: AdminWorldControlDraft): void {
    if (draft.operation === 'set_space_flags') this.#spaces = this.#spaces.map((space) => space.spaceId === draft.spaceId
      ? { ...space, flags: { ...space.flags, ...draft.patch } } : space);
    else if (draft.operation === 'set_time') this.#environment = { ...this.#environment, calendarTick: draft.calendarTick };
    else if (draft.operation === 'set_weather') this.#environment = { ...this.#environment, weatherMode: draft.weatherMode };
    else if (draft.operation === 'set_wind') this.#environment = { ...this.#environment, windDirection: draft.direction };
    else if (draft.operation === 'set_motd') this.#environment = { ...this.#environment, motd: draft.body.trim() };
    else if (draft.operation === 'move_homestead') this.#homesteads = this.#homesteads.map((home) => home.spaceId === draft.spaceId
      ? { ...home, tileX: draft.tileX, tileY: draft.tileY } : home);
  }
}

export function createMockAdminWorldApi(): AdminWorldApi { return new MockAdminWorldApi(); }
