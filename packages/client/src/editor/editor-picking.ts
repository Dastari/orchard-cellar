import {
  PROCEDURAL_WORLD_CHUNK_TILES,
  TILE_SIZE_PIXELS,
  floorDiv,
} from "@orchard/sim";
import {
  terrainElevationAt,
  terrainMaximumElevation,
  terrainProjectedRowsPerLevel,
  type TerrainArray,
} from "../render/terrain.js";
import {
  raisedTerrainDepthEntries,
  raisedTerrainDepthLayers,
} from "../render/raised-terrain-depth.js";
import {
  sortWorldDepthItems,
  type WorldDepthItem,
} from "../render/renderer.js";

export interface EditorTerrainHit {
  readonly tileX: number;
  readonly tileY: number;
  /** Projection/contour plane under the pointer. A cliff-face destination can
   * belong to L4 while its logical terrain cell remains at L3. */
  readonly elevation: number;
}

interface EditorTerrainHitCandidate extends Pick<
  WorldDepthItem,
  "footY" | "depthOffset" | "elevationLayer" | "depthPhase" | "tie"
> {
  readonly hit: EditorTerrainHit;
}

function terrainHitAtElevation(
  terrain: TerrainArray,
  projectedWorldX: number,
  projectedWorldY: number,
  elevation: number,
): EditorTerrainHit | null {
  const tileX = Math.floor(projectedWorldX / TILE_SIZE_PIXELS);
  const projection =
    elevation * terrainProjectedRowsPerLevel() * TILE_SIZE_PIXELS;
  const tileY = Math.floor((projectedWorldY + projection) / TILE_SIZE_PIXELS);
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= terrain.width ||
    tileY >= terrain.height
  )
    return null;
  return { tileX, tileY, elevation: terrainElevationAt(terrain, tileX, tileY) };
}

/** Reverses the same projection and painter ordering as the world renderer.
 * This includes visible cliff destinations which do not contain a walkable
 * surface at that projected coordinate. */
export function topmostEditorTerrainHit(
  terrain: TerrainArray,
  projectedWorldX: number,
  projectedWorldY: number,
): EditorTerrainHit | null {
  const candidates: EditorTerrainHitCandidate[] = [];
  const projectionRows = terrainProjectedRowsPerLevel();
  for (
    let elevation = terrainMaximumElevation(terrain);
    elevation >= 0;
    elevation -= 1
  ) {
    const hit = terrainHitAtElevation(
      terrain,
      projectedWorldX,
      projectedWorldY,
      elevation,
    );
    if (hit?.elevation !== elevation) continue;
    candidates.push({
      hit,
      footY: (hit.tileY + 1 - elevation * projectionRows) * TILE_SIZE_PIXELS,
      elevationLayer: elevation,
      depthPhase: "surface",
      tie: `0-editor-surface:${elevation}:${hit.tileY}:${hit.tileX}`,
    });
  }
  const tileX = Math.floor(projectedWorldX / TILE_SIZE_PIXELS);
  const projectedTileY = Math.floor(projectedWorldY / TILE_SIZE_PIXELS);
  for (
    let contourLevel = 1;
    contourLevel <= terrainMaximumElevation(terrain);
    contourLevel += 1
  ) {
    const sourceTileY = projectedTileY + contourLevel * projectionRows;
    const entry = raisedTerrainDepthEntries(
      terrain,
      tileX,
      sourceTileY,
      tileX,
      sourceTileY,
    ).find((candidate) => candidate.contourLevel === contourLevel);
    if (entry === undefined) continue;
    for (const layer of raisedTerrainDepthLayers(entry)) {
      candidates.push({
        hit: {
          tileX: entry.tileX,
          tileY: entry.tileY,
          elevation: entry.contourLevel,
        },
        footY: entry.footY,
        depthOffset: entry.depthOffset,
        elevationLayer: layer.elevationLayer,
        depthPhase: layer.depthPhase,
        tie: `0-terrain:${entry.contourLevel}:${layer.stratum}:${entry.tileY}:${entry.tileX}`,
      });
    }
  }
  return sortWorldDepthItems(candidates).at(-1)?.hit ?? null;
}

/** Once a stroke starts, keep pointer samples on that logical editing plane.
 * This prevents a drag across overlapping projections from hopping contours. */
export function editorTerrainHitOnPlane(
  terrain: TerrainArray,
  projectedWorldX: number,
  projectedWorldY: number,
  elevation: number,
): EditorTerrainHit | null {
  return terrainHitAtElevation(
    terrain,
    projectedWorldX,
    projectedWorldY,
    elevation,
  );
}

/** Pick a signed procedural world without allowing an elevated apron hidden
 * behind an ungenerated chunk veil to steal the click. Generated visual
 * surfaces retain full inverse projection; ungenerated cells use the flat
 * chunk grid the editor actually shows. */
export function proceduralEditorTerrainHit(
  terrain: TerrainArray,
  projectedWorldX: number,
  projectedWorldY: number,
  compositionMinTileX: number,
  compositionMinTileY: number,
  generatedChunkKeys: ReadonlySet<string>,
  lockedElevation?: number,
): EditorTerrainHit {
  const localProjectedX =
    projectedWorldX - compositionMinTileX * TILE_SIZE_PIXELS;
  const localProjectedY =
    projectedWorldY - compositionMinTileY * TILE_SIZE_PIXELS;
  const localHit =
    lockedElevation === undefined
      ? topmostEditorTerrainHit(terrain, localProjectedX, localProjectedY)
      : editorTerrainHitOnPlane(
          terrain,
          localProjectedX,
          localProjectedY,
          lockedElevation,
        );
  if (localHit !== null) {
    const tileX = compositionMinTileX + localHit.tileX;
    const tileY = compositionMinTileY + localHit.tileY;
    const chunkX = floorDiv(tileX, PROCEDURAL_WORLD_CHUNK_TILES);
    const chunkY = floorDiv(tileY, PROCEDURAL_WORLD_CHUNK_TILES);
    if (generatedChunkKeys.has(`${chunkX},${chunkY}`)) {
      return { tileX, tileY, elevation: localHit.elevation };
    }
  }
  return {
    tileX: Math.floor(projectedWorldX / TILE_SIZE_PIXELS),
    tileY: Math.floor(projectedWorldY / TILE_SIZE_PIXELS),
    elevation: 0,
  };
}
