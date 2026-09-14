import { describe, expect, it } from 'vitest';
import {
  bootstrapContentDefinitions,
  contentDefinitionsHash,
  type DialogueContentDefinition,
  type NpcContentDefinition,
  type QuestContentDefinition,
  type ShopContentDefinition,
} from '@orchard/sim';
import { createItemsContentHeadSnapshot } from '../items/model.js';
import { createNarrativeWorkspace } from './model.js';

const shop = {
  id: 'shop:orchard_sage', kind: 'shop', schemaVersion: 1,
  offers: [{ item: 'item:apple' }], currency: { kind: 'bronze' },
} satisfies ShopContentDefinition;

const npc = {
  id: 'npc:orchard_sage', kind: 'npc', schemaVersion: 1, runtimeId: '9001',
  actorAsset: 'npc_cf_sage', displayName: 'Orchard Sage',
  home: { spaceId: 0, tileX: 24, tileY: 17 }, facing: 'left',
  ai: { kind: 'stationary' }, dialogue: 'dialogue:orchard_sage',
  shop: shop.id, questGiver: ['quest:sage_apple'], health: 100,
  barks: ['The cellar remembers every vintage.'],
} satisfies NpcContentDefinition;

const quest = {
  id: 'quest:sage_apple', kind: 'quest', schemaVersion: 1,
  title: 'An Apple for the Sage', summary: 'Bring one apple to the Orchard Sage.',
  giver: npc.id,
  objectives: [{ id: 'apple', kind: 'collect', label: 'Bring an apple', items: [{ item: 'item:apple', count: 1 }], consumeOnTurnIn: true }],
  rewards: { bronze: 12, experience: [{ skill: 'farming', amount: 3 }], items: [] },
} satisfies QuestContentDefinition;

const dialogue = {
  id: 'dialogue:orchard_sage', kind: 'dialogue', schemaVersion: 1,
  initialNodeId: 'welcome', shop: shop.id,
  nodes: [
    { id: 'welcome', speaker: npc.displayName, body: 'Could you bring me one apple?', mode: 'dialogue', choices: [
      { id: 'accept', label: 'I will.', nextNodeId: 'accepted', tone: 'accept', questMarker: 'offer', quest: { quest: quest.id, requires: 'available', action: 'accept' } },
      { id: 'turn_in', label: 'Here it is.', nextNodeId: 'thanks', tone: 'accept', questMarker: 'complete', quest: { quest: quest.id, requires: 'complete', action: 'turn_in' } },
      { id: 'browse', label: 'Show me your goods.', nextNodeId: 'store' },
    ] },
    { id: 'accepted', speaker: npc.displayName, body: 'I will wait here.', mode: 'dialogue', choices: [] },
    { id: 'thanks', speaker: npc.displayName, body: 'A fine apple. Thank you.', mode: 'dialogue', choices: [] },
    { id: 'store', speaker: npc.displayName, body: 'Take a look.', mode: 'shop', choices: [] },
  ],
} satisfies DialogueContentDefinition;

