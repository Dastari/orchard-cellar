import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as sim from '@orchard/sim';
import { worldChunkHash } from '@orchard/sim/world-chunk';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { createAuthoritySpaceCollisionMap } from '../packages/world/src/world-rules.js';

/** One generated resource as reconcile would install it: the generator fields
 * (optional ones only when set) plus the map placement and runtime suppression. */
export interface ServerStaticResource {
  readonly id: number;
  readonly kind: string;
  readonly generatedTile: { readonly tileX: number; readonly tileY: number };
  readonly effectiveTile: { readonly tileX: number; readonly tileY: number };
  readonly suppressed: boolean;
  readonly nodeClass?: string;
  readonly richness?: number;
  readonly spawnSiteId?: number;
  readonly activationOrdinal?: number;
}
/** A placement whose id is not generated; reconcile keeps an existing row with it. */
export interface ServerOrphanResourcePlacement {
  readonly id: string;
  readonly originTile: { readonly tileX: number; readonly tileY: number };
  readonly tile: { readonly tileX: number; readonly tileY: number };
}
export interface ServerLiveIslandReference {
  /** The compiled live-island overlay only (`compiledLiveIslandRuntime().ground/water`). */
  readonly ground: sim.CollisionMap;
  readonly water: sim.CollisionMap;
  /** The server's full static composition: precomputed base (no live rows),
   * compiled terrain overwrite, suppressed-AABB filter of every base obstacle,
   * then the authored obstacles appended (`liveMapCollisionForSpace`). */
  readonly composed: Readonly<Record<'ground' | 'water', sim.CollisionMap>>;
  /** `createAuthoritySpaceCollisionMap(registry, TOPSIDE, [], [], medium)`, before live-map composition. */
  readonly base: Readonly<Record<'ground' | 'water', sim.CollisionMap>>;
  readonly document: sim.MapDocumentV3;
  readonly generatedSuppressions: ReadonlySet<string>;
  readonly suppressedDecorationObstacleKeys: Readonly<Record<'ground' | 'water', ReadonlySet<string>>>;
  readonly combatPolicy: sim.CombatRegionPolicy;
  readonly combatRegions: readonly sim.CombatRegion[];
  /** `generateSurvivalResources(SURVIVAL_WORLD_SEED)` order with the reconcile placement and runtime suppression. */
  readonly resources: readonly ServerStaticResource[];
  /** Placements reconcile uses only to keep rows whose ids are not generated (document order). */
  readonly orphanResourcePlacements: readonly ServerOrphanResourcePlacement[];
}

const SERVER_FUNCTIONS = [
  'authoredMapCollisionObstacles', 'suppressedGeneratedDecorationObstacleKeys', 'compiledLiveIslandRuntime',
  'liveMapCollisionForSpace', 'liveMapRuntimeGeneratedResourceSuppressed',
] as const;

/** Server source the oracle mirrors by hand rather than executes. Any change to
 * these fragments must be reviewed against serverLiveIslandReference (and the
 * authority.resource record shape for generatedWorldResourceRow), then re-pinned.
 * Hashes cover the fragment text with whitespace runs collapsed. */
export const SERVER_MIRRORED_FRAGMENTS: Readonly<Record<string, string>> = Object.freeze({
  // Static composition inputs: the oracle passes no live rows, a null instance and no excavations.
  'collisionForSpace:ground-composition': '0292d6d9dcf859df5ccec1277f3b8399e24758708646d8f87dd8d9e2f88ff22f',
  'waterCollisionForSpace:water-composition': 'f641cf8c6a9d2c3e212b78fdd2b58750b4dea0f12f0fd6570d750841a8183c48',
  // Resource placement, desired set and the orphan-placement keep rule.
  'reconcileGeneratedSurvivalResources:placements': '51e45c8ccb5e832a991269c4f19e5d21a830bd7e77363481a4152998e8e5cf21',
  'reconcileGeneratedSurvivalResources:desired': '89e1b09490e5d26ba9162812cb5aac2287d3b58d9ad15710831f5f1f14228f9b',
  'reconcileGeneratedSurvivalResources:orphan-keep': 'd89e3767d6eecf15a37dca8909ca55343bf676f8db621a37d5b54ddc0c1c19ea',
  // Row construction reads only generator fields that authority.resource carries.
  'generatedWorldResourceRow': '81308373b03baac3f6afb36d13dfa0fd7da34a8ea6a0245ee56187bf69c48c99',
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
    'reconcileGeneratedSurvivalResources:placements': variable(source, reconcile, 'placements'),
    'reconcileGeneratedSurvivalResources:desired': variable(source, reconcile, 'desired'),
    'reconcileGeneratedSurvivalResources:orphan-keep': single(descendants(reconcile, node => ts.isIfStatement(node)
      && node.expression.getText(source) === 'generated === undefined'), 'reconcile orphan keep'),
    'generatedWorldResourceRow': topLevelFunction(source, 'generatedWorldResourceRow'),
  };
  return Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, node.getText(source).replace(/\s+/gu, ' ')]));
}
/** Fails closed when the hand-mirrored server source drifts from the pinned review. */
export function assertServerMirrorFragments(sourceText: string): void {
  const fragments = serverMirroredFragments(sourceText);
  const drifted = Object.entries(fragments).filter(([key, text]) => SERVER_MIRRORED_FRAGMENTS[key] !== worldChunkHash(new TextEncoder().encode(text)));
  if (drifted.length > 0 || Object.keys(fragments).length !== Object.keys(SERVER_MIRRORED_FRAGMENTS).length) {
    throw new Error(`Server mirror drifted; review world-chunk-server-reference.ts and re-pin: ${drifted.map(([key, text]) => `\n${key}: ${text}`).join('')}`);
  }
}

