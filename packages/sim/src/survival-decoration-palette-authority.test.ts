import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type {
  SpaceContentDefinition,
  SpaceDecorationGeneratorDefinition,
} from './content/world-definition.js';
import {
  generateSurvivalDecorations,
  generateSurvivalProceduralDecorations,
  generateSurvivalResources,
  SURVIVAL_WORLD_SEED,
} from './survival-world.js';

const bootstrap = bootstrapContentRegistry();
const island = [...bootstrap.spaces.values()].find((space) => space.generator === 'island')!;

function decorationDigest(rows: ReturnType<typeof generateSurvivalDecorations>): string {
  let hash = 2_166_136_261;
  for (const row of rows) {
    const value = [
      row.id, row.kind, row.tileX, row.tileY, row.variant, row.animationOffset, row.role ?? '',
    ].join('|');
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function spacesWith(replacement: SpaceContentDefinition, keepOriginal = false) {
  const spaces = new Map(bootstrap.spaces);
  if (!keepOriginal) spaces.delete(island.id);
  spaces.set(replacement.id, replacement);
  return spaces;
}

describe('authored survival decoration palette authority', () => {
  it('preserves the reviewed generated decoration fixture exactly', () => {
    const rows = generateSurvivalDecorations(SURVIVAL_WORLD_SEED, bootstrap);
    expect(rows).toHaveLength(7_457);
    expect(decorationDigest(rows)).toBe('fc383db2');
  });

  it('preserves ids, coordinates, variants, and resources when every procedural kind is renamed', () => {
    const source = island.decorationGenerator!;
    const rename = (kind: string): string => `renamed_${kind}`;
    const renameEntries = (entries: typeof source[0]) => entries.map(([kind, value]) => (
      [rename(kind), value] as const
    ));
    const generator = [
      renameEntries(source[0]),
      source[1].map(rename),
      renameEntries(source[2]),
      rename(source[3]),
      renameEntries(source[4]),
      [rename(source[5][0]), rename(source[5][1]), source[5][2]],
      renameEntries(source[6]),
    ] as const satisfies SpaceDecorationGeneratorDefinition;
    const renamedIsland = {
      ...island,
      id: 'space:renamed_survival_palette',
      decorationGenerator: generator,
    } satisfies SpaceContentDefinition;
    const paletteKinds = new Set([...source[0].map(([kind]) => kind), ...source[1]]);
    const resources = new Map([...bootstrap.resources].map(([id, definition]) => [id, {
      ...definition,
      tags: definition.tags.map((tag) => {
        const prefix = 'generator.decoration.';
        if (!tag.startsWith(prefix)) return tag;
        const kind = tag.slice(prefix.length);
        return paletteKinds.has(kind) ? `${prefix}${rename(kind)}` : tag;
      }),
    }] as const));
    const registry = { ...bootstrap, resources, spaces: spacesWith(renamedIsland) };
    const original = generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, bootstrap);
    const renamed = generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, registry);

    expect(renamed.map(({ id, tileX, tileY, variant, animationOffset }) => ({
      id, tileX, tileY, variant, animationOffset,
    }))).toEqual(original.map(({ id, tileX, tileY, variant, animationOffset }) => ({
      id, tileX, tileY, variant, animationOffset,
    })));
    expect(renamed.map(({ kind }) => kind)).toEqual(original.map(({ kind }) => rename(kind)));
    expect(generateSurvivalResources(SURVIVAL_WORLD_SEED, registry))
      .toEqual(generateSurvivalResources(SURVIVAL_WORLD_SEED, bootstrap));
  });

  it('fails neutral for missing, retired, ambiguous, and invalid palette metadata', () => {
    const withoutGenerator = { ...island };
    delete withoutGenerator.decorationGenerator;
    expect(generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, {
      ...bootstrap, spaces: spacesWith(withoutGenerator),
    })).toEqual([]);
    expect(generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, {
      ...bootstrap, spaces: spacesWith({ ...island, retired: true }),
    })).toEqual([]);
    const duplicate = {
      ...island,
      id: 'space:duplicate_survival_palette',
      spaceId: 9_101,
    } satisfies SpaceContentDefinition;
    expect(generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, {
      ...bootstrap, spaces: spacesWith(duplicate, true),
    })).toEqual([]);
    const invalid = {
      ...island,
      id: 'space:invalid_survival_palette',
      decorationGenerator: [
        [...island.decorationGenerator![0], island.decorationGenerator![0][0]!],
        ...island.decorationGenerator!.slice(1),
      ] as unknown as SpaceDecorationGeneratorDefinition,
    } satisfies SpaceContentDefinition;
    expect(generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, {
      ...bootstrap, spaces: spacesWith(invalid),
    })).toEqual([]);
  });
});
