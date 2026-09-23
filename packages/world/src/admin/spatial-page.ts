import { SURVIVAL_CHUNK_TILES } from '@orchard/sim';
import type { AdminEntitySummary, AdminPage } from './contracts.js';
import { AdminProcedureError } from './procedures.js';

export const ADMIN_AREA_SCAN_LIMIT = 2_048;
export const ADMIN_AREA_PAGE_LIMIT = 100;
export const ADMIN_AREA_KINDS = ['placeable', 'chest', 'npc', 'item', 'resource', 'surface', 'crop'] as const;
export interface AdminAreaRequest {
  readonly spaceId: string;
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly kinds: readonly string[];
  readonly text: string;
}
export interface AdminAreaRow {
  readonly key: string;
  /** Null marks a migration duplicate; it still consumes the scan budget. */
  readonly entity: AdminEntitySummary | null;
}
/** Must seek strictly after the given key in the requested chunk, in key order. */
export type AdminAreaIndex = (table: number, spaceId: number, chunkX: number, chunkY: number,
  after: string | null) => Iterable<AdminAreaRow>;

export interface AdminAreaPage extends AdminPage<AdminEntitySummary> { readonly rowsScanned: number }

export function buildAdminAreaPage(request: AdminAreaRequest, index: AdminAreaIndex): AdminAreaPage {
  const spaceId = Number(request.spaceId);
  const coords = [request.x0, request.y0, request.x1, request.y1];
  if (!/^(0|[1-9][0-9]{0,4})$/u.test(request.spaceId) || spaceId > 65_535
    || !coords.every((v) => Number.isInteger(v) && v >= 0 && v <= 65_535)
    || !Number.isInteger(request.limit) || request.limit < 1 || request.limit > ADMIN_AREA_PAGE_LIMIT
    || request.text.length > 128 || request.kinds.some((k) => !(ADMIN_AREA_KINDS as readonly string[]).includes(k))) {
    throw new AdminProcedureError('admin_payload_invalid');
  }
  const x0 = Math.min(request.x0, request.x1), x1 = Math.max(request.x0, request.x1);
  const y0 = Math.min(request.y0, request.y1), y1 = Math.max(request.y0, request.y1);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 16_384) throw new AdminProcedureError('admin_payload_invalid');
  const minX = Math.floor(x0 / SURVIVAL_CHUNK_TILES), maxX = Math.floor(x1 / SURVIVAL_CHUNK_TILES);
  const minY = Math.floor(y0 / SURVIVAL_CHUNK_TILES), maxY = Math.floor(y1 / SURVIVAL_CHUNK_TILES);
  const text = request.text.trim().toLocaleLowerCase('en');
  const kinds = [...new Set(request.kinds)].sort();
  const scope = JSON.stringify([spaceId, x0, y0, x1, y1, kinds, text]);
  const height = maxY - minY + 1;
  const cells = (maxX - minX + 1) * height;
  let firstTable = 0, firstCell = 0, after: string | null = null;
  if (request.cursor !== undefined) {
    try {
      if (request.cursor.length > 1_024) throw new Error();
      const cursor: unknown = JSON.parse(request.cursor);
      if (!Array.isArray(cursor) || cursor.length !== 5 || cursor[0] !== 'area-v1' || cursor[1] !== scope
        || !Number.isInteger(cursor[2]) || cursor[2] < 0 || cursor[2] >= ADMIN_AREA_KINDS.length
        || !Number.isInteger(cursor[3]) || cursor[3] < 0 || cursor[3] >= cells
        || typeof cursor[4] !== 'string' || cursor[4].length === 0 || cursor[4].length > 256
        || (cursor[2] !== 6 && (!/^(0|[1-9][0-9]{0,19})$/u.test(cursor[4]) || BigInt(cursor[4]) > 18_446_744_073_709_551_615n))) throw new Error();
      firstTable = cursor[2] as number; firstCell = cursor[3] as number; after = cursor[4];
    } catch { throw new AdminProcedureError('admin_invalid_cursor'); }
  }
  const rows: AdminEntitySummary[] = [];
  let rowsScanned = 0;
  for (let table = firstTable; table < ADMIN_AREA_KINDS.length; table += 1) {
    for (let cell = table === firstTable ? firstCell : 0; cell < cells; cell += 1) {
      const chunkX = minX + Math.floor(cell / height), chunkY = minY + cell % height;
      const start = table === firstTable && cell === firstCell ? after : null;
      for (const { key, entity } of index(table, spaceId, chunkX, chunkY, start)) {
        rowsScanned += 1;
        if (entity !== null && entity.spaceId === request.spaceId
          && entity.tileX >= x0 && entity.tileX <= x1 && entity.tileY >= y0 && entity.tileY <= y1
          && (kinds.length === 0 || kinds.includes(entity.kind))
          && (text.length === 0 || `${entity.entityId} ${entity.definitionId}`.toLocaleLowerCase('en').includes(text))) rows.push(entity);
        if (rows.length === request.limit || rowsScanned === ADMIN_AREA_SCAN_LIMIT) {
          return { rows, rowsScanned, nextCursor: JSON.stringify(['area-v1', scope, table, cell, key]) };
        }
      }
    }
  }
  return { rows, rowsScanned, nextCursor: null };
}
