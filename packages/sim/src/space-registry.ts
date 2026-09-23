import { instanceSpaceDefinitionFor, type InstanceSpaceRow, type SpaceDefinition } from './spaces.js';

export interface SpaceRegistryInstance extends InstanceSpaceRow {
  readonly ownerIdentity?: string;
  readonly active?: boolean;
}

export interface SpaceRegistryPortal {
  readonly id: string;
  readonly fromSpace: number;
  readonly fromTileX: number;
  readonly fromTileY: number;
  readonly toSpace: number;
  readonly toTileX: number;
  readonly toTileY: number;
}

export interface SpaceRegistryEntry {
  readonly definition: SpaceDefinition;
  readonly kind: 'static' | 'homestead' | 'residence' | 'cellar' | 'rogue';
  readonly label: string;
  readonly ownerIdentity: string | null;
  readonly ownerName: string | null;
  readonly portals: readonly SpaceRegistryPortal[];
}

/** Caller supplies its revision-bound static definitions; no bootstrap fallback. */
export function buildSpaceRegistry(
  staticSpaces: Iterable<SpaceDefinition>,
  instances: Iterable<SpaceRegistryInstance>,
  portals: Iterable<SpaceRegistryPortal>,
): readonly SpaceRegistryEntry[] {
  const outgoing = new Map<number, SpaceRegistryPortal[]>();
  for (const portal of portals) {
    const rows = outgoing.get(portal.fromSpace) ?? [];
    rows.push(Object.freeze({ ...portal }));
    outgoing.set(portal.fromSpace, rows);
  }
  const spaces = new Map<number, SpaceRegistryEntry>();
  const add = (definition: SpaceDefinition, kind: SpaceRegistryEntry['kind'], instance?: SpaceRegistryInstance): void => {
    if (spaces.has(definition.spaceId)) return;
    spaces.set(definition.spaceId, Object.freeze({
      definition, kind, label: kind === 'rogue' && instance?.ownerName
        ? `${instance.ownerName}'s Delve · room ${instance.roomNumber ?? 0}` : definition.name.replaceAll('_', ' '),
      ownerIdentity: instance?.ownerIdentity ?? null, ownerName: instance?.ownerName ?? null,
      portals: Object.freeze(outgoing.get(definition.spaceId) ?? []),
    }));
  };
  for (const definition of staticSpaces) add(definition, 'static');
  for (const instance of instances) {
    if (instance.active === false) continue;
    const ids: readonly (readonly [number, SpaceRegistryEntry['kind']])[] = instance.instanceKind === 'roguelike'
      ? [[instance.spaceId, 'rogue']]
      : [[instance.spaceId, 'homestead'], ...(instance.residenceSpaceId === undefined ? [] : [
        [instance.residenceSpaceId, 'residence'] as const, [instance.residenceSpaceId + 1, 'cellar'] as const,
      ])];
    for (const [id, kind] of ids) {
      const definition = instanceSpaceDefinitionFor(id, instance);
      if (definition !== undefined) add(definition, kind, instance);
    }
  }
  return Object.freeze([...spaces.values()].sort((a, b) => a.definition.spaceId - b.definition.spaceId));
}
