import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import type { AssetSource } from './types.js';

const workspace = path.resolve(import.meta.dirname, '../../../..');
const skillIconRoot = path.join(workspace, 'packages/assets/ui');

describe('skill icon coverage', () => {
  it('provides one licensed native icon for every skill-tree node', async () => {
    const expectedNames = SKILL_NODE_DEFINITIONS.map((node) => `icon_skill_${node.id}`).sort();
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
      expect(source.sourceRegion?.slice(2)).toEqual([16, 16]);
      expect(source.tags).toEqual(expect.arrayContaining([
        'ui.icon',
        'ui.skill',
        `skill.${nodeId}`,
        'source.clockwork_raven',
      ]));
      expect(source.approved).toBe(true);
    }));
  });
});
