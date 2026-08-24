import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  createPlaceholderCollisionMap,
  generateSurvivalResources,
  movePlayer,
  survivalBiomeAt,
  type PlayerState,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_HZ,
  CHUNK_SIZE_FIXED,
  advanceAuthorityPlayer,
  canUseFarmTile,
  canTendTree,
  chunkAt,
  cropStage,
  CROP_GROWTH_TICKS,
  createAuthoritySurvivalCollisionMap,
  createMmoFarmCollisionMap,
  decodeDirection,
  farmParcelLayout,
  isFarmBedTile,
  itemDropPosition,
  itemWithinPickupReach,
  inputIsStale,
  movementCreditAvailable,
  queueMovementAcknowledgement,
  drainMovementAcknowledgement,
  drainMovementRunQueue,
  nextActionStartedTick,
  presenceLeaseExpired,
  resourceHarvestResult,
  settleMovementRun,
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

  it('stops stale input after two seconds while leaving presence alive', () => {
    expect(inputIsStale(1_000_000n, 3_000_000n)).toBe(false);
    expect(inputIsStale(1_000_000n, 3_000_001n)).toBe(true);
    expect(presenceLeaseExpired(1_000_000n, 3_000_001n)).toBe(false);
  });

  it('settles taps between authority ticks and caps conflicting backlog', () => {
    expect(settleMovementRun('right', 10n, 12n, 0n, 'idle', 0)).toEqual({
      pendingDirection: 'right', pendingSteps: 2, rejectedSteps: 0n,
    });
    expect(settleMovementRun('right', 10n, 12n, 3n, 'idle', 0)).toEqual({
      pendingDirection: 'idle', pendingSteps: 0, rejectedSteps: 0n,
    });
    expect(settleMovementRun('left', 0n, 20n, 0n, 'right', 4)).toEqual({
      pendingDirection: 'right:4|left:8', pendingSteps: 12, rejectedSteps: 12n,
    });
    expect(settleMovementRun('right', 0n, 20n, 0n, 'right', 4)).toEqual({
      pendingDirection: 'right', pendingSteps: 12, rejectedSteps: 12n,
    });
  });

  it('drains compressed direction transitions in original run order', () => {
    expect(drainMovementRunQueue('right:4|up:6', 10, 6)).toEqual({
      directions: ['right', 'right', 'right', 'right', 'up', 'up'],
      pendingDirection: 'up',
      pendingSteps: 4,
    });
    expect(drainMovementRunQueue('up', 4, 6)).toEqual({
      directions: ['up', 'up', 'up', 'up'],
      pendingDirection: 'idle',
      pendingSteps: 0,
    });
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

  it('blocks generated water and ridge while using narrow mutable trunk obstacles', () => {
    const terrain = Array.from({ length: SURVIVAL_WORLD_SIZE ** 2 }, (_, index) => ({
      tileX: index % SURVIVAL_WORLD_SIZE,
      tileY: Math.floor(index / SURVIVAL_WORLD_SIZE),
    }));
    const water = terrain.find(({ tileX, tileY }) => survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY) === 'water');
    const ridge = terrain.find(({ tileX, tileY }) => survivalBiomeAt(SURVIVAL_WORLD_SEED, tileX, tileY) === 'ridge');
    const resource = generateSurvivalResources()[0];
    if (!water || !ridge || !resource) throw new Error('missing generated-world fixture');

    const live = createAuthoritySurvivalCollisionMap([{ ...resource, depleted: false }]);
    const depleted = createAuthoritySurvivalCollisionMap([{ ...resource, depleted: true }]);
    expect(live.blocked[water.tileY * live.width + water.tileX]).toBe(true);
    expect(live.blocked[ridge.tileY * live.width + ridge.tileX]).toBe(true);
    expect(live.obstacles).toHaveLength(1);
    expect(live.blocked[resource.tileY * live.width + resource.tileX]).toBe(false);
    expect(depleted.obstacles).toHaveLength(0);
    expect(depleted.blocked[resource.tileY * depleted.width + resource.tileX]).toBe(false);
  });

  it('requires the matching tool and authoritative two-tile harvesting reach', () => {
    const resource = generateSurvivalResources()[0];
    if (!resource) throw new Error('missing generated resource fixture');
    const x = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, depleted: false })).toBe('ok');
    expect(resourceHarvestResult(x, y, 'pickaxe', { ...resource, depleted: false })).toBe('wrong_tool');
    expect(resourceHarvestResult(x, y, 'axe', { ...resource, depleted: true })).toBe('depleted');
    expect(resourceHarvestResult(x + 2 * TILE_SIZE_FIXED, y, 'axe', { ...resource, depleted: false })).toBe('ok');
    expect(resourceHarvestResult(x + 2 * TILE_SIZE_FIXED + 1, y, 'axe', { ...resource, depleted: false })).toBe('out_of_range');
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
