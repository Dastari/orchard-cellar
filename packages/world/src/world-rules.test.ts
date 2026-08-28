import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_TREE_KINDS,
  SURVIVAL_ORE_KINDS,
  FIXED_UNITS_PER_PIXEL,
  PLAYER_HITBOX_FOOT_OFFSET,
  PLAYER_HITBOX_TOP,
  DEBUG_SPACE_ID,
  TILE_SIZE_FIXED,
  generateSurvivalResources,
  survivalBiomeAt,
  survivalResourceObstacle,
  survivalTerrainTransitions,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE_FIXED,
  canUseFarmTile,
  canTendTree,
  chunkAt,
  cropStage,
  CROP_GROWTH_TICKS,
  createAuthoritySurvivalCollisionMap,
  createAuthoritySpaceCollisionMap,
  createMmoFarmCollisionMap,
  decodeDirection,
  farmParcelLayout,
  farmToolUseResult,
  farmSoilRestoreResult,
  tilePlacementResult,
  isFarmBedTile,
  isTillableSurvivalTile,
  itemDropPosition,
  itemWithinPickupReach,
  inputIsStale,
  movementCreditAvailable,
  queueMovementAcknowledgement,
  drainMovementAcknowledgement,
  drainMovementRunQueue,
  nextActionStartedTick,
  presenceLeaseExpired,
  portalUseResult,
  resourceHarvestResult,
  resourceGatherResult,
  settleMovementRun,
  toolSpendResult,
} from './world-rules.js';

