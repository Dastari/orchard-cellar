import type { CanvasTextEditor } from '@orchard/ui/studio';
import { kitElements, pressKit, chooseKit } from '../kit-test-driver.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRows, contentDefinitionRowsHash } from '@orchard/sim';
import { Identity, Timestamp } from 'spacetimedb';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildWorldAuthoringCanvasTool } from './canvas.js';

const reason = 'Verify selected authored definition';

function verifiedContent() {
  const source = bootstrapContentRows();
  const revision = 1n;
  const metadata = { updatedBy: Identity.fromString('01'.repeat(32)), updatedAt: new Timestamp(0n) };
  return {
    contentRevision: revision,
    contentHead: {
      packId: 'live', revision, contentHash: contentDefinitionRowsHash(source),
      definitionCount: source.length, engineVersion: 1, clientMutationId: 'world.canvas.test', ...metadata,
    },
    contentDefinitions: source.map((row) => ({
      ...row, json: String(row.json), slug: row.id.split(':')[1]!, revision,
      hash: contentDefinitionRowsHash([row]), ...metadata,
    })),
  };
}

function context(path: '/author/world-tables' | '/author/pack'): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate(path);
  const bounds = { x: 286, y: 30, width: 760, height: 520 };
  return { bounds, controlsBounds: { x: 20, y: 30, width: 260, height: 520 }, workspaceBounds: bounds,
    route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

function control(surface:StudioCanvasToolSurface,suffix:string) {
  const found=kitElements(surface).find(element=>element.id.endsWith(`world:${suffix}`));
  if(!found)throw new Error(`Missing ${suffix}`);return found;
}
function editor(surface:StudioCanvasToolSurface,suffix:string):CanvasTextEditor {return control(surface,suffix).props['editor'] as CanvasTextEditor;}
function action(surface:StudioCanvasToolSurface,suffix:string):void {pressKit(surface,control(surface,suffix).id);}

describe('World Tables and Pack Studio canvas tools', () => {
  it('renders registry-derived world rows, fields, manifest, diff, validation, and history', () => {
    const toolContext = context('/author/world-tables');
    let surface = buildWorldAuthoringCanvasTool(toolContext);

    expect(kitElements(surface).some(({ id }) => id.includes('world:field:'))).toBe(true);
    chooseKit(surface,control(surface,'tabs:mode').id,'Changes');surface=buildWorldAuthoringCanvasTool(toolContext);
    expect(control(surface,'preview:0').props['text']).toMatch(/^PACK [a-f0-9]{8}$/u);
    expect(control(surface,'playtest').disabled).toBe(true);
    const browsed=buildWorldAuthoringCanvasTool(toolContext);
    const first=(control(browsed,'browser-table').props['rowOrder'] as string[])[0];
    action(browsed,'browser-table:rows');
    expect(toolContext.controller.selection.current()).toMatchObject({kind:'definition',id:first});
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('serializes into the canvas text editor and stages the bounded pack through the model', () => {
    const toolContext = context('/author/pack');
    let surface = buildWorldAuthoringCanvasTool(toolContext);
    chooseKit(surface,control(surface,'tabs:mode').id,'Pack');surface=buildWorldAuthoringCanvasTool(toolContext);
    action(surface,'export-pack');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    const pack = editor(surface,'pack-json').snapshot().value;
    expect(pack).toContain('"manifest"');
    action(surface,'stage-pack');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    chooseKit(surface,control(surface,'tabs:mode').id,'Changes');surface=buildWorldAuthoringCanvasTool(toolContext);
    expect(kitElements(surface).some(({ label }) => label?.includes('BATCHES · ≤50 DEFINITIONS'))).toBe(true);
  });

  it('selects and edits resources through the existing generic canvas editor', () => {
    const toolContext = context('/author/world-tables');
    let surface = buildWorldAuthoringCanvasTool(toolContext);
    chooseKit(surface, control(surface, 'kind').id, 'RESOURCE');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    const rowOrder = control(surface, 'browser-table').props['rowOrder'] as string[];
    expect(rowOrder[0]).toMatch(/^resource:/u);
    action(surface, 'browser-table:rows');
    expect(toolContext.controller.selection.current()).toMatchObject({
      kind: 'definition',
      definitionKind: 'resource',
      id: rowOrder[0],
    });
    surface = buildWorldAuthoringCanvasTool(toolContext);
    const draft = editor(surface, 'definition-json');
    const resource = JSON.parse(draft.snapshot().value) as Record<string, unknown>;
    draft.setValue(JSON.stringify({ ...resource, displayName: 'Canvas Resource' }, null, 2));
    chooseKit(surface, control(surface, 'tabs:mode').id, 'JSON');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    action(surface, 'apply-json');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    expect(JSON.parse(editor(surface, 'definition-json').snapshot().value)).toMatchObject({
      id: rowOrder[0],
      kind: 'resource',
      displayName: 'Canvas Resource',
    });
  });

  it('passes selected definitions and explicit targets to the connected live playtest service', async () => {
    const run = vi.fn(async () => undefined);
    const content = verifiedContent();
    let changed = (): void => undefined;
    const adapter: StudioLiveAdapter = {
      view: () => ({ connected: true, synchronizing: false, identity: '01'.repeat(32), role: 'owner',
        ...content, mapRevision: null, mapDocument: null, publishingMap: false,
        worldMutating: false, error: null,
        rows: { placeables: [], npcs: [], homesteads: [], players: [] } }),
      connect: () => changed(), disconnect: () => undefined,
      worldPlaytest: { source: 'live', run },
      publishContentChangeSet: async () => undefined, restoreContentRevision: async () => undefined,
    };
    const controller = new StudioShellController(async (_environment, onChanged) => {
      changed = onChanged; return adapter;
    });
    controller.chooseEnvironment('local');
    await controller.connectExplicit();
    controller.navigate('/author/world-tables');
    const bounds = { x: 286, y: 30, width: 760, height: 520 };
    const toolContext: StudioCanvasToolContext = {
      bounds, controlsBounds: { x: 20, y: 30, width: 260, height: 520 }, workspaceBounds: bounds,
      route: controller.activeRoute(), controller, invalidate: vi.fn(),
    };
    let surface = buildWorldAuthoringCanvasTool(toolContext);
    chooseKit(surface,control(surface,'kind').id,'EFFECT');
    surface = buildWorldAuthoringCanvasTool(toolContext);
    editor(surface,'note').setValue(reason);
    editor(surface,'playtest-target').setValue('02'.repeat(32));
    surface = buildWorldAuthoringCanvasTool(toolContext);
    chooseKit(surface,control(surface,'tabs:mode').id,'Playtest');surface=buildWorldAuthoringCanvasTool(toolContext);
    const playtest=control(surface,'playtest');
    expect(playtest.disabled).toBe(false);
    action(surface,'playtest');
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'apply_effect', definitionId: expect.stringMatching(/^effect:/u),
      targetPlayer: '02'.repeat(32), reason,
    })));
  });

  it('never promotes a connected mock adapter into the production canvas', async () => {
    const content = verifiedContent();
    let changed = (): void => undefined;
    const adapter: StudioLiveAdapter = {
      view: () => ({ connected: true, synchronizing: false, identity: '01'.repeat(32), role: 'owner',
        ...content, mapRevision: null, mapDocument: null, publishingMap: false,
        worldMutating: false, error: null,
        rows: { placeables: [], npcs: [], homesteads: [], players: [] } }),
      connect: () => changed(), disconnect: () => undefined,
      worldPlaytest: { source: 'mock', run: vi.fn(async () => undefined) },
      publishContentChangeSet: async () => undefined, restoreContentRevision: async () => undefined,
    };
    const controller = new StudioShellController(async (_environment, onChanged) => {
      changed = onChanged; return adapter;
    });
    controller.chooseEnvironment('local'); await controller.connectExplicit(); controller.navigate('/author/world-tables');
    const bounds = { x: 286, y: 30, width: 760, height: 520 };
    const surface = buildWorldAuthoringCanvasTool({
      bounds, controlsBounds: { x: 20, y: 30, width: 260, height: 520 }, workspaceBounds: bounds,
      route: controller.activeRoute(), controller, invalidate: vi.fn(),
    });
    expect(control(surface,'playtest').disabled).toBe(true);
  });

  it('keeps every canvas adapter free of alternate DOM/SVG editing surfaces', () => {
    for (const relative of ['../items/canvas.ts', '../narrative/canvas.ts', './canvas.ts']) {
      const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
      for (const forbidden of ['HTMLElement', 'HTMLInputElement', 'textarea', 'contenteditable', 'createElement', 'innerHTML', 'createElementNS', '<svg']) {
        expect(source, `${relative}:${forbidden}`).not.toContain(forbidden);
      }
      expect(source).toContain('studioSelectionEditor(');
      expect(source).toContain('kit.table(');
      expect(source).not.toContain('layoutStudioCanvasTable');
      expect(source).not.toContain('function rect(');
    }
  });
});
