export interface ChatCommandSuggestion {
  readonly completion: string;
  readonly label: string;
}

export type ParsedChatSubmission =
  | { readonly kind: 'chat'; readonly body: string }
  | { readonly kind: 'teleport'; readonly destination: string }
  | { readonly kind: 'debug_space' }
  | { readonly kind: 'last_connections' }
  | { readonly kind: 'whisper'; readonly playerName: string; readonly body: string }
  | { readonly kind: 'reply'; readonly body: string }
  | { readonly kind: 'speech'; readonly speechKind: 'say' | 'shout'; readonly body: string }
  | { readonly kind: 'error'; readonly message: string };

function commandBody(value: string, commands: readonly string[]): string | null {
  for (const command of commands) {
    const match = new RegExp(`^/${command}(?:\\s+(.*))?$`, 'i').exec(value);
    if (match !== null) return match[1]?.trim() ?? '';
  }
  return null;
}

function whisperParts(value: string, onlinePlayerNames: readonly string[]): {
  readonly playerName: string;
  readonly body: string;
} | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const target = [...onlinePlayerNames]
    .sort((left, right) => right.length - left.length)
    .find((name) => normalized.toLocaleLowerCase('en-US').startsWith(`${name.toLocaleLowerCase('en-US')} `));
  if (target !== undefined) return { playerName: target, body: normalized.slice(target.length).trim() };
  const separator = normalized.indexOf(' ');
  return separator <= 0 ? null : {
    playerName: normalized.slice(0, separator),
    body: normalized.slice(separator + 1).trim(),
  };
}

export function parseChatSubmission(
  value: string,
  canAdministerWorld: boolean,
  onlinePlayerNames: readonly string[] = [],
): ParsedChatSubmission {
  const body = value.trim();
  if (!body.startsWith('/')) return { kind: 'chat', body };
  const debugSpace = commandBody(body, ['debug-space']);
  if (debugSpace !== null) {
    if (!canAdministerWorld) return { kind: 'error', message: 'ADMIN COMMAND REQUIRED' };
    return debugSpace.length === 0
      ? { kind: 'debug_space' }
      : { kind: 'error', message: 'USAGE: /debug-space' };
  }
  const teleport = commandBody(body, ['tp']);
  if (teleport !== null) {
    if (!canAdministerWorld) return { kind: 'error', message: 'ADMIN COMMAND REQUIRED' };
    const destination = teleport.replace(/\s+/g, ' ').trim();
    return destination.length > 0
      ? { kind: 'teleport', destination }
      : { kind: 'error', message: 'USAGE: /tp <x> <y>, /tp <PLAYER|NPC>, OR /tp <PLAYER> <PLAYER|NPC>' };
  }
  const lastConnections = commandBody(body, ['last']);
  if (lastConnections !== null) {
    if (!canAdministerWorld) return { kind: 'error', message: 'ADMIN COMMAND REQUIRED' };
    return lastConnections.length === 0
      ? { kind: 'last_connections' }
      : { kind: 'error', message: 'USAGE: /last' };
  }
  const whisper = commandBody(body, ['whisper', 'tell', 'w']);
  if (whisper !== null) {
    const parts = whisperParts(whisper, onlinePlayerNames);
    return parts !== null && parts.body.length > 0
      ? { kind: 'whisper', ...parts }
      : { kind: 'error', message: 'USAGE: /whisper <player> <message>' };
  }
  const reply = commandBody(body, ['reply', 'r']);
  if (reply !== null) return reply.length > 0
    ? { kind: 'reply', body: reply }
    : { kind: 'error', message: 'USAGE: /reply <message>' };
  const say = commandBody(body, ['say']);
  if (say !== null) return say.length > 0
    ? { kind: 'speech', speechKind: 'say', body: say }
    : { kind: 'error', message: 'USAGE: /say <message>' };
  const shout = commandBody(body, ['shout', 'yell']);
  if (shout !== null) return shout.length > 0
    ? { kind: 'speech', speechKind: 'shout', body: shout }
    : { kind: 'error', message: 'USAGE: /shout <message>' };
  return { kind: 'error', message: 'UNKNOWN COMMAND' };
}

function playerSuggestions(
  command: string,
  argument: string,
  onlinePlayerNames: readonly string[],
): ChatCommandSuggestion[] {
  return onlinePlayerNames
    .filter((name) => name.toLocaleLowerCase('en-US').startsWith(argument.toLocaleLowerCase('en-US')))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 3)
    .map((name) => ({ completion: `/${command} ${name} `, label: `${name}  PLAYER` }));
}

export function chatCommandSuggestions(
  value: string,
  onlinePlayerNames: readonly string[],
  canAdministerWorld: boolean,
  replyPlayerName: string | null = null,
): readonly ChatCommandSuggestion[] {
  if (!value.startsWith('/')) return [];
  const primaryCommands = [
    { name: 'say', usage: '/say <message>' },
    { name: 'shout', usage: '/shout <message>' },
    { name: 'whisper', usage: '/whisper <player> <message>' },
    ...(canAdministerWorld ? [{ name: 'tp', usage: '/tp <x> <y> OR /tp [player] <player|npc>' }] : []),
    ...(canAdministerWorld ? [{ name: 'debug-space', usage: '/debug-space  TOGGLE TEST SPACE' }] : []),
    ...(canAdministerWorld ? [{ name: 'last', usage: '/last  RECENT LOGINS AND LOGOUTS' }] : []),
  ];
  const commands = [
    ...primaryCommands,
    { name: 'yell', usage: '/yell <message>' },
    { name: 'tell', usage: '/tell <player> <message>' },
    { name: 'w', usage: '/w <player> <message>' },
    { name: 'reply', usage: '/reply <message>' },
    { name: 'r', usage: '/r <message>' },
  ];
  const lower = value.toLocaleLowerCase('en-US');
  if (lower === '/') return primaryCommands
    .map((command) => ({ completion: `/${command.name} `, label: command.usage }));
  if (!lower.includes(' ')) return commands
    .filter((command) => `/${command.name}`.startsWith(lower))
    .slice(0, 4)
    .map((command) => ({ completion: `/${command.name} `, label: command.usage }));

  for (const command of ['whisper', 'tell', 'w'] as const) {
    const prefix = `/${command} `;
    if (lower.startsWith(prefix)) {
      const argument = value.slice(prefix.length);
      if (argument.includes(' ')) return [{ completion: value, label: `/${command} <player> <message>` }];
      const matches = playerSuggestions(command, argument, onlinePlayerNames);
      return [...matches, { completion: value, label: `/${command} <player> <message>` }].slice(0, 4);
    }
  }
  for (const command of ['reply', 'r'] as const) {
    if (lower.startsWith(`/${command} `)) return [{
      completion: value,
      label: replyPlayerName === null
        ? `/${command} <message>  NO INCOMING WHISPER`
        : `/${command} <message>  TO ${replyPlayerName}`,
    }];
  }
  if (lower.startsWith('/tp ') && canAdministerWorld) {
    const argument = value.slice(4).trimStart();
    const coordinateLike = /^-?\d+(?:\s+-?\d*)?$/.test(argument);
    const matches = coordinateLike ? [] : playerSuggestions('tp', argument, onlinePlayerNames);
    return [...matches, { completion: value, label: '/tp [player] <player|npc> OR <x> <y>' }].slice(0, 4);
  }
  const command = commands.find((candidate) => lower.startsWith(`/${candidate.name} `));
  return command === undefined ? [] : [{ completion: value, label: command.usage }];
}
