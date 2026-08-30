import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('homestead access authority schema', () => {
  it('streams caller-scoped roles and enforces worker/builder capabilities', () => {
    expect(source).toContain("name: 'own_homestead_members'");
    expect(source).toContain('export const setHomesteadMemberRole = spacetimedb.reducer');
    expect(source).toContain('export const removeHomesteadMember = spacetimedb.reducer');
    expect(source).toContain("homesteadRoleAtLeast(homesteadRoleFor(ctx, home, position.identity), 'worker')");
    expect(source).toContain("homesteadRoleAtLeast(homesteadRoleFor(ctx, home, ctx.sender), 'builder')");
    expect(source).toContain('insertEscrowStacksIntoInventory(ctx, harvestRecipient');
  });
});
