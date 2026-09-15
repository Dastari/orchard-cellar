import { interpolateFixedPosition } from './overworld-prediction.js';
import {authoredNpcArt} from '@orchard/engine/authored-npc-art';
import { profilePainterProducer } from './painter-producer-profile.js';
import { drawWildlifeHitFlash } from './gameplay-painter-effects.js';
import { authoredWildlifeShadowBody, humanoidShadowContactY, horseShadowBody, rogueEnemyShadowBody } from '@orchard/engine/overworld-art';
import { AUTHORITY_HZ, FIXED_UNITS_PER_PIXEL, SURVIVAL_WORLD_SEED, runtimeCreaturePresentation, runtimeNpcDefinition, survivalBiomeAt, type Direction } from '@orchard/sim';
import { drawAuthoredOverworldWildlife, drawOverworldHorse, drawOverworldBoat, drawOverworldMerchant, drawOverworldRogueEnemy, authoredWildlifeWorldBounds, horseWorldBounds, merchantWorldBounds, rogueEnemyWorldBounds } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'debugEntitiesHidden' | 'snapshot' | 'npcDisplay' | 'previousNpcDisplay' | 'alpha' | 'renderStarted' | 'npcHitFeedback' |
  'NPC_HIT_HOP_MS' | 'reducedMotionPreference' | 'visible' | 'questMarkerForNpc' | 'questMarkerAnchors' |
  'projectedWorldY' | 'targetableEntities' | 'projectTargetable' | 'enqueueWorldDepth' | 'context' |
  'art' | 'horseAnimationFrame' | 'cameraX' | 'cameraY' | 'scale' |
  'targetableFromVisualBounds' | 'nameplates' | 'frameLightingModel' | 'drawSouthFacingReceiver' | 'wildlifeProfile' |
  'NPC_HIT_FLASH_MS'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayNpcs(input: Inputs): void {
  const {
    debugEntitiesHidden, snapshot, npcDisplay, previousNpcDisplay, alpha, renderStarted, npcHitFeedback,
    NPC_HIT_HOP_MS, reducedMotionPreference, visible, questMarkerForNpc, questMarkerAnchors,
    projectedWorldY, targetableEntities, projectTargetable, enqueueWorldDepth, context,
    art, horseAnimationFrame, cameraX, cameraY, scale,
    targetableFromVisualBounds, nameplates, frameLightingModel, drawSouthFacingReceiver, wildlifeProfile,
    NPC_HIT_FLASH_MS,
  } = input;
  if (!debugEntitiesHidden) for (const npc of snapshot.npcs) {
    const rogueEnemyProfile = snapshot.rogueEnemyProfiles.get(npc.id) ?? snapshot.outdoorEnemyProfiles?.get(npc.id);
    if (npc.rider !== undefined || (npc.health === 0 && rogueEnemyProfile === undefined)) continue;
    const display = npcDisplay.get(npc.id);
    const rendered = display === undefined ? npc
      : interpolateFixedPosition(previousNpcDisplay.get(npc.id) ?? display, display, alpha);
    const sleeping = npc.wanderDirection === 'sleep';
    const x = (sleeping ? npc.x : rendered.x) / FIXED_UNITS_PER_PIXEL;
    const baseY = (sleeping ? npc.y : rendered.y) / FIXED_UNITS_PER_PIXEL;
    const hitAge = renderStarted - (npcHitFeedback.get(npc.id) ?? Number.NEGATIVE_INFINITY);
    const hitProgress = Math.max(0, Math.min(1, hitAge / NPC_HIT_HOP_MS));
    const hitActive = hitAge >= 0 && hitAge < NPC_HIT_HOP_MS;
    const hitHop = hitActive && !reducedMotionPreference.matches
      ? Math.sin(hitProgress * Math.PI) * 3
      : 0;
    const y = baseY - hitHop;
    if (!worldPointVisible(x, y, visible)) continue;
    const facing = (display?.facing ?? npc.facing) as Direction;
    const questMarker = questMarkerForNpc(snapshot, npc.id);
    if (questMarker !== null) {
      questMarkerAnchors.push({ x, y: projectedWorldY(x, y), kind: questMarker });
    }
    const definition = runtimeNpcDefinition(snapshot.content.registry, npc);
    if (definition?.mount?.adapter === 'boat') {
      targetableEntities.push(projectTargetable({
        target: { kind: 'npc', id: npc.id }, x, y, halfWidth: 22, height: 22,
      }, x, y));
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `boat:${npc.id}`,
        draw: () => drawOverworldBoat(
          context, art, x, y, facing, npc.moving,
          horseAnimationFrame + Number(npc.id % 19n), cameraX, cameraY, scale,
        ),
      });
      continue;
    }
    const authoredKind = definition?.runtimeKind ?? definition?.id.slice('npc:'.length);
    if (definition !== null && definition.mount === undefined && authoredKind !== undefined
      && (snapshot.merchants.get(npc.id) !== undefined || authoredNpcArt(art, authoredKind) !== undefined)) {
      const moving = sleeping ? false : npc.moving;
      const fishingCycle = definition.ai.kind === 'fishing_cycle';
      const fishermanActionFrame = fishingCycle
        && (npc.wanderDirection === 'fish_cast' || npc.wanderDirection === 'fish_reel')
        ? Math.min(7, Math.floor(Math.max(0, Number(
          (snapshot.clock?.authorityTick ?? npc.authorityTick) - npc.authorityTick,
        )) * 8 / AUTHORITY_HZ))
        : horseAnimationFrame + Number(npc.id % 19n);
      if (npc.health > 0) targetableEntities.push(projectTargetable(targetableFromVisualBounds(
        { kind: 'npc', id: npc.id },
        merchantWorldBounds(
          art, x, y, facing, moving, fishermanActionFrame,
          authoredKind, npc.wanderDirection, fishingCycle,
        ),
        x, y, { halfWidth: 9, height: 24 },
      ), x, y));
      if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `merchant:${npc.id}`,
        draw: () => frameLightingModel === 'unified'
          ? drawSouthFacingReceiver(x, baseY, () => drawOverworldMerchant(
            context, art, x, y, facing, moving,
            fishermanActionFrame, cameraX, cameraY, scale,
            authoredKind, npc.wanderDirection, fishingCycle,
          ))
          : drawOverworldMerchant(
            context, art, x, y, facing, moving,
            fishermanActionFrame, cameraX, cameraY, scale,
            authoredKind, npc.wanderDirection, fishingCycle,
          ),
      }, baseY, 'south', humanoidShadowContactY(baseY));
      continue;
    }
    if (rogueEnemyProfile !== undefined) {
      const animationFrame = horseAnimationFrame + Number(npc.id % 19n);
      const activity = npc.health === 0 ? 'defeated' : npc.wanderDirection;
      targetableEntities.push(projectTargetable(targetableFromVisualBounds(
        { kind: 'npc', id: npc.id },
        rogueEnemyWorldBounds(
          art, npc.kind, activity, x, y, facing, npc.moving, animationFrame,
        ),
        x, y, { halfWidth: 10, height: 24 },
      ), x, y));
      if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `rogue-enemy:${npc.id}`,
        draw: () => drawOverworldRogueEnemy(
          context, art, npc.kind, activity, x, y, facing, npc.moving,
          animationFrame, cameraX, cameraY, scale, hitActive,
        ),
      }, baseY, 'south', baseY, rogueEnemyShadowBody(art, npc.kind, facing));
      continue;
    }
    const profile = wildlifeProfile(snapshot, npc.id);
    const presentation = profile === null
      ? null : runtimeCreaturePresentation(snapshot.content.registry, profile.species);
    const horseAdapter = definition?.mount?.adapter === 'horse' || presentation?.renderer === 'horse';
    if (!horseAdapter && presentation === null) continue;
    if (presentation?.hiddenActivities.includes(npc.wanderDirection) === true) continue;
    if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
    const animationFrame = horseAnimationFrame + Number(npc.id % 19n);
    const biome = survivalBiomeAt(
      snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED,
      Math.floor(x / 16),
      Math.floor(y / 16),
    );
    const inWater = biome === 'freshwater' || biome === 'oasis_water';
    const moving = sleeping ? false : npc.moving;
    const visualBounds = horseAdapter
      ? horseWorldBounds(
        art, x, y, facing, moving, animationFrame, profile?.variant ?? 0, npc.wanderDirection,
      )
      : authoredWildlifeWorldBounds(
        art, presentation!, profile?.variant ?? 0, npc.wanderDirection,
        x, y, facing, moving, animationFrame, inWater,
      );
    targetableEntities.push(projectTargetable(targetableFromVisualBounds(
      { kind: 'npc', id: npc.id }, visualBounds, x, y,
      presentation?.targetBounds ?? { halfWidth: 16, height: 26 },
    ), x, y));
    const drawWildlifeActor = (): void => {
      drawWildlifeHitFlash(context, () => hitAge < NPC_HIT_FLASH_MS && !reducedMotionPreference.matches, () => {
      if (horseAdapter) drawOverworldHorse(
        context, art, x, y, facing, moving, animationFrame,
        cameraX, cameraY, scale, false, undefined, profile?.variant ?? 0, npc.wanderDirection,
      );
      else drawAuthoredOverworldWildlife(
        context, art, presentation!, profile?.variant ?? 0, npc.wanderDirection,
        x, y, facing, moving, animationFrame, cameraX, cameraY, scale, inWater,
      );
      });
    };
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `npc:${npc.id}`,
      draw: () => frameLightingModel === 'unified'
        ? drawSouthFacingReceiver(x, baseY, drawWildlifeActor)
        : drawWildlifeActor(),
    }, baseY, 'south', baseY, horseAdapter
      ? horseShadowBody(art, profile?.variant ?? 0, facing)
      : authoredWildlifeShadowBody(art, presentation!, profile?.variant ?? 0, facing, moving, npc.wanderDirection, inWater));
  }
}

export const enqueueGameplayNpcs = profilePainterProducer('npcs', buildEnqueueGameplayNpcs);
