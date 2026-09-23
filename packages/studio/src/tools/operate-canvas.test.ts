import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { UiRoot, ui, uiFixed, type CanvasTextEditor } from '@orchard/ui/studio';
import { kitElements, pressKit, chooseKit } from './kit-test-driver.js';
import { PlayerManagerModel } from './players/model.js';
import { StudioShellController } from '../shell/controller.js';
import type { StudioToolRoute } from '../shell/tool-registry.js';
import { buildOperateObserveCanvasTool } from './operate-canvas.js';
const IDS = ['players', 'playbooks', 'containers', 'objects', 'npcs', 'world', 'membership', 'observe'] as const;
function context(controller: StudioShellController, id: typeof IDS[number]) {
  const tool = controller.tools.tools().find(candidate => candidate.id === id)!;
  const route: StudioToolRoute = { path: tool.routes[0]!, tool, access: 'write' };
  const bounds = { x: 390, y: 40, width: 530, height: 620 };
  return { bounds, controlsBounds: { x: 100, y: 40, width: 270, height: 620 }, workspaceBounds: bounds, route, controller, invalidate: () => undefined };
}
describe('Operate and Observe kit tools', () => {
  it('previews the entered item and quantity, and rejects invalid numeric input before requesting a preview',async()=>{
    const controller=new StudioShellController(async()=>{throw new Error('offline');});
    controller.session.connected({identity:'test-owner',role:'owner',contentRevision:null,mapRevision:null});
    const options=context(controller,'players');let surface=buildOperateObserveCanvasTool(options);
    const settle=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
    pressKit(surface,'players-find');await settle();surface=buildOperateObserveCanvasTool(options);
    pressKit(surface,'players-results-table:rows');await settle();surface=buildOperateObserveCanvasTool(options);
    chooseKit(surface,'players-tab','inventory');surface=buildOperateObserveCanvasTool(options);
    const field=(id:string)=>kitElements(surface).find(node=>node.id===id)!.props['editor'] as CanvasTextEditor;
    field('players-reason').setValue('Investigating a reported missing stack');
    field('players-action-itemKind').setValue('apple');field('players-action-quantity').setValue('7');
    const preview=vi.spyOn(PlayerManagerModel.prototype,'preview');
    try {
      pressKit(surface,'players-preview-give_items');await settle();
      expect(preview).toHaveBeenCalledWith({operation:'give_items',stacks:[{itemKind:'apple',quantity:7}]});
      preview.mockClear();field('players-action-quantity').setValue('not a number');
      pressKit(surface,'players-preview-give_items');await settle();expect(preview).not.toHaveBeenCalled();
    }finally{preview.mockRestore();}
  });
  it.each(IDS)('%s composes real kit controls and virtual tables without legacy nodes', id => {
    const controller = new StudioShellController(async () => { throw new Error('not_connected'); });
    const surface = buildOperateObserveCanvasTool(context(controller,id));

    const root = new UiRoot({ scale:1 }); root.resize(900,620);
    root.mount(ui.flex({direction:'row',width:'grow',height:'grow',gap:8},[
      ui.scrollArea({width:uiFixed(250),height:'grow'},[surface.kit!.controls!]),surface.kit!.workspace!,
    ])); root.arrange();
    const elements=root.entries().map(({element})=>element);
    const tables=elements.filter(element=>element.kind==='table');
    if(id==='containers') expect(elements.some(element=>element.label==='Inspect a container to load its slots')).toBe(true);
    else expect(tables.length > 0 || elements.some(element => element.id.endsWith(':empty'))).toBe(true);
    for(const table of tables) expect(table.props['mode']).toBe('virtual');
    expect(elements.filter(element=>element.focusable).length).toBeGreaterThan(0);
    expect(elements.length).toBeLessThan(1000);
    expect(elements.some(element=>element.kind==='text'&&element.label.length>0)).toBe(true);
    root.dispose();
  });
  it('routes keyboard table selection into the retained object model', async () => {
    const controller=new StudioShellController(async()=>{throw new Error('not_connected');}), options=context(controller,'objects');
    buildOperateObserveCanvasTool(options); await new Promise<void>(resolve=>setTimeout(resolve,0));
    const surface=buildOperateObserveCanvasTool(options), root=new UiRoot({scale:1});root.resize(700,620);root.mount(surface.kit!.workspace!);root.arrange();
    const list=root.entries().find(({element})=>element.id==='objects-results-table:rows')!.element;
    const first=root.entries().find(({element})=>element.kind==='list-row')!.element.label;
    root.focus.set(list);root.key({key:'Enter'});expect(controller.selection.current()).toMatchObject({kind:'entity',id:first});root.dispose();
  });
  it('uses kit table and input factories with no DOM or old rendering boundary', () => {
    const source=readFileSync(new URL('./operate-canvas.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/document\.|createElement|HTMLElement|HTMLInputElement|SVGElement|innerHTML|SurfaceComposer|StudioCanvasShellNode|layoutStudioCanvasTable/u);
    expect(source).toContain('kit.table<OperateRow>');expect(source).toContain('kit.input(');expect(source).not.toMatch(/layoutUi/u);
  });
});
