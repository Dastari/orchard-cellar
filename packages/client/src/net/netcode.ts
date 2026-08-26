import {
  AUTHORITY_HZ,
  FIXED_UNITS_PER_PIXEL,
  INPUT_REFRESH_STEPS,
  REMOTE_INTERPOLATION_DELAY_TICKS,
  REMOTE_SNAPSHOT_CAPACITY,
  SIM_TICKS_PER_SECOND,
  TILE_SIZE_FIXED,
  avatarActionDefinition,
  movePlayer,
  movePlayerAtSpeedPermille,
  positionCollides,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';

export type InputDirection = Direction | 'idle';

export function inputRefreshDue(
  direction: InputDirection,
  idleAcknowledgementPending: boolean,
  ageSteps: number,
  intervalSteps = INPUT_REFRESH_STEPS,
): boolean {
  return ageSteps >= intervalSteps && (direction !== 'idle' || idleAcknowledgementPending);
}

export interface InputCommand {
  readonly sequence: bigint;
  readonly direction: InputDirection;
  readonly clientTick: bigint;
  readonly sprinting: boolean;
}

interface PredictedStep {
  readonly clientTick: bigint;
  readonly direction: InputDirection;
  readonly state: PlayerState;
  readonly speedPermille: number;
}

export interface ReconciliationResult {
  readonly player: PlayerState;
  readonly replayDepth: number;
  readonly errorFixed: number;
  readonly hardSnap: boolean;
}

export class PresentationCorrection {
  private x = 0;
  private y = 0;
  private remaining = 0;
  constructor(private readonly durationSeconds = 0.1) {}
  begin(previous: { readonly x: number; readonly y: number }, corrected: { readonly x: number; readonly y: number }): void {
    this.x = previous.x - corrected.x; this.y = previous.y - corrected.y; this.remaining = this.durationSeconds;
  }
  clear(): void { this.x = 0; this.y = 0; this.remaining = 0; }
  advance(dtSeconds: number): void {
    if (this.remaining <= 0) return;
    const fraction = Math.min(1, Math.max(0, dtSeconds) / this.remaining);
    this.x *= 1 - fraction; this.y *= 1 - fraction; this.remaining = Math.max(0, this.remaining - dtSeconds);
  }
  apply(position: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
    return { x: position.x + this.x, y: position.y + this.y };
  }
}

const HARD_SNAP_DISTANCE_SQUARED = (2 * TILE_SIZE_FIXED) ** 2;

export class LocalPredictionBuffer {
  private commands: InputCommand[] = [];
  private steps: PredictedStep[] = [];
  private tickValue = 0n;
  private lastAcknowledgedTick = 0n;

  constructor(
    private readonly commandCapacity = 256,
    private readonly stepCapacity = 512,
  ) {}

  get clientTick(): bigint { return this.tickValue; }
  get pendingCommandCount(): number { return this.commands.length; }

  recordSend(
    sequence: bigint,
    direction: InputDirection,
    sprinting = false,
  ): InputCommand {
    const command = {
      sequence,
      direction,
      clientTick: this.tickValue,
      sprinting,
    } satisfies InputCommand;
    this.commands.push(command);
    if (this.commands.length > this.commandCapacity) this.commands.splice(0, this.commands.length - this.commandCapacity);
    return command;
  }

  recordStep(direction: InputDirection, state: PlayerState, speedPermille = 1_000): void {
    this.tickValue += 1n;
    // Idle time still advances the protocol clock, but it has no positional
    // effect to replay. Keeping it would fill the ring while standing still.
    if (direction === 'idle') return;
    this.steps.push({ clientTick: this.tickValue, direction, state, speedPermille });
    if (this.steps.length > this.stepCapacity) this.steps.splice(0, this.steps.length - this.stepCapacity);
  }

  reconcile(
    predicted: PlayerState | null,
    authoritative: PlayerState,
    lastProcessedSequence: bigint,
    collision: CollisionMap,
  ): ReconciliationResult {
    const acknowledged = [...this.commands]
      .reverse()
      .find((entry) => entry.sequence <= lastProcessedSequence);
    if (acknowledged !== undefined && acknowledged.clientTick > this.lastAcknowledgedTick) {
      this.lastAcknowledgedTick = acknowledged.clientTick;
    }
    this.commands = this.commands.filter((entry) => entry.sequence > lastProcessedSequence);

    const remaining = this.steps.filter((step) => step.clientTick > this.lastAcknowledgedTick);
    this.steps = remaining;
    let replayed = authoritative;
    for (const step of remaining) {
      replayed = step.speedPermille === 1_000
        ? movePlayer(replayed, step.direction === 'idle' ? null : step.direction, collision)
        : movePlayerAtSpeedPermille(
          replayed, step.direction === 'idle' ? null : step.direction, collision, step.speedPermille,
        );
    }
    const dx = (predicted?.position.x ?? authoritative.position.x) - replayed.position.x;
    const dy = (predicted?.position.y ?? authoritative.position.y) - replayed.position.y;
    return {
      player: replayed,
      replayDepth: remaining.length,
      errorFixed: Math.hypot(dx, dy),
      hardSnap: dx * dx + dy * dy > HARD_SNAP_DISTANCE_SQUARED,
    };
  }

  reset(lastProcessedSequence = 0n): void {
    this.commands = [];
    this.steps = [];
    this.tickValue = 0n;
    this.lastAcknowledgedTick = 0n;
    void lastProcessedSequence;
  }

  commandsForTest(): readonly InputCommand[] { return this.commands; }
}

export interface RemoteSnapshot {
  readonly authorityTick: bigint;
  readonly x: number;
  readonly y: number;
  readonly facing: string;
  readonly actionKind: string;
  readonly actionStartedTick: bigint;
  readonly equippedKind: string;
  readonly equippedLit: boolean;
}

export interface SampledRemote {
  readonly x: number;
  readonly y: number;
  readonly facing: string;
  readonly actionKind: string;
  readonly actionStartedTick: bigint;
  readonly equippedKind: string;
  readonly equippedLit: boolean;
  readonly extrapolated: boolean;
}

export class RemoteSnapshotBuffer {
  private snapshots: RemoteSnapshot[] = [];

  constructor(private readonly capacity = REMOTE_SNAPSHOT_CAPACITY) {}
  get depth(): number { return this.snapshots.length; }

  push(snapshot: RemoteSnapshot): void {
    const existing = this.snapshots.findIndex((entry) => entry.authorityTick === snapshot.authorityTick);
    if (existing >= 0) this.snapshots[existing] = snapshot;
    else this.snapshots.push(snapshot);
    this.snapshots.sort((left, right) => Number(left.authorityTick - right.authorityTick));
    if (this.snapshots.length > this.capacity) this.snapshots.splice(0, this.snapshots.length - this.capacity);
  }

  sample(renderTick: number, collision?: CollisionMap): SampledRemote | null {
    const first = this.snapshots[0];
    const last = this.snapshots.at(-1);
    if (first === undefined || last === undefined) return null;
    let before = first;
    for (let index = this.snapshots.length - 1; index >= 0; index -= 1) {
      const candidate = this.snapshots[index];
      if (candidate !== undefined && Number(candidate.authorityTick) <= renderTick) {
        before = candidate;
        break;
      }
    }
    const after = this.snapshots.find((entry) => Number(entry.authorityTick) >= renderTick);
    if (after !== undefined && after.authorityTick !== before.authorityTick) {
      const span = Number(after.authorityTick - before.authorityTick);
      const alpha = Math.max(0, Math.min(1, (renderTick - Number(before.authorityTick)) / span));
      return {
        x: before.x + (after.x - before.x) * alpha,
        y: before.y + (after.y - before.y) * alpha,
        facing: alpha < 0.5 ? before.facing : after.facing,
        actionKind: alpha < 0.5 ? before.actionKind : after.actionKind,
        actionStartedTick: alpha < 0.5 ? before.actionStartedTick : after.actionStartedTick,
        equippedKind: alpha < 0.5 ? before.equippedKind : after.equippedKind,
        equippedLit: alpha < 0.5 ? before.equippedLit : after.equippedLit,
        extrapolated: false,
      };
    }
    const tickDelta = Math.max(0, Math.min(2, renderTick - Number(last.authorityTick)));
    let x = last.x;
    let y = last.y;
    if (tickDelta > 0) {
      const previous = this.snapshots.at(-2);
      if (previous !== undefined) {
        const tickSpan = Math.max(1, Number(last.authorityTick - previous.authorityTick));
        const candidate = {
          x: last.x + (last.x - previous.x) / tickSpan * tickDelta,
          y: last.y + (last.y - previous.y) / tickSpan * tickDelta,
        };
        if (collision === undefined) {
          x = candidate.x;
          y = candidate.y;
        } else {
          // Check the whole extrapolated segment. An endpoint-only test can skip
          // across a one-tile obstacle when snapshots are sparse.
          const distance = Math.max(Math.abs(candidate.x - last.x), Math.abs(candidate.y - last.y));
          const steps = Math.max(1, Math.ceil(distance / FIXED_UNITS_PER_PIXEL));
          for (let step = 1; step <= steps; step += 1) {
            const sample = {
              x: last.x + (candidate.x - last.x) * step / steps,
              y: last.y + (candidate.y - last.y) * step / steps,
            };
            if (positionCollides(sample, collision)) break;
            x = sample.x;
            y = sample.y;
          }
        }
      }
    }
    return { ...last, x, y, extrapolated: tickDelta > 0 };
  }
}

export interface ProjectileSnapshot {
  readonly authorityTick: bigint;
  readonly spawnedTick: bigint;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly state: string;
}

export interface SampledProjectile {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly state: string;
  readonly extrapolated: boolean;
}

/** Smooths a server-authoritative linear projectile without changing its hit
 * path. Rendering uses confirmed snapshots when available and at most two
 * ticks of velocity-based presentation extrapolation between network updates. */
export class ProjectileSnapshotBuffer {
  private snapshots: ProjectileSnapshot[] = [];

  constructor(private readonly capacity = REMOTE_SNAPSHOT_CAPACITY) {}
  get depth(): number { return this.snapshots.length; }

  push(snapshot: ProjectileSnapshot): void {
    const existing = this.snapshots.findIndex((entry) => entry.authorityTick === snapshot.authorityTick);
    if (existing >= 0) this.snapshots[existing] = snapshot;
    else this.snapshots.push(snapshot);
    this.snapshots.sort((left, right) => Number(left.authorityTick - right.authorityTick));
    if (this.snapshots.length > this.capacity) this.snapshots.splice(0, this.snapshots.length - this.capacity);
  }

  sample(renderTick: number): SampledProjectile | null {
    const first = this.snapshots[0];
    const last = this.snapshots.at(-1);
    if (first === undefined || last === undefined) return null;

    const before = [...this.snapshots].reverse()
      .find((entry) => Number(entry.authorityTick) <= renderTick);
    const after = this.snapshots.find((entry) => Number(entry.authorityTick) >= renderTick);
    if (before !== undefined && after !== undefined && before.authorityTick !== after.authorityTick) {
      const span = Number(after.authorityTick - before.authorityTick);
      const alpha = Math.max(0, Math.min(1, (renderTick - Number(before.authorityTick)) / span));
      return {
        x: before.x + (after.x - before.x) * alpha,
        y: before.y + (after.y - before.y) * alpha,
        velocityX: before.velocityX + (after.velocityX - before.velocityX) * alpha,
        velocityY: before.velocityY + (after.velocityY - before.velocityY) * alpha,
        state: alpha < 1 ? before.state : after.state,
        extrapolated: false,
      };
    }

    if (renderTick < Number(first.authorityTick) && first.state === 'flying') {
      const earliest = Number(first.spawnedTick);
      const sampledTick = Math.max(earliest, renderTick);
      const delta = sampledTick - Number(first.authorityTick);
      return {
        x: first.x + first.velocityX * delta,
        y: first.y + first.velocityY * delta,
        velocityX: first.velocityX,
        velocityY: first.velocityY,
        state: first.state,
        extrapolated: delta !== 0,
      };
    }

    if (last.state !== 'flying') return { ...last, extrapolated: false };
    const tickDelta = Math.max(0, Math.min(2, renderTick - Number(last.authorityTick)));
    return {
      x: last.x + last.velocityX * tickDelta,
      y: last.y + last.velocityY * tickDelta,
      velocityX: last.velocityX,
      velocityY: last.velocityY,
      state: last.state,
      extrapolated: tickDelta > 0,
    };
  }
}

export class RenderTickClock {
  private value: number | null = null;
  constructor(
    private readonly delayTicks = REMOTE_INTERPOLATION_DELAY_TICKS,
    private readonly authorityHz = AUTHORITY_HZ,
  ) {}
  get renderTick(): number { return this.value ?? 0; }
  advance(dtSeconds: number, latestAuthorityTick: bigint): number {
    const target = Number(latestAuthorityTick) - this.delayTicks;
    // Background tabs and reconnects can jump the authority by thousands of
    // ticks. Snap the timeline at that discontinuity so an expired action can
    // never remain frozen on its first frame while the clock slowly catches up.
    if (this.value === null || Math.abs(target - this.value) > 10) this.value = target;
    else {
      this.value += Math.max(0, dtSeconds) * this.authorityHz;
      this.value += Math.max(-0.1, Math.min(0.1, (target - this.value) * 0.08));
      if (this.value > Number(latestAuthorityTick)) this.value = Number(latestAuthorityTick);
    }
    return this.value;
  }
  reset(): void { this.value = null; }
}

/** A cosmetic timeline that continues between authority observations. Unlike
 * RenderTickClock it is not capped at the most recent row: sparse/unchanged
 * position traffic must never stop clouds, water, fire, or foliage. */
export class VisualTickClock {
  private value: number | null = null;

  get renderTick(): number { return this.value ?? 0; }

  advance(dtSeconds: number, latestAuthorityTick: bigint): number {
    const authority = Number(latestAuthorityTick);
    if (this.value === null || Math.abs(authority - this.value) > AUTHORITY_HZ * 4) {
      this.value = authority;
      return this.value;
    }
    this.value += Math.max(0, dtSeconds) * AUTHORITY_HZ;
    this.value += Math.max(-0.05, Math.min(0.05, (authority - this.value) * 0.025));
    return this.value;
  }

  reset(): void { this.value = null; }
}

export interface AvatarAnimationFrame {
  readonly channel: 'locomotion' | 'action';
  readonly kind: string;
  readonly frame: number;
  /** Continues advancing even while an upper-body action owns `frame`. */
  readonly locomotionFrame: number;
  readonly fallback: boolean;
}

export class AvatarAnimationController {
  private locomotionDistance = 0;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastActionKind = 'none';
  private lastActionStartedTick = 0n;
  private wasMoving = false;

  update(
    x: number,
    y: number,
    actionKind: string,
    actionStartedTick: bigint,
    renderTick: number,
    locomotionFrames: number,
    locomotionFps: number,
    actionFrames: number,
    actionFps: number,
    actionArtAvailable = true,
  ): AvatarAnimationFrame {
    const distance = this.lastX === null || this.lastY === null ? 0 : Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x;
    this.lastY = y;
    const moving = distance > 0;
    if (moving && !this.wasMoving) this.locomotionDistance = 0;
    this.locomotionDistance += distance;
    this.wasMoving = moving;
    if (actionKind !== this.lastActionKind || actionStartedTick !== this.lastActionStartedTick) {
      this.lastActionKind = actionKind;
      this.lastActionStartedTick = actionStartedTick;
    }
    const pixelsPerFrame = Math.max(1, SIM_TICKS_PER_SECOND / Math.max(1, locomotionFps));
    const locomotionFrame = Math.floor(this.locomotionDistance / (pixelsPerFrame * FIXED_UNITS_PER_PIXEL))
      % Math.max(1, locomotionFrames);
    if (actionKind !== 'none') {
      const definition = avatarActionDefinition(actionKind);
      const fallback = definition === null || !actionArtAvailable;
      const elapsedSeconds = Math.max(0, renderTick - Number(actionStartedTick)) / AUTHORITY_HZ;
      const rawFrame = Math.floor(elapsedSeconds * Math.max(1, actionFps));
      const playback = definition?.playback ?? 'oneShot';
      if (playback !== 'oneShot' || rawFrame < Math.max(1, actionFrames)) {
        const frame = playback === 'loop'
          ? rawFrame % Math.max(1, actionFrames)
          : Math.min(Math.max(1, actionFrames) - 1, rawFrame);
        return { channel: 'action', kind: fallback ? 'fallback_use' : actionKind, frame, locomotionFrame, fallback };
      }
    }
    return {
      channel: 'locomotion',
      kind: moving ? 'walk' : 'idle',
      frame: moving ? locomotionFrame : 0,
      locomotionFrame: moving ? locomotionFrame : 0,
      fallback: false,
    };
  }
}

export class LatencyInjector {
  private outgoingReadyAt = 0;
  private incomingReadyAt = 0;
  private outgoingDispatch: Promise<void> = Promise.resolve();
  private incomingDispatch: Promise<void> = Promise.resolve();
  private ungroupedIncomingId = 0;
  private readonly incomingGroups = new Map<string, { readonly callbacks: Array<() => void>; scheduled: boolean }>();
  constructor(
    readonly lagMs: number,
    readonly jitterMs: number,
    private readonly random: () => number = Math.random,
  ) {}
  delayMs(): number {
    const jitter = (this.random() * 2 - 1) * this.jitterMs;
    return Math.max(0, this.lagMs + jitter);
  }
  outgoing<T>(call: () => Promise<T>): Promise<T> {
    const now = performance.now();
    this.outgoingReadyAt = Math.max(now + this.delayMs(), this.outgoingReadyAt + 0.01);
    const readyAt = this.outgoingReadyAt;
    return new Promise<T>((resolve, reject) => {
      this.outgoingDispatch = this.outgoingDispatch.then(async () => {
        const delay = Math.max(0, readyAt - performance.now());
        if (delay > 0) await new Promise<void>((done) => globalThis.setTimeout(done, delay));
        // Serialize dispatch, not reducer completion: WebSocket order is retained
        // without adding a round trip of head-of-line blocking to every input.
        try {
          void call().then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  incoming(apply: () => void): void {
    this.ungroupedIncomingId += 1;
    this.incomingGrouped(`ungrouped:${this.ungroupedIncomingId}`, apply);
  }
  incomingGrouped(groupId: string, apply: () => void): void {
    const existing = this.incomingGroups.get(groupId);
    if (existing !== undefined) {
      existing.callbacks.push(apply);
      return;
    }
    const group = { callbacks: [apply], scheduled: false };
    this.incomingGroups.set(groupId, group);
    const now = performance.now();
    this.incomingReadyAt = Math.max(now + this.delayMs(), this.incomingReadyAt + 0.01);
    const readyAt = this.incomingReadyAt;
    queueMicrotask(() => {
      if (group.scheduled) return;
      group.scheduled = true;
      this.incomingDispatch = this.incomingDispatch.then(async () => {
        const delay = Math.max(0, readyAt - performance.now());
        if (delay > 0) await new Promise<void>((done) => globalThis.setTimeout(done, delay));
        this.incomingGroups.delete(groupId);
        for (const callback of group.callbacks) callback();
      });
    });
  }
}

export function latencyFromSearch(search: string): LatencyInjector {
  const params = new URLSearchParams(search);
  const lag = Number(params.get('lag') ?? 0);
  const jitter = Number(params.get('jitter') ?? 0);
  return new LatencyInjector(
    Number.isFinite(lag) ? Math.max(0, lag) : 0,
    Number.isFinite(jitter) ? Math.max(0, jitter) : 0,
  );
}
