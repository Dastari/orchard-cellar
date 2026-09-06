import { sortWorldDepthItems, type WorldDepthItem } from '@orchard/engine/renderer';
import type { ActorShadowBody } from '@orchard/engine/overworld-art';
import type { DirectionalCaster } from '@orchard/engine/directional-shadows';
import type { UnifiedLightReceiver } from '@orchard/engine/lighting';
import { lightingOwner } from '@orchard/engine/world-lighting-renderer';
import { terrainProjectedElevationAtFoot, terrainProjectedSortOffset,
  terrainElevationAtWorldFoot, terrainVisualProjectionRowsPerLevel, type TerrainArray } from '@orchard/engine/terrain';

interface GameplayPainterInput {
  readonly terrain: TerrainArray;
  readonly context: CanvasRenderingContext2D;
  readonly scale: number;
  readonly seasonalDynamic: boolean;
  readonly projectionAt: (worldX: number, worldFootY: number) => number;
  readonly drawWorldReceiver: (footX: number, footY: number, draw: () => void, face?: UnifiedLightReceiver) => void;
}
/** Mechanical extraction of the gameplay queue and enqueue closure. */
export function createGameplayPainter(input: GameplayPainterInput) {
  const { terrain, context, scale, seasonalDynamic, projectionAt, drawWorldReceiver } = input;
  const worldDepthItems: WorldDepthItem[] = [];
  const movingCelestialCasters: DirectionalCaster[] = [];
  const enqueueWorldDepth = (
    worldX: number,
    worldFootY: number,
    item: WorldDepthItem,
    terrainSampleY = worldFootY,
    unifiedReceiver: UnifiedLightReceiver = 'south',
    shadowContactY = terrainSampleY,
    shadowBody?: ActorShadowBody,
  ): void => {
    const elevation = terrainProjectedElevationAtFoot(terrain, worldX, terrainSampleY);
    const projection = projectionAt(worldX, terrainSampleY);
    if (seasonalDynamic && /^(player|npc|merchant|rogue-enemy|boat|combat-target|hive|placeable):/.test(item.tie)) {
      // Upright actor volumes follow the interpolated contact each frame. Their
      // artwork/animation is lit independently of the ground shadow footprint.
      const boat = item.tie.startsWith('boat:');
      const level = terrainElevationAtWorldFoot(terrain, worldX, terrainSampleY);
      movingCelestialCasters.push({ owner: lightingOwner(worldX, terrainSampleY),
        worldX, worldY: shadowContactY + (shadowBody?.offsetY ?? 0), baseHeightSubunits: level * 4,
        heightSubunits: Math.max(1, Math.round((shadowBody?.heightPixels ?? (boat ? 12 : 22)) / (terrainVisualProjectionRowsPerLevel(terrain) * 4))),
        footprint: { left: -(shadowBody?.halfWidth ?? (boat ? 12 : 4)), right: shadowBody?.halfWidth ?? (boat ? 12 : 4), top: -2, bottom: 1 }, contact: shadowBody?.contact ?? true });
    }
    worldDepthItems.push({
      ...item,
      footY: item.footY - projection,
      depthOffset: terrainProjectedSortOffset(elevation),
      elevationLayer: Math.ceil(Math.max(0, elevation - 0.001)),
      depthPhase: 'entity',
      draw: () => {
        context.save();
        try {
          context.translate(0, -projection * scale);
          drawWorldReceiver(worldX, terrainSampleY, item.draw, unifiedReceiver);
        } finally { context.restore(); }
      },
    });
  };
  return { worldDepthItems, movingCelestialCasters, enqueueWorldDepth };
}

export function sortGameplayWorldDepthItems(items: readonly WorldDepthItem[]): WorldDepthItem[] {
  return sortWorldDepthItems(items);
}
