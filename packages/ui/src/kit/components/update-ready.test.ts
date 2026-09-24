import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiUpdateReady } from './update-ready.js';
it('keeps each update decision fully visible after keyboard focus on a short viewport', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(320, 180);
  const onRefresh = vi.fn(), onLater = vi.fn(), dialog = uiUpdateReady({ onRefresh, onLater }); root.mount(dialog); root.arrange();
  for (const id of ['update-ready.refresh', 'update-ready.later']) {
    const button = root.entries().find(entry => entry.element.id === id)!.element;
    root.focus.set(button, 'keyboard'); root.arrange(); expect(button.clip.width).toBe(button.rect.width); expect(button.clip.height).toBe(button.rect.height);
    root.key({ key: 'Enter' });
  }
  expect(onRefresh).toHaveBeenCalledOnce(); expect(onLater).toHaveBeenCalledOnce(); expect(dialog.visible).toBe(false); root.dispose();
});
