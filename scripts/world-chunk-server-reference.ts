/**
 * Node side of the chunk materializer's server reference. The reference itself is browser-safe and
 * lives with Studio (packages/studio/src/world-chunks/server-reference.ts, static world S7b); this
 * module adds the guard that fails closed when the world-module source it mirrors by hand drifts.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type * as sim from '@orchard/sim';
import { worldChunkHash } from '@orchard/sim/world-chunk';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { serverLiveIslandReference as studioServerLiveIslandReference, type ServerLiveIslandReference } from '../packages/studio/src/world-chunks/server-reference.js';

export type {
  ServerCompiledLiveIslandRuntime, ServerComposableRuntime, ServerLiveCollisionRows, ServerLiveIslandReference, ServerOrphanResourcePlacement,
  ServerStaticResource,
} from '../packages/studio/src/world-chunks/server-reference.js';

/** Server source the oracle mirrors by hand rather than executes. Any change to
 * these fragments must be reviewed against serverLiveIslandReference (and the
 * authority.resource record shape for generatedWorldResourceRow), then re-pinned.
 * Hashes cover the fragment text with whitespace runs collapsed. */
export const SERVER_MIRRORED_FRAGMENTS: Readonly<Record<string, string>> = Object.freeze({
  // Static composition inputs: the oracle passes no live rows, a null instance and no excavations;
  // composeWithLiveRows adds the live resource (runtime-suppression filtered), chest and placeable rows.
  // S6 review: + homesteadIslandSource(ctx, spaceId), undefined for topside (the mirror is topside only).
  'collisionForSpace:ground-composition': 'b0c00984c9fe5fd7fd7a68938c2413b6c5da8968117358ab8821cb53f2414181',
  'waterCollisionForSpace:water-composition': '781e308990f94b34b0f5f0330c0ea5b4550736925696a965f7111c13240ba399',
  // Resource placement, desired set and the orphan-placement keep rule. S3c: re-pinned after review; the
  // oracle mirrors them over the compiled runtime (staticView placements, generatedResources()).
  'placedLiveIslandResources': 'ad7076e54ceeb6ef94a7a84052d711998c7eae7d7491e37dd186250db9e80574',
  'reconcileGeneratedSurvivalResources:placed': 'cd0d34a8a86710e20fddc923093c595813483b238fb3b9632359a8fff9ec2f4b',
  'reconcileGeneratedSurvivalResources:orphan-keep': 'd89e3767d6eecf15a37dca8909ca55343bf676f8db621a37d5b54ddc0c1c19ea',
  // Row construction reads only generator fields that authority.resource carries.
  'generatedWorldResourceRow': '81308373b03baac3f6afb36d13dfa0fd7da34a8ea6a0245ee56187bf69c48c99',
  // S7b: the reference calls composeLiveIslandCollision / runtimeSuppressesGeneratedResource directly
  // (browser-safe); these pin that the server still delegates to exactly them.
  'liveMapCollisionForSpace': '06d6046270149fa9bf9e68d52526a64d78d1a310e481d0fb4d215fbb35c1d6e7',
  'liveMapRuntimeGeneratedResourceSuppressed': 'a4defdc0c00955bf4819c8688a36f09bfa55337f2ff5ac2d25c1d2639b9f1e01',
});

function topLevelFunction(source: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const matches = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (matches.length !== 1) throw new Error(`Server mirror guard: expected one function ${name}`);
  return matches[0]!;
}
function descendants(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node): void => { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); };
  ts.forEachChild(node, visit);
  return found;
}
function single(nodes: readonly ts.Node[], label: string): ts.Node {
  if (nodes.length !== 1) throw new Error(`Server mirror guard: expected one ${label}, found ${nodes.length}`);
  return nodes[0]!;
}
function compositionCall(source: ts.SourceFile, name: string, medium: string): ts.Node {
  return single(descendants(topLevelFunction(source, name), node => ts.isCallExpression(node)
    && node.expression.getText(source) === 'liveMapCollisionForSpace'
    && node.arguments[2]?.getText(source) === `'${medium}'`), `${name} ${medium} composition`);
}
function variable(source: ts.SourceFile, fn: ts.FunctionDeclaration, name: string): ts.Node {
  return single(descendants(fn, node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => declaration.name.getText(source) === name)), `${fn.name?.text} ${name}`);
}
/** Current text (whitespace-collapsed) of every mirrored server fragment. */
export function serverMirroredFragments(sourceText: string): Record<string, string> {
  const source = ts.createSourceFile('world.ts', sourceText, ts.ScriptTarget.Latest, true);
  const reconcile = topLevelFunction(source, 'reconcileGeneratedSurvivalResources');
  const nodes: Record<string, ts.Node> = {
    'collisionForSpace:ground-composition': compositionCall(source, 'collisionForSpace', 'ground'),
    'waterCollisionForSpace:water-composition': compositionCall(source, 'waterCollisionForSpace', 'water'),
    // BUG-052: placements and the desired set live in the helper reconcile and admin respawn share.
    'placedLiveIslandResources': topLevelFunction(source, 'placedLiveIslandResources'),
    'reconcileGeneratedSurvivalResources:placed': variable(source, reconcile, '{ placements, desired }'),
    'reconcileGeneratedSurvivalResources:orphan-keep': single(descendants(reconcile, node => ts.isIfStatement(node)
      && node.expression.getText(source) === 'generated === undefined'), 'reconcile orphan keep'),
    'generatedWorldResourceRow': topLevelFunction(source, 'generatedWorldResourceRow'),
    'liveMapCollisionForSpace': topLevelFunction(source, 'liveMapCollisionForSpace'),
    'liveMapRuntimeGeneratedResourceSuppressed': topLevelFunction(source, 'liveMapRuntimeGeneratedResourceSuppressed'),
  };
  return Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, node.getText(source).replace(/\s+/gu, ' ')]));
}
/** Fails closed when the hand-mirrored server source drifts from the pinned review. */
export function assertServerMirrorFragments(sourceText: string): void {
  const fragments = serverMirroredFragments(sourceText);
  const drifted = Object.entries(fragments).filter(([key, text]) => SERVER_MIRRORED_FRAGMENTS[key] !== worldChunkHash(new TextEncoder().encode(text)));
  if (drifted.length > 0 || Object.keys(fragments).length !== Object.keys(SERVER_MIRRORED_FRAGMENTS).length) {
    throw new Error(`Server mirror drifted; review packages/studio/src/world-chunks/server-reference.ts and re-pin: ${drifted.map(([key, text]) => `\n${key}: ${text}`).join('')}`);
  }
}

/** Offline audit oracle: the Studio reference, after checking the mirrored server source is the reviewed one. */
export function serverLiveIslandReference(row: LiveMapDocumentRow, registry: sim.ContentRegistry): ServerLiveIslandReference {
  assertServerMirrorFragments(readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8'));
  return studioServerLiveIslandReference(row, registry);
}
