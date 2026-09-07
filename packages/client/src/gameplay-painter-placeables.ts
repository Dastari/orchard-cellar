import { RetainedFrameCommands } from './retained-frame-commands.js';
import { FIXED_UNITS_PER_PIXEL, runtimePlaceableDefinition, fenceJoinMask, placeableHasInterface } from '@orchard/sim';
import { drawAuthoredOverworldObject, drawOverworldArcheryTarget, drawOverworldChest, drawOverworldHive, drawOverworldItem, drawOverworldPlaceable, drawOverworldPoiDecoration } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { fruitPressContentsAnimation } from './fruit-press-presentation.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

const frameCommandPools = new WeakMap<CanvasRenderingContext2D, RetainedFrameCommands>();

type Inputs = Pick<GameplayPainterInputs,
  'terrain' |
  'snapshot' | 'animatedOpenChestId' | 'closingChestId' | 'chestAnimationStartedAtMs' | 'debugEntitiesHidden' |
  'visible' | 'enqueueWorldDepth' | 'drawSouthFacingReceiver' | 'context' | 'art' |
  'cameraX' | 'cameraY' | 'scale' | 'projectionAt' | 'targetableEntities' |
  'objectPresentations' | 'clientProcessorRuntime' | 'frameLightingModel'
>;

