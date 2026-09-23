import { describe, expect, it, vi } from 'vitest';
import { CanvasTextEditor } from '@orchard/ui/studio';
import { parseContentDefinition } from '@orchard/sim';
import { StudioShellController } from './controller.js';
import { studioDefinitionFields } from './definition-fields.js';
import { kitElements, pressKit, chooseKit } from '../tools/kit-test-driver.js';
import type { StudioCanvasToolContext } from './canvas-tool.js';

const item = { id: 'item:test', kind: 'item', schemaVersion: 1, displayName: 'Apple', icon: { asset: 'apple' }, quality: 'common', maxStack: 20, tags: ['fruit'], economy: { buy: null, sell: 2 }, onUse: [] };
function setup(readOnly = false) {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate('/author/items');
  const bounds = { x: 0, y: 0, width: 900, height: 600 };
  const context: StudioCanvasToolContext = { controller, route: controller.activeRoute(), bounds, controlsBounds: bounds, workspaceBounds: bounds, invalidate: vi.fn() };
  const draft = new CanvasTextEditor({ value: JSON.stringify(item), multiline: true });
  const apply = vi.fn(() => parseContentDefinition('item', JSON.parse(draft.snapshot().value)));
  const build = () => ({ kit: { workspace: studioDefinitionFields(context, { id: 'details', draft, readOnly, apply }) } });
  const change = (surface: ReturnType<typeof build>, id: string, value: string) => {
    const input = kitElements(surface).find(node => node.id === `details:${id}`)!;
    (input.props['editor'] as CanvasTextEditor).setValue(value);
  };
  return { draft, apply, build, change };
}
describe('schema-driven definition Details', () => {
  it('edits nested fields, enum selections and empty arrays through retained controls', () => {
    const { draft, apply, build, change } = setup(); const surface = build();
    change(surface, 'displayName', 'Pear'); change(surface, 'economy.sell', '7');
    pressKit(surface, 'details:tags:add'); change(surface, 'tags.1', 'orchard');
    chooseKit(surface, 'details:quality', 'rare'); pressKit(surface, 'details:apply');
    expect(apply).toHaveBeenCalledOnce();
    expect(JSON.parse(draft.snapshot().value)).toMatchObject({ id: 'item:test', displayName: 'Pear', quality: 'rare', tags: ['fruit', 'orchard'], economy: { sell: 7 } });
  });
  it('adds and removes optional components without raw JSON', () => {
    const { draft, build, change } = setup(); const surface = build();
    pressKit(surface, 'details:fuel:add'); change(surface, 'fuel.smelts', '3'); pressKit(surface, 'details:apply');
    expect(JSON.parse(draft.snapshot().value).fuel).toEqual({ smelts: 3 });
    const next = build(); pressKit(next, 'details:fuel:remove'); pressKit(next, 'details:apply');
    expect(JSON.parse(draft.snapshot().value).fuel).toBeUndefined();
  });
  it('retains invalid numbers and errors across host rebuilds without changing the draft', () => {
    const { draft, apply, build, change } = setup(); const surface = build(), before = draft.snapshot().value;
    change(surface, 'maxStack', 'oops'); pressKit(surface, 'details:apply');
    expect(apply).not.toHaveBeenCalled(); expect(draft.snapshot().value).toBe(before);
    const next = build(); expect(kitElements(next).find(node => node.id === 'details:error')!.props['text']).toContain('finite number');
    expect((kitElements(next).find(node => node.id === 'details:maxStack')!.props['editor'] as CanvasTextEditor).snapshot().value).toBe('oops');
  });
  it('preserves edits and the original JSON when domain validation rejects Apply', () => {
    const { draft, apply, build, change } = setup(); const before = draft.snapshot().value;
    const surface = build(); change(surface, 'maxStack', '-1'); pressKit(surface, 'details:apply');
    expect(apply).toHaveBeenCalledOnce(); expect(draft.snapshot().value).toBe(before);
    expect(kitElements(build()).find(node => node.id === 'details:error')!.props['text']).toContain('maxStack');
  });
  it('rebuilds after advanced JSON changes and safely reports invalid JSON', () => {
    const { draft, build } = setup(); build(); draft.setValue(JSON.stringify({ ...item, displayName: 'Pear' }));
    expect((kitElements(build()).find(node => node.id === 'details:displayName')!.props['editor'] as CanvasTextEditor).snapshot().value).toBe('Pear');
    draft.setValue('{'); expect(kitElements(build())[0]!.props['text']).toContain('syntax');
  });
  it('keeps read-only forms non-mutating', () => {
    const { apply, build } = setup(true); const surface = build();
    pressKit(surface, 'details:apply'); pressKit(surface, 'details:tags:add'); expect(apply).not.toHaveBeenCalled();
    const input = kitElements(surface).find(node => node.id === 'details:displayName')!;
    const editor = input.props['editor'] as CanvasTextEditor; input.hooks.onText?.('Changed', input); expect(editor.snapshot().value).toBe('Apple');
  });
});
