import { describe, expect, it, vi } from 'vitest';
import { CanvasTextEditor, UiRoot } from '@orchard/ui/studio';
import { StudioShellController } from './controller.js';
import { studioDefinitionFields } from './definition-fields.js';
import { kitElements, pressKit } from '../tools/kit-test-driver.js';
import type { StudioCanvasToolContext } from './canvas-tool.js';

function setup(readOnly = false) {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate('/author/items');
  const bounds = { x: 0, y: 0, width: 900, height: 600 };
  const context: StudioCanvasToolContext = {controller,route:controller.activeRoute(),bounds,controlsBounds:bounds,workspaceBounds:bounds,invalidate:vi.fn()};
  const draft = new CanvasTextEditor({value:JSON.stringify({id:'item:test',kind:'item',schemaVersion:1,displayName:'Apple',stack:{quantity:2},edible:true,tags:['fruit']}),multiline:true});
  const apply = vi.fn();
  const build = () => ({kit:{workspace:studioDefinitionFields(context,{id:'details',draft,readOnly,apply})}});
  const change = (surface: ReturnType<typeof build>, label: string, value: string) => {
    const input = kitElements(surface).find(node => node.kind==='input' && node.label===label)!;
    (input.props['editor'] as CanvasTextEditor).setValue(value);
  };
  return {draft,apply,build,change};
}

describe('definition Details workspace',()=>{
  it('applies typed nested fields and array entries without changing identity',()=>{
    const {draft,apply,build,change}=setup();const surface=build();
    change(surface,'Display name','Pear');change(surface,'Stack / quantity','7');change(surface,'Tags / 1','orchard');
    pressKit(surface,kitElements(surface).find(node=>node.kind==='checkbox')!.id);
    pressKit(surface,'details:apply');
    expect(JSON.parse(draft.snapshot().value)).toEqual({id:'item:test',kind:'item',schemaVersion:1,displayName:'Pear',stack:{quantity:7},edible:false,tags:['orchard']});
    expect(apply).toHaveBeenCalledOnce();
  });
  it('retains invalid numeric input and its error across host redraws',()=>{
    const {draft,apply,build,change}=setup();const surface=build(),before=draft.snapshot().value;
    change(surface,'Stack / quantity','oops');pressKit(surface,'details:apply');
    expect(apply).not.toHaveBeenCalled();expect(draft.snapshot().value).toBe(before);
    const rebuilt=build();
    expect(kitElements(rebuilt).find(node=>node.id==='details:error')!.props['text']).toContain('needs a number');
    expect((kitElements(rebuilt).find(node=>node.label==='Stack / quantity'&&node.kind==='input')!.props['editor'] as CanvasTextEditor).snapshot().value).toBe('oops');
  });
  it('reports domain validation failures without publishing or discarding the draft',()=>{
    const {apply,build,change}=setup();apply.mockImplementation(()=>{throw new Error('Unknown item reference');});
    const surface=build();change(surface,'Display name','Invalid draft');pressKit(surface,'details:apply');
    expect(kitElements(build()).find(node=>node.id==='details:error')!.props['text']).toBe('Unknown item reference');
  });
  it('refreshes the form when JSON or selection changes',()=>{
    const {draft,build}=setup();build();draft.setValue('{"id":"item:pear","displayName":"Pear"}');
    const fields=kitElements(build()).filter(node=>node.kind==='input');
    expect(fields).toHaveLength(1);expect((fields[0]!.props['editor'] as CanvasTextEditor).snapshot().value).toBe('Pear');
  });
  it('keeps read-only forms non-mutating',()=>{
    const {apply,build}=setup(true);const surface=build();pressKit(surface,'details:apply');
    expect(apply).not.toHaveBeenCalled();
    const input=kitElements(surface).find(node=>node.kind==='input')!;
    const draft=input.props['editor'] as CanvasTextEditor;const before=draft.snapshot().value;
    input.hooks.onText?.('Changed',input);
    expect(draft.snapshot().value).toBe(before);
  });
});


it('gives authored prose a multiline editor and preserves line breaks on apply',()=>{
  const {draft,apply,build}=setup();draft.setValue(JSON.stringify({id:'dialogue:test',body:'First line\nSecond line'}));
  const surface=build();const area=kitElements(surface).find(element=>element.kind==='text-area');
  expect(area).toBeDefined();
  (area!.props['editor'] as CanvasTextEditor).setValue('New first line\nNew second line');
  pressKit(surface,'details:apply');expect(apply).toHaveBeenCalledOnce();
  expect(JSON.parse(draft.snapshot().value).body).toBe('New first line\nNew second line');
});

it('keeps property groups bounded without losing edits in another group', () => {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate('/author/items');
  const bounds = { x: 0, y: 0, width: 240, height: 400 };
  const context: StudioCanvasToolContext = { controller, route: controller.activeRoute(), bounds, controlsBounds: bounds, workspaceBounds: bounds, invalidate: vi.fn() };
  const draft = new CanvasTextEditor({ value: JSON.stringify({ name: 'Sample', nodes: Array.from({ length: 8 }, (_, i) => ({ id: `node-${i}`, body: `Line ${i}` })) }) });
  const build = () => ({ kit: { inspector: studioDefinitionFields(context, { id: 'groups', draft, readOnly: false, apply: vi.fn() }) } });
  let surface = build();
  const name = kitElements(surface).find(node => node.kind === 'input' && node.label === 'Name')!;
  (name.props['editor'] as CanvasTextEditor).setValue('Edited');
  const group = kitElements(surface).find(node => node.id === 'groups:group')!;
  // Exercise the retained selector instead of changing the source model.
  const root = new UiRoot({ scale: 1 }); root.resize(240, 400); root.mount(surface.kit.inspector); root.arrange();
  root.focus.set(group); for (const key of ['ArrowDown','ArrowDown','ArrowDown','Enter']) root.key({ key }); root.unmount(surface.kit.inspector); root.dispose();
  surface = build();
  expect(kitElements(surface).find(node => node.id === 'groups:group')?.props['value']).toBe('nodes 2');
  pressKit(surface, 'groups:apply'); expect(JSON.parse(draft.snapshot().value).name).toBe('Edited');
});
