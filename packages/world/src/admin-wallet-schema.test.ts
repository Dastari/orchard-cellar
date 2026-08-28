import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('owner wallet administration', () => {
  it('grants bounded whole gold to one exact identity without exposing wallets', () => {
    const start = source.indexOf('export const grantPlayerGold =');
    const end = source.indexOf('export const usePortal =', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reducer = source.slice(start, end);
    expect(reducer).toContain('requireWorldOwner');
    expect(reducer).toContain('{ identity: t.identity(), gold: t.u32() }');
    expect(reducer).toContain('BigInt(gold) * BRONZE_PER_GOLD');
    expect(reducer).toContain("throw new SenderError('wallet_full')");
    expect(reducer).toContain("action: 'grant_player_gold'");
    expect(reducer).not.toContain('displayName: t.string()');
  });
});
