import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

describe('bootstrap dependency boundaries', () => {
  it('loads the object parser without loading the parent definition dispatcher', async () => {
    vi.resetModules();
    const dispatcher = vi.fn(() => { throw new Error('leaf object parser loaded its parent dispatcher'); });
    vi.doMock('../packages/sim/src/content/definitions.js', dispatcher);
    try {
      const { parseObjectDefinition } = await import('../packages/sim/src/content/object-definition.js');
      const { ContentParseError } = await import('../packages/sim/src/content/parse-contract.js');
      expect(() => parseObjectDefinition({ schemaVersion: 2 })).toThrow(ContentParseError);
      expect(dispatcher).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../packages/sim/src/content/definitions.js');
      vi.resetModules();
    }
  });

  it('imports the complete sim package without constructing a ContentRegistry', async () => {
    vi.resetModules();
    const build = vi.fn(() => { throw new Error('registry construction during module initialization'); });
    vi.doMock('../packages/sim/src/content/registry.js', async (importOriginal) => ({
      ...await importOriginal<typeof import('../packages/sim/src/content/registry.js')>(),
      buildContentRegistry: build,
    }));
    try {
      const sim = await import('../packages/sim/src/index.js');
      expect(sim.survivalAuthoredLandmarkDecorations().length).toBeGreaterThan(0);
      expect(build).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../packages/sim/src/content/registry.js');
      vi.resetModules();
    }
  });

  it.each([
    '../survival-world.ts',
    './bootstrap-registry.ts',
    './registry.ts',
    '../terrain-tilesets.ts',
    '../map-document-v3.ts',
    '../index.ts',
  ])('can initialize %s first in a fresh ESM process', (entry) => {
    const url = new URL(`../packages/sim/src/content/${entry}`, import.meta.url).href;
    const bootstrap = new URL('../packages/sim/src/content/bootstrap-registry.ts', import.meta.url).href;
    const spaces = new URL('../packages/sim/src/content/bootstrap-spaces.ts', import.meta.url).href;
    const survival = new URL('../packages/sim/src/survival-world.ts', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--import', 'tsx', '--input-type=module', '--eval', `
        import assert from 'node:assert/strict';
        await import(${JSON.stringify(url)});
        const { bootstrapContentRegistry } = await import(${JSON.stringify(bootstrap)});
        const { BOOTSTRAP_SPACE_DEFINITIONS } = await import(${JSON.stringify(spaces)});
        const generator = await import(${JSON.stringify(survival)});
        const registry = bootstrapContentRegistry();
        const { BOOTSTRAP_COMPILED_CONTENT } = await import(
          ${JSON.stringify(new URL('../packages/sim/src/content/bootstrap-projection.ts', import.meta.url).href)}
        );
        assert.deepEqual(BOOTSTRAP_COMPILED_CONTENT, registry.compiled);
        const space = BOOTSTRAP_SPACE_DEFINITIONS.find(({ id }) => id === 'space:island');
        assert.deepEqual(space, registry.spaces.get('space:island'));
        assert(Object.isFrozen(space.landmarks[0].decorations));
        assert.deepEqual(generator.survivalAuthoredLandmarkDecorations(),
          generator.generateSurvivalLandmarkDecorations(space.landmarks));
        process.stdout.write('ok');
      `,
    ], { encoding: 'utf8', timeout: 15_000 });
    expect(output).toBe('ok');
  });
});
