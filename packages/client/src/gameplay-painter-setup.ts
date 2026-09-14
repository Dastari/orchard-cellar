import {projectPointLightToTerrain} from '@orchard/engine/light-projection';
import {activeHearthLobbyDefinition} from '@orchard/sim';
import {hearthLobbyOutsideDoor} from '@orchard/engine/hearth-lobby-scene';
import { profilePainterProducer } from './painter-producer-profile.js';
import { createGameplayPainter } from './gameplay-painter.js';
import { celestialLightingAtTick, celestialLightingAtCalendar } from '@orchard/engine/celestial-lighting';
import { AUTHORITY_TICK_MS, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { visibleWorldBounds, worldPointVisible } from '@orchard/engine/camera';
import { CAMPFIRE_LIGHT_RADIUS_TILES, type PointLight, type UnifiedLightReceiver } from '@orchard/engine/lighting';
import { enqueueRaisedTerrainDepth } from '@orchard/engine/raised-terrain-depth';
import { enqueueLiveMapObjects, liveIslandDocument } from '@orchard/engine/live-map-runtime';
import { type WindTreeSource } from '@orchard/engine/weather-effects';
import { terrainElevationAtWorldFoot, terrainBaseDatum, terrainMaximumElevation, terrainMinimumElevation, terrainProjectedDepthAtFoot, terrainProjectedElevationAtFoot, terrainProjectedSortOffset, terrainVisualProjectionRowsPerLevel } from '@orchard/engine/terrain';
import { type TargetableWorldEntity } from './entity-targeting.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'terrain' | 'cameraX' | 'cameraY' | 'frame' | 'scale' |
  'context' | 'seasonalDynamic' | 'localX' | 'localTerrainContactY' | 'art' |
  'groundCache' | 'viewportWidth' | 'viewportHeight' | 'debugEntitiesHidden' | 'projectedLocalY' |
  'snapshot' | 'celestialPass' | 'activeSpaceDefinition' | 'renderItems' | 'weatherVisualTick' |
  'lightingPreview' | 'renderWeatherTick' | 'renderWeather' | 'alpha'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildPrepareGameplayPainter(input: Inputs) {
  const {
    terrain, cameraX, cameraY, frame, scale,
    context, seasonalDynamic, localX, localTerrainContactY, art,
    groundCache, viewportWidth, viewportHeight, debugEntitiesHidden, projectedLocalY,
    snapshot, celestialPass, activeSpaceDefinition, weatherVisualTick, lightingPreview,
    renderWeatherTick, renderWeather, alpha,
  } = input;
  let {
    renderItems,
  } = input;
  const baseDatum = terrainBaseDatum(terrain);
  const terrainProjectionMargin = Math.max(
    Math.abs(terrainMaximumElevation(terrain) - baseDatum),
    Math.abs(terrainMinimumElevation(terrain) - baseDatum),
  ) * terrainVisualProjectionRowsPerLevel(terrain) * 16;
  const visible = visibleWorldBounds(
    cameraX,
    cameraY,
    frame.layout.width,
    frame.layout.height,
    scale,
    Math.max(64, terrainProjectionMargin),
  );
  const lightVisible = visibleWorldBounds(
    cameraX,
    cameraY,
    frame.layout.width,
    frame.layout.height,
    scale,
    (CAMPFIRE_LIGHT_RADIUS_TILES + 1) * 16,
  );
  // All non-ground world art (players, trees, items, future buildings/props/NPCs)
  // must enter this queue so weather and later depth layers cannot bypass it.
  const projectionAt = (worldX: number, worldFootY: number): number => (
    terrainProjectedDepthAtFoot(terrain, worldX, worldFootY)
  );
  const projectedWorldY = (worldX: number, worldFootY: number): number => (
    worldFootY - projectionAt(worldX, worldFootY)
  );
  let drawWorldReceiver: (footX: number, footY: number, draw: () => void, face?: UnifiedLightReceiver) => void = (_x, _y, draw) => draw();
  const projectTargetable = (
    entity: TargetableWorldEntity,
    worldX: number,
    worldFootY: number,
  ): TargetableWorldEntity => ({
    ...entity,
    y: entity.y - projectionAt(worldX, worldFootY),
  });
  const { worldDepthItems, movingCelestialCasters, enqueueWorldDepth } = createGameplayPainter({
    terrain, context, scale, seasonalDynamic, projectionAt,
    // Preserve the original late-bound receiver closure, assigned below.
    drawWorldReceiver: (x, y, draw, face) => drawWorldReceiver(x, y, draw, face),
  });
  const localCutawayElevation = terrainProjectedElevationAtFoot(
    terrain,
    localX,
    localTerrainContactY,
  );
  enqueueRaisedTerrainDepth(
    worldDepthItems,
    context,
    art,
    terrain,
    groundCache,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
    debugEntitiesHidden ? undefined : {
      worldX: localX,
      projectedFootY: projectedLocalY,
      depth: {
        footY: projectedLocalY,
        depthOffset: terrainProjectedSortOffset(localCutawayElevation),
        elevationLayer: Math.ceil(Math.max(0, localCutawayElevation - 0.001)),
        depthPhase: 'entity',
        tie: `player:${snapshot.identityHex}`,
      },
    },
    (x, y, level, face, draw) => {
      if (seasonalDynamic) celestialPass.renderer!.drawReceiver(context, x, y, level, face, draw);
      else draw();
    },
  );
  if (!debugEntitiesHidden && activeSpaceDefinition.generator === 'delve_lobby') {
    const lobby=activeHearthLobbyDefinition(snapshot.content.registry);
    const door=hearthLobbyOutsideDoor(context,art,cameraX,cameraY,scale,snapshot.content.registry);
    if(lobby!==null&&door!==null)worldDepthItems.push({...door,
      draw:()=>drawWorldReceiver((lobby.points.exit.tileX+.5)*16,
        (lobby.points.exit.tileY+.5)*16,door.draw)});
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    renderItems += enqueueLiveMapObjects(liveIslandDocument(
      snapshot.liveMapDocument, snapshot.content.registry,
    ), {
      context,
      cameraX,
      cameraY,
      scale,
      timeMs: weatherVisualTick * AUTHORITY_TICK_MS,
      visible: (worldX, worldY) => worldPointVisible(worldX, worldY, visible),
      enqueue: (worldX, worldFootY, item) => enqueueWorldDepth(worldX, worldFootY, item),
    });
  }
  const nameplates: Array<{ x: number; y: number; name: string; offline?: boolean }> = [];
  const questMarkerAnchors: Array<{ x: number; y: number; kind: 'offer' | 'complete' }> = [];
  const renderedPlayerAnchors = new Map<string, { readonly x: number; readonly y: number }>();
  const targetableEntities: TargetableWorldEntity[] = [];
  const pointLights: PointLight[] = [];
  const projectedLight = (light: PointLight, terrainSampleY?: number,terrainSampleX?:number): PointLight =>
    projectPointLightToTerrain(light,terrain,projectionAt,terrainSampleY,terrainSampleX);
  const outdoorSky = lightingPreview === null
    ? celestialLightingAtTick(renderWeatherTick, renderWeather.cloudCover ?? renderWeather.cloudShadow, alpha)
    : celestialLightingAtCalendar(lightingPreview);
  const frameAmbient = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.ambient === 'clock'
    ? outdoorSky.combined
    : activeSpaceDefinition.ambient === 'clock' ? { r: 255, g: 255, b: 255 } : activeSpaceDefinition.ambient;
  const frameSky = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.ambient === 'clock'
    ? outdoorSky : { ...outdoorSky, diffuse: frameAmbient, combined: frameAmbient,
      sun: { ...outdoorSky.sun, intensity: 0, illumination: { r: 0, g: 0, b: 0 } },
      moon: { ...outdoorSky.moon, intensity: 0, illumination: { r: 0, g: 0, b: 0 } } };
  let receiverLightingDepth = 0;
  const drawSouthFacingReceiver = (
    footX: number, footY: number, draw: () => void, face: UnifiedLightReceiver = 'south',
  ): void => {
    if (!seasonalDynamic || receiverLightingDepth > 0) { draw(); return; }
    receiverLightingDepth++;
    try {
      celestialPass.renderer!.drawReceiver(context, footX, footY,
        terrainElevationAtWorldFoot(terrain, footX, footY), face, draw);
    } finally { receiverLightingDepth--; }
  };
  drawWorldReceiver = drawSouthFacingReceiver;
  const windTrees: WindTreeSource[] = [];
  return { terrainProjectionMargin, visible, lightVisible, projectionAt, projectedWorldY, projectTargetable, worldDepthItems, movingCelestialCasters, enqueueWorldDepth, nameplates, questMarkerAnchors, renderedPlayerAnchors, targetableEntities, pointLights, projectedLight, frameAmbient, frameSky, drawSouthFacingReceiver, windTrees, renderItems };
}

export const prepareGameplayPainter = profilePainterProducer('setup', buildPrepareGameplayPainter);
