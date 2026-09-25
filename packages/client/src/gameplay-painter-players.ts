import {seatedFurnitureForPlayer,hearthSeatedFrame} from './hearth-seating.js';
import {drawHearthSeatedGroup} from '@orchard/engine/hearth-seating-scene';
import {DEFAULT_PLAYER_APPEARANCE} from '@orchard/engine/overworld-art';
import { drawPlayerDefenseCue } from '@orchard/engine/combat-telegraph';
import { profilePainterProducer } from './painter-producer-profile.js';
import { humanoidShadowContactY, horseShadowBody } from '@orchard/engine/overworld-art';
import type { Direction } from '@orchard/sim';
import { runtimeNpcMount } from '@orchard/sim/content/npc-runtime';
import { runtimeObjectDefinition } from '@orchard/sim/content/object-capabilities';
import { AUTHORITY_TICK_MS } from '@orchard/sim/net-timing';
import { bowHeldAnimationFrame } from '@orchard/sim/ranged';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim/state';
import { AvatarAnimationController } from './net/netcode.js';
import { drawAuthoredOverworldObject, drawOverworldArcheryTarget, drawOverworldAvatar, drawOverworldChest, drawOverworldHorse, drawOverworldBoat, drawOverworldBoatMountedAction, drawOverworldMountedAction, actionVisualForDirection, avatarAnimationForDirection, horseJumpPose, heldLightAnimationForDirection } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { drawFishingLine, fishingRodTipOffset } from '@orchard/engine/fishing-line';
import { playerLightPosition } from '@orchard/engine/lighting';
import { deterministicFlameFlicker } from '@orchard/engine/light-sources';
import { terrainContactWorldYForPlayer } from '@orchard/engine/terrain';
import { interpolateFixedPosition, presentationMoving } from './overworld-prediction.js';
import { worldPlayerIsOffline } from './player-presence.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

function carriedObjectStateJson(
  definition: NonNullable<ReturnType<typeof runtimeObjectDefinition>>,
  stateJson: string,
  lit: boolean,
): string {
  if (definition.components.states?.lit?.type !== 'bool') return stateJson;
  try {
    const state: unknown = JSON.parse(stateJson || '{}');
    return typeof state === 'object' && state !== null && !Array.isArray(state)
      ? JSON.stringify({ ...state, lit })
      : stateJson;
  } catch {
    return stateJson;
  }
}

