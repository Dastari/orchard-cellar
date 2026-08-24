import {
  TILE_SIZE_FIXED,
  createPlaceholderCollisionMap,
  movePlayer,
  type PlayerState,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_HZ,
  CHUNK_SIZE_FIXED,
  advanceAuthorityPlayer,
  canTendTree,
  chunkAt,
  decodeDirection,
  presenceLeaseExpired,
} from './world-rules.js';

const START: PlayerState = {
  position: { x: 8 * TILE_SIZE_FIXED, y: 12 * TILE_SIZE_FIXED },
  facing: 'down',
  moving: false,
  location: 'estate',
};

describe('overworld authority rules', () => {
  it('advances at the same one-second pace as the 60 Hz shared sim', () => {
    const collision = createPlaceholderCollisionMap(48, 32);
    let authoritative = START;
    for (let tick = 0; tick < AUTHORITY_HZ; tick += 1) {
      authoritative = advanceAuthorityPlayer(authoritative, 'right', collision);
    }

    let direct = START;
    for (let tick = 0; tick < 60; tick += 1) {
      direct = movePlayer(direct, 'right', collision);
    }
    expect(authoritative).toEqual(direct);
  });

  it('uses stable chunk boundaries and decodes only protocol directions', () => {
    expect(chunkAt(CHUNK_SIZE_FIXED - 1)).toBe(0);
    expect(chunkAt(CHUNK_SIZE_FIXED)).toBe(1);
    expect(chunkAt(-1)).toBe(-1);
    expect(decodeDirection('upLeft')).toBe('upLeft');
    expect(decodeDirection('idle')).toBeNull();
    expect(decodeDirection('teleport')).toBeUndefined();
  });

  it('enforces authoritative reach and the shared-tree cooldown boundary', () => {
    expect(canTendTree(0, 0, 2 * TILE_SIZE_FIXED, 0, 0, 0n, 0n)).toBe('ok');
    expect(canTendTree(0, 0, 2 * TILE_SIZE_FIXED + 1, 0, 0, 0n, 0n)).toBe('out_of_range');
    expect(canTendTree(0, 0, TILE_SIZE_FIXED, 0, 1, 100n, 119n)).toBe('cooldown');
    expect(canTendTree(0, 0, TILE_SIZE_FIXED, 0, 1, 100n, 120n)).toBe('ok');
  });

  it('expires crash ghosts after the heartbeat lease, not at its boundary', () => {
    expect(presenceLeaseExpired(1_000_000n, 31_000_000n)).toBe(false);
    expect(presenceLeaseExpired(1_000_000n, 31_000_001n)).toBe(true);
  });
});
