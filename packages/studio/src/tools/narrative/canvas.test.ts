import { describe, expect, it, vi } from 'vitest';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import { buildNarrativeCanvasTool } from './canvas.js';

function context(path: '/author/npcs' | '/author/dialogue' | '/author/quests'): StudioCanvasToolContext {
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

describe('narrative authoring canvas tools', () => {
  it('renders NPC fields and the linked dialogue/shop/quest preview', () => {
    const toolContext = context('/author/npcs');
    const surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface, toolContext);
    expect(surface.nodes.some(({ id }) => id.includes('narrative:npc-preview:'))).toBe(true);
    expect(surface.nodes.some(({ id }) => id.includes('narrative:field:'))).toBe(true);
    expect(surface.actions.some(({ role }) => role === 'option')).toBe(true);
    const table = surface.tables![0]!;
    const row = table.layout.rows[table.layout.rows.length - 1]!;
    table.onHit?.({ kind: 'row', rowId: row.id, rowIndex: row.rowIndex });
    expect(toolContext.controller.selection.current()).toMatchObject({ kind: 'definition', id: row.id });
    table.onScroll?.('end', table.layout.maximumScrollRow);
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('renders dialogue graph nodes and edges and advances deterministic playback choices', () => {
    const toolContext = context('/author/dialogue');
    let surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface, toolContext);
    expect(surface.nodes.some(({ id }) => id.includes('narrative:graph-edge:'))).toBe(true);
    const choice = surface.actions.find(({ id }) => id.includes('narrative:choice:'));
    expect(choice).toBeDefined();
    choice!.activate();
    surface = buildNarrativeCanvasTool(toolContext);
    expect(surface.nodes.some(({ id }) => id.endsWith('narrative:dialogue-current') || id.endsWith('narrative:dialogue-end'))).toBe(true);
  });

  it('renders quest objectives/rewards and applies a pure JSON completion fixture', () => {
    const toolContext = context('/author/quests');
    let surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface, toolContext);
    expect(surface.nodes.some(({ id }) => id.includes('narrative:quest-objective:'))).toBe(true);
    const fixture = surface.textEditors!.find(({ id }) => id.endsWith('narrative:fixture'))!.editor;
    fixture.setValue(JSON.stringify({ questStates: { first_bottle: 'complete' } }));
    surface.actions.find(({ id }) => id.endsWith('narrative:apply-fixture'))!.activate();
    surface = buildNarrativeCanvasTool(toolContext);
    expect(surface.nodes.some(({ id }) => id.endsWith('narrative:quest-rewards'))).toBe(true);
  });

  it('creates a validated draft through the retained-canvas New action', () => {
    const toolContext = context('/author/npcs');
    let surface = buildNarrativeCanvasTool(toolContext);
    surface.actions.find(({ id }) => id.endsWith('narrative:new'))!.activate();
    surface = buildNarrativeCanvasTool(toolContext);
    expect(surface.nodes.find(({ id }) => id.endsWith('narrative:status'))?.label).toContain('1 CHANGES');
    expect(surface.textEditors!.find(({ id }) => id.endsWith('narrative:definition-json'))!.editor.snapshot().value)
      .toContain('New NPC');
  });
});
