import { resourceVisualState } from './resource-visual-state.js';
import { MINING_GLANCE_TICKS } from './mining-feedback.js';
import { profilePainterProducer } from './painter-producer-profile.js';
import { FIXED_UNITS_PER_PIXEL, naturalObjectId, resolveObjectDefinitionAppearance, cropGrowthAt, runtimeItemDefinition, runtimeResourceDefinition, runtimeIsRecoverableProjectileItem, recoverableArrowDirection } from '@orchard/sim';
import { drawAuthoredOverworldObject, drawAuthoredResourceVisual, drawOverworldArrow, drawOverworldCrop, drawOverworldItem, natureDecorationFrame } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { deterministicFlameFlicker } from '@orchard/engine/light-sources';
import { treeSwayOffset } from '@orchard/engine/weather-effects';
import type { GameplayPainterInputs, RenderWorldResource } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'debugEntitiesHidden' | 'worldResourcesIncludingPersonalQuest' | 'snapshot' | 'homesteadSurroundingResources' | 'seed' |
  'liveMapSuppressesGeneratedResource' | 'visible' | 'windTrees' | 'renderWeather' | 'weatherVisualTick' |
  'enqueueWorldDepth' | 'context' | 'art' | 'cameraX' | 'cameraY' |
  'scale' | 'visualTickClock' | 'treeShakeRemaining' | 'resourceGlanceRemaining' | 'effectPhase' | 'drawSouthFacingReceiver' |
  'miningClassFromWire' | 'cropDefinitionForSnapshot' | 'renderAuthorityTick' | 'cropAutomaticallyWateredForSnapshot' | 'cropCalendarOffsetForSnapshot' |
  'cropGreenhouseProtectedForSnapshot' | 'dynamicLighting' | 'lightVisible' | 'pointLights' |
  'projectedLight' | 'objectPresentations'
>;

