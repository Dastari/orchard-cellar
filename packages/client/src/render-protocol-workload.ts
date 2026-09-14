import { protocolDistribution } from '@orchard/engine/render-protocol-buffer';

export interface ProtocolWorkloadFrame {
  readonly seed: number;
  readonly season: string;
  readonly contentRevision: string;
  readonly assetSeason: string | null;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly playerDrawn: boolean;
  readonly capRuns: number;
  readonly ponds: number;
  readonly carriedLights: number;
  readonly staticCasters: number;
}
export interface ProtocolWorkloadIdentity {
  readonly seed: number;
  readonly season: string;
  readonly contentRevision: string;
  readonly route: string;
}
const WIDTH = 10;
/** Compact evidence collected during active frames. Scene qualification is
 * reported independently of timings so an unsuitable route remains useful for
 * diagnosis, without becoming evidence of a matched-workload improvement. */
export class ProtocolWorkloadBuffer {
  private readonly values: Float64Array;
  private count = 0;
  private offscreen = 0;
  private changed = 0;
  private seasonMismatch = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private distance = 0;
  private movingFrames = 0;
  private invalid = 0;
  constructor(readonly identity: ProtocolWorkloadIdentity, readonly capacity = 16_384) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid workload capacity');
    this.values = new Float64Array(capacity * WIDTH);
  }
  record(frame: ProtocolWorkloadFrame, renderItems: number, timestamp = this.count): void {
    if (this.count === this.capacity) throw new Error('render_protocol_workload_overflow');
    if (frame.seed !== this.identity.seed || frame.season !== this.identity.season
      || frame.contentRevision !== this.identity.contentRevision) this.changed++;
    if (frame.assetSeason !== this.identity.season) this.seasonMismatch++;
    // Keep the full avatar clear of the edge, not merely its anchor. Positions
    // supplied by the painter are projected world pixels from the rendered frame.
    if (!frame.playerDrawn || frame.playerX - 16 < frame.cameraX || frame.playerY - 40 < frame.cameraY
      || frame.playerX + 16 > frame.cameraX + frame.viewportWidth
      || frame.playerY + 8 > frame.cameraY + frame.viewportHeight) this.offscreen++;
    if (Number.isFinite(this.lastX) && Number.isFinite(this.lastY)) {
      const distance = Math.hypot(frame.playerX - this.lastX, frame.playerY - this.lastY);
      if (distance > 0.01) this.movingFrames++;
      this.distance += distance;
    }
    this.lastX = frame.playerX; this.lastY = frame.playerY;
    let offset = this.count++ * WIDTH;
    this.values[offset++] = frame.cameraX; this.values[offset++] = frame.cameraY;
    this.values[offset++] = frame.playerX; this.values[offset++] = frame.playerY;
    this.values[offset++] = frame.capRuns; this.values[offset++] = frame.ponds;
    this.values[offset++] = frame.carriedLights; this.values[offset++] = frame.staticCasters;
    this.values[offset++] = renderItems; this.values[offset++] = timestamp;
    for (let i = offset - WIDTH; i < offset; i++) if (!Number.isFinite(this.values[i])) { this.invalid++; break; }
    if (!(frame.viewportWidth > 0 && frame.viewportHeight > 0)) this.invalid++;
  }
  report() {
    const column = (index: number) => Array.from({ length: this.count }, (_, row) => this.values[row * WIDTH + index]!);
    const minimum = (index: number) => this.count ? Math.min(...column(index)) : 0;
    const issues: string[] = [];
    if (this.count < 2) issues.push('insufficient_frames');
    if (this.invalid) issues.push('invalid_frame_evidence');
    if (this.changed) issues.push('seed_season_or_content_changed');
    if (this.seasonMismatch) issues.push('asset_season_mismatch');
    if (this.offscreen) issues.push('local_player_not_visible');
    if (this.movingFrames < this.count * 0.5 || this.distance < 16) issues.push('local_player_not_walking');
    if (minimum(4) < 1) issues.push('no_cliff_cap_runs');
    if (minimum(5) < 1) issues.push('no_pond');
    if (minimum(6) < 1) issues.push('no_carried_light');
    if (minimum(7) < 150) issues.push('fewer_than_150_static_casters');
    if (!this.identity.route) issues.push('unpinned_camera_route');
    return { identity: this.identity, qualified: issues.length === 0, issues, frameCount: this.count,
      offscreenFrames: this.offscreen, movingFrames: this.movingFrames, distancePixels: this.distance,
      minimumCapRuns: minimum(4), minimumPonds: minimum(5), minimumCarriedLights: minimum(6),
      minimumStaticCasters: minimum(7), renderItems: protocolDistribution(column(8)),
      timestamps: column(9), cameraX: column(0), cameraY: column(1), playerX: column(2), playerY: column(3) };
  }
}

/** Symmetric gate: a comparison must pass regardless of which sample is named
 * baseline. Percentile-only equality can hide differently populated frames. */
export function compareProtocolWorkloads(left: ReturnType<ProtocolWorkloadBuffer['report']>,
  right: ReturnType<ProtocolWorkloadBuffer['report']>) {
  const issues: string[] = [];
  if (!left.qualified || !right.qualified) issues.push('unqualified_workload');
  for (const key of ['seed', 'season', 'contentRevision', 'route'] as const) {
    if (left.identity[key] !== right.identity[key]) issues.push(`different_${key}`);
  }
  for (const key of ['mean', 'p50', 'p95', 'p99'] as const) {
    const a = left.renderItems[key], b = right.renderItems[key];
    if (Math.abs(a - b) > Math.min(a, b) * 0.02) issues.push(`render_items_${key}_outside_2_percent`);
  }
  // Compare equal elapsed times, not equal frame indices: slow/janky samples
  // have an uneven rAF cadence and must not silently compare different places.
  const sample = (report: typeof left, key: 'cameraX' | 'cameraY', fraction: number) => {
    const first = report.timestamps[0], last = report.timestamps.at(-1);
    if (first === undefined || last === undefined) return Number.NaN;
    const time = first + (last - first) * fraction;
    let i = 1;
    while (i < report.frameCount - 1 && report.timestamps[i]! < time) i++;
    const a = report.timestamps[i - 1]!, b = report.timestamps[i]!;
    const t = b > a ? (time - a) / (b - a) : 0;
    return report[key][i - 1]! * (1 - t) + report[key][i]! * t;
  };
  for (const key of ['cameraX', 'cameraY'] as const) {
    for (let i = 0; i <= 64; i++) {
      const a = sample(left, key, i / 64), b = sample(right, key, i / 64);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1) {
        issues.push(`different_measured_${key}_route`); break;
      }
    }
  }
  return { comparable: issues.length === 0, issues };
}
