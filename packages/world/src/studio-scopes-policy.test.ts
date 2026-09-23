import { describe, expect, it } from 'vitest';
import { SUPPORTED_CONTENT_KINDS } from '../../sim/src/content/definitions.js';
import { CONTENT_KIND_SCOPE, CONTENT_SCOPES, requireContentScopes, requireScriptApproval, resolveStudioScopes, STUDIO_SCOPES } from '../../sim/src/studio-scopes.js';
import { contentEditorAuthorized } from './content/authorization.js';
const active = { role: 'friend', blocked: false, revokedAt: undefined };
const grant = { revokedAt: undefined };

describe('Studio scope authority and additive legacy migration', () => {
  it('maps every content kind, failing closed for unknown or prototype names', () => {
    expect(Object.keys(CONTENT_KIND_SCOPE).sort()).toEqual([...SUPPORTED_CONTENT_KINDS].sort());
    for (const kind of ['unknown', 'toString', '__proto__']) {
      expect(() => requireContentScopes(STUDIO_SCOPES, [kind])).toThrow('studio_scope_required');
    }
  });
  it('preserves every legacy content grant combination before overrides', () => {
    for (const role of ['owner', 'admin', 'moderator', 'friend']) {
      for (const blocked of [true, false]) for (const revokedAt of [undefined, 1]) {
        for (const editor of [null, grant, { revokedAt: 1 }]) for (const support of [null, grant, { revokedAt: 1 }]) {
          const member = { role, blocked, revokedAt };
          const scopes = resolveStudioScopes(member, editor, support);
          expect(CONTENT_SCOPES.every(scope => scopes.includes(scope))).toBe(contentEditorAuthorized(member, editor));
        }
      }
    }
  });
  it('never revives missing, blocked, or revoked membership through explicit grants', () => {
    for (const member of [null, { ...active, blocked: true }, { ...active, revokedAt: 1 }]) {
      expect(resolveStudioScopes(member, grant, grant, [{ scope: 'items_economy', ...grant }])).toEqual([]);
    }
  });
  it('revoked overrides deny legacy presets; regrants restore only that domain', () => {
    expect(resolveStudioScopes(active, grant, null, [{ scope: 'objects', revokedAt: 1 }])).not.toContain('objects');
    expect(resolveStudioScopes(active, null, null, [{ scope: 'objects', ...grant }])).toEqual(['objects']);
    expect(resolveStudioScopes(active, null, null, [{ scope: 'objects', revokedAt: 1 }])).toEqual([]);
    expect(resolveStudioScopes({ ...active, role: 'owner' }, null, null, [{ scope: 'objects', revokedAt: 1 }])).toContain('objects');
  });
  it('requires every domain of mixed publishes and inverse/deletion kinds', () => {
    expect(() => requireContentScopes(['items_economy'], ['item', 'recipe'])).not.toThrow();
    for (const kinds of [['item', 'object'], ['object'], ['quest', 'item']]) {
      expect(() => requireContentScopes(['items_economy'], kinds)).toThrow('studio_scope_required');
    }
  });
  it('does not grant script privileges to legacy admins or editors', () => {
    for (const role of ['admin', 'friend']) {
      expect(resolveStudioScopes({ ...active, role }, grant, grant)).not.toContain('scripts.approve');
      expect(resolveStudioScopes({ ...active, role }, grant, grant)).not.toContain('scripts.author');
    }
  });
  it('requires explicit approval scope and a different authenticated author', () => {
    expect(() => requireScriptApproval(['scripts.author'], 'b', 'a')).toThrow('studio_scope_required');
    expect(() => requireScriptApproval(['scripts.approve'], 'a', 'a')).toThrow('script_self_approval_forbidden');
    expect(() => requireScriptApproval(['scripts.approve'], 'b', 'a')).not.toThrow();
  });
});
