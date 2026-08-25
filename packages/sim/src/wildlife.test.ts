import { describe, expect, it } from 'vitest';
import {
  createSurvivalCollisionMap,
  generateSurvivalDecorations,
  SURVIVAL_WORLD_SEED,
} from './survival-world.js';
import { TILE_SIZE_FIXED } from './state.js';
import {
  WILDLIFE_DEFINITIONS,
  WILDLIFE_FIRST_NPC_ID,
  WILDLIFE_SPECIES,
  generateSurvivalWildlife,
  generateSurvivalWildlifeHives,
  hiveProducesHoneyAtTick,
  stepAmbientWildlife,
  wildlifeActivityNearPlayers,
  wildlifeHabitatAllowsTile,
  wildlifeMovementMedium,
  wildlifePosition,
  wildlifeSleepingAtTick,
  type AmbientWildlifeState,
} from './wildlife.js';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';

describe('deterministic wildlife generation', () => {
  it('spawns every authored species in habitat-correct packs with solitary horses', () => {
    const first = generateSurvivalWildlife();
    expect(generateSurvivalWildlife()).toEqual(first);
    expect(first.length).toBeGreaterThan(240);
    expect(first[0]?.id).toBe(WILDLIFE_FIRST_NPC_ID);
    for (const species of WILDLIFE_SPECIES) {
      expect(first.some((animal) => animal.species === species)).toBe(true);
    }
    for (const animal of first) {
      expect(animal.variant).toBeGreaterThanOrEqual(0);
      expect(animal.variant).toBeLessThan(WILDLIFE_DEFINITIONS[animal.species].variants);
      expect(wildlifeHabitatAllowsTile(animal.habitat, SURVIVAL_WORLD_SEED, animal.tileX, animal.tileY)).toBe(true);
      if (animal.species === 'horse') expect(animal.packId).toBe(0);
      else expect(animal.packId).toBeGreaterThan(0);
    }
  });

  it('places colonies at hives and uses every colour variant where one exists', () => {
    const wildlife = generateSurvivalWildlife();
    const hives = generateSurvivalWildlifeHives();
    expect(hives).toHaveLength(8);
    expect(hives.some((hive) => hive.kind === 'hive')).toBe(true);
    expect(hives.some((hive) => hive.kind === 'nest')).toBe(true);
    expect(wildlife.filter((animal) => animal.species === 'bee')).toHaveLength(
      hives.reduce((sum, hive) => sum + hive.beeCount, 0),
    );
    for (const hive of hives) {
      expect(wildlife.filter((animal) => (
        animal.species === 'bee'
        && animal.homeTileX === hive.tileX
        && animal.homeTileY === hive.tileY
      ))).toHaveLength(hive.beeCount);
    }
    for (const species of WILDLIFE_SPECIES.filter((candidate) => WILDLIFE_DEFINITIONS[candidate].variants > 1)) {
      const speciesRows = wildlife.filter((animal) => animal.species === species);
      expect(new Set(speciesRows.map((animal) => animal.variant)).size)
        .toBe(Math.min(speciesRows.length, WILDLIFE_DEFINITIONS[species].variants));
    }
  });
});

