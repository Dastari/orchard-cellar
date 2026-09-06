import { BIOME_COLORS, SURVIVAL_BIOMES, type TerrainArray } from '@orchard/engine/terrain';

export interface EditorMapContentBounds {
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
}

export interface EditorMapOverviewRaster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly minimumElevation: number;
  readonly maximumElevation: number;
  readonly contentBounds: EditorMapContentBounds;
}

export interface EditorMapOverviewBaseTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly biome: number;
  readonly elevation: number;
}

export interface EditorMapOverviewLayerPixels {
  readonly generatedBase: Uint8ClampedArray;
  readonly terrainOverrides: Uint8ClampedArray;
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

const BIOME_CHANNELS = BIOME_COLORS.map(colorChannels);

function writeOverviewPixel(
  pixels: Uint8ClampedArray,
  offset: number,
  biome: number,
  elevation: number,
  minimumElevation: number,
  maximumElevation: number,
): void {
  const color = BIOME_CHANNELS[biome] ?? BIOME_CHANNELS[0]!;
  const elevationSpan = Math.max(1, maximumElevation - minimumElevation);
  const elevationRatio = (elevation - minimumElevation) / elevationSpan;
  const factor = 0.82 + elevationRatio * 0.18;
  pixels[offset] = Math.round(color[0] * factor);
  pixels[offset + 1] = Math.round(color[1] * factor);
  pixels[offset + 2] = Math.round(color[2] * factor);
  pixels[offset + 3] = 255;
}

/** Splits an already compiled semantic overview without compiling terrain a
 * second time. Authored cells retain their exact combined pixels in the
 * overlay; only those sparse locations are regenerated in the base copy. */
export function splitEditorMapOverviewLayers(
  raster: EditorMapOverviewRaster,
  generatedBaseTiles: Iterable<EditorMapOverviewBaseTile>,
): EditorMapOverviewLayerPixels {
  const generatedBase = raster.pixels.slice();
  const terrainOverrides = new Uint8ClampedArray(raster.pixels.length);
  for (const tile of generatedBaseTiles) {
    if (!Number.isInteger(tile.tileX) || !Number.isInteger(tile.tileY)
      || tile.tileX < 0 || tile.tileY < 0
      || tile.tileX >= raster.width || tile.tileY >= raster.height) continue;
    const offset = (tile.tileY * raster.width + tile.tileX) * 4;
    terrainOverrides[offset] = raster.pixels[offset]!;
    terrainOverrides[offset + 1] = raster.pixels[offset + 1]!;
    terrainOverrides[offset + 2] = raster.pixels[offset + 2]!;
    terrainOverrides[offset + 3] = raster.pixels[offset + 3]!;
    writeOverviewPixel(
      generatedBase,
      offset,
      tile.biome,
      tile.elevation,
      raster.minimumElevation,
      raster.maximumElevation,
    );
  }
  return { generatedBase, terrainOverrides };
}

/** One semantic pixel per map tile. This is deliberately independent of the
 * finite detailed world pass and cheap enough to redraw as a single bitmap at
 * distant zooms. Elevation shading keeps major authored landforms legible. */
export function editorMapOverviewRaster(terrain: TerrainArray): EditorMapOverviewRaster {
  const pixels = new Uint8ClampedArray(terrain.width * terrain.height * 4);
  const oceanBiome = SURVIVAL_BIOMES.indexOf('water');
  let minimumTileX = terrain.width;
  let minimumTileY = terrain.height;
  let maximumTileX = -1;
  let maximumTileY = -1;
  let minimumElevation = 0;
  let maximumElevation = 0;
  for (const elevation of terrain.elevations) {
    minimumElevation = Math.min(minimumElevation, elevation);
    maximumElevation = Math.max(maximumElevation, elevation);
  }
  for (let index = 0; index < terrain.width * terrain.height; index += 1) {
    const biome = terrain.biomes[index] ?? 0;
    const elevation = terrain.elevations[index] ?? 0;
    const offset = index * 4;
    writeOverviewPixel(pixels, offset, biome, elevation, minimumElevation, maximumElevation);
    if (biome !== oceanBiome) {
      const tileX = index % terrain.width;
      const tileY = Math.floor(index / terrain.width);
      minimumTileX = Math.min(minimumTileX, tileX);
      minimumTileY = Math.min(minimumTileY, tileY);
      maximumTileX = Math.max(maximumTileX, tileX);
      maximumTileY = Math.max(maximumTileY, tileY);
    }
  }
  const margin = 12;
  const hasContent = maximumTileX >= minimumTileX && maximumTileY >= minimumTileY;
  const tileX = hasContent ? Math.max(0, minimumTileX - margin) : 0;
  const tileY = hasContent ? Math.max(0, minimumTileY - margin) : 0;
  const maximumX = hasContent ? Math.min(terrain.width - 1, maximumTileX + margin) : terrain.width - 1;
  const maximumY = hasContent ? Math.min(terrain.height - 1, maximumTileY + margin) : terrain.height - 1;
  return {
    width: terrain.width,
    height: terrain.height,
    pixels,
    minimumElevation,
    maximumElevation,
    contentBounds: {
      tileX,
      tileY,
      width: maximumX - tileX + 1,
      height: maximumY - tileY + 1,
    },
  };
}
