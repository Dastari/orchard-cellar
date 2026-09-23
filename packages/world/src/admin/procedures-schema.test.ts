import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_READ_PROCEDURES } from './procedures.js';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function exportedProcedure(name: string): string {
  const start = source.indexOf(`export const ${name} = spacetimedb.procedure(`);
  expect(start, `${name} registration`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport const ', start + 1);
  // W5's bounded world-state loader is a private helper between the telemetry
  // and validation procedures; it must not become a Spacetime module export.
  const privateHelper = source.indexOf('\nfunction loadAdminWorldState(', start + 1);
  const end = privateHelper >= 0 && (next < 0 || privateHelper < next) ? privateHelper : next;
  return source.slice(start, end < 0 ? source.length : end);
}

describe('W1 administration procedure schema', () => {
  it('registers every read as an authorized transactional procedure', () => {
    for (const name of ADMIN_READ_PROCEDURES) {
      const registration = exportedProcedure(name);
      expect(registration).toContain('ctx.withTx((tx) =>');
      expect(registration).toMatch(/requireAdminProcedure\(tx(?:, '(?:operate\.players|operate\.world)')?\);/u);
      expect(registration).not.toContain('.iter()');
    }
  });

  it('uses direct or indexed candidates for all pageable reads', () => {
    expect(exportedProcedure('adminFindPlayers')).toMatch(/identity\.find|by_display_name\.filter|by_online\.filter/u);
    expect(exportedProcedure('adminAuditPage')).toMatch(/by_actor\.filter|by_target\.filter|by_operation\.filter|by_occurred_at\.filter/u);
    expect(exportedProcedure('adminConnectionsPage')).toMatch(/by_identity\.filter|by_occurred_at_micros\.filter/u);
  });

  it('appends defaulted typed audit columns and their indexes', () => {
    const tableStart = source.indexOf('const world_admin_audit = table(');
    const tableEnd = source.indexOf('\n);', tableStart) + 3;
    const auditTable = source.slice(tableStart, tableEnd);
    expect(auditTable).toContain("{ accessor: 'by_actor', algorithm: 'btree', columns: ['actor'] }");
    expect(auditTable).toContain("{ accessor: 'by_target', algorithm: 'btree', columns: ['targetKey'] }");
    expect(auditTable).toContain("{ accessor: 'by_occurred_at', algorithm: 'btree', columns: ['occurredAtMicros'] }");
    expect(auditTable).toContain("occurredAtMicros: t.u64().default(0n)");
    expect(auditTable).toContain("targetKey: t.string().default('')");
    expect(auditTable).toContain("payload: t.string().default('')");
    expect(source).toContain('function insertLegacyAdminAudit(');
  });

  it('retires synthetic operational views after typed procedure parity', () => {
    expect(source).not.toContain('export const requestLastConnections =');
    expect(source).not.toContain('export const requestBalanceTop =');
    expect(source).toContain('export const adminConnectionsPage = spacetimedb.procedure(');
    expect(source).toContain('export const adminFindPlayers = spacetimedb.procedure(');
  });
});
