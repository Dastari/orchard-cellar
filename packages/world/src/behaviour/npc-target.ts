import { runtimeCreatureDefinition, runtimeHearthEnemyDefinition, runtimeNpcDefinition, type ContentRegistry } from '@orchard/sim';

/** world_npc stores both authored NPCs and profile-backed creatures/enemies.
 * Resolve the active definition that owns the row before dispatching an item
 * action. Missing/retired content must still fail closed. */
export function npcBehaviourDefinitionId(
  registry: ContentRegistry,
  npc: { readonly id: bigint; readonly kind: string; readonly definitionId?: string },
  profiles: {
    readonly wildlife: { readonly species: string } | null;
    readonly outdoor: { readonly enemyKind: string } | null;
    readonly rogue: object | null;
  },
): string | null {
  const authored = runtimeNpcDefinition(registry, npc);
  if (authored !== null) return authored.id;
  if (npc.definitionId?.trim()) return null;
  if ([...registry.npcs.values()].some(definition => (
    definition.retired === true
    && ((definition.spawnPolicy !== 'dynamic' && definition.runtimeId === npc.id.toString())
      || (definition.runtimeKind ?? definition.id.slice('npc:'.length)) === npc.kind)
  ))) return null;
  if (profiles.outdoor !== null) {
    return runtimeHearthEnemyDefinition(registry, profiles.outdoor.enemyKind)?.definitionId ?? null;
  }
  if (profiles.rogue !== null) {
    const definitions = [...registry.enemies.values()].filter(definition => (
      definition.retired !== true
      && (definition.npcKind === npc.kind || definition.aliases?.includes(npc.kind) === true)
    ));
    return definitions.length === 1 ? definitions[0]!.id : null;
  }
  return profiles.wildlife === null ? null
    : runtimeCreatureDefinition(registry, profiles.wildlife.species)?.id ?? null;
}
