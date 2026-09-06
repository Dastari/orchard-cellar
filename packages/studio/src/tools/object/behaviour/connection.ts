import {
  parseContentDefinition,
  type ObjectContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type { StudioAccess } from '../../../shell/access.js';
import type {
  StudioConnectionView,
  StudioLiveAdapter,
} from '../../../shell/studio-connection.js';
import type {
  ObjectBehaviourAccess,
  ObjectBehaviourPublishAdapter,
  ObjectBehaviourPublishRequest,
} from './contracts.js';

export function objectBehaviourAccessForConnection(
  routeAccess: StudioAccess,
  adapter: StudioLiveAdapter | null,
): ObjectBehaviourAccess {
  if (adapter === null || !adapter.view().connected) return 'anonymous';
  return routeAccess === 'write' ? 'write' : 'read_only';
}

export function objectDefinitionsFromConnection(
  view: StudioConnectionView,
): readonly ObjectContentDefinition[] {
  return Object.freeze((view.contentDefinitions ?? [])
    .filter((row) => row.kind === 'object')
    .map((row) => parseContentDefinition(row.kind, row.json))
    .filter((definition): definition is ObjectContentDefinition => definition.kind === 'object')
    .sort((left, right) => left.id.localeCompare(right.id)));
}

export function registryDefinitionsFromConnection(
  view: StudioConnectionView,
): readonly SupportedContentDefinition[] {
  return Object.freeze((view.contentDefinitions ?? [])
    .map((row) => parseContentDefinition(row.kind, row.json)));
}

export function objectBehaviourPublishAdapterFromConnection(
  adapter: StudioLiveAdapter,
): ObjectBehaviourPublishAdapter | null {
  if (adapter.publishContentChangeSet === undefined) return null;
  return Object.freeze({
    publishContentChangeSet: (request: ObjectBehaviourPublishRequest) => adapter.publishContentChangeSet!(request),
  });
}
