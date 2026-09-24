/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_ITEM_INKS, UI_ITEM_QUALITIES } from './tokens.js';
import { UI_SKIN_MANIFEST } from './skin/manifest.js';
import { uiContrastRatio } from './skin/contrast.js';

interface Source {
  size: [number, number];
  frames: Record<string, string[][]>;
  sourcePalette: Record<string, string>;
}

const panel = JSON.parse(readFileSync(new URL('../../../assets/ui/ui_orchard_tooltip_dark.sprite.json', import.meta.url), 'utf8')) as Source;

describe('dark item tooltip frame', () => {
  it('has a manifest frame for the neutral panel and every item quality', () => {
    for (const name of ['neutral', ...UI_ITEM_QUALITIES]) {
      const entry = UI_SKIN_MANIFEST.frame[`tooltip_dark.${name}` as keyof typeof UI_SKIN_MANIFEST.frame];
      expect(entry, name).toBeDefined();
      expect(panel.frames[entry.group]?.[entry.index], name).toBeDefined();
    }
  });

  it('keeps every ink at 4.5:1 or better against the authored face of every rim', () => {
    const inks = [...Object.values(UI_ITEM_INKS.quality), UI_ITEM_INKS.body, UI_ITEM_INKS.muted, UI_ITEM_INKS.equip, UI_ITEM_INKS.flavour, UI_ITEM_INKS.unmet];
    const [width, height] = panel.size;
    for (const [name, [grid]] of Object.entries(panel.frames)) {
      const face = panel.sourcePalette[grid![Math.floor(height / 2)]![Math.floor(width / 2)]!]!;
      for (const ink of inks) expect(uiContrastRatio(face, ink), `${name} ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
