import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

it('keeps ambient item IDs out of world authority and preflights semantic outputs before writes', () => {
  expect(source).not.toMatch(/['"]pebble['"]/u);
  expect(source).not.toMatch(/['"]fiber['"]/u);

  const cellar = between('function applyDigCellarTileLifecycle(', 'function applyHarvestResourceLifecycle(');
  const cellarResolution = cellar.indexOf('runtimeItemKindForUniqueTag(registry, CELLAR_WALL_OUTPUT_ITEM_TAG)');
  expect(cellarResolution).toBeGreaterThanOrEqual(0);
  expect(cellar.indexOf("throw new SenderError('ambient_output_content_missing')", cellarResolution))
    .toBeGreaterThan(cellarResolution);
  expect(cellar.indexOf('spendToolVigour(', cellarResolution)).toBeGreaterThan(cellarResolution);
  expect(cellar).toContain('itemKind: wallOutputKind!');

  const farming = between('function applyFarmToolUse(', 'function applyFarmTileRestore(');
  const farmResolution = farming.indexOf('runtimeItemKindForUniqueTag(registry, SOIL_TILL_OUTPUT_ITEM_TAG)');
  expect(farmResolution).toBeGreaterThanOrEqual(0);
  expect(farming.indexOf("throw new SenderError('ambient_output_content_missing')", farmResolution))
    .toBeGreaterThan(farmResolution);
  expect(farming.indexOf('spendToolVigour(', farmResolution)).toBeGreaterThan(farmResolution);
  expect(farming).toContain('insertPlayerCarriedItem(ctx, tillOutputKind!, 1)');
  expect(farming).toContain('itemKind: tillOutputKind!');
  expect(farming).toContain("'items_obtained', 1n, clock.authorityTick, tillOutputKind!");
});
