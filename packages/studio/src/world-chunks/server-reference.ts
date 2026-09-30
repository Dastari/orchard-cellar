/**
 * The chunk materializer's server reference: the live island exactly as the world module composes
 * it, over the compiled island (static world S7b made this browser-safe so Studio can materialise
 * its own publications).
 *
 * Executed directly: the compiled island (`compiled-island.ts`), the world module's collision
 * composition (`composeLiveIslandCollision`, `runtimeSuppressesGeneratedResource`) and its authority
 * collision builder (`createAuthoritySpaceCollisionMap`). The collisionForSpace /
 * waterCollisionForSpace calls and reconcile's resource placement are mirrored by hand; the Node-side
 * guard (scripts/world-chunk-server-reference.ts, SERVER_MIRRORED_FRAGMENTS) pins that server text.
 */
import * as sim from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { createAuthoritySpaceCollisionMap } from '../../../world/src/world-rules.js';
import { composeLiveIslandCollision, runtimeSuppressesGeneratedResource } from '../../../world/src/content/live-island-composition.js';
import type { LiveIslandCollisionRuntime } from '../../../world/src/content/chunk-authority-runtime.js';
import { compiledLiveIslandRuntime, type LiveIslandRuntime } from './compiled-island.js';
import { precomputedSurvivalCollisionMap } from './island-base.js';

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
export type ServerCompiledLiveIslandRuntime = LiveIslandRuntime;
/** A runtime the reference composes over: the compiled island, or a chunk-assembled one. */
export type ServerComposableRuntime = Pick<LiveIslandCollisionRuntime,
  'ground' | 'water' | 'baseObstacles' | 'suppressedDecorationObstacleKeys' | 'generatedSuppressions'> & { readonly source?: string };
export interface ServerLiveIslandReference {
  /** The compiled live-island overlay only (`compiledLiveIslandRuntime().ground/water`). */
  readonly ground: sim.CollisionMap;
  readonly water: sim.CollisionMap;
  /** The server's full static composition: island base (no live rows), compiled terrain overwrite,
   * suppressed-AABB filter of every base obstacle, then the authored obstacles appended. */
  readonly composed: Readonly<Record<'ground' | 'water', sim.CollisionMap>>;
  /** `createAuthoritySpaceCollisionMap(registry, TOPSIDE, [], [], medium)` over the island base, before live-map composition. */
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
  /** The `compiledLiveIslandRuntime(row, registry)` result (with its cache key). */
  readonly runtime: ServerCompiledLiveIslandRuntime;
  /** Static composition WITH live rows, as collisionForSpace/waterCollisionForSpace do it (mirrored):
   * `createAuthoritySpaceCollisionMap` with live resources (runtime-suppressed ones dropped), chests
   * and placeables, then `composeLiveIslandCollision` over the given runtime (compiled, or a
   * chunk-assembled one; null composes nothing). */
  composeWithLiveRows(medium: 'ground' | 'water', runtime: ServerComposableRuntime | null, rows: ServerLiveCollisionRows): sim.CollisionMap;
}
/** Live rows in the shape collisionForSpace passes to createAuthoritySpaceCollisionMap. */
export interface ServerLiveCollisionRows {
  readonly resources: readonly { readonly id: bigint; readonly kind: string; readonly definitionId?: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean }[];
  readonly chests: readonly { readonly tileX: number; readonly tileY: number; readonly carriedBy?: unknown }[];
  readonly placeables: readonly { readonly tileX: number; readonly tileY: number; readonly blocksMovement: boolean }[];
}

type AuthorityCollision = typeof createAuthoritySpaceCollisionMap;

/**
 * Static world S3-final: the world module's topside base is solid with no obstacles (the published
 * chunks supply everything). The reference composes over the island base the chunks are built from,
 * the precomputed generator collision: its channels, and its obstacles ahead of the live rows.
 */
