import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type PlayerState } from './state.js';
import {
  collisionTileIsBlockedAtPlane,
  movePlayer,
  PLAYER_HITBOX_FOOT_OFFSET,
  positionCollides,
} from './movement.js';
import { NPC_INTERACTION_REACH_FIXED, stepNpcTowardPoint, stepWanderingNpc, type WanderingNpcState } from './npc.js';
import { terrainWalkingStepAllowed } from './terrain-elevation.js';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_ISLAND_SIZE,
  SURVIVAL_ISLAND_OFFSET_TILES,
  SURVIVAL_BIOMES,
  ORE_MIN_SPACING_TILES,
  FISH_POOL_RESOURCE_ID_BASE,
  SURFACE_ACTIVE_ORE_NODES,
  SURVIVAL_TREE_KINDS,
  SURVIVAL_FRUIT_TREE_KINDS,
  ORE_NODE_RESERVE_HITS,
  LARGE_ROCK_INITIAL_HEALTH,
  LARGE_ROCK_STONE_RESERVE,
  SURVIVAL_MAX_TERRAIN_ELEVATION,
  activeSurvivalLandmarks,
  createSurvivalCollisionMap,
  generateSurvivalResources,
  generateSurvivalDecorations,
  generateSurfaceOreSpawnSites,
  generateFishPoolSpawnSites,
  generateMarlowCampPathTiles,
  generateSurvivalLandmarkDecorations,
  generatedSurvivalResourceAt,
  findSurvivalSpawnTile,
  isChoppableTreeKind,
  isRegrowingPlantKind,
  isBreakableRockKind,
  isGatherableResourceKind,
  survivalDecorationResource,
  isMineableOreKind,
  survivalBiomeAt,
  survivalBiomeBlocksTraversal,
  survivalBiomeAllowsHorseJump,
  survivalBiomeBlocksMovement,
  survivalDirtCliffRoleAt,
  survivalDirtTerraceAt,
  survivalDirtTerraceRamps,
  survivalMainStreamCenterAt,
  survivalPlateauAt,
  survivalPlateauRamps,
  survivalStairRuns,
  survivalElevationBytes,
  survivalRaisedTerrainBlocksMovementAt,
  survivalRaisedTerrainPlansAt,
  survivalRaisedTerrainStructuralAt,
  survivalTerrainHeightAt,
  survivalTerrainTransitions,
  survivalSpawnPosition,
  survivalSpawnTiles,
  survivalOreObstacle,
  survivalIslandAt,
  survivalResourceInitialHealth,
  survivalDecorationObstacle,
  survivalLandmarkRolePoints,
  survivalLandmarksForRole,
  survivalLandmarksGroundWalkableAt,
  survivalLandmarksReservedAt,
  survivalFishermanDockWalkableAt,
  survivalStreamAt,
  survivalTreeObstacle,
  survivalTerrainBytes,
  survivalTreeKindAt,
  survivalWaterfallAt,
  type SurvivalBiome,
} from './survival-world.js';
import { FISH_POOL_ACTIVE_CAP, FISH_POOL_MIN_SPACING_TILES } from './fishing.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';

const registry = bootstrapContentRegistry();
const islandLandmarks = activeSurvivalLandmarks(registry, 0);

