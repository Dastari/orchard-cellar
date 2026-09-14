import {
  runtimeSpaceDefinition,
  type ContentRegistry,
  type InstanceSpaceRow,
  type SpaceDefinition,
} from '@orchard/sim';

/** Resolve a space exclusively through the client's last verified content
 * registry, while retaining persisted dynamic-instance semantics. */
export function clientSpaceDefinition(
  registry: ContentRegistry,
  spaceId: number,
  instanceRow?: InstanceSpaceRow | null,
): SpaceDefinition | undefined {
  return runtimeSpaceDefinition(registry, spaceId, instanceRow);
}

/** All authored fields which can change canvas presentation or collision. */
export function spacePresentationKey(definition: SpaceDefinition | undefined): string {
  if (definition === undefined) return 'missing';
  const ambient = definition.ambient === 'clock'
    ? 'clock'
    : `${definition.ambient.r},${definition.ambient.g},${definition.ambient.b}`;
  const site = definition.homesteadSite === undefined
    ? '-'
    : `${definition.homesteadSite.worldTileX},${definition.homesteadSite.worldTileY}`;
  const room = definition.rogueRoom === undefined
    ? '-'
    : `${definition.rogueRoom.seed},${definition.rogueRoom.roomNumber},${definition.rogueRoom.roomKind},${definition.rogueRoom.theme}`;
  return [
    definition.spaceId, definition.name, definition.sizeTiles, definition.generator,
    definition.environment, ambient, definition.weather ? 1 : 0, definition.audioBed,
    definition.ownerOnly === true ? 1 : 0, site, room,
  ].join('|');
}

/** Only fields that alter regional query shape or bounds belong here. */
export function spaceStreamingKey(definition: SpaceDefinition | undefined): string {
  return definition === undefined
    ? 'missing'
    : `${definition.spaceId}|${definition.sizeTiles}|${definition.generator}`;
}
