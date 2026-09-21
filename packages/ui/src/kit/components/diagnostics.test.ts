import { expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiDiagnostics } from './diagnostics.js';

it('keeps complete diagnostic output reachable inside narrow frames with keyboard scrolling', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(160, 140);
  const lines = Array.from({ length: 40 }, (_, index) => `METRIC ${index} WITH A LONG VALUE THAT WRAPS`);
  const panel = uiDiagnostics({ title: 'NETWORK', lines }); root.mount(panel); root.arrange();
  expect(panel.scrollArea.scroll.maxY).toBeGreaterThan(140);
  expect(root.wheel({ point: { x: 80, y: 100 }, deltaX: 0, deltaY: 24 })).toBe(true);
  expect(panel.scrollArea.scroll.y).toBe(24);
  expect(root.focus.set(panel.scrollArea)).toBe(true);
  expect(root.key({ key: 'PageDown' })).toBe(true);
  expect(panel.scrollArea.scroll.y).toBeGreaterThan(0);
  for (let index = 0; index < 100; index++) root.key({ key: 'PageDown' });
  root.arrange();
  expect(panel.scrollArea.scroll.y).toBe(panel.scrollArea.scroll.maxY);
  expect(root.wheel({ point: { x: 80, y: 100 }, deltaX: 0, deltaY: 24 })).toBe(true);
  expect(root.pointer({ type: 'down', point: { x: 80, y: 100 }, pointerId: 1, button: 0 })).toBe(true);
  expect(root.pointer({ type: 'up', point: { x: 80, y: 100 }, pointerId: 1, button: 0 })).toBe(true);
  const text = root.entries().find(entry => entry.element.id === 'diagnostics.text')!.element;
  expect(text.props['text']).toBe(lines.join('\n'));
  expect(text.rect.y + text.rect.height).toBeLessThanOrEqual(panel.scrollArea.contentRect.y + panel.scrollArea.contentRect.height);
  for (const { element } of root.entries()) {
    if (element.clip.width <= 0 || element.clip.height <= 0) continue;
    expect(element.clip.x).toBeGreaterThanOrEqual(0);
    expect(element.clip.y).toBeGreaterThanOrEqual(0);
    expect(element.clip.x + element.clip.width).toBeLessThanOrEqual(160);
    expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(140);
  }
  panel.updateLines(['READY']); root.arrange();
  expect(root.focus.current).toBe(panel.scrollArea);
  expect(panel.scrollArea.scroll.y).toBe(0);
  expect(text.props['text']).toBe('READY');
  root.dispose();
});