function referenceAuthorityCollisionMap(...args: Parameters<AuthorityCollision>): sim.CollisionMap {
  const collision = createAuthoritySpaceCollisionMap(...args);
  const [, spaceId, , , medium] = args;
  if (spaceId !== sim.TOPSIDE_SPACE_ID || (medium !== 'ground' && medium !== 'water')) return collision;
  const base = precomputedSurvivalCollisionMap(medium);
  return { ...collision, ...base, obstacles: [...(base.obstacles ?? []), ...(collision.obstacles ?? [])] };
}

/** `liveMapCollisionForSpace` for topside: nothing to compose without a runtime. */
function composeTopside(medium: 'ground' | 'water', base: sim.CollisionMap, runtime: ServerComposableRuntime | null): sim.CollisionMap {
  return runtime === null ? base : composeLiveIslandCollision(base, runtime, medium);
}

/** The server's live island for a map row, composed as the world module composes it. */
export function serverLiveIslandReference(row: LiveMapDocumentRow, registry: sim.ContentRegistry): ServerLiveIslandReference {
  const runtime = compiledLiveIslandRuntime(row, registry);
  if (runtime === null) throw new Error('Server rejected live island parity fixture');
  const base = {
    ground: referenceAuthorityCollisionMap(registry, sim.TOPSIDE_SPACE_ID, [], [], 'ground', [], null, []),
    water: referenceAuthorityCollisionMap(registry, sim.TOPSIDE_SPACE_ID, [], [], 'water', [], null),
  };
  const placements = new Map(runtime.staticView.resourcePlacements.map(placement => [BigInt(placement.id), placement]));
  const generated = runtime.generatedResources();
  const generatedIds = new Set(generated.map(resource => BigInt(resource.id)));
  const resources = generated.map(({ id, kind, tileX, tileY, ...optional }): ServerStaticResource => {
    const placement = placements.get(BigInt(id));
    return { id, kind,
      generatedTile: { tileX, tileY },
      effectiveTile: placement === undefined ? { tileX, tileY } : { tileX: placement.tileX, tileY: placement.tileY },
      suppressed: runtimeSuppressesGeneratedResource(runtime, BigInt(id)),
      ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)) };
  });
  const orphanResourcePlacements = [...placements.values()].filter(placement => !generatedIds.has(BigInt(placement.id)))
    .map(placement => ({ id: placement.id, originTile: { tileX: placement.originTileX, tileY: placement.originTileY }, tile: { tileX: placement.tileX, tileY: placement.tileY } }));
  // A chunk runtime composes over the server's own (solid, obstacle-free) island base, as it does live;
  // the compiled reference over the precomputed island.
  const composeWithLiveRows: ServerLiveIslandReference['composeWithLiveRows'] = (medium, liveRuntime, rows) => {
    const authority: AuthorityCollision = liveRuntime?.source === 'chunks' ? createAuthoritySpaceCollisionMap : referenceAuthorityCollisionMap;
    return composeTopside(medium, medium === 'ground'
      ? authority(registry, sim.TOPSIDE_SPACE_ID,
        rows.resources.filter(resource => !runtimeSuppressesGeneratedResource(liveRuntime, resource.id)) as Parameters<AuthorityCollision>[2],
        rows.chests as Parameters<AuthorityCollision>[3], 'ground', rows.placeables as Parameters<AuthorityCollision>[5], null, [])
      : authority(registry, sim.TOPSIDE_SPACE_ID, [], [], 'water', [], null), liveRuntime);
  };
  return { ground: runtime.ground, water: runtime.water,
    composed: { ground: composeTopside('ground', base.ground, runtime), water: composeTopside('water', base.water, runtime) },
    base, document: runtime.document,
    generatedSuppressions: runtime.generatedSuppressions, suppressedDecorationObstacleKeys: runtime.suppressedDecorationObstacleKeys,
    combatPolicy: runtime.combatPolicy, combatRegions: runtime.document.combatRegions ?? [], resources, orphanResourcePlacements,
    runtime, composeWithLiveRows };
}
