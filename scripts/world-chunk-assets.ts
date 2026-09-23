import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { ContentRegistry } from '@orchard/sim';
import { HEARTH_RESOURCE_ASSET_NAMES } from '@orchard/engine/hearth-resource-art';
import { LEGACY_LANDMARK_ASSET_NAMES } from '@orchard/engine/legacy-landmark-assets';

/** Offline dependency inventory from the actual art loader. This is deliberately
 * conservative for terrain; per-biome trimming belongs to the asset pack lane. */
const artSource = ts.createSourceFile('overworld-art.ts', readFileSync(new URL('../packages/engine/src/overworld-art.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
export function chunkTerrainAssetIds(): readonly string[] {
  const result = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && node.text.startsWith('tile_cf_')) result.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(artSource);
  return [...result].sort();
}
function natureFamilies(): ReadonlyMap<string, readonly [string, number]> {
  const result = new Map<string, readonly [string, number]>();
  const fn = artSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadNatureDecorationArt');
  if (!fn) throw new Error('Nature asset loader changed; review chunk dependencies');
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 3) {
      const [kind, name, count] = node.elements;
      if (kind && name && count && ts.isStringLiteral(kind) && ts.isStringLiteral(name) && ts.isNumericLiteral(count)) result.set(kind.text, [name.text, Number(count.text)]);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  if (!result.size) throw new Error('Nature asset families unavailable');
  return result;
}
const nature = natureFamilies();
export function chunkDecorationAssetIds(kind: string, variant: number, registry: ContentRegistry): readonly string[] {
  const family = nature.get(kind === 'farm_flowers' ? 'nature_flower' : kind);
  if (family) return [`nature_cf_${family[0]}_${String(variant % family[1] + 1).padStart(2, '0')}`];
  const legacy = (LEGACY_LANDMARK_ASSET_NAMES as Readonly<Record<string, string>>)[kind];
  if (legacy) return [legacy];
  if (kind === 'fisher_fixed_line') return ['prop_cf_camp_fishing_rod'];
  if (kind === 'farm_tree_oak') return ['tree_cf_oak_mature'];
  if (kind.startsWith('farm_crop_')) {
    const crop = registry.crops.get(`crop:${kind.slice('farm_crop_'.length)}`);
    if (crop) return [crop.asset];
  }
  // These renderer branches use a composite actor or connected-object bank.
  if (kind === 'farm_cow') return [`wildlife_cf_cow_${String(variant % 9 + 1).padStart(2, '0')}`];
  if (kind === 'farm_fence') return ['prop_cf_willow_boundary_wood_large_connected'];
  if (kind === 'farm_gate') return ['prop_cf_fence_gate'];
  throw new Error(`Unmapped decoration asset dependency: ${kind}`);
}

const resourceAssetCache = new WeakMap<object, readonly string[]>();

/** Resource content stores renderer aliases (tree_oak, ore_gold), not always
 * atlas IDs. Follow the actual switch and loader naming before pack lookup. */
export function chunkResourceAssetIds(visual: import('@orchard/sim').ResourceContentDefinition['visual']): readonly string[] {
  const cached = resourceAssetCache.get(visual);
  if (cached) return cached;
  const names = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ts.isStringLiteral(node.initializer)) names.set(node.name.text, node.initializer.text);
    ts.forEachChild(node, visit);
  };
  const named = artSource.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(artSource) === 'MAP_EDITOR_ASSET_NAMES'));
  if (!named) throw new Error('Map art asset inventory changed');
  visit(named);
  const aliases = new Map<string, string>();
  const fn = artSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'authoredResourceAsset');
  if (!fn) throw new Error('Resource asset resolver changed');
  const cases = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      const ret = node.statements.find(ts.isReturnStatement);
      if (ret?.expression && ts.isPropertyAccessExpression(ret.expression)) {
        const asset = names.get(ret.expression.name.text);
        if (asset) aliases.set(node.expression.text, asset);
      }
    }
    ts.forEachChild(node, cases);
  };
  cases(fn);
  const resolveAlias = (alias: string): string => {
    const hearth = (HEARTH_RESOURCE_ASSET_NAMES as Readonly<Record<string, string>>)[alias];
    if (hearth) return hearth;
    const mapped = aliases.get(alias);
    if (mapped) return mapped;
    if (nature.has(alias)) return chunkDecorationAssetIds(alias, 0, {} as ContentRegistry)[0]!;
    if (['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'].includes(alias)) return `tree_cf_${alias.slice(5)}_fruiting`;
    const legacy = (LEGACY_LANDMARK_ASSET_NAMES as Readonly<Record<string, string>>)[alias];
    if (legacy) return legacy;
    throw new Error(`Unmapped resource visual alias: ${alias}`);
  };
  const result = new Set<string>();
  if (visual.kind === 'ore' && visual.variant !== 'fixed') {
    for (const variant of ['', '_pure_large', '_pure_medium', '_pure_small', '_pristine']) result.add(`resource_cf_${visual.asset}${variant}`);
  } else result.add(resolveAlias(visual.asset));
  for (const state of Object.values(visual.states ?? {})) result.add(resolveAlias(state[0]));
  if (visual.kind === 'tree' && ['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'].includes(visual.asset)) result.add('tree_cf_fruit_mature');
  const assets = [...result];
  resourceAssetCache.set(visual, assets);
  return assets;
}
