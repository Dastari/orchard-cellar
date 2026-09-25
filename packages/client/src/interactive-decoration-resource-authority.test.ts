import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const painter = readFileSync(new URL('./gameplay-painter-decorations.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const topside = readFileSync(new URL('./topside-map-records.ts', import.meta.url), 'utf8');
const engineCollision = readFileSync(new URL('../../engine/src/collision.ts', import.meta.url), 'utf8');
const survival = readFileSync(new URL('../../sim/src/survival-world.ts', import.meta.url), 'utf8');
const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');

describe('authored interactive decoration resource wiring', () => {
  it('does not restore the legacy exact-kind classifier', () => {
    expect(painter).not.toContain('isInteractivePoiDecorationKind');
    expect(survival).not.toContain('isInteractivePoiDecorationKind');
  });

  it('uses the active registry mapping in both simulation and live painting', () => {
    expect(survival).toContain('decorationResources.get(decoration.kind)');
    expect(painter).toContain('survivalDecorationResource(decoration, snapshot.content.registry) !== null');
  });
});

describe('authored landmark decoration collision wiring', () => {
  it('keeps the production collision resolver free of exact-kind geometry branches', () => {
    const collisionSection = survival.slice(
      survival.indexOf('type DecorationCollisionFootprint'),
      survival.indexOf('/** Low, inland water can be cleared'),
    );
    expect(collisionSection).not.toMatch(/(?:decoration\.)?kind\s*===/u);
    expect(collisionSection).not.toContain('nature_water_rock');
    expect(collisionSection).not.toContain('fisher_dock');
    expect(collisionSection).not.toContain('farm_house');
    expect(collisionSection).not.toContain('camp_tent');
    expect(collisionSection).toContain('space.decorationCollision');
  });

  it('threads the active registry through live client and server collision consumers', () => {
    expect(painter).toMatch(/survivalDecorationBlocksTraversal\(\s*decoration\.kind, 'ground', snapshot\.content\.registry,/u);
    // Static world S4e: the elevated decoration occluders moved to topside-map-records.ts.
    expect(topside).toContain("survivalDecorationBlocksTraversal(decoration.kind, 'ground', registry)");
    expect(topside).toContain("survivalDecorationObstacle(decoration, 'ground', registry)");
    expect(main).toMatch(/topsideDecorationLightCasters\(topsideDecorations\(snapshot, seed\), topsideMapRecords\(snapshot\),\s*snapshot\.content\.registry,/u);
    expect(main.match(/survivalDecorationObstacle\(\s*decoration, '(?:ground|water)', snapshot\.content\.registry(?:,|\))/gu))
      .toHaveLength(2);
    expect(main.match(/liveMapObjectCollisionObstacles\(\s*liveDocument, '(?:ground|water)', snapshot\.content\.registry,/gu))
      .toHaveLength(2);
    expect(engineCollision).toContain('survivalDecorationObstacle(decoration, medium, contentRegistry)');
    expect(world).toContain('mapLandmarkCollisionObstacle(landmark, medium, registry)');
    expect(world).toContain('survivalDecorationObstacle(decoration, medium, registry)');
  });
});

describe('authored procedural decoration palette wiring', () => {
  it('does not restore compiled decoration catalogs, variant tables, or exact-kind choice branches', () => {
    expect(survival).not.toMatch(/SURVIVAL_(?:POI|NATURE|CAMP|FARM|FISHERMAN|DECORATION)_DECORATION/u);
    expect(survival).not.toContain('NATURE_VARIANT_COUNTS');
    expect(survival).not.toContain("add('nature_");
    expect(survival).not.toContain('mixed < 72');
    expect(survival).toContain('activeSurvivalDecorationGenerator(registry)');
    expect(survival).toContain('weightedDecorationKind(generator.pondWeights, roll)');
    expect(survival).toContain('weightedDecorationKind(generator.desertWeights, roll)');
  });

  it('threads live content while keeping only isolated no-space engine fixtures on bootstrap defaults', () => {
    expect(main).toContain('generateSurvivalProceduralDecorations(seed, snapshot.content.registry)');
    expect(main).toContain('generateSurvivalDecorations(seed, snapshot.content.registry)');
    expect(engineCollision).toContain('contentRegistry.spaces.size > 0');
    expect(engineCollision).toContain('generateSurvivalDecorations(terrain.seed, decorationRegistry)');
    expect(world).toContain('generateSurvivalProceduralDecorations(');
    expect(world).toContain('generateSurvivalDecorations(');
  });
});
