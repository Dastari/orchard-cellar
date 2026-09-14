import {
  runtimeNpcDefinition,
  runtimeObjectDefinition,
  runtimeResourceDefinition,
  type ContentRegistry,
} from '@orchard/sim';

export interface AdminContentReferenceResolution {
  readonly definitionId: string;
  readonly exists: boolean;
  readonly retired: boolean;
}

interface ObjectReference {
  readonly kind: string;
  readonly definitionId?: string;
}

interface ResourceReference {
  readonly kind: string;
  readonly definitionId?: string;
}

interface NpcReference {
  readonly id: bigint | string;
  readonly kind: string;
  readonly definitionId?: string;
}

interface RetirableDefinition {
  readonly id: string;
  readonly retired?: boolean;
}

function resolution(
  definition: RetirableDefinition | undefined,
  missingDefinitionId: string,
): AdminContentReferenceResolution {
  return definition === undefined
    ? { definitionId: missingDefinitionId, exists: false, retired: false }
    : { definitionId: definition.id, exists: true, retired: definition.retired === true };
}

/** Mirrors runtimeObjectDefinition's exact-id, legacy kind and unique placement
 * item precedence, but keeps the matching retired definition visible to admin
 * validation instead of treating it as an ordinary missing row. */
export function adminObjectContentReference(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectReference,
): AdminContentReferenceResolution {
  const active = runtimeObjectDefinition(registry, reference);
  if (active !== null) return resolution(active, active.id);

  const storedId = reference.definitionId?.trim() ?? '';
  if (storedId.length > 0) return resolution(registry.objects.get(storedId), storedId);

  const legacyId = `object:${reference.kind}`;
  const legacy = registry.objects.get(legacyId);
  if (legacy !== undefined) return resolution(legacy, legacyId);

  const placementItemId = `item:${reference.kind}`;
  const candidates = [...registry.objects.values()].filter(
    (candidate) => candidate.components.placement?.item === placementItemId,
  );
  return candidates.length === 1
    ? resolution(candidates[0], legacyId)
    : resolution(undefined, legacyId);
}

/** Mirrors runtimeResourceDefinition's durable-id then legacy-kind resolution.
 * A retired exact definition intentionally wins over runtime-kind aliases, as
 * it does in the authority resolver. */
export function adminResourceContentReference(
  registry: ContentRegistry,
  reference: ResourceReference,
): AdminContentReferenceResolution {
  const active = runtimeResourceDefinition(registry, reference);
  if (active !== null) return resolution(active, active.id);

  const storedId = reference.definitionId?.trim() ?? '';
  const explicit = storedId.startsWith('resource:')
    ? registry.resources.get(storedId)
    : undefined;
  if (explicit !== undefined) return resolution(explicit, storedId);

  const legacyId = `resource:${reference.kind}`;
  const legacy = registry.resources.get(legacyId);
  if (legacy !== undefined) return resolution(legacy, legacyId);

  const runtimeKindCandidates = [...registry.resources.values()]
    .filter((candidate) => candidate.runtimeKind === reference.kind);
  const candidate = runtimeKindCandidates[runtimeKindCandidates.length - 1];
  return resolution(candidate, storedId.length > 0 ? storedId : legacyId);
}

/** Uses runtimeNpcDefinition for every active decision. The second pass exists
 * solely so administration can distinguish the same durable candidate being
 * retired from it being absent. */
export function adminNpcContentReference(
  registry: Pick<ContentRegistry, 'npcs'>,
  reference: NpcReference,
): AdminContentReferenceResolution {
  const active = runtimeNpcDefinition(registry, reference);
  if (active !== null) return resolution(active, active.id);

  const storedId = reference.definitionId?.trim() ?? '';
  if (storedId.length > 0) return resolution(registry.npcs.get(storedId), storedId);

  const definitions = [...registry.npcs.values()];
  const fixed = definitions.find((candidate) => candidate.spawnPolicy !== 'dynamic'
    && candidate.runtimeId === reference.id.toString());
  if (fixed !== undefined) return resolution(fixed, fixed.id);

  const byRuntimeKind = definitions.find(
    (candidate) => (candidate.runtimeKind ?? candidate.id.slice('npc:'.length)) === reference.kind,
  );
  return resolution(byRuntimeKind, `npc:${reference.kind}`);
}

export function adminItemContentReference(
  registry: Pick<ContentRegistry, 'items'>,
  itemKind: string,
): AdminContentReferenceResolution {
  const definitionId = `item:${itemKind}`;
  return resolution(registry.items.get(definitionId), definitionId);
}