/** Retain draw commands by entity identity; refresh captured state before enqueue. */
export function enqueueGameplayPlaceables(input: Inputs) {
  const commands = frameCommandPools.get(input.context) ?? new RetainedFrameCommands();
  frameCommandPools.set(input.context, commands);
  commands.begin(input.terrain);
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
    type Captures0 = {
      chestAnimationStartedAtMs: typeof chestAnimationStartedAtMs; chest: typeof chest; activeChestId: typeof activeChestId;
      closingChestId: typeof closingChestId; drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x; y: typeof y;
      context: typeof context; art: typeof art; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
    };
    let retained0 = commands.find<Captures0>(0, chest.id);
    if (retained0 === undefined) {
      const captured0: Captures0 = {
        chestAnimationStartedAtMs, chest, activeChestId, closingChestId, drawSouthFacingReceiver, x, y, context, art, cameraX,
        cameraY, scale,
      };
      retained0 = commands.insert(0, chest.id, captured0, {
        footY: y, tie: `chest:${chest.id}`,
        draw: () => {
          const {
            chestAnimationStartedAtMs, chest, activeChestId, closingChestId, drawSouthFacingReceiver, x, y, context, art, cameraX,
            cameraY, scale,
          } = captured0;

          const elapsedFrame = Math.min(5, Math.floor((performance.now() - chestAnimationStartedAtMs) / (1_000 / 6)));
          const frameIndex = chest.id === activeChestId ? elapsedFrame
            : chest.id === closingChestId ? 5 - elapsedFrame : 0;
          drawSouthFacingReceiver(x, y, () => {
            drawOverworldChest(context, art, x, y, cameraX, cameraY, scale, frameIndex);
          });

        },
      });
    }
    retained0.state.chestAnimationStartedAtMs = chestAnimationStartedAtMs; retained0.state.chest = chest; retained0.state.activeChestId = activeChestId; retained0.state.closingChestId = closingChestId;
    retained0.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained0.state.x = x; retained0.state.y = y; retained0.state.context = context;
    retained0.state.art = art; retained0.state.cameraX = cameraX; retained0.state.cameraY = cameraY; retained0.state.scale = scale;
    retained0.item.footY = y;
    enqueueWorldDepth(x, y, retained0.item);
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
    type Captures1 = {
      drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x; y: typeof y; context: typeof context; art: typeof art;
      cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
    };
    let retained1 = commands.find<Captures1>(1, target.id);
    if (retained1 === undefined) {
      const captured1: Captures1 = { drawSouthFacingReceiver, x, y, context, art, cameraX, cameraY, scale };
      retained1 = commands.insert(1, target.id, captured1, {
        footY: y,
        tie: `combat-target:${target.id}`,
        draw: () => {
          const { drawSouthFacingReceiver, x, y, context, art, cameraX, cameraY, scale } = captured1;
          drawSouthFacingReceiver(x, y, () => {
            drawOverworldArcheryTarget(context, art, x, y, cameraX, cameraY, scale);
          });
        },
      });
    }
    retained1.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained1.state.x = x; retained1.state.y = y; retained1.state.context = context;
    retained1.state.art = art; retained1.state.cameraX = cameraX; retained1.state.cameraY = cameraY; retained1.state.scale = scale;
    retained1.item.footY = y;
    enqueueWorldDepth(x, y, retained1.item);
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
    type Captures2 = {
      presentation: typeof presentation; context: typeof context; x: typeof x; y: typeof y; cameraX: typeof cameraX;
      cameraY: typeof cameraY; scale: typeof scale; pressContents: typeof pressContents; art: typeof art;
      placeable: typeof placeable; fenceMask: typeof fenceMask; frameLightingModel: typeof frameLightingModel;
      definition: typeof definition; drawSouthFacingReceiver: typeof drawSouthFacingReceiver;
    };
    let retained2 = commands.find<Captures2>(2, placeable.id);
    if (retained2 === undefined) {
      const captured2: Captures2 = {
        presentation, context, x, y, cameraX, cameraY, scale, pressContents, art, placeable, fenceMask, frameLightingModel,
        definition, drawSouthFacingReceiver,
      };
      retained2 = commands.insert(2, placeable.id, captured2, {
        footY: y,
        tie: `placeable:${placeable.id}`,
        draw: () => {
          const {
            presentation, context, x, y, cameraX, cameraY, scale, pressContents, art, placeable, fenceMask, frameLightingModel,
            definition, drawSouthFacingReceiver,
          } = captured2;

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
    retained2.state.presentation = presentation; retained2.state.context = context; retained2.state.x = x; retained2.state.y = y;
    retained2.state.cameraX = cameraX; retained2.state.cameraY = cameraY; retained2.state.scale = scale; retained2.state.pressContents = pressContents;
    retained2.state.art = art; retained2.state.placeable = placeable; retained2.state.fenceMask = fenceMask; retained2.state.frameLightingModel = frameLightingModel;
    retained2.state.definition = definition; retained2.state.drawSouthFacingReceiver = drawSouthFacingReceiver;
    retained2.item.footY = y;
    enqueueWorldDepth(x, y, retained2.item);
  }
  if (!debugEntitiesHidden) for (const surface of snapshot.surfaces) {
    const x = surface.tileX * 16 + 8;
    const y = (surface.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    type Captures3 = {
      frameLightingModel: typeof frameLightingModel; drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x;
      y: typeof y; context: typeof context; art: typeof art; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
    };
    let retained3 = commands.find<Captures3>(3, surface.id);
    if (retained3 === undefined) {
      const captured3: Captures3 = { frameLightingModel, drawSouthFacingReceiver, x, y, context, art, cameraX, cameraY, scale };
      retained3 = commands.insert(3, surface.id, captured3, {
        footY: y,
        tie: `surface:${surface.id}`,
        draw: () => {
          const { frameLightingModel, drawSouthFacingReceiver, x, y, context, art, cameraX, cameraY, scale } = captured3;
          return frameLightingModel === 'unified'
            ? drawSouthFacingReceiver(x, y, () => drawOverworldPoiDecoration(
              context, art, 'marlow_tent_table', x, y, cameraX, cameraY, scale,
            ))
            : drawOverworldPoiDecoration(context, art, 'marlow_tent_table', x, y, cameraX, cameraY, scale);
        },
      });
    }
    retained3.state.frameLightingModel = frameLightingModel; retained3.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained3.state.x = x; retained3.state.y = y;
    retained3.state.context = context; retained3.state.art = art; retained3.state.cameraX = cameraX; retained3.state.cameraY = cameraY;
    retained3.state.scale = scale;
    retained3.item.footY = y;
    enqueueWorldDepth(x, y, retained3.item);
    for (const item of snapshot.questWorldItems) {
      if (item.surfaceId !== surface.id) continue;
      type Captures4 = {
        context: typeof context; art: typeof art; item: typeof item; x: typeof x; y: typeof y; cameraX: typeof cameraX;
        cameraY: typeof cameraY; scale: typeof scale;
      };
      let retained4 = commands.find<Captures4>(4, item.id);
      if (retained4 === undefined) {
        const captured4: Captures4 = { context, art, item, x, y, cameraX, cameraY, scale };
        retained4 = commands.insert(4, item.id, captured4, {
          footY: y + 1,
          tie: `surface-item:${item.id}`,
          draw: () => {
            const { context, art, item, x, y, cameraX, cameraY, scale } = captured4;
            drawOverworldItem(
              context, art, item.itemKind, x, y - 17, 0, cameraX, cameraY, scale,
            );
          },
        });
      }
      retained4.state.context = context; retained4.state.art = art; retained4.state.item = item; retained4.state.x = x;
      retained4.state.y = y; retained4.state.cameraX = cameraX; retained4.state.cameraY = cameraY; retained4.state.scale = scale;
      retained4.item.footY = y + 1;
      enqueueWorldDepth(x, y, retained4.item);
    }
  }
  if (!debugEntitiesHidden) for (const hive of snapshot.hives) {
    const x = hive.tileX * 16 + 8;
    const y = (hive.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    type Captures5 = {
      frameLightingModel: typeof frameLightingModel; drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x;
      y: typeof y; context: typeof context; art: typeof art; hive: typeof hive; cameraX: typeof cameraX; cameraY: typeof cameraY;
      scale: typeof scale;
    };
    let retained5 = commands.find<Captures5>(5, hive.id);
    if (retained5 === undefined) {
      const captured5: Captures5 = { frameLightingModel, drawSouthFacingReceiver, x, y, context, art, hive, cameraX, cameraY, scale };
      retained5 = commands.insert(5, hive.id, captured5, {
        footY: y,
        tie: `hive:${hive.id}`,
        draw: () => {
          const { frameLightingModel, drawSouthFacingReceiver, x, y, context, art, hive, cameraX, cameraY, scale } = captured5;
          return frameLightingModel === 'unified'
            ? drawSouthFacingReceiver(x, y, () => drawOverworldHive(
              context, art, hive.kind, hive.variant, x, y, cameraX, cameraY, scale,
            ))
            : drawOverworldHive(context, art, hive.kind, hive.variant, x, y, cameraX, cameraY, scale);
        },
      });
    }
    retained5.state.frameLightingModel = frameLightingModel; retained5.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained5.state.x = x; retained5.state.y = y;
    retained5.state.context = context; retained5.state.art = art; retained5.state.hive = hive; retained5.state.cameraX = cameraX;
    retained5.state.cameraY = cameraY; retained5.state.scale = scale;
    retained5.item.footY = y;
    enqueueWorldDepth(x, y, retained5.item);
  }
  const horseAnimationFrame = Math.floor(performance.now() / 125);
  commands.finish();
  return { horseAnimationFrame, animatedOpenChestId, closingChestId, chestAnimationStartedAtMs };
}
