import type { ContentRegistry, SpaceContentDefinition } from '@orchard/sim';

export interface RuntimeSpacePortalReference {
  readonly id: number | bigint;
  readonly kind: string;
  readonly fromSpace: number;
  readonly fromTileX: number;
  readonly fromTileY: number;
  readonly toSpace: number;
  readonly toTileX: number;
  readonly toTileY: number;
}

function activeSpaceAt(
  registry: ContentRegistry,
  spaceId: number,
): SpaceContentDefinition | null {
  const matches = [...registry.spaces.values()].filter((space) => (
    space.retired !== true && space.spaceId === spaceId
  ));
  return matches.length === 1 ? matches[0]! : null;
}

function authoredSpaceLabel(name: string): string | null {
  const value = name.trim();
  if (value.length === 0) return null;
  if (!value.includes('_')) return value;
  const words = value.split('_').filter((word) => word.length > 0);
  if (words.length < 2) return null;
  const title = (word: string): string => word[0]!.toUpperCase() + word.slice(1).toLowerCase();
  return `${words.slice(0, -1).map(title).join(' ')}'s ${title(words.at(-1)!)}`;
}

export interface AuthoredSpacePortalPromptResolution {
  /** False identifies a dynamic portal outside the authored static graph. */
  readonly authored: boolean;
  /** Null for an authored row whose active graph cannot be proven complete. */
  readonly prompt: string | null;
}

/** Resolves the prompt for a static authored indoor threshold. Dynamic home,
 * cellar and homestead portals retain their dedicated ownership-aware flows.
 * A stale row or incomplete/ambiguous active space graph is marked authored
 * but returns no prompt so targeting can fail closed. */
export function authoredSpacePortalPrompt(
  registry: ContentRegistry,
  row: RuntimeSpacePortalReference,
): AuthoredSpacePortalPromptResolution {
  const matchesByRuntimeId = [...registry.spaces.values()].flatMap((owner) => (
    (owner.portals ?? [])
      .filter((portal) => portal.runtimeId === row.id.toString())
      .map((portal) => ({ owner, portal }))
  ));
  if (matchesByRuntimeId.length === 0) return { authored: false, prompt: null };
  if (matchesByRuntimeId.length !== 1) return { authored: true, prompt: null };
  const { owner, portal } = matchesByRuntimeId[0]!;
  if (owner.retired === true
    || portal.portalKind !== row.kind
    || portal.fromTileX !== row.fromTileX
    || portal.fromTileY !== row.fromTileY
    || portal.toTileX !== row.toTileX
    || portal.toTileY !== row.toTileY) return { authored: true, prompt: null };

  const from = activeSpaceAt(registry, row.fromSpace);
  const to = activeSpaceAt(registry, row.toSpace);
  if (from === null || to === null
    || registry.spaces.get(portal.fromSpace) !== from
    || registry.spaces.get(portal.toSpace) !== to) return { authored: true, prompt: null };

  if (from.environment !== 'indoor' && to.environment === 'indoor') {
    const label = authoredSpaceLabel(to.name);
    return { authored: true, prompt: label === null ? null : `ENTER ${label.toUpperCase()}` };
  }
  if (from.environment === 'indoor' && to.environment !== 'indoor') {
    const label = authoredSpaceLabel(from.name);
    return { authored: true, prompt: label === null ? null : `LEAVE ${label.toUpperCase()}` };
  }
  return { authored: true, prompt: null };
}
