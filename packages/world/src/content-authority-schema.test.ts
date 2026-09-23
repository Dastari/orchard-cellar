import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function slice(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe('live content authority schema and reducers', () => {
  it('adds public atomic heads/definitions and private revision, grant, and draft tables', () => {
    const tables = slice(
      '// --- authoring lane 55-C: additive live-content authority tables ---',
      '// --- end authoring lane 55-C tables ---',
    );
    expect(tables).toContain("name: 'content_head', public: true");
    expect(tables).toContain("name: 'content_definition',\n    public: true");
    expect(tables).toContain("accessor: 'by_kind'");
    expect(tables).toContain("name: 'content_revision'");
    expect(tables).toContain("name: 'content_editor_grant'");
    expect(tables).toContain("name: 'content_draft'");
    expect(tables).toContain('revision: t.u64().primaryKey()');
    expect(tables).toContain("accessor: 'by_client_mutation'");
  });

  it('checks idempotency before CAS and writes definitions, head, revision, and audit atomically', () => {
    const reducers = slice(
      '// --- authoring lane 55-C: live content reducers ---',
      '// --- end authoring lane 55-C live content reducers ---',
    );
    const publish = slice('export const publishContentChangeSet', 'export const restoreContentRevision');
    expect(publish.indexOf('contentMutationAlreadyApplied')).toBeLessThan(publish.indexOf('commitContentPublication'));
    expect(reducers).toContain('requireContentEditor(ctx)');
    const kernel = slice(
      '// --- authoring lane 55-C: bounded content publication kernel ---',
      '// --- end authoring lane 55-C publication kernel ---',
    );
    expect(kernel).toContain('assertContentRevision(head.revision, expectedRevision)');
    expect(kernel).toContain('planContentPublication(contentDefinitionRows(ctx)');
    expect(kernel).toContain('ctx.db.content_definition.id.update(row)');
    expect(kernel).toContain('ctx.db.content_head.packId.update(nextHead)');
    expect(kernel).toContain('ctx.db.content_revision.insert({');
    expect(kernel).toContain('insertLegacyAdminAudit(ctx, {');
  });

  it('restores through a new publication and never mutates immutable history', () => {
    const restore = slice('export const restoreContentRevision', 'export const grantContentEditor');
    expect(restore).toContain('revision.inverseChangeSetJson');
    expect(restore).toContain("'restore_content_revision'");
    expect(restore).not.toContain('content_revision.revision.update');
    expect(restore).not.toContain('content_revision.revision.delete');
  });

  it('seeds only empty additive content tables on init and first reconnect', () => {
    const seed = slice('function ensureContentRegistrySeed', 'function requireContentEditor');
    expect(seed).toContain("if (existingRows.length > 0) throw new SenderError('content_head_missing')");
    expect(seed).not.toContain('.clear(');
    expect(seed).not.toContain('.delete(');
    expect(source).toMatch(/export const init = spacetimedb\.init\(\(ctx\) => \{\n {2}ensureContentRegistrySeed\(ctx\);/u);
    const connection = slice('function prepareConnection', 'export const onConnect');
    expect(connection).toContain('ensureContentRegistrySeed(ctx)');
  });

  it('isolates recovery connections from player initialization and disconnect cleanup', () => {
    const connect = slice('export const onConnect =', 'export const onDisconnect =');
    expect(connect.indexOf('contentRecoveryConnection({')).toBeLessThan(connect.indexOf('prepareConnection(ctx)'));
    expect(connect).toContain('requireEditor: () => requireContentEditor(ctx)');
    expect(connect).toContain('verifyIntegrity: () => ensureContentPublicationBase(ctx)');
    expect(connect).toContain("kind: 'content_recovery'");
    const disconnect = slice('export const onDisconnect =', 'export const createChatChannel =');
    expect(disconnect.indexOf("if (notice?.kind === 'content_recovery'")).toBeLessThan(disconnect.indexOf('clearBowCharge('));
    expect(disconnect.indexOf("if (notice?.kind === 'content_recovery'")).toBeLessThan(disconnect.indexOf('active_hearth_stash'));
    const publish = slice('export const publishContentChangeSet', 'export const restoreContentRevision');
    expect(publish.indexOf('requireContentEditor(ctx)')).toBeLessThan(publish.indexOf('ensureContentPublicationBase(ctx)'));
    expect(publish).not.toContain('ensureContentRegistrySeed(ctx)');
  });

  it('executes recovery disconnect cleanup without touching player state and retains expired-session cleanup', () => {
    const block = slice('export const onDisconnect =', 'export const createChatChannel =');
    const body = block.slice(block.indexOf('((ctx) => {') + '((ctx) => {'.length, block.lastIndexOf('});'));
    const disconnect = new Function('ctx', 'deleteSessionChatNoticesForConnection', body) as
      (ctx: unknown, clearChat: (...args: unknown[]) => void) => unknown;
    const sender = {};
    const connectionId = {};
    const remove = vi.fn();
    const clearProtocol = vi.fn();
    const clearDefense = vi.fn();
    const clearChat = vi.fn();
    const recoveryDb = new Proxy({ connection_notice: { connectionId: {
      find: () => ({ kind: 'content_recovery', identity: { isEqual: (value: unknown) => value === sender } }),
      delete: remove,
    } } }, { get(target, key) {
      if (key === 'inventory_protocol') return { connectionId: { delete: clearProtocol } };
      if (key === 'player_defense_input') return { connectionId: { delete: clearDefense } };
      if (key !== 'connection_notice') throw new Error('unexpected_player_state_access');
      return target.connection_notice;
    } });
    const recoveryContext = { sender, connectionId, db: recoveryDb };
    disconnect(recoveryContext, clearChat);
    expect(remove).toHaveBeenCalledExactlyOnceWith(connectionId);
    expect(clearProtocol).toHaveBeenCalledExactlyOnceWith(connectionId);
    expect(clearDefense).toHaveBeenCalledExactlyOnceWith(connectionId);
    expect(clearChat).toHaveBeenCalledExactlyOnceWith(recoveryContext, connectionId);
    const expiredDb = new Proxy({}, { get(_target, key) {
      if (key === 'connection_notice') return { connectionId: { find: () => null } };
      throw new Error('normal_cleanup');
    } });
    expect(() => disconnect({ sender, connectionId, db: expiredDb }, clearChat)).toThrow('normal_cleanup');
    const heartbeat = slice('export const heartbeat =', '/** Block has its own input lease');
    expect(heartbeat.indexOf("throw new SenderError('content_reconnect_required')"))
      .toBeLessThan(heartbeat.indexOf('connection_presence_v2.insert'));
    const start = heartbeat.indexOf('(ctx, { active }) => {') + '(ctx, { active }) => {'.length;
    const heartbeatBody = heartbeat.slice(start, heartbeat.indexOf('\n});', start));
    const beat = new Function('ctx', 'active', 'requireAuthorizedSender', 'SenderError', heartbeatBody) as
      (ctx: unknown, active: boolean, authorize: () => void, error: typeof Error) => unknown;
    const authorize = vi.fn();
    const heartbeatDb = new Proxy({}, { get(_target, key) {
      if (key === 'membership') return { identity: { find: () => ({ role: 'owner' }) } };
      if (key === 'connection_notice') return { connectionId: { find: () => ({ kind: 'content_recovery' }) } };
      throw new Error('unexpected_player_state_access');
    } });
    expect(() => beat({ sender, connectionId, senderAuth: { jwt: {} }, db: heartbeatDb }, true, authorize, Error))
      .toThrow('content_reconnect_required');
    expect(authorize).toHaveBeenCalledOnce();
  });

  it('keeps drafts/grants/history private behind caller-aware views', () => {
    expect(source).toContain("name: 'own_content_editor_grant', public: true");
    expect(source).toContain("name: 'own_content_draft', public: true");
    expect(source).toContain("name: 'own_content_revisions', public: true");
    expect(source).toContain('contentEditorAuthorized(');
  });
});
