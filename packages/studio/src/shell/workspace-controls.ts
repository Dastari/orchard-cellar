import { ui, uiFixed, type UiElement, type UiIconSource } from '@orchard/ui';

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
