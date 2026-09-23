import { resolveObjectDefinitionAppearance, type ContentRegistry } from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';
import { activeObjectFrameState } from './frame-presentation.js';
import { cachedProcessorRuntime } from './processor-timing.js';

interface HoverEntry {
  readonly row: WorldPlaceable;
  readonly left: number; readonly right: number; readonly top: number; readonly bottom: number;
}
/** Projected spatial buckets rebuilt on entity/map/content revision, never on a
 * countdown tick. Inspection has no player-distance or action-permission input. */
export class TimingHoverIndex {
  private key = '';
  private registry: ContentRegistry | null = null;
  private buckets = new Map<string, HoverEntry[]>();

  pick(input: {
    readonly registry: ContentRegistry; readonly revision: string;
    readonly spaceId: number; readonly rows: Iterable<WorldPlaceable>;
    readonly x: number; readonly y: number;
    readonly projectionAt: (x: number, y: number) => number;
  }): WorldPlaceable | null {
    const key = `${input.spaceId}:${input.revision}`;
    if (key !== this.key || input.registry !== this.registry) {
      this.key = key; this.registry = input.registry; this.buckets.clear();
      for (const row of input.rows) {
        if (row.spaceId !== input.spaceId || row.carriedBy !== undefined) continue;
        const runtime = cachedProcessorRuntime(input.registry, row);
        if (!runtime) continue;
        const resolved = resolveObjectDefinitionAppearance(runtime.object, activeObjectFrameState(row));
        const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
        const projection = input.projectionAt(x, y);
        const target = resolved.target;
        const footprint = runtime.object.components.placement?.footprint ?? resolved.collision?.footprint ?? [[15]];
        const entry: HoverEntry = target ? { row, left: x + target.left, right: x + target.right,
          top: y + target.top - projection, bottom: y + target.bottom - projection }
          : { row, left: row.tileX * 16, right: (row.tileX + Math.max(...footprint.map(line => line.length))) * 16,
            top: row.tileY * 16 - projection, bottom: (row.tileY + footprint.length) * 16 - projection };
        for (let cy = Math.floor(entry.top / 16); cy <= Math.floor(entry.bottom / 16); cy++) {
          for (let cx = Math.floor(entry.left / 16); cx <= Math.floor(entry.right / 16); cx++) {
            const cell = `${cx}:${cy}`;
            const entries = this.buckets.get(cell) ?? [];
            entries.push(entry); this.buckets.set(cell, entries);
          }
        }
      }
    }
    const candidates = this.buckets.get(`${Math.floor(input.x / 16)}:${Math.floor(input.y / 16)}`) ?? [];
    let target: HoverEntry | null = null;
    for (const entry of candidates) {
      if (input.x < entry.left || input.x >= entry.right || input.y < entry.top || input.y >= entry.bottom) continue;
      if (!target || entry.bottom > target.bottom || (entry.bottom === target.bottom && entry.row.id > target.row.id)) target = entry;
    }
    return target?.row ?? null;
  }
}
