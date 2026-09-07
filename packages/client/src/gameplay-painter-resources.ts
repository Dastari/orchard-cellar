import { RetainedFrameCommands } from './retained-frame-commands.js';
import { FIXED_UNITS_PER_PIXEL, cropGrowthAt, isBreakableRockKind, isChoppableTreeKind, isGatherableResourceKind, isMineableOreKind, runtimeIsRecoverableProjectileItem, recoverableArrowDirection, treeGrowthStageName } from '@orchard/sim';
import { drawOverworldArrow, drawOverworldCrop, drawOverworldItem, drawOverworldOreNode, drawOverworldPoiDecoration, drawOverworldRock, drawOverworldStump, drawOverworldTree, drawOverworldTreeRegrowth, natureDecorationFrame } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { deterministicFlameFlicker } from '@orchard/engine/light-sources';
import { treeSwayOffset } from '@orchard/engine/weather-effects';
import type { GameplayPainterInputs, RenderWorldResource } from './gameplay-painter-inputs.js';

const frameCommandPools = new WeakMap<CanvasRenderingContext2D, RetainedFrameCommands>();

type Inputs = Pick<GameplayPainterInputs,
  'terrain' |
  'debugEntitiesHidden' | 'worldResourcesIncludingPersonalQuest' | 'snapshot' | 'homesteadSurroundingResources' | 'seed' |
  'liveMapSuppressesGeneratedResource' | 'visible' | 'windTrees' | 'renderWeather' | 'weatherVisualTick' |
  'enqueueWorldDepth' | 'context' | 'art' | 'cameraX' | 'cameraY' |
  'scale' | 'visualTickClock' | 'treeShakeRemaining' | 'effectPhase' | 'drawSouthFacingReceiver' |
  'miningClassFromWire' | 'cropDefinitionForSnapshot' | 'renderAuthorityTick' | 'cropAutomaticallyWateredForSnapshot' | 'cropCalendarOffsetForSnapshot' |
  'cropGreenhouseProtectedForSnapshot' | 'liveItemContentDefinition' | 'dynamicLighting' | 'lightVisible' | 'pointLights' |
  'projectedLight'
>;

/** Retain draw commands by entity identity; refresh captured state before enqueue. */
export function enqueueGameplayResources(input: Inputs): void {
  const commands = frameCommandPools.get(input.context) ?? new RetainedFrameCommands();
  frameCommandPools.set(input.context, commands);
  commands.begin(input.terrain);
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
    type Captures0 = {
      resource: typeof resource; context: typeof context; art: typeof art; resourceX: typeof resourceX;
      resourceY: typeof resourceY; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
      visualTickClock: typeof visualTickClock; renderWeather: typeof renderWeather; treeShakeRemaining: typeof treeShakeRemaining;
      effectPhase: typeof effectPhase; drawSouthFacingReceiver: typeof drawSouthFacingReceiver;
      miningClassFromWire: typeof miningClassFromWire; sway: typeof sway;
    };
    let retained0 = commands.find<Captures0>(0, resource.id);
    if (retained0 === undefined) {
      const captured0: Captures0 = {
        resource, context, art, resourceX, resourceY, cameraX, cameraY, scale, visualTickClock, renderWeather, treeShakeRemaining,
        effectPhase, drawSouthFacingReceiver, miningClassFromWire, sway,
      };
      retained0 = commands.insert(0, resource.id, captured0, {
        footY: resourceY,
        tie: `resource:${resource.id}`,
        draw: () => {
          const {
            resource, context, art, resourceX, resourceY, cameraX, cameraY, scale, visualTickClock, renderWeather,
            treeShakeRemaining, effectPhase, drawSouthFacingReceiver, miningClassFromWire, sway,
          } = captured0;

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
          drawOverworldTree(
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

        },
      });
    }
    retained0.state.resource = resource; retained0.state.context = context; retained0.state.art = art; retained0.state.resourceX = resourceX;
    retained0.state.resourceY = resourceY; retained0.state.cameraX = cameraX; retained0.state.cameraY = cameraY; retained0.state.scale = scale;
    retained0.state.visualTickClock = visualTickClock; retained0.state.renderWeather = renderWeather; retained0.state.treeShakeRemaining = treeShakeRemaining; retained0.state.effectPhase = effectPhase;
    retained0.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained0.state.miningClassFromWire = miningClassFromWire; retained0.state.sway = sway;
    retained0.item.footY = resourceY;
    enqueueWorldDepth(resourceX, resourceY, retained0.item, resourceY, resource.kind === 'fish_pool' ? 'flat' : 'south');
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
    type Captures1 = {
      context: typeof context; art: typeof art; definition: typeof definition; growth: typeof growth; x: typeof x; y: typeof y;
      cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
    };
    let retained1 = commands.find<Captures1>(1, crop.id);
    if (retained1 === undefined) {
      const captured1: Captures1 = { context, art, definition, growth, x, y, cameraX, cameraY, scale };
      retained1 = commands.insert(1, crop.id, captured1, {
        footY: y,
        tie: `crop:${crop.id}`,
        draw: () => {
          const { context, art, definition, growth, x, y, cameraX, cameraY, scale } = captured1;
          drawOverworldCrop(
            context, art, definition.assetKey.slice('crop_cf_'.length),
            growth.stage, x, y, cameraX, cameraY, scale,
          );
        },
      });
    }
    retained1.state.context = context; retained1.state.art = art; retained1.state.definition = definition; retained1.state.growth = growth;
    retained1.state.x = x; retained1.state.y = y; retained1.state.cameraX = cameraX; retained1.state.cameraY = cameraY;
    retained1.state.scale = scale;
    retained1.item.footY = y;
    enqueueWorldDepth(x, y, retained1.item);
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
    type Captures2 = {
      landedArrowDirection: typeof landedArrowDirection; context: typeof context; art: typeof art; x: typeof x; y: typeof y;
      cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale; item: typeof item; arcHeight: typeof arcHeight;
    };
    let retained2 = commands.find<Captures2>(2, item.id);
    if (retained2 === undefined) {
      const captured2: Captures2 = { landedArrowDirection, context, art, x, y, cameraX, cameraY, scale, item, arcHeight };
      retained2 = commands.insert(2, item.id, captured2, {
        footY: y,
        tie: `item:${item.id}`,
        draw: () => {
          const { landedArrowDirection, context, art, x, y, cameraX, cameraY, scale, item, arcHeight } = captured2;

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
    retained2.state.landedArrowDirection = landedArrowDirection; retained2.state.context = context; retained2.state.art = art; retained2.state.x = x;
    retained2.state.y = y; retained2.state.cameraX = cameraX; retained2.state.cameraY = cameraY; retained2.state.scale = scale;
    retained2.state.item = item; retained2.state.arcHeight = arcHeight;
    retained2.item.footY = y;
    enqueueWorldDepth(x, y, retained2.item);
  }
  commands.finish();
}
