import { describe, expect, it } from 'vitest';
import type { StudioMode } from '@orchard/ui/studio';
import { resolveStudioEffectiveRole, studioModeAccess, studioRoleCan } from './access.js';

const MODES = ['build', 'author', 'operate', 'observe'] as const satisfies readonly StudioMode[];

describe('Studio role routing', () => {
  it('keeps anonymous work local to Build and Author', () => {
    expect(MODES.map((mode) => studioModeAccess(null, mode)))
      .toEqual(['write', 'write', 'hidden', 'hidden']);
  });

  it.each([
    ['owner', ['write', 'write', 'write', 'write']],
    ['admin', ['write', 'write', 'write', 'write']],
    ['content_editor', ['write', 'write', 'read_only', 'read_only']],
    ['support', ['hidden', 'hidden', 'write', 'read_only']],
  ] as const)('applies the exact %s capability matrix', (role, expected) => {
    expect(MODES.map((mode) => studioModeAccess(role, mode)))
      .toEqual(expected);
  });

  it('keeps support remedies separate from economy and membership authority', () => {
    expect(studioRoleCan('support', 'player_remedy')).toBe(true);
    expect(studioRoleCan('support', 'economy_edit')).toBe(false);
    expect(studioRoleCan('content_editor', 'publish_content')).toBe(true);
    expect(studioRoleCan('content_editor', 'player_remedy')).toBe(false);
    expect(studioRoleCan('admin', 'economy_edit')).toBe(true);
    expect(studioRoleCan('admin', 'membership')).toBe(false);
    expect(studioRoleCan('owner', 'membership')).toBe(true);
  });

  it('derives grant-backed Studio roles from active membership instead of impossible raw roles', () => {
    const active = { role: 'friend', blocked: false, revokedAt: undefined };
    const grant = { revokedAt: undefined };
    expect(resolveStudioEffectiveRole({ ...active, role: 'owner' }, grant, grant)).toBe('owner');
    expect(resolveStudioEffectiveRole({ ...active, role: 'admin' }, grant, grant)).toBe('admin');
    expect(resolveStudioEffectiveRole(active, grant, null)).toBe('content_editor');
    expect(resolveStudioEffectiveRole(active, null, grant)).toBe('support');
    expect(resolveStudioEffectiveRole(active, grant, grant)).toBe('support');
    expect(resolveStudioEffectiveRole({ ...active, role: 'moderator' }, null, null)).toBe('moderator');
    expect(resolveStudioEffectiveRole(active, null, null)).toBeNull();
    expect(resolveStudioEffectiveRole({ ...active, blocked: true }, grant, grant)).toBeNull();
    expect(resolveStudioEffectiveRole({ ...active, revokedAt: 1 }, grant, grant)).toBeNull();
    expect(resolveStudioEffectiveRole(active, { revokedAt: 1 }, { revokedAt: 1 })).toBeNull();
    expect(resolveStudioEffectiveRole(null, grant, grant)).toBeNull();
  });
});
