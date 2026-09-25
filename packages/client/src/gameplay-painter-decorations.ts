import {enqueueHearthArchitectureFeatures} from '@orchard/engine/hearth-architecture-scene';
import {parseHearthArchitectureState} from '@orchard/sim';
import {enqueueHearthInteriorFurniture,hearthInteriorPointLights} from '@orchard/engine/hearth-interior-scene';
import { hearthFurnitureScene, hearthFurnitureShapeForPlaceable } from '@orchard/sim';
import {enqueueHearthLobbyFurniture,hearthLobbyPointLights} from '@orchard/engine/hearth-lobby-scene';
import { profilePainterProducer } from './painter-producer-profile.js';
import { drawLandmarkTransform } from './gameplay-painter-effects.js';
import { AUTHORITY_HZ, TOPSIDE_SPACE_ID, authoredMapContentPainterTie, CELLAR_ENTRY_TILE, RESIDENCE_BED_TILE, RESIDENCE_BOOKSHELF_TILE, MARLOW_TENT_BOOKSHELF_TILE, homesteadBoundaryTiles, survivalDecorationResource, survivalDecorationBlocksTraversal, runtimeLandmarkCampfirePlans, fenceJoinMask } from '@orchard/sim';
import { drawOverworldPlaceable, drawOverworldPoiDecoration, drawOverworldRogueDoor, natureDecorationFrame, overworldPoiDecorationDepthY, pondShimmerFrameAtTick } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { unifiedDecorationLightReceiver } from '@orchard/engine/lighting';
import { isLightEmitterKind, placeablePointLight } from '@orchard/engine/light-sources';
import { mapObjectPointLights } from '@orchard/engine/map-object-presentation';
import { homesteadTentPresentationTargets } from './homestead-presentation.js';
import type { GameplayPainterInputs, RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'dynamicLighting' | 'snapshot' | 'objectPresentations' | 'lightVisible' | 'pointLights' |
  'projectedLight' | 'debugEntitiesHidden' | 'activeSpaceDefinition' | 'homesteadSurroundingDecorations' | 'seed' |
  'topsideDecorations' | 'topsideMapRecords' | 'visible' | 'enqueueWorldDepth' | 'context' | 'art' |
  'cameraX' | 'cameraY' | 'scale' | 'visualTickClock' | 'renderWeather' |
  'frameLightingModel' | 'drawSouthFacingReceiver' | 'nameplates' | 'renderedPlayerAnchors'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayDecorations(input: Inputs): void {
  const {
    dynamicLighting, snapshot, objectPresentations, lightVisible, pointLights,
    projectedLight, debugEntitiesHidden, activeSpaceDefinition, homesteadSurroundingDecorations, seed,
    topsideDecorations, topsideMapRecords, visible, enqueueWorldDepth, context, art,
    cameraX, cameraY, scale, visualTickClock, renderWeather,
    frameLightingModel, drawSouthFacingReceiver, nameplates,
  } = input;
  if(!debugEntitiesHidden&&activeSpaceDefinition.generator==='residence'&&activeSpaceDefinition.residenceArchitectureJson!==undefined){
    const state=parseHearthArchitectureState(activeSpaceDefinition.residenceArchitectureJson);
    if(state)enqueueHearthArchitectureFeatures(context,art,state.cells,cameraX,cameraY,scale,
      ()=>input.renderedPlayerAnchors.values(),enqueueWorldDepth);
  }
  if(!debugEntitiesHidden&&activeSpaceDefinition.generator==='village_interior'){
    enqueueHearthInteriorFurniture(context,art,snapshot.content.registry,activeSpaceDefinition.spaceId,cameraX,cameraY,scale,enqueueWorldDepth);
    if(dynamicLighting)for(const light of hearthInteriorPointLights(activeSpaceDefinition.spaceId,snapshot.content.registry,art,snapshot.clock?.authorityTick??0n)){
      if(worldPointVisible(light.worldX,light.worldY,lightVisible))pointLights.push(projectedLight(light,light.receiverDirectionWorldY));
    }
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.generator === 'delve_lobby') {
    const tick=snapshot.clock?.authorityTick ?? 0n;
    enqueueHearthLobbyFurniture(context, art, snapshot.content.registry, cameraX, cameraY, scale, enqueueWorldDepth,Number(tick*8n/BigInt(AUTHORITY_HZ)%8n));
    if(dynamicLighting) for(const light of hearthLobbyPointLights(tick,snapshot.content.registry)) {
      if(worldPointVisible(light.worldX,light.worldY,lightVisible))
        pointLights.push(projectedLight({...light,color:{r:255,g:142,b:62}}));
    }
  }
  if(dynamicLighting&&!debugEntitiesHidden&&activeSpaceDefinition.spaceId===TOPSIDE_SPACE_ID){
    for(const light of mapObjectPointLights(topsideMapRecords,snapshot.content.registry,snapshot.clock?.authorityTick??0n,true)){
      if(worldPointVisible(light.worldX,light.worldY,{left:visible.left-light.radiusTiles*16,right:visible.right+light.radiusTiles*16,top:visible.top-light.radiusTiles*16,bottom:visible.bottom+light.radiusTiles*16}))
        pointLights.push(projectedLight(light,light.receiverDirectionWorldY,light.terrainContactX));
    }
  }
  const furnitureScene = dynamicLighting
    ? hearthFurnitureScene(snapshot.content.registry, snapshot.placeables) : null;
  if (dynamicLighting) for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const presentation = objectPresentations.resolve(snapshot.content, placeable);
    let light = presentation.authored
      ? presentation.light === null ? null
        : placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n, presentation.light)
      : placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n);
    const furniture = furnitureScene?.get(placeable.id.toString());
    if (hearthFurnitureShapeForPlaceable(snapshot.content.registry, placeable) !== null) {
      if (!furniture) continue;
      const parent = snapshot.placeables.get(BigInt(furniture.rootId));
      const parentPresentation = parent ? objectPresentations.resolve(snapshot.content, parent) : null;
      if (!parentPresentation?.stateJsonValid || !parentPresentation.sprite?.asset) continue;
      if (!presentation.stateJsonValid || !presentation.sprite?.asset) continue;
      if (light !== null) light = { ...light, worldX: furniture.anchor.x,
        worldY: light.worldY + furniture.anchor.y - (placeable.tileY + 1) * 16,
        receiverDirectionWorldY: furniture.contact.y };
    }
    if (light !== null && worldPointVisible(light.worldX, light.worldY, lightVisible)) {
      pointLights.push(projectedLight(light.profile === 'flame' ? { ...light, color: { r: 255, g: 142, b: 62 } } : light,
        furniture?.contact.y));
    }
  }
  if (!debugEntitiesHidden && (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    || activeSpaceDefinition.generator === 'homestead')) {
    const authoredMapDocument = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID ? topsideMapRecords : null;
    const decorations: readonly RuntimeSurvivalDecoration[] = activeSpaceDefinition.generator === 'homestead'
      ? homesteadSurroundingDecorations(seed) : topsideDecorations(snapshot, seed);
    const generatedSuppressions = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? new Set(topsideMapRecords?.generatedSuppressions ?? [])
      : new Set<string>();
    const landmarkCampfires = new Map(runtimeLandmarkCampfirePlans(snapshot.content.registry)
      .filter(plan => plan.spaceId === activeSpaceDefinition.spaceId)
      .map(plan => [plan.runtimeId, plan]));
    for (const decoration of decorations) {
    if (generatedSuppressions.has(String(decoration.id))
      || generatedSuppressions.has(`decoration-${decoration.id}`)
      || generatedSuppressions.has(`decoration:${decoration.id}`)) continue;
    const campfirePlan = landmarkCampfires.get(BigInt(decoration.id));
    if (campfirePlan !== undefined && campfirePlan.tileX === decoration.tileX
      && campfirePlan.tileY === decoration.tileY) continue;
    if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      && survivalDecorationResource(decoration, snapshot.content.registry) !== null) continue;
    const decorationX = decoration.tileX * 16 + 8;
    const decorationY = (decoration.tileY + 1) * 16;
    if (!worldPointVisible(decorationX, decorationY, visible)) continue;
    enqueueWorldDepth(decorationX, decorationY, {
      footY: overworldPoiDecorationDepthY(decoration.kind, decorationY),
      tie: decoration.landmark === undefined
        ? `decoration:${decoration.id}`
        : authoredMapDocument === null
          ? `landmark:${decoration.landmark.id}`
          : authoredMapContentPainterTie(
            authoredMapDocument,
            decoration.landmark.layer,
            'landmark',
            decoration.landmark.id,
          ),
      draw: () => {
        const drawRawDecoration = (): void => drawOverworldPoiDecoration(
          context,
          art,
          decoration.kind,
          decorationX,
          decorationY,
          cameraX,
          cameraY,
          scale,
          decoration.variant,
          natureDecorationFrame(
            decoration.kind,
            visualTickClock.renderTick,
            decoration.animationOffset,
            renderWeather.wind,
          ),
          true,
          frameLightingModel === 'unified' && decoration.kind === 'camp_pond'
            ? pondShimmerFrameAtTick(visualTickClock.renderTick)
            : null,
        );
        const drawDecoration = (): void => {
          const landmark = decoration.landmark;
          if (landmark === undefined) {
            drawRawDecoration();
            return;
          }
          const screenX = Math.round((decorationX - cameraX) * scale);
          const screenY = Math.round((decorationY - cameraY) * scale);
          drawLandmarkTransform(context, landmark, screenX, screenY, drawRawDecoration);
        };
        if (frameLightingModel !== 'unified' && (survivalDecorationBlocksTraversal(
          decoration.kind, 'ground', snapshot.content.registry,
        )
          && decoration.kind !== 'camp_pond' && !isLightEmitterKind(decoration.kind))) {
          drawSouthFacingReceiver(decorationX, decorationY, drawDecoration);
        } else {
          drawDecoration();
        }
      },
    }, decorationY, unifiedDecorationLightReceiver(decoration.kind));
    }
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
        // The ladder leans on the chamber's north wall. Its foot-anchored
        // three-tile sprite is drawn from the top edge of the entry tile, so it
        // covers the two wall-face rows and the first floor row: the bottom rung
        // rests on the exit tile and the climb prompt is one tile below it.
        { kind: 'cellar_ladder', tileX: CELLAR_ENTRY_TILE.tileX, tileY: CELLAR_ENTRY_TILE.tileY },
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

export const enqueueGameplayDecorations = profilePainterProducer('decorations', buildEnqueueGameplayDecorations);
