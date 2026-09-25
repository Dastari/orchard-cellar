import type { ContentRegistry, TimingProjection } from '@orchard/sim';
import { runtimeResourceDefinition } from '@orchard/sim/content/runtime';
import { projectTiming } from '@orchard/sim/timing';
import { TREE_REGROWTH_PROGRESS_MAX } from '@orchard/sim/tree-regrowth';
import type { WorldResource, WorldCrop } from '@orchard/world-bindings/types';
import { TimingInspectionIndex } from './timing-inspection.js';

export type GrowthHoverTarget = { readonly kind: 'crop'; readonly row: WorldCrop }
  | { readonly kind: 'resource'; readonly row: WorldResource };
export class GrowthTimingHoverIndex {
  private readonly index = new TimingInspectionIndex<GrowthHoverTarget>();
  private registry: ContentRegistry | undefined;
  private contentRevision = 0;
  pick(input: { readonly registry: ContentRegistry; readonly revision: string; readonly spaceId: number;
    readonly crops: Iterable<WorldCrop>; readonly resources: Iterable<WorldResource>;
    readonly resourceVisible?: (row: WorldResource) => boolean;
    readonly x: number; readonly y: number; readonly projectionAt: (x: number, y: number) => number }): GrowthHoverTarget | null {
    if (input.registry !== this.registry) { this.registry = input.registry; this.contentRevision++; }
    return this.index.pick(`${this.contentRevision}:${input.spaceId}:${input.revision}`, function* () {
      for (const row of input.resources) {
        if (row.spaceId !== input.spaceId || input.resourceVisible?.(row) === false) continue;
        const definition = runtimeResourceDefinition(input.registry, row);
        if (!definition || (!definition.regrowth && !definition.fruitHarvest)) continue;
        const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
        const rect = definition.target.footprint, projection = input.projectionAt(x, y);
        yield { value: { kind: 'resource' as const, row }, bounds: { left: x + rect.left, right: x + rect.right,
          top: y + rect.top - projection, bottom: y + rect.bottom - projection } };
      }
      for (const row of input.crops) {
        if (row.spaceId !== input.spaceId) continue;
        const x = row.tileX * 16, y = (row.tileY + 1) * 16;
        const projection = input.projectionAt(x + 8, y);
        yield { value: { kind: 'crop' as const, row }, bounds: { left: x, right: x + 16,
          top: y - 16 - projection, bottom: y - projection } };
      }
    }, input.x, input.y);
  }
}

const projectedResources = new WeakMap<WorldResource, { registry: ContentRegistry; tick: bigint; raining: boolean; timing: TimingProjection | null }>();
export function projectResourceTiming(registry: ContentRegistry, row: WorldResource, tick: bigint, raining: boolean): TimingProjection | null {
  const cached = projectedResources.get(row);
  if (cached && cached.registry === registry && cached.tick === tick && cached.raining === raining) return cached.timing;
  const definition = runtimeResourceDefinition(registry, row);
  const growing = row.depleted || row.regrowthProgress < TREE_REGROWTH_PROGRESS_MAX;
  const timing = definition?.regrowth && growing
    ? projectTiming({ kind: 'tree', progress: row.regrowthProgress, depleted: row.depleted,
      health: row.health, raining, phaseSeed: Number(row.id & 0xffffffffn) }, tick)
    : definition?.fruitHarvest ? projectTiming({ kind: 'fruit', resource: row,
      durationTicks: BigInt(definition.fruitHarvest.cooldownTicks) }, tick)
      : definition?.regrowth ? projectTiming({ kind: 'tree', progress: row.regrowthProgress,
        depleted: row.depleted, health: row.health, raining, phaseSeed: Number(row.id & 0xffffffffn) }, tick) : null;
  projectedResources.set(row, { registry, tick, raining, timing });
  return timing;
}
