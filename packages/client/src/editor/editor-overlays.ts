import {
  PROCEDURAL_WORLD_CHUNK_TILES,
  mapCollisionAtPlane,
  type CompiledMapDocument,
  type MapDocumentV2,
  type MapPoint,
} from "@orchard/sim";
import {
  terrainPlaneCollisionCellAt,
  terrainProjectedRowsPerLevel,
  type TerrainArray,
} from "../render/terrain.js";

export interface EditorProceduralChunkOverlay {
  /** Signed tile origin of the bounded terrain composition cache. */
  readonly compositionMinTileX: number;
  readonly compositionMinTileY: number;
  readonly generatedChunkKeys: ReadonlySet<string>;
  /** Deterministic semantic preview retained until the chunk is materialized. */
  readonly chunkPreviewImage: (
    chunkX: number,
    chunkY: number,
  ) => CanvasImageSource;
  readonly overview?: {
    readonly image: CanvasImageSource;
    readonly minTileX: number;
    readonly minTileY: number;
    readonly widthTiles: number;
    readonly heightTiles: number;
  };
  readonly selectedChunkX: number | null;
  readonly selectedChunkY: number | null;
  readonly terrain: TerrainArray;
}

function floorToMultiple(value: number, divisor: number): number {
  return Math.floor(value / divisor) * divisor;
}

export function proceduralEditorGridIntervals(scale: number): {
  readonly minorChunks: number;
  readonly majorChunks: number;
} {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("grid scale must be positive");
  }
  const chunkScreenPixels = PROCEDURAL_WORLD_CHUNK_TILES * 16 * scale;
  let minorChunks = 1;
  while (chunkScreenPixels * minorChunks < 32) minorChunks *= 4;
  return { minorChunks, majorChunks: minorChunks * 4 };
}

function proceduralElevationAt(
  chunks: EditorProceduralChunkOverlay,
  worldTileX: number,
  worldTileY: number,
): number {
  const localTileX = worldTileX - chunks.compositionMinTileX;
  const localTileY = worldTileY - chunks.compositionMinTileY;
  if (
    localTileX < 0 ||
    localTileY < 0 ||
    localTileX >= chunks.terrain.width ||
    localTileY >= chunks.terrain.height
  )
    return 0;
  return (
    chunks.terrain.elevations[localTileY * chunks.terrain.width + localTileX] ??
    0
  );
}

function drawProceduralChunkGrid(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const chunkWorldPixels = PROCEDURAL_WORLD_CHUNK_TILES * 16;
  const { minorChunks, majorChunks } = proceduralEditorGridIntervals(scale);
  const minimumChunkX = Math.floor(cameraX / chunkWorldPixels) - 1;
  const maximumChunkX =
    Math.ceil((cameraX + viewportWidth) / chunkWorldPixels) + 1;
  const minimumChunkY = Math.floor(cameraY / chunkWorldPixels) - 1;
  const maximumChunkY =
    Math.ceil((cameraY + viewportHeight) / chunkWorldPixels) + 1;

  context.setLineDash([]);
  for (
    let chunkX = floorToMultiple(minimumChunkX, minorChunks);
    chunkX <= maximumChunkX;
    chunkX += minorChunks
  ) {
    const x = Math.round((chunkX * chunkWorldPixels - cameraX) * scale) + 0.5;
    const major = chunkX % majorChunks === 0;
    context.strokeStyle =
      chunkX === 0 ? "#fff0bde8" : major ? "#efcf8fba" : "#efd59a75";
    context.lineWidth = chunkX === 0 ? 3 : major ? 2 : 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, viewportHeight * scale);
    context.stroke();
  }
  for (
    let chunkY = floorToMultiple(minimumChunkY, minorChunks);
    chunkY <= maximumChunkY;
    chunkY += minorChunks
  ) {
    const y = Math.round((chunkY * chunkWorldPixels - cameraY) * scale) + 0.5;
    const major = chunkY % majorChunks === 0;
    context.strokeStyle =
      chunkY === 0 ? "#fff0bde8" : major ? "#efcf8fba" : "#efd59a75";
    context.lineWidth = chunkY === 0 ? 3 : major ? 2 : 1;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(viewportWidth * scale, y);
    context.stroke();
  }
}

export interface EditorOverlayOptions {
  readonly activeElevation: number;
  readonly gridVisible: boolean;
  readonly heightVisible: boolean;
  readonly collisionVisible: boolean;
  readonly selectedTile: MapPoint | null;
  readonly draftPolygon: readonly MapPoint[];
  /** Draw the cached semantic seed raster because detailed terrain is
   * intentionally omitted at distant seed-map scales. */
  readonly overviewMode?: boolean;
  readonly proceduralChunks?: EditorProceduralChunkOverlay;
}

