import { resolveObjectDefinitionAppearance } from './object-archetype.js';
import type { StateValue } from '../behaviour/effects.js';
import type { ContentRegistry } from './registry.js';
import type {
  ObjectCarryComponent,
  ObjectContentDefinition,
  ObjectDamageableComponent,
} from './object-definition.js';

export interface ObjectContentReference {
  readonly kind: string;
  /** Empty/omitted values identify rows created before authored object identity. */
  readonly definitionId?: string;
  readonly stateJson?: string;
  readonly open?: boolean;
  readonly lit?: boolean;
}

const OBJECT_ID_PATTERN = /^object:[a-z0-9]+(?:_[a-z0-9]+)*$/u;

/** Resolves an explicit durable definition exactly and fails closed if it is
 * invalid, missing, or retired. Pre-schema rows retain the legacy kind edge,
 * with an authored placement-item edge as the compatibility fallback. */
export function runtimeObjectDefinition(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectContentReference,
): ObjectContentDefinition | null {
  const storedId = reference.definitionId?.trim() ?? '';
  if (storedId.length > 0) {
    if (!OBJECT_ID_PATTERN.test(storedId)) return null;
    const exact = registry.objects.get(storedId);
    return exact !== undefined && exact.retired !== true ? exact : null;
  }

  const legacyId = `object:${reference.kind}`;
  const legacy = registry.objects.get(legacyId);
  if (legacy !== undefined && legacy.retired !== true) return legacy;

  const itemId = `item:${reference.kind}`;
  const candidates = [...registry.objects.values()].filter((candidate) => (
    candidate.retired !== true && candidate.components.placement?.item === itemId
  ));
  return candidates.length === 1 ? candidates[0]! : null;
}

export function runtimeObjectDamageable(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectContentReference,
): ObjectDamageableComponent | null {
  return runtimeObjectDefinition(registry, reference)?.components.damageable ?? null;
}

export function runtimeObjectCarry(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectContentReference,
): ObjectCarryComponent | null {
  return runtimeObjectDefinition(registry, reference)?.components.carry ?? null;
}

export interface RuntimeFixedCombatTargetPlan {
  readonly id: bigint;
  readonly definition: ObjectContentDefinition;
  readonly damageable: Extract<ObjectDamageableComponent, { readonly model: 'health' }>;
  readonly kind: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
}

/** Resolves the complete active fixed-target set. A bad space edge, coordinate,
 * runtime ID or duplicate claim invalidates the set before a caller writes. */
export function runtimeFixedCombatTargetPlans(
  registry: Pick<ContentRegistry, 'objects' | 'spaces'>,
): readonly RuntimeFixedCombatTargetPlan[] | null {
  const authorities = [...registry.objects.values()].filter(definition => definition.retired !== true
    && definition.components.identity?.tags.includes('combat.training'));
  if (authorities.length !== 1) return null;
  const authority = authorities[0]!;
  const authorityDamageable = authority.components.damageable;
  if (authorityDamageable?.model !== 'health' || authorityDamageable.fixedTargets === undefined) return null;
  const plans: RuntimeFixedCombatTargetPlan[] = [];
  const ids = new Set<bigint>();
  for (const [runtimeId, spaceDefinitionId, tileX, tileY] of authorityDamageable.fixedTargets) {
      const space = registry.spaces.get(spaceDefinitionId);
      if (space === undefined || space.retired === true
        || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)
        || tileX < 0 || tileY < 0 || tileX >= space.sizeTiles || tileY >= space.sizeTiles) return null;
      let id: bigint;
      try { id = BigInt(runtimeId); } catch { return null; }
      if (id < 0n || id > 0xffff_ffff_ffff_ffffn || ids.has(id)) return null;
      ids.add(id);
      plans.push(Object.freeze({
        id,
        definition: authority,
        damageable: authorityDamageable,
        kind: authority.id.slice('object:'.length),
        spaceId: space.spaceId,
        tileX,
        tileY,
      }));
  }
  return Object.freeze(plans);
}

/** Resolves the stable chest capability through the active placement item.
 * Durable object IDs may be renamed without changing custody/open behaviour.
 * Explicit missing/retired object or item definitions fail closed; blank
 * pre-schema rows retain the normal legacy object-resolution edge. */
export function runtimeChestObjectDefinition(
  registry: Pick<ContentRegistry, 'objects' | 'items'>,
  reference: ObjectContentReference,
): ObjectContentDefinition | null {
  const definition = runtimeObjectDefinition(registry, reference);
  const itemId = definition?.components.placement?.item;
  const item = itemId === undefined ? undefined : registry.items.get(itemId);
  return definition !== null && definition.components.container !== undefined
    && item !== undefined && item.retired !== true && item.tags.includes('container.chest')
    ? definition : null;
}

/** Resolves a presentation/interaction role without coupling a fixture to a
 * definition id. Both the active object and its active placement item must
 * author the role; ambiguous roles fail closed. */
export function runtimePlaceableObjectDefinitionByTag(
  registry: Pick<ContentRegistry, 'objects' | 'items'>,
  tag: string,
): ObjectContentDefinition | null {
  const candidates = [...registry.objects.values()].filter((candidate) => {
    if (candidate.retired === true || !candidate.components.identity?.tags.includes(tag)) return false;
    const itemId = candidate.components.placement?.item;
    const item = itemId === undefined ? undefined : registry.items.get(itemId);
    return item !== undefined && item.retired !== true && item.tags.includes(tag);
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Occupied cells for a bottom-centred authored object. Even widths extend
 * right of the anchor, matching homesteadBuildFootprintTiles and world art. */
export function runtimeObjectFootprintTiles(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectContentReference & { readonly tileX: number; readonly tileY: number },
  component: 'collision' | 'placement' = 'collision',
): readonly { readonly tileX: number; readonly tileY: number }[] {
  const definition = runtimeObjectDefinition(registry, reference);
  if (definition === null) return [];
  const state: Record<string, StateValue> = {};
  if (reference.stateJson !== undefined) {
    try {
      const decoded: unknown = JSON.parse(reference.stateJson);
      if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)) {
        for (const [name, value] of Object.entries(decoded)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') state[name] = value;
        }
      }
    } catch { /* Invalid storage retains the base footprint. */ }
  }
  if (!reference.definitionId?.trim()) {
    if (reference.open !== undefined) state.open = reference.open;
    if (reference.lit !== undefined) state.lit = reference.lit;
  }
  const footprint = (component === 'collision'
    ? resolveObjectDefinitionAppearance(definition, state).collision?.footprint
    : definition.components.placement?.footprint)
    ?? definition.components.collision?.footprint ?? [[15]];
  const width = footprint[0]?.length ?? 1;
  const startX = reference.tileX - Math.floor((width - 1) / 2);
  const startY = reference.tileY - footprint.length + 1;
  return footprint.flatMap((row, y) => row.flatMap((mask, x) => mask === 0 ? []
    : [{ tileX: startX + x, tileY: startY + y }]));
}

export function runtimeObjectOccupiesTile(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: ObjectContentReference & { readonly tileX: number; readonly tileY: number },
  tile: { readonly tileX: number; readonly tileY: number },
): boolean {
  return runtimeObjectFootprintTiles(registry, reference)
    .some(cell => cell.tileX === tile.tileX && cell.tileY === tile.tileY);
}
