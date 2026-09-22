import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
function section(start: string, end: string): string { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
describe('Studio scope boundary wiring', () => {
  it('checks complete publication plan before deleting or upserting rows, shared by restore', () => {
    // Use the next named boundary instead of matching its own declaration.
    const body = source.slice(source.indexOf('function commitContentPublication('), source.indexOf('function commitContentPublication(') + 6000);
    expect(body.indexOf('requireContentScopes(')).toBeGreaterThan(0);
    expect(body.indexOf('requireContentScopes(')).toBeLessThan(body.indexOf('ctx.db.content_definition.id.delete('));
    expect(body).toContain('...plan.deletes.map');
    expect(section('export const restoreContentRevision', 'export const adminStudioMembers')).toContain('commitContentPublication(');
  });
  it('gates every modern admin reducer family before the existing caps', () => {
    for (const name of ['executeAdminInventoryMutation', 'executeAdminProgressionMutation', 'executeAdminPositionMutation', 'executeAdminObjectMutation', 'executeAdminWorldMutation', 'executeAdminWorldControlMutation', 'executeAdminPlaytestMutation']) {
      const start = source.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(0);
      expect(source.slice(start, start + 1600), name).toContain('scopedAdminRole(');
    }
  });
  it('uses private additive tables, server identity and compare-and-swap grants', () => {
    expect(source).toContain("{ name: 'studio_scope_grant', indexes:");
    const grant = section('export const setStudioScope', 'export const submitStudioScript');
    expect(grant).toContain('studioScopeVersion(ctx, input.identity) !== input.expectedVersion');
    expect(source).toContain('studio_scope_delegation_forbidden');
    expect(source).toContain('studio_owner_scopes_protected');
    const approve = section('export const approveStudioScript', 'export const grantContentEditor');
    expect(approve).toContain('ctx.sender.toHexString(), review.author.toHexString()');
    expect(approve).toContain('insertLegacyAdminAudit(');
  });
});
