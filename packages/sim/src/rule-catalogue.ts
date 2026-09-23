import { ContentParseError } from './content/parse-contract.js';

/** Authored rule schema. No content/bootstrap imports: safe at parser boundaries. */
export const RULE_KINDS = ['raised', 'transition', 'shore', 'blob47', 'lane', 'patch', 'connect4'] as const;
export type RuleKind = typeof RULE_KINDS[number];
/** D6 authored traversal medium; capability checks remain a separate runtime lane. */
export const RULE_MEDIA = ['land', 'shallow_water', 'deep_water', 'lava', 'shroom_water', 'void'] as const;
export type RuleMedium = typeof RULE_MEDIA[number];
export type RuleTransform = 0 | 1 | 2 | 3 | 'flipX';
export interface RuleFrame {
  readonly assetId: string;
  readonly frame: number;
  readonly transform?: RuleTransform;
}
export type RuleRole = { readonly unavailable: string; readonly medium?: RuleMedium } | {
  readonly frame: RuleFrame;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  readonly medium?: RuleMedium;
  readonly variants: readonly (RuleFrame & { readonly weight: number })[];
  readonly seasonalRemaps: Readonly<Record<string, RuleFrame>>;
};
export interface RuleFamilyIdentity { readonly id: string; readonly kind: RuleKind }
export interface RuleMaskEntry {
  readonly mask: number;
  /** Relevant bits; omitted means the full topology. First match wins. */
  readonly matchMask?: number;
  readonly roles: readonly string[];
}
export interface RuleLayer {
  readonly masks: readonly RuleMaskEntry[];
  readonly fallback: readonly string[];
}
export interface AvailableRuleFamily extends RuleFamilyIdentity {
  readonly topology: 'cardinal' | 'eight-way';
  readonly neighbourPredicate: 'same-family' | 'connects-to' | 'matching-tags';
  readonly members: { readonly definitionIds: readonly string[]; readonly assetIds: readonly string[]; readonly tags: readonly string[]; readonly exactAssetIds: readonly string[] };
  /** First matching entry wins; fallback roles are attempted in listed order. */
  readonly masks: readonly RuleMaskEntry[];
  /** Independently resolved overlays, after the base layer. */
  readonly layers?: readonly RuleLayer[];
  readonly fallback: readonly string[];
  readonly roles: Readonly<Record<string, RuleRole>>;
  readonly transforms: readonly RuleTransform[];
  readonly smart: { readonly halo: number; readonly formations: readonly string[] };
  readonly compatibleFamilies: readonly string[];
}
export type RuleFamily = AvailableRuleFamily | (RuleFamilyIdentity & { readonly unavailable: string });
export interface RuleCatalogue { readonly schemaVersion: 1; readonly families: readonly RuleFamily[] }

