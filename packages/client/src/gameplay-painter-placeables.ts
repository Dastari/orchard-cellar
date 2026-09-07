import { FIXED_UNITS_PER_PIXEL, runtimePlaceableDefinition, fenceJoinMask, placeableHasInterface } from '@orchard/sim';
import { drawAuthoredOverworldObject, drawOverworldArcheryTarget, drawOverworldChest, drawOverworldHive, drawOverworldItem, drawOverworldPlaceable, drawOverworldPoiDecoration } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { fruitPressContentsAnimation } from './fruit-press-presentation.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'snapshot' | 'animatedOpenChestId' | 'closingChestId' | 'chestAnimationStartedAtMs' | 'debugEntitiesHidden' |
  'visible' | 'enqueueWorldDepth' | 'drawSouthFacingReceiver' | 'context' | 'art' |
  'cameraX' | 'cameraY' | 'scale' | 'projectionAt' | 'targetableEntities' |
  'objectPresentations' | 'clientProcessorRuntime' | 'frameLightingModel'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
export function enqueueGameplayPlaceables(input: Inputs) {
  const {
    snapshot, debugEntitiesHidden, visible, enqueueWorldDepth, drawSouthFacingReceiver,
    context, art, cameraX, cameraY, scale,
    projectionAt, targetableEntities, objectPresentations, clientProcessorRuntime, frameLightingModel,
  } = input;
  let {
    animatedOpenChestId, closingChestId, chestAnimationStartedAtMs,
  } = input;
  const nowMs = performance.now();
  const activeChestId = snapshot.activeChest?.id ?? null;
  if (activeChestId !== animatedOpenChestId) {
    if (animatedOpenChestId !== null) closingChestId = animatedOpenChestId;
    animatedOpenChestId = activeChestId;
    chestAnimationStartedAtMs = nowMs;
  }
  if (closingChestId !== null && nowMs - chestAnimationStartedAtMs >= 1_000) closingChestId = null;
  if (!debugEntitiesHidden) for (const chest of snapshot.chests) {
    if (chest.carriedBy !== undefined) continue;
    const x = chest.tileX * 16 + 8; const y = (chest.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y, tie: `chest:${chest.id}`,
      draw: () => {
        const elapsedFrame = Math.min(5, Math.floor((performance.now() - chestAnimationStartedAtMs) / (1_000 / 6)));
        const frameIndex = chest.id === activeChestId ? elapsedFrame
          : chest.id === closingChestId ? 5 - elapsedFrame : 0;
        drawSouthFacingReceiver(x, y, () => {
          drawOverworldChest(context, art, x, y, cameraX, cameraY, scale, frameIndex);
        });
      },
    });
  }
  if (!debugEntitiesHidden) for (const target of snapshot.combatTargets) {
    if (target.carriedBy !== undefined) continue;
    const x = target.x / FIXED_UNITS_PER_PIXEL;
    const y = target.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const projectedY = y - projectionAt(x, y);
    targetableEntities.push({
      target: { kind: 'combat_target', id: target.id },
      x,
      y: projectedY,
      halfWidth: 16,
      height: 31,
    });
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `combat-target:${target.id}`,
      draw: () => drawSouthFacingReceiver(x, y, () => {
        drawOverworldArcheryTarget(context, art, x, y, cameraX, cameraY, scale);
      }),
    });
  }
  const fenceTiles = new Set([...snapshot.placeables]
    .filter((row) => row.carriedBy === undefined
      && runtimePlaceableDefinition(snapshot.content.registry, row)?.connectsFence === true)
    .map((row) => `${row.tileX}:${row.tileY}`));
  if (!debugEntitiesHidden) for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const x = placeable.tileX * 16 + 8;
    const y = (placeable.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    const presentation = objectPresentations.resolve(snapshot.content, placeable);
    const definition = runtimePlaceableDefinition(snapshot.content.registry, placeable);
    const fenceMask = placeable.kind === 'fence'
      ? fenceJoinMask(placeable.tileX, placeable.tileY, (tileX, tileY) => fenceTiles.has(`${tileX}:${tileY}`))
      : 0;
    const pressInputSlot = placeable.kind === 'fruit_press'
      ? clientProcessorRuntime(snapshot, placeable)?.processor.slotRoles.input?.[0]
      : undefined;
    const pressContents = fruitPressContentsAnimation(placeable,
      snapshot.activePlaceable?.id === placeable.id && pressInputSlot !== undefined
        ? snapshot.openPlaceableSlots.get(pressInputSlot) : undefined);
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `placeable:${placeable.id}`,
      draw: () => {
        const drawPlaceable = (): void => {
          const authoredSprite = presentation.authored ? presentation.sprite : null;
          if (authoredSprite?.asset !== null && authoredSprite?.asset !== undefined
            && drawAuthoredOverworldObject(
              context, authoredSprite.asset, authoredSprite.animation,
              Math.floor(performance.now() / 125), x, y, cameraX, cameraY,
              scale, authoredSprite.scale, pressContents,
            )) return;
          drawOverworldPlaceable(
            context, art, placeable.kind, placeable.open, fenceMask,
            Math.floor(performance.now() / 125), x, y, cameraX, cameraY, scale,
            placeableHasInterface(placeable.kind, 'furnace') ? placeable.smeltStartTick !== undefined : placeable.lit,
            pressContents,
          );
        };
        if (frameLightingModel === 'unified'
          || ((presentation.collision?.blocksMovement ?? (definition?.blocksMovement === true))
            && presentation.light === null
            && (presentation.authored || !isLightEmitterKind(placeable.kind)))) {
          drawSouthFacingReceiver(x, y, drawPlaceable);
        } else {
          drawPlaceable();
        }
      },
    });
  }
  if (!debugEntitiesHidden) for (const surface of snapshot.surfaces) {
    const x = surface.tileX * 16 + 8;
    const y = (surface.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `surface:${surface.id}`,
      draw: () => frameLightingModel === 'unified'
        ? drawSouthFacingReceiver(x, y, () => drawOverworldPoiDecoration(
          context, art, 'marlow_tent_table', x, y, cameraX, cameraY, scale,
        ))
        : drawOverworldPoiDecoration(context, art, 'marlow_tent_table', x, y, cameraX, cameraY, scale),
    });
    for (const item of snapshot.questWorldItems) {
      if (item.surfaceId !== surface.id) continue;
      enqueueWorldDepth(x, y, {
        footY: y + 1,
        tie: `surface-item:${item.id}`,
        draw: () => drawOverworldItem(
          context, art, item.itemKind, x, y - 17, 0, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden) for (const hive of snapshot.hives) {
    const x = hive.tileX * 16 + 8;
    const y = (hive.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `hive:${hive.id}`,
      draw: () => frameLightingModel === 'unified'
        ? drawSouthFacingReceiver(x, y, () => drawOverworldHive(
          context, art, hive.kind, hive.variant, x, y, cameraX, cameraY, scale,
        ))
        : drawOverworldHive(context, art, hive.kind, hive.variant, x, y, cameraX, cameraY, scale),
    });
  }
  const horseAnimationFrame = Math.floor(performance.now() / 125);
  return { horseAnimationFrame, animatedOpenChestId, closingChestId, chestAnimationStartedAtMs };
}
