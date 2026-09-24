import type { SupportedContentKind } from './content/definitions.js';

export const STUDIO_SCOPES = ['map', 'tilesets', 'objects', 'items_economy', 'frames',
  'narrative', 'actors', 'loot_progression', 'world_rules', 'audio', 'art',
  'scripts.author', 'scripts.approve', 'operate.players', 'operate.world',
  'operate.membership', 'observe'] as const;
export type StudioScope = typeof STUDIO_SCOPES[number];
export const CONTENT_KIND_SCOPE: Readonly<Record<SupportedContentKind, StudioScope>> = {
  item: 'items_economy', recipe: 'items_economy', shop: 'items_economy',
  process: 'objects', object: 'objects', resource: 'objects', tileset: 'tilesets',
  progression: 'loot_progression', frame: 'frames', loot: 'loot_progression', npc: 'actors', dialogue: 'narrative', quest: 'narrative',
  world_rules: 'world_rules', balance: 'world_rules', balance_group: 'world_rules', crop: 'world_rules',
  creature: 'actors', spawn: 'actors', enemy: 'actors', encounter: 'actors',
  space: 'map', skill_tree: 'loot_progression', effect: 'loot_progression',
  statistic: 'loot_progression', upgrade: 'loot_progression', loadout: 'items_economy', gear: 'items_economy',
};
export const CONTENT_SCOPES = [...new Set(Object.values(CONTENT_KIND_SCOPE))];
export const STUDIO_ROLE_PRESETS: Readonly<Record<string, readonly StudioScope[]>> = {
  owner: STUDIO_SCOPES,
  admin: STUDIO_SCOPES.filter(s => !s.startsWith('scripts.')),
  content_editor: [...CONTENT_SCOPES, 'observe'],
  support: ['operate.players', 'observe'], moderator: ['operate.players', 'operate.membership', 'observe'], friend: [],
};
export interface ScopeMembership { readonly role: string; readonly blocked: boolean; readonly revokedAt: unknown }
export interface ScopeGrant { readonly revokedAt: unknown }
export interface ScopeOverride { readonly scope: string; readonly revokedAt: unknown }
export function isStudioScope(value: string): value is StudioScope {
  return (STUDIO_SCOPES as readonly string[]).includes(value);
}
/** Additive migration: absent overrides are exactly the legacy authority. */
export function resolveStudioScopes(member: ScopeMembership | null, editor: ScopeGrant | null,
  support: ScopeGrant | null, overrides: readonly ScopeOverride[] = []): readonly StudioScope[] {
  if (member === null || member.blocked || member.revokedAt !== undefined) return [];
  if (member.role === 'owner') return STUDIO_SCOPES;
  const scopes = new Set<StudioScope>(STUDIO_ROLE_PRESETS[member.role] ?? []);
  if (editor !== null && editor.revokedAt === undefined) {
    // Content space definitions were writable; live maps retain a separate legacy check.
    for (const scope of STUDIO_ROLE_PRESETS['content_editor']!) scopes.add(scope);
  }
  if (support !== null && support.revokedAt === undefined) {
    for (const scope of STUDIO_ROLE_PRESETS['support']!) scopes.add(scope);
  }
  for (const grant of overrides) if (isStudioScope(grant.scope)) {
    if (grant.revokedAt === undefined) scopes.add(grant.scope); else scopes.delete(grant.scope);
  }
  return STUDIO_SCOPES.filter(scope => scopes.has(scope));
}
export function requireContentScopes(scopes: readonly StudioScope[], kinds: readonly string[]): void {
  for (const kind of kinds) {
    const scope = Object.prototype.hasOwnProperty.call(CONTENT_KIND_SCOPE, kind) ? CONTENT_KIND_SCOPE[kind as SupportedContentKind] : undefined;
    if (scope === undefined || !scopes.includes(scope)) throw new Error(`studio_scope_required:${scope ?? kind}`);
  }
}
export function requireScriptApproval(scopes: readonly StudioScope[], actor: string, author: string): void {
  if (!scopes.includes('scripts.approve')) throw new Error('studio_scope_required:scripts.approve');
  if (actor === author) throw new Error('script_self_approval_forbidden');
}