function screenTile(
  tileX: number,
  tileY: number,
  elevation: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): readonly [x: number, y: number] {
  const projection = elevation * terrainProjectedRowsPerLevel() * 16;
  return [
    Math.round((tileX * 16 - cameraX) * scale),
    Math.round((tileY * 16 - projection - cameraY) * scale),
  ];
}

export function drawEditorWorldOverlays(
  context: CanvasRenderingContext2D,
  document: MapDocumentV2,
  compiled: CompiledMapDocument,
  options: EditorOverlayOptions,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const procedural = options.proceduralChunks;
  const minimumX =
    procedural === undefined
      ? Math.max(0, Math.floor(cameraX / 16) - 3)
      : Math.floor(cameraX / 16) - 3;
  const maximumX =
    procedural === undefined
      ? Math.min(
          document.width - 1,
          Math.ceil((cameraX + viewportWidth) / 16) + 3,
        )
      : Math.ceil((cameraX + viewportWidth) / 16) + 3;
  const minimumY =
    procedural === undefined
      ? Math.max(0, Math.floor(cameraY / 16) - 12)
      : Math.floor(cameraY / 16) - 12;
  const maximumY =
    procedural === undefined
      ? Math.min(
          document.height - 1,
          Math.ceil((cameraY + viewportHeight) / 16) + 12,
        )
      : Math.ceil((cameraY + viewportHeight) / 16) + 12;
  context.save();
  context.lineWidth = 1;
  if (procedural !== undefined) {
    const chunks = procedural;
    if (options.overviewMode === true && chunks.overview !== undefined) {
      const overview = chunks.overview;
      const [x, y] = screenTile(
        overview.minTileX,
        overview.minTileY,
        0,
        cameraX,
        cameraY,
        scale,
      );
      context.imageSmoothingEnabled = false;
      context.drawImage(
        overview.image,
        x,
        y,
        overview.widthTiles * 16 * scale,
        overview.heightTiles * 16 * scale,
      );
      context.fillStyle = "#1520191f";
      context.fillRect(0, 0, viewportWidth * scale, viewportHeight * scale);
    }
    const minimumChunkX = Math.floor(minimumX / PROCEDURAL_WORLD_CHUNK_TILES);
    const maximumChunkX = Math.floor(maximumX / PROCEDURAL_WORLD_CHUNK_TILES);
    const minimumChunkY = Math.floor(minimumY / PROCEDURAL_WORLD_CHUNK_TILES);
    const maximumChunkY = Math.floor(maximumY / PROCEDURAL_WORLD_CHUNK_TILES);
    const chunkSize = PROCEDURAL_WORLD_CHUNK_TILES * 16 * scale;
    if (options.overviewMode !== true) {
      for (let chunkY = minimumChunkY; chunkY <= maximumChunkY; chunkY += 1) {
        for (let chunkX = minimumChunkX; chunkX <= maximumChunkX; chunkX += 1) {
          const key = `${chunkX},${chunkY}`;
          const generated = chunks.generatedChunkKeys.has(key);
          const [x, y] = screenTile(
            chunkX * PROCEDURAL_WORLD_CHUNK_TILES,
            chunkY * PROCEDURAL_WORLD_CHUNK_TILES,
            0,
            cameraX,
            cameraY,
            scale,
          );
          if (!generated) {
            context.save();
            context.beginPath();
            context.rect(x, y, chunkSize, chunkSize);
            context.clip();
            context.imageSmoothingEnabled = false;
            context.drawImage(
              chunks.chunkPreviewImage(chunkX, chunkY),
              x,
              y,
              chunkSize,
              chunkSize,
            );
            // The dashed border and label communicate preview ownership
            // without obscuring terrain that generation will materialize.
            context.fillStyle = "#15201912";
            context.fillRect(x, y, chunkSize, chunkSize);
            context.restore();
          }
          if (options.gridVisible) {
            context.strokeStyle = generated ? "#a8dc91cc" : "#f1c887e6";
            context.lineWidth = generated ? 1 : 2;
            context.setLineDash(generated ? [] : [6, 4]);
            context.strokeRect(x + 0.5, y + 0.5, chunkSize - 1, chunkSize - 1);
            if (chunkSize >= 150) {
              context.fillStyle = generated ? "#e4f5d7" : "#fff0c5";
              context.font = `${Math.max(8, 7 * scale)}px monospace`;
              context.textBaseline = "top";
              context.fillText(
                generated
                  ? `CHUNK ${chunkX},${chunkY}`
                  : `${chunkX},${chunkY}  NOT GENERATED`,
                x + 4,
                y + 4,
              );
            }
          }
          if (
            chunks.selectedChunkX === chunkX &&
            chunks.selectedChunkY === chunkY
          ) {
            context.strokeStyle = "#fff1a8";
            context.lineWidth = 3;
            context.setLineDash([]);
            context.strokeRect(x + 2, y + 2, chunkSize - 4, chunkSize - 4);
          }
        }
      }
    } else if (
      chunks.selectedChunkX !== null &&
      chunks.selectedChunkY !== null
    ) {
      const [x, y] = screenTile(
        chunks.selectedChunkX * PROCEDURAL_WORLD_CHUNK_TILES,
        chunks.selectedChunkY * PROCEDURAL_WORLD_CHUNK_TILES,
        0,
        cameraX,
        cameraY,
        scale,
      );
      context.strokeStyle = "#fff1a8";
      context.lineWidth = 3;
      context.strokeRect(x + 1, y + 1, chunkSize - 2, chunkSize - 2);
    }
    context.setLineDash([]);
    if (options.gridVisible) {
      drawProceduralChunkGrid(
        context,
        cameraX,
        cameraY,
        scale,
        viewportWidth,
        viewportHeight,
      );
    }
  }
  if (
    options.overviewMode !== true &&
    (options.heightVisible || options.gridVisible)
  ) {
    for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
      for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
        const index = tileY * document.width + tileX;
        const chunkX = Math.floor(tileX / PROCEDURAL_WORLD_CHUNK_TILES);
        const chunkY = Math.floor(tileY / PROCEDURAL_WORLD_CHUNK_TILES);
        const generated =
          procedural?.generatedChunkKeys.has(`${chunkX},${chunkY}`) ?? false;
        const elevation =
          procedural === undefined
            ? (compiled.elevations[index] ?? 0)
            : generated
              ? proceduralElevationAt(procedural, tileX, tileY)
              : 0;
        const [x, y] = screenTile(
          tileX,
          tileY,
          elevation,
          cameraX,
          cameraY,
          scale,
        );
        const size = 16 * scale;
        if (options.heightVisible) {
          const delta = elevation - options.activeElevation;
          context.fillStyle =
            delta === 0 ? "#3fffa31f" : delta > 0 ? "#ff557a35" : "#55b8ff35";
          context.fillRect(x, y, size, size);
          context.fillStyle = "#fff7d7";
          context.font = `${Math.max(7, 7 * scale)}px monospace`;
          context.textBaseline = "top";
          context.fillText(`L${elevation}`, x + 2, y + 2);
        }
        if (
          options.gridVisible &&
          (procedural === undefined || 16 * scale >= 7)
        ) {
          context.strokeStyle = "#d8f5db55";
          context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        }
      }
    }
  }
  if (options.overviewMode !== true && options.collisionVisible) {
    for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
      for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
        if (options.proceduralChunks !== undefined) {
          const chunkX = Math.floor(tileX / PROCEDURAL_WORLD_CHUNK_TILES);
          const chunkY = Math.floor(tileY / PROCEDURAL_WORLD_CHUNK_TILES);
          if (
            !options.proceduralChunks.generatedChunkKeys.has(
              `${chunkX},${chunkY}`,
            )
          )
            continue;
        }
        const collision =
          options.proceduralChunks === undefined
            ? mapCollisionAtPlane(
                compiled,
                tileX,
                tileY,
                options.activeElevation,
              )
            : terrainPlaneCollisionCellAt(
                options.proceduralChunks.terrain,
                tileX - options.proceduralChunks.compositionMinTileX,
                tileY - options.proceduralChunks.compositionMinTileY,
                options.activeElevation,
              );
        const [x, y] = screenTile(
          tileX,
          tileY,
          options.activeElevation,
          cameraX,
          cameraY,
          scale,
        );
        context.fillStyle =
          collision === "blocked"
            ? "#ff4f5c55"
            : collision === "transition"
              ? "#47f1ee66"
              : "#54e87c14";
        context.fillRect(x, y, 16 * scale, 16 * scale);
      }
    }
  }
  if (options.selectedTile !== null && 16 * scale >= 3) {
    const [x, y] = screenTile(
      options.selectedTile.tileX,
      options.selectedTile.tileY,
      options.activeElevation,
      cameraX,
      cameraY,
      scale,
    );
    context.strokeStyle = "#fff1a8";
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, 16 * scale - 2, 16 * scale - 2);
  }
  if (options.draftPolygon.length > 1) {
    context.strokeStyle = "#f1a1ff";
    context.lineWidth = 2;
    context.setLineDash([5, 3]);
    context.beginPath();
    for (let index = 0; index < options.draftPolygon.length; index += 1) {
      const point = options.draftPolygon[index]!;
      const [x, y] = screenTile(
        point.tileX,
        point.tileY,
        options.activeElevation,
        cameraX,
        cameraY,
        scale,
      );
      if (index === 0) context.moveTo(x + 8 * scale, y + 8 * scale);
      else context.lineTo(x + 8 * scale, y + 8 * scale);
    }
    context.closePath();
    context.stroke();
  }
  context.restore();
}
