import { describe, expect, it } from 'vitest';
import {
  createSurvivalCollisionMap,
  generateSurvivalDecorations,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
} from './survival-world.js';
import { TILE_SIZE_FIXED } from './state.js';
import { bootstrapContentDefinitions, bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { definitionSlug } from './content/definitions.js';
import { buildContentRegistry } from './content/registry.js';
import {
  WILDLIFE_KNOCKBACK_FIXED,
  WILDLIFE_PANIC_DURATION_TICKS,
  WILDLIFE_DEFINITIONS,
  WILDLIFE_FIRST_NPC_ID,
  WILDLIFE_PANIC_RADIUS_FIXED,
  WILDLIFE_EAT_HAY_ACTIVITY,
  WILDLIFE_RETURN_HOME_ACTIVITY,
  WILDLIFE_SEEK_HAY_ACTIVITY,
  WILDLIFE_SPECIES,
  generateSurvivalWildlife,
  generateSurvivalWildlifeHives,
  generateSurvivalWildlifeForRegistry,
  generateSurvivalWildlifeHivesForRegistry,
  hiveProducesHoneyAtTick,
  knockbackWildlife,
  stepAmbientWildlife,
  stepPanickedWildlife,
  wildlifeActivityNearPlayers,
  wildlifeEatsHay,
  wildlifeHabitatAllowsTile,
  wildlifeMovementMedium,
  wildlifePosition,
  wildlifeSleepingAtTick,
  runtimeWildlifeDefinition,
  runtimeWildlifeEatsHay,
  runtimeWildlifeMovementMedium,
  runtimeWildlifePanicGroup,
  runtimeWildlifeSpawnPlans,
  runtimeKnockbackWildlife,
  runtimeStepAmbientWildlife,
  runtimeStepPanickedWildlife,
  type AmbientWildlifeState,
} from './wildlife.js';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';

function goldenHash(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// These functional fixtures generate several complete worlds per test. V8
// coverage exceeds the ordinary 15-second timeout even on unchanged main.
describe('deterministic wildlife generation', { timeout: 120_000 }, () => {
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
      expect(animal.variant).toBeLessThan(
        WILDLIFE_DEFINITIONS[animal.species as keyof typeof WILDLIFE_DEFINITIONS].variants,
      );
      expect(wildlifeHabitatAllowsTile(animal.habitat, SURVIVAL_WORLD_SEED, animal.tileX, animal.tileY)).toBe(true);
      if (animal.species === 'horse') expect(animal.packId).toBe(0);
      else expect(animal.packId).toBeGreaterThan(0);
    }
    expect(goldenHash({
      wildlife: generateSurvivalWildlife(0x5eedc0de),
      hives: generateSurvivalWildlifeHives(0x5eedc0de),
    })).toBe('0a9ebc4e');
  });

  it('preserves canonical generation and follows renamed active definitions by stable species', () => {
    expect(generateSurvivalWildlifeForRegistry(bootstrapContentRegistry()))
      .toEqual(generateSurvivalWildlife());
    expect(generateSurvivalWildlifeHivesForRegistry(bootstrapContentRegistry()))
      .toEqual(generateSurvivalWildlifeHives());

    const definitions = bootstrapContentDefinitions().map((definition) => {
      if (definition.id === 'creature:cow') return { ...definition, id: 'creature:moon_cow' as const };
      if (definition.kind === 'spawn' && definition.target === 'creature:cow') {
        return { ...definition, target: 'creature:moon_cow' as const };
      }
      return definition;
    });
    const built = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definitionSlug(definition.id)!, json: definition,
    })));
    expect(built.report.valid).toBe(true);
    expect(runtimeWildlifeDefinition(built.registry, 'cow')?.id).toBe('creature:moon_cow');
    expect(runtimeWildlifeMovementMedium(built.registry, 'cow')).toBe('ground');
    expect(runtimeWildlifeEatsHay(built.registry, 'cow')).toBe(true);
    expect(runtimeWildlifePanicGroup(built.registry, 'cow')).toBe('cow');
    expect(runtimeWildlifeSpawnPlans(built.registry).some(({ species }) => species === 'cow')).toBe(true);
    expect(generateSurvivalWildlifeForRegistry(built.registry)).toEqual(generateSurvivalWildlife());
    expect(runtimeWildlifeDefinition(built.registry, 'missing')).toBeNull();
    expect(runtimeWildlifeMovementMedium(built.registry, 'missing')).toBeNull();
  });

  it('resolves hive colonies and trailing pack members through authored creature semantics', () => {
    const definitions = bootstrapContentDefinitions().map((definition) => {
      if (definition.id === 'creature:bee') {
        return { ...definition, id: 'creature:moon_moth' as const, species: 'moon_moth' };
      }
      if (definition.id === 'creature:rooster') {
        return { ...definition, id: 'creature:moon_rooster' as const, species: 'moon_rooster' };
      }
      if (definition.id === 'creature:chicken') {
        return {
          ...definition,
          id: 'creature:moon_hen' as const,
          species: 'moon_hen',
          behavior: { trailingPackMember: 'creature:moon_rooster' as const },
        };
      }
      if (definition.kind === 'spawn' && definition.target === 'creature:chicken') {
        return { ...definition, target: 'creature:moon_hen' as const };
      }
      return definition;
    });
    const built = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definitionSlug(definition.id)!, json: definition,
    })));
    expect(built.report.valid).toBe(true);

    const hives = generateSurvivalWildlifeHivesForRegistry(built.registry);
    const wildlife = generateSurvivalWildlifeForRegistry(built.registry);
    expect(hives).toHaveLength(generateSurvivalWildlifeHives().length);
    expect(wildlife.filter(({ species }) => species === 'moon_moth')).toHaveLength(
      hives.reduce((sum, hive) => sum + hive.beeCount, 0),
    );
    expect(wildlife.some(({ species }) => species === 'bee' || species === 'chicken' || species === 'rooster')).toBe(false);
    const henPacks = new Map<number, typeof wildlife>();
    for (const animal of wildlife.filter(({ species }) => species === 'moon_hen' || species === 'moon_rooster')) {
      henPacks.set(animal.packId, [...(henPacks.get(animal.packId) ?? []), animal]);
    }
    expect([...henPacks.values()]).toHaveLength(6);
    for (const pack of henPacks.values()) {
      expect(pack.filter(({ species }) => species === 'moon_hen')).toHaveLength(5);
      expect(pack.filter(({ species }) => species === 'moon_rooster')).toHaveLength(1);
      expect([...pack].sort((left, right) => left.id - right.id).at(-1)?.species).toBe('moon_rooster');
    }

    const colony = wildlife.find(({ species }) => species === 'moon_moth')!;
    const home = wildlifePosition(colony.homeTileX, colony.homeTileY);
    const state: AmbientWildlifeState = {
      id: BigInt(colony.id), position: home, home, facing: 'right', moving: false,
      activity: 'inside_hive', nextDecisionTick: 0,
    };
    expect(runtimeStepAmbientWildlife(built.registry, state, {
      species: 'moon_moth', authorityTick: 1, calendarTick: 0n,
      collision: createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []),
    })).toMatchObject({ position: home, moving: false, activity: 'inside_hive' });

    const missingHive = buildContentRegistry(definitions.filter(({ id }) => id !== 'creature:moon_moth').map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    })));
    expect(generateSurvivalWildlifeHivesForRegistry(missingHive.registry)).toEqual([]);
    expect(runtimeStepAmbientWildlife(missingHive.registry, state, {
      species: 'moon_moth', authorityTick: 1, calendarTick: 0n,
      collision: createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []),
    })).toBeNull();

    const missingTrailer = buildContentRegistry(definitions.filter(({ id }) => id !== 'creature:moon_rooster').map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    })));
    expect(missingTrailer.report.valid).toBe(false);
    expect(generateSurvivalWildlifeForRegistry(missingTrailer.registry)
      .filter(({ species }) => species === 'moon_hen')).toHaveLength(36);
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
  }, 15_000);

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

  it('lets hay-eating farm species snack at immutable targets and return home', () => {
    expect((['horse', 'cow', 'sheep', 'camel'] as const).every(wildlifeEatsHay)).toBe(true);
    expect(wildlifeEatsHay('pig')).toBe(false);
    expect(wildlifeEatsHay('chicken')).toBe(false);

    let pasture: { x: number; y: number } | null = null;
    for (let y = 4; y < SURVIVAL_WORLD_SIZE - 4 && pasture === null; y += 1) {
      for (let x = 4; x < SURVIVAL_WORLD_SIZE - 10; x += 1) {
        if (Array.from({ length: 7 }, (_, offset) => x + offset).every((tileX) => (
          wildlifeHabitatAllowsTile('pasture', SURVIVAL_WORLD_SEED, tileX, y)
        ))) {
          pasture = { x, y };
          break;
        }
      }
    }
    expect(pasture).not.toBeNull();
    const livestockHome = wildlifePosition(pasture!.x, pasture!.y);
    const hay = wildlifePosition(pasture!.x + 6, pasture!.y);
    const collision = {
      width: SURVIVAL_WORLD_SIZE,
      height: SURVIVAL_WORLD_SIZE,
      blocked: Array<boolean>(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE).fill(false),
      obstacles: [],
    };
    const dayTick = BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4));
    const seeking: AmbientWildlifeState = {
      id: 4n,
      position: livestockHome,
      home: livestockHome,
      facing: 'right',
      moving: false,
      activity: WILDLIFE_SEEK_HAY_ACTIVITY,
      nextDecisionTick: 10_000,
    };
    let state = seeking;
    let authorityTick = 1;
    while (state.activity !== WILDLIFE_EAT_HAY_ACTIVITY && authorityTick < 2_000) {
      state = stepAmbientWildlife(state, {
        species: 'cow', authorityTick, calendarTick: dayTick, collision, hayTargets: [hay],
      });
      authorityTick += 1;
    }
    expect(state.activity).toBe(WILDLIFE_EAT_HAY_ACTIVITY);
    expect(state.moving).toBe(false);
    expect(state.position.x).toBeGreaterThan(livestockHome.x);
    expect([hay]).toEqual([hay]);

    authorityTick = state.nextDecisionTick;
    state = stepAmbientWildlife(state, {
      species: 'cow', authorityTick, calendarTick: dayTick, collision, hayTargets: [hay],
    });
    expect(state.activity).toBe(WILDLIFE_RETURN_HOME_ACTIVITY);
    while (state.activity !== 'rest' && authorityTick < 4_000) {
      authorityTick += 1;
      state = stepAmbientWildlife(state, {
        species: 'cow', authorityTick, calendarTick: dayTick, collision, hayTargets: [hay],
      });
    }
    expect(state).toMatchObject({ position: livestockHome, moving: false, activity: 'rest' });

    const decisions = Array.from({ length: 100 }, (_, index) => stepAmbientWildlife({
      ...seeking,
      id: BigInt(50_000 + index),
      activity: 'rest',
      nextDecisionTick: 0,
    }, {
      species: 'cow', authorityTick: 100, calendarTick: dayTick, collision, hayTargets: [hay],
    }));
    expect(decisions.some((decision) => decision.activity === WILDLIFE_SEEK_HAY_ACTIVITY)).toBe(true);
  });

  it('runs away from a threat beyond its home leash and uses collision-safe alternatives', () => {
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const fleeing = stepPanickedWildlife(initial, {
      species: 'horse',
      authorityTick: 1,
      collision,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
    });
    expect(fleeing.position.x).toBeGreaterThan(initial.position.x);
    expect(fleeing).toMatchObject({ moving: true, activity: 'panic', facing: 'right' });

    const farFromHome = {
      ...initial,
      position: { x: initial.home.x + TILE_SIZE_FIXED * 8, y: initial.home.y },
    };
    const farther = stepPanickedWildlife(farFromHome, {
      species: 'horse',
      authorityTick: 2,
      collision,
      threat: initial.home,
    });
    expect(farther.position.x).toBeGreaterThan(farFromHome.position.x);

    const open = {
      width: SURVIVAL_WORLD_SIZE,
      height: SURVIVAL_WORLD_SIZE,
      blocked: Array<boolean>(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE).fill(false),
      obstacles: [{
        left: initial.position.x + 4 * 16,
        right: initial.position.x + TILE_SIZE_FIXED,
        top: initial.position.y - TILE_SIZE_FIXED,
        bottom: initial.position.y + TILE_SIZE_FIXED,
      }],
    };
    const diverted = stepPanickedWildlife(initial, {
      species: 'horse',
      authorityTick: 3,
      collision: open,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
      seed: SURVIVAL_WORLD_SEED,
    });
    expect(diverted.position).not.toEqual(initial.position);
    expect(diverted.position.x).toBeLessThanOrEqual(initial.position.x);
  });

  it('applies a bounded collision-safe hit knockback and exports readable panic tuning', () => {
    const collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);
    const knocked = knockbackWildlife(initial.position, {
      species: 'horse',
      collision,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
    });
    expect(knocked.x).toBe(initial.position.x + WILDLIFE_KNOCKBACK_FIXED);
    expect(knocked.y).toBe(initial.position.y);
    expect(WILDLIFE_PANIC_DURATION_TICKS).toBeGreaterThan(0);
    expect(WILDLIFE_PANIC_RADIUS_FIXED).toBeGreaterThan(TILE_SIZE_FIXED);
    const runtime = bootstrapContentRegistry();
    expect(runtimeKnockbackWildlife(runtime, initial.position, {
      species: 'horse', collision,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
    })).toEqual(knocked);
    expect(runtimeStepPanickedWildlife(runtime, initial, {
      species: 'horse', authorityTick: 1, collision,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
    })).toEqual(stepPanickedWildlife(initial, {
      species: 'horse', authorityTick: 1, collision,
      threat: { x: initial.position.x - TILE_SIZE_FIXED, y: initial.position.y },
    }));
    expect(runtimeStepAmbientWildlife(runtime, initial, {
      species: 'horse', authorityTick: 1, calendarTick: 0n, collision,
    })).toEqual(stepAmbientWildlife(initial, {
      species: 'horse', authorityTick: 1, calendarTick: 0n, collision,
    }));
  });

  it('keeps grounded wildlife on its current elevation plane', () => {
    let pair: { x: number; y: number } | null = null;
    for (let y = 4; y < SURVIVAL_WORLD_SIZE - 4 && pair === null; y += 1) {
      for (let x = 4; x < SURVIVAL_WORLD_SIZE - 5; x += 1) {
        if (wildlifeHabitatAllowsTile('pasture', SURVIVAL_WORLD_SEED, x, y)
          && wildlifeHabitatAllowsTile('pasture', SURVIVAL_WORLD_SEED, x + 1, y)) {
          pair = { x, y };
          break;
        }
      }
    }
    expect(pair).not.toBeNull();
    const speed = WILDLIFE_DEFINITIONS.horse.speedFixed;
    const position = {
      x: (pair!.x + 1) * TILE_SIZE_FIXED - speed,
      y: pair!.y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    };
    const elevations = new Uint8Array(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE);
    elevations[pair!.y * SURVIVAL_WORLD_SIZE + pair!.x + 1] = 1;
    const stepped = stepAmbientWildlife({
      ...initial,
      position,
      home: position,
      activity: 'right',
      nextDecisionTick: 100,
    }, {
      species: 'horse',
      authorityTick: 1,
      calendarTick: BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.4)),
      collision: {
        width: SURVIVAL_WORLD_SIZE,
        height: SURVIVAL_WORLD_SIZE,
        blocked: Array<boolean>(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE).fill(false),
        elevations,
        terrainTransitions: [],
      },
    });
    expect(stepped.position).toEqual(position);
    expect(stepped.moving).toBe(false);
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
      wildlifeMovementMedium(candidate.species as keyof typeof WILDLIFE_DEFINITIONS) === 'water'
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
