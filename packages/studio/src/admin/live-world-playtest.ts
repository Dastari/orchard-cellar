import { Identity } from 'spacetimedb';
import type { DbConnection } from '@orchard/world-bindings';
import {
  ADMIN_MUTATION_ID_PATTERN,
  type AdminMutationPreview,
} from '../../../world/src/admin/contracts.js';
import { decodeAdminTransportResult, normalizeAdminReason } from './api.js';
import type { WorldPlaytestAdapter, WorldPlaytestRequest } from './world-playtest-api.js';

type ConnectionProvider = () => DbConnection | null;

interface PreviewEnvelope {
  readonly preview: AdminMutationPreview;
  readonly previewFingerprint: string;
  readonly committedVersion: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isAdminJsonValue = (value: unknown): boolean => value === null || isString(value)
  || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  || (Array.isArray(value) && value.every(isAdminJsonValue))
  || (isRecord(value) && Object.values(value).every(isAdminJsonValue));
const isTarget = (value: unknown): boolean => isRecord(value) && (
  (value['kind'] === 'player' && isString(value['identity']))
  || (value['kind'] === 'space' && isString(value['spaceId']))
  || (value['kind'] === 'entity' && isString(value['entityId']))
  || value['kind'] === 'world'
);
const isPreviewEnvelope = (value: unknown): value is PreviewEnvelope => isRecord(value)
  && isString(value['previewFingerprint']) && isString(value['committedVersion'])
  && isRecord(value['preview']) && isString(value['preview']['operation'])
  && isTarget(value['preview']['target']) && isString(value['preview']['baseVersion'])
  && isString(value['preview']['expiresAtMicros']) && Array.isArray(value['preview']['warnings'])
  && value['preview']['warnings'].every(isString) && isRecord(value['preview']['preview'])
  && typeof value['preview']['preview']['truncated'] === 'boolean'
  && Array.isArray(value['preview']['preview']['changes'])
  && value['preview']['preview']['changes'].every((change) => isRecord(change)
    && isString(change['path']) && isAdminJsonValue(change['before']) && isAdminJsonValue(change['after']));

function requiredConnection(provider: ConnectionProvider): DbConnection {
  const connection = provider();
  if (connection === null) throw new Error('not_connected');
  return connection;
}

function asIdentity(value: string): Identity {
  try { return Identity.fromString(value); }
  catch { throw new Error('admin_payload_invalid'); }
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error('admin_payload_invalid');
  }
  return value;
}

/** One-connection live adapter: it discovers the server-owned base version with
 * a dry run, polls the caller-only receipt view, then commits that exact receipt. */
export class StudioLiveWorldPlaytestAdapter implements WorldPlaytestAdapter {
  readonly source = 'live' as const;

  constructor(private readonly connection: ConnectionProvider) {}

  async run(request: WorldPlaytestRequest): Promise<void> {
    const connection = requiredConnection(this.connection);
    const reason = normalizeAdminReason(request.reason);
    if (!ADMIN_MUTATION_ID_PATTERN.test(request.clientMutationId)) {
      throw new Error('admin_payload_invalid');
    }
    await this.call(connection, request, reason, true, '', undefined);
    const receipt = await this.readReceipt(request.clientMutationId);
    if (receipt.preview.baseVersion.length === 0 || receipt.previewFingerprint.length === 0) {
      throw new Error('admin_preview_receipt_invalid');
    }
    await this.call(
      connection, request, reason, false,
      receipt.preview.baseVersion, receipt.previewFingerprint,
    );
  }

  private async call(
    connection: DbConnection,
    request: WorldPlaytestRequest,
    reason: string,
    dryRun: boolean,
    expectedBaseVersion: string,
    previewFingerprint: string | undefined,
  ): Promise<void> {
    const common = {
      reason, clientMutationId: request.clientMutationId, dryRun,
      expectedBaseVersion, previewFingerprint,
    };
    if (request.kind === 'spawn') {
      await connection.reducers.adminPlaytestSpawn({
        ...common, definitionId: request.definitionId,
        spaceId: boundedInteger(request.spaceId, 0, 0xffff),
        tileX: boundedInteger(request.tileX, -0x8000, 0x7fff),
        tileY: boundedInteger(request.tileY, -0x8000, 0x7fff),
      });
      return;
    }
    const identity = asIdentity(request.targetPlayer);
    if (request.kind === 'apply_effect') {
      await connection.reducers.adminPlaytestApplyEffect({
        ...common, definitionId: request.definitionId, identity,
      });
      return;
    }
    await connection.reducers.adminPlaytestGrantUpgrade({
      ...common, definitionId: request.definitionId, identity,
      rank: boundedInteger(request.rank, 1, 0xff),
    });
  }

  private async readReceipt(clientMutationId: string): Promise<PreviewEnvelope> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const connection = requiredConnection(this.connection);
      const row = [...connection.db.ownAdminMutationPreviews.iter()]
        .find((candidate) => candidate.clientMutationId === clientMutationId);
      if (row !== undefined) return decodeAdminTransportResult(row.previewJson, isPreviewEnvelope);
      await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    throw new Error('admin_preview_receipt_unavailable');
  }
}
