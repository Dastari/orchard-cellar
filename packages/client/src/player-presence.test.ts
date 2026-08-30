import { describe, expect, it } from 'vitest';
import {
  worldPlayerIsOffline,
  worldPlayerParticipatesInCollision,
} from './player-presence.js';

describe('world player presence presentation', () => {
  it('turns only authority-confirmed remote players into live participants', () => {
    expect(worldPlayerIsOffline(false, true)).toBe(false);
    expect(worldPlayerIsOffline(false, false)).toBe(true);
    expect(worldPlayerIsOffline(false, undefined)).toBe(true);
    expect(worldPlayerParticipatesInCollision(false, false)).toBe(false);
    expect(worldPlayerParticipatesInCollision(false, true)).toBe(true);
  });

  it('keeps the local player visible while profile state hydrates', () => {
    expect(worldPlayerIsOffline(true, undefined)).toBe(false);
    expect(worldPlayerParticipatesInCollision(true, undefined)).toBe(true);
  });
});
