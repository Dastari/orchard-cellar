import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  STUDIO_CANVAS_UI_ICONS,
  uiIconFileName,
} from '@orchard/ui';

const LUCIDE_DIRECTORY = new URL('../../public/ui/lucide/', import.meta.url);

describe('Studio Canvas shell icon asset contract', () => {
  it('ships every semantic icon in the exact shell preload manifest', () => {
    expect(new Set(STUDIO_CANVAS_UI_ICONS).size).toBe(STUDIO_CANVAS_UI_ICONS.length);
    for (const icon of STUDIO_CANVAS_UI_ICONS) {
      const fileName = uiIconFileName(icon);
      const asset = new URL(fileName, LUCIDE_DIRECTORY);
      expect(
        statSync(fileURLToPath(asset)).isFile(),
        `missing Canvas shell icon ${icon}: public/ui/lucide/${fileName}`,
      ).toBe(true);
      expect(
        readFileSync(asset, 'utf8'),
        `invalid Canvas shell icon ${icon}: public/ui/lucide/${fileName}`,
      ).toMatch(/<svg(?:\s|>)/u);
    }
  });

  it('keeps the collision semantic bound to the reviewed shield-x asset', () => {
    expect(STUDIO_CANVAS_UI_ICONS).toContain('collision');
    expect(uiIconFileName('collision')).toBe('shield-x.svg');
  });
});
