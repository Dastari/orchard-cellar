import { beginDecorationCommands, releaseDecorationCommands } from './gameplay-decoration-commands.js';
import { TOPSIDE_SPACE_ID, CELLAR_ENTRY_TILE, RESIDENCE_BED_TILE, RESIDENCE_BOOKSHELF_TILE, MARLOW_TENT_BOOKSHELF_TILE, homesteadBoundaryTiles, isInteractivePoiDecorationKind, fenceJoinMask, placeableHasInterface } from '@orchard/sim';
import { drawOverworldPlaceable, drawOverworldPoiDecoration, drawOverworldRogueDoor, overworldPoiDecorationDepthY } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { CAMPFIRE_LIGHT_RADIUS_TILES, unifiedDecorationLightReceiver } from '@orchard/engine/lighting';
import { deterministicFlameFlicker, placeablePointLight } from '@orchard/engine/light-sources';
import { liveIslandDocument } from '@orchard/engine/live-map-runtime';
import { homesteadTentPresentationTargets } from './homestead-presentation.js';
import type { GameplayPainterInputs, RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

export type GameplayDecorationInputs = Pick<GameplayPainterInputs,
  'dynamicLighting' | 'snapshot' | 'objectPresentations' | 'lightVisible' | 'pointLights' |
  'projectedLight' | 'debugEntitiesHidden' | 'activeSpaceDefinition' | 'homesteadSurroundingDecorations' | 'seed' |
  'topsideDecorations' | 'visible' | 'enqueueWorldDepth' | 'context' | 'art' |
  'cameraX' | 'cameraY' | 'scale' | 'visualTickClock' | 'renderWeather' |
  'frameLightingModel' | 'drawSouthFacingReceiver' | 'nameplates'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
export function enqueueGameplayDecorations(input: GameplayDecorationInputs): void {
  const {
    dynamicLighting, snapshot, objectPresentations, lightVisible, pointLights,
    projectedLight, debugEntitiesHidden, activeSpaceDefinition, homesteadSurroundingDecorations, seed,
    topsideDecorations, visible, enqueueWorldDepth, context, art,
    cameraX, cameraY, scale,
    nameplates,
  } = input;
  if (dynamicLighting) for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const presentation = objectPresentations.resolve(snapshot.content, placeable);
    const light = presentation.authored
      ? presentation.light === null ? null
        : placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n, presentation.light)
      : placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n);
    if (light !== null && worldPointVisible(light.worldX, light.worldY, lightVisible)) {
      pointLights.push(projectedLight(light.profile === 'flame' ? { ...light, color: { r: 255, g: 142, b: 62 } } : light));
    }
  }
  if (debugEntitiesHidden || (activeSpaceDefinition.spaceId !== TOPSIDE_SPACE_ID
    && activeSpaceDefinition.generator !== 'homestead')) releaseDecorationCommands(context);
  if (!debugEntitiesHidden && (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    || activeSpaceDefinition.generator === 'homestead')) {
    const authoredMapDocument = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? liveIslandDocument(snapshot.liveMapDocument) : null;
    const decorations: readonly RuntimeSurvivalDecoration[] = activeSpaceDefinition.generator === 'homestead'
      ? homesteadSurroundingDecorations(seed) : topsideDecorations(snapshot, seed);
    const commands = beginDecorationCommands(context, decorations, authoredMapDocument);
    for (const index of commands.index.query(visible, dynamicLighting ? lightVisible : undefined)) {
    const decoration = decorations[index]!;
    if (decoration.kind === 'camp_campfire'
      && placeableHasInterface(snapshot.placeables.get(BigInt(decoration.id))?.kind ?? '', 'cooking')) continue;
    if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      && isInteractivePoiDecorationKind(decoration.kind)) continue;
    const decorationX = decoration.tileX * 16 + 8;
    const decorationY = (decoration.tileY + 1) * 16;
    const campfireLit = decoration.kind !== 'camp_campfire'
      || (snapshot.campfires?.get(BigInt(decoration.id))?.lit ?? true);
    if (dynamicLighting && decoration.kind === 'camp_campfire' && campfireLit) {
      if (worldPointVisible(decorationX, decorationY, lightVisible)) {
        const flicker = deterministicFlameFlicker(
          BigInt(decoration.id),
          snapshot.clock?.authorityTick ?? 0n,
        );
        pointLights.push(projectedLight({
          worldX: decorationX,
          worldY: decorationY - 12,
          receiverDirectionWorldY: decorationY,
          radiusTiles: CAMPFIRE_LIGHT_RADIUS_TILES + flicker.radiusOffset,
          color: { r: 255, g: 142, b: 62 },
          strengthPerMille: flicker.strengthPerMille,
          profile: 'flame',
        }));
      }
    }
    if (!worldPointVisible(decorationX, decorationY, visible)) continue;
    enqueueWorldDepth(decorationX, decorationY, commands.get(input, decoration, campfireLit),
      decorationY, unifiedDecorationLightReceiver(decoration.kind));
    }
    commands.finish();
  }
  if (!debugEntitiesHidden) {
    for (const target of homesteadTentPresentationTargets(activeSpaceDefinition, snapshot.homesteads)) {
      const { tileX, tileY, interior } = target;
      const x = tileX * 16 + 8;
      const y = (tileY + 1) * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      enqueueWorldDepth(x, y, {
        footY: overworldPoiDecorationDepthY(
          interior ? 'homestead_tent_large' : 'homestead_tent_marker',
          y,
        ),
        tie: `homestead:${target.spaceId}`,
        draw: () => drawOverworldPoiDecoration(
          context, art, interior ? 'homestead_tent_large' : 'homestead_tent_marker',
          x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.generator === 'homestead') {
    const boundary = homesteadBoundaryTiles(activeSpaceDefinition.sizeTiles);
    const activeHome = snapshot.homesteads.get(activeSpaceDefinition.spaceId);
    const boundaryKeys = new Set(boundary.map((tile) => `${tile.tileX}:${tile.tileY}`));
    for (const tile of boundary) {
      const x = tile.tileX * 16 + 8;
      const y = (tile.tileY + 1) * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      const fenceMask = tile.kind === 'fence'
        ? fenceJoinMask(tile.tileX, tile.tileY, (tileX, tileY) => boundaryKeys.has(`${tileX}:${tileY}`))
        : 0;
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `homestead-boundary:${tile.tileY}:${tile.tileX}`,
        draw: () => drawOverworldPlaceable(
          context, art, tile.kind === 'gate' ? 'fence_gate' : 'fence',
          tile.kind === 'gate' && activeHome?.gateOpen === true,
          fenceMask, 0, x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden && (activeSpaceDefinition.generator === 'residence'
    || activeSpaceDefinition.generator === 'marlow_tent'
    || activeSpaceDefinition.generator === 'cellar')) {
    const decorations = activeSpaceDefinition.generator === 'residence'
      ? [
        { kind: 'residence_door', tileX: 8, tileY: 13 },
        { kind: 'residence_trapdoor', tileX: 11, tileY: 8 },
        { kind: 'residence_bed', ...RESIDENCE_BED_TILE },
        { kind: 'residence_bookshelf', ...RESIDENCE_BOOKSHELF_TILE },
      ]
      : activeSpaceDefinition.generator === 'marlow_tent'
        ? [
          { kind: 'residence_door', tileX: 8, tileY: 13 },
          { kind: 'residence_bed', ...RESIDENCE_BED_TILE },
          { kind: 'residence_bookshelf', ...MARLOW_TENT_BOOKSHELF_TILE },
        ]
        : [
        // The ladder leans on the chamber's north wall; its three-tile sprite
        // overlaps the displaced lower wall course above the first floor row.
        { kind: 'cellar_ladder', tileX: CELLAR_ENTRY_TILE.tileX, tileY: CELLAR_ENTRY_TILE.tileY - 3 },
        { kind: 'poi_rock_small', tileX: CELLAR_ENTRY_TILE.tileX - 4, tileY: CELLAR_ENTRY_TILE.tileY + 5 },
        { kind: 'poi_rock_small', tileX: CELLAR_ENTRY_TILE.tileX + 5, tileY: CELLAR_ENTRY_TILE.tileY + 17 },
      ];
    for (const decoration of decorations) {
      const x = decoration.tileX * 16 + 8;
      const y = decoration.tileY * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `instance-decoration:${decoration.kind}:${decoration.tileX}:${decoration.tileY}`,
        draw: () => drawOverworldPoiDecoration(
          context, art, decoration.kind, x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.generator === 'roguelike') {
    for (const exit of snapshot.rogueRoomExits) {
      const x = exit.tileX * 16 + 8;
      const y = (exit.tileY + 1) * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      nameplates.push({ x, y: y - 4, name: exit.label.toUpperCase() });
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `rogue-exit:${exit.slot}`,
        draw: () => drawOverworldRogueDoor(
          context,
          art,
          snapshot.rogueRun?.theme === 'volcanic' || snapshot.rogueRun?.theme === 'dungeon'
            ? snapshot.rogueRun.theme
            : 'cave',
          exit.direction,
          exit.destinationKind,
          x,
          y,
          cameraX,
          cameraY,
          scale,
        ),
      });
    }
  }
}
