import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { copyUiPublic } from './copy-ui-public.js';

it('builds Studio symbols independently and refreshes copies from one source', async () => {
  const path = await mkdtemp(join(tmpdir(), 'orchard-ui-copy-'));
  const root = pathToFileURL(`${path}/`);
  try {
    const source = new URL('packages/ui/public/ui/lucide/', root);
    await mkdir(source, { recursive: true });
    await writeFile(new URL('map.svg', source), '<svg/>');
    await copyUiPublic(['studio'], root);
    const studio = new URL('packages/studio/public/ui/lucide/map.svg', root);
    const client = new URL('packages/client/public/ui/lucide/map.svg', root);
    expect(await readFile(studio, 'utf8')).toBe('<svg/>');
    await expect(readFile(client)).rejects.toThrow();
    await writeFile(new URL('map.svg', source), '<svg>updated</svg>');
    await copyUiPublic(undefined, root);
    expect(await readFile(studio, 'utf8')).toBe('<svg>updated</svg>');
    expect(await readFile(client, 'utf8')).toBe('<svg>updated</svg>');
  } finally { await rm(path, { recursive: true, force: true }); }
});
