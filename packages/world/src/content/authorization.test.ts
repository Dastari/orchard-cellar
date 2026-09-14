import { describe, expect, it } from 'vitest';
import { contentEditorAuthorized } from './authorization.js';

describe('content editor authorization', () => {
  const active = { blocked: false, revokedAt: undefined } as const;

  it('allows active owners/admins and explicitly granted friends', () => {
    expect(contentEditorAuthorized({ ...active, role: 'owner' }, null)).toBe(true);
    expect(contentEditorAuthorized({ ...active, role: 'admin' }, null)).toBe(true);
    expect(contentEditorAuthorized({ ...active, role: 'friend' }, { revokedAt: undefined })).toBe(true);
  });

  it('rejects inactive memberships and revoked grants', () => {
    expect(contentEditorAuthorized(null, { revokedAt: undefined })).toBe(false);
    expect(contentEditorAuthorized({ role: 'friend', blocked: true, revokedAt: undefined }, { revokedAt: undefined })).toBe(false);
    expect(contentEditorAuthorized({ ...active, role: 'friend' }, { revokedAt: 1 })).toBe(false);
  });
});
