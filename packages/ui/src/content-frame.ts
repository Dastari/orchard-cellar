import type {
  FrameContentDefinition,
  FrameRestrictionRegistry,
  SlotRestriction,
} from '@orchard/sim';
import { resolveFrameSlotRestriction } from '@orchard/sim';

type FramePaneDefinition = FrameContentDefinition['panes'][number];
type FrameBinding = FramePaneDefinition['bind'];

export type FrameRegistryView = FrameRestrictionRegistry;
export { frameRestrictions, resolveFrameSlotRestriction } from '@orchard/sim';

export interface FrameContainerAliases {
  readonly backpack?: string;
  readonly hotbar?: string;
  readonly equipment?: string;
  readonly crafting?: string;
  readonly entity?: string;
  readonly merchant?: string;
}

export interface ResolvedFrameSlotBinding {
  readonly containerId: string;
  readonly index: number;
  readonly restriction?: SlotRestriction;
}

function bindingContainer(binding: FrameBinding, aliases: FrameContainerAliases): string | null {
  if ('entitySlots' in binding) return aliases.entity ?? null;
  if ('self' in binding) return aliases[binding.self] ?? null;
  if ('merchant' in binding) return aliases.merchant ?? null;
  return null;
}

export function resolveFramePaneSlots(
  pane: FramePaneDefinition,
  aliases: FrameContainerAliases,
  registry: Pick<FrameRegistryView, 'items' | 'processes'>,
): readonly ResolvedFrameSlotBinding[] {
  if (pane.kind !== 'slots' && pane.kind !== 'paper_doll') return [];
  const containerId = bindingContainer(pane.bind, aliases);
  if (containerId === null) return [];
  const indices = 'entitySlots' in pane.bind
    ? pane.bind.entitySlots
    : Array.from({ length: (pane.columns ?? 1) * (pane.rows ?? 1) }, (_, index) => index);
  const restriction = resolveFrameSlotRestriction(pane.restriction, registry);
  return indices.map((index) => ({
    containerId,
    index,
    ...(restriction === undefined ? {} : { restriction }),
  }));
}

export function contentFramePaneVisible(
  pane: FramePaneDefinition,
  state: Readonly<Record<string, boolean | string | number>> = {},
): boolean {
  return pane.visibleWhen === undefined || state[pane.visibleWhen.state] === pane.visibleWhen.equals;
}
