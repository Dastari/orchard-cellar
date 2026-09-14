import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ResourceContentDefinition, ResourceDefinitionId } from './content/resource-definition.js';
import type { ContentRegistry } from './content/registry.js';
import { runtimeResourceDefinition } from './content/runtime.js';
import { runtimeHearthEncounterDefinition } from './hearth-encounters.js';

export interface HearthResourceSite {
  readonly id: bigint;
  readonly definitionId: ResourceDefinitionId;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly encounterDefinitionId: `encounter:${string}`;
  /** Durable outdoor_encounter primary key. */
  readonly encounterId: string;
  readonly health: number;
  readonly richness: number;
  readonly nodeClass: NonNullable<ResourceContentDefinition['mining']>['nodeClass'] | '';
  readonly maturityGrowthStage: number | null;
  readonly regrowthProgress: number;
}

export type HearthResourceKind = string;

function activeFixedSiteDefinition(
  registry: ContentRegistry,
  reference: { readonly kind: string; readonly definitionId?: string } | string,
): ResourceContentDefinition | null {
  const definition = runtimeResourceDefinition(registry, reference);
  if (definition === null || definition.respawn?.profile !== 'fixed_site'
    || definition.fixedSites === undefined || definition.fixedSites.length === 0
    || definition.lootDelivery !== 'actor_reserved') return null;
  if (definition.interaction.mode === 'mine') {
    if (definition.mining === undefined || definition.interaction.tool === undefined) return null;
  } else if (definition.health.followsGrowthStage !== true
    || definition.maturityGrowthStage === undefined) return null;
  return definition;
}

export function runtimeHearthResourceDefinition(
  registry: ContentRegistry,
  reference: { readonly kind: string; readonly definitionId?: string } | string,
): ResourceContentDefinition | null {
  return activeFixedSiteDefinition(registry, reference);
}

const ACTIVE_SITES = new WeakMap<ContentRegistry, readonly HearthResourceSite[]>();

export function activeHearthResourceSites(registry: ContentRegistry): readonly HearthResourceSite[] {
  const cached = ACTIVE_SITES.get(registry);
  if (cached !== undefined) return cached;
  const candidates: HearthResourceSite[] = [];
  for (const definition of registry.resources.values()) {
    const active = activeFixedSiteDefinition(registry, {
      kind: definition.runtimeKind,
      definitionId: definition.id,
    });
    if (active === null) continue;
    const health = active.health.initial;
    const richness = active.interaction.mode === 'mine' ? active.mining!.richness : 0;
    const nodeClass = active.interaction.mode === 'mine' ? active.mining!.nodeClass : '';
    for (const [runtimeId, tileX, tileY, elevation, encounterDefinitionId] of active.fixedSites!) {
      const encounter = runtimeHearthEncounterDefinition(registry, encounterDefinitionId);
      if (encounter === null) continue;
      candidates.push(Object.freeze({
        id: BigInt(runtimeId), definitionId: active.id, kind: active.runtimeKind,
        tileX, tileY, elevation, encounterDefinitionId, encounterId: encounter.id,
        health, richness, nodeClass,
        maturityGrowthStage: active.maturityGrowthStage ?? null,
        regrowthProgress: active.regrowth?.initialProgress ?? 0,
      }));
    }
  }
  const counts = new Map<string, number>();
  for (const site of candidates) counts.set(site.id.toString(), (counts.get(site.id.toString()) ?? 0) + 1);
  const result = Object.freeze(candidates
    .filter((site) => counts.get(site.id.toString()) === 1)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  ACTIVE_SITES.set(registry, result);
  return result;
}

export function runtimeHearthResourceSite(
  registry: ContentRegistry,
  id: bigint,
): HearthResourceSite | null {
  return activeHearthResourceSites(registry).find((site) => site.id === id) ?? null;
}

/** Includes retired definitions so generic reconciliation never reclaims or
 * deletes a durable fixed-site row while its content is deliberately offline. */
export function isAuthoredHearthResourceSiteId(registry: ContentRegistry, id: bigint): boolean {
  const runtimeId = id.toString();
  return [...registry.resources.values()].some((definition) => (
    definition.fixedSites?.some((site) => site[0] === runtimeId) === true
  ));
}

/** Reserved ID alone is not ownership. A matching authored definition and
 * immutable site identity are required; mutable harvest state is untouched. */
export function runtimeHearthResourceRowMatchesSite(
  registry: ContentRegistry,
  row: {
    readonly id: bigint; readonly kind: string; readonly definitionId?: string;
    readonly spaceId: number; readonly tileX: number; readonly tileY: number;
    readonly chunkX: number; readonly chunkY: number; readonly spawnSiteId: bigint;
  },
): boolean {
  const site = runtimeHearthResourceSite(registry, row.id);
  const definition = activeFixedSiteDefinition(registry, row);
  return site !== null && definition?.id === site.definitionId
    && row.spaceId === 0 && row.kind === site.kind && row.spawnSiteId === site.id
    && row.tileX === site.tileX && row.tileY === site.tileY
    && row.chunkX === Math.floor(site.tileX / 16) && row.chunkY === Math.floor(site.tileY / 16);
}

/** Bootstrap projections remain available to release tooling and old fixtures;
 * live server/client authority always supplies its active registry. */
let bootstrapHearthResourceSites:readonly HearthResourceSite[]|null=null;
const readBootstrapHearthResourceSites=()=>bootstrapHearthResourceSites??=
  activeHearthResourceSites(bootstrapContentRegistry());
export const HEARTH_RESOURCE_SITES:readonly HearthResourceSite[]=new Proxy(
  [] as HearthResourceSite[],
  {get:(_target,key)=>{
    const rows=readBootstrapHearthResourceSites(),value=Reflect.get(rows,key,rows);
    return typeof value==='function'?value.bind(rows):value;
  }},
);
export function hearthResourceSite(id: bigint): HearthResourceSite | null {
  return runtimeHearthResourceSite(bootstrapContentRegistry(), id);
}
export function hearthResourceRowMatchesSite(row: Parameters<typeof runtimeHearthResourceRowMatchesSite>[1]): boolean {
  return runtimeHearthResourceRowMatchesSite(bootstrapContentRegistry(), row);
}
