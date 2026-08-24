import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  createSurvivalCollisionMap,
  generateSurvivalResources,
  generatedSurvivalResourceAt,
  survivalBiomeAt,
  survivalBiomeBlocksMovement,
  survivalClearingAt,
  survivalClearings,
  survivalSpawnPosition,
  survivalTerrainBytes,
  type SurvivalBiome,
} from './survival-world.js';

describe('deterministic survival island', () => {
  it('is byte-identical for one seed and differs for another', () => {
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED)).toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
    expect(survivalTerrainBytes(SURVIVAL_WORLD_SEED + 1)).not.toEqual(survivalTerrainBytes(SURVIVAL_WORLD_SEED));
  });

  it('surrounds the world with water and includes every biome at useful scale', () => {
    for (let index = 0; index < SURVIVAL_WORLD_SIZE; index += 1) {
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, index, 0)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, index, SURVIVAL_WORLD_SIZE - 1)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, 0, index)).toBe('water');
      expect(survivalBiomeAt(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_SIZE - 1, index)).toBe('water');
    }
    const counts = new Map<SurvivalBiome, number>();
    for (const biome of ['water', 'beach', 'plains', 'meadow', 'forest', 'valley', 'highland', 'ridge'] as const) counts.set(biome, 0);
    for (const value of survivalTerrainBytes()) {
      const biome = (['water', 'beach', 'plains', 'meadow', 'forest', 'valley', 'highland', 'ridge'] as const)[value];
      if (biome) counts.set(biome, (counts.get(biome) ?? 0) + 1);
    }
    for (const [biome, count] of counts) expect(count, biome).toBeGreaterThan(40);
    expect([
      survivalBiomeAt(SURVIVAL_WORLD_SEED, 95, 10),
      survivalBiomeAt(SURVIVAL_WORLD_SEED, 63, 40),
      survivalBiomeAt(SURVIVAL_WORLD_SEED, 96, 13),
      survivalBiomeAt(SURVIVAL_WORLD_SEED, 108, 15),
      survivalBiomeAt(SURVIVAL_WORLD_SEED, 69, 37),
    ]).toEqual(['beach', 'forest', 'meadow', 'valley', 'highland']);
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

  it('adds live resource bases to terrain collision and removes depleted bases', () => {
    const resource = generateSurvivalResources()[0];
    expect(resource).toBeDefined();
    if (!resource) return;
    const index = resource.tileY * SURVIVAL_WORLD_SIZE + resource.tileX;
    expect(createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: false }]).blocked[index]).toBe(true);
    expect(createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [{ ...resource, depleted: true }]).blocked[index]).toBe(
      survivalBiomeBlocksMovement(survivalBiomeAt(SURVIVAL_WORLD_SEED, resource.tileX, resource.tileY)),
    );
    expect(survivalBiomeBlocksMovement('water')).toBe(true);
    expect(survivalBiomeBlocksMovement('ridge')).toBe(true);
    expect(survivalBiomeBlocksMovement('forest')).toBe(false);
  });
});
