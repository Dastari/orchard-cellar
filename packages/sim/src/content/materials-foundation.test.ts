import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';

// Owner decisions Craft-D2 / Prog-D1 (2026-09-24): every crafting material with icon art is
// in the game, even before it has a world source (tagged material.pending_source).
const registry = bootstrapContentRegistry();
const items = [...registry.items.values()];
const iconOf = (id: string) => registry.items.get(id as never)?.icon?.asset;
const spriteExists = (asset: string) => ['ui', 'props'].some((dir) =>
  existsSync(new URL(`../../../assets/${dir}/${asset}.sprite.json`, import.meta.url)));

describe('materials foundation', () => {
  it('shows Fiber as fiber, not the bone it was cut from (BUG-035)', () => {
    expect(iconOf('item:fiber')).toBe('icon_material_fiber');
    expect(iconOf('item:fiber')).not.toBe(iconOf('item:bone'));
    expect(iconOf('item:fiber')).not.toBe('item_cf_fiber');
  });

  it('gives every material a distinct, existing icon', () => {
    const materials = items.filter((item) => item.tags.some((tag) => tag.startsWith('material.')));
    for (const item of materials) expect(spriteExists(item.icon!.asset), item.id).toBe(true);
    const pending = materials.filter((item) => item.tags.includes('material.pending_source'));
    expect(pending.length).toBeGreaterThan(0);
    expect(new Set(pending.map((item) => item.icon!.asset)).size).toBe(pending.length);
  });

  it('gives every pending-source material a use in a recipe or process', () => {
    const recipes = [...registry.recipes.values()];
    const used = new Set(recipes.flatMap((recipe) => recipe.recipeKind === 'shaped'
      ? recipe.pattern.flat().filter((cell): cell is string => cell !== null)
      : recipe.inputs.map((input) => input.item)));
    for (const process of registry.processes.values()) used.add(process.input.item);
    const unused = items.filter((item) => item.tags.includes('material.pending_source') && !used.has(item.id)).map((item) => item.id);
    // Raw drops that feed planned alchemy, enchanting and gear recipes (Magic and Journeyman trees).
    expect(unused.sort()).toEqual([
      'item:animal_fat', 'item:arcane_essence', 'item:beeswax', 'item:bone', 'item:chitin', 'item:ember_essence',
      'item:feather', 'item:salt', 'item:scale', 'item:shell', 'item:sinew', 'item:slime_gel', 'item:warden_heartstone',
    ]);
  });
});
