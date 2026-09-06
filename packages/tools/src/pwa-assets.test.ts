import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaSplashBackground } from './build-pwa-assets.js';
import { decodePng, hexToRgba } from './assets/png.js';

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


describe('native island splash rendering', () => {
  const source = { width: 4, height: 2, rgba: Uint8Array.from([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    130, 140, 150, 255, 160, 170, 180, 255, 190, 200, 210, 255, 220, 230, 240, 255,
  ]) };
  const tinted = (pixel: number): readonly number[] => [16, 24, 19].map((tint, channel) => (
    Math.round(source.rgba[pixel * 4 + channel]! * 0.82 + tint * 0.18)
  )).concat(255);

  it('center-crops portrait cover and preserves nearest-neighbor source pixels with the shared tint', () => {
    const actual = pwaSplashBackground(source, 4, 4);
    const expectedPixels = [1, 1, 2, 2, 1, 1, 2, 2, 5, 5, 6, 6, 5, 5, 6, 6];
    expect([...actual]).toEqual(expectedPixels.flatMap(tinted));
  });

  it('covers landscape without stretching or letterboxing', () => {
    expect([...pwaSplashBackground(source, 8, 2)]).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    ].flatMap(tinted));
    expect(() => pwaSplashBackground(source, 0, 2)).toThrow('Invalid PWA splash dimensions');
  });

  it.each([[640, 1136], [1136, 640]] as const)('commits island pixels and the original centered apple at %i×%i', async (width, height) => {
    const island = decodePng(await readFile(path.join(clientRoot, 'public/ui/island-background.png')));
    const splash = decodePng(await readFile(path.join(clientRoot, `public/pwa/splash/${width}x${height}.png`)));
    expect([splash.width, splash.height]).toEqual([width, height]);
    const background = pwaSplashBackground(island, width, height);
    for (const pixel of [0, width - 1, width * (height - 1), width * height - 1]) {
      expect([...splash.rgba.slice(pixel * 4, pixel * 4 + 4)]).toEqual([...background.slice(pixel * 4, pixel * 4 + 4)]);
    }
    const apple = JSON.parse(await readFile(path.join(workspace, 'packages/assets/ui/icon_resource_fruit.sprite.json'), 'utf8')) as {
      frames: { base: readonly (readonly string[])[] };
    };
    const palette = JSON.parse(await readFile(path.join(workspace, 'packages/assets/palette.json'), 'utf8')) as {
      colors: Readonly<Record<string, string>>;
    };
    const rows = apple.frames.base[0]!;
    const scale = Math.max(4, Math.floor(Math.min(width, height) * 0.18 / 16));
    const left = Math.floor((width - rows[0]!.length * scale) / 2);
    const top = Math.floor((height - rows.length * scale) / 2);
    for (const [y, row] of rows.entries()) for (const [x, symbol] of [...row].entries()) {
      if (symbol === '.') continue;
      const pixel = ((top + y * scale) * width + left + x * scale) * 4;
      expect([...splash.rgba.slice(pixel, pixel + 4)]).toEqual([...hexToRgba(palette.colors[symbol]!)]);
    }
  });
});
