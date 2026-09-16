import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { emptyTickUpdateCounters, recordTickRowScan, recordTickRowTouch } from './scalability.js';

// Exercise the real tick body against an in-memory database, the same way the
// mining authority tests do. Only the context-bound lookups are stubbed.
const source = ts.createSourceFile(
  'index.ts',
  readFileSync(new URL('./index.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === 'waterCropsInTheRain');
if (!declaration) throw new Error('waterCropsInTheRain missing');

const registry = sim.bootstrapContentRegistry();
const grape = sim.runtimeCropDefinition(registry, 'grape')!;
const TOPSIDE = 0;
const CELLAR = 40_001;

interface SoilRow {
  id: string;
  spaceId: number;
  watered: boolean;
  wateredAtTick: bigint;
}
interface CropRow {
  id: string;
  spaceId: number;
  owner: { toHexString: () => string };
  cropKind: string;
  tileX: number;
  tileY: number;
  growthTicks: bigint;
  growthUpdatedAtTick: bigint;
}

function fixture(options: {
  readonly spaceId?: number;
  readonly watered?: boolean;
  readonly wateredAtTick?: bigint;
  readonly sprinklerTile?: { readonly tileX: number; readonly tileY: number };
} = {}) {
  const spaceId = options.spaceId ?? TOPSIDE;
  const owner = { toHexString: () => 'farmer' };
  const soil: SoilRow = {
    id: `${spaceId}:20:20`,
    spaceId,
    watered: options.watered ?? true,
    wateredAtTick: options.wateredAtTick ?? 0n,
  };
  const crop: CropRow = {
    id: soil.id,
    spaceId,
    owner,
    cropKind: 'grape',
    tileX: 20,
    tileY: 20,
    growthTicks: 0n,
    growthUpdatedAtTick: 0n,
  };
  const placeables = options.sprinklerTile === undefined ? [] : [{
    kind: 'sprinkler', carriedBy: undefined, spaceId, ...options.sprinklerTile,
  }];
  const ctx = {
    db: {
      world_crop: {
        iter: () => [crop],
        id: { update: (row: CropRow) => Object.assign(crop, row) },
      },
      world_soil: {
        id: {
          find: (id: string) => id === soil.id ? soil : null,
          update: (row: SoilRow) => Object.assign(soil, row),
        },
      },
      world_placeable: { by_chunk: { filter: () => placeables } },
    },
  };
  const counters = emptyTickUpdateCounters();
  const dependencies = {
    contentRegistry: () => registry,
    TREE_REGROWTH_SWEEP_TICKS: sim.TREE_REGROWTH_SWEEP_TICKS,
    CROP_WATERING_TICKS: sim.CROP_WATERING_TICKS,
    cropCalendarOffset: () => 0n,
    activeSpaceDefinition: (_ctx: unknown, id: number) => sim.spaceDefinitionFor(id, {
      spaceId: 40_000 - 1, residenceSpaceId: 40_000, ownerName: 'farmer', sizeTier: 0,
    }),
    instanceForSpace: () => null,
    effectiveSpaceAdminBoolean: () => undefined,
    spaceReceivesRain: sim.spaceReceivesRain,
    cropDefinitionForHomestead: () => grape,
    cropGreenhouseProtected: () => false,
    rainWateringDue: sim.rainWateringDue,
    runtimeObjectIrrigatesTile: (
      _registry: unknown,
      object: { readonly tileX: number; readonly tileY: number },
      tileX: number,
      tileY: number,
    ) => Math.max(Math.abs(tileX - object.tileX), Math.abs(tileY - object.tileY)) <= 1,
    cropGrowthAt: sim.cropGrowthAt,
    recordTickRowScan,
    recordTickRowTouch,
  };
  const run = new Function(
    ...Object.keys(dependencies),
    `${ts.transpileModule(`${declaration!.getText(source)}\nreturn waterCropsInTheRain;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText}`,
  )(...Object.values(dependencies));
  return { soil, crop, counters, rain: (tick: bigint) => run(ctx, tick, counters) };
}

describe('rain watering authority', () => {
  it('waters an open-air crop whose window has lapsed and settles its growth first', () => {
    const rainTick = sim.CROP_WATERING_TICKS + 5_000n;
    const f = fixture({ watered: true, wateredAtTick: 0n });
    f.rain(rainTick);
    expect(f.soil).toMatchObject({ watered: true, wateredAtTick: rainTick });
    // The whole lapsed window is banked rather than discarded by the stamp.
    expect(f.crop.growthTicks).toBe(sim.CROP_WATERING_TICKS);
    expect(f.crop.growthUpdatedAtTick).toBe(rainTick);
    expect(f.counters.rowsTouched).toBe(2);
    expect(f.counters.soilRowsScanned).toBe(1);
  });

  it('leaves a still-wet tile alone so a shower writes no redundant rows', () => {
    const rainTick = sim.CROP_WATERING_TICKS + 5_000n;
    const f = fixture({ watered: true, wateredAtTick: rainTick });
    f.rain(rainTick);
    expect(f.soil.wateredAtTick).toBe(rainTick);
    expect(f.crop.growthUpdatedAtTick).toBe(0n);
    expect(f.counters.rowsTouched).toBe(0);
  });

  it('never reaches a crop underground', () => {
    const rainTick = sim.CROP_WATERING_TICKS + 5_000n;
    const f = fixture({ spaceId: CELLAR, watered: false, wateredAtTick: 0n });
    f.rain(rainTick);
    expect(f.soil).toMatchObject({ watered: false, wateredAtTick: 0n });
    expect(f.counters.rowsTouched).toBe(0);
  });

  it('keeps the continuous growth a sprinkler already grants the tile', () => {
    const rainTick = sim.CROP_WATERING_TICKS + 5_000n;
    const f = fixture({
      watered: false, wateredAtTick: 0n, sprinklerTile: { tileX: 20, tileY: 21 },
    });
    f.rain(rainTick);
    // Irrigated tiles grow for the whole interval, not just one watering window.
    expect(f.crop.growthTicks).toBe(rainTick);
    expect(f.soil.wateredAtTick).toBe(rainTick);
  });
});
