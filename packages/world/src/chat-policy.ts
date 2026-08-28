export const GENERAL_CHAT_CHANNEL_ID = 1n;
export const GENERAL_CHAT_CHANNEL_SLUG = 'general';
export const CHAT_MESSAGE_MAX_CODE_POINTS = 240;
export const CHAT_CHANNEL_NAME_MAX_CODE_POINTS = 24;
export const CHAT_CHANNEL_HISTORY_LIMIT = 200;
export const SESSION_CHAT_NOTICE_LIMIT = 50;
export const LAST_CONNECTION_EVENT_LIMIT = 12;
export const CHAT_SEND_COOLDOWN_MICROS = 350_000n;
export const DEFAULT_MESSAGE_OF_DAY = 'Welcome to Orchard & Cellar! Be kind, share the island, and have fun.';
export const MESSAGE_OF_DAY_MAX_CODE_POINTS = 240;

export type ChatChannelKind = 'general' | 'custom' | 'group';

export function normalizeChatMessage(value: string): string | null {
  const normalized = value.normalize('NFC').replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length === 0 || [...normalized].length > CHAT_MESSAGE_MAX_CODE_POINTS) return null;
  if ([...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  })) return null;
  return normalized;
}

export function normalizeMessageOfDay(value: string): string | null {
  const normalized = value.normalize('NFC').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || [...normalized].length > MESSAGE_OF_DAY_MAX_CODE_POINTS) return null;
  if ([...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  })) return null;
  return normalized;
}

export function worldEntryMessage(displayName: string): string {
  return `${displayName} entered the world.`;
}

export function worldDisconnectMessage(displayName: string): string {
  return `${displayName} disconnected.`;
}

export function lastConnectionEventMessage(
  displayName: string,
  eventKind: string,
  occurredAtIso: string,
): string {
  const action = eventKind === 'connected' ? 'logged in' : 'logged out';
  const time = occurredAtIso
    .replace('T', ' ')
    .replace(/\.\d{3,6}Z$/, ' UTC');
  return `${displayName} ${action} — ${time}`;
}

/** Lifecycle notices belong to the current connection, never durable chat history. */
export function isLegacyPersistentLifecycleMessage(kind: string): boolean {
  return kind === 'system';
}

export function normalizeChatChannelName(value: string): { readonly name: string; readonly slug: string } | null {
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || [...name].length > CHAT_CHANNEL_NAME_MAX_CODE_POINTS) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]*[\p{L}\p{N}]$/u.test(name)) return null;
  const slug = name.toLocaleLowerCase('en-US').replace(/[ ']+/g, '-');
  return { name, slug };
}

export function chatMembershipId(channelId: bigint, identityHex: string): string {
  return `${channelId}:${identityHex}`;
}

export function channelConversationKey(channelId: bigint): string {
  return `channel:${channelId}`;
}

export function whisperConversationKey(firstIdentityHex: string, secondIdentityHex: string): string {
  return `whisper:${[firstIdentityHex, secondIdentityHex].sort().join(':')}`;
}

export function canJoinChatChannel(kind: string): boolean {
  return kind === 'general' || kind === 'custom';
}

export function validCreatableChatChannelKind(kind: string): kind is Exclude<ChatChannelKind, 'general'> {
  return kind === 'custom' || kind === 'group';
}
