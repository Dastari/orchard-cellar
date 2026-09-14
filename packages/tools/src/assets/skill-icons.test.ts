import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import type { AssetSource } from './types.js';

const workspace = path.resolve(import.meta.dirname, '../../../..');
const skillIconRoot = path.join(workspace, 'packages/assets/ui');
const derivedSources: Readonly<Record<string, string>> = {
  farmcraft: 'item_cf_apple', mining_endurance: 'prop_cf_anvil', fishing_endurance: 'item_cf_fishing_rod',
};

describe('skill icon coverage', () => {
  it('provides one approved icon with explicit source provenance for every skill-tree node', async () => {
    const expectedNames = SKILL_NODE_DEFINITIONS.map((node) => node.iconAsset).sort();
    const iconFiles = (await readdir(skillIconRoot))
      .filter((name) => /^icon_skill_.+\.sprite\.json$/.test(name))
      .sort();

    expect(iconFiles).toEqual(expectedNames.map((name) => `${name}.sprite.json`));

    await Promise.all(iconFiles.map(async (fileName) => {
      const source = JSON.parse(
        await readFile(path.join(skillIconRoot, fileName), 'utf8'),
      ) as AssetSource;
      const nodeId = source.name.replace(/^icon_skill_/, '');
      expect(source.size).toEqual([16, 16]);
      const derivedSource = derivedSources[nodeId];
      if (derivedSource === undefined) expect(source.sourceRegion?.slice(2)).toEqual([16, 16]);
      else {
        const original = JSON.parse(await readFile(
          path.join(workspace, 'packages/assets/props', `${derivedSource}.sprite.json`), 'utf8',
        )) as AssetSource;
        expect(original.approved).toBe(true);
        expect(source.sourcePath).toBe(original.sourcePath);
      }
      expect(source.tags).toEqual(expect.arrayContaining([
        'ui.icon',
        'ui.skill',
        `skill.${nodeId}`,
        derivedSource === undefined ? 'source.clockwork_raven' : `source.asset.${derivedSource}`,
      ]));
      if (nodeId === 'farmcraft') {
        expect(source.sourcePath).toBe('references/art/kenmi/cute-fantasy/core/Crops/Fruit_Trees_Fruit_Objects.png');
        expect(source.sourceRegion).toEqual([16, 0, 16, 16]);
      }
      expect(source.approved).toBe(true);
    }));
  });
});
