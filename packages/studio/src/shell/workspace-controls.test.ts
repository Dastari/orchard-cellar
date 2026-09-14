import { describe, expect, it, vi } from 'vitest';
import { ui, UiRoot, uiFixed } from '@orchard/ui';
import { studioActionBar, studioIconAction, studioLibraryDrawer } from './workspace-controls.js';

describe('Studio library drawers', () => {
  it.each([240, 320, 400])('keeps publication reachable at %i logical pixels high', height => {
    const publish = ui.button({ id: 'publish', label: 'Publish' });
    const library = ui.list({ id: 'library', label: 'Definitions', items: Array.from({ length: 100 }, (_, i) => i), key: String,
      rowHeight: uiFixed(24), render: value => ui.text(String(value)) });
    const drawer = studioLibraryDrawer([ui.text('Find an item')], library, [publish]);
    const root = new UiRoot({ scale: 1 }); root.resize(119, height); root.mount(drawer); root.arrange();
    expect(publish.clip).toEqual(publish.rect);
    expect(publish.rect.y + publish.rect.height).toBeLessThanOrEqual(height);
    expect(library.rect.y + library.rect.height).toBeLessThanOrEqual(publish.rect.y);
    expect(library.children[0]!.children.length).toBeLessThan(25);
    root.dispose();
  });
  it('keeps icon actions named, keyboard operable and inside the drawer', () => {
    const press = vi.fn(); const action = ui.button({ id: 'undo', label: 'Undo edit', onPress: press });
    const root = new UiRoot({ scale: 1 }); root.resize(119, 240);
    root.mount(studioActionBar([studioIconAction(action, { lucide: 'undo' })])); root.arrange();
    expect(action.label).toBe('Undo edit'); expect(action.props['label']).toBe(''); expect(action.clip).toEqual(action.rect);
    root.focus.set(action); root.key({ key: 'Enter' }); expect(press).toHaveBeenCalledOnce(); root.dispose();
  });
});
