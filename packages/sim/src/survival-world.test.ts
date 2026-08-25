import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_BIOMES,
  SURVIVAL_SETTLEMENT_FIRST_TILE,
  SURVIVAL_TREE_KINDS,
  createSurvivalCollisionMap,
  generateSurvivalResources,
  generatedSurvivalResourceAt,
  isChoppableTreeKind,
  survivalBiomeAt,
  survivalBiomeBlocksMovement,
  survivalClearingAt,
  survivalClearings,
  survivalSpawnPosition,
  survivalStreamAt,
  survivalTreeObstacle,
  survivalTrailAt,
  survivalTerrainBytes,
  survivalTreeKindAt,
  survivalWaterfallAt,
  type SurvivalBiome,
} from './survival-world.js';

describe('deterministic survival island', () => {
  it('is byte-identical for one seed and differs for another', () => {
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED)).toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED + 1)).not.toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
  });

  it('surrounds the world with water and includes every biome at useful scale', () => {
    expect(SURVIVAL_WORLD_SIZE).toBe(320);
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
      expect(count, biome).toBeGreaterThan(biome === 'waterfall' ? 10 : 40);
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
          expect(biome === 'waterfall' || biome === 'plains').toBe(true);
        }
      }
    }
    expect(streamTiles).toBeGreaterThan(350);
    expect(waterfallTiles).toBe(15);
    expect(counts.get('freshwater')).toBeGreaterThan(500);
    expect(counts.get('desert_ridge')).toBeGreaterThan(100);
    expect(counts.get('coastal_cliff')).toBeGreaterThan(250);
    expect(counts.get('savanna')).toBeGreaterThan(2_000);
    expect(counts.get('oasis_water')).toBeGreaterThan(30);
    expect(counts.get('oasis')).toBeGreaterThan(100);
  });

  it('keeps all 25 spawn clearings walkable and free of generated resources', () => {
    expect(survivalClearings()).toHaveLength(25);
    for (const clearing of survivalClearings()) {
      expect(survivalSpawnPosition(clearing.slot)).not.toBeNull();
      for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
        if (dx * dx + dy * dy > 25) continue;
        expect(survivalClearingAt(clearing.tileX + dx, clearing.tileY + dy)?.slot).toBe(clearing.slot);
        expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, clearing.tileX + dx, clearing.tileY + dy)).toBe('plains');
        expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, clearing.tileX + dx, clearing.tileY + dy)).toBeNull();
      }
    }
    expect(survivalSpawnPosition(25)).toBeNull();
  });

  it('connects all 25 clearings with walkable resource-free trails', () => {
    const collision = createSurvivalCollisionMap();
    const clearings = survivalClearings();
    const first = clearings[0];
    if (!first) throw new Error('missing first clearing');
    const visited = new Set([`${first.tileX},${first.tileY}`]);
    const queue = [{ x: first.tileX, y: first.tileY }];
    for (let index = 0; index < queue.length; index += 1) {
      const point = queue[index];
      if (!point) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const x = point.x + dx;
        const y = point.y + dy;
        const key = `${x},${y}`;
        if (visited.has(key) || collision.blocked[y * collision.width + x]) continue;
        visited.add(key);
        queue.push({ x, y });
      }
    }
    expect(clearings.every((clearing) => visited.has(`${clearing.tileX},${clearing.tileY}`))).toBe(true);
    const firstTile = SURVIVAL_SETTLEMENT_FIRST_TILE;
    expect(survivalTrailAt(firstTile + 12, firstTile)).toBe(true);
    expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, firstTile + 12, firstTile)).toBeNull();
    expect(survivalTrailAt(firstTile - 1, firstTile + 12)).toBe(true);
    expect(generatedSurvivalResourceAt(SURVIVAL_WORLD_SEED, firstTile - 1, firstTile + 12)).toBeNull();
  });

  it('adds narrow live trunk obstacles and removes depleted trunks', () => {
    const resource = generateSurvivalResources()[0];
    expect(resource).toBeDefined();
    if (!resource) return;
    const index = resource.tileY * SURVIVAL_WORLD_SIZE + resource.tileX;
    const live = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: false }]);
    const depleted = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: true }]);
    expect(live.blocked[index]).toBe(
      survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, resource.tileX, resource.tileY)),
    );
    expect(live.obstacles).toEqual([survivalTreeObstacle(resource.tileX, resource.tileY)]);
    expect(depleted.obstacles).toEqual([]);
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
    expect(survivalBiomeBlocksMovement('forest')).toBe(false);
  });

  it('creates dense mixed-species forests whose trees are all choppable', () => {
    const resources = generateSurvivalResources();
    const kinds = new Map(SURVIVAL_TREE_KINDS.map((kind) => [kind, 0]));
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
      const minimum = kind === 'tree_palm' ? 10 : kind === 'tree_acacia' ? 50 : 100;
      expect(count, kind).toBeGreaterThan(minimum);
    }
  });
});
