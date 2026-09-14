import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { contentDefinitionRowsHash } from '@orchard/sim';
import stageAContentRows from '../../../../sim/src/content/fixtures/stage-a-content-459.json';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioLiveAdapter } from '../../shell/studio-connection.js';
import { buildWorldAuthoringCanvasTool } from './canvas.js';

const reason = 'Verify selected authored definition';

function liveContent() {
  const revision = 1n;
  const metadata = { updatedBy: Identity.fromString('01'.repeat(32)), updatedAt: new Timestamp(0n) };
  return {
    contentHead: { packId: 'live', revision, contentHash: contentDefinitionRowsHash(stageAContentRows),
      definitionCount: stageAContentRows.length, engineVersion: 1, clientMutationId: 'canvas.fixture', ...metadata },
    contentDefinitions: stageAContentRows.map((row) => ({ ...row, slug: row.id.split(':')[1]!, revision,
      hash: contentDefinitionRowsHash([row]), ...metadata })),
  };
}

function context(path: '/author/world-tables' | '/author/pack'): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate(path);
  const bounds = { x: 286, y: 30, width: 760, height: 520 };
  return { bounds, controlsBounds: { x: 20, y: 30, width: 260, height: 520 }, workspaceBounds: bounds,
    route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

function expectCanvasContract(surface: StudioCanvasToolSurface, context: StudioCanvasToolContext): void {
  expect(surface.nodes.length).toBeLessThanOrEqual(200);
  expect(surface.actions.length).toBeLessThanOrEqual(200);
  expect(surface.tables?.length).toBeGreaterThan(0);
  expect(surface.tables?.length).toBeLessThanOrEqual(8);
  const regions = [context.controlsBounds ?? context.bounds, context.workspaceBounds ?? context.bounds];
  for (const entry of [...surface.nodes, ...surface.actions]) {
    expect(entry.id.startsWith(`${context.route.tool.id}-`)).toBe(true);
    expect(regions.some((region) => entry.bounds.x >= region.x && entry.bounds.y >= region.y
      && entry.bounds.x + entry.bounds.width <= region.x + region.width
      && entry.bounds.y + entry.bounds.height <= region.y + region.height), entry.id).toBe(true);
  }
  for (const action of surface.actions) expect(action.bounds.height).toBeGreaterThanOrEqual(40);
  for (const table of surface.tables ?? []) {
    expect(table.id.startsWith(`${context.route.tool.id}-`)).toBe(true);
    expect(table.layout.rowHeight).toBe(42);
    expect(table.layout.header.height).toBe(42);
    expect(table.layout.bounds.x).toBeGreaterThanOrEqual((context.workspaceBounds ?? context.bounds).x);
  }
}

describe('World Tables and Pack Studio canvas tools', () => {
  it('renders registry-derived world rows, fields, manifest, diff, validation, and history', () => {
    const toolContext = context('/author/world-tables');
    const surface = buildWorldAuthoringCanvasTool(toolContext);
    expectCanvasContract(surface, toolContext);
    expect(surface.nodes.some(({ id }) => id.includes('world:field:'))).toBe(true);
    expect(surface.nodes.find(({ id }) => id.endsWith('world:preview:0'))?.label).toMatch(/^PACK [a-f0-9]{8}$/u);
    expect(surface.actions.find(({ id }) => id.endsWith('world:playtest'))?.disabled).toBe(true);
    const table = surface.tables![0]!;
    const row = table.layout.rows[table.layout.rows.length - 1]!;
    table.onHit?.({ kind: 'row', rowId: row.id, rowIndex: row.rowIndex });
    expect(toolContext.controller.selection.current()).toMatchObject({ kind: 'definition', id: row.id });
    table.onScroll?.('end', table.layout.maximumScrollRow);
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('serializes into the canvas text editor and stages the bounded pack through the model', () => {
    const toolContext = context('/author/pack');
    let surface = buildWorldAuthoringCanvasTool(toolContext);
    surface.actions.find(({ id }) => id.endsWith('world:export-pack'))!.activate();
    surface = buildWorldAuthoringCanvasTool(toolContext);
    const pack = surface.textEditors!.find(({ id }) => id.endsWith('world:pack-json'))!.editor.snapshot().value;
    expect(pack).toContain('"manifest"');
    surface.actions.find(({ id }) => id.endsWith('world:stage-pack'))!.activate();
    surface = buildWorldAuthoringCanvasTool(toolContext);
    expect(surface.nodes.some(({ label }) => label?.includes('BATCHES · ≤50 DEFINITIONS'))).toBe(true);
  });

  it('passes selected definitions and explicit targets to the connected live playtest service', async () => {
    const run = vi.fn(async () => undefined);
    let changed = (): void => undefined;
    const adapter: StudioLiveAdapter = {
      view: () => ({ connected: true, synchronizing: false, identity: '01'.repeat(32), role: 'owner',
        contentRevision: 1n, ...liveContent(), mapRevision: null, mapDocument: null, publishingMap: false,
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
    surface.actions.find(({ id }) => id.endsWith('world:kind:effect'))!.activate();
    surface = buildWorldAuthoringCanvasTool(toolContext);
    surface.textEditors!.find(({ id }) => id.endsWith('world:note'))!.editor.setValue(reason);
    surface.textEditors!.find(({ id }) => id.endsWith('world:playtest-target'))!.editor.setValue('02'.repeat(32));
    surface = buildWorldAuthoringCanvasTool(toolContext);
    const playtest = surface.actions.find(({ id }) => id.endsWith('world:playtest'))!;
    expect(playtest.disabled).toBe(false);
    playtest.activate();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'apply_effect', definitionId: expect.stringMatching(/^effect:/u),
      targetPlayer: '02'.repeat(32), reason,
    })));
  });

  it('never promotes a connected mock adapter into the production canvas', async () => {
    let changed = (): void => undefined;
    const adapter: StudioLiveAdapter = {
      view: () => ({ connected: true, synchronizing: false, identity: '01'.repeat(32), role: 'owner',
        contentRevision: 1n, ...liveContent(), mapRevision: null, mapDocument: null, publishingMap: false,
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
    expect(surface.actions.find(({ id }) => id.endsWith('world:playtest'))?.disabled).toBe(true);
  });

  it('keeps every canvas adapter free of alternate DOM/SVG editing surfaces', () => {
    for (const relative of ['../items/canvas.ts', '../narrative/canvas.ts', './canvas.ts']) {
      const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
      for (const forbidden of ['HTMLElement', 'HTMLInputElement', 'textarea', 'contenteditable', 'createElement', 'innerHTML', 'createElementNS', '<svg']) {
        expect(source, `${relative}:${forbidden}`).not.toContain(forbidden);
      }
      expect(source).toContain('layoutUiFrameSlots');
      expect(source).toContain('layoutUiFlex');
      expect(source).toContain('layoutStudioCanvasTable');
      expect(source).not.toContain('function rect(');
    }
  });
});
