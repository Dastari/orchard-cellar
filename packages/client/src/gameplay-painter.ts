import { beginPainterItem, endPainterItem } from '@orchard/engine/painter-context';
import { WorldItemIdentities, WorldItemKind, prepareWorldDepthItem } from '@orchard/engine/painter-depth';
import { compareWorldDepthItems, type WorldDepthItem } from '@orchard/engine/renderer';
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
interface PainterStorage {
  readonly items: WorldDepthItem[];
  readonly moving: DirectionalCaster[];
  readonly identities: WorldItemIdentities;
  terrain: TerrainArray;
}
const storage = new WeakMap<CanvasRenderingContext2D, PainterStorage>();
const queueIdentities = new WeakMap<WorldDepthItem[], WorldItemIdentities>();
/** Reuse the frame queue while retaining the established painter order. */
export function createGameplayPainter(input: GameplayPainterInput) {
  const { terrain, context, scale, seasonalDynamic, projectionAt, drawWorldReceiver } = input;
  let retained = storage.get(context);
  if (retained === undefined) {
    retained = { items: [], moving: [], identities: new WorldItemIdentities(), terrain };
    storage.set(context, retained); queueIdentities.set(retained.items, retained.identities);
  }
  if (retained.terrain !== terrain) { retained.identities.clear(); retained.terrain = terrain; }
  const { items: worldDepthItems, moving: movingCelestialCasters, identities } = retained;
  identities.beginFrame();
  worldDepthItems.length = 0; movingCelestialCasters.length = 0;
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
    const identity = identities.get(item.debugTie ?? String(item.tie));
    if (seasonalDynamic && identity.kind !== WorldItemKind.Static) {
      // Upright actor volumes follow the interpolated contact each frame. Their
      // artwork/animation is lit independently of the ground shadow footprint.
      const boat = identity.kind === WorldItemKind.Boat;
      const level = terrainElevationAtWorldFoot(terrain, worldX, terrainSampleY);
      movingCelestialCasters.push({ owner: lightingOwner(worldX, terrainSampleY),
        worldX, worldY: shadowContactY + (shadowBody?.offsetY ?? 0), baseHeightSubunits: level * 4,
        heightSubunits: Math.max(1, Math.round((shadowBody?.heightPixels ?? (boat ? 12 : 22)) / (terrainVisualProjectionRowsPerLevel(terrain) * 4))),
        footprint: { left: -(shadowBody?.halfWidth ?? (boat ? 12 : 4)), right: shadowBody?.halfWidth ?? (boat ? 12 : 4), top: -2, bottom: 1 }, contact: shadowBody?.contact ?? true });
    }
    const queued: WorldDepthItem = {
      ...item,
      sortIdentity: identity,
      footY: item.footY - projection,
      depthOffset: terrainProjectedSortOffset(elevation),
      elevationLayer: Math.ceil(Math.max(0, elevation - 0.001)),
      depthPhase: 'entity',
      draw: () => {
        const nested = beginPainterItem(context);
        try {
          context.translate(0, -projection * scale);
          drawWorldReceiver(worldX, terrainSampleY, item.draw, unifiedReceiver);
        } finally { endPainterItem(context, nested); }
      },
    };
    prepareWorldDepthItem(queued, identities);
    worldDepthItems.push(queued);
  };
  return { worldDepthItems, movingCelestialCasters, enqueueWorldDepth };
}

export function sortGameplayWorldDepthItems(items: WorldDepthItem[]): WorldDepthItem[] {
  const identities = queueIdentities.get(items);
  if (identities === undefined) throw new Error('unowned_gameplay_painter_queue');
  // Raised-terrain and authored-map producers still use the legacy input shape.
  for (const item of items) if (item.sortKey === undefined) prepareWorldDepthItem(item, identities);
  items.sort(compareWorldDepthItems);
  identities.finishFrame();
  return items;
}

/** Read-only cache telemetry; no retained view or new per-frame snapshot. */
export function gameplayPainterIdentityDiagnostics(context: CanvasRenderingContext2D) {
  return storage.get(context)?.identities.diagnostics ?? { retained: 0, limit: 4096, retired: 0, peak: 0 };
}