describe('overworld authority rules', () => {
  it('26§13 accepts nearby portal use and rejects range, space, and mounted paths', () => {
    const portal = { fromSpace: 0, fromTileX: 10, fromTileY: 12 };
    const nearby = {
      spaceId: 0,
      x: 11 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: 12 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    };
    expect(portalUseResult(nearby, portal, false)).toBe('ok');
    expect(portalUseResult({ ...nearby, x: 13 * TILE_SIZE_FIXED }, portal, false)).toBe('portal_out_of_range');
    expect(portalUseResult({ ...nearby, spaceId: 1 }, portal, false)).toBe('portal_out_of_range');
    expect(portalUseResult(nearby, portal, true)).toBe('no_horses_underground');
    expect(portalUseResult(nearby, portal, true, true)).toBe('ok');
  });
  it('25§15 commits exact tool costs and leaves rejected spends unchanged', () => {
    expect(toolSpendResult(10_000, 0n, 100n, 1_500, 8, false)).toEqual({
      ok: true, costCenti: 1_500, vigourCenti: 8_500, lastSwingTick: 100n,
    });
    expect(toolSpendResult(10_000, 0n, 100n, 1_501, 8, true)).toEqual({
      ok: true, costCenti: 751, vigourCenti: 9_249, lastSwingTick: 100n,
    });
    expect(toolSpendResult(8_500, 100n, 107n, 1_500, 8, false)).toEqual({
      ok: false, code: 'swing_too_soon',
    });
    expect(toolSpendResult(1_499, 100n, 108n, 1_500, 8, false)).toEqual({
      ok: false, code: 'insufficient_vigour',
    });
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

  it('stops stale input after two seconds while leaving presence alive', () => {
    expect(inputIsStale(1_000_000n, 3_000_000n)).toBe(false);
    expect(inputIsStale(1_000_000n, 3_000_001n)).toBe(true);
    expect(presenceLeaseExpired(1_000_000n, 3_000_001n)).toBe(false);
  });

  it('settles taps between authority ticks and caps conflicting backlog', () => {
    expect(settleMovementRun('right', false, 10n, 12n, 'idle', 0)).toEqual({
      pendingDirection: 'right', pendingSteps: 2, rejectedSteps: 0n,
    });
    expect(settleMovementRun('idle', false, 10n, 12n, 'idle', 0)).toEqual({
      pendingDirection: 'idle', pendingSteps: 0, rejectedSteps: 0n,
    });
    expect(settleMovementRun('left', false, 0n, 40n, 'right', 4)).toEqual({
      pendingDirection: 'right:4|left:20', pendingSteps: 24, rejectedSteps: 20n,
    });
    expect(settleMovementRun('right', false, 0n, 40n, 'right', 4)).toEqual({
      pendingDirection: 'right', pendingSteps: 24, rejectedSteps: 20n,
    });
  });

  it('drains compressed direction transitions in original run order', () => {
    expect(drainMovementRunQueue('right:4|up:6', 10, 6)).toEqual({
      intents: [
        { direction: 'right', sprinting: false },
        { direction: 'right', sprinting: false },
        { direction: 'right', sprinting: false },
        { direction: 'right', sprinting: false },
        { direction: 'up', sprinting: false },
        { direction: 'up', sprinting: false },
      ],
      pendingDirection: 'up',
      pendingSteps: 4,
    });
    expect(drainMovementRunQueue('up', 4, 6)).toEqual({
      intents: [
        { direction: 'up', sprinting: false },
        { direction: 'up', sprinting: false },
        { direction: 'up', sprinting: false },
        { direction: 'up', sprinting: false },
      ],
      pendingDirection: 'idle',
      pendingSteps: 0,
    });
  });

  it('preserves sprint state across compressed movement transitions', () => {
    expect(settleMovementRun('right', true, 10n, 13n, 'idle', 0)).toEqual({
      pendingDirection: 'right!:3', pendingSteps: 3, rejectedSteps: 0n,
    });
    expect(settleMovementRun('right', false, 13n, 16n, 'right!:3', 3)).toEqual({
      pendingDirection: 'right!:3|right:3', pendingSteps: 6, rejectedSteps: 0n,
    });
    expect(drainMovementRunQueue('right!:2|up:1', 3, 3).intents).toEqual([
      { direction: 'right', sprinting: true },
      { direction: 'right', sprinting: true },
      { direction: 'up', sprinting: false },
    ]);
  });

  it('does not acknowledge a transition until its entire catch-up queue drains', () => {
    expect(queueMovementAcknowledgement(4n, 5n, 7)).toEqual({
      settledSequence: 4n, pendingSequence: 5n,
    });
    expect(drainMovementAcknowledgement(4n, 5n, 1)).toEqual({
      settledSequence: 4n, pendingSequence: 5n,
    });
    expect(drainMovementAcknowledgement(4n, 5n, 0)).toEqual({
      settledSequence: 5n, pendingSequence: 0n,
    });
    expect(queueMovementAcknowledgement(5n, 6n, 0)).toEqual({
      settledSequence: 6n, pendingSequence: 0n,
    });
  });

  it('clamps movement credit to elapsed server time plus the burst allowance', () => {
    expect(movementCreditAvailable(1_000_000n, 0n, 1_000_000n)).toBe(6);
    expect(movementCreditAvailable(1_000_000n, 6n, 1_050_000n)).toBe(3);
    expect(movementCreditAvailable(1_000_000n, 9n, 1_050_000n)).toBe(0);
  });

  it('re-triggers repeated one-shots even inside one authority tick', () => {
    expect(nextActionStartedTick(10n, 12n)).toBe(12n);
    expect(nextActionStartedTick(12n, 12n)).toBe(13n);
  });

  it('lays out 25 non-overlapping farms and validates only authored bed tiles', () => {
    const parcels = Array.from({ length: 25 }, (_, slot) => farmParcelLayout(slot));
    expect(parcels.every((parcel) => parcel !== null)).toBe(true);
    expect(farmParcelLayout(25)).toBeNull();
    const first = parcels[0];
    const second = parcels[1];
    if (first === undefined || first === null || second === undefined || second === null) {
      throw new Error('missing fixture parcel');
    }
    expect(second.originX).toBeGreaterThanOrEqual(first.originX + first.width);
    expect(isFarmBedTile(first, first.originX + 2, first.originY + 5)).toBe(true);
    expect(isFarmBedTile(first, first.originX + 1, first.originY + 5)).toBe(false);
  });

  it('keeps farm use within authoritative reach and derives growth from the world clock', () => {
    expect(canUseFarmTile(4 * TILE_SIZE_FIXED, 4 * TILE_SIZE_FIXED, 6, 4)).toBe(true);
    expect(canUseFarmTile(4 * TILE_SIZE_FIXED, 4 * TILE_SIZE_FIXED, 7, 4)).toBe(false);
    expect(cropStage(10n, 10n)).toBe(0);
    expect(cropStage(10n, 10n + CROP_GROWTH_TICKS / 3n)).toBe(1);
    expect(cropStage(10n, 10n + CROP_GROWTH_TICKS * 2n / 3n)).toBe(2);
    expect(cropStage(10n, 10n + CROP_GROWTH_TICKS)).toBe(3);
    expect(cropStage(0n, CROP_GROWTH_TICKS)).toBe(3);
  });

  it('uses only world bounds as collision in the open farm sample', () => {
    const collision = createMmoFarmCollisionMap(80, 80);
    expect(collision.blocked[0]).toBe(true);
    expect(collision.blocked[16 * collision.width + 24]).toBe(false);
  });

  it('26§13 keeps collision dimensions and mutable obstacles local to each space', () => {
    const debug = createAuthoritySpaceCollisionMap(DEBUG_SPACE_ID, [{
      kind: 'rock_small', tileX: 5, tileY: 5, depleted: false,
    }]);
    const topside = createAuthoritySurvivalCollisionMap([]);
    expect(debug.width).toBe(32);
    expect(topside.width).toBe(SURVIVAL_WORLD_SIZE);
    expect(debug.blocked[0]).toBe(true);
    expect(debug.blocked[5 * debug.width + 5]).toBe(false);
    expect(debug.obstacles).toHaveLength(1);
    expect(topside.obstacles?.length).toBeGreaterThan(1);
    expect(debug.elevations).toBeUndefined();
    expect(debug.terrainTransitions).toBeUndefined();
    expect(topside.elevations).toHaveLength(SURVIVAL_WORLD_SIZE ** 2);
    expect(topside.terrainTransitions).toEqual(survivalTerrainTransitions(SURVIVAL_WORLD_SEED));
    expect(topside.terrainPlaneBlocked).toBeDefined();
  }, 15_000);

  it('opens persistent cellar excavation tiles without mutating cached starter collision', () => {
    const instance = { spaceId: 10_000, sizeTier: 0, residenceSpaceId: 30_000 };
    const base = createAuthoritySpaceCollisionMap(30_001, [], [], 'ground', [], instance);
    const dynamic = createAuthoritySpaceCollisionMap(
      30_001, [], [], 'ground', [], instance, [{ tileX: 500, tileY: 500 }],
    );
    const index = 500 * dynamic.width + 500;
    expect(base.blocked[index]).toBe(false);
    expect(base.elevations?.[index]).toBe(1);
    expect(base.fixedTerrainPlane).toBe(0);
    expect(base.terrainPlaneBlocked).toBeDefined();
    expect(dynamic.blocked[index]).toBe(false);
    expect(dynamic.elevations?.[index]).toBe(0);
    expect(dynamic.terrainPlaneBlocked).toBeDefined();
    expect(base.elevations?.[index]).toBe(1);
  });

  it('blocks water and solid ridges while projected cliff rows remain lower-plane walkable', () => {
    const terrain = Array.from({ length: SURVIVAL_WORLD_SIZE ** 2 }, (_, index) => ({
      tileX: index % SURVIVAL_WORLD_SIZE,
      tileY: Math.floor(index / SURVIVAL_WORLD_SIZE),
    }));
    const water = terrain.find(({ tileX, tileY }) => survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY) === 'water');
    const projectedCliff = terrain.find(({ tileX, tileY }) => survivalBiomeAt(
      SURVIVAL_WORLD_SEED, tileX, tileY,
    ) === 'ridge');
    const solidRidge = terrain.find(({ tileX, tileY }) => {
      const biome = survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY);
      return biome === 'desert_ridge' || biome === 'coastal_cliff';
    });
    const resource = generateSurvivalResources().find((candidate) => candidate.kind.startsWith('tree_'));
    if (!water || !projectedCliff || !solidRidge || !resource) throw new Error('missing generated-world fixture');

    const live = createAuthoritySurvivalCollisionMap([{ ...resource, depleted: false }]);
    const depleted = createAuthoritySurvivalCollisionMap([{ ...resource, depleted: true }]);
    expect(live.blocked[water.tileY * live.width + water.tileX]).toBe(true);
    expect(live.blocked[solidRidge.tileY * live.width + solidRidge.tileX]).toBe(true);
    expect(live.blocked[projectedCliff.tileY * live.width + projectedCliff.tileX]).toBe(false);
    expect(live.obstacles).toHaveLength((depleted.obstacles?.length ?? 0) + 1);
    expect(live.blocked[resource.tileY * live.width + resource.tileX]).toBe(false);
    expect(depleted.obstacles?.length).toBeGreaterThan(0);
    expect(depleted.blocked[resource.tileY * depleted.width + resource.tileX]).toBe(false);
  });

  it('28§14 blocks closed placeables but lets open gates and standing lights pass', () => {
    const collision = createAuthoritySurvivalCollisionMap([], [], 'ground', [
      { tileX: 20, tileY: 20, blocksMovement: true },
      { tileX: 21, tileY: 20, blocksMovement: true, open: true },
      { tileX: 22, tileY: 20, blocksMovement: false },
    ]);
    const dynamic = collision.obstacles?.filter((obstacle) => obstacle.top === 20 * TILE_SIZE_FIXED) ?? [];
    expect(dynamic).toContainEqual({
      left: 20 * TILE_SIZE_FIXED,
      top: 20 * TILE_SIZE_FIXED,
      right: 21 * TILE_SIZE_FIXED - 1,
      bottom: 21 * TILE_SIZE_FIXED - 1,
    });
    expect(dynamic.some((obstacle) => obstacle.left === 21 * TILE_SIZE_FIXED)).toBe(false);
    expect(dynamic.some((obstacle) => obstacle.left === 22 * TILE_SIZE_FIXED)).toBe(false);
  });

  it('allows water traversal while blocking shorelines and water rocks', () => {
    const collision = createAuthoritySurvivalCollisionMap([], [], 'water');
    let waterIndex = -1;
    let beachIndex = -1;
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE && (waterIndex < 0 || beachIndex < 0); tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE && (waterIndex < 0 || beachIndex < 0); tileX += 1) {
        const biome = survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY);
        if (biome === 'water') waterIndex = tileY * SURVIVAL_WORLD_SIZE + tileX;
        if (biome === 'beach') beachIndex = tileY * SURVIVAL_WORLD_SIZE + tileX;
      }
    }
    expect(collision.blocked[waterIndex]).toBe(false);
    expect(collision.blocked[beachIndex]).toBe(true);
    expect(collision.obstacles?.length).toBeGreaterThan(0);
  });

  it('requires the matching tool and gives axes a broader authoritative reach', () => {
    const resource = generateSurvivalResources().find((candidate) => candidate.kind.startsWith('tree_'));
    if (!resource) throw new Error('missing generated resource fixture');
    const x = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, depleted: false })).toBe('ok');
    for (const kind of SURVIVAL_TREE_KINDS) {
      expect(resourceHarvestResult(x, y, 'axe', { ...resource, kind, depleted: false })).toBe('ok');
    }
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, kind: 'rock', depleted: false })).toBe('wrong_tool');
    expect(resourceHarvestResult(x, y, 'pickaxe', { ...resource, depleted: false })).toBe('wrong_tool');
    for (const kind of SURVIVAL_ORE_KINDS) {
      expect(resourceHarvestResult(x, y, 'pickaxe', { ...resource, kind, depleted: false })).toBe('ok');
      expect(resourceHarvestResult(x, y, 'axe', { ...resource, kind, depleted: false })).toBe('wrong_tool');
    }
    expect(resourceHarvestResult(x, y, 'pickaxe', { ...resource, kind: 'rock_large', depleted: false })).toBe('ok');
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, kind: 'rock_large', depleted: false })).toBe('wrong_tool');
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, depleted: true })).toBe('depleted');
    expect(resourceHarvestResult(x + 2 * TILE_SIZE_FIXED, y, 'axe', { ...resource, depleted: false })).toBe('ok');
    const treeBounds = survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY);
    const treeAlignedY = Math.floor((treeBounds.top + treeBounds.bottom) / 2)
      + PLAYER_HITBOX_FOOT_OFFSET + (PLAYER_HITBOX_TOP / 2);
    expect(resourceHarvestResult(treeBounds.right + 2 * TILE_SIZE_FIXED, treeAlignedY, 'axe', { ...resource, depleted: false })).toBe('ok');
    expect(resourceHarvestResult(treeBounds.right + 2 * TILE_SIZE_FIXED + 1, treeAlignedY, 'axe', { ...resource, depleted: false })).toBe('out_of_range');
    const rockBounds = survivalResourceObstacle('rock_large', resource.tileX, resource.tileY);
    const rockAlignedY = Math.floor((rockBounds.top + rockBounds.bottom) / 2)
      + PLAYER_HITBOX_FOOT_OFFSET + (PLAYER_HITBOX_TOP / 2);
    expect(resourceHarvestResult(rockBounds.right + 2 * TILE_SIZE_FIXED + 1, rockAlignedY, 'pickaxe', {
      ...resource, kind: 'rock_large', depleted: false,
    })).toBe('out_of_range');
  });

  it('allows nearby loose resources to be gathered without a tool', () => {
    const resource = { kind: 'loose_stone', tileX: 10, tileY: 10, depleted: false };
    const x = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(resourceGatherResult(x, y, resource)).toBe('ok');
    expect(resourceGatherResult(x, y, { ...resource, kind: 'fallen_branch' })).toBe('ok');
    expect(resourceGatherResult(x, y, { ...resource, kind: 'rock_large' })).toBe('not_gatherable');
    expect(resourceGatherResult(x, y, { ...resource, depleted: true })).toBe('depleted');
    expect(resourceGatherResult(x + 25 * FIXED_UNITS_PER_PIXEL, y, resource)).toBe('out_of_range');
  });

  it('authorizes hoeing and watering from tool, terrain, occupancy, state, and reach', () => {
    let grass: { tileX: number; tileY: number } | undefined;
    let water: { tileX: number; tileY: number } | undefined;
    for (let tileY = 0; tileY < SURVIVAL_WORLD_SIZE && (!grass || !water); tileY += 1) {
      for (let tileX = 0; tileX < SURVIVAL_WORLD_SIZE && (!grass || !water); tileX += 1) {
        const tile = { tileX, tileY };
        if (!grass && isTillableSurvivalTile(SURVIVAL_WORLD_SEED, tileX, tileY)) grass = tile;
        if (!water && survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY) === 'water') water = tile;
      }
    }
    if (!grass || !water) throw new Error('missing farmland terrain fixtures');
    const playerX = grass.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const playerY = grass.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'hoe', grass.tileX, grass.tileY, null, false)).toBe('ok');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'axe', grass.tileX, grass.tileY, null, false)).toBe('wrong_tool');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'hoe', grass.tileX, grass.tileY, null, true)).toBe('tile_occupied');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'hoe', grass.tileX, grass.tileY, { watered: false }, false)).toBe('already_tilled');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'watering_can', grass.tileX, grass.tileY, null, false)).toBe('not_tilled');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'watering_can', grass.tileX, grass.tileY, { watered: false }, false)).toBe('ok');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'watering_can', grass.tileX, grass.tileY, { watered: true }, false)).toBe('already_watered');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'hoe', water.tileX, water.tileY, null, false)).toBe('out_of_range');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX - 3 * TILE_SIZE_FIXED, playerY, 'hoe', grass.tileX, grass.tileY, null, false)).toBe('ok');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX - 3 * TILE_SIZE_FIXED - 1, playerY, 'hoe', grass.tileX, grass.tileY, null, false)).toBe('out_of_range');
    const waterX = water.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const waterY = water.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, waterX, waterY, 'hoe', water.tileX, water.tileY, null, false)).toBe('not_grass');
    expect(farmToolUseResult(
      SURVIVAL_WORLD_SEED, waterX, waterY, 'hoe', water.tileX, water.tileY, null, false, true,
    )).toBe('ok');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, playerX, playerY, 'hoe', -1, grass.tileY, null, false)).toBe('invalid_tile');
    expect(farmSoilRestoreResult(playerX, playerY, 'hoe', grass.tileX, grass.tileY, { watered: true })).toBe('ok');
    expect(farmSoilRestoreResult(playerX, playerY, 'watering_can', grass.tileX, grass.tileY, {})).toBe('wrong_tool');
    expect(farmSoilRestoreResult(playerX, playerY, 'hoe', grass.tileX, grass.tileY, null)).toBe('not_tilled');
    expect(farmSoilRestoreResult(playerX - 3 * TILE_SIZE_FIXED, playerY, 'hoe', grass.tileX, grass.tileY, {})).toBe('ok');
    expect(farmSoilRestoreResult(playerX - 3 * TILE_SIZE_FIXED - 1, playerY, 'hoe', grass.tileX, grass.tileY, {})).toBe('out_of_range');
    expect(farmSoilRestoreResult(playerX, playerY, 'hoe', -1, grass.tileY, {})).toBe('invalid_tile');
  });

  it('authorizes tile placement through shared reach, terrain, obstacles, and actor occupancy', () => {
    const width = 20;
    const blocked = Array.from({ length: width * width }, (_, index) => index === 10 * width + 12);
    const collision = {
      width,
      height: width,
      blocked,
      obstacles: [{
        left: 11 * TILE_SIZE_FIXED,
        top: 10 * TILE_SIZE_FIXED,
        right: 12 * TILE_SIZE_FIXED - 1,
        bottom: 11 * TILE_SIZE_FIXED - 1,
      }],
    };
    const x = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(tilePlacementResult(x, y, 10, 10, collision, false)).toBe('ok');
    expect(tilePlacementResult(x, y, 10, 10, collision, true)).toBe('tile_blocked');
    expect(tilePlacementResult(x, y, 11, 10, collision, false)).toBe('tile_blocked');
    expect(tilePlacementResult(x, y, 12, 10, collision, false)).toBe('tile_blocked');
    expect(tilePlacementResult(x, y, 13, 10, collision, false)).toBe('ok');
    expect(tilePlacementResult(x, y, 14, 10, collision, false)).toBe('out_of_range');
    expect(tilePlacementResult(x, y, -1, 10, collision, false)).toBe('invalid_tile');
  });

  it('derives ground-item placement and pickup reach from authority state', () => {
    expect(itemDropPosition(10 * TILE_SIZE_FIXED, 10 * TILE_SIZE_FIXED, 'right')).toEqual({
      x: 10 * TILE_SIZE_FIXED + 12 * 16,
      y: 10 * TILE_SIZE_FIXED,
    });
    expect(itemDropPosition(10 * TILE_SIZE_FIXED, 10 * TILE_SIZE_FIXED, 'upLeft')).toEqual({
      x: 10 * TILE_SIZE_FIXED - 8 * 16,
      y: 10 * TILE_SIZE_FIXED - 8 * 16,
    });
    expect(itemWithinPickupReach(0, 0, 24 * 16, 0)).toBe(true);
    expect(itemWithinPickupReach(0, 0, 24 * 16 + 1, 0)).toBe(false);
  });
});
