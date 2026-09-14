/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { humanoidShadowContactY } from './overworld-art.js';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../assets/characters/${name}.sprite.json`, import.meta.url), 'utf8')) as {
  anchor: [number, number]; bakedShadowColor: string; sourcePalette: Record<string, string>; frames: Record<string, string[][]>;
};
describe('authored humanoid shadow contract', () => {
  it('selects only the exact black shadow, retaining Fin’s translucent fishing effects', () => {
    for (const name of ['player_cf_base', 'action_cf_base', 'npc_cf_bartender_bruno', 'npc_cf_farmer_bob', 'npc_cf_fisherman_fin', 'avatar_cf_farmer', 'avatar_cf_farmer_axe']) {
      const asset = load(name);
      expect(asset.bakedShadowColor).toBe('#00000064');
      expect(Object.values(asset.sourcePalette)).toContain(asset.bakedShadowColor);
    }
    expect(Object.values(load('npc_cf_fisherman_fin').sourcePalette)).toEqual(expect.arrayContaining(['#00cdf947', '#00cdf987']));
  });
  it('grounds the shared rig and each merchant at the neutral opaque shoes, above shadow padding', () => {
    for (const name of ['player_cf_base', 'npc_cf_bartender_bruno', 'npc_cf_farmer_bob', 'npc_cf_fisherman_fin']) {
      const asset = load(name), rows = asset.frames['idle_down']![0]!;
      const lastBodyRow = rows.findLastIndex((row) => [...row].some((key) => key !== '.' && asset.sourcePalette[key] !== asset.bakedShadowColor));
      expect(humanoidShadowContactY(100)).toBe(100 + lastBodyRow + 1 - asset.anchor[1]);
    }
  });
});
