import {
  activeSurvivalLandmarks,
  generateSurvivalLandmarkPathTiles,
  TOPSIDE_SPACE_ID,
  type ContentRegistry,
  type MapDocumentV3,
  type SurvivalCampPathTile,
} from '@orchard/sim';
import { drawInsetGround, type OverworldArt } from '@orchard/engine';

const landmarkPaths = new WeakMap<ContentRegistry, readonly SurvivalCampPathTile[]>();

/** Live landmark paths are a separate game ground pass, not worldSurface rows
 * or editable map cells. Use only verified content, with no bootstrap fallback. */
export function studioLiveGroundPathTiles(
  document: Pick<MapDocumentV3, 'id'>,
  registry: ContentRegistry | null,
  generatedBaseVisible: boolean,
): readonly SurvivalCampPathTile[] {
  if (!generatedBaseVisible || registry === null || document.id !== 'live-island') return [];
  let tiles = landmarkPaths.get(registry);
  if (tiles === undefined) {
    tiles = generateSurvivalLandmarkPathTiles(activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID), 'automated_campfire');
    landmarkPaths.set(registry, tiles);
  }
  return tiles;
}

export function drawStudioLiveGroundPaths(
  context: CanvasRenderingContext2D,
  art: Pick<OverworldArt, 'dirtTerrace' | 'farmlandGrassInset'>,
  document: Pick<MapDocumentV3, 'id'>,
  registry: ContentRegistry | null,
  generatedBaseVisible: boolean,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
  viewport: { readonly width: number; readonly height: number },
): number {
  const tiles = studioLiveGroundPathTiles(document, registry, generatedBaseVisible);
  if (tiles.length === 0) return 0;
  return drawInsetGround(context, art.dirtTerrace, art.farmlandGrassInset, tiles,
    camera.x, camera.y, camera.zoom, viewport.width, viewport.height);
}
