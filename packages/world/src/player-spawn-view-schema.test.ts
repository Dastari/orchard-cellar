import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('caller-private player spawn view', () => {
  it('exposes only the sender row through an additive option view', () => {
    const start = worldSource.indexOf('export const ownPlayerSpawn');
    const end = worldSource.indexOf('export const ownFishingCast', start);
    const source = worldSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(source).toContain("{ name: 'own_player_spawn', public: true }");
    expect(source).toContain('t.option(player_spawn.rowType)');
    expect(source).toContain('ctx.db.player_spawn.identity.find(ctx.sender) ?? undefined');
    expect(source).not.toContain('.iter()');
  });
});
