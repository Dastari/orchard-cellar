import { describe, expect, it } from 'vitest';
import { MembershipManagerModel, MockMembershipApi } from './model.js';

describe('MembershipManagerModel', () => {
  it('lets only owners preview and commit reasoned grant changes', async () => {
    const model = new MembershipManagerModel(new MockMembershipApi(), 'owner', () => 'membership-test');
    await model.search('bea'); model.select('identity-bea'); model.setReason('Grant content author access');
    const preview = await model.preview({ operation: 'grant_content_editor' });
    expect(preview.preview.changes).not.toHaveLength(0);
    const result = await model.commit();
    expect(result.row.grants).toEqual(['content_editor', 'support']);
    expect(result.inverse).toEqual({ operation: 'revoke_content_editor' });
    expect(model.snapshot().lastAuditId).toMatch(/^membership-audit-/u);
  });

  it('blocks administrator writes and last-owner demotion before calling the API', async () => {
    const admin = new MembershipManagerModel(new MockMembershipApi(), 'admin');
    await admin.search('bea'); admin.select('identity-bea'); admin.setReason('Attempted role update');
    await expect(admin.preview({ operation: 'set_role', role: 'moderator' })).rejects.toThrow('membership_owner_required');
    const owner = new MembershipManagerModel(new MockMembershipApi(), 'owner');
    await owner.search('ada'); owner.select('identity-ada'); owner.setReason('Attempted owner demotion');
    await expect(owner.preview({ operation: 'set_role', role: 'friend' })).rejects.toThrow('admin_last_owner_protected');
  });

  it('requires preview and preserves the exact reason fingerprint', async () => {
    const model = new MembershipManagerModel(new MockMembershipApi(), 'owner', () => 'membership-test-2');
    await model.search('bea'); model.select('identity-bea'); model.setReason('Block after abuse report');
    await expect(model.commit()).rejects.toThrow('admin_preview_required');
    await model.preview({ operation: 'set_blocked', blocked: true });
    model.setReason('A changed reason invalidates preview');
    await expect(model.commit()).rejects.toThrow('admin_preview_required');
  });
});
