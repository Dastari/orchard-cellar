import { coinPurseFromBronze } from '@orchard/sim';

export const GENERAL_CHAT_CHANNEL_ID = 1n;
export const GENERAL_CHAT_CHANNEL_SLUG = 'general';
export const CHAT_MESSAGE_MAX_CODE_POINTS = 240;
export const CHAT_CHANNEL_NAME_MAX_CODE_POINTS = 24;
export const CHAT_CHANNEL_HISTORY_LIMIT = 200;
export const SESSION_CHAT_NOTICE_LIMIT = 50;
export const LAST_CONNECTION_EVENT_LIMIT = 12;
export const LAST_CONNECTION_DEDUPE_WINDOW_MICROS = 5_000_000n;
export const BALANCE_LEADERBOARD_LIMIT = 10;
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

export interface ConnectionHistoryEvent {
  readonly id: bigint;
  readonly identityHex: string;
  readonly eventKind: string;
  readonly occurredAtMicros: bigint;
}

/** Keep the newest copy of the same player's login/logout action in each
 * rolling five-second window. Login and logout remain separate actions. */
export function recentConnectionEvents<T extends ConnectionHistoryEvent>(
  events: readonly T[],
): readonly T[] {
  const mostRecentByPlayerAction = new Map<string, bigint>();
  const deduplicated: T[] = [];
  const sorted = [...events]
    .filter((event) => event.eventKind === 'connected'
      || event.eventKind === 'disconnected'
      || event.eventKind === 'lease_expired')
    .sort((left, right) => {
      const time = right.occurredAtMicros - left.occurredAtMicros;
      if (time !== 0n) return time > 0n ? 1 : -1;
      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
    });
  for (const event of sorted) {
    const action = event.eventKind === 'connected' ? 'login' : 'logout';
    const key = `${event.identityHex}:${action}`;
    const mostRecent = mostRecentByPlayerAction.get(key);
    if (mostRecent !== undefined
      && mostRecent - event.occurredAtMicros <= LAST_CONNECTION_DEDUPE_WINDOW_MICROS) continue;
    mostRecentByPlayerAction.set(key, event.occurredAtMicros);
    deduplicated.push(event);
    if (deduplicated.length >= LAST_CONNECTION_EVENT_LIMIT) break;
  }
  return deduplicated;
}

export interface BalanceLeaderboardEntry {
  readonly identityHex: string;
  readonly displayName: string;
  readonly balanceBronze: bigint;
}

/** Wallets stay private; only this bounded display projection reaches the
 * requesting player's ephemeral chat inbox. */
export function topBalanceLeaderboard(
  entries: readonly BalanceLeaderboardEntry[],
): readonly BalanceLeaderboardEntry[] {
  return [...entries]
    .sort((left, right) => {
      if (left.balanceBronze !== right.balanceBronze) {
        return left.balanceBronze > right.balanceBronze ? -1 : 1;
      }
      const leftName = left.displayName.normalize('NFC').toLocaleLowerCase('en-US');
      const rightName = right.displayName.normalize('NFC').toLocaleLowerCase('en-US');
      if (leftName !== rightName) return leftName < rightName ? -1 : 1;
      return left.identityHex < right.identityHex ? -1 : left.identityHex > right.identityHex ? 1 : 0;
    })
    .slice(0, BALANCE_LEADERBOARD_LIMIT);
}

export function balanceLeaderboardMessage(rank: number, entry: BalanceLeaderboardEntry): string {
  const purse = coinPurseFromBronze(entry.balanceBronze);
  return `${rank}. ${entry.displayName} — ${purse.gold}G ${purse.silver}S ${purse.bronze}C`;
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
