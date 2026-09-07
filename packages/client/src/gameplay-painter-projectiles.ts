import { RetainedFrameCommands } from './retained-frame-commands.js';
import { AUTHORITY_TICK_MS, BOW_MAX_PROJECTILE_FLIGHT_TICKS, FIXED_UNITS_PER_PIXEL, bowProjectileArcPresentation, firstProjectileTerrainHit } from '@orchard/sim';
import { drawOverworldArrow } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { sampleLocalProjectilePrediction } from './overworld-prediction.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

const frameCommandPools = new WeakMap<CanvasRenderingContext2D, RetainedFrameCommands>();

type Inputs = Pick<GameplayPainterInputs,
  'terrain' |
  'visible' | 'enqueueWorldDepth' | 'context' | 'art' | 'cameraX' |
  'cameraY' | 'scale' | 'debugEntitiesHidden' | 'snapshot' | 'projectileDisplay' |
  'projectileFlightTicks' | 'projectileHitProgress' | 'renderTickClock' | 'pendingBowProjectile' | 'projectileCollision'
>;

function enqueueProjectileVisual(
  input: Inputs, commands: RetainedFrameCommands, key: bigint | number,
  physicalXFixed: number,
  physicalYFixed: number,
  velocityX: number,
  velocityY: number,
  mounted: boolean,
  progress: number,
  flightTicks: number,
  hit: boolean,
  foregroundDepthY?: number,
): void {
  const { visible, enqueueWorldDepth, context, art, cameraX, cameraY, scale } = input;
  const arc = bowProjectileArcPresentation(
    { x: physicalXFixed, y: physicalYFixed },
    { x: velocityX, y: velocityY },
    mounted,
    progress,
    flightTicks,
  );
  const physicalX = physicalXFixed / FIXED_UNITS_PER_PIXEL;
  const physicalY = physicalYFixed / FIXED_UNITS_PER_PIXEL;
  const renderX = arc.point.x / FIXED_UNITS_PER_PIXEL;
  const renderY = arc.point.y / FIXED_UNITS_PER_PIXEL;
  if (!worldPointVisible(physicalX, physicalY, visible)) return;
  type Captures0 = {
    context: typeof context; art: typeof art; renderX: typeof renderX; renderY: typeof renderY; arc: typeof arc;
    cameraX: typeof cameraX; cameraY: typeof cameraY; scale: typeof scale; hit: typeof hit;
  };
  let retained0 = commands.find<Captures0>(0, key);
  if (retained0 === undefined) {
    const captured0: Captures0 = { context, art, renderX, renderY, arc, cameraX, cameraY, scale, hit };
    retained0 = commands.insert(0, key, captured0, {
      footY: foregroundDepthY ?? physicalY,
      tie: typeof key === 'bigint' ? `projectile:${key}` : `projectile:predicted:${key}`,
      draw: () => {
        const { context, art, renderX, renderY, arc, cameraX, cameraY, scale, hit } = captured0;
        drawOverworldArrow(
          context,
          art,
          renderX,
          renderY,
          arc.velocity.x,
          arc.velocity.y,
          cameraX,
          cameraY,
          scale,
          hit,
        );
      },
    });
  }
  retained0.state.context = context; retained0.state.art = art; retained0.state.renderX = renderX; retained0.state.renderY = renderY;
  retained0.state.arc = arc; retained0.state.cameraX = cameraX; retained0.state.cameraY = cameraY; retained0.state.scale = scale;
  retained0.state.hit = hit;
  retained0.item.footY = foregroundDepthY ?? physicalY;
  enqueueWorldDepth(physicalX, physicalY, retained0.item);
}

/** Retain draw commands by entity identity; refresh captured state before enqueue. */
export function enqueueGameplayProjectiles(input: Inputs): void {
  const commands = frameCommandPools.get(input.context) ?? new RetainedFrameCommands();
  frameCommandPools.set(input.context, commands);
  commands.begin(input.terrain);
  const {
    debugEntitiesHidden, snapshot, projectileDisplay,
    projectileFlightTicks, projectileHitProgress, renderTickClock, pendingBowProjectile, projectileCollision,
  } = input;

  if (!debugEntitiesHidden) for (const projectile of snapshot.projectiles) {
    const display = projectileDisplay.get(projectile.id);
    const ownerHex = projectile.owner.toHexString();
    const state = display?.state ?? projectile.state;
    const velocity = {
      x: display?.velocityX ?? projectile.velocityX,
      y: display?.velocityY ?? projectile.velocityY,
    };
    const flightTicks = projectileFlightTicks.get(projectile.id)
      ?? BOW_MAX_PROJECTILE_FLIGHT_TICKS;
    const progress = state === 'hit'
      ? projectileHitProgress.get(projectile.id) ?? 1
      : Math.max(0, Math.min(
        1,
        (renderTickClock.renderTick - Number(projectile.spawnedTick)) / flightTicks,
      ));
    const embeddedTarget = state === 'hit' && projectile.hitKind === 'combat_target'
      ? snapshot.combatTargets.get(BigInt(projectile.hitId))
      : undefined;
    // A target hit changes painter depth only. Preserve the projectile's exact
    // reconciled collision point; never snap embedded art to the target anchor.
    const embeddedTargetDepthY = embeddedTarget === undefined
      ? undefined
      : embeddedTarget.y / FIXED_UNITS_PER_PIXEL + 1;
    enqueueProjectileVisual(
      input, commands, projectile.id,
      display?.x ?? projectile.x,
      display?.y ?? projectile.y,
      velocity.x,
      velocity.y,
      snapshot.npcs.find((npc) => npc.rider?.toHexString() === ownerHex) !== undefined,
      progress,
      flightTicks,
      state === 'hit',
      embeddedTargetDepthY,
    );
  }
  if (!debugEntitiesHidden && pendingBowProjectile !== null) {
    const projectileNowMs = performance.now();
    const sample = sampleLocalProjectilePrediction(pendingBowProjectile, projectileNowMs);
    if (sample !== null) {
      const progress = Math.max(0, Math.min(
        1,
        (projectileNowMs - pendingBowProjectile.startedAtMs)
        / AUTHORITY_TICK_MS / pendingBowProjectile.lifetimeTicks,
      ));
      const terrainHit = firstProjectileTerrainHit(
        pendingBowProjectile.origin,
        sample,
        projectileCollision,
      );
      const point = terrainHit ?? sample;
      const displayedProgress = terrainHit === null ? progress : progress * terrainHit.fraction;
      enqueueProjectileVisual(
        input, commands, pendingBowProjectile.token,
        point.x,
        point.y,
        pendingBowProjectile.velocity.x,
        pendingBowProjectile.velocity.y,
        pendingBowProjectile.mounted,
        displayedProgress,
        pendingBowProjectile.lifetimeTicks,
        terrainHit !== null,
      );
    }
  }
  commands.finish();
}
