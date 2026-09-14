import { GroundChunkCache } from '@orchard/engine/ground-cache';
import { observeProtocolPainter } from './render-protocol-painter-witness.js';
import type { ProtocolWorkloadFrame } from './render-protocol-workload.js';

type Writable<T> = { -readonly [K in keyof T]: T[K] };
export interface ProtocolWorkloadSource {
  readonly playerTie: string;
  readonly pondTies: ReadonlySet<string | number>;
  readonly season: string;
  readonly assetSeason: string | null;
  readonly contentRevision: string;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly carriedLight: boolean;
  /** Null in Basic; the preflight density is recorded independently. */
  readonly staticCasters: number | null;
}
/** Counts the actual painter queue and cap draw calls. No authority mutation,
 * world pixel readback, per-frame snapshot, or per-frame surface allocation. */
export function installProtocolWorkloadProbe(source: ProtocolWorkloadSource) {
  const frame: Writable<ProtocolWorkloadFrame> = {
    seed: 0, season: source.season, assetSeason: source.assetSeason, contentRevision: source.contentRevision,
    cameraX: 0, cameraY: 0, viewportWidth: 0, viewportHeight: 0,
    playerX: Number.NaN, playerY: Number.NaN, playerDrawn: false,
    capRuns: 0, ponds: 0, carriedLights: 0, staticCasters: 0,
  };
  let context: CanvasRenderingContext2D | null = null;
  const stopPainter = observeProtocolPainter({
    begin(terrain, nextContext, scale) {
      context = nextContext;
      frame.seed = terrain.seed; frame.season = source.season;
      frame.contentRevision = source.contentRevision;
      frame.cameraX = source.cameraX; frame.cameraY = source.cameraY;
      frame.viewportWidth = source.worldWidth / scale; frame.viewportHeight = source.worldHeight / scale;
      frame.playerDrawn = false; frame.capRuns = 0; frame.ponds = 0; frame.carriedLights = 0;
    },
    enqueue(x, y, tie) {
      if (tie === source.playerTie) {
        frame.playerDrawn = true; frame.playerX = x; frame.playerY = y;
        frame.carriedLights = source.carriedLight ? 1 : 0;
      }
      if (source.pondTies.has(tie) && x >= frame.cameraX && x <= frame.cameraX + frame.viewportWidth
        && y >= frame.cameraY && y <= frame.cameraY + frame.viewportHeight) frame.ponds++;
    },
  });
  const prototype = GroundChunkCache.prototype, draw = prototype.drawProjectedRun;
  prototype.drawProjectedRun = function (target, art, terrain, first, last, y, offset, cameraX, cameraY, scale) {
    if (target === context && (last + 1) * 16 > cameraX && first * 16 < cameraX + frame.viewportWidth
      && (y + 1) * 16 - offset > cameraY && y * 16 - offset < cameraY + frame.viewportHeight) frame.capRuns++;
    return draw.call(this, target, art, terrain, first, last, y, offset, cameraX, cameraY, scale);
  };
  let active = true;
  return {
    /** Static caster preparation follows queue build, so read it at submission. */
    read(): ProtocolWorkloadFrame {
      frame.staticCasters = source.staticCasters ?? 0;
      return frame;
    },
    dispose() {
      if (!active) return;
      active = false; stopPainter(); prototype.drawProjectedRun = draw;
    },
  };
}
