import { describe, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { contentDefinitionRowsHash, type ContentDefinitionRow } from '@orchard/sim';
import { bootstrapContentRows } from '../../../../sim/src/content/bootstrap-registry.js';
import type { CanvasTextEditor, UiElement } from '@orchard/ui/studio';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import { chooseKit, kitElements, keyKit, pressKit } from '../kit-test-driver.js';
import type { ItemsToolModel } from './model.js';
import { buildItemsCanvasTool } from './canvas.js';

const baselineRows = bootstrapContentRows();
const actor = Identity.fromString('08'.repeat(32));
const metadata = { updatedBy: actor, updatedAt: new Timestamp(0n) };

function content(rows: readonly ContentDefinitionRow[], revision: bigint) {
  const source = rows.map(row => ({ id: row.id, kind: row.kind, slug: row.slug ?? row.id.split(':')[1]!,
    json: typeof row.json === 'string' ? row.json : JSON.stringify(row.json) }));
  return {
    contentRevision: revision,
    contentHead: { packId: 'live', revision, contentHash: contentDefinitionRowsHash(source),
      definitionCount: rows.length, engineVersion: 1, clientMutationId: `fixture.${revision}`, ...metadata },
    contentDefinitions: source.map(row => ({ ...row, revision, hash: contentDefinitionRowsHash([row]), ...metadata })),
  };
}

function renamed(id: string, displayName: string): readonly ContentDefinitionRow[] {
  return baselineRows.map(row => row.id === id
    ? { ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)), displayName }) } : row);
}

function control(surface: StudioCanvasToolSurface, suffix: string): UiElement {
  const found = kitElements(surface).find(element => element.id.endsWith(`items:${suffix}`));
  if (!found) throw new Error(`Missing Items control ${suffix}`);
  return found;
}

function editor(surface: StudioCanvasToolSurface, suffix: string): CanvasTextEditor {
  return control(surface, suffix).props['editor'] as CanvasTextEditor;
}

interface ObservedState {
  readonly model: ItemsToolModel;
  readonly query: CanvasTextEditor;
  readonly definition: CanvasTextEditor;
  readonly note: CanvasTextEditor;
  readonly selectedId: string | null;
}

async function setup() {
  let changed = () => {};
  let view: StudioConnectionView = {
    connected: true, synchronizing: false, identity: actor.toHexString(), role: 'content_editor',
    scopes: ['items_economy'], error: null, ...content(baselineRows, 1n),
    contentRevisions: [], mapRevision: null, mapDocument: null, publishingMap: false, worldMutating: false,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
  };
  const publish = vi.fn<NonNullable<StudioLiveAdapter['publishContentChangeSet']>>(async () => undefined);
  const adapter: StudioLiveAdapter = {
    view: () => view, connect: () => changed(), disconnect: vi.fn(),
    publishContentChangeSet: publish, restoreContentRevision: vi.fn(async () => undefined),
  };
  let nextAdapter = adapter;
  const controller = new StudioShellController(async (_environment, onChanged) => {
    changed = onChanged; return nextAdapter;
  });
  controller.chooseEnvironment('local');
  await controller.connectExplicit();
  expect(controller.navigate('/author/items')).toBe(true);
  const states = vi.spyOn(controller, 'toolState');
  const bounds = { x: 0, y: 0, width: 1000, height: 700 };
  const render = () => {
    const context: StudioCanvasToolContext = { controller, route: controller.activeRoute(), bounds,
      controlsBounds: bounds, workspaceBounds: bounds, invalidate: vi.fn() };
    return buildItemsCanvasTool(context);
  };
  const observed = (): ObservedState => {
    const index = states.mock.calls.findLastIndex(([key]) => key.startsWith('items-canvas:'));
    return states.mock.results[index]!.value as ObservedState;
  };
  const update = (patch: Partial<StudioConnectionView>) => { view = { ...view, ...patch }; changed(); };
  const stage = () => {
    let surface = render();
    editor(surface, 'query').setValue('item:apple');
    surface = render();
    const rowIds = control(surface, 'browser-table').props['rowOrder'] as string[];
    const index = rowIds.indexOf('item:apple');
    expect(index).toBeGreaterThanOrEqual(0);
    keyKit(surface, control(surface, 'browser-table:rows').id, 'Home');
    for (let row = 0; row < index; row += 1) keyKit(surface, control(surface, 'browser-table:rows').id, 'ArrowDown');
    pressKit(surface, control(surface, 'browser-table:rows').id);
    surface = render();
    editor(surface, 'field:displayName').setValue('Apple collaboration draft');
    pressKit(surface, control(surface, 'field:apply').id);
    surface = render();
    expect(observed().model.snapshot()).toMatchObject({ dirty: true, canPublish: true,
      baseRevision: 1n, headRevision: 1n, validation: { valid: true } });
    return surface;
  };
  return { controller, adapter, publish, render, observed, update, stage,
    replaceAdapter: (replacement: StudioLiveAdapter) => { nextAdapter = replacement; },
    view: () => view };
}

