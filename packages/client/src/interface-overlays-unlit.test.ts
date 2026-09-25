import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Owner UI fix item 2: selection reticles and target markers are interface, so the
// classic and basic lighting passes (which multiply over the whole world) must run
// before them. The unified model lights each receiver as it draws instead.
const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const renderFrame = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderFrame');
const body = renderFrame!.getText(source);
const position = (call: string): number => {
  const index = body.indexOf(`${call}(`);
  expect(index, call).toBeGreaterThan(-1);
  return index;
};

describe('interface overlays are drawn after world lighting', () => {
  it.each(['drawSelectedEntityMarker', 'drawInteractionTileReticle', 'drawBowAimGuide', 'drawCollisionOverlay'])(
    '%s follows the classic and basic lighting composites', (overlay) => {
      expect(position(overlay)).toBeGreaterThan(position('lightmap.composite'));
      expect(position(overlay)).toBeGreaterThan(position('compositeBasicLighting'));
    });

  it('still lights weather before the composite', () => {
    expect(position('weatherEffects.drawWind')).toBeLessThan(position('lightmap.composite'));
  });
});
