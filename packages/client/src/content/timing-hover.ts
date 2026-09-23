import { resolveObjectDefinitionAppearance, type ContentRegistry } from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';
import { activeObjectFrameState } from './frame-presentation.js';
import { TimingInspectionIndex } from './timing-inspection.js';
import { cachedProcessorRuntime } from './processor-timing.js';

/** Processor adapter for the shared spatial inspection index. */
export class TimingHoverIndex {
  private registry: ContentRegistry | null = null;
  private contentRevision = 0;
  private readonly index = new TimingInspectionIndex<WorldPlaceable>();
  pick(input: {
    readonly registry: ContentRegistry; readonly revision: string;
    readonly spaceId: number; readonly rows: Iterable<WorldPlaceable>;
    readonly x: number; readonly y: number;
    readonly projectionAt: (x: number, y: number) => number;
  }): WorldPlaceable | null {
    if (input.registry !== this.registry) { this.registry = input.registry; this.contentRevision++; }
    return this.index.pick(`${this.contentRevision}:${input.spaceId}:${input.revision}`, function* () {
      for (const row of input.rows) {
        if (row.spaceId !== input.spaceId || row.carriedBy !== undefined) continue;
        const runtime = cachedProcessorRuntime(input.registry, row);
        if (!runtime) continue;
        const resolved = resolveObjectDefinitionAppearance(runtime.object, activeObjectFrameState(row));
        const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
        const projection = input.projectionAt(x, y), target = resolved.target;
        const footprint = runtime.object.components.placement?.footprint ?? resolved.collision?.footprint ?? [[15]];
        const bounds = target ? { left: x + target.left, right: x + target.right,
          top: y + target.top - projection, bottom: y + target.bottom - projection }
          : { left: row.tileX * 16, right: (row.tileX + Math.max(...footprint.map(line => line.length))) * 16,
            top: row.tileY * 16 - projection, bottom: (row.tileY + footprint.length) * 16 - projection };
        yield { value: row, bounds };
      }
    }, input.x, input.y);
  }
}
