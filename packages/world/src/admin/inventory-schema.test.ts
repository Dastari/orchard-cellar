import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('W2a inventory reducer registration', () => {
  it('registers the private bounded preview receipt and caller-filtered view', () => {
    const schema = between('const admin_mutation_preview = table(', '// --- end authoring lane 55-C tables ---');
    expect(schema).toContain("name: 'admin_mutation_preview'");
    expect(schema).toContain("columns: ['actor']");
    expect(schema).toContain('fingerprint: t.string()');
    expect(schema).toContain('expiresAtMicros: t.u64()');
    expect(source).toContain('admin_mutation_preview,');
    expect(source).toContain('export const ownAdminMutationPreviews = spacetimedb.view(');
    expect(source).toContain('ctx.db.admin_mutation_preview.by_actor.filter(ctx.sender)');
  });

  it('registers all five typed reducer entrypoints through one authority path', () => {
    for (const name of [
      'adminGiveItems', 'adminRemoveItems', 'adminSetSlot', 'adminClearCursor', 'adminDrainOverflow',
    ]) {
      const registration = between(`export const ${name} = spacetimedb.reducer(`, '\n);');
      expect(registration).toContain('executeAdminInventoryMutation(ctx, {');
    }
    const execution = between('function executeAdminInventoryMutation(', 'function adminInventoryMutationBase(');
    expect(execution).toContain('resolveAdminEffectiveRole(');
    expect(execution).toContain('requireAdminInventoryAuthority(role, mutation, caps');
    expect(execution).toContain('planAdminInventoryMutation(loaded.state');
    expect(execution).toContain('existingPreview.fingerprint !== previewFingerprint');
    expect(execution).toContain('writeAdminInventoryState(ctx, target, loaded, plan.after)');
  });

  it('commits audit, notice, and preview deletion in the reducer transaction', () => {
    const execution = between('function executeAdminInventoryMutation(', 'function adminInventoryMutationBase(');
    expect(execution).toContain('insertAdminPlayerMutationAudit(ctx, {');
    expect(execution).toContain('payload: plan.audit');
    expect(execution).toContain('ctx.db.connection_presence_v2.by_identity.filter(target)');
    expect(execution).toContain("insertSessionChatNotice(ctx, target, presence.connectionId, 'admin', plan.notice)");
    expect(execution).toContain('ctx.db.admin_mutation_preview.id.delete(previewId)');
  });
});
