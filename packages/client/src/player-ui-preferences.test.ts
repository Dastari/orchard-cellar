import { describe, expect, it } from 'vitest';
import { LEGACY_NAMEPLATES_KEY, readPlayerNameplates, writePlayerNameplates } from './player-ui-preferences.js';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('player nameplate preference', () => {
  it('survives a fresh tab and keeps each player independent', () => {
    const persistent = storage();
    writePlayerNameplates('alice', false, persistent);
    expect(readPlayerNameplates('alice', persistent, storage())).toBe(false);
    expect(readPlayerNameplates('bob', persistent, storage())).toBe(true);
    writePlayerNameplates('bob', true, persistent);
    expect(readPlayerNameplates('alice', persistent, storage())).toBe(false);
  });

  it('claims the existing tab setting once without leaking it to the next player', () => {
    const persistent = storage();
    const session = storage();
    session.setItem(LEGACY_NAMEPLATES_KEY, 'false');
    expect(readPlayerNameplates('alice', persistent, session)).toBe(false);
    expect(session.getItem(LEGACY_NAMEPLATES_KEY)).toBeNull();
    expect(readPlayerNameplates('bob', persistent, session)).toBe(true);
    session.setItem(LEGACY_NAMEPLATES_KEY, 'true');
    expect(readPlayerNameplates('alice', persistent, session)).toBe(false);
  });

  it('does not prevent the live toggle when persistence is blocked', () => {
    const blocked = { ...storage(), setItem: () => { throw new Error('blocked'); } };
    expect(() => writePlayerNameplates('alice', false, blocked)).not.toThrow();
    expect(readPlayerNameplates('alice', blocked, storage())).toBe(true);
    const session = storage();
    session.setItem(LEGACY_NAMEPLATES_KEY, 'false');
    expect(readPlayerNameplates('alice', blocked, session)).toBe(false);
  });
});
