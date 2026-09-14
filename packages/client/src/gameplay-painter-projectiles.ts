import { profilePainterProducer } from './painter-producer-profile.js';
import { AUTHORITY_TICK_MS, BOW_MAX_PROJECTILE_FLIGHT_TICKS, FIXED_UNITS_PER_PIXEL, bowProjectileArcPresentation, firstProjectileTerrainHit } from '@orchard/sim';
import { drawOverworldArrow } from '@orchard/engine/overworld-art';
import { worldPointVisible } from '@orchard/engine/camera';
import { sampleLocalProjectilePrediction } from './overworld-prediction.js';
import type { GameplayPainterInputs } from './gameplay-painter-inputs.js';

type Inputs = Pick<GameplayPainterInputs,
  'visible' | 'enqueueWorldDepth' | 'context' | 'art' | 'cameraX' |
  'cameraY' | 'scale' | 'debugEntitiesHidden' | 'snapshot' | 'projectileDisplay' |
  'projectileFlightTicks' | 'projectileHitProgress' | 'renderTickClock' | 'pendingBowProjectile' | 'projectileCollision'
>;

/** Mechanically extracted painter producer; command order and draw bodies are unchanged. */
function buildEnqueueGameplayProjectiles(input: Inputs): void {
  const {
    visible, enqueueWorldDepth, context, art, cameraX,
    cameraY, scale, debugEntitiesHidden, snapshot, projectileDisplay,
    projectileFlightTicks, projectileHitProgress, renderTickClock, pendingBowProjectile, projectileCollision,
  } = input;
  const enqueueProjectileVisual = (
    tie: string,
    physicalXFixed: number,
    physicalYFixed: number,
    velocityX: number,
    velocityY: number,
    mounted: boolean,
    progress: number,
    flightTicks: number,
    hit: boolean,
    foregroundDepthY?: number,
  ): void => {
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
    enqueueWorldDepth(physicalX, physicalY, {
      footY: foregroundDepthY ?? physicalY,
      tie,
      draw: () => drawOverworldArrow(
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
      ),
    });
  };
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
      `projectile:${projectile.id}`,
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
        `projectile:predicted:${pendingBowProjectile.token}`,
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
}

export const enqueueGameplayProjectiles = profilePainterProducer('projectiles', buildEnqueueGameplayProjectiles);
