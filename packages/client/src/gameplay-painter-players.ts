import { RetainedFrameCommands } from './retained-frame-commands.js';
import { humanoidShadowContactY, horseShadowBody } from '@orchard/engine/overworld-art';
import { AUTHORITY_TICK_MS, FIXED_UNITS_PER_PIXEL, runtimeNpcMount, bowHeldAnimationFrame, placeableHasInterface, type Direction } from '@orchard/sim';
import { AvatarAnimationController } from './net/netcode.js';
import { drawOverworldArcheryTarget, drawOverworldAvatar, drawOverworldChest, drawOverworldHorse, drawOverworldBoat, drawOverworldBoatMountedAction, drawOverworldPlaceable, drawOverworldMountedAction, actionVisualForDirection, avatarAnimationForDirection, horseJumpPose, heldLightAnimationForDirection } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { drawFishingLine, fishingRodTipOffset } from '@orchard/engine/fishing-line';
import { playerLightPosition } from '@orchard/engine/lighting';
import { deterministicFlameFlicker } from '@orchard/engine/light-sources';
import { terrainContactWorldYForPlayer } from '@orchard/engine/terrain';
import { interpolateFixedPosition, presentationMoving } from './overworld-prediction.js';
import { worldPlayerIsOffline } from './player-presence.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

const frameCommandPools = new WeakMap<CanvasRenderingContext2D, RetainedFrameCommands>();

type Inputs = Pick<GameplayPainterInputs,
  'terrain' |
  'debugEntitiesHidden' | 'snapshot' | 'remoteDisplay' | 'previousRemoteDisplay' | 'alpha' |
  'wildlifeProfile' | 'renderTickClock' | 'renderedLocal' | 'projectionAt' | 'renderedPlayerAnchors' |
  'equippedLightRow' | 'selectedItem' | 'liveItemContentDefinition' | 'lightPreviewKind' | 'dynamicLighting' |
  'lightVisible' | 'visualTickClock' | 'pointLights' | 'projectedLight' | 'visible' |
  'targetableEntities' | 'predicted' | 'liveEquippedItemFacing' | 'cursorFacing' | 'previousPredicted' |
  'nameplates' | 'profileName' | 'enqueueWorldDepth' | 'avatarAnimations' | 'bowChargeStartedAtMs' |
  'localActionPresentation' | 'authoredActionArt' | 'art' | 'unknownActionKinds' | 'currentBowChargeMs' |
  'context' | 'horseAnimationFrame' | 'cameraX' | 'cameraY' | 'scale' |
  'reducedMotionPreference' | 'frameLightingModel' | 'drawSouthFacingReceiver'
>;

