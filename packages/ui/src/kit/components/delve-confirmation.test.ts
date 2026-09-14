import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiDelveConfirmation } from './delve-confirmation.js';
it.each([[480, 270], [240, 150], [120, 160]] as const)('keeps confirmation actions keyboard reachable at %ix%i', (width, height) => {
  const onBegin = vi.fn(), onCancel = vi.fn(), root = new UiRoot({ scale: 1 });
  root.resize(width, height); const dialog = uiDelveConfirmation({ onBegin, onCancel }); root.mount(dialog); dialog.focusBegin(); root.arrange();
  expect(root.focus.current?.id).toBe('delve-confirmation.begin');
  root.key({ key: 'Enter' }); expect(onBegin).toHaveBeenCalledOnce();
  const cancel = root.entries().find(entry => entry.element.id === 'delve-confirmation.cancel')!.element;
  root.focus.set(cancel); root.arrange();
  expect(cancel.clip.width).toBeGreaterThan(0); expect(cancel.clip.height).toBeGreaterThan(0);
  expect(cancel.clip.x + cancel.clip.width).toBeLessThanOrEqual(width);
  expect(cancel.clip.y + cancel.clip.height).toBeLessThanOrEqual(height);
  root.key({ key: 'Enter' }); expect(onCancel).toHaveBeenCalledOnce();
  expect(onBegin).toHaveBeenCalledOnce(); root.dispose();
});
