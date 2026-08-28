import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workspace = path.resolve(import.meta.dirname, '../../..');
const clientRoot = path.join(workspace, 'packages/client');

describe('PWA install assets', () => {
  it('keeps every declared icon and Apple startup image present in public output', async () => {
    const html = await readFile(path.join(clientRoot, 'index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(clientRoot, 'public/manifest.webmanifest'), 'utf8')) as {
      readonly display: string;
      readonly icons: readonly { readonly src: string; readonly purpose: string }[];
    };
    const startupImages = [...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)"/g)]
      .map((match) => match[1]!);
    expect(startupImages).toHaveLength(38);
    expect(new Set(startupImages).size).toBe(startupImages.length);
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    const publicPaths = [
      ...startupImages,
      ...manifest.icons.map((icon) => icon.src),
      '/pwa/icons/apple-touch-icon.png',
    ];
    await Promise.all(publicPaths.map((publicPath) => access(path.join(clientRoot, 'public', publicPath.slice(1)))));
  });
});