/** Retain draw commands by entity identity; refresh captured state before enqueue. */
export function enqueueGameplayPlayers(input: Inputs): void {
  const commands = frameCommandPools.get(input.context) ?? new RetainedFrameCommands();
  frameCommandPools.set(input.context, commands);
  commands.begin(input.terrain);
  const {
    debugEntitiesHidden, snapshot, remoteDisplay, previousRemoteDisplay, alpha,
    wildlifeProfile, renderTickClock, renderedLocal, projectionAt, renderedPlayerAnchors,
    equippedLightRow, selectedItem, liveItemContentDefinition, lightPreviewKind, dynamicLighting,
    lightVisible, visualTickClock, pointLights, projectedLight, visible,
    targetableEntities, predicted, liveEquippedItemFacing, cursorFacing, previousPredicted,
    nameplates, profileName, enqueueWorldDepth, avatarAnimations, bowChargeStartedAtMs,
    localActionPresentation, authoredActionArt, art, unknownActionKinds, currentBowChargeMs,
    context, horseAnimationFrame, cameraX, cameraY, scale,
    reducedMotionPreference, frameLightingModel, drawSouthFacingReceiver,
  } = input;
  if (!debugEntitiesHidden) for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
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
    const xFixed = jumpPresentation?.x
      ?? (local ? renderedLocal?.x ?? player.x : renderedRemote?.x ?? player.x);
    const yFixed = jumpPresentation?.y
      ?? (local ? renderedLocal?.y ?? player.y : renderedRemote?.y ?? player.y);
    const footYFixed = jumpPresentation?.footY ?? yFixed;
    const x = xFixed / FIXED_UNITS_PER_PIXEL;
    const y = yFixed / FIXED_UNITS_PER_PIXEL;
    const footY = footYFixed / FIXED_UNITS_PER_PIXEL;
    const terrainContactY = terrainContactWorldYForPlayer(footY);
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
    if (dynamicLighting && !offline && equippedLight !== undefined && equippedLit
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
    const facing = local
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
    type Captures0 = {
      avatarAnimations: typeof avatarAnimations; id: typeof id; renderTickClock: typeof renderTickClock; local: typeof local;
      bowChargeStartedAtMs: typeof bowChargeStartedAtMs; localActionPresentation: typeof localActionPresentation;
      player: typeof player; offline: typeof offline; display: typeof display; equippedLight: typeof equippedLight;
      equippedDefinition: typeof equippedDefinition; facing: typeof facing;
      localSelectedDefinition: typeof localSelectedDefinition; authoredActionArt: typeof authoredActionArt; art: typeof art;
      xFixed: typeof xFixed; yFixed: typeof yFixed; unknownActionKinds: typeof unknownActionKinds;
      currentBowChargeMs: typeof currentBowChargeMs; mount: typeof mount; snapshot: typeof snapshot; context: typeof context;
      x: typeof x; y: typeof y; mountFacing: typeof mountFacing; moving: typeof moving;
      horseAnimationFrame: typeof horseAnimationFrame; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
      appearance: typeof appearance; mountVariant: typeof mountVariant; projectionAt: typeof projectionAt;
      playerProjection: typeof playerProjection; reducedMotionPreference: typeof reducedMotionPreference;
      equipped: typeof equipped; equippedLit: typeof equippedLit; frameLightingModel: typeof frameLightingModel;
      drawSouthFacingReceiver: typeof drawSouthFacingReceiver; terrainContactY: typeof terrainContactY;
    };
    let retained0 = commands.find<Captures0>(0, id);
    if (retained0 === undefined) {
      const captured0: Captures0 = {
        avatarAnimations, id, renderTickClock, local, bowChargeStartedAtMs, localActionPresentation, player, offline, display,
        equippedLight, equippedDefinition, facing, localSelectedDefinition, authoredActionArt, art, xFixed, yFixed,
        unknownActionKinds, currentBowChargeMs, mount, snapshot, context, x, y, mountFacing, moving, horseAnimationFrame, cameraX,
        cameraY, scale, appearance, mountVariant, projectionAt, playerProjection, reducedMotionPreference, equipped, equippedLit,
        frameLightingModel, drawSouthFacingReceiver, terrainContactY,
      };
      retained0 = commands.insert(0, id, captured0, {
        footY,
        tie: `player:${id}`,
        draw: () => {
          const {
            avatarAnimations, id, renderTickClock, local, bowChargeStartedAtMs, localActionPresentation, player, offline, display,
            equippedLight, equippedDefinition, facing, localSelectedDefinition, authoredActionArt, art, xFixed, yFixed,
            unknownActionKinds, currentBowChargeMs, mount, snapshot, context, x, y, mountFacing, moving, horseAnimationFrame,
            cameraX, cameraY, scale, appearance, mountVariant, projectionAt, playerProjection, reducedMotionPreference, equipped,
            equippedLit, frameLightingModel, drawSouthFacingReceiver, terrainContactY,
          } = captured0;

          const controller = avatarAnimations.get(id) ?? new AvatarAnimationController();
          avatarAnimations.set(id, controller);
          const renderTick = renderTickClock.renderTick;
          const localBowCharging = local && bowChargeStartedAtMs !== null;
          const localAction = local ? localActionPresentation.sample({
            kind: player.actionKind, startedTick: player.actionStartedTick,
          }, performance.now()) : null;
          const actionKind = offline
            ? 'none'
            : localBowCharging
              ? 'ranged_weapon'
              : localAction?.kind ?? display?.actionKind ?? player.actionKind;
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
            const handsPlaceable = snapshot.placeables.find(
              (placeable) => placeable.carriedBy?.toHexString() === id,
            );
            if (handsPlaceable !== undefined) {
              drawOverworldPlaceable(
                context, art, handsPlaceable.kind, false, 0,
                Math.floor(performance.now() / 125), x, y - 17,
                cameraX, cameraY, scale, placeableHasInterface(handsPlaceable.kind, 'furnace')
                ? handsPlaceable.smeltStartTick !== undefined : handsPlaceable.lit,
              );
            }
          };
          if (frameLightingModel === 'unified') drawSouthFacingReceiver(x, terrainContactY, drawPlayer);
          else drawPlayer();

        },
      });
    }
    retained0.state.avatarAnimations = avatarAnimations; retained0.state.id = id; retained0.state.renderTickClock = renderTickClock; retained0.state.local = local;
    retained0.state.bowChargeStartedAtMs = bowChargeStartedAtMs; retained0.state.localActionPresentation = localActionPresentation; retained0.state.player = player; retained0.state.offline = offline;
    retained0.state.display = display; retained0.state.equippedLight = equippedLight; retained0.state.equippedDefinition = equippedDefinition; retained0.state.facing = facing;
    retained0.state.localSelectedDefinition = localSelectedDefinition; retained0.state.authoredActionArt = authoredActionArt; retained0.state.art = art; retained0.state.xFixed = xFixed;
    retained0.state.yFixed = yFixed; retained0.state.unknownActionKinds = unknownActionKinds; retained0.state.currentBowChargeMs = currentBowChargeMs; retained0.state.mount = mount;
    retained0.state.snapshot = snapshot; retained0.state.context = context; retained0.state.x = x; retained0.state.y = y;
    retained0.state.mountFacing = mountFacing; retained0.state.moving = moving; retained0.state.horseAnimationFrame = horseAnimationFrame; retained0.state.cameraX = cameraX;
    retained0.state.cameraY = cameraY; retained0.state.scale = scale; retained0.state.appearance = appearance; retained0.state.mountVariant = mountVariant;
    retained0.state.projectionAt = projectionAt; retained0.state.playerProjection = playerProjection; retained0.state.reducedMotionPreference = reducedMotionPreference; retained0.state.equipped = equipped;
    retained0.state.equippedLit = equippedLit; retained0.state.frameLightingModel = frameLightingModel; retained0.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained0.state.terrainContactY = terrainContactY;
    retained0.item.footY = footY;
    enqueueWorldDepth(x, footY, retained0.item, terrainContactY, 'south', mount === null ? humanoidShadowContactY(footY) : footY,
      mount !== null && runtimeNpcMount(snapshot.content.registry, mount)?.adapter === 'horse'
        ? horseShadowBody(art, mountVariant, mountFacing, true) : undefined);
  }
  commands.finish();
}
