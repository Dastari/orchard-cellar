import type {
  ContentRegistry,
  CropContentDefinition,
  ItemContentDefinition,
  SkillTreeContentDefinition,
} from '@orchard/sim';
import { bootstrapContentRegistry } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { describe, expect, it, vi } from 'vitest';
import {
  createClientContentArtSynchronizer,
  type ClientContentArtTarget,
} from './content-art-sync.js';
import type { LiveContentState } from './live-content.js';

const asset = (name: string): LoadedAsset => ({ name }) as LoadedAsset;
const bootstrap = bootstrapContentRegistry();
const bootstrapItem = bootstrap.items.get('item:pickaxe')!;
const bootstrapCrop = bootstrap.crops.get('crop:turnip')!;
const bootstrapTree = bootstrap.skillTrees.get('skill_tree:combat')!;
const bootstrapNode = bootstrapTree.nodes[0]!;

const item = (id: string, iconAsset: string, retired = false): ItemContentDefinition => ({
  ...bootstrapItem, id: `item:${id}`, icon: { asset: iconAsset }, retired,
});

const crop = (id: string, cropAsset: string, retired = false): CropContentDefinition => ({
  ...bootstrapCrop, id: `crop:${id}`, asset: cropAsset, retired,
});

const tree = (
  nodeId: string,
  iconAsset: string,
  retired = false,
): SkillTreeContentDefinition => ({
  ...bootstrapTree, id: `skill_tree:${nodeId}`, retired,
  nodes: [{ ...bootstrapNode, id: nodeId, iconAsset, connects: [] }],
});

function registry(
  contentHash: string,
  items: readonly ItemContentDefinition[],
  crops: readonly CropContentDefinition[],
  trees: readonly SkillTreeContentDefinition[],
): ContentRegistry {
  return {
    ...bootstrap,
    contentHash,
    items: new Map(items.map((definition) => [definition.id, definition])),
    crops: new Map(crops.map((definition) => [definition.id, definition])),
    skillTrees: new Map(trees.map((definition) => [definition.id, definition])),
  };
}

function state(contentRegistry: ContentRegistry, revision: bigint, status: LiveContentState['status'] = 'ready'): LiveContentState {
  return {
    source: 'live', status, registry: contentRegistry, issues: [],
    head: { packId: 'live', revision, contentHash: `rows-${revision}`, engineVersion: 1, definitionCount: 0 },
  };
}

function target(): ClientContentArtTarget {
  return {
    itemIcons: { pick: asset('item_base') },
    crops: { turnip: asset('crop_base') },
    uiSkin: { skillIcons: { readiness: asset('skill_base') } },
  };
}

describe('client active-content art synchronization', () => {
  const initial = registry('initial', [item('pick', 'item_base')], [crop('turnip', 'crop_base')], [
    tree('readiness', 'skill_base'),
  ]);

  it('deduplicates equal verified snapshots and skips invalid content', async () => {
    const load = vi.fn(async (name: string) => asset(name));
    const art = target();
    const synchronizer = createClientContentArtSynchronizer(art, initial, vi.fn(), load);
    const ready = state(initial, 1n);
    const first = synchronizer.synchronize(ready);
    const duplicate = synchronizer.synchronize(ready);

    expect(duplicate).toBe(first);
    await expect(first).resolves.toMatchObject({ status: 'unchanged', requested: 0 });
    await expect(synchronizer.synchronize(ready)).resolves.toMatchObject({ status: 'unchanged', requested: 0 });
    await expect(synchronizer.synchronize(state(initial, 2n, 'invalid')))
      .resolves.toMatchObject({ status: 'ignored', requested: 0 });
    expect(load).not.toHaveBeenCalled();
  });

  it('adds renamed aliases, updates changed art, and leaves failed or retired art intact', async () => {
    const next = registry('next', [
      item('pick', 'item_next'),
      item('renamed_pick', 'item_base'),
      item('retired_pick', 'item_retired', true),
    ], [
      crop('turnip', 'crop_next'),
      crop('renamed_turnip', 'crop_base'),
      crop('retired_turnip', 'crop_retired', true),
    ], [
      tree('readiness', 'skill_failed'),
      tree('renamed_readiness', 'skill_base'),
      tree('retired_readiness', 'skill_retired', true),
    ]);
    const art = target();
    const changed = vi.fn();
    const load = vi.fn(async (name: string) => {
      if (name === 'skill_failed') throw new Error('unavailable');
      return asset(name);
    });
    const synchronizer = createClientContentArtSynchronizer(art, initial, changed, load);

    await expect(synchronizer.synchronize(state(next, 2n))).resolves.toMatchObject({
      status: 'partial', requested: 6, applied: 5, failed: 1,
    });

    expect(art.itemIcons.pick?.name).toBe('item_next');
    expect(art.itemIcons.renamed_pick?.name).toBe('item_base');
    expect(art.itemIcons.retired_pick).toBeUndefined();
    expect(art.crops.turnip?.name).toBe('crop_next');
    expect(art.crops.renamed_turnip?.name).toBe('crop_base');
    expect(art.crops.retired_turnip).toBeUndefined();
    expect(art.uiSkin.skillIcons.readiness?.name).toBe('skill_base');
    expect(art.uiSkin.skillIcons.renamed_readiness?.name).toBe('skill_base');
    expect(art.uiSkin.skillIcons.retired_readiness).toBeUndefined();
    expect(load.mock.calls.map(([name]) => name).sort()).toEqual(['crop_next', 'item_next', 'skill_failed']);
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(synchronizer.synchronize(state(next, 2n))).resolves.toMatchObject({
      status: 'partial', requested: 0, applied: 0, failed: 1,
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not let a slower older revision overwrite later authored art', async () => {
    const waiting = new Map<string, (value: LoadedAsset) => void>();
    const load = vi.fn((name: string) => new Promise<LoadedAsset>((resolve) => waiting.set(name, resolve)));
    const art = target();
    const changed = vi.fn();
    const synchronizer = createClientContentArtSynchronizer(art, initial, changed, load);
    const second = registry('second', [item('pick', 'item_second')], [], []);
    const third = registry('third', [item('pick', 'item_third')], [], []);

    const older = synchronizer.synchronize(state(second, 2n));
    const later = synchronizer.synchronize(state(third, 3n));
    waiting.get('item_second')?.(asset('item_second'));
    await expect(older).resolves.toMatchObject({ status: 'stale', applied: 0 });
    expect(art.itemIcons.pick?.name).toBe('item_base');
    waiting.get('item_third')?.(asset('item_third'));
    await expect(later).resolves.toMatchObject({ status: 'applied', applied: 1 });
    expect(art.itemIcons.pick?.name).toBe('item_third');
    await expect(synchronizer.synchronize(state(second, 2n)))
      .resolves.toMatchObject({ status: 'stale', requested: 0 });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