describe('Items canvas verified head transitions', () => {
  it('retains selection, search, note and a staged draft when identical rows advance the head', async () => {
    const fixture = await setup(); const before = fixture.stage();
    editor(before, 'note').setValue('Keep my note');
    const state = fixture.observed();
    fixture.update(content(baselineRows, 2n));
    const after = fixture.render();
    expect(fixture.observed()).toBe(state);
    expect(state.selectedId).toBe('item:apple');
    expect(state.query.snapshot().value).toBe('item:apple');
    expect(state.note.snapshot().value).toBe('Keep my note');
    expect(editor(after, 'field:displayName').snapshot().value).toBe('Apple collaboration draft');
    expect(state.model.snapshot()).toMatchObject({ dirty: true, canPublish: false, baseRevision: 1n,
      headRevision: 2n, diffs: [{ id: 'item:apple' }], conflict: { canAutoRebase: true, overlappingIds: [] } });
    expect(control(after, 'publish').disabled).toBe(true);
    pressKit(after, control(after, 'rebase').id);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: true, canPublish: true, baseRevision: 2n });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('rebases unrelated remote content through the canvas while preserving the local edit', async () => {
    const fixture = await setup(); fixture.stage(); const state = fixture.observed();
    fixture.update(content(renamed('item:wood', 'Remote Wood'), 2n));
    const surface = fixture.render();
    expect(fixture.observed()).toBe(state);
    expect(state.model.snapshot().conflict).toMatchObject({ remoteIds: ['item:wood'], overlappingIds: [] });
    pressKit(surface, control(surface, 'rebase').id);
    expect(state.model.snapshot()).toMatchObject({ baseRevision: 2n, headRevision: 2n, dirty: true, canPublish: true });
    expect(state.model.snapshot().definitions.find(({ id }) => id === 'item:wood')).toMatchObject({ displayName: 'Remote Wood' });
    expect(state.model.snapshot().definitions.find(({ id }) => id === 'item:apple')).toMatchObject({ displayName: 'Apple collaboration draft' });
    const rebased = fixture.render();
    pressKit(rebased, control(rebased, 'publish').id);
    await vi.waitFor(() => expect(fixture.publish).toHaveBeenCalledOnce());
    expect(fixture.publish.mock.calls[0]?.[0]).toMatchObject({ expectedRevision: 2n });
    expect(state.model.snapshot().dirty).toBe(true);
  });

  it('keeps an overlapping draft visible and blocks safe rebase and publication', async () => {
    const fixture = await setup(); fixture.stage(); const state = fixture.observed();
    fixture.update(content(renamed('item:apple', 'Remote Apple'), 2n));
    const surface = fixture.render();
    expect(fixture.observed()).toBe(state);
    expect(state.model.snapshot().conflict).toMatchObject({ overlappingIds: ['item:apple'], canAutoRebase: false });
    expect(editor(surface, 'field:displayName').snapshot().value).toBe('Apple collaboration draft');
    expect(control(surface, 'publish').disabled).toBe(true);
    pressKit(surface, control(surface, 'rebase').id);
    expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content rebase blocked', detail: 'content_rebase_conflict:item:apple' }),
    ]));
    expect(state.model.snapshot()).toMatchObject({ baseRevision: 1n, dirty: true });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('keeps the draft after a publication response and reconciles a verified matching head', async () => {
    const fixture = await setup(); const surface = fixture.stage(); const state = fixture.observed();
    pressKit(surface, control(surface, 'publish').id);
    await vi.waitFor(() => expect(fixture.publish).toHaveBeenCalledOnce());
    expect(state.model.snapshot().dirty).toBe(true);
    fixture.update(content(renamed('item:apple', 'Apple collaboration draft'), 2n));
    const after = fixture.render();
    expect(fixture.observed()).toBe(state);
    expect(state.model.snapshot()).toMatchObject({ baseRevision: 2n, headRevision: 2n, dirty: false, conflict: null });
    expect(state.selectedId).toBe('item:apple');
    expect(editor(after, 'field:displayName').snapshot().value).toBe('Apple collaboration draft');
    expect(state.query.snapshot().value).toBe('item:apple');
    expect(control(after, 'publish').disabled).toBe(true);
    expect(fixture.publish).toHaveBeenCalledOnce();
    fixture.update(content(renamed('item:apple', 'Remote Apple after receipt'), 3n));
    expect(editor(fixture.render(), 'field:displayName').snapshot().value).toBe('Remote Apple after receipt');
  });

  it('fails closed during incomplete and rejected heads, then resumes the same staged draft', async () => {
    const fixture = await setup(); const before = fixture.stage(); const state = fixture.observed();
    const next = content(baselineRows, 2n);
    fixture.update({ ...next, contentDefinitions: next.contentDefinitions.slice(1) });
    expect(kitElements(fixture.render()).some(({ id }) => id === 'live-content-loading-controls')).toBe(true);
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content publish failed', detail: 'items_publish_unavailable' }),
    ])));
    expect(state.model.snapshot()).toMatchObject({ dirty: true, headRevision: 1n });
    fixture.update({ ...next, contentHead: { ...next.contentHead, contentHash: '00000000' } });
    expect(kitElements(fixture.render()).some(({ id }) => id === 'live-content-unavailable-controls')).toBe(true);
    expect(fixture.publish).not.toHaveBeenCalled();
    fixture.update(next); const after = fixture.render();
    expect(fixture.observed()).toBe(state);
    expect(editor(after, 'field:displayName').snapshot().value).toBe('Apple collaboration draft');
    expect(state.model.snapshot()).toMatchObject({ dirty: true, headRevision: 2n, baseRevision: 1n });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('retains unfinished Details input across an identical verified head', async () => {
    const fixture = await setup(); fixture.stage();
    let surface = fixture.render();
    pressKit(surface, control(surface, 'clear').id); surface = fixture.render();
    editor(surface, 'field:displayName').setValue('Unapplied Apple input');
    fixture.update(content(baselineRows, 2n)); surface = fixture.render();
    expect(editor(surface, 'field:displayName').snapshot().value).toBe('Unapplied Apple input');
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: false, baseRevision: 2n });
    pressKit(surface, control(surface, 'field:apply').id);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: true, canPublish: true, baseRevision: 2n });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('isolates identities and access modes and denies a captured write callback after revocation', async () => {
    const fixture = await setup(); const before = fixture.stage(); const original = fixture.observed();
    fixture.update({ scopes: ['observe'] }); const readOnly = fixture.render();
    expect(fixture.observed()).not.toBe(original);
    expect(fixture.observed().model.snapshot()).toMatchObject({ access: 'read_only', dirty: false, canPublish: false });
    expect(control(readOnly, 'publish').disabled).toBe(true);
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content publish failed', detail: 'items_publish_unavailable' }),
    ])));
    fixture.update({ scopes: ['items_economy'], identity: '09'.repeat(32) }); fixture.render();
    expect(fixture.observed()).not.toBe(original);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: false, canPublish: false });
    expect(fixture.observed().query.snapshot().value).toBe('');
    pressKit(before, control(before, 'publish').id);
    await Promise.resolve(); await Promise.resolve();
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('preserves same-identity drafts on reconnect and publishes through the current adapter', async () => {
    const fixture = await setup(); const before = fixture.stage(); const original = fixture.observed();
    const replacementPublish = vi.fn<NonNullable<StudioLiveAdapter['publishContentChangeSet']>>(async () => undefined);
    const replacement: StudioLiveAdapter = { ...fixture.adapter,
      publishContentChangeSet: replacementPublish };
    fixture.controller.disconnect();
    fixture.replaceAdapter(replacement);
    fixture.controller.chooseEnvironment('local');
    await fixture.controller.connectExplicit();
    expect(fixture.controller.navigate('/author/items')).toBe(true);
    fixture.render();
    expect(fixture.observed()).toBe(original);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: true, canPublish: true });
    expect(fixture.observed().query.snapshot().value).toBe('item:apple');
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(replacementPublish).toHaveBeenCalledOnce());
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(replacementPublish.mock.calls[0]?.[0]).toMatchObject({ expectedRevision: 1n });
  });

  it('isolates another environment and denies its retained previous-environment callback', async () => {
    const fixture = await setup(); const before = fixture.stage(); const original = fixture.observed();
    const replacementPublish = vi.fn<NonNullable<StudioLiveAdapter['publishContentChangeSet']>>(async () => undefined);
    fixture.controller.disconnect();
    fixture.replaceAdapter({ ...fixture.adapter, publishContentChangeSet: replacementPublish });
    fixture.controller.chooseEnvironment('production');
    await fixture.controller.connectExplicit();
    expect(fixture.controller.navigate('/author/items')).toBe(true);
    fixture.render();
    expect(fixture.observed()).not.toBe(original);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: false, canPublish: false });
    expect(fixture.observed().query.snapshot().value).toBe('');
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content publish failed', detail: 'items_publish_unavailable' }),
    ])));
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(replacementPublish).not.toHaveBeenCalled();
  });

  it('refreshes untouched selected content after clean remote changes and subsequent heads', async () => {
    const fixture = await setup(); fixture.stage();
    let surface = fixture.render(); pressKit(surface, control(surface, 'clear').id);
    fixture.render();
    fixture.update(content(renamed('item:apple', 'Remote Apple'), 2n)); surface = fixture.render();
    expect(editor(surface, 'field:displayName').snapshot().value).toBe('Remote Apple');
    expect(fixture.observed().selectedId).toBe('item:apple');
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: false, baseRevision: 2n });
    fixture.update(content(renamed('item:apple', 'Latest Apple'), 3n)); surface = fixture.render();
    expect(editor(surface, 'field:displayName').snapshot().value).toBe('Latest Apple');
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('preserves edited advanced JSON when the selected clean definition changes remotely', async () => {
    const fixture = await setup(); fixture.stage();
    let surface = fixture.render(); pressKit(surface, control(surface, 'clear').id); surface = fixture.render();
    chooseKit(surface, control(surface, 'tabs:mode').id, 'JSON'); surface = fixture.render();
    const selected = editor(surface, 'definition-json');
    const pending = JSON.stringify({ ...JSON.parse(selected.snapshot().value), displayName: 'Unapplied JSON Apple' });
    selected.setValue(pending);
    fixture.update(content(renamed('item:apple', 'Remote Apple'), 2n)); surface = fixture.render();
    expect(editor(surface, 'definition-json').snapshot().value).toBe(pending);
    expect(fixture.observed().model.snapshot()).toMatchObject({ dirty: false, baseRevision: 2n });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('rejects a stale callback before repaint when the revision or engine compatibility changes', async () => {
    const fixture = await setup(); const before = fixture.stage();
    fixture.update(content(baselineRows, 2n));
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content publish failed', detail: 'content_revision_conflict' }),
    ])));
    const first = content(baselineRows, 1n);
    fixture.update({ ...first, contentHead: { ...first.contentHead, engineVersion: 2 } });
    pressKit(before, control(before, 'publish').id);
    await vi.waitFor(() => expect(fixture.controller.notifications.items()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Content publish failed', detail: 'content_engine_update_required' }),
    ])));
    expect(fixture.publish).not.toHaveBeenCalled();
  });
});
