import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workspace = path.resolve(import.meta.dirname, '../../..');
const clientRoot = path.join(workspace, 'packages/client');

describe('PWA install assets', () => {
  it('keeps every declared icon and Apple startup image present in public output', async () => {
    const html = await readFile(path.join(clientRoot, 'index.html'), 'utf8');
    const styles = await readFile(path.join(clientRoot, 'src/style.css'), 'utf8');
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
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('id="pwa-update-status"');
    const shellRule = styles.match(/(?:^|\n)#game-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(shellRule).toContain('--game-safe-area-bottom: env(safe-area-inset-bottom, 0px)');
    expect(shellRule).not.toContain('padding:');
    expect(styles).toMatch(/@media \(display-mode: standalone\), \(display-mode: fullscreen\)[\s\S]*height: 100vh/);
    expect(styles).toContain('html.installed-web-app #game-shell');

    const publicPaths = [
      ...startupImages,
      ...manifest.icons.map((icon) => icon.src),
      '/pwa/icons/apple-touch-icon.png',
    ];
    await Promise.all(publicPaths.map((publicPath) => access(path.join(clientRoot, 'public', publicPath.slice(1)))));
  });
});
