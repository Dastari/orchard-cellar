import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentDefinitions,
  type ItemContentDefinition,
  type RecipeContentDefinition,
  type ShopContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import { ITEMS_TOOL_REGISTRATION, type ContentRevisionRecord, type ItemsDraftPersistenceAdapter } from './contracts.js';
import {
  ITEMS_TOOL_DRAFT_KEY,
  createItemsContentHeadSnapshot,
  createItemsTool,
} from './model.js';

function item(id: `item:${string}`, displayName: string, sell = 4): ItemContentDefinition {
  return {
    id,
    kind: 'item',
    schemaVersion: 1,
    displayName,
    icon: { asset: `icon_${id.slice('item:'.length)}` },
    quality: 'common',
    maxStack: 32,
    tags: ['item.food'],
    economy: { buy: sell * 2, sell },
    onUse: [],
  };
}

function definition(id: string): SupportedContentDefinition {
  const found = bootstrapContentDefinitions().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing fixture ${id}`);
  return structuredClone(found);
}

function replaceDefinition(
  definitions: readonly SupportedContentDefinition[],
  next: SupportedContentDefinition,
): readonly SupportedContentDefinition[] {
  return definitions.map((entry) => entry.id === next.id ? next : entry);
}

class MemoryDraftPersistence implements ItemsDraftPersistenceAdapter {
  readonly values = new Map<string, string>();
  load(key: string): string | null { return this.values.get(key) ?? null; }
  save(key: string, value: string): void { this.values.set(key, value); }
  remove(key: string): void { this.values.delete(key); }
}

describe('Items Studio tool model', () => {
  it('exports a shell-compatible Author registration without importing the shell', () => {
    expect(ITEMS_TOOL_REGISTRATION).toMatchObject({
      id: 'items', mode: 'author', routes: ['/author/items'],
    });
    expect(ITEMS_TOOL_REGISTRATION.docks).toEqual(expect.arrayContaining([
      'content_browser', 'asset_library', 'inspector', 'preview', 'validation', 'history',
    ]));
  });

  it('creates, edits, deletes, retires, and resolves replacements in a local draft', () => {
    const model = createItemsTool({ access: 'anonymous' });
    const first = item('item:studio_first', 'Studio First');
    const replacement = item('item:studio_replacement', 'Studio Replacement');
    expect(model.upsertDefinitions([first, replacement]).validation.valid).toBe(true);
    expect(model.setItemPrice(first.id, 20, 10).diffs.map(({ id }) => id)).toEqual([
      first.id, replacement.id,
    ]);
    const retired = model.retireDefinition(first.id, replacement.id);
    expect(retired.validation.valid).toBe(true);
    expect(retired.definitions.find(({ id }) => id === first.id)).toMatchObject({
      retired: true, replacement: replacement.id,
    });
    expect(() => model.retireDefinition(first.id, 'recipe:not_an_item')).toThrow('invalid_retirement_replacement');

    const transient = item('item:studio_transient', 'Transient');
    model.upsertDefinition(transient);
    model.deleteDefinition(transient.id);
    expect(model.snapshot().diffs.some(({ id }) => id === transient.id)).toBe(false);
  });

  it('previews a valid new item, recipe, price, and shop as one atomic draft overlay', () => {
    const model = createItemsTool({ access: 'anonymous' });
    const pear = item('item:studio_pear', 'Studio Pear', 9);
    const recipe: RecipeContentDefinition = {
      id: 'recipe:studio_pear', kind: 'recipe', schemaVersion: 1,
      recipeKind: 'shapeless', inputs: [{ item: 'item:wood', count: 1 }],
      output: { item: pear.id, count: 1 },
    };
    const shop: ShopContentDefinition = {
      id: 'shop:studio_stall', kind: 'shop', schemaVersion: 1,
      offers: [{ item: pear.id, stock: 12 }], currency: { kind: 'bronze' },
    };
    const preview = model.upsertDefinitions([shop, recipe, pear]);
    expect(preview.validation.valid).toBe(true);
    expect(preview.diffs).toEqual([
      expect.objectContaining({ id: pear.id, kind: 'create' }),
      expect.objectContaining({ id: recipe.id, kind: 'create' }),
      expect.objectContaining({ id: shop.id, kind: 'create' }),
    ]);
    expect(model.definitions('item', 'studio pear')[0]).toMatchObject({
      id: pear.id, economy: { buy: 18, sell: 9 },
    });
    expect(model.definitions('recipe').some(({ id }) => id === recipe.id)).toBe(true);
    expect(model.definitions('process').length).toBeGreaterThan(30);
    expect(model.definitions('shop').some(({ id }) => id === shop.id)).toBe(true);
    expect(model.referencesTo(pear.id).map(({ id }) => id)).toEqual([recipe.id, shop.id]);
  });

  it('runs the shared validator continuously and reports invalid deletes and prices', () => {
    const model = createItemsTool({ access: 'anonymous' });
    expect(model.deleteDefinition('item:wood').validation.errors.map(({ code }) => code))
      .toContain('unresolved_reference');
    model.clearDraft();
    expect(model.setItemPrice('item:wood', 0, 10).validation.errors.map(({ code }) => code))
      .toContain('invalid_economy_price');
  });

  it('persists drafts only through the injected adapter and restores them deterministically', () => {
    const persistence = new MemoryDraftPersistence();
    const first = createItemsTool({ access: 'anonymous', persistence });
    first.upsertDefinition(item('item:persisted_draft', 'Persisted'));
    expect(persistence.values.size).toBe(0);
    first.persistDraft();
    expect(persistence.values.has(ITEMS_TOOL_DRAFT_KEY)).toBe(true);

    const second = createItemsTool({ access: 'anonymous', persistence });
    expect(second.restorePersistedDraft().diffs).toEqual([
      expect.objectContaining({ id: 'item:persisted_draft', kind: 'create' }),
    ]);
    second.clearDraft();
    expect(persistence.values.has(ITEMS_TOOL_DRAFT_KEY)).toBe(false);
  });

  it('constructs no live adapter in anonymous/read-only mode and never publishes a draft implicitly', async () => {
    const createAdapter = vi.fn(() => ({
      publishContentChangeSet: vi.fn(async () => undefined),
      restoreContentRevision: vi.fn(async () => undefined),
    }));
    const anonymous = createItemsTool({ access: 'anonymous', createPublishAdapter: createAdapter });
    const readOnly = createItemsTool({ access: 'read_only', createPublishAdapter: createAdapter });
    expect(createAdapter).not.toHaveBeenCalled();
    anonymous.upsertDefinition(item('item:offline_only', 'Offline Only'));
    expect(createAdapter).not.toHaveBeenCalled();
    await expect(anonymous.publish('offline.1', 'offline preview')).rejects.toThrow('items_publish_unavailable');
    expect(() => readOnly.upsertDefinition(item('item:not_allowed', 'No'))).toThrow('items_tool_read_only');
  });

  it('builds the exact deterministic reducer request and calls only the explicit publish adapter', async () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const restoreContentRevision = vi.fn(async () => undefined);
    const head = createItemsContentHeadSnapshot(bootstrapContentDefinitions(), 14n);
    const model = createItemsTool({
      access: 'write', head,
      createPublishAdapter: () => ({ publishContentChangeSet, restoreContentRevision }),
    });
    model.upsertDefinitions([
      item('item:z_item', 'Zed'),
      item('item:a_item', 'Alpha'),
    ]);
    expect(publishContentChangeSet).not.toHaveBeenCalled();
    const request = model.buildPublishRequest('items.publish.14', '  add two items  ');
    expect(request).toMatchObject({
      packId: 'live', expectedRevision: 14n, clientMutationId: 'items.publish.14',
      deletes: '[]', note: 'add two items',
    });
    expect((JSON.parse(request.upserts) as { id: string }[]).map(({ id }) => id))
      .toEqual(['item:a_item', 'item:z_item']);
    await model.publish('items.publish.14', 'add two items');
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
    expect(restoreContentRevision).not.toHaveBeenCalled();
  });

  it('gates publish on engineVersion before invoking the adapter', () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const head = createItemsContentHeadSnapshot(bootstrapContentDefinitions(), 3n, 2);
    const model = createItemsTool({
      access: 'write', head,
      createPublishAdapter: () => ({
        publishContentChangeSet,
        restoreContentRevision: vi.fn(async () => undefined),
      }),
    });
    model.upsertDefinition(item('item:future_blocked', 'Future Blocked'));
    expect(model.snapshot()).toMatchObject({ engineGate: 'requires_update', canPublish: false });
    expect(() => model.buildPublishRequest('items.future.1', 'future blocked'))
      .toThrow('content_engine_update_required');
    expect(publishContentChangeSet).not.toHaveBeenCalled();
  });

  it('models CAS conflicts and rebases non-overlapping or explicitly resolved edits', () => {
    const baseDefinitions = bootstrapContentDefinitions();
    const base = createItemsContentHeadSnapshot(baseDefinitions, 1n);
    const localStone = { ...definition('item:stone'), displayName: 'Local Stone' } as SupportedContentDefinition;
    const remoteWood = { ...definition('item:wood'), displayName: 'Remote Wood' } as SupportedContentDefinition;
    const model = createItemsTool({ access: 'anonymous', head: base });
    model.upsertDefinition(localStone);
    model.receiveHead(createItemsContentHeadSnapshot(replaceDefinition(baseDefinitions, remoteWood), 2n));
    expect(model.snapshot().conflict).toMatchObject({
      localIds: ['item:stone'], remoteIds: ['item:wood'], overlappingIds: [], canAutoRebase: true,
    });
    expect(model.rebase().baseRevision).toBe(2n);
    expect(model.snapshot().diffs.map(({ id }) => id)).toEqual(['item:stone']);

    const overlapping = createItemsTool({ access: 'anonymous', head: base });
    overlapping.upsertDefinition(localStone);
    const remoteStone = { ...definition('item:stone'), displayName: 'Remote Stone' } as SupportedContentDefinition;
    overlapping.receiveHead(createItemsContentHeadSnapshot(replaceDefinition(baseDefinitions, remoteStone), 2n));
    expect(() => overlapping.rebase()).toThrow('content_rebase_conflict:item:stone');
    expect(overlapping.rebase('prefer_local').diffs).toEqual([
      expect.objectContaining({ id: 'item:stone', changedPaths: ['$.displayName'] }),
    ]);
  });

  it('adopts a subscribed head that acknowledges the local publication', () => {
    const persistence = new MemoryDraftPersistence();
    const base = createItemsContentHeadSnapshot(undefined, 1n);
    const model = createItemsTool({ access: 'anonymous', head: base, persistence });
    const wood = model.definitions('item').find(({ id }) => id === 'item:wood')!;
    model.upsertDefinition({ ...wood, displayName: 'Acknowledged Wood' });
    model.persistDraft();

    const published = createItemsContentHeadSnapshot(model.snapshot().definitions, 2n);
    expect(model.receiveHead(published)).toMatchObject({
      dirty: false, baseRevision: 2n, headRevision: 2n, conflict: null,
    });
    expect(persistence.load(ITEMS_TOOL_DRAFT_KEY)).toBeNull();
  });

  it('refreshes subscribed revision history without rebuilding the editor model', () => {
    const model = createItemsTool({ access: 'anonymous' });
    const revision: ContentRevisionRecord = {
      revision: 3n, parentRevision: 2n, contentHash: 'hash',
      changeSetJson: '{"upserts":[],"deletes":[]}',
      inverseChangeSetJson: '{"upserts":[],"deletes":[]}',
      actor: 'owner-a', occurredAt: '2026-09-03T00:00:00.000Z', note: 'Refresh history',
    };
    expect(model.receiveHistory([revision])).toEqual([revision]);
    expect(model.history()).toEqual([revision]);
  });

  it('previews history and restore deterministically, then sends the exact restore request', async () => {
    const baseDefinitions = bootstrapContentDefinitions();
    const oldWood = definition('item:wood');
    const newWood = { ...oldWood, displayName: 'Polished Wood' } as SupportedContentDefinition;
    const currentDefinitions = replaceDefinition(baseDefinitions, newWood);
    const revision: ContentRevisionRecord = {
      revision: 8n,
      parentRevision: 7n,
      contentHash: createItemsContentHeadSnapshot(currentDefinitions, 8n).contentHash,
      changeSetJson: JSON.stringify({
        upserts: [{ id: newWood.id, kind: newWood.kind, json: JSON.stringify(newWood) }], deletes: [],
      }),
      inverseChangeSetJson: JSON.stringify({
        upserts: [{ id: oldWood.id, kind: oldWood.kind, json: JSON.stringify(oldWood) }], deletes: [],
      }),
      actor: 'owner-a', occurredAt: '2026-09-03T00:00:00.000Z', note: 'Polish wood',
    };
    const restoreContentRevision = vi.fn(async () => undefined);
    const model = createItemsTool({
      access: 'write',
      head: createItemsContentHeadSnapshot(currentDefinitions, 8n),
      history: [revision],
      createPublishAdapter: () => ({
        publishContentChangeSet: vi.fn(async () => undefined), restoreContentRevision,
      }),
    });
    expect(model.previewRevision(8n, 'published_change').diffs).toEqual([
      expect.objectContaining({ id: 'item:wood', kind: 'update', changedPaths: ['$.displayName'] }),
    ]);
    expect(model.previewRevision(8n, 'restore_inverse').diffs).toEqual([
      expect.objectContaining({ id: 'item:wood', kind: 'update', changedPaths: ['$.displayName'] }),
    ]);
    const request = await model.restoreRevision(8n, 'items.restore.8', 'restore wood');
    expect(request).toEqual({
      revision: 8n, expectedRevision: 8n, clientMutationId: 'items.restore.8', note: 'restore wood',
    });
    expect(restoreContentRevision).toHaveBeenCalledWith(request);
  });

  it('uses injected asset/reference picker contracts without fetching during construction', () => {
    const options = vi.fn(() => [{
      assetId: 'item_studio_pear', label: 'Studio Pear', animations: ['base'], reviewed: true,
    }]);
    const model = createItemsTool({ access: 'anonymous', assetPicker: { options } });
    expect(options).not.toHaveBeenCalled();
    expect(model.assetOptions('pear')).toEqual([
      expect.objectContaining({ assetId: 'item_studio_pear', reviewed: true }),
    ]);
    expect(options).toHaveBeenCalledWith('pear');
    expect(model.referenceOptions('item')[0]).toMatchObject({ kind: 'item' });
  });
});
