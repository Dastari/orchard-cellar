import { RetainedFrameCommands } from './retained-frame-commands.js';
import { drawWildlifeHitFlash } from './gameplay-painter-effects.js';
import { humanoidShadowContactY, wildlifeShadowBody, horseShadowBody, rogueEnemyShadowBody } from '@orchard/engine/overworld-art';
import { AUTHORITY_HZ, FIXED_UNITS_PER_PIXEL, SURVIVAL_WORLD_SEED, runtimeNpcMount, survivalBiomeAt, type Direction } from '@orchard/sim';
import { drawOverworldHorse, drawOverworldBoat, drawOverworldMerchant, drawOverworldRogueEnemy, drawOverworldWildlife, horseWorldBounds, merchantWorldBounds, wildlifeWorldBounds, rogueEnemyWorldBounds } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

const frameCommandPools = new WeakMap<CanvasRenderingContext2D, RetainedFrameCommands>();

type Inputs = Pick<GameplayPainterInputs,
  'terrain' |
  'debugEntitiesHidden' | 'snapshot' | 'npcDisplay' | 'renderStarted' | 'npcHitFeedback' |
  'NPC_HIT_HOP_MS' | 'reducedMotionPreference' | 'visible' | 'questMarkerForNpc' | 'questMarkerAnchors' |
  'projectedWorldY' | 'targetableEntities' | 'projectTargetable' | 'enqueueWorldDepth' | 'context' |
  'art' | 'horseAnimationFrame' | 'cameraX' | 'cameraY' | 'scale' |
  'targetableFromVisualBounds' | 'nameplates' | 'frameLightingModel' | 'drawSouthFacingReceiver' | 'wildlifeProfile' |
  'npcTargetDimensions' | 'NPC_HIT_FLASH_MS'
>;

