/** Bounded diagnostics for the isolated history gate. Never serialize error messages or causes. */
import { SHADOW_PUBLICATION_REFUSAL_CODES } from '../packages/world/src/content/chunk-shadow-runtime.js';
export const HISTORY_PHASES = [
  'connect', 'candidate-atlas', 'inventory-list', 'inventory-read', 'history-plan', 'history-backfill',
  'history-list', 'history-copy-status', 'history-atlas', 'history-read', 'history-suspend',
  'history-materialize', 'history-resume', 'history-verify-local', 'history-stage-blobs',
  'history-archive', 'history-verify-server', 'history-row-complete', 'history-retire-audit',
  'history-check', 'history-head', 'history-open-admin', 'history-privacy', 'history-restore',
  'history-restore-settle', 'history-restore-publication', 'history-inverse', 'history-inverse-settle',
  'history-inverse-publication', 'history-reconnect', 'history-reconnect-publication',
  'rejoin-capture', 'rejoin-verify', 'candidate-atlas-final',
] as const;
export type HistoryPhase = typeof HISTORY_PHASES[number];
export interface HistoryPhaseRow { readonly id: string; readonly revision: number }
export interface HistoryPhaseEvent {
  readonly stage: 'phase'; readonly phase: HistoryPhase; readonly status: 'start' | 'complete';
  readonly historyId?: string; readonly revision?: number;
}
export interface HistoryFailure {
  readonly code: string; readonly phase: HistoryPhase | 'unclassified';
  readonly errorKind: 'error' | 'sender-error' | 'internal-error' | 'pipeline-error' | 'sdk-string' | 'unknown';
  readonly historyId?: string; readonly revision?: number;
}

// Exact identifiers only. Dynamic details (document JSON, names, paths, confirmations, tokens)
// following a known identifier are discarded rather than allowed by a permissive prefix regex.
const KNOWN_CODES = new Set([
  ...SHADOW_PUBLICATION_REFUSAL_CODES, 'chunk_stage_quota_exceeded', 'chunk_asset_revision_changed',
  'static_history_rehearsal_failed', 'static_history_rehearsal_empty', 'static_history_rehearsal_head_missing',
  'static_history_rehearsal_inputs_required', 'static_history_rehearsal_opt_in_required',
  'static_history_rehearsal_report_exists', 'static_history_rehearsal_target_refused',
  'static_history_rehearsal_current_archive_missing', 'static_history_rehearsal_heads_mismatch',
  'static_history_rehearsal_document_mismatch', 'static_history_rehearsal_inverse_mismatch',
  'static_history_rehearsal_restore_not_atomic', 'static_history_rehearsal_undo_not_atomic',
  'static_history_rehearsal_admin_connect_failed', 'static_history_rehearsal_admin_connect_timeout',
  'static_history_rehearsal_admin_subscription_failed', 'static_history_rehearsal_admin_subscription_timeout',
  'static_history_rehearsal_private_read_unclassified', 'static_history_rehearsal_private_read_timeout',
  'static_history_rehearsal_private_read_allowed', 'static_history_rehearsal_digest_mismatch',
  'static_history_rehearsal_authorized_probe_timeout', 'static_history_rehearsal_preview_timeout',
  'static_history_rehearsal_preview_missing', 'static_history_rehearsal_restore_timeout',
  'static_history_rehearsal_audit_timeout', 'static_history_rehearsal_audit_failed',
  'static_history_rehearsal_audit_missing', 'static_history_rehearsal_inverse_missing',
  'static_history_rehearsal_candidate_atlas_changed', 'static_history_rehearsal_candidate_atlas_file_invalid',
  'static_history_rehearsal_candidate_atlas_index_invalid', 'static_history_rehearsal_candidate_blob_read_refused',
  'chunk_history_not_backfilled', 'chunk_history_revision_conflict', 'chunk_history_head_mismatch',
  'chunk_history_document_mismatch', 'chunk_history_legacy_document_mismatch', 'chunk_history_document_missing',
  'chunk_history_audit_document_mismatch', 'chunk_history_audit_reference_mismatch', 'chunk_history_audit_orphan',
  'chunk_history_publication_missing', 'chunk_history_page_size_invalid', 'chunk_history_empty',
  'chunk_history_document_copies_remaining', 'chunk_history_document_copy_retained', 'chunk_history_incomplete',
  'chunk_history_confirmation_required', 'chunk_history_pagination_incomplete', 'chunk_history_pagination_not_advancing',
  'chunk_history_rematerialize_requires_revision', 'chunk_history_credential_label_required', 'chunk_history_credential_refresh_failed',
  'chunk_document_metadata_missing', 'chunk_document_blob_missing', 'chunk_document_head_mismatch',
  'chunk_document_extension_missing', 'chunk_document_schema_unsupported', 'chunk_document_cells_incomplete',
  'chunk_document_cells_missing', 'chunk_document_cell_key_invalid', 'chunk_document_base_biome_invalid',
  'chunk_document_records_incomplete', 'chunk_document_list_invalid', 'chunk_document_key_unplaced',
  'chunk_document_key_missing', 'chunk_document_key_order_missing', 'chunk_document_key_order_choices_unused',
  'chunk_document_dimensions_mismatch', 'chunk_document_sha256_mismatch', 'chunk_document_semantic_hash_mismatch',
  'live_map_revision_not_found', 'live_map_revision_conflict', 'live_map_revision_exhausted',
  'owner_required', 'authentication_required', 'membership_required', 'membership_revoked', 'membership_blocked',
  'authentication_invalid_issuer', 'authentication_invalid_audience', 'membership_invalid_role',
  'connect_failed', 'connect_timeout', 'subscription_failed', 'subscription_timeout',
  'read_map_base_timeout', 'history_copy_status_timeout', 'retire_audit_documents_timeout',
  'list_history_timeout', 'read_history_timeout', 'backfill_history_timeout', 'verify_history_timeout',
  'stage_timeout', 'read_blob_timeout', 'world_connection_suspended',
  'origin_atlas_index_unavailable', 'origin_atlas_index_invalid', 'origin_atlas_index_too_large',
  'token_file_token_missing_refresh_first', 'rejoin_credentials_locked',
]);

function safeCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // SDK/internal wrappers can surround a known code. Emit only the exact allowlisted word.
  return value.slice(0, 2048).match(/\b[a-z][a-z0-9_]{0,95}\b/gu)?.find(word => KNOWN_CODES.has(word));
}
function rowMetadata(row?: HistoryPhaseRow): Pick<HistoryFailure, 'historyId' | 'revision'> {
  return row !== undefined && /^[1-9][0-9]{0,19}$/u.test(row.id) && BigInt(row.id) <= 0xffff_ffff_ffff_ffffn
    && Number.isInteger(row.revision) && row.revision >= 0 && row.revision <= 0xffff_ffff
    ? { historyId: row.id, revision: row.revision } : {};
}

export function historyFailure(error: unknown): HistoryFailure {
  if (error instanceof HistoryPhaseError) return error.failure;
  const kind = typeof error === 'string' ? 'sdk-string' : error instanceof Error
    ? 'code' in error ? 'pipeline-error' : error.name === 'SenderError' ? 'sender-error'
      : error.name === 'InternalError' ? 'internal-error' : 'error' : 'unknown';
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4 && !visited.has(current); depth += 1) {
    visited.add(current);
    const code = current instanceof Error
      ? safeCode('code' in current ? current.code : undefined) ?? safeCode(current.message) : safeCode(current);
    if (code !== undefined) return { code, phase: 'unclassified', errorKind: kind };
    current = current instanceof Error ? current.cause : undefined;
  }
  return { code: 'static_history_rehearsal_failed', phase: 'unclassified', errorKind: kind };
}

class HistoryPhaseError extends Error {
  constructor(readonly failure: HistoryFailure, cause: unknown) { super(failure.code, { cause }); }
}

/** Preserve the innermost failing phase; an outer backfill/check wrapper must not obscure it. */
export async function historyPhase<T>(phase: HistoryPhase, action: () => T | Promise<T>,
  progress?: (entry: HistoryPhaseEvent) => void, row?: HistoryPhaseRow): Promise<T> {
  const metadata = rowMetadata(row);
  progress?.({ stage: 'phase', phase, status: 'start', ...metadata });
  try {
    const result = await action();
    progress?.({ stage: 'phase', phase, status: 'complete', ...metadata });
    return result;
  } catch (error) {
    if (error instanceof HistoryPhaseError) throw error;
    throw new HistoryPhaseError({ ...historyFailure(error), phase, ...metadata }, error);
  }
}
