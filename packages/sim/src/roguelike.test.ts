import { describe, expect, it } from 'vitest';
import {
  ROGUE_RUN_ROOM_COUNT,
  activeRogueUpgradeDefinitions,
  activeRogueEnemyPools,
  generateRogueRoomExits,
  generateRogueRoomLayout,
  generateRogueUpgradeOffers,
  generateRogueWave,
  rogueUpgradeDefinition,
  rogueRoomIsBoss,
  rogueThemeForRoom,
} from './roguelike.js';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import type { EnemyContentDefinition } from './content/outdoor-encounter-definition.js';
import type {UpgradeContentDefinition} from './content/world-definition.js';
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
    const registry=bootstrapContentRegistry();
    const offers = generateRogueUpgradeOffers(501, 6, 'elite',registry);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.upgradeId)).size).toBe(3);
    expect(generateRogueUpgradeOffers(501, 6, 'elite',registry)).toEqual(offers);
    expect(offers).toEqual([
      {slot:0,upgradeId:'heavy_blows',rarity:'uncommon',magnitudePermille:300,cost:0},
      {slot:1,upgradeId:'keen_edge',rarity:'common',magnitudePermille:160,cost:0},
      {slot:2,upgradeId:'iron_heart',rarity:'common',magnitudePermille:150,cost:0},
    ]);
    expect(generateRogueWave(501, 10, 'combat', 2).length).toBeLessThanOrEqual(8);
  });

  it('resolves the eight canonical boons through durable authored ids',()=>{
    const registry=bootstrapContentRegistry();
    expect(activeRogueUpgradeDefinitions(registry)).toEqual([
      {id:'keen_edge',name:'Keen Edge',description:'Sword attacks deal more damage.',modifierKind:'sword_damage',baseMagnitudePermille:160},
      {id:'fletchers_eye',name:"Fletcher's Eye",description:'Arrows deal more damage.',modifierKind:'bow_damage',baseMagnitudePermille:160},
      {id:'quick_hands',name:'Quick Hands',description:'Attack recovery is shorter.',modifierKind:'attack_speed',baseMagnitudePermille:120},
      {id:'fleet_foot',name:'Fleet Foot',description:'Move faster within the Delve.',modifierKind:'move_speed',baseMagnitudePermille:100},
      {id:'lucky_strike',name:'Lucky Strike',description:'Critical hits happen more often.',modifierKind:'critical_chance',baseMagnitudePermille:50},
      {id:'iron_heart',name:'Iron Heart',description:'Raise maximum health and heal the increase.',modifierKind:'max_health',baseMagnitudePermille:150},
      {id:'field_dressing',name:'Field Dressing',description:'Restore a portion of missing health.',modifierKind:'healing',baseMagnitudePermille:220},
      {id:'heavy_blows',name:'Heavy Blows',description:'Hits knock enemies farther back.',modifierKind:'knockback',baseMagnitudePermille:240},
    ]);
    expect(rogueUpgradeDefinition(registry,'iron_heart')?.modifierKind).toBe('max_health');
  });

  it('survives authoring-definition renames and fails closed for incomplete, retired, or duplicate catalogs',()=>{
    const registry=bootstrapContentRegistry(),source=[...registry.upgrades.values()].find((definition)=>(
      'delveBoon' in definition&&definition.delveBoon[0]==='keen_edge'))!;
    const renamed={...source,id:'upgrade:arbitrarily_renamed_boon'} satisfies UpgradeContentDefinition;
    const renamedMap=new Map(registry.upgrades);renamedMap.delete(source.id);renamedMap.set(renamed.id,renamed);
    expect(rogueUpgradeDefinition({upgrades:renamedMap},'keen_edge')?.name).toBe('Keen Edge');
    expect(generateRogueUpgradeOffers(501,6,'elite',{upgrades:renamedMap}))
      .toEqual(generateRogueUpgradeOffers(501,6,'elite',registry));

    const missing=new Map(registry.upgrades);missing.delete(source.id);
    const retired=new Map(registry.upgrades);retired.set(source.id,{...source,retired:true});
    const duplicate={...source,id:'upgrade:duplicate_boon'} satisfies UpgradeContentDefinition;
    const ambiguous=new Map(registry.upgrades);ambiguous.set(duplicate.id,duplicate);
    for(const upgrades of [missing,retired,ambiguous]){
      expect(activeRogueUpgradeDefinitions({upgrades})).toBeNull();
      expect(rogueUpgradeDefinition({upgrades},'keen_edge')).toBeNull();
      expect(()=>generateRogueUpgradeOffers(501,6,'elite',{upgrades})).toThrow('rogue_upgrade_catalog_unavailable');
    }
    expect(buildContentRegistry([...bootstrapContentRows(),{id:duplicate.id,kind:duplicate.kind,json:duplicate}]).report.errors)
      .toContainEqual(expect.objectContaining({code:'ambiguous_interaction',definitionId:duplicate.id,path:'delveBoon[0]'}));
  });

  it('preserves the complete authored enemy pools when the provider id is renamed', () => {
    const bootstrap = bootstrapContentRegistry();
    const provider = [...bootstrap.enemies.values()].find(({ delvePools }) => delvePools !== undefined)!;
    const expected = activeRogueEnemyPools(bootstrap);
    expect(expected?.get('cave')).toEqual([
      { kind: 'skeleton', displayName: 'Restless Skeleton', archetype: 'melee', health: 8, damage: 8, speedPermille: 900 },
      { kind: 'skeleton_bowman', displayName: 'Skeleton Bowman', archetype: 'ranged', health: 6, damage: 7, speedPermille: 760 },
      { kind: 'slime_small', displayName: 'Cave Slime', archetype: 'melee', health: 5, damage: 5, speedPermille: 740 },
    ]);
    const renamed = {
      ...provider,
      id: 'enemy:renamed_delve_catalog',
    } satisfies EnemyContentDefinition;
    const enemies = new Map(bootstrap.enemies);
    enemies.delete(provider.id);
    enemies.set(renamed.id, renamed);
    const registry = { enemies };
    expect(activeRogueEnemyPools(registry)).toEqual(expected);
    for (let room = 0; room < ROGUE_RUN_ROOM_COUNT; room += 1) {
      expect(generateRogueWave(501, room, 'combat', 2, registry))
        .toEqual(generateRogueWave(501, room, 'combat', 2, bootstrap));
    }
  });

  it('fails closed for missing, retired, and ambiguously owned Delve catalogs', () => {
    const bootstrap = bootstrapContentRegistry();
    const provider = [...bootstrap.enemies.values()].find(({ delvePools }) => delvePools !== undefined)!;
    const withoutProvider = new Map(bootstrap.enemies);
    withoutProvider.delete(provider.id);
    expect(() => generateRogueWave(501, 1, 'combat', 0, { enemies: withoutProvider }))
      .toThrow('rogue_enemy_pool_unavailable');

    const retired = new Map(bootstrap.enemies);
    retired.set(provider.id, { ...provider, retired: true });
    expect(() => generateRogueWave(501, 1, 'combat', 0, { enemies: retired }))
      .toThrow('rogue_enemy_pool_unavailable');

    const ambiguous = new Map(bootstrap.enemies);
    const duplicate = {
      ...provider,
      id: 'enemy:second_delve_catalog',
      runtimeKind: 'second_delve_catalog',
    } satisfies EnemyContentDefinition;
    ambiguous.set(duplicate.id, duplicate);
    expect(() => generateRogueWave(501, 1, 'combat', 0, { enemies: ambiguous }))
      .toThrow('rogue_enemy_pool_unavailable');
    expect(buildContentRegistry([...bootstrapContentRows(), {
      id: duplicate.id, kind: duplicate.kind, json: duplicate,
    }]).report.errors).toContainEqual(expect.objectContaining({
      code: 'ambiguous_interaction', definitionId: duplicate.id, path: 'delvePools',
    }));
  });
});
