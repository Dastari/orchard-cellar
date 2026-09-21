import { expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiCursor } from './anchors.js';

it('repositions over empty space without requiring an inventory transaction', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(320,200);
  const cursor = root.mount(uiCursor()); root.arrange();
  for (const point of [{ x: 70, y: 40 }, { x: 180, y: 110 }, { x: 310, y: 190 }]) {
    root.pointer({ type: 'move', point, pointerId: 1, button: 0 }); root.arrange();
    expect(cursor.rect.x).toBe(Math.min(288, point.x)); expect(cursor.rect.y).toBe(Math.min(168, point.y));
    expect(cursor.rect).toEqual(cursor.clip);
  }
  root.dispose();
});
