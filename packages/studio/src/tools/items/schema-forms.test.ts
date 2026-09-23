import { describe, expect, it, vi } from 'vitest';
import { parseContentDefinition } from '@orchard/sim';
import { createItemsTool } from './model.js';
import { StudioShellController } from '../../shell/controller.js';
import { buildItemsCanvasTool } from './canvas.js';
import { buildWorldAuthoringCanvasTool } from '../world-tables/canvas.js';
import { openStudioDefinition } from '../../shell/content-navigation.js';
import { kitElements, pressKit } from '../kit-test-driver.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
function context() {
  const controller = new StudioShellController(async () => { throw new Error('offline'); }); controller.navigate('/author/items');
  const bounds = { x:0,y:0,width:900,height:700 };
  const make = (): StudioCanvasToolContext => ({ controller, route:controller.activeRoute(), bounds, controlsBounds:bounds, workspaceBounds:bounds, invalidate:vi.fn() });
  return { controller, make };
}
describe('content form integration', () => {
  it('creates unique parser-valid local item and recipe drafts and enforces read-only', () => {
    const model = createItemsTool({ access:'anonymous' });
    const item = model.createDefinition('item'), second = model.createDefinition('item'), recipe = model.createDefinition('recipe');
    expect(item.id).not.toBe(second.id);
    expect(parseContentDefinition('item',item)).toEqual(item); expect(parseContentDefinition('recipe',recipe)).toEqual(recipe);
    expect(model.snapshot().dirty).toBe(true); expect(model.snapshot().canPublish).toBe(false);
    expect(() => createItemsTool({access:'read_only'}).createDefinition('item')).toThrow();
  });
  it('executes each palette creation once and provides visible creation buttons', () => {
    const { controller, make } = context(); controller.queueAuthorCommand('item.new');
    const first = buildItemsCanvasTool(make());
    expect(kitElements(first).some(node => node.id.endsWith('items:new-item'))).toBe(true);
    const names = () => kitElements(buildItemsCanvasTool(make())).filter(node => node.kind==='input' && node.id.endsWith('field:displayName')).map(node => node.props['value']);
    expect(names()).toEqual(['New item 1']); expect(names()).toEqual(['New item 1']);
    const button = kitElements(first).find(node => node.id.endsWith('items:new-recipe'))!; pressKit(first,button.id);
    const recipe = buildItemsCanvasTool(make()); expect(kitElements(recipe).some(node => node.id.endsWith('field:inputs:add'))).toBe(true);
  });
  it('selects cross-kind references in the correct author form and clears stale filters', () => {
    const { controller, make } = context();
    expect(openStudioDefinition(controller,'recipe:charcoal')).toBe(true);
    buildItemsCanvasTool(make()); expect(controller.activeRoute().path).toBe('/author/items');
    expect(openStudioDefinition(controller,'object:anvil')).toBe(true);
    const surface = buildWorldAuthoringCanvasTool(make()); expect(controller.activeRoute().path).toBe('/author/world-tables');
    expect(kitElements(surface).some(node => node.id.includes('field:components'))).toBe(true);
    expect(controller.selection.current()).toMatchObject({id:'object:anvil'});
  });
});
