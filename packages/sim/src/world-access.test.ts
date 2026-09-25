import { describe, expect, it } from 'vitest';
import { canAdministerWorld, isWorldOwnerRole } from './world-access.js';

describe('world administration access', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['moderator', false],
    ['friend', false],
    ['', false],
    [null, false],
    [undefined, false],
  ] as const)('maps %s to %s', (role, expected) => {
    expect(canAdministerWorld(role)).toBe(expected);
  });
});

describe('strict world owner access', () => {
  it.each([
    ['owner', true],
    ['admin', false],
    ['moderator', false],
    ['friend', false],
    ['', false],
    [null, false],
    [undefined, false],
  ] as const)('maps %s to %s', (role, expected) => {
    expect(isWorldOwnerRole(role)).toBe(expected);
  });
});
