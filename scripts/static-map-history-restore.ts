/** Isolated rehearsal only: retry a definite reducer rejection with a new guarded preview. */
import { randomUUID } from 'node:crypto';
import { SenderError } from 'spacetimedb';
import { historyPhase, type HistoryPhaseEvent, type HistoryPhaseRow } from './static-map-history-diagnostics.js';

export const HISTORY_RESTORE_ATTEMPTS = 5;
export interface HistoryRestoreEnvelope {
  readonly revisionId: bigint; readonly reason: string; readonly clientMutationId: string;
}
export interface HistoryRestorePreview { readonly baseVersion: string; readonly fingerprint: string }
export interface HistoryRestoreAudit { readonly auditId: string; readonly inverseRevisionId: string }
export interface HistoryRestorePort {
  preview(input: HistoryRestoreEnvelope): Promise<HistoryRestorePreview>;
  commit(input: HistoryRestoreEnvelope, preview: HistoryRestorePreview): Promise<void>;
  audit(clientMutationId: string): Promise<HistoryRestoreAudit>;
}

// Reducer V2/V3 SDK paths reject with this exact class/message. The broader diagnostic
// sanitizer is never authorization to retry, and ambiguous failures must stop immediately.
export function definiteHistoryRestoreConflict(error: unknown): boolean {
  return error instanceof SenderError && error.message === 'admin_world_revision_conflict';
}

export async function restoreHistoryWithPreview(revisionId: bigint, port: HistoryRestorePort,
  progress?: (entry: HistoryPhaseEvent) => void, row?: HistoryPhaseRow): Promise<HistoryRestoreAudit> {
  for (let attempt = 1; attempt <= HISTORY_RESTORE_ATTEMPTS; attempt += 1) {
    // A fresh id also prevents a still-cached earlier receipt from satisfying preview polling.
    const input = { revisionId, reason: 'Verify isolated S7c history restore and audited inverse.',
      clientMutationId: `s7c-rehearsal-${randomUUID()}` };
    const preview = await historyPhase('history-restore-preview', () => port.preview(input), progress, row, attempt);
    let rejectedConflict = false;
    try {
      await historyPhase('history-restore-commit', async () => {
        try { await port.commit(input, preview); }
        catch (error) { rejectedConflict = definiteHistoryRestoreConflict(error); throw error; }
      }, progress, row, attempt);
    } catch (error) {
      if (!rejectedConflict || attempt === HISTORY_RESTORE_ATTEMPTS) throw error;
      continue;
    }
    // Never retry after a successful commit: audit/transport failures could hide completion.
    return historyPhase('history-restore-audit', () => port.audit(input.clientMutationId), progress, row, attempt);
  }
  throw new Error('static_history_rehearsal_failed');
}
