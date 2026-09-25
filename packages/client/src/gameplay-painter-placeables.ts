import {terrainElevationAtWorldFoot} from '@orchard/engine/terrain';
import {drawConnectedObject} from '@orchard/engine/connected-objects';
import { connectedObjectDefinitionFamily, connectedObjectCatalogue, connectedObjectIndex } from '@orchard/sim/connected-objects';
import {seatedFurnitureForPlayer} from './hearth-seating.js';
import {actionVisualForDirection} from '@orchard/engine/overworld-art';
import { profilePainterProducer } from './painter-producer-profile.js';
import { runtimeObjectDamageable, runtimeObjectDefinition } from '@orchard/sim/content/object-capabilities';
import { runtimeSpaceSurfaceDefinition } from '@orchard/sim/content/runtime';
import { runtimePlaceableDefinition, placeableObjectDefinition } from '@orchard/sim/crafting';
import { hearthFurnitureScene, hearthFurnitureDrawGroup } from '@orchard/sim/hearth-furniture-scene';
import { hearthFurnitureShapeForPlaceable } from '@orchard/sim/hearth-furniture-state';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim/state';
import { drawAuthoredOverworldObject, drawOverworldChest, drawOverworldHive, drawOverworldItem, drawOverworldPlaceable, drawOverworldPoiDecoration } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { fruitPressContentsAnimation } from './fruit-press-presentation.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';
import { objectHasAuthoredTag } from './content/object-interaction.js';

