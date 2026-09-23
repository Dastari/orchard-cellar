import { describe, expect, it, vi } from 'vitest';
import { contentFieldErrors, type ContentFieldSchemaGraph } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import type { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiSchemaForm, UiSchemaFormState } from './schema-form.js';
import { uiText } from './text.js';
import { uiReferencePicker, uiUsedBy } from './reference-picker.js';
const graph: ContentFieldSchemaGraph = { roots: {}, nodes: {
  root: { type: 'object', fields: { amounts: { schema: 'array' }, tuple: { schema: 'tuple' }, optional: { schema: 'string', optional: true }, variant: { schema: 'union' } } },
  array: { type: 'array', items: 'number' }, number: { type: 'number' }, string: { type: 'string' },
  tuple: { type: 'tuple', items: ['number','number'], minItems: 1, rest: 'string' },
  union: { type: 'union', options: ['left','right'] },
  left: { type: 'object', fields: { type: { schema: 'a' }, name: { schema: 'string' } } },
  right: { type: 'object', fields: { type: { schema: 'b' }, name: { schema: 'string' }, count: { schema: 'number' } } },
  a: { type: 'literal', value: 'left' }, b: { type: 'literal', value: 'right' },
} };
function all(node: UiElement): UiElement[] { return [node, ...node.children.flatMap(all)]; }
function keys(node: UiElement, id: string, input: readonly string[]): void {
  const root = new UiRoot({ scale: 1 }); root.resize(600, 1400); root.mount(node); root.arrange();
  const target = all(node).find(entry => entry.id === id)!; expect(target, id).toBeDefined();
  root.focus.set(target); for (const key of input) root.key({ key }); root.unmount(node); root.dispose();
}
const press = (node: UiElement, id: string) => keys(node, id, ['Enter']);
function setup() {
  const state = new UiSchemaFormState({ amounts: [1,2], tuple: [8], variant: { type: 'left', name: 'Keep me' } });
  const onApply = vi.fn(); const node = uiSchemaForm({ id: 'form', graph, schema: 'root', state, onApply }); return { state, node, onApply };
}
describe('schema form editing', () => {
  it('adds, reorders and removes array entries without losing unfinished numeric edits', () => {
    const { state, node, onApply } = setup();
    (all(node).find(entry => entry.id === 'form:amounts.0')!.props['editor'] as CanvasTextEditor).setValue('9');
    press(node, 'form:amounts:0:down'); expect(state.get(['amounts'])).toEqual([2,9]);
    press(node, 'form:amounts:add'); expect(state.get(['amounts'])).toEqual([2,9,0]);
    press(node, 'form:amounts:0:remove'); press(node, 'form:apply');
    expect(onApply.mock.calls[0]![0].amounts).toEqual([9,0]);
  });
  it('retains tuple minimum length while editing optional and rest positions', () => {
    const { state, node } = setup();
    (all(node).find(entry => entry.id === 'form:tuple.0')!.props['editor'] as CanvasTextEditor).setValue('9');
    press(node, 'form:tuple:add'); expect(state.get(['tuple'])).toEqual([9,0]);
    press(node, 'form:tuple:add'); expect(state.get(['tuple'])).toEqual([9,0,'']);
    press(node, 'form:tuple:remove-last'); press(node, 'form:tuple:remove-last');
    expect(state.get(['tuple'])).toEqual([9]); expect(all(node).find(entry => entry.id === 'form:tuple:remove-last')).toBeUndefined();
  });
  it('switches discriminated variants while retaining compatible values', () => {
    const { state, node } = setup(); keys(node, 'form:variant:variant', ['t','y','p','e',':',' ','r','Enter']);
    // Select by keyboard navigation as type labels may share prefixes.
    if ((state.get(['variant']) as {type:string}).type === 'left') keys(node, 'form:variant:variant', ['ArrowDown','End','Enter']);
    expect(state.get(['variant'])).toEqual({ type: 'right', name: 'Keep me', count: 0 });
    expect(contentFieldErrors(graph, 'root', state.value)).toEqual([]);
  });
  it('prevents invalid numbers from applying or being discarded by structural actions', () => {
    const { state, node, onApply } = setup();
    (all(node).find(entry => entry.id === 'form:amounts.0')!.props['editor'] as CanvasTextEditor).setValue('-');
    press(node, 'form:amounts:add'); press(node, 'form:apply');
    expect(state.get(['amounts'])).toEqual([1,2]); expect(onApply).not.toHaveBeenCalled(); expect(state.error).toContain('finite number');
  });
});
describe('typed references', () => {
  it('filters choices by kind, searches by name and opens the selected target with preview', async () => {
    const onOpen = vi.fn(), onChange = vi.fn();
    const node = uiReferencePicker({ id: 'reference', label: 'Item', kind: 'item', value: 'item:a', choices: [{ id:'item:a',kind:'item',label:'Apple' },{ id:'item:p',kind:'item',label:'Pear' },{ id:'quest:q',kind:'quest',label:'Quest' }], onOpen, onChange, preview: () => uiText('Selected icon preview') });
    const list = all(node).find(entry => entry.kind === 'list')!;
    expect(list.props['items']).toEqual([{ value:'item:a',label:'Apple (item:a)' }, { value:'item:p',label:'Pear (item:p)' }]);
    expect(all(node).some(entry => entry.props['text'] === 'Selected icon preview')).toBe(true);
    press(node, 'reference:open'); expect(onOpen).toHaveBeenCalledWith('item:a');
    const input = all(node).find(entry => entry.id === 'reference')!;
    (input.props['editor'] as CanvasTextEditor).setValue(''); input.hooks.onText?.('Pear', input);
    await Promise.resolve();
    expect(list.props['items']).toEqual([{ value:'item:p',label:'Pear (item:p)' }]);
  });
  it('shows missing targets without silently replacing their IDs and navigates used-by entries', () => {
    const onOpen = vi.fn();
    const node = uiReferencePicker({ id:'missing',label:'Item',kind:'item',value:'item:missing',choices:[],onChange:vi.fn(),onOpen });
    expect(all(node).some(entry => String(entry.props['text']).includes('item:missing'))).toBe(true);
    press(node,'missing:open'); expect(onOpen).not.toHaveBeenCalled();
    const used = uiUsedBy({ id:'used',uses:[{sourceId:'recipe:r',sourceKind:'recipe',path:'inputs[0].item',targetId:'item:a'}],onOpen });
    press(used,'used:0'); expect(onOpen).toHaveBeenCalledWith('recipe:r');
  });
});