// A white flash on the struck face, then sparks flying off it, bright then cooling, over MINING_GLANCE_TICKS.
const GLANCE_SPARKS = [[-1, -1], [1, -1], [-1.4, 0], [1.4, 0], [-0.7, 0.8], [0.7, 0.8]] as const;
export function drawGlanceSparks(context: CanvasRenderingContext2D, worldX: number, worldY: number,
  cameraX: number, cameraY: number, scale: number, age: number): void {
  // Same quantization as drawAnchored, so the sparks share the vein's pixel phase.
  const at = (x: number, y: number, size: number) => context.fillRect(Math.round(x * scale) - Math.round(cameraX * scale),
    Math.round(y * scale) - Math.round(cameraY * scale), Math.max(1, Math.round(size * scale)), Math.max(1, Math.round(size * scale)));
  if (age < 3) {
    context.fillStyle = '#ffffff';
    at(worldX - 1, worldY, 1); at(worldX + 1, worldY, 1); at(worldX, worldY - 1, 1); at(worldX, worldY + 1, 1); at(worldX, worldY, 1);
  }
  context.fillStyle = age < 4 ? '#ffffff' : age < 8 ? '#fee761' : '#feae34';
  const size = age < 6 ? 2 : 1, distance = 3 + age * 1.5;
  for (const [dx, dy] of GLANCE_SPARKS) at(worldX + dx * distance, worldY + dy * distance, size);
}

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayResources(input: Inputs): void {
  const {
    debugEntitiesHidden, worldResourcesIncludingPersonalQuest, snapshot, homesteadSurroundingResources, seed,
    liveMapSuppressesGeneratedResource, visible, windTrees, renderWeather, weatherVisualTick,
    enqueueWorldDepth, context, art, cameraX, cameraY,
    scale, visualTickClock, treeShakeRemaining, resourceGlanceRemaining, effectPhase, drawSouthFacingReceiver,
    miningClassFromWire, cropDefinitionForSnapshot, renderAuthorityTick, cropAutomaticallyWateredForSnapshot, cropCalendarOffsetForSnapshot,
    cropGreenhouseProtectedForSnapshot, dynamicLighting, lightVisible, pointLights,
    projectedLight, objectPresentations,
  } = input;
  if (!debugEntitiesHidden) for (const resource of [
    ...worldResourcesIncludingPersonalQuest(snapshot), ...homesteadSurroundingResources(seed),
  ]) {
    if (liveMapSuppressesGeneratedResource(snapshot, resource.id)) continue;
    const definition = runtimeResourceDefinition(snapshot.content.registry, resource);
    if (definition === null) continue;
    const visualState = resourceVisualState(resource, definition, renderAuthorityTick);
    const objectId = naturalObjectId(definition.id);
    const object = snapshot.content.registry.objects.get(objectId);
    const appearance = object === undefined ? null : resolveObjectDefinitionAppearance(object, { stage: visualState });
    const resolvedVisual = appearance?.sprite === null || appearance?.sprite === undefined ? definition.visual
      : { ...definition.visual, asset: appearance.sprite.asset };
    const visualScale = appearance?.sprite?.scale ?? 1;
    const visualKind = resolvedVisual.asset;
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    if (!resource.depleted && definition.visual.kind === 'tree'
      && (resource as RenderWorldResource).ambientOnly !== true) {
      windTrees.push({
        id: Number(resource.id & 0x7fffffffn),
        x: resourceX,
        y: resourceY,
        kind: visualKind,
        leafProfile: definition.visual.leaf?.[0],
        canopyWidth: definition.visual.leaf?.[1],
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
        if (object !== undefined && snapshot.content.registry.definitions.has(objectId)) {
          const stage = object.components.states?.stage;
          const stateJson = stage?.type === 'enum' && stage.values.includes(visualState) ? JSON.stringify({ stage: visualState }) : '{}';
          const sprite = objectPresentations.resolve(snapshot.content, { id: resource.id, kind: resource.kind,
            definitionId: objectId, stateJson, open: false, lit: false }).sprite;
          if (sprite?.asset !== null && sprite?.asset !== undefined) {
            drawAuthoredOverworldObject(context, sprite.asset, sprite.animation, Math.floor(visualTickClock.renderTick),
              resourceX, resourceY, cameraX, cameraY, scale, sprite.scale);
            return;
          }
        }
        if (definition.visual.kind === 'fish') {
          if (resource.depleted) return;
          drawAuthoredResourceVisual(
            context, art, resolvedVisual, 'mature', resourceX, resourceY,
            cameraX, cameraY, scale * visualScale, 'mixed', 1, natureDecorationFrame(
              'nature_fish_shadow',
              visualTickClock.renderTick,
              Number(resource.id % 96n),
              renderWeather.wind,
            ),
          );
          return;
        }
        if (definition.interaction.mode === 'gather') {
          if (resource.depleted) return;
          drawAuthoredResourceVisual(
            context, art, resolvedVisual, 'mature', resourceX, resourceY,
            cameraX, cameraY, scale * visualScale,
          );
          return;
        }
        if (definition.visual.kind === 'rock' || definition.visual.kind === 'ore') {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawSouthFacingReceiver(resourceX, resourceY, () => drawAuthoredResourceVisual(
            context, art, resolvedVisual, 'mature', resourceX + shakeX, resourceY,
            cameraX, cameraY, scale * visualScale,
            miningClassFromWire(resource.miningClass, resource.spaceId), resource.richness,
          ));
          const glance = resourceGlanceRemaining.get(resource.id) ?? 0;
          if (glance > 0) drawGlanceSparks(context, resourceX, resourceY - 9, cameraX, cameraY, scale, MINING_GLANCE_TICKS - glance);
          return;
        }
        const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
        const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
        const drawTree = (): void => drawAuthoredResourceVisual(
          context, art, resolvedVisual, 'mature',
          resourceX + shakeX, resourceY, cameraX, cameraY, scale * visualScale,
          'mixed', 1, 0, sway[0], sway[1],
        );
        drawTree();
      },
    }, resourceY, definition.visual.kind === 'fish' ? 'flat' : 'south');
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
    const objectId = naturalObjectId(`crop:${crop.cropKind}`);
    const object = snapshot.content.registry.objects.get(objectId);
    const state: Record<string, number> = object?.components.states?.stage?.type === 'counter' ? { stage: growth.stage } : {};
    const appearance = object === undefined ? null : resolveObjectDefinitionAppearance(object, state);
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `crop:${crop.id}`,
      draw: () => {
        if (object !== undefined && snapshot.content.registry.definitions.has(objectId)) {
          const sprite = objectPresentations.resolve(snapshot.content, { id: crop.id, kind: crop.cropKind,
            definitionId: objectId, stateJson: JSON.stringify(state), open: false, lit: false }).sprite;
          if (sprite?.asset !== null && sprite?.asset !== undefined) {
            drawAuthoredOverworldObject(context, sprite.asset, sprite.animation, growth.stage, x, y, cameraX, cameraY, scale, sprite.scale);
            return;
          }
        }
        drawOverworldCrop(context, art, (appearance?.sprite?.asset ?? definition.assetKey).slice('crop_cf_'.length),
          growth.stage, x, y, cameraX, cameraY, scale * (appearance?.sprite?.scale ?? 1));
      },
    });
  }
  if (!debugEntitiesHidden) for (const item of snapshot.worldItems) {
    const definition = runtimeItemDefinition(snapshot.content.registry, item.itemKind);
    if (definition === null) continue;
    const x = item.x / FIXED_UNITS_PER_PIXEL;
    const y = item.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const age = Number((snapshot.clock?.authorityTick ?? item.droppedAtTick) - item.droppedAtTick);
    const arcHeight = age >= 0 && age < 8 ? Math.round(Math.sin(age / 8 * Math.PI) * 8) : 0;
    const itemLight = snapshot.content.registry.items.get(`item:${item.itemKind}`)?.light;
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

export const enqueueGameplayResources = profilePainterProducer('resources', buildEnqueueGameplayResources);
