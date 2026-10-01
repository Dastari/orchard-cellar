import { describe, expect, it, vi } from 'vitest';
import { ui, UiRoot, uiFixed } from '@orchard/ui/studio';
import { studioActionBar, studioIconAction, studioLibraryDrawer, studioWorkspaceToolbar } from './workspace-controls.js';

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

describe('Studio workspace toolbar', () => {
  const options = () => ({ view: 'both' as const, onView: vi.fn(), onCommands: vi.fn(), splitOpen: false,
    onSplit: vi.fn(), onSave: vi.fn(), onRestore: vi.fn(), onReset: vi.fn() });

  it.each([[1280, 720], [1440, 900], [720, 540]])('keeps controls and publication reachable at %ix%i', (width, height) => {
    const root = new UiRoot({ scale: 2 }); root.resize(width!, height!);
    const publish = ui.button({ id: 'publish', label: 'Publish' });
    const library = ui.list({ label: 'Definitions', items: Array.from({ length: 100 }, (_, i) => i), key: String, render: value => ui.text(String(value)) });
    root.mount(ui.flex({ width: 'grow', height: 'grow' }, [studioWorkspaceToolbar(options()), ui.workbench({
      navigation: [], workspace: ui.stack({ width: 'grow', height: 'grow' }),
      controls: { title: '', fill: true, content: studioLibraryDrawer([ui.input({ label: 'Search' })], library, [publish]) },
      inspector: { title: 'Inspector', content: ui.input({ label: 'Name' }) },
    })])); root.arrange();
    for (const id of ['studio-workspace-view', 'studio-workspace-commands', 'studio-workspace-layouts', 'publish']) {
      const element = root.entries().find(entry => entry.element.id === id)!.element;
      expect(element.clip).toEqual(element.rect);
      expect(element.rect.y + element.rect.height).toBeLessThanOrEqual(height! / 2);
    }
    expect(library.rect.height).toBeGreaterThan(48);
    root.dispose();
  });

  it('lets keyboard users select the inspector and activate every layout action', () => {
    const callbacks = options(); const root = new UiRoot({ scale: 2 }); root.resize(720, 540);
    root.mount(studioWorkspaceToolbar(callbacks)); root.arrange();
    const select = root.entries().find(({ element }) => element.id === 'studio-workspace-view')!.element;
    root.focus.set(select); root.key({ key: 'ArrowDown' }); root.arrange(); root.key({ key: 'ArrowDown' }); root.key({ key: 'ArrowDown' }); root.key({ key: 'Enter' });
    expect(callbacks.onView).toHaveBeenCalledWith('inspector');
    root.arrange();
    const layouts = root.entries().find(({ element }) => element.id === 'studio-workspace-layouts')!.element;
    for (const [label, callback] of [['Split workspace', callbacks.onSplit], ['Save named layout', callbacks.onSave], ['Restore named layout', callbacks.onRestore], ['Reset workspace layout', callbacks.onReset]] as const) {
      root.focus.set(layouts); root.key({ key: 'Enter' }); root.arrange();
      expect(root.entries().map(({ element }) => element.label), `layout menu opening for ${label}`).toContain(label);
      root.focus.set(root.entries().find(({ element }) => element.label === label)!.element); root.key({ key: 'Enter' });
      expect(callback).toHaveBeenCalledOnce();
      root.arrange();
    }
    root.dispose();
  });

  it('keeps a verified-map region warning visible beside reachable workspace controls', () => {
    const root = new UiRoot({ scale: 2 }); root.resize(720, 540);
    root.mount(studioWorkspaceToolbar({ ...options(), notice: 'Live map objects could not load. Retrying…' })); root.arrange();
    const warning = root.entries().find(({ element }) => element.id === 'studio-map-warning')!.element;
    expect(warning.props['text']).toBe('Live map objects could not load. Retrying…');
    expect(warning.clip).toEqual(warning.rect);
    expect(warning.rect.y).toBeGreaterThan(root.entries().find(({ element }) => element.id === 'studio-workspace-view')!.element.rect.y);
    root.dispose();
  });

  it.each(['controls', 'inspector', 'none'] as const)('shows the requested narrow view %s', view => {
    const root = new UiRoot({ scale: 2 }); root.resize(720, 540);
    root.mount(ui.workbench({ navigation: [], activeDrawer: view,
      workspace: ui.stack({ width: 'grow', height: 'grow' }),
      controls: { title: 'Library', width: uiFixed(248), minWidth: uiFixed(248), maxWidth: uiFixed(480), visible: view === 'controls', content: ui.button({ label: 'Publish' }) },
      inspector: { title: 'Inspector', visible: view === 'inspector', content: ui.input({ label: 'Name' }) },
    })); root.arrange();
    const drawers = root.entries().filter(({ element }) => element.kind === 'workbench-drawer' && element.visible);
    expect(drawers).toHaveLength(view === 'none' ? 0 : 1);
    if (view !== 'none') expect(drawers[0]!.element.id).toBe(`workbench.${view}`);
    expect(root.entries().find(({ element }) => element.id === 'workbench.workspace.content')!.element.rect.width).toBe(320);
    root.dispose();
  });
});
