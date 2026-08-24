import {
  INPUT_REFRESH_STEPS,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  createPlaceholderCollisionMap,
  movePlayer,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { LocalPredictionBuffer } from './netcode.js';

const collision = createPlaceholderCollisionMap(80, 80);
const start = (): PlayerState => ({ position: { x: 10_000, y: 10_000 }, facing: 'down', moving: false, location: 'estate' });

interface LatencyProfile { readonly name: string; readonly lagMs: number; readonly jitterMs: number }
const PROFILES: readonly LatencyProfile[] = [
  { name: '0 ms', lagMs: 0, jitterMs: 0 },
  { name: '150 ms', lagMs: 150, jitterMs: 0 },
  { name: '150 +/- 50 ms', lagMs: 150, jitterMs: 50 },
];

type MovementPattern = 'straight' | 'repeatTap' | 'rapidTurns';

function directionAt(tick: number, pattern: MovementPattern): Direction | null {
  if (pattern === 'straight') return tick < 300 ? 'right' : null;
  if (tick >= 360) return null;
  if (pattern === 'repeatTap') return tick % 4 < 2 ? 'right' : null;
  return (['upLeft', 'upRight', 'downRight', 'downLeft'] as const)[Math.floor(tick / 2) % 4] ?? null;
}

interface QueuedRun { direction: Direction; steps: number }

function run(profile: LatencyProfile, pattern: MovementPattern): { error: number; maximumCorrection: number } {
  const history = new LocalPredictionBuffer();
  let predicted = start();
  let authority = start();
  let sequence = 0n;
  let previousDirection: Direction | null = null;
  let refreshAge = 0;
  let maximumCorrection = 0;
  let serverDirection: Direction | null = null;
  let serverClientTick = 0n;
  let settledSequence = 0n;
  let pendingSequence = 0n;
  const queue: QueuedRun[] = [];
  const outgoing: Array<{ deliverTick: number; direction: Direction | null; sequence: bigint; clientTick: bigint }> = [];
  const delayedRows: Array<{ deliverTick: number; state: PlayerState; sequence: bigint }> = [];
  let lastOutgoingTick = -1;
  let lastDeliveryTick = -1;
  let outgoingIndex = 0;
  const deterministicJitter = (index: number): number => profile.jitterMs === 0 ? 0 : index % 2 === 0 ? -profile.jitterMs : profile.jitterMs;

  for (let tick = 0; tick < 900; tick += 1) {
    const direction = directionAt(tick, pattern);
    const transitioned = direction !== previousDirection;
    refreshAge = transitioned ? 0 : refreshAge + 1;
    if (transitioned || (direction !== null && refreshAge >= INPUT_REFRESH_STEPS)) {
      sequence += 1n;
      const command = history.recordSend(sequence, direction ?? 'idle');
      const oneWayTicks = Math.max(0, Math.round(
        (profile.lagMs + deterministicJitter(outgoingIndex)) / (1_000 / SIM_TICKS_PER_SECOND),
      ));
      outgoingIndex += 1;
      lastOutgoingTick = Math.max(tick + oneWayTicks, lastOutgoingTick + 1);
      outgoing.push({ deliverTick: lastOutgoingTick, direction, sequence, clientTick: command.clientTick });
      previousDirection = direction;
      refreshAge = 0;
    }

    predicted = movePlayer(predicted, direction, collision);
    history.recordStep(direction ?? 'idle', predicted);

    for (const command of outgoing.filter((candidate) => candidate.deliverTick === tick)) {
      const covered = Number(command.clientTick - serverClientTick);
      if (serverDirection !== null && covered > 0) {
        const previousRun = queue.at(-1);
        if (previousRun?.direction === serverDirection) previousRun.steps += covered;
        else queue.push({ direction: serverDirection, steps: covered });
      }
      serverDirection = command.direction;
      serverClientTick = command.clientTick;
      pendingSequence = command.sequence;
      if (queue.length === 0) {
        settledSequence = pendingSequence;
        pendingSequence = 0n;
      }
    }

    if (tick % SIM_STEPS_PER_AUTHORITY_TICK === SIM_STEPS_PER_AUTHORITY_TICK - 1) {
      let remaining = 12;
      while (remaining > 0 && queue.length > 0) {
        const queued = queue[0];
        if (queued === undefined) break;
        authority = movePlayer(authority, queued.direction, collision);
        queued.steps -= 1;
        remaining -= 1;
        if (queued.steps === 0) queue.shift();
      }
      if (queue.length === 0 && pendingSequence !== 0n) {
        settledSequence = pendingSequence;
        pendingSequence = 0n;
      }
      const oneWayTicks = Math.max(0, Math.round(
        (profile.lagMs - deterministicJitter(Number(settledSequence))) / (1_000 / SIM_TICKS_PER_SECOND),
      ));
      lastDeliveryTick = Math.max(tick + oneWayTicks, lastDeliveryTick + 1);
      delayedRows.push({ deliverTick: lastDeliveryTick, state: authority, sequence: settledSequence });
    }

    for (const row of delayedRows.filter((candidate) => candidate.deliverTick === tick)) {
      const result = history.reconcile(predicted, row.state, row.sequence, collision);
      maximumCorrection = Math.max(maximumCorrection, result.errorFixed);
      predicted = result.player;
    }
  }

  return {
    error: Math.hypot(predicted.position.x - authority.position.x, predicted.position.y - authority.position.y),
    maximumCorrection,
  };
}

describe.each(PROFILES)('prediction acceptance at $name', (profile) => {
  it.each<MovementPattern>(['straight', 'repeatTap', 'rapidTurns'])('%s stays byte-identical without corrections', (pattern) => {
    expect(run(profile, pattern)).toEqual({ error: 0, maximumCorrection: 0 });
  });
});
