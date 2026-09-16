export const CONNECTION_AUDIT_RETENTION_MICROS = 90n * 24n * 60n * 60n * 1_000_000n;
export const AUDIT_TRIM_CADENCE_TICKS = 2_000n;

export function worldItemExpired(
  droppedAtTick: bigint,
  authorityTick: bigint,
  despawnTicks: number,
): boolean {
  return authorityTick >= droppedAtTick
    && authorityTick - droppedAtTick >= BigInt(despawnTicks);
}

export function connectionAuditExpired(
  occurredAtMicros: bigint,
  nowMicros: bigint,
  retentionMicros = CONNECTION_AUDIT_RETENTION_MICROS,
): boolean {
  return nowMicros >= occurredAtMicros
    && nowMicros - occurredAtMicros >= retentionMicros;
}

export function anyFieldChanged<T, K extends keyof T>(
  current: T,
  next: T,
  fields: readonly K[],
): boolean {
  return fields.some((field) => current[field] !== next[field]);
}

export interface TickUpdateCounters {
  playerPositionUpdates: number;
  playerPositionNoopSkips: number;
  npcUpdates: number;
  nonWildlifeNpcUpdates: number;
  nonWildlifeNpcNoopSkips: number;
  chestUpdates: number;
  itemDeletes: number;
  auditDeletes: number;
  rowsTouched: number;
  tradeRowsScanned: number;
  overflowRowsScanned: number;
  regrowthRowsScanned: number;
  effectRowsScanned: number;
  inviteRowsScanned: number;
  itemRowsScanned: number;
  auditRowsScanned: number;
  speechRowsScanned: number;
  soilRowsScanned: number;
  rowsScanned: number;
}

export type TickRowScanKind =
  | 'tradeRowsScanned'
  | 'overflowRowsScanned'
  | 'regrowthRowsScanned'
  | 'effectRowsScanned'
  | 'inviteRowsScanned'
  | 'itemRowsScanned'
  | 'auditRowsScanned'
  | 'speechRowsScanned'
  | 'soilRowsScanned';

export function emptyTickUpdateCounters(): TickUpdateCounters {
  return {
    playerPositionUpdates: 0,
    playerPositionNoopSkips: 0,
    npcUpdates: 0,
    nonWildlifeNpcUpdates: 0,
    nonWildlifeNpcNoopSkips: 0,
    chestUpdates: 0,
    itemDeletes: 0,
    auditDeletes: 0,
    rowsTouched: 0,
    tradeRowsScanned: 0,
    overflowRowsScanned: 0,
    regrowthRowsScanned: 0,
    effectRowsScanned: 0,
    inviteRowsScanned: 0,
    itemRowsScanned: 0,
    auditRowsScanned: 0,
    speechRowsScanned: 0,
    soilRowsScanned: 0,
    rowsScanned: 0,
  };
}

export function recordTickRowTouch(
  counters: TickUpdateCounters,
  kind?: 'playerPositionUpdates' | 'playerPositionNoopSkips' | 'npcUpdates'
    | 'nonWildlifeNpcUpdates' | 'nonWildlifeNpcNoopSkips' | 'chestUpdates'
    | 'itemDeletes' | 'auditDeletes',
  count = 1,
): void {
  if (kind !== undefined) counters[kind] += count;
  counters.rowsTouched += count;
}

export function recordTickRowScan(
  counters: TickUpdateCounters,
  kind: TickRowScanKind,
  count = 1,
): void {
  counters[kind] += count;
  counters.rowsScanned += count;
}

export function updateRowWhenChanged<T, K extends keyof T>(
  current: T,
  next: T,
  fields: readonly K[],
  counters: TickUpdateCounters,
  kind: 'playerPositionUpdates' | 'npcUpdates',
  update: (row: T) => void,
): boolean {
  if (!anyFieldChanged(current, next, fields)) return false;
  update(next);
  recordTickRowTouch(counters, kind);
  return true;
}
