/** Add reviewed catalogue entries after their native crops and shapes exist.
 * Existing items and objects are preserved; every catalogue recipe is (re)written
 * as its shaped pattern and each item's resale is capped at 80% of the sale value
 * of its materials (no craft-and-sell loop). Run content:export afterwards. */
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HEARTH_FURNITURE_SHAPES, type ItemContentDefinition, type ObjectContentDefinition,
  type RecipeContentDefinition, type ShopContentDefinition } from '@orchard/sim';
import { HEARTH_FURNITURE_CATALOGUE, hearthFurniturePattern } from './hearth-furniture-catalogue.js';
import crops from './hearth-furniture-crops.json' with { type: 'json' };
const root = resolve(import.meta.dirname, '../../..');
const directory = resolve(root, 'packages/assets/content');
async function read<T>(file: string): Promise<T[]> { return JSON.parse(await readFile(resolve(directory, `${file}.json`), 'utf8')) as T[]; }
const items = await read<ItemContentDefinition>('items'), objects = await read<ObjectContentDefinition>('objects');
const recipes = await read<RecipeContentDefinition>('recipes'), shops = await read<ShopContentDefinition>('shops');
const itemIds = new Set(items.map(item => item.id)), objectIds = new Set(objects.map(object => object.id));
const base = (id: string) => objects.find(object => object.id === `object:${id}`)!;
const storage = new Set(['townhouse_wardrobe', 'rustic_bookshelf', 'rustic_cupboard', 'townhouse_bookcase', 'townhouse_cabinet']);
const lamps = new Set(['rustic_standing_lamp', 'townhouse_floor_lamp', 'rustic_hearth']);
const offers = new Set(shops.find(shop => shop.id === 'shop:willow_furnisher')!.offers.map(offer => offer.item));
for (const entry of HEARTH_FURNITURE_CATALOGUE) {
  const kind = `furniture_${entry.suffix}`, itemId = `item:${kind}` as const, objectId = `object:${kind}` as const;
  const recipeId = `recipe:${kind}` as const, planId = `item:${kind}_plan` as const;
  const shape = HEARTH_FURNITURE_SHAPES[kind];
  if (!shape) throw new Error(`Review placement shape first: ${kind}`);
  await access(resolve(root, `packages/assets/props/prop_cf_${kind}.sprite.json`));
  if (!itemIds.has(itemId)) items.push({ id: itemId, kind: 'item', schemaVersion: 1, displayName: entry.displayName,
    icon: { asset: `prop_cf_${kind}` }, quality: 'common', maxStack: 16,
    tags: ['item.placeable', 'item.crafted', 'furniture', `furniture.${entry.style}`],
    economy: { buy: entry.priceBronze, sell: Math.floor(entry.priceBronze / 4) }, onUse: [] });
  if (!objectIds.has(objectId)) {
    const template = storage.has(entry.suffix) ? base('furniture_rustic_chest')
      : lamps.has(entry.suffix) ? base('furniture_townhouse_table_lamp')
      : entry.suffix === 'rustic_cooking_range' ? base('campfire') : base('furniture_rustic_chair');
    const footprint = Array.from({ length: shape.height }, () => Array.from({ length: shape.width }, () => 15));
    const light = crops.entries.find(crop => crop.suffix === entry.suffix)?.light;
    objects.push({ ...template, id: objectId, displayName: entry.displayName, components: {
      ...template.components,
      identity: { tags: [...new Set(['furniture', 'item.placeable', ...(template.components.identity?.tags ?? [])])] },
      sprite: { asset: `prop_cf_${kind}`, ...(entry.suffix === 'rustic_cooking_range' ? { animationByState: { default: 'off', lit: 'burn' } } : {}) },
      ...(light && template.components.light ? { light: { ...template.components.light, offsetY: light.offsetY,
        radiusTiles: light.radiusTiles, profile: light.profile === 'flame' ? 'flicker' as const : 'steady' as const } } : {}),
      collision: { footprint, blocksMovement: shape.base !== undefined, occludesLight: false },
      placement: { item: itemId, layer: shape.layer === 'standing' ? 'object' : 'overlay', spaces: ['residence'], facing: false, footprint, requiresRole: 'builder' },
    } });
  }
  const pattern = hearthFurniturePattern(entry);
  const recipe: RecipeContentDefinition = { id: recipeId, kind: 'recipe', schemaVersion: 1,
    output: { item: itemId, count: 1 }, stationRequirement: { objectTag: 'station.workbench' }, unlockHint: { book: planId },
    recipeKind: 'shaped', pattern };
  const existing = recipes.findIndex(row => row.id === recipeId);
  if (existing >= 0) recipes[existing] = recipe; else recipes.push(recipe);
  const saleValue = pattern.flat().reduce((sum, cell) => sum + (cell === null ? 0 : items.find(item => item.id === cell)!.economy.sell), 0);
  const itemIndex = items.findIndex(row => row.id === itemId);
  const item = items[itemIndex]!;
  items[itemIndex] = { ...item, economy: { ...item.economy, sell: Math.max(1, Math.floor(saleValue * 0.8)) } };
  if (!itemIds.has(planId)) items.push({ id: planId, kind: 'item', schemaVersion: 1,
    displayName: `${entry.displayName} Plan`, icon: { asset: 'icon_cf_marlow_book' }, quality: 'common', maxStack: 1,
    tags: ['item.document', 'furniture.plan'], economy: { buy: Math.ceil(entry.priceBronze / 20) * 10, sell: 0 },
    onUse: [{ id: 'read', verb: 'secondary', prompt: 'LEARN PLAN', conditions: [], effects: [{ learnRecipes: [recipeId] }, { consumeSelected: 1 }] }] });
  offers.add(itemId); offers.add(planId);
}
const nextShops = shops.map(shop => shop.id === 'shop:willow_furnisher' ? { ...shop, offers: [...offers].map(item => ({ item })) } : shop);
for (const [file, definitions] of [['items', items], ['objects', objects], ['recipes', recipes], ['shops', nextShops]] as const) {
  await writeFile(resolve(directory, `${file}.json`), JSON.stringify([...definitions].sort((a, b) => a.id.localeCompare(b.id)), null, 2) + '\n');
}
console.log('Authored reviewed base furniture catalogue; run content:export and validate before use.');
