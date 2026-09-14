import {
  primeTerrainElevationRange,
  terrainMaximumElevation,
  terrainMinimumElevation,
  type TerrainArray,
} from '@orchard/engine/terrain';
import type { GeneratedSurvivalResource, TerrainOverride } from '@orchard/sim';
import type {
  MapEditorOverviewPixels,
  MapEditorTerrainDerivatives,
  MapEditorTerrainInfluenceRun,
} from './editor-terrain-derivatives.js';

interface SparseTerrainOverride {
  readonly index: number;
  readonly value: TerrainOverride;
}

export type MapEditorTerrainWire = Omit<
  TerrainArray,
  'blocked' | 'horseJumpableTerrain' | 'terrainOverrides' | 'tilesets'
> & {
  readonly blocked: Uint8Array;
  readonly horseJumpableTerrain: Uint8Array;
  readonly terrainOverrides?: readonly SparseTerrainOverride[];
  readonly minimumElevation: number;
  readonly maximumElevation: number;
};

export interface MapEditorTerrainDerivativesWire {
  readonly generatedResources?: readonly GeneratedSurvivalResource[];
  readonly overview: MapEditorOverviewPixels;
  readonly generatedBaseTerrain?: MapEditorTerrainWire;
  readonly generatedBaseSharesCombined: boolean;
  readonly generatedBaseTerrainKey: string;
  readonly terrainOverrideInfluenceRuns: readonly MapEditorTerrainInfluenceRun[];
}

function copiedTypedArrays(terrain: TerrainArray): Pick<
  TerrainArray,
  'biomes' | 'elevations' | 'dirtCliffRoles' | 'dirtTerraces'
  | 'rogueHazards' | 'cliffFamilies' | 'surfaceFamilies' | 'ledges'
  | 'authoredFarmland' | 'terrainPlaneBlocked'
> {
  return {
    biomes: terrain.biomes.slice(),
    elevations: terrain.elevations.slice(),
    dirtCliffRoles: terrain.dirtCliffRoles.slice(),
    dirtTerraces: terrain.dirtTerraces.slice(),
    ...(terrain.rogueHazards === undefined ? {} : { rogueHazards: terrain.rogueHazards.slice() }),
    ...(terrain.cliffFamilies === undefined ? {} : { cliffFamilies: terrain.cliffFamilies.slice() }),
    ...(terrain.surfaceFamilies === undefined ? {} : { surfaceFamilies: terrain.surfaceFamilies.slice() }),
    ...(terrain.ledges === undefined ? {} : { ledges: terrain.ledges.slice() }),
    ...(terrain.authoredFarmland === undefined
      ? {} : { authoredFarmland: terrain.authoredFarmland.slice() }),
    ...(terrain.terrainPlaneBlocked === undefined
      ? {} : { terrainPlaneBlocked: terrain.terrainPlaneBlocked.slice() }),
  };
}

/** Packs the two million-element JavaScript arrays into transferable bytes.
 * Sending those arrays through structured clone was itself a ~900 ms main
 * thread task, defeating the terrain worker. Sparse overrides receive the
 * same treatment instead of cloning an almost entirely-null array. */
export function encodeMapEditorTerrain(terrain: TerrainArray): {
  readonly wire: MapEditorTerrainWire;
  readonly transfer: ArrayBuffer[];
} {
  const scalars = { ...terrain };
  Reflect.deleteProperty(scalars, 'blocked');
  Reflect.deleteProperty(scalars, 'horseJumpableTerrain');
  Reflect.deleteProperty(scalars, 'terrainOverrides');
  Reflect.deleteProperty(scalars, 'tilesets');
  const portableScalars = scalars as Omit<
    TerrainArray,
    'blocked' | 'horseJumpableTerrain' | 'terrainOverrides' | 'tilesets'
  >;
  const typed = copiedTypedArrays(terrain);
  const blocked = Uint8Array.from(terrain.blocked, Number);
  const horseJumpableTerrain = Uint8Array.from(terrain.horseJumpableTerrain, Number);
  const terrainOverrides = terrain.terrainOverrides === undefined ? undefined
    : terrain.terrainOverrides.flatMap((value, index) => value === null ? [] : [{ index, value }]);
  const wire: MapEditorTerrainWire = {
    ...portableScalars,
    ...typed,
    blocked,
    horseJumpableTerrain,
    minimumElevation: terrainMinimumElevation(terrain),
    maximumElevation: terrainMaximumElevation(terrain),
    ...(terrainOverrides === undefined ? {} : { terrainOverrides }),
  };
  const transfer = [
    wire.biomes.buffer,
    wire.elevations.buffer,
    wire.blocked.buffer,
    wire.horseJumpableTerrain.buffer,
    wire.dirtCliffRoles.buffer,
    wire.dirtTerraces.buffer,
    wire.rogueHazards?.buffer,
    wire.cliffFamilies?.buffer,
    wire.surfaceFamilies?.buffer,
    wire.ledges?.buffer,
    wire.authoredFarmland?.buffer,
    wire.terrainPlaneBlocked?.buffer,
  ].filter((buffer): buffer is ArrayBuffer => buffer !== undefined);
  return { wire, transfer };
}

