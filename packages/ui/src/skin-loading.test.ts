import { SKILL_NODE_DEFINITIONS, type ContentRegistry, type SkillTreeContentDefinition } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadGeneratedAsset = vi.hoisted(() => vi.fn(async (name: string) => ({ name })));
vi.mock('./assets.js', () => ({ loadGeneratedAsset }));

import { createGeneratedContentAssetRequests, createSkillNodeArtRequests, loadGameplayUiSkin, loadUiIconSet } from './skin.js';

class ControlledImage {
  static readonly instances: ControlledImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = '';

  constructor() { ControlledImage.instances.push(this); }
}

describe('UI skin loading boundaries', () => {
  afterEach(() => {
    ControlledImage.instances.length = 0;
    loadGeneratedAsset.mockClear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('builds the gameplay skin without constructing any Lucide image', async () => {
    class ForbiddenImage { constructor() { throw new Error('lucide_not_allowed'); } }
    vi.stubGlobal('Image', ForbiddenImage);

    const skin = await loadGameplayUiSkin();

    expect(skin.icons).toBeUndefined();
    expect(loadGeneratedAsset).toHaveBeenCalled();
    for (const node of SKILL_NODE_DEFINITIONS) {
      expect(loadGeneratedAsset).toHaveBeenCalledWith(node.iconAsset, 'summer');
    }
  });

  it('uses a renamed active skill node authored art key and rejects absent or retired nodes', async () => {
    const node = {
      id: 'renamed_readiness', iconAsset: 'icon_skill_combat_root', track: 'combat',
    } as SkillTreeContentDefinition['nodes'][number];
    const tree = {
      id: 'skill_tree:renamed', kind: 'skill_tree', schemaVersion: 1, track: 'combat', levelCap: 50, nodes: [node],
    } as SkillTreeContentDefinition;
    const retiredTree = {
      ...tree, id: 'skill_tree:retired', retired: true,
      nodes: [{ ...node, id: 'retired_readiness' }],
    } as SkillTreeContentDefinition;
    const registry = {
      skillTrees: new Map([[tree.id, tree], [retiredTree.id, retiredTree]]),
    } as Pick<ContentRegistry, 'skillTrees'>;
    const loaded = { name: node.iconAsset } as LoadedAsset;
    const loader = vi.fn(async () => loaded);
    const requests = createSkillNodeArtRequests(registry, loader);

    const [first, duplicate] = await Promise.all([
      requests.request(node.id),
      requests.request(node.id),
    ]);

    expect(first).toBe(loaded);
    expect(duplicate).toBe(loaded);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith('icon_skill_combat_root');
    await expect(requests.request('retired_readiness')).resolves.toBeNull();
    await expect(requests.request('missing_readiness')).resolves.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('evicts a rejected generated-content request so the authored asset can retry', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ name: 'asset' } as LoadedAsset);
    const requests = createGeneratedContentAssetRequests(loader);

    await expect(requests.request('asset')).rejects.toThrow('transient');
    await expect(requests.request('asset')).resolves.toMatchObject({ name: 'asset' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('evicts a timed-out scoped icon promise so Studio can retry it', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', ControlledImage);
    const first = loadUiIconSet(['undo'] as const, 10);
    const rejection = expect(first).rejects.toThrow('UI icon undo timed out after 10ms');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;

    const retry = loadUiIconSet(['undo'] as const, 10);
    await vi.advanceTimersByTimeAsync(30);
    const retryImage = ControlledImage.instances[1]!;
    retryImage.naturalWidth = 24;
    retryImage.onload?.(new Event('load'));

    await expect(retry).resolves.toMatchObject({ undo: { image: retryImage, width: 24, height: 24 } });
  });
});