type Inputs = Pick<GameplayPainterInputs,
  'terrain' | 'snapshot' | 'animatedOpenChestId' | 'closingChestId' | 'chestAnimationStartedAtMs' | 'debugEntitiesHidden' |
  'visible' | 'enqueueWorldDepth' | 'drawSouthFacingReceiver' | 'context' | 'art' |
  'cameraX' | 'cameraY' | 'scale' | 'projectionAt' | 'targetableEntities' |
  'objectPresentations' | 'clientProcessorRuntime' | 'frameLightingModel'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayPlaceables(input: Inputs) {
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
    const storedDefinitionId = 'definitionId' in target && typeof target.definitionId === 'string'
      ? target.definitionId.trim() : '';
    const reference = storedDefinitionId === ''
      ? { kind: target.kind }
      : { kind: target.kind, definitionId: storedDefinitionId };
    const definition = runtimeObjectDefinition(snapshot.content.registry, reference);
    const damageable = runtimeObjectDamageable(snapshot.content.registry, reference);
    if (definition === null || damageable?.model !== 'health') continue;
    const presentation = objectPresentations.resolve(snapshot.content, {
      id: target.id,
      kind: target.kind,
      definitionId: definition.id,
      open: false,
      lit: true,
      stateJson: '{}',
    });
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
        const sprite = presentation.sprite;
        if (sprite?.asset !== null && sprite?.asset !== undefined) {
          drawAuthoredOverworldObject(
            context, sprite.asset, sprite.animation, Math.floor(performance.now() / 125),
            x, y, cameraX, cameraY, scale, sprite.scale,
          );
        }
      }),
    });
  }
  const connectionCatalogue=connectedObjectCatalogue(snapshot.content.registry.tilesets);
  const fenceCells=[...snapshot.placeables].flatMap(row=>{
    const definition=placeableObjectDefinition(snapshot.content.registry,row);
    const family=connectedObjectDefinitionFamily(definition,connectionCatalogue);
    return row.carriedBy === undefined && family ? [{tileX:row.tileX,tileY:row.tileY,
      elevation:terrainElevationAtWorldFoot(input.terrain,row.tileX*16+8,(row.tileY+1)*16),space:row.spaceId,family,...(definition?{definition}:{})}] : [];
  });
  const joinMask=connectedObjectIndex(fenceCells,connectionCatalogue);
  const furnitureScene = hearthFurnitureScene(snapshot.content.registry, snapshot.placeables);
  const occupiedSeats=new Set([...snapshot.players].flatMap(player=>{
    const seat=seatedFurnitureForPlayer(player,snapshot.placeables,snapshot.content.registry);
    return seat&&art.itemIcons[seat.placement.shape.id]&&actionVisualForDirection(art,'sitting','down')?[seat.row.id]:[];
  }));
  if (!debugEntitiesHidden) for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined || occupiedSeats.has(placeable.id)) continue;
    if (hearthFurnitureShapeForPlaceable(snapshot.content.registry, placeable) !== null) {
      const entry = furnitureScene.get(placeable.id.toString());
      if (!entry || entry.rootId !== entry.placement.id) continue;
      // Never show attachments floating above a missing/corrupt parent sprite.
      const parentPresentation = objectPresentations.resolve(snapshot.content, placeable);
      if (!parentPresentation.stateJsonValid || !parentPresentation.sprite?.asset) continue;
      const { x, y } = entry.contact;
      if (!worldPointVisible(x, y, visible)) continue;
      const group = hearthFurnitureDrawGroup(furnitureScene, entry.rootId);
      enqueueWorldDepth(x, y, {
        footY: y, tie: `placeable:${placeable.id}`,
        depthPhase: entry.placement.shape.layer === 'floor' ? 'surface' : 'entity',
        draw: () => {
          for (const member of group) {
            const row = snapshot.placeables.get(BigInt(member.placement.id));
            if (!row) continue;
            const sprite = objectPresentations.resolve(snapshot.content, row).sprite;
            if (!sprite?.asset) continue;
            const draw = () => { drawAuthoredOverworldObject(context, sprite.asset!, sprite.animation,
              Math.floor(performance.now() / 125), member.anchor.x, member.anchor.y, cameraX, cameraY, scale, sprite.scale); };
            if (member.placement.shape.layer === 'floor') draw();
            else drawSouthFacingReceiver(member.contact.x, member.contact.y, draw);
          }
        },
      }, y, entry.placement.shape.layer === 'floor' ? 'flat' : 'south');
      continue;
    }
    const x = placeable.tileX * 16 + 8;
    const y = (placeable.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    const storedDefinitionId = placeable.definitionId?.trim() ?? '';
    const authoredDefinition = placeableObjectDefinition(snapshot.content.registry, placeable);
    // Durable authored identity is exact. A missing or retired explicit id must
    // not reveal similarly-named compiled art; only pre-schema blank ids retain
    // kind-based compatibility.
    if (storedDefinitionId !== '' && authoredDefinition === null) continue;
    const presentation = objectPresentations.resolve(snapshot.content, placeable);
    const definition = runtimePlaceableDefinition(snapshot.content.registry, placeable);
    const connectionFamily=connectedObjectDefinitionFamily(authoredDefinition,connectionCatalogue);
    const fenceMask=connectionFamily ? joinMask({tileX:placeable.tileX,tileY:placeable.tileY,
      elevation:terrainElevationAtWorldFoot(input.terrain,x,y),space:placeable.spaceId,family:connectionFamily,...(authoredDefinition?{definition:authoredDefinition}:{})}) : 0;
    const processor = clientProcessorRuntime(snapshot, placeable);
    const pressInputSlot = processor?.adapter === 'press'
      ? processor.processor.slotRoles.input?.[0] : undefined;
    const pressContents = fruitPressContentsAnimation(snapshot.content.registry, placeable,
      snapshot.activePlaceable?.id === placeable.id && pressInputSlot !== undefined
        ? snapshot.openPlaceableSlots.get(pressInputSlot) : undefined,
      processor);
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `placeable:${placeable.id}`,
      draw: () => {
        const drawPlaceable = (): void => {
          if (connectionFamily && placeable.kind !== 'fence_gate' && drawConnectedObject(context,connectionFamily,fenceMask,x,y,cameraX,cameraY,scale,connectionCatalogue)) return;
          if (authoredDefinition !== null) {
            const authoredSprite = presentation.authored ? presentation.sprite : null;
            if (authoredSprite?.asset === null || authoredSprite?.asset === undefined) return;
            drawAuthoredOverworldObject(
              context, authoredSprite.asset, authoredSprite.animation,
              authoredDefinition.components.sprite?.fenceJoin === true
                ? fenceMask : Math.floor(performance.now() / 125),
              x, y, cameraX, cameraY,
              scale, authoredSprite.scale, pressContents, presentation.appearance?.lighting.receivesGlobal ?? true,
            );
            return;
          }
          drawOverworldPlaceable(
            context, art, placeable.kind, placeable.open, fenceMask,
            Math.floor(performance.now() / 125), x, y, cameraX, cameraY, scale,
            objectHasAuthoredTag(snapshot.content.registry, placeable, 'station.furnace')
              ? placeable.smeltStartTick !== undefined : placeable.lit,
            pressContents,
          );
        };
        if (presentation.appearance?.lighting.receivesGlobal === false) {
          drawPlaceable();
        } else if (frameLightingModel === 'unified'
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
    if (runtimeSpaceSurfaceDefinition(snapshot.content.registry, surface) === null) continue;
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

export const enqueueGameplayPlaceables = profilePainterProducer('placeables', buildEnqueueGameplayPlaceables);
