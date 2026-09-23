import { describe, expect, it } from 'vitest';
import { ADMIN_AREA_SCAN_LIMIT, buildAdminAreaPage, type AdminAreaIndex, type AdminAreaRequest } from './spatial-page.js';

const request: AdminAreaRequest = { spaceId: '65532', x0: 32, x1: 47, y0: 48, y1: 63, limit: 100, kinds: [], text: '' };
const denseIndex = (count: number, visited: string[]): AdminAreaIndex => function* (table, space, x, y, after) {
  visited.push(`${table}:${space}:${x}:${y}:${after}`);
  if (table !== 0) return;
  for (let id = Number(after ?? 0) + 1; id <= count; id += 1) yield {
    key: String(id), entity: { entityId: String(id), kind: 'placeable', definitionId: 'chest',
      spaceId: String(space), tileX: x * 16, tileY: y * 16, state: {} },
  };
};

describe('bounded spatial pages', () => {
  it('seeks only requested chunks and resumes dense chunks without losing rows', () => {
    const visited: string[] = [], found: string[] = [];
    let cursor: string | undefined;
    do {
      const page = buildAdminAreaPage({ ...request, ...(cursor === undefined ? {} : { cursor }) }, denseIndex(3_051, visited));
      found.push(...page.rows.map((row) => row.entityId));
      expect(page.rowsScanned).toBeLessThanOrEqual(100);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(found).toEqual(Array.from({ length: 3_051 }, (_, i) => String(i + 1)));
    expect(visited.every((key) => key.includes(':65532:2:3:'))).toBe(true);
    expect(visited[1]).toBe('0:65532:2:3:100');
  });
  it('continues after scan cap even when filters match nothing', () => {
    const index = denseIndex(3_000, []);
    const first = buildAdminAreaPage({ ...request, text: 'absent' }, index);
    expect(first.rows).toEqual([]);
    expect(first.rowsScanned).toBe(ADMIN_AREA_SCAN_LIMIT);
    expect(first.nextCursor).not.toBeNull();
    const last = buildAdminAreaPage({ ...request, text: 'absent', cursor: first.nextCursor! }, index);
    expect(last.rowsScanned).toBe(952);
    expect(last.nextCursor).toBeNull();
  });
  it('rejects changed scope and invalid requests before any index call', () => {
    const page = buildAdminAreaPage(request, denseIndex(101, []));
    const fail: AdminAreaIndex = () => { throw new Error('index called'); };
    expect(() => buildAdminAreaPage({ ...request, spaceId: '0', cursor: page.nextCursor! }, fail)).toThrow('admin_invalid_cursor');
    expect(() => buildAdminAreaPage({ ...request, x0: -1 }, fail)).toThrow('admin_payload_invalid');
    expect(() => buildAdminAreaPage({ ...request, x1: 65535 }, fail)).toThrow('admin_payload_invalid');
    expect(() => buildAdminAreaPage({ ...request, cursor: '[]' }, fail)).toThrow('admin_invalid_cursor');
  });
  it('counts migration duplicates and filters exact tiles inside edge chunks', () => {
    const index: AdminAreaIndex = function* (table) {
      if (table !== 0) return;
      yield { key: '1', entity: null };
      yield { key: '2', entity: { entityId: '2', kind: 'placeable', definitionId: 'chest', spaceId: '65532', tileX: 32, tileY: 48, state: {} } };
    };
    expect(buildAdminAreaPage({ ...request, x0: 33 }, index)).toEqual({ rows: [], rowsScanned: 2, nextCursor: null });
  });
});
