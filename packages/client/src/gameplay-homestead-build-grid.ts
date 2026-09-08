import { homesteadPlotBounds, runtimeHomesteadBuildDefinition, homesteadTentFootprint,
  HOMESTEAD_TENT_TILE, homesteadBuildFootprintTiles, homesteadPlayableTile, type SpaceDefinition } from '@orchard/sim';
import { drawOverworldPlaceable, type OverworldArt } from '@orchard/engine/overworld-art';
import { farmSoilKey } from '@orchard/engine/farmland';
import type { HomesteadBuildPalette } from '@orchard/ui';
import type { OverworldView } from './net/overworld-connection.js';

export function drawHomesteadBuildGrid(
  context: CanvasRenderingContext2D, cameraX: number, cameraY: number, scale: number,
  activeSpaceDefinition: SpaceDefinition,
  hoveredInteractionTile: { readonly tileX: number; readonly tileY: number } | null,
  homesteadBuildPalette: HomesteadBuildPalette,
  latestSnapshot: OverworldView,
  placementTileBlocked: (snapshot: OverworldView, tile: { readonly tileX: number; readonly tileY: number }) => boolean,
  art: OverworldArt,
): void {
  const bounds = homesteadPlotBounds(activeSpaceDefinition.sizeTiles);
  const left = (bounds.minimumX * 16 - cameraX) * scale;
  const top = (bounds.minimumY * 16 - cameraY) * scale;
  const right = ((bounds.maximumX + 1) * 16 - cameraX) * scale;
  const bottom = ((bounds.maximumY + 1) * 16 - cameraY) * scale;
  context.save();
  context.fillStyle = 'rgba(255, 225, 137, 0.055)';
  context.fillRect(left, top, right - left, bottom - top);
  context.strokeStyle = 'rgba(255, 241, 184, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  for (let tileX = bounds.minimumX; tileX <= bounds.maximumX + 1; tileX += 1) {
    const x = Math.round((tileX * 16 - cameraX) * scale) + 0.5;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let tileY = bounds.minimumY; tileY <= bounds.maximumY + 1; tileY += 1) {
    const y = Math.round((tileY * 16 - cameraY) * scale) + 0.5;
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();
  context.strokeStyle = 'rgba(255, 211, 105, 0.9)';
  context.lineWidth = Math.max(1, scale);
  context.strokeRect(left, top, right - left, bottom - top);
  const tile = hoveredInteractionTile;
  if (tile !== null) {
    const selection = homesteadBuildPalette.selection;
    const tent = homesteadTentFootprint(HOMESTEAD_TENT_TILE.tileX, HOMESTEAD_TENT_TILE.tileY, true);
    const selectedBuild = selection.kind === 'place'
      ? runtimeHomesteadBuildDefinition(latestSnapshot.content.registry, selection.itemKind)
      : null;
    const previewTiles = selectedBuild === null
      ? [tile]
      : homesteadBuildFootprintTiles(selectedBuild, tile.tileX, tile.tileY);
    const existing = latestSnapshot.placeables.find((placeable) => {
      if (placeable.carriedBy !== undefined) return false;
      const build = runtimeHomesteadBuildDefinition(latestSnapshot.content.registry, placeable);
      return homesteadBuildFootprintTiles(
        build ?? { footprint: { width: 1, height: 1 } },
        placeable.tileX,
        placeable.tileY,
      ).some((footprintTile) => footprintTile.tileX === tile.tileX && footprintTile.tileY === tile.tileY);
    });
    const valid = selection.kind === 'remove'
      ? existing !== undefined
      : previewTiles.every((previewTile) => {
        const residenceBlocked = previewTile.tileX >= tent.minX && previewTile.tileX <= tent.maxX
          && previewTile.tileY >= tent.minY && previewTile.tileY <= tent.maxY;
        return homesteadPlayableTile(previewTile.tileX, previewTile.tileY, activeSpaceDefinition.sizeTiles)
          && !residenceBlocked
          && latestSnapshot.soil.get(farmSoilKey(
            previewTile.tileX,
            previewTile.tileY,
            activeSpaceDefinition.spaceId,
          )) === undefined
          && !placementTileBlocked(latestSnapshot, previewTile);
      });
    for (const previewTile of previewTiles) {
      const tileLeft = Math.round((previewTile.tileX * 16 - cameraX) * scale);
      const tileTop = Math.round((previewTile.tileY * 16 - cameraY) * scale);
      context.fillStyle = valid ? 'rgba(92, 199, 102, 0.38)' : 'rgba(190, 48, 61, 0.44)';
      context.fillRect(tileLeft, tileTop, 16 * scale, 16 * scale);
      context.strokeStyle = valid ? '#9df38c' : '#ff6671';
      context.lineWidth = Math.max(1, scale);
      context.strokeRect(tileLeft, tileTop, 16 * scale, 16 * scale);
    }
    if (selection.kind === 'place') {
      context.save();
      context.globalAlpha = valid ? 0.62 : 0.42;
      context.filter = valid ? 'brightness(1.15)' : 'grayscale(0.7) sepia(1) hue-rotate(315deg) saturate(3)';
      drawOverworldPlaceable(
        context,
        art,
        selection.itemKind,
        false,
        0,
        0,
        tile.tileX * 16 + 8,
        (tile.tileY + 1) * 16,
        cameraX,
        cameraY,
        scale,
        true,
      );
      context.restore();
    }
  }
  context.restore();
}

