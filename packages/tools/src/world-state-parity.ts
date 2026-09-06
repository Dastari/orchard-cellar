import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DURABLE_WORLD_SNAPSHOT_VERSION = 1 as const;

export interface DurableWorldSnapshot {
  readonly formatVersion: typeof DURABLE_WORLD_SNAPSHOT_VERSION;
  readonly database: string;
  readonly capturedAt: string;
  /** Only durable tables belong here. Presence, connection, and other session rows do not. */
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
}

export type WorldStateParityIssueCode =
  | 'database_mismatch'
  | 'table_missing_before'
  | 'table_missing_after'
  | 'row_count_mismatch'
  | 'row_mismatch';

export interface WorldStateParityIssue {
  readonly code: WorldStateParityIssueCode;
  readonly table?: string;
  readonly before?: string | number;
  readonly after?: string | number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalRow(row: unknown): string {
  return JSON.stringify(canonicalize(row));
}

function canonicalRows(rows: readonly unknown[]): readonly string[] {
  return rows.map(canonicalRow).sort((left, right) => left.localeCompare(right));
}

export function compareDurableWorldSnapshots(
  before: DurableWorldSnapshot,
  after: DurableWorldSnapshot,
): readonly WorldStateParityIssue[] {
  const issues: WorldStateParityIssue[] = [];
  if (before.database !== after.database) {
    issues.push({ code: 'database_mismatch', before: before.database, after: after.database });
  }

  const tableNames = [...new Set([
    ...Object.keys(before.tables),
    ...Object.keys(after.tables),
  ])].sort((left, right) => left.localeCompare(right));

  for (const table of tableNames) {
    const beforeRows = before.tables[table];
    const afterRows = after.tables[table];
    if (beforeRows === undefined) {
      issues.push({ code: 'table_missing_before', table });
      continue;
    }
    if (afterRows === undefined) {
      issues.push({ code: 'table_missing_after', table });
      continue;
    }
    if (beforeRows.length !== afterRows.length) {
      issues.push({
        code: 'row_count_mismatch',
        table,
        before: beforeRows.length,
        after: afterRows.length,
      });
      continue;
    }

    const canonicalBefore = canonicalRows(beforeRows);
    const canonicalAfter = canonicalRows(afterRows);
    for (let index = 0; index < canonicalBefore.length; index += 1) {
      if (canonicalBefore[index] !== canonicalAfter[index]) {
        issues.push({
          code: 'row_mismatch',
          table,
          before: canonicalBefore[index]!,
          after: canonicalAfter[index]!,
        });
        break;
      }
    }
  }
  return issues;
}

export function parseDurableWorldSnapshot(value: unknown): DurableWorldSnapshot {
  if (!isRecord(value)
    || value['formatVersion'] !== DURABLE_WORLD_SNAPSHOT_VERSION
    || typeof value['database'] !== 'string'
    || typeof value['capturedAt'] !== 'string'
    || !isRecord(value['tables'])) {
    throw new Error('invalid_durable_world_snapshot');
  }
  for (const rows of Object.values(value['tables'])) {
    if (!Array.isArray(rows)) throw new Error('invalid_durable_world_snapshot_table');
  }
  return value as unknown as DurableWorldSnapshot;
}

async function readSnapshot(path: string): Promise<DurableWorldSnapshot> {
  return parseDurableWorldSnapshot(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined) {
    throw new Error('usage: world-state-parity <before.json> <after.json>');
  }
  const [before, after] = await Promise.all([readSnapshot(beforePath), readSnapshot(afterPath)]);
  const issues = compareDurableWorldSnapshots(before, after);
  if (issues.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, tables: Object.keys(before.tables).length })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