type Inputs = Pick<GameplayPainterInputs,
  'debugEntitiesHidden' | 'snapshot' | 'remoteDisplay' | 'previousRemoteDisplay' | 'alpha' |
  'wildlifeProfile' | 'renderTickClock' | 'renderedLocal' | 'projectionAt' | 'renderedPlayerAnchors' |
  'equippedLightRow' | 'selectedItem' | 'liveItemContentDefinition' | 'lightPreviewKind' | 'dynamicLighting' |
  'lightVisible' | 'visualTickClock' | 'pointLights' | 'projectedLight' | 'visible' |
  'targetableEntities' | 'predicted' | 'liveEquippedItemFacing' | 'cursorFacing' | 'previousPredicted' |
  'nameplates' | 'profileName' | 'enqueueWorldDepth' | 'avatarAnimations' | 'bowChargeStartedAtMs' |
  'localActionPresentation' | 'authoredActionArt' | 'art' | 'unknownActionKinds' | 'currentBowChargeMs' |
  'context' | 'horseAnimationFrame' | 'cameraX' | 'cameraY' | 'scale' |
  'reducedMotionPreference' | 'frameLightingModel' | 'drawSouthFacingReceiver' | 'objectPresentations'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayPlayers(input: Inputs): void {
  const {
    debugEntitiesHidden, snapshot, remoteDisplay, previousRemoteDisplay, alpha,
    wildlifeProfile, renderTickClock, renderedLocal, projectionAt, renderedPlayerAnchors,
    equippedLightRow, selectedItem, liveItemContentDefinition, lightPreviewKind, dynamicLighting,
    lightVisible, visualTickClock, pointLights, projectedLight, visible,
    targetableEntities, predicted, liveEquippedItemFacing, cursorFacing, previousPredicted,
    nameplates, profileName, enqueueWorldDepth, avatarAnimations, bowChargeStartedAtMs,
    localActionPresentation, authoredActionArt, art, unknownActionKinds, currentBowChargeMs,
    context, horseAnimationFrame, cameraX, cameraY, scale,
    reducedMotionPreference, frameLightingModel, drawSouthFacingReceiver, objectPresentations,
  } = input;
  if (!debugEntitiesHidden) for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const seated=seatedFurnitureForPlayer(player,snapshot.placeables,snapshot.content.registry);
    const offline = worldPlayerIsOffline(local, snapshot.profiles.get(id)?.online);
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const previousDisplay = local || display === null ? null : previousRemoteDisplay.get(id) ?? display;
    const renderedRemote = display === null || previousDisplay === null
      ? null
      : interpolateFixedPosition(previousDisplay, display, alpha);
    const mount = offline ? null : snapshot.npcs.find((npc) => npc.rider?.toHexString() === id) ?? null;
    const mountVariant = mount === null ? 0 : wildlifeProfile(snapshot, mount.id)?.variant ?? 0;
    const jumpState = snapshot.playerJumps.get(id);
    const jumpPresentation = jumpState === undefined ? null : horseJumpPose(
      jumpState?.fromX,
      jumpState?.fromY,
      player.x,
      player.y,
      jumpState?.untilTick,
      renderTickClock.renderTick,
    );
    const xFixed = seated ? seated.anchor.x*FIXED_UNITS_PER_PIXEL : player.actionKind==='sitting' ? player.x : jumpPresentation?.x
      ?? (local ? renderedLocal?.x ?? player.x : renderedRemote?.x ?? player.x);
    const yFixed = seated ? (seated.anchor.y+seated.placement.shape.seatPoseOffsetPixels!)*FIXED_UNITS_PER_PIXEL : player.actionKind==='sitting' ? player.y : jumpPresentation?.y
      ?? (local ? renderedLocal?.y ?? player.y : renderedRemote?.y ?? player.y);
    const footYFixed = seated ? seated.anchor.y*FIXED_UNITS_PER_PIXEL : jumpPresentation?.footY ?? yFixed;
    const x = xFixed / FIXED_UNITS_PER_PIXEL;
    const y = yFixed / FIXED_UNITS_PER_PIXEL;
    const footY = footYFixed / FIXED_UNITS_PER_PIXEL;
    const terrainContactY = seated?.anchor.y ?? terrainContactWorldYForPlayer(footY);
    const playerProjection = projectionAt(x, terrainContactY);
    renderedPlayerAnchors.set(id, { x, y: y - playerProjection });
    const localOffHandLight = local ? equippedLightRow(snapshot) : null;
    const localSelectedKind = selectedItem(snapshot);
    const localSelectedDefinition = local
      ? liveItemContentDefinition(snapshot, localSelectedKind)
      : null;
    const equipped = local
      ? lightPreviewKind ?? localOffHandLight?.itemKind
        ?? (localSelectedDefinition?.light !== undefined
          && localSelectedDefinition.equip?.slot === 'off_hand' ? 'empty' : localSelectedKind)
      : display?.equippedKind ?? player.equippedKind;
    const equippedDefinition = liveItemContentDefinition(snapshot, equipped);
    const equippedLight = equippedDefinition?.light;
    const equippedLit = equippedLight === undefined || (local
      ? lightPreviewKind !== null || (localOffHandLight?.itemKind === equipped
        && localOffHandLight.lit !== false)
      : display?.equippedLit ?? player.equippedLit);
    if (dynamicLighting && !offline && player.actionKind!=='sitting' && equippedLight !== undefined && equippedLit
      && worldPointVisible(x, y, lightVisible)) {
      const [lightX, lightY] = playerLightPosition(x, y);
      const flicker = equippedLight.profile === 'flicker'
        ? deterministicFlameFlicker(
            BigInt(`0x${id.slice(0, 16)}`),
            visualTickClock.renderTick,
          )
        : { radiusOffset: 0, strengthPerMille: 1000 };
      pointLights.push(projectedLight({
        worldX: lightX,
        worldY: lightY,
        receiverDirectionWorldY: y,
        radiusTiles: equippedLight.radiusTiles + flicker.radiusOffset,
        color: {
          r: equippedLight.color[0],
          g: equippedLight.color[1],
          b: equippedLight.color[2],
        },
        strengthPerMille: flicker.strengthPerMille,
        profile: equippedLight.profile === 'flicker' ? 'flame' : 'steady',
      }, terrainContactY));
    }
    if (!worldPointVisible(x, y, visible)) continue;
    if (!local && !offline) targetableEntities.push({
      target: { kind: 'player', id }, x, y: y - playerProjection,
      halfWidth: mount === null ? 8 : 16, height: mount === null ? 24 : 32,
    });
    const authoritativeFacing = (local ? predicted?.facing ?? player.facing : display?.facing ?? player.facing) as Direction;
    const localEquipped = local ? selectedItem(snapshot) : player.equippedKind;
    const defending = player.actionKind === 'dodge' || player.actionKind === 'block';
    const facing = local && !defending
      ? liveEquippedItemFacing(snapshot, localEquipped, authoritativeFacing, cursorFacing())
      : authoritativeFacing;
    const mountFacing = mount === null ? facing : mount.facing as Direction;
    const displayedDx = local
      ? (renderedLocal?.x ?? player.x) - (previousPredicted?.position.x ?? renderedLocal?.x ?? player.x)
      : (display?.x ?? player.x) - (previousDisplay?.x ?? display?.x ?? player.x);
    const displayedDy = local
      ? (renderedLocal?.y ?? player.y) - (previousPredicted?.position.y ?? renderedLocal?.y ?? player.y)
      : (display?.y ?? player.y) - (previousDisplay?.y ?? display?.y ?? player.y);
    const moving = !offline && presentationMoving(
      local,
      predicted?.moving,
      displayedDx,
      displayedDy,
      jumpPresentation !== null,
    );
    const appearance = snapshot.appearances.get(id);
    nameplates.push({
      x,
      y: y - playerProjection,
      name: profileName(snapshot.profiles, id),
      ...(offline ? { offline: true } : {}),
    });
    if(seated&&art.itemIcons[seated.placement.shape.id]&&actionVisualForDirection(art,'sitting','down')){
      const contact=seated.anchor;
      enqueueWorldDepth(contact.x,contact.y,{footY:contact.y,tie:`placeable:${seated.row.id}`,draw:()=>{
        drawHearthSeatedGroup(context,art,seated.placement,appearance??DEFAULT_PLAYER_APPEARANCE,cameraX,cameraY,scale,
          hearthSeatedFrame(renderTickClock.renderTick,player.actionStartedTick,reducedMotionPreference.matches));
      }},contact.y,'south');
      continue;
    }
    const handsPlaceable = snapshot.placeables.find(
      (placeable) => placeable.carriedBy?.toHexString() === id,
    );
    const handsDefinition = handsPlaceable === undefined
      ? null
      : runtimeObjectDefinition(snapshot.content.registry, handsPlaceable);
    const handsLit = handsPlaceable === undefined
      ? false
      : handsDefinition?.components.identity?.tags.includes('station.furnace') === true
        ? handsPlaceable.smeltStartTick !== undefined
        : handsPlaceable.lit;
    const handsPresentation = handsPlaceable === undefined || handsDefinition === null
      ? null
      : objectPresentations.resolve(snapshot.content, {
        ...handsPlaceable,
        lit: handsLit,
        stateJson: carriedObjectStateJson(handsDefinition, handsPlaceable.stateJson, handsLit),
      });
    enqueueWorldDepth(x, footY, {
      footY,
      tie: `player:${id}`,
      draw: () => {
        const controller = avatarAnimations.get(id) ?? new AvatarAnimationController();
        avatarAnimations.set(id, controller);
        const renderTick = renderTickClock.renderTick;
        const localBowCharging = local && bowChargeStartedAtMs !== null;
        const localAction = local ? localActionPresentation.sample({
          kind: player.actionKind, startedTick: player.actionStartedTick,
        }, performance.now()) : null;
        const presentedAction = offline
          ? 'none'
          : localBowCharging
            ? 'ranged_weapon'
            : localAction?.kind ?? display?.actionKind ?? player.actionKind;
        const defenseKind = !offline && defending ? player.actionKind : null;
        const actionKind = defenseKind !== null ? 'none' : presentedAction;
        const actionStartedTick = localAction?.startedTick ?? display?.actionStartedTick ?? player.actionStartedTick;
        const heldLightEquipped = equippedLight !== undefined
          && equippedDefinition?.equip?.slot === 'off_hand';
        const walkAnimation = heldLightEquipped
          ? heldLightAnimationForDirection(facing, true)
          : avatarAnimationForDirection(facing);
        const actionDefinition = local ? localSelectedDefinition : equippedDefinition;
        const actionAsset = actionDefinition?.equip?.avatarAction === actionKind
          ? authoredActionArt.resolve(actionDefinition.equip.avatarActionAsset)
          // Remote wire state carries the off-hand light instead of the main
          // hand. Keep the body pose without inventing an unknown tool tier.
          : !local && equippedLight !== undefined ? null : undefined;
        const actionVisual = actionVisualForDirection(art, actionKind, facing, actionAsset);
        const actionFrames = actionVisual === null
          ? 4
          : actionVisual.asset.metadata.animations[actionVisual.toolAnimation]?.length ?? 4;
        const actionFps = actionVisual === null
          ? 10
          : actionVisual.asset.metadata.animationMeta?.[actionVisual.toolAnimation]?.fps ?? 10;
        const locomotionAsset = heldLightEquipped ? art.playerRig.base.action : art.playerRig.base.standing;
        const animation = controller.update(
          xFixed, yFixed, actionKind, actionStartedTick, renderTick,
          locomotionAsset.metadata.animations[walkAnimation]?.length ?? 6,
          locomotionAsset.metadata.animationMeta?.[walkAnimation]?.fps ?? 8,
          actionFrames,
          actionFps,
          actionVisual !== null,
          localAction?.elapsedMs,
          localAction?.predictionToken,
        );
        if (!localBowCharging && animation.channel === 'locomotion' && localAction?.predictionToken !== undefined) {
          localActionPresentation.complete(localAction.predictionToken);
        }
        if (animation.fallback) unknownActionKinds.add(actionKind);
        const chargedBowFrame = localBowCharging && actionVisual !== null
          ? bowHeldAnimationFrame(
            currentBowChargeMs(),
            actionFrames,
          )
          : null;
        const actionFrame = chargedBowFrame
          ?? (animation.channel === 'action' && !animation.fallback ? animation.frame : null);
        const drawPlayer = (): void => {
          if (mount !== null) {
            if (runtimeNpcMount(snapshot.content.registry, mount)?.adapter === 'boat') {
              if (actionKind === 'ranged_weapon' && actionFrame !== null && actionVisual !== null) {
                drawOverworldBoatMountedAction(
                  context, art, x, y, mountFacing, facing, moving, horseAnimationFrame,
                  cameraX, cameraY, scale, actionFrame, actionVisual, appearance,
                );
              } else {
                drawOverworldBoat(
                  context, art, x, y, mountFacing, moving, horseAnimationFrame,
                  cameraX, cameraY, scale, true, appearance, facing,
                );
              }
              return;
            }
            if (actionKind === 'ranged_weapon' && actionFrame !== null && actionVisual !== null) {
              drawOverworldMountedAction(
                context, art, x, y, mountFacing, facing, moving, horseAnimationFrame,
                cameraX, cameraY, scale, actionFrame, actionVisual, appearance, mountVariant,
              );
            } else {
              drawOverworldHorse(
                context, art, x, y, mountFacing, moving, horseAnimationFrame,
                cameraX, cameraY, scale, true, appearance, mountVariant,
              );
            }
            return;
          }
          const fishingCast = local
            ? snapshot.fishingCast ?? snapshot.fishingCasts.get(id) ?? null
            : snapshot.fishingCasts.get(id) ?? null;
          if (fishingCast !== null && actionKind === 'fish_cast') {
            const tip = fishingRodTipOffset(facing, actionFrame ?? Number.MAX_SAFE_INTEGER);
            const targetX = fishingCast.targetTileX * 16 + 8;
            const targetY = fishingCast.targetTileY * 16 + 8;
            const targetProjection = projectionAt(targetX, targetY);
            drawFishingLine(context, {
              start: {
                x: (x + tip.x - cameraX) * scale,
                y: (y + tip.y - cameraY) * scale,
              },
              target: {
                x: (targetX - cameraX) * scale,
                // enqueueWorldDepth has already translated this draw call by
                // the player's projection. Compensate so the float lands on
                // the target water plane even across elevation boundaries.
                y: (targetY + playerProjection - targetProjection - cameraY) * scale,
              },
              elapsedMs: Math.max(0, (renderTick - Number(fishingCast.startedTick)) * AUTHORITY_TICK_MS),
              timeMs: performance.now(),
              pixelScale: scale,
              reducedMotion: reducedMotionPreference.matches,
            });
          }
          if (defenseKind === 'dodge' || defenseKind === 'block') drawPlayerDefenseCue(
            context, defenseKind, facing, x, y-playerProjection, cameraX, cameraY, scale);
          drawOverworldAvatar(
            context, art, x, y, facing, moving, animation.locomotionFrame,
            cameraX, cameraY, scale, actionFrame, actionVisual, appearance, equipped, horseAnimationFrame,
            equippedLit,
            offline ? 'stone' : 'normal',
          );
          if (snapshot.chests.find((chest) => chest.carriedBy?.toHexString() === id)) {
            drawOverworldChest(context, art, x, y - 17, cameraX, cameraY, scale);
          }
          if (snapshot.combatTargets.find((target) => target.carriedBy?.toHexString() === id)) {
            drawOverworldArcheryTarget(context, art, x, y - 25, cameraX, cameraY, scale);
          }
          const handsSprite = handsPresentation?.authored === true
            ? handsPresentation.sprite
            : null;
          if (handsSprite?.asset !== null && handsSprite?.asset !== undefined) {
            drawAuthoredOverworldObject(
              context, handsSprite.asset, handsSprite.animation,
              Math.floor(performance.now() / 125), x, y - 17,
              cameraX, cameraY, scale, handsSprite.scale,
            );
          }
        };
        if (frameLightingModel === 'unified') drawSouthFacingReceiver(x, terrainContactY, drawPlayer);
        else drawPlayer();
      },
    }, terrainContactY, 'south', mount === null ? humanoidShadowContactY(footY) : footY,
      mount !== null && runtimeNpcMount(snapshot.content.registry, mount)?.adapter === 'horse'
        ? horseShadowBody(art, mountVariant, mountFacing, true) : undefined);
  }
}

export const enqueueGameplayPlayers = profilePainterProducer('players', buildEnqueueGameplayPlayers);
