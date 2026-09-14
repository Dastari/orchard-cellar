import { describe, expect, it, vi } from 'vitest';
import { parseLifecycleSourceBundle } from '@orchard/lifecycle-authoring';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import { buildItemsCanvasTool } from './canvas.js';

function context(): StudioCanvasToolContext {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate('/author/items');
  const bounds = { x: 286, y: 30, width: 760, height: 520 };
  return { bounds, controlsBounds: { x: 20, y: 30, width: 260, height: 520 }, workspaceBounds: bounds,
    route: controller.activeRoute(), controller, invalidate: vi.fn() };
}

function expectCanvasContract(surface: StudioCanvasToolSurface, context: StudioCanvasToolContext): void {
  expect(surface.nodes.length).toBeLessThanOrEqual(200);
  expect(surface.actions.length).toBeLessThanOrEqual(200);
  expect(surface.tables?.length).toBeGreaterThan(0);
  expect(surface.tables?.length).toBeLessThanOrEqual(8);
  expect(new Set(surface.nodes.map(({ id }) => id)).size).toBe(surface.nodes.length);
  expect(new Set(surface.actions.map(({ id }) => id)).size).toBe(surface.actions.length);
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

describe('Items & Recipes canvas tool', () => {
  it('renders a bounded retained browser, all-field editor, output, history, and semantic actions', () => {
    const toolContext = context();
    const surface = buildItemsCanvasTool(toolContext);
    expectCanvasContract(surface, toolContext);
    expect(surface.actions.some(({ id, role }) => id.endsWith('items:query') && role === 'textbox')).toBe(true);
    expect(surface.actions.some(({ id }) => id.includes('items:definition:item:'))).toBe(true);
    expect(surface.nodes.some(({ id }) => id.includes('items:field:'))).toBe(true);
    expect(surface.nodes.some(({ id }) => id.endsWith('items:status'))).toBe(true);
    expect(surface.actions.find(({ id }) => id.endsWith('items:publish'))?.disabled).toBe(true);
    const table = surface.tables![0]!;
    const row = table.layout.rows[table.layout.rows.length - 1]!;
    table.onHit?.({ kind: 'cell', rowId: row.id, rowIndex: row.rowIndex,
      columnId: row.cells[0]!.columnId, columnIndex: 0 });
    expect(toolContext.controller.selection.current()).toMatchObject({ kind: 'definition', id: row.id });
    table.onScroll?.('end', table.layout.maximumScrollRow);
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('switches definition tables and applies JSON edits through the existing model', () => {
    const toolContext = context();
    let surface = buildItemsCanvasTool(toolContext);
    surface.actions.find(({ id }) => id.endsWith('items:kind:recipe'))!.activate();
    surface = buildItemsCanvasTool(toolContext);
    expect(surface.tables?.[0]?.layout.headerCells[0]?.label).toMatch(/^RECIPE/u);

    surface.actions.find(({ id }) => id.endsWith('items:kind:item'))!.activate();
    surface = buildItemsCanvasTool(toolContext);
    const editor = surface.textEditors!.find(({ id }) => id.endsWith('items:definition-json'))!.editor;
    const definition = JSON.parse(editor.snapshot().value) as { displayName: string };
    editor.setValue(JSON.stringify({ ...definition, displayName: `${definition.displayName} Canvas` }));
    surface.actions.find(({ id }) => id.endsWith('items:apply-json'))!.activate();
    surface = buildItemsCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id.endsWith('items:status'))?.label).toContain('1 CHANGES');
  });

  it('authors recipe-book onUse code entirely through Canvas controls and exports a valid warm bundle', () => {
    const toolContext = context();
    let surface = buildItemsCanvasTool(toolContext);
    surface.textEditors!.find(({ id }) => id.endsWith('items:query'))!.editor.setValue("Marlow's");
    surface = buildItemsCanvasTool(toolContext);
    const table = surface.tables![0]!;
    const row = table.layout.rows.find(({ id }) => id === 'item:marlow_book')!;
    table.onHit?.({ kind: 'cell', rowId: row.id, rowIndex: row.rowIndex,
      columnId: row.cells[0]!.columnId, columnIndex: 0 });
    surface = buildItemsCanvasTool(toolContext);

    expect(surface.actions.find(({ id }) => id.endsWith('items:lifecycle-create')))
      .toMatchObject({ disabled: true });
    surface.actions.find(({ id }) => id.endsWith('items:lifecycle-remove'))!.activate();
    surface = buildItemsCanvasTool(toolContext);
    const create = surface.actions.find(({ id }) => id.endsWith('items:lifecycle-create'))!;
    expect(create.disabled).toBe(false);
    create.activate();
    surface = buildItemsCanvasTool(toolContext);

    const prompt = surface.textEditors!.find(({ id }) => id.endsWith('items:lifecycle-prompt'))!.editor;
    const source = surface.textEditors!.find(({ id }) => id.endsWith('items:lifecycle-source'))!.editor;
    const recipeBookSource = [
      "const recipes = ['recipe:wooden_pickaxe', 'recipe:wooden_sword'];",
      'for (const recipe of recipes) {',
      '  if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);',
      '}',
    ].join('\n');
    prompt.setValue('READ RECIPE BOOK');
    source.setValue(recipeBookSource);
    surface = buildItemsCanvasTool(toolContext);

    expect(surface.nodes.find(({ id }) => id.endsWith('items:lifecycle-ribbon'))).toMatchObject({
      kind: 'ribbon', label: 'ON USE',
    });
    expect(surface.actions.some(({ id }) => id.includes('lifecycle-previous') || id.includes('lifecycle-next')))
      .toBe(false);
    expect(surface.actions.find(({ id }) => id.endsWith('items:lifecycle-trigger:secondary')))
      .toMatchObject({ disabled: false });
    expect(surface.nodes.find(({ id }) => id.endsWith('items:lifecycle-source')))
      .toMatchObject({ multiline: true, textScale: 1 });
    expect(surface.nodes.find(({ id }) => id.endsWith('items:lifecycle-status'))?.label)
      .toMatch(/WARM DRAFT .* VALID .* NOT LIVE/u);
    const exportAction = surface.actions.find(({ id }) => id.endsWith('items:lifecycle-export'))!;
    expect(exportAction.disabled).toBe(false);
    exportAction.activate();
    surface = buildItemsCanvasTool(toolContext);

    const bundle = surface.textEditors!.find(({ id }) => id.endsWith('items:lifecycle-bundle'))!
      .editor.snapshot().value;
    const parsed = parseLifecycleSourceBundle(JSON.parse(bundle));
    expect(parsed.handlers.find(({ itemId }) => itemId === 'item:marlow_book')).toMatchObject({
      prompt: 'READ RECIPE BOOK', source: recipeBookSource, triggers: ['secondary'],
    });
    expect(surface.actions.filter(({ id }) => id.includes('items:lifecycle-mode-'))
      .map(({ id }) => id.slice(id.indexOf('items:lifecycle-mode-'))))
      .toEqual(['items:lifecycle-mode-source', 'items:lifecycle-mode-bundle']);
    expect(surface.actions.some(({ id }) => id.includes('lifecycle-publish') || id.includes('candidate')))
      .toBe(false);
  });
});
