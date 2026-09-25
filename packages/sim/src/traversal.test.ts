import { describe, expect, it } from 'vitest';
import { RULE_MEDIA } from './rule-catalogue.js';
import { canTraverse, compareTraversalCollision, mediumHazardsAtTick, mediumTraversalCollision,
  resolveTraversalAbilities, type TraversalPolicy } from './traversal.js';
import { cellFlags } from './cell-flags.js';

// Test-only authored policy: these numbers are not live balance defaults.
const policy: TraversalPolicy = {
  land: { requiresAny: [['walk']], hazards: [] },
  shallow_water: { requiresAny: [['boat'], ['water_walk']], hazards: [] },
  deep_water: { requiresAny: [['boat'], ['water_walk']], hazards: [] },
  lava: { requiresAny: [['walk', 'lava_immune']], hazards: [
    { id: 'burn', maxHealthBasisPointsPerSecond: 7, intervalTicks: 3, immunityAbilities: ['lava_immune'] },
  ] },
  shroom_water: { requiresAny: [['boat'], ['water_walk']], hazards: [
    { id: 'toxin', maxHealthBasisPointsPerSecond: 5, intervalTicks: 2, immunityAbilities: ['toxin_immune'] },
  ] },
  void: { requiresAny: [], hazards: [] },
};
const abilities = (...values: string[]) => new Set(values);

describe('authored medium traversal', () => {
  it('evaluates all media with explicit AND/OR requirements', () => {
    expect(RULE_MEDIA.map(medium => canTraverse(medium, abilities('walk'), policy)))
      .toEqual([true, false, false, false, false, false]);
    expect(RULE_MEDIA.map(medium => canTraverse(medium, abilities('boat'), policy)))
      .toEqual([false, true, true, false, true, false]);
    expect(canTraverse('lava', abilities('lava_immune'), policy)).toBe(false);
    expect(canTraverse('lava', abilities('walk', 'lava_immune'), policy)).toBe(true);
    expect(canTraverse('void', abilities(...RULE_MEDIA, 'fly'), policy)).toBe(false);
    expect(canTraverse('void', abilities(), { ...policy, void: { requiresAny: [[]], hazards: [] } })).toBe(true);
  });

  it('replaces only explicitly listed mount grants and expires effects at their boundary', () => {
    const actor = { traversalAbilities: ['walk', 'lava_immune'] };
    const mount = { traversalAbilities: ['boat'], replacesAbilities: ['walk'] };
    const effects = [{ traversalAbilities: ['toxin_immune'], expiresAtTick: 8 }];
    expect([...resolveTraversalAbilities(actor, mount, effects, 7)])
      .toEqual(['lava_immune', 'boat', 'toxin_immune']);
    expect([...resolveTraversalAbilities(actor, mount, effects, 8)]).toEqual(['lava_immune', 'boat']);
    expect([...resolveTraversalAbilities(actor, null, effects, 8)]).toEqual(['walk', 'lava_immune']);
    expect(actor.traversalAbilities).toEqual(['walk', 'lava_immune']);
  });

  it('keeps access and damage immunity independent, on deterministic tick cadence', () => {
    expect(canTraverse('shroom_water', abilities('boat'), policy)).toBe(true);
    expect(mediumHazardsAtTick('shroom_water', abilities('boat'), policy, 2).map(h => h.id)).toEqual(['toxin']);
    expect(mediumHazardsAtTick('shroom_water', abilities('boat'), policy, 3)).toEqual([]);
    expect(mediumHazardsAtTick('shroom_water', abilities('boat', 'toxin_immune'), policy, 2)).toEqual([]);
    expect(mediumHazardsAtTick('lava', abilities('toxin_immune'), policy, 3).map(h => h.id)).toEqual(['burn']);
    expect(() => mediumHazardsAtTick('lava', abilities(), policy, -1)).toThrow('invalid_traversal_tick');
    expect(() => mediumHazardsAtTick('lava', abilities(), {
      ...policy, lava: { ...policy.lava, hazards: [{ ...policy.lava.hazards[0]!, intervalTicks: 0 }] },
    }, 3)).toThrow('invalid_medium_hazard');
  });

  it('retains geometry metadata while solids and malformed channels fail closed', () => {
    const elevations = new Int16Array([0, 0, 1, 1, 0]);
    const obstacles = [{ left: 0, top: 0, right: 2, bottom: 2 }];
    const legacy = { width: 5, height: 1, blocked: cellFlags([true, true, true, false, false]), elevations, obstacles };
    const channels = { width: 5, height: 1, medium: [0, 1, 1, 99, 0], solidBlocked: [0, 0, 1, 0] };
    const candidate = mediumTraversalCollision(legacy, channels, abilities('walk', 'boat'), policy);
    expect(candidate.blocked).toEqual(cellFlags([false, false, true, true, true]));
    expect(candidate.elevations).toBe(elevations);
    expect(candidate.obstacles).toBe(obstacles);
    expect(compareTraversalCollision(legacy, candidate)).toEqual([
      { index: 0, legacyBlocked: true, mediumBlocked: false },
      { index: 1, legacyBlocked: true, mediumBlocked: false },
      { index: 3, legacyBlocked: false, mediumBlocked: true },
      { index: 4, legacyBlocked: false, mediumBlocked: true },
    ]);
    expect(legacy.blocked).toEqual(cellFlags([true, true, true, false, false]));
    expect(() => mediumTraversalCollision(legacy, { ...channels, width: 4 }, abilities(), policy))
      .toThrow('traversal_collision_size_mismatch');
    expect(() => compareTraversalCollision(legacy, { ...candidate, height: 2 }))
      .toThrow('traversal_collision_size_mismatch');
  });
});
