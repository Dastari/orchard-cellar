import { describe, expect, it } from 'vitest';
import {
  ROGUE_RUN_ROOM_COUNT,
  generateRogueRoomExits,
  generateRogueRoomLayout,
  generateRogueUpgradeOffers,
  generateRogueWave,
  rogueRoomIsBoss,
  rogueThemeForRoom,
} from './roguelike.js';
import { terrainWalkingStepAllowed } from './terrain-elevation.js';

describe('room-based roguelike generation', () => {
  it('progresses through cave, volcanic, and dungeon acts with fixed bosses', () => {
    expect(Array.from({ length: ROGUE_RUN_ROOM_COUNT }, (_, room) => rogueThemeForRoom(room))).toEqual([
      'cave', 'cave', 'cave', 'cave',
      'volcanic', 'volcanic', 'volcanic', 'volcanic',
      'dungeon', 'dungeon', 'dungeon', 'dungeon',
    ]);
    expect(Array.from({ length: ROGUE_RUN_ROOM_COUNT }, (_, room) => rogueRoomIsBoss(room))).toEqual([
      false, false, false, true, false, false, false, true, false, false, false, true,
    ]);
  });

  it('creates deterministic layouts with safe player and enemy spawns', () => {
    const first = generateRogueRoomLayout(42, 5, 'combat');
    expect(generateRogueRoomLayout(42, 5, 'combat')).toEqual(first);
    expect(first.blocked[first.playerSpawn.tileY * first.width + first.playerSpawn.tileX]).toBe(false);
    expect(first.enemySpawns.length).toBeGreaterThanOrEqual(5);
    expect(first.enemySpawns.every((spawn) => !first.blocked[spawn.tileY * first.width + spawn.tileX])).toBe(true);
  });

  it('authors a shared two-lane stair onto a walkable raised interior dais', () => {
    const layout = generateRogueRoomLayout(42, 5, 'combat');
    expect(layout.terrainTransitions).toHaveLength(2);
    for (const tileX of [15, 16]) {
      expect(layout.elevations[16 * layout.width + tileX]).toBe(0);
      expect(layout.elevations[15 * layout.width + tileX]).toBe(1);
      expect(layout.blocked[15 * layout.width + tileX]).toBe(false);
      expect(terrainWalkingStepAllowed(
        layout.elevations,
        layout.width,
        layout.height,
        layout.terrainTransitions,
        tileX,
        16,
        tileX,
        15,
      )).toBe(true);
    }
  });

  it('builds every internal obstacle around a solid 3x3 raised-terrain core', () => {
    const seenLayouts = new Set<string>();
    for (let seed = 0; seed < 64; seed += 1) {
      const layout = generateRogueRoomLayout(seed, 1, 'combat');
      seenLayouts.add(layout.id);
      for (const obstacle of layout.obstacles) {
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          expect(
            layout.blocked[(obstacle.tileY + dy) * layout.width + obstacle.tileX + dx],
            `${layout.id} has a thin obstacle at ${obstacle.tileX},${obstacle.tileY}`,
          ).toBe(true);
        }
      }
    }
    expect(seenLayouts).toEqual(new Set([
      'cave_combat_0', 'cave_combat_1', 'cave_combat_2', 'cave_combat_3',
    ]));
  });

  it('keeps every spawn and future exit reachable in every authored layout family', () => {
    for (let seed = 0; seed < 16; seed += 1) for (let room = 0; room < ROGUE_RUN_ROOM_COUNT; room += 1) {
      const kind = rogueRoomIsBoss(room) ? 'boss' : 'combat';
      const layout = generateRogueRoomLayout(seed, room, kind);
      const visited = new Set([`${layout.playerSpawn.tileX}:${layout.playerSpawn.tileY}`]);
      const pending = [layout.playerSpawn];
      while (pending.length > 0) {
        const point = pending.shift()!;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const tileX = point.tileX + dx;
          const tileY = point.tileY + dy;
          const key = `${tileX}:${tileY}`;
          if (tileX < 0 || tileY < 0 || tileX >= layout.width || tileY >= layout.height
            || layout.blocked[tileY * layout.width + tileX] || visited.has(key)) continue;
          visited.add(key);
          pending.push({ tileX, tileY });
        }
      }
      for (const point of [...layout.enemySpawns, ...Object.values(layout.doorTiles)]) {
        expect(visited.has(`${point.tileX}:${point.tileY}`), `${layout.id} blocked ${point.tileX},${point.tileY}`).toBe(true);
      }
    }
  });

  it('offers three unique visible destinations and forces act guardians', () => {
    const ordinary = generateRogueRoomExits(99, 1);
    expect(ordinary).toHaveLength(3);
    expect(new Set(ordinary.map((exit) => exit.direction)).size).toBe(3);
    expect(generateRogueRoomExits(99, 2).every((exit) => exit.destinationKind === 'boss')).toBe(true);
    expect(generateRogueRoomExits(99, 11)).toEqual([]);
  });

  it('offers three unique deterministic upgrades with bounded wave sizes', () => {
    const offers = generateRogueUpgradeOffers(501, 6, 'elite');
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.upgradeId)).size).toBe(3);
    expect(generateRogueUpgradeOffers(501, 6, 'elite')).toEqual(offers);
    expect(generateRogueWave(501, 10, 'combat', 2).length).toBeLessThanOrEqual(8);
  });
});
