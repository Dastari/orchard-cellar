import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

const CLIENT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_ONLY_MARKERS = [
  'context.player.findRecipe',
  'AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS',
] as const;

describe('selected-item lifecycle bundle boundary', () => {
  it('ships metadata but no server callback implementation', async () => {
    const built = await build({
      root: CLIENT_ROOT,
      logLevel: 'silent',
      build: { write: false },
    });
    const bundle = (Array.isArray(built) ? built : [built])
      .flatMap((output) => ('output' in output ? output.output : []))
      .map((entry) => {
        if (entry.type === 'chunk') return entry.code;
        if (typeof entry.source === 'string') return entry.source;
        return new TextDecoder().decode(entry.source);
      })
      .join('\n');

    expect(bundle).toContain('item:apple.on_use');
    for (const marker of SERVER_ONLY_MARKERS) expect(bundle).not.toContain(marker);
  }, 15_000);
});
