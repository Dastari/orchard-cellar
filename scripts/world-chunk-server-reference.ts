import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as sim from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { createAuthoritySpaceCollisionMap } from '../packages/world/src/world-rules.js';

export interface ServerStaticResource {
  readonly id: number;
  readonly kind: string;
  readonly generatedTile: { readonly tileX: number; readonly tileY: number };
  readonly effectiveTile: { readonly tileX: number; readonly tileY: number };
  readonly suppressed: boolean;
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
}

const SERVER_FUNCTIONS = [
  'authoredMapCollisionObstacles', 'suppressedGeneratedDecorationObstacleKeys', 'compiledLiveIslandRuntime',
  'liveMapCollisionForSpace', 'liveMapRuntimeGeneratedResourceSuppressed',
] as const;

/** Offline audit oracle: execute the actual server functions, without loading
 * SpacetimeDB or publishing a module. AST selection fails closed after renames. */
export function serverLiveIslandReference(row: LiveMapDocumentRow, registry: sim.ContentRegistry): ServerLiveIslandReference {
  const source = ts.createSourceFile('world.ts', readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set<string>(SERVER_FUNCTIONS);
  const functions = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && names.has(statement.name?.text ?? ''));
  if (functions.length !== names.size) throw new Error('Server parity oracle changed; review function extraction');
  // The composition mirrors collisionForSpace/waterCollisionForSpace with no live rows;
  // resource placement mirrors reconcileGeneratedSurvivalResources' desired set.
  const javascript = ts.transpileModule(`let liveIslandRuntimeCache = null;
${functions.map(fn => fn.getText(source)).join('\n')}
const runtime = compiledLiveIslandRuntime(ctx);
const base = runtime === null ? null : {
  ground: createAuthoritySpaceCollisionMap(contentRegistry(ctx), TOPSIDE_SPACE_ID, [], [], 'ground', [], null, []),
  water: createAuthoritySpaceCollisionMap(contentRegistry(ctx), TOPSIDE_SPACE_ID, [], [], 'water', [], null),
};
const placements = new Map((runtime?.document.resourcePlacements ?? []).map(placement => [BigInt(placement.id), placement]));
runtime === null ? null : ({
  runtime,
  base,
  composed: {
    ground: liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, 'ground', base.ground, runtime),
    water: liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, 'water', base.water, runtime),
  },
  resources: generateSurvivalResources(SURVIVAL_WORLD_SEED, contentRegistry(ctx)).map(resource => {
    const placement = placements.get(BigInt(resource.id));
    return { id: resource.id, kind: resource.kind,
      generatedTile: { tileX: resource.tileX, tileY: resource.tileY },
      effectiveTile: placement === undefined ? { tileX: resource.tileX, tileY: resource.tileY } : { tileX: placement.tileX, tileY: placement.tileY },
      suppressed: liveMapRuntimeGeneratedResourceSuppressed(runtime, BigInt(resource.id)) };
  }),
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
  const { runtime, base, composed, resources } = result as {
    runtime: { ground: sim.CollisionMap; water: sim.CollisionMap; document: sim.MapDocumentV3; generatedSuppressions: ReadonlySet<string>;
      suppressedDecorationObstacleKeys: Readonly<Record<'ground' | 'water', ReadonlySet<string>>>; combatPolicy: sim.CombatRegionPolicy };
    base: Record<'ground' | 'water', sim.CollisionMap>;
    composed: Record<'ground' | 'water', sim.CollisionMap>;
    resources: ServerStaticResource[];
  };
  return { ground: runtime.ground, water: runtime.water, composed, base, document: runtime.document,
    generatedSuppressions: runtime.generatedSuppressions, suppressedDecorationObstacleKeys: runtime.suppressedDecorationObstacleKeys,
    combatPolicy: runtime.combatPolicy, combatRegions: runtime.document.combatRegions ?? [], resources };
}
