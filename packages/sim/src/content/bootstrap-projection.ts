import { bootstrapDefinitionsOfKind } from './bootstrap-pack-loader.js';
import { compiledProjection } from './compiled-projection.js';

/** Dependency-safe, immutable compatibility tables from the reviewed pack.
 * Module initialization can project content without constructing a registry or
 * invoking its gameplay validators. Live authority must use its active registry.
 */
export const BOOTSTRAP_COMPILED_CONTENT = compiledProjection(
  bootstrapDefinitionsOfKind('item'), bootstrapDefinitionsOfKind('recipe'),
  bootstrapDefinitionsOfKind('process'), bootstrapDefinitionsOfKind('shop'),
  bootstrapDefinitionsOfKind('crop'), bootstrapDefinitionsOfKind('creature'),
  bootstrapDefinitionsOfKind('spawn'), bootstrapDefinitionsOfKind('space'),
  bootstrapDefinitionsOfKind('skill_tree'), bootstrapDefinitionsOfKind('effect'),
  bootstrapDefinitionsOfKind('statistic'), bootstrapDefinitionsOfKind('upgrade'),
);
