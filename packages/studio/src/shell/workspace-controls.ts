import { ui, uiFixed, type UiElement, type UiIconSource } from '@orchard/ui/studio';
import type { StudioWorkspaceView } from './workspace-layout.js';

/** Discoverable shared controls, kept outside the tool's scrolling drawers. */
export function studioWorkspaceToolbar(options: {
  readonly view: StudioWorkspaceView;
  readonly onView: (view: StudioWorkspaceView) => void;
  readonly onCommands: () => void;
  readonly splitOpen: boolean;
  readonly onSplit: () => void;
  readonly onSave: () => void;
  readonly onRestore: () => void;
  readonly onReset: () => void;
  readonly notice?: string | null;
}): UiElement {
  const layouts = ui.button({ id: 'studio-workspace-layouts', label: 'Layouts', size: 'sm', onPress: () => menu.open(layouts) });
  const menu = ui.menu({ id: 'studio-workspace-layout-menu', anchor: layouts, width: uiFixed(200), items: [
    { id: 'split', label: options.splitOpen ? 'Close split workspace' : 'Split workspace', onSelect: options.onSplit },
    { id: 'save', label: 'Save named layout', onSelect: options.onSave },
    { id: 'restore', label: 'Restore named layout', onSelect: options.onRestore },
    { id: 'reset', label: 'Reset workspace layout', onSelect: options.onReset },
  ] });
  return ui.flex({ id: 'studio-workspace-toolbar', width: 'grow', gap: 4, padding: 4, shrink: 0 }, [
    ui.flex({ direction: 'row', wrap: true, width: 'grow', gap: 4, shrink: 0 }, [
    ui.select({ id: 'studio-workspace-view', label: 'Workspace panels', size: 'sm', value: options.view,
      layout: { width: uiFixed(100), shrink: 0 }, options: [
        { value: 'both', label: 'Both panels' }, { value: 'controls', label: 'Library' },
        { value: 'inspector', label: 'Inspector' }, { value: 'none', label: 'Hide panels' },
      ], onChange: value => options.onView(value as StudioWorkspaceView) }),
    ui.tooltip('Command palette · Ctrl+K', ui.button({ id: 'studio-workspace-commands', label: 'Commands', size: 'sm', onPress: options.onCommands })),
    layouts, menu,
    ]),
    ...(options.notice ? [ui.text(options.notice, { id: 'studio-map-warning', wrap: true, layout: { width: 'grow' } })] : []),
  ]);
}

/** Keep the original action and its keyboard semantics while presenting a tool icon. */
export function studioIconAction(button: UiElement, icon: UiIconSource): UiElement {
  const label = button.label;
  button.setProps({ label: '' });
  button.label = label;
  button.replaceChildren([ui.icon(icon, { layout: { width: 'grow', height: 'grow' } })]);
  button.setStyle({ width: uiFixed(24), height: uiFixed(24), shrink: 0 });
  return ui.tooltip(button.label ?? 'Action', button, { width: uiFixed(24), height: uiFixed(24), shrink: 0 });
}

export function studioActionBar(actions: readonly UiElement[]): UiElement {
  return ui.flex({ direction: 'row', wrap: true, width: 'grow', gap: 4, shrink: 0 }, actions);
}

/** Libraries scroll independently; publication controls stay within reach. */
export function studioLibraryDrawer(header: readonly UiElement[], library: UiElement, footer: readonly UiElement[]): UiElement {
  library.setStyle({ width: 'grow', height: 'grow', minHeight: uiFixed(48), shrink: 1 });
  return ui.flex({ width: 'grow', height: 'grow', gap: 8 }, [
    ui.flex({ width: 'grow', gap: 4, shrink: 0 }, header), library,
    ui.flex({ width: 'grow', gap: 4, shrink: 0 }, footer),
  ]);
}