/** Offline audit oracle: execute the actual server functions, without loading
 * SpacetimeDB or publishing a module. AST selection fails closed after renames. */
export function serverLiveIslandReference(row: LiveMapDocumentRow, registry: sim.ContentRegistry): ServerLiveIslandReference {
  const sourceText = readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8');
  assertServerMirrorFragments(sourceText);
  const source = ts.createSourceFile('world.ts', sourceText, ts.ScriptTarget.Latest, true);
  const names = new Set<string>(SERVER_FUNCTIONS);
  const functions = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && names.has(statement.name?.text ?? ''));
  if (functions.length !== names.size) throw new Error('Server parity oracle changed; review function extraction');
  // Mirrored (see SERVER_MIRRORED_FRAGMENTS): the composition is collisionForSpace/
  // waterCollisionForSpace with no live rows; resources follow reconcile's desired set.
  const javascript = ts.transpileModule(`let liveIslandRuntimeCache = null;
${functions.map(fn => fn.getText(source)).join('\n')}
const runtime = compiledLiveIslandRuntime(ctx);
const base = runtime === null ? null : {
  ground: createAuthoritySpaceCollisionMap(contentRegistry(ctx), TOPSIDE_SPACE_ID, [], [], 'ground', [], null, []),
  water: createAuthoritySpaceCollisionMap(contentRegistry(ctx), TOPSIDE_SPACE_ID, [], [], 'water', [], null),
};
const placements = new Map((runtime?.document.resourcePlacements ?? []).map(placement => [BigInt(placement.id), placement]));
const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, contentRegistry(ctx));
const generatedIds = new Set(generated.map(resource => BigInt(resource.id)));
runtime === null ? null : ({
  runtime,
  base,
  composed: {
    ground: liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, 'ground', base.ground, runtime),
    water: liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, 'water', base.water, runtime),
  },
  resources: generated.map(({ id, kind, tileX, tileY, ...optional }) => {
    const placement = placements.get(BigInt(id));
    return { id, kind,
      generatedTile: { tileX, tileY },
      effectiveTile: placement === undefined ? { tileX, tileY } : { tileX: placement.tileX, tileY: placement.tileY },
      suppressed: liveMapRuntimeGeneratedResourceSuppressed(runtime, BigInt(id)),
      ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)) };
  }),
  orphanResourcePlacements: [...placements.values()].filter(placement => !generatedIds.has(BigInt(placement.id)))
    .map(placement => ({ id: placement.id, originTile: { tileX: placement.originTileX, tileY: placement.originTileY }, tile: { tileX: placement.tileX, tileY: placement.tileY } })),
});`, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
  const result: unknown = runInNewContext(javascript, {
    ...sim,
    LIVE_CONTENT_PACK_ID: 'live',
    contentRegistry: () => registry,
    createAuthoritySpaceCollisionMap,
    ctx: { db: {
      live_map_document: { mapId: { find: () => row } },
      content_head: { packId: { find: () => ({ contentHash: registry.contentHash }) } },
    } },
  }, { timeout: 120_000 });
  if (result === null || typeof result !== 'object' || !('runtime' in result)) throw new Error('Server rejected live island parity fixture');
  const { runtime, base, composed, resources, orphanResourcePlacements } = result as {
    runtime: { ground: sim.CollisionMap; water: sim.CollisionMap; document: sim.MapDocumentV3; generatedSuppressions: ReadonlySet<string>;
      suppressedDecorationObstacleKeys: Readonly<Record<'ground' | 'water', ReadonlySet<string>>>; combatPolicy: sim.CombatRegionPolicy };
    base: Record<'ground' | 'water', sim.CollisionMap>;
    composed: Record<'ground' | 'water', sim.CollisionMap>;
    resources: ServerStaticResource[];
    orphanResourcePlacements: ServerOrphanResourcePlacement[];
  };
  return { ground: runtime.ground, water: runtime.water, composed, base, document: runtime.document,
    generatedSuppressions: runtime.generatedSuppressions, suppressedDecorationObstacleKeys: runtime.suppressedDecorationObstacleKeys,
    combatPolicy: runtime.combatPolicy, combatRegions: runtime.document.combatRegions ?? [], resources, orphanResourcePlacements };
}
