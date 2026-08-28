import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('online roster idle authority', () => {
  it('stores a migration-safe public activity timestamp', () => {
    const start = source.indexOf('const player_public = table(');
    const end = source.indexOf('const character_profile = table(', start);
    const table = source.slice(start, end);
    expect(table).toContain('lastActiveAtMicros: t.u64().default(0n)');
  });

  it('separates presence heartbeats from user activity', () => {
    const start = source.indexOf('export const heartbeat =');
    const end = source.indexOf('export const setInput =', start);
    const reducer = source.slice(start, end);
    expect(reducer).toContain('{ active: t.bool() }');
    expect(reducer).toContain('if (active)');
    expect(reducer).toContain('lastSeenAt: ctx.timestamp');
    expect(reducer).toContain('lastActiveAtMicros: ctx.timestamp.microsSinceUnixEpoch');
  });
});