describe('activated wildlife lifecycle', () => {
  const horseSpawn = generateSurvivalWildlife().find((animal) => animal.species === 'horse')!;
  const home = wildlifePosition(horseSpawn.tileX, horseSpawn.tileY);
  const initial: AmbientWildlifeState = {
    id: 11_000n,
    position: home,
    home,
    facing: 'right',
    moving: true,
    activity: 'right',
    nextDecisionTick: 100,
  };

  it('moves deterministically during the day and sleeps on authored species at night', () => {
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const dayTick = BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4));
    const daytime = stepAmbientWildlife(initial, {
      species: 'horse', authorityTick: 1, calendarTick: dayTick, collision,
    });
    expect(daytime.position.x).toBeGreaterThan(initial.position.x);

    const night = stepAmbientWildlife(initial, {
      species: 'horse', authorityTick: 1, calendarTick: 0n, collision,
    });
    expect(night).toMatchObject({ moving: false, activity: 'sleep' });

    const awayFromHome = {
      ...initial,
      position: { x: home.x + TILE_SIZE_FIXED * 3, y: home.y },
      activity: 'left',
    };
    const sleepingAwayFromHome = stepAmbientWildlife(awayFromHome, {
      species: 'horse', authorityTick: 1, calendarTick: 0n, collision,
    });
    expect(sleepingAwayFromHome.position).toEqual(awayFromHome.position);
    expect(sleepingAwayFromHome).toMatchObject({ moving: false, activity: 'sleep' });

    for (const species of ['duck', 'swan'] as const) {
      const spawn = generateSurvivalWildlife().find((animal) => animal.species === species)!;
      const position = wildlifePosition(spawn.tileX, spawn.tileY);
      const sleeper = stepAmbientWildlife({
        ...initial, position, home: position, activity: 'right', moving: true,
      }, { species, authorityTick: 1, calendarTick: 0n, collision });
      expect(sleeper.position).toEqual(position);
      expect(sleeper).toMatchObject({ moving: false, activity: 'sleep' });
    }

    expect(WILDLIFE_DEFINITIONS.butterfly.sleepsAtNight).toBe(false);
    expect(wildlifeSleepingAtTick('butterfly', 0n)).toBe(false);
  });

  it('supports diagonal travel and preserves a quiet rest until the next decision', () => {
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const dayTick = BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4));
    const diagonal = stepAmbientWildlife({ ...initial, activity: 'up_left' }, {
      species: 'horse', authorityTick: 1, calendarTick: dayTick, collision,
    });
    expect(diagonal.position.x).toBeLessThan(initial.position.x);
    expect(diagonal.position.y).toBeLessThan(initial.position.y);
    expect(diagonal.facing).toBe('left');

    const resting = stepAmbientWildlife({ ...initial, moving: false, activity: 'rest' }, {
      species: 'horse', authorityTick: 1, calendarTick: dayTick, collision,
    });
    expect(resting).toMatchObject({ position: initial.position, moving: false, activity: 'rest' });

    const decisions = Array.from({ length: 100 }, (_, index) => stepAmbientWildlife({
      ...initial, id: BigInt(20_000 + index), moving: false, activity: 'rest', nextDecisionTick: 0,
    }, {
      species: 'horse', authorityTick: 100, calendarTick: dayTick, collision,
    }));
    expect(decisions.filter((decision) => !decision.moving).length).toBeGreaterThan(
      decisions.filter((decision) => decision.moving).length,
    );
  });

  it('keeps bees inside between sorties and returns flying bees to the hive at night', () => {
    const bee = generateSurvivalWildlife().find((animal) => animal.species === 'bee')!;
    const beeHome = wildlifePosition(bee.homeTileX, bee.homeTileY);
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const dayTick = BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4));
    const inside: AmbientWildlifeState = {
      id: BigInt(bee.id), position: beeHome, home: beeHome, facing: 'right',
      moving: false, activity: 'inside_hive', nextDecisionTick: 100,
    };
    expect(stepAmbientWildlife(inside, {
      species: 'bee', authorityTick: 1, calendarTick: dayTick, collision,
    })).toMatchObject({ moving: false, activity: 'inside_hive' });
    expect(stepAmbientWildlife(inside, {
      species: 'bee', authorityTick: 100, calendarTick: dayTick, collision,
    })).toMatchObject({ moving: true });

    const away = { ...inside, position: { x: beeHome.x + TILE_SIZE_FIXED * 2, y: beeHome.y }, activity: 'right', nextDecisionTick: 999 };
    const returning = stepAmbientWildlife(away, {
      species: 'bee', authorityTick: 1, calendarTick: 0n, collision,
    });
    expect(returning.position.x).toBeLessThan(away.position.x);
    expect(returning).toMatchObject({ moving: true, facing: 'left' });
    expect(stepAmbientWildlife({ ...inside, nextDecisionTick: 0 }, {
      species: 'bee', authorityTick: 1, calendarTick: 0n, collision,
    })).toMatchObject({ moving: false, activity: 'inside_hive' });
  });

  it('keeps water creatures in water and spreads activation by nearby chunks', () => {
    expect(wildlifeMovementMedium('duck')).toBe('water');
    expect(wildlifeMovementMedium('horse')).toBe('ground');
    expect(wildlifeMovementMedium('bee')).toBe('air');
    expect(WILDLIFE_DEFINITIONS.duck.ignoresObstacles).toBe(false);
    for (const animal of generateSurvivalWildlife().filter((candidate) => (
      candidate.species === 'duck' || candidate.species === 'capybara'
    ))) {
      expect(wildlifeHabitatAllowsTile('freshwater', SURVIVAL_WORLD_SEED, animal.tileX, animal.tileY)).toBe(true);
    }
    const waterRocks = new Set(generateSurvivalDecorations()
      .filter((decoration) => decoration.kind === 'nature_water_rock')
      .map((decoration) => `${decoration.tileX},${decoration.tileY}`));
    for (const animal of generateSurvivalWildlife().filter((candidate) => (
      wildlifeMovementMedium(candidate.species) === 'water'
    ))) {
      expect(waterRocks.has(`${animal.tileX},${animal.tileY}`)).toBe(false);
    }
    expect(wildlifeActivityNearPlayers(5, 5, [[8, 8]])).toBe(true);
    expect(wildlifeActivityNearPlayers(5, 5, [[9, 8]])).toBe(false);
    expect(hiveProducesHoneyAtTick(BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4)))).toBe(true);
    expect(hiveProducesHoneyAtTick(0n)).toBe(false);
    expect(TILE_SIZE_FIXED).toBeGreaterThan(0);
  });

  it('lets flying wildlife cross blockers while keeping landing habitat dry', () => {
    const butterfly = generateSurvivalWildlife().find((animal) => animal.species === 'butterfly')!;
    const position = wildlifePosition(butterfly.tileX, butterfly.tileY);
    const baseCollision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const blockedCollision = {
      ...baseCollision,
      obstacles: [...(baseCollision.obstacles ?? []), {
        left: position.x - TILE_SIZE_FIXED,
        right: position.x + TILE_SIZE_FIXED,
        top: position.y - TILE_SIZE_FIXED,
        bottom: position.y + TILE_SIZE_FIXED,
      }],
    };
    const dayTick = BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4));
    const flying = stepAmbientWildlife({
      ...initial, id: BigInt(butterfly.id), position, home: position,
      activity: 'right', nextDecisionTick: 100,
    }, {
      species: 'butterfly', authorityTick: 1, calendarTick: dayTick, collision: blockedCollision,
    });
    expect(flying.position.x).toBeGreaterThan(position.x);
    expect(flying).toMatchObject({ moving: true, activity: 'right' });
    expect(wildlifeHabitatAllowsTile(
      WILDLIFE_DEFINITIONS.butterfly.habitat,
      SURVIVAL_WORLD_SEED,
      butterfly.tileX,
      butterfly.tileY,
    )).toBe(true);

    const overWater = wildlifePosition(1, 1);
    const recovering = stepAmbientWildlife({
      ...initial, id: BigInt(butterfly.id), position: overWater, home: position,
      activity: 'rest', moving: false, nextDecisionTick: 999,
    }, {
      species: 'butterfly', authorityTick: 1, calendarTick: dayTick, collision: blockedCollision,
    });
    expect(recovering.moving).toBe(true);
    expect(recovering.activity).not.toBe('rest');
    expect(Math.max(
      Math.abs(position.x - recovering.position.x),
      Math.abs(position.y - recovering.position.y),
    )).toBeLessThan(Math.max(
      Math.abs(position.x - overWater.x),
      Math.abs(position.y - overWater.y),
    ));
  });
});
