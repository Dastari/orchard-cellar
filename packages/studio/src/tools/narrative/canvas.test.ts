import { type CanvasTextEditor } from '@orchard/ui';
import { kitElement, kitElements, pressKit, chooseKit } from '../kit-test-driver.js';
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

function expectCanvasContract(surface: StudioCanvasToolSurface): void {


  expect(kitElements(surface).some(element=>element.id.endsWith('tabs:mode'))).toBe(true);
  expect(kitElements(surface).some(element => element.kind === 'table')).toBe(true);
}
function editor(surface: StudioCanvasToolSurface, suffix: string): CanvasTextEditor {
  return kitElements(surface).find(element => element.id.endsWith(`narrative:${suffix}`))!.props['editor'] as CanvasTextEditor;
}
function activateTab(surface: StudioCanvasToolSurface, tab: string): void {
  chooseKit(surface,kitElements(surface).find(element=>element.id.endsWith('narrative:tabs:mode'))!.id,tab==='editor'?'JSON':'Details');
}
function action(surface: StudioCanvasToolSurface, suffix: string): void {
  pressKit(surface,kitElements(surface).find(element=>element.id.endsWith(`narrative:${suffix}`))!.id);
}

describe('narrative authoring canvas tools', () => {
  it('renders NPC fields and the linked dialogue/shop/quest preview', () => {
    const toolContext = context('/author/npcs');
    const surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface);
    expect(kitElements(surface).some(({ id }) => id.includes('narrative:npc-preview:'))).toBe(true);
    expect(kitElements(surface).some(({ id }) => id.includes('narrative:field:'))).toBe(true);
    const browsed=buildNarrativeCanvasTool(toolContext);
    const table=kitElements(browsed).find(element=>element.kind==='table')!;
    const rows=table.props['rowOrder'] as string[];
    expect(rows.length).toBeGreaterThan(0);
    pressKit(browsed,`${table.id}:rows`);
    expect(toolContext.controller.selection.current()).toMatchObject({kind:'definition',id:rows[0]});
    expect(toolContext.invalidate).toHaveBeenCalled();
  });

  it('renders dialogue graph nodes and edges and advances deterministic playback choices', () => {
    const toolContext = context('/author/dialogue');
    let surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface);
    const graph=kitElements(surface).find(element=>element.id.endsWith('narrative:graph'))!;
    expect((graph.props['items'] as {id:string}[]).some(entry=>entry.id.startsWith('edge:'))).toBe(true);
    surface=buildNarrativeCanvasTool(toolContext);
    const choice = kitElements(surface).find(({ id }) => id.startsWith('dialogue:'));
    expect(choice).toBeDefined();
    pressKit(surface,choice!.id);
    surface = buildNarrativeCanvasTool(toolContext);
    expect(kitElements(surface).some(({ id }) => id==='game.dialogue' || id.endsWith('narrative:dialogue-end'))).toBe(true);
  });

  it('renders quest objectives/rewards and applies a pure JSON completion fixture', () => {
    const toolContext = context('/author/quests');
    let surface = buildNarrativeCanvasTool(toolContext);
    expectCanvasContract(surface);
    expect(kitElements(surface).some(({ id }) => id.includes('narrative:quest-objective:'))).toBe(true);
    surface=buildNarrativeCanvasTool(toolContext);
    chooseKit(surface,kitElements(surface).find(node=>node.id.endsWith('narrative:tabs:mode'))!.id,'Testing');
    surface=buildNarrativeCanvasTool(toolContext);
    const fixture = editor(surface,'fixture');
    fixture.setValue(JSON.stringify({ questStates: { first_bottle: 'complete' } }));
    action(surface,'apply-fixture');
    surface = buildNarrativeCanvasTool(toolContext);
    expect(kitElements(surface).some(({ id }) => id.endsWith('narrative:quest-rewards'))).toBe(true);
  });

  it('preserves unapplied JSON drafts across tab changes without mutating the model', () => {
    const toolContext=context('/author/npcs');
    let surface=buildNarrativeCanvasTool(toolContext);
    const draft=editor(surface,'definition-json');
    const original=draft.snapshot().value;
    draft.setValue('{ unfinished');
    surface=buildNarrativeCanvasTool(toolContext);
    activateTab(surface,'editor');
    surface=buildNarrativeCanvasTool(toolContext);
    expect(editor(surface,'definition-json')).toBe(draft);
    expect(draft.snapshot().value).toBe('{ unfinished');
    action(surface,'apply-json');
    surface=buildNarrativeCanvasTool(toolContext);
    expect(kitElement(surface,`${toolContext.route.tool.id}-narrative:status`)?.props['text']).toContain('0 CHANGES');
    draft.setValue(original);
  });

  it('creates a validated draft through the retained-canvas New action', () => {
    const toolContext = context('/author/npcs');
    let surface = buildNarrativeCanvasTool(toolContext);
    action(surface,'new');
    surface = buildNarrativeCanvasTool(toolContext);
    expect(kitElement(surface,`${toolContext.route.tool.id}-narrative:status`)?.props['text']).toContain('1 CHANGES');
    expect(editor(surface,'definition-json').snapshot().value)
      .toContain('New NPC');
  });
});
