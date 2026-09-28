import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// BUG-061 (owner approved 2026-09-28): Basic lighting keeps object light. The painters gather light sources in every
// lighting mode, Basic draws them as hard-edged pools in its one multiply pass, and the Full modes are untouched.
const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('overworld-main.ts', main, ts.ScriptTarget.Latest, true);
const renderFrame = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'renderFrame')!.getText(source);

describe('BUG-061 wiring', () => {
  it('gathers light sources in every lighting mode, Basic included', () => {
    expect(main).toMatch(/\n\s+collectLights: true,\n/u);
    for (const painter of ['gameplay-painter-decorations.ts', 'gameplay-painter-players.ts', 'gameplay-painter-resources.ts']) {
      const text = readFileSync(new URL(`./${painter}`, import.meta.url), 'utf8');
      expect(text, painter).not.toMatch(/\bdynamicLighting\b/u);
      expect(text, painter).toMatch(/\bcollectLights\b/u);
    }
  });

  it('gives Basic the steady light for render-tick flicker (held torches, dropped lit items), so it never repaints per frame', () => {
    for (const painter of ['gameplay-painter-players.ts', 'gameplay-painter-resources.ts']) {
      const text = readFileSync(new URL(`./${painter}`, import.meta.url), 'utf8');
      expect(text, painter).toContain('visualTickClock.renderTick');
      expect(text, painter).toMatch(/radiusTiles: (equippedLight|itemLight)\.radiusTiles \+ flicker\.radiusOffset,\n\s+steady: \{ radiusTiles: \1\.radiusTiles, strengthPerMille: 1000 \},/u);
    }
  });

  it('draws Basic through the object-light pools, with no debug switch left in production', () => {
    const basic = renderFrame.slice(renderFrame.indexOf('if (!dynamicLighting) {'), renderFrame.indexOf('} else if (!seasonalDynamic) {'));
    expect(basic).toContain('basicObjectLight.composite(context, frame.layout.width, frame.layout.height, scale, cameraX, cameraY, frameAmbient, pointLights);');
    expect(basic).not.toContain('compositeBasicLighting(');
    expect(main).not.toMatch(/setBasicObjectLight|basicObjectLightEnabled/u);
  });

  it('leaves the Full modes as they were: the Classic lightmap and the seasonal receivers', () => {
    expect(renderFrame).toContain(`} else if (!seasonalDynamic) {
    // Original one-pass lightmap: baked sprite shadows plus object illumination.
    lightmap.composite(context, cameraX, cameraY, scale);`);
    expect(renderFrame).toContain('if (!lightingEffectsDisabled) {');
    expect(renderFrame).toContain('celestialPass.renderer!.compositeFlameGlows(context, pointLights, scale);');
  });
});
