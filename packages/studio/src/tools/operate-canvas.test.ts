import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudioShellController } from '../shell/controller.js';
import type { StudioToolRoute } from '../shell/tool-registry.js';
import { buildOperateObserveCanvasTool } from './operate-canvas.js';

const IDS = ['players', 'playbooks', 'containers', 'objects', 'npcs', 'world', 'membership', 'observe'] as const;

function route(controller: StudioShellController, id: typeof IDS[number]): StudioToolRoute {
  const tool = controller.tools.tools().find((candidate) => candidate.id === id);
  if (tool === undefined) throw new Error(`missing_tool:${id}`);
  return { path: tool.routes[0]!, tool, access: 'write' };
}

describe('Operate and Observe canvas tools', () => {
  it('projects every audited model into bounded retained canvas nodes', () => {
    const controller = new StudioShellController(async () => { throw new Error('not_connected'); });
    for (const id of IDS) {
      const workspaceBounds = { x: 390, y: 40, width: 530, height: 620 };
      const surface = buildOperateObserveCanvasTool({
        bounds: workspaceBounds,
        controlsBounds: { x: 100, y: 40, width: 270, height: 620 },
        workspaceBounds,
        route: route(controller, id), controller, invalidate: () => undefined,
      });
      expect(surface.nodes.length).toBeGreaterThan(1);
      expect(surface.nodes.length).toBeLessThanOrEqual(200);
      expect(surface.actions.length).toBeLessThanOrEqual(200);
      expect(surface.tables?.length).toBeGreaterThanOrEqual(1);
      expect(new Set(surface.nodes.map((node) => node.id)).size).toBe(surface.nodes.length);
      expect(surface.nodes.every((node) => node.id.startsWith(`${id}-`))).toBe(true);
      expect(surface.nodes.every((node) => node.clip !== undefined)).toBe(true);
      expect(surface.actions.every(({ bounds }) => bounds.height >= 40)).toBe(true);
      expect(surface.actions.filter(({ role }) => role === 'button').every(({ bounds }) => bounds.width <= 300)).toBe(true);
      expect(surface.nodes.some(({ bounds }) => bounds.x < workspaceBounds.x)).toBe(true);
      expect(surface.nodes.some(({ bounds }) => bounds.x >= workspaceBounds.x)).toBe(true);
      for (const table of surface.tables ?? []) {
        expect(table.id.startsWith(`${id}-`)).toBe(true);
        expect(table.layout.rowHeight).toBeGreaterThanOrEqual(40);
        expect(table.layout.bounds.x).toBeGreaterThan(workspaceBounds.x);
        expect(table.layout.bounds.y).toBeGreaterThan(workspaceBounds.y);
        expect(table.layout.bounds.x + table.layout.bounds.width).toBeLessThan(workspaceBounds.x + workspaceBounds.width);
        expect(table.layout.bounds.y + table.layout.bounds.height).toBeLessThan(workspaceBounds.y + workspaceBounds.height);
        expect(table.onHit).toBeTypeOf('function');
        expect(table.onScroll).toBeTypeOf('function');
      }
    }
  });

  it('retains table scroll commands locally and routes row/cell hits into model selection', async () => {
    const controller = new StudioShellController(async () => { throw new Error('not_connected'); });
    const bounds = { x: 390, y: 40, width: 530, height: 620 };
    const context = { bounds, controlsBounds: { x: 100, y: 40, width: 270, height: 620 },
      workspaceBounds: bounds, route: route(controller, 'objects'), controller, invalidate: () => undefined };
    buildOperateObserveCanvasTool(context);
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    const surface = buildOperateObserveCanvasTool(context);
    const table = surface.tables?.find(({ id }) => id === 'objects-results-table');
    expect(table?.layout.rows.length).toBeGreaterThan(0);
    const first = table!.layout.rows[0]!;
    table!.onHit?.({ kind: 'cell', rowId: first.id, rowIndex: first.rowIndex,
      columnId: first.cells[0]!.columnId, columnIndex: 0 });
    expect(controller.selection.current()).toMatchObject({ kind: 'entity', id: first.id });

    const scroll = controller.toolState<{ scrollRow: number }>('operate-table:objects-results-table', () => ({ scrollRow: 0 }));
    for (const [command, next] of [['line_down', 1], ['page_down', 8], ['end', 40],
      ['line_up', 39], ['page_up', 31], ['home', 0]] as const) {
      table!.onScroll?.(command, next);
      expect(scroll.scrollRow).toBe(next);
    }
  });

  it('contains no DOM projection boundary', () => {
    const source = readFileSync(new URL('./operate-canvas.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/document\.|createElement|HTMLElement|HTMLInputElement|SVGElement|innerHTML/u);
    expect(source).toContain('layoutUiFlex');
    expect(source).toContain('layoutStudioCanvasTable');
    expect(source).not.toMatch(/\.rows\.slice\(0|workspace\.row/u);
    expect(source).toContain('context.controlsBounds');
    expect(source).toContain('context.workspaceBounds');
  });
});
