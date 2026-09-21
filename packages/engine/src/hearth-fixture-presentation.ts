import {
  runtimePlaceableObjectDefinitionByTag,
  type ContentRegistry,
} from '@orchard/sim';

export type HearthFixtureRenderer = 'anvil' | 'chest' | 'workbench' | 'barrel';

const FIXTURE_RENDERERS: Readonly<Record<string, HearthFixtureRenderer>> = {
  'container.chest': 'chest',
  'container.barrel': 'barrel',
  'station.anvil': 'anvil',
  'station.workbench': 'workbench',
};

/** Keeps scene-layout roles semantic while the existing pixel renderers remain
 * explicit engine primitives. Missing, retired, and ambiguous content is not
 * rendered. */
export function resolveHearthFixtureRenderer(
  registry: Pick<ContentRegistry, 'objects' | 'items'>,
  objectTag: string,
): HearthFixtureRenderer | null {
  const renderer = FIXTURE_RENDERERS[objectTag];
  if (renderer === undefined) return null;
  return runtimePlaceableObjectDefinitionByTag(registry, objectTag) === null
    ? null
    : renderer;
}