function invalid(path: string, reason: string): never { throw new ContentParseError('invalid_type', path, `rule_catalogue_invalid: ${reason}`); }
function record(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) invalid(path, 'expected object');
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(v)) if (!allowed.includes(key)) invalid(`${path}.${key}`, 'unknown field');
}
function text(v: unknown, path: string): string { if (typeof v !== 'string' || !v.trim()) invalid(path, 'expected nonempty string'); return v; }
function list(v: unknown, path: string): readonly unknown[] { if (!Array.isArray(v)) invalid(path, 'expected array'); return v; }
function strings(v: unknown, path: string): readonly string[] {
  const a = list(v, path).map((x, i) => text(x, `${path}[${i}]`));
  if (new Set(a).size !== a.length) invalid(path, 'duplicate entry'); return a;
}
function integer(v: unknown, path: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) invalid(path, 'invalid integer'); return v;
}
function bool(v: unknown, path: string): boolean { if (typeof v !== 'boolean') invalid(path, 'expected boolean'); return v; }
function choice<T extends string | number>(v: unknown, values: readonly T[], path: string): T {
  if (!values.includes(v as T)) invalid(path, 'unsupported value'); return v as T;
}
function frame(v: unknown, path: string, weighted = false): RuleFrame & { weight?: number } {
  const r = record(v, path); keys(r, ['assetId', 'frame', 'transform', ...(weighted ? ['weight'] : [])], path);
  const result = { assetId: text(r.assetId, `${path}.assetId`), frame: integer(r.frame, `${path}.frame`),
    ...(r.transform === undefined ? {} : { transform: choice(r.transform, [0, 1, 2, 3, 'flipX'] as const, `${path}.transform`) }) };
  if (!weighted) return result;
  const weight = integer(r.weight, `${path}.weight`); if (weight === 0) invalid(path, 'weight must be positive');
  return { ...result, weight };
}
function role(v: unknown, path: string): RuleRole {
  const r = record(v, path);
  if ('unavailable' in r) { keys(r, ['unavailable', 'medium'], path); return { unavailable: text(r.unavailable, `${path}.unavailable`), ...(r.medium === undefined ? {} : { medium: choice(r.medium, RULE_MEDIA, `${path}.medium`) }) }; }
  keys(r, ['frame', 'blocksMovement', 'blocksLight', 'medium', 'variants', 'seasonalRemaps'], path);
  const seasons = record(r.seasonalRemaps, `${path}.seasonalRemaps`);
  return { ...(r.medium === undefined ? {} : { medium: choice(r.medium, RULE_MEDIA, `${path}.medium`) }), frame: frame(r.frame, `${path}.frame`), blocksMovement: bool(r.blocksMovement, `${path}.blocksMovement`), blocksLight: bool(r.blocksLight, `${path}.blocksLight`),
    variants: list(r.variants, `${path}.variants`).map((v, i) => frame(v, `${path}.variants[${i}]`, true) as RuleFrame & { weight: number }),
    seasonalRemaps: Object.fromEntries(Object.entries(seasons).map(([key, v]) => [key, frame(v, `${path}.seasonalRemaps.${key}`)])) };
}
function family(v: unknown, path: string): RuleFamily {
  const r = record(v, path); const id = text(r.id, `${path}.id`);
  const kind = choice(r.kind, RULE_KINDS, `${path}.kind`);
  if ('unavailable' in r) { keys(r, ['id', 'kind', 'unavailable'], path); return { id, kind, unavailable: text(r.unavailable, `${path}.unavailable`) }; }
  keys(r, ['id', 'kind', 'topology', 'neighbourPredicate', 'members', 'masks', 'fallback', 'roles', 'transforms', 'smart', 'compatibleFamilies', 'layers'], path);
  const topology = choice(r.topology, ['cardinal', 'eight-way'] as const, `${path}.topology`);
  if (kind === 'connect4' && topology !== 'cardinal') invalid(path, 'connect4 requires cardinal topology');
  const m = record(r.members, `${path}.members`); keys(m, ['definitionIds', 'assetIds', 'tags', 'exactAssetIds'], `${path}.members`);
  const members = { definitionIds: strings(m.definitionIds, `${path}.members.definitionIds`), assetIds: strings(m.assetIds, `${path}.members.assetIds`), tags: strings(m.tags, `${path}.members.tags`), exactAssetIds: strings(m.exactAssetIds, `${path}.members.exactAssetIds`) };
  if (members.exactAssetIds.some(id => !members.assetIds.includes(id))) invalid(path, 'exact assets must be members');
  const roles = Object.fromEntries(Object.entries(record(r.roles, `${path}.roles`)).map(([key, v]) => [key, role(v, `${path}.roles.${key}`)]));
  const maximumMask = topology === 'cardinal' ? 15 : 255;
  function layer(value: Record<string, unknown>, layerPath: string): RuleLayer {
    const masks = list(value.masks, `${layerPath}.masks`).map((v, i) => {
      const p = `${layerPath}.masks[${i}]`; const m = record(v, p);
      keys(m, ['mask', 'matchMask', 'roles'], p);
      const mask = integer(m.mask, `${p}.mask`, maximumMask);
      const matchMask = m.matchMask === undefined ? maximumMask : integer(m.matchMask, `${p}.matchMask`, maximumMask);
      if ((mask & matchMask) !== mask) invalid(p, 'mask contains ignored bits');
      return { mask, ...(m.matchMask === undefined ? {} : { matchMask }), roles: strings(m.roles, `${p}.roles`) };
    });
    if (new Set(masks.map(m => `${m.mask}/${m.matchMask ?? maximumMask}`)).size !== masks.length) invalid(layerPath, 'duplicate mask');
    const fallback = strings(value.fallback, `${layerPath}.fallback`);
    for (const id of [...fallback, ...masks.flatMap(m => m.roles)]) if (!Object.prototype.hasOwnProperty.call(roles, id)) invalid(layerPath, `unknown role ${id}`);
    return { masks, fallback };
  }
  const { masks, fallback } = layer(r, path);
  const layers = r.layers === undefined ? undefined : list(r.layers, `${path}.layers`).map((v, i) => {
    const p = `${path}.layers[${i}]`; const entry = record(v, p); keys(entry, ['masks', 'fallback'], p); return layer(entry, p);
  });
  const transforms = list(r.transforms, `${path}.transforms`).map(v => choice(v, [0, 1, 2, 3, 'flipX'] as const, `${path}.transforms`));
  if (!transforms.length || new Set(transforms).size !== transforms.length) invalid(path, 'transforms must be nonempty and unique');
  for (const value of Object.values(roles)) if (!('unavailable' in value)) for (const f of [value.frame, ...value.variants, ...Object.values(value.seasonalRemaps)]) if (!transforms.includes(f.transform ?? 0)) invalid(path, 'frame transform not allowed');
  const smart = record(r.smart, `${path}.smart`); keys(smart, ['halo', 'formations'], `${path}.smart`);
  return { id, kind, topology, neighbourPredicate: choice(r.neighbourPredicate, ['same-family', 'connects-to', 'matching-tags'] as const, `${path}.neighbourPredicate`), members, masks, fallback, roles, transforms, ...(layers === undefined ? {} : { layers }),
    smart: { halo: integer(smart.halo, `${path}.smart.halo`, 64), formations: strings(smart.formations, `${path}.smart.formations`) }, compatibleFamilies: strings(r.compatibleFamilies, `${path}.compatibleFamilies`) };
}
export function parseRuleCatalogue(value: unknown): RuleCatalogue {
  const r = record(value, '$'); keys(r, ['schemaVersion', 'families'], '$');
  if (r.schemaVersion !== 1) invalid('$.schemaVersion', 'unsupported version');
  const families = list(r.families, '$.families').map((v, i) => family(v, `$.families[${i}]`));
  const ids = new Set(families.map(f => f.id)); if (ids.size !== families.length) invalid('$.families', 'duplicate family');
  for (const f of families) if (!('unavailable' in f)) for (const id of f.compatibleFamilies) if (!ids.has(id)) invalid('$.families', `unknown compatible family ${id}`);
  // Exact identities must not change family when content rows are reordered.
  for (const key of ['definitionIds', 'assetIds'] as const) {
    const owners = new Map<string, string>();
    for (const f of families) if (f.kind === 'connect4' && !('unavailable' in f)) {
      for (const member of f.members[key]) {
        const previous = owners.get(member);
        if (previous !== undefined) invalid('$.families', `ambiguous ${key} member ${member}: ${previous}, ${f.id}`);
        owners.set(member, f.id);
      }
    }
  }
  return { schemaVersion: 1, families };
}
export interface ResolvedRuleFrame extends RuleFrame { readonly role: string; readonly blocksMovement: boolean; readonly blocksLight: boolean }
/** Deterministic first available role, then seasonal override or weighted variant.
 * Entropy is supplied by the caller (for example a stable cell hash), never RNG. */
