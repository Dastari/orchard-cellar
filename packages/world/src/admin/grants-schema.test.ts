import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('W3 capability grant schema and registrations', () => {
  it('keeps support capability additive and caller-private', () => {
    expect(source).toContain("name: 'support_grant'");
    expect(source).toMatch(/content_editor_grant,\s*support_grant,\s*content_draft,/u);
    expect(source).toContain("name: 'own_support_grant', public: true");
    expect(source).toContain('ctx.db.support_grant.identity.find(ctx.sender)');
  });

  it('registers audited grant and revoke reducers without replacing legacy bindings early', () => {
    for (const name of ['adminGrantContentEditor', 'adminRevokeContentEditor', 'adminGrantSupport', 'adminRevokeSupport']) {
      expect(source).toContain(`export const ${name} = spacetimedb.reducer`);
    }
    expect(source).toContain('function insertCapabilityAdminAudit');
    expect(source).toContain('targetKey: `player:${identity}`');
    expect(source).toContain('export const grantContentEditor = spacetimedb.reducer');
  });

  it('projects active content and support grants in player summaries', () => {
    expect(source).toContain("['content_editor' as const]");
    expect(source).toContain("['support' as const]");
  });
});
