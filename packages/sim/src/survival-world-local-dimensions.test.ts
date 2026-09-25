import { describe, expect, it } from 'vitest';
import * as survivalDimensions from './survival-dimensions.js';
import source from './survival-world.ts?raw';

/** Static-world S6a moved the survival dimensions into a generator-free leaf.
 * The island generator reads them in its per-tile loops; referencing the
 * imported bindings directly there turns each read into a module-namespace
 * getter call under Vitest's SSR transform, which cost the whole-map
 * generator (and every test that builds the topside collision) about 28%.
 * The generator therefore imports the leaf as a namespace and reads plain
 * module-local copies. This keeps it that way. */
describe('survival-world reads the leaf dimensions through local constants', () => {
  it('takes no named bindings from the dimensions leaf', () => {
    const imports = [...source.matchAll(/^import\s+([^;]*?)\s+from\s+'\.\/survival-dimensions\.js'/gm)]
      .map((match) => match[1]);
    expect(imports).toEqual(['* as survivalDimensions']);
  });

  it('copies every dimension it reads into a same-named module-local constant', () => {
    const referenced = Object.keys(survivalDimensions)
      .filter((name) => new RegExp(`\\b${name}\\b`).test(source.replaceAll(`survivalDimensions.${name}`, '')));
    expect(referenced).toContain('SURVIVAL_WORLD_SIZE');
    for (const name of referenced) {
      expect(source, name).toContain(`const ${name} = survivalDimensions.${name};`);
    }
  });
});
