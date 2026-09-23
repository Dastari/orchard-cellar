import { describe, expect, it } from 'vitest';
import { CombatMusicSignal, hostileWithin, musicSpaceContext, worldMusicContext } from './music-context.js';

describe('music context from game state', () => {
  it('maps spaces to music zones and mood tags', () => {
    expect(musicSpaceContext({ generator: 'island', environment: 'outdoor', audioBed: 'estate' })).toEqual({ zone: 'overworld', tags: [] });
    expect(musicSpaceContext({ generator: 'homestead', environment: 'outdoor', audioBed: 'homestead' })).toEqual({ zone: 'homestead', tags: [] });
    expect(musicSpaceContext({ generator: 'village_interior', environment: 'indoor', audioBed: 'homestead' })).toEqual({ zone: 'interior', tags: [] });
    expect(musicSpaceContext({ generator: 'cellar', environment: 'underground', audioBed: 'cave' })).toEqual({ zone: 'cellar', tags: [] });
    expect(musicSpaceContext({ generator: 'delve_lobby', environment: 'underground', audioBed: 'cave' })).toEqual({ zone: 'delve', tags: ['delve:lobby'] });
    expect(musicSpaceContext({
      generator: 'roguelike', environment: 'underground', audioBed: 'cave',
      rogueRoom: { seed: 1, roomNumber: 3, roomKind: 'boss', theme: 'volcanic' },
    })).toEqual({ zone: 'delve', tags: ['delve:volcanic', 'room:boss'] });
  });

  it('only reports the biome outdoors and translates rain', () => {
    const indoors = worldMusicContext({ space: { generator: 'village_interior', environment: 'indoor', audioBed: 'homestead' }, biome: 'lava', raining: true, combat: false });
    expect(indoors).toMatchObject({ scene: 'world', zone: 'interior', biome: null, weather: 'rain', combat: false });
    const outdoors = worldMusicContext({ space: { generator: 'island', environment: 'outdoor', audioBed: 'estate' }, biome: 'volcanic_ash', raining: false, combat: true });
    expect(outdoors).toMatchObject({ zone: 'overworld', biome: 'volcanic_ash', weather: 'clear', combat: true });
  });

  it('detects awake, living enemies within range in the same space', () => {
    const player = { x: 0, y: 0 };
    const enemy = { x: 30, y: 40, health: 10, spaceId: 5, wanderDirection: 'down' };
    expect(hostileWithin([enemy], player, 5, 50)).toBe(true);
    expect(hostileWithin([enemy], player, 5, 49)).toBe(false);
    expect(hostileWithin([{ ...enemy, spaceId: 6 }], player, 5, 50)).toBe(false);
    expect(hostileWithin([{ ...enemy, health: 0 }], player, 5, 50)).toBe(false);
    expect(hostileWithin([{ ...enemy, wanderDirection: 'dormant' }], player, 5, 50)).toBe(false);
  });

  it('keeps a fight going between swings, then lets it end', () => {
    const signal = new CombatMusicSignal(4_000);
    expect(signal.observe({ nowMs: 0, hostileNearby: false, struckEnemy: false })).toBe(false);
    expect(signal.observe({ nowMs: 100, hostileNearby: false, struckEnemy: true })).toBe(true);
    expect(signal.observe({ nowMs: 3_000, hostileNearby: false, struckEnemy: false })).toBe(true);
    expect(signal.observe({ nowMs: 4_200, hostileNearby: false, struckEnemy: false })).toBe(false);
    expect(signal.observe({ nowMs: 5_000, hostileNearby: true, struckEnemy: false })).toBe(true);
    signal.reset();
    expect(signal.observe({ nowMs: 5_001, hostileNearby: false, struckEnemy: false })).toBe(false);
  });
});
