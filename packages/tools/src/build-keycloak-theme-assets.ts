import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { decodePng, encodePng, type DecodedPng } from './assets/png.js';

const workspace = path.resolve(import.meta.dirname, '../../..');
const sourceRoot = path.join(workspace, 'references/art/kenmi/cute-fantasy/ui');
const targetRoot = path.join(workspace, 'ops/orchard-auth/themes/orchard/login/resources');

async function crop(source: string, target: string, x: number, y: number, width: number, height: number): Promise<void> {
  const image: DecodedPng = decodePng(await readFile(source));
  if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
    throw new Error(`Crop ${target} falls outside ${source}`);
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * image.width + x) * 4;
    rgba.set(image.rgba.subarray(start, start + width * 4), row * width * 4);
  }
  await writeFile(target, encodePng(width, height, rgba));
}

await mkdir(path.join(targetRoot, 'img'), { recursive: true });
await mkdir(path.join(targetRoot, 'fonts'), { recursive: true });
await Promise.all([
  crop(path.join(sourceRoot, 'UI/UI_Frames.png'), path.join(targetRoot, 'img/panel-wood.png'), 915, 4, 42, 41),
  crop(path.join(sourceRoot, 'UI/UI_Frames.png'), path.join(targetRoot, 'img/panel-parchment.png'), 1064, 8, 32, 32),
  crop(path.join(sourceRoot, 'UI/UI_Buttons.png'), path.join(targetRoot, 'img/button-neutral.png'), 0, 0, 32, 16),
  crop(path.join(sourceRoot, 'UI/UI_Buttons.png'), path.join(targetRoot, 'img/button-confirm.png'), 0, 96, 32, 16),
  crop(path.join(sourceRoot, 'UI/UI_Buttons.png'), path.join(targetRoot, 'img/button-deny.png'), 0, 240, 32, 16),
  crop(path.join(sourceRoot, 'UI/UI_Ribbons.png'), path.join(targetRoot, 'img/banner.png'), 97, 0, 78, 21),
  copyFile(path.join(sourceRoot, 'Fonts/CuteFantasy-5x9.ttf'), path.join(targetRoot, 'fonts/orchard-ui.ttf')),
]);

// Ship the same generated world image locally: login must not depend on the
// game origin being available, and Keycloak keeps production resource caching.
const island = await readFile(path.join(workspace, 'packages/client/public/ui/island-background.png'));
const islandVersion = createHash('sha256').update(island).digest('hex').slice(0, 16);
const islandFilename = `island-background-${islandVersion}.png`;
await writeFile(path.join(targetRoot, 'img/island-background.png'), island);
await writeFile(path.join(targetRoot, 'img', islandFilename), island);
const cssPath = path.join(targetRoot, 'css/orchard.css');
const originalCss = await readFile(cssPath, 'utf8');
const imageReference = /island-background(?:-[a-f0-9]{16})?\.png/gu;
if ([...originalCss.matchAll(imageReference)].length !== 1) {
  throw new Error('Expected exactly one island image in Keycloak CSS');
}
const css = originalCss.replace(imageReference, islandFilename);
const cssVersion = createHash('sha256').update(css).digest('hex').slice(0, 16);
const cssFilename = `orchard-${cssVersion}.css`;
await writeFile(cssPath, css);
await writeFile(path.join(targetRoot, 'css', cssFilename), css);
const propertiesPath = path.join(targetRoot, '../theme.properties');
const properties = await readFile(propertiesPath, 'utf8');
const styleLines = properties.match(/^styles=.*$/gm);
if (styleLines?.length !== 1) throw new Error('Expected exactly one Keycloak theme styles declaration');
const styles = styleLines[0]!.slice('styles='.length).split(/\s+/u)
  .filter((entry) => !/^css\/orchard(?:-[a-f0-9]{16})?\.css$/u.test(entry));
await writeFile(propertiesPath, properties.replace(/^styles=.*$/m,
  `styles=${[...styles, `css/${cssFilename}`].join(' ')}`));

console.log(`Built Keycloak theme art in ${path.relative(workspace, targetRoot)}`);