export function resolveRuleFrame(family: RuleFamily, mask: number, entropy = 0, season?: string): ResolvedRuleFrame | null {
  if ('unavailable' in family) return null;
  return resolveLayerFrame(family, family, mask, entropy, season);
}
function resolveLayerFrame(family: AvailableRuleFamily, layer: RuleLayer, mask: number, entropy: number, season?: string): ResolvedRuleFrame | null {
  const normalized = mask & (family.topology === 'cardinal' ? 15 : 255);
  for (const id of [...(layer.masks.find(m => (normalized & (m.matchMask ?? (family.topology === 'cardinal' ? 15 : 255))) === m.mask)?.roles ?? []), ...layer.fallback]) {
    const role = family.roles[id]; if (!role || 'unavailable' in role) continue;
    let selected = role.frame;
    if (season !== undefined && role.seasonalRemaps[season]) selected = role.seasonalRemaps[season]!;
    else if (role.variants.length) {
      const total = role.variants.reduce((sum, v) => sum + v.weight, 0);
      let cursor = (entropy >>> 0) % total;
      for (const variant of role.variants) { if (cursor < variant.weight) { selected = variant; break; } cursor -= variant.weight; }
    }
    return { assetId: selected.assetId, frame: selected.frame, ...(selected.transform === undefined ? {} : { transform: selected.transform }), role: id, blocksMovement: role.blocksMovement, blocksLight: role.blocksLight };
  }
  return null;
}

/** Base followed by each independently selected overlay; transparent bases are valid. */
export function resolveRuleLayers(family: RuleFamily, mask: number, entropy = 0, season?: string): readonly ResolvedRuleFrame[] {
  if ('unavailable' in family) return [];
  return [family, ...(family.layers ?? [])].flatMap(layer => {
    const frame = resolveLayerFrame(family, layer, mask, entropy, season);
    return frame === null ? [] : [frame];
  });
}
