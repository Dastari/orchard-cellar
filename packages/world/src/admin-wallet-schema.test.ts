import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('owner wallet administration', () => {
  it('retires the CLI grant in favour of the versioned audited wallet mutation', () => {
    expect(source).not.toContain('export const grantPlayerGold =');
    const start = source.indexOf('export const adminSetWallet =');
    const end = source.indexOf('export const adminGrantSkillPoints =', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reducer = source.slice(start, end);
    expect(reducer).toContain('executeAdminProgressionMutation(ctx');
    expect(reducer).toContain("operation: 'set_wallet'");
    expect(reducer).toContain('adminProgressionMutationBase(input)');
    expect(reducer).toContain('deltaBronze: input.deltaBronze');
  });
});