export function encodeMapEditorTerrainDerivatives(
  derivatives: MapEditorTerrainDerivatives,
  combinedTerrain: TerrainArray,
): {
  readonly wire: MapEditorTerrainDerivativesWire;
  readonly transfer: ArrayBuffer[];
} {
  const sharesCombined = derivatives.generatedBaseTerrain === combinedTerrain;
  const generatedBase = sharesCombined
    ? undefined
    : encodeMapEditorTerrain(derivatives.generatedBaseTerrain);
  const wire: MapEditorTerrainDerivativesWire = {
    overview: derivatives.overview,
    generatedResources: derivatives.generatedResources,
    generatedBaseSharesCombined: sharesCombined,
    ...(generatedBase === undefined ? {} : { generatedBaseTerrain: generatedBase.wire }),
    generatedBaseTerrainKey: derivatives.generatedBaseTerrainKey,
    terrainOverrideInfluenceRuns: derivatives.terrainOverrideInfluenceRuns,
  };
  return {
    wire,
    transfer: [
      wire.overview.layers.combined.buffer as ArrayBuffer,
      wire.overview.layers.generated_base.buffer as ArrayBuffer,
      wire.overview.layers.terrain.buffer as ArrayBuffer,
      ...(generatedBase?.transfer ?? []),
    ],
  };
}

function decodedTerrain(
  wire: MapEditorTerrainWire,
  blocked: readonly boolean[],
  horseJumpableTerrain: readonly boolean[],
): TerrainArray {
  const terrain = { ...wire };
  Reflect.deleteProperty(terrain, 'blocked');
  Reflect.deleteProperty(terrain, 'horseJumpableTerrain');
  Reflect.deleteProperty(terrain, 'terrainOverrides');
  Reflect.deleteProperty(terrain, 'minimumElevation');
  Reflect.deleteProperty(terrain, 'maximumElevation');
  let expandedOverrides: (TerrainOverride | null)[] | undefined;
  if (wire.terrainOverrides !== undefined) {
    expandedOverrides = Array<TerrainOverride | null>(wire.width * wire.height).fill(null);
    for (const entry of wire.terrainOverrides) expandedOverrides[entry.index] = entry.value;
  }
  const decoded: TerrainArray = {
    ...(terrain as Omit<TerrainArray, 'blocked' | 'horseJumpableTerrain' | 'terrainOverrides'>),
    blocked,
    horseJumpableTerrain,
    ...(expandedOverrides === undefined ? {} : { terrainOverrides: expandedOverrides }),
  };
  primeTerrainElevationRange(decoded, wire.minimumElevation, wire.maximumElevation);
  return decoded;
}

export function decodeMapEditorTerrain(wire: MapEditorTerrainWire): TerrainArray {
  return decodedTerrain(
    wire,
    Array.from(wire.blocked, (value) => value !== 0),
    Array.from(wire.horseJumpableTerrain, (value) => value !== 0),
  );
}

export const MAP_EDITOR_TERRAIN_DECODE_CHUNK_SIZE = 32_768;
export const MAP_EDITOR_TERRAIN_DECODE_CANCELLED = 'studio_map_terrain_decode_cancelled';

/** Expands transferred traversal bytes without monopolising the UI thread.
 * These arrays are required by detailed ground rendering, but a distant map
 * overview does not justify a quarter-second synchronous Array.from. */
export function decodeMapEditorTerrainAsync(
  wire: MapEditorTerrainWire,
  shouldContinue: () => boolean = () => true,
): Promise<TerrainArray> {
  const blocked = Array<boolean>(wire.blocked.length);
  const horseJumpableTerrain = Array<boolean>(wire.horseJumpableTerrain.length);
  let offset = 0;
  return new Promise((resolve, reject) => {
    const decodeChunk = (): void => {
      if (!shouldContinue()) {
        reject(new Error(MAP_EDITOR_TERRAIN_DECODE_CANCELLED));
        return;
      }
      const end = Math.min(
        Math.max(wire.blocked.length, wire.horseJumpableTerrain.length),
        offset + MAP_EDITOR_TERRAIN_DECODE_CHUNK_SIZE,
      );
      for (let index = offset; index < end; index += 1) {
        if (index < wire.blocked.length) blocked[index] = wire.blocked[index] !== 0;
        if (index < wire.horseJumpableTerrain.length) {
          horseJumpableTerrain[index] = wire.horseJumpableTerrain[index] !== 0;
        }
      }
      offset = end;
      if (offset < Math.max(wire.blocked.length, wire.horseJumpableTerrain.length)) {
        setTimeout(decodeChunk, 0);
        return;
      }
      resolve(decodedTerrain(wire, blocked, horseJumpableTerrain));
    };
    setTimeout(decodeChunk, 0);
  });
}

export async function decodeMapEditorTerrainDerivativesAsync(
  wire: MapEditorTerrainDerivativesWire,
  combinedTerrain: TerrainArray,
  shouldContinue: () => boolean = () => true,
): Promise<MapEditorTerrainDerivatives> {
  if (!wire.generatedBaseSharesCombined && wire.generatedBaseTerrain === undefined) {
    throw new Error('studio_map_terrain_worker_missing_generated_base');
  }
  const generatedBaseTerrain = wire.generatedBaseSharesCombined
    ? combinedTerrain
    : await decodeMapEditorTerrainAsync(wire.generatedBaseTerrain!, shouldContinue);
  return {
    overview: wire.overview,
    generatedResources: wire.generatedResources,
    generatedBaseTerrain,
    generatedBaseTerrainKey: wire.generatedBaseTerrainKey,
    terrainOverrideInfluenceRuns: wire.terrainOverrideInfluenceRuns,
  };
}
