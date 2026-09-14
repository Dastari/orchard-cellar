import type { NpcContentDefinition } from './npc-definition.js';
import type { ContentRegistry } from './registry.js';

export interface NpcContentReference {
  readonly id?: bigint | string;
  readonly kind: string;
  readonly definitionId?: string;
}

/** Existing NPC rows retain their identity and kind. Authored unique runtime
 * kinds bind dynamic and pre-schema rows without copying or relocating them. */
export function runtimeNpcDefinition(
  registry: Pick<ContentRegistry, 'npcs'>,
  row: NpcContentReference | null | undefined,
): NpcContentDefinition | null {
  if (row == null) return null;
  const storedId = row.definitionId?.trim();
  if (storedId) {
    const exact = registry.npcs.get(storedId);
    return exact === undefined || exact.retired === true ? null : exact;
  }
  const definitions = [...registry.npcs.values()].filter((entry) => entry.retired !== true);
  return definitions.find((entry) => entry.spawnPolicy !== 'dynamic'
    && row.id !== undefined && entry.runtimeId === row.id.toString())
    ?? definitions.find((entry) => (entry.runtimeKind ?? entry.id.slice('npc:'.length)) === row.kind)
    ?? null;
}

export function runtimeNpcMount(
  registry: Pick<ContentRegistry, 'npcs'>,
  row: NpcContentReference | null | undefined,
): NonNullable<NpcContentDefinition['mount']> | null {
  return runtimeNpcDefinition(registry, row)?.mount ?? null;
}

/** Resolves the unique fixed authored horse from semantic mount and wildlife
 * capabilities. Definition ids, runtime kinds, species ids, and display names
 * remain authorable; ambiguous or retired registries fail closed. */
export function runtimeStarterHorseDefinition(
  registry: Pick<ContentRegistry, 'npcs'>,
): NpcContentDefinition | null {
  const definitions = [...registry.npcs.values()].filter((definition) => (
    definition.retired !== true
    && definition.spawnPolicy !== 'dynamic'
    && definition.mount?.adapter === 'horse'
    && definition.wildlifeProfile !== undefined
  ));
  return definitions.length === 1 ? definitions[0]! : null;
}
