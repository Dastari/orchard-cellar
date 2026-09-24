import { createCanvas } from '@napi-rs/canvas';
import { expect, it, vi } from 'vitest';
import { uiList } from './collections.js';
import { uiText } from './text.js';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from '../lab/testing/art.js';

it('paints controlled selection and toggles from the latest selected prop without replacing the list', async () => {
  const art = await uiTestArt(), select = vi.fn(), root = new UiRoot({ art, scale: 1 }); root.resize(240, 100);
  const list = uiList({ label: 'Controlled list', items: ['one', 'two'], key: item => item,
    render: item => uiText(item), selected: ['one'], multiple: true, onSelect: select }); root.mount(list); root.arrange();
  list.setProps({ selected: ['two'] }); root.arrange();
  const context = createCanvas(240, 100).getContext('2d'), draw = vi.spyOn(context, 'drawImage');
  for (const { element } of root.entries().filter(entry => entry.element.kind === 'list-row')) {
    draw.mockClear(); element.hooks.paint?.(element, { art, context: context as unknown as CanvasRenderingContext2D, now: 0, focused: false, hovered: false, reducedMotion: true });
    expect(draw.mock.calls.length > 0, element.label).toBe(element.label === 'two');
  }
  root.focus.set(list); root.key({ key: 'End' }); root.key({ key: ' ' });
  expect(select).toHaveBeenCalledExactlyOnceWith([], 'two'); expect(root.focus.current).toBe(list);
  draw.mockRestore(); root.dispose();
});
