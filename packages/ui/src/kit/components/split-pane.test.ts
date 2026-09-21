import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import { UiRoot } from '../runtime/root.js';
it.each(['row','column'] as const)('resizes %s splits by pointer and keyboard with bounded panes', direction => {
  const root = new UiRoot({ scale: 1 }); root.resize(400,400); const change = vi.fn();
  const split = root.mount(ui.splitPane({ label: 'Workspace', first: ui.text('First'), second: ui.text('Second'), direction, onResize: change })); root.arrange();
  const [first, handle, second] = split.children, dimension = direction === 'row' ? 'width' : 'height';
  expect(first!.rect[dimension]).toBe(198); expect(second!.rect[dimension]).toBe(198);
  root.focus.set(handle!); root.key({ key: direction === 'row' ? 'ArrowRight' : 'ArrowDown' }); root.arrange();
  expect(first!.rect[dimension]).toBe(218); expect(second!.rect[dimension]).toBe(178);
  root.key({ key: 'Home' }); root.arrange(); expect(first!.rect[dimension]).toBe(64);
  root.key({ key: 'End' }); root.arrange(); expect(second!.rect[dimension]).toBe(64);
  root.key({ key: 'Enter' }); root.arrange(); expect(first!.rect[dimension]).toBe(198);
  const point = { x: handle!.rect.x + 1, y: handle!.rect.y + 1 };
  root.pointer({ type: 'down', point, pointerId: 3, button: 0 });
  root.pointer({ type: 'move', point: { x: 1000, y: 1000 }, pointerId: 3, button: 0 }); root.arrange(); expect(second!.rect[dimension]).toBe(64);
  root.pointer({ type: 'cancel', point, pointerId: 3, button: 0 }); change.mockClear();
  root.pointer({ type: 'move', point, pointerId: 3, button: 0 }); expect(change).not.toHaveBeenCalled();
  root.resize(80,80); root.arrange(); expect(first!.rect[dimension]).toBe(38); expect(second!.rect[dimension]).toBe(38); root.dispose();
});
it('rejects a nonfinite initial split ratio', () => {
  expect(() => ui.splitPane({ label: 'Invalid', first: ui.text('A'), second: ui.text('B'), ratio: NaN })).toThrow('finite');
});
