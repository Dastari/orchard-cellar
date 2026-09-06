import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** CPU source-image preprocessing is permitted; world, lightmap and present
 * surfaces must remain write-only. Keep the existing source readers explicit
 * so a new readback cannot hide in a broad file exclusion. */
const CPU_SOURCE_READERS: Readonly<Record<string, readonly string[]>> = {
  'engine/overworld-art.ts': [
    'stoneContext.getImageData(0, 0, source.width, source.height)',
    'sourceContext.getImageData(0, 0, source.width, source.height)',
    'context.getImageData(0, 0, frame.width, frame.height)',
  ],
  'engine/light-occlusion.ts': ['context.getImageData(0, 0, frame.width, frame.height)'],
};
function sources(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return sources(url);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      && !entry.name.endsWith('-review.ts') ? [url] : [];
  });
}
describe('world surfaces stay write-only', () => {
  it('greps every runtime Canvas/WebGL source for unreviewed pixel readbacks', () => {
    for (const workspace of ['engine', 'client', 'ui']) {
      for (const url of sources(new URL(`../../${workspace}/src/`, import.meta.url))) {
        let source = readFileSync(url, 'utf8');
        const relative = `${workspace}/${url.pathname.split(`/packages/${workspace}/src/`)[1]}`;
        for (const reader of CPU_SOURCE_READERS[relative] ?? []) {
          expect(source.split(reader).length - 1, `${relative}: ${reader}`).toBe(1);
          source = source.replace(reader, 'CPU_SOURCE_PIXEL_PREPROCESSING');
        }
        expect(source, relative).not.toMatch(/\b(?:readPixels|getImageData)\s*\(/);
        if (CPU_SOURCE_READERS[relative]) {
          expect(source.match(/willReadFrequently:\s*true/g)?.length).toBe(CPU_SOURCE_READERS[relative]!.length);
        }
      }
    }
  });
});
