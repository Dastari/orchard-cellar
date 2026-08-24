import { createPlaceholderCollisionMap, movePlayer, type Direction, type PlayerState } from '@orchard/sim';
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

function directionAt(tick: number, tapping: boolean): Direction | null {
  if (!tapping) return tick < 300 ? 'right' : null;
  if (tick >= 600) return null;
  const phase = Math.floor(tick / 6) % 4;
  return phase === 0 ? 'up' : phase === 1 ? 'right' : phase === 2 ? 'down' : 'left';
}

function run(profile: LatencyProfile, tapping: boolean): { error: number; maximumCorrection: number } {
  const history = new LocalPredictionBuffer();
  let predicted = start();
  let authority = start();
  let sequence = 0n;
  let previousDirection: Direction | null = null;
  let maximumCorrection = 0;
  let serverDirection: Direction | null = null;
  let serverSequence = 0n;
  let settledSequence = 0n;
  let pendingSequence = 0n;
  let runStartClientTick = 0n;
  let appliedSteps = 0;
  const pendingRuns: Array<{ direction: Direction; steps: number }> = [];
  const pendingStepCount = (): number => pendingRuns.reduce((sum, run) => sum + run.steps, 0);
  const outgoing: Array<{ deliverTick: number; direction: Direction | null; sequence: bigint; clientTick: bigint }> = [];
  const delayedRows: Array<{ deliverTick: number; state: PlayerState; sequence: bigint }> = [];
  let lastOutgoingTick = -1;
  let lastDeliveryTick = -1;
  let outgoingIndex = 0;
  const deterministicJitter = (index: number): number => profile.jitterMs === 0 ? 0 : index % 2 === 0 ? -profile.jitterMs : profile.jitterMs;
  for (let tick = 0; tick < 780; tick += 1) {
    const direction = directionAt(tick, tapping);
    if (direction !== previousDirection || (direction !== null && tick % 20 === 0)) {
      sequence += 1n;
      const movementBoundary = direction !== previousDirection;
      const command = history.recordSend(sequence, direction ?? 'idle', movementBoundary);
      const oneWayTicks = Math.max(0, Math.round((profile.lagMs + deterministicJitter(outgoingIndex)) / (1_000 / 60)));
      outgoingIndex += 1;
      lastOutgoingTick = Math.max(tick + oneWayTicks, lastOutgoingTick + 1);
      outgoing.push({ deliverTick: lastOutgoingTick, direction, sequence, clientTick: command.clientTick });
      previousDirection = direction;
    }
    predicted = movePlayer(predicted, direction, collision); history.recordStep(direction ?? 'idle', predicted);
    for (const command of outgoing.filter((candidate) => candidate.deliverTick === tick)) {
      if (command.direction !== serverDirection) {
        const claimed = Number(command.clientTick - runStartClientTick);
        const shortfall = Math.max(0, claimed - appliedSteps);
        if (shortfall > 0 && serverDirection !== null) {
          const accepted = Math.min(shortfall, 12 - pendingStepCount());
          const previousRun = pendingRuns.at(-1);
          if (previousRun?.direction === serverDirection) previousRun.steps += accepted;
          else if (accepted > 0) pendingRuns.push({ direction: serverDirection, steps: accepted });
        }
        serverDirection = command.direction;
        runStartClientTick = command.clientTick;
        appliedSteps = 0;
      }
      serverSequence = command.sequence;
      if (pendingStepCount() === 0) settledSequence = command.sequence;
      else pendingSequence = command.sequence;
    }
    if (tick % 3 === 2) {
      let settle = Math.min(6, pendingStepCount());
      while (settle > 0) {
        const run = pendingRuns[0];
        if (run === undefined) break;
        authority = movePlayer(authority, run.direction, collision);
        run.steps -= 1; settle -= 1;
        if (run.steps === 0) pendingRuns.shift();
      }
      if (pendingStepCount() === 0) {
        if (pendingSequence !== 0n) {
          settledSequence = pendingSequence;
          pendingSequence = 0n;
        }
      }
      for (let step = 0; step < 3; step += 1) authority = movePlayer(authority, serverDirection, collision);
      appliedSteps += 3;
      const oneWayTicks = Math.max(0, Math.round((profile.lagMs - deterministicJitter(Number(serverSequence))) / (1_000 / 60)));
      lastDeliveryTick = Math.max(tick + oneWayTicks, lastDeliveryTick + 1);
      delayedRows.push({ deliverTick: lastDeliveryTick, state: authority, sequence: settledSequence });
    }
    for (const row of delayedRows.filter((candidate) => candidate.deliverTick === tick)) {
      const result = history.reconcile(predicted, row.state, row.sequence, collision);
      maximumCorrection = Math.max(maximumCorrection, result.errorFixed); predicted = result.player;
    }
  }
  return { error: Math.hypot(predicted.position.x - authority.position.x, predicted.position.y - authority.position.y), maximumCorrection };
}

describe.each(PROFILES)('prediction acceptance at $name', (profile) => {
  it('walks straight without rubber-band error', () => {
    expect(run(profile, false)).toEqual({ error: 0, maximumCorrection: 0 });
  });
  it('keeps 5 Hz direction tapping byte-identical', () => {
    const result = run(profile, true);
    expect(result.error).toBe(0);
    expect(result.maximumCorrection).toBeLessThanOrEqual(256);
  });
});
