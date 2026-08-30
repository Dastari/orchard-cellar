import { describe, expect, it } from 'vitest';
import { homesteadRoleAtLeast, isHomesteadMemberRole } from './homestead-access.js';

describe('homestead access roles', () => {
  it('orders guest, worker, builder, and owner capabilities', () => {
    expect(homesteadRoleAtLeast('guest', 'worker')).toBe(false);
    expect(homesteadRoleAtLeast('worker', 'worker')).toBe(true);
    expect(homesteadRoleAtLeast('builder', 'worker')).toBe(true);
    expect(homesteadRoleAtLeast('owner', 'builder')).toBe(true);
  });

  it('rejects owner as a stored membership role', () => {
    expect(isHomesteadMemberRole('builder')).toBe(true);
    expect(isHomesteadMemberRole('owner')).toBe(false);
  });
});
