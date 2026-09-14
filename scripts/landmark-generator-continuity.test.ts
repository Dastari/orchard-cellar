import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateSurvivalDecorations,
  survivalAuthoredLandmarkDecorations,
  SURVIVAL_WORLD_SEED,
} from '../packages/sim/src/survival-world.js';

// Captured before replacing the three literal landmark generators. This is a
// continuity fixture, not a content-export fixture: never regenerate it merely
// because authored definitions changed. IDs, order and coordinates are durable.
const baseline = JSON.parse(readFileSync(new URL(
  '../packages/sim/src/fixtures/landmark-generator-continuity.json', import.meta.url,
), 'utf8')) as {
  readonly seed: number;
  readonly landmarks: readonly unknown[];
  readonly decorations: {
    readonly count: number;
    readonly sha256: string;
    readonly preRoleSha256: string;
  };
};

describe('authored landmark generator continuity', () => {
  it('preserves every original landmark row, id, position and ordering', () => {
    const historicalRow = ({
      id, kind, tileX, tileY, variant, animationOffset,
    }: {
      readonly id: number;
      readonly kind: string;
      readonly tileX: number;
      readonly tileY: number;
      readonly variant: number;
      readonly animationOffset: number;
    }) => ({ id, kind, tileX, tileY, variant, animationOffset });
    const rows = survivalAuthoredLandmarkDecorations();
    expect(['marlow_camp', 'farmer_bob_farm', 'fisherman_fin_camp']
      .map((groupId) => rows.filter((row) => row.groupId === groupId).map(historicalRow)))
      .toEqual(baseline.landmarks);
  });

  it('retains explicit authored group identity and presentation layers', () => {
    const groups = new Map<string, { label: string; layers: Set<string>; count: number }>();
    for (const row of survivalAuthoredLandmarkDecorations()) {
      const group = groups.get(row.groupId) ?? {
        label: row.groupLabel,
        layers: new Set<string>(),
        count: 0,
      };
      group.layers.add(row.layer);
      group.count += 1;
      groups.set(row.groupId, group);
    }
    expect([...groups].map(([id, group]) => ({
      id,
      label: group.label,
      layers: [...group.layers],
      count: group.count,
    }))).toEqual([
      { id: 'marlow_camp', label: "Marlow's Camp", layers: ['objects', 'ground'], count: 22 },
      { id: 'farmer_bob_farm', label: "Farmer Bob's Farm", layers: ['objects', 'ground', 'canopy'], count: 148 },
      { id: 'fisherman_fin_camp', label: "Fisherman Fin's Camp", layers: ['objects', 'ground'], count: 14 },
    ]);
  });

  it('preserves the complete seeded decoration stream through authored expansion', () => {
    expect(SURVIVAL_WORLD_SEED).toBe(baseline.seed);
    const decorations = generateSurvivalDecorations(baseline.seed);
    expect(decorations).toHaveLength(baseline.decorations.count);
    expect(createHash('sha256').update(JSON.stringify(decorations)).digest('hex'))
      .toBe(baseline.decorations.sha256);
    const withoutAuthoredRoles = JSON.stringify(
      decorations, (key, value: unknown) => key === 'role' ? undefined : value,
    );
    expect(createHash('sha256').update(withoutAuthoredRoles).digest('hex'))
      .toBe(baseline.decorations.preRoleSha256);
  });
});
