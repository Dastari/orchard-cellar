import { FIXED_UNITS_PER_PIXEL, cropGrowthAt, isBreakableRockKind, isChoppableTreeKind, isGatherableResourceKind, isMineableOreKind, runtimeIsRecoverableProjectileItem, recoverableArrowDirection, treeGrowthStageName } from '@orchard/sim';
import { drawOverworldArrow, drawOverworldCrop, drawOverworldItem, drawOverworldOreNode, drawOverworldPoiDecoration, drawOverworldRock, drawOverworldStump, drawOverworldTree, drawOverworldTreeRegrowth, natureDecorationFrame } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { deterministicFlameFlicker } from '@orchard/engine/light-sources';
import { treeSwayOffset } from '@orchard/engine/weather-effects';
import type { GameplayPainterInputs, RenderWorldResource } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'debugEntitiesHidden' | 'worldResourcesIncludingPersonalQuest' | 'snapshot' | 'homesteadSurroundingResources' | 'seed' |
  'liveMapSuppressesGeneratedResource' | 'visible' | 'windTrees' | 'renderWeather' | 'weatherVisualTick' |
  'enqueueWorldDepth' | 'context' | 'art' | 'cameraX' | 'cameraY' |
  'scale' | 'visualTickClock' | 'treeShakeRemaining' | 'effectPhase' | 'drawSouthFacingReceiver' |
  'miningClassFromWire' | 'cropDefinitionForSnapshot' | 'renderAuthorityTick' | 'cropAutomaticallyWateredForSnapshot' | 'cropCalendarOffsetForSnapshot' |
  'cropGreenhouseProtectedForSnapshot' | 'liveItemContentDefinition' | 'dynamicLighting' | 'lightVisible' | 'pointLights' |
  'projectedLight'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
