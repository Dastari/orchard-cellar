import type { CanvasTextEditor } from '@orchard/ui';
import { kitElements, pressKit, chooseKit, keyKit } from '../kit-test-driver.js';
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

function control(surface: StudioCanvasToolSurface, suffix: string) {
  const found=kitElements(surface).find(element=>element.id.endsWith(`items:${suffix}`));
  if(!found)throw new Error(`Missing ${suffix}`);return found;
}
function editor(surface: StudioCanvasToolSurface,suffix:string):CanvasTextEditor {
  return control(surface,suffix).props['editor'] as CanvasTextEditor;
}
function action(surface: StudioCanvasToolSurface,suffix:string):void {pressKit(surface,control(surface,suffix).id);}

describe('Items & Recipes canvas tool', () => {
  it('uses kit controls and a virtual definition browser with keyboard selection',()=>{
    const toolContext=context();let surface=buildItemsCanvasTool(toolContext);

    expect(control(surface,'publish').disabled).toBe(true);
    expect(kitElements(surface).some(element=>element.id.includes('items:field:'))).toBe(true);
    surface=buildItemsCanvasTool(toolContext);
    const table=control(surface,'browser-table');
    const first=(table.props['rowOrder'] as string[])[0];
    action(surface,'browser-table:rows');
    expect(toolContext.controller.selection.current()).toMatchObject({kind:'definition',id:first});
  });
  it('switches definition kinds and applies JSON through the existing model',()=>{
    const toolContext=context();let surface=buildItemsCanvasTool(toolContext);
    chooseKit(surface,control(surface,'kind').id,'RECIPE');surface=buildItemsCanvasTool(toolContext);
    expect((control(surface,'browser-table').props['rowOrder'] as string[]).every(id=>id.startsWith('recipe:'))).toBe(true);
    chooseKit(surface,control(surface,'kind').id,'ITEM');surface=buildItemsCanvasTool(toolContext);
    chooseKit(surface,control(surface,'tabs:mode').id,'JSON');surface=buildItemsCanvasTool(toolContext);
    const draft=editor(surface,'definition-json');const definition=JSON.parse(draft.snapshot().value) as {displayName:string};
    draft.setValue(JSON.stringify({...definition,displayName:`${definition.displayName} Canvas`}));
    action(surface,'apply-json');surface=buildItemsCanvasTool(toolContext);
    expect(control(surface,'status').props['text']).toContain('1 CHANGES');
  });
  it('authors recipe-book onUse source and exports a compiler-valid local bundle',()=>{
    const toolContext=context();let surface=buildItemsCanvasTool(toolContext);
    editor(surface,'query').setValue('Marlow Book');surface=buildItemsCanvasTool(toolContext);
    const rowOrder=control(surface,'browser-table').props['rowOrder'] as string[];
    const index=rowOrder.indexOf('item:marlow_book');expect(index).toBeGreaterThanOrEqual(0);
    keyKit(surface,control(surface,'browser-table:rows').id,'Home');
    for(let row=0;row<index;row++)keyKit(surface,control(surface,'browser-table:rows').id,'ArrowDown');
    action(surface,'browser-table:rows');surface=buildItemsCanvasTool(toolContext);
    chooseKit(surface,control(surface,'tabs:mode').id,'Lifecycle');surface=buildItemsCanvasTool(toolContext);
    expect(control(surface,'lifecycle-create').disabled).toBe(true);
    action(surface,'lifecycle-remove');surface=buildItemsCanvasTool(toolContext);
    expect(control(surface,'lifecycle-create').disabled).toBe(false);
    action(surface,'lifecycle-create');surface=buildItemsCanvasTool(toolContext);
    const recipeBookSource=[
      "const recipes = ['recipe:wooden_pickaxe', 'recipe:wooden_sword'];",
      'for (const recipe of recipes) {',
      '  if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);',
      '}',
    ].join('\n');
    editor(surface,'lifecycle-prompt').setValue('READ RECIPE BOOK');
    editor(surface,'lifecycle-source').setValue(recipeBookSource);surface=buildItemsCanvasTool(toolContext);
    expect(control(surface,'lifecycle-ribbon').props['text']).toBe('ON USE');
    expect(control(surface,'lifecycle-trigger:secondary').disabled).toBe(false);
    expect(editor(surface,'lifecycle-source').snapshot().value).toContain('\n');
    expect(control(surface,'lifecycle-status').props['text']).toMatch(/WARM DRAFT .* VALID .* NOT LIVE/u);
    expect(control(surface,'lifecycle-export').disabled).toBe(false);
    action(surface,'lifecycle-export');surface=buildItemsCanvasTool(toolContext);
    const parsed=parseLifecycleSourceBundle(JSON.parse(editor(surface,'lifecycle-bundle').snapshot().value));
    expect(parsed.handlers.find(({itemId})=>itemId==='item:marlow_book')).toMatchObject({prompt:'READ RECIPE BOOK',source:recipeBookSource,triggers:['secondary']});
    expect(kitElements(surface).some(({id})=>id.includes('lifecycle-publish')||id.includes('candidate'))).toBe(false);
  });
});
