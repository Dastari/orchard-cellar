import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/** Static world S7b: Studio materialises its own publications, so the materializer must bundle for the
 * browser (no Node builtins, no TypeScript compiler, never the world module's reducer entry). */
describe('world chunk materializer is browser-safe', () => {
  it('bundles for the browser from its Studio entry', async () => {
    const result = await build({
      entryPoints: [new URL('./materialize.ts', import.meta.url).pathname],
      bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter(input => /^node:|\/typescript\/|packages\/world\/src\/index\.ts$|spacetimedb/u.test(input))).toEqual([]);
    expect(inputs.some(input => input.endsWith('packages/world/src/content/live-island-composition.ts'))).toBe(true);
  }, 60_000);
});
