import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './assets/png.js';

const root = resolve(import.meta.dirname, '../../..');
const theme = resolve(root, 'ops/orchard-auth/themes/orchard/login');
const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

describe('Keycloak island background packaging', () => {
  it('packages the same generated island as the client using immutable local asset names', async () => {
    const canonical = await readFile(resolve(root, 'packages/client/public/ui/island-background.png'));
    const image = decodePng(canonical);
    expect(image.width).toBeGreaterThan(1_000);
    expect(image.height).toBeGreaterThan(500);
    expect(await readFile(resolve(theme, 'resources/img/island-background.png'))).toEqual(canonical);
    const imageName = `island-background-${digest(canonical)}.png`;
    expect(await readFile(resolve(theme, 'resources/img', imageName))).toEqual(canonical);
    const css = await readFile(resolve(theme, 'resources/css/orchard.css'), 'utf8');
    expect(css).toContain(`url("../img/${imageName}") center / cover no-repeat`);
    const cssName = `orchard-${digest(css)}.css`;
    expect(await readFile(resolve(theme, 'resources/css', cssName), 'utf8')).toBe(css);
    const properties = await readFile(resolve(theme, 'theme.properties'), 'utf8');
    expect(properties).toContain(`styles=css/styles.css css/${cssName}\n`);
    expect(properties).toContain('parent=keycloak.v2\n');
  });

  it('keeps the backdrop fixed behind readable forms without remote image dependencies', async () => {
    const css = await readFile(resolve(theme, 'resources/css/orchard.css'), 'utf8');
    const background = css.match(/\.login-pf body::before \{([^}]+)\}/u)?.[1];
    expect(background).toContain('position: fixed;');
    expect(background).toContain('inset: 0;');
    expect(background).toContain('pointer-events: none;');
    expect(background).toContain('rgba(16, 24, 19, 0.18)');
    expect(css).not.toContain('.login-pf body::after');
    expect(css).not.toContain('data:image/svg+xml');
    expect(css).not.toMatch(/url\(["']?https?:/u);
    expect(css).toContain('font-family: var(--orchard-body-font);');
    expect(css).toContain('background: var(--orchard-paper);');
  });
});
