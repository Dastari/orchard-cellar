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
  it('resolves channel, whisper, and local speech visibility through indexes', () => {
    const messages = sourceBetween('const chat_message = table(', 'const chat_migration = table(');
    expect(messages).toContain("accessor: 'by_conversation'");
    expect(messages).toContain("accessor: 'by_sender'");
    expect(messages).toContain("accessor: 'by_recipient'");
    const visibleMessages = sourceBetween('export const visibleChatMessages =', 'export const visibleWorldSpeech =');
    expect(visibleMessages).toContain('chat_message.by_conversation.filter(');
    expect(visibleMessages).toContain('chat_message.by_sender.filter(ctx.sender)');
    expect(visibleMessages).toContain('chat_message.by_recipient.filter(ctx.sender)');
    expect(visibleMessages).not.toContain('chat_message.iter()');
    const speech = sourceBetween('export const visibleWorldSpeech =', 'export const startRogueRun =');
    expect(speech).toContain('world_speech.by_space.filter(caller.spaceId)');
    expect(speech).not.toContain('world_speech.iter()');
  });

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
    expect(broadcast).toContain('insertSessionChatNotice(');
    expect(broadcast).not.toContain('ctx.db.chat_message.insert({');
  });

  it('keeps operational history out of game chat after Studio procedure retirement', () => {
    expect(source).not.toContain('export const requestLastConnections =');
    expect(source).not.toContain('export const requestBalanceTop =');
    expect(source).toContain('export const adminConnectionsPage = spacetimedb.procedure(');
    expect(source).toContain('export const adminFindPlayers = spacetimedb.procedure(');
  });

  it('purges legacy rows once, hides them defensively, and clears recipient inboxes', () => {
    const migration = sourceBetween('function migrateSessionChatNotices(', 'function deleteSessionChatNoticesForConnection(');
    expect(migration).toContain('isLegacyPersistentLifecycleMessage(message.kind)');
    expect(migration).toContain('ctx.db.chat_message.id.delete(message.id)');
    expect(source).toContain('.filter((message) => !isLegacyPersistentLifecycleMessage(message.kind))');
    expect(sourceBetween('export const onDisconnect =', 'export const createChatChannel ='))
      .toContain('deleteSessionChatNoticesForConnection(ctx, ctx.connectionId)');
    expect(source).toContain("broadcastSessionChatNotice(ctx, 'disconnect'");
  });
});
