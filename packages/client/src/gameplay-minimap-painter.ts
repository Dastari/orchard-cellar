import { FIXED_UNITS_PER_PIXEL, SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION, type SpaceDefinition } from '@orchard/sim';
import { terrainForSpace, terrainColorAt } from '@orchard/engine/terrain';
import type { OverworldView } from './net/overworld-connection.js';
import type { ResourcePerceptionProjection } from './resource-perception.js';
interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface MinimapInputs {
  readonly latestSnapshot: OverworldView;
  readonly activeSpaceDefinition: SpaceDefinition;
  readonly CELLAR_ORE_PREVIEW_COLORS: Readonly<Record<string, string>>;
  readonly resourcePerceptionForSnapshot: (snapshot: OverworldView) => ResourcePerceptionProjection;
}
/** Input getters preserve the gameplay callback's late-bound state reads. */
export function createGameplayMinimap(inputs: MinimapInputs) {
  let minimapTerrainCache: {
    readonly key: string;
    readonly canvas: HTMLCanvasElement;
  } | null = null;
  return (context: CanvasRenderingContext2D, rect: Rect, pixelsPerTile: number, trackingEnabled: boolean) => {
    const { latestSnapshot, activeSpaceDefinition, CELLAR_ORE_PREVIEW_COLORS, resourcePerceptionForSnapshot } = inputs;
    const snapshot = latestSnapshot;
    const identityHex = snapshot.identityHex;
    const local = identityHex === null ? undefined : snapshot.players.get(identityHex);
    const centerWorldX = (local?.x ?? 0) / FIXED_UNITS_PER_PIXEL;
    const centerWorldY = (local?.y ?? 0) / FIXED_UNITS_PER_PIXEL;
    const centerTileX = Math.floor(centerWorldX / 16);
    const centerTileY = Math.floor(centerWorldY / 16);
    const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
    const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
    const terrain = terrainForSpace(
      activeSpaceDefinition,
      seed,
      version,
    );
    const columns = Math.ceil(rect.width / pixelsPerTile) + 2;
    const rows = Math.ceil(rect.height / pixelsPerTile) + 2;
    const firstTileX = Math.floor(centerTileX - columns / 2);
    const firstTileY = Math.floor(centerTileY - rows / 2);
    const cacheKey = [
      activeSpaceDefinition.spaceId,
      seed,
      version,
      centerTileX,
      centerTileY,
      pixelsPerTile,
      Math.ceil(rect.width),
      Math.ceil(rect.height),
    ].join(':');
    if (minimapTerrainCache?.key !== cacheKey) {
      const cacheCanvas = document.createElement('canvas');
      cacheCanvas.width = Math.ceil(rect.width);
      cacheCanvas.height = Math.ceil(rect.height);
      const cacheContext = cacheCanvas.getContext('2d');
      if (cacheContext !== null) {
        cacheContext.imageSmoothingEnabled = false;
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            cacheContext.fillStyle = terrainColorAt(terrain, firstTileX + column, firstTileY + row);
            cacheContext.fillRect(
              Math.floor(column * pixelsPerTile),
              Math.floor(row * pixelsPerTile),
              Math.ceil(pixelsPerTile),
              Math.ceil(pixelsPerTile),
            );
          }
        }
      }
      minimapTerrainCache = { key: cacheKey, canvas: cacheCanvas };
    }
    context.drawImage(minimapTerrainCache.canvas, Math.floor(rect.x), Math.floor(rect.y));
    const marker = (worldX: number, worldY: number, color: string, size: number): void => {
      const x = rect.x + rect.width / 2 + (worldX / 16 - centerTileX) * pixelsPerTile;
      const y = rect.y + rect.height / 2 + (worldY / 16 - centerTileY) * pixelsPerTile;
      if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return;
      context.fillStyle = '#2b1914';
      context.fillRect(Math.round(x - size / 2 - 1), Math.round(y - size / 2 - 1), size + 2, size + 2);
      context.fillStyle = color;
      context.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    };
    const perception = resourcePerceptionForSnapshot(snapshot);
    for (const ore of perception.minimapOre) {
      marker(ore.tileX * 16 + 8, ore.tileY * 16 + 8,
        ore.identified ? CELLAR_ORE_PREVIEW_COLORS[ore.oreKind]!.slice(0, 7) : '#969696', 2);
    }
    for (const pool of perception.fishingPools) {
      marker(pool.tileX * 16 + 8, pool.tileY * 16 + 8, '#64b7e8', 3);
    }
    if (trackingEnabled) {
      for (const npc of snapshot.npcs) {
        if (npc.spaceId !== activeSpaceDefinition.spaceId) continue;
        marker(npc.x / FIXED_UNITS_PER_PIXEL, npc.y / FIXED_UNITS_PER_PIXEL, '#f1b34b', 3);
      }
      for (const player of snapshot.players) {
        const id = player.identity.toHexString();
        if (player.spaceId !== activeSpaceDefinition.spaceId || id === identityHex
          || snapshot.profiles.get(id)?.online !== true) continue;
        marker(player.x / FIXED_UNITS_PER_PIXEL, player.y / FIXED_UNITS_PER_PIXEL, '#64b7e8', 3);
      }
    }
    marker(centerWorldX, centerWorldY, '#fff3be', 4);
  };
}
