import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('session-only lifecycle chat notices', () => {
  it('stores notices in a private per-connection inbox exposed through an own view', () => {
    const table = sourceBetween('const session_chat_notice = table(', 'const membership = table(');
    expect(table).toContain("name: 'session_chat_notice'");
    expect(table).toContain("columns: ['recipientIdentity']");
    expect(table).toContain("columns: ['recipientConnectionId']");
    expect(table).toContain('recipientConnectionId: t.connectionId()');
    expect(source).toContain("name: 'own_session_chat_notices', public: true");
    expect(source).toContain('ctx.db.session_chat_notice.by_recipient_identity.filter(ctx.sender)');
  });

  it('never inserts lifecycle notices into durable chat history', () => {
    expect(source).not.toContain("kind: 'system',");
    const broadcast = sourceBetween('function broadcastSessionChatNotice(', 'function installDebugPortals(');
    expect(broadcast).toContain('ctx.db.session_chat_notice.insert({');
    expect(broadcast).not.toContain('ctx.db.chat_message.insert({');
  });

  it('purges legacy rows once, hides them defensively, and clears recipient inboxes', () => {
    const migration = sourceBetween('function migrateSessionChatNotices(', 'function deleteSessionChatNoticesForConnection(');
    expect(migration).toContain('isLegacyPersistentLifecycleMessage(message.kind)');
    expect(migration).toContain('ctx.db.chat_message.id.delete(message.id)');
    expect(source).toContain('if (isLegacyPersistentLifecycleMessage(message.kind)) return false;');
    expect(sourceBetween('export const onDisconnect =', 'export const createChatChannel ='))
      .toContain('deleteSessionChatNoticesForConnection(ctx, ctx.connectionId)');
    expect(source).toContain("broadcastSessionChatNotice(ctx, 'disconnect'");
  });
});