describe('NarrativeWorkspaceModel', () => {
  it('previews equipment and furnishing objectives without treating them as locations', () => {
    const model = createNarrativeWorkspace({ access: 'anonymous' });
    model.upsertDefinitions([shop, npc, dialogue, { ...quest, objectives: [
      { id: 'weapon', kind: 'equipment', label: 'Equip a weapon', category: 'weapon' },
      { id: 'lamp', kind: 'furnishing', label: 'Place a lamp', category: 'lamp' },
    ] }]);
    expect(model.questPreview(quest.id).objectives.map(({ current, required }) => ({ current, required })))
      .toEqual([{ current: 0, required: 1 }, { current: 0, required: 1 }]);
    expect(model.questPreview(quest.id, { equipment: { body: true }, furnishings: { rug: 2 } }).complete).toBe(false);
    const completed = model.questPreview(quest.id, { equipment: { weapon: true }, furnishings: { lamp: 2 } });
    expect(completed.complete).toBe(true);
    expect(completed.objectives.map(({ current }) => current)).toEqual([1, 1]);
  });
  it('authors a mutually-referencing NPC, conversation, shop, and quest atomically', () => {
    const model = createNarrativeWorkspace({ access: 'anonymous' });
    const state = model.upsertDefinitions([shop, npc, dialogue, quest]);
    expect(state.validation.valid).toBe(true);
    expect(state.diffs.map(({ id }) => id)).toEqual([
      'dialogue:orchard_sage', 'npc:orchard_sage', 'quest:sage_apple', 'shop:orchard_sage',
    ]);
    expect(model.browser(undefined, 'sage').map(({ id }) => id)).toEqual(expect.arrayContaining([
      'dialogue:orchard_sage', 'npc:orchard_sage', 'quest:sage_apple', 'shop:orchard_sage',
    ]));
    expect(model.browser('npc').find(({ id }) => id === 'npc:farmer_bob'))
      .toMatchObject({ id: 'npc:farmer_bob', referencedBy: expect.any(Number) });
    expect(model.npcPreview(npc.id)).toMatchObject({ portraitAsset: 'npc_cf_sage', dialogue: { id: dialogue.id }, shop: { id: shop.id } });
  });

  it('previews the complete new-NPC quest and commerce play-through without browser state', () => {
    const model = createNarrativeWorkspace({ access: 'anonymous' });
    model.upsertDefinitions([shop, npc, dialogue, quest]);

    const initial = model.startDialogue(dialogue.id, { [quest.id]: 'available' });
    expect(model.availableChoices(initial).map(({ id }) => id)).toEqual(['accept', 'browse']);
    const accepted = model.chooseDialogue(initial, 'accept');
    expect(accepted.questStates[quest.id]).toBe('active');

    const progress = model.questPreview(quest.id, { items: { 'item:apple': 1 } });
    expect(progress.complete).toBe(true);
    expect(progress.objectives).toEqual([{ id: 'apple', label: 'Bring an apple', current: 1, required: 1, complete: true }]);

    const completion = model.startDialogue(dialogue.id, { [quest.id]: 'complete' });
    const turnedIn = model.chooseDialogue(completion, 'turn_in');
    expect(turnedIn.questStates[quest.id]).toBe('turned_in');
    expect(model.questPreview(quest.id).rewards.bronze).toBe(12);

    const shopping = model.chooseDialogue(initial, 'browse');
    expect(shopping.openedShop).toBe(shop.id);
    expect(model.npcPreview(npc.id).shop?.offers).toEqual([{ item: 'item:apple' }]);
  });

  it('lays out a deterministic editable dialogue graph with speaker portraits', () => {
    const model = createNarrativeWorkspace({ access: 'anonymous' });
    model.upsertDefinitions([shop, npc, dialogue, quest]);
    const initial = model.dialoguePreview(dialogue.id);
    expect(initial.nodes[0]).toMatchObject({ id: 'welcome', x: 24, y: 24 });
    expect(initial.edges).toContainEqual({ id: 'welcome:browse', from: 'welcome', to: 'store', choiceId: 'browse' });
    expect(initial.speakerPortraits['Orchard Sage']).toBe('npc_cf_sage');
    expect(model.moveDialogueNode(dialogue.id, 'welcome', 301.7, 88.2).nodes[0]).toMatchObject({ x: 302, y: 88 });
  });

  it('supports local undo/redo, shared validation, CAS publish, conflict, and anonymous isolation', async () => {
    let adapterCreations = 0;
    const anonymous = createNarrativeWorkspace({
      access: 'anonymous',
      createPublishAdapter: () => { adapterCreations += 1; throw new Error('must_not_construct'); },
    });
    anonymous.upsertDefinitions([shop, npc, dialogue, quest]);
    expect(adapterCreations).toBe(0);
    expect(anonymous.undo().dirty).toBe(false);
    expect(anonymous.redo().dirty).toBe(true);
    await expect(anonymous.publish('anonymous.1', 'preview')).rejects.toThrow('narrative_publish_unavailable');

    const requests: unknown[] = [];
    const head = createItemsContentHeadSnapshot(bootstrapContentDefinitions(), 7n);
    const writable = createNarrativeWorkspace({
      access: 'write', head,
      createPublishAdapter: () => ({
        publishContentChangeSet: async (request) => { requests.push(request); },
        restoreContentRevision: async (request) => { requests.push(request); },
      }),
    });
    writable.upsertDefinitions([shop, npc, dialogue, quest]);
    expect(writable.snapshot().canPublish).toBe(true);
    const request = await writable.publish('narrative.1', 'Add the Orchard Sage');
    expect(request.expectedRevision).toBe(7n);
    expect(JSON.parse(request.upserts)).toHaveLength(4);
    expect(requests).toEqual([request]);

    const nextDefinitions = [...bootstrapContentDefinitions(), shop, npc, dialogue, quest];
    writable.receiveHead(createItemsContentHeadSnapshot(nextDefinitions, 8n));
    expect(writable.snapshot()).toMatchObject({ dirty: false, headRevision: 8n, baseRevision: 8n });
    expect(contentDefinitionsHash(writable.snapshot().definitions)).toBe(contentDefinitionsHash(nextDefinitions));
  });

  it('keeps read-only construction adapter-free and rebases non-overlapping subscribed changes', () => {
    let adapterCreations = 0;
    const readOnly = createNarrativeWorkspace({
      access: 'read_only',
      createPublishAdapter: () => { adapterCreations += 1; throw new Error('must_not_construct'); },
    });
    expect(() => readOnly.upsertDefinition(npc)).toThrow('narrative_workspace_read_only');
    expect(adapterCreations).toBe(0);

    const model = createNarrativeWorkspace({ access: 'anonymous' });
    model.upsertDefinitions([shop, npc, dialogue, quest]);
    const remoteShop = { ...shop, id: 'shop:remote_sage' as const };
    model.receiveHead(createItemsContentHeadSnapshot([...bootstrapContentDefinitions(), remoteShop], 1n));
    expect(model.snapshot().conflict).toBe(true);
    const rebased = model.rebase();
    expect(rebased).toMatchObject({ conflict: false, baseRevision: 1n, dirty: true });
    expect(rebased.definitions.map(({ id }) => id)).toContain(remoteShop.id);
  });

  it('previews and restores subscribed revision history through the shared adapter', async () => {
    const head = createItemsContentHeadSnapshot();
    const changeSet = JSON.stringify({ upserts: [{ id: shop.id, kind: shop.kind, json: JSON.stringify(shop) }], deletes: [] });
    const inverse = JSON.stringify({ upserts: [], deletes: [shop.id] });
    const calls: unknown[] = [];
    const model = createNarrativeWorkspace({
      access: 'write', head,
      history: [{ revision: 2n, parentRevision: 1n, contentHash: 'next', changeSetJson: changeSet, inverseChangeSetJson: inverse, actor: 'owner', occurredAt: '2026-09-03T00:00:00Z', note: 'Shop' }],
      createPublishAdapter: () => ({ publishContentChangeSet: async () => undefined, restoreContentRevision: async (request) => { calls.push(request); } }),
    });
    expect(model.previewRevision(2n, 'published_change').diffs).toMatchObject([{ id: shop.id, kind: 'create' }]);
    const request = await model.restoreRevision(2n, 'narrative.restore.2', 'Restore before shop');
    expect(request).toEqual({ revision: 2n, expectedRevision: 0n, clientMutationId: 'narrative.restore.2', note: 'Restore before shop' });
    expect(calls).toEqual([request]);
  });
});
