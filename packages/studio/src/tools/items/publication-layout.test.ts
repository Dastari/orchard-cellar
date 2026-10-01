import { describe, expect, it, vi } from 'vitest';
import { ui, uiFixed, UiRoot, type UiElement } from '@orchard/ui/studio';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { StudioShellController } from '../../shell/controller.js';
import { buildItemsCanvasTool } from './canvas.js';

function fixture(width: number, height: number, toolbarHeight: number) {
  const controller = new StudioShellController(async () => { throw new Error('offline'); });
  controller.navigate('/author/items');
  const bounds = { x: 0, y: 0, width, height };
  const context: StudioCanvasToolContext = { controller, route: controller.activeRoute(), bounds,
    controlsBounds: bounds, workspaceBounds: bounds, invalidate: vi.fn() };
  const root = new UiRoot({ scale: 2 });
  root.resize(width, height);
  let tree: UiElement | null = null;
  const mount = () => {
    if (tree) { root.unmount(tree); tree.dispose(); }
    const surface = buildItemsCanvasTool(context);
    tree = ui.flex({ width: 'grow', height: 'grow' }, [
      // Reserve the 48 CSS pixels consumed by the incoming shared toolbar.
      ui.stack({ width: 'grow', height: uiFixed(toolbarHeight / 2), shrink: 0 }),
      ui.workbench({ navigation: [], workspace: ui.stack({ width: 'grow', height: 'grow' }),
        controls: { title: '', surface: 'thin', fill: true, width: uiFixed(135), content: surface.kit!.controls! },
      }),
    ]);
    root.mount(tree);
    root.arrange();
  };
  const control = (suffix: string): UiElement => {
    const element = root.entries().find(entry => entry.element.id === `items-items:${suffix}`)?.element;
    if (!element) throw new Error(`Missing Items control ${suffix}`);
    return element;
  };
  mount();
  return { root, mount, control };
}

describe('actual Items publication layout (BUG-081)', () => {
  it.each([[720, 540, 0], [720, 540, 48], [1280, 720, 48]])(
    'keeps the complete publication footer reachable at %ix%i with a %i CSS pixel toolbar', (width, height, toolbarHeight) => {
      const { root, control } = fixture(width!, height!, toolbarHeight!);
      try {
        for (const suffix of ['kind', 'query', 'new-item', 'new-recipe', 'rebase', 'clear', 'note', 'publish']) {
          const element = control(suffix);
          expect(element.rect.height, suffix).toBeGreaterThanOrEqual(16);
          expect(element.clip, suffix).toEqual(element.rect);
          expect(element.rect.y + element.rect.height, suffix).toBeLessThanOrEqual(height! / 2);
        }
        expect(control('browser-table').rect.height).toBeGreaterThanOrEqual(48);
        expect(control('browser-table:rows').clip.height).toBeGreaterThan(0);
      } finally { root.dispose(); }
    },
  );

  it('can reach Clear draft with keyboard and pointer after creating a local item at the narrow size', () => {
    const { root, mount, control } = fixture(720, 540, 48);
    const press = (suffix: string) => { root.focus.set(control(suffix)); expect(root.key({ key: 'Enter' })).toBe(true); mount(); };
    try {
      press('new-item');
      expect(control('clear').disabled).toBe(false);
      const clear = control('clear'), point = { x: clear.rect.x + clear.rect.width / 2, y: clear.rect.y + clear.rect.height / 2 };
      expect(clear.clip).toEqual(clear.rect);
      expect(root.pointer({ type: 'down', point, button: 0, pointerId: 1 })).toBe(true);
      expect(root.pointer({ type: 'up', point, button: 0, pointerId: 1 })).toBe(true);
      mount();
      expect(control('clear').disabled).toBe(true);
      press('new-item'); press('clear');
      expect(control('clear').disabled).toBe(true);
    } finally { root.dispose(); }
  });
});