describe('deterministic survival island', () => {
  it('activates spaced authoritative fish pools only in deep pond water', () => {
    const sites = generateFishPoolSpawnSites();
    const pools = generateSurvivalResources().filter((resource) => resource.kind === 'fish_pool');
    expect(sites.length).toBeGreaterThan(FISH_POOL_ACTIVE_CAP);
    expect(pools).toHaveLength(FISH_POOL_ACTIVE_CAP);
    expect(generateSurvivalDecorations().some((decoration) => decoration.kind === 'nature_fish_shadow')).toBe(false);
    for (const [index, pool] of pools.entries()) {
      expect(pool.id).toBe(FISH_POOL_RESOURCE_ID_BASE + index);
      expect(pool.richness).toBeGreaterThanOrEqual(2);
      expect(pool.richness).toBeLessThanOrEqual(4);
      for (const other of pools.slice(index + 1)) {
        const dx = pool.tileX - other.tileX;
        const dy = pool.tileY - other.tileY;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(FISH_POOL_MIN_SPACING_TILES ** 2);
      }
    }
  }, 20_000);

  it('authors Farmer Bob\'s protected farm with a walkable gate and no generated resources', () => {
    const farmLandmarks = survivalLandmarksForRole(islandLandmarks, 'wildlife_feed');
    expect(farmLandmarks).toHaveLength(1);
    const farmLandmark = farmLandmarks[0]!;
    const farm = generateSurvivalLandmarkDecorations(farmLandmarks);
    expect(farm.some((decoration) => decoration.kind === 'farm_house')).toBe(true);
    const protectedHerd = [...registry.spawns.values()].find((spawn) => (
      spawn.retired !== true && spawn.strategy === 'fixed' && spawn.protectedBy !== undefined
    ));
    expect(protectedHerd?.positions).toEqual([
      { runtimeId: '4', tileX: 375, tileY: 376, variant: 0 },
      { runtimeId: '5', tileX: 378, tileY: 379, variant: 1 },
      { runtimeId: '6', tileX: 374, tileY: 382, variant: 2 },
    ]);
    expect(farm.filter((decoration) => (
      decoration.kind === 'farm_hay_stack' || decoration.kind === 'farm_hay_bale'
    )).map(({ kind, tileX, tileY }) => ({ kind, tileX, tileY }))).toEqual(
      survivalLandmarkRolePoints(islandLandmarks, 'wildlife_feed')
        .map(({ decorationKind: kind, tileX, tileY }) => ({ kind, tileX, tileY })),
    );
    expect(farm.map((decoration) => String(decoration.kind))).not.toContain('farm_cow');
    expect(farm.some((decoration) => decoration.kind === 'farm_crop_strawberry')).toBe(true);
    const wateredSoil = farm.filter((decoration) => decoration.role === 'soil.watered');
    expect(wateredSoil).toHaveLength(18);
    expect(new Set(wateredSoil.map(({ kind }) => kind)))
      .toEqual(new Set(['farm_crop_strawberry', 'farm_crop_sunflower']));
    expect(farm).toContainEqual(expect.objectContaining({
      kind: 'farm_grave',
      tileX: 390,
      tileY: 371,
    }));
    const centerTileX = Math.floor((farmLandmark.bounds.minimumTileX + farmLandmark.bounds.maximumTileX) / 2);
    const centerTileY = Math.floor((farmLandmark.bounds.minimumTileY + farmLandmark.bounds.maximumTileY) / 2);
    expect(survivalLandmarksReservedAt(farmLandmarks, centerTileX, centerTileY)).toBe(true);
    expect(survivalLandmarksReservedAt(
      farmLandmarks, farmLandmark.bounds.minimumTileX - 1, centerTileY,
    )).toBe(false);
    expect(generateSurvivalResources().some((resource) =>
      survivalLandmarksReservedAt(farmLandmarks, resource.tileX, resource.tileY))).toBe(false);

    const gate = farm.find((decoration) => decoration.kind === 'farm_gate');
    const fence = farm.find((decoration) => decoration.kind === 'farm_fence');
    expect(gate).toBeDefined();
    expect(fence).toBeDefined();
    if (gate) expect(survivalDecorationObstacle(gate, 'ground')).toBeNull();
    if (fence) expect(survivalDecorationObstacle(fence, 'ground')).not.toBeNull();

    const house = farm.find((decoration) => decoration.kind === 'farm_house');
    expect(house).toBeDefined();
    if (house) expect(survivalDecorationObstacle(house, 'ground')).toEqual({
      left: (house.tileX - 2) * TILE_SIZE_FIXED,
      top: (house.tileY - 2) * TILE_SIZE_FIXED,
      right: (house.tileX + 3) * TILE_SIZE_FIXED - 1,
      bottom: house.tileY * TILE_SIZE_FIXED - 1,
    });

    const hayStack = farm.find((decoration) => decoration.kind === 'farm_hay_stack');
    expect(hayStack).toBeDefined();
    if (hayStack) expect(survivalDecorationObstacle(hayStack, 'ground')).toEqual({
      left: (hayStack.tileX - 1) * TILE_SIZE_FIXED,
      top: hayStack.tileY * TILE_SIZE_FIXED,
      right: (hayStack.tileX + 2) * TILE_SIZE_FIXED - 1,
      bottom: (hayStack.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }, 20_000);

  it('authors Marlow\'s camp as a clear, collidable permanent landmark', () => {
    const campLandmarks = survivalLandmarksForRole(islandLandmarks, 'automated_campfire');
    expect(campLandmarks).toHaveLength(1);
    const campLandmark = campLandmarks[0]!;
    const camp = generateSurvivalLandmarkDecorations(campLandmarks)
      .filter((decoration) => decoration.kind.startsWith('camp_'));
    expect(camp).toHaveLength(12);
    expect(camp.some((decoration) => decoration.kind === 'camp_tent')).toBe(true);
    expect(camp.some((decoration) => decoration.kind === 'camp_campfire')).toBe(true);
    expect(camp.some((decoration) => decoration.kind === 'camp_pond')).toBe(true);
    expect(camp.some((decoration) => decoration.kind === 'camp_fishing_rod')).toBe(true);
    expect(generateSurvivalResources().some((resource) =>
      survivalLandmarksReservedAt(campLandmarks, resource.tileX, resource.tileY))).toBe(false);
    const tent = camp.find((decoration) => decoration.kind === 'camp_tent');
    expect(tent).toBeDefined();
    if (tent) expect(survivalDecorationObstacle(tent, 'ground')).toEqual({
      left: (tent.tileX - 1) * TILE_SIZE_FIXED,
      top: (tent.tileY - 2) * TILE_SIZE_FIXED,
      right: (tent.tileX + 2) * TILE_SIZE_FIXED - 1,
      bottom: tent.tileY * TILE_SIZE_FIXED - 1,
    });
    const path = generateMarlowCampPathTiles();
    expect(new Set(path.map((tile) => `${tile.tileX}:${tile.tileY}`)).size).toBe(path.length);
    expect(path.some((tile) => tile.tileX < campLandmark.bounds.minimumTileX)).toBe(true);
    expect(path.some((tile) => tile.tileX > campLandmark.bounds.maximumTileX)).toBe(true);
    expect(path.some((tile) => tile.tileY > campLandmark.bounds.maximumTileY)).toBe(true);
    const automatedFire = campLandmark.decorations.find((rule) => (
      rule.kind === 'point' && rule.roles?.includes('automated_campfire') === true
    ));
    if (automatedFire?.kind !== 'point' || automatedFire.placeable?.automation === undefined) {
      throw new Error('missing authored automated campfire');
    }
    const campNpc = registry.npcs.get(automatedFire.placeable.automation.actor)!;
    expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, campNpc.home.tileX, campNpc.home.tileY)).toBe('plains');

    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const home = {
      x: campNpc.home.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: campNpc.home.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    };
    expect(positionCollides(home, collision)).toBe(false);
    const wandering = stepWanderingNpc({
      id: 2n,
      position: home,
      home,
      facing: 'down',
      moving: false,
      wanderDirection: 'down',
      nextDecisionTick: 100,
    }, 1, collision);
    expect(wandering.position).not.toEqual(home);
    expect(wandering.moving).toBe(true);

    const campfire = {
      x: automatedFire.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: automatedFire.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    };
    let tending: WanderingNpcState = { ...wandering, position: home, wanderDirection: null };
    for (let tick = 1; tick <= 512; tick += 1) {
      tending = stepNpcTowardPoint(tending, campfire, tick, collision);
      const dx = campfire.x - tending.position.x;
      const dy = campfire.y - tending.position.y;
      if (dx * dx + dy * dy <= NPC_INTERACTION_REACH_FIXED ** 2) break;
    }
    const fireDx = campfire.x - tending.position.x;
    const fireDy = campfire.y - tending.position.y;
    expect(fireDx * fireDx + fireDy * fireDy).toBeLessThanOrEqual(NPC_INTERACTION_REACH_FIXED ** 2);
    expect(positionCollides(tending.position, collision)).toBe(false);
  }, 20_000);

  it('authors Fin\'s lake camp with a walkable three-tile dock and protected teaching water', () => {
    const fishingLandmark = islandLandmarks.find((landmark) => landmark.decorations.some((rule) => (
      rule.kind === 'point' && rule.decorationKind === 'fisher_dock'
    )))!;
    const fishingCamp = generateSurvivalLandmarkDecorations([fishingLandmark]);
    expect(fishingCamp).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'fisher_hut', tileX: 403, tileY: 315 }),
      expect.objectContaining({ kind: 'fisher_dock', tileX: 407, tileY: 317 }),
      expect.objectContaining({ kind: 'camp_campfire' }),
    ]));
    expect(fishingCamp.filter((decoration) => decoration.kind === 'fisher_fixed_line')).toHaveLength(3);
    expect(generateSurvivalResources().some((resource) => (
      survivalLandmarksReservedAt([fishingLandmark], resource.tileX, resource.tileY)
    ))).toBe(false);

    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const dockWalkableTiles = fishingLandmark.groundWalkableAreas!.flatMap((area) => (
      Array.from({ length: area.maximumTileX - area.minimumTileX + 1 }, (_, offset) => ({
        tileX: area.minimumTileX + offset,
        tileY: area.minimumTileY,
      }))
    ));
    expect(dockWalkableTiles).toHaveLength(3);
    for (const tile of dockWalkableTiles) {
      expect(survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, tile.tileX, tile.tileY))).toBe(true);
      expect(survivalLandmarksGroundWalkableAt([fishingLandmark], tile.tileX, tile.tileY)).toBe(true);
      expect(survivalFishermanDockWalkableAt(tile.tileX, tile.tileY)).toBe(true);
      expect(collision.blocked[tile.tileY * collision.width + tile.tileX]).toBe(0);
    }
    expect(survivalFishermanDockWalkableAt(410, 317)).toBe(false);

    const dock = fishingCamp.find((decoration) => decoration.kind === 'fisher_dock');
    expect(dock).toBeDefined();
    const waterCollision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], 'water');
    if (dock) {
      const waterObstacle = {
        left: dock.tileX * TILE_SIZE_FIXED,
        top: (dock.tileY - 1) * TILE_SIZE_FIXED,
        right: (dock.tileX + 3) * TILE_SIZE_FIXED - 1,
        bottom: (dock.tileY + 2) * TILE_SIZE_FIXED - 1,
      };
      expect(survivalDecorationObstacle(dock, 'ground')).toBeNull();
      expect(survivalDecorationObstacle(dock, 'water')).toEqual(waterObstacle);
      expect(waterCollision.obstacles).toContainEqual(waterObstacle);
      expect(positionCollides({
        x: (dock.tileX + 1) * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: dock.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      }, waterCollision)).toBe(true);
    }

    const hut = fishingCamp.find((decoration) => decoration.kind === 'fisher_hut');
    expect(hut).toBeDefined();
    if (hut) expect(survivalDecorationObstacle(hut, 'ground')).toEqual({
      left: (hut.tileX - 2) * TILE_SIZE_FIXED,
      top: (hut.tileY - 2) * TILE_SIZE_FIXED,
      right: (hut.tileX + 3) * TILE_SIZE_FIXED - 1,
      bottom: hut.tileY * TILE_SIZE_FIXED - 1,
    });
    const positionAtTile = (tileX: number, tileY: number) => ({
      x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET,
    });
    // The live hut is anchored at403,315. Only its two transparent leftmost
    // cells open; the remaining five-by-two facade still blocks real movement.
    expect(hut).toMatchObject({ tileX: 403, tileY: 315 });
    for (const tileY of [313, 314]) {
      expect(positionCollides(positionAtTile(400, tileY), collision)).toBe(false);
      for (let tileX = 401; tileX <= 405; tileX += 1) {
        expect(positionCollides(positionAtTile(tileX, tileY), collision)).toBe(true);
      }
    }
  }, 20_000);

  it('is byte-identical for one seed and differs for another', () => {
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED)).toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED + 1)).not.toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
  }, 20_000);

  it('surrounds the world with water and includes every biome at useful scale', () => {
    expect(SURVIVAL_WORLD_SIZE).toBeGreaterThan(SURVIVAL_ISLAND_SIZE);
    for (let index = 0; index < SURVIVAL_WORLD_SIZE; index += 1) {
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, index, 0)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, index, SURVIVAL_WORLD_SIZE - 1)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, 0, index)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_SIZE - 1, index)).toBe('water');
    }
    const counts = new Map<SurvivalBiome, number>();
    for (const biome of SURVIVAL_BIOMES) counts.set(biome, 0);
    for (const value of survivalTerrainBytes()) {
      const biome = SURVIVAL_BIOMES[value];
      if (biome) counts.set(biome, (counts.get(biome) ?? 0) + 1);
    }
    for (const [biome, count] of counts) {
      // These roles belong to bounded authored contributions, not the legacy generator.
      if (['coastal_cliff','volcanic_ash','lava','paving'].includes(biome)) expect(count).toBe(0);
      else expect(count, biome).toBeGreaterThan(biome === 'waterfall' ? 10 : 40);
    }
  });

  it('removes one-cell shoreline antennae that the shoreline tile set cannot join', () => {
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        if (!survivalIslandAt(SURVIVAL_WORLD_SEED, tileX, tileY)) continue;
        const cardinalLand = Number(survivalIslandAt(SURVIVAL_WORLD_SEED, tileX, tileY - 1))
          + Number(survivalIslandAt(SURVIVAL_WORLD_SEED, tileX + 1, tileY))
          + Number(survivalIslandAt(SURVIVAL_WORLD_SEED, tileX, tileY + 1))
          + Number(survivalIslandAt(SURVIVAL_WORLD_SEED, tileX - 1, tileY));
        expect(cardinalLand, `${tileX},${tileY}`).toBeGreaterThan(1);
      }
    }
  });

  it('generates connected freshwater, a five-row waterfall, desert cliffs, and an oasis', () => {
    const counts = new Map<SurvivalBiome, number>();
    let streamTiles = 0;
    let waterfallTiles = 0;
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
        const biome = survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        counts.set(biome, (counts.get(biome) ?? 0) + 1);
        if (survivalStreamAt(SURVIVAL_WORLD_SEED, tileX, tileY)) streamTiles += 1;
        if (survivalWaterfallAt(SURVIVAL_WORLD_SEED, tileX, tileY)) {
          waterfallTiles += 1;
          expect(biome).toBe('waterfall');
        }
      }
    }
    expect(streamTiles).toBeGreaterThan(350);
    expect(waterfallTiles).toBe(15);
    const waterfallRows: number[] = [];
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
      if (survivalWaterfallAt(SURVIVAL_WORLD_SEED, survivalMainStreamCenterAt(SURVIVAL_WORLD_SEED, tileY), tileY)) waterfallRows.push(tileY);
    }
    const waterfallEnd = Math.max(...waterfallRows);
    for (let tileY = waterfallEnd + 1; tileY <= waterfallEnd + 12; tileY += 1) {
      expect(Math.abs(
        survivalMainStreamCenterAt(SURVIVAL_WORLD_SEED, tileY)
          - survivalMainStreamCenterAt(SURVIVAL_WORLD_SEED, tileY - 1),
      )).toBeLessThanOrEqual(1);
    }
    expect(counts.get('freshwater')).toBeGreaterThan(500);
    expect(counts.get('desert_ridge')).toBeGreaterThan(100);
    expect(counts.get('coastal_cliff')).toBeUndefined();
    expect(counts.get('savanna')).toBeGreaterThan(2_000);
    expect(counts.get('oasis_water')).toBeGreaterThan(30);
    expect(counts.get('oasis')).toBeGreaterThan(100);
  });

  it('World/Map & Terrain: builds connected organic plateaus with a height-aware crossing per contour component', () => {
    const roleCounts = new Map<string, number>();
    const plateauMask = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    let plateauTiles = 0;
    let ridgeTiles = 0;
    let pinchedTiles = 0;
    let concaveCorners = 0;
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
        const plateau = survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        const plans = survivalRaisedTerrainPlansAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        const firstContour = plans.find(({ contourLevel }) => contourLevel === 1)?.plan;
        const biome = survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        for (const { plan } of plans) {
          if (plan.edgeRole !== null) roleCounts.set(plan.edgeRole, (roleCounts.get(plan.edgeRole) ?? 0) + 1);
          if (plan.rampRole !== null) roleCounts.set(plan.rampRole, (roleCounts.get(plan.rampRole) ?? 0) + 1);
          for (const face of plan.faceLayers.filter((layer) => layer.direct)) {
            roleCounts.set(face.rowId, (roleCounts.get(face.rowId) ?? 0) + 1);
          }
        }
        if (biome === 'ridge') ridgeTiles += 1;
        if (plans.some(({ plan }) => plan.rampRole !== null)) expect(biome).toBe('highland');
        else if (plans.some(({ plan }) => plan.faceLayers.some((face) => face.direct && face.rowId === 'foot'))
          && !survivalRaisedTerrainStructuralAt(SURVIVAL_WORLD_SEED, tileX, tileY)) {
          expect(biome).not.toBe('ridge');
          expect(survivalBiomeBlocksMovement(biome)).toBe(false);
          expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, tileX, tileY)).toBeNull();
        } else if (survivalRaisedTerrainStructuralAt(SURVIVAL_WORLD_SEED, tileX, tileY)) expect(biome).toBe('ridge');
        if (!plateau) continue;
        plateauMask[tileY * SURVIVAL_WORLD_SIZE + tileX] = 1;
        plateauTiles += 1;
        const north = survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX, tileY - 1);
        const east = survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX + 1, tileY);
        const south = survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX, tileY + 1);
        const west = survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX - 1, tileY);
        const diagonalGap = !survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX - 1, tileY - 1)
          || !survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX + 1, tileY - 1)
          || !survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX - 1, tileY + 1)
          || !survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX + 1, tileY + 1);
        const boundary = !north || !east || !south || !west;
        if ((!north && !south) || (!east && !west)) pinchedTiles += 1;
        if (north && east && south && west && diagonalGap) concaveCorners += 1;
        if (firstContour?.rampRole === null || firstContour === undefined) {
          expect(firstContour?.edgeRole === undefined || firstContour.edgeRole === null).toBe(!boundary);
        }
      }
    }
    expect(plateauTiles).toBeGreaterThan(2_000);
    expect(pinchedTiles).toBe(0);
    expect(concaveCorners).toBeGreaterThan(8);
    // Generated terraces descend one contour at a time, so each visible
    // course is terminal lower-wall art. Direct multi-level drops exercise
    // repeatable `wall` rows in the resolver contract tests.
    expect(roleCounts.get('wall') ?? 0).toBe(0);
    expect(roleCounts.get('lower_wall')).toBeGreaterThan(20);
    expect(roleCounts.get('foot')).toBeGreaterThan(20);
    const raisedMovementBlockingTiles = Array.from(
      { length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE },
      (_, index) => survivalRaisedTerrainBlocksMovementAt(
        SURVIVAL_WORLD_SEED,
        index % SURVIVAL_WORLD_SIZE,
        Math.floor(index / SURVIVAL_WORLD_SIZE),
      ),
    ).filter(Boolean).length;
    expect(raisedMovementBlockingTiles).toBeGreaterThan(0);
    const structuralTiles = Array.from(
      { length: SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE },
      (_, index) => survivalRaisedTerrainStructuralAt(
        SURVIVAL_WORLD_SEED,
        index % SURVIVAL_WORLD_SIZE,
        Math.floor(index / SURVIVAL_WORLD_SIZE),
      ),
    ).filter(Boolean).length;
    expect(ridgeTiles).toBe(structuralTiles);

    const visited = new Uint8Array(plateauMask.length);
    const componentShapeMetrics: Array<{ readonly fill: number; readonly rowWidths: Set<number>; readonly asymmetry: number }> = [];
    for (let start = 0; start < plateauMask.length; start += 1) {
      if (plateauMask[start] !== 1 || visited[start] === 1) continue;
      const queue = [start];
      visited[start] = 1;
      let cursor = 0;
      let count = 0;
      let minimumX = SURVIVAL_WORLD_SIZE;
      let minimumY = SURVIVAL_WORLD_SIZE;
      let maximumX = 0;
      let maximumY = 0;
      while (cursor < queue.length) {
        const index = queue[cursor++]!;
        const tileX = index % SURVIVAL_WORLD_SIZE;
        const tileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
        count += 1;
        minimumX = Math.min(minimumX, tileX);
        minimumY = Math.min(minimumY, tileY);
        maximumX = Math.max(maximumX, tileX);
        maximumY = Math.max(maximumY, tileY);
        for (const neighbor of [index - 1, index + 1, index - SURVIVAL_WORLD_SIZE, index + SURVIVAL_WORLD_SIZE]) {
          if (neighbor < 0 || neighbor >= plateauMask.length || visited[neighbor] === 1 || plateauMask[neighbor] !== 1) continue;
          const neighborX = neighbor % SURVIVAL_WORLD_SIZE;
          if (Math.abs(neighborX - tileX) > 1) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
      const rowWidths = new Set<number>();
      let mirrorDifferences = 0;
      for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
        let rowWidth = 0;
        for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
          const occupied = plateauMask[tileY * SURVIVAL_WORLD_SIZE + tileX] === 1;
          if (occupied) rowWidth += 1;
          const mirrorX = maximumX - (tileX - minimumX);
          if (occupied !== (plateauMask[tileY * SURVIVAL_WORLD_SIZE + mirrorX] === 1)) mirrorDifferences += 1;
        }
        if (rowWidth > 0) rowWidths.add(rowWidth);
      }
      const area = (maximumX - minimumX + 1) * (maximumY - minimumY + 1);
      componentShapeMetrics.push({ fill: count / area, rowWidths, asymmetry: mirrorDifferences / area });
    }
    expect(componentShapeMetrics).toHaveLength(4);
    for (const shape of componentShapeMetrics) {
      expect(shape.fill).toBeGreaterThan(0.45);
      expect(shape.fill).toBeLessThan(0.82);
      expect(shape.rowWidths.size).toBeGreaterThan(6);
      expect(shape.asymmetry).toBeGreaterThan(0.04);
    }

    const elevations = survivalElevationBytes(SURVIVAL_WORLD_SEED);
    const elevationCounts = Array.from({ length: SURVIVAL_MAX_TERRAIN_ELEVATION + 1 }, (_, level) => (
      elevations.filter((elevation) => elevation === level).length
    ));
    for (let level = 1; level <= SURVIVAL_MAX_TERRAIN_ELEVATION; level += 1) {
      for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
        for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
          const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
          if ((elevations[index] ?? 0) < level) continue;
          const belongsToTwoByTwo = [-1, 0].some((offsetY) => [-1, 0].some((offsetX) => (
            [0, 1].every((dy) => [0, 1].every((dx) => {
              const x = tileX + offsetX + dx;
              const y = tileY + offsetY + dy;
              return x >= 0 && y >= 0 && x < SURVIVAL_WORLD_SIZE && y < SURVIVAL_WORLD_SIZE
                && (elevations[y * SURVIVAL_WORLD_SIZE + x] ?? 0) >= level;
            }))
          )));
          expect(belongsToTwoByTwo, `L${level} at ${tileX},${tileY}`).toBe(true);
        }
      }
    }
    // The height-aware stair and its datum approach honestly replace six L1
    // and six L2 cells; no unrelated terrain is promoted to hide that delta.
    expect(elevationCounts).toEqual([689_357, 1_770, 906, 191]);
    const ramps = survivalPlateauRamps(SURVIVAL_WORLD_SEED);
    expect(ramps.map(({ contourLevel }) => contourLevel)).toEqual([
      1, 1, 1,
      2, 2, 2,
      3, 3,
    ]);
    const stairRuns = survivalStairRuns(SURVIVAL_WORLD_SEED);
    expect(stairRuns).toHaveLength(1);
    expect(stairRuns[0]).toMatchObject({
      direction: 'up',
      fromLevel: 0,
      toLevel: SURVIVAL_MAX_TERRAIN_ELEVATION,
    });
    const transitions = survivalTerrainTransitions(SURVIVAL_WORLD_SEED);
    expect(transitions).toHaveLength(22);
    expect(transitions.filter(({ kind }) => kind === 'stairs')).toHaveLength(6);
    for (const ramp of ramps) {
      for (let lane = 0; lane < 2; lane += 1) {
        expect(survivalTerrainHeightAt(
          SURVIVAL_WORLD_SEED, ramp.tileX + lane, ramp.tileY - 1,
        )).toBe(ramp.contourLevel);
        expect(survivalTerrainHeightAt(
          SURVIVAL_WORLD_SEED, ramp.tileX + lane, ramp.tileY,
        )).toBe(ramp.contourLevel - 1);
        expect(generatedSurvivalResourceAt(
          SURVIVAL_WORLD_SEED, ramp.tileX + lane, ramp.tileY,
        )).toBeNull();
      }
    }
    const stair = stairRuns[0]!;
    for (let course = 0; course <= stair.toLevel - stair.fromLevel; course += 1) {
      for (let lane = 0; lane < 2; lane += 1) {
        expect(survivalTerrainHeightAt(
          SURVIVAL_WORLD_SEED, stair.x + lane, stair.y - course,
        )).toBe(stair.fromLevel + course);
        expect(generatedSurvivalResourceAt(
          SURVIVAL_WORLD_SEED, stair.x + lane, stair.y - course,
        )).toBeNull();
      }
    }
    const crossingCount = transitions.length / 2;
    for (const role of ['ramp_top_left', 'ramp_top_right', 'ramp_bottom_left', 'ramp_bottom_right']) {
      expect(roleCounts.get(role) ?? 0, role).toBe(crossingCount);
    }
  }, 30_000);

  it('World/Map & Terrain: reaches every live-seed contour component from the spawn ground plane', () => {
    const elevations = survivalElevationBytes(SURVIVAL_WORLD_SEED);
    const biomes = survivalTerrainBytes(SURVIVAL_WORLD_SEED);
    const transitions = survivalTerrainTransitions(SURVIVAL_WORLD_SEED);
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const spawn = survivalSpawnTiles()[0]!;
    const visited = new Uint8Array(elevations.length);
    const queue = [spawn.tileY * SURVIVAL_WORLD_SIZE + spawn.tileX];
    visited[queue[0]!] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const tileX = index % SURVIVAL_WORLD_SIZE;
      const tileY = Math.floor(index / SURVIVAL_WORLD_SIZE);
      for (const [nextX, nextY] of [
        [tileX, tileY - 1], [tileX + 1, tileY],
        [tileX, tileY + 1], [tileX - 1, tileY],
      ] as const) {
        if (nextX < 0 || nextY < 0 || nextX >= SURVIVAL_WORLD_SIZE || nextY >= SURVIVAL_WORLD_SIZE) continue;
        const next = nextY * SURVIVAL_WORLD_SIZE + nextX;
        const activeElevation = elevations[index] ?? 0;
        if (visited[next] === 1
          || survivalBiomeBlocksMovement(SURVIVAL_BIOMES[biomes[next]!] ?? 'water')
          || collisionTileIsBlockedAtPlane(collision, nextX, nextY, activeElevation)
          || !terrainWalkingStepAllowed(
            elevations,
            SURVIVAL_WORLD_SIZE,
            SURVIVAL_WORLD_SIZE,
            transitions,
            tileX,
            tileY,
            nextX,
            nextY,
          )) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    for (let contourLevel = 1; contourLevel <= SURVIVAL_MAX_TERRAIN_ELEVATION; contourLevel += 1) {
      const classified = new Uint8Array(elevations.length);
      for (let start = 0; start < elevations.length; start += 1) {
        if (classified[start] === 1 || elevations[start]! < contourLevel) continue;
        const component = [start];
        classified[start] = 1;
        let reachable = visited[start] === 1;
        for (let cursor = 0; cursor < component.length; cursor += 1) {
          const index = component[cursor]!;
          const tileX = index % SURVIVAL_WORLD_SIZE;
          for (const neighbor of [
            index - 1, index + 1,
            index - SURVIVAL_WORLD_SIZE, index + SURVIVAL_WORLD_SIZE,
          ]) {
            if (neighbor < 0 || neighbor >= elevations.length || classified[neighbor] === 1
              || elevations[neighbor]! < contourLevel
              || Math.abs(neighbor % SURVIVAL_WORLD_SIZE - tileX) > 1) continue;
            classified[neighbor] = 1;
            reachable ||= visited[neighbor] === 1;
            component.push(neighbor);
          }
        }
        expect(reachable, `unreachable L${contourLevel} component containing tile ${start}`).toBe(true);
      }
    }
  }, 30_000);

  it('World/Map & Terrain: climbs one slope and a three-level stair while unconnected contours stay solid', () => {
    const ramp = survivalPlateauRamps(SURVIVAL_WORLD_SEED)
      .find(({ contourLevel }) => contourLevel === SURVIVAL_MAX_TERRAIN_ELEVATION);
    expect(ramp).toBeDefined();
    if (ramp === undefined) return;
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const start = {
      position: {
        x: ramp.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: ramp.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      },
      facing: 'up' as const,
      moving: false,
      location: 'estate' as const,
    };
    let climbed: PlayerState = start;
    let climbSteps = 0;
    for (let step = 0; step < 24; step += 1) {
      const next = movePlayer(climbed, 'up', collision);
      if (next.position.y !== climbed.position.y) climbSteps += 1;
      climbed = next;
    }
    const climbedTileX = Math.floor(climbed.position.x / TILE_SIZE_FIXED);
    const climbedTileY = Math.floor(
      (climbed.position.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED,
    );
    expect(survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, climbedTileX, climbedTileY))
      .toBe(ramp.contourLevel);
    let descended: PlayerState = climbed;
    for (let step = 0; step < climbSteps; step += 1) descended = movePlayer(descended, 'down', collision);
    expect(descended.position).toEqual(start.position);

    const stair = survivalStairRuns(SURVIVAL_WORLD_SEED)[0];
    expect(stair).toBeDefined();
    if (stair === undefined) return;
    const stairStart: PlayerState = {
      ...start,
      position: {
        x: stair.x * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: stair.y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      },
    };
    let stairClimbed = stairStart;
    let stairSteps = 0;
    for (let step = 0; step < 64; step += 1) {
      const next = movePlayer(stairClimbed, 'up', collision);
      if (next.position.y !== stairClimbed.position.y) stairSteps += 1;
      stairClimbed = next;
    }
    const stairClimbedTileY = Math.floor(
      (stairClimbed.position.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED,
    );
    expect(survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, stair.x, stairClimbedTileY))
      .toBe(SURVIVAL_MAX_TERRAIN_ELEVATION);
    let stairDescended = stairClimbed;
    for (let step = 0; step < stairSteps; step += 1) {
      stairDescended = movePlayer(stairDescended, 'down', collision);
    }
    expect(stairDescended.position).toEqual(stairStart.position);

    const transitions = survivalTerrainTransitions(SURVIVAL_WORLD_SEED);
    let solidEdge: { readonly tileX: number; readonly lowerTileY: number } | null = null;
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 1 && solidEdge === null; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        if (survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, tileX, tileY) !== ramp.contourLevel
          || survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, tileX, tileY + 1) !== ramp.contourLevel - 1
          || transitions.some((transition) => transition.contourLevel === ramp.contourLevel
            && transition.lowerTileX === tileX && transition.lowerTileY === tileY + 1)) continue;
        solidEdge = { tileX, lowerTileY: tileY + 1 };
        break;
      }
    }
    expect(solidEdge).not.toBeNull();
    if (solidEdge === null) return;
    const solidStart = {
      ...start,
      position: {
        x: solidEdge.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: solidEdge.lowerTileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      },
    };
    let blocked: PlayerState = solidStart;
    for (let step = 0; step < 24; step += 1) blocked = movePlayer(blocked, 'up', collision);
    expect(solidStart.position.y - blocked.position.y).toBeLessThan(24 * FIXED_UNITS_PER_PIXEL);
  });

  it('World/Map & Terrain: projects one lower-plane wall blocker, leaves trim open, and guards the upper cap', () => {
    const transitions = survivalTerrainTransitions(SURVIVAL_WORLD_SEED);
    let southFace: { readonly tileX: number; readonly tileY: number; readonly contourLevel: number } | null = null;
    for (let tileY = 1; tileY < SURVIVAL_WORLD_SIZE - 4 && southFace === null; tileY += 1) {
      for (let tileX = 1; tileX < SURVIVAL_WORLD_SIZE - 1; tileX += 1) {
        const contourLevel = survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        if (contourLevel < 1
          || survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, tileX, tileY + 1) !== contourLevel - 1
          || transitions.some((transition) => transition.upperTileX === tileX
            && transition.upperTileY === tileY)) continue;
        southFace = { tileX, tileY, contourLevel };
        break;
      }
    }
    expect(southFace).not.toBeNull();
    if (southFace === null) return;
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const lowerPlane = southFace.contourLevel - 1;
    expect(collisionTileIsBlockedAtPlane(
      collision, southFace.tileX, southFace.tileY - 1, lowerPlane,
    )).toBe(false);
    expect(collisionTileIsBlockedAtPlane(
      collision, southFace.tileX, southFace.tileY, lowerPlane,
    )).toBe(true);
    expect(collisionTileIsBlockedAtPlane(
      collision, southFace.tileX, southFace.tileY + 1, lowerPlane,
    )).toBe(false);
    expect(collisionTileIsBlockedAtPlane(
      collision, southFace.tileX, southFace.tileY, southFace.contourLevel,
    )).toBe(true);
    for (let tileY = southFace.tileY - 1; tileY <= southFace.tileY + 2; tileY += 1) {
      expect(collision.blocked[tileY * collision.width + southFace.tileX]).toBe(0);
    }
    const start = {
      position: {
        x: southFace.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: (southFace.tileY + 4) * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      },
      facing: 'up' as const,
      moving: false,
      location: 'estate' as const,
    };
    let behind: PlayerState = start;
    for (let step = 0; step < 64; step += 1) behind = movePlayer(behind, 'up', collision);
    const sampledTileY = Math.floor(
      (behind.position.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED,
    );
    expect(sampledTileY).toBeGreaterThanOrEqual(southFace.tileY + 1);
    expect(start.position.y - behind.position.y).toBeLessThan(4 * TILE_SIZE_FIXED);
    expect(survivalTerrainHeightAt(SURVIVAL_WORLD_SEED, southFace.tileX, sampledTileY))
      .toBe(southFace.contourLevel - 1);
  });

  it('adds smaller organic lowered dirt terraces with walkable inset rims and no generated ramps', () => {
    const mask = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    let terraceTiles = 0;
    let edges = 0;
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
        if (!survivalDirtTerraceAt(SURVIVAL_WORLD_SEED, tileX, tileY)) continue;
        expect(survivalPlateauAt(SURVIVAL_WORLD_SEED, tileX, tileY)).toBe(false);
        mask[tileY * SURVIVAL_WORLD_SIZE + tileX] = 1;
        terraceTiles += 1;
        if (survivalDirtCliffRoleAt(SURVIVAL_WORLD_SEED, tileX, tileY) === 'edge') {
          edges += 1;
          expect(survivalBiomeBlocksMovement(
            survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY),
          )).toBe(false);
          expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, tileX, tileY)).toBeNull();
        }
      }
    }
    expect(terraceTiles).toBeGreaterThan(700);
    expect(edges).toBeGreaterThan(150);

    const visited = new Uint8Array(mask.length);
    let components = 0;
    for (let start = 0; start < mask.length; start += 1) {
      if (mask[start] !== 1 || visited[start] === 1) continue;
      components += 1;
      const queue = [start];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]!;
        const tileX = index % SURVIVAL_WORLD_SIZE;
        for (const neighbor of [index - 1, index + 1, index - SURVIVAL_WORLD_SIZE, index + SURVIVAL_WORLD_SIZE]) {
          if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] === 1 || mask[neighbor] !== 1) continue;
          if (Math.abs(neighbor % SURVIVAL_WORLD_SIZE - tileX) > 1) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    expect(components).toBe(6);

    expect(survivalDirtTerraceRamps(SURVIVAL_WORLD_SEED)).toEqual([]);
  });

  it('places legacy spawns naturally and finds a 26th without a slot ceiling', () => {
    const spawns = survivalSpawnTiles();
    expect(spawns).toHaveLength(25);
    expect(new Set(spawns.map((spawn) => `${spawn.tileX},${spawn.tileY}`)).size).toBe(25);
    for (const spawn of spawns) {
      expect(survivalSpawnPosition(spawn.slot)).not.toBeNull();
      expect(survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, spawn.tileX, spawn.tileY))).toBe(false);
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        if (dx * dx + dy * dy > 4) continue;
        expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, spawn.tileX + dx, spawn.tileY + dy)).toBeNull();
      }
    }
    const occupied = new Set(spawns.map((spawn) => `${spawn.tileX},${spawn.tileY}`));
    const twentySixth = findSurvivalSpawnTile(occupied);
    expect(twentySixth).not.toBeNull();
    expect(survivalSpawnPosition(25)).toEqual(twentySixth === null ? null : {
      x: twentySixth.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: twentySixth.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    });
    expect(occupied.has(`${twentySixth?.tileX},${twentySixth?.tileY}`)).toBe(false);
    expect(twentySixth === null ? true : survivalBiomeBlocksMovement(
      survivalBiomeAt(SURVIVAL_WORLD_SEED, twentySixth.tileX, twentySixth.tileY),
    )).toBe(false);
  });

  it('adds narrow live trunk obstacles and removes depleted trunks', () => {
    const resource = generateSurvivalResources().find((candidate) => isChoppableTreeKind(candidate.kind));
    expect(resource).toBeDefined();
    if (!resource) return;
    const index = resource.tileY * SURVIVAL_WORLD_SIZE + resource.tileX;
    const live = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: false }]);
    const depleted = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: true }]);
    expect(live.blocked[index]).toBe(
      survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, resource.tileX, resource.tileY)),
    );
    expect(live.obstacles).toContainEqual(survivalTreeObstacle(resource.tileX, resource.tileY));
    expect(live.obstacles).toHaveLength((depleted.obstacles?.length ?? 0) + 1);
    expect(survivalTreeObstacle(2, 3)).toEqual({
      left: 2 * TILE_SIZE_FIXED + 4 * FIXED_UNITS_PER_PIXEL,
      right: 2 * TILE_SIZE_FIXED + 12 * FIXED_UNITS_PER_PIXEL - 1,
      top: 4 * TILE_SIZE_FIXED - 10 * FIXED_UNITS_PER_PIXEL,
      bottom: 4 * TILE_SIZE_FIXED - 4 * FIXED_UNITS_PER_PIXEL - 1,
    });
    expect(depleted.obstacles?.length).toBeGreaterThan(0);
    expect(depleted.blocked[index]).toBe(
      survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, resource.tileX, resource.tileY)),
    );
    expect(survivalBiomeBlocksMovement('water')).toBe(true);
    expect(survivalBiomeBlocksMovement('freshwater')).toBe(true);
    expect(survivalBiomeBlocksMovement('waterfall')).toBe(true);
    expect(survivalBiomeBlocksMovement('ridge')).toBe(true);
    expect(survivalBiomeBlocksMovement('desert_ridge')).toBe(true);
    expect(survivalBiomeBlocksMovement('oasis_water')).toBe(true);
    expect(survivalBiomeBlocksMovement('coastal_cliff')).toBe(true);
    expect(survivalBiomeBlocksMovement('dirt_ridge')).toBe(false);
    expect(survivalBiomeBlocksMovement('forest')).toBe(false);
    expect(survivalBiomeAllowsHorseJump('freshwater')).toBe(true);
    expect(survivalBiomeAllowsHorseJump('oasis_water')).toBe(true);
    expect(survivalBiomeAllowsHorseJump('water')).toBe(false);
    expect(survivalBiomeAllowsHorseJump('waterfall')).toBe(false);
    expect(survivalBiomeAllowsHorseJump('ridge')).toBe(false);
    expect(survivalBiomeAllowsHorseJump('desert_ridge')).toBe(false);
    expect(survivalBiomeAllowsHorseJump('coastal_cliff')).toBe(false);
  });

  it('uses inverse terrain rules for water actors and blocks authored water rocks', () => {
    expect(survivalBiomeBlocksTraversal('water', 'water')).toBe(false);
    expect(survivalBiomeBlocksTraversal('freshwater', 'water')).toBe(false);
    expect(survivalBiomeBlocksTraversal('oasis_water', 'water')).toBe(false);
    expect(survivalBiomeBlocksTraversal('waterfall', 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('beach', 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('desert_shore', 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('plains', 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('ridge', 'water')).toBe(true);
    expect(survivalBiomeBlocksTraversal('ridge', 'air')).toBe(false);

    const waterRock = generateSurvivalDecorations().find((decoration) => decoration.kind === 'nature_water_rock');
    expect(waterRock).toBeDefined();
    if (!waterRock) return;
    const waterCollision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], 'water');
    const rockObstacle = survivalDecorationObstacle(waterRock, 'water');
    expect(rockObstacle).not.toBeNull();
    expect(waterCollision.blocked[waterRock.tileY * waterCollision.width + waterRock.tileX]).toBe(0);
    expect(waterCollision.obstacles).toContainEqual(rockObstacle);
  });

  it('creates dense mixed-species forests whose trees are all choppable', () => {
    const resources = generateSurvivalResources().filter((resource) => isChoppableTreeKind(resource.kind));
    const kinds = new Map<string, number>(SURVIVAL_TREE_KINDS.map((kind) => [kind, 0]));
    let forestTiles = 0;
    let forestTrees = 0;
    const resourceTiles = new Set(resources.map((resource) => `${resource.tileX},${resource.tileY}`));
    for (const resource of resources) {
      kinds.set(resource.kind, (kinds.get(resource.kind) ?? 0) + 1);
      expect(isChoppableTreeKind(resource.kind)).toBe(true);
      expect(resource.kind).toBe(survivalTreeKindAt(SURVIVAL_WORLD_SEED, resource.tileX, resource.tileY));
    }
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE; tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE; tileX += 1) {
        if (survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY) !== 'forest') continue;
        forestTiles += 1;
        if (resourceTiles.has(`${tileX},${tileY}`)) forestTrees += 1;
      }
    }
    expect(forestTrees / forestTiles).toBeGreaterThan(0.38);
    expect(forestTrees / forestTiles).toBeLessThan(0.68);
    for (const [kind, count] of kinds) {
      const fruitTree = (SURVIVAL_FRUIT_TREE_KINDS as readonly string[]).includes(kind);
      const minimum = kind === 'tree_palm' ? 10 : kind === 'tree_acacia' ? 50 : fruitTree ? 0 : 100;
      expect(count, kind).toBeGreaterThan(minimum);
    }
  });

  it('activates a spaced subset of many deterministic biome-generated ore sites', () => {
    const ores = generateSurvivalResources().filter((resource) => isMineableOreKind(resource.kind));
    const sites = generateSurfaceOreSpawnSites();
    expect(sites.length).toBeGreaterThan(SURFACE_ACTIVE_ORE_NODES * 4);
    expect(ores).toHaveLength(SURFACE_ACTIVE_ORE_NODES);
    expect(new Set(sites.map((site) => site.id)).size).toBe(sites.length);
    for (const [index, ore] of ores.entries()) {
      expect(survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, ore.tileX, ore.tileY))).toBe(false);
      expect(survivalResourceInitialHealth(ore.kind)).toBe(ORE_NODE_RESERVE_HITS);
      expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, ore.tileX, ore.tileY)).toEqual(ore);
      expect(['mixed', 'pristine']).toContain(ore.nodeClass);
      expect(ore.richness).toBeGreaterThanOrEqual(1);
      expect(ore.richness).toBeLessThanOrEqual(2);
      for (const other of ores.slice(index + 1)) {
        const dx = ore.tileX - other.tileX;
        const dy = ore.tileY - other.tileY;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(ORE_MIN_SPACING_TILES ** 2);
      }
    }
  });

  it('keeps three permanent route landmarks around each initial active ore', () => {
    const resources = generateSurvivalResources();
    const resourceTiles = new Set(resources.map((resource) => `${resource.tileX},${resource.tileY}`));
    const decorations = generateSurvivalDecorations();
    const poiDecorations = decorations.filter((decoration) => decoration.kind.startsWith('poi_'));
    expect(poiDecorations).toHaveLength(SURFACE_ACTIVE_ORE_NODES * 3);
    expect(new Set(decorations.map((decor) => `${decor.tileX},${decor.tileY}`)).size).toBe(decorations.length);
    for (const decoration of poiDecorations) {
      expect(resourceTiles.has(`${decoration.tileX},${decoration.tileY}`)).toBe(
        survivalDecorationResource(decoration, registry) !== null,
      );
      expect(survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, decoration.tileX, decoration.tileY))).toBe(false);
    }
  });

  it('fills land and ponds with deterministic habitat-aware nature', () => {
    const first = generateSurvivalDecorations();
    expect(generateSurvivalDecorations()).toBe(first);
    const count = (kind: string): number => first.filter((decoration) => decoration.kind === kind).length;
    expect(count('nature_grass')).toBeGreaterThan(3_000);
    expect(count('nature_flower')).toBeGreaterThan(300);
    expect(count('nature_flower_grass')).toBeGreaterThan(400);
    expect(count('nature_mushroom')).toBeGreaterThan(300);
    expect(count('nature_lily_pad')).toBeGreaterThanOrEqual(10);
    expect(count('nature_cattail')).toBeGreaterThan(0);
    expect(count('nature_water_flower')).toBeGreaterThan(0);
    expect(count('nature_water_grass')).toBeGreaterThan(0);
    expect(count('nature_water_rock')).toBeGreaterThan(0);
    expect(count('nature_fish_shadow')).toBe(0);
    expect(count('nature_desert_grass')).toBeGreaterThan(0);
    expect(count('nature_desert_fern')).toBeGreaterThan(0);
    expect(count('nature_desert_bush')).toBeGreaterThan(0);
    expect(count('nature_desert_plant')).toBeGreaterThan(0);
    expect(count('nature_desert_rock')).toBeGreaterThan(0);
    expect(first.filter((decoration) => decoration.kind.startsWith('nature_water_')).length)
      .toBeLessThan(50);

    const pondKinds = new Set([
      'nature_lily_pad', 'nature_water_flower', 'nature_cattail', 'nature_water_grass',
      'nature_water_rock', 'nature_fish_shadow',
    ]);
    for (const decoration of first) {
      expect(decoration.tileX).toBeGreaterThanOrEqual(SURVIVAL_ISLAND_OFFSET_TILES);
      expect(decoration.tileX).toBeLessThan(SURVIVAL_ISLAND_OFFSET_TILES + SURVIVAL_ISLAND_SIZE);
      expect(decoration.tileY).toBeGreaterThanOrEqual(SURVIVAL_ISLAND_OFFSET_TILES);
      expect(decoration.tileY).toBeLessThan(SURVIVAL_ISLAND_OFFSET_TILES + SURVIVAL_ISLAND_SIZE);
      if (pondKinds.has(decoration.kind)) {
        expect(['freshwater', 'oasis_water']).toContain(survivalBiomeAt(
          SURVIVAL_WORLD_SEED, decoration.tileX, decoration.tileY,
        ));
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            expect(['freshwater', 'oasis_water']).toContain(survivalBiomeAt(
              SURVIVAL_WORLD_SEED,
              decoration.tileX + offsetX,
              decoration.tileY + offsetY,
            ));
          }
        }
      }
    }
  });

  it('scatters choppable fruit trees and places mushrooms beside tree bases', () => {
    const resources = generateSurvivalResources();
    const fruitTrees = resources.filter((resource) => (
      (SURVIVAL_FRUIT_TREE_KINDS as readonly string[]).includes(resource.kind)
    ));
    expect(fruitTrees.length).toBeGreaterThan(10);
    expect(fruitTrees.length).toBeLessThan(40);
    for (const tree of fruitTrees) {
      const besideRiver = Array.from({ length: 25 }, (_, index) => [
        index % 5 - 2, Math.floor(index / 5) - 2,
      ] as const).some(([offsetX, offsetY]) => survivalStreamAt(
        SURVIVAL_WORLD_SEED, tree.tileX + offsetX, tree.tileY + offsetY,
      ));
      expect(besideRiver, `${tree.kind}@${tree.tileX},${tree.tileY}`).toBe(true);
    }
    const treeTiles = new Set(resources.filter((resource) => isChoppableTreeKind(resource.kind))
      .map((resource) => `${resource.tileX},${resource.tileY}`));
    for (const mushroom of generateSurvivalDecorations().filter((decoration) => decoration.kind === 'nature_mushroom')) {
      const besideTree = [-1, 0, 1].some((offsetX) => [-1, 0, 1].some((offsetY) =>
        (offsetX !== 0 || offsetY !== 0) && treeTiles.has(`${mushroom.tileX - offsetX},${mushroom.tileY - offsetY}`)));
      expect(besideTree, `${mushroom.tileX},${mushroom.tileY}`).toBe(true);
    }
  });

  it('makes loose stones and fallen branches direct one-item gatherables', () => {
    const looseStones = generateSurvivalResources().filter((resource) => resource.kind === 'loose_stone');
    const branches = generateSurvivalResources().filter((resource) => resource.kind === 'fallen_branch');
    expect(looseStones.length).toBeGreaterThan(75);
    expect(looseStones.length).toBeLessThan(175);
    expect(branches.length).toBeGreaterThan(0);
    expect(looseStones.every((resource) => isGatherableResourceKind(resource.kind))).toBe(true);
  });

  it('gives large decorative rocks a bounded six-payout richness reserve', () => {
    const rocks = generateSurvivalResources().filter((resource) => isBreakableRockKind(resource.kind));
    expect(rocks.length).toBeGreaterThan(0);
    expect(survivalResourceInitialHealth('rock_large')).toBe(LARGE_ROCK_INITIAL_HEALTH);
    expect(LARGE_ROCK_STONE_RESERVE).toBe(LARGE_ROCK_INITIAL_HEALTH);
  });

  it('keeps ore and tree obstacle shapes distinct while authored loot owns payouts', () => {
    expect(survivalOreObstacle(10, 10)).not.toEqual(survivalTreeObstacle(10, 10));
  });

  it('places regrowing cacti only on desert ground', () => {
    const cacti = generateSurvivalResources().filter((resource) => resource.kind === 'cactus');
    expect(cacti.length).toBeGreaterThan(20);
    expect(cacti.every((cactus) => isRegrowingPlantKind(cactus.kind))).toBe(true);
    expect(cacti.every((cactus) => ['desert', 'desert_shore'].includes(survivalBiomeAt(
      SURVIVAL_WORLD_SEED, cactus.tileX, cactus.tileY,
    )))).toBe(true);
  });
});