/** Retain draw commands by entity identity; refresh captured state before enqueue. */
export function enqueueGameplayNpcs(input: Inputs): void {
  const commands = frameCommandPools.get(input.context) ?? new RetainedFrameCommands();
  frameCommandPools.set(input.context, commands);
  commands.begin(input.terrain);
  const {
    debugEntitiesHidden, snapshot, npcDisplay, renderStarted, npcHitFeedback,
    NPC_HIT_HOP_MS, reducedMotionPreference, visible, questMarkerForNpc, questMarkerAnchors,
    projectedWorldY, targetableEntities, projectTargetable, enqueueWorldDepth, context,
    art, horseAnimationFrame, cameraX, cameraY, scale,
    targetableFromVisualBounds, nameplates, frameLightingModel, drawSouthFacingReceiver, wildlifeProfile,
    npcTargetDimensions, NPC_HIT_FLASH_MS,
  } = input;
  if (!debugEntitiesHidden) for (const npc of snapshot.npcs) {
    const rogueEnemyProfile = snapshot.rogueEnemyProfiles.get(npc.id);
    if (npc.rider !== undefined || (npc.health === 0 && rogueEnemyProfile === undefined)) continue;
    const display = npcDisplay.get(npc.id);
    const sleeping = npc.wanderDirection === 'sleep';
    const x = (sleeping ? npc.x : display?.x ?? npc.x) / FIXED_UNITS_PER_PIXEL;
    const baseY = (sleeping ? npc.y : display?.y ?? npc.y) / FIXED_UNITS_PER_PIXEL;
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
    if (runtimeNpcMount(snapshot.content.registry, npc)?.adapter === 'boat') {
      targetableEntities.push(projectTargetable({
        target: { kind: 'npc', id: npc.id }, x, y, halfWidth: 22, height: 22,
      }, x, y));
      type Captures0 = {
        context: typeof context; art: typeof art; x: typeof x; y: typeof y; facing: typeof facing; npc: typeof npc;
        horseAnimationFrame: typeof horseAnimationFrame; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
      };
      let retained0 = commands.find<Captures0>(0, npc.id);
      if (retained0 === undefined) {
        const captured0: Captures0 = { context, art, x, y, facing, npc, horseAnimationFrame, cameraX, cameraY, scale };
        retained0 = commands.insert(0, npc.id, captured0, {
          footY: y,
          tie: `boat:${npc.id}`,
          draw: () => {
            const { context, art, x, y, facing, npc, horseAnimationFrame, cameraX, cameraY, scale } = captured0;
            drawOverworldBoat(
              context, art, x, y, facing, npc.moving,
              horseAnimationFrame + Number(npc.id % 19n), cameraX, cameraY, scale,
            );
          },
        });
      }
      retained0.state.context = context; retained0.state.art = art; retained0.state.x = x; retained0.state.y = y;
      retained0.state.facing = facing; retained0.state.npc = npc; retained0.state.horseAnimationFrame = horseAnimationFrame; retained0.state.cameraX = cameraX;
      retained0.state.cameraY = cameraY; retained0.state.scale = scale;
      retained0.item.footY = y;
      enqueueWorldDepth(x, y, retained0.item);
      continue;
    }
    if (snapshot.merchants.get(npc.id) !== undefined) {
      const moving = sleeping ? false : npc.moving;
      const fishermanActionFrame = npc.kind === 'fisherman_fin'
        && (npc.wanderDirection === 'fish_cast' || npc.wanderDirection === 'fish_reel')
        ? Math.min(7, Math.floor(Math.max(0, Number(
          (snapshot.clock?.authorityTick ?? npc.authorityTick) - npc.authorityTick,
        )) * 8 / AUTHORITY_HZ))
        : horseAnimationFrame + Number(npc.id % 19n);
      if (npc.health > 0) targetableEntities.push(projectTargetable(targetableFromVisualBounds(
        { kind: 'npc', id: npc.id },
        merchantWorldBounds(
          art, x, y, facing, moving, fishermanActionFrame,
          npc.kind, npc.wanderDirection,
        ),
        x, y, { halfWidth: 9, height: 24 },
      ), x, y));
      if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
      type Captures1 = {
        frameLightingModel: typeof frameLightingModel; drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x;
        baseY: typeof baseY; context: typeof context; art: typeof art; y: typeof y; facing: typeof facing; moving: typeof moving;
        fishermanActionFrame: typeof fishermanActionFrame; cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale;
        npc: typeof npc;
      };
      let retained1 = commands.find<Captures1>(1, npc.id);
      if (retained1 === undefined) {
        const captured1: Captures1 = {
          frameLightingModel, drawSouthFacingReceiver, x, baseY, context, art, y, facing, moving, fishermanActionFrame, cameraX,
          cameraY, scale, npc,
        };
        const drawMerchant = (): void => {
          const { context, art, x, y, facing, moving, fishermanActionFrame, cameraX, cameraY, scale, npc } = captured1;
          drawOverworldMerchant(
            context, art, x, y, facing, moving,
            fishermanActionFrame, cameraX, cameraY, scale,
            npc.kind, npc.wanderDirection,
          );
        };
        retained1 = commands.insert(1, npc.id, captured1, {
          footY: y,
          tie: `merchant:${npc.id}`,
          draw: () => {
            const { frameLightingModel, drawSouthFacingReceiver, x, baseY } = captured1;
            return frameLightingModel === 'unified'
              ? drawSouthFacingReceiver(x, baseY, drawMerchant)
              : drawMerchant();
          },
        });
      }
      retained1.state.frameLightingModel = frameLightingModel; retained1.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained1.state.x = x; retained1.state.baseY = baseY;
      retained1.state.context = context; retained1.state.art = art; retained1.state.y = y; retained1.state.facing = facing;
      retained1.state.moving = moving; retained1.state.fishermanActionFrame = fishermanActionFrame; retained1.state.cameraX = cameraX; retained1.state.cameraY = cameraY;
      retained1.state.scale = scale; retained1.state.npc = npc;
      retained1.item.footY = y;
      enqueueWorldDepth(x, y, retained1.item, baseY, 'south', humanoidShadowContactY(baseY));
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
      type Captures2 = {
        context: typeof context; art: typeof art; npc: typeof npc; activity: typeof activity; x: typeof x; y: typeof y;
        facing: typeof facing; animationFrame: typeof animationFrame; cameraX: typeof cameraX; cameraY: typeof cameraY;
        scale: typeof scale; hitActive: typeof hitActive;
      };
      let retained2 = commands.find<Captures2>(2, npc.id);
      if (retained2 === undefined) {
        const captured2: Captures2 = { context, art, npc, activity, x, y, facing, animationFrame, cameraX, cameraY, scale, hitActive };
        retained2 = commands.insert(2, npc.id, captured2, {
          footY: y,
          tie: `rogue-enemy:${npc.id}`,
          draw: () => {
            const { context, art, npc, activity, x, y, facing, animationFrame, cameraX, cameraY, scale, hitActive } = captured2;
            drawOverworldRogueEnemy(
              context, art, npc.kind, activity, x, y, facing, npc.moving,
              animationFrame, cameraX, cameraY, scale, hitActive,
            );
          },
        });
      }
      retained2.state.context = context; retained2.state.art = art; retained2.state.npc = npc; retained2.state.activity = activity;
      retained2.state.x = x; retained2.state.y = y; retained2.state.facing = facing; retained2.state.animationFrame = animationFrame;
      retained2.state.cameraX = cameraX; retained2.state.cameraY = cameraY; retained2.state.scale = scale; retained2.state.hitActive = hitActive;
      retained2.item.footY = y;
      enqueueWorldDepth(x, y, retained2.item, baseY, 'south', baseY, rogueEnemyShadowBody(art, npc.kind, facing));
      continue;
    }
    const profile = wildlifeProfile(snapshot, npc.id);
    const species = profile?.species ?? (runtimeNpcMount(snapshot.content.registry, npc)?.adapter === 'horse' ? 'horse' : null);
    if (species === null) continue;
    if (species === 'bee' && npc.wanderDirection === 'inside_hive') continue;
    if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
    const animationFrame = horseAnimationFrame + Number(npc.id % 19n);
    const biome = survivalBiomeAt(
      snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED,
      Math.floor(x / 16),
      Math.floor(y / 16),
    );
    const inWater = biome === 'freshwater' || biome === 'oasis_water';
    const moving = sleeping ? false : npc.moving;
    const visualBounds = species === 'horse'
      ? horseWorldBounds(
        art, x, y, facing, moving, animationFrame, profile?.variant ?? 0, npc.wanderDirection,
      )
      : wildlifeWorldBounds(
        art, species, profile?.variant ?? 0, npc.wanderDirection,
        x, y, facing, moving, animationFrame, inWater,
      );
    targetableEntities.push(projectTargetable(targetableFromVisualBounds(
      { kind: 'npc', id: npc.id }, visualBounds, x, y, npcTargetDimensions(species),
    ), x, y));
    type Captures3 = {
      frameLightingModel: typeof frameLightingModel; drawSouthFacingReceiver: typeof drawSouthFacingReceiver; x: typeof x;
      baseY: typeof baseY; context: typeof context; hitAge: typeof hitAge; NPC_HIT_FLASH_MS: typeof NPC_HIT_FLASH_MS;
      reducedMotionPreference: typeof reducedMotionPreference; species: typeof species; art: typeof art; y: typeof y;
      facing: typeof facing; moving: typeof moving; animationFrame: typeof animationFrame; cameraX: typeof cameraX;
      cameraY: typeof cameraY; scale: typeof scale; profile: typeof profile; npc: typeof npc; inWater: typeof inWater;
    };
    let retained3 = commands.find<Captures3>(3, npc.id);
    if (retained3 === undefined) {
      const captured3: Captures3 = {
        frameLightingModel, drawSouthFacingReceiver, x, baseY, context, hitAge, NPC_HIT_FLASH_MS, reducedMotionPreference, species,
        art, y, facing, moving, animationFrame, cameraX, cameraY, scale, profile, npc, inWater,
      };
      const flashing = () => captured3.hitAge < captured3.NPC_HIT_FLASH_MS && !captured3.reducedMotionPreference.matches;
      const drawActor = () => {
        const { species, context, art, x, y, facing, moving, animationFrame, cameraX, cameraY, scale, profile, npc, inWater } = captured3;
        if (species === 'horse') drawOverworldHorse(
          context, art, x, y, facing, moving, animationFrame,
          cameraX, cameraY, scale, false, undefined, profile?.variant ?? 0, npc.wanderDirection,
        );
        else drawOverworldWildlife(
          context, art, species, profile?.variant ?? 0, npc.wanderDirection,
          x, y, facing, moving, animationFrame, cameraX, cameraY, scale, inWater,
        );
      };
      const drawWildlifeActor = () => drawWildlifeHitFlash(captured3.context, flashing, drawActor);
      retained3 = commands.insert(3, npc.id, captured3, {
        footY: y,
        tie: `npc:${npc.id}`,
        draw: () => {
          const { frameLightingModel, drawSouthFacingReceiver, x, baseY } = captured3;
          return frameLightingModel === 'unified'
            ? drawSouthFacingReceiver(x, baseY, drawWildlifeActor)
            : drawWildlifeActor();
        },
      });
    }
    retained3.state.frameLightingModel = frameLightingModel; retained3.state.drawSouthFacingReceiver = drawSouthFacingReceiver; retained3.state.x = x; retained3.state.baseY = baseY;
    retained3.state.context = context; retained3.state.hitAge = hitAge; retained3.state.NPC_HIT_FLASH_MS = NPC_HIT_FLASH_MS; retained3.state.reducedMotionPreference = reducedMotionPreference;
    retained3.state.species = species; retained3.state.art = art; retained3.state.x = x; retained3.state.y = y;
    retained3.state.facing = facing; retained3.state.moving = moving; retained3.state.animationFrame = animationFrame; retained3.state.cameraX = cameraX;
    retained3.state.cameraY = cameraY; retained3.state.scale = scale; retained3.state.profile = profile; retained3.state.npc = npc;
    retained3.state.inWater = inWater;
    retained3.item.footY = y;
    enqueueWorldDepth(x, y, retained3.item, baseY, 'south', baseY, species === 'horse'
      ? horseShadowBody(art, profile?.variant ?? 0, facing)
      : wildlifeShadowBody(art, species, profile?.variant ?? 0, facing, moving, npc.wanderDirection, inWater));
  }
  commands.finish();
}
