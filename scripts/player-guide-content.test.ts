import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface Recipe {
  id: string;
  recipeKind: string;
  output: { item: string; count: number };
  inputs?: { item: string; count: number }[];
  pattern?: (string | null)[][];
  stationRequirement?: { objectTag: string };
  skillRequirement?: { skillNode: string; minimumRank: number };
  unlockHint?: { book: string };
}
interface Fact extends Recipe {
  ingredients: { item: string; count: number; name: string }[];
  materialsText: string;
  outputText: string;
  stationText: string;
  patternText: string;
  legendText: string;
}
const content = resolve('packages/assets/content');
const recipes: Recipe[] = JSON.parse(readFileSync(join(content, 'recipes.json'), 'utf8'));
const items: { id: string; displayName: string }[] = JSON.parse(readFileSync(join(content, 'items.json'), 'utf8'));
const names = new Map(items.map(item => [item.id, item.displayName]));
const temporary: string[] = [];
function run(directory = content) {
  // -S proves validation/CI needs only Python's standard library, not ReportLab.
  return spawnSync('python3', ['-I', '-S', resolve('scripts/render-player-guide.py'), '--facts-json', '--content-dir', directory], { encoding: 'utf8' });
}
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'orchard-guide-'));
  temporary.push(path);
  writeFileSync(join(path, 'items.json'), JSON.stringify(items));
  writeFileSync(join(path, 'recipes.json'), JSON.stringify(recipes));
  return path;
}
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('production guide crafting facts (BUG033)', () => {
  it('uses all eleven real recipes, names, outputs, stations, gates and occupied pattern cells', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const facts: Record<string, Fact> = JSON.parse(result.stdout);
    expect(Object.keys(facts)).toHaveLength(11);
    for (const [id, fact] of Object.entries(facts)) {
      const source = recipes.find(recipe => recipe.id === id)!;
      const counts = new Map<string, number>();
      const inputs = source.recipeKind === 'shaped'
        ? source.pattern!.flat().filter((item): item is string => item !== null).map(item => ({ item, count: 1 }))
        : source.inputs!;
      for (const { item, count } of inputs) counts.set(item, (counts.get(item) ?? 0) + count);
      expect(fact.ingredients).toEqual([...counts].map(([item, count]) => ({ item, count, name: names.get(item) })));
      expect(fact.output).toEqual(source.output);
      expect(fact.outputText).toBe(`${source.output.count} ${names.get(source.output.item)}`);
      expect(fact.materialsText).toBe([...counts].map(([item, count]) => `${count} ${names.get(item)}`).join(' + '));
      expect(fact.stationRequirement).toEqual(source.stationRequirement ?? null);
      expect(fact.skillRequirement).toEqual(source.skillRequirement ?? null);
      expect(fact.unlockHint).toEqual(source.unlockHint ?? null);
      expect(fact.pattern).toEqual(source.pattern ?? null);
      expect(fact.stationText).toBe(source.stationRequirement ? 'Workbench' : 'Handcraft (no station)');
    }
    const greenhouse = facts['recipe:greenhouse']!;
    expect(greenhouse.ingredients.map(({ count }) => count)).toEqual([5, 1, 2, 1]);
    expect(greenhouse.patternText).toBe('A A A\nA B A\nC D C');
    expect(greenhouse.legendText).toBe('A = Glass Pane · B = Iron Fittings · C = Timber Frame · D = Stone Foundation · dot = empty slot');
    expect(greenhouse.skillRequirement).toEqual({ skillNode: 'greenhouse_charter', minimumRank: 1 });
    expect(facts['recipe:iron_fittings']!.patternText).toBe('A . A\n. A .');
    expect(facts['recipe:stone_foundation']!.patternText).toBe('A A A\nA A A');
    expect(facts['recipe:timber_frame']!.patternText).toBe('A B A\nB . B\nA B A');
  });

  it('updates the PDF-facing text and grid when source counts, output, shape or names change', () => {
    const path = fixture();
    const changed = structuredClone(recipes);
    const greenhouse = changed.find(recipe => recipe.id === 'recipe:greenhouse')!;
    greenhouse.pattern![0]![0] = null;
    greenhouse.output.count = 2;
    const compost = changed.find(recipe => recipe.id === 'recipe:compost')!;
    compost.inputs![0]!.count = 7;
    writeFileSync(join(path, 'recipes.json'), JSON.stringify(changed));
    writeFileSync(join(path, 'items.json'), JSON.stringify(items.map(item => item.id === 'item:timber_frame' ? { ...item, displayName: 'Revised Frame' } : item)));
    const result = run(path);
    expect(result.status, result.stderr).toBe(0);
    const facts: Record<string, Fact> = JSON.parse(result.stdout);
    expect(facts['recipe:greenhouse']!.materialsText).toBe('4 Glass Pane + 1 Iron Fittings + 2 Revised Frame + 1 Stone Foundation');
    expect(facts['recipe:greenhouse']!.outputText).toBe('2 Greenhouse');
    expect(facts['recipe:greenhouse']!.patternText).toBe('. A A\nA B A\nC D C');
    expect(facts['recipe:compost']!.materialsText).toBe('7 Pomace + 1 Fiber');
  });

  it.each(['recipe', 'item', 'station'])('fails clearly instead of rendering stale facts for a missing %s reference', kind => {
    const path = fixture();
    if (kind === 'recipe') writeFileSync(join(path, 'recipes.json'), JSON.stringify(recipes.filter(recipe => recipe.id !== 'recipe:greenhouse')));
    if (kind === 'item') writeFileSync(join(path, 'items.json'), JSON.stringify(items.filter(item => item.id !== 'item:timber_frame')));
    if (kind === 'station') {
      const changed = structuredClone(recipes);
      changed.find(recipe => recipe.id === 'recipe:greenhouse')!.stationRequirement = { objectTag: 'station.unknown' };
      writeFileSync(join(path, 'recipes.json'), JSON.stringify(changed));
    }
    const result = run(path);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/guide content:.*(recipe:greenhouse|item:timber_frame|station.unknown)/);
    expect(result.stderr).not.toContain('reportlab');
  });
});