export function enqueueGameplayResources(input: Inputs): void {
  const {
    debugEntitiesHidden, worldResourcesIncludingPersonalQuest, snapshot, homesteadSurroundingResources, seed,
    liveMapSuppressesGeneratedResource, visible, windTrees, renderWeather, weatherVisualTick,
    enqueueWorldDepth, context, art, cameraX, cameraY,
    scale, visualTickClock, treeShakeRemaining, effectPhase, drawSouthFacingReceiver,
    miningClassFromWire, cropDefinitionForSnapshot, renderAuthorityTick, cropAutomaticallyWateredForSnapshot, cropCalendarOffsetForSnapshot,
    cropGreenhouseProtectedForSnapshot, liveItemContentDefinition, dynamicLighting, lightVisible, pointLights,
    projectedLight,
  } = input;
  if (!debugEntitiesHidden) for (const resource of [
    ...worldResourcesIncludingPersonalQuest(snapshot), ...homesteadSurroundingResources(seed),
  ]) {
    if (liveMapSuppressesGeneratedResource(snapshot, resource.id)) continue;
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    if (!resource.depleted && isChoppableTreeKind(resource.kind)
      && (resource as RenderWorldResource).ambientOnly !== true) {
      windTrees.push({
        id: Number(resource.id & 0x7fffffffn),
        x: resourceX,
        y: resourceY,
        kind: resource.kind,
      });
    }
    const sway = treeSwayOffset(
      renderWeather,
      weatherVisualTick,
      Math.imul(resource.tileX, 73_856_093) ^ Math.imul(resource.tileY, 19_349_663),
    );
    enqueueWorldDepth(resourceX, resourceY, {
      footY: resourceY,
      tie: `resource:${resource.id}`,
      draw: () => {
        if (resource.kind === 'fish_pool') {
          if (resource.depleted) return;
          drawOverworldPoiDecoration(
            context,
            art,
            'nature_fish_shadow',
            resourceX,
            resourceY,
            cameraX,
            cameraY,
            scale,
            0,
            natureDecorationFrame(
              'nature_fish_shadow',
              visualTickClock.renderTick,
              Number(resource.id % 96n),
              renderWeather.wind,
            ),
          );
          return;
        }
        if (isGatherableResourceKind(resource.kind)) {
          if (resource.depleted) return;
          if (resource.kind === 'loose_stone') {
            drawOverworldRock(context, art, resourceX, resourceY, cameraX, cameraY, scale);
          } else {
            drawOverworldPoiDecoration(
              context, art, 'poi_fallen_log', resourceX, resourceY, cameraX, cameraY, scale,
            );
          }
          return;
        }
        if (isBreakableRockKind(resource.kind)) {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawSouthFacingReceiver(resourceX, resourceY, () => drawOverworldPoiDecoration(
            context, art, 'poi_rock_small', resourceX + shakeX, resourceY, cameraX, cameraY, scale,
          ));
          return;
        }
        if (isMineableOreKind(resource.kind)) {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawSouthFacingReceiver(resourceX, resourceY, () => drawOverworldOreNode(
            context, art, resource.kind, resourceX + shakeX, resourceY, cameraX, cameraY, scale,
            miningClassFromWire(resource.miningClass, resource.spaceId), resource.richness,
          ));
          return;
        }
        if (resource.depleted) {
          drawOverworldStump(
            context, art, resourceX, resourceY, cameraX, cameraY, scale,
            resource.kind, treeGrowthStageName(resource.growthStage),
          );
          return;
        }
        const growthStage = treeGrowthStageName(resource.growthStage);
        if (growthStage !== 'big') {
          drawOverworldTreeRegrowth(
            context, art, resourceX, resourceY, cameraX, cameraY, scale, resource.kind, growthStage,
          );
          return;
        }
        const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
        const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
        const drawTree = (): void => drawOverworldTree(
          context,
          art,
          resourceX + shakeX,
          resourceY - 4,
          false,
          cameraX,
          cameraY,
          scale,
          resource.kind,
          sway[0],
          sway[1],
        );
        drawTree();
      },
    }, resourceY, resource.kind === 'fish_pool' ? 'flat' : 'south');
  }
  if (!debugEntitiesHidden) for (const crop of snapshot.crops) {
    const definition = cropDefinitionForSnapshot(snapshot, crop.cropKind);
    const soil = snapshot.soil.get(crop.id);
    if (definition === null || soil === undefined) continue;
    const x = crop.tileX * 16 + 8;
    const y = (crop.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    const growth = cropGrowthAt(
      definition,
      crop.growthTicks,
      crop.growthUpdatedAtTick,
      soil.wateredAtTick,
      renderAuthorityTick,
      soil.watered,
      cropAutomaticallyWateredForSnapshot(snapshot, crop.spaceId, crop.tileX, crop.tileY),
      cropCalendarOffsetForSnapshot(snapshot),
      cropGreenhouseProtectedForSnapshot(snapshot, crop.spaceId),
    );
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `crop:${crop.id}`,
      draw: () => drawOverworldCrop(
        context, art, definition.assetKey.slice('crop_cf_'.length),
        growth.stage, x, y, cameraX, cameraY, scale,
      ),
    });
  }
  if (!debugEntitiesHidden) for (const item of snapshot.worldItems) {
    const x = item.x / FIXED_UNITS_PER_PIXEL;
    const y = item.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const age = Number((snapshot.clock?.authorityTick ?? item.droppedAtTick) - item.droppedAtTick);
    const arcHeight = age >= 0 && age < 8 ? Math.round(Math.sin(age / 8 * Math.PI) * 8) : 0;
    const itemLight = liveItemContentDefinition(snapshot, item.itemKind)?.light;
    if (dynamicLighting && itemLight !== undefined && item.lit && worldPointVisible(x, y, lightVisible)) {
      const flicker = itemLight.profile === 'flicker'
        ? deterministicFlameFlicker(item.id, visualTickClock.renderTick)
        : { radiusOffset: 0, strengthPerMille: 1000 };
      pointLights.push(projectedLight({
        worldX: x,
        worldY: y + (itemLight.offsetY ?? 0),
        receiverDirectionWorldY: y,
        radiusTiles: itemLight.radiusTiles + flicker.radiusOffset,
        color: { r: itemLight.color[0], g: itemLight.color[1], b: itemLight.color[2] },
        strengthPerMille: flicker.strengthPerMille,
        profile: itemLight.profile === 'flicker' ? 'flame' : 'steady',
      }));
    }
    const landedArrowDirection = runtimeIsRecoverableProjectileItem(
      snapshot.content.registry, item.itemKind, item.durability,
    )
      ? recoverableArrowDirection(item.durability)
      : null;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `item:${item.id}`,
      draw: () => {
        if (landedArrowDirection !== null) {
          drawOverworldArrow(
            context,
            art,
            x,
            y,
            landedArrowDirection.x,
            landedArrowDirection.y,
            cameraX,
            cameraY,
            scale,
            false,
          );
          return;
        }
        drawOverworldItem(
          context, art, item.itemKind, x, y, arcHeight, cameraX, cameraY, scale, item.lit,
        );
      },
    });
  }
}
